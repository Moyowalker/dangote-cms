import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn()
  }
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn()
}));

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads admin stats and shows admin quick actions', async () => {
    useAuth.mockReturnValue({ user: { username: 'admin-user', role: 'admin' } });
    client.get
      .mockResolvedValueOnce({
        data: {
          totalEmployees: 25,
          mealsToday: 180,
          mealsThisMonth: 3520,
          activePlans: 4
        }
      })
      .mockResolvedValueOnce({
        data: {
          risk_indicators: {
            failed_attempts_today: 5,
            duplicate_window_blocks_today: 2,
            failed_attempts_by_reason: {
              'Meal already recorded for this employee today': 3,
              'Vendor restriction does not allow this worker category for the selected meal type': 2
            }
          },
          operational_indicators: {
            redemptions_today: 180,
            redemptions_by_location: {
              'Main Canteen': 120,
              Annex: 60
            },
            failed_attempts_by_location: {
              'Main Canteen': 4,
              Annex: 1
            },
            ticket_endpoint_health: {
              'ticket.validate': {
                average_ms: 180,
                p95_ms: 420,
                slow_requests: 1,
                active_requests: 0,
                stalled_requests: 0,
                health_status: 'warning'
              },
              'ticket.consume': {
                average_ms: 240,
                p95_ms: 680,
                slow_requests: 0,
                active_requests: 1,
                stalled_requests: 0,
                health_status: 'normal'
              }
            }
          }
        }
      });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(await screen.findByText('25')).toBeInTheDocument();
    expect(screen.getByText('Meals Today')).toBeInTheDocument();
    expect(screen.getByText('Operational Indicators')).toBeInTheDocument();
    expect(screen.getByText('Latency And Stall Visibility')).toBeInTheDocument();
    expect(screen.getByText('Failed Attempts Today')).toBeInTheDocument();
    expect(screen.getByText('Duplicate Blocks Today')).toBeInTheDocument();
    expect(screen.getByText('Redemptions By Location')).toBeInTheDocument();
    expect(screen.getByText('Validate P95')).toBeInTheDocument();
    expect(screen.getByText('Consume P95')).toBeInTheDocument();
    expect(screen.getByText(/Avg 180ms \| Slow 1 \| Active 0 \| Stalled 0/)).toBeInTheDocument();
    expect(screen.getAllByText('Main Canteen')).toHaveLength(2);
    expect(screen.getByText('Failure Reasons Today')).toBeInTheDocument();
    expect(screen.getByText('Failed Attempts By Location')).toBeInTheDocument();
    expect(screen.getByText('Meal already recorded for this employee today')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage workers/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /issue tickets/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /scan worker qr/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /reconciliation/i })).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith('/dashboard/stats');
    expect(client.get).toHaveBeenCalledWith('/dashboard/indicators');
  });

  it('shows vendor actions for vendor users without loading admin stats', () => {
    useAuth.mockReturnValue({ user: { username: 'vendor-user', role: 'vendor' } });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(screen.getByText(/vendor actions/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open qr scanner/i })).toBeInTheDocument();
    expect(client.get).not.toHaveBeenCalled();
  });

  it('loads the read-only operations dashboard for hr users', async () => {
    useAuth.mockReturnValue({ user: { username: 'hr-user', role: 'hr' } });
    client.get
      .mockResolvedValueOnce({
        data: {
          totalEmployees: 42,
          mealsToday: 160,
          mealsThisMonth: 2800,
          activePlans: 4
        }
      })
      .mockResolvedValueOnce({
        data: {
          risk_indicators: {
            failed_attempts_today: 3,
            duplicate_window_blocks_today: 1,
            failed_attempts_by_reason: {
              'Meal already recorded for this employee today': 2
            }
          },
          operational_indicators: {
            redemptions_today: 160,
            redemptions_by_location: {
              'Main Canteen': 100
            },
            failed_attempts_by_location: {
              'Main Canteen': 2
            },
            ticket_endpoint_health: {
              'ticket.validate': {
                average_ms: 140,
                p95_ms: 350,
                slow_requests: 0,
                active_requests: 0,
                stalled_requests: 0,
                health_status: 'normal'
              }
            }
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          total: 2,
          summary: {
            active_workers: 42,
            ready_workers: 40,
            missing_phone: 1,
            missing_photo: 1
          },
          workers: [
            {
              id: 'emp-1',
              name: 'Ada Worker',
              department: 'Ops',
              missing_phone: true,
              missing_photo: false
            }
          ]
        }
      });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(await screen.findByText('HR Operations View')).toBeInTheDocument();
    expect(screen.getByText('Workforce Readiness')).toBeInTheDocument();
    expect(screen.getByText('HR Tools')).toBeInTheDocument();
    expect(screen.getByText('Ada Worker')).toBeInTheDocument();
    expect(screen.getByText('Missing phone')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review workers/i })).toBeInTheDocument();
    expect(client.get).toHaveBeenNthCalledWith(1, '/dashboard/stats');
    expect(client.get).toHaveBeenNthCalledWith(2, '/dashboard/indicators');
    expect(client.get).toHaveBeenNthCalledWith(3, '/reports/worker-readiness');
  });

  it('stops loading cleanly if admin stats fail', async () => {
    useAuth.mockReturnValue({ user: { username: 'admin-user', role: 'admin' } });
    client.get.mockRejectedValue(new Error('stats failed'));

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(await screen.findByText(/quick actions/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading stats/i)).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no location indicators yet', async () => {
    useAuth.mockReturnValue({ user: { username: 'admin-user', role: 'admin' } });
    client.get
      .mockResolvedValueOnce({
        data: {
          totalEmployees: 25,
          mealsToday: 0,
          mealsThisMonth: 3520,
          activePlans: 4
        }
      })
      .mockResolvedValueOnce({
        data: {
          risk_indicators: {
            failed_attempts_today: 0,
            duplicate_window_blocks_today: 0,
            failed_attempts_by_reason: {}
          },
          operational_indicators: {
            redemptions_today: 0,
            redemptions_by_location: {},
            failed_attempts_by_location: {},
            ticket_endpoint_health: {}
          }
        }
      });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(await screen.findByText(/no location activity recorded yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no endpoint timing data recorded yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no failure reasons recorded yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no failed-attempt hotspots recorded yet/i)).toBeInTheDocument();
  });
});