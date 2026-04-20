import { getKnex, KnexAdapter } from "./adapters/knex.adapter";
import { initEmpCloudDB, getEmpCloudDB, closeEmpCloudDB } from "./empcloud";
import { config } from "../config";
import { v4 as uuidv4 } from "uuid";

// Deterministic-but-varied generator so the leaderboard looks realistic without
// being different on every run (idempotent upsert by (org_id, user_id)).
function pseudo(seed: number, max: number, offset = 0): number {
  const x = Math.sin(seed * 9301 + 49297 + offset) * 233280;
  return Math.floor((x - Math.floor(x)) * max);
}

async function seedLeaderboard() {
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
  await initEmpCloudDB();

  const lmsDb = getKnex();
  const empDb = getEmpCloudDB();

  try {
    const orgs: Array<{ id: number; name: string }> = await empDb("organizations")
      .select("id", "name")
      .where("is_active", 1);

    if (!orgs.length) {
      console.log("No active organizations found in EmpCloud DB.");
      return;
    }

    let totalInserted = 0;
    let totalUpdated = 0;

    for (const org of orgs) {
      const users: Array<{ id: number; first_name: string; last_name: string }> =
        await empDb("users")
          .select("id", "first_name", "last_name")
          .where({ organization_id: org.id, status: 1 })
          .limit(15);

      if (!users.length) {
        console.log(`Org #${org.id} "${org.name}": no active users, skipping`);
        continue;
      }

      for (const [idx, user] of users.entries()) {
        const points = 250 + pseudo(user.id, 4750);
        const courses = 1 + pseudo(user.id, 25, 1);
        const minutes = 60 + pseudo(user.id, 4000, 2);
        const streak = pseudo(user.id, 18, 3);
        const longest = Math.max(streak, pseudo(user.id, 40, 4));

        const existing = await lmsDb("user_learning_profiles")
          .where({ org_id: org.id, user_id: user.id })
          .first();

        const payload = {
          total_courses_completed: courses,
          total_time_spent_minutes: minutes,
          total_points_earned: points,
          current_streak_days: streak,
          longest_streak_days: longest,
          last_activity_at: new Date(Date.now() - pseudo(user.id, 72, 5) * 3600 * 1000),
          updated_at: new Date(),
        };

        if (existing) {
          await lmsDb("user_learning_profiles")
            .where({ id: existing.id })
            .update(payload);
          totalUpdated++;
        } else {
          await lmsDb("user_learning_profiles").insert({
            id: uuidv4(),
            org_id: org.id,
            user_id: user.id,
            preferred_categories: JSON.stringify([]),
            preferred_difficulty: null,
            ...payload,
            created_at: new Date(),
          });
          totalInserted++;
        }
      }

      console.log(`Org #${org.id} "${org.name}": seeded ${users.length} learner profiles`);
    }

    console.log(`\nDone. Inserted: ${totalInserted}, Updated: ${totalUpdated}`);
  } finally {
    await lmsDb.destroy();
    await closeEmpCloudDB();
  }
}

seedLeaderboard().catch((err) => {
  console.error("Leaderboard seed failed:", err);
  process.exit(1);
});
