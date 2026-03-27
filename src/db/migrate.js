const fs = require("fs");
const path = require("path");

const { connectDatabase, getClient, closeDatabase } = require("../config/database");

const MIGRATIONS_DIR = path.resolve(__dirname, "./migrations");

async function main() {
  await connectDatabase();
  const client = await getClient();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const alreadyApplied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [file]
      );

      if (alreadyApplied.rowCount > 0) {
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file]
      );
      await client.query("COMMIT");

      console.log(`[Migration] applied ${file}`);
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[Migration] failed", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await closeDatabase();
  }
}

main();
