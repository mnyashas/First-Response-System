const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

// ==================== PERSISTENCE ====================
const DATA_FILE = path.join(__dirname, 'data.json');
let db = { users: [], ambulances: [], hospitals: [], policeUnits: [], incidents: [], roadBlocks: [], greenCorridors: [], smsLog: [] };

function loadDB() {
  try { if (fs.existsSync(DATA_FILE)) db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { console.error('DB load error:', e.message); }
}
function saveDB() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); } catch (e) { console.error('DB save error:', e.message); }
}
loadDB();

// ==================== HELPERS ====================
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestAmbulance(lat, lng, preferICU) {
  let c = db.ambulances.filter(a => a.status === 'available' && a.lat != null);
  if (preferICU) { const icu = c.filter(a => a.type === 'icu'); if (icu.length) c = icu; }
  c.sort((a, b) => haversine(lat, lng, a.lat, a.lng) - haversine(lat, lng, b.lat, b.lng));
  return c[0] || null;
}

function nearestHospital(lat, lng) {
  const h = db.hospitals.filter(x => x.lat != null);
  h.sort((a, b) => haversine(lat, lng, a.lat, a.lng) - haversine(lat, lng, b.lat, b.lng));
  return h[0] || null;
}

function distToSegment(lat, lng, lat1, lng1, lat2, lng2) {
  // Approx distance in km from point to line segment (using flat-earth approx for small distances)
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const segLen = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  if (segLen < 0.01) return haversine(lat, lng, lat1, lng1);
  // Project point onto segment
  const t = Math.max(0, Math.min(1,
    ((lat - lat1) * (lat2 - lat1) + (lng - lng1) * (lng2 - lng1)) /
    ((lat2 - lat1) ** 2 + (lng2 - lng1) ** 2)
  ));
  const projLat = lat1 + t * (lat2 - lat1);
  const projLng = lng1 + t * (lng2 - lng1);
  return haversine(lat, lng, projLat, projLng);
}

function isBlocked(lat, lng) {
  return db.roadBlocks.some(b => {
    if (!b.active) return false;
    if (b.pointA && b.pointB) return distToSegment(lat, lng, b.pointA.lat, b.pointA.lng, b.pointB.lat, b.pointB.lng) <= 0.3;
    return haversine(lat, lng, b.lat, b.lng) <= (b.radius || 1);
  });
}

function routeIntersectsBlock(routeGeometry) {
  if (!routeGeometry || !routeGeometry.coordinates) return false;
  const activeBlocks = db.roadBlocks.filter(b => b.active && b.pointA && b.pointB);
  if (!activeBlocks.length) return false;
  for (const b of activeBlocks) {
    for (const coord of routeGeometry.coordinates) {
      const [lng, lat] = coord;
      if (distToSegment(lat, lng, b.pointA.lat, b.pointA.lng, b.pointB.lat, b.pointB.lng) <= 0.3) return true;
    }
  }
  return false;
}

// ==================== OSRM ROUTE ====================
const routeCache = {};
async function getRoute(fromLat, fromLng, toLat, toLng) {
  const key = `${fromLat},${fromLng};${toLat},${toLng}`;
  if (routeCache[key]) return routeCache[key];
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      const r = data.routes[0];
      const route = {
        geometry: r.geometry,
        distance: r.distance,
        duration: r.duration,
        distanceKm: (r.distance / 1000).toFixed(1) + ' km',
        durationMin: Math.round(r.duration / 60) + ' min',
        eta: Math.round(r.duration / 60) + ' min'
      };
      routeCache[key] = route;
      return route;
    }
  } catch (e) { console.error('OSRM error:', e.message); }
  // Fallback: straight-line estimate
  const dist = haversine(fromLat, fromLng, toLat, toLng);
  return { geometry: null, distance: dist * 1000, duration: dist * 4 * 60, distanceKm: dist.toFixed(1) + ' km', durationMin: Math.round(dist * 4) + ' min', eta: Math.round(dist * 4) + ' min', fallback: true };
}

// ==================== SMS ====================
// Priority: Fast2SMS (free, India) > Twilio > demo mode
// Fast2SMS: set env FAST2SMS_API_KEY (get free key at https://www.fast2sms.com)
// Twilio: set TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM
function smsProvider() {
  if (process.env.FAST2SMS_API_KEY) return 'fast2sms';
  if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_FROM) return 'twilio';
  return 'demo';
}

async function sendSMS(phone, message) {
  const entry = { id: uuidv4(), phone, message, timestamp: new Date().toISOString(), status: 'demo', provider: 'demo' };
  const provider = smsProvider();
  entry.provider = provider;
  const cleanPhone = String(phone).replace(/^\+91/, '').replace(/\D/g, '');

  if (provider === 'fast2sms') {
    // Fast2SMS free API (India) — route: 'q' for transactional, 'sms' for promotional
    try {
      const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: { 'authorization': process.env.FAST2SMS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: 'q', variables_values: message, numbers: cleanPhone })
      });
      const data = await res.json();
      entry.status = data.return ? 'sent' : 'failed';
      if (data.message) entry.error = data.message;
      console.log(`[SMS:fast2sms:${entry.status}] -> ${cleanPhone}: ${data.message || ''}`);
    } catch (e) {
      entry.status = 'failed'; entry.error = e.message;
      console.log(`[SMS:fast2sms:error] ${e.message}`);
    }
  } else if (provider === 'twilio') {
    try {
      const sid = process.env.TWILIO_SID, token = process.env.TWILIO_TOKEN, from = process.env.TWILIO_FROM;
      const auth = Buffer.from(sid + ':' + token).toString('base64');
      const params = new URLSearchParams({ To: '+' + cleanPhone, From: from, Body: message });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST', headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params
      });
      const data = await res.json();
      entry.status = res.ok ? 'sent' : 'failed';
      if (data.error_message) entry.error = data.error_message;
      console.log(`[SMS:twilio:${entry.status}] -> ${cleanPhone}`);
    } catch (e) {
      entry.status = 'failed'; entry.error = e.message;
      console.log(`[SMS:twilio:error] ${e.message}`);
    }
  } else {
    // Demo mode — logged, visible in UI
    console.log(`[SMS:demo] -> ${phone}: ${message}`);
  }

  db.smsLog.push(entry);
  if (db.smsLog.length > 200) db.smsLog = db.smsLog.slice(-200);
  saveDB();
  return entry;
}

// SMS provider status endpoint
app.get('/api/sms-status', (req, res) => {
  res.json({ provider: smsProvider(), fast2sms: !!process.env.FAST2SMS_API_KEY, twilio: !!(process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_FROM) });
});

// ==================== AUTH ====================
app.post('/auth/register', (req, res) => {
  const { role, name, mobile, aadhaar, institutionName, address, receptionistName } = req.body;
  const isInst = role === 'hospital' || role === 'police';
  const displayName = institutionName || name;
  if (!role || !mobile) return res.status(400).json({ error: 'Mobile required' });
  if (!displayName) return res.status(400).json({ error: isInst ? 'Institution Name required' : 'Name required' });
  if ((role === 'patient' || role === 'ambulance') && !aadhaar) return res.status(400).json({ error: 'Aadhaar Card No required' });
  if (isInst && (!address || !receptionistName)) return res.status(400).json({ error: 'Address and receptionist name required' });
  if (db.users.find(u => u.role === role && u.mobile === mobile)) return res.status(400).json({ error: 'Mobile already registered for this role. Try Login.' });

  const id = uuidv4();
  const user = { id, role, name: displayName, mobile, createdAt: new Date().toISOString() };
  if (aadhaar) user.aadhaar = aadhaar;
  if (institutionName) { user.institutionName = institutionName; user.address = address; user.receptionistName = receptionistName; }
  db.users.push(user);

  if (role === 'ambulance') {
    const ambId = 'amb-' + id;
    db.ambulances.push({ id: ambId, userId: id, driverName: name, mobile, status: 'available', lat: null, lng: null, type: 'normal', heading: 0, speed: 0, lastUpdate: null, socketId: null });
    user.ambulanceId = ambId;
  }
  if (role === 'hospital') {
    const hospId = 'h-' + id;
    db.hospitals.push({ id: hospId, userId: id, name: institutionName, address, receptionistName, lat: null, lng: null, equipment: [] });
    user.hospitalId = hospId;
  }
  if (role === 'police') {
    const policeId = 'p-' + id;
    db.policeUnits.push({ id: policeId, userId: id, name: institutionName, address, receptionistName, socketId: null });
    user.policeId = policeId;
  }
  saveDB();
  console.log(`[REGISTER] ${role}: ${name} (${mobile})`);
  res.json({ user, token: 'mock-' + id });
});

app.post('/auth/login', (req, res) => {
  const { role, mobile } = req.body;
  const user = db.users.find(u => u.role === role && u.mobile === mobile);
  if (!user) return res.status(401).json({ error: 'No account found for this role and mobile. Register first.' });
  res.json({ user, token: 'mock-' + user.id });
});

// ==================== LOCATION ====================
app.post('/location', (req, res) => {
  const { userId, lat, lng, heading, speed, accuracy } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
  const amb = db.ambulances.find(a => a.userId === userId);
  if (amb) {
    amb.lat = lat; amb.lng = lng; amb.heading = heading || 0; amb.speed = speed || 0; amb.lastUpdate = new Date().toISOString();
    saveDB();
    io.emit('location:update', { id: amb.id, lat, lng, heading, speed, status: amb.status });
    return res.json({ ok: true, ambulance: amb });
  }
  const hosp = db.hospitals.find(h => h.userId === userId);
  if (hosp) { hosp.lat = lat; hosp.lng = lng; saveDB(); return res.json({ ok: true, hospital: hosp }); }
  res.status(404).json({ error: 'User not found as ambulance or hospital' });
});

app.get('/ambulances', (req, res) => res.json(db.ambulances));

app.post('/ambulances/me', (req, res) => {
  const { userId, status, type } = req.body;
  const amb = db.ambulances.find(a => a.userId === userId);
  if (!amb) return res.status(404).json({ error: 'Ambulance not found' });
  if (status) amb.status = status;
  if (type) amb.type = type;
  saveDB();
  io.emit('location:update', { id: amb.id, lat: amb.lat, lng: amb.lng, heading: amb.heading, speed: amb.speed, status: amb.status, type: amb.type });
  console.log(`[AMB] ${amb.driverName} -> status=${amb.status} type=${amb.type}`);
  res.json(amb);
});

// ==================== INCIDENTS ====================
app.post('/incidents', async (req, res) => {
  const { patientId, patientName, lat, lng, severity, contacts, accuracy, emergencyType, emergencyNote, forceICU } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: 'Location required (lat, lng)' });

  const id = uuidv4();
  const sev = severity || 'normal';
  const etype = emergencyType || 'other';
  const mustBeICU = forceICU || sev === 'severe';

  // ICU-only selection for crashes/severe: strict filter, fallback flagged
  let amb = null, noICUAvailable = false;
  if (mustBeICU) {
    const icuAvail = db.ambulances.filter(a => a.status === 'available' && a.lat != null && a.type === 'icu');
    icuAvail.sort((a, b) => haversine(lat, lng, a.lat, a.lng) - haversine(lat, lng, b.lat, b.lng));
    if (icuAvail.length) amb = icuAvail[0];
    else { noICUAvailable = true; amb = nearestAmbulance(lat, lng, false); }
  } else {
    amb = nearestAmbulance(lat, lng, false);
  }
  const hosp = nearestHospital(lat, lng);

  // Calculate real routes
  let routeToPatient = null, routeToHospital = null;
  if (amb && amb.lat != null) routeToPatient = await getRoute(amb.lat, amb.lng, lat, lng);
  if (hosp && hosp.lat != null) routeToHospital = await getRoute(lat, lng, hosp.lat, hosp.lng);

  const incident = {
    id, patientId, patientName, lat, lng, accuracy: accuracy || null,
    severity: sev, emergencyType: etype, emergencyNote: emergencyNote || '',
    forceICU: !!mustBeICU, noICUAvailable,
    status: amb ? 'assigned' : 'pending',
    assignedAmbulanceId: amb ? amb.id : null,
    assignedHospitalId: hosp ? hosp.id : null,
    route: routeToPatient, autoRoute: routeToHospital,
    stage: amb ? 'dispatched' : 'waiting',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  db.incidents.push(incident);

  const typeText = etype.replace(/_/g, ' ').toUpperCase();
  if (amb) {
    amb.status = 'assigned';
    if (contacts && contacts.length) {
      contacts.forEach(c => { if (c.phone && /^\d{10}$/.test(c.phone)) sendSMS(c.phone, `EMERGENCY: ${patientName} — ${typeText}. Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}. Ambulance dispatched. ETA: ${routeToPatient ? routeToPatient.eta : 'calculating'}.`); });
    }
    if (amb.mobile && /^\d{10}$/.test(amb.mobile)) sendSMS(amb.mobile, `URGENT: ${typeText}. Patient ${patientName} at ${lat.toFixed(4)}, ${lng.toFixed(4)}. Severity: ${sev}. ETA: ${routeToPatient ? routeToPatient.eta : 'calculating'}. ${mustBeICU ? (noICUAvailable ? 'ICU UNAVAILABLE — use nearest!' : 'ICU-ON-BOARD REQUIRED.') : ''}${emergencyNote ? ' Note: ' + emergencyNote : ''}`);
    if (hosp) {
      const hospUser = db.users.find(u => u.hospitalId === hosp.id);
      if (hospUser && hospUser.mobile && /^\d{10}$/.test(hospUser.mobile)) sendSMS(hospUser.mobile, `Incoming: ${typeText}. Patient ${patientName}. Severity: ${sev}. ETA: ${routeToHospital ? routeToHospital.eta : 'calculating'}.${amb && amb.type === 'icu' ? ' ICU ambulance.' : ''}`);
    }
  }

  const smsMsg = `ALERT: ${typeText} — ${patientName} at ${lat.toFixed(4)}, ${lng.toFixed(4)}. Severity: ${sev}. Ambulance: ${amb ? amb.driverName + (amb.type === 'icu' ? ' (ICU)' : '') : 'pending'}.`;
  db.policeUnits.forEach(pu => {
    const pUser = db.users.find(u => u.policeId === pu.id);
    if (pUser && pUser.mobile && /^\d{10}$/.test(pUser.mobile)) sendSMS(pUser.mobile, smsMsg);
  });

  saveDB();
  console.log(`[INCIDENT] ${patientName} type=${etype} sev=${sev} icu=${mustBeICU} amb=${amb ? amb.id : 'none'}${noICUAvailable ? ' (NO ICU - fallback)' : ''} hosp=${hosp ? hosp.id : 'none'}`);
  io.emit('incident:created', incident);
  res.json({ incident, ambulance: amb, hospital: hosp });
});

app.get('/incidents', (req, res) => res.json(db.incidents));

app.post('/incidents/:id/severity', (req, res) => {
  const inc = db.incidents.find(i => i.id === req.params.id);
  if (!inc) return res.status(404).json({ error: 'Not found' });
  inc.severity = req.body.severity;
  inc.updatedAt = new Date().toISOString();
  if (inc.severity === 'severe' && inc.assignedAmbulanceId) {
    const amb = db.ambulances.find(a => a.id === inc.assignedAmbulanceId);
    if (amb && amb.type !== 'icu') {
      const icu = nearestAmbulance(inc.lat, inc.lng, true);
      if (icu) { amb.status = 'available'; inc.assignedAmbulanceId = icu.id; icu.status = 'assigned'; io.to(icu.socketId).emit('ambulance:dispatch', inc); }
    }
  }
  io.emit('incident:updated', inc);
  saveDB();
  res.json(inc);
});

app.post('/incidents/:id/status', (req, res) => {
  const inc = db.incidents.find(i => i.id === req.params.id);
  if (!inc) return res.status(404).json({ error: 'Not found' });
  inc.status = req.body.status;
  inc.stage = req.body.stage || inc.stage;
  inc.updatedAt = new Date().toISOString();
  io.emit('incident:updated', inc);
  saveDB();
  res.json(inc);
});

// ==================== ROAD BLOCKS ====================
app.post('/police/roadblock', async (req, res) => {
  const { reason, pointA, pointB, lat, lng, radius, createdBy } = req.body;
  const hasSegment = pointA && pointB && pointA.lat != null && pointB.lat != null;
  const hasCircle = lat != null && lng != null;
  if (!reason || (!hasSegment && !hasCircle)) return res.status(400).json({ error: 'Reason and segment (pointA+pointB) or point (lat+lng) required' });

  const block = hasSegment
    ? { id: uuidv4(), reason, pointA: { lat: pointA.lat, lng: pointA.lng }, pointB: { lat: pointB.lat, lng: pointB.lng }, active: true, createdBy, createdAt: new Date().toISOString() }
    : { id: uuidv4(), reason, lat, lng, radius: radius || 1, active: true, createdBy, createdAt: new Date().toISOString() };
  db.roadBlocks.push(block);
  io.emit('police:roadblock', block);

  // Reassign affected incidents whose route crosses the blocked segment
  let reassigned = 0;
  for (const inc of db.incidents) {
    if (inc.status === 'assigned' && inc.route && routeIntersectsBlock(inc.route.geometry)) {
      const oldAmb = db.ambulances.find(a => a.id === inc.assignedAmbulanceId);
      const newAmb = nearestAmbulance(inc.lat, inc.lng, inc.severity === 'severe');
      if (newAmb && newAmb.id !== inc.assignedAmbulanceId) {
        if (oldAmb) oldAmb.status = 'available';
        inc.assignedAmbulanceId = newAmb.id;
        newAmb.status = 'assigned';
        inc.route = await getRoute(newAmb.lat, newAmb.lng, inc.lat, inc.lng);
        io.to(newAmb.socketId).emit('ambulance:dispatch', inc);
        io.emit('incident:updated', inc);
        sendSMS(newAmb.mobile, `ROUTE CHANGE: Road blocked (${reason}). Assigned to patient ${inc.patientName} at ${inc.lat.toFixed(4)}, ${inc.lng.toFixed(4)}. ETA: ${inc.route.eta}.`);
        reassigned++;
      }
    }
  }
  saveDB();
  res.json({ block, reassigned, message: hasSegment ? `Road segment blocked. ${reassigned} route(s) reassigned.` : `Area blocked. ${reassigned} route(s) reassigned.` });
});

app.get('/police/roadblocks', (req, res) => res.json(db.roadBlocks));
app.post('/police/roadblock/:id/clear', (req, res) => {
  const block = db.roadBlocks.find(b => b.id === req.params.id);
  if (!block) return res.status(404).json({ error: 'Not found' });
  block.active = false;
  io.emit('police:roadblock-cleared', block);
  saveDB();
  res.json(block);
});

app.post('/police/greencorridor', (req, res) => {
  const corridor = { id: uuidv4(), incidentId: req.body.incidentId, active: true, createdAt: new Date().toISOString() };
  db.greenCorridors.push(corridor);
  io.emit('police:greencorridor', corridor);
  saveDB();
  res.json(corridor);
});

// ==================== HOSPITAL ====================
app.post('/hospitals/er-ready', (req, res) => {
  const { hospitalId, incidentId, equipment } = req.body;
  const inc = db.incidents.find(i => i.id === incidentId);
  if (inc) { inc.hospitalPrep = { hospitalId, equipment, readyAt: new Date().toISOString() }; saveDB(); }
  io.emit('hospital:er-ready', { incidentId, hospitalId, equipment });
  res.json({ ok: true });
});

app.get('/hospitals', (req, res) => res.json(db.hospitals));
app.get('/sms-log', (req, res) => res.json(db.smsLog.slice(-20)));

// ==================== ROUTE + SMS API ====================
app.post('/api/sms', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
  const entry = await sendSMS(phone, message);
  res.json(entry);
});

app.get('/api/route', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required (lat,lng)' });
  const [fLat, fLng] = from.split(',').map(Number);
  const [tLat, tLng] = to.split(',').map(Number);
  const route = await getRoute(fLat, fLng, tLat, tLng);
  res.json(route);
});

// ==================== SOCKET.IO ====================
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
io.on('connection', (socket) => {
  console.log('[WS] Connected:', socket.id);
  socket.on('register:ambulance', (userId) => {
    const amb = db.ambulances.find(a => a.userId === userId);
    if (amb) { amb.socketId = socket.id; saveDB(); }
  });
  socket.on('register:police', (userId) => {
    const p = db.policeUnits.find(p => p.userId === userId);
    if (p) { p.socketId = socket.id; saveDB(); }
  });
  socket.on('location:update', (data) => {
    const amb = db.ambulances.find(a => a.userId === data.userId);
    if (amb) { amb.lat = data.lat; amb.lng = data.lng; amb.heading = data.heading || 0; amb.speed = data.speed || 0; amb.lastUpdate = new Date().toISOString(); saveDB(); io.emit('location:update', { id: amb.id, lat: amb.lat, lng: amb.lng, heading: amb.heading, speed: amb.speed, status: amb.status }); }
  });
  socket.on('disconnect', () => {
    db.ambulances.forEach(a => { if (a.socketId === socket.id) a.socketId = null; });
    db.policeUnits.forEach(p => { if (p.socketId === socket.id) p.socketId = null; });
    saveDB();
  });
});

// ==================== SERVE FRONTEND ====================
app.use(express.static(path.join(__dirname, '../frontend')));

// ==================== START ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('  FIRST RESPONSE SYSTEM RUNNING');
  console.log('  Open: http://localhost:' + PORT);
  console.log('========================================');
  console.log('  Data persisted to: data.json');
  console.log('  Routes: OSRM (real road routing)');
  console.log('  SMS: Textbelt API (1 free/day)');
  console.log('  GPS: Browser Geolocation API');
  console.log('  Crash: DeviceMotion API');
  console.log('========================================');
});
