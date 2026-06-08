import { useState, useEffect, ReactNode } from 'react';
import CockpitModal from '../common/CockpitModal';
import { useTheme } from '@/context/ThemeContext';
import { Asset } from '../hooks/useVehicleCockpit';

type Props = {
  open: boolean;
  onClose: () => void;
  asset: Asset;
  companyId: string;
  onSaved?: () => void;
};

export default function ModalConfigVehiculo({ open, onClose, asset, companyId, onSaved }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [form, setForm] = useState({
    name: '', plate: '', brand: '', model: '', year: '', color: '',
    fuelType: '', oilType: '', oilCapacity: '', observations: '',
    photoUrls: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  // Colores dark/light — no cambian layout ni posiciones
  const c = isDark
    ? {
        border:    'rgba(255,255,255,0.10)',
        text:      '#f4f4f5',
        muted:     '#a1a1aa',
        bg:        'rgba(255,255,255,0.04)',
        btnSecBg:  'rgba(255,255,255,0.04)',
        btnSecTxt: '#d4d4d8',
        btnSecBor: 'rgba(255,255,255,0.10)',
      }
    : {
        border:    '#cbd5e1',
        text:      '#0f172a',
        muted:     '#475569',
        bg:        '#ffffff',
        btnSecBg:  '#fff',
        btnSecTxt: '#475569',
        btnSecBor: '#cbd5e1',
      };

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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: `1px solid ${c.border}`,
    background: c.bg, color: c.text, fontSize: '14px',
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <CockpitModal
      open={open}
      onClose={onClose}
      title="⚙ Configuración del vehículo"
      footer={
        <>
          <button onClick={onClose} style={{
            padding: '10px 18px', borderRadius: '8px', border: `1px solid ${c.btnSecBor}`,
            background: c.btnSecBg, color: c.btnSecTxt, fontWeight: 500, cursor: 'pointer', fontSize: '14px',
          }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{
            padding: '10px 18px', borderRadius: '8px', border: 'none',
            background: '#16a34a', color: '#fff', fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px',
          }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <Grid>
        <Field label="Nombre"    muted={c.muted}><input value={form.name}    onChange={set('name')}    style={inputStyle} /></Field>
        <Field label="Placa"     muted={c.muted}><input value={form.plate}   onChange={set('plate')}   style={inputStyle} /></Field>
        <Field label="Marca"     muted={c.muted}><input value={form.brand}   onChange={set('brand')}   style={inputStyle} /></Field>
        <Field label="Modelo"    muted={c.muted}><input value={form.model}   onChange={set('model')}   style={inputStyle} /></Field>
        <Field label="Año"       muted={c.muted}><input value={form.year}    onChange={set('year')}    style={inputStyle} /></Field>
        <Field label="Color"     muted={c.muted}><input value={form.color}   onChange={set('color')}   style={inputStyle} /></Field>
        <Field label="Combustible" muted={c.muted}>
          <select value={form.fuelType} onChange={set('fuelType')} style={inputStyle}>
            <option value="">—</option>
            <option>Diesel</option>
            <option>Gasolina</option>
            <option>Electrico</option>
            <option>Hibrido</option>
          </select>
        </Field>
        <Field label="Aceite"          muted={c.muted}><input value={form.oilType}     onChange={set('oilType')}     style={inputStyle} /></Field>
        <Field label="Capacidad aceite" muted={c.muted}><input value={form.oilCapacity} onChange={set('oilCapacity')} style={inputStyle} /></Field>
      </Grid>

      <Field label="Observaciones" muted={c.muted}>
        <textarea
          value={form.observations}
          onChange={set('observations')}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>
    </CockpitModal>
  );
}

const Field = ({ label, muted, children }: { label: string; muted: string; children: ReactNode }) => (
  <div>
    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: muted, marginBottom: '6px' }}>
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
