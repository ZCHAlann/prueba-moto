"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DataExportToolbar,
  type ExportColumn,
  type ExportRow,
} from "@/components/ui/data-export-toolbar";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import {
  companyStatusOptions,
  getModuleName,
  getPlanName,
  industryOptions,
  toSlug,
} from "@/features/master/helpers";
import type {
  CompanyPlanId,
  CompanyStatus,
  PlatformCompany,
  PlatformModuleKey,
} from "@/types/platform";

type CompanyFormState = Omit<PlatformCompany, "id"> & {
  masterUser: {
    name: string;
    email: string;
    username: string;
    password: string;
    title: string;
  };
};

type CompanyFormErrors = Partial<
  Record<
    | "name"
    | "slug"
    | "primaryContact"
    | "email"
    | "phone"
    | "startDate"
    | "industry"
    | "executive"
    | "masterUserName"
    | "masterUserEmail"
    | "masterUsername"
    | "masterPassword"
    | "masterUserTitle",
    string
  >
>;

const exportColumns: ExportColumn[] = [
  { key: "name", label: "Empresa" },
  { key: "plan", label: "Plan" },
  { key: "status", label: "Estado" },
  { key: "contact", label: "Contacto" },
  { key: "industry", label: "Industria" },
  { key: "modules", label: "Modulos" },
];

function createEmptyForm(defaultPlanId: CompanyPlanId, modules: PlatformModuleKey[]): CompanyFormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: "",
    slug: "",
    planId: defaultPlanId,
    status: "Prospecto",
    primaryContact: "",
    email: "",
    phone: "",
    startDate: today,
    enabledModules: modules,
    industry: industryOptions[0],
    executive: "Equipo comercial",
    notes: "",
    masterUser: {
      name: "",
      email: "",
      username: "",
      password: "",
      title: "Administrador master de empresa",
    },
  };
}

function validateForm(form: CompanyFormState, isEditing: boolean) {
  const errors: CompanyFormErrors = {};
  if (!form.name.trim()) errors.name = "El nombre de empresa es obligatorio.";
  if (!form.slug.trim()) errors.slug = "El nombre de pagina es obligatorio.";
  if (!form.primaryContact.trim()) errors.primaryContact = "El contacto principal es obligatorio.";
  if (!form.email.trim()) errors.email = "El correo es obligatorio.";
  if (!form.phone.trim()) errors.phone = "El telefono es obligatorio.";
  if (!form.startDate) errors.startDate = "La fecha de alta es obligatoria.";
  if (!form.industry.trim()) errors.industry = "La industria es obligatoria.";
  if (!form.executive.trim()) errors.executive = "El ejecutivo asignado es obligatorio.";
  if (!form.masterUser.name.trim()) errors.masterUserName = "El nombre del usuario master es obligatorio.";
  if (!form.masterUser.email.trim()) errors.masterUserEmail = "El correo del usuario master es obligatorio.";
  if (!form.masterUser.username.trim()) errors.masterUsername = "El usuario interno es obligatorio.";
  if (!isEditing && !form.masterUser.password.trim()) errors.masterPassword = "La contrasena temporal es obligatoria.";
  if (!form.masterUser.title.trim()) errors.masterUserTitle = "El cargo del usuario master es obligatorio.";
  return errors;
}

function toUsername(value: string) {
  return toSlug(value).replace(/-/g, "");
}

export function CompaniesPage() {
  const { confirmAction, notifyError } = useFeedback();
  const { session } = useAuth();
  const { companies, globalUsers, plans, modules, createCompany, updateCompany, deleteCompany, toggleCompanyStatus } =
    usePlatform();
  const defaultPlan = plans[0];
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<CompanyFormErrors>({});
  const [form, setForm] = useState<CompanyFormState>(() =>
    createEmptyForm(defaultPlan.id, defaultPlan.modules)
  );
  const canDeleteCompanies = session?.role === "superadmin" || session?.role === "admin_saas";

  const filteredCompanies = useMemo(() => {
    const value = query.trim().toLowerCase();
    return companies.filter((company) => {
      return (
        value.length === 0 ||
        company.name.toLowerCase().includes(value) ||
        company.primaryContact.toLowerCase().includes(value) ||
        company.email.toLowerCase().includes(value) ||
        company.industry.toLowerCase().includes(value) ||
        company.executive.toLowerCase().includes(value)
      );
    });
  }, [companies, query]);

  const exportRows = useMemo<ExportRow[]>(
    () =>
      filteredCompanies.map((company) => ({
        name: company.name,
        plan: getPlanName(plans, company.planId),
        status: company.status,
        contact: company.primaryContact,
        industry: company.industry,
        modules: company.enabledModules.length,
      })),
    [filteredCompanies, plans]
  );

  const resetForm = () => {
    setEditingId(null);
    setErrors({});
    setForm(createEmptyForm(defaultPlan.id, defaultPlan.modules));
  };

  const toggleModule = (key: PlatformModuleKey) => {
    setForm((current) => ({
      ...current,
      enabledModules: current.enabledModules.includes(key)
        ? current.enabledModules.filter((item) => item !== key)
        : [...current.enabledModules, key],
    }));
  };

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Panel master"
        title="Empresas clientes"
        subtitle="Alta comercial de empresas, plan contratado, modulos habilitados y contacto principal."
        accent="cyan"
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Empresas" value={companies.length.toString()} detail="Base total" tone="info" />
        <StatCard
          label="Activas"
          value={companies.filter((item) => item.status === "Activa").length.toString()}
          detail="Ya operando"
          tone="success"
        />
        <StatCard
          label="Prospectos"
          value={companies.filter((item) => item.status === "Prospecto").length.toString()}
          detail="Pipeline cercano"
          tone="warning"
        />
        <StatCard
          label="Inactivas"
          value={companies.filter((item) => item.status === "Inactiva").length.toString()}
          detail="Pausadas"
          tone="danger"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <SurfaceCard className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">
                {editingId ? "Editar empresa" : "Nueva empresa"}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Formulario comercial base para crear una empresa lista para venta.
              </p>
            </div>
            {editingId ? (
              <Button tone="neutral" variant="outline" className="px-3 py-2" onClick={resetForm}>
                Cancelar
              </Button>
            ) : null}
          </div>

          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const nextErrors = validateForm(form, Boolean(editingId));
              setErrors(nextErrors);

              if (Object.keys(nextErrors).length > 0) {
                notifyError(
                  "Formulario incompleto",
                  "Completa la ficha comercial de la empresa antes de guardar."
                );
                return;
              }

              const confirmed = await confirmAction({
                title: editingId ? "Guardar empresa" : "Crear empresa",
                description:
                  "La empresa quedara disponible en el panel master con su plan, modulos y datos comerciales.",
                confirmLabel: editingId ? "Guardar cambios" : "Crear empresa",
                accent: "cyan",
                successTitle: editingId ? "Empresa actualizada" : "Empresa creada",
                successDescription: "La empresa ya forma parte de la cartera central.",
                summary: [
                  { label: "Empresa", value: form.name },
                  { label: "Plan", value: getPlanName(plans, form.planId) },
                  { label: "Estado", value: form.status },
                  { label: "Modulos", value: `${form.enabledModules.length}` },
                  { label: "Usuario master", value: form.masterUser.email },
                ],
                action: async () => {
                  if (editingId) {
                    await updateCompany(editingId, form);
                  } else {
                    await createCompany(form);
                  }
                },
              });

              if (confirmed) {
                resetForm();
              }
            }}
          >
            <InputField
              label="Nombre empresa"
              value={form.name}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  name: value,
                  slug: current.slug ? current.slug : toSlug(value),
                  masterUser: {
                    ...current.masterUser,
                    username: current.masterUser.username
                      ? current.masterUser.username
                      : toUsername(value),
                  },
                }))
              }
              accent="cyan"
              error={errors.name}
              placeholder="Empresa de transporte"
            />
            <InputField
              label="Nombre de pagina"
              value={form.slug}
              onChange={(value) => setForm((current) => ({ ...current, slug: toSlug(value) }))}
              accent="cyan"
              error={errors.slug}
              placeholder="empresa-transporte"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Plan"
                value={form.planId}
                onChange={(value) => {
                  const planId = value as CompanyPlanId;
                  const selectedPlan = plans.find((plan) => plan.id === planId);
                  setForm((current) => ({
                    ...current,
                    planId,
                    enabledModules: selectedPlan?.modules ?? current.enabledModules,
                  }));
                }}
                accent="cyan"
                options={plans.map((plan) => ({ value: plan.id, label: plan.name }))}
              />
              <SelectField
                label="Estado"
                value={form.status}
                onChange={(value) =>
                  setForm((current) => ({ ...current, status: value as CompanyStatus }))
                }
                accent="cyan"
                options={companyStatusOptions}
              />
            </div>

            <InputField
              label="Contacto principal"
              value={form.primaryContact}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  primaryContact: value,
                  masterUser: {
                    ...current.masterUser,
                    name: current.masterUser.name ? current.masterUser.name : value,
                  },
                }))
              }
              accent="cyan"
              error={errors.primaryContact}
              placeholder="Contacto principal"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                label="Email"
                type="email"
                value={form.email}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    email: value,
                    masterUser: {
                      ...current.masterUser,
                      email: current.masterUser.email ? current.masterUser.email : value,
                    },
                  }))
                }
                accent="cyan"
                error={errors.email}
                placeholder="contacto@empresa.com"
              />
              <InputField
                label="Telefono"
                type="tel"
                value={form.phone}
                onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
                accent="cyan"
                error={errors.phone}
                placeholder="0999999999"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Industria"
                value={form.industry}
                onChange={(value) => setForm((current) => ({ ...current, industry: value }))}
                accent="cyan"
                options={industryOptions.map((item) => ({ value: item, label: item }))}
              />
              <InputField
                label="Ejecutivo asignado"
                value={form.executive}
                onChange={(value) => setForm((current) => ({ ...current, executive: value }))}
                accent="cyan"
                error={errors.executive}
                placeholder="Equipo comercial"
              />
            </div>

            <InputField
              label="Fecha alta"
              type="date"
              value={form.startDate}
              onChange={(value) => setForm((current) => ({ ...current, startDate: value }))}
              accent="cyan"
              error={errors.startDate}
            />

            <div className="space-y-2">
              <p className="text-sm font-medium text-neutral-700">Modulos habilitados</p>
              <div className="flex flex-wrap gap-2">
                {modules.map((module) => {
                  const enabled = form.enabledModules.includes(module.key);
                  return (
                    <button
                      key={module.key}
                      type="button"
                      onClick={() => toggleModule(module.key)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        enabled
                          ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                          : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      {module.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <TextareaField
              label="Notas"
              value={form.notes}
              onChange={(value) => setForm((current) => ({ ...current, notes: value }))}
              accent="cyan"
              rows={3}
              placeholder="Contexto comercial, compromisos de despliegue o notas del cierre."
            />

            <div className="space-y-3 rounded-lg border border-cyan-200 bg-cyan-50/60 p-4">
              <div>
                <p className="text-sm font-semibold text-neutral-950">Usuario master de la empresa</p>
                <p className="mt-1 text-xs leading-5 text-neutral-600">
                  Este acceso administrara toda la operacion interna de la empresa creada.
                </p>
              </div>
              <InputField
                label="Nombre del usuario master"
                value={form.masterUser.name}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    masterUser: { ...current.masterUser, name: value },
                  }))
                }
                accent="cyan"
                error={errors.masterUserName}
                placeholder="Nombre del administrador interno"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  label="Correo del usuario master"
                  type="email"
                  value={form.masterUser.email}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      masterUser: { ...current.masterUser, email: value },
                    }))
                  }
                  accent="cyan"
                  error={errors.masterUserEmail}
                  placeholder="admin@empresa.com"
                />
                <InputField
                  label="Usuario interno"
                  value={form.masterUser.username}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      masterUser: { ...current.masterUser, username: toUsername(value) },
                    }))
                  }
                  accent="cyan"
                  error={errors.masterUsername}
                  placeholder="empresaadmin"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  label="Contrasena temporal"
                  type="password"
                  value={form.masterUser.password}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      masterUser: { ...current.masterUser, password: value },
                    }))
                  }
                  accent="cyan"
                  error={errors.masterPassword}
                  placeholder="Crea una contrasena segura"
                />
                <InputField
                  label="Cargo visible"
                  value={form.masterUser.title}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      masterUser: { ...current.masterUser, title: value },
                    }))
                  }
                  accent="cyan"
                  error={errors.masterUserTitle}
                  placeholder="Administrador master de empresa"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" tone="cyan" variant="solid">
                {editingId ? "Guardar empresa" : "Crear empresa"}
              </Button>
            </div>
          </form>
        </SurfaceCard>

        <TableCard title="Cartera comercial" description="Empresas activas, prospectos y empresas pausadas.">
          <DataExportToolbar
            title="empresas-apli-smart-motors"
            columns={exportColumns}
            rows={exportRows}
            accent="cyan"
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Buscar por empresa, contacto o industria"
          />

          {filteredCompanies.length === 0 ? (
            <EmptyState
              title="Sin empresas"
              description="No hay coincidencias para los filtros actuales."
            />
          ) : (
            <Table minWidth="min-w-[1260px]">
              <TableHead>
                <tr>
                  <th className="px-4 py-3 font-semibold">Empresa</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Contacto</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Modulos</th>
                  <th className="px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </TableHead>
              <TableBody>
                {filteredCompanies.map((company) => (
                  <tr key={company.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-neutral-950">{company.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Pagina: /{company.slug} / {company.industry}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-neutral-950">
                        {getPlanName(plans, company.planId)}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">Alta {company.startDate}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p>{company.primaryContact}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {company.email} / {company.phone}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                          company.status === "Activa"
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                            : company.status === "Prospecto"
                              ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                              : "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200"
                        }`}
                      >
                        {company.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-neutral-950">
                        {company.enabledModules.length} modulos
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {company.enabledModules
                          .slice(0, 3)
                          .map((key) => getModuleName(modules, key))
                          .join(", ")}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          tone="cyan"
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => {
                            const companyMasterUser =
                              globalUsers.find((user) => user.companyId === company.id && user.createdFromCompany) ??
                              globalUsers.find(
                                (user) =>
                                  user.companyId === company.id &&
                                  (user.role === "owner_empresa" || user.role === "admin_empresa")
                              );
                            setEditingId(company.id);
                            setErrors({});
                            setForm({
                              name: company.name,
                              slug: company.slug,
                              planId: company.planId,
                              status: company.status,
                              primaryContact: company.primaryContact,
                              email: company.email,
                              phone: company.phone,
                              startDate: company.startDate,
                              enabledModules: company.enabledModules,
                              industry: company.industry,
                              executive: company.executive,
                              notes: company.notes,
                              masterUser: {
                                name: companyMasterUser?.name ?? company.primaryContact,
                                email: companyMasterUser?.email ?? company.email,
                                username: companyMasterUser?.username ?? toUsername(company.slug),
                                password: companyMasterUser?.password ?? "",
                                title: companyMasterUser?.title ?? "Administrador master de empresa",
                              },
                            });
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          tone={company.status === "Activa" ? "amber" : "teal"}
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          onClick={async () => {
                            const confirmed = await confirmAction({
                              title:
                                company.status === "Activa"
                                  ? "Inactivar empresa"
                                  : "Activar empresa",
                              description:
                                company.status === "Activa"
                                  ? "La empresa dejara de verse como activa en el panel master."
                                  : "La empresa volvera a estar operativa dentro del producto.",
                              confirmLabel:
                                company.status === "Activa" ? "Inactivar" : "Activar",
                              accent: "cyan",
                              successTitle: "Estado actualizado",
                              successDescription:
                                "La empresa ya refleja su nuevo estado.",
                              summary: [
                                { label: "Empresa", value: company.name },
                                { label: "Plan", value: getPlanName(plans, company.planId) },
                                { label: "Estado actual", value: company.status },
                              ],
                              action: async () => {
                                await toggleCompanyStatus(company.id);
                              },
                            });

                            if (!confirmed) {
                              return;
                            }
                          }}
                        >
                          {company.status === "Activa" ? "Inactivar" : "Activar"}
                        </Button>
                        {canDeleteCompanies ? (
                          <Button
                            tone="danger"
                            variant="outline"
                            className="px-3 py-1.5 text-xs"
                            onClick={async () => {
                              const confirmed = await confirmAction({
                                title: "Eliminar empresa",
                                description:
                                  "Se eliminara la empresa del panel master junto con su usuario master y la facturacion asociada.",
                                confirmLabel: "Eliminar empresa",
                                accent: "rose",
                                successTitle: "Empresa eliminada",
                                successDescription: "La empresa ya no forma parte de la cartera central.",
                                summary: [
                                  { label: "Empresa", value: company.name },
                                  { label: "Plan", value: getPlanName(plans, company.planId) },
                                  { label: "Contacto", value: company.primaryContact },
                                ],
                                action: async () => {
                                  await deleteCompany(company.id);
                                  if (editingId === company.id) {
                                    resetForm();
                                  }
                                },
                              });

                              if (!confirmed) {
                                return;
                              }
                            }}
                          >
                            Eliminar
                          </Button>
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

