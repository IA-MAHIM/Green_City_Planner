// pages/solution.js
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import IndicatorsPanel from '@/components/IndicatorsPanel';
import dynamic from 'next/dynamic';
const CityMap = dynamic(() => import('@/components/CityMap'), { ssr: false });

export default function Solution() {
  const router = useRouter();
  const { lat, lng, name } = router.query;
  const parsed = {
    lat: lat ? +lat : null,
    lng: lng ? +lng : null,
    name: name ? decodeURIComponent(name) : ''
  };

  // --- LIVE DATA (poll /api/live every 30s; safe defaults if not available) ---
  const [live, setLive] = useState({
    aqi: 140, pm10: 70,
    temp: 293.15, tempUnit: 'K', // default in Kelvin (like OpenWeather)
    heatIndex: 26,
    rainfall: 10, floodRisk: 22, waterQuality: 80, droughtRisk: 10,
    lat: parsed.lat ?? 23.8103, lng: parsed.lng ?? 90.4125, city: parsed.name || 'Selected City',
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
    tick(); // first fetch
    const iv = setInterval(tick, 30000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  // ---------- ONE CONSISTENT POLICY (NO TOGGLES) ----------
  const RANGES = {
    aqi:      { low:[0,100],   medium:[101,200],  high:[201,500] }, // CPCB/India
    tempC:    { low:[-20,24],  medium:[25,34],    high:[35,60] },   // Celsius only
    rainfall: { low:[0,20],    medium:[21,80],    high:[81,300] },
    flood:    { low:[0,30],    medium:[31,60],    high:[61,100] },
    drought:  { low:[0,30],    medium:[31,60],    high:[61,100] },
    pm10:     { low:[0,50],    medium:[51,150],   high:[151,600] },
    wqi:      { low:[76,100],  medium:[51,75],    high:[0,50] },    // lower = worse
  };

  const levelBy = (v, r) => (v <= r.low[1] ? 'low' : v <= r.medium[1] ? 'medium' : 'high');

  // Robust: normalize any incoming temperature to °C.
  function normalizeTempC(value, unit) {
    if (value == null || Number.isNaN(value)) return null;
    if (unit) {
      const u = String(unit).toUpperCase();
      if (u === 'C') return value;
      if (u === 'F') return (value - 32) * 5/9;
      if (u === 'K') return value - 273.15;
    }
    // auto-detect if unit missing
    if (value > 80 && value < 373) return value - 273.15;     // Kelvin-ish
    if (value > 60 && value < 140) return (value - 32) * 5/9; // Fahrenheit-ish
    return value; // assume °C
  }

  // ---------- DYNAMIC ACTIONS (EXACTLY 3 PER CATEGORY) ----------
  function computeActions() {
    const L = {};
    const tempC = normalizeTempC(live.temp, live.tempUnit);

    // Rain
    const rainLevel = levelBy(live.rainfall ?? 0, RANGES.rainfall);
    L['Rain'] = {
      level: rainLevel,
      items: {
        low:   ['Routine drain desilting', 'Culvert inspections', 'No-garbage-in-drain messaging'],
        medium:['Pre-position pumps & sandbags', 'Clear chokepoints within 6h', 'SMS waterlogging alerts'],
        high:  ['Deploy pumps; close underpasses', 'Open shelters & evacuation routes', 'Suspend school in affected zones'],
      }[rainLevel]
    };

    // Air Quality (AQI, CPCB)
    const aqLevel = levelBy(live.aqi ?? 0, RANGES.aqi);
    L['Air Quality'] = {
      level: aqLevel,
      items: {
        low:   ['Maintain low-emission transport rules', 'Routine ambient monitoring', 'Enforce dust control at sites'],
        medium:['Low Emission Zones near schools/hospitals', 'Replace diesel gensets with solar+storage at municipal sites', 'Real-time AQ displays; trees along traffic corridors'],
        high:  ['Health alert + mask distribution (N95)', 'Restrict/highly regulate traffic in hotspots', 'Suspend top-emitting industrial activity'],
      }[aqLevel]
    };

    // Fire (composite: drought + heat)
    const fireLevel =
      (live.droughtRisk ?? 0) >= RANGES.drought.high[0] || (tempC ?? 0) >= RANGES.tempC.high[0] ? 'high' :
      (live.droughtRisk ?? 0) >= RANGES.drought.medium[0] || (tempC ?? 0) >= RANGES.tempC.medium[0] ? 'medium' :
      'low';
    L['Fire'] = {
      level: fireLevel,
      items: {
        low:   ['Community drills & hydrant mapping', 'Maintain fire lanes', 'Remove dead vegetation swiftly'],
        medium:['Ban open burning during drought alerts', 'Add watchtowers & signage', 'Increase patrols/enforcement'],
        high:  ['Clear 30 m defensible space', 'Stage water tankers & crews', 'Emergency alerts & evacuation readiness'],
      }[fireLevel]
    };

    // Flood (floodRisk)
    const floodLevel = levelBy(live.floodRisk ?? 0, RANGES.flood);
    L['Flood'] = {
      level: floodLevel,
      items: {
        low:   ['Maintain/update flood maps', 'Inspect levees/embankments', 'Keep outfalls unobstructed'],
        medium:['Protect wetlands; retention parks', 'Pre-position barriers & mobile pumps', 'Elevate power/telecom cabinets'],
        high:  ['Activate red-zone evacuation', 'Close underpasses/low crossings', '24/7 EOC & shelters active'],
      }[floodLevel]
    };

    // Heat/Temperature (ambient °C only)
    const tempLevel = levelBy(tempC ?? 0, RANGES.tempC);
    L['Heat/Temperature'] = {
      level: tempLevel,
      items: {
        low:   ['Expand cool roofs & shade canopy', 'Maintain heat early-warning systems', 'Promote green courtyards'],
        medium:['Shift outdoor work/school hours', 'Open cooling centers at peak', 'Hydration stations at markets & hubs'],
        high:  ['Activate heat emergency response', 'Checks for vulnerable households', '24/7 cooling & misting in hotspots'],
      }[tempLevel]
    };

    // Humidity & Mold (proxy: rainfall + temp)
    const humidLevel =
      (live.rainfall ?? 0) >= RANGES.rainfall.high[0] || (tempC ?? 0) >= RANGES.tempC.high[0] ? 'high' :
      (live.rainfall ?? 0) >= RANGES.rainfall.medium[0] || (tempC ?? 0) >= RANGES.tempC.medium[0] ? 'medium' :
      'low';
    L['Humidity & Mold'] = {
      level: humidLevel,
      items: {
        low:   ['Maintain ventilation systems', 'Moisture guidance for households', 'Track RH complaints dashboard'],
        medium:['Moisture audits (schools/clinics)', 'Dehumidifier subsidies for hotspots', 'Repair roof/wall leaks quickly'],
        high:  ['Temporary relocation for severe cases', 'Rapid mold remediation teams', 'Ventilation retrofits in public housing'],
      }[humidLevel]
    };

    // Wind & Comfort (proxy: PM10 + temp)
    const windLevel =
      (live.pm10 ?? 0) >= RANGES.pm10.high[0] || (tempC ?? 0) >= RANGES.tempC.high[0] ? 'high' :
      (live.pm10 ?? 0) >= RANGES.pm10.medium[0] || (tempC ?? 0) >= RANGES.tempC.medium[0] ? 'medium' :
      'low';
    L['Wind & Comfort'] = {
      level: windLevel,
      items: {
        low:   ['Plan ventilation corridors (prevailing wind)', 'Shade trees on pedestrian spines', 'Orient seating for comfort'],
        medium:['Windbreak rows near plazas', 'Shielded bus stops in gusty districts', 'Adjust event layouts for wind flows'],
        high:  ['Temporarily close high-wind plazas', 'Install temporary barriers/netting', 'Postpone outdoor events if unsafe'],
      }[windLevel]
    };

    // Land Health (drought + water quality)
    const landLevel =
      (live.droughtRisk ?? 0) >= RANGES.drought.high[0] || (live.waterQuality ?? 100) <= RANGES.wqi.high[1] ? 'high' :
      (live.droughtRisk ?? 0) >= RANGES.drought.medium[0] || (live.waterQuality ?? 100) <= RANGES.wqi.medium[1] ? 'medium' :
      'low';
    L['Land Health'] = {
      level: landLevel,
      items: {
        low:   ['Green vacant lots; micro-forests', 'Mulch/compost for moisture retention', 'Plant native resilient species'],
        medium:['Erosion control on bare slopes', 'Rainwater harvesting for parks', 'Targeted soil remediation'],
        high:  ['Dust suppression & cover stockpiles', 'Restrict earthworks in peak dust/wind', 'Emergency replanting degraded plots'],
      }[landLevel]
    };

    // Drought (droughtRisk)
    const droughtLevel = levelBy(live.droughtRisk ?? 0, RANGES.drought);
    L['Drought'] = {
      level: droughtLevel,
      items: {
        low:   ['Leak detection & repairs', 'Water-efficient fixtures incentives', 'Recharge pit upkeep & audits'],
        medium:['Odd-even non-essential use', 'Greywater & drip irrigation incentives', 'Tiered pricing to curb overuse'],
        high:  ['Ration non-essential supply', 'Tankers to critical zones', 'Rehab borewells & new sources'],
      }[droughtLevel]
    };

    // Water Level (floodRisk + rainfall)
    const wlLevel =
      (live.floodRisk ?? 0) >= RANGES.flood.high[0] || (live.rainfall ?? 0) >= RANGES.rainfall.high[0] ? 'high' :
      (live.floodRisk ?? 0) >= RANGES.flood.medium[0] || (live.rainfall ?? 0) >= RANGES.rainfall.medium[0] ? 'medium' :
      'low';
    L['Water Level'] = {
      level: wlLevel,
      items: {
        low:   ['Integrate river/tide gauges to dashboard', 'Maintain pumps & backup power', 'Wayfinding for low-lying areas'],
        medium:['Elevate power/telecom cabinets', 'Pre-position barriers at outfalls', 'Clear silt at key choke points'],
        high:  ['Activate evacuation routes & signage', 'Close underpasses/low bridges', 'Open shelters; coordinate relief'],
      }[wlLevel]
    };

    return L;
  }

  const actions = useMemo(() => computeActions(), [live]);

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
        const marginBottomMm = 6; // small bottom whitespace so we don't print to the very edge
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

  // ----- UI (kept your original structure) -----
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
            <h2 style={{ marginTop: 0, fontSize: 24 }}>Executive Recommendations for {parsed.name || live.city}</h2>
            <p style={{ marginTop: 4, marginBottom: 8, fontSize: 15 }}>
              Segmented, actionable recommendations per indicator (3 per category, level-aware).
            </p>
          </div>

          {/* Map */}
          <div className="card" style={{ flex: '1 1 100%', marginTop: 0 }}>
            <CityMap lat={parsed.lat ?? live.lat} lng={parsed.lng ?? live.lng} label={parsed.name || live.city} />
          </div>

          {/* Segmented Actions (dynamic) */}
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
              ].map((title) => (
                <div className="card" key={title}>
                  <h4 style={{ marginTop: 0 }}>
                    {title}
                    <span
  style={{
    marginLeft: 8,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: '1px solid #ddd',
    background:
      actions[title].level === 'high'   ? '#fee2e2' :   // light red
      actions[title].level === 'medium' ? '#fef9c3' :   // light yellow
                                          '#dcfce7',    // light green
    color:
      actions[title].level === 'high'   ? '#b91c1c' :   // dark red
      actions[title].level === 'medium' ? '#92400e' :   // dark amber
                                          '#166534'     // dark green
  }}
  title="Current level"
>
  {actions[title].level.toUpperCase()}
</span>

                  </h4>
                  <ul>
                    {actions[title].items.slice(0,3).map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              ))}
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
        </div>
      </div>
    </div>
  );
}
