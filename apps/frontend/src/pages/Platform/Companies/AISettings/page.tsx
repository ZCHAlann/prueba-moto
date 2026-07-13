"use client";

// pages/Platform/Companies/AISettings/page.tsx
// ─────────────────────────────────────────────────────────────────────
// Vista de superadmin para gestionar la IA de una empresa (jul 2026 v6).
// Ruta: /platform/companies/:id/ai
// ─────────────────────────────────────────────────────────────────────

import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldAlert, ShieldCheck, Sparkles, KeyRound, Cpu, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePlatformCompanyAI } from "@/hooks/usePlatformCompanyAI";

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

export default function CompanyAIPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, usage, usageLoading, disable, enable, refresh, refreshUsage } = usePlatformCompanyAI(id);

  if (loading && !data) {
    return <div className="p-8 text-sm text-gray-500 dark:text-gray-400">Cargando…</div>;
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <p className="text-sm text-rose-600 dark:text-rose-400">{error ?? "No se pudo cargar."}</p>
        <Link to="/platform/companies" className="mt-3 inline-flex items-center gap-1 text-xs text-sky-600 hover:underline">
          <ArrowLeft size={12} /> Volver
        </Link>
      </div>
    );
  }

  const c = data.config;
  const companyName = data.company.name;
  const companySlug = data.company.slug;
  const killed = c.killedByPlatform;

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/platform/companies" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 dark:hover:text-white">
            <ArrowLeft size={12} /> Empresas
          </Link>
          <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
            IA · {companyName} <span className="text-sm font-mono text-gray-400">({companySlug})</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Configuración de provider, modelo y uso del asistente IA.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {killed ? (
            <button
              onClick={async () => {
                if (!confirm("¿Reactivar la IA para esta empresa?")) return;
                const ok = await enable();
                if (ok) toast.success("IA reactivada");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
            >
              <ShieldCheck size={13} /> Reactivar IA
            </button>
          ) : (
            <button
              onClick={async () => {
                const reason = prompt("Motivo (opcional):", "");
                if (reason === null) return;
                if (!confirm("¿Desactivar la IA para esta empresa? La empresa no podrá usar Jarvis ni análisis.")) return;
                const ok = await disable(reason);
                if (ok) toast.success("IA desactivada (kill-switch ON)");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300"
            >
              <ShieldAlert size={13} /> Kill-switch
            </button>
          )}
        </div>
      </div>

      {killed && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                IA desactivada por plataforma.
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Esta empresa no puede usar Jarvis ni análisis de imágenes hasta que la reactives.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Resumen ── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card icon={<Sparkles size={14} />} title="Provider">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.provider}</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {c.keySource === "company" ? "Usa API key propia" : "Usa config global"}
          </p>
        </Card>
        <Card icon={<KeyRound size={14} />} title="API key">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {c.hasApiKey ? <span className="font-mono">••••{c.apiKeyLast4 ?? "????"}</span> : <span className="text-rose-600 dark:text-rose-400">Sin key</span>}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {c.apiKeySetAt ? `Cargada el ${fmtDate(c.apiKeySetAt)}` : "—"}
          </p>
        </Card>
        <Card icon={<Cpu size={14} />} title="Modelo">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.modelPrimary ?? "(default)"}</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {c.modelFallback ? `Fallback: ${c.modelFallback}` : "Sin fallback"}
          </p>
        </Card>
      </div>

      {/* ── Features ── */}
      <Card icon={<Sparkles size={14} />} title="Features habilitadas">
        <div className="flex flex-wrap gap-2">
          {[
            ["useJarvis", "Jarvis"],
            ["useExitAnalysis", "Análisis de salida"],
            ["useAiInsights", "AI Insights"],
            ["useTts", "Text-to-Speech"],
          ].map(([key, label]) => (
            <span key={key as string} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              (c as any)[key]
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "bg-gray-100 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${(c as any)[key] ? "bg-emerald-500" : "bg-gray-400"}`} />
              {label as string}
            </span>
          ))}
        </div>
      </Card>

      {/* ── Uso últimos 30 días ── */}
      <Card icon={<Sparkles size={14} />} title="Uso últimos 30 días">
        {usageLoading ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">Cargando…</p>
        ) : usage.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">Sin uso registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="py-2 pr-3">Día</th>
                  <th className="py-2 pr-3">Feature</th>
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 pr-3 text-right">Tokens in</th>
                  <th className="py-2 pr-3 text-right">Tokens out</th>
                  <th className="py-2 pr-3 text-right">Requests</th>
                  <th className="py-2 pr-3 text-right">Costo USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {usage.map((r, i) => (
                  <tr key={i} className="text-gray-700 dark:text-gray-200">
                    <td className="py-1.5 pr-3 font-mono">{r.periodDay}</td>
                    <td className="py-1.5 pr-3">{r.feature}</td>
                    <td className="py-1.5 pr-3">{r.provider}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{r.tokensIn.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{r.tokensOut.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{r.requests.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmtMoney(Number(r.costUsd))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => void refreshUsage()} className="mt-3 text-xs text-sky-600 hover:underline dark:text-sky-400">
              Refrescar
            </button>
          </div>
        )}
      </Card>

      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        El admin de la empresa configura la API key desde su propia pantalla de Configuración. Vos podés ver, monitorear y kill-switchear.
      </p>
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]"
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="rounded-md bg-violet-50 p-1.5 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">{icon}</div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200">{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}