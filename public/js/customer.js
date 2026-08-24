let currentUser = null;
let systemAreas = [];
let customerMap = null;
let currentTrackingOrderId = null;

// Picker map details
let pickerMap = null;
let pickerPickupMarker = null;
let pickerDropMarker = null;
let pickerRouteLine = null;

// Auth check
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = checkAuth(['customer']);
  if (!currentUser) return;

  document.getElementById('username-display').innerText = currentUser.name;
  
  // Set default scheduled date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('schedule-date').value = today;

  await loadAreas();
  setupCalculatorListeners();
  loadOrders();
});

// Load areas from API
async function loadAreas() {
  try {
    const zones = await apiRequest('/api/zones');
    systemAreas = await apiRequest('/api/areas');
    const pickupSelect = document.getElementById('pickup-area');
    const dropSelect = document.getElementById('drop-area');

    pickupSelect.innerHTML = '<option value="">-- Select Pickup Area --</option>';
    dropSelect.innerHTML = '<option value="">-- Select Drop Area --</option>';

    systemAreas.forEach(area => {
      const zone = zones.find(z => z.id === area.zoneId);
      const zoneName = zone ? zone.name : 'Unknown Zone';
      const optionHtml = `<option value="${area.id}">${area.name} (${zoneName})</option>`;
      pickupSelect.innerHTML += optionHtml;
      dropSelect.innerHTML += optionHtml;
    });

    // Initialize picker map
    initPickerMap();
  } catch (err) {
    showToast("Failed to load delivery areas: " + err.message, 'error');
  }
}

// Pricing calculator handlers
function setupCalculatorListeners() {
  const inputs = ['pickup-area', 'drop-area', 'pkg-len', 'pkg-wid', 'pkg-hei', 'pkg-wt', 'order-type', 'pay-type'];
  inputs.forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      if (id === 'pickup-area' || id === 'drop-area') {
        syncPickerMapMarkers();
      }
      runPriceCalculator();
    });
    // for numeric inputs run on keyup as well
    if (id.startsWith('pkg-')) {
      document.getElementById(id).addEventListener('keyup', runPriceCalculator);
    }
  });

  // Setup keyword matcher
  setupKeywordMatcher();
}

// Visual Picker Map Logic
function initPickerMap() {
  if (pickerMap) {
    pickerMap.remove();
    pickerMap = null;
  }

  // Center around New Delhi center
  pickerMap = L.map('picker-map').setView([28.6139, 77.2090], 11);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(pickerMap);

  // Plot areas as small circles to show coverage
  systemAreas.forEach(area => {
    L.circle([area.lat, area.lng], {
      color: '#4299e1',
      fillColor: '#63b3ed',
      fillOpacity: 0.15,
      radius: 1200
    }).addTo(pickerMap)
      .bindPopup(`<b>${area.name}</b><br>Zone Area Center`);
  });

  // Map Click Handler for Visual Assignment
  pickerMap.on('click', (e) => {
    const { lat, lng } = e.latlng;
    
    // Find closest area
    let closestArea = null;
    let minDistance = Infinity;

    systemAreas.forEach(area => {
      const dist = calculateDistance(lat, lng, area.lat, area.lng);
      if (dist < minDistance) {
        minDistance = dist;
        closestArea = area;
      }
    });

    if (!closestArea) return;

    if (!pickerPickupMarker) {
      // Set Pickup
      const blueIcon = L.divIcon({
        html: `<div style="background-color: #2b6cb0; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
        className: 'picker-pickup-marker'
      });
      pickerPickupMarker = L.marker([lat, lng], { icon: blueIcon }).addTo(pickerMap)
        .bindPopup(`<b>Pickup Location Set</b><br>Closest Area: ${closestArea.name}`).openPopup();

      document.getElementById('pickup-area').value = closestArea.id;
      document.getElementById('pickup-addr').value = `Street Address near ${closestArea.name} (Coord Pin: ${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      
      showToast(`Pickup Area set to ${closestArea.name}`);
      runPriceCalculator();
    } else if (!pickerDropMarker) {
      // Set Destination
      const redIcon = L.divIcon({
        html: `<div style="background-color: #f56565; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
        className: 'picker-drop-marker'
      });
      pickerDropMarker = L.marker([lat, lng], { icon: redIcon }).addTo(pickerMap)
        .bindPopup(`<b>Destination Location Set</b><br>Closest Area: ${closestArea.name}`).openPopup();

      document.getElementById('drop-area').value = closestArea.id;
      document.getElementById('drop-addr').value = `Street Address near ${closestArea.name} (Coord Pin: ${lat.toFixed(4)}, ${lng.toFixed(4)})`;

      // Draw route line
      pickerRouteLine = L.polyline([pickerPickupMarker.getLatLng(), pickerDropMarker.getLatLng()], {
        color: '#319795',
        dashArray: '5, 10',
        weight: 3
      }).addTo(pickerMap);

      showToast(`Destination Area set to ${closestArea.name}`);
      runPriceCalculator();
    } else {
      // Reset and make click the new pickup point
      resetPickerMap();
      // Call click handler again to set pickup
      pickerMap.fireEvent('click', e);
    }
  });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function resetPickerMap() {
  if (pickerPickupMarker) {
    pickerMap.removeLayer(pickerPickupMarker);
    pickerPickupMarker = null;
  }
  if (pickerDropMarker) {
    pickerMap.removeLayer(pickerDropMarker);
    pickerDropMarker = null;
  }
  if (pickerRouteLine) {
    pickerMap.removeLayer(pickerRouteLine);
    pickerRouteLine = null;
  }

  document.getElementById('pickup-area').value = '';
  document.getElementById('pickup-addr').value = '';
  document.getElementById('drop-area').value = '';
  document.getElementById('drop-addr').value = '';
  
  runPriceCalculator();
}

function syncPickerMapMarkers() {
  if (!pickerMap) return;

  const pickupAreaId = document.getElementById('pickup-area').value;
  const dropAreaId = document.getElementById('drop-area').value;

  if (pickerPickupMarker) { pickerMap.removeLayer(pickerPickupMarker); pickerPickupMarker = null; }
  if (pickerDropMarker) { pickerMap.removeLayer(pickerDropMarker); pickerDropMarker = null; }
  if (pickerRouteLine) { pickerMap.removeLayer(pickerRouteLine); pickerRouteLine = null; }

  const pickupArea = systemAreas.find(a => a.id === pickupAreaId);
  const dropArea = systemAreas.find(a => a.id === dropAreaId);

  const markers = [];

  if (pickupArea) {
    const blueIcon = L.divIcon({
      html: `<div style="background-color: #2b6cb0; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
      className: 'picker-pickup-marker'
    });
    pickerPickupMarker = L.marker([pickupArea.lat, pickupArea.lng], { icon: blueIcon }).addTo(pickerMap)
      .bindPopup(`<b>Pickup Center</b><br>${pickupArea.name}`);
    markers.push(pickerPickupMarker);
  }

  if (dropArea) {
    const redIcon = L.divIcon({
      html: `<div style="background-color: #f56565; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
      className: 'picker-drop-marker'
    });
    pickerDropMarker = L.marker([dropArea.lat, dropArea.lng], { icon: redIcon }).addTo(pickerMap)
      .bindPopup(`<b>Drop Center</b><br>${dropArea.name}`);
    markers.push(pickerDropMarker);
  }

  if (pickupArea && dropArea) {
    pickerRouteLine = L.polyline([[pickupArea.lat, pickupArea.lng], [dropArea.lat, dropArea.lng]], {
      color: '#319795',
      dashArray: '5, 10',
      weight: 3
    }).addTo(pickerMap);
  }

  if (markers.length > 0) {
    const group = new L.featureGroup(markers);
    pickerMap.fitBounds(group.getBounds().pad(0.2));
  }
}

// Keyword address matching
function setupKeywordMatcher() {
  const pickupAddrInput = document.getElementById('pickup-addr');
  const dropAddrInput = document.getElementById('drop-addr');

  pickupAddrInput.addEventListener('input', () => matchAddressKeyword(pickupAddrInput.value, 'pickup-area'));
  dropAddrInput.addEventListener('input', () => matchAddressKeyword(dropAddrInput.value, 'drop-area'));
}

function matchAddressKeyword(text, selectId) {
  if (!text) return;
  const lowercaseText = text.toLowerCase();
  
  const matchedArea = systemAreas.find(area => {
    const keywords = area.name.toLowerCase().split(/\s+/);
    return keywords.some(kw => kw.length > 3 && lowercaseText.includes(kw));
  });

  if (matchedArea) {
    const select = document.getElementById(selectId);
    if (select.value !== matchedArea.id) {
      select.value = matchedArea.id;
      syncPickerMapMarkers();
      runPriceCalculator();
    }
  }
}

async function runPriceCalculator() {
  const pickupAreaId = document.getElementById('pickup-area').value;
  const dropAreaId = document.getElementById('drop-area').value;
  const length = document.getElementById('pkg-len').value;
  const width = document.getElementById('pkg-wid').value;
  const height = document.getElementById('pkg-hei').value;
  const actualWeight = document.getElementById('pkg-wt').value;
  const orderType = document.getElementById('order-type').value;
  const paymentType = document.getElementById('pay-type').value;

  const panel = document.getElementById('estimator-panel');

  if (!pickupAreaId || !dropAreaId || !length || !width || !height || !actualWeight) {
    panel.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 40px 0;">
        Enter pickup/drop locations and weight details to view pricing.
      </div>
    `;
    return;
  }

  try {
    panel.innerHTML = `<div style="text-align: center; padding: 40px 0;">Calculating cost...</div>`;
    
    const details = await apiRequest('/api/orders/calculate', {
      method: 'POST',
      body: JSON.stringify({
        pickupAreaId, dropAreaId, length, width, height, actualWeight, orderType, paymentType
      })
    });

    panel.innerHTML = `
      <div style="font-size: 15px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>Pickup Zone:</span>
          <strong>${details.pickupZoneName}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>Drop Zone:</span>
          <strong>${details.dropZoneName}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>Zone Type:</span>
          <strong>${details.isIntra ? 'Intra-Zone (Local)' : 'Inter-Zone (Outstation)'}</strong>
        </div>
        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 12px 0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>Volumetric Wt:</span>
          <span>${details.volumetricWeight} kg</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>Actual Weight:</span>
          <span>${actualWeight} kg</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: bold; color: var(--primary-color);">
          <span>Billable Weight:</span>
          <span>${details.billableWeight} kg</span>
        </div>
        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 12px 0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>Base Charge:</span>
          <span>₹${details.baseCharge}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>Weight Surcharge:</span>
          <span>₹${details.weightCharge}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>COD Surcharge:</span>
          <span>₹${details.codSurcharge}</span>
        </div>
        <hr style="border: 0; border-top: 2px dashed var(--border-color); margin: 12px 0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 18px; font-weight: bold; color: var(--success-color);">
          <span>Total Charge:</span>
          <span>₹${details.totalCharge}</span>
        </div>
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `
      <div style="text-align: center; color: var(--danger-color); padding: 40px 0;">
        Error: ${err.message}
      </div>
    `;
  }
}

// Order Form Submit
document.getElementById('order-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const pickupAddress = document.getElementById('pickup-addr').value;
  const pickupAreaId = document.getElementById('pickup-area').value;
  const dropAddress = document.getElementById('drop-addr').value;
  const dropAreaId = document.getElementById('drop-area').value;
  const length = document.getElementById('pkg-len').value;
  const width = document.getElementById('pkg-wid').value;
  const height = document.getElementById('pkg-hei').value;
  const actualWeight = document.getElementById('pkg-wt').value;
  const orderType = document.getElementById('order-type').value;
  const paymentType = document.getElementById('pay-type').value;
  const scheduledDate = document.getElementById('schedule-date').value;

  try {
    const order = await apiRequest('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        pickupAddress, pickupAreaId, dropAddress, dropAreaId,
        length, width, height, actualWeight, orderType, paymentType, scheduledDate
      })
    });

    showToast("Order placed successfully!");
    document.getElementById('order-form').reset();
    
    // Reset defaults
    document.getElementById('schedule-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('estimator-panel').innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 40px 0;">
        Enter package details to auto-calculate logistics pricing.
      </div>
    `;

    // Navigate to ledger
    switchTab('my-orders');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Load Orders list
async function loadOrders() {
  try {
    const orders = await apiRequest('/api/orders');
    const tbody = document.getElementById('orders-list-body');
    
    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center;">No orders found. Place a new order to get started.</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(order => {
      const date = new Date(order.createdAt).toLocaleDateString();
      const statusBadge = `<span class="badge badge-${order.status.toLowerCase().replace(/\s+/g, '')}">${order.status}</span>`;
      const agentText = order.agentName || '<span style="color: var(--text-muted); font-style: italic;">Unassigned</span>';
      
      const canRemove = ['Placed', 'Assigned'].includes(order.status);
      const removeBtn = canRemove
        ? `<button onclick="deleteOrder('${order.id}')" title="Remove Order" style="background:none; border:none; color:#e53e3e; font-size:18px; cursor:pointer; padding:2px 6px; line-height:1;">✕</button>`
        : `<span title="Cannot remove order in current status" style="color:#cbd5e0; font-size:18px; padding:2px 6px;">✕</span>`;

      return `
        <tr>
          <td style="text-align:center;">${removeBtn}</td>
          <td><strong>#${order.id.slice(-6).toUpperCase()}</strong></td>
          <td>${date}</td>
          <td>${order.dropAddress.substring(0, 20)}...</td>
          <td>${order.billableWeight} kg</td>
          <td>₹${order.totalCharge}</td>
          <td>${statusBadge}</td>
          <td>${agentText}</td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="openOrderTrackModal('${order.id}')">Track</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showToast("Failed to load orders list: " + err.message, 'error');
  }
}

async function deleteOrder(orderId) {
  if (!confirm('Remove this order? This cannot be undone.')) return;
  try {
    await apiRequest(`/api/orders/${orderId}`, { method: 'DELETE' });
    showToast('Order removed successfully.');
    loadOrders();
  } catch (err) {
    showToast('Failed to remove order: ' + err.message, 'error');
  }
}

// Tabs Manager
function switchTab(tabName) {
  // Hide all panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.style.display = 'none';
  });

  // Deactivate all menus
  document.querySelectorAll('.sidebar-menu li').forEach(li => {
    li.classList.remove('active');
  });

  // Activate specific tab
  document.getElementById(`tab-content-${tabName}`).style.display = 'block';
  document.getElementById(`menu-${tabName}`).classList.add('active');

  const pageTitles = {
    'place-order': 'Place Delivery Order',
    'my-orders': 'My Delivery History'
  };
  document.getElementById('page-title').innerText = pageTitles[tabName] || 'Dashboard';

  // Show back button only on the Place Order tab
  const backBtn = document.getElementById('back-to-orders-btn');
  if (backBtn) {
    backBtn.style.display = (tabName === 'place-order') ? 'flex' : 'none';
  }

  if (tabName === 'my-orders') {
    loadOrders();
  }
}

// Track Order Modal
async function openOrderTrackModal(orderId) {
  currentTrackingOrderId = orderId;
  const modal = document.getElementById('detail-modal');
  modal.classList.add('active');

  try {
    const data = await apiRequest(`/api/orders/${orderId}`);
    const order = data.order;
    const timeline = data.timeline;

    // Fill table details
    document.getElementById('modal-order-id').innerText = `Order #${order.id.slice(-6).toUpperCase()}`;
    
    const statusBadge = document.getElementById('modal-status');
    statusBadge.className = `badge badge-${order.status.toLowerCase().replace(/\s+/g, '')}`;
    statusBadge.innerText = order.status;

    document.getElementById('modal-pickup-addr').innerText = order.pickupAddress;
    document.getElementById('modal-drop-addr').innerText = order.dropAddress;
    document.getElementById('modal-dims').innerText = `${order.length} x ${order.width} x ${order.height} cm`;
    document.getElementById('modal-weight').innerText = `${order.billableWeight} kg (Actual: ${order.actualWeight}kg)`;
    document.getElementById('modal-payment').innerText = `${order.paymentType}`;
    document.getElementById('modal-charge').innerText = `₹${order.totalCharge}`;
    document.getElementById('modal-date').innerText = order.scheduledDate;
    document.getElementById('modal-agent').innerText = order.agentName || 'Not assigned yet';

    // Timeline Rendering
    const timelineList = document.getElementById('modal-timeline');
    if (timeline.length === 0) {
      timelineList.innerHTML = '<li>No tracking events logged.</li>';
    } else {
      timelineList.innerHTML = timeline.map(item => {
        const timeStr = new Date(item.timestamp).toLocaleString();
        const cleanStatus = item.status.toLowerCase().replace(/\s+/g, '');
        return `
          <li class="timeline-item">
            <span class="timeline-dot status-${cleanStatus}"></span>
            <div class="timeline-content">
              <span class="timeline-time">${timeStr}</span>
              <div class="timeline-status">${item.status}</div>
              <div class="timeline-actor">Logged by: ${item.actor}</div>
              <div class="timeline-remarks">${item.remarks || ''}</div>
            </div>
          </li>
        `;
      }).join('');
    }

    // Reschedule flow toggling
    const rescheduleBox = document.getElementById('reschedule-box');
    if (order.status === 'Failed') {
      rescheduleBox.style.display = 'block';
      document.getElementById('reschedule-reason').innerText = order.failedReason || 'None provided';
      
      // Default date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      document.getElementById('reschedule-date-picker').value = tomorrow.toISOString().split('T')[0];
    } else {
      rescheduleBox.style.display = 'none';
    }

    // Initialize Map on details panel
    initMap(order);

  } catch (err) {
    showToast("Error retrieving tracking detail: " + err.message, 'error');
  }
}

function closeModal() {
  document.getElementById('detail-modal').classList.remove('active');
  currentTrackingOrderId = null;
  if (customerMap) {
    customerMap.remove();
    customerMap = null;
  }
}

// Leaflet Map Rendering
async function initMap(order) {
  // Destroy old map container context if existing
  if (customerMap) {
    customerMap.remove();
    customerMap = null;
  }

  // Lookup Area coordinates
  const pickupArea = systemAreas.find(a => a.id === order.pickupAreaId);
  const dropArea = systemAreas.find(a => a.id === order.dropAreaId);

  if (!pickupArea || !dropArea) return;

  const latP = pickupArea.lat;
  const lngP = pickupArea.lng;
  const latD = dropArea.lat;
  const lngD = dropArea.lng;

  // Center map around the midpoint
  const centerLat = (latP + latD) / 2;
  const centerLng = (lngP + lngD) / 2;

  customerMap = L.map('customer-order-map').setView([centerLat, centerLng], 11);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(customerMap);

  // Markers
  const pickupMarker = L.marker([latP, lngP]).addTo(customerMap)
    .bindPopup(`<b>Pickup Point</b><br>${order.pickupAddress}`).openPopup();

  const dropMarker = L.marker([latD, lngD]).addTo(customerMap)
    .bindPopup(`<b>Destination Point</b><br>${order.dropAddress}`);

  // Route indicator line
  const routeLine = L.polyline([[latP, lngP], [latD, lngD]], {
    color: '#319795',
    dashArray: '5, 10',
    weight: 3
  }).addTo(customerMap);

  // If there's an assigned agent, let's look up their current location
  if (order.agentId) {
    try {
      const agents = await apiRequest('/api/agents');
      const assignedAgent = agents.find(a => a.id === order.agentId);

      if (assignedAgent && assignedAgent.agentLocation && assignedAgent.agentLocation.lat && assignedAgent.agentLocation.lng) {
        const agentIcon = L.divIcon({
          html: `<div style="background-color: #2b6cb0; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
          className: 'custom-agent-marker'
        });

        const agentMarker = L.marker([assignedAgent.agentLocation.lat, assignedAgent.agentLocation.lng], { icon: agentIcon }).addTo(customerMap)
          .bindPopup(`<b>Agent ${assignedAgent.name}</b><br>Status: ${assignedAgent.agentStatus}`);

        // Draw connection line from agent to pickup or dropoff depending on status
        let targetLoc = [latP, lngP]; // Default heading to pickup
        if (['Picked Up', 'In Transit', 'Out for Delivery'].includes(order.status)) {
          targetLoc = [latD, lngD]; // Heading to drop
        }

        L.polyline([[assignedAgent.agentLocation.lat, assignedAgent.agentLocation.lng], targetLoc], {
          color: '#2b6cb0',
          weight: 2,
          opacity: 0.7
        }).addTo(customerMap);

        // Adjust bounds
        const group = new L.featureGroup([pickupMarker, dropMarker, agentMarker]);
        customerMap.fitBounds(group.getBounds().pad(0.15));
      } else {
        const group = new L.featureGroup([pickupMarker, dropMarker]);
        customerMap.fitBounds(group.getBounds().pad(0.15));
      }
    } catch (err) {
      console.warn("Could not load agent location for tracking map:", err);
    }
  } else {
    const group = new L.featureGroup([pickupMarker, dropMarker]);
    customerMap.fitBounds(group.getBounds().pad(0.15));
  }
}

// Reschedule Submission
async function submitReschedule() {
  const scheduledDate = document.getElementById('reschedule-date-picker').value;
  if (!scheduledDate) {
    showToast("Please pick a reschedule date first", "error");
    return;
  }

  try {
    await apiRequest(`/api/orders/${currentTrackingOrderId}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ scheduledDate })
    });

    showToast("Delivery successfully rescheduled!");
    closeModal();
    loadOrders();
  } catch (err) {
    showToast("Reschedule failed: " + err.message, 'error');
  }
}
