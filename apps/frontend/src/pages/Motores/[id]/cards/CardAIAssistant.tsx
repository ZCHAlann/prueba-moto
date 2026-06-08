import { useTheme } from '@/context/ThemeContext';

type Props = {
  onAction?: (id: string) => void;
  onClose?: () => void;
};

const ACTIONS: {
  id: string;
  icon: string;
  label: string;
  color: string;        // accent color
  bg: string;           // light bg tint
  bgDark: string;       // dark bg tint
  borderLight: string;
  borderDark: string;
}[] = [
  {
    id: 'mantenimiento',
    icon: '🔧',
    label: 'Agendar mantenimiento',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
    bgDark: 'rgba(245,158,11,0.10)',
    borderLight: 'rgba(245,158,11,0.25)',
    borderDark: 'rgba(245,158,11,0.20)',
  },
  {
    id: 'seguros',
    icon: '🛡️',
    label: 'Seguros',
    color: '#6366f1',
    bg: 'rgba(99,102,241,0.08)',
    bgDark: 'rgba(99,102,241,0.10)',
    borderLight: 'rgba(99,102,241,0.25)',
    borderDark: 'rgba(99,102,241,0.20)',
  },
  {
    id: 'conductor',
    icon: '👤',
    label: 'Conductor',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.08)',
    bgDark: 'rgba(16,185,129,0.10)',
    borderLight: 'rgba(16,185,129,0.25)',
    borderDark: 'rgba(16,185,129,0.20)',
  },
  {
    id: 'toggle',
    icon: '⚡',
    label: 'Activar / Desactivar',
    color: '#06b6d4',
    bg: 'rgba(6,182,212,0.08)',
    bgDark: 'rgba(6,182,212,0.10)',
    borderLight: 'rgba(6,182,212,0.25)',
    borderDark: 'rgba(6,182,212,0.20)',
  },
];

export default function CardAIAssistant({ onAction, onClose }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const c = isDark
    ? {
        surface: '#161b2c',
        text:    '#f4f4f5',
        muted:   '#a1a1aa',
        close:   '#a1a1aa',
        shadow:  '0 8px 24px rgba(0,0,0,0.4)',
        divider: 'rgba(255,255,255,0.06)',
      }
    : {
        surface: '#fff',
        text:    '#0f172a',
        muted:   '#64748b',
        close:   '#94a3b8',
        shadow:  '0 8px 24px rgba(0,0,0,0.08)',
        divider: '#f1f5f9',
      };

  return (
    <div style={{
      background: c.surface,
      borderRadius: '18px',
      padding: '22px',
      boxShadow: c.shadow,
      width: '300px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🤖</span>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: c.text, letterSpacing: '-0.01em' }}>
            AI Assistant
          </h3>
        </div>
        <button
          onClick={onClose}
          style={{
            background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
            border: 'none',
            cursor: 'pointer',
            color: c.close,
            fontSize: '13px',
            width: '26px',
            height: '26px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s',
          }}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      {/* Subtitle */}
      <p style={{ margin: 0, fontSize: '12.5px', color: c.muted, lineHeight: 1.5 }}>
        Selecciona una acción para este vehículo
      </p>

      {/* Divider */}
      <div style={{ height: '1px', background: c.divider }} />

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {ACTIONS.map((a) => {
          const bg     = isDark ? a.bgDark     : a.bg;
          const border = isDark ? a.borderDark : a.borderLight;
          const bgHov  = isDark
            ? a.bgDark.replace('0.10', '0.18')
            : a.bg.replace('0.08', '0.16');

          return (
            <button
              key={a.id}
              onClick={() => onAction?.(a.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '11px 14px',
                borderRadius: '12px',
                background: bg,
                border: `1px solid ${border}`,
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13.5px',
                color: a.color,
                fontWeight: 600,
                transition: 'background 0.15s, transform 0.1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = bgHov;
                e.currentTarget.style.transform = 'translateX(2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = bg;
                e.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <span style={{
                fontSize: '20px',
                width: '32px',
                height: '32px',
                borderRadius: '9px',
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: `0 1px 3px ${border}`,
              }}>
                {a.icon}
              </span>
              <span>{a.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}