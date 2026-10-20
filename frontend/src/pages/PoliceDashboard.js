import { useState, useEffect } from 'react';
import { useAuth, useSocket } from '../App';
import { MapPin, ShieldAlert, Truck, Clock, Plus, X, Trash2 } from './components/UI';

export default function PoliceDashboard() {
  const { user } = useAuth();
  const socket = useSocket();
  const [incidents, setIncidents] = useState([]);
  const [roadBlocks, setRoadBlocks] = useState([]);
  const [blockReason, setBlockReason] = useState('');
  const [blockLat, setBlockLat] = useState('28.6139');
  const [blockLng, setBlockLng] = useState('77.2090');
  const [corridorActive, setCorridorActive] = useState(false);

  useEffect(() => {
    if (socket) {
      socket.on('police:incident', (inc) => setIncidents(l => [inc, ...l]));
      socket.on('incident:updated', (inc) => setIncidents(l => l.map(i => i.id === inc.id ? inc : i)));
      socket.on('police:roadblock', (b) => setRoadBlocks(l => [...l, b]));
      socket.on('police:roadblock-cleared', (b) => setRoadBlocks(l => l.map(x => x.id === b.id ? b : x)));
      socket.on('police:greencorridor', () => setCorridorActive(true));
      socket.emit('register:police', user.id);
    }
    fetch('http://localhost:5000/incidents').then(r => r.json()).then(setIncidents);
    fetch('http://localhost:5000/police/roadblocks').then(r => r.json()).then(setRoadBlocks);
  }, [socket, user]);

  function addRoadBlock(e) {
    e.preventDefault();
    fetch('http://localhost:5000/police/roadblock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: blockReason, lat: parseFloat(blockLat), lng: parseFloat(blockLng), createdBy: user.name })
    });
    setBlockReason('');
  }

  function clearBlock(id) {
    fetch(`http://localhost:5000/police/roadblock/${id}/clear`, { method: 'POST' });
  }

  function greenCorridor() {
    const inc = incidents.find(i => i.status === 'assigned');
    if (!inc) return;
    fetch('http://localhost:5000/police/greencorridor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ incidentId: inc.id })
    });
  }

  return (
    <div className="dashboard police">
      <header className="topbar">
        <h1>Police Control Room</h1>
        <div className="user">{user.institutionName || user.name}</div>
        <button onClick={() => localStorage.removeItem('fr_user') || window.location.reload()}>Logout</button>
      </header>

      <div className="grid">
        <div className="card big">
          <h2>Ambulance Route & Traffic</h2>
          <div className="map-mock">
            <div className="map-label">Live Map (mock) - Ambulance routes & road blocks</div>
            {roadBlocks.map(b => (
              <div key={b.id} className="roadblock-marker" title={b.reason}>
                <div className="rb-dot"></div>
                <div className="rb-label">{b.reason}</div>
              </div>
            ))}
            {incidents.filter(i => i.status === 'assigned').map(inc => (
              <div key={inc.id} className="ambulance-marker" title={`Ambulance ${inc.assignedAmbulanceId}`}>
                <div className="amb-dot"></div>
                <div className="amb-label">Ambulance</div>
              </div>
            ))}
          </div>
          {corridorActive && <div className="green-corridor-banner">🚦 GREEN CORRIDOR ACTIVATED - Traffic signals cleared</div>}
        </div>

        <div className="card">
          <h2>Mark Road Blocked (VIP / Traffic)</h2>
          <form onSubmit={addRoadBlock} className="block-form">
            <input placeholder="Reason (e.g. VIP movement)" value={blockReason} onChange={e => setBlockReason(e.target.value)} required />
            <input placeholder="Latitude" value={blockLat} onChange={e => setBlockLat(e.target.value)} required />
            <input placeholder="Longitude" value={blockLng} onChange={e => setBlockLng(e.target.value)} required />
            <button type="submit">Add Road Block</button>
          </form>
          <p className="hint">Adding a block auto-reassigns affected ambulance routes.</p>
          <button className="btn-accept" onClick={greenCorridor}>Activate Green Corridor</button>
        </div>

        <div className="card">
          <h2>Active Road Blocks</h2>
          {roadBlocks.filter(b => b.active).length === 0 ? <p className="empty">No active blocks.</p> : (
            roadBlocks.filter(b => b.active).map(b => (
              <div key={b.id} className="block-item">
                <span>{b.reason}</span>
                <button className="btn-dismiss" onClick={() => clearBlock(b.id)}>Clear</button>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h2>Accident Alerts</h2>
          {incidents.length === 0 ? <p className="empty">No alerts.</p> : (
            incidents.slice(0, 5).map(inc => (
              <div key={inc.id} className="alert-item">
                <p><MapPin size={14} /> {inc.patientName} - {inc.severity}</p>
                <p><ShieldAlert size={14} /> {inc.status}</p>
                <p><Clock size={14} /> {inc.createdAt.slice(11, 16)}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
