-- ─── 0027_return_handover_url.sql ─────────────────────────────────────────────
--
-- Agrega la columna `return_handover_url` a `company_assignments` para
-- guardar el acta de DEVOLUCIÓN por separado del acta de ENTREGA
-- (`handover_url`).
--
-- Antes de esta migración, el endpoint POST /:assignId/finalize sobrescribía
-- `handover_url`, lo que hacía perder el documento original. Con esta
-- columna nueva, el supervisor puede ver el acta de alta (al momento de
-- entrega) y el acta de baja (al momento de devolución) en paralelo.
--
-- El PDF generado al finalizar se guarda en `return_handover_url`.
-- El `handover_url` queda intacto.

ALTER TABLE company_assignments
  ADD COLUMN IF NOT EXISTS return_handover_url TEXT;