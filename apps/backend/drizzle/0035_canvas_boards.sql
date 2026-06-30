-- ============================================================================
-- 0035_canvas_boards.sql
-- ============================================================================
-- Lienzo de presentación (dashboard builder):
--   - company_canvas_boards: cada lienzo guardado.
--   - company_canvas_widgets: gráficas/tablas colocadas en el lienzo.
--
-- Idempotente (IF NOT EXISTS / DO blocks). Pensado para re-ejecución segura.
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'canvas_widget_viz_kind_enum') THEN
    CREATE TYPE canvas_widget_viz_kind_enum AS ENUM ('chart', 'table');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'canvas_widget_chart_type_enum') THEN
    CREATE TYPE canvas_widget_chart_type_enum AS ENUM (
      'bar_h', 'bar_v', 'line', 'line_exponencial', 'pie', 'radar'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'canvas_widget_scope_enum') THEN
    CREATE TYPE canvas_widget_scope_enum AS ENUM ('todos', 'uno', 'varios');
  END IF;
END
$$;

-- ── Tabla boards ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_canvas_boards (
  id            serial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_user_id integer REFERENCES company_users(id) ON DELETE SET NULL,
  name          varchar(160) NOT NULL,
  description   text,
  panel_modules text[] NOT NULL DEFAULT '{}',
  is_shared     boolean NOT NULL DEFAULT false,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canvas_boards_company_owner
  ON company_canvas_boards(company_id, owner_user_id);

CREATE INDEX IF NOT EXISTS idx_canvas_boards_shared
  ON company_canvas_boards(company_id, is_shared)
  WHERE is_shared = true;

-- ── Tabla widgets ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_canvas_widgets (
  id            serial PRIMARY KEY,
  board_id      integer NOT NULL REFERENCES company_canvas_boards(id) ON DELETE CASCADE,
  company_id    integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  modulo        varchar(40) NOT NULL,
  viz_kind      canvas_widget_viz_kind_enum NOT NULL,
  chart_type    canvas_widget_chart_type_enum,

  scope         canvas_widget_scope_enum NOT NULL DEFAULT 'todos',
  entity_kind   varchar(10),
  entity_ids    integer[] NOT NULL DEFAULT '{}',

  periodo       varchar(10) NOT NULL DEFAULT 'month',
  fecha_desde   date NOT NULL,
  fecha_hasta   date NOT NULL,

  source_field  varchar(30) NOT NULL,

  pos_x         integer NOT NULL DEFAULT 0,
  pos_y         integer NOT NULL DEFAULT 0,
  width         integer NOT NULL DEFAULT 420,
  height        integer NOT NULL DEFAULT 300,

  title         varchar(160),

  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canvas_widgets_board
  ON company_canvas_widgets(board_id);

CREATE INDEX IF NOT EXISTS idx_canvas_widgets_company
  ON company_canvas_widgets(company_id);

ANALYZE;