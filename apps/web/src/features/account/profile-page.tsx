"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useFeedback } from "@/components/providers/feedback-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { InputField } from "@/components/ui/form-controls";
import { SectionHeading, StatCard, SurfaceCard } from "@/components/ui/surface";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import type { AccountProfile, PlatformUser } from "@/types/platform";

function getInitials(name: string) {
  const chunks = name.trim().split(/\s+/).filter(Boolean);
  return (chunks[0]?.[0] ?? "U").concat(chunks[1]?.[0] ?? "").toUpperCase();
}

function getAccessLabel(role?: string) {
  switch (role) {
    case "superadmin":
      return "Administrador master";
    case "admin_saas":
      return "Administrador de plataforma";
    case "comercial":
      return "Comercial";
    case "soporte":
      return "Soporte";
    case "owner_empresa":
    case "admin_empresa":
      return "Administrador master de empresa";
    case "conductor":
      return "Conductor";
    case "supervisor":
      return "Supervisor";
    case "operador":
      return "Operador";
    default:
      return "Usuario";
  }
}

export function ProfilePage() {
  const { confirmAction, notifyError, notifySuccess } = useFeedback();
  const { session } = useAuth();
  const { profile, globalUsers, updateGlobalUser, updateProfile } = usePlatform();
  const currentTenant = {
    name: session?.companyName ?? "",
    code: "",
    sector: "",
    id: session?.companyId ? `tenant-company-${session.companyId}` : "",
  };
  const auditEntries: { tenantId: string }[] = [];
  const matchedUser = useMemo(() => {
    if (!session) {
      return null;
    }

    const sessionEmail = session.email.trim().toLowerCase();
    return (
      globalUsers.find((user) => user.id === session.id) ??
      globalUsers.find((user) => user.email.trim().toLowerCase() === sessionEmail) ??
      globalUsers.find((user) => (user.username ?? "").trim().toLowerCase() === sessionEmail) ??
      null
    );
  }, [globalUsers, session]);

  const activeProfile = useMemo<AccountProfile>(() => {
    const profileData = matchedUser?.profile ?? {};
    const isMaster = session?.role === "superadmin";
    const name = session?.name ?? matchedUser?.name ?? profile.name;
    const title = session?.title ?? matchedUser?.title ?? profile.title;
    const email = session?.email ?? matchedUser?.email ?? profile.email;

    return {
      name,
      title,
      email,
      phone: profileData.phone ?? profile.phone,
      company: session?.companyName ?? currentTenant.name ?? profile.company,
      avatar: getInitials(name),
      language: profile.language || "Español",
      timezone: profile.timezone || "America/Guayaquil",
      platformRole: session?.role ?? matchedUser?.role ?? profile.platformRole,
      operationalRole: getAccessLabel(session?.role ?? matchedUser?.role),
      notifications: profile.notifications,
      passwordHint: isMaster
        ? profile.passwordHint
        : "Última actualización: pendiente de seguridad avanzada.",
    };
  }, [currentTenant.name, matchedUser, profile, session]);

  const [form, setForm] = useState<AccountProfile>(activeProfile);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    nextPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    setForm(activeProfile);
  }, [activeProfile]);

  const isMasterSession = session?.role === "superadmin";
  const panelLabel = isMasterSession ? "Panel master" : "Panel de empresa";
  const visibleAuditEntries = auditEntries.filter((entry) => entry.tenantId === currentTenant.id);

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Cuenta"
        title="Perfil del usuario"
        subtitle="Datos del usuario actual, preferencias, cambio de contraseña y resumen de acceso."
        accent="emerald"
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Rol actual" value={form.operationalRole} detail={panelLabel} tone="info" />
        <StatCard label="Acceso" value={session?.roleLabel ?? form.operationalRole} detail="Menú asignado" tone="success" />
        <StatCard label="Empresa activa" value={currentTenant.code} detail={currentTenant.name} tone="warning" />
        <StatCard label="Auditoría" value={visibleAuditEntries.length.toString()} detail="Eventos recientes de la empresa" tone="danger" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SurfaceCard className="p-4">
          <SectionHeading title="Ficha personal" description="Perfil visible para cuenta, soporte y operación." />
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const confirmed = await confirmAction({
                title: "Guardar perfil",
                description: "Los cambios del usuario quedarán visibles en la cuenta actual.",
                confirmLabel: "Guardar perfil",
                accent: "emerald",
                successTitle: "Perfil actualizado",
                successDescription: "Tu información quedó actualizada.",
                summary: [
                  { label: "Nombre", value: form.name },
                  { label: "Cargo", value: form.title },
                  { label: "Idioma", value: form.language },
                ],
                action: async () => {
                  if (isMasterSession) {
                    updateProfile(form);
                    return;
                  }

                  if (!matchedUser) {
                    throw new Error("No encontramos el usuario activo para guardar el perfil.");
                  }

                  const nextUser: Omit<PlatformUser, "id"> = {
                    name: form.name,
                    email: form.email.trim().toLowerCase(),
                    username: matchedUser.username ?? "",
                    password: "",
                    role: matchedUser.role,
                    companyId: matchedUser.companyId,
                    status: matchedUser.status,
                    title: form.title,
                    createdFromCompany: matchedUser.createdFromCompany,
                    profile: {
                      ...matchedUser.profile,
                      phone: form.phone,
                    },
                  };

                  await updateGlobalUser(matchedUser.id, nextUser);
                },
              });
              if (!confirmed) {
                return;
              }
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <InputField label="Nombre" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} accent="emerald" />
              <InputField label="Cargo / Rol" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} accent="emerald" />
              <InputField label="Correo" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} accent="emerald" />
              <InputField label="Teléfono" type="tel" value={form.phone} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} accent="emerald" />
              <InputField label="Empresa" value={form.company} onChange={(value) => setForm((current) => ({ ...current, company: value }))} accent="emerald" />
              <InputField label="Avatar / Iniciales" value={form.avatar} onChange={(value) => setForm((current) => ({ ...current, avatar: value.slice(0, 2).toUpperCase() }))} accent="emerald" />
              <InputField label="Idioma" value={form.language} onChange={(value) => setForm((current) => ({ ...current, language: value }))} accent="emerald" />
              <InputField label="Zona horaria" value={form.timezone} onChange={(value) => setForm((current) => ({ ...current, timezone: value }))} accent="emerald" />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-neutral-700">Notificaciones</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "email", label: "Correo" },
                  { key: "system", label: "Sistema" },
                  { key: "billing", label: "Facturación" },
                ].map((item) => {
                  const enabled = form.notifications[item.key as keyof typeof form.notifications];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          notifications: {
                            ...current.notifications,
                            [item.key]: !current.notifications[item.key as keyof typeof current.notifications],
                          },
                        }))
                      }
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        enabled
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-neutral-200 bg-white text-neutral-600"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" tone="emerald" variant="solid">
                Guardar perfil
              </Button>
            </div>
          </form>
        </SurfaceCard>

        <div className="space-y-4">
          <SurfaceCard className="p-4">
            <SectionHeading title="Cambiar contraseña" description="Flujo de cuenta preparado para conectar con autenticación real." />
            <div className="mt-4 space-y-4">
              <InputField label="Contraseña actual" type="password" value={passwordForm.currentPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, currentPassword: value }))} accent="emerald" />
              <InputField label="Nueva contraseña" type="password" value={passwordForm.nextPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, nextPassword: value }))} accent="emerald" />
              <InputField label="Confirmar contraseña" type="password" value={passwordForm.confirmPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, confirmPassword: value }))} accent="emerald" />
              <p className="text-xs text-neutral-500">{form.passwordHint}</p>
              <div className="flex justify-end">
                <Button
                  tone="emerald"
                  variant="outline"
                  onClick={async () => {
                    if (!passwordForm.currentPassword || !passwordForm.nextPassword || !passwordForm.confirmPassword) {
                      notifyError("Campos incompletos", "Completa la contraseña actual y la nueva clave.");
                      return;
                    }

                    if (passwordForm.nextPassword !== passwordForm.confirmPassword) {
                      notifyError("Las contraseñas no coinciden", "Repite la nueva contraseña correctamente.");
                      return;
                    }

                    const confirmed = await confirmAction({
                      title: "Cambiar contraseña",
                      description: "El cambio se registrará como una operación de cuenta.",
                      confirmLabel: "Cambiar contraseña",
                      accent: "emerald",
                      successTitle: "Contraseña actualizada",
                      successDescription: "La operación se completó correctamente.",
                      summary: [{ label: "Usuario", value: form.email }],
                      action: async () => {
                        setPasswordForm({ currentPassword: "", nextPassword: "", confirmPassword: "" });
                        notifySuccess("Cambio aplicado", "La nueva contraseña quedó registrada en esta sesión.");
                      },
                    });
                    if (!confirmed) {
                      return;
                    }
                  }}
                >
                  Cambiar contraseña
                </Button>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-4">
            <SectionHeading title="Resumen de acceso" description="Contexto del usuario en la plataforma y la empresa activa." />
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-sm font-semibold text-neutral-950">Usuario operativo actual</p>
                <p className="mt-1 text-sm text-neutral-600">{form.name} / {form.operationalRole}</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-sm font-semibold text-neutral-950">Empresa activa</p>
                <p className="mt-1 text-sm text-neutral-600">{currentTenant.name} / {currentTenant.sector}</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-sm font-semibold text-neutral-950">Rol de acceso</p>
                <p className="mt-1 text-sm text-neutral-600">{session?.roleLabel ?? form.operationalRole}</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-sm font-semibold text-neutral-950">Preferencias activas</p>
                <p className="mt-1 text-sm text-neutral-600">
                  {form.language} / {form.timezone}
                </p>
              </div>
            </div>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}
