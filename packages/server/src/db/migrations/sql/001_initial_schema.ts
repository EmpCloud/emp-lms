import type { Knex } from "knex";

const DIFFICULTY_LEVELS = ["beginner", "intermediate", "advanced", "expert"];
const COURSE_STATUSES = ["draft", "published", "archived"];
const ENROLLMENT_STATUSES = [
  "enrolled",
  "in_progress",
  "completed",
  "failed",
  "dropped",
  "expired",
];
const CONTENT_TYPES = [
  "text",
  "video",
  "document",
  "slide",
  "scorm",
  "xapi",
  "link",
  "embed",
];
const COMPLETION_CRITERIA = [
  "all_lessons",
  "quiz_pass",
  "manual",
  "time_based",
];
const QUESTION_TYPES = [
  "mcq",
  "multi_select",
  "true_false",
  "fill_blank",
  "essay",
  "matching",
  "ordering",
];
const QUIZ_TYPES = ["graded", "practice", "survey"];
const SCORM_VERSIONS = ["1.2", "2004"];
const SCORM_STATUSES = [
  "not_attempted",
  "incomplete",
  "completed",
  "passed",
  "failed",
];
const CERTIFICATE_STATUSES = ["active", "expired", "revoked"];
const COMPLIANCE_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "overdue",
];
const ASSIGNED_TO_TYPES = ["all", "department", "role", "user"];
const ILT_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"];
const ATTENDANCE_STATUSES = ["registered", "attended", "absent", "excused"];
const LP_ENROLLMENT_STATUSES = ["enrolled", "in_progress", "completed"];

export async function up(knex: Knex): Promise<void> {
  // 1. course_categories
  await knex.schema.createTable("course_categories", (t) => {
    t.string("id", 36).primary();
    t.integer("org_id").unsigned().notNullable();
    t.string("name").notNullable();
    t.string("slug").notNullable();
    t.text("description").nullable();
    t.string("parent_id", 36)
      .nullable()
      .references("id")
      .inTable("course_categories")
      .onDelete("SET NULL");
    t.integer("sort_order").defaultTo(0);
    t.boolean("is_active").defaultTo(true);
    t.timestamps(true, true);

    t.index("org_id");
    t.unique(["org_id", "slug"]);
  });

  // 2. certificate_templates
  await knex.schema.createTable("certificate_templates", (t) => {
    t.string("id", 36).primary();
    t.integer("org_id").unsigned().notNullable();
    t.string("name").notNullable();
    t.text("description").nullable();
    t.specificType("html_template", "longtext").nullable();
    t.boolean("is_default").defaultTo(false);
    t.timestamps(true, true);

    t.index("org_id");
  });

  // 3. courses
  await knex.schema.createTable("courses", (t) => {
    t.string("id", 36).primary();
    t.integer("org_id").unsigned().notNullable();
    t.string("title").notNullable();
    t.string("slug").notNullable();
    t.text("description").nullable();
    t.string("short_description", 500).nullable();
    t.string("thumbnail_url").nullable();
    t.string("category_id", 36)
      .nullable()
      .references("id")
      .inTable("course_categories")
      .onDelete("SET NULL");
    t.integer("instructor_id").unsigned().nullable();
    t.enum("difficulty", DIFFICULTY_LEVELS).nullable();
    t.integer("duration_minutes").defaultTo(0);
    t.enum("status", COURSE_STATUSES).defaultTo("draft").notNullable();
    t.boolean("is_mandatory").defaultTo(false);
    t.boolean("is_featured").defaultTo(false);
    t.integer("max_enrollments").nullable();
    t.integer("enrollment_count").defaultTo(0);
    t.integer("completion_count").defaultTo(0);
    t.decimal("avg_rating", 3, 2).defaultTo(0);
    t.integer("rating_count").defaultTo(0);
    t.json("tags").nullable();
    t.json("prerequisites").nullable();
    t.enum("completion_criteria", COMPLETION_CRITERIA)
      .defaultTo("all_lessons")
      .notNullable();
    t.integer("passing_score").defaultTo(70);
    t.string("certificate_template_id", 36)
      .nullable()
      .references("id")
      .inTable("certificate_templates")
      .onDelete("SET NULL");
    t.datetime("published_at").nullable();
    t.json("metadata").nullable();
    t.integer("created_by").unsigned().notNullable();
    t.timestamps(true, true);

    t.unique(["org_id", "slug"]);
    t.index(["org_id", "status"]);
    t.index(["org_id", "category_id"]);
    t.index(["org_id", "is_mandatory"]);
  });

  // 4. course_modules
  await knex.schema.createTable("course_modules", (t) => {
    t.string("id", 36).primary();
    t.string("course_id", 36)
      .notNullable()
      .references("id")
      .inTable("courses")
      .onDelete("CASCADE");
    t.string("title").notNullable();
    t.text("description").nullable();
    t.integer("sort_order").defaultTo(0);
    t.boolean("is_published").defaultTo(true);
    t.timestamps(true, true);

    t.index(["course_id", "sort_order"]);
  });

  // 5. lessons
  await knex.schema.createTable("lessons", (t) => {
    t.string("id", 36).primary();
    t.string("module_id", 36)
      .notNullable()
      .references("id")
      .inTable("course_modules")
      .onDelete("CASCADE");
    t.string("title").notNullable();
    t.text("description").nullable();
    t.enum("content_type", CONTENT_TYPES).notNullable();
    t.text("content_url").nullable();
    t.specificType("content_text", "longtext").nullable();
    t.integer("duration_minutes").defaultTo(0);
    t.integer("sort_order").defaultTo(0);
    t.boolean("is_mandatory").defaultTo(true);
    t.boolean("is_preview").defaultTo(false);
    t.timestamps(true, true);

    t.index(["module_id", "sort_order"]);
  });

  // 6. enrollments
  await knex.schema.createTable("enrollments", (t) => {
    t.string("id", 36).primary();
    t.integer("org_id").unsigned().notNullable();
    t.integer("user_id").unsigned().notNullable();
    t.string("course_id", 36)
      .notNullable()
      .references("id")
      .inTable("courses")
      .onDelete("CASCADE");
    t.enum("status", ENROLLMENT_STATUSES).defaultTo("enrolled").notNullable();
    t.decimal("progress_percentage", 5, 2).defaultTo(0);
    t.datetime("enrolled_at").defaultTo(knex.fn.now());
    t.datetime("started_at").nullable();
    t.datetime("completed_at").nullable();
    t.datetime("due_date").nullable();
    t.datetime("last_accessed_at").nullable();
    t.integer("time_spent_minutes").defaultTo(0);
    t.decimal("score", 5, 2).nullable();
    t.timestamps(true, true);

    t.unique(["user_id", "course_id"]);
    t.index(["org_id", "user_id"]);
    t.index(["org_id", "course_id"]);
    t.index(["org_id", "status"]);
    t.index("due_date");
  });

  // 7. lesson_progress
  await knex.schema.createTable("lesson_progress", (t) => {
    t.string("id", 36).primary();
    t.string("enrollment_id", 36)
      .notNullable()
      .references("id")
      .inTable("enrollments")
      .onDelete("CASCADE");
    t.string("lesson_id", 36)
      .notNullable()
      .references("id")
      .inTable("lessons")
      .onDelete("CASCADE");
    t.boolean("is_completed").defaultTo(false);
    t.datetime("completed_at").nullable();
    t.integer("time_spent_minutes").defaultTo(0);
    t.integer("attempts").defaultTo(0);
    t.timestamps(true, true);

    t.unique(["enrollment_id", "lesson_id"]);
  });

  // 8. learning_paths
  await knex.schema.createTable("learning_paths", (t) => {
    t.string("id", 36).primary();
    t.integer("org_id").unsigned().notNullable();
    t.string("title").notNullable();
    t.string("slug").notNullable();
    t.text("description").nullable();
    t.string("thumbnail_url").nullable();
    t.enum("difficulty", DIFFICULTY_LEVELS).nullable();
    t.integer("estimated_duration_minutes").defaultTo(0);
    t.enum("status", COURSE_STATUSES).defaultTo("draft").notNullable();
    t.boolean("is_mandatory").defaultTo(false);
    t.integer("sort_order").defaultTo(0);
    t.integer("created_by").unsigned().notNullable();
    t.timestamps(true, true);

    t.unique(["org_id", "slug"]);
  });

  // 9. learning_path_courses
  await knex.schema.createTable("learning_path_courses", (t) => {
    t.string("id", 36).primary();
    t.string("learning_path_id", 36)
      .notNullable()
      .references("id")
      .inTable("learning_paths")
      .onDelete("CASCADE");
    t.string("course_id", 36)
      .notNullable()
      .references("id")
      .inTable("courses")
      .onDelete("CASCADE");
    t.integer("sort_order").defaultTo(0);
    t.boolean("is_mandatory").defaultTo(true);
    t.timestamps(true, true);

    t.unique(["learning_path_id", "course_id"]);
  });

  // 10. learning_path_enrollments
  await knex.schema.createTable("learning_path_enrollments", (t) => {
    t.string("id", 36).primary();
    t.integer("org_id").unsigned().notNullable();
    t.integer("user_id").unsigned().notNullable();
    t.string("learning_path_id", 36)
      .notNullable()
      .references("id")
      .inTable("learning_paths")
      .onDelete("CASCADE");
    t.enum("status", LP_ENROLLMENT_STATUSES)
      .defaultTo("enrolled")
      .notNullable();
    t.decimal("progress_percentage", 5, 2).defaultTo(0);
    t.datetime("enrolled_at").defaultTo(knex.fn.now());
    t.datetime("completed_at").nullable();
    t.timestamps(true, true);

    t.unique(["user_id", "learning_path_id"]);
  });

  // 11. quizzes
  await knex.schema.createTable("quizzes", (t) => {
    t.string("id", 36).primary();
    t.string("course_id", 36)
      .notNullable()
      .references("id")
      .inTable("courses")
      .onDelete("CASCADE");
    t.string("module_id", 36)
      .nullable()
      .references("id")
      .inTable("course_modules")
      .onDelete("CASCADE");
    t.string("title").notNullable();
    t.text("description").nullable();
    t.enum("type", QUIZ_TYPES).defaultTo("graded").notNullable();
    t.integer("time_limit_minutes").nullable();
    t.integer("passing_score").defaultTo(70);
    t.integer("max_attempts").defaultTo(3);
    t.boolean("shuffle_questions").defaultTo(false);
    t.boolean("show_answers").defaultTo(true);
    t.integer("sort_order").defaultTo(0);
    t.timestamps(true, true);

    t.index("course_id");
  });

  // 12. questions
  await knex.schema.createTable("questions", (t) => {
    t.string("id", 36).primary();
    t.string("quiz_id", 36)
      .notNullable()
      .references("id")
      .inTable("quizzes")
      .onDelete("CASCADE");
    t.enum("type", QUESTION_TYPES).notNullable();
    t.text("text").notNullable();
    t.text("explanation").nullable();
    t.integer("points").defaultTo(1);
    t.integer("sort_order").defaultTo(0);
    t.json("options").nullable();
    t.timestamps(true, true);

    t.index(["quiz_id", "sort_order"]);
  });

  // 13. quiz_attempts
  await knex.schema.createTable("quiz_attempts", (t) => {
    t.string("id", 36).primary();
    t.string("quiz_id", 36)
      .notNullable()
      .references("id")
      .inTable("quizzes")
      .onDelete("CASCADE");
    t.string("enrollment_id", 36)
      .notNullable()
      .references("id")
      .inTable("enrollments")
      .onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable();
    t.integer("attempt_number").defaultTo(1);
    t.decimal("score", 5, 2).nullable();
    t.boolean("passed").nullable();
    t.datetime("started_at").defaultTo(knex.fn.now());
    t.datetime("completed_at").nullable();
    t.json("answers").nullable();
    t.timestamps(true, true);

    t.index(["quiz_id", "user_id"]);
    t.index("enrollment_id");
  });

  // 14. certificates
  await knex.schema.createTable("certificates", (t) => {
    t.string("id", 36).primary();
    t.integer("org_id").unsigned().notNullable();
    t.integer("user_id").unsigned().notNullable();
    t.string("course_id", 36)
      .notNullable()
      .references("id")
      .inTable("courses")
      .onDelete("CASCADE");
    t.string("enrollment_id", 36)
      .notNullable()
      .references("id")
      .inTable("enrollments")
      .onDelete("CASCADE");
    t.string("certificate_number", 50).notNullable();
    t.datetime("issued_at").defaultTo(knex.fn.now());
    t.datetime("expires_at").nullable();
    t.enum("status", CERTIFICATE_STATUSES).defaultTo("active").notNullable();
    t.string("template_id", 36)
      .nullable()
      .references("id")
      .inTable("certificate_templates")
      .onDelete("SET NULL");
    t.json("metadata").nullable();
    t.string("pdf_url").nullable();
    t.timestamps(true, true);

    t.unique(["certificate_number"]);
    t.index(["org_id", "user_id"]);
    t.index(["org_id", "status"]);
    t.index("expires_at");
  });

  // 15. compliance_assignments
  await knex.schema.createTable("compliance_assignments", (t) => {
    t.string("id", 36).primary();
    t.integer("org_id").unsigned().notNullable();
    t.string("course_id", 36)
      .notNullable()
      .references("id")
      .inTable("courses")
      .onDelete("CASCADE");
    t.string("name").notNullable();
    t.text("description").nullable();
    t.enum("assigned_to_type", ASSIGNED_TO_TYPES).notNullable();
    t.json("assigned_to_ids").nullable();
    t.datetime("due_date").notNullable();
    t.boolean("is_recurring").defaultTo(false);
    t.integer("recurrence_interval_days").nullable();
    t.boolean("is_active").defaultTo(true);
    t.integer("created_by").unsigned().notNullable();
    t.timestamps(true, true);

    t.index(["org_id", "course_id"]);
    t.index(["org_id", "due_date"]);
  });

  // 16. compliance_records
  await knex.schema.createTable("compliance_records", (t) => {
    t.string("id", 36).primary();
    t.string("assignment_id", 36)
      .notNullable()
      .references("id")
      .inTable("compliance_assignments")
      .onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable();
    t.string("course_id", 36)
      .notNullable()
      .references("id")
      .inTable("courses")
      .onDelete("CASCADE");
    t.integer("org_id").unsigned().notNullable();
    t.enum("status", COMPLIANCE_STATUSES)
      .defaultTo("not_started")
      .notNullable();
    t.datetime("due_date").notNullable();
    t.datetime("completed_at").nullable();
    t.datetime("last_reminder_sent_at").nullable();
    t.timestamps(true, true);

    t.unique(["assignment_id", "user_id"]);
    t.index(["org_id", "user_id"]);
    t.index(["org_id", "status"]);
    t.index("due_date");
  });

  // 17. ilt_sessions
  await knex.schema.createTable("ilt_sessions", (t) => {
    t.string("id", 36).primary();
    t.integer("org_id").unsigned().notNullable();
    t.string("course_id", 36)
      .nullable()
      .references("id")
      .inTable("courses")
      .onDelete("SET NULL");
    t.string("title").notNullable();
    t.text("description").nullable();
    t.integer("instructor_id").unsigned().notNullable();
    t.string("location").nullable();
    t.text("meeting_url").nullable();
    t.datetime("start_time").notNullable();
    t.datetime("end_time").notNullable();
    t.integer("max_attendees").nullable();
    t.integer("enrolled_count").defaultTo(0);
    t.enum("status", ILT_STATUSES).defaultTo("scheduled").notNullable();
    t.text("materials_url").nullable();
    t.timestamps(true, true);

    t.index(["org_id", "status"]);
    t.index(["org_id", "start_time"]);
  });

  // 18. ilt_attendance
  await knex.schema.createTable("ilt_attendance", (t) => {
    t.string("id", 36).primary();
    t.string("session_id", 36)
      .notNullable()
      .references("id")
      .inTable("ilt_sessions")
      .onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable();
    t.enum("status", ATTENDANCE_STATUSES)
      .defaultTo("registered")
      .notNullable();
    t.datetime("checked_in_at").nullable();
    t.timestamps(true, true);

    t.unique(["session_id", "user_id"]);
  });

  // 19. scorm_packages
  await knex.schema.createTable("scorm_packages", (t) => {
    t.string("id", 36).primary();
    t.integer("org_id").unsigned().notNullable();
    t.string("course_id", 36)
      .notNullable()
      .references("id")
      .inTable("courses")
      .onDelete("CASCADE");
    t.string("lesson_id", 36)
      .nullable()
      .references("id")
      .inTable("lessons")
      .onDelete("SET NULL");
    t.string("title").notNullable();
    t.enum("version", SCORM_VERSIONS).notNullable();
    t.string("entry_point").notNullable();
    t.text("package_url").notNullable();
    t.json("manifest_data").nullable();
    t.timestamps(true, true);

    t.index(["org_id", "course_id"]);
  });

  // 20. scorm_tracking
  await knex.schema.createTable("scorm_tracking", (t) => {
    t.string("id", 36).primary();
    t.string("package_id", 36)
      .notNullable()
      .references("id")
      .inTable("scorm_packages")
      .onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable();
    t.string("enrollment_id", 36)
      .notNullable()
      .references("id")
      .inTable("enrollments")
      .onDelete("CASCADE");
    t.enum("status", SCORM_STATUSES)
      .defaultTo("not_attempted")
      .notNullable();
    t.decimal("score", 5, 2).nullable();
    t.integer("time_spent").defaultTo(0);
    t.specificType("suspend_data", "longtext").nullable();
    t.string("location").nullable();
    t.string("total_time").nullable();
    t.string("completion_status").nullable();
    t.string("success_status").nullable();
    t.timestamps(true, true);

    t.unique(["package_id", "user_id"]);
  });

  // 21. course_ratings
  await knex.schema.createTable("course_ratings", (t) => {
    t.string("id", 36).primary();
    t.string("course_id", 36)
      .notNullable()
      .references("id")
      .inTable("courses")
      .onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable();
    t.integer("org_id").unsigned().notNullable();
    t.tinyint("rating").unsigned().notNullable();
    t.text("review").nullable();
    t.boolean("is_approved").defaultTo(true);
    t.timestamps(true, true);

    t.unique(["course_id", "user_id"]);
    t.index(["org_id", "course_id"]);
  });

  // 22. discussions
  await knex.schema.createTable("discussions", (t) => {
    t.string("id", 36).primary();
    t.string("course_id", 36)
      .notNullable()
      .references("id")
      .inTable("courses")
      .onDelete("CASCADE");
    t.string("lesson_id", 36)
      .nullable()
      .references("id")
      .inTable("lessons")
      .onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable();
    t.integer("org_id").unsigned().notNullable();
    t.string("parent_id", 36)
      .nullable()
      .references("id")
      .inTable("discussions")
      .onDelete("CASCADE");
    t.string("title").nullable();
    t.text("content").notNullable();
    t.boolean("is_pinned").defaultTo(false);
    t.boolean("is_resolved").defaultTo(false);
    t.integer("reply_count").defaultTo(0);
    t.timestamps(true, true);

    t.index(["course_id", "lesson_id"]);
    t.index(["org_id", "course_id"]);
  });

  // 23. content_library
  await knex.schema.createTable("content_library", (t) => {
    t.string("id", 36).primary();
    t.integer("org_id").unsigned().notNullable();
    t.string("title").notNullable();
    t.text("description").nullable();
    t.enum("content_type", CONTENT_TYPES).notNullable();
    t.text("content_url").nullable();
    t.text("thumbnail_url").nullable();
    t.string("category").nullable();
    t.json("tags").nullable();
    t.boolean("is_public").defaultTo(false);
    t.string("source").nullable();
    t.string("external_id").nullable();
    t.json("metadata").nullable();
    t.integer("created_by").unsigned().notNullable();
    t.timestamps(true, true);

    t.index(["org_id", "content_type"]);
    t.index(["org_id", "category"]);
  });

  // 24. user_learning_profiles
  await knex.schema.createTable("user_learning_profiles", (t) => {
    t.string("id", 36).primary();
    t.integer("org_id").unsigned().notNullable();
    t.integer("user_id").unsigned().notNullable();
    t.json("preferred_categories").nullable();
    t.enum("preferred_difficulty", DIFFICULTY_LEVELS).nullable();
    t.integer("total_courses_completed").defaultTo(0);
    t.integer("total_time_spent_minutes").defaultTo(0);
    t.integer("total_points_earned").defaultTo(0);
    t.integer("current_streak_days").defaultTo(0);
    t.integer("longest_streak_days").defaultTo(0);
    t.datetime("last_activity_at").nullable();
    t.timestamps(true, true);

    t.unique(["org_id", "user_id"]);
  });

  // 25. notifications
  await knex.schema.createTable("notifications", (t) => {
    t.string("id", 36).primary();
    t.integer("org_id").unsigned().notNullable();
    t.integer("user_id").unsigned().notNullable();
    t.string("type", 50).notNullable();
    t.string("title").notNullable();
    t.text("message").notNullable();
    t.string("reference_id").nullable();
    t.string("reference_type").nullable();
    t.boolean("is_read").defaultTo(false);
    t.datetime("read_at").nullable();
    t.timestamps(true, true);

    t.index(["org_id", "user_id", "is_read"]);
    t.index("created_at");
  });

  // 26. audit_logs
  await knex.schema.createTable("audit_logs", (t) => {
    t.string("id", 36).primary();
    t.integer("org_id").unsigned().notNullable();
    t.integer("user_id").unsigned().notNullable();
    t.string("action", 50).notNullable();
    t.string("entity_type", 50).notNullable();
    t.string("entity_id", 36).notNullable();
    t.json("old_values").nullable();
    t.json("new_values").nullable();
    t.string("ip_address", 45).nullable();
    t.text("user_agent").nullable();
    t.timestamps(true, true);

    t.index(["org_id", "entity_type", "entity_id"]);
    t.index(["org_id", "user_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    "audit_logs",
    "notifications",
    "user_learning_profiles",
    "content_library",
    "discussions",
    "course_ratings",
    "scorm_tracking",
    "scorm_packages",
    "ilt_attendance",
    "ilt_sessions",
    "compliance_records",
    "compliance_assignments",
    "certificates",
    "quiz_attempts",
    "questions",
    "quizzes",
    "learning_path_enrollments",
    "learning_path_courses",
    "learning_paths",
    "lesson_progress",
    "enrollments",
    "lessons",
    "course_modules",
    "courses",
    "certificate_templates",
    "course_categories",
  ];

  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
