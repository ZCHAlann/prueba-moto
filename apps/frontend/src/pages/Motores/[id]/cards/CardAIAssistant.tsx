import { useTheme } from '@/context/ThemeContext';

type Props = {
  onAction?: (id: string) => void;
  onClose?: () => void;
};

const ACTIONS: { id: string; icon: string; label: string }[] = [
  { id: 'mantenimiento', icon: '🔧', label: 'Agendar mantenimiento' },
  { id: 'seguros',       icon: '🛡', label: 'Seguros' },
  { id: 'conductor',     icon: '👤', label: 'Conductor' },
  { id: 'toggle',        icon: '⚡', label: 'Activar / Desactivar' },
];

export default function CardAIAssistant({ onAction, onClose }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Solo cambian colores — dimensiones (width, padding, gap, radius) se mantienen
  const c = isDark
    ? {
        surface:   '#161b2c',
        text:      '#f4f4f5',
        muted:     '#a1a1aa',
        row:       { bg: 'rgba(255,255,255,0.04)', bgHover: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.08)' },
        close:     '#a1a1aa',
        shadow:    '0 8px 24px rgba(0,0,0,0.4)',
      }
    : {
        surface:   '#fff',
        text:      '#0f172a',
        muted:     '#64748b',
        row:       { bg: '#f8fafc', bgHover: '#f1f5f9', border: '#e2e8f0' },
        close:     '#64748b',
        shadow:    '0 8px 24px rgba(0,0,0,0.08)',
      };

  return (
    <div style={{
      background: c.surface,
      borderRadius: '16px',
      padding: '20px',
      boxShadow: c.shadow,
      width: '280px',
      display: 'flex', flexDirection: 'column', gap: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: c.text }}>
          🤖 AI Assistant
        </h3>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: c.close, fontSize: '16px' }}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      <p style={{ margin: 0, fontSize: '13px', color: c.muted }}>
        ¿En qué puedo ayudarte?
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            onClick={() => onAction?.(a.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', borderRadius: '10px',
              background: c.row.bg, border: `1px solid ${c.row.border}`,
              cursor: 'pointer', textAlign: 'left',
              fontSize: '13px', color: c.text, fontWeight: 500,
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = c.row.bgHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = c.row.bg)}
          >
            <span style={{ fontSize: '18px' }}>{a.icon}</span>
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
