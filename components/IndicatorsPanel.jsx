import { useEffect, useMemo, useState } from 'react';
import { fetchWeather, fetchAirQuality, fetchFiresNear } from '@/lib/dataProviders';

function aqiFromPm25(pm) {
  const br = [
    [0.0, 12.0, 0, 50], [12.1, 35.4, 51, 100], [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200], [150.5, 250.4, 201, 300], [250.5, 350.4, 301, 400], [350.5, 500.4, 401, 500]
  ];
  for (const [cl, ch, al, ah] of br) {
    if (pm >= cl && pm <= ch) return Math.round(((ah - al) / (ch - cl)) * (pm - cl) + al);
  }
  return 500;
}

function riskBadge(level) {
  const color = level === 'Low' ? '#10b981' : level === 'Moderate' ? '#f59e0b' : '#ef4444';
  return (
    <span className="badge" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', borderColor: color }}>
      {level} risk
    </span>
  );
}

export default function IndicatorsPanel({ city, hideTop = false, compact = false }) {
  const [weather, setWeather] = useState(null);
  const [aq, setAq] = useState(null);
  const [fires, setFires] = useState([]);

  const [show, setShow] = useState({
    air: true, rain: true, flood: true, fire: true,
    temp: true, humidity: true, wind: true,
    land: true, drought: true, water: true
  });

  const lat = city?.lat, lng = city?.lng;

  useEffect(() => {
    if (!lat || !lng) return;
    (async () => {
      try {
        const [w, a, f] = await Promise.all([
          fetchWeather(lat, lng),
          fetchAirQuality(lat, lng),
          fetchFiresNear(lat, lng)
        ]);
        setWeather(w);
        setAq(a);
        setFires(f);
      } catch (e) { console.error(e); }
    })();
  }, [lat, lng]);

  const last24hPrecip = useMemo(() => {
    const arr = weather?.hourly?.precipitation || [];
    if (!arr.length) return null;
    const last = arr.slice(Math.max(0, arr.length - 24));
    return Number(last.reduce((a, b) => a + (b || 0), 0).toFixed(2));
  }, [weather]);

  const currentIdx = useMemo(() => {
    const t = weather?.hourly?.time || [];
    return t.length ? t.length - 1 : -1;
  }, [weather]);

  const t = currentIdx >= 0 ? weather?.hourly?.temperature_2m?.[currentIdx] : null;
  const rh = currentIdx >= 0 ? weather?.hourly?.relative_humidity_2m?.[currentIdx] : null;
  const wind = currentIdx >= 0 ? weather?.hourly?.wind_speed_10m?.[currentIdx] : null;
  const wind_dir = currentIdx >= 0 ? weather?.hourly?.wind_direction_10m?.[currentIdx] : null;
  const gusts = currentIdx >= 0 ? weather?.hourly?.wind_gusts_10m?.[currentIdx] : null;

  const pm25 = aq?.pm2_5; const no2 = aq?.nitrogen_dioxide; const o3 = aq?.ozone;
  const aqi = pm25 != null ? aqiFromPm25(pm25) : null;

  const lastHourPrecip = (() => {
    const arr = weather?.hourly?.precipitation || [];
    if (!arr.length) return null;
    return arr[arr.length - 1];
  })();

  const floodLevel = last24hPrecip != null ? (last24hPrecip > 50 ? 'High' : last24hPrecip > 20 ? 'Moderate' : 'Low') : 'Unknown';

  const threeHourIntensity = (() => {
    const arr = weather?.hourly?.precipitation || [];
    if (!arr.length) return null;
    const last3 = arr.slice(Math.max(0, arr.length - 3));
    const sum = last3.reduce((a, b) => a + (b || 0), 0);
    return Number(sum.toFixed(2));
  })();

  const diaRange = (() => {
    const mxArr = weather?.daily?.temperature_2m_max || [];
    const mnArr = weather?.daily?.temperature_2m_min || [];
    if (!mxArr.length || !mnArr.length) return null;
    const mx = mxArr[mxArr.length - 1];
    const mn = mnArr[mnArr.length - 1];
    return Number((mx - mn).toFixed(1));
  })();

  const sevenDayRain = (() => {
    const arr = weather?.hourly?.precipitation || [];
    if (!arr.length) return null;
    const last = arr.slice(Math.max(0, arr.length - 24 * 7));
    return Number(last.reduce((a, b) => a + (b || 0), 0).toFixed(1));
  })();

  function toggle(key) { setShow(s => ({ ...s, [key]: !s[key] })); }

  const sectionGap = compact ? 8 : 12;  // tighter gaps

  return (
    <div className="content-wrap" style={{ justifyContent: 'center' }}>
      <div className="card" style={{ flex: '1 1 420px' }}>
        {!hideTop && (
          <div className="sticky-actions">
            <span className="badge">Dashboard</span>
            <span className="badge">City: {city?.name || '—'}</span>
            <span className="badge">Lat/Lng: {lat?.toFixed?.(3)}, {lng?.toFixed?.(3)}</span>
          </div>
        )}

        {/* Switches (UPPERCASE labels) */}
        <div className="card" style={{ marginTop: 10 }}>
          <div className="switches">
            <label className="switch"><input type="checkbox" checked={show.air} onChange={() => toggle('air')} /> <span>AIR</span></label>
            <label className="switch"><input type="checkbox" checked={show.rain} onChange={() => toggle('rain')} /> <span>RAIN</span></label>
            <label className="switch"><input type="checkbox" checked={show.flood} onChange={() => toggle('flood')} /> <span>FLOOD</span></label>
            <label className="switch"><input type="checkbox" checked={show.fire} onChange={() => toggle('fire')} /> <span>FIRE</span></label>
            <label className="switch"><input type="checkbox" checked={show.temp} onChange={() => toggle('temp')} /> <span>TEMP</span></label>
            <label className="switch"><input type="checkbox" checked={show.humidity} onChange={() => toggle('humidity')} /> <span>HUMIDITY</span></label>
            <label className="switch"><input type="checkbox" checked={show.wind} onChange={() => toggle('wind')} /> <span>WIND</span></label>
            <label className="switch"><input type="checkbox" checked={show.land} onChange={() => toggle('land')} /> <span>LAND</span></label>
            <label className="switch"><input type="checkbox" checked={show.drought} onChange={() => toggle('drought')} /> <span>DROUGHT</span></label>
            <label className="switch"><input type="checkbox" checked={show.water} onChange={() => toggle('water')} /> <span>WATER</span></label>
          </div>
        </div>

        {/* Sections with reduced gaps */}
        {show.air && (
          <div className="card" style={{ marginTop: sectionGap }}>
            <h3>Air Quality</h3>
            <div className="grid-3">
              <div className="kpi"><div>AQI (PM2.5)</div><div><b>{aqi ?? 'N/A'}</b></div></div>
              <div className="kpi"><div>PM2.5 μg/m³</div><div><b>{pm25 ?? 'N/A'}</b></div></div>
              <div className="kpi"><div>NO₂ μg/m³</div><div><b>{no2 ?? 'N/A'}</b></div></div>
              <div className="kpi"><div>O₃ μg/m³</div><div><b>{o3 ?? 'N/A'}</b></div></div>
            </div>
          </div>
        )}

        {show.rain && (
          <div className="card" style={{ marginTop: sectionGap }}>
            <h3>Rain</h3>
            <div className="grid-3">
              <div className="kpi"><div>Last hour (mm)</div><div><b>{lastHourPrecip ?? 'N/A'}</b></div></div>
              <div className="kpi"><div>Last 24h (mm)</div><div><b>{last24hPrecip ?? 'N/A'}</b></div></div>
              <div className="kpi"><div>Risk</div><div><b>{floodLevel} {riskBadge(floodLevel)}</b></div></div>
            </div>
          </div>
        )}

        {show.flood && (
          <div className="card" style={{ marginTop: sectionGap }}>
            <h3>Flood</h3>
            <div className="grid-3">
              <div className="kpi"><div>24h Rain (mm)</div><div><b>{last24hPrecip ?? 'N/A'}</b></div></div>
              <div className="kpi"><div>3h Intensity (mm/h)</div><div><b>{threeHourIntensity ?? 'N/A'}</b></div></div>
              <div className="kpi"><div>Risk Level</div><div><b>{floodLevel} {riskBadge(floodLevel)}</b></div></div>
            </div>
          </div>
        )}

        {show.fire && (
          <div className="card" style={{ marginTop: sectionGap }}>
            <h3>Fire</h3>
            <div className="grid-3">
              <div className="kpi"><div>Active events (250km)</div><div><b>{fires.length}</b></div></div>
              <div className="kpi"><div>Nearest (km)</div><div><b>{fires[0]?.distance_km?.toFixed?.(0) ?? '—'}</b></div></div>
              <div className="kpi"><div>Last update</div><div><b>{fires[0]?.date ?? '—'}</b></div></div>
            </div>
          </div>
        )}

        {show.temp && (
          <div className="card" style={{ marginTop: sectionGap }}>
            <h3>Temperature</h3>
            <div className="grid-3">
              <div className="kpi"><div>Current (°C)</div><div><b>{t ?? 'N/A'}</b></div></div>
              <div className="kpi"><div>Feels/Heat Index</div><div><b>{t != null && rh != null ? (t + (rh > 60 ? 2 : 0)).toFixed(1) : 'N/A'}</b></div></div>
              <div className="kpi"><div>Diurnal range est.</div><div><b>{diaRange ?? 'N/A'}</b></div></div>
            </div>
          </div>
        )}

        {show.humidity && (
          <div className="card" style={{ marginTop: sectionGap }}>
            <h3>Humidity</h3>
            <div className="grid-3">
              <div className="kpi"><div>RH %</div><div><b>{rh ?? 'N/A'}</b></div></div>
              <div className="kpi"><div>Dew point (°C)</div><div><b>{t != null && rh != null ? (t - ((100 - rh) / 5)).toFixed(1) : 'N/A'}</b></div></div>
              <div className="kpi"><div>VPD est. (kPa)</div><div><b>{t != null && rh != null ? ((1 - rh / 100) * 3.2).toFixed(2) : 'N/A'}</b></div></div>
            </div>
          </div>
        )}

        {show.wind && (
          <div className="card" style={{ marginTop: sectionGap }}>
            <h3>Wind</h3>
            <div className="grid-3">
              <div className="kpi"><div>Speed (m/s)</div><div><b>{wind ?? 'N/A'}</b></div></div>
              <div className="kpi"><div>Gusts (m/s)</div><div><b>{gusts ?? 'N/A'}</b></div></div>
              <div className="kpi"><div>Direction (°)</div><div><b>{wind_dir ?? 'N/A'}</b></div></div>
            </div>
          </div>
        )}

        {show.land && (
          <div className="card" style={{ marginTop: sectionGap }}>
            <h3>Land Health</h3>
            <div className="grid-3">
              <div className="kpi"><div>Green cover (visual)</div><div><b>See map & satellite context</b></div></div>
              <div className="kpi"><div>VPD Stress (kPa)</div><div><b>{t != null && rh != null ? ((1 - rh / 100) * 3.2).toFixed(2) : 'N/A'}</b></div></div>
              <div className="kpi"><div>7-day rain (mm)</div><div><b>{sevenDayRain ?? 'N/A'}</b></div></div>
            </div>
          </div>
        )}

        {show.drought && (
          <div className="card" style={{ marginTop: sectionGap }}>
            <h3>Drought</h3>
            <div className="grid-3">
              <div className="kpi"><div>7-day rain total</div><div><b>{sevenDayRain ?? 'N/A'}</b></div></div>
              <div className="kpi"><div>VPD est.</div><div><b>{t != null && rh != null ? ((1 - rh / 100) * 3.2).toFixed(2) : 'N/A'}</b></div></div>
              <div className="kpi"><div>Risk Level</div><div><b>{floodLevel} {riskBadge(floodLevel)}</b></div></div>
            </div>
          </div>
        )}

        {show.water && (
          <div className="card" style={{ marginTop: sectionGap }}>
            <h3>Water Level</h3>
            <div className="grid-3">
              <div className="kpi"><div>River gauge</div><div><b>N/A</b></div></div>
              <div className="kpi"><div>Tide/Coast</div><div><b>N/A</b></div></div>
              <div className="kpi"><div>Reservoir</div><div><b>N/A</b></div></div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
