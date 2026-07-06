// === State ===
let currentYear, currentMonth;
let selectedDate = null;
let currentDateDetail = null;
let plans = [];
let shiftCache = {};
let shiftTypes = {}; // Shift type metadata from API

// Shift type labels
const SHIFT_LABELS = {
  day: '白班', night: '夜班', trip: '出差',
  rest: '休息', holiday: '节假日', unknown: '未知',
};

// === API Helpers ===
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// === Init ===
async function init() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth() + 1;
  selectedDate = localDateStr(now);

  await Promise.all([loadConfig(), loadPlans(), renderCalendar()]);
  bindEvents();

  // Mobile: close sidebar when clicking overlay
  document.getElementById('overlay').addEventListener('click', () => {
    closeSidebar();
    hideModal('settingsModal');
    hideModal('planDetailModal');
    hideModal('dateDetailModal');
  });
}

// === Config ===
async function loadConfig() {
  try {
    const config = await api('/api/config');
    if (config.reference_start_date) {
      document.getElementById('refDate').value = config.reference_start_date;
    }
    if (config.feishu_webhook_url) {
      document.getElementById('webhookUrl').value = config.feishu_webhook_url;
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

async function saveSettings() {
  const refDate = document.getElementById('refDate').value;
  const webhookUrl = document.getElementById('webhookUrl').value;

  try {
    await api('/api/config', {
      method: 'PUT',
      body: JSON.stringify({
        reference_start_date: refDate || undefined,
        feishu_webhook_url: webhookUrl || undefined,
      }),
    });
    hideModal('settingsModal');
    shiftCache = {};
    await renderCalendar();
    alert('设置已保存！');
  } catch (err) {
    alert('保存失败：' + err.message);
  }
}

// === Plans ===
async function loadPlans() {
  try {
    plans = await api('/api/plans');
    renderPlanList();
  } catch (err) {
    console.error('Failed to load plans:', err);
  }
}

function renderPlanList() {
  const container = document.getElementById('planList');
  if (plans.length === 0) {
    container.innerHTML = '<p class="empty-hint">暂无计划，点击日历日期创建</p>';
    return;
  }

  container.innerHTML = plans.map(p => {
    const deadline = new Date(p.deadline);
    const dateStr = deadline.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const isOverdue = deadline < new Date();
    const shiftInfo = shiftCache[p.deadline.slice(0, 10)];
    const shiftClass = 'plan-' + (shiftInfo?.type || 'unknown');

    return `
      <div class="plan-card ${shiftClass}" onclick="editPlan('${p.id}')">
        <div class="plan-card-content">
          <div class="plan-card-title" style="${isOverdue ? 'text-decoration: line-through; color: #999;' : ''}">
            ${isOverdue ? '✓ ' : ''}${escapeHtml(p.title)}
          </div>
          <div class="plan-card-deadline">
            📅 ${dateStr} · ⏰ 提前${p.reminder_minutes}分钟
            ${p.notified ? ' · 已提醒' : ''}
          </div>
        </div>
        <button class="plan-card-delete" onclick="event.stopPropagation(); deletePlan('${p.id}')" title="删除">🗑</button>
      </div>
    `;
  }).join('');
}

async function savePlan() {
  const id = document.getElementById('planId').value;
  const title = document.getElementById('planTitle').value.trim();
  const description = document.getElementById('planDesc').value.trim();
  const deadline = document.getElementById('planDeadline').value;
  const reminderMinutes = parseInt(document.getElementById('planReminder').value);

  if (!title || !deadline) {
    alert('请填写标题和截止时间');
    return;
  }

  const body = { title, description, deadline, reminder_minutes: reminderMinutes };

  try {
    if (id) {
      await api(`/api/plans/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/plans', { method: 'POST', body: JSON.stringify(body) });
    }
    resetForm();
    await loadPlans();
    await renderCalendar();
  } catch (err) {
    alert('保存失败：' + err.message);
  }
}

function editPlan(id) {
  const plan = plans.find(p => p.id === id);
  if (!plan) return;

  document.getElementById('planId').value = plan.id;
  document.getElementById('planTitle').value = plan.title;
  document.getElementById('planDesc').value = plan.description || '';
  document.getElementById('planDeadline').value = plan.deadline;
  document.getElementById('planReminder').value = plan.reminder_minutes;
  document.getElementById('formTitle').textContent = '编辑计划';

  document.getElementById('planForm').scrollIntoView({ behavior: 'smooth' });

  // On mobile, close sidebar after selecting
  if (window.innerWidth <= 768) {
    closeSidebar();
  }
}

async function deletePlan(id) {
  if (!confirm('确定要删除这个计划吗？')) return;
  try {
    await api(`/api/plans/${id}`, { method: 'DELETE' });
    await loadPlans();
    await renderCalendar();
  } catch (err) {
    alert('删除失败：' + err.message);
  }
}

function resetForm() {
  document.getElementById('planId').value = '';
  document.getElementById('planTitle').value = '';
  document.getElementById('planDesc').value = '';
  document.getElementById('planDeadline').value = selectedDate
    ? `${selectedDate}T18:00`
    : '';
  document.getElementById('planReminder').value = '30';
  document.getElementById('formTitle').textContent = '新建计划';
}

// === Calendar ===
async function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const year = currentYear;
  const month = currentMonth;

  document.getElementById('monthYear').textContent = `${year}年${month}月`;

  // First day of month (Monday-based: 0=Mon, ..., 6=Sun)
  const firstDay = new Date(year, month - 1, 1);
  let startDayOfWeek = firstDay.getDay() - 1;
  if (startDayOfWeek < 0) startDayOfWeek = 6;

  // Days in month
  const daysInMonth = new Date(year, month, 0).getDate();

  // Days in previous month (for filling first row)
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate();

  // Fetch shift types for visible range
  const firstVisibleDate = new Date(year, month - 2, daysInPrevMonth - startDayOfWeek + 1);
  const lastVisibleDate = new Date(year, month, 42 - startDayOfWeek - daysInMonth);
  const startStr = localDateStr(firstVisibleDate);
  const endStr = localDateStr(lastVisibleDate);

  try {
    const rangeShifts = await api(`/api/shift-range?start=${startStr}&end=${endStr}`);
    Object.assign(shiftCache, rangeShifts);
  } catch (err) {
    console.error('Failed to load shift types:', err);
  }

  const today = localDateStr(new Date());
  const planDates = new Set(plans.map(p => p.deadline.slice(0, 10)));

  let html = '';
  let dayCount = 0;

  // Previous month fill
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const d = new Date(year, month - 2, day);
    const dateStr = localDateStr(d);
    const shift = shiftCache[dateStr];
    html += renderDayCell(day, dateStr, shift, true, today, planDates);
    dayCount++;
  }

  // Current month
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    const dateStr = localDateStr(d);
    const shift = shiftCache[dateStr];
    html += renderDayCell(day, dateStr, shift, false, today, planDates);
    dayCount++;
  }

  // Next month fill (complete the last row)
  const remaining = (7 - (dayCount % 7)) % 7;
  for (let day = 1; day <= remaining; day++) {
    const d = new Date(year, month, day);
    const dateStr = localDateStr(d);
    const shift = shiftCache[dateStr];
    html += renderDayCell(day, dateStr, shift, true, today, planDates);
  }

  grid.innerHTML = html;
}

function renderDayCell(day, dateStr, shift, isOtherMonth, today, planDates) {
  let classes = ['calendar-day'];
  if (isOtherMonth) classes.push('other-month');
  if (shift?.type) classes.push('shift-' + shift.type);
  if (dateStr === today) classes.push('today');

  const label = SHIFT_LABELS[shift?.type] || '';
  const hasPlan = planDates.has(dateStr);

  return `
    <div class="${classes.join(' ')}" data-date="${dateStr}" onclick="onDayClick('${dateStr}', event)">
      <span class="day-num">${day}</span>
      <span class="shift-label">${label}</span>
      ${hasPlan ? '<span class="plan-dot"></span>' : ''}
    </div>
  `;
}

function onDayClick(dateStr, event) {
  selectedDate = dateStr;

  // Right-click or mobile: show date detail modal
  if ((event && event.type === 'contextmenu') || window.innerWidth <= 768) {
    event?.preventDefault();
    showDateDetail(dateStr);
    return;
  }

  // Desktop left-click: populate form, also show date detail
  resetForm();
  document.getElementById('planDeadline').value = `${dateStr}T18:00`;

  document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
  const cell = document.querySelector(`[data-date="${dateStr}"]`);
  if (cell) cell.classList.add('selected');
}

// === Date Detail Modal (change shift type) ===
function showDateDetail(dateStr) {
  currentDateDetail = dateStr;
  const shift = shiftCache[dateStr];
  const info = SHIFT_LABELS[shift?.type] || '未知';
  const source = shift?.source === 'override' ? '手动设置' :
    shift?.source === 'holiday' ? '法定节假日' :
    shift?.source === 'cycle' ? '自动推算' : '未设置';

  document.getElementById('dateDetailTitle').textContent = `${dateStr} 详情`;
  document.getElementById('currentShiftInfo').innerHTML =
    `<span class="shift-badge shift-${shift?.type || 'unknown'}">${info}</span> <small>(${source})</small>`;
  document.getElementById('shiftTypeSelect').value = '';

  // Show plans for this day in the modal
  const datePlans = plans.filter(p => p.deadline.slice(0, 10) === dateStr);
  let plansHtml = datePlans.map(p => {
    const d = new Date(p.deadline);
    const t = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' });
    return `<div class="plan-card" style="margin-bottom:4px;">${escapeHtml(p.title)} ⏰${t}</div>`;
  }).join('');
  if (!plansHtml) plansHtml = '<p style="color:#999;font-size:0.85rem;">当天没有计划</p>';
  document.getElementById('datePlansInModal').innerHTML = plansHtml;

  showModal('dateDetailModal');
}

async function saveShiftOverride() {
  const type = document.getElementById('shiftTypeSelect').value;
  if (!currentDateDetail) return;

  try {
    if (type === '') {
      await api(`/api/overrides?date=${currentDateDetail}`, { method: 'DELETE' });
    } else {
      await api('/api/overrides', {
        method: 'PUT',
        body: JSON.stringify({ date: currentDateDetail, type }),
      });
    }
    hideModal('dateDetailModal');
    shiftCache = {};
    await renderCalendar();
  } catch (err) {
    alert('修改失败：' + err.message);
  }
}

async function deleteShiftOverride() {
  if (!currentDateDetail) return;
  try {
    await api(`/api/overrides?date=${currentDateDetail}`, { method: 'DELETE' });
    hideModal('dateDetailModal');
    shiftCache = {};
    await renderCalendar();
  } catch (err) {
    alert('恢复失败：' + err.message);
  }
}

function showPlanDetail(dateStr, datePlans) {
  const shift = shiftCache[dateStr];
  const shiftText = SHIFT_LABELS[shift?.type] || '';
  const modal = document.getElementById('planDetailModal');

  document.getElementById('detailTitle').textContent = `${dateStr} ${shiftText}`;

  document.getElementById('detailBody').innerHTML = datePlans.map(p => {
    const deadline = new Date(p.deadline);
    const timeStr = deadline.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' });
    return `
      <div class="plan-card" style="margin-bottom:8px;" onclick="editPlanMobile('${p.id}')">
        <div class="plan-card-content">
          <div class="plan-card-title">${escapeHtml(p.title)}</div>
          <div class="plan-card-deadline">⏰ ${timeStr} · 提前${p.reminder_minutes}分钟</div>
        </div>
      </div>
    `;
  }).join('') + `
    <button class="btn btn-primary" style="width:100%;margin-top:10px;" onclick="hideModal('planDetailModal'); openSidebar(); resetForm(); document.getElementById('planDeadline').value='${dateStr}T18:00';">+ 新建计划</button>
  `;

  showModal('planDetailModal');
}

function editPlanMobile(id) {
  hideModal('planDetailModal');
  const plan = plans.find(p => p.id === id);
  if (!plan) return;

  document.getElementById('planId').value = plan.id;
  document.getElementById('planTitle').value = plan.title;
  document.getElementById('planDesc').value = plan.description || '';
  document.getElementById('planDeadline').value = plan.deadline;
  document.getElementById('planReminder').value = plan.reminder_minutes;
  document.getElementById('formTitle').textContent = '编辑计划';

  openSidebar();
  document.getElementById('planForm').scrollIntoView({ behavior: 'smooth' });
}

function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  renderCalendar();
}

function goToday() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth() + 1;
  selectedDate = localDateStr(now);
  renderCalendar();
}

// === Sidebar (mobile) ===
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('show');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

// === Modal ===
function showModal(id) {
  document.getElementById(id).classList.add('show');
  document.getElementById('overlay').classList.add('show');
}

function hideModal(id) {
  document.getElementById(id).classList.remove('show');
  document.getElementById('overlay').classList.remove('show');
}

// === Events ===
function bindEvents() {
  document.getElementById('prevMonth').addEventListener('click', () => changeMonth(-1));
  document.getElementById('nextMonth').addEventListener('click', () => changeMonth(1));
  document.getElementById('btnToday').addEventListener('click', goToday);

  document.getElementById('btnSave').addEventListener('click', savePlan);
  document.getElementById('btnCancel').addEventListener('click', resetForm);

  document.getElementById('menuBtn').addEventListener('click', openSidebar);
  document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
  document.getElementById('fabAdd').addEventListener('click', () => {
    resetForm();
    document.getElementById('planDeadline').value = `${selectedDate}T18:00`;
    openSidebar();
    document.getElementById('planForm').scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('btnSettings').addEventListener('click', () => showModal('settingsModal'));
  document.getElementById('settingsClose').addEventListener('click', () => hideModal('settingsModal'));
  document.getElementById('detailClose').addEventListener('click', () => hideModal('planDetailModal'));
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettings);

  document.getElementById('dateDetailClose').addEventListener('click', () => hideModal('dateDetailModal'));
  document.getElementById('btnSaveShift').addEventListener('click', saveShiftOverride);
  document.getElementById('btnDeleteOverride').addEventListener('click', deleteShiftOverride);

  // Right-click on calendar grid for date detail
  document.getElementById('calendarGrid').addEventListener('contextmenu', (e) => {
    const cell = e.target.closest('.calendar-day');
    if (cell) {
      onDayClick(cell.dataset.date, e);
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && !e.target.closest('input, textarea, select')) changeMonth(-1);
    if (e.key === 'ArrowRight' && !e.target.closest('input, textarea, select')) changeMonth(1);
    if (e.key === 'Escape') {
      closeSidebar();
      hideModal('settingsModal');
      hideModal('planDetailModal');
      hideModal('dateDetailModal');
    }
  });
}

// === Utils ===
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Get YYYY-MM-DD string in local timezone
function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// === Boot ===
init();
