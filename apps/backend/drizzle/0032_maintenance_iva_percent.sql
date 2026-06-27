-- 0032_maintenance_iva_percent.sql
-- Agrega columna iva_percent a company_maintenance_records.
-- Valor por defecto 15 (Ecuador IVA actual), configurable por el usuario.

ALTER TABLE company_maintenance_records
  ADD COLUMN iva_percent numeric(5, 2) NOT NULL DEFAULT 15;

-- Comentario para referencia
COMMENT ON COLUMN company_maintenance_records.iva_percent IS 'Porcentaje de IVA aplicado al mantenimiento (default 15 para Ecuador)';
