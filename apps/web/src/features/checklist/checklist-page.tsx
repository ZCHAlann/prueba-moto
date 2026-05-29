"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useMotors } from "@/components/providers/motors-provider";
import { useAssets } from "@/hooks/useAssets";
import { useDrivers } from "@/hooks/useDrivers";
import { useChecklistCategories } from "@/hooks/useChecklistCategories";
import { useChecklists } from "@/hooks/useChecklists";
import { Button } from "@/components/ui/button";
import { SelectField, TextareaField } from "@/components/ui/form-controls";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { defaultGenerators } from "@/features/generadores/mock-data";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import type {
  ChecklistInspectionItem,
  ChecklistItemCondition,
  ChecklistItemPresence,
  ChecklistStatus,
  ChecklistTargetKind,
} from "@/types/fleet";
import type { GeneratorRecord } from "@/types/generator";
import type { Motor } from "@/types/motor";

type ChecklistFormState = {
  targetKind: ChecklistTargetKind;
  targetId: string;
  inspectorId: string;
  categoryId: string;
};

type DraftInspectionItem = ChecklistInspectionItem;

const initialDraftItem: DraftInspectionItem = {
  itemName: "",
  hasItem: "SI",
  condition: "Bueno",
  comment: "",
  imageName: "",
  imagePreview: "",
};

function buildCurrentTimestamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatTimestamp(value: string) {
  return value.replace("T", " ").slice(0, 16);
}

function getAssetLabel(asset: {
  plate?: string;
  brand?: string;
  model?: string;
  code?: string;
  name?: string;
}) {
  const identity = asset.plate || asset.code || asset.name || "Unidad";
  const detail = [asset.brand, asset.model].filter(Boolean).join(" ");
  return detail ? `${identity} / ${detail}` : identity;
}

function getMotorLabel(motor: Motor) {
  return `${motor.internalCode} / ${motor.brand} ${motor.model}`;
}

function getGeneratorLabel(generator: GeneratorRecord) {
  return `${generator.code} / ${generator.name}`;
}

export function ChecklistPage() {
  const { confirmAction, notifyError } = useFeedback();
  const { assets } = useAssets();
  const { drivers } = useDrivers();
  const { categories: checklistCategories } = useChecklistCategories();
  const { checklists, createChecklist } = useChecklists();
  const { motors } = useMotors();

  const [form, setForm] = useState<ChecklistFormState>({
    targetKind: "Vehiculo",
    targetId: "",
    inspectorId: "",
    categoryId: "",
  });
  const [draftItem, setDraftItem] = useState<DraftInspectionItem>(initialDraftItem);
  const [inspectionItems, setInspectionItems] = useState<ChecklistInspectionItem[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof ChecklistFormState, string>>>({});

  const inspectors = useMemo(() => drivers.filter((driver) => driver.status === "Activo"), [drivers]);

  const selectedCategory = useMemo(
    () => checklistCategories.find((category) => category.id === form.categoryId),
    [checklistCategories, form.categoryId]
  );

  const currentTimestamp = buildCurrentTimestamp();

  const equipmentOptions = useMemo(() => {
    if (form.targetKind === "Motor") {
      return motors.map((motor) => ({ value: motor.id, label: getMotorLabel(motor) }));
    }
    if (form.targetKind === "Generador") {
      return defaultGenerators.map((generator) => ({ value: generator.id, label: getGeneratorLabel(generator) }));
    }
    return assets.map((asset) => ({ value: asset.id, label: getAssetLabel(asset) }));
  }, [assets, form.targetKind, motors]);

  const selectedTargetLabel = useMemo(() => {
    if (form.targetKind === "Motor") {
      const motor = motors.find((m) => m.id === form.targetId);
      return motor ? getMotorLabel(motor) : "";
    }
    if (form.targetKind === "Generador") {
      const gen = defaultGenerators.find((g) => g.id === form.targetId);
      return gen ? getGeneratorLabel(gen) : "";
    }
    const asset = assets.find((a) => a.id === form.targetId);
    return asset ? getAssetLabel(asset) : "";
  }, [assets, form.targetId, form.targetKind, motors]);

  const availableCategoryItems = useMemo(() => {
    const registered = new Set(inspectionItems.map((item) => item.itemName));
    return (selectedCategory?.items ?? []).filter((item) => !registered.has(item));
  }, [inspectionItems, selectedCategory]);

  const observedCount = inspectionItems.filter(
    (item) => item.hasItem === "NO" || item.condition !== "Bueno"
  ).length;

  const computedStatus: ChecklistStatus =
    inspectionItems.length > 0 && observedCount === 0 ? "Aprobado" : "Observado";

  const history = useMemo(() => {
    return [...checklists]
      .map((item) => ({
        ...item,
        itemCount: item.items?.length ?? 0,
        evidenceCount: item.items?.filter((entry) => entry.imageName).length ?? 0,
      }))
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [checklists]);

  const updateDraftImage = async (file: File | null) => {
    if (!file) {
      setDraftItem((current) => ({ ...current, imageName: "", imagePreview: "" }));
      return;
    }
    const preview = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("No se pudo leer la imagen seleccionada."));
      reader.readAsDataURL(file);
    });
    setDraftItem((current) => ({ ...current, imageName: file.name, imagePreview: preview }));
  };

  const validateChecklist = () => {
    const nextErrors: Partial<Record<keyof ChecklistFormState, string>> = {};
    if (!form.targetId) nextErrors.targetId = `Selecciona primero un ${form.targetKind.toLowerCase()}.`;
    if (!form.inspectorId) nextErrors.inspectorId = "Se debe crear previamente el inspector para poder seleccionarlo.";
    if (!form.categoryId) nextErrors.categoryId = "Primero crea o selecciona una categoria de checklist.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const addDraftItem = () => {
    if (!validateChecklist()) return;
    if (!draftItem.itemName) {
      notifyError("Falta el punto revisado", "Selecciona un item de la categoria antes de agregarlo al checklist.");
      return;
    }
    if (inspectionItems.some((item) => item.itemName === draftItem.itemName)) {
      notifyError("Item repetido", "Ese punto ya fue agregado a este checklist.");
      return;
    }
    setInspectionItems((current) => [...current, draftItem]);
    setDraftItem({
      ...initialDraftItem,
      itemName: availableCategoryItems.filter((item) => item !== draftItem.itemName)[0] ?? "",
    });
  };

  // ── JSX — idéntico al original, sin cambios visuales ──────────────────────
  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Cumplimiento"
        title="Checklist"
        subtitle="Crea la inspeccion paso a paso: eliges el equipo, agregas hallazgos uno por uno y solo al final registras el checklist completo."
        accent="lime"
        action={
          <Link href="/checklist/categorias">
            <Button tone="lime" variant="outline">Categoria Checklist</Button>
          </Link>
        }
      />

      <section className="grid gap-4 md:grid-cols-2">
        <SurfaceCard className="p-5">
          <p className="text-sm font-semibold text-neutral-950">Categoria Checklist</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Crea y administra las categorias antes de inspeccionar. Cada categoria define los puntos que luego podras agregar uno por uno al checklist.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/checklist/categorias" className="inline-flex">
              <Button tone="lime" variant="solid">Crear nueva categoria</Button>
            </Link>
            <Link href="/checklist/categorias" className="inline-flex">
              <Button tone="neutral" variant="outline">Ver categorias</Button>
            </Link>
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <p className="text-sm font-semibold text-neutral-950">Inspector requerido</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            El inspector debe existir previamente como conductor o responsable activo para poder seleccionarlo dentro del checklist.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/accesos/usuarios" className="inline-flex">
              <Button tone="sky" variant="solid">Crear inspector con acceso</Button>
            </Link>
            <Link href="/operaciones/conductores" className="inline-flex">
              <Button tone="neutral" variant="outline">Ver inspectores</Button>
            </Link>
          </div>
        </SurfaceCard>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Aprobados" value={checklists.filter((item) => item.status === "Aprobado").length.toString()} detail="Sin observaciones" tone="success" />
        <StatCard label="Observados" value={checklists.filter((item) => item.status === "Observado").length.toString()} detail="Con novedades" tone="warning" />
        <StatCard label="Categorias" value={checklistCategories.length.toString()} detail="Plantillas disponibles" tone="info" />
        <StatCard label="Inspecciones" value={checklists.length.toString()} detail="Historial consolidado" tone="neutral" />
      </section>

      <SurfaceCard className="p-5">
        <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Preparar nuevo checklist</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Primero elige el equipo, el inspector y la categoria. La fecha y hora se generan automaticamente al momento de crear el checklist.
            </p>
          </div>
          <div className="space-y-2 text-right">
            <StatusPill
              label={`Resultado actual: ${inspectionItems.length === 0 ? "Pendiente" : computedStatus}`}
              tone={inspectionItems.length === 0 ? "info" : computedStatus === "Aprobado" ? "success" : "warning"}
            />
            <p className="text-xs text-neutral-500">Fecha estimada de registro: {formatTimestamp(currentTimestamp)}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <SelectField
            label="Tipo de equipo"
            value={form.targetKind}
            onChange={(value) => {
              setForm((current) => ({ ...current, targetKind: value as ChecklistTargetKind, targetId: "" }));
              setInspectionItems([]);
              setDraftItem(initialDraftItem);
              setErrors((current) => ({ ...current, targetId: undefined }));
            }}
            accent="lime"
            options={[
              { value: "Vehiculo", label: `Vehiculo (${assets.length})` },
              { value: "Motor", label: `Motor (${motors.length})` },
              { value: "Generador", label: `Generador (${defaultGenerators.length})` },
            ]}
          />
          <SelectField
            label={form.targetKind}
            value={form.targetId}
            onChange={(value) => {
              setForm((current) => ({ ...current, targetId: value }));
              setErrors((current) => ({ ...current, targetId: undefined }));
            }}
            accent="lime"
            error={errors.targetId}
            options={[
              { value: "", label: `Seleccione ${form.targetKind.toLowerCase()}` },
              ...equipmentOptions,
            ]}
          />
          <SelectField
            label="Inspector"
            value={form.inspectorId}
            onChange={(value) => {
              setForm((current) => ({ ...current, inspectorId: value }));
              setErrors((current) => ({ ...current, inspectorId: undefined }));
            }}
            accent="lime"
            error={errors.inspectorId}
            hint="Se debe crear previamente el inspector para poder seleccionarlo."
            options={[
              { value: "", label: "Seleccione inspector" },
              ...inspectors.map((driver) => ({
                value: driver.id,
                label: `${driver.name} / ${driver.licenseType || "Sin licencia"}`,
              })),
            ]}
          />
          <SelectField
            label="Categoria Checklist"
            value={form.categoryId}
            onChange={(value) => {
              const nextCategory = checklistCategories.find((category) => category.id === value);
              setForm((current) => ({ ...current, categoryId: value }));
              setInspectionItems([]);
              setDraftItem({
                ...initialDraftItem,
                itemName: nextCategory?.items[0] ?? "",
              });
              setErrors((current) => ({ ...current, categoryId: undefined }));
            }}
            accent="lime"
            error={errors.categoryId}
            options={[
              { value: "", label: "Seleccione categoria" },
              ...checklistCategories.map((category) => ({
                value: category.id,
                label: `${category.name} (${category.items.length})`,
              })),
            ]}
          />
        </div>

        {assets.length === 0 || inspectors.length === 0 || checklistCategories.length === 0 ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Para crear un checklist debes contar con al menos un vehiculo o motor, un inspector/conductor activo y una categoria de checklist.
          </div>
        ) : null}
      </SurfaceCard>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SurfaceCard className="p-5">
          <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Agregar item al checklist</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Registra cada hallazgo por separado. Cuando termines de sumar todos los puntos revisados, recien creas el checklist completo.
              </p>
            </div>
            {selectedTargetLabel ? (
              <div className="rounded-lg border border-lime-200 bg-lime-50 px-3 py-2 text-sm text-lime-800">
                <p className="font-semibold">{form.targetKind}</p>
                <p className="mt-1">{selectedTargetLabel}</p>
              </div>
            ) : null}
          </div>

          {!selectedCategory ? (
            <EmptyState title="Selecciona una categoria" description="Elige primero una categoria para habilitar la carga de puntos revisados." />
          ) : availableCategoryItems.length === 0 && inspectionItems.length > 0 ? (
            <EmptyState title="Todos los items ya fueron agregados" description="Ya registraste todos los puntos disponibles en esta categoria. Ahora puedes crear el checklist." />
          ) : (
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <SelectField
                  label="Punto revisado"
                  value={draftItem.itemName}
                  onChange={(value) => setDraftItem((current) => ({ ...current, itemName: value }))}
                  accent="lime"
                  options={[
                    { value: "", label: "Seleccione item" },
                    ...availableCategoryItems.map((item) => ({ value: item, label: item })),
                  ]}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Tiene?"
                    value={draftItem.hasItem}
                    onChange={(value) => setDraftItem((current) => ({ ...current, hasItem: value as ChecklistItemPresence }))}
                    accent="lime"
                    options={[{ value: "SI", label: "SI" }, { value: "NO", label: "NO" }]}
                  />
                  <SelectField
                    label="Estado"
                    value={draftItem.condition}
                    onChange={(value) => setDraftItem((current) => ({ ...current, condition: value as ChecklistItemCondition }))}
                    accent="lime"
                    options={[
                      { value: "Bueno", label: "Bueno" },
                      { value: "Regular", label: "Regular" },
                      { value: "Malo", label: "Malo" },
                    ]}
                  />
                </div>
              </div>

              <TextareaField
                label="Comentario"
                value={draftItem.comment}
                onChange={(value) => setDraftItem((current) => ({ ...current, comment: value }))}
                placeholder="Describe lo que encontraste en este punto."
                accent="lime"
                rows={4}
              />

              <div className="space-y-2">
                <span className="text-sm font-medium text-neutral-700">Adjuntar imagen (opcional)</span>
                <div className="rounded-lg border border-neutral-200 bg-white p-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (event) => {
                      try {
                        await updateDraftImage(event.target.files?.[0] ?? null);
                      } catch (error) {
                        notifyError("No se pudo cargar la imagen", error instanceof Error ? error.message : "Intenta nuevamente.");
                      }
                    }}
                    className="w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-neutral-700 hover:file:bg-neutral-200"
                    aria-label="Adjuntar imagen opcional"
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500">
                    <span>La evidencia es opcional.</span>
                    <span className="truncate">{draftItem.imageName || "Sin imagen seleccionada."}</span>
                  </div>
                </div>
                {draftItem.imagePreview ? (
                  <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 p-2">
                    <Image
                      src={draftItem.imagePreview}
                      alt={`Evidencia de ${draftItem.itemName || "item de checklist"}`}
                      width={720}
                      height={440}
                      unoptimized
                      className="h-44 w-full rounded-md object-cover"
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  tone="neutral"
                  variant="outline"
                  onClick={() => setDraftItem({ ...initialDraftItem, itemName: availableCategoryItems[0] ?? "" })}
                >
                  Limpiar item
                </Button>
                <Button tone="lime" variant="solid" onClick={addDraftItem}>
                  Agregar reporte al checklist
                </Button>
              </div>
            </div>
          )}
        </SurfaceCard>

        <TableCard
          title="Items agregados"
          description="Aqui se acumulan los hallazgos que el inspector va registrando. Solo cuando termines, creas el checklist."
          action={
            <Button
              tone="lime"
              variant="solid"
              disabled={!form.targetId || !form.inspectorId || !form.categoryId || inspectionItems.length === 0}
              onClick={async () => {
                if (!validateChecklist()) return;

                if (inspectionItems.length === 0) {
                  notifyError("Checklist vacio", "Agrega al menos un punto revisado antes de crear el checklist.");
                  return;
                }

                const selectedInspector = inspectors.find((driver) => driver.id === form.inspectorId);
                if (!selectedInspector || !selectedCategory || !selectedTargetLabel) {
                  notifyError("Falta informacion", "Selecciona equipo, inspector y categoria antes de crear el checklist.");
                  return;
                }

                const createdAt = buildCurrentTimestamp();
                const findings = inspectionItems
                  .map((item) => `${item.itemName}: ${item.hasItem} / ${item.condition}${item.comment ? ` / ${item.comment}` : ""}`)
                  .join(" | ");

                await confirmAction({
                  title: "Crear checklist",
                  description: "Se registrara el checklist completo con la fecha y hora actual, el equipo seleccionado y todos los items que el inspector agrego.",
                  confirmLabel: "Crear checklist",
                  accent: "lime",
                  successTitle: "Checklist creado",
                  successDescription: "La inspeccion ya forma parte del historial operativo.",
                  summary: [
                    { label: "Tipo de equipo", value: form.targetKind },
                    { label: "Equipo", value: selectedTargetLabel },
                    { label: "Inspector", value: selectedInspector.name },
                    { label: "Categoria", value: selectedCategory.name },
                    { label: "Items cargados", value: inspectionItems.length.toString() },
                    { label: "Fecha y hora", value: createdAt },
                  ],
                  action: async () => {
                    await createChecklist({
                      targetKind: form.targetKind,
                      targetId: form.targetId,
                      targetLabel: selectedTargetLabel,
                      assetId: form.targetKind === "Vehiculo" ? form.targetId : "",
                      inspectorId: form.inspectorId,
                      inspector: selectedInspector.name,
                      categoryId: form.categoryId,
                      categoryName: selectedCategory.name,
                      date: createdAt,
                      status: computedStatus,
                      summary: `${selectedCategory.name} / ${computedStatus}`,
                      findings,
                      items: inspectionItems,
                    });

                    setInspectionItems([]);
                    setDraftItem({
                      ...initialDraftItem,
                      itemName: selectedCategory.items[0] ?? "",
                    });
                  },
                });
              }}
            >
              Crear checklist
            </Button>
          }
        >
          {inspectionItems.length === 0 ? (
            <EmptyState title="Sin items agregados" description="Empieza agregando el primer hallazgo o punto revisado. Cada item se acumula aqui hasta cerrar el checklist." />
          ) : (
            <Table minWidth="min-w-[1120px]">
              <TableHead>
                <tr>
                  <th className="px-4 py-3 font-semibold">Punto revisado</th>
                  <th className="px-4 py-3 font-semibold">Tiene?</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Comentario</th>
                  <th className="px-4 py-3 font-semibold">Imagen (opcional)</th>
                  <th className="px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </TableHead>
              <TableBody>
                {inspectionItems.map((item) => (
                  <tr key={item.itemName} className="align-top hover:bg-neutral-50">
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-neutral-950">{item.itemName}</p>
                      <p className="mt-1 text-xs text-neutral-500">{selectedCategory?.name}</p>
                    </td>
                    <td className="px-4 py-3.5">{item.hasItem}</td>
                    <td className="px-4 py-3.5">{item.condition}</td>
                    <td className="px-4 py-3.5 text-neutral-700">{item.comment || "Sin comentario"}</td>
                    <td className="px-4 py-3.5">
                      {item.imagePreview ? (
                        <Image
                          src={item.imagePreview}
                          alt={`Evidencia de ${item.itemName}`}
                          width={160}
                          height={120}
                          unoptimized
                          className="h-20 w-28 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="text-sm text-neutral-500">Sin imagen</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <Button
                        tone="rose"
                        variant="outline"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => {
                          setInspectionItems((current) => current.filter((entry) => entry.itemName !== item.itemName));
                          setDraftItem((current) =>
                            !current.itemName ? { ...current, itemName: item.itemName } : current
                          );
                        }}
                      >
                        Quitar
                      </Button>
                    </td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
      </section>

      <TableCard
        title="Historial de checklist"
        description="Resultado por equipo, inspector, categoria y evidencia registrada."
      >
        {history.length === 0 ? (
          <EmptyState title="Sin inspecciones" description="Cuando completes un checklist, aparecera aqui con su trazabilidad." />
        ) : (
          <Table minWidth="min-w-[1080px]">
            <TableHead>
              <tr>
                <th className="px-5 py-3 font-semibold">Equipo</th>
                <th className="px-5 py-3 font-semibold">Inspector</th>
                <th className="px-5 py-3 font-semibold">Categoria</th>
                <th className="px-5 py-3 font-semibold">Fecha y hora</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 font-semibold">Resumen</th>
              </tr>
            </TableHead>
            <TableBody>
              {history.map((item) => (
                <tr key={item.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-neutral-950">{item.targetLabel || item.assetId || "Equipo sin referencia"}</p>
                    <p className="mt-1 text-xs text-neutral-500">{item.targetKind}</p>
                  </td>
                  <td className="px-5 py-4">{item.inspector}</td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-neutral-900">{item.categoryName || "Sin categoria"}</p>
                    <p className="mt-1 text-xs text-neutral-500">{item.itemCount} items / {item.evidenceCount} evidencias</p>
                  </td>
                  <td className="px-5 py-4">{formatTimestamp(item.date)}</td>
                  <td className="px-5 py-4">
                    <StatusPill label={item.status} tone={item.status === "Aprobado" ? "success" : "warning"} />
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-neutral-900">{item.summary}</p>
                    <p className="mt-1 max-w-xl text-xs text-neutral-500">{item.findings}</p>
                  </td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}