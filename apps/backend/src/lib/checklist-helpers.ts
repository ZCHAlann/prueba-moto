// lib/checklist-helpers.ts
// ─────────────────────────────────────────────────────────────────────
// Helpers compartidos entre el router de /checklists y los crons que
// derivan vencidos / procesan reautorizaciones.
// ─────────────────────────────────────────────────────────────────────
//
// Funciones:
//   - `deriveAssetsForCategory`: aplica las reglas de `scopeKind` de la
//     categoría para devolver la lista de activos que aplican.
//   - `getUserSiteId`: placeholder para resolver la sede del usuario
//     (hoy siempre null — la columna `companyUsers.siteId` no existe
//     aún en el schema).
//
// Movido desde routes/company/checklists.ts para que el cron
// `checklist-overdue` pueda usar exactamente la misma lógica sin
// duplicarla.

import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { companyAssets, companyChecklistCategories } from '../db/schema/operational';

/**
 * Devuelve los assets aplicables a la categoría según su scopeKind.
 * - 'pick'         -> [] (el usuario elige, no pre-derivamos)
 * - 'site_assets'  -> todos los Vehiculo de la sede del usuario
 * - 'asset_type'   -> todos los del tipo (filtrado por sede si scopeSiteId)
 */
export async function deriveAssetsForCategory(
  companyId: number,
  cat: typeof companyChecklistCategories.$inferSelect,
  userSiteId: number | null,
): Promise<Array<{ id: number; name: string; plate: string | null; siteId: number | null }>> {
  if (cat.scopeKind === 'pick') return [];

  if (cat.scopeKind === 'site_assets') {
    const siteId = cat.scopeSiteId ?? userSiteId;
    if (!siteId) {
      // Sin sede ni en el usuario ni en la categoría: fallback a todos los
      // vehículos de la empresa (no falla).
      return db
        .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate, siteId: companyAssets.siteId })
        .from(companyAssets)
        .where(and(eq(companyAssets.companyId, companyId), eq(companyAssets.assetType, 'Vehiculo')))
        .orderBy(companyAssets.name);
    }
    return db
      .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate, siteId: companyAssets.siteId })
      .from(companyAssets)
      .where(and(eq(companyAssets.companyId, companyId), eq(companyAssets.siteId, siteId), eq(companyAssets.assetType, 'Vehiculo')))
      .orderBy(companyAssets.name);
  }

  // 'asset_type'
  // El schema de assets tiene assetType: 'Vehiculo' | 'Motor' | 'Maquinaria' | 'Planta electrica'.
  // El scope de la plantilla usa CHECKLIST_TARGET_KINDS. Mapeamos a los valores válidos.
  // (Nota: 'Motor' fue removido del enum público en 2026-06 porque se duplicaba con 'Vehiculo'.)
  const ASSET_TYPE_MAP: Record<string, 'Vehiculo' | 'Maquinaria' | 'Planta electrica'> = {
    Vehiculo: 'Vehiculo',
    Generador: 'Planta electrica',
    AireAcondicionado: 'Maquinaria',
    Otro: 'Maquinaria',
  };
  const rawType = cat.scopeAssetType ?? 'Vehiculo';
  const assetType = ASSET_TYPE_MAP[rawType] ?? 'Vehiculo';
  const conds = [eq(companyAssets.companyId, companyId), eq(companyAssets.assetType, assetType)];
  if (cat.scopeSiteId) conds.push(eq(companyAssets.siteId, cat.scopeSiteId));
  return db
    .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate, siteId: companyAssets.siteId })
    .from(companyAssets)
    .where(and(...conds))
    .orderBy(companyAssets.name);
}

/**
 * Busca la sede del usuario. companyUsers aún no tiene siteId en el schema,
 * así que por ahora devolvemos null y el caller hace fallback.
 */
export async function getUserSiteId(_companyId: number, _userSub: string): Promise<number | null> {
  return null;
}