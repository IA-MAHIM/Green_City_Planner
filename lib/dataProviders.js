// lib/dataProviders.js
const NASA_KEY = process.env.NEXT_PUBLIC_NASA_API_KEY;

// ---------- tiny cache layer (sessionStorage) ----------
function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    if (expiry && Date.now() > expiry) {
      sessionStorage.removeItem(key);
      return null;
    }
    return data;
  } catch { return null; }
}
function cacheSet(key, data, ttlMs = 5 * 60 * 1000) { // default 5 minutes
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + ttlMs }));
  } catch {}
}

// ---------- fetch with timeout ----------
async function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

// Warm the cache for a city in background (called after user picks a city)
export async function warmCityCache(lat, lng) {
  const tasks = [
    fetchNasaImagery(lat, lng, { cacheOnly: false }),
    fetchWeather(lat, lng, { cacheOnly: false }),
    fetchAirQuality(lat, lng, { cacheOnly: false }),
    fetchFiresNear(lat, lng, { cacheOnly: false }),
  ];
  try { await Promise.allSettled(tasks); } catch {}
}

export async function fetchNasaImagery(lat, lng, { cacheOnly = false } = {}) {
  const key = `nasa:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  if (cacheOnly) return null;

  // Smaller image -> faster. (dim is satellite “window” size in degrees)
  const url = `https://api.nasa.gov/planetary/earth/imagery?lon=${lng}&lat=${lat}&dim=0.06&api_key=${NASA_KEY}`;
  console.log("[NASA] imagery URL:", url);
  // Return the URL ( <img src=url> ); no need to fetch bytes here.
  cacheSet(key, url, 30 * 60 * 1000); // 30 min – imagery doesn’t change often
  return url;
}

export async function fetchWeather(lat, lng, { cacheOnly = false } = {}) {
  const key = `wx:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  if (cacheOnly) return null;

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&past_days=1&forecast_days=1&timezone=auto`;
  try {
    const r = await fetchWithTimeout(url, {}, 10000);
    const j = await r.json();
    cacheSet(key, j, 5 * 60 * 1000); // 5 min
    return j;
  } catch (e) {
    console.error("[WX] FAIL", e);
    return null;
  }
}

export async function fetchAirQuality(lat, lng, { cacheOnly = false } = {}) {
  const key = `aq:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  if (cacheOnly) return null;

  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${lat}&longitude=${lng}` +
    `&hourly=pm2_5,ozone,nitrogen_dioxide` +
    `&past_days=1&forecast_days=1&timezone=auto`;
  try {
    const r = await fetchWithTimeout(url, {}, 10000);
    const j = await r.json();
    let out = { pm2_5: null, ozone: null, nitrogen_dioxide: null };
    if (j?.hourly?.time?.length) {
      const idx = j.hourly.time.length - 1;
      out = {
        pm2_5: j.hourly.pm2_5?.[idx] ?? null,
        ozone: j.hourly.ozone?.[idx] ?? null,
        nitrogen_dioxide: j.hourly.nitrogen_dioxide?.[idx] ?? null,
      };
    }
    cacheSet(key, out, 10 * 60 * 1000); // 10 min
    return out;
  } catch (e) {
    console.error("[AQ] FAIL", e);
    return { pm2_5: null, ozone: null, nitrogen_dioxide: null };
  }
}

export async function fetchFiresNear(lat, lng, { cacheOnly = false } = {}) {
  const key = `fire:${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  if (cacheOnly) return [];

  const url = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&category=wildfires";
  try {
    const r = await fetchWithTimeout(url, {}, 10000);
    const j = await r.json();
    const out = [];
    for (const ev of j.events || []) {
      const geo = ev.geometry?.[0];
      if (!geo || !Array.isArray(geo.coordinates)) continue;
      const [lon, la] = geo.coordinates;
      const d = haversine(lat, lng, la, lon);
      if (d <= 250) out.push({ title: ev.title, date: geo.date?.slice(0, 10), distance_km: d });
    }
    out.sort((a, b) => a.distance_km - b.distance_km);
    cacheSet(key, out, 30 * 60 * 1000); // 30 min
    return out;
  } catch (e) {
    console.error("[FIRE] FAIL", e);
    return [];
  }
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
