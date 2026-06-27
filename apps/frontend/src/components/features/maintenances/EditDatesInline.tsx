// components/features/maintenances/EditDatesInline.tsx
//
// Editor inline de "Ejecutado" y "Completado" para la sección PROGRAMACIÓN
// del drawer de detalle (MaintenanceDetailDrawer.tsx). Pensado para vivir
// DENTRO de un <Section> existente, que ya separa filas con `divide-y` —
// por eso este componente NO trae su propio border-b, solo el padding
// `px-3 py-2` que usa el resto de las <Row> de esa sección.
//
// Solo se debe RENDERIZAR si el caller ya confirmó que el usuario es
// owner_empresa, admin_empresa u operador (ver canEditDates en el drawer) —
// este componente no vuelve a chequear el rol, el backend es la barrera
// real vía PATCH /:id/dates. Si igual se renderiza para otro rol, el
// guardado falla con 403 y se muestra el toast de error.

import { useState } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUpdateMaintenanceDates } from "../../../hooks/useMaintenancesV2";
import { fmtDateTimeEc } from "@/lib/datetime";

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  // datetime-local espera "YYYY-MM-DDTHH:mm", sin timezone.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  maintenanceId: string;
  label: string;
  /** ISO string o null. */
  value: string | null;
  field: "executedAt" | "completedAt";
  /** Se llama tras un guardado exitoso (ej. refetch() del drawer). */
  onSaved?: () => void;
}

export function EditDatesInline({ maintenanceId, label, value, field, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toLocalInputValue(value));
  const mut = useUpdateMaintenanceDates();

  const fmt = (iso: string | null) => fmtDateTimeEc(iso);

  const save = async () => {
    try {
      await mut.mutateAsync({
        id: maintenanceId,
        [field]: draft ? new Date(draft).toISOString() : null,
      });
      toast.success("Fecha actualizada");
      setEditing(false);
      onSaved?.();
    } catch (e) {
      toast.error("No se pudo actualizar la fecha", {
        description: e instanceof Error ? e.message : "Error",
      });
    }
  };

  if (!editing) {
    return (
      <div className="group flex items-start justify-between gap-3 px-3 py-2 text-xs">
        <span className="shrink-0 text-gray-500 dark:text-gray-400">{label}</span>
        <div className="flex items-center gap-2.5">
          <span className="text-right font-medium text-gray-800 dark:text-white">{fmt(value)}</span>
          <button
            type="button"
            onClick={() => { setDraft(toLocalInputValue(value)); setEditing(true); }}
            className="shrink-0 rounded-md p-1.5 text-gray-300 opacity-60 transition hover:bg-violet-50 hover:text-violet-600 hover:opacity-100 group-hover:opacity-100 dark:text-gray-500 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
            title={`Editar ${label.toLowerCase()}`}
          >
            <Pencil size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
      <span className="shrink-0 text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="datetime-local"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={mut.isPending}
          className="h-7 rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0f1320] px-2 text-xs text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-400/30 dark:focus:ring-violet-500/40"
        />
        <button
          type="button"
          onClick={save}
          disabled={mut.isPending}
          className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition disabled:opacity-50"
          title="Guardar"
        >
          {mut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={mut.isPending}
          className="p-1 rounded-md text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition disabled:opacity-50"
          title="Cancelar"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}