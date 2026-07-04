// lib/ai/keys.ts
// ─────────────────────────────────────────────────────────────────────
// Cascada de API keys de Groq.
//
// Lee N claves desde variables de entorno, donde N se define con
// `GROQ_API_KEY_COUNT`:
//
//   GROQ_API_KEY_COUNT=3
//   GROQ_API_KEY=gsk_...           ← key 0 (primaria)
//   GROQ_API_KEY1=gsk_...          ← key 1
//   GROQ_API_KEY2=gsk_...          ← key 2
//
// Convenciones:
//   - La PRIMARY (key 0) **siempre** se llama `GROQ_API_KEY` (sin sufijo).
//   - Las siguientes llevan sufijo numérico ascendente: `GROQ_API_KEY1`,
//     `GROQ_API_KEY2`, … hasta `GROQ_API_KEY{N-1}`.
//   - Si `GROQ_API_KEY_COUNT=0` o no está definido → la cascada es de 1
//     elemento (solo la key primaria). Comportamiento idéntico al
//     anterior a esta feature.
//   - Las keys declaradas pero vacías (`""`) se descartan. La cascada
//     solo itera sobre keys "truthy". Si ninguna es válida, el cliente
//     devuelve `null` y los consumidores saben que la IA no está
//     configurada.
//   - El "índice activo" es **memoria del proceso** (no se persiste).
//     En un reinicio se vuelve a empezar desde la key 0. Esto
//     intencional: el daemon de Groq resetea rate-limits ~por minuto/
//     hora, así que arrancar siempre por la primaria le da más
//     oportunidad de recuperación.
//
// El orquestador (`groq-client.ts`) usa `getApiKeys()` para iterar y
// `advanceKeyIndex()` cada vez que detecta un rate limit. Si la cascade
// se queda sin keys (todas rate-limitean), lanza el último error.
// ─────────────────────────────────────────────────────────────────────

/** Lee el contador. 0 / inválido / undefined → fallback a 1. */
function readKeyCount(): number {
  const raw = process.env.GROQ_API_KEY_COUNT?.trim();
  if (!raw) return 1; // comportamiento legacy: 1 sola key
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  // Hard cap razonable — más de 20 keys no tiene sentido práctico
  // y limita daño si alguien escribe "9999".
  return Math.min(20, Math.floor(n));
}

/**
 * Devuelve el nombre de la env var para el índice `idx`:
 *   - idx=0 → `GROQ_API_KEY`
 *   - idx≥1 → `GROQ_API_KEY1`, `GROQ_API_KEY2`, …
 */
function envNameForIndex(idx: number): string {
  return idx === 0 ? 'GROQ_API_KEY' : `GROQ_API_KEY${idx}`;
}

/** Lee una sola key del entorno. Vacía o ausente → `null`. */
function readKey(idx: number): string | null {
  const v = process.env[envNameForIndex(idx)]?.trim();
  return v && v.length > 0 ? v : null;
}

/**
 * Devuelve **todas** las keys disponibles (truthy) en orden ascendente.
 * No muta estado — función pura.
 *
 * Comportamiento esperado:
 *   - Si `COUNT` no está definido → devuelve array de 1 con la key 0
 *     (o array vacío si la key 0 no existe).
 *   - Si `COUNT=N` y solo hay 3 keys declaradas → array de 3.
 *   - Si `COUNT=N` y hay huecos → array con las keys que sí existan.
 */
export function getApiKeys(): string[] {
  const total = readKeyCount();
  const out: string[] = [];
  for (let i = 0; i < total; i++) {
    const k = readKey(i);
    if (k) out.push(k);
  }
  return out;
}

/** Total de keys disponibles (largo de `getApiKeys()`). Para logs / debug. */
export function getApiKeyCount(): number {
  return getApiKeys().length;
}

/** Para el endpoint de stats / health check. */
export function getApiKeysConfig() {
  const total = readKeyCount();
  const available = getApiKeyCount();
  const indices: Array<{ index: number; envVar: string; present: boolean }> = [];
  for (let i = 0; i < total; i++) {
    indices.push({
      index:   i,
      envVar:  envNameForIndex(i),
      present: readKey(i) !== null,
    });
  }
  return {
    configuredCount: total,
    availableCount:  available,
    keys:             indices,
  };
}

// ─── Estado en memoria: índice activo ─────────────────────────────────────
// Una sola variable global del módulo. El proceso Node es single-threaded
// por lo que no hay race conditions entre requests.

let _currentIndex = 0;

/** Devuelve el índice de la key que se usará en la próxima llamada. */
export function getCurrentKeyIndex(): number {
  return _currentIndex;
}

/** Devuelve la key actual (o `null` si ninguna key está configurada). */
export function getCurrentApiKey(): string | null {
  const keys = getApiKeys();
  if (keys.length === 0) return null;
  // Defensa: si `_currentIndex` quedó fuera de rango (p.ej. se redujo
  // `GROQ_API_KEY_COUNT` en runtime), clampeamos.
  if (_currentIndex >= keys.length) _currentIndex = 0;
  return keys[_currentIndex];
}

/**
 * Avanza al siguiente índice. Si ya estamos en la última key, vuelve a 0
 * (wrap-around). Devuelve `{ previous, current }` con los índices reales,
 * o `null` si solo hay 1 key disponible (en cuyo caso no hay nada que
 * rotar — devolvemos `null` para que el orquestador decida).
 */
export function advanceKeyIndex(): { previous: number; current: number } | null {
  const keys = getApiKeys();
  if (keys.length <= 1) return null;
  const previous = _currentIndex;
  _currentIndex = (_currentIndex + 1) % keys.length;
  return { previous, current: _currentIndex };
}

/**
 * Vuelve a la key primaria. Útil después de un reset de rate-limit
 * (p.ej. medianoche). El orquestador lo llama cuando recibe un 200 OK
 * tras mucho tiempo de rate-limit.
 */
export function resetToPrimaryKey(): void {
  if (_currentIndex !== 0) {
    // eslint-disable-next-line no-console
    console.log(`[ai-keys] reset a key primaria: ${_currentIndex} → 0`);
    _currentIndex = 0;
  }
}

/**
 * Resetea manualmente (para tests o cuando el operador quiere forzar un
 * "comenzar desde la primera"). No se llama automáticamente.
 */
export function resetApiKeyState(): void {
  _currentIndex = 0;
}

// ─── Auto-rotación inteligente ──────────────────────────────────────────
//
// Groq reset-ea los rate-limits por minuto/hora (dependiendo del modelo
// y el tier). Si la cascada tuvo que saltar a K1/K2 por un pico, la
// key primaria suele recuperarse en unos minutos.
//
// Estrategia: marcar el momento del último "salto por rate-limit"
// (`_lastRotationAt`). Si en los siguientes `GROQ_KEY_RECOVERY_MIN`
// minutos (default 5) NO tuvimos que volver a rotar Y además la key
// actual responde 200 OK, intentamos volver a K0.
//
// No es una "curación" instantánea: cada vez que el orquestador
// recibe un 200 OK, le pregunta a `maybeRecoverToPrimaryKey()` si
// debería promover K0 de vuelta. La función evalúa:
//
//   1. ¿`_currentIndex === 0`? → ya estamos en primaria, nada que hacer.
//   2. ¿Han pasado al menos N minutos desde la última rotación? Si no,
//      aún estamos en el período de "no curar".
//   3. Si ambas OK → reset a K0 y logueamos.
//
// Si la rotación sucede de vuelta (otro rate-limit), el ciclo se
// repite. Es conservador — preferimos quedarse en una key "sana"
// antes que forzar K0.
//
// Trade-off conocido: si N es muy chico (ej. 1 minuto), podemos
// rotar a K0 antes que se recupere y volver a caer al fallback. Si N
// es muy grande (ej. 30 min), tardamos más en volver al primario.
// Default 5 min es razonable para Groq.

/** Timestamp (ms epoch) del último momento en que rotamos por rate-limit. */
let _lastRotationAt: number = 0;

/** Registra que acabamos de rotar por rate-limit. */
export function noteKeyRotation(): void {
  _lastRotationAt = Date.now();
}

/** Para debug / health check. */
export function getLastRotationAt(): number {
  return _lastRotationAt;
}

/** Minutos a esperar antes de intentar volver a K0. Default 5. */
function getRecoveryMinutes(): number {
  const raw = process.env.GROQ_KEY_RECOVERY_MIN?.trim();
  if (!raw) return 5;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 5;
  // Hard cap: 1 hora. Para "long-term" hay otros mecanismos.
  return Math.min(60, Math.floor(n));
}

/**
 * Pregunta si es momento de volver a K0. Si sí, resetea y devuelve
 * `true`. Útil para que el orquestador lo llame **después** de un 200
 * OK (no en cada iteración).
 *
 * Reglas:
 *   - Si `_currentIndex === 0` → ya estamos en K0, no hace nada.
 *   - Si `_lastRotationAt === 0` → nunca rotamos, no tiene sentido
 *     "curar" algo sano, devolvemos false.
 *   - Si han pasado al menos `recoveryMs` desde el último salto,
 *     reseteamos a K0.
 */
export function maybeRecoverToPrimaryKey(): boolean {
  if (_currentIndex === 0) return false;
  if (_lastRotationAt === 0)    return false;

  const recoveryMs = getRecoveryMinutes() * 60_000;
  const elapsed    = Date.now() - _lastRotationAt;
  if (elapsed < recoveryMs) return false;

  // eslint-disable-next-line no-console
  console.log(
    `[ai-keys] auto-rotación: key actual=${_currentIndex} → primaria=0 ` +
    `(transcurridos ${Math.floor(elapsed / 60_000)}min >= ${getRecoveryMinutes()}min).`,
  );
  _currentIndex = 0;
  // NO reseteamos `_lastRotationAt` aquí — el siguiente fallo lo
  // actualizará solo.
  return true;
}

/** Versión "forzada" para tests / admin tools. */
export function forceRecoverToPrimaryKey(): boolean {
  if (_currentIndex === 0) return false;
  // eslint-disable-next-line no-console
  console.log(`[ai-keys] forceRecoverToPrimaryKey: ${_currentIndex} → 0`);
  _currentIndex = 0;
  return true;
}

// ─── Debug unificado ────────────────────────────────────────────────────

export interface KeyState {
  currentIndex: number;
  currentEnvVar: string;
  totalKeys: number;
  lastRotationAt: number | null;
  recoveryMinutes: number;
}

/** Snapshot del estado completo para debug / health. */
export function getKeysState(): KeyState {
  return {
    currentIndex:    _currentIndex,
    currentEnvVar:   envNameForIndex(_currentIndex),
    totalKeys:       getApiKeyCount(),
    lastRotationAt:  _lastRotationAt === 0 ? null : _lastRotationAt,
    recoveryMinutes: getRecoveryMinutes(),
  };
}
