import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OfflineActivity from './OfflineActivity';
import client from '../api/client';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn()
}));

import { useAuth } from '../context/AuthContext';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn()
  }
}));

describe('OfflineActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useAuth.mockReturnValue({
      user: { username: 'admin.demo', role: 'admin' }
    });
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
    }).mockResolvedValueOnce({
      data: {
        id: 'server-batch-1',
        created_at: '2099-03-23T12:16:00.000Z',
        device_id: 'device-local-1',
        device_label: 'Dangote Vendor Device',
        status: 'needs_review',
        review_notes: 'Needs finance check',
        summary: {
          total_entries: 2,
          matched_entries: 1,
          unresolved_entries: 1,
          missing_transaction_links: 0
        },
        entries: [
          {
            local_reference: 'queue-1',
            employee_name: 'Ada Worker',
            employee_number: 'EMP-001',
            badge_number: 'BG-001',
            meal_type: 'lunch',
            status: 'unresolved',
            resolution_reason: 'Temporary backend failure'
          }
        ]
      }
    }).mockResolvedValueOnce({
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

    client.patch.mockResolvedValueOnce({
      data: {
        id: 'server-batch-1',
        created_at: '2099-03-23T12:16:00.000Z',
        device_id: 'device-local-1',
        device_label: 'Dangote Vendor Device',
        status: 'reconciled',
        review_notes: 'Finance confirmed',
        reviewed_at: '2099-03-23T12:20:00.000Z',
        summary: {
          total_entries: 2,
          matched_entries: 2,
          unresolved_entries: 0,
          missing_transaction_links: 0
        },
        entries: [
          {
            local_reference: 'queue-1',
            employee_name: 'Ada Worker',
            employee_number: 'EMP-001',
            badge_number: 'BG-001',
            meal_type: 'lunch',
            status: 'matched',
            resolution_reason: 'Matched to a confirmed transaction'
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
    expect(await screen.findByDisplayValue(/needs finance check/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save review/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/review status/i), 'reconciled');
    await user.clear(screen.getByLabelText(/review notes/i));
    await user.type(screen.getByLabelText(/review notes/i), 'Finance confirmed');
    await user.click(screen.getByRole('button', { name: /save review/i }));

    await waitFor(() => {
      expect(client.patch).toHaveBeenCalledWith('/reconciliation/offline-batches/server-batch-1/review', {
        status: 'reconciled',
        review_notes: 'Finance confirmed'
      });
    });
    expect(await screen.findByDisplayValue(/finance confirmed/i)).toBeInTheDocument();

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

  it('shows server detail but hides reviewer actions for vendor users', async () => {
    useAuth.mockReturnValue({
      user: { username: 'vendor.demo', role: 'vendor' }
    });

    client.get.mockResolvedValueOnce({
      data: {
        batches: [
          {
            id: 'server-batch-2',
            created_at: '2099-03-23T12:16:00.000Z',
            status: 'needs_review',
            summary: {
              total_entries: 1,
              matched_entries: 0,
              unresolved_entries: 1
            }
          }
        ]
      }
    }).mockResolvedValueOnce({
      data: {
        id: 'server-batch-2',
        created_at: '2099-03-23T12:16:00.000Z',
        status: 'needs_review',
        summary: {
          total_entries: 1,
          matched_entries: 0,
          unresolved_entries: 1,
          missing_transaction_links: 0
        },
        entries: [
          {
            local_reference: 'queue-2',
            badge_number: 'BG-002',
            meal_type: 'lunch',
            status: 'unresolved',
            resolution_reason: 'Employee not found for badge number'
          }
        ]
      }
    });

    render(<OfflineActivity />);

    expect(await screen.findByText(/selected server batch/i)).toBeInTheDocument();
    expect(await screen.findByText(/employee not found for badge number/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save review/i })).not.toBeInTheDocument();
  });
});