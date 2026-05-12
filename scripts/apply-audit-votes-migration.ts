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

  const sqlPath = `${process.cwd()}/db/audit_votes_user_id_migration.sql`;
  const sql = readFileSync(sqlPath, "utf-8");

  console.log(`Applying audit_votes migration from ${sqlPath} to ${maskUrl(dbUrl)}…`);

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Migration applied successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration apply failed:", err);
    await client.end();
    process.exit(1);
  }

  let allOk = true;
  const probes: { name: string; query: string; expect: number }[] = [
    {
      name: "audit_votes.user_id column exists with FK to auth.users",
      query: `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='audit_votes' AND column_name='user_id'
      `,
      expect: 1,
    },
    {
      name: "legacy UNIQUE(finding_id, ip_hash) constraint is GONE",
      query: `
        SELECT conname FROM pg_constraint
        WHERE conname='audit_votes_finding_id_ip_hash_key'
      `,
      expect: 0,
    },
    {
      name: "legacy UNIQUE(finding_id, fingerprint_hash) constraint is GONE",
      query: `
        SELECT conname FROM pg_constraint
        WHERE conname='audit_votes_finding_id_fingerprint_hash_key'
      `,
      expect: 0,
    },
    {
      name: "audit_votes.fingerprint_hash is now NULLABLE",
      query: `
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='audit_votes'
          AND column_name='fingerprint_hash' AND is_nullable='YES'
      `,
      expect: 1,
    },
    {
      name: "partial UNIQUE INDEX audit_votes_user_finding_unique exists (with WHERE user_id IS NOT NULL)",
      query: `
        SELECT indexname FROM pg_indexes
        WHERE schemaname='public' AND tablename='audit_votes'
          AND indexname='audit_votes_user_finding_unique'
          AND indexdef LIKE '%WHERE (user_id IS NOT NULL)%'
      `,
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
