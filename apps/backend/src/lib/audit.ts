import { companyAuditEntries, platformAuditEntries, platformUsers } from '../db/schema';
import { DB } from '../db/client';
import { scrubSecrets } from './crypto';

interface LogAuditParams {
  entity: string;
  entityId?: string;
  action: 'create' | 'update' | 'delete' | 'complete';
  actorId?: string;
  actorName?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export const logAudit = async (
  db: DB,
  companyId: number | null,
  params: LogAuditParams,
) => {
  try {
    await db.insert(companyAuditEntries).values({
      companyId,
      entity: params.entity,
      entityId: params.entityId,
      action: params.action,
      actorId: params.actorId
        ? BigInt(params.actorId.replace(/^[a-z-]+-(\d+)$/, '$1'))
        : null,
      actorName: params.actorName,
      description: params.description,
      metadata: scrubMetadata(params.metadata) as any,
    });
  } catch (error) {
    console.error('Error logging audit:', error);
  }
};

// ─── Auditoría de plataforma (jul 2026 v6) ───────────────────────────────────
// Tabla platform_audit_entries: acciones del superadmin sobre la plataforma
// (cambios de planes, módulos, kill-switch de IA, etc.). companyId=null.

interface LogPlatformAuditParams {
  actorId?: string;
  actorEmail?: string;
  action: string;             // ej 'company.ai_kill_switch', 'plan.changed'
  entity?: string;            // ej 'company', 'plan', 'module'
  entityId?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export const logPlatformAudit = async (
  db: DB,
  params: LogPlatformAuditParams,
) => {
  try {
    const actorIdNum = params.actorId
      ? Number(params.actorId.replace('platform-user-', ''))
      : null;
    await db.insert(platformAuditEntries).values({
      actorId:    Number.isFinite(actorIdNum) && (actorIdNum as number) > 0 ? (actorIdNum as number) : null,
      actorEmail: params.actorEmail ?? null,
      action:     params.action,
      entity:     params.entity ?? null,
      entityId:   params.entityId ?? null,
      description: params.description ?? null,
      metadata:   scrubMetadata(params.metadata),
    });
  } catch (error) {
    console.error('Error logging platform audit:', error);
  }
};

// ─── Scrubbing: nunca persistir keys crudas en metadata ─────────────────────

function scrubMetadata(meta?: Record<string, any>): Record<string, any> {
  if (!meta || typeof meta !== 'object') return {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(meta)) {
    // Bloquea nombres sensibles y reemplaza su valor si es string.
    if (/api[_-]?key/i.test(k) || /secret/i.test(k) || /token/i.test(k) || /password/i.test(k)) {
      out[k] = typeof v === 'string' ? scrubSecrets(v) : '***';
    } else if (typeof v === 'string') {
      out[k] = scrubSecrets(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}