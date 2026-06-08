import { useState } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useDailyUsage, DailyUsagePoint } from '../hooks/useDailyUsage';
import { useTheme } from '@/context/ThemeContext';
import CockpitModal from '../common/CockpitModal';

function Chart({ data, height = '100%', isDark }: { data: DailyUsagePoint[]; height?: string | number; isDark: boolean }) {
  const safe: DailyUsagePoint[] = data?.length
    ? data
    : Array.from({ length: 24 }, (_, h) => ({ hour: h, km: 0 }));

  // ID distinto por tema para que recharts tome el gradient correcto
  const gradId = isDark ? "cockpitGreenDark" : "cockpitGreenLight";
  const grid = isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9";
  const axis = isDark ? "#52525b" : "#cbd5e1";
  const tipBg = isDark ? "#161b2c" : "#0f172a";
  const tipBorder = isDark ? "rgba(255,255,255,0.1)" : "none";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={safe} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#16a34a" stopOpacity={isDark ? 0.45 : 0.4} />
            <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
        <XAxis
          dataKey="hour"
          tickFormatter={(h: number) => `${String(h).padStart(2, '0')}h`}
          stroke={axis}
          fontSize={10}
          tickLine={false}
          interval={5}
        />
        <YAxis stroke={axis} fontSize={10} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: '8px', color: '#fff', fontSize: 12 }}
          labelFormatter={(h: number) => `${String(h).padStart(2, '0')}:00`}
          formatter={(v) => [`${v} km`, 'Acumulado']}
        />
        <Area type="monotone" dataKey="km" stroke="none" fill={`url(#${gradId})`} />
        <Line type="monotone" dataKey="km" stroke="#16a34a" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function IconChart() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
}

function IconExpand() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="15 3 21 3 21 9"/>
      <polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/>
      <line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  );
}

type Props = { assetId: string; companyId: string };

export default function CardDailyUsage({ assetId, companyId }: Props) {
  const { data } = useDailyUsage(assetId, companyId, new Date());
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [expanded, setExpanded] = useState(false);

  // Solo cambian colores — dimensiones se mantienen
  const c = isDark
    ? { surface: '#161b2c', border: 'rgba(255,255,255,0.08)', text: '#f4f4f5', muted: '#71717a', shadow: '0 1px 3px rgba(0,0,0,0.3)' }
    : { surface: '#fff',     border: '#e2d7d7',               text: '#0f172a', muted: '#94a3b8', shadow: '0 1px 3px rgba(0,0,0,0.07)' };

  return (
    <>
      <div style={{
        background: c.surface,
        borderRadius: '16px',
        borderColor: c.border,
        borderWidth: '1px',
        borderStyle: 'solid',
        padding: '14px 16px',
        boxShadow: c.shadow,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        height: '200px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <IconChart />
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: c.text }}>Uso del día</h3>
          </div>
          <button
            onClick={() => setExpanded(true)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: c.muted, padding: 2 }}
          >
            <IconExpand />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <Chart data={data} isDark={isDark} />
        </div>
      </div>

      <CockpitModal
        open={expanded}
        onClose={() => setExpanded(false)}
        title="Uso del día (km por hora)"
        maxWidth="95vw"
      >
        <div style={{ height: '70vh' }}>
          <Chart data={data} isDark={isDark} />
        </div>
      </CockpitModal>
    </>
  );
}
