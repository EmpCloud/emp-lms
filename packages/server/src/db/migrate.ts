import { promises as fs } from "fs";
import * as path from "path";
import { getKnex, KnexAdapter } from "./adapters/knex.adapter";
import { config } from "../config";

/**
 * Realign `knex_migrations.name` rows to whatever extension the migration files
 * actually use on disk right now. Without this, a project that originally ran
 * migrations via `tsx` (recording `.ts`) and later switched to compiled `.js`
 * (or vice-versa) will hit `validateMigrationList` "directory is corrupt"
 * because knex compares names verbatim.
 *
 * Idempotent and safe on a fresh DB (returns early if the table doesn't exist).
 */
async function normalizeMigrationExtensions(knex: any, dir: string): Promise<void> {
  const exists = await knex.schema.hasTable("knex_migrations");
  if (!exists) return;

  const files = await fs.readdir(dir);
  const onDisk = new Set(files);
  const byBase = new Map<string, string>();
  for (const f of files) {
    byBase.set(f.replace(/\.[jt]s$/, ""), f);
  }

  const records: { id: number; name: string }[] = await knex("knex_migrations").select(
    "id",
    "name",
  );
  let renamed = 0;
  for (const r of records) {
    if (onDisk.has(r.name)) continue; // already correct
    const base = r.name.replace(/\.[jt]s$/, "");
    const match = byBase.get(base);
    if (match) {
      await knex("knex_migrations").where({ id: r.id }).update({ name: match });
      console.log(`  realigned record: ${r.name} → ${match}`);
      renamed++;
    }
  }
  if (renamed) console.log(`Normalized ${renamed} migration record(s).`);
}

async function migrate() {
  const adapter = new KnexAdapter({
    client: "mysql2",
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    pool: { min: config.db.poolMin, max: config.db.poolMax },
  });
  await adapter.connect();
  const knex = getKnex();
  const dir = path.join(__dirname, "migrations", "sql");
  try {
    await normalizeMigrationExtensions(knex, dir);
    console.log("Running migrations...");
    const [batch, migrations] = await knex.migrate.latest({ directory: dir });
    if (migrations.length === 0) {
      console.log("Already up to date");
    } else {
      console.log(`Batch ${batch}: ${migrations.length} migrations applied`);
      migrations.forEach((m: string) => console.log(`  - ${m}`));
    }
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

migrate();
