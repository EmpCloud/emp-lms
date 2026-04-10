import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("user_preferences"))) {
    await knex.schema.createTable("user_preferences", (t) => {
      t.uuid("id").primary();
      t.bigInteger("org_id").unsigned().notNullable();
      t.bigInteger("user_id").unsigned().notNullable();
      t.json("preferences").notNullable();
      t.timestamps(true, true);

      t.unique(["org_id", "user_id"]);
      t.index(["user_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("user_preferences");
}
