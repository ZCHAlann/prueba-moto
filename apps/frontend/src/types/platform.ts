export type PlatformRole =
  | "superadmin"
  | "admin_saas"
  | "comercial"
  | "soporte"
  | "owner_empresa"
  | "admin_empresa"
  | "conductor"
  | "supervisor"
  | "operador";

export type PlatformModuleKey =
  | "dashboard"
  | "accesos"
  | "gestion"
  | "motores"
  | "generadores"
  | "aires_acondicionados"
  | "mantenimiento"
  | "checklist"
  | "alertas"
  | "reportes"
  | "combustible"
  | "geolocalizacion"
  | "cuenta";

// ─────────────────────────────────────────────
// Enums (espejo de los pgEnum del schema)
// ─────────────────────────────────────────────

export type CompanyStatus = "active" | "inactive" | "suspended" | "trial";
export type LeadStatus =
  | "nuevo"
  | "contactado"
  | "demo_agendada"
  | "propuesta_enviada"
  | "ganado"
  | "perdido";
export type PlanTier = "free" | "starter" | "pro" | "enterprise";

// ─────────────────────────────────────────────
// Planes
// ─────────────────────────────────────────────

export interface PlatformPlan {
  id: string;                  // slug: 'free' | 'starter' | 'pro' | 'enterprise'
  name: string;
  tier: PlanTier;
  monthlyPrice: string;        // numeric viene como string desde Drizzle
  annualPrice: string;
  maxUsers: number | null;     // null = ilimitado
  maxAssets: number | null;
  allowedModules: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PlatformPlanInput = Omit<PlatformPlan, "createdAt" | "updatedAt">;

// ─────────────────────────────────────────────
// Empresas
// ─────────────────────────────────────────────

export interface PlatformCompany {
  id: number;
  name: string;
  slug: string;
  planId: string;
  status: CompanyStatus;
  enabledModules: string[];
  industry: string | null;
  country: string | null;
  city: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  notes: string | null;
  trialEndsAt: string | null;
  contractStartAt: string | null;
  contractEndAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PlatformCompanyInput = Omit<PlatformCompany, "id" | "createdAt" | "updatedAt">;

// ─────────────────────────────────────────────
// Leads
// ─────────────────────────────────────────────

export interface PlatformLead {
  id: number;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  industry: string | null;
  country: string | null;
  city: string | null;
  status: LeadStatus;
  source: string | null;
  assignedTo: number | null;
  estimatedValue: string | null;   // numeric → string
  notes: string | null;
  convertedToCompanyId: number | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PlatformLeadInput = {
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  industry: string | null;
  country: string | null;
  city: string | null;
  status: LeadStatus;
  source: string | null;
  assignedTo: number | null;
  estimatedValue: string | null;
  notes: string | null;
  // Estos son opcionales — solo se usan al convertir un lead
  convertedToCompanyId?: number | null;
  convertedAt?: string | null;
};

// ─────────────────────────────────────────────
// Stats (respuesta de GET /platform/stats)
// ─────────────────────────────────────────────

export interface PlatformStats {
  companies: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    inactive: number;
    newThisMonth: number;
    growthMoM: number | null;          // % vs mes anterior (null si no hay datos)
    newByMonth: number[];               // array de 12 números (últimos 12 meses)
    byPlan: Array<{
      planId: string;
      planName: string;
      tier: string;
      total: number;
    }>;
  };
  leads: {
    total: number;
    byStatus: {
      nuevo: number;
      contactado: number;
      demoAgendada: number;
      propuestaEnviada: number;
      ganado: number;
      perdido: number;
    };
    newThisMonth: number;
    convertedThisMonth: number;
    newByMonth: number[];               // array de 12 números
    wonByMonth: number[];               // array de 12 números
    conversionRate: number;        // porcentaje 0-100
    pipelineValue: string;
  };
  users: {
    total: number;
    active: number;
  };
  alerts: {
    trialExpiringSoon: Array<{
      id: number;
      name: string;
      slug: string;
      trialEndsAt: string | null;
      contactEmail: string | null;
    }>;
  };
  recent: {
    companies: Array<{
      id: number;
      name: string;
      slug: string;
      planId: string;
      status: CompanyStatus;
      createdAt: string;
    }>;
  };
  generatedAt: string;
}

export interface PlatformAuditEntry {
  id:          number;
  actorId:     number | null;
  actorEmail:  string | null;
  action:      string;        // 'company.created', 'plan.changed', etc.
  entity:      string | null; // 'company' | 'lead' | 'plan' | 'user'
  entityId:    string | null;
  description: string | null;
  metadata:    Record<string, unknown>;
  createdAt:   string;
}

export interface PlatformAuditFilters {
  entity:  string;
  action:  string;
  actorId: string;
  from:    string;
  to:      string;
  search:  string;
  limit:   number;
}

export type DealUrgency = "normal" | "warning" | "critical";

export interface CRMDeal extends PlatformLead {
  score: number;
  urgency: DealUrgency;
  daysSinceUpdate: number;
  daysInPipeline: number;
  forecastValue: number;
}

export interface CRMPipelineStage {
  stage: LeadStatus;
  deals: CRMDeal[];
  count: number;
  totalValue: number;
  forecastValue: number;
}

export interface CRMStats {
  totalDeals: number;
  activeDeals: number;
  wonDeals: number;
  lostDeals: number;
  winRate: number;
  winRateThisMonth: number;
  winRateLastMonth: number;
  avgClosingDays: number;
  pipelineValue: number;
  forecastValue: number;
  pipelineHealth: "healthy" | "warning" | "critical";
  staleDeals: number;
  stalePercent: number;
  wonThisMonth: number;
  recentActivity: CRMDeal[];
}

export interface CRMForecastStage {
  stage: LeadStatus;
  probability: number;
  dealCount: number;
  totalValue: number;
  forecastValue: number;
}

export interface CRMForecast {
  byStage: CRMForecastStage[];
  totalForecast: number;
  totalPipeline: number;
  generatedAt: string;
}

export interface CRMActivity {
  id: number;
  companyName: string;
  status: LeadStatus;
  updatedAt: string;
  createdAt: string;
  isNew: boolean;
  estimatedValue: string | null;
  score: number;
  urgency: DealUrgency;
}

export interface CRMConvertInput {
  name: string;
  slug: string;
  planId: string;
  enabledModules: string[];
  contractStartAt?: string;
  contractEndAt?: string;
}