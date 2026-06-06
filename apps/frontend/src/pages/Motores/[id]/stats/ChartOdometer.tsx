import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useStatsOdometer } from '../hooks/useVehicleStats';
import ChartCard from '../common/ChartCard';

type Props = { assetId: string; companyId: string };

export default function ChartOdometer({ assetId, companyId }: Props) {
  const { data, loading } = useStatsOdometer(assetId, companyId);
  return (
    <ChartCard title="Kilometraje acumulado" subtitle="Lecturas de odómetro en cargas de combustible" loading={loading}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="odomGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#16a34a" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" stroke="#cbd5e1" fontSize={11} tickLine={false} />
          <YAxis stroke="#cbd5e1" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#020305', border: 'none', borderRadius: '8px', fontSize: 12 }}
            labelStyle={{ color: '#fff' }}
            formatter={(v: number) => [`${v.toLocaleString()} km`, 'Odómetro']}
          />
          <Area type="monotone" dataKey="odometer" stroke="#16a34a" strokeWidth={2} fill="url(#odomGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}