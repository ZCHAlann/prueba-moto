-- ───────────────────────────────────────────────────────────────────
-- Mantenimientos: quitar 'Preventivo' del enum de tipo.
-- Solo quedan 'Correctivo' y 'Programado'.
-- Registros legacy con type='Preventivo' se migran a 'Programado'.
-- ───────────────────────────────────────────────────────────────────

-- 1) Crear enum temporal con los valores finales
CREATE TYPE "maintenance_type_enum_new" AS ENUM ('Correctivo', 'Programado');
--> statement-breakpoint

-- 2) Cambiar la columna para usar el enum nuevo, con conversión Preventivo -> Programado
ALTER TABLE "company_maintenance_records"
  ALTER COLUMN "type" DROP DEFAULT,
  ALTER COLUMN "type" TYPE "maintenance_type_enum_new"
    USING (CASE WHEN "type" = 'Preventivo' THEN 'Programado' ELSE "type"::text::maintenance_type_enum_new END),
  ALTER COLUMN "type" SET DEFAULT 'Programado';
--> statement-breakpoint

-- 3) Borrar enum viejo
DROP TYPE "maintenance_type_enum";
--> statement-breakpoint

-- 4) Renombrar el nuevo para que conserve el nombre original
ALTER TYPE "maintenance_type_enum_new" RENAME TO "maintenance_type_enum";
