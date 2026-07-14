// lib/ai/tools/vehiculos.ts
//
// Tool: getVehiculos
// Lista los vehículos de la empresa con filtros opcionales.

import { z } from 'zod';
import { and, eq, ilike, inArray } from 'drizzle-orm';
import { db } from '../../../db/client';
import { companyAssets } from '../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from './registry';
import { tolerantString } from '../schema-helpers';

// jul 2026 — el ENUM real de `company_assets.status` es:
//   ['Operativo', 'En mantenimiento', 'Fuera de servicio']
// (definido en `assetStatusEnum` en db/schema/operational.ts).
// Antes este tool aceptaba también 'Disponible' / 'En uso' / 'No disponible'
// en el schema, lo cual hacía que el LLM los usara y PG reventara con
// `invalid input value for enum` (500). Ahora el schema está sincronizado
// con el ENUM y los sinónimos se normalizan silenciosamente.
const ASSET_STATUS = ['Operativo', 'En mantenimiento', 'Fuera de servicio'] as const;
type AssetStatus = (typeof ASSET_STATUS)[number];

// Sinónimos coloquiales que el LLM tiende a usar (español, jerga de flota).
// Los mapeamos al ENUM real y/o activamos un flag de filtro adicional.
const STATUS_SYNONYMS: Record<string, AssetStatus> = {
  'disponible':  'Operativo',
  'disponibles': 'Operativo',
  'libre':       'Operativo',
  'libres':      'Operativo',
  'en uso':      'Operativo',
  'ocupado':     'Operativo',
  'ocupados':    'Operativo',
  'fuera':       'Fuera de servicio',
  'fuera de servicio': 'Fuera de servicio',
  'fuera de servicios': 'Fuera de servicio',
  'fuera de uso': 'Fuera de servicio',
  'no disponible': 'Fuera de servicio',
  'no disponibles': 'Fuera de servicio',
  'en mantenimiento': 'En mantenimiento',
  'mantenimiento':  'En mantenimiento',
  'taller':        'En mantenimiento',
  'operativo':     'Operativo',
  'operativos':    'Operativo',
  'activo':        'Operativo',
  'activos':       'Operativo',
};

function normalizeEstado(raw: string): AssetStatus | null {
  const k = raw.trim().toLowerCase();
  if ((ASSET_STATUS as readonly string[]).map(s => s.toLowerCase()).includes(k)) {
    return raw as AssetStatus;
  }
  return STATUS_SYNONYMS[k] ?? null;
}

// Nota: el campo `limit` se removió del schema público porque el LLM
// (llama-3.1-8b-instant) tiende a generar `limit: 0` que Groq rechaza
// con 400. El backend usa siempre 500 (suficiente para listas de flota).
//
// `estado` se modela como string libre (no enum) para que Groq pueda mandar
// sinónimos coloquiales como "Disponible" / "En uso" / "Fuera de uso" sin
// que zod rompa la validación. La normalización a los valores reales del
// ENUM se hace en `execute` con `normalizeEstado`. Si llega un valor que
// no se puede traducir, se ignora (no rompe la query con PG).
const argsSchema = z.object({
  estado:  z.string().optional(),
  placa:   tolerantString().optional(),
  marca:   tolerantString().optional(),
});

type Args = z.infer<typeof argsSchema>;

export const vehiculosTool: ToolDefinition<Args> = {
  name:        'getVehiculos',
  description:
    'Lista los vehículos de la empresa. Filtros opcionales: estado (Operativo / En mantenimiento / Fuera de servicio), placa (búsqueda parcial), marca. Devuelve placa, marca, modelo, año, estado y odómetro.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsSchema,

  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyAssets.companyId, ctx.empresaId)];

    // Normalizamos `estado` a los valores del ENUM. Si el LLM mandó un
    // sinónimo (Disponible, En uso, etc.) lo traducimos; si mandó un
    // valor irreconocible, lo ignoramos en vez de romper la query.
    if (args.estado) {
      // Aceptamos string suelto o array de strings. Si Groq lo manda como
      // string separado por comas (raro pero pasa), lo spliteamos.
      const rawList: string[] = Array.isArray(args.estado)
        ? args.estado
        : typeof args.estado === 'string'
          ? (args.estado.includes(',') ? args.estado.split(',') : [args.estado])
          : [];
      const normalized = rawList
        .map(normalizeEstado)
        .filter((v): v is AssetStatus => v !== null);
      if (normalized.length > 0) {
        const unique = Array.from(new Set(normalized));
        where.push(
          unique.length === 1
            ? eq(companyAssets.status, unique[0]!)
            : inArray(companyAssets.status, unique),
        );
      }
    }
    if (args.placa) where.push(ilike(companyAssets.plate, `%${args.placa}%`));
    if (args.marca) where.push(ilike(companyAssets.brand, `%${args.marca}%`));

    const rows = await db
      .select({
        id:        companyAssets.id,
        placa:     companyAssets.plate,
        nombre:    companyAssets.name,
        marca:     companyAssets.brand,
        modelo:    companyAssets.model,
        año:       companyAssets.year,
        estado:    companyAssets.status,
        tipo:      companyAssets.assetType,
      })
      .from(companyAssets)
      .where(and(...where))
      .orderBy(companyAssets.plate)
      .limit(500);

    return {
      data: rows,
      total: rows.length,
      note: `Mostrando ${rows.length} vehículo(s).`,
    };
  },
};