import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Workers from './Workers';
import client from '../api/client';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

describe('Workers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
  });

  it('loads and filters workers by active status', async () => {
    const user = userEvent.setup();

    client.get.mockResolvedValueOnce({
      data: [
        { id: '1', employee_number: 'EMP-001', badge_number: 'BG-001', name: 'Ada Worker', department: 'Ops', active: true },
        { id: '2', employee_number: 'EMP-002', badge_number: 'BG-002', name: 'Tunde Worker', department: 'Ops', active: false }
      ]
    }).mockResolvedValueOnce({
      data: [
        { id: '1', employee_number: 'EMP-001', badge_number: 'BG-001', name: 'Ada Worker', department: 'Ops', active: true },
        { id: '2', employee_number: 'EMP-002', badge_number: 'BG-002', name: 'Tunde Worker', department: 'Ops', active: false }
      ]
    });

    render(<Workers />);

    expect(await screen.findByText('Ada Worker')).toBeInTheDocument();
    expect(screen.queryByText('Tunde Worker')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: /status/i }), '');

    expect(await screen.findByText('Tunde Worker')).toBeInTheDocument();
  });

  it('creates a worker from the add modal', async () => {
    const user = userEvent.setup();

    client.get.mockResolvedValue({ data: [] });
    client.post.mockResolvedValue({ data: { id: '3' } });

    render(<Workers />);

    await screen.findByText(/no workers found/i);
    await user.click(screen.getByRole('button', { name: /add worker/i }));

    const modal = screen.getByText('Add Worker', { selector: '.modal-title' }).closest('.modal');

    await user.type(within(modal).getByRole('textbox', { name: /employee number/i }), 'EMP-003');
    await user.type(within(modal).getByRole('textbox', { name: /badge number/i }), 'BG-003');
    await user.type(within(modal).getByRole('textbox', { name: /full name/i }), 'Kemi Worker');
    await user.type(within(modal).getByRole('textbox', { name: /department/i }), 'Finance');
    await user.click(within(modal).getByRole('button', { name: /^add worker$/i }));

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith('/employees', expect.objectContaining({
        employee_number: 'EMP-003',
        badge_number: 'BG-003',
        name: 'Kemi Worker',
        department: 'Finance'
      }));
    });
  });

  it('updates an existing worker from the edit modal', async () => {
    const user = userEvent.setup();

    client.get.mockResolvedValue({
      data: [
        { id: '1', employee_number: 'EMP-001', badge_number: 'BG-001', name: 'Ada Worker', department: 'Ops', active: true }
      ]
    });
    client.put.mockResolvedValue({ data: { id: '1' } });

    render(<Workers />);

    expect(await screen.findByText('Ada Worker')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /edit/i }));

    const modal = screen.getByText('Edit Worker', { selector: '.modal-title' }).closest('.modal');

    const departmentInput = within(modal).getByRole('textbox', { name: /department/i });
    await user.clear(departmentInput);
    await user.type(departmentInput, 'Operations');
    await user.selectOptions(within(modal).getByRole('combobox', { name: /status/i }), 'false');
    await user.click(within(modal).getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(client.put).toHaveBeenCalledWith('/employees/1', expect.objectContaining({
        department: 'Operations',
        active: false
      }));
    });
  });

  it('deletes a worker after confirmation', async () => {
    const user = userEvent.setup();

    client.get.mockResolvedValue({
      data: [
        { id: '1', employee_number: 'EMP-001', badge_number: 'BG-001', name: 'Ada Worker', department: 'Ops', active: true }
      ]
    });
    client.delete.mockResolvedValue({ data: { success: true } });

    render(<Workers />);

    expect(await screen.findByText('Ada Worker')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(window.confirm).toHaveBeenCalled();

    await waitFor(() => {
      expect(client.delete).toHaveBeenCalledWith('/employees/1');
    });
  });
});