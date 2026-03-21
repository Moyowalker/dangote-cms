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

  // Build employee details using DOM APIs to avoid XSS
  detailsDiv.textContent = '';

  [
    ['Name', data.employee.name],
    ['Employee #', data.employee.employee_number],
    ['Department', data.employee.department],
    ['Badge', data.employee.badge_number]
  ].forEach(([label, value]) => {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = label + ': ';
    p.appendChild(strong);
    p.appendChild(document.createTextNode(value));
    detailsDiv.appendChild(p);
  });

  const statusP = document.createElement('p');
  statusP.style.marginTop = '10px';
  const statusSpan = document.createElement('span');
  statusSpan.className = `badge ${data.can_consume ? 'badge-success' : 'badge-danger'}`;
  statusSpan.style.cssText = 'font-size: 0.9rem; padding: 5px 12px;';
  statusSpan.textContent = data.can_consume
    ? `✓ Can have ${mealType}`
    : `✗ Already had ${mealType} today`;
  statusP.appendChild(statusSpan);
  detailsDiv.appendChild(statusP);
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
  tbody.textContent = '';
  if (records.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.style.cssText = 'text-align:center; padding: 20px; color: #666;';
    td.textContent = 'No records for today';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  records.forEach(r => {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = r.employee_name;
    tr.appendChild(nameTd);

    const badgeTd = document.createElement('td');
    badgeTd.textContent = r.badge_number;
    tr.appendChild(badgeTd);

    const mealTypeTd = document.createElement('td');
    const mealSpan = document.createElement('span');
    mealSpan.className = 'badge badge-success';
    mealSpan.textContent = r.meal_type;
    mealTypeTd.appendChild(mealSpan);
    tr.appendChild(mealTypeTd);

    const locationTd = document.createElement('td');
    locationTd.textContent = r.canteen_location;
    tr.appendChild(locationTd);

    const timeTd = document.createElement('td');
    timeTd.textContent = new Date(r.consumed_at).toLocaleTimeString();
    tr.appendChild(timeTd);

    tbody.appendChild(tr);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  document.getElementById('badge-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') validateBadge();
  });
});
