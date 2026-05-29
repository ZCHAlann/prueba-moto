import { companyAuditEntries } from '../db/schema';
import { DB } from '../db/client';

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
      metadata: params.metadata || {},
    });
  } catch (error) {
    console.error('Error logging audit:', error);
  }
};