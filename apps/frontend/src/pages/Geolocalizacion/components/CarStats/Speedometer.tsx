import { JSX } from 'react';
import { arcPath, polarToCartesian } from '../../utils/svgArc';

interface Props {
  value: number;
  max?: number;
  unit?: string;
}

export const Speedometer = ({ value, max = 180, unit = 'km/h' }: Props) => {
  const W = 320;
  const H = 220;
  const cx = W / 2;
  const cy = 180;
  const r = 130;
  const strokeWidth = 14;

  const clamped = Math.max(0, Math.min(max, value));
  const ratio = clamped / max;
  const valueAngle = ratio * 180;

  const trackPath = arcPath(cx, cy, r, 180, 360);
  const totalLength = Math.PI * r;
  const filledLength = ratio * totalLength;

  // Color por velocidad
  const color =
    clamped === 0  ? '#1e293b' :
    clamped < 30   ? '#10b981' :
    clamped < 100  ? '#3b82f6' :
    clamped < 140  ? '#f59e0b' :
                     '#f43f5e';

  // Tick marks
  const ticks: JSX.Element[] = [];
  for (let i = 0; i <= 18; i++) {
    const tickAngle = 180 + (i / 18) * 180;
    const isMajor = i % 2 === 0;
    const tickLen = isMajor ? 10 : 5;
    const inner = polarToCartesian(cx, cy, r - tickLen, tickAngle);
    const outer = polarToCartesian(cx, cy, r + 2, tickAngle);
    ticks.push(
      <line
        key={i}
        x1={inner.x} y1={inner.y}
        x2={outer.x} y2={outer.y}
        stroke={isMajor ? '#475569' : '#334155'}
        strokeWidth={isMajor ? 2 : 1.5}
        strokeLinecap="round"
      />
    );
  }

  // Labels (0, 20, 40, ..., 180)
  const labelValues = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180];
  const labels = labelValues.map((v) => {
    const labelAngle = 180 + (v / max) * 180;
    const pos = polarToCartesian(cx, cy, r + 22, labelAngle);
    return (
      <text
        key={v}
        x={pos.x} y={pos.y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#94a3b8"
        fontSize="12"
        fontWeight="600"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {v}
      </text>
    );
  });

  // Aguja
  const needleEnd = polarToCartesian(cx, cy, r - 10, 180 + valueAngle);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-[260px]" 
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="speedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
      </defs>

      {/* Track (fondo) */}
      <path
        d={trackPath}
        fill="none"
        stroke="#1e293b"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />

      {/* Fill (con dasharray para animar) */}
      {clamped > 0 && (
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
            filter: `drop-shadow(0 0 6px ${color}66)`,
          }}
        />
      )}

      {/* Ticks */}
      {ticks}

      {/* Labels numéricos */}
      {labels}

      {/* Aguja (detrás del pivot) */}
      {clamped > 0 && (
        <line
          x1={cx} y1={cy}
          x2={needleEnd.x} y2={needleEnd.y}
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ transition: 'all 0.6s ease-out' }}
        />
      )}

      {/* Pivot central */}
      <circle cx={cx} cy={cy} r="9" fill="#0f172a" stroke="white" strokeWidth="2" />
      <circle cx={cx} cy={cy} r="3" fill="white" />

      {/* Valor principal */}
      <text
        x={cx} y={cy - 22}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize="42"
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {Math.round(clamped)}
      </text>

      {/* Unidad */}
      <text
        x={cx} y={cy + 28}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#64748b"
        fontSize="11"
        fontWeight="600"
        letterSpacing="2"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {unit.toUpperCase()}
      </text>
    </svg>
  );
};