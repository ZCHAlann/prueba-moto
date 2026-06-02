"use client";

import { useMemo, useState, useCallback } from "react";
import type { ApiFuelEntry } from "../../../hooks/useFuel";
import type { Asset } from "../../../types/activo";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  fuelEntries: ApiFuelEntry[];
  assets: Asset[];
};

type VehicleStat = {
  id: string;
  plate: string;
  unit: string;
  liters: number;
  cost: number;
  entries: number;
  costPerLiter: number;
  avgOdometer: number;
};

// ─── Paleta ───────────────────────────────────────────────────────────────────

const COLS = ["#4F6EF7", "#00D084", "#F5A623", "#9B6DFF", "#00C8D7", "#F24E4E"];

const AXES = [
  { key: "liters",      label: "Litros"      },
  { key: "cost",        label: "Costo"       },
  { key: "entries",     label: "Cargas"      },
  { key: "costPerLiter",label: "Costo/L"     },
  { key: "avgOdometer", label: "Odómetro"    },
] as const;

type AxisKey = typeof AXES[number]["key"];

function fmt(n: number, d = 1) {
  return n.toLocaleString("es-EC", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function RadarChart({ fuelEntries, assets }: Props) {
  const [hovIdx, setHovIdx] = useState<number | null>(null);

  // Build per-vehicle stats
  const stats: VehicleStat[] = useMemo(() => {
    const map = new Map<string, { liters: number; cost: number; entries: number; odometerSum: number }>();
    fuelEntries.forEach((e) => {
      const cur = map.get(e.assetId) ?? { liters: 0, cost: 0, entries: 0, odometerSum: 0 };
      map.set(e.assetId, {
        liters:      cur.liters      + e.liters,
        cost:        cur.cost        + e.cost,
        entries:     cur.entries     + 1,
        odometerSum: cur.odometerSum + (e.odometer ?? 0),
      });
    });

    return assets
      .map((a) => {
        const d = map.get(a.id);
        if (!d || d.entries === 0) return null;
        return {
          id:          a.id,
          plate:       a.plate,
          unit:        `${a.brand} ${a.model}`,
          liters:      d.liters,
          cost:        d.cost,
          entries:     d.entries,
          costPerLiter: d.liters > 0 ? d.cost / d.liters : 0,
          avgOdometer: d.odometerSum / d.entries,
        };
      })
      .filter(Boolean)
      .slice(0, 6) as VehicleStat[];
  }, [fuelEntries, assets]);

  // Max per axis for normalization
  const maxima = useMemo(() => {
    const m: Record<AxisKey, number> = { liters: 0, cost: 0, entries: 0, costPerLiter: 0, avgOdometer: 0 };
    stats.forEach((s) => {
      AXES.forEach(({ key }) => { if (s[key] > m[key]) m[key] = s[key]; });
    });
    return m;
  }, [stats]);

  // SVG geometry
  const N   = AXES.length;
  const W   = 340;
  const H   = 340;
  const CX  = W / 2;
  const CY  = H / 2;
  const R   = 120;
  const RINGS = [0.25, 0.5, 0.75, 1];

  const angle = (i: number) => (Math.PI * 2 * i / N) - Math.PI / 2;
  const pt    = (r: number, i: number): [number, number] => [
    CX + r * Math.cos(angle(i)),
    CY + r * Math.sin(angle(i)),
  ];

  const getPath = useCallback((stat: VehicleStat) => {
    return AXES.map(({ key }, i) => {
      const maxV = maxima[key] || 1;
      const val  = (stat[key] / maxV) * R;
      const [x, y] = pt(val, i);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ") + "Z";
  }, [maxima]);

  if (stats.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 280, color: "var(--text3, #5A5A7A)", fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>
        Sin datos suficientes
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* SVG Radar */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
          {/* Rings */}
          {RINGS.map((r) => (
            <polygon
              key={r}
              points={AXES.map((_, i) => pt(R * r, i).join(",")).join(" ")}
              fill="none"
              stroke="rgba(255,255,255,0.07)"
              strokeWidth={1}
            />
          ))}
          {/* Axis lines */}
          {AXES.map((_, i) => {
            const [x, y] = pt(R, i);
            return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />;
          })}
          {/* Axis labels */}
          {AXES.map(({ label }, i) => {
            const [x, y] = pt(R + 20, i);
            return (
              <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                fill="var(--text2, #9090B0)" fontSize={10} fontFamily="'JetBrains Mono',monospace">
                {label}
              </text>
            );
          })}
          {/* Data shapes */}
          {stats.map((stat, i) => {
            const col     = COLS[i % COLS.length];
            const isHov   = hovIdx === i;
            const isDim   = hovIdx !== null && !isHov;
            return (
              <g key={stat.id}
                onMouseEnter={() => setHovIdx(i)}
                onMouseLeave={() => setHovIdx(null)}
                style={{ cursor: "pointer" }}>
                <path
                  d={getPath(stat)}
                  fill={col}
                  fillOpacity={isDim ? 0.03 : isHov ? 0.40 : 0.18}
                  stroke={col}
                  strokeWidth={isHov ? 2.5 : 1.5}
                  strokeOpacity={isDim ? 0.15 : 1}
                  style={{ transition: "fill-opacity .2s, stroke-width .2s, stroke-opacity .2s" }}
                />
                {isHov && (
                  <path d={getPath(stat)} fill="none" stroke={col} strokeWidth={8} strokeOpacity={0.15} style={{ pointerEvents: "none" }} />
                )}
                {/* Dots */}
                {AXES.map(({ key }, j) => {
                  const maxV      = maxima[key] || 1;
                  const val       = (stat[key] / maxV) * R;
                  const [x, y]    = pt(val, j);
                  return (
                    <circle key={j} cx={x} cy={y} r={isHov ? 4 : 2.5}
                      fill={col} opacity={isDim ? 0.15 : 1}
                      style={{ transition: "r .2s, opacity .2s" }}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {stats.map((stat, i) => {
          const col   = COLS[i % COLS.length];
          const isHov = hovIdx === i;
          return (
            <div
              key={stat.id}
              onMouseEnter={() => setHovIdx(i)}
              onMouseLeave={() => setHovIdx(null)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 20, cursor: "pointer",
                border: `1px solid ${isHov ? col : "rgba(255,255,255,0.08)"}`,
                background: isHov ? `${col}18` : "rgba(255,255,255,0.03)",
                transition: "all .15s",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: col, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: isHov ? 700 : 400, color: isHov ? col : "var(--text2, #9090B0)", fontFamily: "'JetBrains Mono',monospace" }}>
                {stat.plate}
              </span>
            </div>
          );
        })}
      </div>

      {/* Hover detail */}
      {hovIdx !== null && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
          padding: "12px 16px", borderRadius: 12,
          border: `1px solid ${COLS[hovIdx % COLS.length]}30`,
          background: `${COLS[hovIdx % COLS.length]}08`,
        }}>
          {AXES.map(({ key, label }) => {
            const stat = stats[hovIdx!];
            const val  = stat[key];
            const display =
              key === "liters"       ? `${fmt(val, 0)} L`  :
              key === "cost"         ? `$${fmt(val)}`       :
              key === "costPerLiter" ? `$${fmt(val)}/L`    :
              key === "avgOdometer"  ? `${fmt(val, 0)} km` :
              String(Math.round(val));
            return (
              <div key={key} style={{ textAlign: "center" }}>
                <p style={{ fontSize: 10, color: "var(--text3, #5A5A7A)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: COLS[hovIdx! % COLS.length], fontFamily: "'JetBrains Mono',monospace" }}>{display}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}