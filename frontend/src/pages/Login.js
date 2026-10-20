import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, ShieldAlert, Building2, Landmark } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState('patient');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [extra, setExtra] = useState('');
  const [extra2, setExtra2] = useState('');
  const [error, setError] = useState('');

  const isMedical = role === 'patient' || role === 'ambulance';

  async function handleSubmit(e) {
    e.preventDefault();
    let body = { role, name, mobile };
    if (isMedical) body.aadhaar = extra;
    else { body.institutionName = extra; body.address = extra2; body.receptionistName = name; }

    try {
      const res = await fetch('http://localhost:5000/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Login failed');
      const data = await res.json();
      localStorage.setItem('fr_user', JSON.stringify(data.user));
      navigate(`/${role}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    let body = { role, name, mobile };
    if (isMedical) body.aadhaar = extra;
    else { body.institutionName = extra; body.address = extra2; body.receptionistName = name; }

    try {
      const res = await fetch('http://localhost:5000/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Register failed');
      const data = await res.json();
      localStorage.setItem('fr_user', JSON.stringify(data.user));
      navigate(`/${role}`);
    } catch (err) {
      setError(err.message);
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
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit} className="form">
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
          <button type="submit">Login</button>
        </form>
        <p className="note">New user? Use the same form to register.</p>
        <button onClick={handleRegister} className="btn-register">Register</button>
        <div className="hint">Demo: Patient mobile 9876543210 · Ambulance 9988776655 · Hospital/Police any</div>
      </div>
    </div>
  );
}
