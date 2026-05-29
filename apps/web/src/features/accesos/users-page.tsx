"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useFleetOps } from "@/components/providers/fleetops-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DataExportToolbar,
  type ExportColumn,
  type ExportRow,
} from "@/components/ui/data-export-toolbar";
import {
  FileField,
  InputField,
  SelectField,
  TextareaField,
} from "@/components/ui/form-controls";
import { ImageGalleryField } from "@/components/ui/image-gallery-field";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import {
  customerAccessTierLabels,
  customerRoleOptions,
  getCustomerRoleTemplate,
  type CustomerAccessTier,
} from "@/lib/role-catalog";
import type { PlatformCompany, PlatformModuleKey, PlatformUser } from "@/types/platform";
import { useSites } from "@/hooks/useSites";



type AccessUserStatus = "Activo" | "Pendiente" | "Bloqueado";

type AccessUser = {
  id: string;
  documentNumber: string;
  fullName: string;
  lastName: string;
  email: string;
  birthDate: string;
  startDate: string;
  address: string;
  site: string;
  area: string;
  photoName: string;
  username: string;
  password: string;
  role: string;
  accessTier: CustomerAccessTier;
  phone: string;
  status: AccessUserStatus;
  notes: string;
  modulePermissions: PlatformModuleKey[];
  licenseNumber: string;
  licenseType: string;
  licenseExpiry: string;
  licensePoints: string;
};

type UserFormState = Omit<AccessUser, "id">;
type UserFormErrors = Partial<Record<keyof UserFormState, string>>;

const initialUsers: AccessUser[] = [];

const exportColumns: ExportColumn[] = [
  { key: "fullName", label: "Colaborador" },
  { key: "documentNumber", label: "Documento" },
  { key: "site", label: "Sede" },
  { key: "area", label: "Area / Cargo" },
  { key: "role", label: "Rol" },
  { key: "accessTier", label: "Nivel de acceso" },
  { key: "username", label: "Usuario" },
  { key: "phone", label: "Contacto" },
  { key: "status", label: "Estado" },
];

const USERS_STORAGE_KEY = "aplismart-access-users-v1";
const MASTER_EMAIL = "aplicrm@gmail.com";
const MASTER_USERNAME = "master";

const modulePermissionOptions: Array<{ key: PlatformModuleKey; label: string }> = [
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

const roleDefaultModules: Record<CustomerAccessTier, PlatformModuleKey[]> = {
  owner_empresa: modulePermissionOptions.map((item) => item.key),
  admin_empresa: ["dashboard", "flotas", "conductores", "asignaciones", "seguros", "reportes", "accesos", "configuracion"],
  supervisor: ["dashboard", "flotas", "motores", "generadores", "aires_acondicionados", "mantenimiento", "checklist", "alertas", "reportes"],
  conductor: ["dashboard", "checklist", "alertas", "reportes", "geolocalizacion"],
  operador: ["dashboard", "mantenimiento", "checklist", "alertas", "aires_acondicionados", "geolocalizacion"],
};

function getCompanyIdFromTenantId(tenantId: string) {
  return tenantId.startsWith("tenant-company-") ? tenantId.replace("tenant-company-", "") : null;
}

function normalizeCompanyName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function findCompanyIdByTenantName(companies: PlatformCompany[], tenantName: string) {
  const normalizedTenantName = normalizeCompanyName(tenantName);
  const match = companies.find((company) => {
    const normalizedCompanyName = normalizeCompanyName(company.name);
    return (
      normalizedCompanyName === normalizedTenantName ||
      normalizedCompanyName.includes(normalizedTenantName) ||
      normalizedTenantName.includes(normalizedCompanyName)
    );
  });

  return match?.id ?? null;
}

function resolveCurrentCompanyId(input: {
  companies: PlatformCompany[];
  currentTenantId: string;
  currentTenantName: string;
  currentUserEmail: string;
  globalUsers: PlatformUser[];
  sessionCompanyId: string | null | undefined;
  sessionEmail: string | undefined;
}) {
  if (input.sessionCompanyId) {
    return input.sessionCompanyId;
  }

  const fromTenantId = getCompanyIdFromTenantId(input.currentTenantId);
  if (fromTenantId) {
    return fromTenantId;
  }

  const knownEmails = [input.sessionEmail, input.currentUserEmail]
    .filter(Boolean)
    .map((value) => value!.trim().toLowerCase());

  if (knownEmails.length > 0) {
    const matchedUser = input.globalUsers.find(
      (user) =>
        Boolean(user.companyId) &&
        knownEmails.includes(user.email.trim().toLowerCase()) &&
    ["owner_empresa", "admin_empresa", "supervisor", "operador", "conductor"].includes(user.role),
    );

    if (matchedUser?.companyId) {
      return matchedUser.companyId;
    }
  }

  const fromTenantName = findCompanyIdByTenantName(input.companies, input.currentTenantName);
  if (fromTenantName) {
    return fromTenantName;
  }

  if (input.companies.length === 1) {
    return input.companies[0].id;
  }

  return null;
}

function mapAccessTierToPlatformRole(accessTier: CustomerAccessTier) {
  return accessTier;
}

function mapPlatformStatusToAccessStatus(status: PlatformUser["status"]): AccessUserStatus {
  if (status === "Suspendido") {
    return "Bloqueado";
  }
  if (status === "Invitado") {
    return "Pendiente";
  }
  return "Activo";
}

function mapAccessStatusToPlatformStatus(status: AccessUserStatus): PlatformUser["status"] {
  if (status === "Bloqueado") {
    return "Suspendido";
  }
  if (status === "Pendiente") {
    return "Invitado";
  }
  return "Activo";
}

function buildAccessUserFromPlatformUser(
  user: PlatformUser,
  storedUser?: AccessUser,
): AccessUser {
  const today = new Date().toISOString().slice(0, 10);
  const profile = user.profile ?? {};
  return {
    id: user.id,
    documentNumber: profile.documentNumber ?? storedUser?.documentNumber ?? "",
    fullName: user.name,
    lastName: profile.lastName ?? storedUser?.lastName ?? "",
    email: user.email,
    birthDate: profile.birthDate ?? storedUser?.birthDate ?? "",
    startDate: profile.startDate ?? storedUser?.startDate ?? today,
    address: profile.address ?? storedUser?.address ?? "",
    site: profile.site ?? storedUser?.site ?? "",
    area: profile.area ?? storedUser?.area ?? "",
    photoName: profile.photoName ?? storedUser?.photoName ?? "",
    username: user.username ?? "",
    password: profile.basePassword ?? storedUser?.password ?? "",
    role: user.title,
    accessTier: user.role as CustomerAccessTier,
    phone: profile.phone ?? storedUser?.phone ?? "",
    status: storedUser?.status ?? mapPlatformStatusToAccessStatus(user.status),
    notes: profile.notes ?? storedUser?.notes ?? "",
    modulePermissions: (profile.modulePermissions as PlatformModuleKey[] | undefined) ?? storedUser?.modulePermissions ?? roleDefaultModules[user.role as CustomerAccessTier] ?? [],
    licenseNumber: profile.licenseNumber ?? storedUser?.licenseNumber ?? "",
    licenseType: profile.licenseType ?? storedUser?.licenseType ?? "Tipo C",
    licenseExpiry: profile.licenseExpiry ?? storedUser?.licenseExpiry ?? "",
    licensePoints: String(profile.licensePoints ?? storedUser?.licensePoints ?? 30),
  };
}

function findStoredUserForPlatformUser(storedUsers: AccessUser[], user: PlatformUser) {
  const email = user.email.trim().toLowerCase();
  const username = (user.username ?? "").trim().toLowerCase();

  return storedUsers.find((storedUser) => {
    const storedEmail = storedUser.email.trim().toLowerCase();
    const storedUsername = storedUser.username.trim().toLowerCase();

    return (
      storedUser.id === user.id ||
      (email.length > 0 && storedEmail === email) ||
      (username.length > 0 && storedUsername === username)
    );
  });
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function createUsername(fullName: string, documentNumber: string) {
  const chunks = normalizeText(fullName).split(/\s+/).filter(Boolean);
  const base = chunks.slice(0, 2).join("") || "usuario";
  const suffix = documentNumber.replace(/\D/g, "").slice(-4) || "0001";
  return `${base}${suffix}`.slice(0, 20);
}

function createPassword(documentNumber: string, startDate: string) {
  if (startDate) {
    return startDate.replace(/-/g, "");
  }

  const suffix = documentNumber.replace(/\D/g, "").slice(-8);
  return suffix || "20260415";
}

function createFallbackSiteName(companyName: string) {
  const companyPrefix = companyName.split(/\s+/).filter(Boolean)[0] || "Empresa";
  return `${companyPrefix} Matriz`;
}

function createEmptyForm(defaultSite: string): UserFormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    documentNumber: "",
    fullName: "",
    lastName: "",
    email: "",
    birthDate: "",
    startDate: today,
    address: "",
    site: defaultSite,
    area: "",
    photoName: "",
    username: "Autogenerando...",
    password: createPassword("", today),
    role: "Supervisor de Mantenimiento",
    accessTier: "supervisor",
    phone: "",
    status: "Activo",
    notes: "",
    modulePermissions: roleDefaultModules.supervisor,
    licenseNumber: "",
    licenseType: "Tipo C",
    licenseExpiry: "",
    licensePoints: "30",
  };
}

function validateForm(form: UserFormState) {
  const errors: UserFormErrors = {};
  if (!form.documentNumber.trim()) errors.documentNumber = "El documento es obligatorio.";
  if (!form.fullName.trim()) errors.fullName = "Los nombres completos son obligatorios.";
  if (!form.lastName.trim()) errors.lastName = "Los apellidos completos son obligatorios.";
  if (!form.email.trim()) errors.email = "El correo corporativo es obligatorio.";
  if (!form.birthDate) errors.birthDate = "La fecha de nacimiento es obligatoria.";
  if (!form.startDate) errors.startDate = "La fecha de ingreso es obligatoria.";
  if (!form.address.trim()) errors.address = "La dirección es obligatoria.";
  if (!form.site.trim()) errors.site = "La sede es obligatoria.";
  if (!form.area.trim()) errors.area = "El area o cargo es obligatorio.";
  if (!form.role.trim()) errors.role = "El rol es obligatorio.";
  if (!form.phone.trim()) errors.phone = "El número de contacto es obligatorio.";
  if (form.accessTier === "conductor") {
    if (!form.licenseNumber.trim()) errors.licenseNumber = "El número de licencia es obligatorio.";
    if (!form.licenseType.trim()) errors.licenseType = "El tipo de licencia es obligatorio.";
    if (!form.licenseExpiry) errors.licenseExpiry = "La vigencia de licencia es obligatoria.";
    const points = Number(form.licensePoints);
    if (!Number.isFinite(points) || points < 0 || points > 30) {
      errors.licensePoints = "Los puntos deben estar entre 0 y 30.";
    }
  }
  return errors;
}

function buildSiteOptions(siteNames: string[], currentValue: string) {
  const options = [...siteNames];
  if (currentValue && !options.includes(currentValue)) {
    options.push(currentValue);
  }
  return options;
}

function ReadonlyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <input
        readOnly
        value={value}
        className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2.5 text-sm font-medium text-neutral-700 outline-none"
      />
      {hint ? <p className="text-xs text-neutral-500">{hint}</p> : null}
    </label>
  );
}

export function UsersPage() {
  const { confirmAction, notifyError } = useFeedback();
  const { session } = useAuth();
  const { sites } = useSites();
  const { companies, globalUsers, createGlobalUser, updateGlobalUser, deleteGlobalUser } = usePlatform();
  const currentTenantId = session?.companyId ? `tenant-company-${session.companyId}` : "";
  const tenantId = currentTenantId;
  const currentTenant = { name: session?.companyName ?? "" };
  const currentUser = { email: session?.email ?? "", role: session?.role ?? "" };


  const currentCompanyId = useMemo(
    () =>
      resolveCurrentCompanyId({
        companies,
        currentTenantId,
        currentTenantName: currentTenant.name,
        currentUserEmail: currentUser.email,
        globalUsers,
        sessionCompanyId: session?.companyId,
        sessionEmail: session?.email,
      }),
    [companies, currentTenant.name, currentTenantId, currentUser.email, globalUsers, session?.companyId, session?.email],
  );
  const activeSites = useMemo(
    () => {
      const siteNames = sites.filter((site) => site.status === "Activa").map((site) => site.name);
      const fallbackSite = createFallbackSiteName(currentTenant.name);

      return siteNames.length > 0 ? siteNames : [fallbackSite];
    },
    [currentTenant.name, sites]
  );
  const [users, setUsers] = useState(initialUsers);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<UserFormState>(() => createEmptyForm(activeSites[0] ?? ""));
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const syncedTenantsRef = useRef<Set<string>>(new Set());
  const canDeleteUsers = session?.role === "admin_empresa" || session?.role === "owner_empresa";

  useEffect(() => {
    if (!activeSites[0] || form.site.trim()) {
      return;
    }

    setForm((current) => ({ ...current, site: activeSites[0] }));
    setErrors((current) => {
      if (!current.site) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors.site;
      return nextErrors;
    });
  }, [activeSites, form.site]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(USERS_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, AccessUser[]>) : {};
      const storedUsers = parsed[tenantId] ?? [];
      const companyUsers = globalUsers.filter(
        (user) =>
          user.companyId === currentCompanyId &&
      ["owner_empresa", "admin_empresa", "supervisor", "operador", "conductor"].includes(user.role) &&
          user.email.trim().toLowerCase() !== MASTER_EMAIL &&
          (user.username ?? "").trim().toLowerCase() !== MASTER_USERNAME,
      );
      const hydratedUsers = companyUsers.map((user) =>
        buildAccessUserFromPlatformUser(user, findStoredUserForPlatformUser(storedUsers, user)),
      );
      const orphanUsers = storedUsers.filter(
        (user) =>
          !companyUsers.some((entry) => entry.id === user.id) &&
          user.email.trim().toLowerCase() !== MASTER_EMAIL &&
          user.username.trim().toLowerCase() !== MASTER_USERNAME &&
          !user.id.startsWith("platform-user-") &&
          !/superadmin/i.test(user.fullName) &&
          !/administrador master/i.test(user.role),
      );
      setUsers(currentCompanyId ? [...hydratedUsers, ...orphanUsers] : []);
    } catch {
      setUsers([]);
    } finally {
      setLoaded(true);
    }
  }, [currentCompanyId, currentTenantId, globalUsers]);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(USERS_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, AccessUser[]>) : {};
      window.localStorage.setItem(
        USERS_STORAGE_KEY,
        JSON.stringify({
          ...parsed,
          [tenantId]: users,
        })
      );
    } catch {
      window.localStorage.setItem(
        USERS_STORAGE_KEY,
        JSON.stringify({
          [tenantId]: users,
        })
      );
    }
  }, [currentTenantId, loaded, users]);

  useEffect(() => {
    if (!loaded || !currentCompanyId || syncedTenantsRef.current.has(tenantId)) {
      return;
    }

    const backendUsers = globalUsers.filter(
      (user) => user.companyId === currentCompanyId && user.role !== "owner_empresa",
    );
    const pendingSync = users.filter((user) => {
      if (user.id.startsWith("company-user-") || user.id.startsWith("platform-user-")) {
        return false;
      }

      return !backendUsers.some(
        (entry) =>
          entry.email.toLowerCase() === user.email.toLowerCase() ||
          (entry.username ?? "").toLowerCase() === user.username.toLowerCase(),
      );
    });

    if (pendingSync.length === 0) {
      syncedTenantsRef.current.add(tenantId);
      return;
    }

    let cancelled = false;

    const syncPendingUsers = async () => {
      for (const user of pendingSync) {
        if (cancelled) {
          return;
        }

        try {
          await createGlobalUser({
            name: user.fullName,
            email: user.email.trim().toLowerCase(),
            username: user.username.trim().toLowerCase(),
            password: user.password,
            role: mapAccessTierToPlatformRole(user.accessTier),
            companyId: currentCompanyId,
            status: mapAccessStatusToPlatformStatus(user.status),
            title: user.role,
            profile: {
              documentNumber: user.documentNumber,
              lastName: user.lastName,
              birthDate: user.birthDate,
              startDate: user.startDate,
              address: user.address,
              site: user.site,
              area: user.area,
              photoName: user.photoName,
              phone: user.phone,
              notes: user.notes,
              basePassword: user.password,
              modulePermissions: user.modulePermissions,
              licenseNumber: user.licenseNumber,
              licenseType: user.licenseType,
              licenseExpiry: user.licenseExpiry,
              licensePoints: Number(user.licensePoints || 30),
            },
          });
        } catch {
          return;
        }
      }

      syncedTenantsRef.current.add(currentTenantId);
    };

    void syncPendingUsers();

    return () => {
      cancelled = true;
    };
  }, [createGlobalUser, currentCompanyId, currentTenantId, globalUsers, loaded, users]);

  const siteOptions = useMemo(
    () => buildSiteOptions(activeSites, form.site),
    [activeSites, form.site]
  );

  const filteredUsers = useMemo(() => {
    const value = query.trim().toLowerCase();
    return users.filter((user) => {
      return (
        value.length === 0 ||
        user.fullName.toLowerCase().includes(value) ||
        user.lastName.toLowerCase().includes(value) ||
        user.documentNumber.includes(value) ||
        user.role.toLowerCase().includes(value) ||
        user.phone.includes(value) ||
        user.site.toLowerCase().includes(value) ||
        user.area.toLowerCase().includes(value) ||
        user.email.toLowerCase().includes(value)
      );
    });
  }, [query, users]);

  const exportRows = useMemo<ExportRow[]>(
    () =>
      filteredUsers.map((user) => ({
        fullName: `${user.fullName} ${user.lastName}`.trim(),
        documentNumber: user.documentNumber,
        site: user.site,
        area: user.area,
        role: user.role,
        accessTier: customerAccessTierLabels[user.accessTier],
        username: user.username,
        phone: user.phone,
        status: user.status,
      })),
    [filteredUsers]
  );

  const updateForm = (key: keyof UserFormState, value: string) => {
    setErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[key];
      return nextErrors;
    });

    setForm((current) => {
      const next = { ...current, [key]: value };
      const nextName = key === "fullName" ? value : next.fullName;
      const nextDocument = key === "documentNumber" ? value : next.documentNumber;
      const nextStartDate = key === "startDate" ? value : next.startDate;

      if (key === "username") {
        setUsernameTouched(true);
      } else if (!usernameTouched) {
        next.username = createUsername(nextName, nextDocument);
      }

      if (key === "password") {
        setPasswordTouched(true);
      } else if (!passwordTouched) {
        next.password = createPassword(nextDocument, nextStartDate);
      }

      if (key === "role") {
        const nextAccessTier = getCustomerRoleTemplate(value).accessTier;
        next.accessTier = nextAccessTier;
        next.modulePermissions = roleDefaultModules[nextAccessTier];
      }

      return next;
    });
  };

  const openModal = () => {
    setEditingId(null);
    setErrors({});
    setUsernameTouched(false);
    setPasswordTouched(false);
    setForm(createEmptyForm(activeSites[0] ?? ""));
    setIsModalOpen(true);
  };

  const toggleModulePermission = (moduleKey: PlatformModuleKey) => {
    setForm((current) => {
      const hasModule = current.modulePermissions.includes(moduleKey);
      return {
        ...current,
        modulePermissions: hasModule
          ? current.modulePermissions.filter((item) => item !== moduleKey)
          : [...current.modulePermissions, moduleKey],
      };
    });
  };

  const handleSaveUser = async () => {
    const normalizedForm: UserFormState = {
      ...form,
      fullName: form.fullName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim().toLowerCase(),
      username: form.username.trim().toLowerCase(),
      site: form.site.trim() || activeSites[0] || createFallbackSiteName(currentTenant.name),
      licensePoints: String(Math.max(0, Math.min(30, Number(form.licensePoints) || 0))),
    };
    const fullDisplayName = `${normalizedForm.fullName} ${normalizedForm.lastName}`.trim();
    setForm(normalizedForm);

    const nextErrors = validateForm(normalizedForm);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      notifyError(
        "Formulario incompleto",
        "Completa la informacion personal, laboral y de acceso antes de confirmar."
      );
      return;
    }

    const confirmed = await confirmAction({
      title: editingId ? "Guardar colaborador" : "Confirmar nuevo colaborador",
      description:
        "El colaborador quedara visible en Accesos con su ficha laboral, credenciales base y contexto operativo.",
      confirmLabel: editingId ? "Guardar colaborador" : "Crear colaborador",
      accent: "teal",
      successTitle: editingId ? "Colaborador actualizado" : "Colaborador creado",
      successDescription: editingId
        ? "La ficha del colaborador ya fue actualizada."
        : "El nuevo usuario ya forma parte de la base operativa.",
      summary: [
        { label: "Documento", value: form.documentNumber },
        { label: "Colaborador", value: fullDisplayName },
        { label: "Sede / Area", value: `${normalizedForm.site} / ${normalizedForm.area}` },
        { label: "Rol / Acceso", value: `${normalizedForm.role} / ${customerAccessTierLabels[normalizedForm.accessTier]}` },
        { label: "Usuario", value: normalizedForm.username },
      ],
      action: async () => {
        if (!currentCompanyId) {
          throw new Error("No encontramos la empresa activa para registrar este colaborador.");
        }

        const payload = {
          name: normalizedForm.fullName,
          email: normalizedForm.email,
          username: normalizedForm.username,
          password: normalizedForm.password,
          role: mapAccessTierToPlatformRole(normalizedForm.accessTier),
          companyId: currentCompanyId,
          status: mapAccessStatusToPlatformStatus(normalizedForm.status),
          title: normalizedForm.role,
          profile: {
            documentNumber: normalizedForm.documentNumber,
            lastName: normalizedForm.lastName,
            birthDate: normalizedForm.birthDate,
            startDate: normalizedForm.startDate,
            address: normalizedForm.address,
            site: normalizedForm.site,
            area: normalizedForm.area,
            photoName: normalizedForm.photoName,
            phone: normalizedForm.phone,
            notes: normalizedForm.notes,
            basePassword: normalizedForm.password,
            modulePermissions: normalizedForm.modulePermissions,
            licenseNumber: normalizedForm.licenseNumber,
            licenseType: normalizedForm.licenseType,
            licenseExpiry: normalizedForm.licenseExpiry,
            licensePoints: Number(normalizedForm.licensePoints || 30),
          },
        } satisfies Omit<PlatformUser, "id">;

        let persistedId = editingId;

        if (editingId?.startsWith("company-user-") || editingId?.startsWith("platform-user-")) {
          await updateGlobalUser(editingId, payload);
        } else {
          const matchedUser = globalUsers.find(
            (user) =>
              user.companyId === currentCompanyId &&
              (
                user.email.toLowerCase() === payload.email ||
                (user.username ?? "").toLowerCase() === payload.username
              ),
          );

          if (matchedUser) {
            persistedId = matchedUser.id;
            await updateGlobalUser(matchedUser.id, payload);
          } else {
            persistedId = await createGlobalUser(payload);
          }
        }

        const nextUser: AccessUser = {
          id: persistedId || editingId || `acc-${Date.now()}`,
          ...normalizedForm,
        };

        setUsers((current) => {
          if (editingId) {
            return current.map((item) =>
              item.id === editingId ? nextUser : item,
            );
          }

          return [nextUser, ...current];
        });
      },
    });

    if (!confirmed) {
      return;
    }

    setIsModalOpen(false);
    setEditingId(null);
    setUsernameTouched(false);
    setPasswordTouched(false);
    setForm(createEmptyForm(activeSites[0] ?? ""));
  };

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Accesos"
        title="Usuarios"
        subtitle="Alta más compacta de colaboradores y credenciales, conectada al catálogo real de sedes."
        accent="teal"
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Usuarios" value={users.length.toString()} detail="Base total" tone="info" />
        <StatCard label="Activos" value={users.filter((user) => user.status === "Activo").length.toString()} detail="Operación diaria" tone="success" />
        <StatCard label="Pendientes" value={users.filter((user) => user.status === "Pendiente").length.toString()} detail="Falta completar alta" tone="warning" />
        <StatCard label="Bloqueados" value={users.filter((user) => user.status === "Bloqueado").length.toString()} detail="Acceso suspendido" tone="danger" />
      </section>

      {sites.filter((site) => site.status === "Activa").length === 0 ? (
        <SurfaceCard className="border-amber-200 bg-amber-50 px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-900">Sede base activa</p>
              <p className="mt-1 text-sm text-amber-800">
                Usaremos {activeSites[0]} para no detener el alta de colaboradores. Puedes personalizarla desde Gestión.
              </p>
            </div>
            <Link href="/gestion/sedes" className="inline-flex">
              <Button tone="neutral" variant="outline" className="px-3 py-2">
                Gestionar sedes
              </Button>
            </Link>
          </div>
        </SurfaceCard>
      ) : null}

      <TableCard
        title="Base de colaboradores"
        description="Toolbar a la izquierda, menos espacios muertos y acceso directo a la administración de sedes."
      >
        <DataExportToolbar
          title="Usuarios"
          columns={exportColumns}
          rows={exportRows}
          accent="teal"
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Buscar por documento, nombre, sede o cargo"
          leadingContent={
            <div className="flex flex-wrap items-center gap-2">
              <Button tone="teal" variant="solid" onClick={openModal} className="px-3 py-2" disabled={activeSites.length === 0}>
                Nuevo colaborador
              </Button>
              <Link href="/gestion/sedes" className="inline-flex">
                <Button tone="neutral" variant="outline" className="px-3 py-2">
                  Gestionar sedes
                </Button>
              </Link>
            </div>
          }
        />

        {filteredUsers.length === 0 ? (
          <EmptyState title="Sin usuarios" description="La base inicia limpia. Crea una sede activa y luego registra el primer colaborador." />
        ) : (
          <Table minWidth="min-w-[1040px]">
            <TableHead>
              <tr>
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Colaborador</th>
                <th className="px-4 py-3 font-semibold">Documento</th>
                <th className="px-4 py-3 font-semibold">Laboral</th>
                <th className="px-4 py-3 font-semibold">Acceso</th>
                <th className="px-4 py-3 font-semibold">Contacto</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                {canDeleteUsers ? <th className="px-4 py-3 font-semibold">Acciones</th> : null}
              </tr>
            </TableHead>
            <TableBody>
              {filteredUsers.map((user, index) => (
                <tr key={user.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3.5 font-semibold text-neutral-500">{index + 1}</td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-neutral-950">{`${user.fullName} ${user.lastName}`.trim()}</p>
                    <p className="mt-1 text-xs text-neutral-500">{user.address}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-neutral-950">{user.documentNumber}</p>
                    <p className="mt-1 text-xs text-neutral-500">Nace {user.birthDate}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-neutral-950">{user.site}</p>
                    <p className="mt-1 text-xs text-neutral-500">{user.area}</p>
                    <p className="mt-1 text-xs text-neutral-400">{user.role}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-neutral-950">{user.username}</p>
                    <p className="mt-1 text-xs text-neutral-500">{user.email}</p>
                    <p className="mt-1 text-xs text-neutral-400">{customerAccessTierLabels[user.accessTier]}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p>{user.phone}</p>
                    <p className="mt-1 text-xs text-neutral-500">{user.photoName || "Sin foto"}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusPill
                      label={user.status}
                      tone={
                        user.status === "Activo"
                          ? "success"
                          : user.status === "Pendiente"
                            ? "warning"
                            : "danger"
                      }
                    />
                  </td>
                  {canDeleteUsers ? (
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          tone="teal"
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => {
                            setEditingId(user.id);
                            setErrors({});
                            setUsernameTouched(true);
                            setPasswordTouched(true);
                            setForm({
                              documentNumber: user.documentNumber,
                              fullName: user.fullName,
                              lastName: user.lastName,
                              email: user.email,
                              birthDate: user.birthDate,
                              startDate: user.startDate,
                              address: user.address,
                              site: user.site,
                              area: user.area,
                              photoName: user.photoName,
                              username: user.username,
                              password: user.password,
                              role: user.role,
                              accessTier: user.accessTier,
                              phone: user.phone,
                              status: user.status,
                              notes: user.notes,
                              modulePermissions: user.modulePermissions,
                              licenseNumber: user.licenseNumber,
                              licenseType: user.licenseType,
                              licenseExpiry: user.licenseExpiry,
                              licensePoints: user.licensePoints,
                            });
                            setIsModalOpen(true);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          tone="danger"
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          onClick={async () => {
                            const confirmed = await confirmAction({
                              title: "Eliminar colaborador",
                              description:
                                "El colaborador se eliminara de esta empresa y dejara de estar disponible en Accesos.",
                              confirmLabel: "Eliminar colaborador",
                              accent: "rose",
                              successTitle: "Colaborador eliminado",
                              successDescription: "El registro ya no forma parte de la base operativa.",
                              summary: [
                                { label: "Colaborador", value: user.fullName },
                                { label: "Usuario", value: user.username },
                                { label: "Sede", value: user.site },
                              ],
                              action: async () => {
                                if (user.id.startsWith("company-user-") || user.id.startsWith("platform-user-")) {
                                  await deleteGlobalUser(user.id);
                                }
                                setUsers((current) => current.filter((item) => item.id !== user.id));
                              },
                            });

                            if (!confirmed) {
                              return;
                            }
                          }}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>

      {isModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/45 px-4 py-5 backdrop-blur-sm">
          <SurfaceCard className="max-h-[88vh] w-full max-w-4xl overflow-y-auto border-neutral-200">
            <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
              <div>
                <h2 className="text-xl font-bold text-neutral-950">
                  {editingId ? "Editar colaborador" : "Crear nuevo colaborador"}
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Ventana mas corta, solo con campos operativos realmente utiles.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/gestion/sedes" className="hidden sm:inline-flex">
                  <Button tone="neutral" variant="outline" className="px-3 py-2">
                    Gestionar sedes
                  </Button>
                </Link>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-50"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <form
              className="space-y-4 px-5 py-5"
              onSubmit={async (event) => {
                event.preventDefault();
                await handleSaveUser();
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <InputField label="Documento de identidad (Cédula / DNI)" value={form.documentNumber} onChange={(value) => updateForm("documentNumber", value)} accent="teal" error={errors.documentNumber} placeholder="Número de documento" />
                <InputField label="Nombres Completos" value={form.fullName} onChange={(value) => updateForm("fullName", value)} accent="teal" error={errors.fullName} placeholder="Nombres completos" />
                <InputField label="Apellidos Completos" value={form.lastName} onChange={(value) => updateForm("lastName", value)} accent="teal" error={errors.lastName} placeholder="Apellidos completos" />
                <InputField label="Correo corporativo" type="text" value={form.email} onChange={(value) => updateForm("email", value.trim())} accent="teal" error={errors.email} placeholder="correo@empresa.com" />
                <InputField label="Nro. contacto" type="tel" value={form.phone} onChange={(value) => updateForm("phone", value)} accent="teal" error={errors.phone} placeholder="Teléfono o celular" />
                <InputField label="Fecha Nacimiento" type="date" value={form.birthDate} onChange={(value) => updateForm("birthDate", value)} accent="teal" error={errors.birthDate} />
                <InputField label="Fecha Ingreso" type="date" value={form.startDate} onChange={(value) => updateForm("startDate", value)} accent="teal" error={errors.startDate} />
                <InputField label="Dirección domicilio" value={form.address} onChange={(value) => updateForm("address", value)} accent="teal" error={errors.address} placeholder="Dirección domicilio" className="md:col-span-2" />
                <SelectField label="Sede" value={form.site} onChange={(value) => updateForm("site", value)} accent="teal" error={errors.site} hint="Catálogo tomado desde Gestión / Sedes." options={siteOptions.map((site) => ({ value: site, label: site }))} />
                <InputField label="Área / Cargo" value={form.area} onChange={(value) => updateForm("area", value)} accent="teal" error={errors.area} placeholder="Ej. Coordinación técnica o administración" />
                <SelectField label="Rol del colaborador" value={form.role} onChange={(value) => updateForm("role", value)} accent="teal" error={errors.role} hint="Catálogo alineado a cargos reales de nuestros clientes." options={customerRoleOptions} />
                <ReadonlyField label="Nivel de acceso" value={customerAccessTierLabels[form.accessTier]} hint="Se asigna automáticamente según el rol elegido." />
                <SelectField label="Estado de acceso" value={form.status} onChange={(value) => updateForm("status", value as AccessUserStatus)} accent="teal" options={[{ value: "Activo", label: "Activo" }, { value: "Pendiente", label: "Pendiente" }, { value: "Bloqueado", label: "Bloqueado" }]} />
                <InputField label="Usuario" value={form.username} onChange={(value) => updateForm("username", value.trim().toLowerCase())} accent="teal" placeholder="usuario de acceso" />
                <InputField label="Contraseña base" value={form.password} onChange={(value) => updateForm("password", value)} accent="teal" placeholder="Contraseña temporal" />
                {form.accessTier === "conductor" ? (
                  <div className="md:col-span-2 rounded-lg border border-cyan-200 bg-cyan-50/70 p-4">
                    <p className="text-sm font-semibold text-cyan-950">Datos de licencia del conductor</p>
                    <p className="mt-1 text-xs text-cyan-800">
                      Estos campos solo aparecen para el rol Conductor y quedan vinculados al mismo usuario de acceso.
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <InputField label="# de licencia" value={form.licenseNumber} onChange={(value) => updateForm("licenseNumber", value)} accent="teal" error={errors.licenseNumber} placeholder="Número de licencia" />
                      <InputField label="Tipo de licencia" value={form.licenseType} onChange={(value) => updateForm("licenseType", value)} accent="teal" error={errors.licenseType} placeholder="Ej. Tipo C" />
                      <InputField label="Vigencia de licencia" type="date" value={form.licenseExpiry} onChange={(value) => updateForm("licenseExpiry", value)} accent="teal" error={errors.licenseExpiry} />
                      <InputField label="Puntos en licencia" type="number" min="0" max="30" step="1" value={form.licensePoints} onChange={(value) => updateForm("licensePoints", value)} accent="teal" error={errors.licensePoints} hint="Inicia en 30 y puedes subir o bajar con las flechas del campo." />
                    </div>
                  </div>
                ) : null}
                <ImageGalleryField
                  label="Fotografía"
                  values={form.photoName ? [form.photoName] : []}
                  onChange={(urls) => updateForm("photoName", urls[0] ?? "")}
                  uploadEndpoint="user-photos"
                  companyId={currentCompanyId ?? undefined}
                  maxFiles={1}
                  accept="image/*"
                  accent="teal"
                  hint="Foto de perfil del colaborador. Máx. 1 imagen."
                  className="md:col-span-2"
                />
                <TextareaField label="Observaciones" value={form.notes} onChange={(value) => updateForm("notes", value)} accent="teal" rows={3} placeholder="Notas relevantes para el acceso o la operación del colaborador." className="md:col-span-2" />
              </div>

              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">Permisos por módulo</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Activa solo los módulos que este colaborador podrá ver en su panel.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, modulePermissions: roleDefaultModules[current.accessTier] }))}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                  >
                    Restaurar plantilla
                  </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {modulePermissionOptions.map((module) => (
                    <label
                      key={module.key}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${form.modulePermissions.includes(module.key) ? "border-teal-300 bg-teal-50 text-teal-900" : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-white"}`}
                    >
                      <input
                        type="checkbox"
                        checked={form.modulePermissions.includes(module.key)}
                        onChange={() => toggleModulePermission(module.key)}
                        className="h-4 w-4 accent-teal-600"
                      />
                      <span className="font-medium">{module.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm">
                <p className="font-semibold text-teal-900">{form.role}</p>
                <p className="mt-1 text-teal-800">{getCustomerRoleTemplate(form.role).summary}</p>
                <p className="mt-2 text-xs text-teal-700">
                  Modulos foco: {getCustomerRoleTemplate(form.role).focusModules.join(", ")}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
                <Button type="button" tone="neutral" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" tone="teal" variant="solid" disabled={activeSites.length === 0}>
                  {editingId ? "Guardar cambios" : "Confirmar"}
                </Button>
              </div>
            </form>
          </SurfaceCard>
        </div>
      ) : null}
    </div>
  );
}
