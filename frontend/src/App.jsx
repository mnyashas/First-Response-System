import { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import io from 'socket.io-client';

const API = 'http://localhost:5000';
const socket = io(API);

const AuthContext = createContext();
const SocketContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('fr_user') || 'null'));

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function SocketProvider({ children }) {
  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
export function useSocket() { return useContext(SocketContext); }

import Login from './pages/Login.jsx';
import PatientDashboard from './pages/PatientDashboard.jsx';
import AmbulanceDashboard from './pages/AmbulanceDashboard.jsx';
import HospitalDashboard from './pages/HospitalDashboard.jsx';
import PoliceDashboard from './pages/PoliceDashboard.jsx';

function Protected({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <div className="app">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/patient" element={<Protected role="patient"><PatientDashboard /></Protected>} />
              <Route path="/ambulance" element={<Protected role="ambulance"><AmbulanceDashboard /></Protected>} />
              <Route path="/hospital" element={<Protected role="hospital"><HospitalDashboard /></Protected>} />
              <Route path="/police" element={<Protected role="police"><PoliceDashboard /></Protected>} />
              <Route path="/" element={<Navigate to="/login" replace />} />
            </Routes>
          </div>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
