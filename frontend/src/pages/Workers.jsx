import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import WorkerQrModal from '../components/WorkerQrModal';

const MAX_WORKER_PHOTO_DATA_URL_LENGTH = 150000;

function createEmptyWorkerForm() {
  return {
    employee_number: '',
    name: '',
    department: '',
    badge_number: '',
    email: '',
    phone: '',
    photo_data_url: null,
    active: true
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not process the selected image.'));
    image.src = dataUrl;
  });
}

async function optimizeWorkerPhoto(file) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Select a PNG, JPEG, or WebP image.');
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);
  const maxDimension = 320;
  const scale = Math.min(maxDimension / image.width, maxDimension / image.height, 1);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image processing is not available in this browser.');
  }

  context.drawImage(image, 0, 0, width, height);

  let optimized = canvas.toDataURL('image/jpeg', 0.82);
  if (optimized.length > MAX_WORKER_PHOTO_DATA_URL_LENGTH) {
    optimized = canvas.toDataURL('image/jpeg', 0.7);
  }

  if (optimized.length > MAX_WORKER_PHOTO_DATA_URL_LENGTH) {
    throw new Error('The selected photo is too large even after optimization. Use a tighter headshot image.');
  }

  return optimized;
}

export default function Workers() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [qrWorker, setQrWorker] = useState(null);
  const [portalWorker, setPortalWorker] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalSaving, setPortalSaving] = useState(false);
  const [portalForm, setPortalForm] = useState({ username: '' });
  const [portalAccess, setPortalAccess] = useState(null);
  const [portalResult, setPortalResult] = useState(null);
  const [form, setForm] = useState(createEmptyWorkerForm);
  const [filterDept, setFilterDept] = useState('');
  const [filterActive, setFilterActive] = useState('true');
  const [photoProcessing, setPhotoProcessing] = useState(false);

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
    setForm(createEmptyWorkerForm());
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
      photo_data_url: worker.photo_data_url || null,
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

  async function handlePhotoSelected(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setPhotoProcessing(true);
    try {
      const optimizedPhoto = await optimizeWorkerPhoto(file);
      setForm((current) => ({ ...current, photo_data_url: optimizedPhoto }));
    } catch (err) {
      alert(err.message || 'Failed to process the worker photo');
    } finally {
      setPhotoProcessing(false);
      event.target.value = '';
    }
  }

  function clearSelectedPhoto() {
    setForm((current) => ({ ...current, photo_data_url: null }));
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

  function openQrModal(worker) {
    setQrWorker(worker);
  }

  async function openPortalModal(worker) {
    setPortalWorker(worker);
    setPortalLoading(true);
    setPortalResult(null);
    setPortalAccess(null);
    setPortalForm({ username: worker.employee_number || '' });

    try {
      const res = await client.get(`/employees/${worker.id}/portal-access`);
      setPortalAccess(res.data);
      setPortalForm({ username: res.data?.username || worker.employee_number || '' });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load worker portal access');
    } finally {
      setPortalLoading(false);
    }
  }

  function closePortalModal() {
    setPortalWorker(null);
    setPortalLoading(false);
    setPortalSaving(false);
    setPortalAccess(null);
    setPortalResult(null);
    setPortalForm({ username: '' });
  }

  async function handleProvisionPortalAccess() {
    if (!portalWorker) return;

    setPortalSaving(true);
    setPortalResult(null);
    try {
      const res = await client.post(`/employees/${portalWorker.id}/portal-access`, {
        username: portalForm.username
      });
      setPortalAccess({
        enabled: true,
        username: res.data.username,
        employee_number: res.data.employee_number,
        worker_name: res.data.worker_name
      });
      setPortalResult(res.data);
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to provision worker portal access');
    } finally {
      setPortalSaving(false);
    }
  }

  async function handleRevokePortalAccess() {
    if (!portalWorker) return;
    if (!window.confirm('Revoke this worker portal access?')) return;

    setPortalSaving(true);
    setPortalResult(null);
    try {
      await client.delete(`/employees/${portalWorker.id}/portal-access`);
      setPortalAccess({ enabled: false, username: portalWorker.employee_number });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to revoke worker portal access');
    } finally {
      setPortalSaving(false);
    }
  }

  return (
    <div className="pg-wrap">
      <div className="pg-header">
        <div className="pg-header-inner">
          <div>
            <h1 className="pg-title">Workers</h1>
            <p className="pg-subtitle">Manage employee records and assignments</p>
          </div>
          <button className="btn btn-primary" onClick={openAddModal}>+ Add Worker</button>
        </div>
      </div>
      <div className="pg-body">

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="form-row mb-3">
          <div className="form-group">
            <label htmlFor="workers-filter-department">Filter by Department</label>
            <input id="workers-filter-department" className="form-control" placeholder="All departments" value={filterDept} onChange={e => setFilterDept(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="workers-filter-status">Status</label>
            <select id="workers-filter-status" className="form-control" value={filterActive} onChange={e => setFilterActive(e.target.value)}>
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
                  <th>Portal Access</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workers.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-muted" style={{ padding: '20px' }}>No workers found</td></tr>
                ) : workers.map(w => (
                  <tr key={w.id}>
                    <td><code>{w.employee_number}</code></td>
                    <td><code>{w.badge_number}</code></td>
                    <td>
                      <div className="worker-name-cell">
                        {w.photo_data_url ? <img src={w.photo_data_url} alt={`Profile for ${w.name}`} className="worker-list-photo" /> : <div className="worker-list-photo placeholder">No Photo</div>}
                        <span>{w.name}</span>
                      </div>
                    </td>
                    <td>{w.department}</td>
                    <td><span className="badge badge-info">{w.meal_plan_name || 'None'}</span></td>
                    <td><span className="badge badge-secondary">Managed</span></td>
                    <td><span className={`badge ${w.active ? 'badge-success' : 'badge-danger'}`}>{w.active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-primary btn-sm" onClick={() => openQrModal(w)} disabled={!w.active}>QR Code</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => openPortalModal(w)}>Portal Access</button>
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
      </div>

      <WorkerQrModal
        open={Boolean(qrWorker)}
        worker={qrWorker}
        onClose={() => setQrWorker(null)}
      />

      {portalWorker && (
        <div className="modal-overlay" onClick={closePortalModal}>
          <div className="modal worker-portal-access-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Worker Portal Access</span>
              <button className="modal-close" onClick={closePortalModal} aria-label="Close worker portal access">×</button>
            </div>

            {portalLoading ? <div className="loading">Loading worker login details...</div> : (
              <>
                <div className="worker-portal-access-summary">
                  <p><strong>Worker:</strong> {portalWorker.name}</p>
                  <p><strong>Employee Number:</strong> {portalWorker.employee_number}</p>
                  <p><strong>Portal URL:</strong> Employees sign in and are routed into their self-service portal automatically.</p>
                </div>

                <div className={`alert ${portalAccess?.enabled ? 'alert-info' : 'alert-warning'}`}>
                  {portalAccess?.enabled
                    ? 'Portal access is active. Resetting access will issue a new temporary password.'
                    : 'Portal access is not active yet. Provision login details to let this worker sign in.'}
                </div>

                <div className="form-group">
                  <label htmlFor="portal-username">Username</label>
                  <input
                    id="portal-username"
                    className="form-control"
                    value={portalForm.username}
                    onChange={(event) => setPortalForm({ username: event.target.value })}
                  />
                  <div className="text-muted worker-portal-access-help">
                    Recommended default: use the worker&apos;s employee number so login is predictable.
                  </div>
                </div>

                {portalResult ? (
                  <div className="worker-portal-credentials-card">
                    <div><strong>Username:</strong> {portalResult.username}</div>
                    <div><strong>Temporary Password:</strong> {portalResult.temporary_password}</div>
                    <div className="text-muted worker-portal-access-help">
                      Share these credentials with the worker. If they lose them, use Reset Access to issue a new temporary password.
                    </div>
                  </div>
                ) : null}

                <div className="flex gap-2 mt-3">
                  <button type="button" className="btn btn-primary" onClick={handleProvisionPortalAccess} disabled={portalSaving || !portalForm.username.trim()}>
                    {portalSaving ? 'Saving...' : portalAccess?.enabled ? 'Reset Access' : 'Create Access'}
                  </button>
                  <button type="button" className="btn btn-danger" onClick={handleRevokePortalAccess} disabled={portalSaving || !portalAccess?.enabled}>
                    Revoke Access
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={closePortalModal}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editingWorker ? 'Edit Worker' : 'Add Worker'}</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="worker-employee-number">Employee Number</label>
                <input id="worker-employee-number" className="form-control" value={form.employee_number} onChange={e => setForm({...form, employee_number: e.target.value})} required disabled={!!editingWorker} />
              </div>
              <div className="form-group">
                <label htmlFor="worker-badge-number">Badge Number</label>
                <input id="worker-badge-number" className="form-control" value={form.badge_number} onChange={e => setForm({...form, badge_number: e.target.value})} required />
              </div>
              <div className="form-group">
                <label htmlFor="worker-full-name">Full Name</label>
                <input id="worker-full-name" className="form-control" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label htmlFor="worker-department">Department</label>
                <input id="worker-department" className="form-control" value={form.department} onChange={e => setForm({...form, department: e.target.value})} required />
              </div>
              <div className="form-group">
                <label htmlFor="worker-email">Email</label>
                <input id="worker-email" className="form-control" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
              </div>
              <div className="form-group">
                <label htmlFor="worker-phone">Phone</label>
                <input id="worker-phone" className="form-control" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
              </div>
              <div className="form-group">
                <label htmlFor="worker-photo">Worker Photo</label>
                <input
                  id="worker-photo"
                  className="form-control"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handlePhotoSelected}
                />
                <div className="text-muted" style={{ fontSize: '0.82rem', marginTop: '8px' }}>
                  Upload a clear headshot. The image is optimized automatically for vendor-side identity checks and self-service profile display.
                </div>
                <div className="worker-photo-preview-card">
                  {form.photo_data_url ? <img src={form.photo_data_url} alt="Worker preview" className="worker-photo-preview" /> : <div className="worker-photo-preview placeholder">No photo uploaded</div>}
                  <div className="worker-photo-preview-actions">
                    <span className="text-muted">{photoProcessing ? 'Optimizing selected image...' : 'Use a recent, front-facing photo for faster vendor verification.'}</span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={clearSelectedPhoto} disabled={!form.photo_data_url || photoProcessing}>
                      Remove Photo
                    </button>
                  </div>
                </div>
              </div>
              {editingWorker && (
                <div className="form-group">
                  <label htmlFor="worker-edit-status">Status</label>
                  <select id="worker-edit-status" className="form-control" value={String(form.active)} onChange={e => setForm({...form, active: e.target.value === 'true'})}>
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
