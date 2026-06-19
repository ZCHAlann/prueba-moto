-- ─── 0012_fuel_odometer_photo.sql ──────────────────────────────────────────
--
-- Agrega la columna `odometer_photo_url` a `company_fuel_entries` para
-- almacenar la foto del odómetro al momento de la carga de combustible.
-- Complementa `photo_url` (recibo) — son dos cosas distintas:
--   - photo_url: foto del recibo / factura de la estación.
--   - odometer_photo_url: foto del odómetro del vehículo.

ALTER TABLE company_fuel_entries
  ADD COLUMN odometer_photo_url text;
