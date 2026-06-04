import type { OilChange } from "./types";

function fmtDate(d: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface OilChangeHistoryProps {
  changes: OilChange[];
  onDelete?: (chg: OilChange) => void;  
}

export function OilChangeHistory({ changes, onDelete }: OilChangeHistoryProps) {
  if (changes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <p className="text-sm text-white/30">Sin cambios registrados</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">Activo</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">Aceite</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">Fecha</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">Cantidad</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">Lectura</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">Técnico</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {changes.map((chg) => (
            <tr key={chg.id} className="group transition hover:bg-white/[0.02]">
              <td className="px-4 py-3">
                <span className="font-mono text-xs font-bold text-emerald-400">{chg.assetCode}</span>
                <p className="mt-0.5 text-xs text-white/40">{chg.assetName}</p>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs font-semibold text-white/80">{chg.oilName}</span>
                {chg.notes && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-white/30">{chg.notes}</p>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="text-xs text-white/60">{fmtDate(chg.date)}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs font-bold text-emerald-400">{chg.quantity}</span>
                <span className="ml-1 text-xs text-white/30">gal</span>
              </td>
              <td className="px-4 py-3">
                <span className="tabular-nums text-xs text-white/60">{chg.reading.toLocaleString()} km</span>
                <p className="tabular-nums text-[10px] text-white/30">próx. {chg.nextReading.toLocaleString()}</p>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs text-white/60">{chg.technician || "—"}</span>
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onDelete?.(chg)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-500/30 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                    <path d="M10 11v6M14 11v6M9 6V4h6v2" />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}