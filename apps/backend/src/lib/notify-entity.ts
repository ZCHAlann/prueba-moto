// lib/notify-entity.ts
//
// Helper para notificaciones genéricas de CRUD en módulos de "Gestión"
// (talleres, proveedores, vehículos, conductores, sedes, garajes, etc.).
//
// En vez de duplicar 4-5 líneas de notifyAdminsExceptActor en cada route
// handler, importamos `notifyEntityCrud()` y le pasamos los datos clave.
//
// Audiencia por defecto: todos los admins_empresa/owner_empresa activos
// de la empresa (excluyendo al actor). El admin que crea/edita/borra NO
// se notifica a sí mismo para evitar feedback ruidoso.
//
// ─── Cuándo usar cada kind ─────────────────────────────────────────────────
//   - entity_created   → POST  exitoso
//   - entity_updated   → PUT/PATCH exitoso
//   - entity_deleted   → DELETE exitoso
//
// El `entityKey` es una etiqueta legible (ej. "Taller", "Proveedor",
// "Vehículo"). Singular, capitalizado, para que el toast diga
// "Nuevo Taller: Talleres García".

import { notifyAdminsExceptActor } from './notification-service';
import { parseId } from './ids';

export type EntityCrudKind = 'entity_created' | 'entity_updated' | 'entity_deleted';

export interface NotifyEntityCrudArgs {
  companyId:   number;
  actorSub:    string;        // req.user!.sub (string opaco)
  actorName:   string;        // req.user!.name
  crudKind:    EntityCrudKind;
  entityKey:   string;        // 'Taller' | 'Proveedor' | 'Vehículo' | etc.
  entityId:    string | number;
  entityLabel: string;        // nombre visible para el toast
  extra?:      Record<string, unknown>;
}

/**
 * Notifica a los admins (excepto actor) sobre un CRUD genérico.
 * No hace push — usa notifyAdminsExceptActor, que sí lo hace vía WS + FCM.
 *
 * El try/catch lo pone el caller; este helper NO swallowea errores para
 * que el `console.warn` siga cayendo donde corresponde.
 */
export async function notifyEntityCrud(args: NotifyEntityCrudArgs): Promise<void> {
  const {
    companyId, actorSub, actorName,
    crudKind, entityKey, entityId, entityLabel, extra,
  } = args;

  const actorId = parseId('company-user', actorSub);

  const actionLabel =
    crudKind === 'entity_created' ? 'Nuevo' :
    crudKind === 'entity_updated' ? 'Actualizado' :
                                    'Eliminado';

  const title = `${actionLabel} ${entityKey}: ${entityLabel}`;

  let body: string;
  if (crudKind === 'entity_created') {
    body = `Creado por ${actorName}.`;
  } else if (crudKind === 'entity_updated') {
    body = `Editado por ${actorName}.`;
  } else {
    body = `Eliminado por ${actorName}.`;
  }

  await notifyAdminsExceptActor(companyId, actorId, {
    kind:    crudKind,
    title,
    body,
    payload: {
      entityKey,
      entityId,
      entityLabel,
      actor:    actorName,
      ...(extra ?? {}),
    },
  });
}