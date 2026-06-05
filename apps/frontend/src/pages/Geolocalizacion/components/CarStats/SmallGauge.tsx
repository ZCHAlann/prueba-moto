import { JSX, ReactNode } from 'react';
import { arcPath, polarToCartesian } from '../../utils/svgArc';

interface Props {
  icon: ReactNode;
  label: string;
  value: number;
  max: number;
  unit: string;
  formatValue?: (v: number) => string;
  color: string;
}

export const SmallGauge = ({
  icon, label, value, max, unit, formatValue, color,
}: Props) => {
  const W = 160;
  const H = 100;
  const cx = W / 2;
  const cy = 80;
  const r = 55;
  const strokeWidth = 8;

  const clamped = Math.max(0, Math.min(max, value));
  const ratio = clamped / max;

  const trackPath = arcPath(cx, cy, r, 180, 360);
  const totalLength = Math.PI * r;
  const filledLength = ratio * totalLength;

  const ticks: JSX.Element[] = [];
  for (let i = 0; i <= 5; i++) {
    const tickAngle = 180 + (i / 5) * 180;
    const inner = polarToCartesian(cx, cy, r - 5, tickAngle);
    const outer = polarToCartesian(cx, cy, r + 1, tickAngle);
    ticks.push(
      <line
        key={i}
        x1={inner.x} y1={inner.y}
        x2={outer.x} y2={outer.y}
        stroke="#334155"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    );
  }

  return (
    <div className="rounded-xl bg-slate-900 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <span className="text-slate-300">{icon}</span>
        <span>{label}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-[130px]">
        <path
          d={trackPath}
          fill="none"
          stroke="#1e293b"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        <path
          d={trackPath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={totalLength}
          strokeDashoffset={totalLength - filledLength}
          style={{
            transition: 'stroke-dashoffset 0.6s ease-out, stroke 0.3s ease',
            filter: `drop-shadow(0 0 4px ${color}55)`,
          }}
        />

        {ticks}

        <text
          x={cx} y={cy - 16}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize="20"
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {formatValue ? formatValue(clamped) : Math.round(clamped)}
        </text>
        <text
          x={cx} y={cy + 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#64748b"
          fontSize="9"
          fontWeight="600"
          letterSpacing="1.5"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {unit.toUpperCase()}
        </text>
      </svg>
    </div>
  );
};