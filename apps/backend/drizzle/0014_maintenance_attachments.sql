-- ─── 0014_maintenance_attachments.sql ─────────────────────────────────────
--
-- Agrega la columna `attachments` (jsonb) a `company_maintenance_records`.
-- Guarda facturas, fotos de mano de obra, evidencias y cualquier archivo
-- subido mientras el mantenimiento está "En proceso" o "Completado".
--
-- Shape del jsonb:
--   [
--     { "url": "/uploads/maintenance/42/...", "label": "Factura", "uploadedAt": "2026-..." },
--     { "url": "...", "label": "Foto antes", "uploadedAt": "..." }
--   ]
--
-- Default: array vacío.

ALTER TABLE company_maintenance_records
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
