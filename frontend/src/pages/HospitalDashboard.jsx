import { useState, useEffect } from 'react';
import { useAuth, useSocket } from '../App';
import { Hospital, User, Clock, ShieldAlert, CheckCircle, X, List } from '../components/UI.jsx';

const EQUIPMENT = ['Ventilator', 'Defibrillator', 'Trauma Bed', 'Blood Bank', 'Cardiac Monitor', 'Oxygen Cylinder'];

export default function HospitalDashboard() {
  const { user } = useAuth();
  const socket = useSocket();
  const [incidents, setIncidents] = useState([]);
  const [equipment, setEquipment] = useState({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (socket) {
      socket.on('incident:created', (inc) => setIncidents(l => [inc, ...l]));
      socket.on('incident:updated', (inc) => setIncidents(l => l.map(i => i.id === inc.id ? inc : i)));
      socket.on('hospital:er-ready', (data) => {
        if (data.hospitalId === user.id) setReady(true);
      });
    }
    fetch('http://localhost:5000/incidents').then(r => r.json()).then(setIncidents);
  }, [socket, user]);

  const hospIncidents = incidents.filter(i => i.assignedHospitalId === user.id || !i.assignedHospitalId);

  function markReady() {
    const target = hospIncidents[0];
    if (!target) return;
    setReady(true);
    fetch('http://localhost:5000/hospitals/er-ready', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalId: user.id, incidentId: target.id, equipment: Object.entries(equipment).filter(([_, v]) => v).map(([k]) => k) })
    });
  }

  function triageColor(severity) {
    return severity === 'severe' ? 'bg-red' : severity === 'normal' ? 'bg-yellow' : 'bg-green';
  }

  return (
    <div className="dashboard hospital">
      <header className="topbar">
        <h1>Hospital Dashboard</h1>
        <div className="user">{user.institutionName || user.name}</div>
        <button onClick={() => localStorage.removeItem('fr_user') || window.location.reload()}>Logout</button>
      </header>

      <div className="grid">
        <div className="card big">
          <h2>ER Ready Status</h2>
          <div className={`status-badge ${ready ? 'safe' : 'alert'}`}>
            {ready ? 'ER READY' : 'ER NOT READY'}
          </div>
          <h3>Equipment Checklist</h3>
          <div className="checklist">
            {EQUIPMENT.map(item => (
              <label key={item} className="check-item">
                <input type="checkbox" checked={equipment[item] === true} onChange={() => setEquipment({ ...equipment, [item]: !equipment[item] })} />
                {item}
              </label>
            ))}
          </div>
          {hospIncidents.length > 0 && (
            <button className="btn-accept" onClick={markReady} disabled={ready}>
              <CheckCircle size={16} /> Mark ER Ready & Notify
            </button>
          )}
          {ready && <p className="hint">ER team and equipment alerted.</p>}
        </div>

        <div className="card">
          <h2>Incoming Patients</h2>
          {hospIncidents.length === 0 ? <p className="empty">No incoming patients.</p> : (
            hospIncidents.map(inc => (
              <div key={inc.id} className="patient-card">
                <div className="patient-header">
                  <strong>{inc.patientName}</strong>
                  <span className={triageColor(inc.severity)}>{inc.severity.toUpperCase()}</span>
                </div>
                <p><User size={14} /> Aadhaar-linked: {inc.patientId}</p>
                <p><Clock size={14} /> {inc.createdAt.slice(11, 16)}</p>
                {inc.route && <p>Ambulance ETA: {inc.route.eta}</p>}
                <div className="btn-row" style={{ marginTop: '0.5rem' }}>
                  <button className="btn-accept" onClick={() => alert(`Preparing for ${inc.patientName}`)}>Accept</button>
                  <button className="btn-dismiss" onClick={() => alert(`Redirecting ${inc.patientName}`)}>Reject / Redirect</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h2>Hospital Profile</h2>
          <p><Hospital size={16} /> {user.institutionName}</p>
          <p>Address: {user.address}</p>
          <p>Receptionist: {user.receptionistName}</p>
        </div>
      </div>
    </div>
  );
}
