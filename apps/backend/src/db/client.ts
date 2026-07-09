import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as platformSchema from './schema/platform';
import * as operationalSchema from './schema/operational';
import * as relationsSchema from './schema/relations'; 

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL no definida en .env');
}

const client = postgres(process.env.DATABASE_URL);

export const db = drizzle(client, {
  schema: {
    ...platformSchema,
    ...operationalSchema,
    ...relationsSchema,
  },
});

// Exportamos el client directo para queries crudas donde Drizzle infiere mal
// el tipo del placeholder (caso típico: PL/pgSQL con parámetros opcionales NULL).
// Usar con cuidado y sanitizando los inputs manualmente.
export { client };

export type DB = typeof db;