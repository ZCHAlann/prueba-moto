import type { Telemetry } from '../types/telemetry';

type Listener = (t: Telemetry) => void;

class TelemetrySimulator {
  private intervals = new Map<string, ReturnType<typeof setInterval>>();
  private listeners = new Map<string, Set<Listener>>();
  private values = new Map<string, Telemetry>();

  subscribe(carId: string, listener: Listener): () => void {
    if (!this.listeners.has(carId)) {
      this.listeners.set(carId, new Set());
      this.values.set(carId, this.initial(carId));
      this.start(carId);
    }

    this.listeners.get(carId)!.add(listener);
    listener(this.values.get(carId)!);

    return () => {
      const set = this.listeners.get(carId);
      set?.delete(listener);
      if (set && set.size === 0) {
        this.stop(carId);
        this.listeners.delete(carId);
        this.values.delete(carId);
      }
    };
  }

  private initial(carId: string): Telemetry {
    const seed = carId.charCodeAt(carId.length - 1);
    return {
      carId,
      speed: 0,
      fuel: 25 + (seed % 30),
      fuelMax: 60,
      mileage: 8000 + (seed * 173) % 92000,
      lat: 34.05,
      lng: -118.24,
      ts: new Date().toISOString(),
    };
  }

  private start(carId: string) {
    const id = setInterval(() => {
      const cur = this.values.get(carId);
      if (!cur) return;

      // Patrón de manejo: senoidal + ruido (sensación de conducción real)
      const t = Date.now() / 1000;
      const target = 45 + Math.sin(t / 9) * 28 + (Math.random() - 0.5) * 12;
      const speed = Math.max(0, Math.min(180, cur.speed + (target - cur.speed) * 0.25));

      const next: Telemetry = {
        ...cur,
        speed,
        fuel: Math.max(0, cur.fuel - speed * 0.0004),
        mileage: cur.mileage + speed / 3600,
        ts: new Date().toISOString(),
      };

      this.values.set(carId, next);
      this.listeners.get(carId)?.forEach((l) => l(next));
    }, 1000);

    this.intervals.set(carId, id);
  }

  private stop(carId: string) {
    const id = this.intervals.get(carId);
    if (id) clearInterval(id);
    this.intervals.delete(carId);
  }
}

export const telemetrySimulator = new TelemetrySimulator();