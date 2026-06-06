import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useStatsMaintenances } from '../hooks/useVehicleStats';
import ChartCard from '../common/ChartCard';

type Props = { assetId: string; companyId: string };

export default function ChartMaintenances({ assetId, companyId }: Props) {
  const { data, loading } = useStatsMaintenances(assetId, companyId);
  return (
    <ChartCard title="Mantenimientos" subtitle="Cantidad por mes y por estado" loading={loading}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="month" stroke="#cbd5e1" fontSize={11} tickLine={false} />
          <YAxis stroke="#cbd5e1" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#020305', border: 'none', borderRadius: '8px', fontSize: 12 }}
            labelStyle={{ color: '#fff' }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
          <Bar dataKey="Pendiente"  stackId="a" fill="#f59e0b" maxBarSize={48} />
          <Bar dataKey="En proceso" stackId="a" fill="#3b82f6" maxBarSize={48} />
          <Bar dataKey="Completado" stackId="a" fill="#16a34a" radius={[6, 6, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}