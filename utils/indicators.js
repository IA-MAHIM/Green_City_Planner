// utils/indicators.js
// Centralized classification logic

export const COLORS = {
  low: "#16a34a",     // green
  medium: "#ca8a04",  // amber
  high: "#b91c1c",    // red
  na: "#6b7280",      // gray
};

// Wraps return in { level, color, label }
function wrap(level) {
  if (!level) return { level: "na", color: COLORS.na, label: "Unknown" };
  return { level, color: COLORS[level], label: level.charAt(0).toUpperCase() + level.slice(1) };
}

// -------------------------
// AIR QUALITY (CPCB/US EPA)
// -------------------------
export function aqiLevel(aqi) {
  if (aqi == null || isNaN(aqi)) return wrap("na");
  if (aqi <= 50) return wrap("low");
  if (aqi <= 150) return wrap("medium");
  return wrap("high");
}

// -------------------------
// TEMPERATURE (°C)
// -------------------------
export function temperatureLevel(tempC) {
  if (tempC == null || isNaN(tempC)) return wrap("na");
  if (tempC <= 24) return wrap("low");
  if (tempC <= 34) return wrap("medium");
  return wrap("high");
}

// -------------------------
// HUMIDITY (%)
// -------------------------
export function humidityLevel(rh) {
  if (rh == null || isNaN(rh)) return wrap("na");
  if (rh < 60) return wrap("low");       // comfortable
  if (rh < 80) return wrap("medium");    // slightly humid
  return wrap("high");                   // very humid → mold risk
}

// -------------------------
// WIND (m/s)
// -------------------------
export function windLevel(speed, gust) {
  const v = Math.max(speed || 0, gust || 0);
  if (v < 4) return wrap("low");
  if (v < 10) return wrap("medium");
  return wrap("high");
}

// -------------------------
// RAIN (mm)
// -------------------------
export function rainLevel(rain24h, rain1h) {
  const r = Math.max(rain24h || 0, rain1h || 0);
  if (r <= 20) return wrap("low");
  if (r <= 80) return wrap("medium");
  return wrap("high");
}

// -------------------------
// FLOOD (% risk OR rain + intensity)
// -------------------------
export function floodLevel(rain24h, intensity3h) {
  const r = Math.max(rain24h || 0, intensity3h || 0);
  if (r <= 30) return wrap("low");
  if (r <= 60) return wrap("medium");
  return wrap("high");
}

// -------------------------
// FIRE (events + dryness + VPD)
// -------------------------
export function fireLevel(events, rh, vpd) {
  if (events > 10 || (vpd > 2 && rh < 40)) return wrap("high");
  if (events > 3 || (vpd > 1 && rh < 60)) return wrap("medium");
  return wrap("low");
}

// -------------------------
// LAND HEALTH (VPD + 7d rain)
// -------------------------
export function landHealthLevel(vpd, rain7d) {
  if (vpd == null || rain7d == null) return wrap("na");
  if (vpd < 1.5 && rain7d > 10) return wrap("low");
  if (vpd < 2.5 && rain7d > 3) return wrap("medium");
  return wrap("high");
}

// -------------------------
// DROUGHT (7d rain + VPD)
// -------------------------
export function droughtLevel(rain7d, vpd) {
  if (rain7d == null || vpd == null) return wrap("na");
  if (rain7d > 20) return wrap("low");
  if (rain7d > 5) return wrap("medium");
  return wrap("high");
}

// -------------------------
// WATER LEVEL (sources)
// -------------------------
export function waterLevelStatus({ river, tide, reservoir }) {
  const vals = [river, tide, reservoir].map(v => (typeof v === "number" ? v : null));
  const v = vals.find(x => x != null);
  if (v == null) return wrap("na");
  if (v < 30) return wrap("low");
  if (v < 70) return wrap("medium");
  return wrap("high");
}
