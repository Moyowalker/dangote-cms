import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Workers from './pages/Workers';
import Tickets from './pages/Tickets';
import VendorInterface from './pages/VendorInterface';
import HelpDeskIssue from './pages/HelpDeskIssue';
import Reports from './pages/Reports';
import Reconciliation from './pages/Reconciliation';
import WorkerQrPage from './pages/WorkerQrPage';
import MenuManagement from './pages/MenuManagement';
import PwaInstallBanner from './components/PwaInstallBanner';
import { HELP_DESK_ROLES, REPORT_VIEWER_ROLES, VENDOR_ROLES, WORKFORCE_VIEW_ROLES } from './auth/roles';

export default function App() {
  const location = useLocation();
  const isLoginRoute = location.pathname === '/login';

  return (
    <AuthProvider>
      <div className="app-shell">
        {isLoginRoute ? null : <Navbar />}
        <main className="app-main">
          <PwaInstallBanner />
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
            <Route path="/scan" element={
              <ProtectedRoute roles={VENDOR_ROLES}>
                <VendorInterface />
              </ProtectedRoute>
            } />
            <Route path="/vendor" element={
              <Navigate to="/scan" replace />
            } />
            <Route path="/help-desk" element={
              <ProtectedRoute roles={HELP_DESK_ROLES}>
                <HelpDeskIssue />
              </ProtectedRoute>
            } />
            <Route path="/my-portal" element={
              <ProtectedRoute roles={['employee']}>
                <WorkerQrPage />
              </ProtectedRoute>
            } />
            <Route path="/my-qr" element={<Navigate to="/my-portal" replace />} />
            <Route path="/menu" element={
              <ProtectedRoute roles={REPORT_VIEWER_ROLES}>
                <MenuManagement />
              </ProtectedRoute>
            } />
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
        {isLoginRoute ? null : (
          <footer className="app-footer">
            <div className="app-footer-inner">
              <span className="app-footer-brand">Dangote Canteen Management Platform</span>
              <span className="app-footer-credit">Powered by Emocom Technologies</span>
            </div>
          </footer>
        )}
      </div>
    </AuthProvider>
  );
}
