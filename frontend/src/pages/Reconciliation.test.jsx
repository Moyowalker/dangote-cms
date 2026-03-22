import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Reconciliation from './Reconciliation';
import client from '../api/client';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn()
  }
}));

describe('Reconciliation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads and displays reconciliation summary data', async () => {
    client.get
      .mockResolvedValueOnce({
        data: {
          summary: [
            {
              vendor_user_id: 'vendor-1',
              canteen_location: 'Main Canteen',
              total_consumptions: 50,
              failed_attempts: 4,
              discrepancy_indicator: 'medium'
            },
            {
              vendor_user_id: 'vendor-2',
              canteen_location: 'Annex',
              total_consumptions: 22,
              failed_attempts: 0,
              discrepancy_indicator: 'none'
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          summary: {
            total_consumptions: 50,
            consumptions_with_transaction: 50,
            missing_transaction_links: 0,
            failed_attempts: 4,
            failures_with_confirmed_match: 2,
            failures_confirmed_after_failure: 0,
            unresolved_failed_attempts: 2,
            already_recorded_failures: 2
          },
          successful_consumptions: [
            {
              id: 'rec-1',
              employee_name: 'Ada Worker',
              employee_number: 'EMP-001',
              badge_number: 'BG-001',
              department: 'Ops',
              meal_type: 'lunch',
              transaction_reference: 'TXN-001',
              consumed_at: '2026-03-22T12:00:00.000Z'
            }
          ],
          failed_attempts: [
            {
              id: 'fail-1',
              reason: 'Meal already recorded for this employee today',
              badge_number: 'BG-001',
              meal_type: 'lunch',
              follow_up_status: 'already-confirmed-before-failure',
              matched_transaction_reference: 'TXN-001',
              created_at: '2026-03-22T12:05:00.000Z'
            }
          ]
        }
      });

    render(<Reconciliation />);

    expect(await screen.findByText('vendor-1')).toBeInTheDocument();
    expect(screen.getByText('Main Canteen')).toBeInTheDocument();
    expect(screen.getByText('Annex')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getAllByText('4')).toHaveLength(2);
    expect(await screen.findByText('Reconciliation Drilldown')).toBeInTheDocument();
    expect(await screen.findByText('Confirmed Consumption Detail')).toBeInTheDocument();
    expect(await screen.findByText('Ada Worker (EMP-001)')).toBeInTheDocument();
    expect(screen.getAllByText('TXN-001')).toHaveLength(2);
    expect(screen.getByText('Failed Attempt Detail')).toBeInTheDocument();
    expect(screen.getByText('Matched Failures')).toBeInTheDocument();
    expect(screen.getByText('Already confirmed')).toBeInTheDocument();
  });

  it('refetches the summary when the date changes', async () => {
    const user = userEvent.setup();

    client.get
      .mockResolvedValueOnce({ data: { summary: [] } })
      .mockResolvedValueOnce({
        data: {
          summary: [
            {
              vendor_user_id: 'vendor-3',
              canteen_location: 'Night Shift',
              total_consumptions: 12,
              failed_attempts: 1,
              discrepancy_indicator: 'low'
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          summary: {
            total_consumptions: 12,
            consumptions_with_transaction: 12,
            missing_transaction_links: 0,
            failed_attempts: 1,
            failures_with_confirmed_match: 0,
            failures_confirmed_after_failure: 0,
            unresolved_failed_attempts: 1,
            already_recorded_failures: 1
          },
          successful_consumptions: [
            {
              id: 'rec-3',
              employee_name: 'Night Worker',
              employee_number: 'EMP-003',
              badge_number: 'BG-003',
              department: 'Night Ops',
              meal_type: 'dinner',
              transaction_reference: 'TXN-003',
              consumed_at: '2026-03-21T19:00:00.000Z'
            }
          ],
          failed_attempts: []
        }
      });

    render(<Reconciliation />);

    await screen.findByText(/no reconciliation summary/i);
    fireEvent.change(screen.getByLabelText('Reconciliation date'), { target: { value: '2026-03-21' } });

    expect(await screen.findByText('vendor-3')).toBeInTheDocument();
    expect(await screen.findByText('Night Worker (EMP-003)')).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith('/reconciliation/vendor-daily', { params: { date: '2026-03-21' } });
  });

  it('loads drilldown detail for a selected vendor location row', async () => {
    const user = userEvent.setup();

    client.get
      .mockResolvedValueOnce({
        data: {
          summary: [
            {
              vendor_user_id: 'vendor-9',
              canteen_location: 'Annex',
              total_consumptions: 3,
              failed_attempts: 2,
              discrepancy_indicator: 'medium'
            },
            {
              vendor_user_id: 'vendor-10',
              canteen_location: 'Main Canteen',
              total_consumptions: 6,
              failed_attempts: 1,
              discrepancy_indicator: 'low'
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          summary: {
            total_consumptions: 3,
            consumptions_with_transaction: 3,
            missing_transaction_links: 0,
            failed_attempts: 2,
            failures_with_confirmed_match: 0,
            failures_confirmed_after_failure: 0,
            unresolved_failed_attempts: 2,
            already_recorded_failures: 1
          },
          successful_consumptions: [],
          failed_attempts: [
            {
              id: 'fail-x',
              reason: 'Employee not found',
              badge_number: 'UNKNOWN',
              meal_type: 'lunch',
              follow_up_status: 'unresolved',
              matched_transaction_reference: null,
              created_at: '2026-03-22T12:05:00.000Z'
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          summary: {
            total_consumptions: 6,
            consumptions_with_transaction: 5,
            missing_transaction_links: 1,
            failed_attempts: 1,
            failures_with_confirmed_match: 0,
            failures_confirmed_after_failure: 0,
            unresolved_failed_attempts: 1,
            already_recorded_failures: 0
          },
          successful_consumptions: [
            {
              id: 'rec-z',
              employee_name: 'Main Worker',
              employee_number: 'EMP-010',
              badge_number: 'BG-010',
              department: 'Ops',
              meal_type: 'lunch',
              transaction_reference: null,
              consumed_at: '2026-03-22T12:00:00.000Z'
            }
          ],
          failed_attempts: []
        }
      });

    render(<Reconciliation />);

    await screen.findByText('vendor-9');
    await user.click(screen.getByRole('button', { name: /view details/i }));

    expect(await screen.findByText('Main Worker (EMP-010)')).toBeInTheDocument();
    expect(screen.getByText('Missing link')).toBeInTheDocument();
    expect(screen.getByText(/do not have a linked transaction reference yet/i)).toBeInTheDocument();
    expect(screen.getByText(/still have no matched confirmed consumption/i)).toBeInTheDocument();
    expect(client.get).toHaveBeenLastCalledWith('/reconciliation/vendor-daily/drilldown', {
      params: {
        date: expect.any(String),
        vendor_user_id: 'vendor-10',
        canteen_location: 'Main Canteen'
      }
    });
  });

  it('shows an error state when the backend request fails', async () => {
    client.get.mockRejectedValue({ response: { data: { error: 'Reconciliation unavailable' } } });

    render(<Reconciliation />);

    expect(await screen.findByText('Reconciliation unavailable')).toBeInTheDocument();
  });
});