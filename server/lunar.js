/**
 * 农历/老黄历计算模块
 * 零外部依赖，数据覆盖 2020-2035 年
 * 参考原点：公历 1900-01-31 = 农历 1900-01-01
 */

// 农历年数据（2020-2035）
// months: 1-12月各月天数
// leapMonth: 0=无闰月, 1-12=闰几月（插在该月之后）
// leapDays: 闰月天数
// offset: 公历1900-01-31到该年正月初一的天数
const LUNAR_DATA = {
  2020: { months: [29,30,30,30,29,29,30,29,29,30,29,30], leapMonth: 4, leapDays: 29, offset: 43823 },
  2021: { months: [29,30,29,29,30,29,30,29,30,29,30,30], leapMonth: 0, leapDays: 0,  offset: 44207 },
  2022: { months: [29,30,30,29,30,29,30,29,30,29,29,30], leapMonth: 0, leapDays: 0,  offset: 44561 },
  2023: { months: [29,30,29,30,29,30,30,29,30,29,30,29], leapMonth: 2, leapDays: 29, offset: 44916 },
  2024: { months: [29,30,29,29,30,29,30,29,30,30,29,30], leapMonth: 0, leapDays: 0,  offset: 45300 },
  2025: { months: [29,30,29,30,29,29,30,29,30,29,30,29], leapMonth: 6, leapDays: 29, offset: 45654 },
  2026: { months: [29,30,29,30,30,29,30,29,29,30,29,30], leapMonth: 0, leapDays: 0,  offset: 46038 },
  2027: { months: [29,30,29,30,29,30,30,29,30,29,29,30], leapMonth: 0, leapDays: 0,  offset: 46392 },
  2028: { months: [29,29,30,29,30,29,30,30,29,30,29,30], leapMonth: 5, leapDays: 29, offset: 46746 },
  2029: { months: [30,29,30,29,30,29,29,30,29,30,29,30], leapMonth: 0, leapDays: 0,  offset: 47130 },
  2030: { months: [29,29,30,30,29,30,29,29,30,29,30,29], leapMonth: 0, leapDays: 0,  offset: 47485 },
  2031: { months: [29,30,29,30,30,29,30,29,29,30,29,30], leapMonth: 3, leapDays: 29, offset: 47839 },
  2032: { months: [29,29,30,29,30,29,30,30,29,30,29,29], leapMonth: 0, leapDays: 0,  offset: 48223 },
  2033: { months: [30,29,30,29,30,29,29,30,29,30,29,30], leapMonth: 7, leapDays: 29, offset: 48578 },
  2034: { months: [30,29,30,30,29,30,29,29,30,29,30,29], leapMonth: 0, leapDays: 0,  offset: 48962 },
  2035: { months: [29,30,29,30,30,29,30,29,30,29,29,30], leapMonth: 0, leapDays: 0,  offset: 49316 },
};

// 天干地支
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ZODIACS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

// 农历月名
const LUNAR_MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const LUNAR_DAYS = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

// 24节气约值（2020-2035年，误差±1天）
const SOLAR_TERMS = [
  { name: '小寒', month: 1, day: 6 }, { name: '大寒', month: 1, day: 20 },
  { name: '立春', month: 2, day: 4 }, { name: '雨水', month: 2, day: 19 },
  { name: '惊蛰', month: 3, day: 6 }, { name: '春分', month: 3, day: 21 },
  { name: '清明', month: 4, day: 5 }, { name: '谷雨', month: 4, day: 20 },
  { name: '立夏', month: 5, day: 5 }, { name: '小满', month: 5, day: 21 },
  { name: '芒种', month: 6, day: 6 }, { name: '夏至', month: 6, day: 21 },
  { name: '小暑', month: 7, day: 7 }, { name: '大暑', month: 7, day: 23 },
  { name: '立秋', month: 8, day: 7 }, { name: '处暑', month: 8, day: 23 },
  { name: '白露', month: 9, day: 8 }, { name: '秋分', month: 9, day: 23 },
  { name: '寒露', month: 10, day: 8 }, { name: '霜降', month: 10, day: 23 },
  { name: '立冬', month: 11, day: 7 }, { name: '小雪', month: 11, day: 22 },
  { name: '大雪', month: 12, day: 7 }, { name: '冬至', month: 12, day: 22 },
];

// 日地支宜忌简表
const DAY_YI_JI = {
  '子': { yi: ['祭祀', '祈福', '出行'], ji: ['开仓', '动土', '安葬'] },
  '丑': { yi: ['嫁娶', '开市', '入宅'], ji: ['词讼', '出行'] },
  '寅': { yi: ['出行', '会友', '订婚'], ji: ['开仓', '动土'] },
  '卯': { yi: ['嫁娶', '出行', '交易'], ji: ['安葬', '词讼'] },
  '辰': { yi: ['祭祀', '祈福', '入宅'], ji: ['栽种', '出行'] },
  '巳': { yi: ['出行', '开市', '移徙'], ji: ['嫁娶', '安葬'] },
  '午': { yi: ['祭祀', '祈福', '会友'], ji: ['开市', '动土', '词讼'] },
  '未': { yi: ['嫁娶', '交易', '入宅'], ji: ['出行', '栽种'] },
  '申': { yi: ['出行', '移徙', '开市'], ji: ['安葬', '动土', '嫁娶'] },
  '酉': { yi: ['嫁娶', '开市', '祈福'], ji: ['出行', '词讼', '动土'] },
  '戌': { yi: ['祭祀', '入宅', '出行'], ji: ['嫁娶', '栽种', '开仓'] },
  '亥': { yi: ['祈福', '交易', '移徙'], ji: ['开市', '安葬', '出行'] },
};

// ============ Core ============

const BASE_DATE = new Date(1900, 0, 31);
const SORTED_YEARS = Object.keys(LUNAR_DATA).map(Number).sort((a, b) => a - b);

function daysBetween(d1, d2) {
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

/**
 * 公历日期 → 农历日期
 */
function solarToLunar(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const offset = daysBetween(BASE_DATE, target);

  // Binary search to find the lunar year
  let lunarYear = SORTED_YEARS[0];
  for (let i = SORTED_YEARS.length - 1; i >= 0; i--) {
    if (offset >= LUNAR_DATA[SORTED_YEARS[i]].offset) {
      lunarYear = SORTED_YEARS[i];
      break;
    }
  }

  const yearData = LUNAR_DATA[lunarYear];
  let dayOffset = offset - yearData.offset;

  // Walk through months
  let lunarMonth = 1;
  let lunarDay;
  let isLeap = false;

  for (let m = 1; m <= 12; m++) {
    const dm = yearData.months[m - 1];
    if (dayOffset < dm) { lunarDay = dayOffset + 1; break; }
    dayOffset -= dm;

    if (m === yearData.leapMonth) {
      if (dayOffset < yearData.leapDays) { isLeap = true; lunarDay = dayOffset + 1; break; }
      dayOffset -= yearData.leapDays;
    }
    lunarMonth++;
  }

  return {
    year: lunarYear, month: lunarMonth, day: lunarDay, isLeap,
    yearCn: stemsBranchYear(lunarYear),
    monthCn: (isLeap ? '闰' : '') + LUNAR_MONTHS[lunarMonth - 1] + '月',
    dayCn: LUNAR_DAYS[lunarDay - 1],
  };
}

// ============ 天干地支 ============

function stemsBranchYear(lunarYear) {
  const idx = ((lunarYear - 4) % 60 + 60) % 60;
  return STEMS[idx % 10] + BRANCHES[idx % 12];
}

function stemsBranchMonth(lunarYear, lunarMonth) {
  const yearIdx = ((lunarYear - 4) % 60 + 60) % 60;
  const yearStem = yearIdx % 10;
  const monthBranch = (lunarMonth + 1) % 12;
  const stemBase = [2, 4, 6, 8, 0][yearStem % 5];
  const monthStem = (stemBase + lunarMonth - 1) % 10;
  return STEMS[monthStem] + BRANCHES[monthBranch];
}

function stemsBranchDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const base = new Date(1900, 0, 1);
  const offset = daysBetween(base, target);
  const idx = ((offset + 10) % 60 + 60) % 60;
  return STEMS[idx % 10] + BRANCHES[idx % 12];
}

function getZodiac(yearStemBranch) {
  const branch = yearStemBranch[1];
  const idx = BRANCHES.indexOf(branch);
  return idx >= 0 ? ZODIACS[idx] : '';
}

// ============ 节气 ============

function getSolarTerm(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  for (const term of SOLAR_TERMS) {
    if (term.month === m && Math.abs(term.day - d) <= 1) {
      return term.name;
    }
  }
  return null;
}

// ============ 宜忌 ============

function getDayYiJi(dayStemBranch) {
  const branch = dayStemBranch[1];
  return DAY_YI_JI[branch] || { yi: ['祭祀', '祈福'], ji: ['动土', '安葬'] };
}

// ============ 聚合 API ============

function getLunarInfo(dateStr) {
  const lunar = solarToLunar(dateStr);
  const daySb = stemsBranchDay(dateStr);
  const monthSb = stemsBranchMonth(lunar.year, lunar.month);
  const yearSb = stemsBranchYear(lunar.year);
  const zodiac = getZodiac(yearSb);
  const solarTerm = getSolarTerm(dateStr);
  const yiJi = getDayYiJi(daySb);

  return {
    yearCn: lunar.yearCn,
    monthCn: lunar.monthCn,
    dayCn: lunar.dayCn,
    isLeap: lunar.isLeap,
    stemBranch: { year: yearSb, month: monthSb, day: daySb },
    zodiac,
    solarTerm,
    yiJi,
  };
}

module.exports = {
  solarToLunar,
  stemsBranchYear,
  stemsBranchMonth,
  stemsBranchDay,
  getZodiac,
  getSolarTerm,
  getDayYiJi,
  getLunarInfo,
};
