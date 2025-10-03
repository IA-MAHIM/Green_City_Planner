// pages/solution.js
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import IndicatorsPanel from '@/components/IndicatorsPanel';
import dynamic from 'next/dynamic';

// Unified indicator helpers (you created this file)
import {
  aqiLevel, temperatureLevel, humidityLevel, windLevel,
  rainLevel, floodLevel, fireLevel, landHealthLevel,
  droughtLevel, waterLevelStatus, COLORS
} from '@/utils/indicators';

const CityMap = dynamic(() => import('@/components/CityMap'), { ssr: false });

function Badge({ info }) {
  if (!info) return null;
  return (
    <span
      className="px-2 py-1 rounded text-xs font-semibold"
      style={{ background: info.color, color: '#fff' }}
      title={`${info.label} level`}
    >
      {info.label.toUpperCase()}
    </span>
  );
}

export default function Solution() {
  const router = useRouter();
  const { lat, lng, name } = router.query;
  const parsed = {
    lat: lat ? +lat : null,
    lng: lng ? +lng : null,
    name: name ? decodeURIComponent(name) : ''
  };

  // --- LIVE DATA: poll /api/live every 30s (safe defaults) ---
  const [live, setLive] = useState({
    // Air
    aqi: 100, pm25: 35.3, no2: 22, o3: 69, pm10: 70,

    // Temp & humidity (NOTE: temp may be K from some APIs)
    temp: 293.15, tempUnit: 'K', heatIndexC: 31.0, rh: 39, // rh = relative humidity %

    // Rain/Flood
    rain1h: 0, rain24h: 0, floodIntensity3h: 0, floodRiskPct: null,

    // Fire / Land / Drought
    fireEvents: 0, vpd: 1.95, rain7d: 0, waterQuality: 80,

    // Wind
    windSpeedMs: 7.6, windGustMs: 12.2, windDirDeg: 355,

    // Water level sources
    riverGauge: 'N/A', tide: 'N/A', reservoir: 'N/A',

    // Location
    lat: parsed.lat ?? 21.427, lng: parsed.lng ?? 39.826, city: parsed.name || 'Selected City',
  });

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const r = await fetch('/api/live', { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json();
        if (mounted) setLive(prev => ({ ...prev, ...data }));
      } catch {}
    };
    tick(); // initial
    const iv = setInterval(tick, 30000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  // --- Helpers ---
  const asNum = (x) => (x == null ? null : +x);
  const toC = (value, unit) => {
    const v = asNum(value);
    if (v == null) return null;
    const u = (unit || '').toString().toUpperCase();
    if (u === 'C') return v;
    if (u === 'F') return (v - 32) * 5 / 9;
    if (u === 'K') return v - 273.15;
    // auto-detect if unit missing:
    if (v > 80 && v < 373) return v - 273.15;      // Kelvin-ish
    if (v > 60 && v < 140) return (v - 32) * 5/9;  // Fahrenheit-ish
    return v; // assume °C
  };

  // --- Derive all levels ONCE (unified logic) ---
  const derived = useMemo(() => {
    const tempC = toC(live.temp, live.tempUnit);
    const aqiInfo     = aqiLevel(asNum(live.aqi));
    const rainInfo    = rainLevel(asNum(live.rain24h), asNum(live.rain1h));
    const floodInfo   = floodLevel(asNum(live.rain24h), asNum(live.floodIntensity3h));
    const fireInfo    = fireLevel(asNum(live.fireEvents), asNum(live.rh), asNum(live.vpd));
    const tempInfo    = temperatureLevel(tempC);
    const humidInfo   = humidityLevel(asNum(live.rh)); // if RH not available, consider a proxy (rain/temp)
    const windInfo    = windLevel(asNum(live.windSpeedMs), asNum(live.windGustMs));
    const landInfo    = landHealthLevel(asNum(live.vpd), asNum(live.rain7d));
    const droughtInfo = droughtLevel(asNum(live.rain7d), asNum(live.vpd));
    const waterInfo   = waterLevelStatus({
      river: live.riverGauge, tide: live.tide, reservoir: live.reservoir
    });

    // Segmented Actions payload (3 items per category)
    const actions = {
      'Rain': {
        info: rainInfo,
        items: {
          low:   ['Routine drain desilting', 'Culvert inspections', 'No-garbage-in-drain messaging'],
          medium:['Pre-position pumps & sandbags', 'Clear chokepoints within 6h', 'SMS waterlogging alerts'],
          high:  ['Deploy pumps; close underpasses', 'Open shelters & evacuation routes', 'Suspend school in affected zones'],
        }[rainInfo.level]
      },
      'Air Quality': {
        info: aqiInfo,
        items: {
          low:   ['Maintain low-emission transport rules', 'Routine ambient monitoring', 'Enforce dust control at sites'],
          medium:['Low Emission Zones near schools/hospitals', 'Replace diesel gensets with solar+storage at municipal sites', 'Real-time AQ displays; trees along traffic corridors'],
          high:  ['Health alert + mask distribution (N95)', 'Restrict/highly regulate traffic in hotspots', 'Suspend top-emitting industrial activity'],
        }[aqiInfo.level]
      },
      'Fire': {
        info: fireInfo,
        items: {
          low:   ['Community drills & hydrant mapping', 'Maintain fire lanes', 'Remove dead vegetation swiftly'],
          medium:['Ban open burning during drought alerts', 'Add watchtowers & signage', 'Increase patrols/enforcement'],
          high:  ['Clear 30 m defensible space', 'Stage water tankers & crews', 'Emergency alerts & evacuation readiness'],
        }[fireInfo.level]
      },
      'Flood': {
        info: floodInfo,
        items: {
          low:   ['Maintain/update flood maps', 'Inspect levees/embankments', 'Keep outfalls unobstructed'],
          medium:['Protect wetlands; retention parks', 'Pre-position barriers & mobile pumps', 'Elevate power/telecom cabinets'],
          high:  ['Activate red-zone evacuation', 'Close underpasses/low crossings', '24/7 EOC & shelters active'],
        }[floodInfo.level]
      },
      'Heat/Temperature': {
        info: tempInfo, // 31°C => High (red)
        items: {
          low:   ['Expand cool roofs & shade canopy', 'Maintain heat early-warning systems', 'Promote green courtyards'],
          medium:['Shift outdoor work/school hours', 'Open cooling centers at peak', 'Hydration stations at markets & hubs'],
          high:  ['Activate heat emergency response', 'Checks for vulnerable households', '24/7 cooling & misting in hotspots'],
        }[tempInfo.level]
      },
      'Humidity & Mold': {
        info: humidInfo, // 39% RH => Medium
        items: {
          low:   ['Maintain ventilation systems', 'Moisture guidance for households', 'Track RH complaints dashboard'],
          medium:['Moisture audits (schools/clinics)', 'Dehumidifier subsidies for hotspots', 'Repair roof/wall leaks quickly'],
          high:  ['Temporary relocation for severe cases', 'Rapid mold remediation teams', 'Ventilation retrofits in public housing'],
        }[humidInfo.level]
      },
      'Wind & Comfort': {
        info: windInfo, // 7.6 m/s (gust 12.2) => Medium
        items: {
          low:   ['Plan ventilation corridors (prevailing wind)', 'Shade trees on pedestrian spines', 'Orient seating for comfort'],
          medium:['Windbreak rows near plazas', 'Shielded bus stops in gusty districts', 'Adjust event layouts for wind flows'],
          high:  ['Temporarily close high-wind plazas', 'Install temporary barriers/netting', 'Postpone outdoor events if unsafe'],
        }[windInfo.level]
      },
      'Land Health': {
        info: landInfo, // VPD 1.95 + 0mm/7d => Medium
        items: {
          low:   ['Green vacant lots; micro-forests', 'Mulch/compost for moisture retention', 'Plant native resilient species'],
          medium:['Erosion control on bare slopes', 'Rainwater harvesting for parks', 'Targeted soil remediation'],
          high:  ['Dust suppression & cover stockpiles', 'Restrict earthworks in peak dust/wind', 'Emergency replanting degraded plots'],
        }[landInfo.level]
      },
      'Drought': {
        info: droughtInfo, // 0mm/7d + VPD 1.95 => Medium
        items: {
          low:   ['Leak detection & repairs', 'Water-efficient fixtures incentives', 'Recharge pit upkeep & audits'],
          medium:['Odd-even non-essential use', 'Greywater & drip irrigation incentives', 'Tiered pricing to curb overuse'],
          high:  ['Ration non-essential supply', 'Tankers to critical zones', 'Rehab borewells & new sources'],
        }[droughtInfo.level]
      },
      'Water Level': {
        info: waterInfo, // Unknown if all N/A
        items: {
          low:   ['Integrate river/tide gauges to dashboard', 'Maintain pumps & backup power', 'Wayfinding for low-lying areas'],
          medium:['Elevate power/telecom cabinets', 'Pre-position barriers at outfalls', 'Clear silt at key choke points'],
          high:  ['Activate evacuation routes & signage', 'Close underpasses/low bridges', 'Open shelters; coordinate relief'],
          na:    ['Integrate river/tide gauges to dashboard', 'Maintain pumps & backup power', 'Wayfinding for low-lying areas'],
        }[waterInfo.level] || ['Integrate river/tide gauges to dashboard', 'Maintain pumps & backup power', 'Wayfinding for low-lying areas']
      },
    };

    return {
      actions,
      pieces: {
        aqiInfo, rainInfo, floodInfo, fireInfo, tempInfo, humidInfo,
        windInfo, landInfo, droughtInfo, waterInfo,
        tempC,
      }
    };
  }, [live]);

  // ---------- PDF: multi-page A4, avoid splitting last card ----------
  const ref = useRef(null);
  const [exporting, setExporting] = useState(false);

  async function exportPDF() {
    if (!ref.current) return;
    setExporting(true);
    try {
      const node = ref.current;

      const canvas = await html2canvas(node, {
        useCORS: true,
        scale: 2,
        backgroundColor: '#ffffff',
        windowWidth: node.scrollWidth,
        windowHeight: node.scrollHeight
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();   // 210 mm
      const pageHeight = pdf.internal.pageSize.getHeight(); // 297 mm

      const ratio = pageWidth / canvas.width;
      const pageCanvasHeight = pageHeight / ratio;

      const containerRect = node.getBoundingClientRect();
      const cards = Array.from(node.querySelectorAll('.card'));
      const cssToCanvas = canvas.width / node.clientWidth;

      // bottoms of .card elements in canvas px
      const breakBottoms = cards.map(el => {
        const r = el.getBoundingClientRect();
        const top = (r.top - containerRect.top);
        const bottom = top + r.height;
        return Math.round(bottom * cssToCanvas);
      }).sort((a,b)=> a-b);

      const safety = 12 * cssToCanvas; // ~12px safety margin
      let y = 0;

      while (y < canvas.height) {
        let end;

        // If the remainder fits on one page, take it all (do NOT split the last card)
        if ((canvas.height - y) <= (pageCanvasHeight - safety)) {
          end = canvas.height;
        } else {
          const target = y + pageCanvasHeight;
          end = target;
          // snap to last card-bottom before the page edge
          for (let i = breakBottoms.length - 1; i >= 0; i--) {
            if (breakBottoms[i] <= (target - safety) && breakBottoms[i] > y + 40) {
              end = breakBottoms[i];
              break;
            }
          }
        }

        const sliceHeight = Math.max(1, Math.round(end - y));
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = sliceHeight;
        const ctx = slice.getContext('2d');
        ctx.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

        const imgData = slice.toDataURL('image/jpeg', 0.92);
        const renderHeight = sliceHeight * ratio;

        if (y > 0) pdf.addPage();
        const marginBottomMm = 6; // small bottom whitespace
        const usableHeight = Math.min(renderHeight, pageHeight - marginBottomMm);
        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, usableHeight);

        y = end;
      }

      pdf.save(`Green_City_Report_${parsed.name || live.city || 'city'}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  function backToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ----- UI -----
  return (
    <div className="container">
      <div className="content-wrap" style={{ justifyContent: 'center' }}>
        <div
          className="card"
          id="solution-root"
          style={{ width: '100%', maxWidth: 1000, margin: '0 auto', padding: 20 }}
          ref={ref}
        >
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <button
              onClick={() => router.back()}
              style={{ padding: '6px 12px', fontSize: 14, borderRadius: 8, marginRight: 'auto' }}
            >
              ← Back
            </button>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 26, fontWeight: 800 }}>
              Solution Page — {parsed.name || live.city || '—'}
            </div>
            <div style={{ width: 80 }} />
          </div>

          {/* Executive Recommendations */}
          <div className="card" style={{ flex: '1 1 100%', textAlign: 'center', marginBottom: 10 }}>
            <h2 style={{ marginTop: 0, fontSize: 24 }}>
              Executive Recommendations for {parsed.name || live.city}
            </h2>
            <p style={{ marginTop: 4, marginBottom: 8, fontSize: 15 }}>
              Segmented, actionable recommendations per indicator (3 per category, level-aware).
            </p>
          </div>

          {/* Map */}
          <div className="card" style={{ flex: '1 1 100%', marginTop: 0 }}>
            <CityMap lat={parsed.lat ?? live.lat} lng={parsed.lng ?? live.lng} label={parsed.name || live.city} />
          </div>

          {/* Segmented Actions */}
          <div className="card" style={{ flex: '1 1 100%', marginTop: 12 }}>
            <h3 style={{ textAlign: 'center', marginTop: 0, marginBottom: 10, fontSize: 22 }}>
              Segmented Actions
            </h3>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <button
                className="primary"
                onClick={exportPDF}
                disabled={exporting}
                style={{ padding: '10px 20px', borderRadius: 12, fontSize: 16 }}
              >
                {exporting ? 'Exporting…' : 'Export PDF'}
              </button>
            </div>

            <div className="grid-2">
              {[
                'Rain','Air Quality','Fire','Flood',
                'Heat/Temperature','Humidity & Mold','Wind & Comfort',
                'Land Health','Drought','Water Level'
              ].map((title) => {
                const section = derived.actions[title];
                return (
                  <div className="card" key={title}>
                    <h4 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{title}</span>
                      <Badge info={section.info} />
                    </h4>
                    <ul>
                      {section.items.slice(0,3).map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Indicators at bottom (your component) */}
          <IndicatorsPanel city={parsed} />

          {/* Bottom buttons */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            <button onClick={() => router.push('/')} style={{ padding: '10px 16px', borderRadius: 12 }}>
              ← Back to Home
            </button>
            <button onClick={backToTop} style={{ padding: '10px 16px', borderRadius: 12 }}>
              ↑ Back to Top
            </button>
          </div>

          {/* Optional legend */}
          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: '#4b5563' }}>
            Legend:&nbsp;
            <span style={{ color: COLORS.low }}>Low</span> ·&nbsp;
            <span style={{ color: COLORS.medium }}>Medium</span> ·&nbsp;
            <span style={{ color: COLORS.high }}>High</span>
          </div>
        </div>
      </div>
    </div>
  );
}
