import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuditTrail from './AuditTrail';
import client from '../api/client';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn()
  }
}));

describe('AuditTrail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and displays audit entries with summary cards', async () => {
    client.get.mockResolvedValueOnce({
      data: {
        total: 2,
        summary: {
          total: 2,
          successes: 1,
          failures: 1
        },
        entries: [
          {
            id: 'audit-1',
            created_at: '2099-03-23T12:15:00.000Z',
            actor_role: 'admin',
            actor_user_id: '000000000000000000000001',
            action: 'employee.create',
            entity_type: 'employee',
            entity_id: 'emp-1',
            outcome: 'success',
            reason: null,
            metadata: { request_id: 'req-audit-1' }
          },
          {
            id: 'audit-2',
            created_at: '2099-03-23T12:16:00.000Z',
            actor_role: 'anonymous',
            actor_user_id: null,
            action: 'auth.login',
            entity_type: 'session',
            entity_id: null,
            outcome: 'failure',
            reason: 'Invalid credentials',
            metadata: { request_id: 'req-audit-2' }
          }
        ]
      }
    }).mockResolvedValueOnce({
      data: {
        id: 'audit-1',
        created_at: '2099-03-23T12:15:00.000Z',
        actor_role: 'admin',
        actor_user_id: '000000000000000000000001',
        action: 'employee.create',
        entity_type: 'employee',
        entity_id: 'emp-1',
        outcome: 'success',
        reason: null,
        prev_hash: null,
        hash: 'hash-audit-1',
        metadata: {
          request_id: 'req-audit-1',
          request_body: {
            employee_number: 'EMP-001'
          }
        }
      }
    });

    render(<AuditTrail />);

    expect(await screen.findByText('Audit Trail')).toBeInTheDocument();
    expect(screen.getAllByText('Audit Entries').length).toBeGreaterThan(0);
    expect(screen.getByText('Successful Actions')).toBeInTheDocument();
    expect(screen.getByText('Failed Actions')).toBeInTheDocument();
    expect(screen.getByText('employee.create')).toBeInTheDocument();
    expect(screen.getByText('auth.login')).toBeInTheDocument();
    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    expect(await screen.findByText('Selected Audit Entry')).toBeInTheDocument();
    expect(await screen.findByText(/hash-audit-1/i)).toBeInTheDocument();
    expect(screen.getAllByText(/req-audit-1/i)).toHaveLength(2);
    expect(screen.getByText(/EMP-001/i)).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith('/reports/audit', {
      params: { date: expect.any(String) }
    });
    expect(client.get).toHaveBeenCalledWith('/reports/audit/audit-1');
  });

  it('applies audit filters', async () => {
    const user = userEvent.setup();

    client.get.mockResolvedValue({
      data: {
        total: 0,
        summary: { total: 0, successes: 0, failures: 0 },
        entries: []
      }
    });

    render(<AuditTrail />);
    await screen.findByText(/no audit entries match these filters/i);

    await user.type(screen.getByLabelText(/action/i), 'employee.create');
    await user.selectOptions(screen.getByLabelText(/outcome/i), 'success');
    await user.click(screen.getByRole('button', { name: /apply filters/i }));

    expect(client.get).toHaveBeenLastCalledWith('/reports/audit', {
      params: {
        date: expect.any(String),
        action: 'employee.create',
        outcome: 'success'
      }
    });
  });
});