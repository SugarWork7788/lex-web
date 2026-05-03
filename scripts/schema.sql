-- lex-web schema migration: analyses, issues, alerts
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS law_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  law_slug text NOT NULL,
  law_name_bg text NOT NULL,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  laws_analyzed int NOT NULL DEFAULT 0,
  duration_seconds int,
  total_issues int NOT NULL DEFAULT 0,
  issues_high int NOT NULL DEFAULT 0,
  issues_medium int NOT NULL DEFAULT 0,
  issues_low int NOT NULL DEFAULT 0,
  UNIQUE (law_slug, analyzed_at)
);

CREATE TABLE IF NOT EXISTS law_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES law_analyses(id) ON DELETE CASCADE,
  law_slug text NOT NULL,
  type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('нисък','среден','висок')),
  explanation text NOT NULL,
  primary_law_slug text NOT NULL,
  primary_articles text[] NOT NULL DEFAULT '{}',
  conflicting_law_slug text,
  conflicting_articles text[] NOT NULL DEFAULT '{}',
  quote_primary text,
  quote_conflicting text,
  verified boolean,
  refined_explanation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS law_issues_analysis_id ON law_issues(analysis_id);
CREATE INDEX IF NOT EXISTS law_issues_law_slug ON law_issues(law_slug);
CREATE INDEX IF NOT EXISTS law_issues_severity ON law_issues(severity);
CREATE INDEX IF NOT EXISTS law_issues_type ON law_issues(type);
CREATE INDEX IF NOT EXISTS law_analyses_law_slug ON law_analyses(law_slug);
CREATE INDEX IF NOT EXISTS law_analyses_analyzed_at ON law_analyses(analyzed_at DESC);

-- Public legal data — no PII. Anon key writes via the app are intentional.
ALTER TABLE law_analyses DISABLE ROW LEVEL SECURITY;
ALTER TABLE law_issues   DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS law_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  law_slug text NOT NULL,
  law_name_bg text NOT NULL,
  confirmed boolean NOT NULL DEFAULT false,
  token text NOT NULL DEFAULT gen_random_uuid()::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, law_slug)
);
CREATE INDEX IF NOT EXISTS law_alerts_law_slug ON law_alerts(law_slug);
CREATE INDEX IF NOT EXISTS law_alerts_email ON law_alerts(email);

-- PII: enable RLS so the anon key can't list everyone's emails.
-- Allow INSERT (subscribe) and DELETE-by-token (unsubscribe), nothing else.
ALTER TABLE law_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert" ON law_alerts;
CREATE POLICY "anon_insert" ON law_alerts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete" ON law_alerts;
CREATE POLICY "anon_delete" ON law_alerts FOR DELETE USING (true);

DROP POLICY IF EXISTS "anon_update_confirm" ON law_alerts;
CREATE POLICY "anon_update_confirm" ON law_alerts FOR UPDATE USING (true) WITH CHECK (true);
