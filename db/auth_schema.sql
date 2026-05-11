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

-- Avatar selection.
-- Default 'initials' = colored circle with first letter of display_name (UI generates).
-- Value 'google'     = use raw_user_meta_data.avatar_url from auth.users (Google photo).
-- Other values       = preset PNG id (see PRESET_AVATARS in lib/avatars.ts) → /avatars/{id}.png
-- Column is plain text with no CHECK constraint; the app layer is the single
-- source of validity. The UI falls back to 'initials' for unknown ids.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_id text DEFAULT 'initials';
ALTER TABLE user_profiles ALTER COLUMN avatar_id SET DEFAULT 'initials';
