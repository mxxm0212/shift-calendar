const { getConfig, getAllOverrides } = require('./db');
const { getHolidays } = require('./holidays');

const WORK_DAYS = 10;
const REST_DAYS = 4;
const CYCLE_DAYS = WORK_DAYS + REST_DAYS; // 14

// Valid shift types
const SHIFT_TYPES = {
  start: { label: '进班', category: 'work' },
  day: { label: '白班', category: 'work' },
  end: { label: '出班', category: 'work' },
  night: { label: '夜班', category: 'work' },
  trip: { label: '出差', category: 'work' },
  holiday_overtime: { label: '节假日加班', category: 'work' },
  rest: { label: '休息', category: 'rest' },
  holiday: { label: '节假日', category: 'holiday' },
};

/**
 * Core shift computation (pure logic, no I/O).
 * Priority: User override > Holiday > Cycle calculation
 * @param {string} dateStr - YYYY-MM-DD
 * @param {object} overrides - pre-read user overrides
 * @param {string} refDate - pre-read reference start date
 * @param {object} holidays - pre-read holidays map
 * @returns {object} { type, label, category, source, cycleDay }
 */
function computeShiftType(dateStr, overrides, refDate, holidays) {
  // Compute cycleDay from date math (always available regardless of override/holiday)
  let cycleDay = null;
  if (refDate) {
    const target = new Date(dateStr + 'T00:00:00');
    const reference = new Date(refDate + 'T00:00:00');
    const diffMs = target.getTime() - reference.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let position = diffDays % CYCLE_DAYS;
    if (position < 0) position += CYCLE_DAYS;

    cycleDay = position + 1;
  }

  // 1. Check user overrides (highest priority)
  if (overrides[dateStr]) {
    const type = overrides[dateStr];
    const info = SHIFT_TYPES[type] || { label: type, category: 'unknown' };
    const result = {
      type,
      label: info.label,
      category: info.category,
      source: 'override',
      cycleDay,
    };
    // Keep holiday name from holidays data even for overridden dates
    if (holidays[dateStr]) {
      result.holiday = holidays[dateStr].name;
    }
    return result;
  }

  // 2. Cycle calculation (always runs — holidays don't interrupt the shift cycle)
  if (!refDate) {
    return { type: 'unknown', label: '未知', category: 'unknown', source: 'none', cycleDay: null };
  }

  const position = cycleDay - 1;

  let result;
  if (position === 0) {
    result = { type: 'start', label: '进班', category: 'work', source: 'cycle', cycleDay };
  } else if (position === WORK_DAYS - 1) {
    result = { type: 'end', label: '出班', category: 'work', source: 'cycle', cycleDay };
  } else if (position < WORK_DAYS) {
    result = { type: 'day', label: '白班', category: 'work', source: 'cycle', cycleDay };
  } else {
    result = { type: 'rest', label: '休息', category: 'rest', source: 'cycle', cycleDay };
  }

  // 3. Holiday overlay — keeps cycle info, adds holiday name for display
  if (holidays[dateStr]) {
    const holidayEntry = holidays[dateStr];
    result.holiday = holidayEntry.name;
  }

  return result;
}

/**
 * Get the effective shift type for a single date (reads data files).
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {object}
 */
function getShiftType(dateStr) {
  return computeShiftType(dateStr, getAllOverrides(), getConfig('reference_start_date'), getHolidays());
}

/**
 * Get shift types for a range (reads data files once).
 */
function getShiftTypesInRange(startDate, endDate) {
  const result = {};
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  // Read data once — avoid per-date disk I/O
  const overrides = getAllOverrides();
  const refDate = getConfig('reference_start_date');
  const holidays = getHolidays();

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;
    result[dateStr] = computeShiftType(dateStr, overrides, refDate, holidays);
  }

  return result;
}

module.exports = {
  WORK_DAYS,
  REST_DAYS,
  CYCLE_DAYS,
  SHIFT_TYPES,
  getShiftType,
  getShiftTypesInRange,
};
