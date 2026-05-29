"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { Button } from "@/components/ui/button";
import { StatCard, SurfaceCard } from "@/components/ui/surface";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { platformRoleGroups, roleLabelMap } from "@/features/master/helpers";
import {
  customerAccessTierLabels,
  customerRoleTemplates,
} from "@/lib/role-catalog";
import type { PlatformModuleKey } from "@/types/platform";

const ROLE_TEMPLATE_STORAGE_KEY = "aplismart-customer-role-templates-v1";

const moduleOptions: Array<{ key: PlatformModuleKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "flotas", label: "Flotas" },
  { key: "motores", label: "Motores" },
  { key: "generadores", label: "Generadores" },
  { key: "aires_acondicionados", label: "Aires acondicionados" },
  { key: "conductores", label: "Conductores" },
  { key: "asignaciones", label: "Asignaciones" },
  { key: "seguros", label: "Seguros" },
  { key: "tipos_aceite", label: "Tipos de aceite" },
  { key: "mantenimiento", label: "Mantenimiento" },
  { key: "checklist", label: "Checklist" },
  { key: "alertas", label: "Alertas" },
  { key: "reportes", label: "Reportes" },
  { key: "combustible", label: "Combustible" },
  { key: "geolocalizacion", label: "Geolocalización" },
  { key: "accesos", label: "Accesos" },
  { key: "configuracion", label: "Configuración" },
];

type EditableRoleTemplate = (typeof customerRoleTemplates)[number] & {
  enabledModules: PlatformModuleKey[];
};

function createEditableTemplates(): EditableRoleTemplate[] {
  return customerRoleTemplates.map((role) => ({
    ...role,
    enabledModules: moduleOptions
      .filter((module) => role.focusModules.some((item) => item.toLowerCase() === module.label.toLowerCase()))
      .map((module) => module.key),
  }));
}

function getModuleLabel(moduleKey: PlatformModuleKey) {
  return moduleOptions.find((module) => module.key === moduleKey)?.label ?? moduleKey;
}

function loadEditableTemplates() {
  if (typeof window === "undefined") {
    return createEditableTemplates();
  }

  try {
    const raw = window.localStorage.getItem(ROLE_TEMPLATE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EditableRoleTemplate[]) : createEditableTemplates();
  } catch {
    return createEditableTemplates();
  }
}

const platformRoleDetails = {
  superadmin: "Control total del panel master y de la plataforma comercial.",
  admin_saas: "Administra empresas, planes, módulos, usuarios globales y configuración general.",
  comercial: "Trabaja CRM, leads, clientes, oportunidades y seguimiento comercial.",
  soporte: "Revisa empresas, usuarios, incidencias y trazabilidad operativa desde soporte.",
} as const;

export function RolesPage() {
  const { confirmAction } = useFeedback();
  const [templates, setTemplates] = useState<EditableRoleTemplate[]>(() => loadEditableTemplates());
  const [activeRole, setActiveRole] = useState(customerRoleTemplates[0].name);
  const selectedRole = useMemo(
    () =>
      templates.find((role) => role.name === activeRole) ??
      templates[0],
    [activeRole, templates]
  );

  const toggleModule = (moduleKey: PlatformModuleKey) => {
    setTemplates((current) =>
      current.map((role) => {
        if (role.name !== selectedRole.name) {
          return role;
        }

        const hasModule = role.enabledModules.includes(moduleKey);
        return {
          ...role,
          enabledModules: hasModule
            ? role.enabledModules.filter((item) => item !== moduleKey)
            : [...role.enabledModules, moduleKey],
        };
      })
    );
  };

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Accesos"
        title="Roles y permisos"
        subtitle="Roles del panel master por un lado, y cargos reales para empresas clientes por el otro."
        accent="teal"
      />
      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Roles clientes" value={templates.length.toString()} detail="Catálogo operativo real" tone="info" />
        <StatCard label="Roles plataforma" value={platformRoleGroups.plataforma.length.toString()} detail="Panel master separado" tone="success" />
        <StatCard label="Nivel actual" value={customerAccessTierLabels[selectedRole.accessTier]} detail="Acceso interno asignado" tone="warning" />
        <StatCard label="Módulos habilitados" value={selectedRole.enabledModules.length.toString()} detail="Cobertura sugerida por rol" tone="neutral" />
      </section>
      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <SurfaceCard className="p-5">
          <h2 className="text-lg font-semibold text-neutral-950">Roles para clientes</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Catálogo pensado para empresas que adquieren la plataforma y necesitan cargos entendibles por su operación.
          </p>
          <div className="mt-5 space-y-3">
            {templates.map((role) => (
              <button key={role.name} type="button" onClick={() => setActiveRole(role.name)} className={`w-full rounded-lg border px-4 py-3 text-left transition ${activeRole === role.name ? "border-teal-300 bg-teal-50" : "border-neutral-200 bg-white hover:bg-neutral-50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-neutral-950">{role.name}</p>
                    <p className="mt-1 text-sm text-neutral-500">{role.description}</p>
                  </div>
                  <span className="rounded-lg bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-700">
                    {customerAccessTierLabels[role.accessTier]}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </SurfaceCard>
        <div className="space-y-6">
          <SurfaceCard className="p-5">
            <h2 className="text-lg font-semibold text-neutral-950">Plantilla de rol seleccionada</h2>
            <p className="mt-2 text-sm text-neutral-500">Rol seleccionado: {selectedRole.name}</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_280px]">
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-700">
                <p className="font-semibold text-neutral-950">Descripción funcional</p>
                <p className="mt-2">{selectedRole.summary}</p>
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Módulos habilitados en esta plantilla</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedRole.enabledModules.map((module) => (
                      <span key={module} className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-200">
                        {getModuleLabel(module)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Nivel interno de acceso</p>
                <p className="mt-2 text-lg font-semibold text-neutral-950">
                  {customerAccessTierLabels[selectedRole.accessTier]}
                </p>
                <p className="mt-2 text-sm text-neutral-500">
                  Este nivel alimenta el control de menu, rutas privadas y restricciones visibles dentro de ApliSmart Motors.
                </p>
              </div>
            </div>
            <div className="mt-5 rounded-lg border border-neutral-200 bg-white p-4">
              <p className="text-sm font-semibold text-neutral-950">Editar permisos de la plantilla</p>
              <p className="mt-1 text-xs text-neutral-500">
                Marca los módulos que este cargo tendrá como base al crear colaboradores.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {moduleOptions.map((module) => (
                  <label
                    key={module.key}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${selectedRole.enabledModules.includes(module.key) ? "border-teal-300 bg-teal-50 text-teal-900" : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-white"}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRole.enabledModules.includes(module.key)}
                      onChange={() => toggleModule(module.key)}
                      className="h-4 w-4 accent-teal-600"
                    />
                    <span className="font-medium">{module.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <Button tone="teal" variant="solid" onClick={async () => {
                await confirmAction({
                  title: "Guardar plantilla de rol",
                  description: "Los módulos seleccionados quedarán como referencia para este cargo.",
                  confirmLabel: "Guardar plantilla",
                  accent: "teal",
                  successTitle: "Plantilla actualizada",
                  successDescription: "La configuración base del rol quedó guardada.",
                  summary: [
                    { label: "Rol", value: selectedRole.name },
                    { label: "Nivel", value: customerAccessTierLabels[selectedRole.accessTier] },
                    { label: "Módulos", value: selectedRole.enabledModules.length.toString() },
                  ],
                  action: async () => {
                    window.localStorage.setItem(ROLE_TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
                  },
                });
              }}>
                Guardar plantilla
              </Button>
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-5">
            <h2 className="text-lg font-semibold text-neutral-950">Panel master de la plataforma</h2>
            <p className="mt-2 text-sm text-neutral-500">
              Esta capa sigue separada del panel operativo de los clientes y concentra la administracion superior del producto.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {platformRoleGroups.plataforma.map((role) => (
                <div key={role} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                  <p className="font-semibold text-neutral-950">{roleLabelMap[role]}</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {platformRoleDetails[role as keyof typeof platformRoleDetails]}
                  </p>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}
