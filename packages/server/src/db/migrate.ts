import { KnexAdapter } from "./adapters/knex.adapter";
import { config } from "../config";

// Standalone migration runner. The actual self-heal + knex.migrate.latest()
// logic lives in KnexAdapter.migrate() so server startup gets it too.
async function main() {
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
  try {
    console.log("Running migrations...");
    await adapter.migrate();
    console.log("Migrations complete.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await adapter.disconnect?.();
  }
}

main();
