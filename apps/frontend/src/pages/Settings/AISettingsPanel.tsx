"use client";

// pages/Settings/AISettingsPanel.tsx
// ─────────────────────────────────────────────────────────────────────
// Tab "Asistente IA" dentro de la página /configuracion (jul 2026 v6).
// Permite que el admin_empresa configure su provider + API key.
//
// Reglas de UX:
//   - Banner ámbar si el superadmin kill-switchó la IA.
//   - Banner celeste si la empresa usa la config global (sin override).
//   - Input API key es tipo password con show/hide. NO se loguea.
//   - Botón "Probar conexión" hace ping al provider real.
//   - Tabla de uso últimos 30 días por feature (tokens in/out, requests, USD).
// ─────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Sparkles, KeyRound, ShieldAlert, Globe, Cpu, Eye, EyeOff, FlaskConical, RotateCcw } from "lucide-react";
import { useCompanyAiSettings, type AiProviderId } from "@/hooks/useCompanyAiSettings";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] ${className}`}>
      {children}
    </div>
  );
}

function Section({ icon, title, description, children }: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-violet-50 dark:bg-violet-500/10 p-2 text-violet-600 dark:text-violet-400">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
      </div>
      {children}
    </Card>
  );
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

export function AISettingsPanel() {
  const {
    settings, loading, error,
    providers, usage, usageLoading,
    updateSettings, resetToDefault, testConnection,
    refresh, refreshUsage,
  } = useCompanyAiSettings();

  const [apiKey, setApiKey]       = useState("");
  const [showKey, setShowKey]     = useState(false);
  const [testing, setTesting]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs?: number; error?: string } | null>(null);

  if (loading) {
    return (
      <Card className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
        Cargando configuración de IA…
      </Card>
    );
  }

  if (error || !settings) {
    return (
      <Card className="p-6">
        <p className="text-sm text-rose-600 dark:text-rose-400">
          {error ?? "No se pudo cargar la configuración de IA."}
        </p>
        <button onClick={refresh} className="mt-3 text-xs text-sky-600 hover:underline">
          Reintentar
        </button>
      </Card>
    );
  }

  const selectedProvider = providers.find(p => p.id === settings.provider);
  const isPlatform = settings.provider === "platform_default";

  const onSave = async () => {
    setSaving(true);
    try {
      const patch: any = {
        provider:        settings.provider,
        isEnabled:       settings.isEnabled,
        modelPrimary:    settings.modelPrimary || null,
        modelFallback:   settings.modelFallback || null,
        modelTtsVoice:   settings.modelTtsVoice || null,
        rpmLimit:        settings.rpmLimit,
        tpmLimit:        settings.tpmLimit,
        monthlyBudgetUsd: settings.monthlyBudgetUsd,
        useJarvis:       settings.useJarvis,
        useExitAnalysis: settings.useExitAnalysis,
        useAiInsights:   settings.useAiInsights,
        useTts:          settings.useTts,
      };
      if (apiKey.trim().length > 0) patch.apiKey = apiKey.trim();
      const ok = await updateSettings(patch);
      if (ok) {
        toast.success("Configuración de IA guardada");
        setApiKey("");
      } else {
        toast.error("No se pudo guardar la configuración");
      }
    } finally { setSaving(false); }
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testConnection();
      setTestResult(r);
      if (r.ok) toast.success(`Conexión OK (${r.latencyMs} ms)`);
      else      toast.error(`Conexión fallida: ${r.error}`);
    } finally { setTesting(false); }
  };

  const onReset = async () => {
    if (!confirm("¿Volver a la configuración global de la plataforma? Esto borra tu API key.")) return;
    const ok = await resetToDefault();
    if (ok) {
      toast.success("Configuración reseteada a platform_default");
      setApiKey("");
    }
  };

  return (
    <div className="space-y-4">
      {settings.killedByPlatform && (
        <Card className="border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                La IA está deshabilitada por el administrador de plataforma.
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Contactá al superadmin para reactivar el asistente Jarvis o el análisis de imágenes.
              </p>
            </div>
          </div>
        </Card>
      )}

      {isPlatform && !settings.killedByPlatform && (
        <Card className="border-sky-200 bg-sky-50 p-4 dark:border-sky-500/30 dark:bg-sky-500/10">
          <div className="flex items-start gap-2">
            <Globe className="mt-0.5 h-4 w-4 text-sky-600 dark:text-sky-400" />
            <div>
              <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">
                Estás usando la configuración global de la plataforma.
              </p>
              <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">
                Todas las empresas usan la misma API key configurada en el servidor.
                Podés cargar tu propia key para tener límites y costos independientes.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Section
        icon={<Sparkles size={16} />}
        title="Provider y modelo"
        description="Elegí qué proveedor de IA querés usar. Si dejás 'platform_default', se usa la configuración global."
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Provider
            </label>
            <select
              value={settings.provider}
              onChange={e => {
                const id = e.target.value as AiProviderId;
                const models = providers.find(p => p.id === id)?.models ?? [];
                void updateSettings({
                  provider: id,
                  modelPrimary: models[0] ?? settings.modelPrimary,
                });
              }}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400/30 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
            >
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            {selectedProvider && (
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{selectedProvider.description}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Modelo principal
              </label>
              {selectedProvider && selectedProvider.models.length > 0 ? (
                <select
                  value={settings.modelPrimary ?? ""}
                  onChange={e => void updateSettings({ modelPrimary: e.target.value || null })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400/30 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                >
                  <option value="">(default del provider)</option>
                  {selectedProvider.models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={settings.modelPrimary ?? ""}
                  placeholder="(default del provider)"
                  onChange={e => void updateSettings({ modelPrimary: e.target.value || null })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400/30 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                />
              )}
            </div>

            {settings.provider === "groq" && (
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Modelo fallback
                </label>
                {selectedProvider && selectedProvider.models.length > 0 ? (
                  <select
                    value={settings.modelFallback ?? ""}
                    onChange={e => void updateSettings({ modelFallback: e.target.value || null })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400/30 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                  >
                    <option value="">(sin fallback)</option>
                    {selectedProvider.models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input type="text" value={settings.modelFallback ?? ""} onChange={e => void updateSettings({ modelFallback: e.target.value || null })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400/30 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" />
                )}
              </div>
            )}
          </div>
        </div>
      </Section>

      {!isPlatform && (
        <Section
          icon={<KeyRound size={16} />}
          title="API key"
          description="Tu API key se guarda cifrada (AES-256-GCM). Solo se muestran los últimos 4 caracteres."
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <span>Estado actual:</span>
              {settings.hasApiKey ? (
                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                  ••••{settings.apiKeyLast4 ?? "????"}
                </span>
              ) : (
                <span className="font-semibold text-rose-600 dark:text-rose-400">sin key cargada</span>
              )}
              {settings.apiKeySetAt && (
                <span className="text-gray-400">(cargada el {new Date(settings.apiKeySetAt).toLocaleDateString()})</span>
              )}
            </div>

            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={settings.hasApiKey ? "Cargar nueva API key (reemplaza la actual)" : "Pegá tu API key acá"}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-10 font-mono text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400/30 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05]"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {settings.hasApiKey && (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("¿Borrar la API key guardada? Tu empresa volverá a usar la global.")) return;
                  await updateSettings({ apiKeyClear: true });
                  toast.success("API key borrada");
                }}
                className="text-xs text-rose-600 hover:underline dark:text-rose-400"
              >
                Borrar API key guardada
              </button>
            )}
          </div>
        </Section>
      )}

      <Section
        icon={<Cpu size={16} />}
        title="Features habilitadas"
        description="Qué subsistemas de IA puede usar tu empresa."
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {([
            ["useJarvis", "Jarvis (chat)"],
            ["useExitAnalysis", "Análisis de salida (imágenes)"],
            ["useAiInsights", "AI Insights"],
            ["useTts", "Text-to-Speech"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2 text-xs dark:border-white/[0.06]">
              <input
                type="checkbox"
                checked={(settings as any)[key]}
                onChange={e => void updateSettings({ [key]: e.target.checked } as any)}
                disabled={settings.killedByPlatform}
              />
              <span className="text-gray-700 dark:text-gray-200">{label}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section
        icon={<FlaskConical size={16} />}
        title="Probar conexión"
        description="Hace un ping al provider con tu configuración actual."
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={testing || settings.killedByPlatform}
            onClick={onTest}
            className="rounded-lg bg-violet-600 hover:bg-violet-700 px-4 py-2 text-xs font-semibold text-white transition disabled:opacity-50"
          >
            {testing ? "Probando…" : "Probar conexión"}
          </button>
          {testResult && (
            <span className={`text-xs ${testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {testResult.ok ? `OK en ${testResult.latencyMs} ms` : `Error: ${testResult.error}`}
            </span>
          )}
        </div>
      </Section>

      <Section
        icon={<RotateCcw size={16} />}
        title="Uso últimos 30 días"
        description="Tokens consumidos y requests por feature. Se actualiza cada vez que entrás al tab."
      >
        {usageLoading ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">Cargando…</p>
        ) : usage.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Sin uso registrado en los últimos 30 días.
          </p>
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
            <button
              type="button"
              onClick={() => void refreshUsage()}
              className="mt-3 text-xs text-sky-600 hover:underline dark:text-sky-400"
            >
              Refrescar
            </button>
          </div>
        )}
      </Section>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onReset}
          disabled={isPlatform || saving}
          className="text-xs text-rose-600 hover:underline disabled:opacity-40 dark:text-rose-400"
        >
          Resetear a configuración global
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-sky-600 hover:bg-sky-700 px-5 py-2 text-xs font-semibold text-white transition disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}