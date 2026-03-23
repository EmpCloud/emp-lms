// ============================================================================
// DATABASE FACTORY
// Creates the correct adapter based on configuration.
// Usage: const db = await initDB();  // singleton
// ============================================================================

import { IDBAdapter } from "./interface";
import { KnexAdapter } from "./knex.adapter";
import { config } from "../../config";

export function createDBAdapter(): IDBAdapter {
  return new KnexAdapter({
    client: "mysql2",
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    pool: {
      min: config.db.poolMin,
      max: config.db.poolMax,
    },
  });
}

// Singleton instance for the app
let adapter: IDBAdapter | null = null;

export async function initDB(): Promise<IDBAdapter> {
  if (!adapter) {
    adapter = createDBAdapter();
  }
  await adapter.connect();
  return adapter;
}

export function getDB(): IDBAdapter {
  if (!adapter) {
    adapter = createDBAdapter();
  }
  return adapter;
}

export async function closeDB(): Promise<void> {
  if (adapter) {
    await adapter.disconnect();
    adapter = null;
  }
}
