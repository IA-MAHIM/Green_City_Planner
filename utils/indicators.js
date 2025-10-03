// utils/indicators.js
export const COLORS = {
  low:   '#16a34a', // green
  medium:'#eab308', // yellow
  high:  '#dc2626', // red
  na:    '#9ca3af', // gray
};

const asNumber = (x) => {
  const n = typeof x === 'string' ? parseFloat(x) : x;
  return Number.isFinite(n) ? n : null;
};

const badge = (label, level) => ({ label, level, color: COLORS[level] ?? COLORS.na });

// --- Air Quality (US AQI-ish buckets) ---
export function aqiLevel(aqi) {
  const v = asNumber(aqi);
  if (v === null) return badge('N/A', 'na');
  if (v <= 50)  return badge('Low', 'low');
  if (v <= 150) return badge('Medium', 'medium');
  return badge('High', 'high');
}

// --- Temperature (°C) ---
export function temperatureLevel(c) {
  const t = asNumber(c);
  if (t === null) return badge('N/A', 'na');
  if (t < 15)   return badge('Low', 'low');
  if (t <= 30)  return badge('Medium', 'medium');
  return badge('High', 'high'); // 31°C => High
}

// --- Humidity & Mold (relative humidity %) ---
export function humidityLevel(rh) {
  const v = asNumber(rh);
  if (v === null) return badge('N/A', 'na');
  if (v < 30)     return badge('Low', 'low');
  if (v <= 60)    return badge('Medium', 'medium'); // 39% => Medium
  return badge('High', 'high'); // >60–70% begins mold risk
}

// --- Rain (mm / mm/h) ---
export function rainLevel(last24h, last1h) {
  const d = asNumber(last24h) ?? 0;
  const h = asNumber(last1h) ?? 0;
  if (d >= 50 || h >= 20) return badge('High', 'high');
  if (d >= 10 || h >= 5)  return badge('Medium', 'medium');
  return badge('Low', 'low'); // 0/0 => Low
}

// --- Flood (uses intensity + totals) ---
export function floodLevel(dailyMm, intensity3h) {
  const d = asNumber(dailyMm) ?? 0;
  const i = asNumber(intensity3h) ?? 0;
  if (i >= 20 || d >= 100) return badge('High', 'high');
  if (i >= 5  || d >= 30)  return badge('Medium', 'medium');
  return badge('Low', 'low');
}

// --- Fire (events + dryness) ---
export function fireLevel(activeEvents, rh, vpd) {
  const a = asNumber(activeEvents) ?? 0;
  const R = asNumber(rh);
  const V = asNumber(vpd);
  if (a > 0 || (V >= 2.5 && R !== null && R < 30)) return badge('High', 'high');
  if ((V !== null && V >= 1.5 && R !== null && R < 40)) return badge('Medium', 'medium');
  return badge('Low', 'low'); // your case: 0 events, RH 39, VPD 1.95 => Low
}

// --- Wind & Comfort (m/s), gusts can bump one level ---
export function windLevel(speed, gust) {
  const s = asNumber(speed) ?? 0;
  const g = asNumber(gust) ?? 0;
  let level = 'low';
  if (s > 8) level = 'high';
  else if (s >= 4) level = 'medium';
  if (g > 12 && level === 'medium') level = 'high';
  return badge(level === 'low' ? 'Low' : level === 'medium' ? 'Medium' : 'High', level);
}

// --- Land Health (simple proxy using VPD + recent rain) ---
export function landHealthLevel(vpd, rain7d) {
  const V = asNumber(vpd) ?? 0;
  const R7 = asNumber(rain7d) ?? 0;
  if (V >= 2.5 && R7 === 0) return badge('High', 'high');
  if (V >= 1.5 || R7 < 5)   return badge('Medium', 'medium'); // your case => Medium
  return badge('Low', 'low');
}

// --- Drought (recent rain + VPD) ---
export function droughtLevel(rain7d, vpd) {
  const R7 = asNumber(rain7d) ?? 0;
  const V = asNumber(vpd) ?? 0;
  if (R7 === 0 && V >= 2.5) return badge('High', 'high');
  if (R7 === 0 && V >= 1.5) return badge('Medium', 'medium'); // your case => Medium
  if (R7 < 5)               return badge('Medium', 'medium');
  return badge('Low', 'low');
}

// --- Water Level (if all sources N/A) ---
export function waterLevelStatus({ river, tide, reservoir }) {
  const any = [river, tide, reservoir].some(v => v !== null && v !== 'N/A' && v !== undefined);
  return any ? badge('OK', 'low') : { label: 'Unknown', level: 'na', color: COLORS.na };
}
