"use client";

// pages/Settings/AISettingsPanel.tsx
// ─────────────────────────────────────────────────────────────────────
// Tab "Asistente IA" dentro de la página /configuracion.
//
// jul 2026 v7 — simplificado. La empresa SOLO carga sus API keys de
// Groq (para texto/chat/análisis) y de Gemini (para imágenes de
// autorizaciones de salida). El MODELO lo define ApliSmart — no se
// puede elegir.
//
// Reglas de UX:
//   - Banner ámbar si el superadmin kill-switchó la IA.
//   - Banner celeste si la empresa usa la config global (sin keys).
//   - Inputs API key son tipo password con show/hide. NO se loguean.
//   - Botón "Probar conexión" ping al provider real.
//   - Tabla de uso últimos 30 días.
// ─────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Sparkles, KeyRound, ShieldAlert, Globe, Cpu, Eye, EyeOff,
  FlaskConical, RotateCcw, MessageSquare, Image as ImageIcon, Volume2,
} from "lucide-react";
import { useCompanyAiSettings } from "@/hooks/useCompanyAiSettings";

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
        <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 p-2 text-blue-700 dark:text-blue-400">
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

function KeyInput({
  label, value, onChange, placeholder, hasKey, last4, setAt, onClear,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hasKey: boolean;
  last4: string | null;
  setAt: string | null;
  onClear: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </label>
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        <span>Estado actual:</span>
        {hasKey ? (
          <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
            ••••{last4 ?? "????"}
          </span>
        ) : (
          <span className="font-semibold text-rose-600 dark:text-rose-400">sin key (usa la global de ApliSmart)</span>
        )}
        {setAt && (
          <span className="text-gray-400">· cargada el {new Date(setAt).toLocaleDateString()}</span>
        )}
      </div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={hasKey ? "Pegar nueva key (reemplaza la actual)" : placeholder}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-10 font-mono text-sm text-gray-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05]"
          aria-label={show ? "Ocultar" : "Mostrar"}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {hasKey && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-rose-600 hover:underline dark:text-rose-400"
        >
          Borrar esta key (volver a la global)
        </button>
      )}
    </div>
  );
}

export function AISettingsPanel() {
  const {
    settings, loading, error,
    providers, usage, usageLoading,
    updateSettings, resetToDefault, testConnection,
    refresh, refreshUsage,
  } = useCompanyAiSettings();

  const [groqKey, setGroqKey]   = useState("");
  const [gemKey, setGemKey]     = useState("");
  const [testing, setTesting]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [testResult, setTestResult] = useState<
    Record<"groq" | "gemini", { ok: boolean; latencyMs?: number; error?: string } | null>
  >({ groq: null, gemini: null });

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

  const isUsingGlobal = !settings.hasGroqApiKey && !settings.hasGeminiApiKey;

  const onSave = async () => {
    setSaving(true);
    try {
      const patch: any = {
        isEnabled:        settings.isEnabled,
        rpmLimit:         settings.rpmLimit,
        tpmLimit:         settings.tpmLimit,
        monthlyBudgetUsd: settings.monthlyBudgetUsd,
        useJarvis:        settings.useJarvis,
        useExitAnalysis:  settings.useExitAnalysis,
        useAiInsights:    settings.useAiInsights,
        useTts:           settings.useTts,
      };
      if (groqKey.trim().length > 0) patch.groqApiKey = groqKey.trim();
      if (gemKey.trim().length > 0)  patch.geminiApiKey = gemKey.trim();

      const ok = await updateSettings(patch);
      if (ok) {
        toast.success("Configuración de IA guardada");
        setGroqKey("");
        setGemKey("");
      } else {
        toast.error("No se pudo guardar la configuración");
      }
    } finally { setSaving(false); }
  };

  const onTest = async (provider: "groq" | "gemini") => {
    setTesting(true);
    setTestResult(r => ({ ...r, [provider]: null }));
    try {
      const r = await testConnection(provider);
      setTestResult(prev => ({ ...prev, [provider]: r }));
      if (r.ok) toast.success(`${provider.toUpperCase()} OK (${r.latencyMs} ms)`);
      else      toast.error(`${provider.toUpperCase()} falló: ${r.error}`);
    } finally { setTesting(false); }
  };

  const onReset = async () => {
    if (!confirm("¿Borrar todas tus API keys? Tu empresa volverá a usar la cascada global de ApliSmart.")) return;
    const ok = await resetToDefault();
    if (ok) {
      toast.success("Keys borradas — volviendo a config global");
      setGroqKey("");
      setGemKey("");
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

      {isUsingGlobal && !settings.killedByPlatform && (
        <Card className="border-sky-200 bg-sky-50 p-4 dark:border-sky-500/30 dark:bg-sky-500/10">
          <div className="flex items-start gap-2">
            <Globe className="mt-0.5 h-4 w-4 text-sky-600 dark:text-sky-400" />
            <div>
              <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">
                Estás usando la configuración global de la plataforma.
              </p>
              <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">
                Todas las empresas comparten la API key configurada en el backend.
                Podés cargar tus propias keys abajo para tener límites y costos independientes.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Section
        icon={<KeyRound size={16} />}
        title="Tus API keys"
        description="Pegá tus propias keys si querés tener límites y costos independientes. Si las dejás vacías, se usa la cascada global de ApliSmart."
      >
        <div className="space-y-5">
          <div>
            <KeyInput
              label="Groq (texto, chat, análisis)"
              value={groqKey}
              onChange={setGroqKey}
              placeholder="gsk_…"
              hasKey={!!settings.hasGroqApiKey}
              last4={settings.groqApiKeyLast4}
              setAt={settings.groqApiKeySetAt}
              onClear={async () => {
                if (!confirm("¿Borrar tu key de Groq? Tu empresa volverá a usar la global.")) return;
                await updateSettings({ groqApiKeyClear: true });
                toast.success("Key de Groq borrada");
              }}
            />
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              Modelo: <code className="font-mono">llama-3.3-70b-versatile</code> (definido por ApliSmart)
            </p>
          </div>

          <div>
            <KeyInput
              label="Gemini (imágenes de autorizaciones de salida)"
              value={gemKey}
              onChange={setGemKey}
              placeholder="AIza…"
              hasKey={!!settings.hasGeminiApiKey}
              last4={settings.geminiApiKeyLast4}
              setAt={settings.geminiApiKeySetAt}
              onClear={async () => {
                if (!confirm("¿Borrar tu key de Gemini? Tu empresa volverá a usar la global.")) return;
                await updateSettings({ geminiApiKeyClear: true });
                toast.success("Key de Gemini borrada");
              }}
            />
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              Modelo: <code className="font-mono">gemini-2.5-flash</code> (definido por ApliSmart)
            </p>
          </div>
        </div>
      </Section>

      <Section
        icon={<Cpu size={16} />}
        title="Features habilitadas"
        description="Qué subsistemas de IA puede usar tu empresa. Independiente de las keys."
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {([
            ["useJarvis",       "Jarvis (chat)",            <MessageSquare size={12} />],
            ["useExitAnalysis", "Análisis de salida",        <ImageIcon     size={12} />],
            ["useAiInsights",   "AI Insights",              <Sparkles      size={12} />],
            ["useTts",          "Text-to-Speech (TTS)",     <Volume2       size={12} />],
          ] as const).map(([key, label, icon]) => (
            <label key={key} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2 text-xs dark:border-white/[0.06]">
              <input
                type="checkbox"
                checked={(settings as any)[key]}
                onChange={e => void updateSettings({ [key]: e.target.checked } as any)}
                disabled={settings.killedByPlatform}
              />
              <span className="text-gray-500 dark:text-gray-400">{icon}</span>
              <span className="text-gray-700 dark:text-gray-200">{label}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section
        icon={<FlaskConical size={16} />}
        title="Probar conexión"
        description="Hace ping al provider con la key configurada actualmente."
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={testing || settings.killedByPlatform}
            onClick={() => void onTest("groq")}
            className="rounded-lg bg-blue-700 hover:bg-blue-800 px-4 py-2 text-xs font-semibold text-white transition disabled:opacity-50"
          >
            {testing ? "Probando…" : "Probar Groq"}
          </button>
          {testResult.groq && (
            <span className={`text-xs ${testResult.groq.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {testResult.groq.ok ? `OK en ${testResult.groq.latencyMs} ms` : `Error: ${testResult.groq.error}`}
            </span>
          )}

          <button
            type="button"
            disabled={testing || settings.killedByPlatform}
            onClick={() => void onTest("gemini")}
            className="rounded-lg bg-blue-700 hover:bg-blue-800 px-4 py-2 text-xs font-semibold text-white transition disabled:opacity-50"
          >
            Probar Gemini
          </button>
          {testResult.gemini && (
            <span className={`text-xs ${testResult.gemini.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {testResult.gemini.ok ? `OK en ${testResult.gemini.latencyMs} ms` : `Error: ${testResult.gemini.error}`}
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
          disabled={isUsingGlobal || saving}
          className="text-xs text-rose-600 hover:underline disabled:opacity-40 dark:text-rose-400"
        >
          Borrar mis keys y volver a la global
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-blue-700 hover:bg-blue-800 px-5 py-2 text-xs font-semibold text-white transition disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
