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
import { InputField, SelectField } from "@/components/ui/form-controls";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import {
  getCompanyName,
  platformRoleGroups,
  roleGroupMap,
  roleLabelMap,
  userStatusOptions,
} from "@/features/master/helpers";
import type { PlatformRole, PlatformUser, PlatformUserStatus } from "@/types/platform";

type UserFormState = Omit<PlatformUser, "id">;
type UserFormErrors = Partial<Record<Exclude<keyof UserFormState, "companyId">, string>>;

const exportColumns: ExportColumn[] = [
  { key: "name", label: "Usuario" },
  { key: "company", label: "Empresa" },
  { key: "role", label: "Rol" },
  { key: "group", label: "Grupo" },
  { key: "status", label: "Estado" },
];

function createEmptyForm(): UserFormState {
  return {
    name: "",
    email: "",
    username: "",
    password: "",
    role: "admin_saas",
    companyId: null,
    status: "Activo",
    title: "",
  };
}

function validateForm(form: UserFormState, isEditing: boolean) {
  const errors: UserFormErrors = {};
  if (!form.name.trim()) errors.name = "El nombre es obligatorio.";
  if (!form.email.trim()) errors.email = "El correo es obligatorio.";
  if (!(form.username ?? "").trim()) errors.username = "El usuario es obligatorio.";
  if (!isEditing && !(form.password ?? "").trim()) errors.password = "La contrasena es obligatoria.";
  if (!form.title.trim()) errors.title = "El cargo visible es obligatorio.";
  return errors;
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

export function GlobalUsersPage() {
  const { confirmAction, notifyError } = useFeedback();
  const { session } = useAuth();
  const { globalUsers, companies, createGlobalUser, updateGlobalUser, deleteGlobalUser } =
    usePlatform();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [form, setForm] = useState<UserFormState>(createEmptyForm());
  const canDeleteGlobalUsers = session?.role === "superadmin" || session?.role === "admin_saas";

  const roleOptions = useMemo(
    () =>
      [...platformRoleGroups.plataforma, ...platformRoleGroups.operacion].map((role) => ({
        value: role,
        label: roleLabelMap[role],
      })),
    []
  );

  const filteredUsers = useMemo(() => {
    const value = query.trim().toLowerCase();
    return globalUsers.filter((user) => {
      const companyName = getCompanyName(companies, user.companyId);
      return (
        value.length === 0 ||
        user.name.toLowerCase().includes(value) ||
        user.email.toLowerCase().includes(value) ||
        user.title.toLowerCase().includes(value) ||
        companyName.toLowerCase().includes(value)
      );
    });
  }, [companies, globalUsers, query]);

  const exportRows = useMemo<ExportRow[]>(
    () =>
      filteredUsers.map((user) => ({
        name: user.name,
        company: getCompanyName(companies, user.companyId),
        role: roleLabelMap[user.role],
        group: roleGroupMap[user.role],
        status: user.status,
      })),
    [companies, filteredUsers]
  );

  const resetForm = () => {
    setEditingId(null);
    setErrors({});
    setForm(createEmptyForm());
  };

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Panel master"
        title="Usuarios globales"
        subtitle="Roles de plataforma y roles operativos visibles bajo una misma capa administrativa."
        accent="cyan"
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Usuarios" value={globalUsers.length.toString()} detail="Base total" tone="info" />
        <StatCard
          label="Activos"
          value={globalUsers.filter((user) => user.status === "Activo").length.toString()}
          detail="Con acceso"
          tone="success"
        />
        <StatCard
          label="Plataforma"
          value={globalUsers
            .filter((user) => roleGroupMap[user.role] === "Plataforma")
            .length.toString()}
          detail="Roles de plataforma"
          tone="warning"
        />
        <StatCard
          label="Operacion"
          value={globalUsers
            .filter((user) => roleGroupMap[user.role] === "Operacion")
            .length.toString()}
          detail="Roles cliente"
          tone="danger"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <SurfaceCard className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">
                {editingId ? "Editar usuario" : "Nuevo usuario global"}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Separa bien plataforma, comercial y operacion por empresa.
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
                  "Completa la ficha del usuario global antes de guardar."
                );
                return;
              }

              const confirmed = await confirmAction({
                title: editingId ? "Guardar usuario global" : "Crear usuario global",
                description:
                  "El rol quedara visible en el panel master y, si aplica, vinculado a una empresa especifica.",
                confirmLabel: editingId ? "Guardar cambios" : "Crear usuario",
                accent: "cyan",
                successTitle: editingId ? "Usuario actualizado" : "Usuario creado",
                successDescription: "La base de usuarios globales ya fue actualizada.",
                summary: [
                  { label: "Usuario", value: form.name },
                  { label: "Rol", value: roleLabelMap[form.role] },
                  { label: "Empresa", value: getCompanyName(companies, form.companyId) },
                  { label: "Estado", value: form.status },
                ],
                action: async () => {
                  if (editingId) {
                    await updateGlobalUser(editingId, form);
                  } else {
                    await createGlobalUser(form);
                  }
                },
              });
              if (confirmed) {
                resetForm();
              }
            }}
          >
            <InputField
              label="Nombre"
              value={form.name}
              onChange={(value) => setForm((current) => ({ ...current, name: value }))}
              accent="cyan"
              error={errors.name}
            />
            <InputField
              label="Correo"
              type="email"
              value={form.email}
              onChange={(value) => setForm((current) => ({ ...current, email: value }))}
              accent="cyan"
              error={errors.email}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                label="Usuario"
                value={form.username ?? ""}
                onChange={(value) => setForm((current) => ({ ...current, username: value }))}
                accent="cyan"
                error={errors.username}
              />
              <InputField
                label="Contrasena"
                type="password"
                value={form.password ?? ""}
                onChange={(value) => setForm((current) => ({ ...current, password: value }))}
                accent="cyan"
                error={errors.password}
              />
            </div>
            <InputField
              label="Cargo visible"
              value={form.title}
              onChange={(value) => setForm((current) => ({ ...current, title: value }))}
              accent="cyan"
              error={errors.title}
            />
            <SelectField
              label="Rol"
              value={form.role}
              onChange={(value) => {
                const role = value as PlatformRole;
                setForm((current) => ({
                  ...current,
                  role,
                  companyId: platformRoleGroups.plataforma.includes(role) ? null : current.companyId,
                }));
              }}
              accent="cyan"
              options={roleOptions}
            />
            <SelectField
              label="Empresa"
              value={form.companyId ?? ""}
              onChange={(value) => setForm((current) => ({ ...current, companyId: value || null }))}
              accent="cyan"
              options={[
                { value: "", label: "Plataforma / Sin empresa" },
                ...companies.map((company) => ({ value: company.id, label: company.name })),
              ]}
            />
            <SelectField
              label="Estado"
              value={form.status}
              onChange={(value) =>
                setForm((current) => ({ ...current, status: value as PlatformUserStatus }))
              }
              accent="cyan"
              options={userStatusOptions}
            />
            <div className="flex justify-end">
              <Button type="submit" tone="cyan" variant="solid">
                {editingId ? "Guardar usuario" : "Crear usuario"}
              </Button>
            </div>
          </form>
        </SurfaceCard>

        <TableCard
          title="Base global"
          description="Usuarios central, clientes y soporte con roles bien separados."
        >
          <DataExportToolbar
            title="usuarios-globales-apli-smart-motors"
            columns={exportColumns}
            rows={exportRows}
            accent="cyan"
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Buscar por usuario, empresa o cargo"
          />

          {filteredUsers.length === 0 ? (
            <EmptyState title="Sin usuarios" description="No hay coincidencias con el filtro actual." />
          ) : (
            <Table minWidth="min-w-[1140px]">
              <TableHead>
                <tr>
                  <th className="px-4 py-3 font-semibold">Usuario</th>
                  <th className="px-4 py-3 font-semibold">Rol</th>
                  <th className="px-4 py-3 font-semibold">Empresa</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </TableHead>
              <TableBody>
                {filteredUsers.map((user) => {
                  const isCurrentSession =
                    Boolean(session) &&
                    normalizeValue(session?.email ?? "") === normalizeValue(user.email);
                  const isProtectedUser = user.role === "superadmin";
                  const canMutateUser = !isCurrentSession && !isProtectedUser;

                  return (
                    <tr key={user.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-neutral-950">{user.name}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {user.email} / {user.username ?? "sin-usuario"} / {user.title}
                        </p>
                        {isCurrentSession ? (
                          <p className="mt-1 text-xs font-semibold text-cyan-700">Sesion actual</p>
                        ) : null}
                        {isProtectedUser ? (
                          <p className="mt-1 text-xs font-semibold text-amber-700">Cuenta protegida</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-neutral-950">{roleLabelMap[user.role]}</p>
                        <p className="mt-1 text-xs text-neutral-500">{roleGroupMap[user.role]}</p>
                      </td>
                      <td className="px-4 py-3.5">{getCompanyName(companies, user.companyId)}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                            user.status === "Activo"
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                              : user.status === "Invitado"
                                ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                                : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                          }`}
                        >
                          {user.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            tone="cyan"
                            variant="outline"
                            className="px-3 py-1.5 text-xs"
                            onClick={() => {
                              setEditingId(user.id);
                              setErrors({});
                              setForm({
                                name: user.name,
                                email: user.email,
                                username: user.username ?? "",
                                password: user.password ?? "",
                                role: user.role,
                                companyId: user.companyId,
                                status: user.status,
                                title: user.title,
                              });
                            }}
                          >
                            Editar
                          </Button>
                          {canMutateUser ? (
                            <Button
                              tone={user.status === "Activo" ? "amber" : "teal"}
                              variant="outline"
                              className="px-3 py-1.5 text-xs"
                              onClick={async () => {
                                const nextStatus: PlatformUserStatus =
                                  user.status === "Activo" ? "Suspendido" : "Activo";
                                const confirmed = await confirmAction({
                                  title:
                                    nextStatus === "Activo"
                                      ? "Reactivar usuario"
                                      : "Suspender usuario",
                                  description:
                                    "El cambio afectara la visibilidad del acceso en el panel master.",
                                  confirmLabel:
                                    nextStatus === "Activo" ? "Reactivar" : "Suspender",
                                  accent: "cyan",
                                  successTitle: "Estado actualizado",
                                  successDescription: "El usuario ya refleja el nuevo estado.",
                                  summary: [
                                    { label: "Usuario", value: user.name },
                                    { label: "Rol", value: roleLabelMap[user.role] },
                                    { label: "Nuevo estado", value: nextStatus },
                                  ],
                                  action: async () => {
                                    await updateGlobalUser(user.id, { ...user, status: nextStatus });
                                  },
                                });

                                if (!confirmed) {
                                  return;
                                }
                              }}
                            >
                              {user.status === "Activo" ? "Suspender" : "Reactivar"}
                            </Button>
                          ) : null}
                          {canDeleteGlobalUsers && canMutateUser ? (
                            <Button
                              tone="danger"
                              variant="outline"
                              className="px-3 py-1.5 text-xs"
                              onClick={async () => {
                                const confirmed = await confirmAction({
                                  title: "Eliminar usuario",
                                  description:
                                    "El usuario se eliminara de la base global y perdera su acceso a la plataforma.",
                                  confirmLabel: "Eliminar usuario",
                                  accent: "rose",
                                  successTitle: "Usuario eliminado",
                                  successDescription:
                                    "El acceso ya fue retirado de la base global.",
                                  summary: [
                                    { label: "Usuario", value: user.name },
                                    { label: "Correo", value: user.email },
                                    { label: "Rol", value: roleLabelMap[user.role] },
                                  ],
                                  action: async () => {
                                    await deleteGlobalUser(user.id);
                                    if (editingId === user.id) {
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
                          {!canMutateUser ? (
                            <span className="inline-flex items-center rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-500">
                              Protegido
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TableCard>
      </section>
    </div>
  );
}
