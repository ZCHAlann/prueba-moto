// lib/stats-math.ts
// ─────────────────────────────────────────────────────────────────────
// Helpers matemáticos puros (sin dependencias externas) usados por
// el submódulo de Estadísticas para calcular:
//
//   - variationPct(actual, anterior)      variación porcentual
//   - linearRegression(points)            pendiente, intercepto, R², proyección
//   - zScore(value, mean, std)            puntuación de desviación
//   - classifySeverity(z)                 'baja' | 'media' | 'alta'
//   - bucketByPeriod(date, periodo)       key YYYY-MM / YYYY-Qn / YYYY
//   - fillMissingPeriods(...)             rellena buckets faltantes con 0
//
// Todo se ejecuta sobre JSON agregado en memoria (nunca en la BD), por
// lo que es O(N) y no requiere índices.
// ─────────────────────────────────────────────────────────────────────

export type StatPoint = { x: number; y: number };

export type RegressionResult = {
  slope: number;
  intercept: number;
  r2: number;
  // Proyección a N períodos futuros (regresión lineal pura).
  project: (n: number) => number;
};

// ─── Variación porcentual ────────────────────────────────────────────

export function variationPct(actual: number, anterior: number): number {
  if (!anterior) return 0;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

// ─── Regresión lineal (mínimos cuadrados) ────────────────────────────

export function linearRegression(points: StatPoint[]): RegressionResult {
  const n = points.length;
  if (n < 2) {
    return {
      slope: 0,
      intercept: n === 1 ? points[0].y : 0,
      r2: 0,
      project: (k) => (n === 1 ? points[0].y : 0),
    };
  }

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  for (const p of points) {
    sumX  += p.x;
    sumY  += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
    sumYY += p.y * p.y;
  }

  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² = (covarianza)² / (varianzaX * varianzaY)
  let r2 = 0;
  if (n * sumXX - sumX * sumX !== 0 && n * sumYY - sumY * sumY !== 0) {
    const num = n * sumXY - sumX * sumY;
    r2 = (num * num) / ((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
    if (r2 > 1) r2 = 1;
    if (r2 < 0) r2 = 0;
  }

  return {
    slope,
    intercept,
    r2,
    project: (k) => slope * k + intercept,
  };
}

// ─── Z-score ─────────────────────────────────────────────────────────

export function zScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

export function classifySeverity(z: number): "baja" | "media" | "alta" | null {
  const absZ = Math.abs(z);
  if (absZ < 1) return null;
  if (absZ < 1.5) return "baja";
  if (absZ < 2)   return "media";
  return "alta";
}

// ─── Buckets de período ──────────────────────────────────────────────

export type Periodo = "month" | "quarter" | "year";

export function bucketByPeriod(date: Date | string, periodo: Periodo): string {
  // Coerce: Drizzle/postgres-js devuelve columnas `date` como string "YYYY-MM-DD"
  // (y `timestamp` como Date), por lo que aceptamos ambos para no romper callers.
  const d = date instanceof Date ? date : new Date(`${date}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1; // 1-12
  if (periodo === "year") {
    return `${y}`;
  }
  if (periodo === "quarter") {
    const q = Math.floor((m - 1) / 3) + 1;
    return `${y}-Q${q}`;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

// Devuelve el bucket "actual" para una fecha (típicamente "hoy").
export function currentBucket(periodo: Periodo, ref: Date = new Date()): string {
  return bucketByPeriod(ref, periodo);
}

export function previousBucket(periodo: Periodo, ref: Date = new Date()): string {
  const d = new Date(ref.getTime());
  if (periodo === "year") {
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return `${d.getUTCFullYear()}`;
  }
  if (periodo === "quarter") {
    d.setUTCMonth(d.getUTCMonth() - 3);
    return bucketByPeriod(d, "quarter");
  }
  d.setUTCMonth(d.getUTCMonth() - 1);
  return bucketByPeriod(d, "month");
}

// ─── Relleno de buckets faltantes con 0 ───────────────────────────────

/**
 * Dada una serie de buckets (keys ordenables) y un mapa bucket→valor,
 * rellena los buckets faltantes entre min y max con 0.
 *
 * Para 'month': YYYY-MM  (rellena mes a mes)
 * Para 'quarter': YYYY-Qn (rellena trimestre a trimestre)
 * Para 'year': YYYY (rellena año a año)
 */
export function fillMissingPeriods<T>(
  periodo: Periodo,
  data: Record<string, T>,
  zeroFactory: () => T,
): Record<string, T> {
  const keys = Object.keys(data);
  if (keys.length === 0) return data;

  keys.sort();
  const first = keys[0];
  const last  = keys[keys.length - 1];

  const result: Record<string, T> = { ...data };

  if (periodo === "month") {
    const [fy, fm] = first.split("-").map(Number);
    const [ly, lm] = last.split("-").map(Number);
    let y = fy, m = fm;
    while (y < ly || (y === ly && m <= lm)) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (!(key in result)) result[key] = zeroFactory();
      m++;
      if (m > 12) { m = 1; y++; }
    }
  } else if (periodo === "quarter") {
    const [fy, fqS] = first.split("-Q");
    const [ly, lqS] = last.split("-Q");
    const fq = Number(fqS), lq = Number(lqS);
    let y = fy, q = fq;
    while (y < ly || (y === ly && q <= lq)) {
      const key = `${y}-Q${q}`;
      if (!(key in result)) result[key] = zeroFactory();
      q++;
      if (q > 4) { q = 1; y++; }
    }
  } else {
    const fy = Number(first);
    const ly = Number(last);
    for (let y = fy; y <= ly; y++) {
      const key = `${y}`;
      if (!(key in result)) result[key] = zeroFactory();
    }
  }

  return result;
}

// ─── Helper: ordenar keys cronológicamente ───────────────────────────

export function sortPeriodKeys(keys: string[]): string[] {
  return [...keys].sort();
}

// ─── Stats descriptivas rápidas (mean, std) ──────────────────────────

export function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (values.length === 1) return { mean, std: 0 };
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}
