import { useToggleEngine } from '../hooks/useToggleEngine';
import { useToggleLock } from '../hooks/useToggleLock';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  assetId: string;
  companyId: string;
  engineOn: boolean;
  locked: boolean;
  onChange?: (partial: { engineOn?: boolean; locked?: boolean }) => void;
};

function IconEngine({ on: _on }: { on: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="10" rx="2"/>
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="12"/>
      <path d="M8 12h.01M12 12h.01M16 12h.01"/>
    </svg>
  );
}

function IconLock({ locked }: { locked: boolean }) {
  return locked ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 019.9-1"/>
    </svg>
  );
}

function IconZap() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

export default function CardAcciones({ assetId, companyId, engineOn, locked, onChange }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { toggle: toggleEngine, loading: loadingE } = useToggleEngine(assetId, companyId);
  const { toggle: toggleLock,   loading: loadingL } = useToggleLock(assetId, companyId);

  // Solo cambian colores — el layout (padding, height, gap, border-radius) se mantiene
  const c = isDark
    ? {
        surface:      '#161b2c',
        border:       'rgba(255,255,255,0.08)',
        text:         '#f4f4f5',
        engineOn:     { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e' },
        engineOff:    { bg: 'rgba(255,255,255,0.05)', text: '#a1a1aa' },
        lockedOn:     { bg: 'rgba(244,63,94,0.15)',   text: '#fb7185' },
        lockedOff:    { bg: 'rgba(255,255,255,0.05)', text: '#a1a1aa' },
      }
    : {
        surface:      '#fff',
        border:       '#e2d7d7',
        text:         '#0f172a',
        engineOn:     { bg: '#dcfce7', text: '#15803d' },
        engineOff:    { bg: '#f1f5f9', text: '#475569' },
        lockedOn:     { bg: '#fee2e2', text: '#dc2626' },
        lockedOff:    { bg: '#f1f5f9', text: '#475569' },
      };

  const onEngine = async () => {
    const r = await toggleEngine();
    if (r) onChange?.({ engineOn: r.engineOn });
  };
  const onLock = async () => {
    const r = await toggleLock();
    if (r) onChange?.({ locked: r.locked });
  };

  const engineStyle = engineOn ? c.engineOn : c.engineOff;
  const lockedStyle = locked ? c.lockedOn : c.lockedOff;

  return (
    <div style={{
      background: c.surface,
      borderRadius: '16px',
      borderColor: c.border,
      borderWidth: '1px',
      borderStyle: 'solid',
      padding: '14px 16px',
      boxShadow: isDark ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.07)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      height: '200px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#16a34a' }}><IconZap /></span>
        <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: c.text }}>Acciones</h3>
      </div>

      {/* Buttons */}
      <div style={{ flex: 1, display: 'flex', gap: '10px', alignItems: 'stretch' }}>
        {/* Motor */}
        <button
          onClick={onEngine}
          disabled={loadingE}
          style={{
            flex: 1,
            borderRadius: '12px',
            border: 'none',
            cursor: loadingE ? 'not-allowed' : 'pointer',
            background: engineStyle.bg,
            color: engineStyle.text,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px',
            fontWeight: 600, fontSize: '13px',
            opacity: loadingE ? 0.6 : 1,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { if (!loadingE) e.currentTarget.style.filter = 'brightness(0.96)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
        >
          <IconEngine on={engineOn} />
          <span>{engineOn ? 'Apagar' : 'Prender'}</span>
          <span style={{ fontSize: '11px', fontWeight: 400, opacity: 0.7 }}>Motor</span>
        </button>

        {/* Bloqueo */}
        <button
          onClick={onLock}
          disabled={loadingL}
          style={{
            flex: 1,
            borderRadius: '12px',
            border: 'none',
            cursor: loadingL ? 'not-allowed' : 'pointer',
            background: lockedStyle.bg,
            color: lockedStyle.text,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px',
            fontWeight: 600, fontSize: '13px',
            opacity: loadingL ? 0.6 : 1,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { if (!loadingL) e.currentTarget.style.filter = 'brightness(0.96)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
        >
          <IconLock locked={locked} />
          <span>{locked ? 'Bloqueado' : 'Desbloquear'}</span>
          <span style={{ fontSize: '11px', fontWeight: 400, opacity: 0.7 }}>Bloqueo</span>
        </button>
      </div>
    </div>
  );
}
