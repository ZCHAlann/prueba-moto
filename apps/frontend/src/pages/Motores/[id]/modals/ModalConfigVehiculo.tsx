import { useState, useEffect, ReactNode } from 'react';
import CockpitModal from '../common/CockpitModal';
import { Asset } from '../hooks/useVehicleCockpit';

type Props = {
  open: boolean;
  onClose: () => void;
  asset: Asset;
  companyId: string;
  onSaved?: () => void;
};

export default function ModalConfigVehiculo({ open, onClose, asset, companyId, onSaved }: Props) {
  const [form, setForm] = useState({
    name: '', plate: '', brand: '', model: '', year: '', color: '',
    fuelType: '', oilType: '', oilCapacity: '', observations: '',
    photoUrls: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name:         asset.name ?? '',
      plate:        asset.plate ?? '',
      brand:        asset.brand ?? '',
      model:        asset.model ?? '',
      year:         asset.year ?? '',
      color:        (asset as any).color ?? '',
      fuelType:     asset.fuelType ?? '',
      oilType:      (asset as any).oilType ?? '',
      oilCapacity:  (asset as any).oilCapacity ?? '',
      observations: (asset as any).observations ?? '',
      photoUrls:    asset.photoUrls ?? [],
    });
  }, [open, asset]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      const id = asset.id.toString().replace(/^asset-/, '');
      const res = await fetch(
        `/api/company/${companyId}/assets/${id}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      onSaved?.();
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
      title="⚙ Configuración del vehículo"
      footer={
        <>
          <button onClick={onClose} style={btnSecondary}>Cancelar</button>
          <button onClick={save} disabled={saving} style={btnPrimary}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <Grid>
        <Field label="Nombre"><input value={form.name} onChange={set('name')} style={input} /></Field>
        <Field label="Placa"><input value={form.plate} onChange={set('plate')} style={input} /></Field>
        <Field label="Marca"><input value={form.brand} onChange={set('brand')} style={input} /></Field>
        <Field label="Modelo"><input value={form.model} onChange={set('model')} style={input} /></Field>
        <Field label="Año"><input value={form.year} onChange={set('year')} style={input} /></Field>
        <Field label="Color"><input value={form.color} onChange={set('color')} style={input} /></Field>
        <Field label="Combustible">
          <select value={form.fuelType} onChange={set('fuelType')} style={input}>
            <option value="">—</option>
            <option>Diesel</option>
            <option>Gasolina</option>
            <option>Electrico</option>
            <option>Hibrido</option>
          </select>
        </Field>
        <Field label="Aceite"><input value={form.oilType} onChange={set('oilType')} style={input} /></Field>
        <Field label="Capacidad aceite"><input value={form.oilCapacity} onChange={set('oilCapacity')} style={input} /></Field>
      </Grid>

      <Field label="Observaciones">
        <textarea value={form.observations} onChange={set('observations')} rows={3} style={{ ...input, resize: 'vertical' }} />
      </Field>
    </CockpitModal>
  );
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>
      {label}
    </label>
    {children}
  </div>
);

const Grid = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
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
