import { useState, useEffect, ReactNode } from 'react';
import CockpitModal from '../common/CockpitModal';
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
  const [list, setList] = useState<AvailableDriver[]>([]);
  const [loading, setLoading] = useState(false);

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
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                👤
              </div>
            )}
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
                {driver.firstName} {driver.lastName}
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{driver.phone ?? '—'}</div>
            </div>
          </div>

          <Row label="Tipo de licencia" value={driver.licenseType} />
          <Row label="N° Licencia"      value={driver.licenseNumber} />
          <Row label="Vencimiento"      value={driver.licenseExpiry} />
          <Row label="Email"            value={driver.email} />
        </div>
      ) : (
        <div>
          <div style={{ textAlign: 'center', padding: '12px 0 20px', color: '#64748b' }}>
            Este vehículo no tiene conductor asignado.
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: '#94a3b8' }}>Cargando conductores…</div>
          ) : list.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8' }}>No hay conductores disponibles</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {list.map((d) => (
                <button
                  key={d.id}
                  onClick={() => alert(`Asignar a: ${d.firstName} ${d.lastName}\n\n(Conectar con el wizard de acta existente)`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 12px', borderRadius: '10px',
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    👤
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>
                      {d.firstName} {d.lastName}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
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

const Row = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '4px 0' }}>
    <span style={{ color: '#64748b' }}>{label}</span>
    <span style={{ color: '#0f172a', fontWeight: 500 }}>{value || '—'}</span>
  </div>
);

const btnDanger: React.CSSProperties = {
  padding: '10px 18px', borderRadius: '8px', border: 'none',
  background: '#dc2626', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '14px',
};
