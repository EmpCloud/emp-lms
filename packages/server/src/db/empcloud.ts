// ============================================================================
// EMPCLOUD DATABASE CONNECTION
// Separate Knex connection to the EmpCloud master database.
// Used for authentication, user lookups, and org data.
// ============================================================================

import knex from "knex";
import type { Knex } from "knex";
import { config } from "../config";
import { logger } from "../utils/logger";

let empcloudDb: Knex | null = null;

/**
 * Initialize the EmpCloud database connection.
 * Call this once at server startup.
 */
export async function initEmpCloudDB(): Promise<void> {
  if (empcloudDb) return;

  const { empcloudDb: dbConfig } = config;

  empcloudDb = knex({
    client: "mysql2",
    connection: {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.name,
    },
    pool: { min: 2, max: 10 },
  });

  // Verify connection
  await empcloudDb.raw("SELECT 1");
  logger.info(`EmpCloud database connected (${dbConfig.host}:${dbConfig.port}/${dbConfig.name})`);
}

/**
 * Get the EmpCloud Knex instance. Throws if not initialized.
 */
export function getEmpCloudDB(): Knex {
  if (!empcloudDb) {
    throw new Error("EmpCloud database not initialized. Call initEmpCloudDB() first.");
  }
  return empcloudDb;
}

/**
 * Close the EmpCloud database connection.
 */
export async function closeEmpCloudDB(): Promise<void> {
  if (empcloudDb) {
    await empcloudDb.destroy();
    empcloudDb = null;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmpCloudUser {
  id: number;
  organization_id: number;
  first_name: string;
  last_name: string;
  email: string;
  password: string | null;
  role: string;
  department_id: number | null;
  designation: string | null;
  status: number;
  date_of_joining: string | null;
  photo_path: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EmpCloudOrg {
  id: number;
  name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Query helpers for common EmpCloud lookups
// ---------------------------------------------------------------------------

/**
 * Find a user by ID.
 */
export async function findUserById(id: number): Promise<EmpCloudUser | null> {
  const db = getEmpCloudDB();
  const user = await db("users").where({ id }).first();
  return user || null;
}

/**
 * Find a user by email (active users only).
 */
export async function findUserByEmail(email: string): Promise<EmpCloudUser | null> {
  const db = getEmpCloudDB();
  const user = await db("users").where({ email, status: 1 }).first();
  return user || null;
}

/**
 * Find all users in an organization (active only).
 */
export async function findUsersByOrgId(
  orgId: number,
  options?: { limit?: number; offset?: number }
): Promise<EmpCloudUser[]> {
  const db = getEmpCloudDB();
  let query = db("users").where({ organization_id: orgId, status: 1 });
  if (options?.limit) query = query.limit(options.limit);
  if (options?.offset) query = query.offset(options.offset);
  return query;
}

/**
 * Find an organization by ID.
 */
export async function findOrgById(id: number): Promise<EmpCloudOrg | null> {
  const db = getEmpCloudDB();
  const org = await db("organizations").where({ id }).first();
  return org || null;
}
