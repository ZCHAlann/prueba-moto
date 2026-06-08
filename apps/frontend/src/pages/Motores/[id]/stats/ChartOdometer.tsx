import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useStatsOdometer } from '../hooks/useVehicleStats';
import { useTheme } from '@/context/ThemeContext';
import ChartCard from '../common/ChartCard';

type Props = { assetId: string; companyId: string };

export default function ChartOdometer({ assetId, companyId }: Props) {
  const { data, loading } = useStatsOdometer(assetId, companyId);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Adaptamos solo colores — el layout del chart y del card no cambia
  const grid = isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9";
  const axis = isDark ? "#52525b" : "#cbd5e1";
  const tipBg = isDark ? "#161b2c" : "#020305";
  const tipBorder = isDark ? "1px solid rgba(255,255,255,0.08)" : "none";

  return (
    <ChartCard title="Kilometraje acumulado" subtitle="Lecturas de odómetro en cargas de combustible" loading={loading}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="odomGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#16a34a" stopOpacity={isDark ? 0.35 : 0.2} />
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="date" stroke={axis} fontSize={11} tickLine={false} />
          <YAxis stroke={axis} fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: tipBg, border: tipBorder, borderRadius: '8px', fontSize: 12 }}
            labelStyle={{ color: '#fff' }}
            formatter={(v: number) => [`${v.toLocaleString()} km`, 'Odómetro']}
          />
          <Area type="monotone" dataKey="odometer" stroke="#16a34a" strokeWidth={2} fill="url(#odomGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
