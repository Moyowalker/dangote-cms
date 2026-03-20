let validatedEmployee = null;
let validatedMealType = null;

async function validateBadge() {
  const badge = document.getElementById('badge-input').value.trim();
  const mealType = document.getElementById('meal-type-select').value;
  if (!badge) {
    showToast('Please enter a badge number', 'error');
    return;
  }
  const res = await apiFetch(`/tickets/validate/${encodeURIComponent(badge)}?meal_type=${mealType}`);
  if (!res) return;
  const data = await res.json();
  if (!res.ok) {
    showToast(data.error || 'Employee not found', 'error');
    document.getElementById('employee-info').style.display = 'none';
    validatedEmployee = null;
    return;
  }
  validatedEmployee = data.employee;
  validatedMealType = mealType;
  const infoDiv = document.getElementById('employee-info');
  const detailsDiv = document.getElementById('employee-details');
  const recordBtn = document.getElementById('record-btn');
  detailsDiv.innerHTML = `
    <p><strong>Name:</strong> ${data.employee.name}</p>
    <p><strong>Employee #:</strong> ${data.employee.employee_number}</p>
    <p><strong>Department:</strong> ${data.employee.department}</p>
    <p><strong>Badge:</strong> ${data.employee.badge_number}</p>
    <p style="margin-top: 10px;">
      <span class="badge ${data.can_consume ? 'badge-success' : 'badge-danger'}" style="font-size: 0.9rem; padding: 5px 12px;">
        ${data.can_consume ? `✓ Can have ${mealType}` : `✗ Already had ${mealType} today`}
      </span>
    </p>
  `;
  recordBtn.style.display = data.can_consume ? 'inline-block' : 'none';
  infoDiv.style.display = 'block';
}

async function recordConsumption() {
  if (!validatedEmployee) return;
  const badge = document.getElementById('badge-input').value.trim();
  const mealType = document.getElementById('meal-type-select').value;
  const location = document.getElementById('canteen-location').value;

  const res = await apiFetch('/tickets/consume', {
    method: 'POST',
    body: JSON.stringify({ badge_number: badge, meal_type: mealType, canteen_location: location })
  });
  if (!res) return;
  const data = await res.json();
  if (res.ok) {
    showToast(`Meal recorded for ${validatedEmployee.name}`, 'success');
    document.getElementById('badge-input').value = '';
    document.getElementById('employee-info').style.display = 'none';
    validatedEmployee = null;
    loadHistory();
  } else {
    showToast(data.error || 'Failed to record meal', 'error');
  }
}

async function loadHistory() {
  const today = new Date().toISOString().split('T')[0];
  const res = await apiFetch(`/tickets/history?date=${today}`);
  if (!res || !res.ok) return;
  const records = await res.json();
  const tbody = document.getElementById('history-table');
  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: #666;">No records for today</td></tr>';
    return;
  }
  tbody.innerHTML = records.map(r => `
    <tr>
      <td>${r.employee_name}</td>
      <td>${r.badge_number}</td>
      <td><span class="badge badge-success">${r.meal_type}</span></td>
      <td>${r.canteen_location}</td>
      <td>${new Date(r.consumed_at).toLocaleTimeString()}</td>
    </tr>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  document.getElementById('badge-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') validateBadge();
  });
});
