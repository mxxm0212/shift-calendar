const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PLANS_FILE = path.join(DATA_DIR, 'plans.json');
const OVERRIDES_FILE = path.join(DATA_DIR, 'overrides.json');
const WORKLOGS_FILE = path.join(DATA_DIR, 'worklogs.json');
const LAYOUT_FILE = path.join(DATA_DIR, 'layout.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- JSON read/write helpers ---
function readJSON(filePath, fallback = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
  }
  return fallback;
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// --- Config operations ---
function loadConfig() {
  const data = readJSON(CONFIG_FILE, { reference_start_date: '', feishu_webhook_url: '' });
  // Ensure defaults
  if (!('reference_start_date' in data)) data.reference_start_date = '';
  if (!('feishu_webhook_url' in data)) data.feishu_webhook_url = '';
  return data;
}

function getConfig(key) {
  const config = loadConfig();
  return config[key] !== undefined ? config[key] : null;
}

function setConfig(key, value) {
  const config = loadConfig();
  config[key] = value;
  writeJSON(CONFIG_FILE, config);
}

function getAllConfig() {
  return loadConfig();
}

// --- Plan operations ---
function loadPlans() {
  const data = readJSON(PLANS_FILE, { plans: [] });
  return data.plans || [];
}

function savePlans(plans) {
  writeJSON(PLANS_FILE, { plans });
}

function getAllPlans() {
  const plans = loadPlans();
  plans.sort((a, b) => a.deadline.localeCompare(b.deadline));
  return plans;
}

function getPlan(id) {
  const plans = loadPlans();
  return plans.find(p => p.id === id) || null;
}

function createPlan(plan) {
  const plans = loadPlans();
  const reminderMinutes = plan.reminder_minutes ?? 30;
  if (typeof reminderMinutes !== 'number' || reminderMinutes < 1 || !Number.isFinite(reminderMinutes)) {
    throw new Error('reminder_minutes must be a positive number');
  }
  const newPlan = {
    id: plan.id,
    title: plan.title,
    description: plan.description || '',
    deadline: plan.deadline,
    reminder_minutes: reminderMinutes,
    notified: 0,
    created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
  };
  plans.push(newPlan);
  savePlans(plans);
  return newPlan;
}

function updatePlan(id, updates) {
  const plans = loadPlans();
  const idx = plans.findIndex(p => p.id === id);
  if (idx === -1) return null;

  if (updates.title !== undefined) plans[idx].title = updates.title;
  if (updates.description !== undefined) plans[idx].description = updates.description;
  if (updates.deadline !== undefined) plans[idx].deadline = updates.deadline;
  if (updates.reminder_minutes !== undefined) plans[idx].reminder_minutes = updates.reminder_minutes;
  if (updates.notified !== undefined) plans[idx].notified = updates.notified;

  savePlans(plans);
  return plans[idx];
}

function deletePlan(id) {
  const plans = loadPlans();
  const newPlans = plans.filter(p => p.id !== id);
  if (newPlans.length === plans.length) {
    return { changes: 0 };
  }
  savePlans(newPlans);
  return { changes: plans.length - newPlans.length };
}

// Get plans that need notification (uses Asia/Shanghai timezone)
function getPlansNeedingNotification() {
  const plans = loadPlans();
  // Construct current time in Asia/Shanghai to match deadline interpretation
  const nowShanghai = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const now = new Date(nowShanghai);

  return plans.filter(p => {
    if (p.notified) return false;
    // Deadlines are stored without timezone; interpret as Asia/Shanghai
    const deadline = new Date(p.deadline + '+08:00');
    const reminderTime = new Date(deadline.getTime() - p.reminder_minutes * 60 * 1000);
    return reminderTime <= now && now < deadline;
  });
}

// --- Day overrides (manual shift type assignment) ---

function loadOverrides() {
  return readJSON(OVERRIDES_FILE, {});
}

function saveOverrides(data) {
  writeJSON(OVERRIDES_FILE, data);
}

function getAllOverrides() {
  return loadOverrides();
}

function setOverride(date, type) {
  const overrides = loadOverrides();
  overrides[date] = type;
  saveOverrides(overrides);
  return { date, type };
}

function deleteOverride(date) {
  const overrides = loadOverrides();
  delete overrides[date];
  saveOverrides(overrides);
  return { date };
}

// --- Worklog operations ---

function loadWorklogs() {
  return readJSON(WORKLOGS_FILE, {});
}

function saveWorklogs(data) {
  writeJSON(WORKLOGS_FILE, data);
}

// Normalize legacy format (content string) to items array
function normalizeEntry(entry) {
  if (!entry) return null;
  if (Array.isArray(entry.items)) {
    if (entry.items.length === 0) return null;
    return {
      items: entry.items,
      updated_at: entry.updated_at || '',
    };
  }
  // Migrate old { content, updated_at } format
  const migratedItems = entry.content ? entry.content.split('\n').filter(l => l.trim()) : [];
  if (migratedItems.length === 0) return null;
  return {
    items: migratedItems,
    updated_at: entry.updated_at || '',
  };
}

function getWorklog(date) {
  const logs = loadWorklogs();
  return normalizeEntry(logs[date]);
}

function saveWorklog(date, items) {
  const logs = loadWorklogs();
  const cleaned = (items || []).map(i => (i || '').trim()).filter(i => i);
  if (cleaned.length === 0) {
    delete logs[date];
  } else {
    logs[date] = {
      items: cleaned,
      updated_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    };
  }
  saveWorklogs(logs);
  return logs[date] || null;
}

// Get worklog summaries for a date range
function getWorklogsInRange(start, end) {
  const logs = loadWorklogs();
  const result = {};
  const startD = new Date(start + 'T00:00:00');
  const endD = new Date(end + 'T00:00:00');

  for (const [date, entry] of Object.entries(logs)) {
    const d = new Date(date + 'T00:00:00');
    if (d >= startD && d <= endD) {
      const normalized = normalizeEntry(entry);
      if (normalized && normalized.items.length > 0) {
        result[date] = {
          items: normalized.items,
          updated_at: normalized.updated_at,
        };
      }
    }
  }
  return result;
}

// --- Layout persistence ---
const DEFAULT_LAYOUT = {
  right: { order: ['overview', 'cycle', 'worklog', 'dayPlans', 'upcoming', 'allPlans'], hidden: [] },
  left: { order: ['miniCal', 'yearCal', 'lunar'], hidden: ['legend'] },
};

function getLayout() {
  return readJSON(LAYOUT_FILE, DEFAULT_LAYOUT);
}

function saveLayout(layout) {
  writeJSON(LAYOUT_FILE, layout);
}

module.exports = {
  getConfig,
  setConfig,
  getAllConfig,
  getAllPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  getPlansNeedingNotification,
  setOverride,
  deleteOverride,
  getAllOverrides,
  getWorklog,
  saveWorklog,
  getWorklogsInRange,
  getLayout,
  saveLayout,
};
