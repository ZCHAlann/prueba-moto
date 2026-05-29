"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useSettings } from "@/hooks/useSettings";
import { useSites } from "@/hooks/useSites";
import { useAssets } from "@/hooks/useAssets";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { InputField, SelectField } from "@/components/ui/form-controls";
import { SectionHeading, StatCard, SurfaceCard } from "@/components/ui/surface";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { useDrivers } from "@/hooks/useDrivers";
import {
  matchCompanyToTenant,
  platformRoleGroups,
  roleLabelMap,
} from "@/features/master/helpers";
import {
  customerAccessTierLabels,
  customerRoleTemplates,
} from "@/lib/role-catalog";
import type { CompanySettings, Tenant } from "@/types/fleet";

const boolOptions = [
  { value: "true", label: "Si" },
  { value: "false", label: "No" },
];

export function SettingsPage() {
  const { confirmAction } = useFeedback();
  const { session } = useAuth();

  // Nuevo backend — settings, sites, assets
  const { settings: apiSettings, loading: loadingSettings, updateSettings } = useSettings();
  const { sites } = useSites();
  const { assets } = useAssets();

  // currentTenant y drivers siguen en FleetOps hasta el Día 5 de limpieza
  const { drivers } = useDrivers();
  const currentTenant = {
    id: session?.companyId ? `tenant-company-${session.companyId}` : "",
    code: session?.companyName?.slice(0, 3).toUpperCase() ?? "",
    name: session?.companyName ?? "",
    sector: "",
  };
  const updateTenant = () => {};
  const { settings: platformSettings, updateSystemSettings, companies, modules } = usePlatform();

  const companyMatch = useMemo(
    () => matchCompanyToTenant(currentTenant.name, companies),
    [companies, currentTenant.name]
  );
  const isPlatformAdmin = session?.role === "superadmin";

  const [tenantForm, setTenantForm] = useState<Omit<Tenant, "id">>({
    code: currentTenant.code,
    name: currentTenant.name,
    sector: currentTenant.sector,
  });

  // Inicializamos desde apiSettings en cuanto cargue
  const [companySettingsForm, setCompanySettingsForm] = useState<CompanySettings | null>(null);
  const [publicSettingsForm, setPublicSettingsForm] = useState(platformSettings);

  useEffect(() => {
    setTenantForm({ code: currentTenant.code, name: currentTenant.name, sector: currentTenant.sector });
  }, [currentTenant]);

  useEffect(() => {
    if (apiSettings) {
      setCompanySettingsForm(apiSettings);
    }
  }, [apiSettings]);

  useEffect(() => {
    setPublicSettingsForm(platformSettings);
  }, [platformSettings]);

  // Mientras carga
  if (loadingSettings || !companySettingsForm) {
    return (
      <div className="space-y-4">
        <ModulePageHeader
          badge="Cuenta"
          title="Configuracion del sistema"
          subtitle="Perfil de empresa, sedes, branding, notificaciones y preferencias visibles y editables."
          accent="emerald"
        />
        <SurfaceCard className="p-6">
          <p className="text-sm text-neutral-500">Cargando configuracion...</p>
        </SurfaceCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Cuenta"
        title="Configuracion del sistema"
        subtitle="Perfil de empresa, sedes, branding, notificaciones y preferencias visibles y editables."
        accent="emerald"
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Empresa activa" value={currentTenant.code} detail={currentTenant.name} tone="info" />
        <StatCard label="Sedes" value={sites.length.toString()} detail="Catalogo de sedes" tone="success" />
        <StatCard label="Lead time" value={String(companySettingsForm.maintenanceLeadTimeDays)} detail="Dias antes del mantenimiento" tone="warning" />
        <StatCard label="Checklist" value={companySettingsForm.checklistRequired ? "Si" : "No"} detail="Obligatorio en operacion" tone="danger" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <SurfaceCard className="p-4">
          <SectionHeading title="Perfil empresa" description="Codigo, nombre y sector de la empresa operativa actual." />
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              await confirmAction({
                title: "Guardar perfil empresa",
                description: "La empresa operativa reflejara los cambios de nombre, codigo o sector.",
                confirmLabel: "Guardar empresa",
                accent: "emerald",
                successTitle: "Empresa actualizada",
                successDescription: "El perfil de la empresa ya quedo actualizado.",
                summary: [
                  { label: "Codigo", value: tenantForm.code },
                  { label: "Empresa", value: tenantForm.name },
                  { label: "Sector", value: tenantForm.sector },
                ],
                action: async () => {
                  const updateTenant = (_id: string, _form: unknown) => {}
                },
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <InputField label="Codigo" value={tenantForm.code} onChange={(value) => setTenantForm((current) => ({ ...current, code: value.toUpperCase() }))} accent="emerald" />
              <div className="sm:col-span-2">
                <InputField label="Empresa" value={tenantForm.name} onChange={(value) => setTenantForm((current) => ({ ...current, name: value }))} accent="emerald" />
              </div>
            </div>
            <InputField label="Sector" value={tenantForm.sector} onChange={(value) => setTenantForm((current) => ({ ...current, sector: value }))} accent="emerald" />
            <div className="flex justify-end">
              <Button type="submit" tone="emerald" variant="solid">Guardar empresa</Button>
            </div>
          </form>
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <SectionHeading title="Operacion y notificaciones" description="Parametros de la empresa para mantenimiento, checklist y alertas." />
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              await confirmAction({
                title: "Guardar configuracion operativa",
                description: "Las reglas base de la empresa quedaran actualizadas.",
                confirmLabel: "Guardar ajustes",
                accent: "emerald",
                successTitle: "Configuracion actualizada",
                successDescription: "La base operativa de la empresa ya fue actualizada.",
                summary: [
                  { label: "Lead time", value: String(companySettingsForm.maintenanceLeadTimeDays) },
                  { label: "Checklist obligatorio", value: companySettingsForm.checklistRequired ? "Si" : "No" },
                  { label: "Correo alertas", value: companySettingsForm.alertEmail },
                ],
                action: async () => {
                  await updateSettings({
                    maintenanceLeadTimeDays: companySettingsForm.maintenanceLeadTimeDays,
                    checklistRequired: companySettingsForm.checklistRequired,
                    fuelCurrency: companySettingsForm.fuelCurrency,
                    alertEmail: companySettingsForm.alertEmail,
                  });
                },
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                label="Lead time mantenimiento"
                type="number"
                value={String(companySettingsForm.maintenanceLeadTimeDays)}
                onChange={(value) => setCompanySettingsForm((current) => current ? ({ ...current, maintenanceLeadTimeDays: Number(value || 0) }) : current)}
                accent="emerald"
              />
              <InputField
                label="Moneda combustible"
                value={companySettingsForm.fuelCurrency}
                onChange={(value) => setCompanySettingsForm((current) => current ? ({ ...current, fuelCurrency: value }) : current)}
                accent="emerald"
              />
            </div>
            <InputField
              label="Correo alertas"
              type="email"
              value={companySettingsForm.alertEmail}
              onChange={(value) => setCompanySettingsForm((current) => current ? ({ ...current, alertEmail: value }) : current)}
              accent="emerald"
            />
            <SelectField
              label="Checklist obligatorio"
              value={String(companySettingsForm.checklistRequired)}
              onChange={(value) => setCompanySettingsForm((current) => current ? ({ ...current, checklistRequired: value === "true" }) : current)}
              accent="emerald"
              options={boolOptions}
            />
            <div className="flex justify-end">
              <Button type="submit" tone="emerald" variant="solid">Guardar ajustes</Button>
            </div>
          </form>
        </SurfaceCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <SurfaceCard className="p-4">
          <SectionHeading title="Estructura operativa" description="Sedes, activos, conductores y modulos visibles para la empresa activa." />
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-950">Sedes configuradas</p>
                  <p className="mt-1 text-sm text-neutral-600">{sites.length} activas o historicas</p>
                </div>
                <Link href="/gestion/sedes" className="inline-flex">
                  <Button tone="neutral" variant="outline" className="px-3 py-2">Gestionar sedes</Button>
                </Link>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                <p className="text-sm font-semibold text-neutral-950">Activos</p>
                <p className="mt-1 text-sm text-neutral-600">{assets.length} registrados</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                <p className="text-sm font-semibold text-neutral-950">Conductores</p>
                <p className="mt-1 text-sm text-neutral-600">{drivers.length} registrados</p>
              </div>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white px-4 py-4">
              <p className="text-sm font-semibold text-neutral-950">Modulos habilitados</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(companyMatch?.enabledModules ?? modules.map((moduleEntry) => moduleEntry.key).slice(0, 8)).map((key) => {
                  const moduleEntry = modules.find((item) => item.key === key);
                  return (
                    <span key={key} className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      {moduleEntry?.name ?? key}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </SurfaceCard>

        {isPlatformAdmin ? (
          <SurfaceCard className="p-4">
            <SectionHeading title="Branding basico y experiencia publica" description="Marca, soporte, sesion e integraciones visibles." />
            <form
              className="mt-4 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                await confirmAction({
                  title: "Guardar branding y preferencias",
                  description: "La capa publica y la experiencia general reflejaran esta configuracion.",
                  confirmLabel: "Guardar branding",
                  accent: "emerald",
                  successTitle: "Branding actualizado",
                  successDescription: "La configuracion publica ya quedo actualizada.",
                  summary: [
                    { label: "Marca", value: publicSettingsForm.brandName },
                    { label: "Correo soporte", value: publicSettingsForm.supportEmail },
                    { label: "Demo visible", value: publicSettingsForm.allowDemoAccess ? "Si" : "No" },
                  ],
                  action: async () => {
                    updateSystemSettings(publicSettingsForm);
                  },
                });
              }}
            >
              <InputField label="Marca" value={publicSettingsForm.brandName} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, brandName: value }))} accent="emerald" />
              <InputField label="Tagline" value={publicSettingsForm.brandTagline} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, brandTagline: value }))} accent="emerald" />
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Correo soporte" type="email" value={publicSettingsForm.supportEmail} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, supportEmail: value }))} accent="emerald" />
                <InputField label="Telefono soporte" value={publicSettingsForm.supportPhone} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, supportPhone: value }))} accent="emerald" />
              </div>
              <InputField label="URL publica" value={publicSettingsForm.publicUrl} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, publicUrl: value }))} accent="emerald" />
              <div className="grid gap-4 sm:grid-cols-3">
                <SelectField label="Permitir demo" value={String(publicSettingsForm.allowDemoAccess)} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, allowDemoAccess: value === "true" }))} accent="emerald" options={boolOptions} />
                <SelectField label="Mostrar pricing" value={String(publicSettingsForm.showPublicPricing)} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, showPublicPricing: value === "true" }))} accent="emerald" options={boolOptions} />
                <SelectField label="Recordar sesion" value={String(publicSettingsForm.rememberSessionDefault)} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, rememberSessionDefault: value === "true" }))} accent="emerald" options={boolOptions} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Idioma base" value={publicSettingsForm.defaultLanguage} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, defaultLanguage: value }))} accent="emerald" />
                <InputField label="Zona horaria" value={publicSettingsForm.defaultTimezone} onChange={(value) => setPublicSettingsForm((current) => ({ ...current, defaultTimezone: value }))} accent="emerald" />
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4">
                <p className="text-sm font-semibold text-neutral-950">Integracion de mapas</p>
                <p className="mt-1 text-sm text-neutral-600">
                  Configura el proveedor principal y deja un modo de respaldo para que la geolocalizacion siga operativa.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <SelectField
                    label="Proveedor mapa"
                    value={publicSettingsForm.mapsProvider}
                    onChange={(value) => setPublicSettingsForm((current) => ({ ...current, mapsProvider: value }))}
                    accent="emerald"
                    options={[
                      { value: "Google Maps", label: "Google Maps" },
                      { value: "Mapa de respaldo", label: "Mapa de respaldo" },
                    ]}
                  />
                  <InputField
                    label="API key mapa"
                    value={publicSettingsForm.mapsApiKey}
                    onChange={(value) => setPublicSettingsForm((current) => ({ ...current, mapsApiKey: value }))}
                    accent="emerald"
                    placeholder="AIza..."
                  />
                  <SelectField
                    label="Modo respaldo"
                    value={String(publicSettingsForm.mapsFallbackEnabled)}
                    onChange={(value) => setPublicSettingsForm((current) => ({ ...current, mapsFallbackEnabled: value === "true" }))}
                    accent="emerald"
                    options={boolOptions}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" tone="emerald" variant="solid">Guardar branding</Button>
              </div>
            </form>
          </SurfaceCard>
        ) : (
          <SurfaceCard className="p-4">
            <SectionHeading title="Roles disponibles en tu empresa" description="Perfiles claros para organizar la operacion interna sin exponer informacion de la plataforma." />
            <div className="mt-4 space-y-3">
              {customerRoleTemplates.map((role) => (
                <div key={role.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">{role.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">{role.summary}</p>
                    </div>
                    <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      {customerAccessTierLabels[role.accessTier]}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-neutral-500">{role.focusModules.join(", ")}</p>
                </div>
              ))}
            </div>
          </SurfaceCard>
        )}
      </div>

      {isPlatformAdmin ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <SurfaceCard className="p-4">
            <SectionHeading title="Roles de plataforma" description="Base clara para permisos comerciales y administrativos." />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {platformRoleGroups.plataforma.map((role) => (
                <div key={role} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                  <p className="text-sm font-semibold text-neutral-950">{roleLabelMap[role]}</p>
                  <p className="mt-1 text-xs text-neutral-500">Visible en el panel master y la gestion global.</p>
                </div>
              ))}
              {platformRoleGroups.operacion.map((role) => (
                <div key={role} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                  <p className="text-sm font-semibold text-neutral-950">{roleLabelMap[role]}</p>
                  <p className="mt-1 text-xs text-neutral-500">Pensado para owner, admin o supervisor por empresa.</p>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-4">
            <SectionHeading title="Permisos operativos" description="Cobertura base del rol operativo actual." />
            <div className="mt-4 space-y-3">
              {customerRoleTemplates.map((role) => (
                <div key={role.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">{role.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">{role.summary}</p>
                    </div>
                    <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      {customerAccessTierLabels[role.accessTier]}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-neutral-500">{role.focusModules.join(", ")}</p>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>
      ) : null}
    </div>
  );
}