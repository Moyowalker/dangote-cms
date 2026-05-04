import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VendorInterface from './VendorInterface';
import client from '../api/client';
import { readOfflineActivityHistory, readOfflineRedemptionQueue, storeVendorValidationSnapshot } from '../utils/offlineVendorQueue';

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
    window.localStorage.clear();
    window.sessionStorage.clear();
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
            badge_number: 'BG-1001',
            photo_data_url: 'data:image/png;base64,ZmFrZQ=='
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
    expect(screen.getByRole('img', { name: /worker profile for ada worker/i })).toBeInTheDocument();
    expect(client.post).toHaveBeenNthCalledWith(1, '/tickets/validate-token', {
      token: 'signed-token-value',
      meal_type: 'lunch',
      canteen_location: 'Main Canteen'
    }, {
      timeout: 8000
    });

    expect(screen.getByRole('button', { name: 'Redeem' })).toBeDisabled();
    await user.click(screen.getByLabelText(/visually confirmed/i));
    await user.click(screen.getByRole('button', { name: 'Redeem' }));

    await screen.findByText(/meal recorded successfully/i);
    expect(client.post).toHaveBeenNthCalledWith(2, '/tickets/consume', {
      badge_number: 'BG-1001',
      token: 'signed-token-value',
      meal_type: 'lunch',
      canteen_location: 'Main Canteen'
    }, {
      timeout: 8000
    });
  });

  it('requires operator confirmation before QR redemption becomes available', async () => {
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
    await user.type(screen.getByRole('textbox', { name: /qr token/i }), 'signed-token-value');
    await user.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByLabelText(/visually confirmed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redeem' })).toBeDisabled();
    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('requires approved collector badge for delegated QR redemption', async () => {
    const user = userEvent.setup();

    client.post
      .mockResolvedValueOnce({
        data: {
          employee: {
            name: 'Ada Worker',
            employee_number: 'EMP-001',
            badge_number: 'BG-1001',
            photo_data_url: 'data:image/png;base64,ZmFrZQ=='
          },
          can_consume: true,
          meal_type: 'lunch',
          remaining: 1,
          delegation: {
            collector: {
              name: 'Bola Proxy',
              badge_number: 'BG-222'
            },
            reason: 'Worker is attending a site meeting'
          }
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
            id: 'txn-delegated-001',
            meal_type: 'lunch',
            collector_employee_id: 'collector-1'
          },
          transaction: {
            transaction_reference: 'txn-delegated-001'
          },
          remaining: 1,
          delegation: {
            collector: {
              name: 'Bola Proxy',
              badge_number: 'BG-222'
            }
          }
        }
      });

    render(<VendorInterface />);

    await user.click(screen.getByRole('button', { name: /qr token/i }));
    await user.type(screen.getByRole('textbox', { name: /qr token/i }), 'signed-delegated-token');
    await user.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText(/approved for collection by/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redeem' })).toBeDisabled();

    await user.type(screen.getByLabelText(/approved collector badge/i), 'BG-222');
    await user.click(screen.getByLabelText(/visually confirmed/i));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Redeem' })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: 'Redeem' }));

    await screen.findByText(/meal recorded successfully/i);
    expect(client.post).toHaveBeenNthCalledWith(2, '/tickets/consume', {
      badge_number: 'BG-1001',
      token: 'signed-delegated-token',
      meal_type: 'lunch',
      canteen_location: 'Main Canteen',
      collector_badge_number: 'BG-222'
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

  it('uses cached same-day badge validation offline and queues redemption for later sync', async () => {
    const user = userEvent.setup();

    storeVendorValidationSnapshot({
      badgeNumber: 'BG-2001',
      mealType: 'lunch',
      data: {
        employee: {
          id: 'emp-2001',
          name: 'Offline Worker',
          employee_number: 'EMP-2001',
          badge_number: 'BG-2001',
          department: 'Warehouse'
        },
        can_consume: true,
        meal_type: 'lunch',
        remaining: 1,
        date: new Date().toISOString().split('T')[0]
      }
    });

    render(<VendorInterface />);

    window.dispatchEvent(new Event('offline'));

    await user.type(screen.getByRole('textbox', { name: /badge number/i }), 'BG-2001');
    await user.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText(/using cached same-day validation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /queue redeem/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /queue redeem/i }));

    expect(await screen.findByText(/queued for sync/i)).toBeInTheDocument();
    expect(readOfflineRedemptionQueue()).toHaveLength(1);
  });

  it('syncs queued offline redemptions after the connection returns', async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString().split('T')[0];

    storeVendorValidationSnapshot({
      badgeNumber: 'BG-3001',
      mealType: 'lunch',
      data: {
        employee: {
          id: 'emp-3001',
          name: 'Queued Worker',
          employee_number: 'EMP-3001',
          badge_number: 'BG-3001'
        },
        can_consume: true,
        meal_type: 'lunch',
        remaining: 1,
        date: new Date().toISOString().split('T')[0]
      }
    });

    client.post.mockResolvedValueOnce({
      data: {
        employee: {
          name: 'Queued Worker',
          employee_number: 'EMP-3001',
          badge_number: 'BG-3001'
        },
        record: {
          id: 'txn-sync-001',
          meal_type: 'lunch'
        },
        transaction: {
          transaction_reference: 'txn-sync-001'
        },
        remaining: 0
      }
    }).mockResolvedValueOnce({
      data: {
        id: 'batch-sync-001',
        created_at: '2099-03-23T12:00:00.000Z',
        batch_date: today,
        device_id: 'device-sync-001',
        device_label: 'Dangote Vendor Device',
        canteen_location: 'Main Canteen',
        status: 'reconciled',
        summary: {
          total_entries: 1,
          matched_entries: 1,
          unresolved_entries: 0,
          missing_transaction_links: 0,
          employee_not_found_entries: 0,
          client_failed_entries: 0
        },
        entries: []
      }
    });

    render(<VendorInterface />);

    window.dispatchEvent(new Event('offline'));
    await user.type(screen.getByRole('textbox', { name: /badge number/i }), 'BG-3001');
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await user.click(await screen.findByRole('button', { name: /queue redeem/i }));

    expect(readOfflineRedemptionQueue()).toHaveLength(1);

    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith('/tickets/consume', {
        badge_number: 'BG-3001',
        meal_type: 'lunch',
        canteen_location: 'Main Canteen'
      }, {
        timeout: 8000
      });
    });

    await waitFor(() => {
      expect(readOfflineRedemptionQueue()).toHaveLength(0);
    });
    await waitFor(() => {
      expect(client.post).toHaveBeenNthCalledWith(2, '/reconciliation/offline-batches', expect.objectContaining({
        batch_date: today,
        canteen_location: 'Main Canteen',
        redemptions: [expect.objectContaining({
          badge_number: 'BG-3001',
          meal_type: 'lunch',
          client_outcome: 'synced'
        })]
      }), {
        timeout: 8000
      });
    });
    expect(readOfflineActivityHistory()).toHaveLength(1);
  });

  it('lets the operator remove a queued offline redemption from the device', async () => {
    const user = userEvent.setup();

    storeVendorValidationSnapshot({
      badgeNumber: 'BG-4001',
      mealType: 'lunch',
      data: {
        employee: {
          id: 'emp-4001',
          name: 'Removable Worker',
          employee_number: 'EMP-4001',
          badge_number: 'BG-4001'
        },
        can_consume: true,
        meal_type: 'lunch',
        remaining: 1,
        date: new Date().toISOString().split('T')[0]
      }
    });

    render(<VendorInterface />);

    window.dispatchEvent(new Event('offline'));
    await user.type(screen.getByRole('textbox', { name: /badge number/i }), 'BG-4001');
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await user.click(await screen.findByRole('button', { name: /queue redeem/i }));

    expect(readOfflineRedemptionQueue()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => {
      expect(readOfflineRedemptionQueue()).toHaveLength(0);
    });
    expect(await screen.findByText(/offline queue cleared on this device/i)).toBeInTheDocument();
  });

  it('retries a failed queued entry only when the operator asks for it', async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString().split('T')[0];

    storeVendorValidationSnapshot({
      badgeNumber: 'BG-5001',
      mealType: 'lunch',
      data: {
        employee: {
          id: 'emp-5001',
          name: 'Retry Worker',
          employee_number: 'EMP-5001',
          badge_number: 'BG-5001'
        },
        can_consume: true,
        meal_type: 'lunch',
        remaining: 1,
        date: new Date().toISOString().split('T')[0]
      }
    });

    client.post.mockRejectedValueOnce({
      response: {
        data: {
          error: 'Temporary backend failure'
        }
      },
      message: 'Temporary backend failure'
    }).mockResolvedValueOnce({
      data: {
        id: 'batch-failed-001',
        created_at: '2099-03-23T12:05:00.000Z',
        batch_date: today,
        device_id: 'device-failed-001',
        device_label: 'Dangote Vendor Device',
        canteen_location: 'Main Canteen',
        status: 'needs_review',
        summary: {
          total_entries: 1,
          matched_entries: 0,
          unresolved_entries: 1,
          missing_transaction_links: 0,
          employee_not_found_entries: 0,
          client_failed_entries: 1
        },
        entries: []
      }
    });

    render(<VendorInterface />);

    window.dispatchEvent(new Event('offline'));
    await user.type(screen.getByRole('textbox', { name: /badge number/i }), 'BG-5001');
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await user.click(await screen.findByRole('button', { name: /queue redeem/i }));

    window.dispatchEvent(new Event('online'));

    expect(await screen.findByText(/1 still pending/i)).toBeInTheDocument();
    expect(screen.getByText(/last error: temporary backend failure/i)).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledTimes(2);

    client.post.mockResolvedValueOnce({
      data: {
        employee: {
          name: 'Retry Worker',
          employee_number: 'EMP-5001',
          badge_number: 'BG-5001'
        },
        record: {
          id: 'txn-retry-001',
          meal_type: 'lunch'
        },
        transaction: {
          transaction_reference: 'txn-retry-001'
        },
        remaining: 0
      }
    }).mockResolvedValueOnce({
      data: {
        id: 'batch-retry-001',
        created_at: '2099-03-23T12:10:00.000Z',
        batch_date: today,
        device_id: 'device-retry-001',
        device_label: 'Dangote Vendor Device',
        canteen_location: 'Main Canteen',
        status: 'reconciled',
        summary: {
          total_entries: 1,
          matched_entries: 1,
          unresolved_entries: 0,
          missing_transaction_links: 0,
          employee_not_found_entries: 0,
          client_failed_entries: 0
        },
        entries: []
      }
    });

    await user.click(screen.getByRole('button', { name: /retry item/i }));

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledTimes(4);
    });
    await waitFor(() => {
      expect(readOfflineRedemptionQueue()).toHaveLength(0);
    });
    expect(readOfflineActivityHistory()).toHaveLength(2);
  });
});