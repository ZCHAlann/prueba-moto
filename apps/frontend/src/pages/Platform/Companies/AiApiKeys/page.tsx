"use client";

// pages/Platform/Companies/AiApiKeys/page.tsx
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Página dedicada de gestión de API Keys de /api/ai/*
// para una empresa. Vista más completa que la sección del drawer:
//
//   - Header con nombre de empresa y volver
//   - Hero con KPIs (activas, revocadas, último uso, total requests)
//   - Sección completa de gestión (mismo componente que el drawer)
//   - Info box con instrucciones de uso (Custom GPT setup)
//
// Ruta: /panel/companies/:id/ai-api-keys
// ─────────────────────────────────────────────────────────────────────

import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, KeyRound, Sparkles, ExternalLink, ShieldCheck, Activity, Clock, AlertCircle } from "lucide-react";
import { usePlatformCompanies } from "../../../../hooks/usePlatformCompanies";
import { usePlatformAiApiKeys } from "../../../../hooks/usePlatformAiApiKeys";
import { AiApiKeysSection } from "../../../../components/platform/AiApiKeysSection";

export default function CompanyAiApiKeysPage() {
  const { id } = useParams<{ id: string }>();
  const companyId = id ?? null;
  const { companies, loading: loadingCompanies } = usePlatformCompanies();
  const { keys, total } = usePlatformAiApiKeys(companyId);

  const company = companies.find(c => String(c.id) === String(companyId));
  const active = keys.filter(k => k.active).length;
  const revoked = keys.filter(k => !k.active).length;
  const lastUsed = keys
    .map(k => k.lastUsedAt)
    .filter((d): d is string => !!d)
    .sort()
    .pop();

  return (
    <div className="space-y-5 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to={`/panel/companies`}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 dark:border-white/[0.08] dark:hover:bg-white/[0.05]"
          >
            <ArrowLeft size={15} />
          </Link>
          <div>
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 dark:border-violet-500/20 dark:bg-violet-500/10">
              <KeyRound size={10} className="text-violet-600 dark:text-violet-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                API Keys
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-white">
              {loadingCompanies ? "Cargando…" : company?.name ?? "Empresa"}
            </h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Generá keys para que sistemas externos (Custom GPT, n8n, etc.) usen la API /api/ai/*.
            </p>
          </div>
        </div>
        <Link
          to={`/panel/companies/${id}/ai`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
        >
          <Sparkles size={12} /> Config IA
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard icon={<ShieldCheck size={14} />} label="Activas" value={active} tone="emerald" />
        <KpiCard icon={<Activity size={14} />} label="Revocadas" value={revoked} tone="gray" />
        <KpiCard
          icon={<Clock size={14} />}
          label="Último uso"
          value={lastUsed ? new Date(lastUsed).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" }) : "nunca"}
          tone="brand"
        />
      </div>

      {/* Layout 2 cols: gestión + instrucciones */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Columna principal: gestión */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.03] lg:col-span-2"
        >
          <AiApiKeysSection companyId={companyId ?? ""} />
        </motion.div>

        {/* Columna lateral: instrucciones de uso */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="space-y-4"
        >
          <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-500/20 dark:bg-violet-500/[0.05]">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles size={14} className="text-violet-600 dark:text-violet-400" />
              <p className="text-xs font-bold text-violet-900 dark:text-violet-200">Para Custom GPT</p>
            </div>
            <ol className="space-y-2 text-[11px] text-violet-900/80 dark:text-violet-300/80">
              <li className="flex gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-200 text-[9px] font-bold text-violet-800 dark:bg-violet-500/30 dark:text-violet-300">1</span>
                <span>Generá una key con scope <code className="rounded bg-white px-1 font-mono dark:bg-violet-500/10">read,write</code>.</span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-200 text-[9px] font-bold text-violet-800 dark:bg-violet-500/30 dark:text-violet-300">2</span>
                <span>Copiá el <code className="rounded bg-white px-1 font-mono dark:bg-violet-500/10">plainKey</code> y guardalo en un password manager.</span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-200 text-[9px] font-bold text-violet-800 dark:bg-violet-500/30 dark:text-violet-300">3</span>
                <span>En ChatGPT, andá a tu GPT → Actions → Authentication → Bearer → pegá la key.</span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-200 text-[9px] font-bold text-violet-800 dark:bg-violet-500/30 dark:text-violet-300">4</span>
                <span>Importá el schema OpenAPI y las instrucciones desde <code className="rounded bg-white px-1 font-mono dark:bg-violet-500/10">docs/ai-api.openapi.yaml</code>.</span>
              </li>
            </ol>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-500/20 dark:bg-amber-500/[0.05]">
            <div className="mb-2 flex items-center gap-2">
              <AlertCircle size={14} className="text-amber-600 dark:text-amber-400" />
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200">Importante</p>
            </div>
            <ul className="space-y-1.5 text-[11px] text-amber-900/80 dark:text-amber-300/80">
              <li>· Cada key está atada a UNA empresa. No se puede usar para otra.</li>
              <li>· El <code className="rounded bg-white px-1 font-mono dark:bg-amber-500/10">plainKey</code> se muestra UNA sola vez al crear.</li>
              <li>· Si la perdés, tenés que revocarla y crear una nueva.</li>
              <li>· Rate limit: 60 requests/min por key.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Endpoints disponibles
            </p>
            <ul className="mt-2 space-y-1.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
              <li>POST /api/ai/router/consultar</li>
              <li>POST /api/ai/router/crear</li>
              <li>POST /api/ai/router/modificar</li>
              <li>POST /api/ai/router/eliminar</li>
              <li>GET  /api/ai/router/operaciones</li>
            </ul>
            <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
              Despachan internamente según (módulo, operación) en el body.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone: "emerald" | "gray" | "brand" }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    gray: "bg-gray-100 text-gray-500 dark:bg-white/[0.05] dark:text-gray-400",
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400",
  };
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-xl ${tones[tone]}`}>
          {icon}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {label}
        </p>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-800 dark:text-white">
        {value}
      </p>
    </div>
  );
}
