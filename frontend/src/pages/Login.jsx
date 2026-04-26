import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { EMPLOYEE_ROLE, isVendorRole } from '../auth/roles';
import client from '../api/client';
import BrandLogo from '../components/BrandLogo';
import dangoteLogo from '../assets/dangote.png';

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
        navigate('/scan', { replace: true });
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
    <div className="login-page-modern">
      <div className="login-modern-split">
        <section className="login-modern-brand" aria-label="Brand overview">
          <div className="login-modern-brand-content">
            <h1 className="login-modern-title">Canteen Management Platform</h1>
            <p className="login-modern-subtitle">Enterprise Meal Operations &amp; Tracking</p>
            <div className="login-modern-watermark">
              DANGOTE
            </div>
          </div>
        </section>
        
        <section className="login-modern-form-pane" aria-label="Sign in form">
          <div className="login-modern-card">
            <div className="login-modern-logo-wrap">
              <img src={dangoteLogo} alt="Dangote Logo" className="login-modern-logo" />
              <p className="login-modern-greeting">Sign in to your account</p>
            </div>
            
            {error && <div className="alert alert-error">{error}</div>}
            
            <form onSubmit={handleSubmit} className="login-modern-form">
              <div className="form-group-modern">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  className="form-control-modern"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                />
              </div>
              <div className="form-group-modern">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  className="form-control-modern"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </div>
              <button
                className="btn-modern-primary"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Authenticating...' : 'Secure Sign In'}
              </button>
            </form>

            <div className="login-modern-recovery-wrap">
              <button
                type="button"
                className="btn-modern-text"
                onClick={() => setRecoveryOpen((current) => !current)}
              >
                {recoveryOpen ? 'Back to sign in' : 'Forgot Password?'}
              </button>

              {recoveryOpen ? (
                <div className="login-modern-recovery-card">
                  <h3 className="login-modern-recovery-title">Worker Password Recovery</h3>
                  <p className="login-modern-recovery-desc">
                    Enter worker details to verify identity and set a new password.
                  </p>

                  {recoveryState.error ? <div className="alert alert-error">{recoveryState.error}</div> : null}
                  {recoveryState.message ? <div className="alert alert-success">{recoveryState.message}</div> : null}

                  {!recoveryState.recoveryToken ? (
                    <form onSubmit={handleStartRecovery}>
                      <div className="form-group-modern">
                        <label htmlFor="recovery-username">Portal Username</label>
                        <input
                          id="recovery-username"
                          className="form-control-modern"
                          value={recoveryState.username}
                          onChange={(event) => setRecoveryState((current) => ({ ...current, username: event.target.value }))}
                        />
                      </div>
                      <div className="form-group-modern">
                        <label htmlFor="recovery-employee-number">Employee Number</label>
                        <input
                          id="recovery-employee-number"
                          className="form-control-modern"
                          value={recoveryState.employeeNumber}
                          onChange={(event) => setRecoveryState((current) => ({ ...current, employeeNumber: event.target.value }))}
                        />
                      </div>
                      <div className="form-group-modern">
                        <label htmlFor="recovery-badge-number">Badge Number</label>
                        <input
                          id="recovery-badge-number"
                          className="form-control-modern"
                          value={recoveryState.badgeNumber}
                          onChange={(event) => setRecoveryState((current) => ({ ...current, badgeNumber: event.target.value }))}
                        />
                      </div>
                      <div className="form-group-modern">
                        <label htmlFor="recovery-phone-last4">Phone Last 4 Digits</label>
                        <input
                          id="recovery-phone-last4"
                          className="form-control-modern"
                          inputMode="numeric"
                          maxLength={4}
                          value={recoveryState.phoneLast4}
                          onChange={(event) => setRecoveryState((current) => ({ ...current, phoneLast4: event.target.value }))}
                        />
                      </div>
                      <button className="btn-modern-secondary" type="submit" disabled={recoveryLoading}>
                        {recoveryLoading ? 'Verifying...' : 'Verify Identity'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleResetRecoveredPassword}>
                      <div className="form-group-modern">
                        <label htmlFor="recovery-new-password">New Password</label>
                        <input
                          id="recovery-new-password"
                          type="password"
                          className="form-control-modern"
                          value={recoveryState.newPassword}
                          onChange={(event) => setRecoveryState((current) => ({ ...current, newPassword: event.target.value }))}
                        />
                      </div>
                      <div className="form-group-modern">
                        <label htmlFor="recovery-confirm-password">Confirm New Password</label>
                        <input
                          id="recovery-confirm-password"
                          type="password"
                          className="form-control-modern"
                          value={recoveryState.confirmPassword}
                          onChange={(event) => setRecoveryState((current) => ({ ...current, confirmPassword: event.target.value }))}
                        />
                      </div>
                      <button className="btn-modern-primary" type="submit" disabled={recoveryLoading}>
                        {recoveryLoading ? 'Resetting...' : 'Reset Password'}
                      </button>
                    </form>
                  )}
                </div>
              ) : null}
            </div>

            <div className="login-modern-footer">
              <p>Powered by Emocom Technologies</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
