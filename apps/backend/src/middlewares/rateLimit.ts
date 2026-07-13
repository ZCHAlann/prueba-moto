// middlewares/rateLimit.ts
// ─────────────────────────────────────────────────────────────────────
// Rate limiting del backend vía express-rate-limit.
//
// Estrategia: perfiles por tipo de endpoint, key por (IP + usuario
// autenticado cuando exista). El IP fallback es importante para los
// endpoints públicos y para /auth/login donde todavía no hay sesión.
//
// Perfiles (jul 2026):
//   • loginStrict  → /auth/login        5 / 5 min   (IP + login)
//   • loginGlobal  → /auth/* (otros)   30 / 5 min   (IP)
//   • authGlobal   → /auth (genérico)  60 / 5 min   (IP, fallback)
//   • upload       → /upload            20 / 5 min   (IP + userId)
//   • write        → mutaciones         60 / min     (IP + userId)
//   • read         → lecturas          300 / min     (IP + userId)
//   • publicRead   → /public          120 / min      (IP)
//   • platform     → /platform (admin) 200 / min     (IP + userId)
//   • default      → resto             120 / min     (IP + userId)
//
// Trust proxy: en producción el backend está detrás de un proxy
// (nginx / load balancer / fly.io). express-rate-limit necesita
// `trust proxy` para que `req.ip` no sea siempre 127.0.0.1.
//
// In-memory store por proceso: NO compartido entre workers PM2.
// Si en el futuro se corre multi-worker, evaluar rate-limit-redis.
// ─────────────────────────────────────────────────────────────────────

import rateLimit, {
  type Options,
  type RateLimitRequestHandler,
} from 'express-rate-limit';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '../lib/errors';

// ─── Helpers de key ───────────────────────────────────────────────────────────

/** Devuelve la IP del cliente respetando `app.set('trust proxy', ...)`.
 *  Si por algún motivo no hay IP (rara vez), usa 'unknown' para no romper
 *  la key generation de Map. */
function clientIp(req: Request): string {
  return req.ip || (req.socket?.remoteAddress ?? 'unknown');
}

/** Para endpoints autenticados: key por usuario (sub del JWT) si existe,
 *  sino por IP. userId es más estricto que IP para evitar que varios
 *  usuarios detrás de la misma NAT se bloqueen entre sí. */
function userOrIpKey(req: Request): string {
  const sub = req.user?.sub;
  return sub ? `u:${sub}` : `ip:${clientIp(req)}`;
}

/** Para endpoints críticos donde queremos IP + user (evita que un solo
 *  atacante con muchas cuentas tumbe el endpoint): combina ambos. */
function userAndIpKey(req: Request): string {
  const sub = req.user?.sub ?? 'anon';
  return `u:${sub}|ip:${clientIp(req)}`;
}

/** Para /auth/login: la key combina IP + login intentado. Esto evita
 *  que un atacante haga brute-force contra un email conocido rotando
 *  IPs (queda rate-limitado por IP) y también evita que un atacante
 *  bloquee el login de un usuario específico desde muchas IPs (queda
 *  rate-limitado por IP+username). */
function loginKey(req: Request): string {
  const ip = clientIp(req);
  // body puede venir undefined si multer/JSON no procesó todavía.
  // Express con express.json() global ya pobló req.body antes del
  // middleware de rate-limit si lo montamos DESPUÉS del body parser.
  const login = String((req.body?.login ?? 'no-body') as string)
    .trim()
    .toLowerCase()
    .slice(0, 200);
  return `ip:${ip}|login:${login}`;
}

// ─── Handler de 429 ──────────────────────────────────────────────────────────

function makeHandler(profile: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    next(
      new AppError(
        429,
        `Demasiadas solicitudes (${profile}). Intentá en un minuto.`,
      ),
    );
  };
}

// ─── Factory tipada ──────────────────────────────────────────────────────────

type ProfileOptions = Partial<Options> & { name: string };

function build(opts: ProfileOptions): RateLimitRequestHandler {
  const { name, ...rest } = opts;
  return rateLimit({
    // Defaults sensatos. Cada perfil puede override.
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-7',   // RateLimit-* (IETF draft 7)
    legacyHeaders: true,          // X-RateLimit-* (compat vieja)
    // Status 429 con body consistente con el resto del backend.
    handler: makeHandler(name),
    // Mensaje y metadata útil en logs.
    skipFailedRequests: false,
    skipSuccessfulRequests: false,
    ...rest,
  });
}

// ─── Perfiles exportados ─────────────────────────────────────────────────────

/** /auth/login: 5 intentos cada 5 minutos por (IP + login).
 *  Esto complementa el lockout existente en BD (failedLoginAttempts).
 *  NOTA: este middleware DEBE montarse DESPUÉS de express.json() para
 *  tener req.body.login disponible. */
export const rateLimitLogin = build({
  name:     'login',
  windowMs: 5 * 60 * 1000,
  limit:    5,
  keyGenerator: loginKey,
});

/** /auth/* (no login): 30 / 5 min por IP. Cubre /auth/refresh,
 *  /auth/session, /auth/logout — son baratos pero enumerables. */
export const rateLimitAuthGlobal = build({
  name:     'auth',
  windowMs: 5 * 60 * 1000,
  limit:    30,
  keyGenerator: (req) => `ip:${clientIp(req)}`,
});

/** /upload: 20 archivos cada 5 minutos por (user + IP).
 *  Upload es la operación más cara del backend (ffmpeg, sharp, S3-like). */
export const rateLimitUpload = build({
  name:     'upload',
  windowMs: 5 * 60 * 1000,
  limit:    20,
  keyGenerator: userAndIpKey,
});

/** Mutaciones (POST/PUT/PATCH/DELETE) sobre /company y /platform:
 *  60 / minuto por (user + IP). Evita abuse desde una sola sesión
 *  comprometida sin molestar al usuario legítimo. */
export const rateLimitWrite = build({
  name:     'write',
  windowMs: 60 * 1000,
  limit:    60,
  keyGenerator: userAndIpKey,
});

/** Lecturas (GET) sobre /company y /platform:
 *  300 / minuto por (user + IP). Más permisivo: el frontend
 *  hace polling/listados seguido. */
export const rateLimitRead = build({
  name:     'read',
  windowMs: 60 * 1000,
  limit:    300,
  keyGenerator: userOrIpKey,
});

/** /platform (admin SaaS): 200 / minuto por (user + IP).
 *  Los superadmin tienen tools pesadas (wizard de empresas, board, etc). */
export const rateLimitPlatform = build({
  name:     'platform',
  windowMs: 60 * 1000,
  limit:    200,
  keyGenerator: userOrIpKey,
});

/** /public (landing): 120 / minuto por IP. Sin auth, así que IP. */
export const rateLimitPublic = build({
  name:     'public',
  windowMs: 60 * 1000,
  limit:    120,
  keyGenerator: (req) => `ip:${clientIp(req)}`,
});

/** Default catch-all (oil-check, /health, etc): 120 / minuto por IP. */
export const rateLimitDefault = build({
  name:     'default',
  windowMs: 60 * 1000,
  limit:    120,
  keyGenerator: userOrIpKey,
});

// ─── Split middleware (read vs write) ─────────────────────────────────────────
// express-rate-limit permite filtrar por método HTTP. Esto evita tener
// que declarar dos middlewares por cada router: uno se monta antes del
// router y adentro discrimina. Útil para /company y /platform donde el
// 99% de las rutas son GET y unas pocas son write.

/** Pasa al limitador de WRITE solo si el método es mutación.
 *  Para los GET, llama next() sin contar (el perfil READ los cubre). */
export function writeOnly(limiter: RateLimitRequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const m = req.method.toUpperCase();
    if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
      return limiter(req, res, next);
    }
    return next();
  };
}

/** Pasa al limitador de READ solo si el método es GET/HEAD.
 *  Para mutaciones, llama next() sin contar (las cubre WRITE). */
export function readOnly(limiter: RateLimitRequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const m = req.method.toUpperCase();
    if (m === 'GET' || m === 'HEAD') {
      return limiter(req, res, next);
    }
    return next();
  };
}