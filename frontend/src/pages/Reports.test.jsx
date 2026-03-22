import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Reports from './Reports';
import client from '../api/client';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn()
  }
}));

describe('Reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and displays daily summary and department breakdown data', async () => {
    client.get.mockImplementation((url) => {
      if (url === '/entitlements/worker-categories') {
        return Promise.resolve({
          data: [
            { _id: 'cat-1', name: 'Permanent' }
          ]
        });
      }

      if (url === '/reports/daily') {
        return Promise.resolve({
          data: {
            total: 12,
            summary: [
              { meal_type: 'breakfast', count: 2 },
              { meal_type: 'lunch', count: 7 },
              { meal_type: 'dinner', count: 3 }
            ],
            details: [
              {
                id: 'rec-1',
                employee_name: 'Ada Worker',
                employee_number: 'EMP-001',
                department: 'Operations',
                canteen_location: 'Main Canteen',
                meal_type: 'lunch',
                status: 'used',
                transaction_reference: 'TXN-REP-001',
                has_transaction_link: true,
                consumption_date: '2026-03-22'
              }
            ]
          }
        });
      }

      if (url === '/reports/failures') {
        return Promise.resolve({
          data: {
            total: 2,
            summary: [
              { reason: 'Meal already recorded for this employee today', count: 1 },
              { reason: 'Employee not found', count: 1 }
            ],
            details: [
              {
                id: 'fail-1',
                reason: 'Meal already recorded for this employee today',
                badge_number: 'EMP-001',
                canteen_location: 'Main Canteen',
                meal_type: 'lunch',
                date: '2026-03-22'
              }
            ]
          }
        });
      }

      if (url === '/reports/department') {
        return Promise.resolve({
          data: [
            { department: 'Operations', meal_type: 'lunch', count: 4 },
            { department: 'Engineering', meal_type: 'dinner', count: 2 }
          ]
        });
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    render(<Reports />);

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('Failure Summary')).toBeInTheDocument();
    expect(screen.getByText('Failure Attempts')).toBeInTheDocument();
    expect(screen.getByText('Daily Report')).toBeInTheDocument();
    expect(screen.getByText('Transaction Details')).toBeInTheDocument();
    expect(screen.getByText('Department Breakdown')).toBeInTheDocument();
    expect(screen.getAllByText('Operations')).toHaveLength(2);
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Ada Worker')).toBeInTheDocument();
    expect(screen.getByText('TXN-REP-001')).toBeInTheDocument();
    expect(screen.getAllByText('Meal already recorded for this employee today')).toHaveLength(2);
    expect(client.get).toHaveBeenCalledWith('/reports/daily', { params: { date: expect.any(String) } });
  });

  it('shows an empty-state row when no department data is returned', async () => {
    client.get.mockImplementation((url) => {
      if (url === '/entitlements/worker-categories') {
        return Promise.resolve({ data: [] });
      }

      if (url === '/reports/daily') {
        return Promise.resolve({
          data: {
            total: 0,
            summary: [],
            details: []
          }
        });
      }

      if (url === '/reports/failures') {
        return Promise.resolve({
          data: {
            total: 0,
            summary: [],
            details: []
          }
        });
      }

      if (url === '/reports/department') {
        return Promise.resolve({ data: [] });
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    render(<Reports />);

    expect(await screen.findByText(/no department data/i)).toBeInTheDocument();
    expect(screen.getByText(/no transaction details match these filters/i)).toBeInTheDocument();
    expect(screen.getAllByText(/no failure attempts match these filters/i)).toHaveLength(2);
  });

  it('applies supported report filters including failure reason and hides the misleading department breakdown', async () => {
    const user = userEvent.setup();

    client.get.mockImplementation((url, config) => {
      if (url === '/entitlements/worker-categories') {
        return Promise.resolve({
          data: [
            { _id: 'cat-1', name: 'Permanent' }
          ]
        });
      }

      if (url === '/reports/department') {
        return Promise.resolve({ data: [] });
      }

      if (url === '/reports/failures' && config?.params?.reason) {
        return Promise.resolve({
          data: {
            total: 1,
            summary: [{ reason: 'Meal already recorded for this employee today', count: 1 }],
            details: [
              {
                id: 'fail-filter-1',
                reason: 'Meal already recorded for this employee today',
                badge_number: 'FILTER-1',
                canteen_location: 'Main Canteen',
                meal_type: 'lunch',
                date: '2026-03-20'
              }
            ]
          }
        });
      }

      if (url === '/reports/failures') {
        return Promise.resolve({
          data: {
            total: 0,
            summary: [],
            details: []
          }
        });
      }

      if (url === '/reports/daily' && config?.params?.start_date) {
        return Promise.resolve({
          data: {
            total: 1,
            summary: [{ meal_type: 'lunch', count: 1 }],
            details: [
              {
                id: 'rec-filter-1',
                employee_name: 'Filter User A',
                employee_number: 'REP100',
                department: 'Ops',
                canteen_location: 'Main Canteen',
                meal_type: 'lunch',
                status: 'used',
                transaction_reference: null,
                has_transaction_link: false,
                consumption_date: '2026-03-20'
              }
            ]
          }
        });
      }

      if (url === '/reports/daily') {
        return Promise.resolve({
          data: {
            total: 12,
            summary: [],
            details: []
          }
        });
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    render(<Reports />);

    await screen.findByText(/no department data/i);

    await user.type(screen.getByLabelText('Start Date'), '2026-03-19');
    await user.type(screen.getByLabelText('End Date'), '2026-03-21');
    await user.type(screen.getByLabelText('Vendor Location'), 'Main Canteen');
    await user.selectOptions(screen.getByLabelText('Status'), 'used');
    await user.selectOptions(screen.getByLabelText('Worker Category'), 'cat-1');
    await user.type(screen.getByLabelText('Failure Reason'), 'already recorded');
    await user.click(screen.getByRole('button', { name: /apply filters/i }));

    expect(await screen.findByText('Filter User A')).toBeInTheDocument();
    expect(screen.getByText('FILTER-1')).toBeInTheDocument();
    expect(screen.getByText('Missing link')).toBeInTheDocument();
    expect(screen.getByText(/do not have a linked transaction reference yet/i)).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith('/reports/failures', {
      params: {
        start_date: '2026-03-19',
        end_date: '2026-03-21',
        vendor: 'Main Canteen',
        status: 'used',
        worker_category_id: 'cat-1',
        reason: 'already recorded'
      }
    });
    expect(client.get).toHaveBeenCalledWith('/reports/daily', {
      params: {
        start_date: '2026-03-19',
        end_date: '2026-03-21',
        vendor: 'Main Canteen',
        status: 'used',
        worker_category_id: 'cat-1'
      }
    });
    expect(screen.getByText(/department breakdown is only shown for the single-day unfiltered view/i)).toBeInTheDocument();
  });
});