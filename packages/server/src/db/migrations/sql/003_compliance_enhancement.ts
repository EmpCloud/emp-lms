// =============================================================================
// MIGRATION 003 — Compliance Enhancement Phase 1
//
// Extends the LMS into a Compliance-Aware LMS by adding:
// 1. Compliance tagging on courses (is_compliance, compliance_type)
// 2. Policy acceptance tracking (policy_acceptances table)
// 3. Document submission tracking (compliance_submissions table)
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Extend courses table with compliance fields ----
  const hasCols = await knex.schema.hasColumn("courses", "is_compliance");
  if (!hasCols) {
    await knex.schema.alterTable("courses", (t) => {
      // Whether this course counts as a compliance requirement
      t.boolean("is_compliance").notNullable().defaultTo(false);
      // The type of compliance: policy (accept terms), training (complete
      // course), document (upload a file), quiz (pass an assessment)
      t.enum("compliance_type", ["policy", "training", "document_submission", "quiz"])
        .nullable()
        .defaultTo(null);
      // Optional: regulatory reference code (e.g., "GDPR-2024", "SOC2-T1")
      t.string("compliance_code", 50).nullable();
    });
  }

  // ---- Policy Acceptances ----
  // Records the exact moment a user clicks "I Agree" on a policy-type
  // compliance course. Separate from enrollment.completed because legal
  // needs the explicit acceptance timestamp, IP, and user-agent for audit.
  if (!(await knex.schema.hasTable("policy_acceptances"))) {
    await knex.schema.createTable("policy_acceptances", (t) => {
      t.uuid("id").primary();
      t.integer("org_id").unsigned().notNullable();
      t.integer("user_id").unsigned().notNullable();
      t.uuid("course_id").notNullable().references("id").inTable("courses").onDelete("CASCADE");
      t.uuid("enrollment_id").nullable().references("id").inTable("enrollments").onDelete("SET NULL");
      // The version of the policy accepted (courses can be updated; this
      // anchors exactly what the user agreed to)
      t.integer("policy_version").notNullable().defaultTo(1);
      t.timestamp("accepted_at").notNullable();
      t.string("ip_address", 45).nullable();
      t.text("user_agent").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());

      t.index(["org_id", "user_id", "course_id"]);
    });
  }

  // ---- Compliance Submissions ----
  // For document_submission type compliance: the employee uploads a file
  // and an admin reviews it. Status flow: pending → approved | rejected.
  if (!(await knex.schema.hasTable("compliance_submissions"))) {
    await knex.schema.createTable("compliance_submissions", (t) => {
      t.uuid("id").primary();
      t.integer("org_id").unsigned().notNullable();
      t.integer("user_id").unsigned().notNullable();
      t.uuid("course_id").notNullable().references("id").inTable("courses").onDelete("CASCADE");
      t.uuid("assignment_id").nullable().references("id").inTable("compliance_assignments").onDelete("SET NULL");
      t.string("file_name", 255).notNullable();
      t.string("file_url", 1000).notNullable();
      t.string("file_type", 100).nullable();
      t.integer("file_size_bytes").unsigned().nullable();
      t.text("notes").nullable(); // Employee's submission note
      t.enum("status", ["pending", "approved", "rejected"]).notNullable().defaultTo("pending");
      t.integer("reviewed_by").unsigned().nullable(); // Admin who reviewed
      t.timestamp("reviewed_at").nullable();
      t.text("review_notes").nullable(); // Admin's feedback
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["org_id", "user_id", "course_id"]);
      t.index(["org_id", "status"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("compliance_submissions");
  await knex.schema.dropTableIfExists("policy_acceptances");

  if (await knex.schema.hasColumn("courses", "is_compliance")) {
    await knex.schema.alterTable("courses", (t) => {
      t.dropColumn("is_compliance");
      t.dropColumn("compliance_type");
      t.dropColumn("compliance_code");
    });
  }
}
