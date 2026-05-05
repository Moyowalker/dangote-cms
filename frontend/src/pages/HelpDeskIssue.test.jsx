import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HelpDeskIssue from './HelpDeskIssue';
import client from '../api/client';

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
    post: vi.fn(),
    patch: vi.fn()
  }
}));

describe('HelpDeskIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.get.mockReset();
    client.post.mockReset();
    client.patch.mockReset();
    toDataURL.mockResolvedValue('data:image/png;base64,helpdesk');
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
    document.execCommand = vi.fn(() => true);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });
  });

  it('looks up a worker by badge and issues a signed QR token', async () => {
    const user = userEvent.setup();

    client.get
      .mockResolvedValueOnce({ data: { entries: [] } })
      .mockResolvedValueOnce({
      data: {
        employee: {
          id: 'emp-001',
          name: 'Ada Worker',
          employee_number: 'EMP-001',
          badge_number: 'BG-001',
          department: 'Operations',
          photo_data_url: 'data:image/png;base64,photo'
        },
        can_consume: true,
        message: null
      }
    });

    client.post.mockResolvedValueOnce({
      data: {
        token: 'signed-helpdesk-token',
        expires_at: '2099-03-23T10:05:00.000Z',
        ttl_seconds: 120
      }
    });

    render(<HelpDeskIssue />);

    await user.type(screen.getByRole('textbox', { name: /worker badge number/i }), 'BG-001');
    await user.click(screen.getByRole('button', { name: /lookup worker/i }));

    await waitFor(() => {
      expect(client.get).toHaveBeenCalledWith('/tickets/validate/BG-001');
    });

    expect(await screen.findByRole('img', { name: /worker profile for ada worker/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith('/tickets/qr-token', {
        employee_id: 'emp-001',
        ttl_seconds: 120
      });
    });

    expect(await screen.findByRole('img', { name: /qr code for ada worker/i })).toBeInTheDocument();
  });

  it('issues a delegated collection token when collector badge and reason are supplied', async () => {
    const user = userEvent.setup();

    client.get
      .mockResolvedValueOnce({ data: { entries: [] } })
      .mockResolvedValueOnce({
      data: {
        employee: {
          id: 'emp-001',
          name: 'Ada Worker',
          employee_number: 'EMP-001',
          badge_number: 'BG-001',
          department: 'Operations',
          photo_data_url: 'data:image/png;base64,photo'
        },
        can_consume: true,
        message: null
      }
    });

    client.post
      .mockResolvedValueOnce({
        data: {
          token: 'signed-standard-token',
          expires_at: '2099-03-23T10:05:00.000Z',
          ttl_seconds: 120
        }
      })
      .mockResolvedValueOnce({
        data: {
          token: 'signed-delegated-token',
          expires_at: '2099-03-23T10:06:00.000Z',
          ttl_seconds: 120,
          delegation: {
            collector: {
              name: 'Bola Proxy',
              badge_number: 'BG-222'
            },
            reason: 'Worker is on a production line'
          }
        }
      });

    render(<HelpDeskIssue />);

    await user.type(screen.getByRole('textbox', { name: /worker badge number/i }), 'BG-001');
    await user.click(screen.getByRole('button', { name: /lookup worker/i }));

    await screen.findByRole('img', { name: /qr code for ada worker/i });
    await user.click(screen.getByRole('button', { name: /delegated collection/i }));
    await user.type(screen.getByLabelText(/approved collector badge/i), 'BG-222');
    await user.type(screen.getByLabelText(/delegation reason/i), 'Worker is on a production line');
    await user.click(screen.getByRole('button', { name: /refresh qr/i }));

    await waitFor(() => {
      expect(client.post).toHaveBeenLastCalledWith('/tickets/qr-token', {
        employee_id: 'emp-001',
        ttl_seconds: 120,
        delegated_to_badge_number: 'BG-222',
        delegation_reason: 'Worker is on a production line'
      });
    });

    expect(await screen.findByText(/delegated collection approved for/i)).toBeInTheDocument();
  });

  it('shows an error when lookup fails', async () => {
    const user = userEvent.setup();

    client.get
      .mockResolvedValueOnce({ data: { entries: [] } })
      .mockRejectedValueOnce({
        response: {
          data: {
            error: 'Employee not found'
          }
        }
      });

    render(<HelpDeskIssue />);

    await user.type(screen.getByRole('textbox', { name: /worker badge number/i }), 'UNKNOWN');
    await user.click(screen.getByRole('button', { name: /lookup worker/i }));

    expect(await screen.findByText(/employee not found/i)).toBeInTheDocument();
  });

  it('lists delegated approvals and lets admin revoke one from the review panel', async () => {
    const user = userEvent.setup();

    client.get
      .mockResolvedValueOnce({
        data: {
          entries: [{
            id: 'approval-1',
            status: 'active',
            reason: 'Worker is in a meeting',
            valid_until: '2099-03-23T12:00:00.000Z',
            absent_employee: {
              name: 'Ada Worker',
              badge_number: 'BG-001'
            },
            collector_employee: {
              name: 'Bola Proxy',
              badge_number: 'BG-222'
            }
          }]
        }
      })
      .mockResolvedValueOnce({
        data: {
          entries: [{
            id: 'approval-1',
            status: 'revoked',
            reason: 'Worker is in a meeting',
            valid_until: '2099-03-23T12:00:00.000Z',
            absent_employee: {
              name: 'Ada Worker',
              badge_number: 'BG-001'
            },
            collector_employee: {
              name: 'Bola Proxy',
              badge_number: 'BG-222'
            }
          }]
        }
      });

    client.patch.mockResolvedValueOnce({
      data: {
        id: 'approval-1',
        status: 'revoked'
      }
    });

    render(<HelpDeskIssue />);

    expect(await screen.findByText(/delegated meal requests & approvals/i)).toBeInTheDocument();
    expect(screen.getByText(/bola proxy/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /revoke/i }));

    await waitFor(() => {
      expect(client.patch).toHaveBeenCalledWith('/tickets/delegations/approval-1/revoke', {});
    });

    expect(await screen.findByText(/closed/i)).toBeInTheDocument();
  });

  it('lists requested delegations and lets admin approve one from the review panel', async () => {
    const user = userEvent.setup();

    client.get
      .mockResolvedValueOnce({
        data: {
          entries: [{
            id: 'approval-2',
            status: 'requested',
            reason: 'I am on a production line',
            valid_until: '2099-03-23T12:00:00.000Z',
            absent_employee: {
              name: 'Ada Worker',
              badge_number: 'BG-001'
            },
            collector_employee: {
              name: 'Bola Proxy',
              badge_number: 'BG-222'
            }
          }]
        }
      })
      .mockResolvedValueOnce({
        data: {
          entries: [{
            id: 'approval-2',
            status: 'active',
            reason: 'I am on a production line',
            valid_until: '2099-03-23T12:00:00.000Z',
            absent_employee: {
              name: 'Ada Worker',
              badge_number: 'BG-001'
            },
            collector_employee: {
              name: 'Bola Proxy',
              badge_number: 'BG-222'
            }
          }]
        }
      });

    client.patch.mockResolvedValueOnce({
      data: {
        id: 'approval-2',
        status: 'active'
      }
    });

    render(<HelpDeskIssue />);

    expect(await screen.findByText(/delegated meal requests & approvals/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(client.patch).toHaveBeenCalledWith('/tickets/delegations/approval-2/approve', {});
    });

    expect(await screen.findByText(/^active$/i)).toBeInTheDocument();
  });
});
