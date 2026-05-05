import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkerQrPage from './WorkerQrPage';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const { toDataURL } = vi.hoisted(() => ({
  toDataURL: vi.fn()
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL
  }
}));

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn()
}));

describe('WorkerQrPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toDataURL.mockResolvedValue('data:image/png;base64,fake-worker-qr');
  });

  it('loads the employee profile and renders a live self-service QR card', async () => {
    useAuth.mockReturnValue({ user: { role: 'employee', employee_id: 'emp-1' } });
    client.get.mockResolvedValueOnce({
      data: {
        employee: {
          id: 'emp-1',
          employee_number: 'EMP-001',
          badge_number: 'BG-001',
          name: 'Ada Worker',
          department: 'Operations',
          meal_plan_name: 'Standard Meals',
          worker_category_name: 'Full Time',
          photo_data_url: 'data:image/png;base64,ZmFrZQ==',
          active: true,
          status: 'active'
        },
        stats: {
          consumed_today: 1,
          remaining_today: 2,
          next_eligible_meal: 'lunch',
          last_activity_at: '2026-03-23T07:45:00.000Z'
        },
        meal_statuses: [
          { meal_type: 'breakfast', status: 'consumed', allowed: 1, consumed: 1, remaining: 0, consumed_at: '2026-03-23T07:45:00.000Z', message: 'Already redeemed today.' },
          { meal_type: 'lunch', status: 'eligible', allowed: 1, consumed: 0, remaining: 1, consumed_at: null, message: 'Available for redemption.' },
          { meal_type: 'dinner', status: 'eligible', allowed: 1, consumed: 0, remaining: 1, consumed_at: null, message: 'Available for redemption.' }
        ],
        recent_activity: [
          { id: 'rec-1', meal_type: 'breakfast', status: 'used', canteen_location: 'Main Canteen', consumed_at: '2026-03-23T07:45:00.000Z' }
        ]
      }
    });
    client.post.mockResolvedValueOnce({
      data: {
        token: 'worker-self-service-token',
        expires_at: '2099-03-23T10:05:00.000Z',
        ttl_seconds: 120
      }
    });

    render(
      <MemoryRouter>
        <WorkerQrPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/My Meal Portal/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/Ada Worker/i)).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('img', { name: /profile for ada worker/i })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /qr code for ada worker/i })).toBeInTheDocument();
    expect(screen.getByText(/live on-screen presentation only/i)).toBeInTheDocument();
    expect(screen.getByText(/Today's Meal Status/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Recent Activity/i)).toHaveLength(2);
    expect(screen.getAllByText(/Breakfast/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Main Canteen/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/signed qr token/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy token/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download png/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /print qr/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refresh qr/i })).not.toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith('/tickets/self-service-summary');
    expect(client.post).toHaveBeenCalledWith('/tickets/qr-token', {
      employee_id: 'emp-1',
      ttl_seconds: 120
    });
  });

  it('allows a worker to replace the temporary password from the portal', async () => {
    const user = userEvent.setup();

    useAuth.mockReturnValue({ user: { role: 'employee', employee_id: 'emp-1' } });
    client.get.mockResolvedValueOnce({
      data: {
        employee: {
          id: 'emp-1',
          employee_number: 'EMP-001',
          badge_number: 'BG-001',
          name: 'Ada Worker',
          department: 'Operations',
          meal_plan_name: 'Standard Meals',
          worker_category_name: 'Full Time',
          active: true,
          status: 'active'
        },
        stats: {
          consumed_today: 1,
          remaining_today: 2,
          next_eligible_meal: 'lunch',
          last_activity_at: '2026-03-23T07:45:00.000Z'
        },
        meal_statuses: [
          { meal_type: 'breakfast', status: 'consumed', allowed: 1, consumed: 1, remaining: 0, consumed_at: '2026-03-23T07:45:00.000Z', message: 'Already redeemed today.' },
          { meal_type: 'lunch', status: 'eligible', allowed: 1, consumed: 0, remaining: 1, consumed_at: null, message: 'Available for redemption.' },
          { meal_type: 'dinner', status: 'eligible', allowed: 1, consumed: 0, remaining: 1, consumed_at: null, message: 'Available for redemption.' }
        ],
        recent_activity: []
      }
    });
    client.post
      .mockResolvedValueOnce({
        data: {
          token: 'worker-self-service-token',
          expires_at: '2099-03-23T10:05:00.000Z',
          ttl_seconds: 120
        }
      })
      .mockResolvedValueOnce({
        data: {
          message: 'Password changed successfully'
        }
      });

    render(
      <MemoryRouter>
        <WorkerQrPage />
      </MemoryRouter>
    );

    await screen.findByText(/Password & Access/i);

    await user.type(screen.getByLabelText(/Current Password/i), 'tempPass12');
    await user.type(screen.getByLabelText(/^New Password$/i), 'newPass123');
    await user.type(screen.getByLabelText(/Confirm New Password/i), 'newPass123');
    await user.click(screen.getByRole('button', { name: /Change Password/i }));

    expect(client.post).toHaveBeenNthCalledWith(2, '/auth/change-password', {
      current_password: 'tempPass12',
      new_password: 'newPass123'
    });
    expect(await screen.findByText(/Password changed successfully/i)).toBeInTheDocument();
  });

  it('lets a worker request delegated collection from the portal', async () => {
    const user = userEvent.setup();

    useAuth.mockReturnValue({ user: { role: 'employee', employee_id: 'emp-1' } });
    client.get.mockResolvedValueOnce({
      data: {
        employee: {
          id: 'emp-1',
          employee_number: 'EMP-001',
          badge_number: 'BG-001',
          name: 'Ada Worker',
          department: 'Operations',
          active: true,
          status: 'active'
        },
        stats: {
          consumed_today: 0,
          remaining_today: 3,
          next_eligible_meal: 'breakfast',
          last_activity_at: null
        },
        meal_statuses: [
          { meal_type: 'breakfast', status: 'eligible', allowed: 1, consumed: 0, remaining: 1, consumed_at: null, message: 'Available for redemption.' }
        ],
        recent_activity: [],
        delegation_requests: []
      }
    });
    client.post
      .mockResolvedValueOnce({
        data: {
          token: 'worker-self-service-token',
          expires_at: '2099-03-23T10:05:00.000Z',
          ttl_seconds: 120
        }
      })
      .mockResolvedValueOnce({
        data: {
          id: 'approval-1',
          status: 'requested',
          reason: 'I am in training',
          meal_type: 'lunch',
          valid_until: '2099-03-23T23:59:59.000Z',
          collector_employee: {
            name: 'Bola Proxy',
            badge_number: 'BG-222'
          }
        }
      });

    render(
      <MemoryRouter>
        <WorkerQrPage />
      </MemoryRouter>
    );

    expect((await screen.findAllByText(/Delegated Meal Requests/i)).length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText(/Collector Badge Number/i), 'BG-222');
    await user.selectOptions(screen.getByLabelText(/Meal Type/i), 'lunch');
    await user.type(screen.getByLabelText(/^Reason$/i), 'I am in training');
    await user.click(screen.getByRole('button', { name: /Request Delegated Collection/i }));

    await waitFor(() => {
      expect(client.post).toHaveBeenNthCalledWith(2, '/tickets/delegations/request', {
        delegated_to_badge_number: 'BG-222',
        delegation_reason: 'I am in training',
        meal_type: 'lunch'
      });
    });

    expect(await screen.findByText(/Delegation request sent for admin approval/i)).toBeInTheDocument();
    expect(screen.getByText(/Bola Proxy/i)).toBeInTheDocument();
    expect(screen.getByText(/requested/i)).toBeInTheDocument();
  });

  it('renders an approved delegated collection QR from an active delegation approval', async () => {
    useAuth.mockReturnValue({ user: { role: 'employee', employee_id: 'emp-1' } });
    client.get.mockResolvedValueOnce({
      data: {
        employee: {
          id: 'emp-1',
          employee_number: 'EMP-001',
          badge_number: 'BG-001',
          name: 'Ada Worker',
          department: 'Operations',
          active: true,
          status: 'active'
        },
        stats: {
          consumed_today: 0,
          remaining_today: 3,
          next_eligible_meal: 'lunch',
          last_activity_at: null
        },
        meal_statuses: [
          { meal_type: 'lunch', status: 'eligible', allowed: 1, consumed: 0, remaining: 1, consumed_at: null, message: 'Available for redemption.' }
        ],
        recent_activity: [],
        delegation_requests: [{
          id: 'approval-2',
          status: 'active',
          reason: 'I am on a production line',
          valid_until: '2099-03-23T23:59:59.000Z',
          collector_employee: {
            name: 'Bola Proxy',
            badge_number: 'BG-222'
          }
        }]
      }
    });
    client.post
      .mockResolvedValueOnce({
        data: {
          token: 'worker-self-service-token',
          expires_at: '2099-03-23T10:05:00.000Z',
          ttl_seconds: 120
        }
      })
      .mockResolvedValueOnce({
        data: {
          token: 'delegated-worker-token',
          expires_at: '2099-03-23T10:06:00.000Z',
          ttl_seconds: 120,
          delegation: {
            request_source: 'employee_portal',
            collector: {
              name: 'Bola Proxy',
              badge_number: 'BG-222'
            }
          }
        }
      });

    render(
      <MemoryRouter>
        <WorkerQrPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Approved Delegated Collection QR/i)).toBeInTheDocument();
    expect(screen.getByText(/approved collector:/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(client.post).toHaveBeenNthCalledWith(2, '/tickets/qr-token', {
        employee_id: 'emp-1',
        ttl_seconds: 120,
        delegation_approval_id: 'approval-2'
      });
    });
  });
});