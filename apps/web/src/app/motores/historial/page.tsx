import { ModulePageHeader } from "@/features/modules/module-page-header";
import { defaultMotorHistory } from "@/features/motores/mock-data";
import { Wrench, FlaskConical, ClipboardCheck, Zap, Search } from "lucide-react";

/* ── Meta por tipo ── */
function getTypeMeta(type: string) {
  const t = type.toLowerCase();
  if (t.includes("diagnos"))  return { icon: <FlaskConical   size={12} strokeWidth={1.8} />, bg: "bg-purple-50 dark:bg-purple-500/10",  text: "text-purple-700 dark:text-purple-400",  dot: "bg-purple-500",  line: "bg-purple-200 dark:bg-purple-800"  };
  if (t.includes("inspecci")) return { icon: <ClipboardCheck size={12} strokeWidth={1.8} />, bg: "bg-blue-50 dark:bg-blue-500/10",      text: "text-blue-700 dark:text-blue-400",      dot: "bg-blue-500",    line: "bg-blue-200 dark:bg-blue-800"      };
  if (t.includes("servicio")) return { icon: <Wrench         size={12} strokeWidth={1.8} />, bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", line: "bg-emerald-200 dark:bg-emerald-800" };
  return                               { icon: <Zap           size={12} strokeWidth={1.8} />, bg: "bg-orange-50 dark:bg-orange-500/10",   text: "text-orange-700 dark:text-orange-400",   dot: "bg-orange-500",  line: "bg-orange-200 dark:bg-orange-800"  };
}

export default function MotorHistoryRoute() {
  const history = defaultMotorHistory;

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Motores"
        title="Historial de motor"
        subtitle="Eventos técnicos registrados: diagnósticos, inspecciones y servicios."
        accent="orange"
      />

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-300 dark:bg-white/[0.03] overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-300">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white">Historial técnico</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {history.length} evento{history.length !== 1 ? "s" : ""} registrado{history.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="relative hidden sm:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar evento..."
              className="h-9 w-48 rounded-lg border border-gray-200 bg-transparent pl-8 pr-3 text-xs text-gray-700 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 dark:border-gray-300 dark:text-white dark:placeholder:text-gray-500"
            />
          </div>
        </div>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Sin registros</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">No hay eventos técnicos registrados aún.</p>
          </div>
        ) : (
          <>
            {/* ── Desktop ── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-300">
                    {["Motor", "Fecha", "Tipo", "Evento"].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((item, i) => {
                    const meta = getTypeMeta(item.type);
                    const isLast = i === history.length - 1;
                    return (
                      <tr key={item.id} className="group hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">

                        {/* Motor */}
                        <td className="px-5 py-4 border-b border-gray-100 dark:border-gray-300/40">
                          <span className="text-sm font-mono font-semibold text-gray-800 dark:text-white">
                            {item.motorId}
                          </span>
                        </td>

                        {/* Fecha */}
                        <td className="px-5 py-4 border-b border-gray-100 dark:border-gray-300/40 whitespace-nowrap">
                          <span className="text-sm text-gray-500 dark:text-gray-400">{item.date}</span>
                        </td>

                        {/* Tipo */}
                        <td className="px-5 py-4 border-b border-gray-100 dark:border-gray-300/40">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.bg} ${meta.text}`}>
                            {meta.icon}
                            {item.type}
                          </span>
                        </td>

                        {/* Evento con timeline integrado */}
                        <td className="px-5 py-4 border-b border-gray-100 dark:border-gray-300/40">
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center flex-shrink-0 mt-1.5">
                              <div className={`w-2 h-2 rounded-full ring-2 ring-white dark:ring-gray-900 flex-shrink-0 ${meta.dot}`} />
                              {!isLast && <div className={`w-px flex-1 min-h-[28px] mt-1 ${meta.line}`} />}
                            </div>
                            <div className="min-w-0 pb-1">
                              <p className="text-sm font-semibold text-gray-800 dark:text-white leading-snug">{item.title}</p>
                              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">{item.detail}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Mobile: timeline puro ── */}
            <div className="md:hidden px-4 py-3">
              {history.map((item, i) => {
                const meta = getTypeMeta(item.type);
                const isLast = i === history.length - 1;
                return (
                  <div key={item.id} className="flex gap-3 py-3">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={`w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-gray-900 mt-1 flex-shrink-0 ${meta.dot}`} />
                      {!isLast && <div className={`w-px flex-1 min-h-[24px] mt-1 ${meta.line}`} />}
                    </div>
                    <div className="flex-1 min-w-0 pb-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.bg} ${meta.text}`}>
                          {meta.icon}
                          {item.type}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">{item.date}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-white leading-snug">{item.title}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">{item.detail}</p>
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-1 inline-block">{item.motorId}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}