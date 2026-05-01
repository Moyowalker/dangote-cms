import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OfflineActivity from './OfflineActivity';
import client from '../api/client';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn()
  }
}));

describe('OfflineActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders local device activity and server reconciliation history for the selected date', async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString().split('T')[0];

    window.localStorage.setItem('dangote-vendor-offline-activity', JSON.stringify([
      {
        id: 'local-batch-1',
        recorded_at: '2099-03-23T12:15:00.000Z',
        batch_date: today,
        device_id: 'device-local-1',
        device_label: 'Dangote Vendor Device',
        canteen_location: 'Main Canteen',
        status: 'needs_review',
        upload_status: 'upload_failed',
        upload_error: 'Upload failed during reconnect',
        summary: {
          total_entries: 2,
          matched_entries: 1,
          unresolved_entries: 1
        },
        entries: [
          {
            local_reference: 'queue-1',
            employee_name: 'Ada Worker',
            employee_number: 'EMP-001',
            badge_number: 'BG-001',
            meal_type: 'lunch',
            client_outcome: 'sync_failed',
            resolution_reason: 'Temporary backend failure'
          }
        ]
      }
    ]));

    client.get.mockResolvedValueOnce({
      data: {
        batches: [
          {
            id: 'server-batch-1',
            created_at: '2099-03-23T12:16:00.000Z',
            device_id: 'device-local-1',
            device_label: 'Dangote Vendor Device',
            status: 'reconciled',
            summary: {
              total_entries: 2,
              matched_entries: 2,
              unresolved_entries: 0
            }
          }
        ]
      }
    });

    render(<OfflineActivity />);

    expect(await screen.findByText(/dangote vendor device/i)).toBeInTheDocument();
    expect(await screen.findByText(/local sync batches/i)).toBeInTheDocument();
    expect(screen.getByText(/server batches/i)).toBeInTheDocument();
    expect(screen.getByText(/upload failed during reconnect/i)).toBeInTheDocument();
    expect(screen.getByText(/ada worker/i)).toBeInTheDocument();
    expect(screen.getAllByText(/reconciled/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(client.get).toHaveBeenCalledWith('/reconciliation/offline-batches', {
        params: { date: today }
      });
    });
  });

  it('shows a warning when server history cannot be loaded', async () => {
    client.get.mockRejectedValueOnce({
      response: {
        data: {
          error: 'Offline reconciliation unavailable'
        }
      }
    });

    render(<OfflineActivity />);

    expect(await screen.findByText(/offline reconciliation unavailable/i)).toBeInTheDocument();
  });
});