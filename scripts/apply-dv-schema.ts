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

  const sqlPath = `${process.cwd()}/db/dv_schema.sql`;
  const sql = readFileSync(sqlPath, "utf-8");

  console.log(`Applying DV schema migration from ${sqlPath} to ${maskUrl(dbUrl)}…`);

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

  // Probes
  let allOk = true;
  const probes: { name: string; query: string; expect: number }[] = [
    {
      name: "search_vector column on dv_acts",
      query: `SELECT column_name FROM information_schema.columns WHERE table_name='dv_acts' AND column_name='search_vector'`,
      expect: 1,
    },
    {
      name: "search_vector column on dv_issues",
      query: `SELECT column_name FROM information_schema.columns WHERE table_name='dv_issues' AND column_name='search_vector'`,
      expect: 1,
    },
    {
      name: "GIN indexes (dv_acts_fts + dv_issues_fts)",
      query: `SELECT indexname FROM pg_indexes WHERE indexname IN ('dv_acts_fts', 'dv_issues_fts')`,
      expect: 2,
    },
    {
      name: "dv_search_top RPC",
      query: `SELECT proname FROM pg_proc WHERE proname='dv_search_top'`,
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

  // Smoke: call the RPC with empty input — must NOT error
  try {
    const smoke = await client.query("SELECT * FROM dv_search_top('тест') LIMIT 1");
    console.log(`OK: dv_search_top('тест') returned ${smoke.rowCount} row(s).`);
  } catch (err) {
    console.error(`FAIL: dv_search_top smoke query failed:`, err);
    allOk = false;
  }

  await client.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
