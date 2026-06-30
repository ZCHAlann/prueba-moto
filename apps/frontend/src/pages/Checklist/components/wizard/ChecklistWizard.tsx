"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Check, AlertTriangle, Car, User, Wrench, ArrowRight, ClipboardCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../context/AuthContext";
import { useAssets, type Asset } from "../../../../hooks/useAssets";
import { useChecklistCategories, type ChecklistCategory } from "../../../../hooks/useChecklistCategories";
import { useChecklists, type ChecklistInspectionItem, type ChecklistStatus } from "../../../../hooks/useChecklists";
import IncorrectoModal from "./IncorrectoModal";

type WizardAsset = {
  id: string | number;
  name?: string | null;
  plate?: string | null;
  code?: string | null;
  brand?: string | null;
  model?: string | null;
  status?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  itemsPerPage?: number;
  initialCategory?: ChecklistCategory | null;
  presetAsset?: { id: string | number; plate?: string | null } | null;
  presetDriverId?: number | null;
  reauthRequestId?: string | null;
  // Si viene, el step de vehículo solo mostrará este asset.
  // Úsalo cuando el usuario es conductor para restringirlo a su asignación activa.
  restrictToAssetId?: string | number | null;
};

type Step = "vehicle" | "category" | "items" | "review";

export default function ChecklistWizard({
  open, onClose, onSaved, itemsPerPage = 7,
  initialCategory = null, presetAsset = null,
  presetDriverId = null, reauthRequestId = null,
  restrictToAssetId = null,
}: Props) {
  const { assets: allAssets } = useAssets();
  const { categories } = useChecklistCategories();
  const { createChecklist } = useChecklists();
  const { session } = useAuth();

  // Si viene restrictToAssetId, el conductor solo ve su vehículo.
  const assets = useMemo(() => {
    if (!restrictToAssetId) return allAssets;
    return allAssets.filter((a) => String(a.id) === String(restrictToAssetId));
  }, [allAssets, restrictToAssetId]);

  const [step, setStep] = useState<Step>("vehicle");
  const [selectedAsset, setSelectedAsset] = useState<WizardAsset | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ChecklistCategory | null>(null);
  const [responses, setResponses] = useState<Record<string, ChecklistInspectionItem>>({});
  const [pendingIncorrectItem, setPendingIncorrectItem] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResponses({});
    setPage(1);
    setPendingIncorrectItem(null);

    if (presetAsset) {
      setSelectedAsset(presetAsset);
      setSelectedCategory(initialCategory ?? null);
      setStep(initialCategory ? "items" : "category");
    } else {
      setSelectedAsset(null);
      setSelectedCategory(initialCategory ?? null);
      setStep("vehicle");
    }
  }, [open, initialCategory, presetAsset]);

  useEffect(() => {
    if (step !== "category" || initialCategory) return;
    if (categories.length === 1 && !selectedCategory) {
      setSelectedCategory(categories[0]);
      setStep("items");
    }
  }, [step, categories, selectedCategory, initialCategory]);

  useEffect(() => {
    setPage(1);
    setResponses({});
  }, [selectedCategory?.id, selectedAsset?.id]);

  const inferredDriver = useMemo(() => {
    if (presetDriverId) return { id: presetDriverId, name: "—" };
    if (!selectedAsset) return null;
    const cd = (selectedAsset as WizardAsset & { currentDriver?: { id?: number; name?: string } | null }).currentDriver;
    if (!cd?.id) return null;
    return { id: cd.id, name: cd.name ?? "—" };
  }, [selectedAsset, presetDriverId]);

  const items = selectedCategory?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  const startIdx = (page - 1) * itemsPerPage;
  const pageItems = items.slice(startIdx, startIdx + itemsPerPage);
  const answeredCount = useMemo(() => Object.keys(responses).length, [responses]);

  const handleAnswerCorrect = (itemName: string) => {
    setResponses((prev) => ({
      ...prev,
      [itemName]: { itemName, hasItem: "SI", condition: "Bueno", comment: null, photoUrl: null },
    }));
  };

  const handleAnswerIncorrect = (itemName: string) => {
    setPendingIncorrectItem(itemName);
  };

  const handleIncorrectoSave = (data: { observation: string; photoUrl: string | null }) => {
    if (!pendingIncorrectItem) return;
    setResponses((prev) => ({
      ...prev,
      [pendingIncorrectItem]: {
        itemName: pendingIncorrectItem,
        hasItem: "NO",
        condition: "Malo",
        comment: data.observation,
        photoUrl: data.photoUrl,
      },
    }));
    setPendingIncorrectItem(null);
    toast.success("Marcado como Incorrecto");
  };

  const goNextFromItems = () => {
    if (answeredCount < items.length) {
      toast.error("Faltan puntos por revisar", { description: `Llevas ${answeredCount} de ${items.length}.` });
      return;
    }
    setStep("review");
  };

  const handleSubmit = async () => {
    if (!selectedAsset || !selectedCategory) return;
    setSubmitting(true);
    try {
      const itemsArr = selectedCategory.items
        .map((it) => responses[it])
        .filter((r): r is ChecklistInspectionItem => !!r);

      const observed = itemsArr.some((i) => i.hasItem === "NO");
      const status: ChecklistStatus = observed ? "Observado" : "Aprobado";
      const findings = itemsArr
        .map((i) =>
          i.hasItem === "NO"
            ? `${i.itemName}: NO / ${i.condition ?? "Malo"}${i.comment ? ` / ${i.comment}` : ""}`
            : `${i.itemName}: SI / ${i.condition ?? "Bueno"}`
        )
        .join(" | ");

      await createChecklist({
        targetKind: "Vehiculo",
        targetLabel: selectedAsset.plate ?? selectedAsset.code ?? selectedAsset.name ?? "Vehículo",
        assetId: selectedAsset.id,
        driverId: inferredDriver?.id ?? null,
        categoryId: selectedCategory.id,
        date: new Date().toISOString().slice(0, 10),
        status,
        summary: reauthRequestId
          ? `${selectedCategory.name} · ${status} · (atrasado, autorizado)`
          : `${selectedCategory.name} · ${status}`,
        findings,
        items: itemsArr,
        photoUrls: [],
        reauthRequestId: reauthRequestId ?? null,
      });

      toast.success("Checklist registrado", { description: `Estado: ${status}` });
      onSaved();
      onClose();
    } catch (err) {
      console.error("[checklist] error al guardar:", err);
      toast.error(err instanceof Error ? err.message : "No se pudo registrar el checklist");
    } finally {
      setSubmitting(false);
    }
  };

  const STEPS: Array<{ key: Step; label: string; icon: typeof Car }> = [
    ...(!presetAsset ? [{ key: "vehicle" as Step, label: "Vehículo", icon: Car }] : []),
    ...(initialCategory ? [] : [{ key: "category" as Step, label: "Plantilla", icon: ClipboardCheck }]),
    { key: "items", label: "Puntos", icon: Wrench },
    { key: "review", label: "Revisar", icon: Check },
  ];
  const currentStepIdx = STEPS.findIndex((s) => s.key === step);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="w-full max-w-3xl overflow-hidden rounded-3xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500" />
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/[0.06] px-6 py-4 shrink-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Nuevo checklist</p>
            <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">Inspección operativa</h2>
          </div>
          <button onClick={onClose} disabled={submitting}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition disabled:opacity-40">
            <X size={15} />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 pt-3.5 pb-2 border-b border-gray-100 dark:border-white/[0.06] shrink-0">
          {reauthRequestId && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <strong className="font-semibold">Reautorización aprobada.</strong>{" "}
              Estás haciendo este checklist fuera de la ventana de su ciclo. Quedará registrado como <em>atrasado</em>.
            </div>
          )}
          <div className="flex items-center gap-2">
            {STEPS.map((s, idx) => {
              const isCurrent = idx === currentStepIdx;
              const isDone = idx < currentStepIdx;
              return (
                <div key={s.key} className="flex items-center gap-2 flex-1 last:flex-none">
                  <div className="flex items-center gap-1.5">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                      isDone ? "bg-emerald-500 border-emerald-500 text-white"
                        : isCurrent ? "bg-white dark:bg-gray-900 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                        : "border-gray-200 dark:border-white/[0.1] text-gray-400"
                    }`}>
                      {isDone ? <Check size={12} strokeWidth={3} /> : idx + 1}
                    </div>
                    <span className={`text-xs font-semibold ${
                      isCurrent ? "text-emerald-700 dark:text-emerald-400"
                        : isDone ? "text-gray-700 dark:text-gray-300"
                        : "text-gray-400"
                    }`}>
                      {s.label}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`flex-1 h-px ${isDone ? "bg-emerald-500" : "bg-gray-200 dark:bg-white/[0.08]"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait">
            {step === "vehicle" && (
              <motion.div key="step-vehicle" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
                <StepVehicle
                  assets={assets}
                  selected={selectedAsset}
                  onSelect={(a) => setSelectedAsset(a)}
                  isRestricted={!!restrictToAssetId}
                />
              </motion.div>
            )}
            {step === "category" && (
              <motion.div key="step-cat" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
                <StepCategory
                  categories={categories}
                  selected={selectedCategory}
                  onSelect={(c) => setSelectedCategory(c)}
                />
              </motion.div>
            )}
            {step === "items" && (
              <motion.div key="step-items" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
                <StepItems
                  category={selectedCategory}
                  pageItems={pageItems}
                  responses={responses}
                  page={page}
                  totalPages={totalPages}
                  answeredCount={answeredCount}
                  itemsPerPage={itemsPerPage}
                  onAnswerCorrect={handleAnswerCorrect}
                  onAnswerIncorrect={handleAnswerIncorrect}
                  onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
                  onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
                />
              </motion.div>
            )}
            {step === "review" && (
              <motion.div key="step-review" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
                <StepReview
                  asset={selectedAsset}
                  driver={inferredDriver}
                  category={selectedCategory}
                  responses={responses}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/[0.06] px-6 py-3.5 bg-gray-50/80 dark:bg-white/[0.02] shrink-0">
          <button type="button" onClick={onClose} disabled={submitting}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition">
            Cancelar
          </button>
          <div className="flex items-center gap-2">
            {currentStepIdx > 0 && (
              <button type="button" onClick={() => setStep(STEPS[currentStepIdx - 1].key)} disabled={submitting}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04] transition">
                <ChevronLeft size={12} /> Atrás
              </button>
            )}
            {step === "vehicle" && (
              <button type="button" onClick={() => setStep(initialCategory ? "items" : "category")} disabled={!selectedAsset}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-1.5 text-xs font-semibold text-white transition">
                Siguiente <ChevronRight size={12} />
              </button>
            )}
            {step === "category" && (
              <button type="button" onClick={() => setStep("items")} disabled={!selectedCategory}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-1.5 text-xs font-semibold text-white transition">
                Siguiente <ChevronRight size={12} />
              </button>
            )}
            {step === "items" && (
              <button type="button" onClick={goNextFromItems}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition">
                Revisar <ArrowRight size={12} />
              </button>
            )}
            {step === "review" && (
              <button type="button" onClick={handleSubmit} disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-4 py-1.5 text-xs font-semibold text-white transition">
                {submitting && <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {submitting ? "Guardando…" : "Confirmar y guardar"}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      <IncorrectoModal
        open={!!pendingIncorrectItem}
        itemName={pendingIncorrectItem ?? ""}
        onClose={() => setPendingIncorrectItem(null)}
        onSave={handleIncorrectoSave}
      />
    </div>
  );
}

// ─── StepVehicle ─────────────────────────────────────────────────────────────

function StepVehicle({ assets, selected, onSelect, isRestricted }: {
  assets: Asset[];
  selected: WizardAsset | null;
  onSelect: (a: Asset) => void;
  isRestricted: boolean;
}) {
  const [search, setSearch] = useState("");

  const filteredAssets = useMemo(() => {
    if (!search.trim()) return assets;
    const q = search.toLowerCase();
    return assets.filter((a) =>
      (a.plate ?? "").toLowerCase().includes(q) ||
      (a.name ?? "").toLowerCase().includes(q) ||
      (a.code ?? "").toLowerCase().includes(q) ||
      (a.brand ?? "").toLowerCase().includes(q) ||
      (a.model ?? "").toLowerCase().includes(q)
    );
  }, [assets, search]);

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-1">¿A qué vehículo se le hará el checklist?</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        {isRestricted
          ? "Como conductor, solo podés inspeccionar el vehículo de tu asignación activa."
          : "El conductor se completará automáticamente desde la asignación activa."}
      </p>
      {!isRestricted && (
        <div className="relative mb-3">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por placa, nombre o código…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] pl-8 pr-14 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 transition"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none tabular-nums">
            {filteredAssets.length}/{assets.length}
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[360px] overflow-y-auto pr-1">
        {filteredAssets.length === 0 ? (
          <div className="col-span-2 flex flex-col items-center justify-center py-10 text-center">
            <Car size={20} className="text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm text-gray-500">
              {isRestricted
                ? "No tenés un vehículo asignado actualmente. Pedí a un supervisor que te asigne uno."
                : search
                ? `No se encontraron vehículos para "${search}".`
                : "No hay vehículos registrados."}
            </p>
          </div>
        ) : (
          filteredAssets.map((a) => {
            const isSelected = String(selected?.id) === String(a.id);
            return (
              <button key={a.id} type="button" onClick={() => onSelect(a)}
                className={`text-left rounded-xl border p-3 transition flex items-start gap-3 ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/60"
                    : "border-gray-200 dark:border-white/[0.08] hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
                }`}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-500/10">
                  <Car size={15} className="text-cyan-600 dark:text-cyan-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{a.plate ?? a.code ?? a.name}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{[a.brand, a.model].filter(Boolean).join(" ") || a.name}</p>
                  <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500 truncate">{a.status ?? "—"}</p>
                </div>
                {isSelected && <Check size={14} className="text-emerald-500 mt-0.5" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── StepCategory ─────────────────────────────────────────────────────────────

function StepCategory({ categories, selected, onSelect }: {
  categories: ChecklistCategory[];
  selected: ChecklistCategory | null;
  onSelect: (c: ChecklistCategory) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-1">¿Qué plantilla de checklist vas a usar?</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Si solo tienes una plantilla, este paso se omite automáticamente.
      </p>
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <ClipboardCheck size={20} className="text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm text-gray-500">Aún no has creado ninguna plantilla.</p>
            <p className="text-xs text-gray-400 mt-1">Crea una desde el botón "Plantillas" del header.</p>
          </div>
        ) : (
          categories.map((c) => {
            const isSelected = selected?.id === c.id;
            return (
              <button key={c.id} type="button" onClick={() => onSelect(c)}
                className={`w-full text-left rounded-xl border p-3 transition ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/60"
                    : "border-gray-200 dark:border-white/[0.08] hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
                }`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-gray-800 dark:text-white">{c.name}</p>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{c.items.length} puntos</span>
                </div>
                {c.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{c.description}</p>}
                {isSelected && <Check size={14} className="text-emerald-500 mt-2" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── StepItems ────────────────────────────────────────────────────────────────

type StepItemsProps = {
  category: ChecklistCategory | null;
  pageItems: string[];
  responses: Record<string, ChecklistInspectionItem>;
  page: number;
  totalPages: number;
  answeredCount: number;
  itemsPerPage: number;
  onAnswerCorrect: (itemName: string) => void;
  onAnswerIncorrect: (itemName: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
};

function StepItems({ category, pageItems, responses, page, totalPages, answeredCount, itemsPerPage, onAnswerCorrect, onAnswerIncorrect, onPrevPage, onNextPage }: StepItemsProps) {
  const total = category?.items.length ?? 0;
  const start = (page - 1) * itemsPerPage;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-800 dark:text-white">Marca cada punto del checklist</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Plantilla: <span className="font-semibold">{category?.name}</span></p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">Progreso</p>
          <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{answeredCount} / {total}</p>
        </div>
      </div>
      <div className="space-y-2">
        {pageItems.map((it) => {
          const r = responses[it];
          const isCorrect = r?.hasItem === "SI";
          const isIncorrect = r?.hasItem === "NO";
          return (
            <div key={it} className={`rounded-xl border p-3 transition ${
              isCorrect ? "border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-500/[0.04]"
                : isIncorrect ? "border-rose-300 dark:border-rose-500/40 bg-rose-50/40 dark:bg-rose-500/[0.04]"
                : "border-gray-200 dark:border-white/[0.08]"
            }`}>
              <div className="flex items-start gap-3">
                <p className="flex-1 text-sm font-semibold text-gray-800 dark:text-white">{it}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => onAnswerCorrect(it)} disabled={isCorrect}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      isCorrect ? "bg-emerald-500 text-white"
                        : "border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                    }`}>
                    <Check size={12} /> Correcto
                  </button>
                  <button type="button" onClick={() => onAnswerIncorrect(it)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      isIncorrect ? "bg-rose-500 text-white"
                        : "border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    }`}>
                    <AlertTriangle size={12} /> Incorrecto
                  </button>
                </div>
              </div>
              {isIncorrect && r?.comment && (
                <p className="mt-1.5 ml-1 text-xs text-rose-700 dark:text-rose-300 line-clamp-2">
                  <span className="font-semibold">Obs:</span> {r.comment}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Mostrando {start + 1}–{Math.min(start + itemsPerPage, total)} de {total}
          </p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onPrevPage} disabled={page <= 1}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40">
              <ChevronLeft size={12} />
            </button>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 tabular-nums px-2">{page} / {totalPages}</span>
            <button type="button" onClick={onNextPage} disabled={page >= totalPages}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40">
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── StepReview ───────────────────────────────────────────────────────────────

function StepReview({ asset, driver, category, responses }: {
  asset: WizardAsset | null;
  driver: { id: number; name: string } | null;
  category: ChecklistCategory | null;
  responses: Record<string, ChecklistInspectionItem>;
}) {
  const items = category?.items ?? [];
  const incorrect = items.filter((it) => responses[it]?.hasItem === "NO");
  const correct = items.filter((it) => responses[it]?.hasItem === "SI");
  const observed = incorrect.length > 0;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] p-3 bg-gray-50 dark:bg-white/[0.03]">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Vehículo</p>
        <p className="text-sm font-bold text-gray-800 dark:text-white">{asset?.plate ?? asset?.code ?? "—"}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{[asset?.brand, asset?.model].filter(Boolean).join(" ")}</p>
        {driver ? (
          <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <User size={11} /> Conductor: <span className="font-semibold">{driver.name}</span>
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle size={11} /> Sin asignación activa — el campo conductor quedará en blanco.
          </p>
        )}
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Plantilla</p>
        <p className="text-sm font-bold text-gray-800 dark:text-white">{category?.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{items.length} puntos · {correct.length} correctos · {incorrect.length} incorrectos</p>
      </div>
      <div className={`rounded-xl border-2 p-3 ${observed
        ? "border-rose-300 dark:border-rose-500/40 bg-rose-50/40 dark:bg-rose-500/[0.04]"
        : "border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-500/[0.04]"}`}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Resultado</p>
        <p className={`text-base font-bold ${observed ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
          {observed ? "Observado" : "Aprobado"}
        </p>
        {incorrect.length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {incorrect.length} punto{incorrect.length !== 1 ? "s" : ""} con hallazgo
          </p>
        )}
      </div>
    </div>
  );
}