import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VendorInterface from './VendorInterface';
import client from '../api/client';

vi.mock('../components/QrScannerPanel', () => ({
  default: function MockQrScannerPanel({ open, onDetected, onClose }) {
    if (!open) {
      return null;
    }

    return (
      <div>
        <button type="button" onClick={() => onDetected('camera-detected-token')}>Trigger Camera Scan</button>
        <button type="button" onClick={onClose}>Close Scanner</button>
      </div>
    );
  }
}));

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

describe('VendorInterface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.get.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    window.dispatchEvent(new Event('online'));
  });

  it('restores a pending redemption attempt from session storage', async () => {
    window.sessionStorage.setItem('dangote-vendor-pending-attempt', JSON.stringify({
      badgeNumber: 'BG-1001',
      mealType: 'lunch',
      startedAt: Date.now()
    }));

    render(<VendorInterface />);

    expect(await screen.findByText(/recovery mode/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('BG-1001')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /meal type/i })).toHaveValue('lunch');
    expect(screen.getByRole('button', { name: /check latest transaction/i })).toBeInTheDocument();
  });

  it('shows an offline banner and disables risky actions when the browser disconnects', async () => {
    render(<VendorInterface />);

    window.dispatchEvent(new Event('offline'));

    expect(await screen.findByText(/offline:/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redeem' })).toBeDisabled();
  });

  it('can recover a previously ambiguous redemption from recent transaction history', async () => {
    const user = userEvent.setup();
    const attempt = {
      badgeNumber: 'BG-1001',
      mealType: 'lunch',
      startedAt: Date.now()
    };

    window.sessionStorage.setItem('dangote-vendor-pending-attempt', JSON.stringify(attempt));

    client.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [{
          id: 'txn-001',
          badge_number: 'BG-1001',
          meal_type: 'lunch',
          consumed_at: new Date(attempt.startedAt + 1000).toISOString(),
          employee_name: 'Ada Worker',
          employee_number: 'EMP-001'
        }]
      });

    render(<VendorInterface />);

    await user.click(await screen.findByRole('button', { name: /check latest transaction/i }));

    expect(await screen.findByText(/meal found in recent history/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Ada Worker/)).toHaveLength(2);

    await waitFor(() => {
      expect(window.sessionStorage.getItem('dangote-vendor-pending-attempt')).toBeNull();
    });
  });

  it('validates a signed QR token and redeems using the resolved worker badge', async () => {
    const user = userEvent.setup();

    client.post
      .mockResolvedValueOnce({
        data: {
          employee: {
            name: 'Ada Worker',
            employee_number: 'EMP-001',
            badge_number: 'BG-1001'
          },
          can_consume: true,
          meal_type: 'lunch',
          remaining: 1
        }
      })
      .mockResolvedValueOnce({
        data: {
          employee: {
            name: 'Ada Worker',
            employee_number: 'EMP-001',
            department: 'Operations'
          },
          record: {
            id: 'txn-qr-001',
            meal_type: 'lunch'
          },
          transaction: {
            transaction_reference: 'txn-qr-001'
          },
          remaining: 1
        }
      });

    render(<VendorInterface />);

    await user.click(screen.getByRole('button', { name: /qr token/i }));
    await user.type(screen.getByRole('textbox', { name: /qr token/i }), 'signed-token-value');
    await user.click(screen.getByRole('button', { name: 'Validate' }));

    await screen.findByText(/lookup source:/i);
    expect(client.post).toHaveBeenNthCalledWith(1, '/tickets/validate-token', {
      token: 'signed-token-value',
      meal_type: 'lunch',
      canteen_location: 'Main Canteen'
    }, {
      timeout: 8000
    });

    await user.click(screen.getByRole('button', { name: 'Redeem' }));

    await screen.findByText(/meal recorded successfully/i);
    expect(client.post).toHaveBeenNthCalledWith(2, '/tickets/consume', {
      badge_number: 'BG-1001',
      meal_type: 'lunch',
      canteen_location: 'Main Canteen'
    }, {
      timeout: 8000
    });
  });

  it('can validate from the camera scanner without manual token paste', async () => {
    const user = userEvent.setup();

    client.post.mockResolvedValueOnce({
      data: {
        employee: {
          name: 'Ada Worker',
          employee_number: 'EMP-001',
          badge_number: 'BG-1001'
        },
        can_consume: true,
        meal_type: 'lunch',
        remaining: 1
      }
    });

    render(<VendorInterface />);

    await user.click(screen.getByRole('button', { name: /qr token/i }));
    await user.click(screen.getByRole('button', { name: /use camera/i }));
    await user.click(screen.getByRole('button', { name: /trigger camera scan/i }));

    expect(await screen.findByText(/lookup source:/i)).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledWith('/tickets/validate-token', {
      token: 'camera-detected-token',
      meal_type: 'lunch',
      canteen_location: 'Main Canteen'
    }, {
      timeout: 8000
    });
  });

  it('prevents duplicate redemption submissions while the first request is still processing', async () => {
    const user = userEvent.setup();
    let resolveConsume;

    client.post.mockImplementation(() => new Promise((resolve) => {
      resolveConsume = resolve;
    }));

    render(<VendorInterface />);

    await user.type(screen.getByRole('textbox', { name: /badge number/i }), 'BG-1001');
    await user.click(screen.getByRole('button', { name: 'Redeem' }));

    expect(client.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /redeeming/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /redeeming/i }));
    expect(client.post).toHaveBeenCalledTimes(1);

    resolveConsume({
      data: {
        employee: {
          name: 'Ada Worker',
          employee_number: 'EMP-001',
          department: 'Operations'
        },
        record: {
          id: 'txn-dup-001',
          meal_type: 'lunch'
        },
        transaction: {
          transaction_reference: 'txn-dup-001'
        },
        remaining: 1
      }
    });

    await screen.findByText(/meal recorded successfully/i);
  });
});