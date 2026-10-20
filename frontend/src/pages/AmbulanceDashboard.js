import { useState, useEffect } from 'react';
import { useAuth, useSocket } from '../App';
import { MapPin, Truck, Clock, ShieldAlert, Hospital, Bell, ArrowRight, X } from './components/UI';

export default function AmbulanceDashboard() {
  const { user } = useAuth();
  const socket = useSocket();
  const [dispatch, setDispatch] = useState(null);
  const [ambulances, setAmbulances] = useState([]);
  const [status, setStatus] = useState('available');
  const [routeBlocked, setRouteBlocked] = useState(false);

  useEffect(() => {
    if (socket) {
      socket.on('ambulance:dispatch', (inc) => {
        setDispatch(inc);
        setStatus('busy');
      });
      socket.on('ambulance:updated', setAmbulances);
      socket.on('incident:updated', (inc) => {
        if (dispatch && inc.id === dispatch.id) setDispatch(inc);
      });
      socket.emit('register:ambulance', user.id);
    }
    fetch('http://localhost:5000/ambulances').then(r => r.json()).then(setAmbulances);
  }, [socket, user]);

  function accept() {
    if (!dispatch) return;
    fetch(`http://localhost:5000/incidents/${dispatch.id}/severity`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ severity: dispatch.severity })
    });
    setStatus('en_route_patient');
  }

  function dismiss() {
    setDispatch(null);
    setStatus('available');
  }

  function patientOnboard() {
    setStatus('en_route_hospital');
  }

  function arrived() {
    setStatus('available');
    setDispatch(null);
  }

  return (
    <div className="dashboard ambulance">
      <header className="topbar">
        <h1>Ambulance Driver</h1>
        <div className="user">{user.name} · {user.mobile}</div>
        <button onClick={() => localStorage.removeItem('fr_user') || window.location.reload()}>Logout</button>
      </header>

      <div className="grid">
        <div className="card big">
          <h2>Dispatch Alert</h2>
          <div className={`status-badge ${status}`}>{status.replace('_', ' ').toUpperCase()}</div>
          {dispatch ? (
            <div className="dispatch-detail">
              <p><Bell size={16} /> {dispatch.severity === 'severe' ? '🚑 ICU-ON-BOARD DISPATCH' : 'PATIENT PANIC ALERT'}</p>
              <p><MapPin size={16} /> Patient at {dispatch.lat.toFixed(4)}, {dispatch.lng.toFixed(4)}</p>
              <p>{dispatch.note || ''}</p>
              {dispatch.route && (
                <div className="route">
                  <p>Route to patient: {dispatch.route.eta}</p>
                </div>
              )}
              {dispatch.autoRoute && (
                <div className="route">
                  <p><ArrowRight size={16} /> Auto-route to nearest hospital: {dispatch.autoRoute.hospital}</p>
                  <p>ETA: {dispatch.autoRoute.eta}</p>
                </div>
              )}
              <div className="btn-row">
                <button className="btn-accept" onClick={accept}>Accept Dispatch</button>
                <button className="btn-dismiss" onClick={dismiss}>Dismiss</button>
              </div>
            </div>
          ) : (
            <p className="empty">Waiting for dispatch...</p>
          )}
          {status === 'en_route_patient' && (
            <div className="btn-row" style={{ marginTop: '1rem' }}>
              <button className="btn-accept" onClick={patientOnboard} disabled={routeBlocked}>Patient Onboard</button>
              {routeBlocked && <span className="hint">Route blocked by police - awaiting reassignment</span>}
            </div>
          )}
          {status === 'en_route_hospital' && (
            <button className="btn-accept" onClick={arrived}>Arrived at Hospital</button>
          )}
        </div>

        <div className="card">
          <h2>Fleet Status</h2>
          <ul>
            {ambulances.map(a => (
              <li key={a.id}>
                {a.driverName} ({a.type.toUpperCase()}) - <span className={a.status === 'available' ? 'avail' : 'busy'}>{a.status}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Nearest Hospital (auto-calculated)</h2>
          {dispatch && dispatch.autoRoute ? (
            <div>
              <p><Hospital size={16} /> {dispatch.autoRoute.hospital}</p>
              <p><Clock size={16} /> ETA: {dispatch.autoRoute.eta}</p>
              <p>Route auto-reassigns if police mark road blocked.</p>
            </div>
          ) : (
            <p className="empty">No active route.</p>
          )}
        </div>
      </div>
    </div>
  );
}
