-- 0033_maintenance_status_atrasado.sql
-- Agrega el valor 'Atrasado' al enum maintenance_status_enum.
-- Lo setea automáticamente el cron diario apps/backend/src/lib/cron/maintenance-overdue.ts
-- cuando un mantenimiento programado/en proceso/en curso ya está vencido.
--
-- IMPORTANTE: correr manualmente en el VPS antes de desplegar el código.
-- Postgres no permite ALTER TYPE ... ADD VALUE dentro de una transacción;
-- hay que correrlo por separado (o usar "COMMIT" antes/después).
--   → Si tu migrador (drizzle-kit) envuelve los scripts en una transacción,
--     aplicar este cambio fuera del runner (psql/manual).
--
-- Idempotencia: si el valor ya existe, el IF NOT EXISTS lo ignora
-- silenciosamente (Postgres 12+).

ALTER TYPE maintenance_status_enum ADD VALUE IF NOT EXISTS 'Atrasado';
