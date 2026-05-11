-- Phase 4 — Auth foundation: user_profiles + RLS + trigger
-- Idempotent — safe to re-run.
-- Per D-05 + D-06 (single-language site, YAGNI) + RESEARCH §"Recommended db/auth_schema.sql"
--   (SECURITY DEFINER hardened with SET search_path = public).

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read own profile" ON user_profiles;
CREATE POLICY "users can read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "users can update own profile" ON user_profiles;
CREATE POLICY "users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    INSERT INTO public.user_profiles (id, display_name)
    VALUES (
      NEW.id,
      COALESCE(
        NEW.raw_user_meta_data->>'display_name',  -- email signup (D-03)
        NEW.raw_user_meta_data->>'full_name',     -- Google OAuth (D-03)
        split_part(NEW.email, '@', 1)             -- safety net
      )
    );
    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
