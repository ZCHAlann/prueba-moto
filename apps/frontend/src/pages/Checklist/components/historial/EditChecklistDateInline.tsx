"use client";

import { useEffect, useState } from "react";
import { Calendar, Pencil, Check, X, Loader2 } from "lucide-react";
import { DatePicker } from "../../../../components/ui/date-picker/DatePicker";
import { toast } from "sonner";

type Props = {
  checklistId: string;
  value: string; // YYYY-MM-DD
  onSave: (id: string, date: string) => Promise<void>;
};

/**
 * Edición inline de la fecha del checklist, en línea con el patrón
 * usado en mantenimientos: trigger muestra la fecha actual + ícono de
 * lápiz; al click se reemplaza por el `DatePicker` (mismo componente
 * que en `/mantenimiento`). Sin modal, sin motivo adicional.
 */
export function EditChecklistDateInline({ checklistId, value, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  // Si la prop cambia desde fuera (refetch o WS), sincronizo el draft.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  async function handleSave() {
    if (!draft) {
      toast.error("Fecha requerida");
      return;
    }
    setSaving(true);
    try {
      await onSave(checklistId, draft);
      toast.success("Fecha actualizada");
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(value);
    setEditing(false);
  }

  // Mientras NO edita → trigger.
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm font-medium text-gray-800 dark:text-gray-200 transition hover:bg-gray-100 dark:hover:bg-white/[0.06]"
        title="Editar fecha"
      >
        <Calendar size={12} className="text-gray-400 dark:text-gray-500 shrink-0" />
        <span>{value || "—"}</span>
        <Pencil size={11} className="text-gray-400 dark:text-gray-500 shrink-0 opacity-0 transition group-hover:opacity-100" />
      </button>
    );
  }

  // Editando → DatePicker + cancelar / guardar.
  return (
    <div className="inline-flex items-center gap-1.5">
      <DatePicker value={draft} onChange={setDraft} placeholder="Seleccionar fecha" />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded-md bg-gray-900 p-1.5 text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        title="Guardar"
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
      </button>
      <button
        type="button"
        onClick={handleCancel}
        disabled={saving}
        className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/[0.06]"
        title="Cancelar"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export default EditChecklistDateInline;
