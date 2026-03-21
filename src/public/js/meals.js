let currentPlanId = null;
let currentMenuId = null;

function switchTab(tab, e) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  e.target.classList.add('active');
  if (tab === 'plans') loadMealPlans();
  else loadMenuItems();
}

async function loadMealPlans() {
  const res = await apiFetch('/meal-plans');
  if (!res || !res.ok) return;
  const plans = await res.json();
  const tbody = document.getElementById('plans-table');
  if (plans.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: #666;">No meal plans found</td></tr>';
    return;
  }
  tbody.innerHTML = plans.map(p => `
    <tr>
      <td>${p.name}</td>
      <td>${p.description || '-'}</td>
      <td><span class="badge ${p.breakfast ? 'badge-success' : 'badge-danger'}">${p.breakfast ? 'Yes' : 'No'}</span></td>
      <td><span class="badge ${p.lunch ? 'badge-success' : 'badge-danger'}">${p.lunch ? 'Yes' : 'No'}</span></td>
      <td><span class="badge ${p.dinner ? 'badge-success' : 'badge-danger'}">${p.dinner ? 'Yes' : 'No'}</span></td>
      <td><span class="badge ${p.active ? 'badge-success' : 'badge-danger'}">${p.active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="openEditPlanModal(${JSON.stringify(p).replace(/"/g, '&quot;')})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deletePlan(${p.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function loadMenuItems() {
  const dateFilter = document.getElementById('menu-date-filter').value;
  const url = dateFilter ? `/menu-items?date=${dateFilter}` : '/menu-items';
  const res = await apiFetch(url);
  if (!res || !res.ok) return;
  const items = await res.json();
  const tbody = document.getElementById('menu-table');
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #666;">No menu items found</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr>
      <td>${item.name}</td>
      <td><span class="badge badge-warning">${item.meal_type}</span></td>
      <td>₦${item.price.toLocaleString()}</td>
      <td>${item.available_date}</td>
      <td><span class="badge ${item.active ? 'badge-success' : 'badge-danger'}">${item.active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="openEditMenuModal(${JSON.stringify(item).replace(/"/g, '&quot;')})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMenuItem(${item.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

function openPlanModal() {
  currentPlanId = null;
  document.getElementById('plan-modal-title').textContent = 'Add Meal Plan';
  document.getElementById('plan-form').reset();
  document.getElementById('plan-id').value = '';
  document.getElementById('plan-breakfast').checked = true;
  document.getElementById('plan-lunch').checked = true;
  document.getElementById('plan-dinner').checked = false;
  document.getElementById('plan-modal').classList.add('active');
}

function openEditPlanModal(plan) {
  currentPlanId = plan.id;
  document.getElementById('plan-modal-title').textContent = 'Edit Meal Plan';
  document.getElementById('plan-id').value = plan.id;
  document.getElementById('plan-name').value = plan.name;
  document.getElementById('plan-description').value = plan.description || '';
  document.getElementById('plan-breakfast').checked = !!plan.breakfast;
  document.getElementById('plan-lunch').checked = !!plan.lunch;
  document.getElementById('plan-dinner').checked = !!plan.dinner;
  document.getElementById('plan-modal').classList.add('active');
}

function closePlanModal() {
  document.getElementById('plan-modal').classList.remove('active');
}

async function deletePlan(id) {
  if (!confirm('Delete this meal plan?')) return;
  const res = await apiFetch(`/meal-plans/${id}`, { method: 'DELETE' });
  if (!res) return;
  if (res.ok) {
    showToast('Meal plan deleted', 'success');
    loadMealPlans();
  } else {
    const data = await res.json();
    showToast(data.error || 'Failed to delete', 'error');
  }
}

function openMenuModal() {
  currentMenuId = null;
  document.getElementById('menu-modal-title').textContent = 'Add Menu Item';
  document.getElementById('menu-form').reset();
  document.getElementById('menu-id').value = '';
  document.getElementById('menu-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('menu-modal').classList.add('active');
}

function openEditMenuModal(item) {
  currentMenuId = item.id;
  document.getElementById('menu-modal-title').textContent = 'Edit Menu Item';
  document.getElementById('menu-id').value = item.id;
  document.getElementById('menu-name').value = item.name;
  document.getElementById('menu-description').value = item.description || '';
  document.getElementById('menu-meal-type').value = item.meal_type;
  document.getElementById('menu-price').value = item.price;
  document.getElementById('menu-date').value = item.available_date;
  document.getElementById('menu-modal').classList.add('active');
}

function closeMenuModal() {
  document.getElementById('menu-modal').classList.remove('active');
}

async function deleteMenuItem(id) {
  if (!confirm('Delete this menu item?')) return;
  const res = await apiFetch(`/menu-items/${id}`, { method: 'DELETE' });
  if (!res) return;
  if (res.ok) {
    showToast('Menu item deleted', 'success');
    loadMenuItems();
  } else {
    const data = await res.json();
    showToast(data.error || 'Failed to delete', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadMealPlans();

  document.getElementById('plan-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('plan-id').value;
    const payload = {
      name: document.getElementById('plan-name').value,
      description: document.getElementById('plan-description').value || null,
      breakfast: document.getElementById('plan-breakfast').checked ? 1 : 0,
      lunch: document.getElementById('plan-lunch').checked ? 1 : 0,
      dinner: document.getElementById('plan-dinner').checked ? 1 : 0
    };
    const url = id ? `/meal-plans/${id}` : '/meal-plans';
    const method = id ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
    if (!res) return;
    const data = await res.json();
    if (res.ok) {
      showToast(`Meal plan ${id ? 'updated' : 'created'} successfully`, 'success');
      closePlanModal();
      loadMealPlans();
    } else {
      showToast(data.error || 'Operation failed', 'error');
    }
  });

  document.getElementById('menu-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('menu-id').value;
    const payload = {
      name: document.getElementById('menu-name').value,
      description: document.getElementById('menu-description').value || null,
      meal_type: document.getElementById('menu-meal-type').value,
      price: parseFloat(document.getElementById('menu-price').value) || 0,
      available_date: document.getElementById('menu-date').value
    };
    const url = id ? `/menu-items/${id}` : '/menu-items';
    const method = id ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
    if (!res) return;
    const data = await res.json();
    if (res.ok) {
      showToast(`Menu item ${id ? 'updated' : 'created'} successfully`, 'success');
      closeMenuModal();
      loadMenuItems();
    } else {
      showToast(data.error || 'Operation failed', 'error');
    }
  });
});
