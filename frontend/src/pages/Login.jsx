import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { EMPLOYEE_ROLE, isVendorRole } from '../auth/roles';
import client from '../api/client';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryState, setRecoveryState] = useState({
    username: '',
    employeeNumber: '',
    badgeNumber: '',
    phoneLast4: '',
    recoveryToken: '',
    newPassword: '',
    confirmPassword: '',
    message: '',
    error: ''
  });
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(username, password);
      const nextPath = typeof location.state?.from === 'string' ? location.state.from : null;

      if (nextPath) {
        navigate(nextPath, { replace: true });
      } else if (user?.role === EMPLOYEE_ROLE) {
        navigate('/my-portal', { replace: true });
      } else if (user && isVendorRole(user.role) && user.role !== 'admin') {
        navigate('/vendor', { replace: true });
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleStartRecovery(event) {
    event.preventDefault();
    setRecoveryState((current) => ({ ...current, error: '', message: '' }));
    setRecoveryLoading(true);
    try {
      const response = await client.post('/auth/password-recovery/verify', {
        username: recoveryState.username,
        employee_number: recoveryState.employeeNumber,
        badge_number: recoveryState.badgeNumber,
        phone_last4: recoveryState.phoneLast4
      });

      setRecoveryState((current) => ({
        ...current,
        recoveryToken: response.data.recovery_token,
        message: 'Identity confirmed. Set your new password now.',
        error: ''
      }));
    } catch (err) {
      setRecoveryState((current) => ({
        ...current,
        error: err.response?.data?.error || 'We could not verify those worker recovery details.',
        message: ''
      }));
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function handleResetRecoveredPassword(event) {
    event.preventDefault();
    setRecoveryState((current) => ({ ...current, error: '', message: '' }));

    if (!recoveryState.newPassword || recoveryState.newPassword.length < 8) {
      setRecoveryState((current) => ({ ...current, error: 'New password must be at least 8 characters long.' }));
      return;
    }

    if (recoveryState.newPassword !== recoveryState.confirmPassword) {
      setRecoveryState((current) => ({ ...current, error: 'New password and confirmation do not match.' }));
      return;
    }

    setRecoveryLoading(true);
    try {
      const response = await client.post('/auth/password-recovery/reset', {
        recovery_token: recoveryState.recoveryToken,
        new_password: recoveryState.newPassword
      });

      setRecoveryState({
        username: '',
        employeeNumber: '',
        badgeNumber: '',
        phoneLast4: '',
        recoveryToken: '',
        newPassword: '',
        confirmPassword: '',
        message: response.data?.message || 'Password reset successfully.',
        error: ''
      });
    } catch (err) {
      setRecoveryState((current) => ({
        ...current,
        error: err.response?.data?.error || 'Could not reset the password right now.',
        message: ''
      }));
    } finally {
      setRecoveryLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>🍽️ Dangote CMS</h1>
          <p>Canteen Management System</p>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              className="form-control"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="form-control"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '10px', fontSize: '1rem' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="text-muted text-center mt-3" style={{ fontSize: '0.75rem' }}>
          Admin default: admin / admin123. Workers should sign in with the username issued from Worker Portal Access, usually their employee number, plus the temporary password shared by admin.
        </p>
        <p className="text-muted text-center mt-2" style={{ fontSize: '0.75rem' }}>
          Workers can now recover access here with their username, employee number, badge number, and the last 4 digits of the phone number stored on their profile.
        </p>
        <div className="login-recovery-panel">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setRecoveryOpen((current) => !current)}
            style={{ width: '100%', marginTop: '12px' }}
          >
            {recoveryOpen ? 'Hide Worker Password Recovery' : 'Forgot Worker Password?'}
          </button>

          {recoveryOpen ? (
            <div className="login-recovery-card">
              <h2 className="login-recovery-title">Worker Password Recovery</h2>
              <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '16px' }}>
                Verify the worker profile first. The phone check uses the last 4 digits of the phone number stored on the worker record.
              </p>

              {recoveryState.error ? <div className="alert alert-error">{recoveryState.error}</div> : null}
              {recoveryState.message ? <div className="alert alert-success">{recoveryState.message}</div> : null}

              {!recoveryState.recoveryToken ? (
                <form onSubmit={handleStartRecovery}>
                  <div className="form-group">
                    <label htmlFor="recovery-username">Portal Username</label>
                    <input
                      id="recovery-username"
                      className="form-control"
                      value={recoveryState.username}
                      onChange={(event) => setRecoveryState((current) => ({ ...current, username: event.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="recovery-employee-number">Employee Number</label>
                    <input
                      id="recovery-employee-number"
                      className="form-control"
                      value={recoveryState.employeeNumber}
                      onChange={(event) => setRecoveryState((current) => ({ ...current, employeeNumber: event.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="recovery-badge-number">Badge Number</label>
                    <input
                      id="recovery-badge-number"
                      className="form-control"
                      value={recoveryState.badgeNumber}
                      onChange={(event) => setRecoveryState((current) => ({ ...current, badgeNumber: event.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="recovery-phone-last4">Phone Last 4 Digits</label>
                    <input
                      id="recovery-phone-last4"
                      className="form-control"
                      inputMode="numeric"
                      maxLength={4}
                      value={recoveryState.phoneLast4}
                      onChange={(event) => setRecoveryState((current) => ({ ...current, phoneLast4: event.target.value }))}
                    />
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={recoveryLoading} style={{ width: '100%' }}>
                    {recoveryLoading ? 'Verifying...' : 'Verify Worker Details'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetRecoveredPassword}>
                  <div className="form-group">
                    <label htmlFor="recovery-new-password">New Password</label>
                    <input
                      id="recovery-new-password"
                      type="password"
                      className="form-control"
                      value={recoveryState.newPassword}
                      onChange={(event) => setRecoveryState((current) => ({ ...current, newPassword: event.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="recovery-confirm-password">Confirm New Password</label>
                    <input
                      id="recovery-confirm-password"
                      type="password"
                      className="form-control"
                      value={recoveryState.confirmPassword}
                      onChange={(event) => setRecoveryState((current) => ({ ...current, confirmPassword: event.target.value }))}
                    />
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={recoveryLoading} style={{ width: '100%' }}>
                    {recoveryLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </form>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
