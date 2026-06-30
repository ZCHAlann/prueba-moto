// lib/canvas-rows.ts
// ─────────────────────────────────────────────────────────────────────────────
// Filas específicas de cada módulo para alimentar las TABLAS del Lienzo de
// Presentación.
//
// Antes: la tabla del widget tomaba el primer array del payload agregado del
// calculator (barVChart.data, etc.) y mostraba columnas genéricas con nombres
// crudos (`x`, `123`, `456`) y datos agregados.
//
// Ahora: este módulo devuelve las MISMAS filas que ve el usuario en la lista
// del módulo correspondiente (Combustible, Mantenimiento, etc.), filtradas
// por el scope/entityIds/rango de fechas del widget, con columnas legibles
// en español y tipos (`date`/`number`/`currency`/`string`) para que el
// frontend sepa cómo formatearlas.
// ─────────────────────────────────────────────────────────────────────────────

import { and, asc, eq, gte, inArray, lte, sql, desc } from "drizzle-orm";
import { db } from "../db/client";
import {
  companyAssets,
  companyDrivers,
  companyFuelEntries,
  companyMaintenanceRecords,
  companyWorkshops,
  companyTollEntries,
  companyAlerts,
  companyChecklists,
  companyChecklistCategories,
  companyAcUnits,
  companyAcServices,
  companyInsurancePolicies,
  companyAssignments,
} from "../db/schema/operational";

export type RowColumnType = "string" | "number" | "currency" | "date";

export type RowColumn = {
  key: string;
  label: string;
  type: RowColumnType;
  /** ancho mínimo en px (opcional) */
  width?: number;
};

export type CanvasRows = {
  columns: RowColumn[];
  rows: Array<Record<string, string | number | null>>;
  /** advertencia opcional (e.g. "Truncado a 200 filas") */
  warning?: string;
};

const MAX_ROWS = 200;

export type CanvasRowsInput = {
  companyId:  number;
  modulo:     string;
  scope:      "todos" | "uno" | "varios";
  entityKind: "asset" | "driver" | null;
  entityIds:  number[];
  fechaDesde: string; // YYYY-MM-DD
  fechaHasta: string; // YYYY-MM-DD
};

/**
 * Dispatcher principal. Devuelve las filas + columnas formateadas para el
 * frontend según el módulo del widget.
 */
export async function fetchCanvasRows(input: CanvasRowsInput): Promise<CanvasRows> {
  switch (input.modulo) {
    case "combustible":    return fetchCombustible(input);
    case "mantenimiento":  return fetchMantenimiento(input);
    case "flotas":         return fetchFlotas(input);
    case "conductores":    return fetchConductores(input);
    case "checklists":     return fetchChecklists(input);
    case "alertas":        return fetchAlertas(input);
    case "ac":             return fetchAc(input);
    case "seguros":        return fetchSeguros(input);
    case "peajes":         return fetchPeajes(input);
    case "asignaciones":   return fetchAsignaciones(input);
    default:
      return {
        columns: [],
        rows: [],
        warning: `Módulo '${input.modulo}' no soporta vista de tabla todavía.`,
      };
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

function trunc(rows: Array<Record<string, string | number | null>>): {
  rows: typeof rows;
  warning?: string;
} {
  if (rows.length > MAX_ROWS) {
    return { rows: rows.slice(0, MAX_ROWS), warning: `Mostrando primeras ${MAX_ROWS} filas de ${rows.length}.` };
  }
  return { rows };
}

// ─── Combustible ───────────────────────────────────────────────────────────

async function fetchCombustible(input: CanvasRowsInput): Promise<CanvasRows> {
  const conds = [
    eq(companyFuelEntries.companyId, input.companyId),
    gte(companyFuelEntries.date, input.fechaDesde),
    lte(companyFuelEntries.date, input.fechaHasta),
  ];
  if (input.entityKind === "asset" && input.entityIds.length > 0) {
    conds.push(inArray(companyFuelEntries.assetId, input.entityIds));
  } else if (input.entityKind === "driver" && input.entityIds.length > 0) {
    conds.push(inArray(companyFuelEntries.driverId, input.entityIds));
  }

  const rowsRaw = await db
    .select({
      id:        companyFuelEntries.id,
      date:      companyFuelEntries.date,
      assetId:   companyFuelEntries.assetId,
      driverId:  companyFuelEntries.driverId,
      gallons:   companyFuelEntries.gallons,
      liters:    companyFuelEntries.liters,
      cost:      companyFuelEntries.cost,
      odometer:  companyFuelEntries.odometer,
      station:   companyFuelEntries.station,
      fuelType:  companyFuelEntries.fuelType,
      notes:     companyFuelEntries.notes,
      plate:     companyAssets.plate,
    })
    .from(companyFuelEntries)
    .leftJoin(companyAssets, eq(companyAssets.id, companyFuelEntries.assetId))
    .where(and(...conds))
    .orderBy(desc(companyFuelEntries.date))
    .limit(500);

  const rows = rowsRaw.map((r) => ({
    id:        toCanvasId("fuel", r.id),
    date:      r.date ?? null,
    plate:     r.plate ?? null,
    gallons:   num(r.gallons),
    liters:    num(r.liters),
    cost:      num(r.cost),
    odometer:  num(r.odometer),
    station:   r.station ?? null,
    fuelType:  r.fuelType ?? null,
  }));

  const t = trunc(rows);
  return {
    columns: [
      { key: "date",     label: "Fecha",       type: "date" },
      { key: "plate",    label: "Vehículo",    type: "string" },
      { key: "gallons",  label: "Galones",     type: "number" },
      { key: "liters",   label: "Litros",      type: "number" },
      { key: "cost",     label: "Costo",       type: "currency" },
      { key: "odometer", label: "Odómetro",    type: "number" },
      { key: "station",  label: "Estación",    type: "string" },
      { key: "fuelType", label: "Combustible", type: "string" },
    ],
    rows:    t.rows,
    warning: t.warning,
  };
}

// ─── Mantenimiento ─────────────────────────────────────────────────────────

async function fetchMantenimiento(input: CanvasRowsInput): Promise<CanvasRows> {
  const conds = [
    eq(companyMaintenanceRecords.companyId, input.companyId),
    gte(companyMaintenanceRecords.scheduledFor, input.fechaDesde),
    lte(companyMaintenanceRecords.scheduledFor, input.fechaHasta),
  ];
  if (input.entityKind === "asset" && input.entityIds.length > 0) {
    conds.push(inArray(companyMaintenanceRecords.assetId, input.entityIds));
  }

  const rowsRaw = await db
    .select({
      id:           companyMaintenanceRecords.id,
      scheduledFor: companyMaintenanceRecords.scheduledFor,
      assetId:      companyMaintenanceRecords.assetId,
      plate:        companyAssets.plate,
      type:         companyMaintenanceRecords.type,
      status:       companyMaintenanceRecords.status,
      category:     companyMaintenanceRecords.category,
      title:        companyMaintenanceRecords.title,
      workshop:     companyWorkshops.name,
      totalCost:    companyMaintenanceRecords.totalCost,
      odometerKm:   companyMaintenanceRecords.odometerKm,
    })
    .from(companyMaintenanceRecords)
    .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
    .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
    .where(and(...conds))
    .orderBy(desc(companyMaintenanceRecords.scheduledFor))
    .limit(500);

  const rows = rowsRaw.map((r) => ({
    id:          toCanvasId("maintenance", r.id),
    date:        r.scheduledFor ? String(r.scheduledFor).slice(0, 10) : null,
    plate:       r.plate ?? null,
    type:        r.type ?? null,
    status:      r.status ?? null,
    category:    r.category ?? null,
    title:       r.title ?? null,
    workshop:    r.workshop ?? null,
    totalCost:   num(r.totalCost),
    odometerKm:  num(r.odometerKm),
  }));

  const t = trunc(rows);
  return {
    columns: [
      { key: "date",       label: "Fecha",         type: "date" },
      { key: "plate",      label: "Vehículo",      type: "string" },
      { key: "type",       label: "Tipo",          type: "string" },
      { key: "status",     label: "Estado",        type: "string" },
      { key: "category",   label: "Categoría",     type: "string" },
      { key: "title",      label: "Título",        type: "string" },
      { key: "workshop",   label: "Taller",        type: "string" },
      { key: "totalCost",  label: "Costo total",   type: "currency" },
      { key: "odometerKm", label: "Odómetro (km)", type: "number" },
    ],
    rows:    t.rows,
    warning: t.warning,
  };
}

// ─── Flotas ────────────────────────────────────────────────────────────────

async function fetchFlotas(input: CanvasRowsInput): Promise<CanvasRows> {
  const conds = [eq(companyAssets.companyId, input.companyId)];
  if (input.entityKind === "asset" && input.entityIds.length > 0) {
    conds.push(inArray(companyAssets.id, input.entityIds));
  }

  const rowsRaw = await db
    .select({
      id:     companyAssets.id,
      name:   companyAssets.name,
      plate:  companyAssets.plate,
      brand:  companyAssets.brand,
      model:  companyAssets.model,
      year:   companyAssets.year,
      status: companyAssets.status,
      km:     companyAssets.km,
      fuelType: companyAssets.fuelType,
    })
    .from(companyAssets)
    .where(and(...conds))
    .orderBy(asc(companyAssets.plate))
    .limit(500);

  const rows = rowsRaw.map((r) => ({
    id:       toCanvasId("asset", r.id),
    name:     r.name ?? null,
    plate:    r.plate ?? null,
    brand:    r.brand ?? null,
    model:    r.model ?? null,
    year:     r.year ?? null,
    status:   r.status ?? null,
    km:       num(r.km),
    fuelType: r.fuelType ?? null,
  }));

  const t = trunc(rows);
  return {
    columns: [
      { key: "plate",    label: "Placa",        type: "string" },
      { key: "name",     label: "Nombre",       type: "string" },
      { key: "brand",    label: "Marca",        type: "string" },
      { key: "model",    label: "Modelo",       type: "string" },
      { key: "year",     label: "Año",          type: "number" },
      { key: "status",   label: "Estado",       type: "string" },
      { key: "km",       label: "Kilometraje",  type: "number" },
      { key: "fuelType", label: "Combustible",  type: "string" },
    ],
    rows:    t.rows,
    warning: t.warning,
  };
}

// ─── Conductores ───────────────────────────────────────────────────────────

async function fetchConductores(input: CanvasRowsInput): Promise<CanvasRows> {
  const conds = [eq(companyDrivers.companyId, input.companyId)];
  if (input.entityKind === "driver" && input.entityIds.length > 0) {
    conds.push(inArray(companyDrivers.id, input.entityIds));
  }

  const rowsRaw = await db
    .select({
      id:            companyDrivers.id,
      firstName:     companyDrivers.firstName,
      lastName:      companyDrivers.lastName,
      code:          companyDrivers.code,
      licenseNumber: companyDrivers.licenseNumber,
      licenseType:   companyDrivers.licenseType,
      licenseExpiry: companyDrivers.licenseExpiry,
      licensePoints: companyDrivers.licensePoints,
      status:        companyDrivers.status,
      phone:         companyDrivers.phone,
      email:         companyDrivers.email,
    })
    .from(companyDrivers)
    .where(and(...conds))
    .orderBy(asc(companyDrivers.lastName))
    .limit(500);

  const rows = rowsRaw.map((r) => ({
    id:            toCanvasId("driver", r.id),
    name:          [r.firstName, r.lastName].filter(Boolean).join(" ") || null,
    code:          r.code ?? null,
    licenseNumber: r.licenseNumber ?? null,
    licenseType:   r.licenseType ?? null,
    licenseExpiry: r.licenseExpiry ?? null,
    licensePoints: num(r.licensePoints),
    status:        r.status ?? null,
    phone:         r.phone ?? null,
    email:         r.email ?? null,
  }));

  const t = trunc(rows);
  return {
    columns: [
      { key: "name",          label: "Conductor",       type: "string" },
      { key: "code",          label: "Código",          type: "string" },
      { key: "licenseNumber", label: "Licencia",        type: "string" },
      { key: "licenseType",   label: "Tipo",            type: "string" },
      { key: "licenseExpiry", label: "Vencimiento",     type: "date" },
      { key: "licensePoints", label: "Puntos",          type: "number" },
      { key: "status",        label: "Estado",          type: "string" },
      { key: "phone",         label: "Teléfono",        type: "string" },
      { key: "email",         label: "Email",           type: "string" },
    ],
    rows:    t.rows,
    warning: t.warning,
  };
}

// ─── Checklists ────────────────────────────────────────────────────────────

async function fetchChecklists(input: CanvasRowsInput): Promise<CanvasRows> {
  const conds = [
    eq(companyChecklists.companyId, input.companyId),
    gte(companyChecklists.date, input.fechaDesde),
    lte(companyChecklists.date, input.fechaHasta),
  ];
  if (input.entityKind === "asset" && input.entityIds.length > 0) {
    conds.push(inArray(companyChecklists.assetId, input.entityIds));
  } else if (input.entityKind === "driver" && input.entityIds.length > 0) {
    conds.push(inArray(companyChecklists.driverId, input.entityIds));
  }

  const rowsRaw = await db
    .select({
      id:           companyChecklists.id,
      date:         companyChecklists.date,
      plate:        companyAssets.plate,
      categoryName: companyChecklistCategories.name,
      status:       companyChecklists.status,
      summary:      companyChecklists.summary,
      targetLabel:  companyChecklists.targetLabel,
    })
    .from(companyChecklists)
    .leftJoin(companyAssets, eq(companyAssets.id, companyChecklists.assetId))
    .leftJoin(companyChecklistCategories, eq(companyChecklistCategories.id, companyChecklists.categoryId))
    .where(and(...conds))
    .orderBy(desc(companyChecklists.date))
    .limit(500);

  const rows = rowsRaw.map((r) => ({
    id:           toCanvasId("checklist", r.id),
    date:         r.date ?? null,
    plate:        r.plate ?? null,
    categoryName: r.categoryName ?? null,
    status:       r.status ?? null,
    summary:      r.summary ?? null,
    targetLabel:  r.targetLabel ?? null,
  }));

  const t = trunc(rows);
  return {
    columns: [
      { key: "date",         label: "Fecha",      type: "date" },
      { key: "plate",        label: "Vehículo",   type: "string" },
      { key: "categoryName", label: "Categoría",  type: "string" },
      { key: "status",       label: "Estado",     type: "string" },
      { key: "targetLabel",  label: "Objetivo",   type: "string" },
      { key: "summary",      label: "Resumen",    type: "string" },
    ],
    rows:    t.rows,
    warning: t.warning,
  };
}

// ─── Alertas ───────────────────────────────────────────────────────────────

async function fetchAlertas(input: CanvasRowsInput): Promise<CanvasRows> {
  const conds = [
    eq(companyAlerts.companyId, input.companyId),
    gte(companyAlerts.createdAt, sql`${input.fechaDesde}::timestamp`),
    lte(companyAlerts.createdAt, sql`${input.fechaHasta}::timestamp + interval '1 day'`),
  ];

  const rowsRaw = await db
    .select({
      id:        companyAlerts.id,
      createdAt: companyAlerts.createdAt,
      title:     companyAlerts.title,
      type:      companyAlerts.type,
      severity:  companyAlerts.severity,
      status:    companyAlerts.status,
      notes:     companyAlerts.notes,
      dueDate:   companyAlerts.dueDate,
      plate:     companyAssets.plate,
    })
    .from(companyAlerts)
    .leftJoin(companyAssets, eq(companyAssets.id, companyAlerts.assetId))
    .where(and(...conds))
    .orderBy(desc(companyAlerts.createdAt))
    .limit(500);

  const rows = rowsRaw.map((r) => ({
    id:        toCanvasId("alert", r.id),
    date:      r.createdAt ? String(r.createdAt).slice(0, 10) : null,
    title:     r.title ?? null,
    type:      r.type ?? null,
    severity:  r.severity ?? null,
    status:    r.status ?? null,
    plate:     r.plate ?? null,
    dueDate:   r.dueDate ?? null,
    notes:     r.notes ?? null,
  }));

  const t = trunc(rows);
  return {
    columns: [
      { key: "date",     label: "Fecha",     type: "date" },
      { key: "title",    label: "Título",    type: "string" },
      { key: "type",     label: "Tipo",      type: "string" },
      { key: "severity", label: "Severidad", type: "string" },
      { key: "status",   label: "Estado",    type: "string" },
      { key: "plate",    label: "Vehículo",  type: "string" },
      { key: "dueDate",  label: "Vence",     type: "date" },
    ],
    rows:    t.rows,
    warning: t.warning,
  };
}

// ─── AC ────────────────────────────────────────────────────────────────────

async function fetchAc(input: CanvasRowsInput): Promise<CanvasRows> {
  // Para A/C, mostramos los servicios del rango de fechas
  const conds = [
    eq(companyAcServices.companyId, input.companyId),
    gte(companyAcServices.date, input.fechaDesde),
    lte(companyAcServices.date, input.fechaHasta),
  ];

  const rowsRaw = await db
    .select({
      id:           companyAcServices.id,
      date:         companyAcServices.date,
      kind:         companyAcServices.kind,
      technician:   companyAcServices.technician,
      cost:         companyAcServices.cost,
      findings:     companyAcServices.findings,
      unitCode:     companyAcUnits.code,
      unitName:     companyAcUnits.name,
      unitBrand:    companyAcUnits.brand,
      unitStatus:   companyAcUnits.status,
    })
    .from(companyAcServices)
    .leftJoin(companyAcUnits, eq(companyAcUnits.id, companyAcServices.unitId))
    .where(and(...conds))
    .orderBy(desc(companyAcServices.date))
    .limit(500);

  const rows = rowsRaw.map((r) => ({
    id:         toCanvasId("ac-service", r.id),
    date:       r.date ?? null,
    unitCode:   r.unitCode ?? null,
    unitName:   r.unitName ?? null,
    unitBrand:  r.unitBrand ?? null,
    unitStatus: r.unitStatus ?? null,
    kind:       r.kind ?? null,
    technician: r.technician ?? null,
    cost:       num(r.cost),
    findings:   r.findings ?? null,
  }));

  const t = trunc(rows);
  return {
    columns: [
      { key: "date",       label: "Fecha",      type: "date" },
      { key: "unitCode",   label: "Código",     type: "string" },
      { key: "unitName",   label: "Unidad",     type: "string" },
      { key: "unitBrand",  label: "Marca",      type: "string" },
      { key: "kind",       label: "Servicio",   type: "string" },
      { key: "technician", label: "Técnico",    type: "string" },
      { key: "cost",       label: "Costo",      type: "currency" },
      { key: "unitStatus", label: "Estado",     type: "string" },
    ],
    rows:    t.rows,
    warning: t.warning,
  };
}

// ─── Seguros ───────────────────────────────────────────────────────────────

async function fetchSeguros(input: CanvasRowsInput): Promise<CanvasRows> {
  const conds = [
    eq(companyInsurancePolicies.companyId, input.companyId),
    gte(companyInsurancePolicies.endDate, input.fechaDesde),
    lte(companyInsurancePolicies.startDate, input.fechaHasta),
  ];
  if (input.entityKind === "asset" && input.entityIds.length > 0) {
    conds.push(inArray(companyInsurancePolicies.assetId, input.entityIds));
  }

  const rowsRaw = await db
    .select({
      id:           companyInsurancePolicies.id,
      insurer:      companyInsurancePolicies.insurer,
      policyNumber: companyInsurancePolicies.policyNumber,
      coverage:     companyInsurancePolicies.coverage,
      startDate:    companyInsurancePolicies.startDate,
      endDate:      companyInsurancePolicies.endDate,
      status:       companyInsurancePolicies.status,
      plate:        companyAssets.plate,
    })
    .from(companyInsurancePolicies)
    .leftJoin(companyAssets, eq(companyAssets.id, companyInsurancePolicies.assetId))
    .where(and(...conds))
    .orderBy(asc(companyInsurancePolicies.endDate))
    .limit(500);

  const rows = rowsRaw.map((r) => ({
    id:           toCanvasId("insurance", r.id),
    plate:        r.plate ?? null,
    insurer:      r.insurer ?? null,
    policyNumber: r.policyNumber ?? null,
    coverage:     r.coverage ?? null,
    startDate:    r.startDate ?? null,
    endDate:      r.endDate ?? null,
    status:       r.status ?? null,
  }));

  const t = trunc(rows);
  return {
    columns: [
      { key: "plate",        label: "Vehículo",    type: "string" },
      { key: "insurer",      label: "Aseguradora", type: "string" },
      { key: "policyNumber", label: "Póliza",      type: "string" },
      { key: "coverage",     label: "Cobertura",   type: "string" },
      { key: "startDate",    label: "Inicio",      type: "date" },
      { key: "endDate",      label: "Vencimiento", type: "date" },
      { key: "status",       label: "Estado",      type: "string" },
    ],
    rows:    t.rows,
    warning: t.warning,
  };
}

// ─── Peajes ────────────────────────────────────────────────────────────────

async function fetchPeajes(input: CanvasRowsInput): Promise<CanvasRows> {
  const conds = [
    eq(companyTollEntries.companyId, input.companyId),
    gte(companyTollEntries.date, input.fechaDesde),
    lte(companyTollEntries.date, input.fechaHasta),
  ];
  if (input.entityKind === "asset" && input.entityIds.length > 0) {
    conds.push(inArray(companyTollEntries.assetId, input.entityIds));
  } else if (input.entityKind === "driver" && input.entityIds.length > 0) {
    conds.push(inArray(companyTollEntries.driverId, input.entityIds));
  }

  const rowsRaw = await db
    .select({
      id:        companyTollEntries.id,
      date:      companyTollEntries.date,
      tollName:  companyTollEntries.tollName,
      amount:    companyTollEntries.amount,
      route:     companyTollEntries.route,
      category:  companyTollEntries.category,
      plate:     companyAssets.plate,
    })
    .from(companyTollEntries)
    .leftJoin(companyAssets, eq(companyAssets.id, companyTollEntries.assetId))
    .where(and(...conds))
    .orderBy(desc(companyTollEntries.date))
    .limit(500);

  const rows = rowsRaw.map((r) => ({
    id:       toCanvasId("toll", r.id),
    date:     r.date ?? null,
    plate:    r.plate ?? null,
    tollName: r.tollName ?? null,
    category: r.category ?? null,
    route:    r.route ?? null,
    amount:   num(r.amount),
  }));

  const t = trunc(rows);
  return {
    columns: [
      { key: "date",     label: "Fecha",     type: "date" },
      { key: "plate",    label: "Vehículo",  type: "string" },
      { key: "tollName", label: "Peaje",     type: "string" },
      { key: "category", label: "Categoría", type: "string" },
      { key: "route",    label: "Ruta",      type: "string" },
      { key: "amount",   label: "Monto",     type: "currency" },
    ],
    rows:    t.rows,
    warning: t.warning,
  };
}

// ─── Asignaciones ──────────────────────────────────────────────────────────

async function fetchAsignaciones(input: CanvasRowsInput): Promise<CanvasRows> {
  const conds = [
    eq(companyAssignments.companyId, input.companyId),
    // Cualquier asignación que se superponga con el rango:
    // startDate <= hasta AND (endDate IS NULL OR endDate >= desde)
    sql`${companyAssignments.startDate} <= ${input.fechaHasta}`,
    sql`(${companyAssignments.endDate} IS NULL OR ${companyAssignments.endDate} >= ${input.fechaDesde})`,
  ];
  if (input.entityKind === "asset" && input.entityIds.length > 0) {
    conds.push(inArray(companyAssignments.assetId, input.entityIds));
  } else if (input.entityKind === "driver" && input.entityIds.length > 0) {
    conds.push(inArray(companyAssignments.driverId, input.entityIds));
  }

  const rowsRaw = await db
    .select({
      id:        companyAssignments.id,
      startDate: companyAssignments.startDate,
      endDate:   companyAssignments.endDate,
      status:    companyAssignments.status,
      plate:     companyAssets.plate,
      driverFirst: companyDrivers.firstName,
      driverLast:  companyDrivers.lastName,
    })
    .from(companyAssignments)
    .leftJoin(companyAssets, eq(companyAssets.id, companyAssignments.assetId))
    .leftJoin(companyDrivers, eq(companyDrivers.id, companyAssignments.driverId))
    .where(and(...conds))
    .orderBy(desc(companyAssignments.startDate))
    .limit(500);

  const rows = rowsRaw.map((r) => ({
    id:        toCanvasId("assignment", r.id),
    plate:     r.plate ?? null,
    driver:    [r.driverFirst, r.driverLast].filter(Boolean).join(" ") || null,
    startDate: r.startDate ?? null,
    endDate:   r.endDate ?? null,
    status:    r.status ?? null,
  }));

  const t = trunc(rows);
  return {
    columns: [
      { key: "plate",     label: "Vehículo",  type: "string" },
      { key: "driver",    label: "Conductor", type: "string" },
      { key: "startDate", label: "Inicio",    type: "date" },
      { key: "endDate",   label: "Fin",       type: "date" },
      { key: "status",    label: "Estado",    type: "string" },
    ],
    rows:    t.rows,
    warning: t.warning,
  };
}

// ─── Helpers para IDs prefijados ──────────────────────────────────────────

const PREFIX: Record<string, string> = {
  fuel:        "fuel",
  maintenance: "maintenance",
  asset:       "asset",
  driver:      "driver",
  checklist:   "checklist",
  alert:       "alert",
  "ac-service": "ac-service",
  insurance:   "insurance",
  toll:        "toll",
  assignment:  "assignment",
};

function toCanvasId(kind: keyof typeof PREFIX, id: number): string {
  return `${PREFIX[kind]}-${id}`;
}