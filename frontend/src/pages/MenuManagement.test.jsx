import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuManagement from './MenuManagement';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn()
}));

describe('MenuManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { username: 'admin-user', role: 'admin' } });
    window.confirm = vi.fn(() => true);
  });

  it('loads menu items and applies filters', async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString().split('T')[0];

    client.get
      .mockResolvedValueOnce({
        data: [
          {
            id: '1',
            name: 'Jollof Rice',
            description: 'Spicy rice',
            meal_type: 'lunch',
            price: 600,
            available_date: today,
            active: true
          }
        ]
      })
      .mockResolvedValueOnce({ data: [] });

    render(<MenuManagement />);

    expect(await screen.findByText('Jollof Rice')).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith('/menu-items', { params: { date: today } });

    await user.selectOptions(screen.getByRole('combobox', { name: /meal type/i }), 'breakfast');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(client.get).toHaveBeenLastCalledWith('/menu-items', {
        params: {
          date: today,
          meal_type: 'breakfast'
        }
      });
    });
  });

  it('creates a menu item from the modal', async () => {
    const user = userEvent.setup();

    client.get.mockResolvedValue({ data: [] });
    client.post.mockResolvedValue({ data: { id: '2' } });

    render(<MenuManagement />);

    expect(await screen.findByText(/no menu items available/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add menu item/i }));

    const modal = screen.getByText('Add Menu Item', { selector: '.modal-title' }).closest('.modal');

    await user.type(within(modal).getByRole('textbox', { name: /menu item name/i }), 'Rice and Beans');
    await user.type(within(modal).getByRole('textbox', { name: /description/i }), 'With stew');
    await user.selectOptions(within(modal).getByRole('combobox', { name: /meal type/i }), 'lunch');
    await user.clear(within(modal).getByRole('spinbutton', { name: /price/i }));
    await user.type(within(modal).getByRole('spinbutton', { name: /price/i }), '500');
    await user.clear(within(modal).getByLabelText(/available date/i));
    await user.type(within(modal).getByLabelText(/available date/i), '2026-04-28');

    await user.click(within(modal).getByRole('button', { name: /save menu item/i }));

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith('/menu-items', {
        name: 'Rice and Beans',
        description: 'With stew',
        meal_type: 'lunch',
        price: 500,
        available_date: '2026-04-28'
      });
    });
  });

  it('updates an existing menu item from the edit modal', async () => {
    const user = userEvent.setup();

    client.get.mockResolvedValue({
      data: [
        {
          id: '1',
          name: 'Jollof Rice',
          description: 'Classic',
          meal_type: 'lunch',
          price: 600,
          available_date: '2026-04-26',
          active: true
        }
      ]
    });
    client.put.mockResolvedValue({ data: { id: '1' } });

    render(<MenuManagement />);

    expect(await screen.findByText('Jollof Rice')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /edit/i }));

    const modal = screen.getByText('Edit Menu Item', { selector: '.modal-title' }).closest('.modal');

    const nameInput = within(modal).getByRole('textbox', { name: /menu item name/i });
    await user.clear(nameInput);
    await user.type(nameInput, 'Jollof Supreme');

    const priceInput = within(modal).getByRole('spinbutton', { name: /price/i });
    await user.clear(priceInput);
    await user.type(priceInput, '750');

    await user.selectOptions(within(modal).getByRole('combobox', { name: /status/i }), 'false');
    await user.click(within(modal).getByRole('button', { name: /update menu item/i }));

    await waitFor(() => {
      expect(client.put).toHaveBeenCalledWith('/menu-items/1', {
        name: 'Jollof Supreme',
        description: 'Classic',
        meal_type: 'lunch',
        price: 750,
        available_date: '2026-04-26',
        active: false
      });
    });
  });

  it('deletes a menu item after confirmation', async () => {
    const user = userEvent.setup();

    client.get.mockResolvedValue({
      data: [
        {
          id: '1',
          name: 'Yam and Egg',
          description: '',
          meal_type: 'breakfast',
          price: 400,
          available_date: '2026-04-26',
          active: true
        }
      ]
    });
    client.delete.mockResolvedValue({ data: { message: 'Deleted' } });

    render(<MenuManagement />);

    expect(await screen.findByText('Yam and Egg')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(window.confirm).toHaveBeenCalled();

    await waitFor(() => {
      expect(client.delete).toHaveBeenCalledWith('/menu-items/1');
    });
  });

  it('shows access denied state for non-admin users', async () => {
    useAuth.mockReturnValue({ user: { username: 'viewer-user', role: 'viewer' } });

    render(<MenuManagement />);

    expect(await screen.findByText(/menu item management is restricted to admin users/i)).toBeInTheDocument();
    expect(client.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /add menu item/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
