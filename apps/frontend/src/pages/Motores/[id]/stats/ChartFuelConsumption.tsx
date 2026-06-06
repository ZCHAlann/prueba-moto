import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useStatsFuel } from '../hooks/useVehicleStats';
import ChartCard from '../common/ChartCard';

type Props = { assetId: string; companyId: string };

export default function ChartFuelConsumption({ assetId, companyId }: Props) {
  const { data, loading } = useStatsFuel(assetId, companyId);
  return (
    <ChartCard title="Consumo de combustible" subtitle="Litros cargados por mes (últimos 12 meses)" loading={loading}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="month" stroke="#cbd5e1" fontSize={11} tickLine={false} />
          <YAxis stroke="#cbd5e1" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#020305', border: 'none', borderRadius: '8px', fontSize: 12 }}
            labelStyle={{ color: '#fff' }}
          />
          <Bar dataKey="liters" fill="#16a34a" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}