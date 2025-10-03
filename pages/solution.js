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
} from "@/utils/indicators";

const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

// soft background from a hex color (adds alpha)
const softBg = (hex) => `${hex}22`;

// Slightly curved pill badge
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

export default function Solution() {
  const router = useRouter();
  const { lat, lng, name } = router.query;
  const parsed = {
    lat: lat ? +lat : null,
    lng: lng ? +lng : null,
    name: name ? decodeURIComponent(name) : "",
  };

  // --- LIVE DATA defaults ---
  const [live, setLive] = useState({
    aqi: 62, pm25: 17.3, no2: 17.5, o3: 71,
    temp: 295, tempUnit: "K", rh: 48,
    rain1h: 0, rain24h: 0, floodIntensity3h: 0,
    fireEvents: 0, vpd: 1.66, rain7d: 0, waterQuality: 80,
    windSpeedMs: 5.2, windGustMs: 10.8,
    riverGauge: "N/A", tide: "N/A", reservoir: "N/A",
    lat: parsed.lat ?? 39.768, lng: parsed.lng ?? -86.158, city: parsed.name || "Selected City",
  });

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/live", { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        if (mounted) setLive((prev) => ({ ...prev, ...data }));
      } catch {}
    };
    tick();
    const iv = setInterval(tick, 30000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  // --- helpers ---
  const asNum = (x) => (x == null ? null : +x);
  const toC = (value, unit) => {
    const v = asNum(value);
    if (v == null) return null;
    const u = (unit || "").toString().toUpperCase();
    if (u === "C") return v;
    if (u === "F") return (v - 32) * 5 / 9;
    if (u === "K") return v - 273.15;
    if (v > 80 && v < 373) return v - 273.15;
    if (v > 60 && v < 140) return (v - 32) * 5 / 9;
    return v;
  };

  // --- classify ---
  const derived = useMemo(() => {
    const tempC = toC(live.temp, live.tempUnit);

    const airInfo     = aqiLevel(asNum(live.aqi));
    const rainInfo    = rainLevel(asNum(live.rain24h), asNum(live.rain1h));
    const floodInfo   = floodLevel(asNum(live.rain24h), asNum(live.floodIntensity3h));
    const fireInfo    = fireLevel(asNum(live.fireEvents), asNum(live.rh), asNum(live.vpd));
    const tempInfo    = temperatureLevel(tempC);
    const humidInfo   = humidityLevel(asNum(live.rh));
    const windInfo    = windLevel(asNum(live.windSpeedMs), asNum(live.windGustMs));
    const landInfo    = landHealthLevel(asNum(live.vpd), asNum(live.rain7d));
    const droughtInfo = droughtLevel(asNum(live.rain7d), asNum(live.vpd));
    const waterInfo   = waterLevelStatus({
      river: live.riverGauge, tide: live.tide, reservoir: live.reservoir,
    });

    const actions = {
      "Rain": {
        info: rainInfo,
        items: {
          low: ["Routine drain desilting", "Culvert inspections", "No-garbage-in-drain messaging"],
          medium: ["Pre-position pumps & sandbags", "Clear chokepoints within 6h", "SMS waterlogging alerts"],
          high: ["Deploy pumps; close underpasses", "Open shelters & evacuation routes", "Suspend school in affected zones"],
        }[rainInfo.level] || [],
      },
      "Air Quality": {
        info: airInfo,
        items: {
          low: ["Maintain low-emission transport rules", "Routine ambient monitoring", "Enforce dust control at sites"],
          medium: ["Low Emission Zones near schools/hospitals", "Replace diesel gensets with solar+storage at municipal sites", "Real-time AQ displays; trees along traffic corridors"],
          high: ["Health alert + mask distribution (N95)", "Restrict/highly regulate traffic in hotspots", "Suspend top-emitting industrial activity"],
        }[airInfo.level] || [],
      },
      "Fire": {
        info: fireInfo,
        items: {
          low: ["Community drills & hydrant mapping", "Maintain fire lanes", "Remove dead vegetation swiftly"],
          medium: ["Ban open burning during drought alerts", "Add watchtowers & signage", "Increase patrols/enforcement"],
          high: ["Clear 30 m defensible space", "Stage water tankers & crews", "Emergency alerts & evacuation readiness"],
        }[fireInfo.level] || [],
      },
      "Flood": {
        info: floodInfo,
        items: {
          low: ["Maintain/update flood maps", "Inspect levees/embankments", "Keep outfalls unobstructed"],
          medium: ["Protect wetlands; retention parks", "Pre-position barriers & mobile pumps", "Elevate power/telecom cabinets"],
          high: ["Activate red-zone evacuation", "Close underpasses/low crossings", "24/7 EOC & shelters active"],
        }[floodInfo.level] || [],
      },
      "Heat/Temperature": {
        info: tempInfo,
        items: {
          low: ["Expand cool roofs & shade canopy", "Maintain heat early-warning systems", "Promote green courtyards"],
          medium: ["Shift outdoor work/school hours", "Open cooling centers at peak", "Hydration stations at markets & hubs"],
          high: ["Activate heat emergency response", "Checks for vulnerable households", "24/7 cooling & misting in hotspots"],
        }[tempInfo.level] || [],
      },
      "Humidity & Mold": {
        info: humidInfo,
        items: {
          low: ["Maintain ventilation systems", "Moisture guidance for households", "Track RH complaints dashboard"],
          medium: ["Moisture audits (schools/clinics)", "Dehumidifier subsidies for hotspots", "Repair roof/wall leaks quickly"],
          high: ["Temporary relocation for severe cases", "Rapid mold remediation teams", "Ventilation retrofits in public housing"],
        }[humidInfo.level] || [],
      },
      "Wind & Comfort": {
        info: windInfo,
        items: {
          low: ["Plan ventilation corridors (prevailing wind)", "Shade trees on pedestrian spines", "Orient seating for comfort"],
          medium: ["Windbreak rows near plazas", "Shielded bus stops in gusty districts", "Adjust event layouts for wind flows"],
          high: ["Temporarily close high-wind plazas", "Install temporary barriers/netting", "Postpone outdoor events if unsafe"],
        }[windInfo.level] || [],
      },
      "Land Health": {
        info: landInfo,
        items: {
          low: ["Green vacant lots; micro-forests", "Mulch/compost for moisture retention", "Plant native resilient species"],
          medium: ["Erosion control on bare slopes", "Rainwater harvesting for parks", "Targeted soil remediation"],
          high: ["Dust suppression & cover stockpiles", "Restrict earthworks in peak dust/wind", "Emergency replanting degraded plots"],
        }[landInfo.level] || [],
      },
      "Drought": {
        info: droughtInfo,
        items: {
          low: ["Leak detection & repairs", "Water-efficient fixtures incentives", "Recharge pit upkeep & audits"],
          medium: ["Odd-even non-essential use", "Greywater & drip irrigation incentives", "Tiered pricing to curb overuse"],
          high: ["Ration non-essential supply", "Tankers to critical zones", "Rehab borewells & new sources"],
        }[droughtInfo.level] || [],
      },
      "Water Level": {
        info: waterInfo,
        items: {
          low: ["Integrate river/tide gauges to dashboard", "Maintain pumps & backup power", "Wayfinding for low-lying areas"],
          medium: ["Elevate power/telecom cabinets", "Pre-position barriers at outfalls", "Clear silt at key choke points"],
          high: ["Activate evacuation routes & signage", "Close underpasses/low bridges", "Open shelters; coordinate relief"],
          na: ["Integrate river/tide gauges to dashboard", "Maintain pumps & backup power", "Wayfinding for low-lying areas"],
        }[waterInfo.level] || ["Integrate river/tide gauges to dashboard", "Maintain pumps & backup power", "Wayfinding for low-lying areas"],
      },
    };

    return { actions };
  }, [live]);

  // ---------- PDF ----------
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
        backgroundColor: "#ffffff",
        windowWidth: node.scrollWidth,
        windowHeight: node.scrollHeight,
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = pageWidth / canvas.width;
      const pageCanvasHeight = pageHeight / ratio;

      const containerRect = node.getBoundingClientRect();
      const cards = Array.from(node.querySelectorAll(".card"));
      const cssToCanvas = canvas.width / node.clientWidth;

      const breakBottoms = cards
        .map((el) => {
          const r = el.getBoundingClientRect();
          const top = r.top - containerRect.top;
          const bottom = top + r.height;
          return Math.round(bottom * cssToCanvas);
        })
        .sort((a, b) => a - b);

      const safety = 12 * cssToCanvas;
      let y = 0;

      while (y < canvas.height) {
        let end;
        if (canvas.height - y <= pageCanvasHeight - safety) {
          end = canvas.height;
        } else {
          const target = y + pageCanvasHeight;
          end = target;
          for (let i = breakBottoms.length - 1; i >= 0; i--) {
            if (breakBottoms[i] <= target - safety && breakBottoms[i] > y + 40) {
              end = breakBottoms[i];
              break;
            }
          }
        }

        const sliceHeight = Math.max(1, Math.round(end - y));
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceHeight;
        const ctx = slice.getContext("2d");
        ctx.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

        const imgData = slice.toDataURL("image/jpeg", 0.92);
        const renderHeight = sliceHeight * ratio;

        if (y > 0) pdf.addPage();
        const marginBottomMm = 6;
        const usableHeight = Math.min(renderHeight, pageHeight - marginBottomMm);
        pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, usableHeight);

        y = end;
      }

      pdf.save(`Green_City_Report_${parsed.name || live.city || "city"}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  function backToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ----- UI -----
  return (
    <div className="container">
      <div className="content-wrap" style={{ justifyContent: "center" }}>
        <div
          className="card"
          id="solution-root"
          style={{ width: "100%", maxWidth: 1000, margin: "0 auto", padding: 20 }}
          ref={ref}
        >
          {/* Header row */}
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

            <div className="grid-2" style={{ marginTop: 12 }}>
              {[
                "Rain","Air Quality","Fire","Flood",
                "Heat/Temperature","Humidity & Mold","Wind & Comfort",
                "Land Health","Drought","Water Level"
              ].map((title) => {
                const section = derived.actions[title];
                return (
                  <div className="card" key={title}>
                    <h4 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{title}</span>
                      <Badge info={section.info} />
                    </h4>
                    <ul>
                      {section.items.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Indicators at bottom */}
          <IndicatorsPanel city={parsed} />

          {/* Bottom buttons */}
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 16 }}>
            <button
              onClick={() => router.push("/")}
              style={{ padding: "10px 16px", borderRadius: 12 }}
            >
              ← Back to Home
            </button>
            <button
              onClick={backToTop}
              style={{ padding: "10px 16px", borderRadius: 12 }}
            >
              ↑ Back to Top
            </button>
          </div>

          {/* Legend */}
          <div style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: "#4b5563" }}>
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
