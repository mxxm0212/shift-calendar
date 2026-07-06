const { getConfig } = require('./db');

const WORK_DAYS = 10;
const REST_DAYS = 4;
const CYCLE_DAYS = WORK_DAYS + REST_DAYS; // 14

/**
 * Get the shift type for a given date string.
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {object} { type: 'work'|'rest'|'unknown', cycleDay: number|null }
 */
function getShiftType(dateStr) {
  const refDate = getConfig('reference_start_date');
  if (!refDate) {
    return { type: 'unknown', cycleDay: null };
  }

  const target = new Date(dateStr + 'T00:00:00');
  const reference = new Date(refDate + 'T00:00:00');

  const diffMs = target.getTime() - reference.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Handle negative (dates before reference)
  let position = diffDays % CYCLE_DAYS;
  if (position < 0) position += CYCLE_DAYS;

  const cycleDay = position + 1; // 1-indexed for human readability

  if (position < WORK_DAYS) {
    return { type: 'work', cycleDay };
  } else {
    return { type: 'rest', cycleDay };
  }
}

/**
 * Get shift types for a range of dates.
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {object} Map of date string to shift info
 */
function getShiftTypesInRange(startDate, endDate) {
  const result = {};
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    result[dateStr] = getShiftType(dateStr);
  }

  return result;
}

module.exports = {
  WORK_DAYS,
  REST_DAYS,
  CYCLE_DAYS,
  getShiftType,
  getShiftTypesInRange,
};
