let currentUser = null;
let systemZones = [];
let systemAreas = [];
let systemAgents = [];
let systemOrders = [];
let systemCustomers = [];

let adminMap = null;
let currentOverrideOrderId = null;

// Auth check
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = checkAuth(['admin']);
  if (!currentUser) return;

  document.getElementById('username-display').innerText = currentUser.name;

  await loadZones();
  await loadAreas();
  await loadAgents();
  await loadOverview();
  
  // Set default dates in modals
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('admin-schedule-date').value = today;

  setupForms();
});

// Load Zones
async function loadZones() {
  try {
    systemZones = await apiRequest('/api/zones');
    
    // Fill sidebar selection
    const zoneSelect = document.getElementById('area-zone-id');
    const filterZone = document.getElementById('filter-zone');
    
    zoneSelect.innerHTML = '<option value="">-- Choose Zone --</option>';
    filterZone.innerHTML = '<option value="">-- All Zones --</option>';
    
    systemZones.forEach(z => {
      zoneSelect.innerHTML += `<option value="${z.id}">${z.name}</option>`;
      filterZone.innerHTML += `<option value="${z.id}">${z.name}</option>`;
    });

    const tbody = document.getElementById('admin-zones-body');
    tbody.innerHTML = systemZones.map(z => `
      <tr>
        <td><strong>${z.id}</strong></td>
        <td>${z.name}</td>
        <td>${z.description || '-'}</td>
      </tr>
    `).join('');

  } catch (err) {
    showToast("Failed to load zones: " + err.message, 'error');
  }
}

// Load Areas
async function loadAreas() {
  try {
    systemAreas = await apiRequest('/api/areas');
    
    // Fill creation selectors
    const pickupSelect = document.getElementById('admin-pickup-area');
    const dropSelect = document.getElementById('admin-drop-area');

    pickupSelect.innerHTML = '<option value="">-- Pickup Area --</option>';
    dropSelect.innerHTML = '<option value="">-- Drop Area --</option>';

    systemAreas.forEach(a => {
      pickupSelect.innerHTML += `<option value="${a.id}">${a.name}</option>`;
      dropSelect.innerHTML += `<option value="${a.id}">${a.name}</option>`;
    });

    const tbody = document.getElementById('admin-areas-body');
    tbody.innerHTML = systemAreas.map(a => {
      const zone = systemZones.find(z => z.id === a.zoneId);
      return `
        <tr>
          <td>${a.name}</td>
          <td><strong>${zone ? zone.name : a.zoneId}</strong></td>
          <td>${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    showToast("Failed to load areas: " + err.message, 'error');
  }
}

// Load Agents
async function loadAgents() {
  try {
    systemAgents = await apiRequest('/api/agents');
    
    const filterAgent = document.getElementById('filter-agent');
    filterAgent.innerHTML = '<option value="">-- All Agents --</option>';
    
    systemAgents.forEach(a => {
      filterAgent.innerHTML += `<option value="${a.id}">${a.name}</option>`;
    });

    // Populate override selection
    const overrideAgent = document.getElementById('override-agent-select');
    overrideAgent.innerHTML = '<option value="">-- Unassigned (Clear Agent) --</option>';
    systemAgents.forEach(a => {
      overrideAgent.innerHTML += `<option value="${a.id}">${a.name} (${a.agentStatus})</option>`;
    });

  } catch (err) {
    showToast("Failed to load agent statuses: " + err.message, 'error');
  }
}

// System Overview Loading
async function loadOverview() {
  try {
    systemOrders = await apiRequest('/api/orders');

    // Stat math
    const total = systemOrders.length;
    const placed = systemOrders.filter(o => o.status === 'Placed').length;
    const active = systemOrders.filter(o => ['Assigned', 'Picked Up', 'In Transit', 'Out for Delivery'].includes(o.status)).length;
    const delivered = systemOrders.filter(o => o.status === 'Delivered').length;
    const failed = systemOrders.filter(o => o.status === 'Failed').length;

    document.getElementById('stat-total-orders').innerText = total;
    document.getElementById('stat-placed-orders').innerText = placed;
    document.getElementById('stat-active-orders').innerText = active;
    document.getElementById('stat-delivered-orders').innerText = delivered;
    document.getElementById('stat-failed-orders').innerText = failed;

    // Load recent orders table
    const overviewOrders = document.getElementById('overview-orders-body');
    const recent = systemOrders.slice(-5).reverse();
    if (recent.length === 0) {
      overviewOrders.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No orders created.</td></tr>`;
    } else {
      overviewOrders.innerHTML = recent.map(o => {
        const badge = `<span class="badge badge-${o.status.toLowerCase().replace(/\s+/g, '')}">${o.status}</span>`;
        const pickupArea = systemAreas.find(a => a.id === o.pickupAreaId)?.name || 'Unknown';
        const dropArea = systemAreas.find(a => a.id === o.dropAreaId)?.name || 'Unknown';
        return `
          <tr>
            <td><strong>#${o.id.slice(-6).toUpperCase()}</strong></td>
            <td>${o.customerName}</td>
            <td>${pickupArea} ➔ ${dropArea}</td>
            <td>${o.orderType}</td>
            <td>₹${o.totalCharge}</td>
            <td>${badge}</td>
          </tr>
        `;
      }).join('');
    }

    // Load Agents overview
    const overviewAgents = document.getElementById('overview-agents-body');
    if (systemAgents.length === 0) {
      overviewAgents.innerHTML = `<tr><td colspan="4" style="text-align:center;">No agents registered.</td></tr>`;
    } else {
      overviewAgents.innerHTML = systemAgents.map(a => {
        let dotColor = '#f56565'; // red offline
        let statusLabel = 'Offline';
        if (a.agentStatus === 'available') {
          dotColor = '#48bb78';
          statusLabel = 'Available';
        } else if (a.agentStatus === 'busy') {
          dotColor = '#ecc94b';
          statusLabel = 'Busy';
        }

        const vehicleMap = {
          scooty: '🛵 Scooty',
          bike: '🏍️ Bike',
          cycle: '🚲 Cycle'
        };
        const vehicleLabel = vehicleMap[(a.vehicle || '').toLowerCase()] || '🏍️ Bike';
        const areaName = a.agentLocation?.areaName || '—';
        const badge = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${dotColor}; margin-right:5px;"></span> ${statusLabel}`;

        return `
          <tr>
            <td><strong>${a.name}</strong></td>
            <td>${vehicleLabel}</td>
            <td>${badge}</td>
            <td>${areaName}</td>
          </tr>
        `;
      }).join('');
    }

  } catch (err) {
    showToast("Failed to compile dashboard overview stats: " + err.message, 'error');
  }
}

// Setup static forms
function setupForms() {
  // Create Zone Submit
  document.getElementById('create-zone-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('zone-name').value;
    const description = document.getElementById('zone-desc').value;

    try {
      await apiRequest('/api/admin/zones', {
        method: 'POST',
        body: JSON.stringify({ name, description })
      });
      showToast("Delivery zone added successfully!");
      document.getElementById('create-zone-form').reset();
      await loadZones();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Create Area Submit
  document.getElementById('create-area-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('area-name').value;
    const zoneId = document.getElementById('area-zone-id').value;
    const lat = document.getElementById('area-lat').value;
    const lng = document.getElementById('area-lng').value;

    try {
      await apiRequest('/api/admin/areas', {
        method: 'POST',
        body: JSON.stringify({ name, zoneId, lat, lng })
      });
      showToast("Area map coordinate pinned!");
      document.getElementById('create-area-form').reset();
      await loadAreas();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Override Submit
  document.getElementById('admin-override-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('override-status-select').value;
    const agentId = document.getElementById('override-agent-select').value || null;
    const remarks = document.getElementById('override-remarks').value;

    try {
      await apiRequest(`/api/admin/orders/${currentOverrideOrderId}/override`, {
        method: 'PUT',
        body: JSON.stringify({ status, agentId, remarks })
      });
      showToast("Order overridden successfully!");
      closeOverrideModal();
      loadOrders();
      loadOverview();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// Load Rate configuration forms
async function loadRateConfigs() {
  try {
    const cards = await apiRequest('/api/rates');
    
    cards.forEach(card => {
      const prefix = card.orderType.toLowerCase(); // b2b or b2c
      
      document.getElementById(`${prefix}-intra-base-rate`).value = card.intraZoneBaseRate;
      document.getElementById(`${prefix}-intra-base-wt`).value = card.intraZoneBaseWeight;
      document.getElementById(`${prefix}-intra-add-rate`).value = card.intraZoneAddRate;
      document.getElementById(`${prefix}-inter-base-rate`).value = card.interZoneBaseRate;
      document.getElementById(`${prefix}-inter-base-wt`).value = card.interZoneBaseWeight;
      document.getElementById(`${prefix}-inter-add-rate`).value = card.interZoneAddRate;
      document.getElementById(`${prefix}-cod-surcharge`).value = card.codSurcharge;
      
      // Bind save triggers
      const form = document.getElementById(`rate-${prefix}-form`);
      // Remove old listener if reloaded
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);

      newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
          intraZoneBaseRate: newForm.querySelector(`#${prefix}-intra-base-rate`).value,
          intraZoneBaseWeight: newForm.querySelector(`#${prefix}-intra-base-wt`).value,
          intraZoneAddRate: newForm.querySelector(`#${prefix}-intra-add-rate`).value,
          interZoneBaseRate: newForm.querySelector(`#${prefix}-inter-base-rate`).value,
          interZoneBaseWeight: newForm.querySelector(`#${prefix}-inter-base-wt`).value,
          interZoneAddRate: newForm.querySelector(`#${prefix}-inter-add-rate`).value,
          codSurcharge: newForm.querySelector(`#${prefix}-cod-surcharge`).value
        };

        try {
          await apiRequest(`/api/admin/rates/${card.id}`, {
            method: 'PUT',
            body: JSON.stringify(body)
          });
          showToast(`Saved rate configuration for ${card.orderType}`);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  } catch (err) {
    showToast("Failed to retrieve rates configurations: " + err.message, 'error');
  }
}

// Load Orders Ledger with filter settings
async function loadOrders() {
  const statusFilter = document.getElementById('filter-status').value;
  const zoneFilter = document.getElementById('filter-zone').value;
  const agentFilter = document.getElementById('filter-agent').value;

  let query = '?';
  if (statusFilter) query += `status=${statusFilter}&`;
  if (zoneFilter) query += `zoneId=${zoneFilter}&`;
  if (agentFilter) query += `agentId=${agentFilter}&`;

  try {
    const orders = await apiRequest(`/api/orders${query}`);
    const tbody = document.getElementById('admin-orders-body');

    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">No orders found matching filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => {
      const date = new Date(o.createdAt).toLocaleDateString();
      const statusBadge = `<span class="badge badge-${o.status.toLowerCase().replace(/\s+/g, '')}">${o.status}</span>`;
      const pArea = systemAreas.find(a => a.id === o.pickupAreaId)?.name || 'Unknown';
      const dArea = systemAreas.find(a => a.id === o.dropAreaId)?.name || 'Unknown';
      
      // Load agents drop down options
      const agentOptions = systemAgents.map(a => {
        const selected = o.agentId === a.id ? 'selected' : '';
        const statusText = a.agentStatus === 'available' ? 'Available' : 'Busy/Off';
        return `<option value="${a.id}" ${selected}>${a.name} (${statusText})</option>`;
      }).join('');

      let assignControlsHTML = '';
      if (['Placed', 'Assigned'].includes(o.status)) {
        assignControlsHTML = `
          <div style="display: flex; gap: 4px; align-items: center; margin-top: 4px;">
            <select id="assign-agent-select-${o.id}" class="form-control" style="padding: 4px 6px; font-size: 11px; width: 140px;">
              <option value="">-- Choose Agent --</option>
              ${agentOptions}
            </select>
            <button class="btn btn-secondary btn-sm" style="padding: 4px 8px;" onclick="manualAssignAgent('${o.id}')">Set</button>
            <button class="btn btn-primary btn-sm" style="padding: 4px 8px; background-color:#319795;" title="Auto assign nearest available agent" onclick="autoAssignAgent('${o.id}')">Auto</button>
          </div>
        `;
      } else {
        assignControlsHTML = `<div style="font-size:11px; color:var(--text-muted); font-style:italic;">Transitions locked to agent/admin override.</div>`;
      }

      return `
        <tr>
          <td><strong>#${o.id.slice(-6).toUpperCase()}</strong></td>
          <td>${o.customerName}<br><span style="font-size: 10px; color: var(--text-muted);">${o.orderType}</span></td>
          <td>${date}</td>
          <td>${pArea}</td>
          <td>${dArea}</td>
          <td>₹${o.totalCharge}</td>
          <td>${statusBadge}</td>
          <td>${o.agentName || 'Unassigned'}</td>
          <td>
            ${assignControlsHTML}
            <button class="btn btn-danger btn-sm mt-3" style="padding: 4px 8px;" onclick="openOverrideModal('${o.id}')">Force Override</button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    showToast("Failed to filter order manifest: " + err.message, 'error');
  }
}

// Manual agent assign
async function manualAssignAgent(orderId) {
  const agentId = document.getElementById(`assign-agent-select-${orderId}`).value;
  if (!agentId) {
    showToast("Please choose an agent to assign manually", "error");
    return;
  }

  try {
    await apiRequest(`/api/admin/orders/${orderId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ agentId })
    });
    showToast("Agent manual assignment confirmed!");
    loadOrders();
    loadOverview();
    loadAgents();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Auto assign to nearest
async function autoAssignAgent(orderId) {
  try {
    showToast("Calculating distances & nearest agent...");
    const data = await apiRequest(`/api/admin/orders/${orderId}/auto-assign`, {
      method: 'POST'
    });
    showToast(`Assigned ${data.agentName}. Distance: ${data.distanceKm} km!`);
    loadOrders();
    loadOverview();
    loadAgents();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Override modal controls
function openOverrideModal(orderId) {
  currentOverrideOrderId = orderId;
  const order = systemOrders.find(o => o.id === orderId);
  if (!order) return;

  const modal = document.getElementById('admin-override-modal');
  modal.classList.add('active');

  document.getElementById('override-status-select').value = order.status;
  document.getElementById('override-agent-select').value = order.agentId || '';
  document.getElementById('override-remarks').value = '';
}

function closeOverrideModal() {
  document.getElementById('admin-override-modal').classList.remove('active');
  currentOverrideOrderId = null;
}

// Admin On Behalf Order Creation Modal
async function openCreateOrderModal() {
  const modal = document.getElementById('admin-order-modal');
  modal.classList.add('active');

  try {
    systemCustomers = await apiRequest('/api/admin/customers');
    const select = document.getElementById('admin-cust-select');
    select.innerHTML = '<option value="">-- Choose Customer Account --</option>';
    systemCustomers.forEach(c => {
      select.innerHTML += `<option value="${c.id}">${c.name} (${c.email})</option>`;
    });

    setupAdminOrderEstimator();
  } catch (err) {
    showToast("Failed to load customer profiles: " + err.message, 'error');
  }
}

function closeCreateOrderModal() {
  document.getElementById('admin-order-modal').classList.remove('active');
  document.getElementById('admin-order-form').reset();
  document.getElementById('admin-estimate-preview').innerText = 'Cost estimation shows here before confirmation.';
}

function setupAdminOrderEstimator() {
  const inputs = ['admin-pickup-area', 'admin-drop-area', 'admin-pkg-len', 'admin-pkg-wid', 'admin-pkg-hei', 'admin-pkg-wt', 'admin-order-type', 'admin-pay-type'];
  inputs.forEach(id => {
    document.getElementById(id).addEventListener('change', runAdminPriceEstimator);
    if (id.includes('-pkg-')) {
      document.getElementById(id).addEventListener('keyup', runAdminPriceEstimator);
    }
  });
}

async function runAdminPriceEstimator() {
  const pickupAreaId = document.getElementById('admin-pickup-area').value;
  const dropAreaId = document.getElementById('admin-drop-area').value;
  const length = document.getElementById('admin-pkg-len').value;
  const width = document.getElementById('admin-pkg-wid').value;
  const height = document.getElementById('admin-pkg-hei').value;
  const actualWeight = document.getElementById('admin-pkg-wt').value;
  const orderType = document.getElementById('admin-order-type').value;
  const paymentType = document.getElementById('admin-pay-type').value;

  const box = document.getElementById('admin-estimate-preview');

  if (!pickupAreaId || !dropAreaId || !length || !width || !height || !actualWeight) {
    box.innerText = "Cost estimation shows here before confirmation.";
    return;
  }

  try {
    box.innerText = "Calculating cost...";
    const details = await apiRequest('/api/orders/calculate', {
      method: 'POST',
      body: JSON.stringify({ pickupAreaId, dropAreaId, length, width, height, actualWeight, orderType, paymentType })
    });

    box.innerHTML = `
      <strong>Auto-Estimate Pricing:</strong><br>
      Route: ${details.pickupZoneName} ➔ ${details.dropZoneName} (${details.isIntra ? 'Intra-zone' : 'Inter-zone'})<br>
      Weights: Volumetric ${details.volumetricWeight} kg | Billable ${details.billableWeight} kg<br>
      Base Rate: ₹${details.baseCharge} + Weight Additions ₹${details.weightCharge} + COD ₹${details.codSurcharge}<br>
      <span style="color:var(--success-color); font-size:14px; font-weight:bold;">Total Amount: ₹${details.totalCharge}</span>
    `;
  } catch (err) {
    box.innerText = "Error: " + err.message;
  }
}

// Admin form place order on behalf
document.getElementById('admin-order-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const customerId = document.getElementById('admin-cust-select').value;
  const pickupAddress = document.getElementById('admin-pickup-addr').value;
  const pickupAreaId = document.getElementById('admin-pickup-area').value;
  const dropAddress = document.getElementById('admin-drop-addr').value;
  const dropAreaId = document.getElementById('admin-drop-area').value;
  const length = document.getElementById('admin-pkg-len').value;
  const width = document.getElementById('admin-pkg-wid').value;
  const height = document.getElementById('admin-pkg-hei').value;
  const actualWeight = document.getElementById('admin-pkg-wt').value;
  const orderType = document.getElementById('admin-order-type').value;
  const paymentType = document.getElementById('admin-pay-type').value;
  const scheduledDate = document.getElementById('admin-schedule-date').value;

  try {
    await apiRequest('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerId, pickupAddress, pickupAreaId, dropAddress, dropAreaId,
        length, width, height, actualWeight, orderType, paymentType, scheduledDate
      })
    });

    showToast("Order placed successfully on behalf of customer!");
    closeCreateOrderModal();
    loadOrders();
    loadOverview();
  } catch (err) {
    showToast(err.message, 'error');
  }
});


// Tab Switching
function switchTab(tabName) {
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.style.display = 'none';
  });
  document.querySelectorAll('.sidebar-menu li').forEach(li => {
    li.classList.remove('active');
  });

  document.getElementById(`tab-content-${tabName}`).style.display = 'block';
  document.getElementById(`menu-${tabName}`).classList.add('active');

  const pageTitles = {
    'overview': 'System Dashboard Overview',
    'zones': 'Manage Delivery Zones & Area Pins',
    'rates': 'Manage Pricing Rate Cards',
    'orders': 'Logistics Orders Ledger',
    'agents-map': 'Live Agent Map Tracking'
  };

  document.getElementById('page-title').innerText = pageTitles[tabName] || 'Admin Console';

  // Trigger content syncs
  if (tabName === 'overview') {
    loadOverview();
    loadAgents();
  } else if (tabName === 'zones') {
    loadZones();
    loadAreas();
  } else if (tabName === 'rates') {
    loadRateConfigs();
  } else if (tabName === 'orders') {
    loadOrders();
  } else if (tabName === 'agents-map') {
    initAgentsMap();
  }
}

// Live Agents Map
async function initAgentsMap() {
  if (adminMap) {
    adminMap.remove();
    adminMap = null;
  }

  // Draw Central New Delhi view as map pivot
  adminMap = L.map('admin-agent-tracking-map').setView([28.6139, 77.2090], 11);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(adminMap);

  try {
    const agents = await apiRequest('/api/agents');
    const markers = [];

    agents.forEach(agent => {
      if (agent.agentLocation && agent.agentLocation.lat && agent.agentLocation.lng) {
        let color = '#f56565'; // offline - red
        if (agent.agentStatus === 'available') color = '#48bb78'; // online available - green
        else if (agent.agentStatus === 'busy') color = '#ecc94b'; // busy - orange

        const agentDivIcon = L.divIcon({
          html: `<div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.4);"></div>`,
          className: 'custom-agent-marker-admin'
        });

        const m = L.marker([agent.agentLocation.lat, agent.agentLocation.lng], { icon: agentDivIcon }).addTo(adminMap)
          .bindPopup(`
            <strong>Agent: ${agent.name}</strong><br>
            Vehicle: ${({ scooty: '🛵 Scooty', bike: '🏍️ Bike', cycle: '🚲 Cycle' }[(agent.vehicle || '').toLowerCase()] || '🏍️ Bike')}<br>
            Email: ${agent.email}<br>
            Phone: ${agent.phone || 'N/A'}<br>
            Current Status: <span style="font-weight:bold; text-transform:uppercase;">${agent.agentStatus}</span><br>
            Pinned Area: ${agent.agentLocation.areaName || 'None'}
          `);
        markers.push(m);
      }
    });

    // Auto zoom/fit bounds if we have agents mapped
    if (markers.length > 0) {
      const group = new L.featureGroup(markers);
      adminMap.fitBounds(group.getBounds().pad(0.15));
    }

  } catch (err) {
    showToast("Could not load agent details onto tracking map: " + err.message, 'error');
  }
}
