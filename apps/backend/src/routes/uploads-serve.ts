// routes/uploads-serve.ts
// ─────────────────────────────────────────────────────────────────────────────
// Reemplaza el antiguo `app.use('/uploads', express.static(...))` que servía
// TODOS los archivos sin autenticación, exponiendo un IDOR crítico: un
// usuario autenticado de la empresa A podía cambiar `{companyId}` en la URL
// y descargar archivos de la empresa B.
//
// Diseño:
//
//   GET /uploads/:category/:companyId?/:filename
//     ↓
//   1. authenticate          → 401 si no hay token (cookie o Bearer).
//   2. validateCompany      → 403 si companyId de la URL ≠ req.user.companyId,
//                             con bypass para roles de plataforma
//                             ('superadmin') que dan soporte.
//   3. sanitize filename    → 400 si la URL manipulada intenta path
//                             traversal (ej. "../", "%2e%2e%2f").
//   4. res.sendFile          → sirve el archivo o 404 si no existe.
//
// NOTA sobre el routing: usamos `router.use(handler)` como catch-all en
// vez de `router.get('/:category/:rest(*)', ...)` porque la versión de
// `path-to-regexp` que usa Express 4 (v0.x) no soporta la sintaxis
// `:rest(*)`. Con `router.use` capturamos TODO lo que pase por el router
// y parseamos `req.path` a mano — funciona en cualquier versión de
// path-to-regexp y es más predecible.
//
// Categorías esperadas:
//
//   - Con companyId: assets, maintenance, assignments, ac, fuel, drivers,
//     users, exit-auth, exit-auth-video, checklists, handover-pdfs, toll,
//     parts, insurance.
//   - Sin companyId (legacy / global): 'invoices', 'general'.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { existsSync } from "fs";
import { join, resolve, sep } from "path";
import { authenticate } from "../middlewares/authenticate";
import { AppError } from "../lib/errors";

const router = Router();
router.use(authenticate);

const UPLOAD_BASE = process.env.UPLOAD_DIR ?? join(process.cwd(), "..", "..", "uploads");

// Categorías que NO llevan companyId en el path (legacy / globales).
// Se mantienen por compatibilidad con archivos preexistentes en producción.
// El acceso a estas sigue requiriendo autenticación.
const NO_COMPANY_CATEGORIES = new Set<string>(["invoices", "general"]);

// Roles con bypass de ownership (soporte de plataforma).
// Confirmado: en `authenticate.ts` el `scope: 'plataforma'` viene en el JWT;
// el `role` de plataforma es 'superadmin' (legacy) o variantes que el equipo
// de soporte usa. Si en el futuro hay más roles, se agregan acá.
const SUPPORT_ROLES = new Set<string>(["superadmin"]);

/**
 * Handler catch-all: parsea la URL, valida, sirve el archivo.
 *
 * Como el router está montado en `/uploads` (en app.ts), `req.path` acá
 * es el path RELATIVO a ese mountpoint. Ej:
 *   GET /uploads/fuel/1/foo.jpg  →  req.path = "/fuel/1/foo.jpg"
 *   GET /uploads/                →  req.path = "/"  (404)
 *   GET /uploads/fuel            →  req.path = "/fuel"  (404 — falta archivo)
 */
const handler = (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) throw new AppError(401, "No autenticado.");

    // Quitamos el "/" inicial para splitear limpiamente.
    const path = req.path.replace(/^\/+/, "");
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) {
      throw new AppError(404, "Archivo no encontrado.");
    }

    const category = parts[0];
    const rest = parts.slice(1);
    if (rest.length === 0) {
      throw new AppError(404, "Archivo no encontrado.");
    }

    let companyIdStr: string | null = null;
    let filenameParts: string[];

    if (NO_COMPANY_CATEGORIES.has(category)) {
      // Sin companyId — la URL es `${category}/${filename}`.
      filenameParts = rest;
    } else {
      // Con companyId — la URL es `${category}/${companyId}/${filename}`.
      // parts[1] es el companyId; el resto es el filename (puede contener
      // slashes si alguien subió un archivo con '/' en el nombre —
      // extremadamente raro pero lo soportamos para no romper archivos
      // preexistentes en producción).
      [companyIdStr, ...filenameParts] = rest;
      if (!companyIdStr || filenameParts.length === 0) {
        throw new AppError(404, "Archivo no encontrado.");
      }
    }

    // ── Ownership check (excepto soporte) ─────────────────────────────
    const isSupport = SUPPORT_ROLES.has(user.role);
    if (companyIdStr !== null && !isSupport) {
      const urlCompanyId = parseInt(companyIdStr, 10);
      const authCompanyId = user.companyId;
      if (
        Number.isNaN(urlCompanyId) ||
        authCompanyId === null ||
        urlCompanyId !== authCompanyId
      ) {
        throw new AppError(403, "No autorizado para acceder a este archivo.");
      }
    }

    // ── Anti path-traversal (defense in depth) ────────────────────────
    // Cada filenamePart debe ser un string plano sin '..' ni '/'. Como
    // ya splitiamos por '/', no hay '..' con separador — pero bloqueamos
    // '..' literal y caracteres nulos por si las moscas.
    for (const part of filenameParts) {
      if (!part || part.includes("..") || part.includes("\0")) {
        throw new AppError(400, "Ruta inválida.");
      }
    }

    // ── Reconstrucción segura del path absoluto ────────────────────────
    // Mismo orden que la URL original: category/companyId?/filename.
    const relParts = [category, companyIdStr, ...filenameParts].filter(
      (p): p is string => Boolean(p),
    );
    const relPath = relParts.join("/");
    const absolutePath = resolve(UPLOAD_BASE, relPath);

    // Verificación final: el path resuelto DEBE estar dentro de
    // UPLOAD_BASE. Esta es la red de seguridad contra cualquier intento
    // de escape que no hayamos previsto arriba.
    const baseWithSep = resolve(UPLOAD_BASE) + sep;
    if (!absolutePath.startsWith(baseWithSep) && absolutePath !== resolve(UPLOAD_BASE)) {
      throw new AppError(400, "Ruta inválida.");
    }

    if (!existsSync(absolutePath)) {
      throw new AppError(404, "Archivo no encontrado.");
    }

    // Cache headers: archivos servidos son inmutables (timestamps en el
    // nombre), así que podemos cachear 1 día. Reduce round-trips en
    // vistas de detalle que muestran varias fotos de evidencia.
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.sendFile(absolutePath);
  } catch (err) {
    next(err);
  }
};

// Catch-all: capturamos cualquier GET bajo /uploads. La sintaxis
// path-to-regexp wildcard (`:rest(*)`, `/*splat`) varía entre versiones
// y rompe en path-to-regexp v0.x (la que viene con Express 4). Usar
// `router.use(handler)` sin path es la forma 100% portable — captura
// TODO lo que llegue al router sin parsear la URL con regex.
router.use(handler);

export default router;