// pages/solution.js
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import IndicatorsPanel from "@/components/IndicatorsPanel";
import dynamic from "next/dynamic";

import {
  aqiLevel,
  temperatureLevel,
  humidityLevel,
  windLevel,
  rainLevel,
  floodLevel,
  fireLevel,
  landHealthLevel,
  droughtLevel,
  waterLevelStatus,
  COLORS,
  UNKNOWN_INFO,
} from "@/utils/indicators";

import { confirmPerKeyChange, knownCount } from "@/utils/stability";

const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

const softBg = (hex) => `${hex}22`;

function Badge({ info }) {
  if (!info) return null;
  return (
    <span
      className="text-xs font-semibold"
      style={{
        padding: "4px 10px",
        borderRadius: 10,
        background: softBg(info.color),
        border: `1px solid ${info.color}`,
        color: info.color,
      }}
      title={`${info.label} level`}
    >
      {info.label.toUpperCase()}
    </span>
  );
}

const asNum = (x) => {
  if (x === null || x === undefined || x === "") return null;
  const n = +x;
  return Number.isFinite(n) ? n : null;
};

export default function Solution() {
  const router = useRouter();

  // URL params -> parsed
  const [parsed, setParsed] = useState({ lat: null, lng: null, name: "" });
  useEffect(() => {
    if (!router.isReady) return;
    const { lat, lng, name } = router.query;
    setParsed({
      lat: lat ? +lat : null,
      lng: lng ? +lng : null,
      name: name ? decodeURIComponent(name) : "",
    });
  }, [router.isReady, router.query]);

  // Live payload — fed by IndicatorsPanel via onData
  const [live, setLive] = useState({
    aqi: null,
    pm25: null,
    no2: null,
    o3: null,
    temp: null,
    rh: null,
    rain1h: null,
    rain24h: null,
    floodIntensity3h: null,
    fireEvents: null,
    vpd: null,
    rain7d: null,
    windSpeedMs: null,
    windGustMs: null,
    lat: null,
    lng: null,
    city: "",
    // ✅ NEW: water signals forwarded from IndicatorsPanel
    waterIndexPct: null,
    waterLevelLabel: null,
    waterPrecip24h: null,
  });

  // reflect city on mount
  useEffect(() => {
    setLive((prev) => ({
      ...prev,
      lat: parsed.lat ?? prev.lat,
      lng: parsed.lng ?? prev.lng,
      city: parsed.name || prev.city || "Selected City",
    }));
  }, [parsed.lat, parsed.lng, parsed.name]);

  // ✅ receive metrics from IndicatorsPanel
  const handlePanelData = (vals) => {
    setLive((prev) => ({ ...prev, ...vals }));
  };

  // ✅ NEW: turn live water into an indicators-like info object
  function waterInfoFromLive() {
    // Prefer explicit label if provided by provider
    const label = (live.waterLevelLabel || '').toLowerCase();
    const pct = asNum(live.waterIndexPct);
    let level;
    if (label === 'low' || label === 'moderate' || label === 'high') {
      level = label === 'moderate' ? 'medium' : label; // normalize
    } else if (pct != null) {
      // thresholds aligned with provider (30/45%)
      if (pct >= 45) level = 'high';
      else if (pct >= 30) level = 'medium';
      else level = 'low';
    } else {
      return waterLevelStatus() || UNKNOWN_INFO;
    }
    const color = level === 'low' ? COLORS.low : level === 'medium' ? COLORS.medium : COLORS.high;
    return { label: level, level, color };
  }

  // Compute raw bands from current live (no /api/live dependency)
  const rawBands = useMemo(() => {
    return {
      airInfo: aqiLevel(
        asNum(live.aqi ?? live.aqi_pm25 ?? live.aqiPm25),
        asNum(live.pm25 ?? live.pm25_ugm3 ?? live.pm2_5)
      ) || UNKNOWN_INFO,

      rainInfo: rainLevel(asNum(live.rain24h), asNum(live.rain1h)) || UNKNOWN_INFO,
      floodInfo: floodLevel(asNum(live.rain24h), asNum(live.floodIntensity3h)) || UNKNOWN_INFO,
      fireInfo: fireLevel(asNum(live.fireEvents), asNum(live.rh), asNum(live.vpd)) || UNKNOWN_INFO,
      tempInfo: temperatureLevel(asNum(live.temp)) || UNKNOWN_INFO,
      humidInfo: humidityLevel(asNum(live.rh)) || UNKNOWN_INFO,
      windInfo: windLevel(asNum(live.windSpeedMs), asNum(live.windGustMs)) || UNKNOWN_INFO,
      landInfo: landHealthLevel(asNum(live.vpd), asNum(live.rain7d)) || UNKNOWN_INFO,
      droughtInfo: droughtLevel(asNum(live.rain7d), asNum(live.vpd)) || UNKNOWN_INFO,
      // ✅ NEW: real water info; fallback to utils if nothing live
      waterInfo: waterInfoFromLive() || UNKNOWN_INFO,
    };
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stabilize per key (keeps your previous behavior)
  const [pendingBands, setPendingBands] = useState(null);
  const [stableBands, setStableBands] = useState(null);
  const [indexesReady, setIndexesReady] = useState(false);

  useEffect(() => {
    const { committed, nextPending } = confirmPerKeyChange({
      lastAccepted: stableBands,
      lastPending: pendingBands,
      nextSample: rawBands,
    });
    setPendingBands(nextPending);
    setStableBands(committed);
    setIndexesReady(knownCount(committed) >= 3);
  }, [rawBands]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive actions (unchanged content)
  const derived = useMemo(() => {
    const S = stableBands || {};
    const A = rawBands || {};

    const airInfo     = A.airInfo    ?? UNKNOWN_INFO;                 // Air = latest
    const windInfo    = A.windInfo   ?? S.windInfo   ?? UNKNOWN_INFO; // Wind = latest
    const rainInfo    = S.rainInfo   ?? UNKNOWN_INFO;
    const floodInfo   = S.floodInfo  ?? UNKNOWN_INFO;
    const fireInfo    = S.fireInfo   ?? UNKNOWN_INFO;
    const tempInfo    = S.tempInfo   ?? UNKNOWN_INFO;
    const humidInfo   = S.humidInfo  ?? UNKNOWN_INFO;
    const landInfo    = S.landInfo   ?? UNKNOWN_INFO;
    const droughtInfo = S.droughtInfo?? UNKNOWN_INFO;
    const waterInfo   = S.waterInfo  ?? UNKNOWN_INFO;

    const actions = {
      Rain: {
        info: rainInfo,
        items:
          {
            low: ["Routine drain desilting", "Culvert inspections", "No-garbage-in-drain messaging"],
            medium: ["Pre-position pumps & sandbags", "Clear chokepoints within 6h", "SMS waterlogging alerts"],
            high: ["Deploy pumps; close underpasses", "Open shelters & evacuation routes", "Suspend school in affected zones"],
            na: [],
          }[rainInfo.level] || [],
      },
      "Air Quality": {
        info: airInfo,
        items:
          {
            low: ["Maintain low-emission transport rules", "Routine ambient monitoring", "Enforce dust control at sites"],
            medium: [
              "Low Emission Zones near schools/hospitals",
              "Replace diesel gensets with solar+storage at municipal sites",
              "Real-time AQ displays; trees along traffic corridors",
            ],
            high: [
              "Health alert + mask distribution (N95)",
              "Restrict/highly regulate traffic in hotspots",
              "Suspend top-emitting industrial activity",
            ],
            na: [],
          }[airInfo.level] || [],
      },
      Fire: {
        info: fireInfo,
        items:
          {
            low: ["Community drills & hydrant mapping", "Maintain fire lanes", "Remove dead vegetation swiftly"],
            medium: ["Ban open burning during drought alerts", "Add watchtowers & signage", "Increase patrols/enforcement"],
            high: ["Clear 30 m defensible space", "Stage water tankers & crews", "Emergency alerts & evacuation readiness"],
            na: [],
          }[fireInfo.level] || [],
      },
      Flood: {
        info: floodInfo,
        items:
          {
            low: ["Maintain/update flood maps", "Inspect levees/embankments", "Keep outfalls unobstructed"],
            medium: ["Protect wetlands; retention parks", "Pre-position barriers & mobile pumps", "Elevate power/telecom cabinets"],
            high: ["Activate red-zone evacuation", "Close underpasses/low crossings", "24/7 EOC & shelters active"],
            na: [],
          }[floodInfo.level] || [],
      },
      "Heat/Temperature": {
        info: tempInfo,
        items:
          {
            low: ["Expand cool roofs & shade canopy", "Maintain heat early-warning systems", "Promote green courtyards"],
            medium: ["Shift outdoor work/school hours", "Open cooling centers at peak", "Hydration stations at markets & hubs"],
            high: ["Activate heat emergency response", "Checks for vulnerable households", "24/7 cooling & misting in hotspots"],
            na: [],
          }[tempInfo.level] || [],
      },
      "Humidity & Mold": {
        info: humidInfo,
        items:
          {
            low: ["Maintain ventilation systems", "Moisture guidance for households", "Track RH complaints dashboard"],
            medium: ["Moisture audits (schools/clinics)", "Dehumidifier subsidies for hotspots", "Repair roof/wall leaks quickly"],
            high: ["Temporary relocation for severe cases", "Rapid mold remediation teams", "Ventilation retrofits in public housing"],
            na: [],
          }[humidInfo.level] || [],
      },
      "Wind & Comfort": {
        info: windInfo,
        items:
          {
            low: ["Plan ventilation corridors (prevailing wind)", "Shade trees on pedestrian spines", "Orient seating for comfort"],
            medium: ["Windbreak rows near plazas", "Shielded bus stops in gusty districts", "Adjust event layouts for wind flows"],
            high: ["Temporarily close high-wind plazas", "Install temporary barriers/netting", "Postpone outdoor events if unsafe"],
            na: [],
          }[windInfo.level] || [],
      },
      "Land Health": {
        info: landInfo,
        items:
          {
            low: ["Green vacant lots; micro-forests", "Mulch/compost for moisture retention", "Plant native resilient species"],
            medium: ["Erosion control on bare slopes", "Rainwater harvesting for parks", "Targeted soil remediation"],
            high: ["Dust suppression & cover stockpiles", "Restrict earthworks in peak dust/wind", "Emergency replanting degraded plots"],
            na: [],
          }[landInfo.level] || [],
      },
      Drought: {
        info: droughtInfo,
        items:
          {
            low: ["Leak detection & repairs", "Water-efficient fixtures incentives", "Recharge pit upkeep & audits"],
            medium: ["Odd-even non-essential use", "Greywater & drip irrigation incentives", "Tiered pricing to curb overuse"],
            high: ["Ration non-essential supply", "Tankers to critical zones", "Rehab borewells & new sources"],
            na: [],
          }[droughtInfo.level] || [],
      },
      "Water Level": {
        info: waterInfo,
        items:
          {
            low: ["Integrate river/tide gauges to dashboard", "Maintain pumps & backup power", "Wayfinding for low-lying areas"],
            medium: ["Elevate power/telecom cabinets", "Pre-position barriers at outfalls", "Clear silt at key choke points"],
            high: ["Activate evacuation routes & signage", "Close underpasses/low bridges", "Open shelters; coordinate relief"],
            na: ["Integrate river/tide gauges to dashboard", "Maintain pumps & backup power", "Wayfinding for low-lying areas"],
          }[waterInfo.level] || [],
      },
    };

    return { actions };
  }, [stableBands, rawBands]);

 // ---------- PDF ----------
const ref = useRef(null);
const [exporting, setExporting] = useState(false);

async function exportPDF() {
  if (!ref.current) return;
  setExporting(true);
  try {
    const root = ref.current;

    // Render whole report to canvas (hi-DPI)
    const canvas = await html2canvas(root, {
      useCORS: true,
      scale: 2,
      backgroundColor: "#ffffff",
      windowWidth: root.scrollWidth,
      windowHeight: root.scrollHeight,
    });

    // PDF size and margins
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidthMm  = pdf.internal.pageSize.getWidth();
    const pageHeightMm = pdf.internal.pageSize.getHeight();
    const marginMm = 8; // left/right/top/bottom
    const contentWidthMm  = pageWidthMm  - marginMm * 2;
    const contentHeightMm = pageHeightMm - marginMm * 2;

    // px ↔ mm conversion for this canvas
    const pxPerMm = canvas.width / contentWidthMm;
    const pageHeightPx = Math.floor(contentHeightMm * pxPerMm);

    // Build safe breakpoints so we don't cut a card mid-page
    const containerTop = root.getBoundingClientRect().top + window.scrollY;
    const cards = Array.from(root.querySelectorAll(".card"));
    const breakpoints = [0];
    for (const el of cards) {
      const rectTop = el.getBoundingClientRect().top + window.scrollY;
      const relTop = Math.max(0, Math.floor(rectTop - containerTop));
      if (breakpoints[breakpoints.length - 1] !== relTop) breakpoints.push(relTop);
    }
    breakpoints.push(canvas.height);

    // Paginate by fitting up to the last breakpoint on each page
    let y = 0;
    let pageIndex = 0;

    while (y < canvas.height - 1) {
      const target = y + pageHeightPx;

      // Find the greatest breakpoint in (y, target]
      let sliceEnd = y + pageHeightPx;
      for (let i = 1; i < breakpoints.length; i++) {
        if (breakpoints[i] <= target && breakpoints[i] > y) {
          sliceEnd = breakpoints[i];
        } else if (breakpoints[i] > target) {
          break;
        }
      }

      const sliceHeight = Math.max(1, sliceEnd - y);

      // Slice to a page-sized canvas
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const ctx = pageCanvas.getContext("2d");
      ctx.drawImage(
        canvas,
        0, y,
        canvas.width, sliceHeight,
        0, 0,
        canvas.width, sliceHeight
      );

      // Add to PDF (scaled to content width)
      const imgHeightMm = sliceHeight / pxPerMm;
      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(
        pageCanvas.toDataURL("image/jpeg", 0.92),
        "JPEG",
        marginMm,
        marginMm,
        contentWidthMm,
        imgHeightMm
      );

      y = sliceEnd;
      pageIndex++;
    }

    pdf.save(`Green_City_Report_${parsed.name || live.city || "city"}.pdf`);
  } finally {
    setExporting(false);
  }
}

function backToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Loading grid until we have at least some committed bands
const loadingGrid = (
  <div className="grid-2" style={{ marginTop: 12 }}>
    {[
      "Rain", "Air Quality", "Fire", "Flood", "Heat/Temperature",
      "Humidity & Mold", "Wind & Comfort", "Land Health", "Drought", "Water Level",
    ].map((title) => (
      <div className="card" key={title}>
        <h4 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span>{title}</span>
          <Badge info={UNKNOWN_INFO} />
        </h4>
        <ul>
          <li>Loading…</li><li>Loading…</li><li>Loading…</li>
        </ul>
      </div>
    ))}
  </div>
);

return (
  <div className="container">
    <div className="content-wrap" style={{ justifyContent: "center" }}>
      <div
        className="card"
        id="solution-root"
        style={{ width: "100%", maxWidth: 1000, margin: "0 auto", padding: 20 }}
        ref={ref}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <button
            onClick={() => router.back()}
            style={{ padding: "6px 12px", fontSize: 14, borderRadius: 8, marginRight: "auto" }}
          >
            ← Back
          </button>
          <div style={{ flex: 1, textAlign: "center", fontSize: 26, fontWeight: 800 }}>
            Solution Page — {parsed.name || live.city || "—"}
          </div>
          <div style={{ width: 80 }} />
        </div>

        {/* Executive Recommendations */}
        <div className="card" style={{ flex: "1 1 100%", textAlign: "center", marginBottom: 10 }}>
          <h2 style={{ marginTop: 0, fontSize: 24 }}>
            Executive Recommendations for {parsed.name || live.city}
          </h2>
          <p style={{ marginTop: 4, marginBottom: 8, fontSize: 15 }}>
            Segmented, actionable recommendations per indicator (3 per category, level-aware).
          </p>
        </div>

        {/* Map */}
        <div className="card" style={{ flex: "1 1 100%", marginTop: 0 }}>
          <CityMap
            lat={parsed.lat ?? live.lat}
            lng={parsed.lng ?? live.lng}
            label={parsed.name || live.city}
          />
        </div>

        {/* Segmented Actions */}
        <div className="card" style={{ flex: "1 1 100%", marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 22 }}>Segmented Actions</h3>
            <button
              className="primary"
              onClick={exportPDF}
              disabled={exporting}
              style={{ padding: "8px 16px", borderRadius: 12, fontSize: 15 }}
            >
              {exporting ? "Exporting…" : "Export PDF"}
            </button>
          </div>

          {!indexesReady ? (
            loadingGrid
          ) : (
            <div className="grid-2" style={{ marginTop: 12 }}>
              {[
                "Rain",
                "Air Quality",
                "Fire",
                "Flood",
                "Heat/Temperature",
                "Humidity & Mold",
                "Wind & Comfort",
                "Land Health",
                "Drought",
                "Water Level",
              ].map((title) => {
                const section = {
                  "Rain": derived.actions["Rain"],
                  "Air Quality": derived.actions["Air Quality"],
                  "Fire": derived.actions["Fire"],
                  "Flood": derived.actions["Flood"],
                  "Heat/Temperature": derived.actions["Heat/Temperature"],
                  "Humidity & Mold": derived.actions["Humidity & Mold"],
                  "Wind & Comfort": derived.actions["Wind & Comfort"],
                  "Land Health": derived.actions["Land Health"],
                  "Drought": derived.actions["Drought"],
                  "Water Level": derived.actions["Water Level"],
                }[title];

                return (
                  <div className="card" key={title}>
                    <h4 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{title}</span>
                      <Badge info={section.info} />
                    </h4>
                    <ul>
                      {section.items.length ? (
                        section.items.map((t, i) => <li key={i}>{t}</li>)
                      ) : (
                        <>
                          <li>Loading…</li><li>Loading…</li><li>Loading…</li>
                        </>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dashboard (forwards metrics via onData) */}
        <IndicatorsPanel city={parsed} onData={handlePanelData} />

        {/* Bottom buttons */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 16 }}>
          <button onClick={() => router.push("/")} style={{ padding: "10px 16px", borderRadius: 12 }}>
            ← Back to Home
          </button>
          <button onClick={backToTop} style={{ padding: "10px 16px", borderRadius: 12 }}>
            ↑ Back to Top
          </button>
        </div>

        {/* Legend */}
        <div style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: "#4b5563" }}>
          Legend:&nbsp;
          <span style={{ color: COLORS.low }}>Low</span> ·&nbsp;
          <span style={{ color: COLORS.medium }}>Medium</span> ·&nbsp;
          <span style={{ color: COLORS.high }}>High</span> ·&nbsp;
          <span style={{ color: "#6b7280" }}>NA</span>
        </div>
      </div>
    </div>
  </div>
);
}
