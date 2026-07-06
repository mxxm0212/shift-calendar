const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PLANS_FILE = path.join(DATA_DIR, 'plans.json');

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
  const newPlan = {
    id: plan.id,
    title: plan.title,
    description: plan.description || '',
    deadline: plan.deadline,
    reminder_minutes: plan.reminder_minutes || 30,
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

// Get plans that need notification
function getPlansNeedingNotification() {
  const plans = loadPlans();
  const now = new Date();

  return plans.filter(p => {
    if (p.notified) return false;
    const deadline = new Date(p.deadline);
    const reminderTime = new Date(deadline.getTime() - p.reminder_minutes * 60 * 1000);
    return reminderTime <= now && now < deadline;
  });
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
};
