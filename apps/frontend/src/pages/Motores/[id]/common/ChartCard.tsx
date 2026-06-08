import { ReactNode } from 'react';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  title: string;
  subtitle?: string;
  loading?: boolean;
  children: ReactNode;
};

export default function ChartCard({ title, subtitle, loading, children }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Mismas medidas, paddings, gaps, minHeights — solo cambian colores
  const c = isDark
    ? { surface: '#161b2c', border: 'rgba(255,255,255,0.08)', text: '#f4f4f5', muted: '#71717a' }
    : { surface: '#fff',     border: '#e2e8f0',               text: '#0f172a', muted: '#94a3b8' };

  return (
    <div style={{
      background: c.surface,
      borderRadius: '16px',
      padding: '20px 20px 16px',
      border: `1px solid ${c.border}`,
      boxShadow: isDark ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      minHeight: '260px',
    }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: c.text }}>{title}</h3>
        {subtitle && <div style={{ fontSize: '11px', color: c.muted, marginTop: 3 }}>{subtitle}</div>}
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: c.muted, fontSize: 13,
          }}>
            Cargando…
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
