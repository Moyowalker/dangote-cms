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
import { VENDOR_ROLES } from './auth/roles';

export default function App() {
  return (
    <AuthProvider>
      <Navbar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/workers" element={
          <ProtectedRoute roles={['admin']}>
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
          <ProtectedRoute roles={['admin']}>
            <Reports />
          </ProtectedRoute>
        } />
        <Route path="/reconciliation" element={
          <ProtectedRoute roles={['admin']}>
            <Reconciliation />
          </ProtectedRoute>
        } />
      </Routes>
    </AuthProvider>
  );
}
