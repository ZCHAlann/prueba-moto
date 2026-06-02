interface ModalActionsProps {
  onCancel: () => void;
  submitting: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  danger?: boolean;     // para acciones destructivas (rojo)
}

export function ModalActions({
  onCancel,
  submitting,
  submitLabel = "Guardar",
  cancelLabel = "Cancelar",
  danger = false,
}: ModalActionsProps) {
  return (
    <>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold
          text-gray-600 transition hover:bg-gray-50
          dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
      >
        {cancelLabel}
      </button>
      <button
        type="submit"
        disabled={submitting}
        className={`inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold
          text-white shadow-sm transition active:scale-95 disabled:opacity-60
          ${danger
            ? "bg-rose-500 shadow-rose-500/20 hover:bg-rose-600"
            : "bg-brand-500 shadow-brand-500/20 hover:bg-brand-600"
          }`}
      >
        {submitting && (
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        )}
        {submitLabel}
      </button>
    </>
  );
}