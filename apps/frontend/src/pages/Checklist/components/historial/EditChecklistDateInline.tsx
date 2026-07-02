"use client";

import { useState } from "react";
import { Loader2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  checklistId: string;
  value: string; // YYYY-MM-DD
  onSave: (id: string, date: string, reason?: string) => Promise<void>;
};

export function EditChecklistDateInline({ checklistId, value, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!draft) {
      toast.error("Fecha requerida");
      return;
    }
    setSaving(true);
    try {
      await onSave(checklistId, draft, reason);
      toast.success("Fecha actualizada");
      setEditing(false);
      setReason("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(value);
    setReason("");
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 shrink-0 w-24">
          Fecha
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-800 dark:text-gray-200">{value || "—"}</span>
          <button
            type="button"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            title="Editar fecha"
          >
            <Pencil size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 shrink-0 w-24">
          Fecha
        </span>
        <input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
          className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-400/30 dark:border-white/[0.08] dark:bg-gray-800 dark:text-white"
        />
      </div>
      <input
        placeholder="Motivo (opcional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={saving}
        className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30 dark:border-white/[0.08] dark:bg-gray-800 dark:text-gray-200"
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/[0.06]"
          title="Cancelar"
        >
          <X size={13} />
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-gray-900 p-1.5 text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          title="Guardar"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        </button>
      </div>
    </div>
  );
}

export default EditChecklistDateInline;