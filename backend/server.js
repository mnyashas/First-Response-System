const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// -------------------- In-memory stores --------------------
const users = [];
const ambulances = [];
const hospitals = [];
const policeUnits = [];
const incidents = [];
const emergencyContacts = {};
const roadBlocks = [];
const greenCorridors = [];

function seed() {
  // No demo data — user registers fresh
}
seed();

function haverside(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function nearestAmbulance(lat, lng, preferICU = false) {
  let c = ambulances.filter(a => a.status === 'available');
  if (preferICU) c = c.filter(a => a.type === 'icu');
  if (c.length === 0) c = ambulances.filter(a => a.status === 'available');
  c.sort((a, b) => haverside(lat, lng, a.lat, a.lng) - haverside(lat, lng, b.lat, b.lng));
  return c[0] || null;
}

function nearestHospital(lat, lng) {
  return [...hospitals].sort((a, b) => haverside(lat, lng, a.lat, a.lng) - haverside(lat, lng, b.lat, b.lng))[0] || null;
}

function isBlocked(lat, lng) {
  return roadBlocks.some(b => b.active && haverside(lat, lng, b.lat, b.lng) <= (b.radius || 1));
}

// ---------- Auth ----------
app.post('/auth/register', (req, res) => {
  const { role, name, mobile, aadhaar, institutionName, address, receptionistName } = req.body;
  console.log('REGISTER body:', req.body);
  if (!role || !name || !mobile) return res.status(400).json({ error: 'Missing fields: role, name, mobile required' });
  if (role === 'hospital' || role === 'police') {
    if (!institutionName || !address || !receptionistName) return res.status(400).json({ error: 'Hospital/Police: institution name, address, and receptionist name are all required' });
  }
  if (role === 'patient' || role === 'ambulance') {
    if (!aadhaar) return res.status(400).json({ error: 'Aadhaar Card No is required' });
  }
  const id = uuidv4();
  const user = { id, role, name, mobile, ...(aadhaar ? { aadhaar } : {}), ...(role === 'hospital' || role === 'police' ? { institutionName, address, receptionistName } : {}), createdAt: new Date().toISOString() };
  users.push(user);
  // Add to role-specific arrays and store internal id on user
  if (role === 'ambulance') {
    const ambId = 'amb-' + id;
    ambulances.push({ id: ambId, userId: id, driverName: name, mobile, status: 'available', lat: 28.6139, lng: 77.2090, type: 'normal', socketId: null });
    user.ambulanceId = ambId;
  }
  if (role === 'hospital') {
    const hospId = 'h-' + id;
    hospitals.push({ id: hospId, userId: id, name, address, receptionistName, lat: 28.6150, lng: 77.2050, equipment: [] });
    user.hospitalId = hospId;
  }
  if (role === 'police') {
    const policeId = 'p-' + id;
    policeUnits.push({ id: policeId, userId: id, name, address, receptionistName, socketId: null });
    user.policeId = policeId;
  }
  res.json({ user, token: `mock-${id}` });
});

app.post('/auth/login', (req, res) => {
  const { role, mobile } = req.body;
  console.log('LOGIN body:', req.body);
  const user = users.find(u => u.role === role && u.mobile === mobile);
  if (!user) return res.status(401).json({ error: 'Invalid credentials - register first' });
  res.json({ user, token: `mock-${user.id}` });
});

// ---------- Ambulance ----------
app.post('/ambulances/location', (req, res) => {
  const { userId, lat, lng } = req.body;
  const amb = ambulances.find(a => a.userId === userId);
  if (!amb) return res.status(404).json({ error: 'Not found' });
  amb.lat = lat; amb.lng = lng;
  io.emit('ambulance:updated', amb);
  res.json(amb);
});

app.get('/ambulances', (req, res) => res.json(ambulances));

// ---------- Incidents ----------
app.post('/incidents', (req, res) => {
  const { patientId, patientName, lat, lng, severity = 'normal', contacts = [] } = req.body;
  const id = uuidv4();
  const useICU = severity === 'severe';
  const amb = nearestAmbulance(lat, lng, useICU);
  const hosp = nearestHospital(lat, lng);

  const incident = {
    id, patientId, patientName, lat, lng, severity,
    status: amb ? 'assigned' : 'pending',
    assignedAmbulanceId: amb ? amb.id : null,
    assignedHospitalId: hosp ? hosp.id : null,
    route: null,
    autoRoute: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  incidents.push(incident);

  if (amb) {
    amb.status = 'busy';
    incident.route = { from: { lat: amb.lat, lng: amb.lng }, to: { lat, lng }, eta: Math.round(haverside(amb.lat, amb.lng, lat, lng) * 4) + ' min' };
    incident.autoRoute = { from: { lat, lng }, to: { lat: hosp.lat, lng: hosp.lng }, hospital: hosp.name, eta: Math.round(haverside(lat, lng, hosp.lat, hosp.lng) * 4) + ' min' };
  }

  if (amb && amb.socketId) io.to(amb.socketId).emit('ambulance:dispatch', incident);
  policeUnits.forEach(p => { if (p.socketId) io.to(p.socketId).emit('police:incident', incident); });
  io.emit('incident:created', incident);

  contacts.forEach(c => console.log(`[SMS] PANIC to ${c.name} (${c.phone}): ${patientName} at ${lat}, ${lng}`));

  res.json({ incident, ambulance: amb, hospital: hosp });
});

app.post('/incidents/:id/severity', (req, res) => {
  const { id } = req.params;
  const { severity } = req.body;
  const inc = incidents.find(i => i.id === id);
  if (!inc) return res.status(404).json({ error: 'Not found' });
  inc.severity = severity;
  inc.updatedAt = new Date().toISOString();
  if (severity === 'severe' && inc.assignedAmbulanceId) {
    const amb = ambulances.find(a => a.id === inc.assignedAmbulanceId);
    if (amb && amb.type !== 'icu') {
      const icu = nearestAmbulance(inc.lat, inc.lng, true);
      if (icu) {
        amb.status = 'available';
        inc.assignedAmbulanceId = icu.id;
        icu.status = 'busy';
        io.to(icu.socketId).emit('ambulance:dispatch', { ...inc, severity: 'severe', note: 'ICU upgrade' });
      }
    }
  }
  io.emit('incident:updated', inc);
  res.json(inc);
});

app.get('/incidents', (req, res) => res.json(incidents));

// ---------- Road blocks ----------
app.post('/police/roadblock', (req, res) => {
  const { reason, lat, lng, radius = 1, createdBy } = req.body;
  const block = { id: uuidv4(), reason, lat, lng, radius, active: true, createdBy, createdAt: new Date().toISOString() };
  roadBlocks.push(block);
  io.emit('police:roadblock', block);
  incidents.forEach(inc => {
    if (inc.status === 'assigned' && inc.route && isBlocked(inc.lat, inc.lng)) {
      const amb = ambulances.find(a => a.id === inc.assignedAmbulanceId);
      const newAmb = nearestAmbulance(inc.lat, inc.lng, inc.severity === 'severe');
      if (newAmb && newAmb.id !== inc.assignedAmbulanceId) {
        if (amb) amb.status = 'available';
        inc.assignedAmbulanceId = newAmb.id;
        newAmb.status = 'busy';
        inc.route = { from: { lat: newAmb.lat, lng: newAmb.lng }, to: { lat: inc.lat, lng: inc.lng }, eta: Math.round(haverside(newAmb.lat, newAmb.lng, inc.lat, inc.lng) * 4) + ' min' };
        io.to(newAmb.socketId).emit('ambulance:dispatch', inc);
        io.emit('incident:updated', inc);
      }
    }
  });
  res.json({ block, message: 'Road blocked. Routes reassigned.' });
});

app.post('/police/roadblock/:id/clear', (req, res) => {
  const block = roadBlocks.find(b => b.id === req.params.id);
  if (!block) return res.status(404).json({ error: 'Not found' });
  block.active = false;
  io.emit('police:roadblock-cleared', block);
  res.json(block);
});

app.get('/police/roadblocks', (req, res) => res.json(roadBlocks));

app.post('/police/greencorridor', (req, res) => {
  const { incidentId } = req.body;
  greenCorridors.push({ id: uuidv4(), incidentId, active: true, createdAt: new Date().toISOString() });
  io.emit('police:greencorridor', greenCorridors[greenCorridors.length - 1]);
  res.json({ ok: true });
});

// ---------- Hospital ----------
app.post('/hospitals/er-ready', (req, res) => {
  const { hospitalId, incidentId, equipment = [] } = req.body;
  const inc = incidents.find(i => i.id === incidentId);
  if (inc) inc.hospitalPrep = { hospitalId, equipment, readyAt: new Date().toISOString() };
  io.emit('hospital:er-ready', { incidentId, hospitalId, equipment });
  res.json({ ok: true });
});

app.get('/hospitals', (req, res) => res.json(hospitals));

// ---------- Serve frontend ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ---------- Socket.io ----------
io.on('connection', (socket) => {
  socket.on('register:ambulance', (userId) => {
    const amb = ambulances.find(a => a.userId === userId);
    if (amb) { amb.socketId = socket.id; socket.join(`ambulance-${amb.id}`); }
  });
  socket.on('register:police', (userId) => {
    const p = policeUnits.find(p => p.userId === userId);
    if (p) { p.socketId = socket.id; socket.join('police'); }
  });
  socket.on('ambulance:status', ({ ambulanceId, status }) => {
    const amb = ambulances.find(a => a.id === ambulanceId);
    if (amb) { amb.status = status; io.emit('ambulance:updated', amb); }
  });
  socket.on('disconnect', () => {
    ambulances.forEach(a => { if (a.socketId === socket.id) a.socketId = null; });
    policeUnits.forEach(p => { if (p.socketId === socket.id) p.socketId = null; });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`\n========================================\n  FIRST RESPONSE SYSTEM RUNNING\n========================================\n  Open: http://localhost:${PORT}\n========================================\n`));
