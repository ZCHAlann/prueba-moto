import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useStatsCosts } from '../hooks/useVehicleStats';
import ChartCard from '../common/ChartCard';

type Props = { assetId: string; companyId: string };

export default function ChartCosts({ assetId, companyId }: Props) {
  const { data, loading } = useStatsCosts(assetId, companyId);
  return (
    <ChartCard title="Costos totales" subtitle="Combustible (barras) + Mantenimiento (línea)" loading={loading}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="month" stroke="#cbd5e1" fontSize={11} tickLine={false} />
          <YAxis stroke="#cbd5e1" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#020305', border: 'none', borderRadius: '8px', fontSize: 12 }}
            labelStyle={{ color: '#fff' }}
            formatter={(v: number, n: string) => [`$${v.toFixed(2)}`, n === 'fuel' ? 'Combustible' : 'Mantenimiento']}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
          <Bar  dataKey="fuel"        fill="#16a34a" radius={[6, 6, 0, 0]} />
          <Line dataKey="maintenance" stroke="#f59e0b" strokeWidth={2.5} dot={false} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}