import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Navbar from './Navbar';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn()
}));

vi.mock('./BrandLogo', () => ({
  default: () => <div>Brand</div>
}));

describe('Navbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows hr navigation links without vendor actions', () => {
    useAuth.mockReturnValue({
      user: { username: 'hr.demo', role: 'hr' },
      logout: vi.fn()
    });

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Workers' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Menu Items' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reconciliation' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tickets' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Scan QR' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Help Desk' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My Portal' })).not.toBeInTheDocument();
  });

  it('shows scan access for admin users', () => {
    useAuth.mockReturnValue({
      user: { username: 'admin.demo', role: 'admin' },
      logout: vi.fn()
    });

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Menu Items' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tickets' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Scan QR' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Help Desk' })).toBeInTheDocument();
  });

  it('shows only self-service navigation for employee users', () => {
    useAuth.mockReturnValue({
      user: { username: 'employee.demo', role: 'employee' },
      logout: vi.fn()
    });

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'My Portal' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Workers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Menu Items' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
  });
});