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
          <ProtectedRoute roles={['admin', 'staff']}>
            <Tickets />
          </ProtectedRoute>
        } />
        <Route path="/vendor" element={
          <ProtectedRoute roles={['staff', 'admin']}>
            <VendorInterface />
          </ProtectedRoute>
        } />
        <Route path="/reports" element={
          <ProtectedRoute roles={['admin']}>
            <Reports />
          </ProtectedRoute>
        } />
      </Routes>
    </AuthProvider>
  );
}
