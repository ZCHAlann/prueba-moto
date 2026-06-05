import { mockRoutes } from '../data/mockRoutes';
import type { Route } from '../types/route';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const routesService = {
  async getByCarId(carId: string): Promise<Route[]> {
    await sleep(250); // simula latencia
    return mockRoutes
      .filter((r) => r.carId === carId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  },
};