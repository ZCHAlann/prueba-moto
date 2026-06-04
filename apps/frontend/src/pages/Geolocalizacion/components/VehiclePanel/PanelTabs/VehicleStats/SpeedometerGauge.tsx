import React from 'react';

interface SpeedometerGaugeProps {
  speed: number;
  maxSpeed?: number;
}

export const SpeedometerGauge: React.FC<SpeedometerGaugeProps> = ({ speed, maxSpeed = 120 }) => {
  const pct = Math.min(speed / maxSpeed, 1);
  const radius = 42;
  const cx = 60, cy = 60;
  const circumference = Math.PI * radius;

  const polar = (angle: number) => ({
    x: cx + radius * Math.cos((angle * Math.PI) / 180),
    y: cy + radius * Math.sin((angle * Math.PI) / 180),
  });

  const trackStart = polar(-180);
  const trackEnd   = polar(0);
  const dashFill   = pct * circumference;

  const fillColor = speed > 90 ? '#dc2626' : speed > 60 ? '#d97706' : '#16a34a';

  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="70" viewBox="0 0 120 72">
        {/* Track */}
        <path
          d={`M ${trackStart.x} ${trackStart.y} A ${radius} ${radius} 0 0 1 ${trackEnd.x} ${trackEnd.y}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          className="text-gray-200 dark:text-white/[0.08]"
        />
        {/* Fill */}
        {speed > 0 && (
          <path
            d={`M ${trackStart.x} ${trackStart.y} A ${radius} ${radius} 0 0 1 ${trackEnd.x} ${trackEnd.y}`}
            fill="none"
            stroke={fillColor}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${dashFill} ${circumference}`}
            style={{ transition: 'stroke-dasharray 500ms ease, stroke 300ms ease' }}
          />
        )}
        {/* Speed value */}
        <text x="60" y="52" textAnchor="middle" fontFamily="DM Mono, monospace" fontWeight="700" fontSize="22"
          fill="currentColor" className="text-gray-800 dark:text-white"
          style={{ fill: 'var(--color-text-primary)' }}>
          {speed > 0 ? speed : '--'}
        </text>
        <text x="60" y="64" textAnchor="middle" fontFamily="Outfit, sans-serif" fontSize="10"
          style={{ fill: 'var(--color-text-tertiary)' }}>
          km/h
        </text>
        {/* Scale labels */}
        <text x="16" y="68" textAnchor="middle" fontFamily="DM Mono, monospace" fontSize="9"
          style={{ fill: 'var(--color-text-tertiary)' }}>0</text>
        <text x="104" y="68" textAnchor="middle" fontFamily="DM Mono, monospace" fontSize="9"
          style={{ fill: 'var(--color-text-tertiary)' }}>120</text>
      </svg>
    </div>
  );
};