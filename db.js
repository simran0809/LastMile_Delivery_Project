const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, 'db.json');

// Helper to hash passwords using standard Node.js crypto (SHA-256)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Initial seed data
const initialData = {
  users: [
    {
      id: "usr_admin",
      name: "System Admin",
      email: "admin@logistic.com",
      passwordHash: hashPassword("admin123"),
      role: "admin",
      phone: "+15550100"
    },
    {
      id: "usr_customer",
      name: "Simran Customer",
      email: "customer@logistic.com",
      passwordHash: hashPassword("customer123"),
      role: "customer",
      phone: "+15550200"
    },
    {
      id: "usr_agent1",
      name: "Reena",
      email: "reena@logistic.com",
      passwordHash: hashPassword("reena123"),
      role: "agent",
      phone: "+91901100001",
      vehicle: "scooty",
      agentStatus: "available",
      agentLocation: { lat: 28.6139, lng: 77.2090, areaId: "area_1", areaName: "Downtown Core" }
    },
    {
      id: "usr_agent2",
      name: "Sameer",
      email: "sameer@logistic.com",
      passwordHash: hashPassword("sameer123"),
      role: "agent",
      phone: "+91901100002",
      vehicle: "bike",
      agentStatus: "available",
      agentLocation: { lat: 28.5800, lng: 77.3000, areaId: "area_3", areaName: "Greenwood" }
    },
    {
      id: "usr_agent3",
      name: "Nikhil",
      email: "nikhil@logistic.com",
      passwordHash: hashPassword("nikhil123"),
      role: "agent",
      phone: "+91901100003",
      vehicle: "cycle",
      agentStatus: "available",
      agentLocation: { lat: 28.6700, lng: 77.1200, areaId: "area_5", areaName: "Industrial Hub" }
    },
    {
      id: "usr_agent4",
      name: "Siya",
      email: "siya@logistic.com",
      passwordHash: hashPassword("siya123"),
      role: "agent",
      phone: "+91901100004",
      vehicle: "scooty",
      agentStatus: "available",
      agentLocation: { lat: 28.6250, lng: 77.2200, areaId: "area_2", areaName: "Business Park" }
    },
    {
      id: "usr_agent5",
      name: "Manish",
      email: "manish@logistic.com",
      passwordHash: hashPassword("manish123"),
      role: "agent",
      phone: "+91901100005",
      vehicle: "bike",
      agentStatus: "offline",
      agentLocation: { lat: 28.5900, lng: 77.3100, areaId: "area_4", areaName: "East Heights" }
    },
    {
      id: "usr_agent6",
      name: "Vineet",
      email: "vineet@logistic.com",
      passwordHash: hashPassword("vineet123"),
      role: "agent",
      phone: "+91901100006",
      vehicle: "scooty",
      agentStatus: "available",
      agentLocation: { lat: 28.6600, lng: 77.1000, areaId: "area_6", areaName: "West Gate" }
    },
    {
      id: "usr_agent7",
      name: "Sai",
      email: "sai@logistic.com",
      passwordHash: hashPassword("sai123"),
      role: "agent",
      phone: "+91901100007",
      vehicle: "cycle",
      agentStatus: "offline",
      agentLocation: { lat: 28.6139, lng: 77.2090, areaId: "area_1", areaName: "Downtown Core" }
    }
  ],
  zones: [
    { id: "zone_1", name: "Central Zone", description: "Business and Downtown Core" },
    { id: "zone_2", name: "East Zone", description: "Suburbs and Residential Areas" },
    { id: "zone_3", name: "West Zone", description: "Industrial and Warehousing Areas" }
  ],
  areas: [
    { id: "area_1", name: "Downtown Core", zoneId: "zone_1", lat: 28.6139, lng: 77.2090 },
    { id: "area_2", name: "Business Park", zoneId: "zone_1", lat: 28.6250, lng: 77.2200 },
    { id: "area_3", name: "Greenwood", zoneId: "zone_2", lat: 28.5800, lng: 77.3000 },
    { id: "area_4", name: "East Heights", zoneId: "zone_2", lat: 28.5900, lng: 77.3100 },
    { id: "area_5", name: "Industrial Hub", zoneId: "zone_3", lat: 28.6700, lng: 77.1200 },
    { id: "area_6", name: "West Gate", zoneId: "zone_3", lat: 28.6600, lng: 77.1000 }
  ],
  rate_cards: [
    {
      id: "rc_b2b",
      orderType: "B2B",
      intraZoneBaseRate: 100,
      intraZoneBaseWeight: 5,
      intraZoneAddRate: 10,
      interZoneBaseRate: 250,
      interZoneBaseWeight: 5,
      interZoneAddRate: 20,
      codSurcharge: 50
    },
    {
      id: "rc_b2c",
      orderType: "B2C",
      intraZoneBaseRate: 60,
      intraZoneBaseWeight: 3,
      intraZoneAddRate: 8,
      interZoneBaseRate: 150,
      interZoneBaseWeight: 3,
      interZoneAddRate: 15,
      codSurcharge: 30
    }
  ],
  orders: [],
  tracking_history: [],
  notifications: []
};

// Ensure database file exists
function initDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
    console.log("Database file created and seeded successfully.");
  }
}

initDb();

// Load data synchronously (to initialize memory cache)
let dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

// Async lock/queue for writing to prevent collisions
let writePromise = Promise.resolve();

function saveDb() {
  return new Promise((resolve, reject) => {
    writePromise = writePromise.then(() => {
      return new Promise((res, rej) => {
        fs.writeFile(DB_FILE, JSON.stringify(dbData, null, 2), 'utf8', (err) => {
          if (err) {
            console.error("Database write error:", err);
            rej(err);
          } else {
            res();
          }
        });
      });
    }).then(resolve).catch(reject);
  });
}

// Database helper functions
const db = {
  hashPassword,

  // General CRUD
  find(table, predicate) {
    if (!dbData[table]) return [];
    if (!predicate) return dbData[table];
    return dbData[table].filter(item => {
      if (typeof predicate === 'function') {
        return predicate(item);
      } else if (typeof predicate === 'object' && predicate !== null) {
        return Object.keys(predicate).every(key => item[key] === predicate[key]);
      } else {
        return item.id === predicate;
      }
    });
  },

  findOne(table, predicate) {
    if (!dbData[table]) return null;
    return dbData[table].find(item => {
      if (typeof predicate === 'function') {
        return predicate(item);
      } else if (typeof predicate === 'object' && predicate !== null) {
        return Object.keys(predicate).every(key => item[key] === predicate[key]);
      } else {
        return item.id === predicate;
      }
    }) || null;
  },

  async insert(table, record) {
    if (!dbData[table]) {
      dbData[table] = [];
    }
    dbData[table].push(record);
    await saveDb();
    return record;
  },

  async update(table, predicate, updates) {
    if (!dbData[table]) return false;
    let updated = false;
    dbData[table] = dbData[table].map(item => {
      let match = false;
      if (typeof predicate === 'function') {
        match = predicate(item);
      } else if (typeof predicate === 'object') {
        match = Object.keys(predicate).every(key => item[key] === predicate[key]);
      } else {
        match = item.id === predicate;
      }

      if (match) {
        updated = true;
        return { ...item, ...updates };
      }
      return item;
    });

    if (updated) {
      await saveDb();
    }
    return updated;
  },

  async delete(table, predicate) {
    if (!dbData[table]) return false;
    const initialLength = dbData[table].length;
    dbData[table] = dbData[table].filter(item => {
      if (typeof predicate === 'function') {
        return !predicate(item);
      } else if (typeof predicate === 'object') {
        return !Object.keys(predicate).every(key => item[key] === predicate[key]);
      } else {
        return item.id !== predicate;
      }
    });

    const deleted = dbData[table].length < initialLength;
    if (deleted) {
      await saveDb();
    }
    return deleted;
  },

  // Specialized helpers
  async addTracking(orderId, status, actor, remarks) {
    const tracking = {
      id: "trk_" + Math.random().toString(36).substr(2, 9),
      orderId,
      status,
      actor,
      timestamp: new Date().toISOString(),
      remarks
    };
    await this.insert('tracking_history', tracking);
    return tracking;
  },

  async addNotification(orderId, recipient, type, subject, message) {
    const notification = {
      id: "ntf_" + Math.random().toString(36).substr(2, 9),
      orderId,
      recipient,
      type,
      subject,
      message,
      sentAt: new Date().toISOString(),
      status: 'sent'
    };
    await this.insert('notifications', notification);
    return notification;
  }
};

module.exports = db;
