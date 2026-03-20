const API_BASE = '/api';

async function apiFetch(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (response.status === 401) {
    window.location.href = '/index.html';
    return null;
  }
  return response;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

if (!window.location.pathname.includes('index.html') && window.location.pathname !== '/') {
  apiFetch('/auth/me').then(res => {
    if (!res) return;
    if (!res.ok) {
      window.location.href = '/index.html';
    } else {
      res.json().then(data => {
        const userEl = document.getElementById('current-user');
        if (userEl) userEl.textContent = data.user.username;
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await apiFetch('/auth/logout', { method: 'POST' });
      window.location.href = '/index.html';
    });
  }
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('active');
    }
  });
});
