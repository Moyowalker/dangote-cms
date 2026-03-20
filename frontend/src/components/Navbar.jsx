import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  if (!user) return null;

  return (
    <nav className="navbar">
      <div className="navbar-brand">🍽️ Dangote CMS</div>
      <ul className="navbar-nav">
        <li><NavLink to="/dashboard">Dashboard</NavLink></li>
        {(user.role === 'admin' || user.role === 'hr') && (
          <>
            <li><NavLink to="/workers">Workers</NavLink></li>
            <li><NavLink to="/tickets">Tickets</NavLink></li>
            <li><NavLink to="/reports">Reports</NavLink></li>
          </>
        )}
        {user.role === 'vendor' && (
          <li><NavLink to="/vendor">Vendor</NavLink></li>
        )}
      </ul>
      <div className="navbar-user">
        <span>{user.username} <span className="badge badge-info">{user.role}</span></span>
        <button className="btn-logout" onClick={handleLogout}>Logout</button>
      </div>
    </nav>
  );
}
