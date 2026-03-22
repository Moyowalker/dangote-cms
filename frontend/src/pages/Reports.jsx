import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

function buildInitialFilters() {
  return {
    date: new Date().toISOString().split('T')[0],
    startDate: '',
    endDate: '',
    vendor: '',
    status: '',
    workerCategoryId: '',
    failureReason: ''
  };
}

function buildDailyReportParams(filters) {
  const params = {};

  if (filters.startDate || filters.endDate) {
    if (filters.startDate) params.start_date = filters.startDate;
    if (filters.endDate) params.end_date = filters.endDate;
  } else {
    params.date = filters.date;
  }

  if (filters.vendor) params.vendor = filters.vendor;
  if (filters.status) params.status = filters.status;
  if (filters.workerCategoryId) params.worker_category_id = filters.workerCategoryId;

  return params;
}

function badgeClassForStatus(status) {
  if (status === 'used') {
    return 'badge-success';
  }

  if (status === 'voided') {
    return 'badge-warning';
  }

  return 'badge-secondary';
}

export default function Reports() {
  const [filters, setFilters] = useState(buildInitialFilters);
  const [appliedFilters, setAppliedFilters] = useState(buildInitialFilters);
  const [dailyData, setDailyData] = useState(null);
  const [failureData, setFailureData] = useState(null);
  const [departmentData, setDepartmentData] = useState([]);
  const [workerCategories, setWorkerCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasExtendedFilters = Boolean(
    appliedFilters.startDate
      || appliedFilters.endDate
      || appliedFilters.vendor
      || appliedFilters.status
      || appliedFilters.workerCategoryId
  );
  const canShowDepartmentBreakdown = !hasExtendedFilters;

  const fetchDaily = useCallback(async () => {
    setLoading(true);
    setError('');

    const dailyParams = buildDailyReportParams(appliedFilters);
    const failureParams = {
      ...dailyParams,
      ...(appliedFilters.failureReason ? { reason: appliedFilters.failureReason } : {})
    };

    try {
      const requests = [
        client.get('/reports/daily', { params: dailyParams }),
        client.get('/reports/failures', { params: failureParams })
      ];

      if (canShowDepartmentBreakdown) {
        requests.push(client.get('/reports/department', { params: { date: appliedFilters.date } }));
      }

      const [dailyRes, failureRes, deptRes] = await Promise.all(requests);
      setDailyData(dailyRes.data);
      setFailureData(failureRes.data);
      setDepartmentData(canShowDepartmentBreakdown && Array.isArray(deptRes?.data) ? deptRes.data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load reports');
      setDailyData(null);
      setFailureData(null);
      setDepartmentData([]);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, canShowDepartmentBreakdown]);

  useEffect(() => { fetchDaily(); }, [fetchDaily]);

  useEffect(() => {
    let cancelled = false;

    async function fetchWorkerCategories() {
      try {
        const res = await client.get('/entitlements/worker-categories');
        if (!cancelled) {
          setWorkerCategories(res.data || []);
        }
      } catch {
        if (!cancelled) {
          setWorkerCategories([]);
        }
      }
    }

    fetchWorkerCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  function getMealCount(mealType) {
    if (!dailyData?.summary) return 0;
    const entry = dailyData.summary.find(c => c.meal_type === mealType);
    return entry?.count || 0;
  }

  function handleFilterChange(event) {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handleApplyFilters(event) {
    event.preventDefault();
    setAppliedFilters({
      ...filters,
      vendor: filters.vendor.trim()
    });
  }

  function handleResetFilters() {
    const initial = buildInitialFilters();
    setFilters(initial);
    setAppliedFilters(initial);
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Reports</h1>

      <div className="card">
        <div className="card-title">Report Filters</div>
        <form onSubmit={handleApplyFilters}>
          <div className="filter-grid">
            <div className="form-group">
              <label htmlFor="reports-date">Single Date</label>
              <input
                id="reports-date"
                name="date"
                type="date"
                className="form-control"
                value={filters.date}
                onChange={handleFilterChange}
                disabled={Boolean(filters.startDate || filters.endDate)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="reports-start-date">Start Date</label>
              <input
                id="reports-start-date"
                name="startDate"
                type="date"
                className="form-control"
                value={filters.startDate}
                onChange={handleFilterChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="reports-end-date">End Date</label>
              <input
                id="reports-end-date"
                name="endDate"
                type="date"
                className="form-control"
                value={filters.endDate}
                onChange={handleFilterChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="reports-vendor">Vendor Location</label>
              <input
                id="reports-vendor"
                name="vendor"
                className="form-control"
                placeholder="Main Canteen"
                value={filters.vendor}
                onChange={handleFilterChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="reports-status">Status</label>
              <select
                id="reports-status"
                name="status"
                className="form-control"
                value={filters.status}
                onChange={handleFilterChange}
              >
                <option value="">All statuses</option>
                <option value="used">Used</option>
                <option value="voided">Voided</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="reports-worker-category">Worker Category</label>
              <select
                id="reports-worker-category"
                name="workerCategoryId"
                className="form-control"
                value={filters.workerCategoryId}
                onChange={handleFilterChange}
              >
                <option value="">All categories</option>
                {workerCategories.map((category, index) => (
                  <option key={category._id || category.id || category.code || `${category.name || 'category'}-${index}`} value={category._id || category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="reports-failure-reason">Failure Reason</label>
              <input
                id="reports-failure-reason"
                name="failureReason"
                className="form-control"
                placeholder="duplicate, not found, restriction..."
                value={filters.failureReason}
                onChange={handleFilterChange}
              />
            </div>
          </div>

          <div className="filters-actions">
            <button type="submit" className="btn btn-primary">Apply Filters</button>
            <button type="button" className="btn btn-secondary" onClick={handleResetFilters}>Reset</button>
          </div>
        </form>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {dailyData && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{dailyData.total || 0}</div>
            <div className="stat-label">Total Meals</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#007bff' }}>
            <div className="stat-value" style={{ color: '#007bff' }}>{getMealCount('breakfast')}</div>
            <div className="stat-label">Breakfast</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#28a745' }}>
            <div className="stat-value" style={{ color: '#28a745' }}>{getMealCount('lunch')}</div>
            <div className="stat-label">Lunch</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#ffc107' }}>
            <div className="stat-value" style={{ color: '#ffc107' }}>{getMealCount('dinner')}</div>
            <div className="stat-label">Dinner</div>
          </div>
          <div className="stat-card danger">
            <div className="stat-value">{failureData?.total || 0}</div>
            <div className="stat-label">Failed Attempts</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex-between mb-3">
          <div className="card-title">Daily Report</div>
          <span className="report-meta">
            {appliedFilters.startDate || appliedFilters.endDate
              ? `Range: ${appliedFilters.startDate || '...'} to ${appliedFilters.endDate || '...'}`
              : `Date: ${appliedFilters.date}`}
          </span>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : dailyData ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Meal Type</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {['breakfast', 'lunch', 'dinner'].map(meal => {
                  return (
                    <tr key={meal}>
                      <td><span className="badge badge-info" style={{ textTransform: 'capitalize' }}>{meal}</span></td>
                      <td>{getMealCount(meal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-title">Transaction Details</div>
        {dailyData?.details?.some((record) => record.has_transaction_link === false) && (
          <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
            Some confirmed consumptions do not have a linked transaction reference yet. Treat those rows as reconciliation follow-up items.
          </div>
        )}
        {loading ? (
          <div className="loading">Loading details...</div>
        ) : dailyData ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Employee Number</th>
                  <th>Department</th>
                  <th>Location</th>
                  <th>Meal Type</th>
                  <th>Status</th>
                  <th>Transaction Ref</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {dailyData.details?.length ? dailyData.details.map((record) => (
                  <tr key={record.id}>
                    <td>{record.employee_name || 'Unknown worker'}</td>
                    <td>{record.employee_number || '-'}</td>
                    <td>{record.department || '-'}</td>
                    <td>{record.canteen_location || '-'}</td>
                    <td><span className="badge badge-info" style={{ textTransform: 'capitalize' }}>{record.meal_type}</span></td>
                    <td><span className={`badge ${badgeClassForStatus(record.status)}`}>{record.status || 'unknown'}</span></td>
                    <td>{record.transaction_reference || 'Missing link'}</td>
                    <td>{record.consumption_date || '-'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={8} className="text-center text-muted" style={{ padding: '20px' }}>No transaction details match these filters</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-title">Failure Summary</div>
        {loading ? (
          <div className="loading">Loading failure summary...</div>
        ) : failureData ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Failure Reason</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {failureData.summary?.length ? failureData.summary.map((entry) => (
                  <tr key={entry.reason}>
                    <td>{entry.reason}</td>
                    <td>{entry.count}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={2} className="text-center text-muted" style={{ padding: '20px' }}>No failure attempts match these filters</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-title">Failure Attempts</div>
        {loading ? (
          <div className="loading">Loading failure attempts...</div>
        ) : failureData ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Reason</th>
                  <th>Badge Number</th>
                  <th>Location</th>
                  <th>Meal Type</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {failureData.details?.length ? failureData.details.map((record) => (
                  <tr key={record.id}>
                    <td>{record.reason}</td>
                    <td>{record.badge_number || '-'}</td>
                    <td>{record.canteen_location || '-'}</td>
                    <td>{record.meal_type || '-'}</td>
                    <td>{record.date || '-'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="text-center text-muted" style={{ padding: '20px' }}>No failure attempts match these filters</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-title">Department Breakdown</div>
        {!canShowDepartmentBreakdown ? (
          <div className="alert alert-info">
            Department breakdown is only shown for the single-day unfiltered view because the backend department endpoint does not yet support vendor, status, category, or date-range filters.
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Meal Type</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {departmentData.length === 0 ? (
                  <tr><td colSpan={3} className="text-center text-muted" style={{ padding: '20px' }}>No department data</td></tr>
                ) : departmentData.map((d, idx) => (
                  <tr key={`${d.department}-${d.meal_type}-${idx}`}>
                    <td>{d.department}</td>
                    <td style={{ textTransform: 'capitalize' }}>{d.meal_type}</td>
                    <td>{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
