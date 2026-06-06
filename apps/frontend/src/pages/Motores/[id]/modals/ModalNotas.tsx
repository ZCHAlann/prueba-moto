import { useState } from 'react';
import CockpitModal from '../common/CockpitModal';
import { useAssetNotes } from '../hooks/useAssetNotes';

type Props = { open: boolean; onClose: () => void; assetId: string; companyId: string };

export default function ModalNotas({ open, onClose, assetId, companyId }: Props) {
  const { notes, addNote, removeNote, loading } = useAssetNotes(assetId, companyId);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    setSaving(true);
    try {
      await addNote(text);
      setBody('');
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
      title="📝 Notas del vehículo"
    >
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribe una nota…"
          rows={3}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: '8px',
            border: '1px solid #cbd5e1', fontSize: '14px', resize: 'vertical',
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={submit}
          disabled={saving || !body.trim()}
          style={{
            padding: '0 16px', borderRadius: '8px', border: 'none',
            background: body.trim() ? '#16a34a' : '#cbd5e1',
            color: '#fff', fontWeight: 600, cursor: body.trim() ? 'pointer' : 'not-allowed',
            fontSize: '14px',
          }}
        >
          {saving ? '…' : 'Agregar'}
        </button>
      </div>

      {loading && notes.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>Cargando…</div>
      ) : notes.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>No hay notas todavía</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {notes.map((n) => (
            <div
              key={n.id}
              style={{
                background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: '10px', padding: '12px 14px',
              }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '6px', fontSize: '12px', color: '#64748b',
              }}>
                <span>{n.authorName ?? 'Anónimo'} · {new Date(n.createdAt).toLocaleString()}</span>
                <button
                  onClick={() => removeNote(n.id)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 12 }}
                >
                  Eliminar
                </button>
              </div>
              <div style={{ fontSize: 14, color: '#0f172a', whiteSpace: 'pre-wrap' }}>{n.body}</div>
            </div>
          ))}
        </div>
      )}
    </CockpitModal>
  );
}
