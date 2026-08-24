let currentUser = null;
let systemAreas = [];
let activeOrders = [];
let currentSelectedOrderId = null;

// Auth check
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = checkAuth(['agent']);
  if (!currentUser) return;

  document.getElementById('username-display').innerText = currentUser.name;
  
  await loadAreas();
  await loadAgentProfile();
  await loadDeliveries();
  setupStatusToggle();
});

// Load areas
async function loadAreas() {
  try {
    systemAreas = await apiRequest('/api/areas');
    const select = document.getElementById('agent-area-select');
    select.innerHTML = '<option value="">-- Select Your Location --</option>';
    systemAreas.forEach(area => {
      select.innerHTML += `<option value="${area.id}">${area.name}</option>`;
    });
  } catch (err) {
    showToast("Failed to load areas: " + err.message, 'error');
  }
}

// Load profile status & location
async function loadAgentProfile() {
  try {
    const data = await apiRequest('/api/auth/me');
    const user = data.user;
    currentUser = user;

    // Set toggle value
    const toggle = document.getElementById('agent-status-toggle');
    toggle.value = user.agentStatus;

    // Set location header
    const headerLoc = document.getElementById('agent-location-header').querySelector('strong');
    if (user.agentLocation && user.agentLocation.areaName) {
      headerLoc.innerText = user.agentLocation.areaName;
      document.getElementById('agent-area-select').value = user.agentLocation.areaId;
    } else {
      headerLoc.innerText = "Not Configured";
    }
  } catch (err) {
    showToast("Failed to sync agent profile: " + err.message, 'error');
  }
}

// Setup availability toggle change listener
function setupStatusToggle() {
  const toggle = document.getElementById('agent-status-toggle');
  toggle.addEventListener('change', async () => {
    const status = toggle.value;
    try {
      const data = await apiRequest('/api/agents/status', {
        method: 'PUT',
        body: JSON.stringify({ agentStatus: status })
      });
      currentUser = data.user;
      showToast(`Status updated to: ${status}`);
      loadDeliveries();
    } catch (err) {
      showToast(err.message, 'error');
      toggle.value = currentUser.agentStatus; // reset
    }
  });
}

// Update location form submit
document.getElementById('location-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const areaId = document.getElementById('agent-area-select').value;
  if (!areaId) return;

  try {
    const data = await apiRequest('/api/agents/status', {
      method: 'PUT',
      body: JSON.stringify({ areaId })
    });
    
    currentUser = data.user;
    document.getElementById('agent-location-header').querySelector('strong').innerText = currentUser.agentLocation.areaName;
    showToast("Current coordinates and area updated successfully!");
    loadDeliveries();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Load deliveries assigned to this agent
async function loadDeliveries() {
  try {
    activeOrders = await apiRequest('/api/orders');
    const tbody = document.getElementById('agent-orders-body');

    if (activeOrders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No assigned shipments. Stay "Available" to get orders assigned automatically.</td></tr>`;
      return;
    }

    tbody.innerHTML = activeOrders.map(order => {
      const statusBadge = `<span class="badge badge-${order.status.toLowerCase().replace(/\s+/g, '')}">${order.status}</span>`;
      return `
        <tr>
          <td><strong>#${order.id.slice(-6).toUpperCase()}</strong></td>
          <td>${order.customerName}</td>
          <td>${order.pickupAddress}</td>
          <td>${order.dropAddress}</td>
          <td>${order.paymentType}</td>
          <td>₹${order.totalCharge}</td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="openAgentWorkModal('${order.id}')">Manage</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showToast("Failed to load delivery orders: " + err.message, 'error');
  }
}

// Manage order modal
function openAgentWorkModal(orderId) {
  currentSelectedOrderId = orderId;
  const order = activeOrders.find(o => o.id === orderId);
  if (!order) return;

  const modal = document.getElementById('agent-action-modal');
  modal.classList.add('active');

  renderAgentModalContent(order);
}

function closeAgentModal() {
  document.getElementById('agent-action-modal').classList.remove('active');
  currentSelectedOrderId = null;
}

function renderAgentModalContent(order) {
  const container = document.getElementById('agent-modal-body');
  
  let transitionControlsHTML = '';
  
  // Custom button generation based on status
  if (order.status === 'Assigned') {
    transitionControlsHTML = `
      <div style="background: #ebf8ff; border: 1px solid #bee3f8; padding: 15px; border-radius: 6px; margin-top: 15px;">
        <h4 style="color: var(--primary-color); margin-bottom: 8px;">Action: Pick up package from sender</h4>
        <div class="form-group">
          <label>Internal Remarks (Optional)</label>
          <input type="text" id="action-remarks" class="form-control" placeholder="e.g. Package verified, loading onto bike">
        </div>
        <button class="btn btn-primary btn-block" onclick="updateOrderStatus('Picked Up')">Package Picked Up</button>
      </div>
    `;
  } else if (order.status === 'Picked Up') {
    transitionControlsHTML = `
      <div style="background: #ebf8ff; border: 1px solid #bee3f8; padding: 15px; border-radius: 6px; margin-top: 15px;">
        <h4 style="color: var(--primary-color); margin-bottom: 8px;">Action: Begin transit route</h4>
        <div class="form-group">
          <label>Internal Remarks (Optional)</label>
          <input type="text" id="action-remarks" class="form-control" placeholder="e.g. Left warehouse, heading to highway">
        </div>
        <button class="btn btn-primary btn-block" onclick="updateOrderStatus('In Transit')">Start Transit</button>
      </div>
    `;
  } else if (order.status === 'In Transit') {
    transitionControlsHTML = `
      <div style="background: #ebf8ff; border: 1px solid #bee3f8; padding: 15px; border-radius: 6px; margin-top: 15px;">
        <h4 style="color: var(--primary-color); margin-bottom: 8px;">Action: Mark out for delivery</h4>
        <div class="form-group">
          <label>Internal Remarks (Optional)</label>
          <input type="text" id="action-remarks" class="form-control" placeholder="e.g. Arrived at final mile delivery station">
        </div>
        <button class="btn btn-primary btn-block" onclick="updateOrderStatus('Out for Delivery')">Mark Out for Delivery</button>
      </div>
    `;
  } else if (order.status === 'Out for Delivery') {
    transitionControlsHTML = `
      <div style="background: #f7fafc; border: 1px solid var(--border-color); padding: 15px; border-radius: 6px; margin-top: 15px;">
        <h4 style="color: var(--text-color); margin-bottom: 8px;">Final Action: Resolve Order Status</h4>
        
        <div class="form-group">
          <label>Remarks / Signature Notes</label>
          <input type="text" id="action-remarks" class="form-control" placeholder="e.g. Handed to customer family member">
        </div>
        
        <div class="rate-card-grid">
          <button class="btn btn-success" onclick="updateOrderStatus('Delivered')">📦 Mark Delivered</button>
          <button class="btn btn-danger" onclick="toggleFailureReasonView(true)">⚠️ Mark Failed</button>
        </div>

        <!-- Failure inputs (Hidden initially) -->
        <div id="failure-inputs" style="display: none; margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
          <div class="form-group">
            <label style="color: var(--danger-color);">Select Failure Reason</label>
            <select id="action-fail-reason" class="form-control">
              <option value="Recipient unavailable">Recipient Unavailable / Door Locked</option>
              <option value="Customer refused delivery">Customer Refused Package</option>
              <option value="Incorrect delivery address">Incorrect Address Details</option>
              <option value="Cash not ready (COD)">Cash Not Ready (COD Order)</option>
              <option value="Damaged package">Package Damaged in Transit</option>
            </select>
          </div>
          <button class="btn btn-danger btn-block" onclick="updateOrderStatus('Failed')">Submit Failure Report</button>
          <button class="btn btn-secondary btn-sm mt-3" onclick="toggleFailureReasonView(false)">Cancel</button>
        </div>
      </div>
    `;
  } else {
    transitionControlsHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 20px; font-style: italic;">
        This delivery is completed (${order.status}). No further actions can be taken.
      </div>
    `;
  }

  container.innerHTML = `
    <div>
      <h3 style="color: var(--primary-color); margin-bottom: 8px;">Order #${order.id.slice(-6).toUpperCase()}</h3>
      <table class="table" style="font-size: 13px; border: 1px solid var(--border-color); margin-bottom: 15px;">
        <tr>
          <td><strong>Sender Pickup:</strong></td>
          <td>${order.pickupAddress}</td>
        </tr>
        <tr>
          <td><strong>Receiver Drop:</strong></td>
          <td>${order.dropAddress}</td>
        </tr>
        <tr>
          <td><strong>Customer Name:</strong></td>
          <td>${order.customerName}</td>
        </tr>
        <tr>
          <td><strong>Dimensions & Weight:</strong></td>
          <td>${order.length}x${order.width}x${order.height} cm (${order.billableWeight} kg)</td>
        </tr>
        <tr>
          <td><strong>Payment Type:</strong></td>
          <td>${order.paymentType} ${order.paymentType === 'COD' ? `(Collect ₹${order.totalCharge})` : '(Prepaid)'}</td>
        </tr>
        <tr>
          <td><strong>Net Amount:</strong></td>
          <td><strong>₹${order.totalCharge}</strong></td>
        </tr>
        <tr>
          <td><strong>Delivery Scheduled:</strong></td>
          <td>${order.scheduledDate}</td>
        </tr>
      </table>
      ${transitionControlsHTML}
    </div>
  `;
}

function toggleFailureReasonView(show) {
  const inputs = document.getElementById('failure-inputs');
  if (inputs) {
    inputs.style.display = show ? 'block' : 'none';
  }
}

// Submit status transition to API
async function updateOrderStatus(status) {
  const remarks = document.getElementById('action-remarks')?.value || '';
  const failedReason = document.getElementById('action-fail-reason')?.value || '';

  try {
    await apiRequest(`/api/orders/${currentSelectedOrderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, remarks, failedReason })
    });

    showToast(`Order updated to: ${status}`);
    closeAgentModal();
    
    // Sync profile and deliveries (availability resets to 'available' if Delivered/Failed)
    await loadAgentProfile();
    await loadDeliveries();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
