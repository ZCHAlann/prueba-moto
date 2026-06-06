import { useState } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useDailyUsage, DailyUsagePoint } from '../hooks/useDailyUsage';
import CockpitModal from '../common/CockpitModal';

function Chart({ data, height = '100%' }: { data: DailyUsagePoint[]; height?: string | number }) {
  const safe: DailyUsagePoint[] = data?.length
    ? data
    : Array.from({ length: 24 }, (_, h) => ({ hour: h, km: 0 }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={safe} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="cockpitGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#16a34a" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="hour"
          tickFormatter={(h: number) => `${String(h).padStart(2, '0')}h`}
          stroke="#cbd5e1"
          fontSize={10}
          tickLine={false}
          interval={5}
        />
        <YAxis stroke="#cbd5e1" fontSize={10} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: 12 }}
          labelFormatter={(h: number) => `${String(h).padStart(2, '0')}:00`}
          formatter={(v) => [`${v} km`, 'Acumulado']}
        />
        <Area type="monotone" dataKey="km" stroke="none" fill="url(#cockpitGreen)" />
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
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        borderColor: '#e2d7d7',
        borderWidth: '1px',
        borderStyle: 'solid',
        padding: '14px 16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        height: '200px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <IconChart />
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Uso del día</h3>
          </div>
          <button
            onClick={() => setExpanded(true)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
          >
            <IconExpand />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <Chart data={data} />
        </div>
      </div>

      <CockpitModal
        open={expanded}
        onClose={() => setExpanded(false)}
        title="Uso del día (km por hora)"
        maxWidth="95vw"
      >
        <div style={{ height: '70vh' }}>
          <Chart data={data} />
        </div>
      </CockpitModal>
    </>
  );
}