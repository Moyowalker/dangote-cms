import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

export default function Workers() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [form, setForm] = useState({ employee_number: '', name: '', department: '', badge_number: '', email: '', phone: '', active: true });
  const [filterDept, setFilterDept] = useState('');
  const [filterActive, setFilterActive] = useState('true');

  const fetchWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterDept) params.search = filterDept;
      if (filterDept) params.department = filterDept;
      const res = await client.get('/employees', { params });
      const normalized = (res.data || []).filter((w) => {
        if (filterActive === '') return true;
        return filterActive === 'true' ? w.active : !w.active;
      });
      setWorkers(normalized);
    } catch (err) {
      setError('Failed to load workers');
    } finally {
      setLoading(false);
    }
  }, [filterDept, filterActive]);

  useEffect(() => { fetchWorkers(); }, [fetchWorkers]);

  function openAddModal() {
    setEditingWorker(null);
    setForm({ employee_number: '', name: '', department: '', badge_number: '', email: '', phone: '', active: true });
    setShowModal(true);
  }

  function openEditModal(worker) {
    setEditingWorker(worker);
    setForm({
      employee_number: worker.employee_number,
      name: worker.name,
      department: worker.department,
      badge_number: worker.badge_number,
      email: worker.email || '',
      phone: worker.phone || '',
      active: !!worker.active
    });
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingWorker) {
        await client.put(`/employees/${editingWorker.id}`, form);
      } else {
        await client.post('/employees', form);
      }
      setShowModal(false);
      fetchWorkers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save worker');
    }
  }

  async function handleDeactivate(id) {
    if (!window.confirm('Delete this worker?')) return;
    try {
      await client.delete(`/employees/${id}`);
      fetchWorkers();
    } catch (err) {
      alert('Failed to delete worker');
    }
  }

  return (
    <div className="page-container">
      <div className="flex-between mb-3">
        <h1 className="page-title">Workers</h1>
        <button className="btn btn-primary" onClick={openAddModal}>+ Add Worker</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="form-row mb-3">
          <div className="form-group">
            <label>Filter by Department</label>
            <input className="form-control" placeholder="All departments" value={filterDept} onChange={e => setFilterDept(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="form-control" value={filterActive} onChange={e => setFilterActive(e.target.value)}>
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading workers...</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Employee Number</th>
                  <th>Badge Number</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Meal Plan</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workers.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-muted" style={{ padding: '20px' }}>No workers found</td></tr>
                ) : workers.map(w => (
                  <tr key={w.id}>
                    <td><code>{w.employee_number}</code></td>
                    <td><code>{w.badge_number}</code></td>
                    <td>{w.name}</td>
                    <td>{w.department}</td>
                    <td><span className="badge badge-info">{w.meal_plan_name || 'None'}</span></td>
                    <td><span className={`badge ${w.active ? 'badge-success' : 'badge-danger'}`}>{w.active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(w)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(w.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editingWorker ? 'Edit Worker' : 'Add Worker'}</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Employee Number</label>
                <input className="form-control" value={form.employee_number} onChange={e => setForm({...form, employee_number: e.target.value})} required disabled={!!editingWorker} />
              </div>
              <div className="form-group">
                <label>Badge Number</label>
                <input className="form-control" value={form.badge_number} onChange={e => setForm({...form, badge_number: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Full Name</label>
                <input className="form-control" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Department</label>
                <input className="form-control" value={form.department} onChange={e => setForm({...form, department: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input className="form-control" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input className="form-control" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
              </div>
              {editingWorker && (
                <div className="form-group">
                  <label>Status</label>
                  <select className="form-control" value={String(form.active)} onChange={e => setForm({...form, active: e.target.value === 'true'})}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              )}
              <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: '8px' }}>
                Meal plan assignment remains in admin meal-plan management.
              </div>
              <div className="flex gap-2 mt-3">
                <button type="submit" className="btn btn-primary">{editingWorker ? 'Update' : 'Add Worker'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
