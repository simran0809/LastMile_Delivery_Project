const API_URL = '';

// Authentication helper utilities
function getToken() {
  return localStorage.getItem('lm_token');
}

function setToken(token) {
  localStorage.setItem('lm_token', token);
}

function removeToken() {
  localStorage.removeItem('lm_token');
  localStorage.removeItem('lm_user');
}

function getCurrentUser() {
  const userStr = localStorage.getItem('lm_user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
}

function setCurrentUser(user) {
  localStorage.setItem('lm_user', JSON.stringify(user));
}

function logout() {
  removeToken();
  window.location.href = '/login';
}

// Check auth on load and redirect if incorrect
function checkAuth(allowedRoles = []) {
  const token = getToken();
  const user = getCurrentUser();

  if (!token || !user) {
    removeToken();
    window.location.href = '/login';
    return null;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    alert("Access Denied: You do not have permission to view this panel.");
    // Redirect to correct panel
    if (user.role === 'admin') window.location.href = '/admin.html';
    else if (user.role === 'customer') window.location.href = '/customer.html';
    else if (user.role === 'agent') window.location.href = '/agent.html';
    else logout();
    return null;
  }

  return user;
}

// API Network Wrapper
async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong');
  }

  return data;
}

// Toast alerts helper
function showToast(message, type = 'success') {
  // Can be basic alert or custom floating div. Let's make it a nice console log + window alert
  console.log(`[Toast ${type.toUpperCase()}]: ${message}`);
  // We can create a floating toast elements in HTML dynamically
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.innerText = message;
  toast.style.padding = '12px 20px';
  toast.style.marginBottom = '10px';
  toast.style.borderRadius = '4px';
  toast.style.color = 'white';
  toast.style.fontWeight = 'bold';
  toast.style.fontSize = '14px';
  toast.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  toast.style.transition = 'all 0.3s';
  toast.style.opacity = '0';

  if (type === 'success') toast.style.backgroundColor = '#48bb78';
  else if (type === 'error') toast.style.backgroundColor = '#f56565';
  else toast.style.backgroundColor = '#4299e1';

  container.appendChild(toast);
  
  // Fade in
  setTimeout(() => { toast.style.opacity = '1'; }, 50);
  
  // Remove after 3.5s
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.remove(); }, 300);
  }, 3500);
}

function fillAreaSelects(selectEl, areas, zones, placeholder) {
  if (!selectEl) return;
  selectEl.innerHTML = `<option value="">${placeholder}</option>`;
  const byZone = {};
  areas.forEach(a => {
    if (!byZone[a.zoneId]) byZone[a.zoneId] = [];
    byZone[a.zoneId].push(a);
  });
  zones.forEach(z => {
    const list = byZone[z.id];
    if (!list || !list.length) return;
    const group = document.createElement('optgroup');
    group.label = z.name;
    list.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      group.appendChild(opt);
    });
    selectEl.appendChild(group);
  });
}

function areaRouteLabel(areas, zones, areaId) {
  const area = areas.find(a => a.id === areaId);
  if (!area) return 'Unknown';
  const zone = zones.find(z => z.id === area.zoneId);
  return zone ? `${area.name}, ${zone.name}` : area.name;
}

// Global Notification Simulator Widget
function initNotificationSimulator() {
  if (window.location.pathname === '/' || window.location.pathname.endsWith('index.html') || window.location.pathname === '/login' || !getToken()) return;

  // Toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'notification-sim-toggle';
  toggleBtn.innerHTML = `
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 4px;">
      <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zM8 1.918l-.797.161A4.002 4.002 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4.002 4.002 0 0 0-3.203-3.92L8 1.917zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5.002 5.002 0 0 1 13 6c0 .88.32 4.2 1.22 6z"/>
    </svg>
    Notification Simulator
  `;
  document.body.appendChild(toggleBtn);

  // Panel
  const panel = document.createElement('div');
  panel.className = 'notification-sim-panel';
  panel.innerHTML = `
    <div class="notification-sim-header">
      <span>Simulated Live Notifications</span>
      <button class="modal-close" style="color: white; font-size: 16px;">&times;</button>
    </div>
    <div class="notification-sim-body" id="notification-sim-list">
      <div style="text-align: center; color: #a0aec0; margin-top: 50px;">No notifications yet.</div>
    </div>
  `;
  document.body.appendChild(panel);

  const closeBtn = panel.querySelector('.modal-close');

  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('active');
    if (panel.classList.contains('active')) {
      fetchNotifications();
    }
  });

  closeBtn.addEventListener('click', () => {
    panel.classList.remove('active');
  });

  // Fetch helper
  async function fetchNotifications() {
    try {
      const list = await apiRequest('/api/notifications');
      const listContainer = document.getElementById('notification-sim-list');
      
      if (list.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; color: #a0aec0; margin-top: 50px;">No notifications logged.</div>`;
        return;
      }

      listContainer.innerHTML = list.map(item => {
        const time = new Date(item.sentAt).toLocaleTimeString();
        const date = new Date(item.sentAt).toLocaleDateString();
        const channelClass = item.type === 'email' ? 'channel-email' : 'channel-sms';
        
        // Match Ethereal link pattern inside console and render if generated
        let linkHTML = '';
        if (item.type === 'email' && item.subject.toLowerCase().includes('order')) {
          linkHTML = `<div style="margin-top: 5px; font-size: 11px; color: #718096;">*Check server terminal logs for Ethereal email preview link!</div>`;
        }

        return `
          <div class="sim-item">
            <div class="sim-item-header">
              <span class="sim-item-channel ${channelClass}">${item.type}</span>
              <span>${date} ${time}</span>
            </div>
            <div class="sim-item-subject">${item.subject}</div>
            <div style="font-size: 11px; color: #718096; margin-bottom: 4px;">To: ${item.recipient}</div>
            <div class="sim-item-message">${item.message}</div>
            ${linkHTML}
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error("Failed to load notifications for simulator", err);
    }
  }

  // Poll for notifications every 8 seconds
  setInterval(() => {
    if (panel.classList.contains('active')) {
      fetchNotifications();
    }
  }, 8000);
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  initNotificationSimulator();
});
