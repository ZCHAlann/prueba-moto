import { useState, ReactNode } from 'react';
import CockpitModal from '../common/CockpitModal';
import { Insurance } from '../hooks/useVehicleCockpit';

type Props = {
  open: boolean;
  onClose: () => void;
  insurance: Insurance;
  assetId: string;
  companyId: string;
  onSaved?: () => void;
};

type Form = { insurer: string; policyNumber: string; coverage: string; startDate: string; endDate: string };

const emptyForm: Form = { insurer: '', policyNumber: '', coverage: '', startDate: '', endDate: '' };

export default function ModalSeguros({ open, onClose, insurance, assetId, companyId, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm]   = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    if (insurance) {
      setForm({
        insurer:      insurance.insurer ?? '',
        policyNumber: insurance.policyNumber ?? '',
        coverage:     insurance.coverage ?? '',
        startDate:    insurance.startDate ?? '',
        endDate:      insurance.endDate ?? '',
      });
    } else {
      setForm(emptyForm);
    }
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const id = insurance?.id?.toString().replace(/^insurance-/, '');
      const url = id
        ? `/api/company/${companyId}/insurance/${id}`
        : `/api/company/${companyId}/insurance`;
      const method = id ? 'PATCH' : 'POST';
      const body = id ? form : { ...form, assetId: Number(assetId.replace(/^asset-/, '')) };

      const res = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setEditing(false);
      onSaved?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const close = () => { setEditing(false); onClose(); };

  return (
    <CockpitModal
      open={open}
      onClose={close}
      title="🛡 Seguros del vehículo"
      footer={
        editing ? (
          <>
            <button onClick={() => setEditing(false)} style={btnSecondary}>Cancelar</button>
            <button onClick={save} disabled={saving} style={btnPrimary}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        ) : (
          <button onClick={startEdit} style={btnPrimary}>
            {insurance ? 'Editar' : 'Agregar seguro'}
          </button>
        )
      }
    >
      {!insurance && !editing && (
        <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
          Este vehículo no tiene seguro activo.
        </div>
      )}

      {insurance && !editing && (
        <div style={{ display: 'grid', gap: '10px' }}>
          <Row label="Aseguradora"   value={insurance.insurer} />
          <Row label="N° Póliza"     value={insurance.policyNumber} />
          <Row label="Cobertura"     value={insurance.coverage} />
          <Row label="Vigencia"      value={`${insurance.startDate} → ${insurance.endDate}`} />
          <Row label="Estado"        value={insurance.status} />
        </div>
      )}

      {editing && (
        <>
          <Field label="Aseguradora">
            <input value={form.insurer} onChange={(e) => setForm({ ...form, insurer: e.target.value })} style={input} />
          </Field>
          <Field label="N° Póliza">
            <input value={form.policyNumber} onChange={(e) => setForm({ ...form, policyNumber: e.target.value })} style={input} />
          </Field>
          <Field label="Cobertura">
            <input value={form.coverage} onChange={(e) => setForm({ ...form, coverage: e.target.value })} style={input} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Inicio">
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={input} />
            </Field>
            <Field label="Fin">
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} style={input} />
            </Field>
          </div>
        </>
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

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ marginBottom: '14px' }}>
    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>
      {label}
    </label>
    {children}
  </div>
);

const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '8px',
  border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
};
const btnPrimary: React.CSSProperties = {
  padding: '10px 18px', borderRadius: '8px', border: 'none',
  background: '#16a34a', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '14px',
};
const btnSecondary: React.CSSProperties = {
  padding: '10px 18px', borderRadius: '8px', border: '1px solid #cbd5e1',
  background: '#fff', color: '#475569', fontWeight: 500, cursor: 'pointer', fontSize: '14px',
};
