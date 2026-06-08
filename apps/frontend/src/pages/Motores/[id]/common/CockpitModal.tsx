import { useEffect, ReactNode } from 'react';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
};

export default function CockpitModal({ open, onClose, title, children, footer, maxWidth = '560px' }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Paleta que se adapta al tema — sin tocar layout ni posiciones
  const c = isDark
    ? {
        surface:     '#161b2c',
        border:      'rgba(255,255,255,0.08)',
        text:        '#f4f4f5',
        muted:       '#a1a1aa',
        close:       '#a1a1aa',
        closeHover:  'rgba(255,255,255,0.06)',
      }
    : {
        surface:     '#fff',
        border:      '#e5e7eb',
        text:        '#0f172a',
        muted:       '#64748b',
        close:       '#64748b',
        closeHover:  'rgba(15, 23, 42, 0.05)',
      };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: c.surface, borderRadius: '16px',
          width: '100%', maxWidth,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: isDark
            ? '0 25px 50px -12px rgba(0,0,0,0.6)'
            : '0 25px 50px -12px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          padding: '20px 24px', borderBottom: `1px solid ${c.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: c.text }}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: '20px', color: c.close, padding: '4px 8px', borderRadius: '8px',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = c.closeHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, color: c.text }}>
          {children}
        </div>

        {footer && (
          <div style={{
            padding: '16px 24px', borderTop: `1px solid ${c.border}`,
            display: 'flex', gap: '12px', justifyContent: 'flex-end',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
