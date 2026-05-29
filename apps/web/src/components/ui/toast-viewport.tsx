"use client";

type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastViewportProps = {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
};

const toastToneStyles: Record<ToastTone, string> = {
  success: "border-emerald-200 bg-white",
  error: "border-rose-200 bg-white",
  info: "border-sky-200 bg-white",
};

const toastDotStyles: Record<ToastTone, string> = {
  success: "bg-emerald-500",
  error: "bg-rose-500",
  info: "bg-sky-500",
};

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (!toasts.length) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,420px)] flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-lg border p-4 shadow-[0_20px_45px_-24px_rgba(15,23,42,0.35)] ${toastToneStyles[toast.tone]}`}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${toastDotStyles[toast.tone]}`}
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-neutral-950">{toast.title}</p>
              {toast.description ? (
                <p className="mt-1 text-sm leading-6 text-neutral-600">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-lg px-2 py-1 text-sm font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700"
            >
              Cerrar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
