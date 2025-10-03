// utils/indicators.js
// Correct US AQI mapping, gust-first wind, and fire logic that uses event counts first
// (w/ VPD & RH as fallback). Land & Drought tuned to show variation across climates.

export const COLORS = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#ef4444",
  na: "#6b7280",
};

export const UNKNOWN_INFO = { label: "NA", color: COLORS.na, level: "na" };

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function info(level) {
  const map = {
    low: { label: "Low", color: COLORS.low, level: "low" },
    medium: { label: "Medium", color: COLORS.medium, level: "medium" },
    high: { label: "High", color: COLORS.high, level: "high" },
    na: { label: "NA", color: COLORS.na, level: "na" },
  };
  return map[level] || map.na;
}

export const ensureInfo = (o) => (o && o.level ? o : UNKNOWN_INFO);

// ---------- PM2.5 (µg/m³) -> US AQI helper ----------
export function pm25ToAQI(pmRaw) {
  const pm = num(pmRaw);
  if (pm == null) return null;
  // EPA breakpoints for PM2.5 (24h), AQI 0–500
  const br = [
    [0.0, 12.0,   0,  50],
    [12.1, 35.4, 51, 100],
    [35.5, 55.4,101, 150],
    [55.5,150.4,151, 200],
    [150.5,250.4,201,300],
    [250.5,350.4,301,400],
    [350.5,500.4,401,500],
  ];
  for (const [Cl, Ch, Il, Ih] of br) {
    if (pm >= Cl && pm <= Ch) {
      return Math.round(((Ih - Il) / (Ch - Cl)) * (pm - Cl) + Il);
    }
  }
  return 500; // cap at max hazardous
}

// ---------- Air Quality (accepts AQI or raw PM2.5) ----------
// Prefer AQI if provided; else compute from PM2.5.
// ---------- Air Quality (accepts AQI or raw PM2.5) ----------
// Prefer the higher-severity signal: max(AQI, AQI_from_PM2.5)
export function aqiLevel(aqiRaw, pm25Raw = null) {
  const fromAQI = num(aqiRaw);
  const fromPM  = pm25Raw != null ? pm25ToAQI(pm25Raw) : null;

  // choose the value that implies *worse* air (higher AQI)
  const aqi = [fromAQI, fromPM].filter((v) => Number.isFinite(v)).reduce((m, v) => Math.max(m, v), -Infinity);
  if (!Number.isFinite(aqi)) return info("na");

  if (aqi <= 50)  return info("low");
  if (aqi <= 100) return info("medium");
  return info("high");
}


// ---------- Temperature (°C) ----------
export function temperatureLevel(rawC) {
  const t = num(rawC);
  if (t == null) return info("na");
  if (t <= 12) return info("low");
  if (t <= 30) return info("medium");
  return info("high");
}

// ---------- Humidity (%) ----------
export function humidityLevel(raw) {
  const rh = num(raw);
  if (rh == null) return info("na");
  if (rh <= 40) return info("low");
  if (rh <= 65) return info("medium");
  return info("high");
}

// ---------- Wind (m/s, gust-first) ----------
export function windLevel(speedRaw, gustRaw) {
  const v = num(gustRaw) ?? num(speedRaw);
  if (v == null) return info("na");
  if (v <= 5) return info("low");
  if (v <= 10) return info("medium");
  return info("high");
}

// ---------- Rain (mm) ----------
export function rainLevel(r24, r1h) {
  const d = num(r24);
  const h = num(r1h);
  if (d == null && h == null) return info("na");
  const dmm = d ?? 0;
  const hmm = h ?? 0;
  if (hmm >= 10 || dmm >= 50) return info("high");
  if (hmm >= 2 || dmm >= 10) return info("medium");
  return info("low");
}

// ---------- Flood (proxy from rain) ----------
export function floodLevel(r24, i3h) {
  const d = num(r24);
  const i = num(i3h);
  if (d == null && i == null) return info("na");
  const dmm = d ?? 0;
  const imm = i ?? 0;
  if (imm >= 30 || dmm >= 80) return info("high");
  if (imm >= 10 || dmm >= 30) return info("medium");
  return info("low");
}

// ---------- Fire ----------
// Primary: event counts from FIRMS (within 250 km).
// Fallback: VPD & RH if no event data.
export function fireLevel(eventsRaw, rhRaw, vpdRaw) {
  const nEvents = num(eventsRaw);
  const rh = num(rhRaw);
  const vpd = num(vpdRaw);

  if (nEvents != null) {
    if (nEvents === 0) return info("low");
    if (nEvents >= 5) return info("high");   // 5+ events => high
    return info("medium");                   // 1–4 events
  }

  // fallback meteorological risk
  if (vpd != null && vpd > 2.2) return info("high");
  if (rh != null && rh < 25) return info("high");
  if ((vpd != null && vpd >= 1.2) || (rh != null && rh < 35)) return info("medium");
  return info("low");
}

// ---------- Land Health (VPD & 7-day rain) ----------
export function landHealthLevel(vpdRaw, r7Raw) {
  const vpd = num(vpdRaw);
  const r7 = num(r7Raw);
  if (vpd == null && r7 == null) return info("na");

  // Strong stress
  if ((vpd != null && vpd >= 2.0) || (r7 != null && r7 <= 1 && vpd != null && vpd >= 1.6)) {
    return info("high");
  }

  // Moderate stress
  if ((vpd != null && vpd >= 1.0) || (r7 != null && r7 <= 5)) {
    // If decent rain & mild VPD, keep Low
    if ((r7 != null && r7 >= 10) && (vpd != null && vpd < 1.2)) return info("low");
    return info("medium");
  }

  return info("low");
}

// ---------- Drought (7-day rain & VPD) ----------
export function droughtLevel(r7Raw, vpdRaw) {
  const r7 = num(r7Raw);
  const vpd = num(vpdRaw);
  if (r7 == null && vpd == null) return info("na");

  if ((r7 != null && r7 <= 2 && vpd != null && vpd >= 2.0) ||
      (r7 === 0 && vpd != null && vpd >= 1.6)) {
    return info("high");
  }
  if ((r7 != null && r7 <= 10) || (vpd != null && vpd >= 1.2 && vpd < 2.0)) {
    return info("medium");
  }
  return info("low");
}

// ---------- Water Level (disabled) ----------
export function waterLevelStatus() {
  return info("na");
}
