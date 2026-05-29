export type PlatformRole =
  | "superadmin"
  | "admin_saas"
  | "comercial"
  | "soporte"
  | "owner_empresa"
  | "admin_empresa"
  | "conductor"
  | "operador"
  | "supervisor";

export type PlatformUserStatus = "Activo" | "Invitado" | "Suspendido";
export type CompanyPlanId = string;
export type CompanyStatus = "Activa" | "Prospecto" | "Inactiva";
export type LeadStatus =
  | "nuevo"
  | "contactado"
  | "demo agendada"
  | "propuesta enviada"
  | "ganado"
  | "perdido";
export type BillingStatus = "Al dia" | "Pendiente" | "Vencido";
export type ModuleStatus = "Habilitado" | "Deshabilitado";

export type PlatformModuleKey =
  | "dashboard"
  | "flotas"
  | "motores"
  | "generadores"
  | "aires_acondicionados"
  | "conductores"
  | "asignaciones"
  | "seguros"
  | "tipos_aceite"
  | "mantenimiento"
  | "checklist"
  | "alertas"
  | "reportes"
  | "combustible"
  | "geolocalizacion"
  | "accesos"
  | "configuracion";

export type PlatformModule = {
  key: PlatformModuleKey;
  name: string;
  description: string;
  category: string;
};

export type PlatformPlan = {
  id: CompanyPlanId;
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  description: string;
  checkoutUrl: string;
  modules: PlatformModuleKey[];
  limits: {
    users: string;
    assets: string;
    sites: string;
  };
};

export type PaymentGatewaySettings = {
  stripeEnabled: boolean;
  stripeMode: "sandbox" | "produccion";
  stripePublicKey: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  paypalEnabled: boolean;
  paypalMode: "sandbox" | "produccion";
  paypalClientId: string;
  paypalSecret: string;
  payphoneEnabled: boolean;
  payphoneStoreId: string;
  payphoneToken: string;
  bankTransferEnabled: boolean;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankInstructions: string;
};

export type PlatformCompany = {
  id: string;
  name: string;
  slug: string;
  planId: CompanyPlanId;
  status: CompanyStatus;
  primaryContact: string;
  email: string;
  phone: string;
  startDate: string;
  enabledModules: PlatformModuleKey[];
  industry: string;
  executive: string;
  notes: string;
};

export type PlatformUser = {
  id: string;
  name: string;
  email: string;
  username?: string;
  password?: string;
  role: PlatformRole;
  companyId: string | null;
  status: PlatformUserStatus;
  title: string;
  createdFromCompany?: boolean;
  profile?: {
    documentNumber?: string;
    lastName?: string;
    birthDate?: string;
    startDate?: string;
    address?: string;
    site?: string;
    area?: string;
    photoName?: string;
    phone?: string;
    notes?: string;
    basePassword?: string;
    modulePermissions?: PlatformModuleKey[];
    licenseNumber?: string;
    licenseType?: string;
    licenseExpiry?: string;
    licensePoints?: number;
  };
};

export type SalesLead = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  industry: string;
  source: string;
  status: LeadStatus;
  notes: string;
  createdAt: string;
  assignedTo: string;
};

export type BillingRecord = {
  id: string;
  companyId: string;
  planId: CompanyPlanId;
  paymentStatus: BillingStatus;
  nextRenewal: string;
  amount: string;
  billingCycle: string;
};

export type PlatformLog = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  detail: string;
  severity: "info" | "warning" | "critical";
};

export type MarketingFaq = {
  id: string;
  question: string;
  answer: string;
};

export type MarketingTestimonial = {
  id: string;
  name: string;
  role: string;
  company: string;
  quote: string;
};

export type MarketingFlyerTone = "teal" | "sky" | "amber" | "rose";
export type MarketingFlyerStatus = "Activo" | "Borrador";

export type MarketingFlyer = {
  id: string;
  title: string;
  subtitle: string;
  audience: string;
  ctaLabel: string;
  ctaHref: string;
  imageUrl: string;
  tone: MarketingFlyerTone;
  status: MarketingFlyerStatus;
};

export type MarketingContent = {
  heroTitle: string;
  heroSubtitle: string;
  heroPrimaryCta: string;
  heroSecondaryCta: string;
  trustTitle: string;
  trustSubtitle: string;
  differentiatorTitle: string;
  differentiatorSubtitle: string;
  plansTitle: string;
  plansSubtitle: string;
  faqTitle: string;
  faqSubtitle: string;
  footerTagline: string;
};

export type AccountProfile = {
  name: string;
  title: string;
  email: string;
  phone: string;
  company: string;
  avatar: string;
  language: string;
  timezone: string;
  platformRole: PlatformRole;
  operationalRole: string;
  notifications: {
    email: boolean;
    system: boolean;
    billing: boolean;
  };
  passwordHint: string;
};

export type PlatformSystemSettings = {
  brandName: string;
  brandTagline: string;
  supportEmail: string;
  supportPhone: string;
  publicUrl: string;
  defaultLanguage: string;
  defaultTimezone: string;
  allowDemoAccess: boolean;
  showPublicPricing: boolean;
  rememberSessionDefault: boolean;
  adminAccessLabel: string;
  adminAccessEmail: string;
  adminAccessPassword: string;
  mapsProvider: string;
  mapsApiKey: string;
  mapsFallbackEnabled: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
  smtpFromName: string;
  smtpFromEmail: string;
  smtpReplyTo: string;
  smtpAutoReplyEnabled: boolean;
  smtpAutoReplySubject: string;
  smtpAutoReplyMessage: string;
  paymentNotificationEmail: string;
  paymentCurrency: string;
  paymentTaxRate: string;
  paymentTrialDays: string;
  paymentInvoicePrefix: string;
  paymentCheckoutEnabled: boolean;
  paymentManualApproval: boolean;
  paymentSuccessUrl: string;
  paymentCancelUrl: string;
  paymentSuccessMessage: string;
  paymentFailureMessage: string;
  paymentInstructions: string;
  paymentGateways: PaymentGatewaySettings;
};

export type PublicPlatformSettings = Pick<
  PlatformSystemSettings,
  | "brandName"
  | "brandTagline"
  | "supportEmail"
  | "supportPhone"
  | "publicUrl"
  | "defaultLanguage"
  | "defaultTimezone"
  | "allowDemoAccess"
  | "showPublicPricing"
  | "rememberSessionDefault"
>;

export type PublicContentSnapshot = {
  marketingContent: MarketingContent;
  faqs: MarketingFaq[];
  testimonials: MarketingTestimonial[];
  flyers: MarketingFlyer[];
  settings: PublicPlatformSettings;
  updatedAt: string;
};
