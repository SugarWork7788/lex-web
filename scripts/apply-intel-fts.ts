/**
 * Applies the lex-web Phase 2 intel-FTS migration (db/intel_fts.sql) to the
 * database pointed at by DATABASE_URL.
 *
 * Mirrors scripts/apply-schema.ts shape; differs only in:
 *   - SQL path → db/intel_fts.sql
 *   - Post-apply probes (closes RESEARCH Q1):
 *       * 6 search_vector columns present
 *       * 6 GIN indexes named <table>_fts present
 *       * intel_search_top() callable
 *
 * Invoke: `bun run db:intel-fts`  (preferred — bun has native TS support)
 *      OR `npx tsx scripts/apply-intel-fts.ts`  (Node fallback)
 *
 * Source: .planning/phases/02-new-ai-features/02-01-PLAN.md Task 2.
 */
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set in the environment.");
    process.exit(1);
  }

  const sqlPath = resolve(import.meta.dirname ?? "scripts", "..", "db", "intel_fts.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    console.log(`Applying intel-FTS migration from ${sqlPath} to ${maskUrl(url)}…`);
    await client.query(sql);
    console.log("Schema applied successfully.");

    // Probe 1: search_vector column present on all 6 intel tables.
    const columnsCheck = await client.query(`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'search_vector'
        AND table_name IN ('sanctioned_entities','offshore_entities','olaf_cases','investigative_articles','prosecution_cases','nap_rulings')
      ORDER BY table_name;
    `);
    const present = columnsCheck.rows.map((r: { table_name: string }) => r.table_name);
    const expected = [
      "investigative_articles",
      "nap_rulings",
      "offshore_entities",
      "olaf_cases",
      "prosecution_cases",
      "sanctioned_entities",
    ];
    const missing = expected.filter((t) => !present.includes(t));
    if (missing.length) {
      console.error(`FAIL: search_vector missing from: ${missing.join(", ")}`);
      process.exit(1);
    }
    console.log(`OK: search_vector present on all 6 tables: ${present.join(", ")}`);

    // Probe 2: 6 GIN indexes named <table>_fts.
    const indexesCheck = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('sanctioned_entities_fts','offshore_entities_fts','olaf_cases_fts','investigative_articles_fts','prosecution_cases_fts','nap_rulings_fts')
      ORDER BY indexname;
    `);
    console.log(
      `OK: GIN indexes present (${indexesCheck.rowCount}/6): ${indexesCheck.rows
        .map((r: { indexname: string }) => r.indexname)
        .join(", ")}`,
    );
    if ((indexesCheck.rowCount ?? 0) !== 6) {
      console.error("FAIL: not all 6 GIN indexes present");
      process.exit(1);
    }

    // Probe 3: intel_search_top is callable.
    const fnCheck = await client.query(`SELECT * FROM intel_search_top('тест') LIMIT 5;`);
    console.log(`OK: intel_search_top('тест') returned ${fnCheck.rowCount} rows.`);
  } finally {
    await client.end();
  }
}

function maskUrl(u: string): string {
  return u.replace(/:[^@/]+@/, ":***@");
}

main().catch((err) => {
  console.error("Intel-FTS apply failed:", err);
  process.exit(1);
});
