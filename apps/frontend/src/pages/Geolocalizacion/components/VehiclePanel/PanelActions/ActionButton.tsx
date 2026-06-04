import React, { useState } from 'react';

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  colorCls: string;       // clases Tailwind de color, ej: "text-emerald-600 dark:text-emerald-400"
  bgCls: string;          // ej: "bg-emerald-50 dark:bg-emerald-500/10"
  borderCls: string;      // ej: "border-emerald-200 dark:border-emerald-500/20"
  requiresConfirm?: boolean;
  onAction: () => Promise<void>;
  disabled?: boolean;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  icon, label, description, colorCls, bgCls, borderCls,
  requiresConfirm = false, onAction, disabled = false,
}) => {
  const [loading, setLoading]       = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback]     = useState<string | null>(null);
  const [pulsing, setPulsing]       = useState(false);

  const isHorn = label === 'Bocina de alerta';

  const run = async () => {
    setLoading(true);
    try {
      await onAction();
      setFeedback('✓ Comando enviado');
    } catch {
      setFeedback('✗ Error al enviar');
    }
    setLoading(false);
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleClick = async () => {
    if (disabled || loading) return;
    if (isHorn) {
      setPulsing(true);
      await run();
      setTimeout(() => setPulsing(false), 2500);
      return;
    }
    if (requiresConfirm && !confirming) { setConfirming(true); return; }
    setConfirming(false);
    await run();
  };

  return (
    <div className="w-full">
      <button
        onClick={handleClick}
        disabled={disabled || loading}
        style={{ animation: pulsing ? 'geo-btn-pulse 200ms ease-in-out 3' : 'none' }}
        className={`
          w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left
          transition-all duration-150
          disabled:opacity-40 disabled:cursor-not-allowed
          ${bgCls} ${borderCls}
          hover:brightness-95 dark:hover:brightness-110
        `}
      >
        <div className={`shrink-0 flex items-center ${colorCls}`}>
          {loading ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="2" strokeDasharray="22 12"/>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </svg>
          ) : icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-800 dark:text-white truncate">
            {loading ? 'Enviando...' : label}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
            {feedback ?? description}
          </div>
        </div>
      </button>

      {/* Inline confirm */}
      {confirming && (
        <div
          className={`mt-1.5 px-3 py-2 rounded-xl border flex items-center gap-2.5 ${bgCls} ${borderCls}`}
          style={{ animation: 'geo-fade-in 150ms ease-out' }}
        >
          <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">¿Confirmar acción?</span>
          <button
            onClick={handleClick}
            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${bgCls} ${colorCls} ${borderCls} hover:brightness-95`}
          >
            Sí
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-xs text-gray-400 dark:text-gray-500 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.05]"
          >
            No
          </button>
        </div>
      )}
    </div>
  );
};