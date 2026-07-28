"use client";

// pages/Settings/WhatsappSettingsPanel.tsx
// ─────────────────────────────────────────────────────────────────────
// Tab "Notificaciones WhatsApp" dentro de /configuracion (jul 2026 v8.6).
//
// Permite al admin/owner de la empresa:
//   - Definir la lista de números destinatarios (max 20).
//   - Editar las plantillas con placeholders (scheduled / completed).
//   - Activar / desactivar el envío de notificaciones por empresa.
//
// Endpoints:
//   GET  /api/company/:id/whatsapp-settings
//   PUT  /api/company/:id/whatsapp-settings
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  MessageCircle, Phone, Plus, Trash2, X, AlertTriangle, Check, Loader2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface WhatsappSettings {
  exists: boolean;
  notifyNumbers: string[];
  templateScheduled: string | null;
  templateCompleted: string | null;
  enabled: boolean;
}

const PLACEHOLDERS_SCHEDULED = [
  { key: "{{placa}}",            desc: "Placa del vehículo" },
  { key: "{{tipo}}",             desc: "Tipo de mantenimiento" },
  { key: "{{titulo}}",           desc: "Título" },
  { key: "{{descripcion}}",      desc: "Descripción" },
  { key: "{{fecha}}",            desc: "Fecha programada" },
  { key: "{{responsable}}",      desc: "Responsable" },
  { key: "{{responsable_linea}}",desc: "Línea de responsable" },
  { key: "{{creado_por}}",       desc: "Quién lo creó" },
];

const PLACEHOLDERS_COMPLETED = [
  { key: "{{placa}}",              desc: "Placa del vehículo" },
  { key: "{{tipo}}",               desc: "Tipo de mantenimiento" },
  { key: "{{titulo}}",             desc: "Título" },
  { key: "{{descripcion}}",        desc: "Descripción" },
  { key: "{{costo}}",              desc: "Costo total formateado" },
  { key: "{{fecha_fin}}",          desc: "Fecha de finalización" },
  { key: "{{responsable}}",        desc: "Responsable" },
  { key: "{{responsable_linea}}",  desc: "Línea de responsable" },
  { key: "{{observaciones}}",      desc: "Observaciones crudas" },
  { key: "{{observaciones_linea}}",desc: "Línea de observaciones" },
  { key: "{{finalizado_por}}",     desc: "Quién lo finalizó" },
];

// ── Sub-componentes ────────────────────────────────────────────────

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
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-400">
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

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${
        enabled ? "bg-emerald-500" : "bg-gray-200 dark:bg-white/[0.1]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          enabled ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── Componente principal ──────────────────────────────────────────

export function WhatsappSettingsPanel() {
  const { session } = useAuth();
  const companyId = session?.companyId;
  const role = session?.role;

  // jul 2026 v8.6 — solo admin/owner/superadmin pueden configurar
  // WhatsApp. El backend también lo valida (requireAdmin), pero
  // mostramos un mensaje claro en lugar de tirar error 403.
  if (role !== "owner_empresa" && role !== "admin_empresa" && role !== "superadmin") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="text-sm text-amber-800 dark:text-amber-200">
          <p className="font-semibold">Acceso restringido</p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            Solo el admin u owner de la empresa puede modificar la configuración de notificaciones WhatsApp.
          </p>
        </div>
      </div>
    );
  }

  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [settings, setSettings] = useState<WhatsappSettings | null>(null);

  // form local
  const [enabled,            setEnabled]            = useState(true);
  const [numbers,            setNumbers]            = useState<string[]>([]);
  const [newNumber,          setNewNumber]          = useState("");
  const [templateScheduled,  setTemplateScheduled]  = useState("");
  const [templateCompleted,  setTemplateCompleted]  = useState("");

  // refs para insertar placeholders en el cursor del textarea
  const tScheduledRef = useRef<HTMLTextAreaElement>(null);
  const tCompletedRef = useRef<HTMLTextAreaElement>(null);

  // ── Load inicial ────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/company/${companyId}/whatsapp-settings`, { cache: "no-store" });
      if (!r.ok) throw new Error("No se pudo cargar la configuración de WhatsApp");
      const data: WhatsappSettings = await r.json();
      setSettings(data);
      setEnabled(           data.enabled);
      setNumbers(           data.notifyNumbers);
      setTemplateScheduled( data.templateScheduled ?? "");
      setTemplateCompleted( data.templateCompleted ?? "");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // ── Numbers helpers ────────────────────────────────────────────
  function addNumber() {
    const cleaned = newNumber.replace(/[^\d]/g, "");
    if (cleaned.length < 9 || cleaned.length > 15) {
      toast.error("El número debe tener 9 a 15 dígitos (con código de país, sin '+').");
      return;
    }
    if (numbers.includes(cleaned)) {
      toast.error("Ese número ya está en la lista.");
      return;
    }
    if (numbers.length >= 20) {
      toast.error("Máximo 20 números destinatarios.");
      return;
    }
    setNumbers([...numbers, cleaned]);
    setNewNumber("");
  }

  function removeNumber(n: string) {
    setNumbers(numbers.filter(x => x !== n));
  }

  // ── Placeholder insert ─────────────────────────────────────────
  function insertPlaceholder(ref: React.RefObject<HTMLTextAreaElement>, ph: string, setter: (v: string) => void) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end   = el.selectionEnd   ?? 0;
    const value = el.value;
    const next  = value.slice(0, start) + ph + value.slice(end);
    setter(next);
    // restaurar cursor después del placeholder insertado
    requestAnimationFrame(() => {
      el.focus();
      const newPos = start + ph.length;
      el.setSelectionRange(newPos, newPos);
    });
  }

  // ── Save ───────────────────────────────────────────────────────
  async function handleSave() {
    if (!companyId) return;
    setSaving(true);
    try {
      const payload = {
        notifyNumbers:     numbers,
        templateScheduled: templateScheduled.trim() === "" ? null : templateScheduled,
        templateCompleted: templateCompleted.trim() === "" ? null : templateCompleted,
        enabled,
      };
      const r = await fetch(`/api/company/${companyId}/whatsapp-settings`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || "Error al guardar");
      }
      const json = await r.json();
      setSettings(json.settings);
      toast.success("Configuración de WhatsApp guardada.");
    } catch (err) {
      toast.error((err as Error).message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  // ── Preview en vivo ────────────────────────────────────────────
  const previewScheduled = useMemo(() => {
    return renderPreviewLocal(templateScheduled, {
      placa:             "ABC-1234",
      tipo:              "PREVENTIVO",
      titulo:            "Cambio de aceite",
      descripcion:       "Cada 5.000 km",
      fecha:             "24/07/2026 09:00",
      responsable:       "Juan Pérez",
      responsable_linea: "• Responsable: Juan Pérez",
      creado_por:        "Admin",
    });
  }, [templateScheduled]);

  const previewCompleted = useMemo(() => {
    return renderPreviewLocal(templateCompleted, {
      placa:               "ABC-1234",
      tipo:                "PREVENTIVO",
      titulo:              "Cambio de aceite",
      descripcion:         "Cada 5.000 km",
      costo:               "USD 45.00",
      fecha_fin:           "23/07/2026 16:30",
      responsable:         "Juan Pérez",
      responsable_linea:   "• Responsable: Juan Pérez",
      observaciones:       "Sin novedades",
      observaciones_linea: "• Observaciones: Sin novedades",
      finalizado_por:      "Operador X",
    });
  }, [templateCompleted]);

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando configuración de WhatsApp...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Estado / Toggle */}
      <Section
        icon={<MessageCircle className="h-4 w-4" />}
        title="Notificaciones WhatsApp"
        description="Avisos automáticos al agendar o finalizar mantenimientos. Si no configurás nada, usamos los defaults globales."
      >
        <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-white/[0.06] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Envío habilitado</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {settings?.exists
                ? "Tu config custom está activa."
                : "Usando configuración default."}
            </p>
          </div>
          <Toggle enabled={enabled} onChange={setEnabled} />
        </div>
      </Section>

      {/* Números destinatarios */}
      <Section
        icon={<Phone className="h-4 w-4" />}
        title="Números destinatarios"
        description="Hasta 20 números con código de país (sin '+'). Presiona enter para agregar. Ej: 593999999999 para Ecuador."
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNumber(); } }}
              placeholder="593999999999"
              className="flex-1 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-4 py-2 text-sm text-gray-800 dark:text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
            />
            <button
              type="button"
              onClick={addNumber}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              <Plus className="h-4 w-4" />
              Agregar
            </button>
          </div>
          {numbers.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No hay números cargados. Si dejás la lista vacía, no se envía ningún WhatsApp.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {numbers.map((n) => (
                <span
                  key={n}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-100 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                >
                  +{n}
                  <button
                    type="button"
                    onClick={() => removeNumber(n)}
                    className="ml-1 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200"
                    aria-label={`Quitar ${n}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Plantilla Scheduled */}
      <Section
        icon={<MessageCircle className="h-4 w-4" />}
        title="Plantilla: mantenimiento agendado"
        description="Se envía cuando se agenda un mantenimiento nuevo."
      >
        <TemplateEditor
          textareaRef={tScheduledRef}
          value={templateScheduled}
          onChange={setTemplateScheduled}
          placeholders={PLACEHOLDERS_SCHEDULED}
          onInsert={(ph) => insertPlaceholder(tScheduledRef, ph, setTemplateScheduled)}
        />
        <PreviewBox text={previewScheduled} />
      </Section>

      {/* Plantilla Completed */}
      <Section
        icon={<MessageCircle className="h-4 w-4" />}
        title="Plantilla: mantenimiento finalizado"
        description="Se envía cuando se finaliza un mantenimiento."
      >
        <TemplateEditor
          textareaRef={tCompletedRef}
          value={templateCompleted}
          onChange={setTemplateCompleted}
          placeholders={PLACEHOLDERS_COMPLETED}
          onInsert={(ph) => insertPlaceholder(tCompletedRef, ph, setTemplateCompleted)}
        />
        <PreviewBox text={previewCompleted} />
      </Section>

      {/* Save */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-4 py-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Los cambios se aplican al próximo mantenimiento que se cree o finalice.
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

// ── Editor de plantilla con chips ──────────────────────────────────

function TemplateEditor({
  textareaRef,
  value,
  onChange,
  placeholders,
  onInsert,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
  placeholders: { key: string; desc: string }[];
  onInsert: (ph: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {placeholders.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onInsert(p.key)}
            title={p.desc}
            className="inline-flex items-center rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-gray-600 dark:text-gray-400 hover:border-emerald-300 hover:text-emerald-700 dark:hover:border-emerald-500/40 dark:hover:text-emerald-400 transition-colors"
          >
            {p.key}
          </button>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        spellCheck={false}
        className="w-full rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-4 py-3 font-mono text-xs text-gray-800 dark:text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 transition-all resize-y"
      />
      <p className="text-[11px] text-gray-400 dark:text-gray-500">
        Click en un chip para insertarlo en el cursor. Máximo 1000 caracteres. Dejalo vacío para usar la plantilla por defecto.
      </p>
    </div>
  );
}

function PreviewBox({ text }: { text: string }) {
  return (
    <div className="mt-3 rounded-xl border border-emerald-100 dark:border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-500/[0.04] p-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
        Vista previa (datos de ejemplo)
      </p>
      <pre className="whitespace-pre-wrap font-sans text-xs text-gray-700 dark:text-gray-300">{text || <span className="italic text-gray-400">(vacío — se usará la plantilla por defecto)</span>}</pre>
    </div>
  );
}

// ── Render preview local (mismo regex que el backend) ──────────────

function renderPreviewLocal(template: string, data: Record<string, string>): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, key: string) => {
    return data[key] ?? "";
  });
}
