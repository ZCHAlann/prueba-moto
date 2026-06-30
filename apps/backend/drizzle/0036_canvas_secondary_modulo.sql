-- 0036_canvas_secondary_modulo.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Permite combinar dos módulos en un mismo widget del lienzo.
-- Por ejemplo: "Costo combustible vs costo mantenimiento por vehículo".
--
-- Si el widget tiene `secondary_modulo` set, el renderer del chart pide
-- datos combinados al backend (`/widgets/:id/combined-data`), que devuelve
-- dos series paralelas agregadas por entidad desde los dos módulos.
--
-- Solo aplica a `viz_kind = 'chart'`; para tablas sigue siendo un solo
-- módulo.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE company_canvas_widgets
  ADD COLUMN IF NOT EXISTS secondary_modulo varchar(40);

-- Validación a nivel app: cuando secondary_modulo está set, viz_kind
-- debe ser 'chart'. Lo enforcemos en triggers para no depender del cliente.
--
-- No creamos constraint CHECK porque PG no permite agregar CHECK con
-- subqueries; la validación queda en la capa de aplicación (canvas-boards.ts).

COMMENT ON COLUMN company_canvas_widgets.secondary_modulo IS
  'Segundo módulo a mostrar side-by-side con `modulo`. Solo válido para viz_kind=chart. NULL = widget simple (un solo módulo).';