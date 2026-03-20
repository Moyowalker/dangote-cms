function switchReportTab(tab, e) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  e.target.classList.add('active');
  if (tab === 'employee') loadEmployeeList();
}

async function loadDailyReport() {
  const date = document.getElementById('daily-date').value || new Date().toISOString().split('T')[0];
  const res = await apiFetch(`/reports/daily?date=${date}`);
  if (!res || !res.ok) return;
  const data = await res.json();

  const summaryDiv = document.getElementById('daily-summary');
  summaryDiv.innerHTML = data.summary.map(s => `
    <div class="stat-card">
      <h3>${s.count}</h3>
      <p>${s.meal_type.charAt(0).toUpperCase() + s.meal_type.slice(1)}</p>
    </div>
  `).join('') + `
    <div class="stat-card">
      <h3>${data.total}</h3>
      <p>Total Meals</p>
    </div>
  `;

  const tbody = document.getElementById('daily-table');
  if (data.details.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: #666;">No records for this date</td></tr>';
    return;
  }
  tbody.innerHTML = data.details.map(r => `
    <tr>
      <td>${r.employee_name}</td>
      <td>${r.employee_number}</td>
      <td>${r.department}</td>
      <td><span class="badge badge-success">${r.meal_type}</span></td>
      <td>${new Date(r.consumed_at).toLocaleTimeString()}</td>
    </tr>
  `).join('');
}

async function loadDepartmentReport() {
  const date = document.getElementById('dept-date').value;
  const month = document.getElementById('dept-month').value;
  let url = '/reports/department';
  if (date) url += `?date=${date}`;
  else if (month) url += `?month=${month}`;

  const res = await apiFetch(url);
  if (!res || !res.ok) return;
  const data = await res.json();
  const tbody = document.getElementById('dept-table');
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px; color: #666;">No data found</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(r => `
    <tr>
      <td>${r.department}</td>
      <td><span class="badge badge-warning">${r.meal_type}</span></td>
      <td><strong>${r.count}</strong></td>
    </tr>
  `).join('');
}

async function loadEmployeeList() {
  const res = await apiFetch('/employees');
  if (!res || !res.ok) return;
  const employees = await res.json();
  const select = document.getElementById('emp-select');
  select.innerHTML = '<option value="">-- Select Employee --</option>' +
    employees.map(e => `<option value="${e.id}">${e.name} (${e.employee_number})</option>`).join('');
}

async function loadEmployeeHistory() {
  const id = document.getElementById('emp-select').value;
  if (!id) {
    showToast('Please select an employee', 'error');
    return;
  }
  const res = await apiFetch(`/reports/employee/${id}`);
  if (!res || !res.ok) return;
  const data = await res.json();

  document.getElementById('emp-summary').innerHTML = `
    <div style="background: var(--white); padding: 15px; border-radius: 8px; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
      <strong>${data.employee.name}</strong> | ${data.employee.department} | Total meals: <strong>${data.total}</strong>
    </div>
  `;

  const tbody = document.getElementById('emp-table');
  if (data.records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color: #666;">No records found</td></tr>';
    return;
  }
  tbody.innerHTML = data.records.map(r => `
    <tr>
      <td>${r.consumption_date}</td>
      <td><span class="badge badge-success">${r.meal_type}</span></td>
      <td>${r.canteen_location}</td>
      <td>${new Date(r.consumed_at).toLocaleTimeString()}</td>
    </tr>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('daily-date').value = new Date().toISOString().split('T')[0];
  loadDailyReport();
});
