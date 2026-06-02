import { relations } from 'drizzle-orm';
import {
  companies,
  companyUsers,
  platformUsers,
  platformPlans,
  platformLeads,
  platformAuditEntries,
} from './platform';
import {
  companySites,
  companyAssets,
  companyDrivers,
  companyAssignments,
  companyMaintenances,
  companyFuelEntries,
  companyAlerts,
  companyChecklists,
  companyChecklistCategories,
  companyInventory,
  companyGarages,
  companyAcUnits,
  companyAcServices,
  companyAcRefrigerantLogs,
  companyAuditEntries,
  companySettings,
  oilChecks,
  companyOilTypes,
  companyOilChanges,
} from './operational';

// ─────────────────────────────────────────────
// Platform
// ─────────────────────────────────────────────

export const platformPlansRelations = relations(platformPlans, ({ many }) => ({
  companies: many(companies),
}));

export const platformUsersRelations = relations(platformUsers, ({ many }) => ({
  leads: many(platformLeads),
  auditEntries: many(platformAuditEntries),
}));

export const platformLeadsRelations = relations(platformLeads, ({ one }) => ({
  assignedTo: one(platformUsers, {
    fields: [platformLeads.assignedTo],
    references: [platformUsers.id],
  }),
  convertedToCompany: one(companies, {
    fields: [platformLeads.convertedToCompanyId],
    references: [companies.id],
  }),
}));

export const platformAuditEntriesRelations = relations(platformAuditEntries, ({ one }) => ({
  actor: one(platformUsers, {
    fields: [platformAuditEntries.actorId],
    references: [platformUsers.id],
  }),
}));

// ─────────────────────────────────────────────
// Companies
// ─────────────────────────────────────────────

export const companiesRelations = relations(companies, ({ many, one }) => ({
  companyUsers: many(companyUsers),
  sites: many(companySites),
  assets: many(companyAssets),
  drivers: many(companyDrivers),
  leads: many(platformLeads),
  settings: one(companySettings, {
    fields: [companies.id],
    references: [companySettings.companyId],
  }),
  plan: one(platformPlans, {
    fields: [companies.planId],
    references: [platformPlans.id],
  }),
}));

export const companyUsersRelations = relations(companyUsers, ({ one }) => ({
  company: one(companies, {
    fields: [companyUsers.companyId],
    references: [companies.id],
  }),
}));

// ─────────────────────────────────────────────
// Operational
// ─────────────────────────────────────────────

export const companyOilTypesRelations = relations(companyOilTypes, ({ one, many }) => ({
  company: one(companies, {
    fields: [companyOilTypes.companyId],
    references: [companies.id],
  }),
  oilChanges: many(companyOilChanges),
}));

export const companyOilChangesRelations = relations(companyOilChanges, ({ one }) => ({
  company: one(companies, {
    fields: [companyOilChanges.companyId],
    references: [companies.id],
  }),
  asset: one(companyAssets, {
    fields: [companyOilChanges.assetId],
    references: [companyAssets.id],
  }),
  oilType: one(companyOilTypes, {
    fields: [companyOilChanges.oilTypeId],
    references: [companyOilTypes.id],
  }),
}));