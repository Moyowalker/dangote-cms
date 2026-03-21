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
  tbody.textContent = '';
  if (employees.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.style.cssText = 'text-align:center; padding: 20px; color: #666;';
    td.textContent = 'No employees found';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  employees.forEach(e => {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = e.name;
    tr.appendChild(nameTd);

    const empNumTd = document.createElement('td');
    empNumTd.textContent = e.employee_number;
    tr.appendChild(empNumTd);

    const deptTd = document.createElement('td');
    deptTd.textContent = e.department;
    tr.appendChild(deptTd);

    const emailTd = document.createElement('td');
    emailTd.textContent = e.email || '-';
    tr.appendChild(emailTd);

    const badgeTd = document.createElement('td');
    badgeTd.textContent = e.badge_number;
    tr.appendChild(badgeTd);

    const statusTd = document.createElement('td');
    const statusSpan = document.createElement('span');
    statusSpan.className = `badge ${e.active ? 'badge-success' : 'badge-danger'}`;
    statusSpan.textContent = e.active ? 'Active' : 'Inactive';
    statusTd.appendChild(statusSpan);
    tr.appendChild(statusTd);

    const actionsTd = document.createElement('td');
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-primary btn-sm';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditModal(e));
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger btn-sm';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteEmployee(e.id));
    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(deleteBtn);
    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  });
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
