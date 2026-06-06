import { useState, useMemo } from 'react';
import { useVehicleCockpit, CockpitData } from './hooks/useVehicleCockpit';
import { useCockpitLayout } from './hooks/useCockpitLayout';
import TabVehiculo from './tabs/TabVehiculo';
import TabEstadisticas from './tabs/TabEstadisticas';
import TabRutas from './tabs/TabRutas';

const TABS = [
  { id: 'vehiculo',     label: 'Vehículo' },
  { id: 'estadisticas', label: 'Estadísticas' },
  { id: 'rutas',        label: 'Rutas' },
] as const;

type TabId = typeof TABS[number]['id'];

type Props = {
  assetId: string;
  companyId: string;
};

export default function VehicleCockpit({ assetId, companyId }: Props) {
  const { data, loading, error, refetch } = useVehicleCockpit(assetId, companyId);
  const [activeTab, setActiveTab] = useState<TabId>('vehiculo');

  const containerStyle = useMemo(() => ({
  width: '100%',
    minHeight: '100vh',
    background: 'transparent',
    padding: '24px',
    boxSizing: 'border-box' as const,
  }), []);

  if (loading && !data) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          Cargando cockpit…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>
            {data.asset.name}
          </h1>
          <div style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
            {data.asset.brand} {data.asset.model} {data.asset.year}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 18px',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                background: activeTab === t.id ? '#16a34a' : '#fff',
                color: activeTab === t.id ? '#fff' : '#475569',
                boxShadow: activeTab === t.id
                  ? '0 4px 12px rgba(22, 163, 74, 0.3)'
                  : '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'vehiculo' && (
        <TabVehiculo data={data} companyId={companyId} onRefresh={refetch} />
      )}
      {activeTab === 'estadisticas' && (
        <TabEstadisticas assetId={data.asset.id} companyId={companyId} />
      )}
      {activeTab === 'rutas' && (
        <TabRutas assetId={data.asset.id} companyId={companyId} />
      )}
    </div>
  );
}

export type { CockpitData };
