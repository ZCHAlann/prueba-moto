import { relations } from 'drizzle-orm';
import { companies, companyUsers, platformUsers } from './platform';
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

export const companiesRelations = relations(companies, ({ many, one }) => ({
  companyUsers: many(companyUsers),
  sites: many(companySites),
  assets: many(companyAssets),
  drivers: many(companyDrivers),
  settings: one(companySettings, {
    fields: [companies.id],
    references: [companySettings.companyId],
  }),
}));

export const companyUsersRelations = relations(companyUsers, ({ one }) => ({
  company: one(companies, {
    fields: [companyUsers.companyId],
    references: [companies.id],
  }),
}));

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