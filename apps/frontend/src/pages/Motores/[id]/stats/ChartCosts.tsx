import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useStatsCosts } from '../hooks/useVehicleStats';
import { useTheme } from '@/context/ThemeContext';
import ChartCard from '../common/ChartCard';

type Props = { assetId: string; companyId: string };

export default function ChartCosts({ assetId, companyId }: Props) {
  const { data, loading } = useStatsCosts(assetId, companyId);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const grid = isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9";
  const axis = isDark ? "#52525b" : "#cbd5e1";
  const tipBg = isDark ? "#161b2c" : "#020305";
  const tipBorder = isDark ? "1px solid rgba(255,255,255,0.08)" : "none";
  const legend = isDark ? "#a1a1aa" : "#64748b";

  return (
    <ChartCard title="Costos totales" subtitle="Combustible (barras) + Mantenimiento (línea)" loading={loading}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="month" stroke={axis} fontSize={11} tickLine={false} />
          <YAxis stroke={axis} fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: tipBg, border: tipBorder, borderRadius: '8px', fontSize: 12 }}
            labelStyle={{ color: '#fff' }}
            formatter={(v: number, n: string) => [`$${v.toFixed(2)}`, n === 'fuel' ? 'Combustible' : 'Mantenimiento']}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: legend }} />
          <Bar  dataKey="fuel"        fill="#16a34a" radius={[6, 6, 0, 0]} />
          <Line dataKey="maintenance" stroke="#f59e0b" strokeWidth={2.5} dot={false} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
