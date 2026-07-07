// === State ===
let currentYear, currentMonth;
let selectedDate = null;
let plans = [];
let shiftCache = {};
let worklogCache = {};
let navigating = false;

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const SHIFT_LABELS = {
  start: '进班', day: '白班', end: '出班',
  night: '夜班', trip: '出差', holiday_overtime: '节假日加班',
  rest: '休息', holiday: '节假日', unknown: '未知',
};

// === Widget Registry ===
const WIDGETS = [
  // 右栏卡片
  { id: 'overview',  containerId: 'overviewCard',  title: '📊 今日概览', zone: 'right', fullWidth: false },
  { id: 'cycle',     containerId: 'cycleCard',     title: '🔄 班型周期', zone: 'right', fullWidth: false },
  { id: 'worklog',   containerId: 'worklogCard',   title: '📝 工作日志', zone: 'right', fullWidth: true  },
  { id: 'dayPlans',  containerId: 'dayPlansCard',  title: '📋 当天计划', zone: 'right', fullWidth: false },
  { id: 'upcoming',  containerId: 'upcomingCard',  title: '🔜 近期计划', zone: 'right', fullWidth: false },
  { id: 'allPlans',  containerId: 'allPlansCard',  title: '📋 全部计划', zone: 'right', fullWidth: true  },
  // 左栏模块
  { id: 'miniCal',   containerId: 'miniCalendar',  title: '📅 日历',     zone: 'left',  fullWidth: false },
  { id: 'yearCal',   containerId: 'yearCalendar',  title: '🗓️ 万年历',   zone: 'left',  fullWidth: false },
  { id: 'lunar',     containerId: 'lunarCard',     title: '📅 老黄历',   zone: 'left',  fullWidth: false },
  { id: 'legend',    containerId: 'legendBox',     title: '📌 图例',     zone: 'left',  fullWidth: false },
];

// Runtime layout state (loaded from server on init)
let layoutState = {
  right: { order: ['overview', 'cycle', 'worklog', 'dayPlans', 'upcoming', 'allPlans'], hidden: [] },
  left:  { order: ['miniCal', 'yearCal', 'lunar'], hidden: ['legend'] },
};

let isEditMode = false;

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

// === Layout Persistence ===
async function loadLayout() {
  try {
    const data = await api('/api/layout');
    if (data.right) layoutState.right = data.right;
    if (data.left) layoutState.left = data.left;
  } catch (err) {
    console.warn('Failed to load layout, using defaults:', err.message);
  }
}

async function saveLayout() {
  try {
    await api('/api/layout', {
      method: 'PUT',
      body: JSON.stringify(layoutState),
    });
  } catch (err) {
    console.warn('Failed to save layout:', err.message);
  }
}

// === Layout Arrangement ===
function arrangeCards() {
  const grid = document.querySelector('.cards-grid');
  if (!grid) return;
  const order = layoutState.right.order || [];
  order.forEach(widgetId => {
    const w = WIDGETS.find(w => w.id === widgetId && w.zone === 'right');
    if (!w) return;
    const el = document.getElementById(w.containerId);
    if (el) grid.appendChild(el); // appendChild MOVES existing node
  });
  applyVisibility();
  updateCardFullWidth();
}

// Left panel: reorder widgets below the calendar core
// Calendar core (cal-nav, mini-weekdays, miniCalendar, legendBox, left-actions) stays fixed.
// Widgets below (yearCalendar, lunarCard) are placed after the divider in order.
function arrangeLeftPanel() {
  const panel = document.getElementById('leftPanel');
  if (!panel) return;
  const order = layoutState.left.order || [];

  // Find the divider that separates widget zone from calendar core
  let divider = document.getElementById('widgetZoneDivider');
  if (!divider) {
    // Create one if it doesn't exist
    divider = document.createElement('div');
    divider.className = 'section-divider';
    divider.id = 'widgetZoneDivider';
    const leftActions = document.querySelector('#leftPanel .left-actions');
    if (leftActions) leftActions.after(divider);
    else panel.appendChild(divider);
  }

  // Remove all elements after the divider (except widgets we'll re-add)
  let next = divider.nextElementSibling;
  while (next) {
    const toRemove = next;
    next = next.nextElementSibling;
    // Don't remove widgets, just remove spacers/dividers
    if (toRemove.classList.contains('section-divider') && toRemove.id !== 'widgetZoneDivider') {
      toRemove.remove();
    }
  }

  // Place widgets in order after the divider
  let prevEl = divider;
  order.forEach((widgetId, idx) => {
    // Skip miniCal and legend — they're in the fixed calendar core
    if (widgetId === 'miniCal' || widgetId === 'legend') return;
    const w = WIDGETS.find(w => w.id === widgetId && w.zone === 'left');
    if (!w || !w.containerId) return;
    const el = document.getElementById(w.containerId);
    if (!el) return;

    // Add a divider between widgets
    if (idx > 0 && order.slice(0, idx).some(id => id !== 'miniCal' && id !== 'legend')) {
      const sep = document.createElement('div');
      sep.className = 'section-divider widget-section-divider';
      prevEl.after(sep);
      prevEl = sep;
    }

    prevEl.after(el);
    prevEl = el;
  });

  applyVisibility();
}

function applyVisibility() {
  WIDGETS.forEach(w => {
    const el = document.getElementById(w.containerId);
    if (!el) return;
    const zoneState = layoutState[w.zone];
    const isHidden = zoneState && zoneState.hidden && zoneState.hidden.includes(w.id);
    if (isEditMode) {
      el.style.display = '';
      el.style.opacity = isHidden ? '0.35' : '';
      el.classList.toggle('widget-hidden', isHidden);
    } else {
      el.style.display = isHidden ? 'none' : '';
      el.style.opacity = '';
      el.classList.remove('widget-hidden');
    }
  });
}

function updateCardFullWidth() {
  WIDGETS.forEach(w => {
    if (w.zone !== 'right') return;
    const el = document.getElementById(w.containerId);
    if (!el) return;
    el.classList.toggle('card-full', w.fullWidth);
  });
}

// === Edit Mode ===
function toggleEditMode() {
  isEditMode = !isEditMode;
  document.body.classList.toggle('edit-mode', isEditMode);
  const btn = document.getElementById('btnEditLayout');
  if (btn) {
    btn.classList.toggle('active', isEditMode);
    btn.textContent = isEditMode ? '✏️' : '✏️';
  }

  if (isEditMode) {
    injectEditControls();
    applyVisibility();
    renderWidgetDrawer();
  } else {
    removeEditControls();
    applyVisibility();
    saveLayout();
  }
}

function injectEditControls() {
  WIDGETS.forEach(w => {
    const el = document.getElementById(w.containerId);
    if (!el) return;

    // Make draggable
    el.setAttribute('draggable', 'true');

    // Find or create a header for controls
    let header = el.querySelector('.card-header');
    if (!header) {
      // Left panel widgets don't have .card-header — create a minimal one
      header = document.createElement('div');
      header.className = 'card-header';
      header.style.cssText = 'padding:4px 8px;display:flex;align-items:center;justify-content:space-between;';
      el.insertBefore(header, el.firstChild);
    } else {
      // Save original header styles before modifying
      if (!header.dataset.originalCssText) {
        header.dataset.originalCssText = header.style.cssText;
      }
      header.style.cssText = 'padding:4px 8px;display:flex;align-items:center;justify-content:space-between;';
    }

    // Drag handle
    const handle = document.createElement('span');
    handle.className = 'card-drag-handle';
    handle.innerHTML = '⠿';
    handle.title = '拖动排序';
    header.insertBefore(handle, header.firstChild);

    // Hide/show toggle
    const zoneState = layoutState[w.zone];
    const isHidden = zoneState && zoneState.hidden && zoneState.hidden.includes(w.id);
    const toggle = document.createElement('button');
    toggle.className = 'card-toggle-btn';
    toggle.innerHTML = isHidden ? '👁' : '🙈';
    toggle.title = isHidden ? '显示模块' : '隐藏模块';
    toggle.onclick = (e) => { e.stopPropagation(); toggleWidget(w.id); };
    header.appendChild(toggle);
  });
}

function removeEditControls() {
  document.querySelectorAll('.card-drag-handle, .card-toggle-btn').forEach(el => el.remove());
  // Remove draggable and restore styles on headers
  WIDGETS.forEach(w => {
    const el = document.getElementById(w.containerId);
    if (!el) return;
    el.removeAttribute('draggable');
    // Restore original header styles
    const header = el.querySelector(':scope > .card-header');
    if (header) {
      if (header.dataset.originalCssText !== undefined) {
        header.style.cssText = header.dataset.originalCssText;
        delete header.dataset.originalCssText;
      }
      // Remove injected minimal headers from left panel widgets
      if (w.zone === 'left' && header.children.length === 0) {
        header.remove();
      }
    }
  });
}

function toggleWidget(widgetId) {
  const w = WIDGETS.find(w => w.id === widgetId);
  if (!w) return;
  const zoneState = layoutState[w.zone];
  if (!zoneState.hidden) zoneState.hidden = [];

  const idx = zoneState.hidden.indexOf(widgetId);
  if (idx === -1) {
    zoneState.hidden.push(widgetId);
  } else {
    zoneState.hidden.splice(idx, 1);
  }
  applyVisibility();
  // Update only the toggle button for this widget (not full rebuild)
  updateWidgetToggleButton(w);
  renderWidgetDrawer();
}

function updateWidgetToggleButton(w) {
  const el = document.getElementById(w.containerId);
  if (!el) return;
  const toggle = el.querySelector('.card-toggle-btn');
  if (!toggle) return;
  const zoneState = layoutState[w.zone];
  const isHidden = zoneState && zoneState.hidden && zoneState.hidden.includes(w.id);
  toggle.innerHTML = isHidden ? '👁' : '🙈';
  toggle.title = isHidden ? '显示模块' : '隐藏模块';
}

function renderWidgetDrawer() {
  const container = document.getElementById('widgetDrawerList');
  if (!container) return;

  const rightHidden = layoutState.right.hidden || [];
  const leftHidden = layoutState.left.hidden || [];

  const zoneLabels = { right: '右侧面板', left: '左侧面板' };

  let html = '';
  ['right', 'left'].forEach(zone => {
    const zoneWidgets = WIDGETS.filter(w => w.zone === zone);
    const hidden = zone === 'right' ? rightHidden : leftHidden;
    html += `<div style="font-size:0.8rem;color:var(--color-text-secondary);margin:10px 0 6px;font-weight:600;">${zoneLabels[zone]}</div>`;
    html += zoneWidgets.map(w => {
      const isHidden = hidden.includes(w.id);
      return `
        <div class="widget-drawer-item" style="${isHidden ? 'opacity:0.5;' : ''}">
          <span>
            <span style="margin-right:8px;">${isHidden ? '👁' : '✅'}</span>
            ${w.title}
            ${w.fullWidth ? '<small style="color:#999;margin-left:4px;">全宽</small>' : ''}
          </span>
          <button class="btn btn-small ${isHidden ? 'btn-primary' : 'btn-secondary'}"
                  id="toggle-${w.id}">${isHidden ? '显示' : '隐藏'}</button>
        </div>
      `;
    }).join('');
  });

  container.innerHTML = html;

  // Bind toggle buttons
  ['right', 'left'].forEach(zone => {
    const zoneWidgets = WIDGETS.filter(w => w.zone === zone);
    zoneWidgets.forEach(w => {
      const btn = document.getElementById('toggle-' + w.id);
      if (btn) btn.addEventListener('click', () => toggleWidget(w.id));
    });
  });
}

// === Drag & Drop ===
function initDragDrop() {
  setupPanelDragDrop(document.querySelector('.cards-grid'), 'right');
  setupPanelDragDrop(document.getElementById('leftPanel'), 'left');
}

function setupPanelDragDrop(panel, zone) {
  if (!panel) return;

  // Desktop Drag Events
  panel.addEventListener('dragstart', (e) => {
    if (!isEditMode) { e.preventDefault(); return; }
    const card = findWidgetCard(e.target, zone);
    if (!card) return;
    const widget = WIDGETS.find(w => w.containerId === card.id);
    if (!widget) return;
    e.dataTransfer.setData('text/plain', widget.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });

  panel.addEventListener('dragend', (e) => {
    const card = findWidgetCard(e.target, zone);
    if (card) card.classList.remove('dragging');
    panel.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
  });

  panel.addEventListener('dragover', (e) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = findWidgetCard(e.target, zone);
    if (!card) return;
    panel.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
    card.classList.add('drag-over');
  });

  panel.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!isEditMode) return;
    const dragId = e.dataTransfer.getData('text/plain');
    const targetCard = findWidgetCard(e.target, zone);
    if (!targetCard) return;
    const targetWidget = WIDGETS.find(w => w.containerId === targetCard.id);
    if (!targetWidget || targetWidget.zone !== zone) return;

    const order = layoutState[zone].order;
    const fromIdx = order.indexOf(dragId);
    const toIdx = order.indexOf(targetWidget.id);
    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
      order.splice(fromIdx, 1);
      const adjToIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
      order.splice(adjToIdx, 0, dragId);
    }
    if (zone === 'right') {
      arrangeCards();
    } else {
      arrangeLeftPanel();
    }
    applyVisibility();
    saveLayout();
  });

  // Touch Events for mobile
  let touchDragId = null;
  let touchStartY = 0;
  let touchStartTime = 0;

  panel.addEventListener('touchstart', (e) => {
    if (!isEditMode) return;
    const card = findWidgetCard(e.target, zone);
    if (!card) return;
    const widget = WIDGETS.find(w => w.containerId === card.id);
    if (!widget) return;
    touchDragId = widget.id;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    card.classList.add('dragging');
  }, { passive: true });

  panel.addEventListener('touchmove', (e) => {
    if (!touchDragId) return;
    // Allow scrolling if not dragging far enough
    if (Math.abs(e.touches[0].clientY - touchStartY) < 10) return;
    e.preventDefault();
    panel.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
    const target = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    const card = target ? target.closest('.card, .mini-legend, .mini-calendar, .year-calendar, .lunar-card') : null;
    if (card) card.classList.add('drag-over');
  }, { passive: false });

  panel.addEventListener('touchend', (e) => {
    if (!touchDragId) return;
    const dragCard = panel.querySelector('.dragging');
    if (dragCard) dragCard.classList.remove('dragging');
    panel.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));

    const touch = e.changedTouches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const targetCard = target ? target.closest('.card, .mini-legend, .mini-calendar, .year-calendar, .lunar-card') : null;
    if (targetCard && touchDragId) {
      const targetWidget = WIDGETS.find(w => w.containerId === targetCard.id);
      if (targetWidget && targetWidget.zone === zone) {
        const order = layoutState[zone].order;
        const fromIdx = order.indexOf(touchDragId);
        const toIdx = order.indexOf(targetWidget.id);
        if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
          order.splice(fromIdx, 1);
          const adjToIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
          order.splice(adjToIdx, 0, touchDragId);
        }
      }
    }
    touchDragId = null;
    if (zone === 'right') arrangeCards();
    else arrangeLeftPanel();
    applyVisibility();
    removeEditControls();
    injectEditControls();
    saveLayout();
  });
}

// Helper: find the widget card element from any child element
function findWidgetCard(el, zone) {
  if (!el) return null;
  // For right panel: look for .card ancestor
  if (zone === 'right') {
    return el.closest('.card');
  }
  // For left panel: look for specific widget containers
  return el.closest('.mini-legend, .mini-calendar, .year-calendar, .lunar-card');
}

// === Init ===
async function init() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth() + 1;
  selectedDate = localDateStr(now);

  await Promise.all([loadConfig(), loadPlans(), loadCalendarData(), loadLayout()]);
  renderMiniCalendar();
  renderYearCalendar();
  arrangeCards();
  arrangeLeftPanel();
  await selectDate(selectedDate, false);
  bindEvents();
  initDragDrop();
}

// === Config ===
async function loadConfig() {
  try {
    const config = await api('/api/config');
    if (config.reference_start_date) {
      document.getElementById('refDate').value = config.reference_start_date;
      document.getElementById('refDate').dataset.original = config.reference_start_date;
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
  const oldRefDate = document.getElementById('refDate').dataset.original || '';

  try {
    await api('/api/config', {
      method: 'PUT',
      body: JSON.stringify({
        reference_start_date: refDate || undefined,
        feishu_webhook_url: webhookUrl || undefined,
      }),
    });
    hideModal('settingsModal');

    // Only reload calendar data if reference date changed
    if (refDate !== oldRefDate) {
      await loadCalendarData();
      renderMiniCalendar();
      renderYearCalendar();
      renderPlanList();
      await selectDate(selectedDate, false);
    }
    alert('设置已保存！');
  } catch (err) {
    alert('保存失败：' + err.message);
  }
}

// === Data Loading ===
async function loadPlans() {
  try {
    plans = await api('/api/plans');
    renderPlanList();
  } catch (err) {
    console.error('Failed to load plans:', err);
  }
}

async function loadCalendarData() {
  // Load shifts for the full year to cover year calendar + navigation
  const start = new Date(currentYear, 0, 1);
  const end = new Date(currentYear, 11, 31);
  const startStr = localDateStr(start);
  const endStr = localDateStr(end);

  try {
    const rangeShifts = await api(`/api/shift-range?start=${startStr}&end=${endStr}`);
    shiftCache = rangeShifts;
    document.getElementById('miniCalendar').classList.remove('load-error');
  } catch (err) {
    console.warn('⚠️ 加载排班数据失败，日历可能显示不完整：', err.message);
    document.getElementById('miniCalendar').classList.add('load-error');
  }

  try {
    const logs = await api(`/api/worklogs/range?start=${startStr}&end=${endStr}`);
    worklogCache = logs;
  } catch (err) {
    console.warn('⚠️ 加载工作日志失败：', err.message);
  }
}

// === Mini Calendar ===
function renderMiniCalendar() {
  const grid = document.getElementById('miniCalendar');
  document.getElementById('monthYear').textContent = `${currentYear}年${currentMonth}月`;

  const firstDay = new Date(currentYear, currentMonth - 1, 1);
  let startDayOfWeek = firstDay.getDay() - 1;
  if (startDayOfWeek < 0) startDayOfWeek = 6;

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth - 1, 0).getDate();
  const today = localDateStr(new Date());

  let html = '';

  // Previous month fill
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const d = new Date(currentYear, currentMonth - 2, day);
    const dateStr = localDateStr(d);
    html += renderMiniDay(day, dateStr, true, today);
  }

  // Current month
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(currentYear, currentMonth - 1, day);
    const dateStr = localDateStr(d);
    html += renderMiniDay(day, dateStr, false, today);
  }

  // Next month fill
  const totalCells = startDayOfWeek + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let day = 1; day <= remaining; day++) {
    const d = new Date(currentYear, currentMonth, day);
    const dateStr = localDateStr(d);
    html += renderMiniDay(day, dateStr, true, today);
  }

  grid.innerHTML = html;
}

function renderMiniDay(day, dateStr, isOtherMonth, today) {
  const shift = shiftCache[dateStr];
  const cls = ['mini-day'];
  if (isOtherMonth) cls.push('other-month');
  if (shift?.type) cls.push('shift-' + shift.type);
  if (shift?.holiday) cls.push('is-holiday');
  if (dateStr === today) cls.push('today');
  if (dateStr === selectedDate) cls.push('selected');

  const hasWorklog = !!(worklogCache[dateStr] && worklogCache[dateStr].items && worklogCache[dateStr].items.length > 0);
  const dayPlans = plans.filter(p => p.deadline.slice(0, 10) === dateStr);
  const planCount = dayPlans.length;

  return `
    <div class="${cls.join(' ')}" data-date="${dateStr}" onclick="onMiniDayClick('${dateStr}')">
      <div class="mini-indicators">
        ${planCount > 0 ? `<span class="mini-badge plan-badge" title="${planCount}个计划">${planCount}</span>` : ''}
        ${hasWorklog ? '<span class="mini-indicator worklog"></span>' : ''}
      </div>
      ${day}
      ${shift?.type ? `<span class="mini-shift-dot" title="${escapeHtml(shift.holiday || '')}"></span>` : ''}
    </div>
  `;
}

// === Year Calendar (left panel) ===
function renderYearCalendar() {
  const container = document.getElementById('yearCalendar');
  const weekHeaders = ['一','二','三','四','五','六','日'];

  let html = '';
  for (let m = 1; m <= 12; m++) {
    const isActive = (m === currentMonth);
    const firstDay = new Date(currentYear, m - 1, 1);
    const daysInMonth = new Date(currentYear, m, 0).getDate();
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    // Build tiny dots for the month
    let dots = '';
    // Empty cells before day 1
    for (let i = 0; i < startDow; i++) {
      dots += '<span class="ym-dot"></span>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const shift = shiftCache[dateStr];
      let dotCls = 'ym-dot';
      if (shift && shift.type) {
        dotCls += ' shift-' + shift.type;
      }
      if (shift && shift.holiday) {
        dotCls += ' is-holiday';
      }
      dots += `<span class="${dotCls}" title="${escapeHtml(shift?.holiday || '')}">${d}</span>`;
    }

    html += `
      <div class="year-month-mini ${isActive ? 'active' : ''}" onclick="jumpToMonth(${m})" title="${m}月">
        <div class="year-month-name">${m}月</div>
        <div class="year-month-dots">${dots}</div>
      </div>`;
  }

  container.innerHTML = html;
}

function jumpToMonth(month) {
  if (navigating) return;
  navigating = true;
  currentMonth = month;
  loadCalendarData().then(async () => {
    renderMiniCalendar();
    renderYearCalendar();
    await selectDate(selectedDate, false);
  }).finally(() => {
    navigating = false;
  });
}

function onMiniDayClick(dateStr) {
  if (dateStr === selectedDate) return;
  selectDate(dateStr, true);
}

// === Date Selection & Detail Loading ===
async function selectDate(dateStr, reRender) {
  selectedDate = dateStr;
  if (reRender) renderMiniCalendar();

  const d = new Date(dateStr + 'T00:00:00');
  const weekday = WEEKDAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1];
  const month = d.getMonth() + 1;
  const day = d.getDate();

  document.getElementById('detailDate').textContent = `${month}月${day}日 ${weekday}`;

  // Shift info
  const shift = shiftCache[dateStr];
  const shiftType = shift?.type || 'unknown';
  const shiftLabel = shift?.label || SHIFT_LABELS[shiftType] || '未知';
  const holidayName = shift?.holiday;
  const badge = document.getElementById('detailShiftBadge');
  badge.textContent = holidayName ? `${shiftLabel} · ${holidayName}` : shiftLabel;
  badge.className = `shift-badge shift-${shiftType}`;

  // Shift override dropdown
  const overrideVal = (shift?.source === 'override') ? shiftType : '';
  document.getElementById('detailShiftSelect').value = overrideVal;

  // Cycle (sync — uses in-memory shift data only, no worklog dependency)
  renderCycle();

  // Worklog
  try {
    const data = await api(`/api/worklogs?date=${dateStr}`);
    const log = data.log;
    const items = log ? log.items || [] : [];
    worklogCache[dateStr] = log || null;
    document.getElementById('worklogUpdated').textContent = log ? `最后更新：${log.updated_at}` : '';
    renderWorklogRows(items);
  } catch (err) {
    console.error('Failed to load worklog:', err);
    worklogCache[dateStr] = null;
    renderWorklogRows([]);
    document.getElementById('worklogUpdated').textContent = '';
  }

  // Overview (after worklog fetch — depends on fresh worklogCache, use dateStr consistently)
  renderOverview(dateStr);

  // Day plans
  renderDayPlanList(dateStr);

  // Upcoming plans
  renderUpcoming(dateStr);

  // Lunar calendar
  loadLunar(dateStr);
}

// === Day Plan List (right panel) ===
function renderDayPlanList(dateStr) {
  const container = document.getElementById('dayPlanList');
  const d = dateStr || selectedDate;
  const datePlans = plans.filter(p => p.deadline.slice(0, 10) === d);

  if (datePlans.length === 0) {
    container.innerHTML = '<p class="empty-hint">当天没有计划</p>';
    return;
  }

  container.innerHTML = datePlans.map(p => {
    const d = new Date(p.deadline);
    const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' });
    const isOverdue = d < new Date();
    return `
      <div class="day-plan-item" style="${isOverdue ? 'opacity:0.6;' : ''}">
        <span class="plan-time">⏰ ${time}</span>
        <span class="plan-title" style="${isOverdue ? 'text-decoration:line-through;' : ''}">
          ${isOverdue ? '✓ ' : ''}${escapeHtml(p.title)}
        </span>
        <button class="plan-delete" onclick="deletePlan('${p.id}')" title="删除">🗑</button>
      </div>
    `;
  }).join('');
}

// === Overview Card ===
function renderOverview(dateStr) {
  const d = dateStr || selectedDate;
  const shift = shiftCache[d];
  const shiftLabel = (shift && shift.label) || '未知';
  const cycleDay = shift ? shift.cycleDay : null;

  // Days until next rest
  let daysUntilRest;
  if (cycleDay !== null && cycleDay !== undefined) {
    if (cycleDay <= 10) {
      daysUntilRest = 11 - cycleDay;
    } else {
      daysUntilRest = 0;
    }
  } else {
    daysUntilRest = null;
  }

  const dayPlans = plans.filter(p => p.deadline.slice(0, 10) === d);
  const planCount = dayPlans.length;
  const worklog = worklogCache[d];
  const worklogCount = (worklog && worklog.items) ? worklog.items.length : 0;

  const grid = document.getElementById('overviewGrid');
  const items = [
    { value: shiftLabel, label: '今日班型' },
    { value: (cycleDay !== null && cycleDay !== undefined) ? `第 ${cycleDay} 天` : '非周期日', label: '周期位置' },
    { value: daysUntilRest !== null ? `${daysUntilRest} 天` : '—', label: '距休息' },
    { value: `${planCount} 计划 · ${worklogCount} 日志`, label: '今日事项' },
  ];

  grid.innerHTML = items.map(item => `
    <div class="overview-item">
      <div class="overview-value">${item.value}</div>
      <div class="overview-label">${item.label}</div>
    </div>
  `).join('');
}

// === Cycle Progress Card ===
function renderCycle() {
  const shift = shiftCache[selectedDate];
  const cycleDay = shift ? shift.cycleDay : null;
  const bar = document.getElementById('cycleBar');
  const label = document.getElementById('cycleLabel');

  if (cycleDay === null || cycleDay === undefined) {
    bar.innerHTML = '<p class="empty-hint" style="padding:4px 0;">当前日期不在排班周期内</p>';
    label.textContent = '';
    return;
  }

  // Compute cycle start date
  const selDate = new Date(selectedDate + 'T00:00:00');
  const cycleStart = new Date(selDate);
  cycleStart.setDate(cycleStart.getDate() - (cycleDay - 1));

  let segments = '';
  for (let i = 0; i < 14; i++) {
    const d = new Date(cycleStart);
    d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d);
    const s = shiftCache[dateStr];
    const shiftType = (s && s.type) || 'day';
    const isCurrent = (i === cycleDay - 1);

    let cls = 'cycle-segment';
    if (shiftType === 'start') cls += ' cycle-start';
    else if (shiftType === 'end') cls += ' cycle-end';
    else if (shiftType === 'rest' || shiftType === 'holiday') cls += ' cycle-rest';
    else cls += ' cycle-work';
    if (isCurrent) cls += ' cycle-current';

    const segLabel = s ? s.label : '未知';
    segments += `<div class="${cls}" title="${dateStr} · ${segLabel}"></div>`;
  }

  bar.innerHTML = segments;

  const daysPassed = cycleDay - 1;
  if (cycleDay <= 10) {
    label.textContent = `已过 ${daysPassed} 天 · 距休息还有 ${11 - cycleDay} 天`;
  } else {
    label.textContent = `已过 ${daysPassed} 天 · 正在休息中`;
  }
}

// === Lunar Calendar (老黄历) ===
async function loadLunar(dateStr) {
  try {
    const data = await api(`/api/lunar?date=${dateStr}`);
    renderLunar(data.lunar);
  } catch (err) {
    console.warn('加载老黄历失败：', err.message);
    document.getElementById('lunarBody').innerHTML = '<p class="lunar-date">—</p>';
  }
}

function renderLunar(lunar) {
  const body = document.getElementById('lunarBody');
  let html = `<p class="lunar-date">${lunar.monthCn}${lunar.dayCn}</p>`;

  if (lunar.solarTerm) {
    html += `<span class="lunar-term">🌾 ${lunar.solarTerm}</span>`;
  }

  html += `<p class="lunar-stem">
    ${lunar.stemBranch.year}年 · ${lunar.stemBranch.month}月 · ${lunar.stemBranch.day}日<br>
    🐾 属${lunar.zodiac}
  </p>`;

  html += '<div class="lunar-yi-ji">';
  html += '<div class="lunar-yi"><span class="yi-label">宜</span>';
  html += lunar.yiJi.yi.map(t => `<span class="yi-tag">${t}</span>`).join('');
  html += '</div>';
  html += '<div class="lunar-ji"><span class="ji-label">忌</span>';
  html += lunar.yiJi.ji.map(t => `<span class="ji-tag">${t}</span>`).join('');
  html += '</div></div>';

  body.innerHTML = html;
}

// === Upcoming Plans Card ===
function renderUpcoming(dateStr) {
  const container = document.getElementById('upcomingList');
  const today = dateStr || selectedDate;

  const upcomingDays = [];
  const d = new Date(today + 'T00:00:00');
  for (let i = 1; i <= 5; i++) {
    d.setDate(d.getDate() + 1);
    upcomingDays.push(localDateStr(d));
  }

  const items = [];
  for (const dateStr of upcomingDays) {
    const datePlans = plans.filter(p => p.deadline.slice(0, 10) === dateStr);
    const dd = new Date(dateStr + 'T00:00:00');
    const weekday = WEEKDAY_NAMES[dd.getDay() === 0 ? 6 : dd.getDay() - 1];
    const month = dd.getMonth() + 1;
    const day = dd.getDate();
    const shift = shiftCache[dateStr];
    const category = (shift && shift.category) || 'unknown';

    for (const plan of datePlans) {
      items.push({
        dateStr,
        dateLabel: `${month}/${day} ${weekday}`,
        category,
        title: plan.title,
      });
    }
  }

  if (items.length === 0) {
    container.innerHTML = '<p class="upcoming-empty">未来5天暂无计划</p>';
    return;
  }

  container.innerHTML = items.slice(0, 8).map(item => `
    <div class="upcoming-item" onclick="selectDate('${item.dateStr}', true)" title="跳转到 ${item.dateStr}">
      <span class="upcoming-shift-dot ${item.category}"></span>
      <span class="upcoming-date">${item.dateLabel}</span>
      <span class="upcoming-title">${escapeHtml(item.title)}</span>
    </div>
  `).join('');

  if (items.length > 8) {
    container.innerHTML += `<p class="upcoming-empty">还有 ${items.length - 8} 项…</p>`;
  }
}

// === Worklog ===
function renderWorklogRows(items) {
  const container = document.getElementById('worklogRows');
  if (!items || items.length === 0) {
    container.innerHTML = '<p class="empty-hint">暂无工作记录，点击下方按钮添加</p>';
    return;
  }

  container.innerHTML = items.map((text, i) => `
    <div class="worklog-row">
      <span class="worklog-row-num">${i + 1}.</span>
      <input type="text" class="worklog-input" value="${escapeHtml(text)}" placeholder="输入工作内容…" data-index="${i}">
      <button class="worklog-row-delete" onclick="deleteWorklogRow(${i})" title="删除此行">✕</button>
    </div>
  `).join('');

  // Focus last input if it's a new empty row
  const inputs = container.querySelectorAll('.worklog-input');
  if (inputs.length > 0 && !items[items.length - 1].trim()) {
    inputs[inputs.length - 1].focus();
  }
}

function addWorklogRow() {
  const container = document.getElementById('worklogRows');
  const inputs = container.querySelectorAll('.worklog-input');
  // If no rows exist (empty state showing hint), start fresh
  if (inputs.length === 0) {
    renderWorklogRows(['']);
    return;
  }
  const items = Array.from(inputs).map(inp => inp.value);
  items.push('');
  renderWorklogRows(items);
}

function deleteWorklogRow(index) {
  const container = document.getElementById('worklogRows');
  const inputs = container.querySelectorAll('.worklog-input');
  let items = Array.from(inputs).map(inp => inp.value);
  items.splice(index, 1);
  renderWorklogRows(items);
}

async function saveWorklog() {
  if (!selectedDate) return;

  const container = document.getElementById('worklogRows');
  const inputs = container.querySelectorAll('.worklog-input');
  const items = Array.from(inputs)
    .map(inp => inp.value.trim())
    .filter(t => t);

  try {
    const data = await api('/api/worklogs', {
      method: 'PUT',
      body: JSON.stringify({ date: selectedDate, items }),
    });

    if (data.log) {
      worklogCache[selectedDate] = {
        items: data.log.items,
        updated_at: data.log.updated_at,
      };
      document.getElementById('worklogUpdated').textContent = `最后更新：${data.log.updated_at}`;
    } else {
      delete worklogCache[selectedDate];
      document.getElementById('worklogUpdated').textContent = '';
    }

    renderMiniCalendar();
    renderOverview();
    // Re-render with saved items (removes empty trailing rows)
    renderWorklogRows(data.log ? data.log.items : []);
  } catch (err) {
    alert('保存日志失败：' + err.message);
  }
}

// === Shift Override ===
let shiftOverrideSaving = false;

async function saveShiftOverride() {
  if (!selectedDate || shiftOverrideSaving) return;
  shiftOverrideSaving = true;
  const type = document.getElementById('detailShiftSelect').value;

  try {
    if (type === '') {
      await api(`/api/overrides?date=${selectedDate}`, { method: 'DELETE' });
    } else {
      await api('/api/overrides', {
        method: 'PUT',
        body: JSON.stringify({ date: selectedDate, type }),
      });
    }
    // Reload shifts and refresh
    await loadCalendarData();
    renderMiniCalendar();
    renderYearCalendar();
    await selectDate(selectedDate, false);
  } catch (err) {
    alert('修改班型失败：' + err.message);
  } finally {
    shiftOverrideSaving = false;
  }
}

// === Plans ===
function renderPlanList() {
  const container = document.getElementById('planList');
  if (plans.length === 0) {
    container.innerHTML = '<p class="empty-hint">暂无计划</p>';
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

function openPlanForm(plan) {
  if (plan) {
    document.getElementById('planModalTitle').textContent = '编辑计划';
    document.getElementById('planId').value = plan.id;
    document.getElementById('planTitle').value = plan.title;
    document.getElementById('planDesc').value = plan.description || '';
    document.getElementById('planDeadline').value = plan.deadline;
    document.getElementById('planReminder').value = plan.reminder_minutes;
  } else {
    document.getElementById('planModalTitle').textContent = '新建计划';
    document.getElementById('planId').value = '';
    document.getElementById('planTitle').value = '';
    document.getElementById('planDesc').value = '';
    document.getElementById('planDeadline').value = `${selectedDate}T18:00`;
    document.getElementById('planReminder').value = '30';
  }
  showModal('planModal');
}

function editPlan(id) {
  const plan = plans.find(p => p.id === id);
  if (!plan) return;
  openPlanForm(plan);
}

async function savePlan() {
  const id = document.getElementById('planId').value;
  const title = document.getElementById('planTitle').value.trim();
  const description = document.getElementById('planDesc').value.trim();
  const deadline = document.getElementById('planDeadline').value;
  const reminderMinutes = parseInt(document.getElementById('planReminder').value, 10);

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
    await loadPlans();
    hideModal('planModal');
    renderMiniCalendar();
    renderOverview();
    renderDayPlanList();
    renderUpcoming();
  } catch (err) {
    alert('保存失败：' + err.message);
  }
}

async function deletePlan(id) {
  if (!confirm('确定要删除这个计划吗？')) return;
  try {
    await api(`/api/plans/${id}`, { method: 'DELETE' });
    await loadPlans();
    renderMiniCalendar();
    renderOverview();
    renderDayPlanList();
    renderUpcoming();
  } catch (err) {
    alert('删除失败：' + err.message);
  }
}

// === Month Navigation ===
async function changeMonth(delta) {
  if (navigating) return;
  navigating = true;
  try {
    currentMonth += delta;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    await loadCalendarData();
    renderMiniCalendar();
    renderYearCalendar();
    await selectDate(selectedDate, false);
  } finally {
    navigating = false;
  }
}

async function goToday() {
  if (navigating) return;
  navigating = true;
  try {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth() + 1;
    const today = localDateStr(now);

    await loadCalendarData();
    renderMiniCalendar();
    renderYearCalendar();
    await selectDate(today, true);
  } finally {
    navigating = false;
  }
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

  document.getElementById('btnSaveWorklog').addEventListener('click', saveWorklog);
  document.getElementById('btnAddWorklogRow').addEventListener('click', addWorklogRow);
  document.getElementById('detailShiftSelect').addEventListener('change', saveShiftOverride);

  document.getElementById('btnAddPlan').addEventListener('click', () => openPlanForm(null));
  document.getElementById('btnAddPlanAll').addEventListener('click', () => openPlanForm(null));
  document.getElementById('btnSavePlan').addEventListener('click', savePlan);
  document.getElementById('btnCancelPlan').addEventListener('click', () => hideModal('planModal'));
  document.getElementById('planModalClose').addEventListener('click', () => hideModal('planModal'));

  document.getElementById('btnSettings').addEventListener('click', () => showModal('settingsModal'));
  document.getElementById('settingsClose').addEventListener('click', () => hideModal('settingsModal'));
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettings);

  document.getElementById('overlay').addEventListener('click', () => {
    hideModal('settingsModal');
    hideModal('planModal');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && !e.target.closest('input, textarea, select')) changeMonth(-1);
    if (e.key === 'ArrowRight' && !e.target.closest('input, textarea, select')) changeMonth(1);
    if (e.key === 'Escape') {
      // Close modals first before exiting edit mode
      const settingsOpen = document.getElementById('settingsModal').classList.contains('show');
      const planOpen = document.getElementById('planModal').classList.contains('show');
      if (settingsOpen || planOpen) {
        hideModal('settingsModal');
        hideModal('planModal');
        return;
      }
      if (isEditMode) { toggleEditMode(); return; }
    }
  });

  // Ctrl+S to save worklog or settings
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      const el = document.activeElement;
      if (el && el.classList.contains('worklog-input')) {
        e.preventDefault();
        saveWorklog();
      } else if (document.getElementById('settingsModal').classList.contains('show')) {
        e.preventDefault();
        saveSettings();
      }
    }
  });

  // Layout edit mode
  document.getElementById('btnEditLayout').addEventListener('click', toggleEditMode);
  document.getElementById('btnFinishEdit').addEventListener('click', toggleEditMode);
  document.getElementById('btnResetLayout').addEventListener('click', () => {
    if (!confirm('确定恢复默认布局吗？所有自定义排列将丢失。')) return;
    layoutState = {
      right: { order: ['overview', 'cycle', 'worklog', 'dayPlans', 'upcoming', 'allPlans'], hidden: [] },
      left: { order: ['miniCal', 'yearCal', 'lunar'], hidden: ['legend'] },
    };
    arrangeCards();
    arrangeLeftPanel();
    applyVisibility();
    removeEditControls();
    injectEditControls();
    renderWidgetDrawer();
    saveLayout();
  });
}

// === Utils ===
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// === Boot ===
init();
