-- ─── 0028_assignment_return_extras.sql ────────────────────────────────────────
--
-- Campos propios del acta de DEVOLUCIÓN que se persistieron solo en
-- la tabla (no como parte del wizard original). El wizard de finalización
-- los captura y los guarda acá:
--
--   - multas_text:           texto libre con multas/infracciones reportadas
--                            durante el período de la asignación.
--   - return_odometer_photo_url: foto del odómetro al regreso (evidencia).

ALTER TABLE company_assignments
  ADD COLUMN IF NOT EXISTS multas_text            TEXT,
  ADD COLUMN IF NOT EXISTS return_odometer_photo_url TEXT;