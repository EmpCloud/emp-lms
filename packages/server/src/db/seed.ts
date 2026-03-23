import { getKnex } from "./adapters/knex.adapter";
import { v4 as uuidv4 } from "uuid";

const ORG_ID = 1;
const ADMIN_USER_ID = 1;
const INSTRUCTOR_USER_ID = 2;
const LEARNER_USER_ID = 3;

async function seed() {
  const knex = getKnex();

  try {
    console.log("Seeding development data...");

    // Clean existing data (reverse dependency order)
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
      await knex(table).del();
    }

    // --- Course Categories ---
    const catTechId = uuidv4();
    const catSoftSkillsId = uuidv4();
    const catComplianceId = uuidv4();
    const catWebDevId = uuidv4();

    await knex("course_categories").insert([
      {
        id: catTechId,
        org_id: ORG_ID,
        name: "Technology",
        slug: "technology",
        description: "Technology and software development courses",
        parent_id: null,
        sort_order: 0,
        is_active: true,
      },
      {
        id: catSoftSkillsId,
        org_id: ORG_ID,
        name: "Soft Skills",
        slug: "soft-skills",
        description: "Communication, leadership, and interpersonal skills",
        parent_id: null,
        sort_order: 1,
        is_active: true,
      },
      {
        id: catComplianceId,
        org_id: ORG_ID,
        name: "Compliance",
        slug: "compliance",
        description: "Mandatory compliance and regulatory training",
        parent_id: null,
        sort_order: 2,
        is_active: true,
      },
      {
        id: catWebDevId,
        org_id: ORG_ID,
        name: "Web Development",
        slug: "web-development",
        description: "Frontend and backend web development",
        parent_id: catTechId,
        sort_order: 0,
        is_active: true,
      },
    ]);

    // --- Certificate Templates ---
    const certTemplateId = uuidv4();
    await knex("certificate_templates").insert([
      {
        id: certTemplateId,
        org_id: ORG_ID,
        name: "Default Certificate",
        description: "Standard course completion certificate",
        html_template: `<!DOCTYPE html>
<html>
<body style="text-align:center; font-family:Georgia,serif; padding:60px;">
  <h1 style="color:#2c3e50;">Certificate of Completion</h1>
  <p style="font-size:18px;">This certifies that</p>
  <h2 style="color:#3498db;">{{learner_name}}</h2>
  <p style="font-size:18px;">has successfully completed</p>
  <h3>{{course_title}}</h3>
  <p>Date: {{completion_date}}</p>
  <p>Certificate #: {{certificate_number}}</p>
</body>
</html>`,
        is_default: true,
      },
    ]);

    // --- Courses ---
    const courseJsId = uuidv4();
    const courseLeadershipId = uuidv4();

    await knex("courses").insert([
      {
        id: courseJsId,
        org_id: ORG_ID,
        title: "JavaScript Fundamentals",
        slug: "javascript-fundamentals",
        description:
          "A comprehensive introduction to JavaScript programming. Learn variables, functions, objects, arrays, and modern ES6+ features.",
        short_description:
          "Master the basics of JavaScript programming from scratch.",
        thumbnail_url: null,
        category_id: catWebDevId,
        instructor_id: INSTRUCTOR_USER_ID,
        difficulty: "beginner",
        duration_minutes: 480,
        status: "published",
        is_mandatory: false,
        is_featured: true,
        max_enrollments: null,
        enrollment_count: 0,
        completion_count: 0,
        avg_rating: 0,
        rating_count: 0,
        tags: JSON.stringify(["javascript", "web", "programming", "frontend"]),
        prerequisites: JSON.stringify([]),
        completion_criteria: "all_lessons",
        passing_score: 70,
        certificate_template_id: certTemplateId,
        published_at: new Date().toISOString(),
        metadata: null,
        created_by: ADMIN_USER_ID,
      },
      {
        id: courseLeadershipId,
        org_id: ORG_ID,
        title: "Leadership Essentials",
        slug: "leadership-essentials",
        description:
          "Develop core leadership skills including communication, delegation, conflict resolution, and team motivation.",
        short_description:
          "Build foundational leadership skills for emerging managers.",
        thumbnail_url: null,
        category_id: catSoftSkillsId,
        instructor_id: INSTRUCTOR_USER_ID,
        difficulty: "intermediate",
        duration_minutes: 360,
        status: "published",
        is_mandatory: false,
        is_featured: false,
        max_enrollments: 50,
        enrollment_count: 0,
        completion_count: 0,
        avg_rating: 0,
        rating_count: 0,
        tags: JSON.stringify(["leadership", "management", "soft-skills"]),
        prerequisites: JSON.stringify([]),
        completion_criteria: "all_lessons",
        passing_score: 70,
        certificate_template_id: certTemplateId,
        published_at: new Date().toISOString(),
        metadata: null,
        created_by: ADMIN_USER_ID,
      },
    ]);

    // --- Course Modules (for JS course) ---
    const moduleIntroId = uuidv4();
    const moduleVariablesId = uuidv4();
    const moduleFunctionsId = uuidv4();

    await knex("course_modules").insert([
      {
        id: moduleIntroId,
        course_id: courseJsId,
        title: "Introduction to JavaScript",
        description: "History and overview of JavaScript",
        sort_order: 0,
        is_published: true,
      },
      {
        id: moduleVariablesId,
        course_id: courseJsId,
        title: "Variables & Data Types",
        description: "Understanding variables, types, and type coercion",
        sort_order: 1,
        is_published: true,
      },
      {
        id: moduleFunctionsId,
        course_id: courseJsId,
        title: "Functions & Scope",
        description: "Function declarations, expressions, arrow functions, and closures",
        sort_order: 2,
        is_published: true,
      },
    ]);

    // --- Lessons ---
    const lessonWhatIsJsId = uuidv4();
    const lessonSetupId = uuidv4();
    const lessonVarLetConstId = uuidv4();
    const lessonDataTypesId = uuidv4();
    const lessonFuncBasicsId = uuidv4();
    const lessonArrowFuncsId = uuidv4();

    await knex("lessons").insert([
      {
        id: lessonWhatIsJsId,
        module_id: moduleIntroId,
        title: "What is JavaScript?",
        description: "A brief history and overview of the JavaScript language",
        content_type: "video",
        content_url: "https://cdn.example.com/videos/what-is-js.mp4",
        content_text: null,
        duration_minutes: 15,
        sort_order: 0,
        is_mandatory: true,
        is_preview: true,
      },
      {
        id: lessonSetupId,
        module_id: moduleIntroId,
        title: "Setting Up Your Environment",
        description: "Install Node.js and configure your code editor",
        content_type: "text",
        content_url: null,
        content_text:
          "<h2>Setting Up</h2><p>To get started with JavaScript development, you need:</p><ul><li>Node.js (LTS version)</li><li>A code editor (VS Code recommended)</li><li>A modern web browser</li></ul>",
        duration_minutes: 20,
        sort_order: 1,
        is_mandatory: true,
        is_preview: false,
      },
      {
        id: lessonVarLetConstId,
        module_id: moduleVariablesId,
        title: "var, let, and const",
        description: "Understanding variable declarations in JavaScript",
        content_type: "video",
        content_url: "https://cdn.example.com/videos/var-let-const.mp4",
        content_text: null,
        duration_minutes: 25,
        sort_order: 0,
        is_mandatory: true,
        is_preview: false,
      },
      {
        id: lessonDataTypesId,
        module_id: moduleVariablesId,
        title: "Primitive & Reference Types",
        description: "Strings, numbers, booleans, null, undefined, objects, and arrays",
        content_type: "text",
        content_url: null,
        content_text:
          "<h2>Data Types</h2><p>JavaScript has 7 primitive types: string, number, bigint, boolean, undefined, symbol, and null. Reference types include objects, arrays, and functions.</p>",
        duration_minutes: 30,
        sort_order: 1,
        is_mandatory: true,
        is_preview: false,
      },
      {
        id: lessonFuncBasicsId,
        module_id: moduleFunctionsId,
        title: "Function Basics",
        description: "Function declarations and expressions",
        content_type: "video",
        content_url: "https://cdn.example.com/videos/function-basics.mp4",
        content_text: null,
        duration_minutes: 30,
        sort_order: 0,
        is_mandatory: true,
        is_preview: false,
      },
      {
        id: lessonArrowFuncsId,
        module_id: moduleFunctionsId,
        title: "Arrow Functions & Closures",
        description: "Modern function syntax and closure patterns",
        content_type: "video",
        content_url: "https://cdn.example.com/videos/arrow-closures.mp4",
        content_text: null,
        duration_minutes: 35,
        sort_order: 1,
        is_mandatory: true,
        is_preview: false,
      },
    ]);

    // --- Enrollment ---
    const enrollmentId = uuidv4();
    await knex("enrollments").insert([
      {
        id: enrollmentId,
        org_id: ORG_ID,
        user_id: LEARNER_USER_ID,
        course_id: courseJsId,
        status: "in_progress",
        progress_percentage: 33.33,
        enrolled_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        completed_at: null,
        due_date: null,
        last_accessed_at: new Date().toISOString(),
        time_spent_minutes: 35,
        score: null,
      },
    ]);

    // --- Lesson Progress ---
    await knex("lesson_progress").insert([
      {
        id: uuidv4(),
        enrollment_id: enrollmentId,
        lesson_id: lessonWhatIsJsId,
        is_completed: true,
        completed_at: new Date().toISOString(),
        time_spent_minutes: 15,
        attempts: 1,
      },
      {
        id: uuidv4(),
        enrollment_id: enrollmentId,
        lesson_id: lessonSetupId,
        is_completed: true,
        completed_at: new Date().toISOString(),
        time_spent_minutes: 20,
        attempts: 1,
      },
      {
        id: uuidv4(),
        enrollment_id: enrollmentId,
        lesson_id: lessonVarLetConstId,
        is_completed: false,
        completed_at: null,
        time_spent_minutes: 0,
        attempts: 0,
      },
    ]);

    // --- Quiz ---
    const quizId = uuidv4();
    await knex("quizzes").insert([
      {
        id: quizId,
        course_id: courseJsId,
        module_id: moduleVariablesId,
        title: "Variables & Data Types Quiz",
        description: "Test your knowledge of JavaScript variables and data types",
        type: "graded",
        time_limit_minutes: 15,
        passing_score: 70,
        max_attempts: 3,
        shuffle_questions: true,
        show_answers: true,
        sort_order: 0,
      },
    ]);

    // --- Questions ---
    await knex("questions").insert([
      {
        id: uuidv4(),
        quiz_id: quizId,
        type: "mcq",
        text: "Which keyword declares a block-scoped variable that can be reassigned?",
        explanation:
          "let declares a block-scoped variable. var is function-scoped, and const cannot be reassigned.",
        points: 1,
        sort_order: 0,
        options: JSON.stringify([
          { id: "a", text: "var", is_correct: false },
          { id: "b", text: "let", is_correct: true },
          { id: "c", text: "const", is_correct: false },
          { id: "d", text: "function", is_correct: false },
        ]),
      },
      {
        id: uuidv4(),
        quiz_id: quizId,
        type: "true_false",
        text: "In JavaScript, null and undefined are the same thing.",
        explanation:
          "null is an intentional absence of value, while undefined means a variable has been declared but not assigned.",
        points: 1,
        sort_order: 1,
        options: JSON.stringify([
          { id: "true", text: "True", is_correct: false },
          { id: "false", text: "False", is_correct: true },
        ]),
      },
      {
        id: uuidv4(),
        quiz_id: quizId,
        type: "multi_select",
        text: "Which of the following are primitive data types in JavaScript? (Select all that apply)",
        explanation:
          "JavaScript primitive types are: string, number, bigint, boolean, undefined, symbol, and null. Array and Object are reference types.",
        points: 2,
        sort_order: 2,
        options: JSON.stringify([
          { id: "a", text: "string", is_correct: true },
          { id: "b", text: "Array", is_correct: false },
          { id: "c", text: "boolean", is_correct: true },
          { id: "d", text: "symbol", is_correct: true },
          { id: "e", text: "Object", is_correct: false },
        ]),
      },
      {
        id: uuidv4(),
        quiz_id: quizId,
        type: "mcq",
        text: 'What is the output of: typeof null?',
        explanation:
          'typeof null returns "object" due to a historical bug in JavaScript that has been kept for backward compatibility.',
        points: 1,
        sort_order: 3,
        options: JSON.stringify([
          { id: "a", text: '"null"', is_correct: false },
          { id: "b", text: '"undefined"', is_correct: false },
          { id: "c", text: '"object"', is_correct: true },
          { id: "d", text: '"boolean"', is_correct: false },
        ]),
      },
    ]);

    // --- Learning Path ---
    const lpId = uuidv4();
    await knex("learning_paths").insert([
      {
        id: lpId,
        org_id: ORG_ID,
        title: "Full-Stack Developer Path",
        slug: "full-stack-developer",
        description:
          "A structured learning path to become a full-stack web developer, covering frontend and backend technologies.",
        thumbnail_url: null,
        difficulty: "beginner",
        estimated_duration_minutes: 840,
        status: "published",
        is_mandatory: false,
        sort_order: 0,
        created_by: ADMIN_USER_ID,
      },
    ]);

    await knex("learning_path_courses").insert([
      {
        id: uuidv4(),
        learning_path_id: lpId,
        course_id: courseJsId,
        sort_order: 0,
        is_mandatory: true,
      },
      {
        id: uuidv4(),
        learning_path_id: lpId,
        course_id: courseLeadershipId,
        sort_order: 1,
        is_mandatory: false,
      },
    ]);

    // --- User Learning Profile ---
    await knex("user_learning_profiles").insert([
      {
        id: uuidv4(),
        org_id: ORG_ID,
        user_id: LEARNER_USER_ID,
        preferred_categories: JSON.stringify([catTechId, catWebDevId]),
        preferred_difficulty: "beginner",
        total_courses_completed: 0,
        total_time_spent_minutes: 35,
        total_points_earned: 0,
        current_streak_days: 1,
        longest_streak_days: 1,
        last_activity_at: new Date().toISOString(),
      },
    ]);

    // --- Content Library ---
    await knex("content_library").insert([
      {
        id: uuidv4(),
        org_id: ORG_ID,
        title: "JavaScript Cheat Sheet",
        description: "Quick reference for JavaScript syntax and common patterns",
        content_type: "document",
        content_url: "https://cdn.example.com/docs/js-cheat-sheet.pdf",
        thumbnail_url: null,
        category: "Web Development",
        tags: JSON.stringify(["javascript", "reference", "cheatsheet"]),
        is_public: true,
        source: "internal",
        external_id: null,
        metadata: null,
        created_by: ADMIN_USER_ID,
      },
    ]);

    console.log("Seed data inserted successfully!");
    console.log("  - 4 course categories");
    console.log("  - 1 certificate template");
    console.log("  - 2 courses");
    console.log("  - 3 modules, 6 lessons");
    console.log("  - 1 enrollment with lesson progress");
    console.log("  - 1 quiz with 4 questions");
    console.log("  - 1 learning path");
    console.log("  - 1 user learning profile");
    console.log("  - 1 content library item");
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

seed();
