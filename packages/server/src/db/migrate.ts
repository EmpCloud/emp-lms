import { getKnex, KnexAdapter } from "./adapters/knex.adapter";
import { config } from "../config";

async function migrate() {
  // Initialize database connection
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
  try {
    console.log("Running migrations...");
    const [batch, migrations] = await knex.migrate.latest({
      directory: __dirname + "/migrations/sql",
    });
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
