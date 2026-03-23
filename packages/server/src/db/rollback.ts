import { getKnex } from "./adapters/knex.adapter";

async function rollback() {
  const knex = getKnex();
  try {
    console.log("Rolling back last migration batch...");
    const [batch, migrations] = await knex.migrate.rollback({
      directory: __dirname + "/migrations/sql",
    });
    if (migrations.length === 0) {
      console.log("Nothing to roll back");
    } else {
      console.log(`Batch ${batch}: ${migrations.length} migrations rolled back`);
      migrations.forEach((m: string) => console.log(`  - ${m}`));
    }
  } catch (err) {
    console.error("Rollback failed:", err);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

rollback();
