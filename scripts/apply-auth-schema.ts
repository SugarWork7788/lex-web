import { readFileSync } from "node:fs";
import { Client } from "pg";

function maskUrl(url: string): string {
  return url.replace(/(:[^:@/]+@)/, ":***@");
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Error: DATABASE_URL not set in environment.");
    console.error("Hint: source ../lex-brain/.env or supply DATABASE_URL inline.");
    process.exit(1);
  }

  const sqlPath = `${process.cwd()}/db/auth_schema.sql`;
  const sql = readFileSync(sqlPath, "utf-8");

  console.log(`Applying auth schema migration from ${sqlPath} to ${maskUrl(dbUrl)}…`);

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Schema applied successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Schema apply failed:", err);
    await client.end();
    process.exit(1);
  }

  let allOk = true;
  const probes: { name: string; query: string; expect: number }[] = [
    {
      name: "user_profiles table exists",
      query: `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='user_profiles'`,
      expect: 1,
    },
    {
      name: "RLS enabled on user_profiles",
      query: `SELECT relname FROM pg_class WHERE relname='user_profiles' AND relrowsecurity=true`,
      expect: 1,
    },
    {
      name: "user_profiles has both RLS policies (read + update)",
      query: `SELECT policyname FROM pg_policies WHERE tablename='user_profiles'`,
      expect: 2,
    },
    {
      name: "handle_new_user is SECURITY DEFINER with search_path=public (hardened)",
      query: `SELECT proname FROM pg_proc WHERE proname='handle_new_user' AND prosecdef=true AND proconfig::text LIKE '%search_path=public%'`,
      expect: 1,
    },
    {
      name: "on_auth_user_created trigger registered on auth.users",
      query: `SELECT tgname FROM pg_trigger WHERE tgname='on_auth_user_created' AND tgrelid='auth.users'::regclass`,
      expect: 1,
    },
    {
      name: "user_profiles.avatar_id column exists with default 'initials'",
      query: `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name='avatar_id' AND column_default LIKE '%initials%'`,
      expect: 1,
    },
  ];

  for (const probe of probes) {
    const res = await client.query(probe.query);
    if (res.rowCount === probe.expect) {
      console.log(`OK: ${probe.name} (${res.rowCount}/${probe.expect})`);
    } else {
      console.error(`MISSING: ${probe.name} (got ${res.rowCount}, expected ${probe.expect})`);
      allOk = false;
    }
  }

  await client.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
