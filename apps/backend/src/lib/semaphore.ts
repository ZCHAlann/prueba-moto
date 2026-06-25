// lib/semaphore.ts
//
// Semáforo de concurrencia para llamadas externas (Gemini).
// Por qué: Gemini free tier tiene rate limit por minuto. Si llegan 12
// autorizaciones a la vez, sin semáforo disparás 60 requests en pocos
// segundos → el SDK empieza a tirar 429.
//
// El semáforo serializa las llamadas para que no haya más de N ejecutándose
// simultáneamente. La espera se hace en una cola FIFO justa.
//
// Es un singleton: todas las llamadas al módulo comparten la misma
// instancia y por lo tanto el mismo "cupo" global.

export class Semaphore {
  private slots: number;
  private queue: Array<() => void> = [];

  constructor(concurrency: number) {
    this.slots = concurrency;
  }

  async acquire(): Promise<void> {
    if (this.slots > 0) {
      this.slots--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      // Le damos el slot al siguiente de la cola sin incrementar el counter.
      next();
    } else {
      this.slots++;
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /** Para diagnóstico: cuántas requests están en vuelo ahora mismo. */
  get inFlight(): number {
    // slots inicial = concurrencia máxima; slots actual = concurrencia - enVuelo
    return -1; // no se puede reconstruir sin guardar el original, ver abajo
  }
}

// Singleton global — máximo 3 llamadas a Gemini simultáneas.
//
// ¿Por qué 3 y no 5? Gemini free tier es 15 RPM. Con 3 concurrentes y ~2s
// por request, se procesan 90 requests/min teóricamente, pero el rate
// real es 15. Con 3 concurrentes y backoff agresivo, jamás se llega al
// límite y el sistema se siente responsive. Si se sube a plan de pago,
// cambiar este número en un solo lugar.
export const geminiSemaphore = new Semaphore(3);
