// routes/company/search.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v6 — Buscador global.
//
// GET /api/company/:id/search?q=texto&tipo=vehiculo|conductor|...
//
// Busca en paralelo en todos los módulos y devuelve una lista
// normalizada de resultados. Cada resultado tiene:
//   { kind, id, label, sublabel, href, score, meta }
//
// Donde:
//   - kind: "vehiculo" | "conductor" | "mantenimiento" | "alerta" | "checklist" | "autorizacion" | "asignacion" | "combustible" | "peaje" | "taller" | "proveedor" | "sede" | "seguro" | "aire"
//   - id: ID numérico o prefijado para navegar al detalle
//   - label: línea principal (placa, nombre, título)
//   - sublabel: línea secundaria (descripción, estado, fecha)
//   - href: ruta del frontend para abrir el detalle
//   - score: 0-100, qué tan bueno es el match
//   - meta: info extra (color del badge, icono, etc)
//
// El frontend usa esto desde el header (input "Search or type command")
// y al hacer click en un resultado navega a `href` y abre el modal/detalle.
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { and, eq, or, sql, ilike, desc, inArray, gte, isNotNull } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyAssets,
  companyDrivers,
  companyMaintenanceRecords,
  companyAlerts,
  companyChecklists,
  companyExitAuthorizations,
  companyAssignments,
  companyFuelEntries,
  companyTollEntries,
  companyWorkshops,
  companySuppliers,
  companySites,
  companyInsurancePolicies,
  companyAcUnits,
} from '../../db/schema/operational';
import { requireModule } from '../../middlewares/requireModule';
import { toId } from '../../lib/ids';

const router = Router({ mergeParams: true });

// ── Tipos ───────────────────────────────────────────────────────────

type SearchKind =
  | 'vehiculo' | 'conductor' | 'mantenimiento' | 'alerta'
  | 'checklist' | 'autorizacion' | 'asignacion'
  | 'combustible' | 'peaje' | 'taller' | 'proveedor'
  | 'sede' | 'seguro' | 'aire';

interface SearchHit {
  kind: SearchKind;
  id: number;
  label: string;       // línea principal
  sublabel?: string;   // línea secundaria
  href: string;        // ruta del frontend
  score: number;       // 0-100
  meta?: Record<string, unknown>;
}

const ALL_KINDS: SearchKind[] = [
  'vehiculo', 'conductor', 'mantenimiento', 'alerta',
  'checklist', 'autorizacion', 'asignacion',
  'combustible', 'peaje', 'taller', 'proveedor',
  'sede', 'seguro', 'aire',
];

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Calcula un score 0-100 según qué tan bien matchea el texto.
 * 100 = exacto, 80 = empieza con, 60 = contiene, 40 = contiene en sublabel.
 */
function scoreText(needle: string, ...haystacks: Array<string | null | undefined>): number {
  const n = needle.toLowerCase().trim();
  if (!n) return 0;
  for (const h of haystacks) {
    if (!h) continue;
    const text = String(h).toLowerCase();
    if (text === n) return 100;
    if (text.startsWith(n)) return 85;
    if (text.includes(n)) return 65;
  }
  return 0;
}

/** Helper: filtra hits por score mínimo y ordena. */
function finalize(hits: SearchHit[], limit: number): SearchHit[] {
  return hits
    .filter((h) => h.score >= 30) // descarta matches muy flojos
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── Handlers por módulo (cada uno hace su propio search) ────────────

async function searchVehiculos(companyId: number, q: string): Promise<SearchHit[]> {
  // jul 2026 — match por code, plate, name. Sin trigram (no está
  // instalado). Usamos ILIKE con wildcards.
  const pattern = `%${q}%`;
  const rows = await db
    .select({
      id: companyAssets.id,
      code: companyAssets.code,
      plate: companyAssets.plate,
      name: companyAssets.name,
      status: companyAssets.status,
    })
    .from(companyAssets)
    .where(and(
      eq(companyAssets.companyId, companyId),
      or(
        ilike(companyAssets.code, pattern),
        ilike(companyAssets.plate, pattern),
        ilike(companyAssets.name, pattern),
      )!,
    ))
    .limit(20);

  return rows.map((r) => {
    const score = Math.max(
      scoreText(q, r.plate),
      scoreText(q, r.code),
      scoreText(q, r.name),
    );
    return {
      kind: 'vehiculo',
      id: r.id,
      label: r.plate ? `${r.plate} — ${r.name}` : r.name,
      sublabel: `Estado: ${r.status} · Código: ${r.code}`,
      href: `/flotas?assetId=${toId('asset', r.id)}&open=1`,
      score,
      meta: { status: r.status, code: r.code, plate: r.plate },
    };
  });
}

async function searchConductores(companyId: number, q: string): Promise<SearchHit[]> {
  const pattern = `%${q}%`;
  const rows = await db
    .select({
      id: companyDrivers.id,
      firstName: companyDrivers.firstName,
      lastName: companyDrivers.lastName,
      code: companyDrivers.code,
      licenseNumber: companyDrivers.licenseNumber,
      status: companyDrivers.status,
    })
    .from(companyDrivers)
    .where(and(
      eq(companyDrivers.companyId, companyId),
      or(
        ilike(companyDrivers.firstName, pattern),
        ilike(companyDrivers.lastName, pattern),
        ilike(companyDrivers.code, pattern),
        ilike(companyDrivers.licenseNumber, pattern),
      )!,
    ))
    .limit(20);

  return rows.map((r) => {
    const fullName = [r.firstName, r.lastName].filter(Boolean).join(' ');
    const score = Math.max(
      scoreText(q, fullName),
      scoreText(q, r.code),
      scoreText(q, r.licenseNumber),
    );
    return {
      kind: 'conductor',
      id: r.id,
      label: fullName || '(sin nombre)',
      sublabel: `Código: ${r.code} · Licencia: ${r.licenseNumber ?? '—'} · ${r.status}`,
      href: `/operaciones/conductores?driverId=${toId('driver', r.id)}&open=1`,
      score,
    };
  });
}

async function searchMantenimientos(companyId: number, q: string): Promise<SearchHit[]> {
  const pattern = `%${q}%`;
  const rows = await db
    .select({
      id: companyMaintenanceRecords.id,
      title: companyMaintenanceRecords.title,
      status: companyMaintenanceRecords.status,
      scheduledFor: companyMaintenanceRecords.scheduledFor,
      assetId: companyMaintenanceRecords.assetId,
      assetPlate: companyAssets.plate,
      assetName: companyAssets.name,
    })
    .from(companyMaintenanceRecords)
    .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
    .where(and(
      eq(companyMaintenanceRecords.companyId, companyId),
      or(
        ilike(companyMaintenanceRecords.title, pattern),
        ilike(companyMaintenanceRecords.description, pattern),
        ilike(companyMaintenanceRecords.notes, pattern),
        ilike(companyAssets.plate, pattern),
        ilike(companyAssets.name, pattern),
      )!,
    ))
    .orderBy(desc(companyMaintenanceRecords.scheduledFor))
    .limit(20);

  return rows.map((r) => {
    const score = Math.max(
      scoreText(q, r.title),
      scoreText(q, r.assetPlate),
      scoreText(q, r.assetName),
    );
    const vehLabel = r.assetPlate ? `${r.assetPlate}${r.assetName ? ' — ' + r.assetName : ''}` : 'Sin vehículo';
    return {
      kind: 'mantenimiento',
      id: r.id,
      label: r.title || `Mantenimiento #${r.id}`,
      sublabel: `${vehLabel} · ${r.status} · ${r.scheduledFor?.slice(0, 10) ?? '—'}`,
      href: `/mantenimiento?maintenanceId=${toId('maintenance', r.id)}&open=1`,
      score,
    };
  });
}

async function searchAlertas(companyId: number, q: string): Promise<SearchHit[]> {
  const pattern = `%${q}%`;
  const rows = await db
    .select({
      id: companyAlerts.id,
      title: companyAlerts.title,
      severity: companyAlerts.severity,
      status: companyAlerts.status,
      type: companyAlerts.type,
    })
    .from(companyAlerts)
    .where(and(
      eq(companyAlerts.companyId, companyId),
      or(
        ilike(companyAlerts.title, pattern),
        ilike(companyAlerts.type, pattern),
      )!,
    ))
    .orderBy(desc(companyAlerts.createdAt))
    .limit(20);

  return rows.map((r) => {
    const score = scoreText(q, r.title, r.type);
    return {
      kind: 'alerta',
      id: r.id,
      label: r.title,
      sublabel: `${r.severity} · ${r.status} · ${r.type ?? 'Manual'}`,
      href: `/alertas?alertId=${toId('alert', r.id)}&open=1`,
      score,
      meta: { severity: r.severity, status: r.status },
    };
  });
}

async function searchChecklists(companyId: number, q: string): Promise<SearchHit[]> {
  const pattern = `%${q}%`;
  const rows = await db
    .select({
      id: companyChecklists.id,
      date: companyChecklists.date,
      status: companyChecklists.status,
      targetLabel: companyChecklists.targetLabel,
      summary: companyChecklists.summary,
      assetPlate: companyAssets.plate,
      assetName: companyAssets.name,
    })
    .from(companyChecklists)
    .leftJoin(companyAssets, eq(companyAssets.id, companyChecklists.assetId))
    .where(and(
      eq(companyChecklists.companyId, companyId),
      or(
        ilike(companyChecklists.targetLabel, pattern),
        ilike(companyChecklists.summary, pattern),
        ilike(companyAssets.plate, pattern),
        ilike(companyAssets.name, pattern),
      )!,
    ))
    .orderBy(desc(companyChecklists.date))
    .limit(20);

  return rows.map((r) => {
    const score = Math.max(
      scoreText(q, r.targetLabel),
      scoreText(q, r.summary),
      scoreText(q, r.assetPlate),
      scoreText(q, r.assetName),
    );
    const veh = r.assetPlate ?? 'Sin vehículo';
    return {
      kind: 'checklist',
      id: r.id,
      label: r.targetLabel || `Checklist #${r.id}`,
      sublabel: `${veh} · ${r.status} · ${r.date?.toString().slice(0, 10) ?? ''}`,
      href: `/checklist?checklistId=${toId('checklist', r.id)}&open=1`,
      score,
    };
  });
}

async function searchAutorizaciones(companyId: number, q: string): Promise<SearchHit[]> {
  const pattern = `%${q}%`;
  const rows = await db
    .select({
      id: companyExitAuthorizations.id,
      status: companyExitAuthorizations.status,
      notes: companyExitAuthorizations.notes,
      vehicleCondition: companyExitAuthorizations.vehicleCondition,
      driverName: companyExitAuthorizations.driverName,
      assetPlate: companyAssets.plate,
    })
    .from(companyExitAuthorizations)
    .leftJoin(companyAssets, eq(companyAssets.id, companyExitAuthorizations.assetId))
    .where(and(
      eq(companyExitAuthorizations.companyId, companyId),
      or(
        ilike(companyExitAuthorizations.driverName, pattern),
        ilike(companyAssets.plate, pattern),
        ilike(companyExitAuthorizations.notes, pattern),
      )!,
    ))
    .orderBy(desc(companyExitAuthorizations.id))
    .limit(20);

  return rows.map((r) => {
    const score = Math.max(
      scoreText(q, r.driverName),
      scoreText(q, r.assetPlate),
      scoreText(q, r.notes),
    );
    return {
      kind: 'autorizacion',
      id: r.id,
      label: `Autorización #${r.id} — ${r.driverName ?? '—'}`,
      sublabel: `${r.assetPlate ?? '—'} · ${r.status}`,
      href: `/autorizaciones?authId=${toId('exit-authorization', r.id)}&open=1`,
      score,
    };
  });
}

async function searchTalleres(companyId: number, q: string): Promise<SearchHit[]> {
  const pattern = `%${q}%`;
  const rows = await db
    .select({ id: companyWorkshops.id, name: companyWorkshops.name, address: companyWorkshops.address, contactName: companyWorkshops.contactName })
    .from(companyWorkshops)
    .where(and(
      eq(companyWorkshops.companyId, companyId),
      or(ilike(companyWorkshops.name, pattern), ilike(companyWorkshops.address, pattern), ilike(companyWorkshops.contactName, pattern))!,
    ))
    .limit(20);
  return rows.map((r) => ({
    kind: 'taller' as const,
    id: r.id,
    label: r.name,
    sublabel: r.address ? `Dir: ${r.address}` : (r.contactName ? `Contacto: ${r.contactName}` : undefined),
    href: `/gestion/talleres?workshopId=${toId('workshop', r.id)}&open=1`,
    score: scoreText(q, r.name, r.address, r.contactName),
  }));
}

async function searchProveedores(companyId: number, q: string): Promise<SearchHit[]> {
  const pattern = `%${q}%`;
  const rows = await db
    .select({ id: companySuppliers.id, name: companySuppliers.name, nit: companySuppliers.nit })
    .from(companySuppliers)
    .where(and(
      eq(companySuppliers.companyId, companyId),
      or(ilike(companySuppliers.name, pattern), ilike(companySuppliers.nit, pattern))!,
    ))
    .limit(20);
  return rows.map((r) => ({
    kind: 'proveedor' as const,
    id: r.id,
    label: r.name,
    sublabel: r.nit ? `NIT: ${r.nit}` : undefined,
    href: `/gestion/proveedores?supplierId=${toId('supplier', r.id)}&open=1`,
    score: scoreText(q, r.name, r.nit),
  }));
}

async function searchSedes(companyId: number, q: string): Promise<SearchHit[]> {
  const pattern = `%${q}%`;
  const rows = await db
    .select({ id: companySites.id, name: companySites.name, city: companySites.city })
    .from(companySites)
    .where(and(
      eq(companySites.companyId, companyId),
      or(ilike(companySites.name, pattern), ilike(companySites.city, pattern))!,
    ))
    .limit(20);
  return rows.map((r) => ({
    kind: 'sede' as const,
    id: r.id,
    label: r.name,
    sublabel: r.city ? `Ciudad: ${r.city}` : undefined,
    href: `/gestion/sedes?siteId=${toId('site', r.id)}&open=1`,
    score: scoreText(q, r.name, r.city),
  }));
}

async function searchSeguros(companyId: number, q: string): Promise<SearchHit[]> {
  const pattern = `%${q}%`;
  const rows = await db
    .select({
      id: companyInsurancePolicies.id,
      insurer: companyInsurancePolicies.insurer,
      policyNumber: companyInsurancePolicies.policyNumber,
      assetPlate: companyAssets.plate,
    })
    .from(companyInsurancePolicies)
    .leftJoin(companyAssets, eq(companyAssets.id, companyInsurancePolicies.assetId))
    .where(and(
      eq(companyInsurancePolicies.companyId, companyId),
      or(
        ilike(companyInsurancePolicies.insurer, pattern),
        ilike(companyInsurancePolicies.policyNumber, pattern),
        ilike(companyAssets.plate, pattern),
      )!,
    ))
    .limit(20);
  return rows.map((r) => ({
    kind: 'seguro' as const,
    id: r.id,
    label: `${r.insurer} — ${r.policyNumber}`,
    sublabel: r.assetPlate ? `Vehículo: ${r.assetPlate}` : undefined,
    href: `/gestion/seguros?policyId=${toId('insurance-policy', r.id)}&open=1`,
    score: scoreText(q, r.insurer, r.policyNumber, r.assetPlate),
  }));
}

async function searchAires(companyId: number, q: string): Promise<SearchHit[]> {
  const pattern = `%${q}%`;
  const rows = await db
    .select({
      id: companyAcUnits.id,
      name: companyAcUnits.name,
      brand: companyAcUnits.brand,
      model: companyAcUnits.model,
      serial: companyAcUnits.serial,
    })
    .from(companyAcUnits)
    .where(and(
      eq(companyAcUnits.companyId, companyId),
      or(
        ilike(companyAcUnits.name, pattern),
        ilike(companyAcUnits.brand, pattern),
        ilike(companyAcUnits.model, pattern),
        ilike(companyAcUnits.serial, pattern),
      )!,
    ))
    .limit(20);
  return rows.map((r) => ({
    kind: 'aire' as const,
    id: r.id,
    label: r.name,
    sublabel: [r.brand, r.model, r.serial].filter(Boolean).join(' · '),
    href: `/aires-acondicionados?acUnitId=${toId('ac-unit', r.id)}&open=1`,
    score: scoreText(q, r.name, r.brand, r.model, r.serial),
  }));
}

// ── Handler principal ───────────────────────────────────────────────

const querySchema = z.object({
  q: z.string().trim().min(2).max(80),
  // Si viene `tipo`, filtramos solo ese módulo. Si no, buscamos en
  // todos (excepto los que son muchos: combustible/peaje que devuelven
  // muchas filas por carga). El frontend manda uno o varios separados
  // por coma (ej. "vehiculo,conductor").
  tipo: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get('/', requireModule('gestion', 'flotas'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: {
          codigo: 'VALIDATION_ERROR',
          mensaje: 'Parámetros inválidos. q es obligatorio (2-80 caracteres). tipo y limit son opcionales.',
          requestId: `req-${Date.now()}`,
        },
      });
    }
    const { q, tipo, limit } = parsed.data;

    const kindsWanted: SearchKind[] = (tipo
      ? tipo.split(',').map((k) => k.trim()).filter((k): k is SearchKind => ALL_KINDS.includes(k as SearchKind))
      : ALL_KINDS);

    // jul 2026 — No buscamos en combustible/peaje por defecto porque
    // cada carga es un row separado. Si el user lo pide explícito (tipo=combustible
    // o tipo=peaje), lo hacemos. Para el resto, sí.
    const skipByDefault: SearchKind[] = ['combustible', 'peaje'];
    const effectiveKinds = kindsWanted.filter(
      (k) => skipByDefault.includes(k) ? kindsWanted.length === 1 : true,
    );

    // Búsqueda en paralelo. Cada buscador está envuelto en try/catch
    // para que un error en uno (ej. una columna null en una fila vieja)
    // no rompa toda la respuesta. Si un buscador falla, devuelve [].
    const safeSearch = async (name: string, fn: () => Promise<SearchHit[]>): Promise<SearchHit[]> => {
      try { return await fn(); } catch (err) {
        // jul 2026 v6 — Logueamos el nombre del buscador + el error
        // para que sea fácil diagnosticar cuál falla. La query de
        // búsqueda siempre devuelve OK al cliente (con los otros
        // resultados), pero queremos ver el error en el log.
        console.warn(`[search] buscador "${name}" falló para q="${q}":`, (err as Error).message);
        return [];
      }
    };

    const tasks: Array<Promise<SearchHit[]>> = [];
    if (effectiveKinds.includes('vehiculo'))     tasks.push(safeSearch('vehiculo',     () => searchVehiculos(companyId, q)));
    if (effectiveKinds.includes('conductor'))    tasks.push(safeSearch('conductor',    () => searchConductores(companyId, q)));
    if (effectiveKinds.includes('mantenimiento')) tasks.push(safeSearch('mantenimiento', () => searchMantenimientos(companyId, q)));
    if (effectiveKinds.includes('alerta'))       tasks.push(safeSearch('alerta',       () => searchAlertas(companyId, q)));
    if (effectiveKinds.includes('checklist'))    tasks.push(safeSearch('checklist',    () => searchChecklists(companyId, q)));
    if (effectiveKinds.includes('autorizacion')) tasks.push(safeSearch('autorizacion', () => searchAutorizaciones(companyId, q)));
    if (effectiveKinds.includes('taller'))       tasks.push(safeSearch('taller',       () => searchTalleres(companyId, q)));
    if (effectiveKinds.includes('proveedor'))    tasks.push(safeSearch('proveedor',    () => searchProveedores(companyId, q)));
    if (effectiveKinds.includes('sede'))         tasks.push(safeSearch('sede',         () => searchSedes(companyId, q)));
    if (effectiveKinds.includes('seguro'))       tasks.push(safeSearch('seguro',       () => searchSeguros(companyId, q)));
    if (effectiveKinds.includes('aire'))         tasks.push(safeSearch('aire',         () => searchAires(companyId, q)));

    // jul 2026 v6 — Promise.all rechaza con la primera promesa
    // rechazada. Si un buscador tira, queremos devolver los otros
    // resultados igual (sin mostrar 500). Usamos allSettled que
    // nunca rechaza y filtramos solo los resultados exitosos.
    const settled = await Promise.allSettled(tasks);
    const flat: SearchHit[] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled') flat.push(...r.value);
      // Los rejected ya quedaron logueados por safeSearch
    }
    const final = finalize(flat, limit);

    res.json({
      ok: true,
      data: {
        query: q,
        tipos: effectiveKinds,
        total: final.length,
        resultados: final,
      },
      meta: {
        requestId: `req-${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
      resumenTexto: final.length === 0
        ? `Sin resultados para "${q}".`
        : `${final.length} resultado(s) para "${q}". Click para abrir el detalle.`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
