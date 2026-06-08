import { useState, ReactNode } from 'react';
import CockpitModal from '../common/CockpitModal';
import { DatePicker } from '../../../../components/ui/date-picker/DatePicker';

type Props = { open: boolean; onClose: () => void; assetId: string; companyId: string };

export default function ModalAgendarMantenimiento({ open, onClose, assetId, companyId }: Props) {
  const [date, setDate]   = useState('');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('Media');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title || !date) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/company/${companyId}/maintenances`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetId: Number(assetId.replace(/^asset-/, '')),
            title, priority, scheduledDate: date, status: 'Pendiente',
          }),
        }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <CockpitModal
      open={open}
      onClose={onClose}
      title="Agendar mantenimiento"
      footer={
        <>
          <button onClick={onClose} style={btnSecondary}>Cancelar</button>
          <button onClick={submit} disabled={saving} style={btnPrimary}>
            {saving ? 'Guardando…' : 'Agendar'}
          </button>
        </>
      }
    >
      <Field label="Título">
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} />
      </Field>
      <Field label="Fecha programada">
        <DatePicker
          value={date}
          onChange={setDate}
          placeholder="Seleccionar fecha"
        />
      </Field>
      <Field label="Prioridad">
        <select value={priority} onChange={(e) => setPriority(e.target.value)} style={input}>
          <option>Baja</option>
          <option>Media</option>
          <option>Alta</option>
          <option>Urgente</option>
        </select>
      </Field>
    </CockpitModal>
  );
}

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
