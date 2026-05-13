-- Migration template — copy and rename for new tables.
-- Idempotent: safe to re-run. All schema migrations MUST follow this template.

-- 1. Tables
CREATE TABLE IF NOT EXISTS public.example_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ... columns ...
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Indexes (FTS, foreign keys, common filters)
-- CREATE INDEX IF NOT EXISTS example_table_field_idx ON public.example_table(field);

-- 3. Row Level Security
ALTER TABLE public.example_table ENABLE ROW LEVEL SECURITY;

-- Public read example (uncomment + adapt):
-- DROP POLICY IF EXISTS "Public read example_table" ON public.example_table;
-- CREATE POLICY "Public read example_table"
--   ON public.example_table FOR SELECT
--   TO anon, authenticated
--   USING (true);

-- 4. GRANTS (REQUIRED — PostgREST returns 401/empty if missing)
--    Required from 2026-05-30 for ALL new tables. Do not omit.
GRANT SELECT ON public.example_table TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.example_table TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.example_table TO service_role;

-- 5. Sequence grants (if table has a serial/identity column)
-- GRANT USAGE ON SEQUENCE public.example_table_id_seq TO authenticated, service_role;

-- 6. Comments (optional but recommended)
-- COMMENT ON TABLE public.example_table IS 'What this table stores and why.';
