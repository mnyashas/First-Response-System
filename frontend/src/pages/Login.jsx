import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, ShieldAlert, Building2, Landmark, AlertCircle } from '../components/UI.jsx';

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

  const isMedical = role === 'patient' || role === 'ambulance';

  async function handleSubmit(e, type) {
    e.preventDefault();
    setError('');
    setLoading(true);

    let body = { role, name, mobile };
    if (isMedical) body.aadhaar = extra;
    else { body.institutionName = extra; body.address = extra2; body.receptionistName = name; }

    try {
      const res = await fetch(`${API}/auth/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Login failed (${res.status})`);
      localStorage.setItem('fr_user', JSON.stringify(data.user));
      navigate(`/${role}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
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
