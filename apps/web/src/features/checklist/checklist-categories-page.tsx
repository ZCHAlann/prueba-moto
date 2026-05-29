"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useChecklistCategories } from "@/hooks/useChecklistCategories";
import { Button } from "@/components/ui/button";
import { InputField, TextareaField } from "@/components/ui/form-controls";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";

type ChecklistCategoryFormState = {
  name: string;
  description: string;
  itemList: string;
};

const initialForm: ChecklistCategoryFormState = {
  name: "",
  description: "",
  itemList: "",
};

function normalizeItems(value: string) {
  return Array.from(
    new Set(
      value.split("\n").map((item) => item.trim()).filter(Boolean)
    )
  );
}

export function ChecklistCategoriesPage() {
  const { confirmAction } = useFeedback();
  const { categories: checklistCategories, createCategory } = useChecklistCategories();
  const [form, setForm] = useState<ChecklistCategoryFormState>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof ChecklistCategoryFormState, string>>>({});

  const sortedCategories = useMemo(() => {
    return [...checklistCategories].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [checklistCategories]);

  const items = useMemo(() => normalizeItems(form.itemList), [form.itemList]);

  const validate = () => {
    const nextErrors: Partial<Record<keyof ChecklistCategoryFormState, string>> = {};
    if (!form.name.trim()) nextErrors.name = "Ingresa el nombre de la categoria.";
    if (items.length === 0) nextErrors.itemList = "Agrega al menos un item de inspeccion.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Checklist"
        title="Categorias de checklist"
        subtitle="Crea plantillas por tipo de inspeccion para que cada checklist cargue solo los puntos necesarios."
        accent="lime"
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Categorias" value={checklistCategories.length.toString()} detail="Plantillas disponibles" tone="info" />
        <StatCard
          label="Items activos"
          value={checklistCategories.reduce((total, category) => total + category.items.length, 0).toString()}
          detail="Puntos de revision"
          tone="success"
        />
        <StatCard label="Uso" value="Modular" detail="Evita listas demasiado extensas" tone="warning" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <SurfaceCard className="p-5">
          <h2 className="text-lg font-semibold text-neutral-950">Crear Nueva Categoria de Checklist</h2>
          <p className="mt-1 text-sm text-neutral-500">Define una lista corta de puntos para un tipo de inspeccion especifico.</p>

          <div className="mt-5 space-y-4">
            <InputField
              label="Nombre de la categoria"
              value={form.name}
              onChange={(value) => {
                setForm((current) => ({ ...current, name: value }));
                setErrors((current) => ({ ...current, name: undefined }));
              }}
              placeholder="Ej. Revision diaria de vehiculo"
              error={errors.name}
              accent="lime"
            />
            <TextareaField
              label="Descripcion"
              value={form.description}
              onChange={(value) => setForm((current) => ({ ...current, description: value }))}
              placeholder="Uso recomendado, unidad o condicion de aplicacion."
              rows={3}
              accent="lime"
            />
            <TextareaField
              label="Items de inspeccion"
              value={form.itemList}
              onChange={(value) => {
                setForm((current) => ({ ...current, itemList: value }));
                setErrors((current) => ({ ...current, itemList: undefined }));
              }}
              placeholder={"Faro frontal izquierdo\nFaro frontal derecho\nRetrovisor izquierdo"}
              hint="Escribe un item por linea. El sistema eliminara duplicados."
              error={errors.itemList}
              rows={8}
              accent="lime"
            />
            <div className="rounded-lg border border-lime-200 bg-lime-50 px-3 py-2 text-xs text-lime-800">
              Vista previa: {items.length} item{items.length === 1 ? "" : "s"} cargado{items.length === 1 ? "" : "s"}.
            </div>
            <Button
              tone="lime"
              variant="solid"
              className="w-full"
              onClick={async () => {
                if (!validate()) return;
                await confirmAction({
                  title: "Crear categoria de checklist",
                  description: "La categoria quedara disponible para seleccionarse al registrar una inspeccion operativa.",
                  confirmLabel: "Crear categoria",
                  accent: "lime",
                  successTitle: "Categoria creada",
                  successDescription: "Ya puedes usarla en el formulario de checklist.",
                  summary: [
                    { label: "Categoria", value: form.name.trim() },
                    { label: "Items", value: items.length.toString() },
                    { label: "Descripcion", value: form.description.trim() || "Sin descripcion" },
                  ],
                  action: async () => {
                    await createCategory({
                      name: form.name.trim(),
                      description: form.description.trim(),
                      items,
                    });
                    setForm(initialForm);
                    setErrors({});
                  },
                });
              }}
            >
              Crear categoria
            </Button>
          </div>
        </SurfaceCard>

        <TableCard
          title="Catalogo de categorias"
          description="Categorias disponibles para cargar checklist por tipo de inspeccion."
        >
          {sortedCategories.length === 0 ? (
            <EmptyState title="Sin categorias" description="Crea la primera categoria para poder registrar checklist con items seleccionables." />
          ) : (
            <Table minWidth="min-w-[820px]">
              <TableHead>
                <tr>
                  <th className="px-5 py-3 font-semibold">Categoria</th>
                  <th className="px-5 py-3 font-semibold">Items</th>
                  <th className="px-5 py-3 font-semibold">Creacion</th>
                  <th className="px-5 py-3 font-semibold">Puntos visibles</th>
                </tr>
              </TableHead>
              <TableBody>
                {sortedCategories.map((category) => (
                  <tr key={category.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-neutral-950">{category.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">{category.description || "Sin descripcion registrada"}</p>
                    </td>
                    <td className="px-5 py-4 font-semibold text-neutral-900">{category.items.length}</td>
                    <td className="px-5 py-4">{category.createdAt}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        {category.items.slice(0, 5).map((item) => (
                          <span key={item} className="rounded-lg bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">
                            {item}
                          </span>
                        ))}
                        {category.items.length > 5 ? (
                          <span className="rounded-lg bg-lime-50 px-2 py-1 text-xs font-semibold text-lime-700">
                            +{category.items.length - 5} mas
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
      </section>
    </div>
  );
}