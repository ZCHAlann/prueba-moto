"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  defaultFaqs,
  defaultFlyers,
  defaultMarketingContent,
  defaultPublicSettings,
  defaultTestimonials,
} from "@/lib/public-content-defaults";
import type {
  AccountProfile,
  BillingRecord,
  MarketingContent,
  MarketingFaq,
  MarketingFlyer,
  MarketingTestimonial,
  PlatformCompany,
  PlatformLog,
  PlatformModule,
  PlatformModuleKey,
  PlatformPlan,
  PlatformSystemSettings,
  PlatformUser,
  PublicContentSnapshot,
  SalesLead,
} from "@/types/platform";

const STORAGE_KEY = "aplismart-platform-state-v7-production-refresh";

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowStamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

type PlatformState = {
  marketingContent: MarketingContent;
  faqs: MarketingFaq[];
  testimonials: MarketingTestimonial[];
  flyers: MarketingFlyer[];
  modules: PlatformModule[];
  plans: PlatformPlan[];
  companies: PlatformCompany[];
  leads: SalesLead[];
  billing: BillingRecord[];
  globalUsers: PlatformUser[];
  logs: PlatformLog[];
  profile: AccountProfile;
  settings: PlatformSystemSettings;
};

type CompanyMasterUserInput = {
  name: string;
  email: string;
  username: string;
  password: string;
  title: string;
};

type CompanyMutationInput = Omit<PlatformCompany, "id"> & {
  masterUser: CompanyMasterUserInput;
};

type PlatformContextValue = PlatformState & {
  ready: boolean;
  submitDemoRequest: (input: Omit<SalesLead, "id" | "status" | "createdAt" | "assignedTo" | "source"> & { source?: string }) => string;
  createLead: (input: Omit<SalesLead, "id" | "createdAt">) => string;
  updateLead: (id: string, input: Omit<SalesLead, "id" | "createdAt">) => void;
  createCompany: (input: CompanyMutationInput) => Promise<string>;
  updateCompany: (id: string, input: CompanyMutationInput) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
  toggleCompanyStatus: (id: string) => Promise<void>;
  updateCompanyModules: (id: string, modules: PlatformModuleKey[]) => Promise<void>;
  createPlan: (input: Omit<PlatformPlan, "id">) => string;
  updatePlan: (id: PlatformPlan["id"], input: PlatformPlan) => void;
  createGlobalUser: (input: Omit<PlatformUser, "id">) => Promise<string>;
  updateGlobalUser: (id: string, input: Omit<PlatformUser, "id">) => Promise<void>;
  deleteGlobalUser: (id: string) => Promise<void>;
  updateBillingRecord: (id: string, input: Omit<BillingRecord, "id">) => void;
  updateMarketingContent: (input: Partial<MarketingContent>) => void;
  updateFaq: (id: string, input: Omit<MarketingFaq, "id">) => void;
  updateTestimonial: (id: string, input: Omit<MarketingTestimonial, "id">) => void;
  savePublicContent: (input: PublicContentSnapshot) => Promise<void>;
  updateProfile: (input: AccountProfile) => void;
  updateSystemSettings: (input: PlatformSystemSettings) => void;
};

const initialState: PlatformState = {
  marketingContent: defaultMarketingContent,
  faqs: defaultFaqs,
  testimonials: defaultTestimonials,
  flyers: defaultFlyers,
  modules: [
    { key: "dashboard", name: "Dashboard ejecutivo", description: "KPIs, salud operativa y resumen de plataforma.", category: "Core" },
    { key: "flotas", name: "Flotas", description: "Control de vehiculos operativos y disponibilidad.", category: "Operacion" },
    { key: "motores", name: "Motores", description: "Gestion tecnica de motores y componentes criticos.", category: "Operacion" },
    { key: "generadores", name: "Generadores electricos", description: "Seguimiento de plantas y equipos de respaldo.", category: "Operacion" },
    { key: "conductores", name: "Conductores", description: "Personal, licencias y trazabilidad operativa.", category: "Operacion" },
    { key: "asignaciones", name: "Asignaciones", description: "Relacion entre activos y responsables con soporte documental.", category: "Operacion" },
    { key: "seguros", name: "Seguros", description: "Polizas, vencimientos y control documental.", category: "Cumplimiento" },
    { key: "tipos_aceite", name: "Tipos de aceite", description: "Catalogo tecnico de lubricantes y aplicacion.", category: "Taller" },
    { key: "mantenimiento", name: "Mantenimiento", description: "Preventivo, correctivo, inventario y ordenes.", category: "Taller" },
    { key: "checklist", name: "Checklist", description: "Inspecciones preoperacionales y evidencia.", category: "Seguridad" },
    { key: "alertas", name: "Alertas", description: "Vencimientos, criticidades y seguimiento.", category: "Seguridad" },
    { key: "reportes", name: "Reportes", description: "Salidas ejecutivas, operativas y exportacion.", category: "BI" },
    { key: "combustible", name: "Combustible", description: "Consumo, costo y rendimiento por activo.", category: "BI" },
    { key: "geolocalizacion", name: "Geolocalizacion", description: "Visibilidad de unidades y ubicacion operativa.", category: "BI" },
    { key: "configuracion", name: "Configuracion", description: "Branding, preferencias y control por empresa.", category: "Core" },
  ],
  plans: [
    {
      id: "starter",
      name: "Inicial",
      monthlyPrice: "USD 49",
      annualPrice: "USD 490",
      description: "Para empresas que empiezan a ordenar vehiculos, responsables y mantenimientos basicos.",
      checkoutUrl: "",
      modules: ["dashboard", "flotas", "conductores", "asignaciones", "mantenimiento", "checklist", "reportes", "configuracion"],
      limits: { users: "5 usuarios", assets: "20 activos", sites: "1 sede" },
    },
    {
      id: "basic",
      name: "Basico",
      monthlyPrice: "USD 79",
      annualPrice: "USD 790",
      description: "Para empresas que necesitan control base de flota, mantenimiento y reportes sin friccion.",
      checkoutUrl: "",
      modules: ["dashboard", "flotas", "conductores", "asignaciones", "mantenimiento", "checklist", "alertas", "reportes", "configuracion"],
      limits: { users: "10 usuarios", assets: "40 activos", sites: "2 sedes" },
    },
    {
      id: "pro",
      name: "Pro",
      monthlyPrice: "USD 159",
      annualPrice: "USD 1,590",
      description: "Para operaciones con mayor trazabilidad tecnica, control de combustible y gestion de varias areas.",
      checkoutUrl: "",
      modules: ["dashboard", "flotas", "motores", "generadores", "conductores", "asignaciones", "seguros", "tipos_aceite", "mantenimiento", "checklist", "alertas", "reportes", "combustible", "configuracion"],
      limits: { users: "30 usuarios", assets: "150 activos", sites: "8 sedes" },
    },
    {
      id: "enterprise",
      name: "Enterprise",
      monthlyPrice: "A medida",
      annualPrice: "A medida",
      description: "Para grupos empresariales que requieren varias sedes, visibilidad ejecutiva y administracion master.",
      checkoutUrl: "",
      modules: ["dashboard", "flotas", "motores", "generadores", "conductores", "asignaciones", "seguros", "tipos_aceite", "mantenimiento", "checklist", "alertas", "reportes", "combustible", "geolocalizacion", "configuracion"],
      limits: { users: "Ilimitados", assets: "Ilimitados", sites: "Ilimitadas" },
    },
  ],
  companies: [],
  leads: [],
  billing: [],
  globalUsers: [
    {
      id: "usr-master",
      name: "Superadmin ApliSmart",
      email: "aplicrm@gmail.com",
      username: "master",
      password: "098765",
      role: "superadmin",
      companyId: null,
      status: "Activo",
      title: "Administrador master",
    },
  ],
  logs: [],
  profile: {
    name: "Superadmin ApliSmart",
    title: "Administrador master",
    email: "aplicrm@gmail.com",
    phone: "0991112233",
    company: "ApliSmart Motors",
    avatar: "SA",
    language: "Espanol",
    timezone: "America/Guayaquil",
    platformRole: "superadmin",
    operationalRole: "admin",
    notifications: { email: true, system: true, billing: true },
    passwordHint: "Ultima rotacion: hace 21 dias",
  },
  settings: {
    ...defaultPublicSettings,
    adminAccessLabel: "Acceso master",
    adminAccessEmail: "aplicrm@gmail.com",
    adminAccessPassword: "098765",
    mapsProvider: "Google Maps",
    mapsApiKey: "",
    mapsFallbackEnabled: true,
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPassword: "",
    smtpSecure: true,
    smtpFromName: "ApliSmart Motors",
    smtpFromEmail: "ventas@aplismartmotors.app",
    smtpReplyTo: "ventas@aplismartmotors.app",
    smtpAutoReplyEnabled: false,
    smtpAutoReplySubject: "Hemos recibido tu solicitud en ApliSmart Motors",
    smtpAutoReplyMessage:
      "Gracias por tu interes en ApliSmart Motors. Hemos recibido tu solicitud y nuestro equipo se comunicara contigo pronto para coordinar una demo o ampliar la informacion.",
    paymentNotificationEmail: "cobros@aplismartmotors.app",
    paymentCurrency: "USD",
    paymentTaxRate: "15",
    paymentTrialDays: "7",
    paymentInvoicePrefix: "APL",
    paymentCheckoutEnabled: true,
    paymentManualApproval: true,
    paymentSuccessUrl: "https://motors.aplismart.com/master/clientes",
    paymentCancelUrl: "https://motors.aplismart.com/solicitar-demo",
    paymentSuccessMessage: "Pago recibido correctamente. Nuestro equipo revisara la activacion de tu cuenta.",
    paymentFailureMessage: "No pudimos confirmar el pago. Intenta nuevamente o solicita apoyo comercial.",
    paymentInstructions:
      "Puedes cobrar en linea con Stripe, PayPal o PayPhone, y mantener transferencia bancaria como respaldo para cierres comerciales asistidos.",
    paymentGateways: {
      stripeEnabled: false,
      stripeMode: "sandbox",
      stripePublicKey: "",
      stripeSecretKey: "",
      stripeWebhookSecret: "",
      paypalEnabled: false,
      paypalMode: "sandbox",
      paypalClientId: "",
      paypalSecret: "",
      payphoneEnabled: false,
      payphoneStoreId: "",
      payphoneToken: "",
      bankTransferEnabled: true,
      bankName: "Banco principal",
      bankAccountName: "ApliSmart Motors",
      bankAccountNumber: "",
      bankInstructions: "Comparte el comprobante para validar activacion, plan y fecha de corte.",
    },
  },
};

const PlatformContext = createContext<PlatformContextValue | null>(null);

function mergeById<T extends { id: string }>(baseItems: T[], savedItems: T[] | undefined) {
  const saved = savedItems ?? [];
  const savedById = new Map(saved.map((item) => [item.id, item]));
  const baseIds = new Set(baseItems.map((item) => item.id));

  return [
    ...baseItems.map((item) => savedById.get(item.id) ?? item),
    ...saved.filter((item) => !baseIds.has(item.id)),
  ];
}

function mergeModules(baseItems: PlatformModule[], savedItems: PlatformModule[] | undefined) {
  const saved = savedItems ?? [];
  const savedByKey = new Map(saved.map((item) => [item.key, item]));
  const baseKeys = new Set(baseItems.map((item) => item.key));

  return [
    ...baseItems.map((item) => savedByKey.get(item.key) ?? item),
    ...saved.filter((item) => !baseKeys.has(item.key)),
  ];
}

function applyPublicContentSnapshot(current: PlatformState, snapshot: PublicContentSnapshot): PlatformState {
  return {
    ...current,
    marketingContent: snapshot.marketingContent,
    faqs: snapshot.faqs,
    testimonials: snapshot.testimonials,
    flyers: snapshot.flyers,
    settings: {
      ...current.settings,
      ...snapshot.settings,
    },
  };
}

function mergeRemotePlatformState(
  current: PlatformState,
  snapshot: Pick<PlatformState, "companies" | "globalUsers">
): PlatformState {
  return {
    ...current,
    companies: snapshot.companies,
    globalUsers: snapshot.globalUsers.map((user) => ({
      ...user,
      password: undefined,
    })),
  };
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message || fallback;
  } catch {
    return fallback;
  }
}

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlatformState>(initialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        let nextState = initialState;
        const raw = window.localStorage.getItem(STORAGE_KEY);

        if (raw) {
          const parsed = JSON.parse(raw) as PlatformState;
          nextState = {
            ...initialState,
            ...parsed,
            modules: mergeModules(initialState.modules, parsed.modules),
            plans: mergeById(initialState.plans, parsed.plans).map((plan) => ({
              ...plan,
              checkoutUrl: plan.checkoutUrl ?? "",
            })),
            globalUsers: parsed.globalUsers?.length ? parsed.globalUsers : initialState.globalUsers,
            profile: parsed.profile ?? initialState.profile,
            settings: {
              ...initialState.settings,
              ...parsed.settings,
              paymentGateways: {
                ...initialState.settings.paymentGateways,
                ...parsed.settings?.paymentGateways,
              },
            },
          };
        }

        try {
          const response = await fetch("/api/public/content", { cache: "no-store", credentials: "include" });
          if (response.ok) {
            const snapshot = (await response.json()) as PublicContentSnapshot;
            nextState = applyPublicContentSnapshot(nextState, snapshot);
          }
        } catch {
          // Mantiene fallback local para uso sin conectividad o durante build preview.
        }

        try {
          const response = await fetch("/api/master/platform-state", { cache: "no-store", credentials: "include" });
          if (response.ok) {
            const snapshot = (await response.json()) as Pick<PlatformState, "companies" | "globalUsers">;
            nextState = mergeRemotePlatformState(nextState, snapshot);
          }
        } catch {
          // Mantiene fallback local si el panel master aun no tiene sesion o backend disponible.
        }

        if (mounted) {
          setState(nextState);
        }
      } finally {
        if (mounted) {
          setReady(true);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const syncFromStorage = () => {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }

      try {
        const parsed = JSON.parse(raw) as PlatformState;
        setState((current) => ({
          ...current,
          ...parsed,
          modules: mergeModules(initialState.modules, parsed.modules),
          plans: mergeById(initialState.plans, parsed.plans),
          settings: {
            ...current.settings,
            ...parsed.settings,
            paymentGateways: {
              ...current.settings.paymentGateways,
              ...parsed.settings?.paymentGateways,
            },
          },
        }));
      } catch {
        // Ignora snapshots corruptos; el estado en memoria sigue vigente.
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        syncFromStorage();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("aplismart-public-content-updated", syncFromStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("aplismart-public-content-updated", syncFromStorage);
    };
  }, [ready]);

  const pushLog = useCallback((actor: string, action: string, entity: string, detail: string, severity: PlatformLog["severity"] = "info") => {
    setState((current) => ({
      ...current,
      logs: [
        { id: createId("log"), at: nowStamp(), actor, action, entity, detail, severity },
        ...current.logs,
      ],
    }));
  }, []);

  const submitDemoRequest = useCallback<PlatformContextValue["submitDemoRequest"]>((input) => {
    const id = createId("lead");
    const nextLead: SalesLead = {
      id,
      name: input.name,
      company: input.company,
      email: input.email,
      phone: input.phone,
      industry: input.industry,
      source: input.source ?? "Landing",
      status: "nuevo",
      notes: input.notes,
      createdAt: nowStamp(),
      assignedTo: "Equipo comercial",
    };
    setState((current) => ({ ...current, leads: [nextLead, ...current.leads] }));
    pushLog("Landing publica", "lead", "crm", `Nueva solicitud de demo para ${input.company}.`, "warning");
    if (state.settings.smtpAutoReplyEnabled && state.settings.smtpHost && state.settings.smtpFromEmail) {
      pushLog(
        "Sistema comercial",
        "smtp",
        "autorespuesta",
        `Configuracion SMTP lista para responder automaticamente a ${input.email}.`,
        "info"
      );
    }
    return id;
  }, [pushLog, state.settings.smtpAutoReplyEnabled, state.settings.smtpFromEmail, state.settings.smtpHost]);

  const createLead = useCallback<PlatformContextValue["createLead"]>((input) => {
    const id = createId("lead");
    setState((current) => ({
      ...current,
      leads: [{ ...input, id, createdAt: nowStamp() }, ...current.leads],
    }));
    pushLog("Equipo comercial", "create", "crm", `Lead ${input.company} creado.`, "info");
    return id;
  }, [pushLog]);

  const updateLead = useCallback<PlatformContextValue["updateLead"]>((id, input) => {
    setState((current) => ({
      ...current,
      leads: current.leads.map((lead) => (lead.id === id ? { ...lead, ...input } : lead)),
    }));
    pushLog("Equipo comercial", "update", "crm", `Lead ${input.company} actualizado a ${input.status}.`, input.status === "perdido" ? "warning" : "info");
  }, [pushLog]);

  const createCompany = useCallback<PlatformContextValue["createCompany"]>(async (input) => {
    const response = await fetch("/api/master/companies", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "No pudimos crear la empresa en la base real."),
      );
    }

    const snapshot = (await response.json()) as Pick<PlatformState, "companies" | "globalUsers">;
    setState((current) => mergeRemotePlatformState(current, snapshot));
    pushLog("Administracion master", "create", "empresa", `Empresa ${input.name} creada con plan ${input.planId}.`, "info");
    pushLog("Administracion master", "create", "usuarios", `Usuario master ${input.masterUser.email} creado para ${input.name}.`, "warning");
    return snapshot.companies[0]?.id ?? "";
  }, [pushLog]);

  const updateCompany = useCallback<PlatformContextValue["updateCompany"]>(async (id, input) => {
    const response = await fetch(`/api/master/companies/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "No pudimos actualizar la empresa en la base real."),
      );
    }

    const snapshot = (await response.json()) as Pick<PlatformState, "companies" | "globalUsers">;
    setState((current) => mergeRemotePlatformState(current, snapshot));
    pushLog("Administracion master", "update", "empresa", `Empresa ${input.name} actualizada.`, "info");
    pushLog("Administracion master", "update", "usuarios", `Usuario master de ${input.name} actualizado.`, "info");
  }, [pushLog]);

  const deleteCompany = useCallback<PlatformContextValue["deleteCompany"]>(async (id) => {
    const company = state.companies.find((item) => item.id === id);
    const response = await fetch(`/api/master/companies/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "No pudimos eliminar la empresa en la base real."),
      );
    }

    const snapshot = (await response.json()) as Pick<PlatformState, "companies" | "globalUsers">;
    setState((current) => ({
      ...mergeRemotePlatformState(current, snapshot),
      billing: current.billing.filter((item) => item.companyId !== id),
    }));
    if (company) {
      pushLog("Administracion master", "delete", "empresa", `Empresa ${company.name} eliminada.`, "critical");
      pushLog("Administracion master", "delete", "usuarios", `Usuarios asociados a ${company.name} eliminados.`, "critical");
    }
  }, [pushLog, state.companies]);

  const toggleCompanyStatus = useCallback<PlatformContextValue["toggleCompanyStatus"]>(async (id) => {
    const company = state.companies.find((item) => item.id === id);
    if (!company) {
      throw new Error("No encontramos la empresa seleccionada.");
    }
    const companyUser =
      state.globalUsers.find((user) => user.companyId === id && user.createdFromCompany) ??
      state.globalUsers.find(
        (user) =>
          user.companyId === id &&
          (user.role === "owner_empresa" || user.role === "admin_empresa"),
      );

    await updateCompany(id, {
      ...company,
      status: company.status === "Activa" ? "Inactiva" : "Activa",
      masterUser: {
        name: companyUser?.name ?? company.primaryContact,
        email: companyUser?.email ?? company.email,
        username: companyUser?.username ?? company.slug.replace(/-/g, ""),
        password: "",
        title: companyUser?.title ?? "Administrador master de empresa",
      },
    });
    pushLog("Administracion master", "toggle", "empresa", `Empresa ${company.name} cambio de estado.`, "warning");
  }, [pushLog, state.companies, state.globalUsers, updateCompany]);

  const updateCompanyModules = useCallback<PlatformContextValue["updateCompanyModules"]>(async (id, modules) => {
    const company = state.companies.find((item) => item.id === id);
    if (!company) {
      throw new Error("No encontramos la empresa seleccionada.");
    }
    const companyUser =
      state.globalUsers.find((user) => user.companyId === id && user.createdFromCompany) ??
      state.globalUsers.find(
        (user) =>
          user.companyId === id &&
          (user.role === "owner_empresa" || user.role === "admin_empresa"),
      );

    await updateCompany(id, {
      ...company,
      enabledModules: modules,
      masterUser: {
        name: companyUser?.name ?? company.primaryContact,
        email: companyUser?.email ?? company.email,
        username: companyUser?.username ?? company.slug.replace(/-/g, ""),
        password: "",
        title: companyUser?.title ?? "Administrador master de empresa",
      },
    });
    pushLog("Administracion master", "update", "modules", `Modulos ajustados para ${company.name}.`, "info");
  }, [pushLog, state.companies, state.globalUsers, updateCompany]);

  const createPlan = useCallback<PlatformContextValue["createPlan"]>((input) => {
    const id = createId("plan");
    setState((current) => ({
      ...current,
      plans: [{ ...input, id }, ...current.plans],
    }));
    pushLog("Administracion master", "create", "planes", `Plan ${input.name} creado.`, "info");
    return id;
  }, [pushLog]);

  const updatePlan = useCallback<PlatformContextValue["updatePlan"]>((id, input) => {
    setState((current) => ({
      ...current,
      plans: current.plans.map((plan) => (plan.id === id ? input : plan)),
    }));
    pushLog("Administracion master", "update", "planes", `Plan ${input.name} actualizado.`, "info");
  }, [pushLog]);

  const createGlobalUser = useCallback<PlatformContextValue["createGlobalUser"]>(async (input) => {
    const response = await fetch("/api/master/users", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "No pudimos crear el usuario en la base real."),
      );
    }

    const snapshot = (await response.json()) as Pick<PlatformState, "companies" | "globalUsers">;
    setState((current) => mergeRemotePlatformState(current, snapshot));
    pushLog("Administracion master", "create", "usuarios", `Usuario global ${input.name} creado.`, "info");
    const createdUsername = input.username?.trim().toLowerCase() ?? "";
    const createdUser = snapshot.globalUsers.find(
      (user) =>
        user.email.trim().toLowerCase() === input.email.trim().toLowerCase() ||
        (createdUsername.length > 0 && (user.username ?? "").trim().toLowerCase() === createdUsername),
    );
    return createdUser?.id ?? "";
  }, [pushLog]);

  const updateGlobalUser = useCallback<PlatformContextValue["updateGlobalUser"]>(async (id, input) => {
    const response = await fetch(`/api/master/users/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "No pudimos actualizar el usuario en la base real."),
      );
    }

    const snapshot = (await response.json()) as Pick<PlatformState, "companies" | "globalUsers">;
    setState((current) => mergeRemotePlatformState(current, snapshot));
    pushLog("Administracion master", "update", "usuarios", `Usuario global ${input.name} actualizado.`, "info");
  }, [pushLog]);

  const deleteGlobalUser = useCallback<PlatformContextValue["deleteGlobalUser"]>(async (id) => {
    const user = state.globalUsers.find((item) => item.id === id);
    const response = await fetch(`/api/master/users/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "No pudimos eliminar el usuario en la base real."),
      );
    }

    const snapshot = (await response.json()) as Pick<PlatformState, "companies" | "globalUsers">;
    setState((current) => mergeRemotePlatformState(current, snapshot));
    if (user) {
      pushLog("Administracion master", "delete", "usuarios", `Usuario global ${user.name} eliminado.`, "critical");
    }
  }, [pushLog, state.globalUsers]);

  const updateBillingRecord = useCallback<PlatformContextValue["updateBillingRecord"]>((id, input) => {
    setState((current) => ({
      ...current,
      billing: current.billing.map((record) => (record.id === id ? { ...input, id } : record)),
    }));
    pushLog("Administracion master", "billing", "facturacion", `Facturacion de ${input.companyId} actualizada a ${input.paymentStatus}.`, input.paymentStatus === "Vencido" ? "critical" : "info");
  }, [pushLog]);

  const updateMarketingContent = useCallback<PlatformContextValue["updateMarketingContent"]>((input) => {
    setState((current) => ({ ...current, marketingContent: { ...current.marketingContent, ...input } }));
    pushLog("Administracion master", "update", "marketing", "Contenido comercial actualizado.", "info");
  }, [pushLog]);

  const updateFaq = useCallback<PlatformContextValue["updateFaq"]>((id, input) => {
    setState((current) => ({
      ...current,
      faqs: current.faqs.map((faq) => (faq.id === id ? { ...input, id } : faq)),
    }));
    pushLog("Administracion master", "update", "faq", `FAQ ${id} actualizada.`, "info");
  }, [pushLog]);

  const updateTestimonial = useCallback<PlatformContextValue["updateTestimonial"]>((id, input) => {
    setState((current) => ({
      ...current,
      testimonials: current.testimonials.map((testimonial) =>
        testimonial.id === id ? { ...input, id } : testimonial
      ),
    }));
    pushLog("Administracion master", "update", "testimonials", `Testimonio ${id} actualizado.`, "info");
  }, [pushLog]);

  const savePublicContent = useCallback<PlatformContextValue["savePublicContent"]>(async (input) => {
    const response = await fetch("/api/master/content", {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error("No pudimos publicar el contenido comercial.");
    }

    const snapshot = (await response.json()) as PublicContentSnapshot;
    setState((current) => {
      const nextState = applyPublicContentSnapshot(current, snapshot);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      window.dispatchEvent(new CustomEvent("aplismart-public-content-updated"));
      return nextState;
    });
    pushLog("Administracion master", "publish", "marketing", "Contenido publico y flyers publicados.", "warning");
  }, [pushLog]);

  const updateProfile = useCallback<PlatformContextValue["updateProfile"]>((input) => {
    setState((current) => ({ ...current, profile: input }));
    pushLog(input.name, "update", "perfil", "Perfil de usuario actualizado.", "info");
  }, [pushLog]);

  const updateSystemSettings = useCallback<PlatformContextValue["updateSystemSettings"]>((input) => {
    setState((current) => ({ ...current, settings: input }));
    pushLog("Administracion master", "update", "configuracion", "Ajustes globales del sistema actualizados.", "warning");
  }, [pushLog]);

  const value = useMemo<PlatformContextValue>(() => ({
    ready,
    ...state,
    submitDemoRequest,
    createLead,
    updateLead,
    createCompany,
    updateCompany,
    deleteCompany,
    toggleCompanyStatus,
    updateCompanyModules,
    createPlan,
    updatePlan,
    createGlobalUser,
    updateGlobalUser,
    deleteGlobalUser,
    updateBillingRecord,
    updateMarketingContent,
    updateFaq,
    updateTestimonial,
    savePublicContent,
    updateProfile,
    updateSystemSettings,
  }), [
    ready,
    state,
    submitDemoRequest,
    createLead,
    updateLead,
    createCompany,
    updateCompany,
    deleteCompany,
    toggleCompanyStatus,
    updateCompanyModules,
    createPlan,
    updatePlan,
    createGlobalUser,
    updateGlobalUser,
    deleteGlobalUser,
    updateBillingRecord,
    updateMarketingContent,
    updateFaq,
    updateTestimonial,
    savePublicContent,
    updateProfile,
    updateSystemSettings,
  ]);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform() {
  const context = useContext(PlatformContext);
  if (!context) {
    throw new Error("usePlatform must be used within PlatformProvider");
  }
  return context;
}


