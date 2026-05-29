"use client";

import type { ConfirmSummaryItem } from "@/components/providers/feedback-provider";
import { Button } from "@/components/ui/button";
import { accentStyles, type AppAccent } from "@/lib/navigation";

type DialogStatus = "idle" | "loading" | "success" | "error";

type ActionDialogState = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  accent?: AppAccent;
  summary?: ConfirmSummaryItem[];
  status: DialogStatus;
  runtimeMessage?: string;
};

type ActionDialogProps = {
  dialog: ActionDialogState | null;
  onCancel: () => void;
  onConfirm: () => void;
};

const statusTone = {
  idle: "bg-neutral-100 text-neutral-700",
  loading: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  error: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
};

const statusLabel = {
  idle: "Listo",
  loading: "Procesando",
  success: "Completado",
  error: "Revisar",
};

export function ActionDialog({ dialog, onCancel, onConfirm }: ActionDialogProps) {
  if (!dialog?.open) {
    return null;
  }

  const accent = dialog.accent ?? "emerald";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/45 p-3 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-[0_35px_90px_-32px_rgba(15,23,42,0.4)]">
        <div className={`shrink-0 border-b px-5 py-4 ${accentStyles[accent].header}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-xl">
              <span
                className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${accentStyles[accent].pill}`}
              >
                Confirmación central
              </span>
              <h2 className="mt-3 text-xl font-bold text-neutral-950">{dialog.title}</h2>
              <p className="mt-1.5 text-sm leading-6 text-neutral-600">{dialog.description}</p>
            </div>
            <span
              className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${statusTone[dialog.status]}`}
            >
              {statusLabel[dialog.status]}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {dialog.summary?.length ? (
            <div className="grid gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 sm:grid-cols-2">
              {dialog.summary.map((item) => (
                <div key={`${item.label}-${item.value}`} className="rounded-lg bg-white p-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {item.label}
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-neutral-900">{item.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-lg border border-neutral-200 bg-white p-3">
            <p className="text-sm font-semibold text-neutral-900">Resultado esperado</p>
            <p className="mt-1.5 text-sm leading-6 text-neutral-600">
              {dialog.runtimeMessage ??
                "La acción se registrará en la operación actual y dejará trazabilidad visible en ApliSmart Motors."}
            </p>
          </div>
        </div>

        <div className="shrink-0 flex flex-col-reverse gap-3 border-t border-neutral-200 bg-neutral-50 px-5 py-3 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            tone="neutral"
            onClick={onCancel}
            disabled={dialog.status === "loading"}
          >
            {dialog.cancelLabel ?? "Cancelar"}
          </Button>
          <Button
            variant="solid"
            tone={accent}
            onClick={onConfirm}
            loading={dialog.status === "loading"}
            disabled={dialog.status === "success"}
          >
            {dialog.status === "success" ? "Completado" : dialog.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
