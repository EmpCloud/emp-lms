import { getKnex } from "./adapters/knex.adapter";

async function migrate() {
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
