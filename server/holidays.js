/**
 * 中国法定节假日（2026-2027 年预估）
 *
 * 每个日期存储 { type: 'holiday'|'day', name: '节日名' }
 * name 字段显示在日历上，如"国庆"、"春节"等
 * type='day' 的条目是调休上班日
 */

const HOLIDAYS = {
  // === 2026 ===
  // 元旦
  '2026-01-01': { type: 'holiday', name: '元旦' },
  '2026-01-02': { type: 'holiday', name: '元旦' },
  '2026-01-03': { type: 'holiday', name: '元旦' },

  // 春节（除夕2月16日，正月初一2月17日）
  '2026-02-14': { type: 'holiday', name: '春节' },
  '2026-02-15': { type: 'holiday', name: '除夕' },
  '2026-02-16': { type: 'holiday', name: '春节' },
  '2026-02-17': { type: 'holiday', name: '春节' },
  '2026-02-18': { type: 'holiday', name: '春节' },
  '2026-02-19': { type: 'holiday', name: '春节' },
  '2026-02-20': { type: 'holiday', name: '春节' },
  '2026-02-07': { type: 'day', name: '调休上班' },
  '2026-02-08': { type: 'day', name: '调休上班' },

  // 清明节
  '2026-04-04': { type: 'holiday', name: '清明' },
  '2026-04-05': { type: 'holiday', name: '清明' },
  '2026-04-06': { type: 'holiday', name: '清明' },

  // 劳动节
  '2026-05-01': { type: 'holiday', name: '劳动节' },
  '2026-05-02': { type: 'holiday', name: '劳动节' },
  '2026-05-03': { type: 'holiday', name: '劳动节' },
  '2026-05-04': { type: 'holiday', name: '劳动节' },
  '2026-05-05': { type: 'holiday', name: '劳动节' },
  '2026-04-26': { type: 'day', name: '调休上班' },
  '2026-05-09': { type: 'day', name: '调休上班' },

  // 端午节
  '2026-06-19': { type: 'holiday', name: '端午' },
  '2026-06-20': { type: 'holiday', name: '端午' },
  '2026-06-21': { type: 'holiday', name: '端午' },

  // 中秋节
  '2026-09-25': { type: 'holiday', name: '中秋' },
  '2026-09-26': { type: 'holiday', name: '中秋' },
  '2026-09-27': { type: 'holiday', name: '中秋' },

  // 国庆节
  '2026-10-01': { type: 'holiday', name: '国庆' },
  '2026-10-02': { type: 'holiday', name: '国庆' },
  '2026-10-03': { type: 'holiday', name: '国庆' },
  '2026-10-04': { type: 'holiday', name: '国庆' },
  '2026-10-05': { type: 'holiday', name: '国庆' },
  '2026-10-06': { type: 'holiday', name: '国庆' },
  '2026-10-07': { type: 'holiday', name: '国庆' },
  '2026-09-20': { type: 'day', name: '调休上班' },
  '2026-10-10': { type: 'day', name: '调休上班' },

  // === 2027 ===
  '2027-01-01': { type: 'holiday', name: '元旦' },
  '2027-01-02': { type: 'holiday', name: '元旦' },
  '2027-01-03': { type: 'holiday', name: '元旦' },

  // 春节（2027年正月初一2月6日）
  '2027-02-04': { type: 'holiday', name: '春节' },
  '2027-02-05': { type: 'holiday', name: '除夕' },
  '2027-02-06': { type: 'holiday', name: '春节' },
  '2027-02-07': { type: 'holiday', name: '春节' },
  '2027-02-08': { type: 'holiday', name: '春节' },
  '2027-02-09': { type: 'holiday', name: '春节' },
  '2027-02-10': { type: 'holiday', name: '春节' },
  '2027-01-30': { type: 'day', name: '调休上班' },
  '2027-01-31': { type: 'day', name: '调休上班' },

  '2027-04-04': { type: 'holiday', name: '清明' },
  '2027-04-05': { type: 'holiday', name: '清明' },
  '2027-04-06': { type: 'holiday', name: '清明' },

  '2027-05-01': { type: 'holiday', name: '劳动节' },
  '2027-05-02': { type: 'holiday', name: '劳动节' },
  '2027-05-03': { type: 'holiday', name: '劳动节' },
  '2027-05-04': { type: 'holiday', name: '劳动节' },
  '2027-05-05': { type: 'holiday', name: '劳动节' },
  '2027-04-25': { type: 'day', name: '调休上班' },
  '2027-05-08': { type: 'day', name: '调休上班' },

  '2027-06-09': { type: 'holiday', name: '端午' },
  '2027-06-10': { type: 'holiday', name: '端午' },
  '2027-06-11': { type: 'holiday', name: '端午' },

  '2027-09-15': { type: 'holiday', name: '中秋' },
  '2027-09-16': { type: 'holiday', name: '中秋' },
  '2027-09-17': { type: 'holiday', name: '中秋' },

  '2027-10-01': { type: 'holiday', name: '国庆' },
  '2027-10-02': { type: 'holiday', name: '国庆' },
  '2027-10-03': { type: 'holiday', name: '国庆' },
  '2027-10-04': { type: 'holiday', name: '国庆' },
  '2027-10-05': { type: 'holiday', name: '国庆' },
  '2027-10-06': { type: 'holiday', name: '国庆' },
  '2027-10-07': { type: 'holiday', name: '国庆' },
  '2027-09-26': { type: 'day', name: '调休上班' },
  '2027-10-09': { type: 'day', name: '调休上班' },
};

function getHolidays(userOverrides = {}) {
  return { ...HOLIDAYS, ...userOverrides };
}

module.exports = { HOLIDAYS, getHolidays };
