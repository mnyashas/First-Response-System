import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, ShieldAlert, Building2, Landmark, Wifi, AlertCircle } from '../components/UI.jsx';

const API = 'http://localhost:5000';

export default function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState('patient');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [extra, setExtra] = useState('');
  const [extra2, setExtra2] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [backendOk, setBackendOk] = useState(null);

  const isMedical = role === 'patient' || role === 'ambulance';

  useEffectCheckBackend();

  function useEffectCheckBackend() {
    fetch(`${API}/health`, { mode: 'cors' })
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));
  }

  async function handleSubmit(e, type) {
    e.preventDefault();
    setError('');
    setLoading(true);

    let body = { role, name, mobile };
    if (isMedical) body.aadhaar = extra;
    else { body.institutionName = extra; body.address = extra2; body.receptionistName = name; }

    try {
      const res = await fetch(`${API}/auth/${type}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Server error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      localStorage.setItem('fr_user', JSON.stringify(data.user));
      navigate(`/${role}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  if (backendOk === false) {
    return (
      <div className="login">
        <div className="login-card">
          <div className="role-tabs">
            {['patient', 'ambulance', 'hospital', 'police'].map(r => (
              <button key={r} className={role === r ? 'active' : ''} onClick={() => setRole(r)}>{r.charAt(0).toUpperCase() + r.slice(1)}</button>
            ))}
          </div>
          <h2 style={{ color: '#f87171' }}>Backend Not Running</h2>
          <div className="error">
            <AlertCircle size={24} /> Cannot connect to http://localhost:5000
          </div>
          <p>Start the backend first:</p>
          <pre style={{ background: '#0f172a', padding: '1rem', borderRadius: '6px', overflow: 'x-auto' }}>
cd "C:\Users\User\Desktop\first response system\backend"
npm start
          </pre>
          <button onClick={useEffectCheckBackend} className="btn-accept">Retry Connection Check</button>
        </div>
      </div>
    );
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="role-tabs">
          {['patient', 'ambulance', 'hospital', 'police'].map(r => (
            <button key={r} className={role === r ? 'active' : ''} onClick={() => setRole(r)}>{r.charAt(0).toUpperCase() + r.slice(1)}</button>
          ))}
        </div>
        <h2>{isMedical ? 'Patient / Ambulance Login' : 'Institution Login'}</h2>
        {error && <div className="error"><AlertCircle size={16} /> {error}</div>}
        <form onSubmit={e => handleSubmit(e, 'login')} className="form">
          <label>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} required />
          <label>Mobile No</label>
          <input value={mobile} onChange={e => setMobile(e.target.value)} type="tel" required />
          {isMedical ? (
            <>
              <label>Aadhaar Card No</label>
              <input value={extra} onChange={e => setExtra(e.target.value)} required />
            </>
          ) : (
            <>
              <label>Name of Hospital / Police Unit</label>
              <input value={extra} onChange={e => setExtra(e.target.value)} required />
              <label>Address</label>
              <input value={extra2} onChange={e => setExtra2(e.target.value)} required />
              <label>Receptionist Name</label>
              <input value={name} onChange={e => setName(e.target.value)} required />
            </>
          )}
          <button type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <p className="note">New user? Register instead:</p>
        <button onClick={e => handleSubmit(e, 'register')} className="btn-register" disabled={loading}>
          {loading ? 'Registering...' : 'Register'}
        </button>
        <div className="hint">
          Demo: Patient mobile 9876543210 · Ambulance 9988776655 · Hospital/Police any
        </div>
      </div>
    </div>
  );
}
