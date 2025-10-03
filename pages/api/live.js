// pages/api/live.js
// Live city data: US AQI, wind (gust-first), 24h & 7-day rain, VPD (kPa),
// and Fire Events via NASA FIRMS (CSV). All fields match pages/solution.js usage.

export default async function handler(req, res) {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: "lat/lng required" });

  const num = (v) => (Number.isFinite(+v) ? +v : null);

  // Haversine distance (km)
  const distKm = (la1, lo1, la2, lo2) => {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(la2 - la1);
    const dLon = toRad(lo2 - lo1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  // Parse simple CSV (no quoted commas expected in FIRMS)
  const parseCSV = (text) => {
    const lines = text.trim().split(/\r?\n/);
    if (!lines.length) return { header: [], rows: [] };
    const header = lines[0].split(",");
    const rows = lines.slice(1).map((ln) => {
      const parts = ln.split(",");
      const obj = {};
      header.forEach((h, i) => (obj[h] = parts[i]));
      return obj;
    });
    return { header, rows };
  };

  // Try multiple public FIRMS endpoints (24h VIIRS/SNPP/NOAA subset). If all fail, return null.
  async function fetchFirms(lat, lng) {
    const FIRMS_URLS = [
      // Global 24h VIIRS (often public)
      "https://firms.modaps.eosdis.nasa.gov/active_fire/c7/csv/VIIRS_SNPP_NRT_Global_24h.csv",
      "https://firms.modaps.eosdis.nasa.gov/active_fire/c7/csv/VIIRS_NOAA20_NRT_Global_24h.csv",
      // MODIS (backup)
      "https://firms.modaps.eosdis.nasa.gov/active_fire/c7/csv/MODIS_C6_1_Global_24h.csv",
    ];

    for (const url of FIRMS_URLS) {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) continue;
        const text = await r.text();
        const { rows } = parseCSV(text);
        if (!rows.length) continue;

        // Common columns: latitude, longitude, acq_date, acq_time
        let count = 0;
        let nearestKm = null;
        let lastDate = null;

        for (const row of rows) {
          const la = num(row.latitude);
          const lo = num(row.longitude);
          if (la == null || lo == null) continue;

          const d = distKm(+lat, +lng, la, lo);
          if (d <= 250) {
            count++;
            if (nearestKm == null || d < nearestKm) nearestKm = d;
            const dt = row.acq_date || null; // e.g., "2025-03-24"
            if (dt) lastDate = dt;
          }
        }
        return { count, nearestKm, lastDate };
      } catch {
        // try next URL
      }
    }
    return null;
  }

  try {
    // ---------------- Weather & AQI (Open-Meteo) ----------------
    const weatherURL =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m` +
      `&hourly=precipitation,wind_speed_10m,wind_gusts_10m` +
      `&daily=precipitation_sum` +
      `&past_days=7&forecast_days=1&timezone=auto`;

    const airURL =
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${lat}&longitude=${lng}` +
      `&hourly=us_aqi,pm2_5,nitrogen_dioxide,ozone` +
      `&past_days=1&timezone=auto`;

    const [wRes, aRes, firms] = await Promise.allSettled([
      fetch(weatherURL),
      fetch(airURL),
      fetchFirms(lat, lng),
    ]);

    // Weather parse
    let temp = null,
      rh = null,
      windSpeedNow = null,
      windGustNow = null,
      rain1h = null,
      rain24h = null,
      rain7d = null,
      vpd = null;

    if (wRes.status === "fulfilled" && wRes.value.ok) {
      const weather = await wRes.value.json();
      const wc = weather?.current || {};
      temp = num(wc.temperature_2m); // °C
      rh = num(wc.relative_humidity_2m); // %
      windSpeedNow = num(wc.wind_speed_10m); // m/s
      windGustNow = num(wc.wind_gusts_10m); // m/s
      rain1h = num(wc.precipitation); // mm

      const hPrecip = weather?.hourly?.precipitation || [];
      const hGusts = weather?.hourly?.wind_gusts_10m || [];
      const hSpeed = weather?.hourly?.wind_speed_10m || [];
      const n = Math.max(hPrecip.length, hGusts.length, hSpeed.length);
      const last = n - 1;

      if (hPrecip.length) {
        const start = Math.max(0, hPrecip.length - 24);
        rain24h = hPrecip
          .slice(start)
          .reduce((s, v) => s + (Number.isFinite(+v) ? +v : 0), 0);
      }

      if (windGustNow == null && hGusts.length) windGustNow = num(hGusts[last]);
      if (windGustNow == null) windGustNow = windSpeedNow ?? (hSpeed.length ? num(hSpeed[last]) : null);

      const dPrecip = weather?.daily?.precipitation_sum || [];
      rain7d = dPrecip.length
        ? dPrecip.slice(-7).reduce((s, v) => s + (Number.isFinite(+v) ? +v : 0), 0)
        : null;

      // VPD kPa from T(°C) & RH(%)
      if (temp != null && rh != null) {
        const es = 0.6108 * Math.exp((17.27 * temp) / (temp + 237.3));
        vpd = +(es * (1 - rh / 100)).toFixed(2);
      }
    }

    // Air parse
    let aqi = null,
      pm25 = null,
      no2 = null,
      o3 = null;

    if (aRes.status === "fulfilled" && aRes.value.ok) {
      const air = await aRes.value.json();
      const aqiArr = air?.hourly?.us_aqi || [];
      const pm25Arr = air?.hourly?.pm2_5 || [];
      const no2Arr = air?.hourly?.nitrogen_dioxide || [];
      const o3Arr = air?.hourly?.ozone || [];
      const m = Math.min(
        aqiArr.length || Infinity,
        pm25Arr.length || Infinity,
        no2Arr.length || Infinity,
        o3Arr.length || Infinity
      );
      const ai = m ? m - 1 : -1;
      if (ai >= 0) {
        aqi = num(aqiArr[ai]); // already US AQI 0–500
        pm25 = num(pm25Arr[ai]); // μg/m³
        no2 = num(no2Arr[ai]); // μg/m³
        o3 = num(o3Arr[ai]); // μg/m³
      }
    }

    // FIRMS fire events (count & nearest), with graceful fallback to 0 if failed
    let fireEvents = 0;
    let nearestFireKm = null;
    let lastFireDate = null;

    if (firms.status === "fulfilled" && firms.value) {
      fireEvents = firms.value.count ?? 0;
      nearestFireKm = firms.value.nearestKm ?? null;
      lastFireDate = firms.value.lastDate ?? null;
    }

    const out = {
      // Air
      aqi, pm25, no2, o3,

      // Weather
      temp, tempUnit: "C", rh,
      rain1h, rain24h,
      floodIntensity3h: null,

      // Wind
      windSpeedMs: windSpeedNow,
      windGustMs: windGustNow,

      // Environmentals
      fireEvents,
      vpd,
      rain7d,
      waterQuality: null,

      // Water (kept NA by UI)
      riverGauge: "N/A",
      tide: "N/A",
      reservoir: "N/A",

      // Optional diagnostics (not used by UI, safe to ignore)
      nearestFireKm,
      lastFireDate,
    };

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(out);
  } catch (e) {
    console.error("live fetch failed", e);
    return res.status(500).json({ error: "live fetch failed" });
  }
}
