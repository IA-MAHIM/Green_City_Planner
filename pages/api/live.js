// pages/api/live.js
// Mock live data generator. The UI polls this every 30s.
// You can swap these with real values later — just keep the same keys.

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function jitter(base, spread){ return base + (Math.random()*2 - 1) * spread; }

export default function handler(req, res) {
  // City/location (override via query if you want)
  const city = (req.query.city || 'Selected City') + '';
  const lat = parseFloat(req.query.lat ?? 23.8103);
  const lng = parseFloat(req.query.lng ?? 90.4125);

  // Slow oscillation to feel "alive"
  const now = Date.now();
  const phase = Math.sin(now / (1000 * 60 * 60));

  // --- Air ---
  const aqi  = clamp(Math.round(jitter(140 + phase*20, 18)), 0, 500);   // CPCB scale
  const pm10 = clamp(Math.round(jitter(80 + phase*15, 12)), 0, 600);

  // --- Weather ---
  // Return temp in K on purpose (like OpenWeather) to prove our normalizer works.
  const tempK = clamp(jitter(293 + phase*2, 1.5), 268, 318); // ~20°C baseline
  const humidity = clamp(Math.round(jitter(55 + phase*10, 8)), 5, 100);
  const rainfall = clamp(Math.round(Math.max(0, jitter(12 + (phase+1)*6, 10))), 0, 300);

  // Optional feels-like (C) if you want to display it elsewhere
  const heatIndex = clamp(Math.round((tempK - 273.15) + Math.max(0, (humidity-40)/20)),  -5, 60);

  // --- Risk/Water ---
  const floodRisk   = clamp(Math.round(jitter(22 + (rainfall/300)*60, 10)), 0, 100);
  const droughtRisk = clamp(Math.round(18 - rainfall/20 + (Math.random()*6-3)), 0, 100);
  const waterQuality= clamp(Math.round(85 - (pm10/8) - (rainfall/12) + (Math.random()*6-3)), 0, 100);

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    city, lat, lng,
    aqi, pm10,
    temp: Number(tempK.toFixed(2)),  // Kelvin
    tempUnit: 'K',
    heatIndex,                       // °C (optional)
    rainfall, floodRisk, droughtRisk, waterQuality,
    timestamp: new Date().toISOString()
  });
}
