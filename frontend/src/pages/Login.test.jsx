import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn()
}));

vi.mock('../api/client', () => ({
  default: {
    post: vi.fn()
  }
}));

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the user to the original protected route after login', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockResolvedValue({ role: 'vendor' });
    useAuth.mockReturnValue({ login });

    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/vendor' } }]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/vendor" element={<div>vendor screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Username'), 'vendor-user');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(login).toHaveBeenCalledWith('vendor-user', 'secret');
    expect(await screen.findByText('vendor screen')).toBeInTheDocument();
  });

  it('sends a vendor user to the vendor screen when there is no preserved route', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockResolvedValue({ role: 'vendor' });
    useAuth.mockReturnValue({ login });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/vendor" element={<div>vendor screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Username'), 'vendor-user');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('vendor screen')).toBeInTheDocument();
  });

  it('sends an employee user to the self-service portal when there is no preserved route', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockResolvedValue({ role: 'employee' });
    useAuth.mockReturnValue({ login });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/my-portal" element={<div>employee portal screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Username'), 'employee-user');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('employee portal screen')).toBeInTheDocument();
  });

  it('sends hr users to the dashboard when there is no preserved route', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockResolvedValue({ role: 'hr' });
    useAuth.mockReturnValue({ login });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<div>dashboard screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Username'), 'hr-user');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('dashboard screen')).toBeInTheDocument();
  });

  it('shows the backend error message when login fails', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockRejectedValue({ response: { data: { error: 'Invalid credentials' } } });
    useAuth.mockReturnValue({ login });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Username'), 'vendor-user');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  it('lets a worker recover a forgotten password from the login screen', async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ login: vi.fn() });
    client.post
      .mockResolvedValueOnce({
        data: {
          recovery_token: 'recovery-token-123',
          expires_at: '2099-03-23T10:05:00.000Z'
        }
      })
      .mockResolvedValueOnce({
        data: {
          message: 'Password reset successfully. You can now sign in with the new password.'
        }
      });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /forgot worker password/i }));
    await user.type(screen.getByLabelText(/portal username/i), 'EMP-001');
    await user.type(screen.getByLabelText(/employee number/i), 'EMP-001');
    await user.type(screen.getByLabelText(/badge number/i), 'BG-001');
    await user.type(screen.getByLabelText(/phone last 4 digits/i), '5678');
    await user.click(screen.getByRole('button', { name: /verify worker details/i }));

    expect(client.post).toHaveBeenNthCalledWith(1, '/auth/password-recovery/verify', {
      username: 'EMP-001',
      employee_number: 'EMP-001',
      badge_number: 'BG-001',
      phone_last4: '5678'
    });

    await user.type(screen.getByLabelText(/^New Password$/i), 'workerPass123');
    await user.type(screen.getByLabelText(/Confirm New Password/i), 'workerPass123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(client.post).toHaveBeenNthCalledWith(2, '/auth/password-recovery/reset', {
      recovery_token: 'recovery-token-123',
      new_password: 'workerPass123'
    });
    expect(await screen.findByText(/password reset successfully/i)).toBeInTheDocument();
  });
});