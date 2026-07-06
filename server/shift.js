const { getConfig, getAllOverrides } = require('./db');
const { getHolidays } = require('./holidays');

const WORK_DAYS = 10;
const REST_DAYS = 4;
const CYCLE_DAYS = WORK_DAYS + REST_DAYS; // 14

// Valid shift types
const SHIFT_TYPES = {
  day: { label: '白班', category: 'work' },
  night: { label: '夜班', category: 'work' },
  trip: { label: '出差', category: 'work' },
  rest: { label: '休息', category: 'rest' },
  holiday: { label: '节假日', category: 'rest' },
};

/**
 * Get the effective shift type for a date.
 * Priority: User override > Holiday > Cycle calculation
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {object} { type: string, label: string, category: string, source: string, cycleDay: number|null }
 */
function getShiftType(dateStr) {
  // 1. Check user overrides (highest priority)
  const userOverrides = getAllOverrides();
  if (userOverrides[dateStr]) {
    const type = userOverrides[dateStr];
    const info = SHIFT_TYPES[type] || { label: type, category: 'unknown' };
    return {
      type,
      label: info.label,
      category: info.category,
      source: 'override',
      cycleDay: null,
    };
  }

  // 2. Check built-in holidays
  const holidays = getHolidays();
  if (holidays[dateStr]) {
    const holidayData = holidays[dateStr];
    // Support both old format (string type) and new format ({ type, name })
    const holidayEntry = typeof holidayData === 'string'
      ? { type: holidayData, name: SHIFT_TYPES[holidayData]?.label || holidayData }
      : holidayData;
    const info = SHIFT_TYPES[holidayEntry.type] || { label: holidayEntry.type, category: 'unknown' };
    return {
      type: holidayEntry.type,
      label: holidayEntry.name || info.label,
      category: info.category,
      source: 'holiday',
      cycleDay: null,
    };
  }

  // 3. Cycle calculation
  const refDate = getConfig('reference_start_date');
  if (!refDate) {
    return { type: 'unknown', label: '未知', category: 'unknown', source: 'none', cycleDay: null };
  }

  const target = new Date(dateStr + 'T00:00:00');
  const reference = new Date(refDate + 'T00:00:00');
  const diffMs = target.getTime() - reference.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let position = diffDays % CYCLE_DAYS;
  if (position < 0) position += CYCLE_DAYS;

  const cycleDay = position + 1;

  if (position < WORK_DAYS) {
    return { type: 'day', label: '白班', category: 'work', source: 'cycle', cycleDay };
  } else {
    return { type: 'rest', label: '休息', category: 'rest', source: 'cycle', cycleDay };
  }
}

/**
 * Get shift types for a range.
 */
function getShiftTypesInRange(startDate, endDate) {
  const result = {};
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;
    result[dateStr] = getShiftType(dateStr);
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
