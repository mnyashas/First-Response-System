import { useState, useEffect } from 'react';
import { useAuth, useSocket } from '../App';
import { Button, Alert, Bell, Phone, MapPin, User, Clock, ShieldAlert } from './components/UI';

export default function PatientDashboard() {
  const { user } = useAuth();
  const socket = useSocket();
  const [panicActive, setPanicActive] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [autoDetect, setAutoDetect] = useState(false);
  const [incident, setIncident] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [newContact, setNewContact] = useState({ name: '', phone: '', relation: '' });
  const [status, setStatus] = useState('Safe');
  const [detectionLog, setDetectionLog] = useState([]);

  useEffect(() => {
    if (socket) {
      socket.on('incident:created', (inc) => {
        if (inc.patientId === user.id) setIncident(inc);
      });
      socket.on('incident:updated', (inc) => {
        if (inc.patientId === user.id) setIncident(inc);
      });
    }
  }, [socket, user]);

  function triggerPanic() {
    setPanicActive(true);
    setCountdown(15);
    setStatus('PANIC ALERT');
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timer);
          setPanicActive(false);
          sendPanic();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }

  function cancelPanic() {
    clearInterval(window._panicTimer);
    setPanicActive(false);
    setCountdown(0);
    setStatus('Safe');
    socket?.emit('incident:cancel', { patientId: user.id });
  }

  function sendPanic() {
    const payload = {
      patientId: user.id,
      patientName: user.name,
      lat: 28.6139 + (Math.random() * 0.01 - 0.005),
      lng: 77.2090 + (Math.random() * 0.01 - 0.005),
      severity: 'normal',
      contacts
    };
    fetch('http://localhost:5000/incidents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then(r => r.json()).then(data => {
      setIncident(data.incident);
      setStatus('Help Dispatched');
    });
  }

  function simulateCrash() {
    const impact = Math.random();
    if (impact > 0.7) {
      setAutoDetect(true);
      setStatus('CRASH DETECTED');
      setCountdown(10);
      window._panicTimer = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) {
            clearInterval(window._panicTimer);
            setAutoDetect(false);
            sendPanic();
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      setDetectionLog(l => [...l, { time: new Date().toLocaleTimeString(), event: 'Sudden deceleration + impact detected' }]);
    } else {
      setDetectionLog(l => [...l, { time: new Date().toLocaleTimeString(), event: 'Minor vibration - ignored (false-alert prevention)' }]);
    }
  }

  function addContact(e) {
    e.preventDefault();
    setContacts([...contacts, { ...newContact }]);
    setNewContact({ name: '', phone: '', relation: '' });
  }

  return (
    <div className="dashboard patient">
      <header className="topbar">
        <h1>Patient Dashboard</h1>
        <div className="user">{user.name} · {user.mobile}</div>
        <button onClick={() => localStorage.removeItem('fr_user') || window.location.reload()}>Logout</button>
      </header>

      <div className="grid">
        <div className="card big">
          <h2>Emergency Status</h2>
          <div className={`status-badge ${panicActive || autoDetect ? 'alert' : 'safe'}`}>
            {panicActive ? `PANIC ACTIVE - ${countdown}s` : autoDetect ? `AUTO-DETECT - ${countdown}s` : status}
          </div>
          <div className="btn-row">
            <button className="btn-panic" onClick={triggerPanic} disabled={panicActive || autoDetect}>
              <Bell size={24} /> PANIC BUTTON
            </button>
            {panicActive || autoDetect ? (
              <button className="btn-cancel" onClick={cancelPanic}>Cancel Alert</button>
            ) : (
              <button className="btn-detect" onClick={simulateCrash}>Simulate Crash / Fall</button>
            )}
          </div>
          <p className="hint">False-alert prevention: cancel within countdown to abort.</p>
        </div>

        <div className="card">
          <h2>Crash / Fall Detection</h2>
          <div className="detection-log">
            {detectionLog.map((d, i) => (
              <div key={i} className="log-row"><span>{d.time}</span> - {d.event}</div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Emergency Contacts</h2>
          <form onSubmit={addContact} className="contact-form">
            <input placeholder="Name" value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} />
            <input placeholder="Phone" value={newContact.phone} onChange={e => setNewContact({ ...newContact, phone: e.target.value })} />
            <input placeholder="Relation" value={newContact.relation} onChange={e => setNewContact({ ...newContact, relation: e.target.value })} />
            <button type="submit">Add Contact</button>
          </form>
          <ul className="contact-list">
            {contacts.map((c, i) => (
              <li key={i}>{c.name} ({c.relation}) - {c.phone}</li>
            ))}
            {contacts.length === 0 && <p className="empty">No contacts added.</p>}
          </ul>
          <p className="hint">SMS is sent to all contacts on panic.</p>
        </div>

        <div className="card incident-card">
          <h2>Active Incident</h2>
          {incident ? (
            <div>
              <p><MapPin size={16} /> Lat: {incident.lat.toFixed(4)}, Lng: {incident.lng.toFixed(4)}</p>
              <p><ShieldAlert size={16} /> Severity: {incident.severity}</p>
              <p><Clock size={16} /> Status: {incident.status}</p>
              {incident.assignedAmbulanceId && <p><User size={16} /> Ambulance Assigned: {incident.assignedAmbulanceId}</p>}
              {incident.assignedHospitalId && <p>Hospital: {incident.assignedHospitalId}</p>}
            </div>
          ) : (
            <p className="empty">No active incident.</p>
          )}
        </div>
      </div>
    </div>
  );
}
