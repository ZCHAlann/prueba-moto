import { useState, useMemo } from 'react';
import { useVehicleCockpit, CockpitData } from './hooks/useVehicleCockpit';
import TabVehiculo from './tabs/TabVehiculo';
import TabEstadisticas from './tabs/TabEstadisticas';
import TabRutas from './tabs/TabRutas';
import { useTheme } from '@/context/ThemeContext';

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
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<TabId>('vehiculo');

  const containerStyle = useMemo(() => ({
    width: '100%',
    minHeight: '100vh',
    background: 'transparent',
    padding: '24px',
    boxSizing: 'border-box' as const,
  }), []);

  // Colores según tema — sin cambiar layout ni posiciones
  const colors = useMemo(() => isDark
    ? { text: '#f4f4f5', muted: '#a1a1aa', danger: '#fb7185', surface: '#1a2231', border: 'rgba(255,255,255,0.08)' }
    : { text: '#0f172a', muted: '#64748b', danger: '#dc2626', surface: '#ffffff', border: '#e2e8f0' },
  [isDark]);

  if (loading && !data) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: 40, textAlign: 'center', color: colors.muted }}>
          Cargando cockpit…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: 40, textAlign: 'center', color: colors.danger }}>
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
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: colors.text }}>
            {data.asset.name}
          </h1>
          <div style={{ fontSize: '14px', color: colors.muted, marginTop: '4px' }}>
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
                background: activeTab === t.id ? '#16a34a' : colors.surface,
                color: activeTab === t.id ? '#fff' : colors.muted,
                boxShadow: activeTab === t.id
                  ? '0 4px 12px rgba(22, 163, 74, 0.3)'
                  : isDark
                  ? '0 1px 2px rgba(0,0,0,0.3)'
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
