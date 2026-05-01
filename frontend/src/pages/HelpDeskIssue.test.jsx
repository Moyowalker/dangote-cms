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
    post: vi.fn()
  }
}));

describe('HelpDeskIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    client.get.mockResolvedValueOnce({
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

  it('shows an error when lookup fails', async () => {
    const user = userEvent.setup();

    client.get.mockRejectedValueOnce({
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
});
