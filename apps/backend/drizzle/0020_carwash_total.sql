-- Migración 0020: agregar company_maintenance_records.carwash_total
-- (costo explícito del servicio de Lavada, separado de totalCost).
ALTER TABLE company_maintenance_records
  ADD COLUMN IF NOT EXISTS carwash_total numeric(12, 2) NOT NULL DEFAULT 0;
