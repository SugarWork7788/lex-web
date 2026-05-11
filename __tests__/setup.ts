// Vitest setup — wires @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveAttribute, etc.) onto vitest's expect().
// Loaded via vitest.config.ts setupFiles.
import "@testing-library/jest-dom/vitest";

// Provide minimal env vars so modules with top-level env-var guards
// (e.g. lib/supabase-auth.ts) can load under vitest. Next.js loads
// .env.local at runtime; vitest does not. Tests that exercise real
// behavior should mock the supabase client; these defaults exist so
// the module-load guard does not throw before mocks register.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.AUDIT_VOTE_SALT ??= "test-salt";
