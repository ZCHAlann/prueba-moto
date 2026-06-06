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
  return (
    <div style={{
      background: '#fff',
      borderRadius: '16px',
      padding: '20px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
      width: '280px',
      display: 'flex', flexDirection: 'column', gap: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
          🤖 AI Assistant
        </h3>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '16px' }}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
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
              background: '#f8fafc', border: '1px solid #e2e8f0',
              cursor: 'pointer', textAlign: 'left',
              fontSize: '13px', color: '#0f172a', fontWeight: 500,
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#f8fafc')}
          >
            <span style={{ fontSize: '18px' }}>{a.icon}</span>
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
