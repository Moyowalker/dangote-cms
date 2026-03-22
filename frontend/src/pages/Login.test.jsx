import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn()
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
});