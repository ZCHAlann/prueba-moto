import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useStatsFuel } from '../hooks/useVehicleStats';
import { useTheme } from '@/context/ThemeContext';
import ChartCard from '../common/ChartCard';

type Props = { assetId: string; companyId: string };

export default function ChartFuelConsumption({ assetId, companyId }: Props) {
  const { data, loading } = useStatsFuel(assetId, companyId);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const grid = isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9";
  const axis = isDark ? "#52525b" : "#cbd5e1";
  const tipBg = isDark ? "#161b2c" : "#020305";
  const tipBorder = isDark ? "1px solid rgba(255,255,255,0.08)" : "none";

  return (
    <ChartCard title="Consumo de combustible" subtitle="Litros cargados por mes (últimos 12 meses)" loading={loading}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="month" stroke={axis} fontSize={11} tickLine={false} />
          <YAxis stroke={axis} fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: tipBg, border: tipBorder, borderRadius: '8px', fontSize: 12 }}
            labelStyle={{ color: '#fff' }}
          />
          <Bar dataKey="liters" fill="#16a34a" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
