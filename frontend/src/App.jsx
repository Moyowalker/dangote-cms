import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Workers from './pages/Workers';
import Tickets from './pages/Tickets';
import VendorInterface from './pages/VendorInterface';
import Reports from './pages/Reports';
import Reconciliation from './pages/Reconciliation';
import WorkerQrPage from './pages/WorkerQrPage';
import { REPORT_VIEWER_ROLES, VENDOR_ROLES, WORKFORCE_VIEW_ROLES } from './auth/roles';

export default function App() {
  return (
    <AuthProvider>
      <div className="app-shell">
        <Navbar />
        <main className="app-main">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/workers" element={
              <ProtectedRoute roles={WORKFORCE_VIEW_ROLES}>
                <Workers />
              </ProtectedRoute>
            } />
            <Route path="/tickets" element={
              <ProtectedRoute roles={VENDOR_ROLES}>
                <Tickets />
              </ProtectedRoute>
            } />
            <Route path="/vendor" element={
              <ProtectedRoute roles={VENDOR_ROLES}>
                <VendorInterface />
              </ProtectedRoute>
            } />
            <Route path="/my-portal" element={
              <ProtectedRoute roles={['employee']}>
                <WorkerQrPage />
              </ProtectedRoute>
            } />
            <Route path="/my-qr" element={<Navigate to="/my-portal" replace />} />
            <Route path="/reports" element={
              <ProtectedRoute roles={REPORT_VIEWER_ROLES}>
                <Reports />
              </ProtectedRoute>
            } />
            <Route path="/reconciliation" element={
              <ProtectedRoute roles={REPORT_VIEWER_ROLES}>
                <Reconciliation />
              </ProtectedRoute>
            } />
          </Routes>
        </main>
        <footer className="app-footer">
          <div className="app-footer-inner">
            <span className="app-footer-brand">Dangote Canteen Management Platform</span>
            <span className="app-footer-credit">Developed by Emocom Technologies</span>
          </div>
        </footer>
      </div>
    </AuthProvider>
  );
}
