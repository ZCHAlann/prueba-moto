// routes/ai-api/index.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Router principal de /api/ai/* (API para Custom GPT).
//
// Estructura:
//   - index.ts          ← este archivo, monta los sub-routers
//   - shared.ts         ← helpers (resolveAsset, withAudit, parseBody, etc.)
//   - router.ts         ← router unificado de 5 ops (consultar/crear/etc.)
//   - ops/              ← registro de operaciones por módulo
//   - modules/          ← routers originales (70 endpoints) — deprecated,
//                         se mantienen para compatibilidad pero el LLM
//                         debería usar SIEMPRE el router unificado.
//
// ¿Por qué un router unificado?
//   OpenAI Custom GPT Actions tiene un límite estricto de 30 operaciones
//   por schema. Con 70 endpoints específicos no entraba. La solución es
//   exponer 5 operaciones genéricas (consultar/crear/modificar/eliminar
//   + listar_operaciones) y que el LLM aprenda el mapa (modulo,
//   operacion) en las instrucciones.
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';

// Sub-routers.
import routerUnificado from './router';
import sesionRouter from './modules/sesion';
import analyticsRouter from './modules/analytics';

// Registro de operaciones (debe ejecutarse al cargar el módulo).
import { registerVehiculosOps } from './ops/vehiculos';
import { registerMantenimientosOps } from './ops/mantenimientos';
import { registerCatalogosComunesOps } from './ops/catalogos-comunes';
import { registerOperativosOps } from './ops/operativos';

// ── REGISTRAR TODAS LAS OPERACIONES ─────────────────────────────────
// Se ejecuta una vez al importar este módulo. Cada register*Ops()
// empuja al registry in-memory del router.ts.
registerVehiculosOps();
registerMantenimientosOps();
registerCatalogosComunesOps();
registerOperativosOps();

const router = Router();

// El router unificado es el ÚNICO que el LLM ve en el OpenAPI
// (los routers por módulo son legacy y se mantienen por si un
// cliente los usa directamente — pero el Custom GPT no los conoce).
router.use(routerUnificado);

// Sesion y analytics como endpoints "fáciles" (legacy, redundantes
// con el router). Se mantienen por compatibilidad con código existente.
router.use(sesionRouter);
router.use(analyticsRouter);

export default router;
