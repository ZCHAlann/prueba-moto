"use client";

import Link from "next/link";
import { useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { InputField } from "@/components/ui/form-controls";
import { useAuth } from "@/components/providers/auth-provider";
import { useSettings } from "@/hooks/useSettings";

export function SaasAdminPanel() {
  const { confirmAction } = useFeedback();
  const { session } = useAuth();
  const { settings: currentSettings, updateSettings } = useSettings();

  if (!currentSettings) {
    return (
      <section className="p-6">
        <p className="text-sm text-neutral-500">Cargando configuracion...</p>
      </section>
    );
  }

  const currentTenant = { name: session?.companyName ?? "", code: "" };
  const currentUser = { name: session?.name ?? "", role: session?.role ?? "" };
  const auditEntries: { id: string; description: string; at: string; actor: string }[] = [];
  const can = (permission: string) => {
    const adminRoles = ["owner_empresa", "admin_empresa", "superadmin"];
    const supervisorRoles = [...adminRoles, "supervisor"];
    const role = session?.role ?? "";
    if (permission === "settings.manage") return adminRoles.includes(role);
    return supervisorRoles.includes(role);
  };
  const { settings, updateSystemSettings } = usePlatform();
  const [adminAccess, setAdminAccess] = useState({
    adminAccessLabel: settings.adminAccessLabel,
    adminAccessEmail: settings.adminAccessEmail,
    adminAccessPassword: settings.adminAccessPassword,
  });

  const permissions = [
    {
      key: "assets.manage" as const,
      title: "Vehiculos y activos",
      detail: "Crear, actualizar y organizar unidades, motores y generadores.",
    },
    {
      key: "drivers.manage" as const,
      title: "Conductores",
      detail: "Gestionar personal operativo, licencias y responsables.",
    },
    {
      key: "assignments.manage" as const,
      title: "Asignaciones",
      detail: "Relacionar vehiculos con conductores y responsables.",
    },
    {
      key: "maintenance.manage" as const,
      title: "Mantenimiento",
      detail: "Programar servicios, registrar avances y cerrar trabajos.",
    },
    {
      key: "checklists.manage" as const,
      title: "Checklist",
      detail: "Inspecciones, observaciones y evidencias de campo.",
    },
    {
      key: "alerts.manage" as const,
      title: "Alertas",
      detail: "Vencimientos, criticidades y seguimiento de novedades.",
    },
    {
      key: "reports.export" as const,
      title: "Reportes",
      detail: "Consultar, exportar e imprimir informacion operativa.",
    },
    {
      key: "fuel.manage" as const,
      title: "Combustible",
      detail: "Controlar consumos, costos y rendimiento por activo.",
    },
    {
      key: "inventory.manage" as const,
      title: "Inventario",
      detail: "Controlar repuestos, stock y uso de materiales.",
    },
    {
      key: "settings.manage" as const,
      title: "Configuracion de empresa",
      detail: "Ajustar reglas operativas, alertas y preferencias del negocio.",
    },
  ];

  return (
    <section className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
      <article className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-neutral-950">Panel administrativo</h2>
          <Link href="/master" className="inline-flex">
            <Button tone="neutral" variant="outline" className="px-3 py-2">
              Ir al panel general
            </Button>
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Info title="Empresa actual" value={currentTenant.name} />
          <Info title="Codigo" value={currentTenant.code} />
          <Info title="Rol actual" value={currentUser.role} />
          <Info title="Usuario" value={currentUser.name} />
        </div>
        <form
          className="mt-4 space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const confirmed = await confirmAction({
              title: "Guardar acceso administrador",
              description: "El correo y la contrasena del administrador principal quedaran actualizados para el portal de acceso.",
              confirmLabel: "Guardar acceso",
              accent: "emerald",
              successTitle: "Acceso actualizado",
              successDescription: "El acceso del administrador principal ya fue actualizado.",
              summary: [
                { label: "Perfil", value: adminAccess.adminAccessLabel },
                { label: "Correo", value: adminAccess.adminAccessEmail },
              ],
              action: async () => {
                updateSystemSettings({ ...settings, ...adminAccess });
              },
            });
            if (!confirmed) {
              return;
            }
          }}
        >
          <p className="text-sm font-semibold text-neutral-950">Acceso administrador principal</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField label="Nombre del acceso" value={adminAccess.adminAccessLabel} onChange={(value) => setAdminAccess((current) => ({ ...current, adminAccessLabel: value }))} accent="emerald" />
            <InputField label="Correo administrador" type="email" value={adminAccess.adminAccessEmail} onChange={(value) => setAdminAccess((current) => ({ ...current, adminAccessEmail: value }))} accent="emerald" />
          </div>
          <InputField label="Contrasena administrador" type="text" value={adminAccess.adminAccessPassword} onChange={(value) => setAdminAccess((current) => ({ ...current, adminAccessPassword: value }))} accent="emerald" />
          <div className="flex justify-end">
            <Button type="submit" tone="emerald" variant="solid">
              Guardar acceso administrador
            </Button>
          </div>
        </form>
      </article>

      <article className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-neutral-950">Configuracion por empresa</h2>
          <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            {can("settings.manage") ? "Editable" : "Solo lectura"}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <EditableInfo
            title="Lead time mantenimiento"
            value={`${currentSettings.maintenanceLeadTimeDays} dias`}
            onClick={async () => {
              if (!can("settings.manage")) return;
              await confirmAction({
                title: "Actualizar lead time",
                description: "La empresa actual cambiara el margen de anticipacion para mantenimiento.",
                confirmLabel: "Confirmar ajuste",
                accent: "emerald",
                successTitle: "Configuracion actualizada",
                successDescription: "La empresa ya refleja el nuevo lead time.",
                summary: [
                  { label: "Empresa", value: currentTenant.name },
                  { label: "Actual", value: `${currentSettings.maintenanceLeadTimeDays} dias` },
                  { label: "Nuevo", value: `${currentSettings.maintenanceLeadTimeDays + 1} dias` },
                ],
                action: async () => {
                  void updateSettings({ maintenanceLeadTimeDays: (currentSettings?.maintenanceLeadTimeDays ?? 7) + 1 });
                },
              });
            }}
          />
          <EditableInfo
            title="Checklist obligatorio"
            value={currentSettings.checklistRequired ? "Activo" : "Desactivado"}
            onClick={async () => {
              if (!can("settings.manage")) return;
              await confirmAction({
                title: "Cambiar politica de checklist",
                description: "La empresa actual actualizara la obligatoriedad del checklist previo a operacion.",
                confirmLabel: "Confirmar politica",
                accent: "emerald",
                successTitle: "Politica actualizada",
                successDescription: "La configuracion de la empresa ya refleja el nuevo criterio.",
                summary: [
                  { label: "Empresa", value: currentTenant.name },
                  { label: "Estado actual", value: currentSettings.checklistRequired ? "Activo" : "Desactivado" },
                  { label: "Nuevo estado", value: currentSettings.checklistRequired ? "Desactivado" : "Activo" },
                ],
                action: async () => {
                  void updateSettings({ checklistRequired: !currentSettings?.checklistRequired });
                },
              });
            }}
          />
          <Info title="Moneda combustible" value={currentSettings.fuelCurrency} />
          <Info title="Correo alertas" value={currentSettings.alertEmail} />
        </div>
      </article>

      <article className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm xl:col-span-2">
        <h2 className="text-xl font-bold text-neutral-950">Cobertura de gestion</h2>
        <p className="mt-2 text-sm text-neutral-600">Resumen de lo que este perfil puede administrar dentro de la operacion.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {permissions.map((permission) => (
            <div key={permission.key} className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Modulo</p>
              <p className="mt-2 text-sm font-semibold text-neutral-900">{permission.title}</p>
              <p className="mt-2 text-xs leading-5 text-neutral-500">{permission.detail}</p>
              <p className="mt-3 text-xs font-medium text-neutral-600">
                {can(permission.key) ? "Habilitado para este perfil" : "No habilitado para este perfil"}
              </p>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm xl:col-span-2">
        <h2 className="text-xl font-bold text-neutral-950">Actividad de gestion reciente</h2>
        <div className="mt-4 space-y-3">
          {auditEntries.slice(0, 6).map((entry) => (
            <div key={entry.id} className="rounded-lg border border-neutral-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold text-neutral-950">{entry.description}</p>
                <span className="text-xs font-medium text-neutral-500">{entry.at}</span>
              </div>
              <p className="mt-2 text-sm text-neutral-600">{entry.actor}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
      <p className="mt-2 text-sm font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function EditableInfo({ title, value, onClick }: { title: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-left transition hover:border-emerald-300"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
      <p className="mt-2 text-sm font-semibold text-neutral-900">{value}</p>
    </button>
  );
}

