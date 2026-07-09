// ============================================================================
// lib/invoices-sync.ts
// ============================================================================
// Sincroniza filas de `company_invoices` (módulo Finanzas) con la fuente
// operativa correspondiente (combustible, peaje o mantenimiento).
//
// Esta lib es la "fuente de verdad" para el ledger: cuando un operador
// guarda/edita un fuel entry, toll entry o maintenance con su número de
// factura, el controller llama a una de las funciones de acá para que
// `company_invoices` quede consistente con la entity origen.
//
// Diseño:
//   • UPSERT por la unique key (company_id, source_module, source_entity_id,
//     source_attachment_key). NO borramos al editar: si llega un
//     invoiceNumber vacío o '—', BORRAMOS la fila (es lo que el operador
//     espera: borrar la factura del mantenimiento).
//   • Idempotente: correr syncX N veces con los mismos datos produce el
//     mismo estado final.
//   • Compatible con transactions: cada función acepta `tx` que puede ser
//     la `db` (top-level) o un `tx` (drizzle transaction). El backend
//     debe wrappear con `db.transaction(async tx => { ... })` SIEMPRE que
//     se combine con updates a la tabla fuente — sino, un fallo a mitad
//     puede dejar el ledger inconsistente.
//
// NO agregamos funciones de lectura acá — eso vive en
// `routes/company/invoices.ts` (Track 2, no en este archivo).
// ============================================================================

import { and, eq, sql } from 'drizzle-orm';
import { companyInvoices } from '../db/schema/operational';
import { toId } from './ids';

// ─── Tipos ──────────────────────────────────────────────────────────────────
//
// `DrizzleTx` es el union del "cliente principal" `db` (PostgresJsDatabase)
// y la "transacción" de drizzle (PostgresJsTransaction). Cualquiera de los
// dos puede pasarse a las funciones siguientes — la API de inserción es la
// misma.
//
// Definido local, no exportado: solo necesitamos el shape en inferencia, no
// queremos arrastrar tipos de drizzle-orm al mundo exterior.

type DrizzleTx = any;

export type InvoiceSourceModule =
  | 'combustible'
  | 'peajes'
  | 'mantenimiento'
  // jul 2026 v4 — Comprobantes subidos al cerrar un vale de Caja Chica.
  // El voucher actúa como source_entity_id (con prefijo 'voucher-' antes
  // de pasar al sync) y attachment_key = 'voucher-<id>'.
  | 'petty_cash';

export type InvoiceKind =
  | 'combustible'
  | 'peaje'
  | 'repuesto'
  | 'mano_obra'
  | 'lavada'
  | 'servicio'
  | 'otro';

export interface MaintenanceAttachmentLike {
  /** Slug/key opcional. Si falta, se genera del label o del index. */
  key?: string;
  url: string;
  label?: string;
  uploadedAt?: string;
  kind?: 'repuesto' | 'mano_obra' | 'lavada' | 'servicio' | 'otro';
  amount?: number | null;
  invoiceNumber?: string | null;
  /**
   * jul 2026 v3 — Flag EXPLICITO de "esto es una factura". Antes se
   * inferia por `invoiceNumber` no-vacío, pero con la numeración AUTO
   * el cliente ya no manda ese campo, así que necesitamos una señal
   * independiente para saber si el attachment genera fila en el ledger.
   * Si `isInvoice` es true → sync lo crea aunque `invoiceNumber` venga vacío.
   */
  isInvoice?: boolean;
  /**
   * FK lógica opcional al supplier del catálogo. Si se pasa, el
   * syncMaterialize forza el supplierId (FK) y el supplierName (denormalized)
   * en la fila del ledger. Si es null, el campo del ledger queda NULL.
   */
  supplierId?: number | null;
  /**
   * jul 2026 — ítems desglosados del comprobante. Persistidos en
   * `company_invoices.items` (jsonb).
   */
  items?: Array<{
    description: string;
    quantity: number | string;
    unitPrice: number | string;
    subtotal: number | string;
    imageUrl?: string | null;
    imagePending?: boolean;
  }>;
  /**
   * jul 2026 v3 — datos contextuales del comprobante.
   */
  ivaPercent?:   number | string | null;
  ivaAmount?:    number | string | null;
  workshopName?: string | null;
  workerName?:   string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip whitespace y caracteres invisibles para comparar "vacío vs lleno".
 * Aceptamos como vacío: '', '   ', '—', '–', 'N/A', 'n/a'.
 */
function isEmptyInvoiceNumber(raw: string | null | undefined): boolean {
  if (raw == null) return true;
  const s = String(raw).trim();
  if (!s) return true;
  // Guiones largos/medias y "N/A" sin información
  if (s === '—' || s === '–' || s === '-' || s === 'N/A' || s === 'n/a') return true;
  return false;
}

/**
 * Slugify un label para usar como `source_attachment_key` estable.
 * Resultado: lowercase, alfanumérico + guión, max 30 chars (la columna
 * permite 40 — dejamos margen).
 *
 * Si no hay label, devuelve `att-${index}`.
 */
function slugifyForKey(label: string | undefined, index: number): string {
  if (!label || !label.trim()) return `att-${index}`;
  const s = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  return s || `att-${index}`;
}

// ─── 1. syncSingleInvoice ───────────────────────────────────────────────────
//
// UPSERT para casos donde hay UNA sola factura por entity (combustible,
// peaje, o un mantenimiento con un único receipt importante).
//
// Casos de uso:
//   • POST /fuel-entries  → sync con sourceEntityId = fuel.id
//   • POST /toll-entries  → sync con sourceEntityId = toll.id
//   • POST /maintenances  (caso single invoice) → sync con key 'main'
//
// Comportamiento:
//   • invoiceNumber vacío → BORRA la fila existente y devuelve {deleted:true}.
//   • invoiceNumber presente → UPSERT y devuelve {id, created|updated}.
//
// Notas:
//   • La columna file_url se actualiza SOLO si viene (pasamos null cuando
//     no aplica). Si el operador quitó el archivo pero dejó el número, el
//     ledger queda con la factura vigente y sin archivo — eso es OK
//     (preservamos la trazabilidad aunque el PDF se haya perdido).
//   • `notes` opcional: si no se pasa, mantenemos el valor anterior (no se
//     borra al editar).

export interface SyncSingleInvoiceInput {
  invoiceNumber: string;
  invoiceDate: string | Date;
  amount: number | string;
  supplierName?: string | null;
  fileUrl?: string | null;
  fileMimeType?: string | null;
  kind?: InvoiceKind;
  supplierId?: number | null;
  items?: Array<{
    description: string;
    quantity: number | string;
    unitPrice: number | string;
    subtotal: number | string;
    imageUrl?: string | null;
    imagePending?: boolean;
  }>;
  /**
   * jul 2026 v3 — IVA no se calcula, lo ingresa el operador como campo
   * manual. ivaPercent es informativo (default 15 Ecuador), ivaAmount
   * es el valor en USD que ya le cobraron (input).
   */
  ivaPercent?: number | string | null;
  ivaAmount?:  number | string | null;
  /**
   * jul 2026 v3 — Total final ya con IVA incluido, input del usuario.
   * Si no viene, se usa `amount`.
   */
  total?: number | string | null;
  /** jul 2026 v3 — Para facturas de tipo mano_obra, nombre del taller. */
  workshopName?: string | null;
  /** jul 2026 v3 — Para facturas de tipo lavada, nombre del lavador. */
  workerName?: string | null;
}

export interface SyncSingleInvoiceResult {
  /** id del row en company_invoices (undefined si borramos). */
  id?: number;
  /** true si borramos la fila por invoiceNumber vacío. */
  deleted?: boolean;
  /** true si la fila es nueva (insert); false si actualizamos. */
  created?: boolean;
}

export async function syncSingleInvoice(opts: {
  tx: DrizzleTx;
  companyId: number;
  sourceModule: InvoiceSourceModule;
  sourceEntityId: number;
  data: SyncSingleInvoiceInput;
  attachmentKey?: string;
  currency?: string;
}): Promise<SyncSingleInvoiceResult> {
  const {
    tx,
    companyId,
    sourceModule,
    sourceEntityId,
    data,
    attachmentKey = 'main',
    currency = 'USD',
  } = opts;

  // jul 2026 v3 — Caso borrar SOLO si el caller explícitamente lo pide
  // (invoiceNumber con sentinel '__DELETE__' o flag delete en el data).
  // Antes esto borraba si invoiceNumber venia vacío, pero con la
  // numeración AUTO el cliente no manda ese campo, y un attachment nuevo
  // llegaba con invoiceNumber=undefined y se BORRABA el ledger por error.
  // Ahora `invoiceNumber` vacío o null = "autogenerar" (caso upsert).
  const emptyNumber = isEmptyInvoiceNumber(data.invoiceNumber);
  const explicitDelete = (data as any).__delete === true ||
                          String(data.invoiceNumber).trim() === '__DELETE__';

  if (emptyNumber && explicitDelete) {
    const del = await tx
      .delete(companyInvoices)
      .where(
        and(
          eq(companyInvoices.companyId, companyId),
          eq(companyInvoices.sourceModule, sourceModule),
          eq(companyInvoices.sourceEntityId, sourceEntityId),
          eq(companyInvoices.sourceAttachmentKey, attachmentKey),
        ),
      )
      .returning({ id: companyInvoices.id });

    return { deleted: true, id: del[0]?.id };
  }

  // ── Caso upsert ────────────────────────────────────────────────────────
  const invoiceDate =
    data.invoiceDate instanceof Date
      ? data.invoiceDate.toISOString().slice(0, 10)
      : String(data.invoiceDate).slice(0, 10);

  // jul 2026 v3 — calculo server-side: subtotal = Σ(items).
  // El IVA NO se calcula — el operador lo ingresa como campo manual
  // (lo que le cobraron en el comprobante real). Total = subtotal + iva
  // (también input manual o derivado de subtotal+iva en cliente).
  // Acá almacenamos lo que llega: subtotal auto, iva/total manuales.
  const itemsArr = Array.isArray(data.items) ? data.items : [];
  const computedSubtotal = itemsArr.reduce((acc, it) => {
    const s = Number((it as any).subtotal);
    return acc + (Number.isFinite(s) ? s : 0);
  }, 0);
  const ivaPct    = data.ivaPercent ?? null;        // si viene, lo guardamos
  const ivaAmount = data.ivaAmount != null
    ? Number(data.ivaAmount)
    : null;                                          // IVA en USD, input manual
  const total     = data.total != null
    ? Number(data.total)
    : (typeof data.amount === 'number' ? data.amount : Number(data.amount) || computedSubtotal);
  const amountStr = total.toFixed(2);

  // jul 2026 v3 — items jsonb con soporte para `imageUrl` (string) y
  // `imagePending` (bool — cuando true significa que el operador subió
  // una imagen en el modal pero el archivo aún no se subió a storage;
  // se materializa al cerrar la factura). El controller de mantenances
  // resuelve las imágenes pendientes antes del sync.
  const itemsJson = data.items !== undefined
    ? JSON.stringify(data.items)
    : null;

  // ── Numeración automática — jul 2026 v3 ───────────────────────────────
  // El `invoiceNumber` que llega del cliente se IGNORA; el server genera
  // uno nuevo basado en (company_id, source_module) usando
  // next_invoice_number(). Cuando ya existe una fila para esta UNIQUE
  // key (company, source, sourceEntityId, attachmentKey), conservamos
  // el `invoice_number` original para no romper la trazabilidad.
  const sourceMod = opts.sourceModule === 'peajes' ? 'toll' : (
    opts.sourceModule === 'combustible' ? 'fuel' : (
      opts.sourceModule === 'petty_cash' ? 'petty_cash' : 'maintenance'
    )
  );
  const existing = await tx
    .select({ id: companyInvoices.id, invoiceNumber: companyInvoices.invoiceNumber })
    .from(companyInvoices)
    .where(
      and(
        eq(companyInvoices.companyId, companyId),
        eq(companyInvoices.sourceModule, sourceModule),
        eq(companyInvoices.sourceEntityId, sourceEntityId),
        eq(companyInvoices.sourceAttachmentKey, attachmentKey),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await tx
      .update(companyInvoices)
      .set({
        kind: (data.kind as InvoiceKind) ?? 'otro',
        // Conservamos el invoice_number original. Si por algun motivo está
        // vacío, lo regeneramos.
        invoiceNumber: existing[0].invoiceNumber && existing[0].invoiceNumber.length > 0
          ? existing[0].invoiceNumber
          : sql`(SELECT next_invoice_number(${companyId}, ${sourceMod}))`,
        invoiceDate,
        amount: amountStr,
        currency,
        supplierName: data.supplierName ?? null,
        supplierId:
          data.supplierId === undefined
            ? sql`${companyInvoices.supplierId}`
            : data.supplierId,
        fileUrl:
          data.fileUrl === undefined
            ? sql`${companyInvoices.fileUrl}`
            : data.fileUrl,
        fileMimeType:
          data.fileMimeType === undefined
            ? sql`${companyInvoices.fileMimeType}`
            : data.fileMimeType,
        items: itemsJson === null ? sql`${companyInvoices.items}` : itemsJson,
        // v3 — subtotal auto desde items, iva/total manuales:
        subtotal:     computedSubtotal.toFixed(2),
        ivaPercent:   ivaPct !== null ? String(Number(ivaPct).toFixed(2)) : sql`${companyInvoices.ivaPercent}`,
        ivaAmount:    ivaAmount !== null ? ivaAmount.toFixed(2) : sql`${companyInvoices.ivaAmount}`,
        total:        total.toFixed(2),
        workshopName: data.workshopName ?? null,
        workerName:   data.workerName ?? null,
        updatedAt: sql`now()`,
      })
      .where(eq(companyInvoices.id, existing[0].id));
    return { id: existing[0].id, created: false };
  }

// INSERT — autogeneramos invoice_number con la funcion PL/pgSQL.
// jul 2026 v3 — Llamada separada (no sub-select inline) porque drizzle
// 0.30+ con postgres-js contaba mal los placeholders cuando se mezclan
// sub-selects SQL con params explícitos en .values(), y el INSERT fallaba
// con "Failed query" sin causa. La función sigue tomando el advisory lock
// y devuelve el número atómico.
  let nextInvoiceNumber: string;
  try {
    const execRes = await tx.execute(
      sql`SELECT next_invoice_number(${companyId}, ${sourceMod}) AS invoice_number`,
    );
    const rows = (execRes as any).rows ?? execRes;
    const first = Array.isArray(rows) ? rows[0] : undefined;
    nextInvoiceNumber = String(first?.invoice_number ?? first?.n ?? '');
  } catch (seqErr) {
    console.warn('[syncSingleInvoice] next_invoice_number falló, usando fallback:', (seqErr as Error).message);
    nextInvoiceNumber = `GEN-${Date.now()}`;
  }
  if (!nextInvoiceNumber) nextInvoiceNumber = `GEN-${Date.now()}`;

  const inserted = await tx
    .insert(companyInvoices)
    .values({
      companyId,
      sourceModule,
      sourceEntityId,
      sourceAttachmentKey: attachmentKey,
      kind: (data.kind as InvoiceKind) ?? 'otro',
      invoiceNumber: nextInvoiceNumber,
      invoiceDate,
      amount: amountStr,
      currency,
      supplierName: data.supplierName ?? null,
      supplierId: data.supplierId ?? null,
      fileUrl: data.fileUrl ?? null,
      fileMimeType: data.fileMimeType ?? null,
      items: itemsJson ?? '[]',
      subtotal:     computedSubtotal.toFixed(2),
      ivaPercent:   ivaPct !== null ? String(Number(ivaPct).toFixed(2)) : '15',
      ivaAmount:    ivaAmount !== null ? ivaAmount.toFixed(2) : '0',
      total:        total.toFixed(2),
      workshopName: data.workshopName ?? null,
      workerName:   data.workerName ?? null,
    })
    .returning({ id: companyInvoices.id, invoiceNumber: companyInvoices.invoiceNumber });

  console.log('[syncSingleInvoice] INSERT OK', {
    id: inserted[0]?.id,
    invoiceNumber: inserted[0]?.invoiceNumber,
    companyId,
    sourceModule,
    attachmentKey,
  });

  return { id: inserted[0].id, created: true };
}

// ─── 2. syncMaintenanceInvoices ────────────────────────────────────────────
//
// Caso mantenimiento: una entity (mantenimiento) tiene MÚLTIPLES facturas,
// una por attachment. Esta función reemplaza el set completo:
//
//   • Para cada attachment con invoiceNumber no-vacío: UPSERT.
//   • Borra cualquier invoice previo del mantenimiento cuya
//     source_attachment_key ya no esté en la nueva lista.
//
// Diseñada para llamarse cuando el operador edita el array de attachments
// (POST/PATCH mantenimiento). La llamaremos desde el controller de
// mantenances.ts en lugar del syncSingleInvoice (mantenimiento no usa
// single).

export interface SyncMaintenanceInvoicesResult {
  created: number;
  updated: number;
  deleted: number;
}

export async function syncMaintenanceInvoices(opts: {
  tx: DrizzleTx;
  companyId: number;
  maintenanceId: number;
  attachments: MaintenanceAttachmentLike[];
}): Promise<SyncMaintenanceInvoicesResult> {
  const { tx, companyId, maintenanceId, attachments } = opts;

  // jul 2026 v3 — DEBUG: loguear qué attachments llegan al sync para
  // diagnosticar por qué las facturas no aparecen en Finanzas.
  console.log('[syncMaintenanceInvoices]', {
    companyId,
    maintenanceId,
    attachmentsCount: attachments.length,
    attachments: attachments.map((a) => ({
      key: a.key,
      url: a.url ? a.url.split('/').pop() : null,
      isInvoice: a.isInvoice,
      invoiceNumber: a.invoiceNumber,
      kind: a.kind,
      supplierId: a.supplierId,
      itemCount: a.items?.length ?? 0,
    })),
  });

  // 1) Determinar qué keys seguimos conservando en el nuevo set.
  //    Asignamos keys a los attachments que aún no tienen una.
  const keepKeys = new Set<string>();
  attachments.forEach((att, idx) => {
    const k = att.key?.trim() || slugifyForKey(att.label, idx);
    keepKeys.add(k);
  });

  // 2) Borrar cualquier invoice previo del mantenimiento que ya no esté
  //    en el nuevo set de keys.
  //
  //    Estrategia: traer las keys existentes, y borrar las que no estén
  //    en keepKeys. Si la lista keepKeys tiene todo (caso "no removí
  //    ningún attachment"), esta operación es un no-op.
  const existingRows = await tx
    .select({ id: companyInvoices.id, key: companyInvoices.sourceAttachmentKey })
    .from(companyInvoices)
    .where(
      and(
        eq(companyInvoices.companyId, companyId),
        eq(companyInvoices.sourceModule, 'mantenimiento'),
        eq(companyInvoices.sourceEntityId, maintenanceId),
      ),
    );

  let deleted = 0;
  for (const row of existingRows) {
    // sourceAttachmentKey es NOT NULL DEFAULT 'main' (jul 2026) — el tipo
    // de Postgres trata NULL != NULL, así que forzamos NOT NULL para que
    // la UNIQUE sea TOTAL. No hay branches para null aquí.
    if (!keepKeys.has(row.key)) {
      await tx.delete(companyInvoices).where(eq(companyInvoices.id, row.id));
      deleted++;
    }
  }

  // 3) Para cada attachment que sea factura (invoiceNumber no-vacío
  //    o flag explícito `isInvoice=true`): upsert.
  //
  //    jul 2026 v3 — con la numeración AUTO el cliente ya no manda
  //    invoiceNumber. La señal de "es factura" es ahora el flag
  //    `isInvoice` (preferred) o el invoiceNumber legacy (compat).
  let created = 0;
  let updated = 0;
  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    if (!att.url) continue; // skip attachments sin archivo
    const looksLikeInvoice = att.isInvoice === true || !isEmptyInvoiceNumber(att.invoiceNumber);
    if (!looksLikeInvoice) continue;

    const key = att.key?.trim() || slugifyForKey(att.label, i);
    const amt = att.amount ?? 0;

    const res = await syncSingleInvoice({
      tx,
      companyId,
      sourceModule: 'mantenimiento',
      sourceEntityId: maintenanceId,
      attachmentKey: key,
      data: {
        // jul 2026 v3 — el cliente ya NO manda invoiceNumber; el backend
        // lo autogenera. Pasamos 'AUTO' como sentinel para que
        // syncSingleInvoice NO entre al branch de borrado.
        invoiceNumber: isEmptyInvoiceNumber(att.invoiceNumber)
          ? 'AUTO'
          : String(att.invoiceNumber),
        invoiceDate:
          att.uploadedAt && !Number.isNaN(new Date(att.uploadedAt).getTime())
            ? new Date(att.uploadedAt)
            : new Date(),
        amount: att.amount ?? 0,
        supplierName: null,
        supplierId:    att.supplierId ?? null,
        fileUrl:       att.url,
        fileMimeType:  null,
        kind:          (att.kind ?? 'otro') as InvoiceKind,
        items:         att.items,
        ivaPercent:    att.ivaPercent ?? null,
        ivaAmount:     att.ivaAmount ?? null,
        workshopName:  att.workshopName ?? null,
        workerName:    att.workerName ?? null,
      },
    });

    if (res.deleted) {
      // No deberíamos llegar aquí (filtramos emptyNumbers arriba), pero
      // por las dudas contamos como update vacío.
      continue;
    }
    if (res.created) created++;
    else updated++;
  }

  return { created, updated, deleted };
}

// ─── 3. deleteInvoicesForSource ─────────────────────────────────────────────
//
// Borra TODAS las invoices de una entity. Usar con cuidado:
//   • DELETE /fuel-entries/{id}  → borra su invoice (si tenía).
//   • DELETE /toll-entries/{id}  → lo mismo.
//   • DELETE /maintenances/{id}  → borra TODAS las facturas
//     del mantenimiento (mantenimientos multi-factura). Esto es lo que
//     el operador espera si borra el mantenimiento entero.

export async function deleteInvoicesForSource(opts: {
  tx: DrizzleTx;
  companyId: number;
  sourceModule: InvoiceSourceModule;
  sourceEntityId: number;
}): Promise<{ deleted: number }> {
  const { tx, companyId, sourceModule, sourceEntityId } = opts;

  const rows = await tx
    .delete(companyInvoices)
    .where(
      and(
        eq(companyInvoices.companyId, companyId),
        eq(companyInvoices.sourceModule, sourceModule),
        eq(companyInvoices.sourceEntityId, sourceEntityId),
      ),
    )
    .returning({ id: companyInvoices.id });

  return { deleted: rows.length };
}

// ─── 5. recalcInvoiceFromAttachment (jul 2026 v3) ────────────────────────────
//
// Cuando cambia `company_maintenance_items` (agregar/editar/borrar repuesto
// desde el drawer) esta función sincroniza la fila del ledger con el
// estado actual de los items:
//
//   • Lee los items de mantenimiento con `attachment_key = X`.
//   • Calcula subtotal = Σ(item.subtotal).
//   • Serializa esos items a JSON para `company_invoices.items[]`.
//   • Actualiza subtotal/total/items en la fila del ledger.
//   • Si subtotal = 0 (todos los items borrados), deja la fila con
//     status='anulada' (la factura queda pero como cancelada).
//
// Idempotente: correr N veces produce el mismo estado.
//
// Devuelve la cantidad de items recyncronizados, o 0 si no había fila.

export interface RecalcInvoiceResult {
  invoiceId: number | null;
  itemCount: number;
  subtotal: number;
  status: 'updated' | 'anulada' | 'unchanged' | 'created' | 'missing';
}

export async function recalcInvoiceFromAttachment(opts: {
  tx: DrizzleTx;
  companyId: number;
  maintenanceId: number;
  attachmentKey: string;
}): Promise<RecalcInvoiceResult> {
  const { tx, companyId, maintenanceId, attachmentKey } = opts;

  // 1) Leer items actuales del mantenimiento con este attachment_key.
  // (imported inline para no romper si el árbol de imports cambia)
  const { companyMaintenanceItems } = await import(
    '../db/schema/operational'
  );

  const items = await tx
    .select({
      id:          companyMaintenanceItems.id,
      name:        companyMaintenanceItems.name,
      quantity:    companyMaintenanceItems.quantity,
      unitCost:    companyMaintenanceItems.unitCost,
      subtotal:    companyMaintenanceItems.subtotal,
      photoUrl:    companyMaintenanceItems.photoUrl,
      attachmentKey: companyMaintenanceItems.attachmentKey,
    })
    .from(companyMaintenanceItems)
    .where(
      and(
        eq(companyMaintenanceItems.maintenanceId, maintenanceId),
        eq(companyMaintenanceItems.attachmentKey, attachmentKey),
      ),
    );

  // 2) Buscar la fila del ledger.
  const existing = await tx
    .select({ id: companyInvoices.id, ivaAmount: companyInvoices.ivaAmount })
    .from(companyInvoices)
    .where(
      and(
        eq(companyInvoices.companyId, companyId),
        eq(companyInvoices.sourceModule, 'mantenimiento'),
        eq(companyInvoices.sourceEntityId, maintenanceId),
        eq(companyInvoices.sourceAttachmentKey, attachmentKey),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    return { invoiceId: null, itemCount: items.length, subtotal: 0, status: 'missing' };
  }

  // 3) Si no quedan items: marcar la factura como 'anulada' (no la
  //    borramos — preservamos trazabilidad) y vaciar items[].
  if (items.length === 0) {
    await tx
      .update(companyInvoices)
      .set({
        items:     '[]',
        subtotal:  '0.00',
        total:     String(existing[0].ivaAmount ?? '0.00'), // ivaAmount queda como "lo que se pagó"
        status:    'anulada',
        updatedAt: sql`now()`,
      })
      .where(eq(companyInvoices.id, existing[0].id));
    return { invoiceId: existing[0].id, itemCount: 0, subtotal: 0, status: 'anulada' };
  }

  // 4) Items presentes: serializar y recalcular.
  const itemsJson = items.map((it) => ({
    description: it.name,
    quantity:    Number(it.quantity),
    unitPrice:   Number(it.unitCost),
    subtotal:    Number(it.subtotal),
    imageUrl:    it.photoUrl ?? null,
  }));
  const subtotal = items.reduce(
    (acc, it) => acc + Number(it.subtotal || 0),
    0,
  );
  const ivaAmount = Number(existing[0].ivaAmount ?? 0);
  const total = +(subtotal + ivaAmount).toFixed(2);

  await tx
    .update(companyInvoices)
    .set({
      items:     JSON.stringify(itemsJson),
      subtotal:  subtotal.toFixed(2),
      total:     total.toFixed(2),
      updatedAt: sql`now()`,
    })
    .where(eq(companyInvoices.id, existing[0].id));

  return {
    invoiceId: existing[0].id,
    itemCount: items.length,
    subtotal,
    status: 'updated',
  };
}

// ─── 4. ledgerInvoiceId ─────────────────────────────────────────────────────
//
// Helper para devolver el id "exposed" al cliente (formato `invoice-<n>`)
// consistente con el resto del dominio. Usado por los controllers para
// serializar la respuesta de POST/PATCH.
//
// Devuelve `null` si la fila no tiene id (caso trivial de error en runtime,
// debería ser unreachable, pero cubrimos TS strict).

export function ledgerInvoiceId(opts: {
  companyId: number;
  row: { id?: number | null } | null | undefined;
}): string | null {
  if (!opts.row || opts.row.id == null) return null;
  return toId('invoice', opts.row.id);
}
