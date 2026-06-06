import ChartFuelConsumption from '../stats/ChartFuelConsumption';
import ChartMaintenances    from '../stats/ChartMaintenances';
import ChartOdometer        from '../stats/ChartOdometer';
import ChartCosts           from '../stats/ChartCosts';

type Props = { assetId: string; companyId: string };

export default function TabEstadisticas({ assetId, companyId }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Row 1: 2 charts iguales */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ChartFuelConsumption assetId={assetId} companyId={companyId} />
        <ChartMaintenances    assetId={assetId} companyId={companyId} />
      </div>
      {/* Row 2: 2 charts iguales */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ChartOdometer assetId={assetId} companyId={companyId} />
        <ChartCosts    assetId={assetId} companyId={companyId} />
      </div>
    </div>
  );
}