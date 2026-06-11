-- 0004_fuel_photo.sql
-- Agrega columna photo_url a company_fuel_entries para soportar
-- evidencia fotográfica en cada carga de combustible.

ALTER TABLE company_fuel_entries
  ADD COLUMN IF NOT EXISTS photo_url text;
