"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { InputField, TextareaField } from "@/components/ui/form-controls";
import { SectionHeading, StatCard, SurfaceCard } from "@/components/ui/surface";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { getModuleName } from "@/features/master/helpers";
import type { CompanyPlanId, PlatformModuleKey, PlatformPlan } from "@/types/platform";

type PlanFormState = PlatformPlan;

function createEmptyPlan(modules: PlatformModuleKey[]): PlanFormState {
  return {
    id: "nuevo",
    name: "",
    monthlyPrice: "USD 0",
    annualPrice: "USD 0",
    description: "",
    checkoutUrl: "",
    modules,
    limits: {
      users: "10 usuarios",
      assets: "40 activos",
      sites: "2 sedes",
    },
  };
}

export function PlansPage() {
  const { confirmAction, notifyError } = useFeedback();
  const { plans, modules, createPlan, updatePlan } = usePlatform();
  const [selectedPlanId, setSelectedPlanId] = useState<CompanyPlanId | null>(plans[0]?.id ?? "basic");
  const [creating, setCreating] = useState(false);
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? plans[0],
    [plans, selectedPlanId]
  );
  const [form, setForm] = useState<PlanFormState>(selectedPlan ?? createEmptyPlan([]));

  const startCreatePlan = () => {
    setCreating(true);
    setSelectedPlanId(null);
    setForm(createEmptyPlan(modules.map((module) => module.key).slice(0, 4)));
  };

  const cancelCreatePlan = () => {
    setCreating(false);
    setSelectedPlanId(plans[0]?.id ?? "basic");
    setForm(plans[0] ?? createEmptyPlan(modules.map((module) => module.key)));
  };

  const toggleModule = (key: PlatformModuleKey) => {
    setForm((current) => ({
      ...current,
      modules: current.modules.includes(key)
        ? current.modules.filter((item) => item !== key)
        : [...current.modules, key],
    }));
  };

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Panel master"
        title="Planes"
        subtitle="Oferta comercial, modulos incluidos y limites listos para venta."
        accent="cyan"
        action={
          <Button tone="cyan" variant="solid" className="px-3 py-2" onClick={startCreatePlan}>
            Nuevo plan
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <StatCard
            key={plan.id}
            label={plan.name}
            value={plan.monthlyPrice}
            detail={`${plan.modules.length} modulos incluidos`}
            tone={plan.id === "enterprise" ? "danger" : plan.id === "pro" ? "warning" : "info"}
          />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SurfaceCard className="p-4">
          <SectionHeading title="Catalogo de planes" description="Selecciona un plan para editarlo o crea una nueva oferta." />
          <div className="space-y-3 pt-4">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => {
                  setCreating(false);
                  setSelectedPlanId(plan.id);
                  setForm(plan);
                }}
                className={`w-full rounded-lg border px-4 py-4 text-left transition ${
                  selectedPlanId === plan.id
                    ? "border-cyan-200 bg-cyan-50"
                    : "border-neutral-200 bg-white hover:bg-neutral-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-neutral-950">{plan.name}</p>
                    <p className="mt-1 text-sm text-neutral-500">{plan.description}</p>
                    <p className="mt-2 text-xs text-neutral-500">
                      {plan.checkoutUrl ? "Compra directa configurada" : "Compra guiada por solicitud comercial"}
                    </p>
                  </div>
                  {plan.id === "pro" ? (
                    <span className="rounded-lg bg-cyan-100 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                      Mas vendido
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={startCreatePlan}
              className={`w-full rounded-lg border border-dashed px-4 py-4 text-left transition ${
                creating
                  ? "border-cyan-300 bg-cyan-50 text-cyan-800"
                  : "border-neutral-300 bg-white text-neutral-700 hover:border-cyan-300 hover:bg-cyan-50"
              }`}
            >
              <p className="text-lg font-semibold">Crear nuevo plan</p>
              <p className="mt-1 text-sm text-neutral-500">
                Agrega una oferta comercial personalizada para nuevos clientes.
              </p>
            </button>
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <SectionHeading
            title={creating ? "Crear nuevo plan" : `Editar plan ${selectedPlan?.name ?? ""}`}
            description={creating ? "Define nombre, precios, limites y modulos incluidos." : "Precios, mensaje comercial, limites y modulos habilitados."}
            action={
              creating ? (
                <Button tone="neutral" variant="outline" className="px-3 py-2" onClick={cancelCreatePlan}>
                  Cancelar
                </Button>
              ) : null
            }
          />
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();

              if (!form.name.trim() || !form.description.trim()) {
                notifyError("Plan incompleto", "Define nombre y descripcion antes de guardar.");
                return;
              }

              const confirmed = await confirmAction({
                title: creating ? "Crear plan" : "Guardar plan",
                description:
                  "Los cambios se reflejaran en la capa comercial y en la oferta visible del producto.",
                confirmLabel: creating ? "Crear plan" : "Guardar plan",
                accent: "cyan",
                successTitle: creating ? "Plan creado" : "Plan actualizado",
                successDescription: creating ? "La nueva oferta comercial ya quedo disponible." : "La oferta comercial ya quedo actualizada.",
                summary: [
                  { label: "Plan", value: form.name },
                  { label: "Mensual", value: form.monthlyPrice },
                  { label: "Anual", value: form.annualPrice },
                  { label: "Modulos", value: `${form.modules.length}` },
                  { label: "Compra", value: form.checkoutUrl.trim() ? "Checkout directo" : "Solicitud comercial" },
                ],
                action: async () => {
                  if (creating) {
                    const input = {
                      name: form.name,
                      monthlyPrice: form.monthlyPrice,
                      annualPrice: form.annualPrice,
                      description: form.description,
                      checkoutUrl: form.checkoutUrl,
                      modules: form.modules,
                      limits: form.limits,
                    };
                    const createdId = createPlan(input);
                    setForm({ ...input, id: createdId });
                    setSelectedPlanId(createdId);
                    setCreating(false);
                  } else {
                    updatePlan(form.id, form);
                  }
                },
              });

              if (!confirmed) {
                return;
              }
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <InputField
                label="Nombre"
                value={form.name}
                onChange={(value) => setForm((current) => ({ ...current, name: value }))}
                accent="cyan"
              />
              <InputField
                label="Precio mensual"
                value={form.monthlyPrice}
                onChange={(value) => setForm((current) => ({ ...current, monthlyPrice: value }))}
                accent="cyan"
              />
              <InputField
                label="Precio anual"
                value={form.annualPrice}
                onChange={(value) => setForm((current) => ({ ...current, annualPrice: value }))}
                accent="cyan"
              />
              <InputField
                label="URL de compra"
                value={form.checkoutUrl}
                onChange={(value) => setForm((current) => ({ ...current, checkoutUrl: value }))}
                accent="cyan"
                placeholder="https://checkout.tudominio.com/plan-pro"
              />
              <InputField
                label="Limite usuarios"
                value={form.limits.users}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    limits: { ...current.limits, users: value },
                  }))
                }
                accent="cyan"
              />
              <InputField
                label="Limite activos"
                value={form.limits.assets}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    limits: { ...current.limits, assets: value },
                  }))
                }
                accent="cyan"
              />
              <InputField
                label="Limite sedes"
                value={form.limits.sites}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    limits: { ...current.limits, sites: value },
                  }))
                }
                accent="cyan"
              />
            </div>

            <TextareaField
              label="Descripcion comercial"
              value={form.description}
              onChange={(value) => setForm((current) => ({ ...current, description: value }))}
              accent="cyan"
              rows={4}
            />

            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4">
              <p className="text-sm font-semibold text-neutral-950">Comportamiento del CTA publico</p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                {form.checkoutUrl.trim()
                  ? "El boton Comprar abrira el checkout directo configurado para este plan."
                  : "El boton Comprar enviara al formulario comercial con la intencion de compra y el plan preseleccionado."}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-neutral-700">Modulos incluidos</p>
              <div className="flex flex-wrap gap-2">
                {modules.map((module) => {
                  const active = form.modules.includes(module.key);
                  return (
                    <button
                      key={module.key}
                      type="button"
                      onClick={() => toggleModule(module.key)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        active
                          ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                          : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      {getModuleName(modules, module.key)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" tone="cyan" variant="solid">
                {creating ? "Crear plan" : "Guardar plan"}
              </Button>
            </div>
          </form>
        </SurfaceCard>
      </section>
    </div>
  );
}

