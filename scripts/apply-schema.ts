import { Client } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set in the environment.");
    process.exit(1);
  }

  const sqlPath = resolve(import.meta.dirname ?? "scripts", "schema.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    console.log(`Applying schema from ${sqlPath} to ${maskUrl(url)}…`);
    await client.query(sql);
    console.log("Schema applied successfully.");

    const tables = await client.query(
      `SELECT tablename FROM pg_tables WHERE tablename IN ('law_analyses','law_issues','law_alerts') ORDER BY tablename;`,
    );
    console.log("Tables present:", tables.rows.map((r) => r.tablename).join(", "));
  } finally {
    await client.end();
  }
}

function maskUrl(u: string): string {
  return u.replace(/:[^@/]+@/, ":***@");
}

main().catch((err) => {
  console.error("Schema apply failed:", err);
  process.exit(1);
});
