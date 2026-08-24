# Last-Mile Delivery Tracker

A comprehensive logistics delivery management platform featuring automated rate calculations, intelligent agent auto-assignments, live map tracking, and status notification simulations.

---

## Technical Stack & Architecture

- **Backend**: Node.js + Express.js.
- **Database**: File-based JSON database (`db.json` managed via `db.js`) providing role-based security, state consistency, and fast read/writes without requiring C++ native build tool compilation on Windows.
- **Frontend**: Responsive dashboards (`admin.html`, `customer.html`, `agent.html`) styled with clean, vanilla CSS and powered by simple, component-driven vanilla JavaScript.
- **Visual Mapping**: Leaflet.js (open-source) mapping for rendering pickup-drop routes, active agents, and live delivery coordinates.
- **Notifications**: Automated notifications logging system + Nodemailer integration with dynamic Ethereal test inbox previews.

---

## Quick Start Guide

### 1. Install Dependencies
Open your command terminal in the project directory and run:
```bash
npm install
```

### 2. Start the Application
Run the start command:
```bash
npm start
```
The server will boot up and seed the initial database configuration. Look for the console logs displaying the active port and the **Nodemailer Ethereal SMTP test credentials**.

### 3. Open in Browser
Visit the following URL in your web browser:
```
http://localhost:3000
```

---

## Seeded Demo Accounts

Use the **Demo Logins** helper buttons on the login screen to sign in instantly, or copy/paste the credentials:

| Role | Email | Password | Details |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@logistic.com` | `admin123` | Control rates, zones, manual overrides, auto-assigns. |
| **Customer** | `customer@logistic.com` | `customer123` | Create orders, track timelines, reschedule failed orders. |
| **Agent 1 (Central)** | `agent1@logistic.com` | `agent123` | Online, positioned in Downtown Core (Zone 1). |
| **Agent 2 (East)** | `agent2@logistic.com` | `agent223` | Online, positioned in Greenwood Suburbs (Zone 2). |
| **Agent 3 (West)** | `agent3@logistic.com` | `agent323` | Offline, positioned in Industrial Hub (Zone 3). |

---

## Features Walkthrough

### 1. Auth & Portal Access
Users can login as any of the roles or register a new account. Setting an account role dynamically redirects the user to their designated workspace, locking other routes.

### 2. Rate Calculation Engine
When a customer inputs coordinates (pickup/drop areas) and package specifications:
- **Volumetric Weight**: Calculated automatically as `(Length * Width * Height) / 5000`.
- **Billable Weight**: Determined as `Max(Actual Weight, Volumetric Weight)`.
- **Zone Finder**: Pickup and destination coordinates resolve to their configured administrative zones.
- **Rate matrix**: The system queries the correct rate card (B2B/B2C) and calculates intra-zone (local) or inter-zone (outstation) rates.
- **COD Fee**: Added to cash on delivery orders.
- **Approval Guard**: The full breakdown of charges is presented to the user *before* they click confirm.

### 3. Auto-Assignment (Haversine Distance)
Admins can trigger auto-assignment:
- The system filters all online agents (`agentStatus === 'available'`).
- The system calculates the distance from the order's pickup coordinates to the current coordinates of each available agent using the **Haversine formula**.
- The closest agent is selected, assigned to the order, and marked as `busy`.

### 4. Status Life Cycle & Immutable Ledger
- Orders transition through: `Placed` ➔ `Assigned` ➔ `Picked Up` ➔ `In Transit` ➔ `Out for Delivery` ➔ `Delivered` OR `Failed`.
- Every transition logs the timestamp, action actor, and remarks in the database.
- Transition entries are immutable and form the tracking timeline shown to customers.

### 5. Rescheduling failed attempts
- If an agent marks a shipment as `Failed` (specifying a reason, e.g. Customer Refused), the assigned agent is set back to `available`.
- The customer receives an alert and their dashboard displays a reschedule portal.
- The customer inputs a new scheduled date, resetting the order status to `Placed` (unassigned) for a fresh agent assignment.

### 6. Floating Notification Simulator
- Check out the **Notification Simulator** button floating in the bottom-right corner of the dashboards.
- Clicking it opens an inspector logging all SMS/Emails dispatched by the system.
- Real SMTP email templates are transmitted, and their browser test inbox preview links are logged directly to the server terminal.
