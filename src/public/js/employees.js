let currentEmployeeId = null;

async function loadEmployees(search = '') {
  const url = search ? `/employees?search=${encodeURIComponent(search)}` : '/employees';
  const res = await apiFetch(url);
  if (!res || !res.ok) return;
  const employees = await res.json();
  renderEmployees(employees);
}

function renderEmployees(employees) {
  const tbody = document.getElementById('employees-table');
  if (employees.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: #666;">No employees found</td></tr>';
    return;
  }
  tbody.innerHTML = employees.map(e => `
    <tr>
      <td>${e.name}</td>
      <td>${e.employee_number}</td>
      <td>${e.department}</td>
      <td>${e.email || '-'}</td>
      <td>${e.badge_number}</td>
      <td><span class="badge ${e.active ? 'badge-success' : 'badge-danger'}">${e.active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="openEditModal(${JSON.stringify(e).replace(/"/g, '&quot;')})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteEmployee(${e.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function loadMealPlansForSelect() {
  const res = await apiFetch('/meal-plans');
  if (!res || !res.ok) return;
  const plans = await res.json();
  const select = document.getElementById('emp-meal-plan');
  const currentVal = select.value;
  select.innerHTML = '<option value="">-- No Meal Plan --</option>' +
    plans.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  if (currentVal) select.value = currentVal;
}

function openAddModal() {
  currentEmployeeId = null;
  document.getElementById('modal-title').textContent = 'Add Employee';
  document.getElementById('employee-form').reset();
  document.getElementById('employee-id').value = '';
  loadMealPlansForSelect();
  document.getElementById('employee-modal').classList.add('active');
}

function openEditModal(employee) {
  currentEmployeeId = employee.id;
  document.getElementById('modal-title').textContent = 'Edit Employee';
  document.getElementById('employee-id').value = employee.id;
  document.getElementById('emp-number').value = employee.employee_number;
  document.getElementById('emp-name').value = employee.name;
  document.getElementById('emp-department').value = employee.department;
  document.getElementById('emp-email').value = employee.email || '';
  document.getElementById('emp-phone').value = employee.phone || '';
  document.getElementById('emp-badge').value = employee.badge_number;
  loadMealPlansForSelect().then(() => {
    if (employee.meal_plan_id) {
      document.getElementById('emp-meal-plan').value = employee.meal_plan_id;
    }
  });
  document.getElementById('employee-modal').classList.add('active');
}

function closeModal() {
  document.getElementById('employee-modal').classList.remove('active');
}

async function deleteEmployee(id) {
  if (!confirm('Are you sure you want to delete this employee?')) return;
  const res = await apiFetch(`/employees/${id}`, { method: 'DELETE' });
  if (!res) return;
  if (res.ok) {
    showToast('Employee deleted successfully', 'success');
    loadEmployees();
  } else {
    const data = await res.json();
    showToast(data.error || 'Failed to delete employee', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadEmployees();

  document.getElementById('employee-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('employee-id').value;
    const payload = {
      employee_number: document.getElementById('emp-number').value,
      name: document.getElementById('emp-name').value,
      department: document.getElementById('emp-department').value,
      email: document.getElementById('emp-email').value || null,
      phone: document.getElementById('emp-phone').value || null,
      badge_number: document.getElementById('emp-badge').value,
      meal_plan_id: document.getElementById('emp-meal-plan').value || null
    };

    const url = id ? `/employees/${id}` : '/employees';
    const method = id ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
    if (!res) return;
    const data = await res.json();
    if (res.ok) {
      showToast(`Employee ${id ? 'updated' : 'created'} successfully`, 'success');
      closeModal();
      loadEmployees();
    } else {
      showToast(data.error || 'Operation failed', 'error');
    }
  });

  document.getElementById('search-input').addEventListener('input', (e) => {
    loadEmployees(e.target.value);
  });
});
