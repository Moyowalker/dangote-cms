import React, { useCallback, useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ADMIN_ROLE } from '../auth/roles';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function createInitialFilters() {
  return {
    date: getTodayDate(),
    mealType: ''
  };
}

function createEmptyForm(availableDate = getTodayDate()) {
  return {
    name: '',
    description: '',
    meal_type: 'lunch',
    price: '0',
    available_date: availableDate,
    active: 'true'
  };
}

function normalizeMenuItem(item) {
  return {
    id: item.id || item._id,
    name: item.name || '',
    description: item.description || '',
    meal_type: item.meal_type || '',
    price: Number(item.price || 0),
    available_date: item.available_date || '',
    active: item.active !== false
  };
}

function summarizeMenuItems(items) {
  const summary = {
    total: items.length,
    active: 0,
    inactive: 0,
    breakfast: 0,
    lunch: 0,
    dinner: 0
  };

  items.forEach((item) => {
    if (item.active) {
      summary.active += 1;
    } else {
      summary.inactive += 1;
    }

    if (MEAL_TYPES.includes(item.meal_type)) {
      summary[item.meal_type] += 1;
    }
  });

  return summary;
}

export default function MenuManagement() {
  const { user } = useAuth();
  const canManage = user?.role === ADMIN_ROLE;

  const [filters, setFilters] = useState(createInitialFilters);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(createEmptyForm);
  const [saving, setSaving] = useState(false);

  const summary = useMemo(() => summarizeMenuItems(menuItems), [menuItems]);

  const fetchMenuItems = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      setError('');
      setMenuItems([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = {};
      if (filters.date) {
        params.date = filters.date;
      }
      if (filters.mealType) {
        params.meal_type = filters.mealType;
      }

      const res = await client.get('/menu-items', { params });
      const normalized = Array.isArray(res.data) ? res.data.map(normalizeMenuItem) : [];
      setMenuItems(normalized);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load menu items');
      setMenuItems([]);
    } finally {
      setLoading(false);
    }
  }, [canManage, filters]);

  useEffect(() => {
    fetchMenuItems();
  }, [fetchMenuItems]);

  function openAddModal() {
    setEditingItem(null);
    setForm(createEmptyForm(filters.date || getTodayDate()));
    setShowModal(true);
    setError('');
    setSuccess('');
  }

  function openEditModal(item) {
    setEditingItem(item);
    setForm({
      name: item.name,
      description: item.description || '',
      meal_type: item.meal_type || 'lunch',
      price: String(item.price ?? 0),
      available_date: item.available_date || getTodayDate(),
      active: item.active ? 'true' : 'false'
    });
    setShowModal(true);
    setError('');
    setSuccess('');
  }

  function closeModal() {
    setShowModal(false);
    setEditingItem(null);
    setForm(createEmptyForm(filters.date || getTodayDate()));
  }

  function handleFilterChange(event) {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handleResetFilters() {
    setFilters(createInitialFilters());
    setSuccess('');
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canManage) {
      setError('Your role can view menu items but cannot modify them.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      meal_type: form.meal_type,
      price: Number(form.price || 0),
      available_date: form.available_date
    };

    try {
      if (editingItem) {
        await client.put(`/menu-items/${editingItem.id}`, {
          ...payload,
          active: form.active === 'true'
        });
        setSuccess('Menu item updated successfully.');
      } else {
        await client.post('/menu-items', payload);
        setSuccess('Menu item added successfully.');
      }

      closeModal();
      await fetchMenuItems();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save menu item');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!canManage) {
      return;
    }

    if (!window.confirm(`Delete menu item "${item.name}"?`)) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      await client.delete(`/menu-items/${item.id}`);
      setSuccess('Menu item deleted successfully.');
      await fetchMenuItems();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete menu item');
    }
  }

  return (
    <div className="pg-wrap">
      <div className="pg-header">
        <div className="pg-header-inner">
          <div>
            <h1 className="pg-title">Menu Management</h1>
            <p className="pg-subtitle">Manage daily canteen menu items by date and meal type</p>
          </div>
          {canManage ? (
            <button className="btn" onClick={openAddModal}>+ Add Menu Item</button>
          ) : null}
        </div>
      </div>

      <div className="pg-body">
        {!canManage ? (
          <div className="alert alert-error">
            Menu item management is restricted to admin users.
          </div>
        ) : null}

        {!canManage ? null : (
          <>

            {error ? <div className="alert alert-error">{error}</div> : null}
            {success ? <div className="alert alert-success">{success}</div> : null}

            <div className="card">
              <div className="card-title">Filter Menu Items</div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  fetchMenuItems();
                }}
              >
                <div className="filter-grid">
                  <div className="form-group">
                    <label htmlFor="menu-date">Date</label>
                    <input
                      id="menu-date"
                      name="date"
                      type="date"
                      className="form-control"
                      value={filters.date}
                      onChange={handleFilterChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="menu-meal-type">Meal Type</label>
                    <select
                      id="menu-meal-type"
                      name="mealType"
                      className="form-control"
                      value={filters.mealType}
                      onChange={handleFilterChange}
                    >
                      <option value="">All meal types</option>
                      {MEAL_TYPES.map((type) => (
                        <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="filters-actions">
                  <button type="submit" className="btn btn-primary">Apply</button>
                  <button type="button" className="btn btn-secondary" onClick={handleResetFilters}>Reset</button>
                </div>
              </form>
            </div>

            <div className="stats-grid menu-stat-grid">
          <div className="stat-card">
            <div className="stat-value">{summary.total}</div>
            <div className="stat-label">Items</div>
          </div>
          <div className="stat-card info">
            <div className="stat-value">{summary.breakfast}</div>
            <div className="stat-label">Breakfast</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.lunch}</div>
            <div className="stat-label">Lunch</div>
          </div>
          <div className="stat-card warning">
            <div className="stat-value">{summary.dinner}</div>
            <div className="stat-label">Dinner</div>
          </div>
          <div className="stat-card danger">
            <div className="stat-value">{summary.inactive}</div>
            <div className="stat-label">Inactive</div>
          </div>
            </div>

            <div className="card">
              <div className="card-title">Menu Items</div>
              {loading ? (
                <div className="loading">Loading menu items...</div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Meal Type</th>
                        <th>Price</th>
                        <th>Available Date</th>
                        <th>Status</th>
                        {canManage ? <th>Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {menuItems.length === 0 ? (
                        <tr>
                          <td colSpan={canManage ? 7 : 6} className="text-center text-muted" style={{ padding: '20px' }}>
                            No menu items available for this filter.
                          </td>
                        </tr>
                      ) : menuItems.map((item) => (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td>{item.description || '-'}</td>
                          <td><span className="badge badge-info">{item.meal_type}</span></td>
                          <td>{Number(item.price || 0).toLocaleString()}</td>
                          <td>{item.available_date}</td>
                          <td>
                            <span className={`badge ${item.active ? 'badge-success' : 'badge-warning'}`}>
                              {item.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          {canManage ? (
                            <td>
                              <div className="menu-actions">
                                <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(item)}>Edit</button>
                                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(item)}>Delete</button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showModal ? (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editingItem ? 'Edit Menu Item' : 'Add Menu Item'}</h2>
              <button className="modal-close" onClick={closeModal} aria-label="Close modal">×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="menu-item-name">Menu Item Name</label>
                <input
                  id="menu-item-name"
                  name="name"
                  className="form-control"
                  value={form.name}
                  onChange={handleFormChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="menu-item-description">Description</label>
                <textarea
                  id="menu-item-description"
                  name="description"
                  className="form-control"
                  value={form.description}
                  onChange={handleFormChange}
                  rows={3}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="menu-item-meal-type">Meal Type</label>
                  <select
                    id="menu-item-meal-type"
                    name="meal_type"
                    className="form-control"
                    value={form.meal_type}
                    onChange={handleFormChange}
                  >
                    {MEAL_TYPES.map((type) => (
                      <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="menu-item-price">Price</label>
                  <input
                    id="menu-item-price"
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control"
                    value={form.price}
                    onChange={handleFormChange}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="menu-item-date">Available Date</label>
                  <input
                    id="menu-item-date"
                    name="available_date"
                    type="date"
                    className="form-control"
                    value={form.available_date}
                    onChange={handleFormChange}
                    required
                  />
                </div>

                {editingItem ? (
                  <div className="form-group">
                    <label htmlFor="menu-item-status">Status</label>
                    <select
                      id="menu-item-status"
                      name="active"
                      className="form-control"
                      value={form.active}
                      onChange={handleFormChange}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>
                ) : null}
              </div>

              <div className="menu-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingItem ? 'Update Menu Item' : 'Save Menu Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
