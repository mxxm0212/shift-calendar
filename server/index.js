const express = require('express');
const cron = require('node-cron');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { getShiftType, getShiftTypesInRange, SHIFT_TYPES } = require('./shift');
const { checkAndNotify } = require('./notify');

const app = express();
const PORT = process.env.PORT || 3456;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Config API ---

app.get('/api/config', (req, res) => {
  res.json(db.getAllConfig());
});

app.put('/api/config', (req, res) => {
  const { reference_start_date, feishu_webhook_url } = req.body;

  if (reference_start_date !== undefined) {
    // Validate: must be a Monday
    const d = new Date(reference_start_date + 'T00:00:00');
    if (isNaN(d.getTime())) {
      return res.status(400).json({ error: '无效的日期格式，请使用 YYYY-MM-DD' });
    }
    if (d.getDay() !== 1) {
      return res.status(400).json({ error: '参考起始日必须是周一' });
    }
    db.setConfig('reference_start_date', reference_start_date);
  }

  if (feishu_webhook_url !== undefined) {
    db.setConfig('feishu_webhook_url', feishu_webhook_url);
  }

  res.json(db.getAllConfig());
});

// --- Plans API ---

app.get('/api/plans', (req, res) => {
  const plans = db.getAllPlans();
  res.json(plans);
});

app.post('/api/plans', (req, res) => {
  const { title, description, deadline, reminder_minutes } = req.body;

  if (!title || !deadline) {
    return res.status(400).json({ error: '标题和截止时间为必填项' });
  }

  const plan = {
    id: crypto.randomUUID(),
    title,
    description: description || '',
    deadline,
    reminder_minutes: reminder_minutes || 30,
  };

  const created = db.createPlan(plan);
  res.status(201).json(created);
});

app.put('/api/plans/:id', (req, res) => {
  const plan = db.getPlan(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: '计划不存在' });
  }

  const updated = db.updatePlan(req.params.id, req.body);
  res.json(updated);
});

app.delete('/api/plans/:id', (req, res) => {
  const result = db.deletePlan(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: '计划不存在' });
  }
  res.json({ success: true });
});

// --- Shift Type API ---

app.get('/api/shift-type', (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: '请提供 date 参数 (YYYY-MM-DD)' });
  }
  const result = getShiftType(date);
  res.json({ date, ...result });
});

app.get('/api/shift-range', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: '请提供 start 和 end 参数 (YYYY-MM-DD)' });
  }
  const result = getShiftTypesInRange(start, end);
  res.json(result);
});

// --- Shift Types metadata ---
app.get('/api/shift-types', (req, res) => {
  res.json(SHIFT_TYPES);
});

// --- Overrides API ---

app.get('/api/overrides', (req, res) => {
  res.json(db.getAllOverrides());
});

app.put('/api/overrides', (req, res) => {
  const { date, type } = req.body;
  if (!date) {
    return res.status(400).json({ error: '请提供 date' });
  }
  if (!type || !SHIFT_TYPES[type]) {
    return res.status(400).json({ error: `无效的班型，可选值: ${Object.keys(SHIFT_TYPES).join(', ')}` });
  }
  const result = db.setOverride(date, type);
  res.json(result);
});

app.delete('/api/overrides', (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: '请提供 date 参数' });
  }
  const result = db.deleteOverride(date);
  res.json(result);
});

// --- Test notification endpoint ---

app.post('/api/test-notify', async (req, res) => {
  try {
    await checkAndNotify();
    res.json({ success: true, message: '检查完成' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Cron: check for notifications every minute ---
cron.schedule('* * * * *', async () => {
  try {
    await checkAndNotify();
  } catch (err) {
    console.error('[Cron] Notification check error:', err.message);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`排班日历服务已启动: http://localhost:${PORT}`);
  console.log(`参考起始日: ${db.getConfig('reference_start_date') || '未设置'}`);
  console.log(`飞书通知: ${db.getConfig('feishu_webhook_url') ? '已配置' : '未配置'}`);

  // Run an initial notification check on startup
  checkAndNotify().catch(err => {
    console.error('[Startup] Notification check error:', err.message);
  });
});
