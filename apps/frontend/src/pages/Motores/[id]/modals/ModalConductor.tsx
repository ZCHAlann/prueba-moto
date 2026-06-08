import { useState, useEffect } from 'react';
import CockpitModal from '../common/CockpitModal';
import { useTheme } from '@/context/ThemeContext';
import { Driver, ActiveAssignment } from '../hooks/useVehicleCockpit';
import { useEndAssignment } from '../hooks/useEndAssignment';

type Props = {
  open: boolean;
  onClose: () => void;
  driver: Driver;
  activeAssignment: ActiveAssignment;
  companyId: string;
  onChanged?: () => void;
};

type AvailableDriver = {
  id: number;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  phone: string | null;
  licenseType: string | null;
};

export default function ModalConductor({ open, onClose, driver, activeAssignment, companyId, onChanged }: Props) {
  const { endAssignment, loading: ending } = useEndAssignment(companyId);
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [list, setList] = useState<AvailableDriver[]>([]);
  const [loading, setLoading] = useState(false);

  // Solo cambian colores — layout, gaps, paddings, sizes quedan iguales
  const c = isDark
    ? {
        text:        '#f4f4f5',
        muted:       '#a1a1aa',
        subtle:      '#71717a',
        surface:     '#1a2231',
        avatarBg:    'rgba(255,255,255,0.08)',
        avatarText:  '#a1a1aa',
        row:         { background: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)' },
      }
    : {
        text:        '#0f172a',
        muted:       '#64748b',
        subtle:      '#94a3b8',
        surface:     '#f8fafc',
        avatarBg:    '#e2e8f0',
        avatarText:  '#475569',
        row:         { background: '#f8fafc', border: '1px solid #e2e8f0' },
      };

  useEffect(() => {
    if (!open || activeAssignment) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/company/${companyId}/drivers?available=true`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const json = await res.json();
        if (!cancelled) setList(Array.isArray(json) ? json : (json.drivers ?? []));
      } catch {
        if (!cancelled) setList([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, activeAssignment, companyId]);

  const finish = async () => {
    if (!activeAssignment) return;
    const r = await endAssignment(activeAssignment.id);
    if (r) onChanged?.();
  };

  return (
    <CockpitModal
      open={open}
      onClose={onClose}
      title="👤 Conductor asignado"
      footer={
        activeAssignment ? (
          <button onClick={finish} disabled={ending} style={btnDanger}>
            {ending ? 'Finalizando…' : 'Finalizar asignación'}
          </button>
        ) : null
      }
    >
      {activeAssignment && driver ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {driver.photoUrl ? (
              <img src={driver.photoUrl} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: c.avatarBg, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 24, color: c.avatarText,
              }}>
                👤
              </div>
            )}
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: c.text }}>
                {driver.firstName} {driver.lastName}
              </div>
              <div style={{ fontSize: 13, color: c.muted }}>{driver.phone ?? '—'}</div>
            </div>
          </div>

          <Row label="Tipo de licencia" value={driver.licenseType} text={c.text} muted={c.muted} />
          <Row label="N° Licencia"      value={driver.licenseNumber} text={c.text} muted={c.muted} />
          <Row label="Vencimiento"      value={driver.licenseExpiry} text={c.text} muted={c.muted} />
          <Row label="Email"            value={driver.email} text={c.text} muted={c.muted} />
        </div>
      ) : (
        <div>
          <div style={{ textAlign: 'center', padding: '12px 0 20px', color: c.muted }}>
            Este vehículo no tiene conductor asignado.
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: c.subtle }}>Cargando conductores…</div>
          ) : list.length === 0 ? (
            <div style={{ textAlign: 'center', color: c.subtle }}>No hay conductores disponibles</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {list.map((d) => (
                <button
                  key={d.id}
                  onClick={() => alert(`Asignar a: ${d.firstName} ${d.lastName}\n\n(Conectar con el wizard de acta existente)`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 12px', borderRadius: '10px',
                    background: c.row.background, border: `1px solid ${c.row.border.includes('1px') ? c.row.border : c.row.border}`,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: c.avatarBg, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: c.avatarText,
                  }}>
                    👤
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: c.text }}>
                      {d.firstName} {d.lastName}
                    </div>
                    <div style={{ fontSize: 12, color: c.muted }}>
                      {d.licenseType ?? '—'} · {d.phone ?? '—'}
                    </div>
                  </div>
                  <span style={{ color: '#16a34a', fontSize: 18 }}>→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </CockpitModal>
  );
}

const Row = ({
  label, value, text, muted,
}: {
  label: string;
  value: string | null | undefined;
  text: string;
  muted: string;
}) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '4px 0' }}>
    <span style={{ color: muted }}>{label}</span>
    <span style={{ color: text, fontWeight: 500 }}>{value || '—'}</span>
  </div>
);

const btnDanger: React.CSSProperties = {
  padding: '10px 18px', borderRadius: '8px', border: 'none',
  background: '#dc2626', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '14px',
};
