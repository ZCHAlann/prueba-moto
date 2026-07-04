import { Request, Response, NextFunction } from 'express';
import {
  getUserEffectivelyActiveCached,
} from '../lib/userStatus.db';
import {
  getInactiveMessage,
  getInactiveCode,
} from '../lib/userStatus';
import { parseId } from '../lib/ids';

/**
 * Middleware que se aplica DESPUÉS de `authenticate` y `requireCompany`
 * para invalidar en caliente sesiones cuyo usuario/driver/sede quedó
 * inactivo a mitad de sesión.
 *
 * Usa el cache de 60s en `getUserEffectivelyActiveCached` para no
 * pegar a BD en cada request. Cuando se cambia el status de un user,
 * driver o sede, los helpers de invalidación correspondientes limpian
 * el cache y la próxima request ya ve el estado nuevo.
 *
 * Si el usuario está inactivo, responde 401 con un código estructurado
 * para que el frontend pueda distinguir:
 *   - USER_INACTIVE: la cuenta de empresa está desactivada
 *   - DRIVER_INACTIVE: el conductor fue desactivado manualmente
 *   - SITE_INACTIVE: la sede del conductor fue desactivada
 *
 * No aplica a platformUsers (scope='plataforma'): los admins de
 * plataforma no son conductores y no están atados a una sede.
 */
export const requireActiveStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ code: 'UNAUTHENTICATED', message: 'No autenticado.' });
    }

    // Solo aplica a usuarios de empresa. Plataforma y superadmin no.
    if (user.scope !== 'operacion' || !user.companyId) {
      return next();
    }

    // Extraer el userId numérico del sub JWT ('company-user-N' → N).
    let userIdNum: number;
    try {
      userIdNum = parseId('company-user', user.sub);
    } catch {
      return res.status(401).json({ code: 'BAD_TOKEN', message: 'Token inválido.' });
    }

    const status = await getUserEffectivelyActiveCached(
      userIdNum,
      user.companyId,
    );

    // Si el usuario ya no existe (raro pero defensivo), bloquear.
    if (!status) {
      return res.status(401).json({
        code: 'USER_INACTIVE',
        message: 'Tu cuenta ya no es válida.',
      });
    }

    if (!status.effectivelyActive) {
      return res.status(401).json({
        code:    getInactiveCode(status.inactiveReason),
        message: getInactiveMessage(status.inactiveReason),
      });
    }

    return next();
  } catch (err) {
    return next(err);
  }
};
