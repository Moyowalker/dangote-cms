import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { EMPLOYEE_ROLE, canViewWorkforce, isReportViewerRole, isVendorRole } from '../auth/roles';
import BrandLogo from './BrandLogo';

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
      <div className="navbar-brand">
        <BrandLogo compact className="navbar-brand-lockup" />
      </div>
      <ul className="navbar-nav">
        {user.role !== EMPLOYEE_ROLE && <li><NavLink to="/dashboard">Dashboard</NavLink></li>}
        {canViewWorkforce(user.role) && (
          <li><NavLink to="/workers">Workers</NavLink></li>
        )}
        {isReportViewerRole(user.role) && (
          <>
            <li><NavLink to="/menu">Menu Items</NavLink></li>
            <li><NavLink to="/reports">Reports</NavLink></li>
            <li><NavLink to="/reconciliation">Reconciliation</NavLink></li>
          </>
        )}
        {isVendorRole(user.role) && (
          <li><NavLink to="/tickets">Tickets</NavLink></li>
        )}
        {isVendorRole(user.role) && (
          <li><NavLink to="/scan">Scan QR</NavLink></li>
        )}
        {user.role === EMPLOYEE_ROLE && (
          <li><NavLink to="/my-portal">My Portal</NavLink></li>
        )}
      </ul>
      <div className="navbar-user">
        <span>{user.username} <span className="badge badge-info">{user.role}</span></span>
        <button className="btn-logout" onClick={handleLogout}>Logout</button>
      </div>
    </nav>
  );
}
