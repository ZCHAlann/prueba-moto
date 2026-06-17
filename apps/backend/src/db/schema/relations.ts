import { relations } from 'drizzle-orm';
import {
  companies,
  companyUsers,
  platformUsers,
  platformPlans,
  platformLeads,
  platformAuditEntries,
  platformInvoices,
  platformTickets,
  platformTicketMessages,
} from './platform';
import {
  companySites,
  companyAssets,
  companyDrivers,
  companyAssignments,
  companyMaintenanceRecords,
  companyMaintenanceItems,
  companyWorkshops,
  companySuppliers,
  companyOdometerReadings,
  companyNotifications,
  companyDeviceTokens,
  companyFuelEntries,
  companyTollEntries,
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
  assetNotes,
  assetRoutes,
  companyInsurancePolicies,
} from './operational';
import { from } from 'stream/iter';

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
  fuelEntries: many(companyFuelEntries),
  tollEntries: many(companyTollEntries),
  leads: many(platformLeads),
  settings: one(companySettings, {
    fields: [companies.id],
    references: [companySettings.companyId],
  }),
  plan: one(platformPlans, {
    fields: [companies.planId],
    references: [platformPlans.id],
  }),
  invoices: many(platformInvoices),
  tickets: many(platformTickets),

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

export const platformInvoicesRelations = relations(platformInvoices, ({ one }) => ({
  company: one(companies, {
    fields: [platformInvoices.companyId],
    references: [companies.id],
  }),
  plan: one(platformPlans, {
    fields: [platformInvoices.planId],
    references: [platformPlans.id],
  }),
}));

export const platformTicketsRelations = relations(platformTickets, ({ one, many }) => ({
  company:    one(companies,     { fields: [platformTickets.companyId],  references: [companies.id] }),
  createdBy:  one(companyUsers,  { fields: [platformTickets.createdBy],  references: [companyUsers.id] }),
  assignedTo: one(platformUsers, { fields: [platformTickets.assignedTo], references: [platformUsers.id] }),
  messages:   many(platformTicketMessages),
}));

export const platformTicketMessagesRelations = relations(platformTicketMessages, ({ one }) => ({
  ticket:             one(platformTickets, { fields: [platformTicketMessages.ticketId],              references: [platformTickets.id] }),
  authorPlatformUser: one(platformUsers,   { fields: [platformTicketMessages.authorPlatformUserId],  references: [platformUsers.id] }),
  authorCompanyUser:  one(companyUsers,    { fields: [platformTicketMessages.authorCompanyUserId],   references: [companyUsers.id] }),
}));





// ── Company Assets ──
export const companyAssetsRelations = relations(companyAssets, ({ one, many }) => ({
  company:         one(companies,        { fields: [companyAssets.companyId], references: [companies.id] }),
  site:            one(companySites,     { fields: [companyAssets.siteId],    references: [companySites.id] }),
  drivers:         many(companyAssignments),
  fuelEntries:     many(companyFuelEntries),
  tollEntries:     many(companyTollEntries),
  maintenances:    many(companyMaintenanceRecords),
  odometerReadings: many(companyOdometerReadings),
  alerts:          many(companyAlerts),
  insurances:      many(companyInsurancePolicies),
  oilChanges:      many(companyOilChanges),
  oilChecks:       many(oilChecks),
  notes:           many(assetNotes),
  routes:          many(assetRoutes),
}));

// ── Company Drivers ──
export const companyDriversRelations = relations(companyDrivers, ({ one, many }) => ({
  company:     one(companies, { fields: [companyDrivers.companyId], references: [companies.id] }),
  user:        one(companyUsers, { fields: [companyDrivers.userId], references: [companyUsers.id] }), // ← NUEVO
  assignments: many(companyAssignments),
  routes:      many(assetRoutes),
  fuelEntries: many(companyFuelEntries),
  tollEntries: many(companyTollEntries),
}));

// ── Assignments ──
export const companyAssignmentsRelations = relations(companyAssignments, ({ one }) => ({
  company: one(companies,      { fields: [companyAssignments.companyId], references: [companies.id] }),
  asset:   one(companyAssets,   { fields: [companyAssignments.assetId],   references: [companyAssets.id] }),
  driver:  one(companyDrivers,  { fields: [companyAssignments.driverId],  references: [companyDrivers.id] }),
}));

// ── Fuel ──
export const companyFuelEntriesRelations = relations(companyFuelEntries, ({ one }) => ({
  company: one(companies,     { fields: [companyFuelEntries.companyId], references: [companies.id] }),
  asset:   one(companyAssets,  { fields: [companyFuelEntries.assetId],   references: [companyAssets.id] }),
  driver:  one(companyDrivers, { fields: [companyFuelEntries.driverId],  references: [companyDrivers.id] }),
}));

// ── Peajes ──
export const companyTollEntriesRelations = relations(companyTollEntries, ({ one }) => ({
  company: one(companies,     { fields: [companyTollEntries.companyId], references: [companies.id] }),
  asset:   one(companyAssets,  { fields: [companyTollEntries.assetId],   references: [companyAssets.id] }),
  driver:  one(companyDrivers, { fields: [companyTollEntries.driverId],  references: [companyDrivers.id] }),
}));

// ── Maintenances v2 ──
export const companyWorkshopsRelations = relations(companyWorkshops, ({ one, many }) => ({
  company:      one(companies, { fields: [companyWorkshops.companyId], references: [companies.id] }),
  maintenances: many(companyMaintenanceRecords),
}));

export const companySuppliersRelations = relations(companySuppliers, ({ one, many }) => ({
  company: one(companies, { fields: [companySuppliers.companyId], references: [companies.id] }),
  items:   many(companyMaintenanceItems),
}));

export const companyOdometerReadingsRelations = relations(companyOdometerReadings, ({ one }) => ({
  company:   one(companies,     { fields: [companyOdometerReadings.companyId], references: [companies.id] }),
  asset:     one(companyAssets,  { fields: [companyOdometerReadings.assetId],   references: [companyAssets.id] }),
  createdByUser: one(companyUsers, { fields: [companyOdometerReadings.createdBy], references: [companyUsers.id] }),
}));

export const companyMaintenanceRecordsRelations = relations(companyMaintenanceRecords, ({ one, many }) => ({
  company:    one(companies,           { fields: [companyMaintenanceRecords.companyId],  references: [companies.id] }),
  asset:      one(companyAssets,        { fields: [companyMaintenanceRecords.assetId],    references: [companyAssets.id] }),
  workshop:   one(companyWorkshops,     { fields: [companyMaintenanceRecords.workshopId], references: [companyWorkshops.id] }),
  parent:     one(companyMaintenanceRecords, {
    fields: [companyMaintenanceRecords.parentId],
    references: [companyMaintenanceRecords.id],
    relationName: 'maintenance_parent',
  }),
  items:      many(companyMaintenanceItems),
  createdByUser:  one(companyUsers,     { fields: [companyMaintenanceRecords.createdBy],  references: [companyUsers.id], relationName: 'maint_created_by' }),
  completedByUser: one(companyUsers,   { fields: [companyMaintenanceRecords.completedBy],references: [companyUsers.id], relationName: 'maint_completed_by' }),
}));

export const companyMaintenanceItemsRelations = relations(companyMaintenanceItems, ({ one }) => ({
  maintenance: one(companyMaintenanceRecords, { fields: [companyMaintenanceItems.maintenanceId], references: [companyMaintenanceRecords.id] }),
  supplier:    one(companySuppliers,           { fields: [companyMaintenanceItems.supplierId],    references: [companySuppliers.id] }),
}));

// ── Notifications ──
export const companyNotificationsRelations = relations(companyNotifications, ({ one }) => ({
  company: one(companies,    { fields: [companyNotifications.companyId], references: [companies.id] }),
  user:    one(companyUsers, { fields: [companyNotifications.userId],    references: [companyUsers.id] }),
}));

export const companyDeviceTokensRelations = relations(companyDeviceTokens, ({ one }) => ({
  user:    one(companyUsers, { fields: [companyDeviceTokens.userId],    references: [companyUsers.id] }),
  company: one(companies,    { fields: [companyDeviceTokens.companyId], references: [companies.id] }),
}));

// ── Insurance ──
export const companyInsurancePoliciesRelations = relations(companyInsurancePolicies, ({ one }) => ({
  company: one(companies,    { fields: [companyInsurancePolicies.companyId], references: [companies.id] }),
  asset:   one(companyAssets, { fields: [companyInsurancePolicies.assetId],   references: [companyAssets.id] }),
}));

// ── Oil Checks ──
export const oilChecksRelations = relations(oilChecks, ({ one }) => ({
  company:    one(companies,     { fields: [oilChecks.companyId],    references: [companies.id] }),
  asset:      one(companyAssets,  { fields: [oilChecks.assetId],      references: [companyAssets.id] }),
  technician: one(companyUsers,   { fields: [oilChecks.technicianId], references: [companyUsers.id] }),
}));

// ── Checklists ──
export const companyChecklistsRelations = relations(companyChecklists, ({ one }) => ({
  company:   one(companies,                { fields: [companyChecklists.companyId],   references: [companies.id] }),
  category:  one(companyChecklistCategories,{ fields: [companyChecklists.categoryId], references: [companyChecklistCategories.id] }),
  asset:     one(companyAssets,             { fields: [companyChecklists.assetId],    references: [companyAssets.id] }),
  driver:    one(companyDrivers,            { fields: [companyChecklists.driverId],   references: [companyDrivers.id] }),
  inspector: one(companyUsers,              { fields: [companyChecklists.inspectorId],references: [companyUsers.id] }),
}));

export const companyChecklistCategoriesRelations = relations(companyChecklistCategories, ({ one, many }) => ({
  company:   one(companies,      { fields: [companyChecklistCategories.companyId], references: [companies.id] }),
  checklists: many(companyChecklists),
}));

// ── Sites ──
export const companySitesRelations = relations(companySites, ({ one, many }) => ({
  company: one(companies,    { fields: [companySites.companyId], references: [companies.id] }),
  assets:  many(companyAssets),
  drivers: many(companyDrivers),
  acUnits: many(companyAcUnits),
}));

// ── Alerts ──
export const companyAlertsRelations = relations(companyAlerts, ({ one }) => ({
  company: one(companies,    { fields: [companyAlerts.companyId], references: [companies.id] }),
  asset:   one(companyAssets, { fields: [companyAlerts.assetId],   references: [companyAssets.id] }),
}));

// ── Inventory / Garages ──
export const companyInventoryRelations = relations(companyInventory, ({ one }) => ({
  company: one(companies, { fields: [companyInventory.companyId], references: [companies.id] }),
}));

export const companyGaragesRelations = relations(companyGarages, ({ one }) => ({
  company: one(companies, { fields: [companyGarages.companyId], references: [companies.id] }),
}));

// ── AC ──
export const companyAcUnitsRelations = relations(companyAcUnits, ({ one, many }) => ({
  company: one(companies, { fields: [companyAcUnits.companyId], references: [companies.id] }),
  site:    one(companySites, { fields: [companyAcUnits.siteId], references: [companySites.id] }),
  services: many(companyAcServices),
  refrigerantLogs: many(companyAcRefrigerantLogs),
}));

export const companyAcServicesRelations = relations(companyAcServices, ({ one }) => ({
  company: one(companies,     { fields: [companyAcServices.companyId], references: [companies.id] }),
  unit:    one(companyAcUnits, { fields: [companyAcServices.unitId],   references: [companyAcUnits.id] }),
}));

export const companyAcRefrigerantLogsRelations = relations(companyAcRefrigerantLogs, ({ one }) => ({
  company: one(companies,     { fields: [companyAcRefrigerantLogs.companyId], references: [companies.id] }),
  unit:    one(companyAcUnits, { fields: [companyAcRefrigerantLogs.unitId],   references: [companyAcUnits.id] }),
}));

// ── Audit ──
export const companyAuditEntriesRelations = relations(companyAuditEntries, ({ one }) => ({
  company: one(companies, { fields: [companyAuditEntries.companyId], references: [companies.id] }),
}));

// ── Users ──
export const companyUsersRelations = relations(companyUsers, ({ one, many }) => ({
  company: one(companies, { fields: [companyUsers.companyId], references: [companies.id] }),
  notes:   many(assetNotes),
  driver:  one(companyDrivers, { fields: [companyUsers.id], references: [companyDrivers.userId] }), // ← NUEVO
}));


export const assetNotesRelations = relations(assetNotes, ({ one }) => ({
  company: one(companies,     { fields: [assetNotes.companyId], references: [companies.id] }),
  asset:   one(companyAssets,  { fields: [assetNotes.assetId],   references: [companyAssets.id] }),
  author:  one(companyUsers,   { fields: [assetNotes.authorId],  references: [companyUsers.id] }),
}));

export const assetRoutesRelations = relations(assetRoutes, ({ one }) => ({
  company: one(companies,     { fields: [assetRoutes.companyId], references: [companies.id] }),
  asset:   one(companyAssets,  { fields: [assetRoutes.assetId],   references: [companyAssets.id] }),
  driver:  one(companyDrivers, { fields: [assetRoutes.driverId],  references: [companyDrivers.id] }),
}));

