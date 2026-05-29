"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/form-controls";
import { SectionHeading, StatCard, SurfaceCard } from "@/components/ui/surface";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { getPlanName } from "@/features/master/helpers";
import type { PlatformModuleKey } from "@/types/platform";

export function ModulesPage() {
  const { confirmAction } = useFeedback();
  const { companies, plans, modules, updateCompanyModules } = usePlatform();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(companies[0]?.id ?? "");
  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? companies[0],
    [companies, selectedCompanyId]
  );
  const [draftModules, setDraftModules] = useState<PlatformModuleKey[]>(
    selectedCompany?.enabledModules ?? []
  );

  const planModules = selectedCompany
    ? plans.find((plan) => plan.id === selectedCompany.planId)?.modules ?? []
    : [];

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Panel master"
        title="Módulos por empresa"
        subtitle="Habilitación comercial por empresa para controlar alcance de cada cuenta central."
        accent="cyan"
      />

      {selectedCompany ? (
        <section className="grid gap-3 md:grid-cols-4">
          <StatCard label="Empresa" value={selectedCompany.name} detail={selectedCompany.industry} tone="info" />
          <StatCard label="Plan" value={getPlanName(plans, selectedCompany.planId)} detail={`${planModules.length} sugeridos`} tone="warning" />
          <StatCard label="Habilitados" value={draftModules.length.toString()} detail="Módulos activos" tone="success" />
          <StatCard label="Bloqueados" value={(modules.length - draftModules.length).toString()} detail="Sin acceso" tone="danger" />
        </section>
      ) : null}

      <SurfaceCard className="p-4">
        <SectionHeading title="Selector de empresa" description="Cambia de empresa y ajusta sus módulos activos." />
        <div className="mt-4 grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-4">
            <SelectField
              label="Empresa"
              value={selectedCompanyId}
              onChange={(value) => {
                const company = companies.find((item) => item.id === value);
                setSelectedCompanyId(value);
                setDraftModules(company?.enabledModules ?? []);
              }}
              accent="cyan"
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
            />
            {selectedCompany ? (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4">
                <p className="text-sm font-semibold text-neutral-950">{selectedCompany.primaryContact}</p>
                <p className="mt-1 text-sm text-neutral-600">
                  {selectedCompany.email} / {selectedCompany.phone}
                </p>
                <p className="mt-3 text-sm text-neutral-600">Ejecutivo: {selectedCompany.executive}</p>
                <p className="mt-1 text-sm text-neutral-600">Estado: {selectedCompany.status}</p>
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button
                tone="cyan"
                variant="solid"
                className="px-4 py-2.5"
                onClick={async () => {
                  if (!selectedCompany) {
                    return;
                  }

                  const confirmed = await confirmAction({
                    title: "Aplicar módulos",
                    description:
                      "La empresa reflejará inmediatamente los módulos activos definidos para su empresa.",
                    confirmLabel: "Guardar módulos",
                    accent: "cyan",
                    successTitle: "Módulos actualizados",
            successDescription: "La disponibilidad comercial de la empresa ya fue ajustada.",
                    summary: [
                      { label: "Empresa", value: selectedCompany.name },
                      { label: "Plan", value: getPlanName(plans, selectedCompany.planId) },
                      { label: "Módulos activos", value: `${draftModules.length}` },
                    ],
                    action: async () => {
                      updateCompanyModules(selectedCompany.id, draftModules);
                    },
                  });

                  if (!confirmed) {
                    return;
                  }
                }}
              >
                Guardar módulos
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {modules.map((module) => {
              const enabled = draftModules.includes(module.key);
              const suggested = planModules.includes(module.key);
              return (
                <button
                  key={module.key}
                  type="button"
                  onClick={() =>
                    setDraftModules((current) =>
                      current.includes(module.key)
                        ? current.filter((item) => item !== module.key)
                        : [...current, module.key]
                    )
                  }
                  className={`rounded-lg border p-4 text-left transition ${
                    enabled
                      ? "border-cyan-200 bg-cyan-50"
                      : "border-neutral-200 bg-white hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-neutral-950">{module.name}</p>
                      <p className="mt-1 text-sm text-neutral-600">{module.description}</p>
                    </div>
                    <span
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        enabled
                          ? "bg-cyan-100 text-cyan-700"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {enabled ? "Activo" : "Bloqueado"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-600">
                      {module.category}
                    </span>
                    {suggested ? (
                      <span className="rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                        Incluido por plan
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}

