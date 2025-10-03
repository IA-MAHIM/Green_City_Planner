// pages/api/live.js
// Mock live data generator with jitter.
// Provides all keys expected by Solution.js.

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function jitter(base, spread) {
  return base + (Math.random() * 2 - 1) * spread;
}

export default function handler(req, res) {
  const city = (req.query.city || 'Selected City') + '';
  const lat = parseFloat(req.query.lat ?? 23.8103);
  const lng = parseFloat(req.query.lng ?? 90.4125);

  const now = Date.now();
  const phase = Math.sin(now / (1000 * 60 * 60));

  // --- Air ---
  const aqi = clamp(Math.round(jitter(70 + phase * 20, 15)), 0, 500);
  const pm25 = clamp(jitter(20 + phase * 5, 5), 0, 200);
  const no2 = clamp(jitter(25 + phase * 3, 3), 0, 200);
  const o3 = clamp(jitter(40 + phase * 4, 4), 0, 200);
  const pm10 = clamp(jitter(60 + phase * 10, 8), 0, 600);

  // --- Weather ---
  const tempK = clamp(jitter(298 + phase * 2, 1.5), 268, 318); // Kelvin
  const rh = clamp(Math.round(jitter(60 + phase * 10, 8)), 5, 100);

  const rain1h = clamp(Math.round(Math.max(0, jitter(1 + phase * 2, 2))), 0, 50);
  const rain24h = clamp(Math.round(rain1h * 3 + jitter(10 + phase * 5, 10)), 0, 300);
  const floodIntensity3h = clamp(jitter(rain1h / 2, 2), 0, 50);

  const heatIndexC = clamp((tempK - 273.15) + Math.max(0, (rh - 40) / 20), -5, 60);

  // --- Risks ---
  const fireEvents = Math.random() > 0.7 ? Math.floor(Math.random() * 5) + 1 : 0;
  const vpd = +(Math.max(0, (1 - rh / 100) * (tempK - 273.15) / 10)).toFixed(2);
  const rain7d = clamp(rain24h * 3 + jitter(20, 10), 0, 300);

  const floodRisk = clamp(Math.round(jitter(20 + (rain24h / 300) * 60, 10)), 0, 100);
  const droughtRisk = clamp(Math.round(30 - rain7d / 20 + (Math.random() * 6 - 3)), 0, 100);
  const waterQuality = clamp(Math.round(90 - (pm10 / 10) - (rain24h / 12) + (Math.random() * 6 - 3)), 0, 100);

  // --- Wind ---
  const windSpeedMs = clamp(jitter(5 + phase * 1, 1), 0, 25);
  const windGustMs = clamp(windSpeedMs + jitter(3, 2), 0, 40);
  const windDirDeg = clamp(jitter(180, 90), 0, 360);

  // --- Water level placeholders ---
  const riverGauge = 'N/A';
  const tide = 'N/A';
  const reservoir = 'N/A';

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    city, lat, lng,
    aqi, pm25, no2, o3, pm10,
    temp: +tempK.toFixed(2),
    tempUnit: 'K',
    heatIndexC,
    rh,
    rain1h, rain24h, floodIntensity3h,
    fireEvents, vpd, rain7d,
    floodRisk, droughtRisk, waterQuality,
    windSpeedMs, windGustMs, windDirDeg,
    riverGauge, tide, reservoir,
    timestamp: new Date().toISOString()
  });
}
