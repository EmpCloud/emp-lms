// ============================================================================
// KNEX SQL ADAPTER — supports MySQL, PostgreSQL, SQLite
// ============================================================================

import knex from "knex";
import type { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";
import { IDBAdapter, QueryOptions, QueryResult, TransactionContext } from "./interface";

// Singleton instance for raw Knex access
let knexInstance: Knex | null = null;

/**
 * Returns the raw Knex instance. Throws if database is not connected.
 */
export function getKnex(): Knex {
  if (!knexInstance) {
    throw new Error("Database not connected. Call KnexAdapter.connect() first.");
  }
  return knexInstance;
}

// ---------------------------------------------------------------------------
// Case conversion helpers
// ---------------------------------------------------------------------------

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function keysToSnake(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toSnakeCase(key)] = value;
  }
  return result;
}

function keysToCamel(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toCamelCase(key)] = value;
  }
  return result;
}

function rowsToCamel<T>(rows: Record<string, any>[]): T[] {
  return rows.map((row) => keysToCamel(row) as T);
}

// ---------------------------------------------------------------------------
// KnexAdapter
// ---------------------------------------------------------------------------

export class KnexAdapter implements IDBAdapter {
  private db: Knex | null = null;
  private knexConfig: Knex.Config;
  private tableColumns: Map<string, Set<string>> = new Map();

  constructor(connectionConfig: {
    client: "mysql2" | "pg" | "sqlite3";
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    pool?: { min: number; max: number };
  }) {
    this.knexConfig = {
      client: connectionConfig.client,
      connection: {
        host: connectionConfig.host,
        port: connectionConfig.port,
        user: connectionConfig.user,
        password: connectionConfig.password,
        database: connectionConfig.database,
      },
      pool: connectionConfig.pool || { min: 2, max: 10 },
      migrations: {
        directory: "./src/db/migrations/sql",
        extension: "ts",
      },
      seeds: {
        directory: "./src/db/seeds/sql",
        extension: "ts",
      },
    };
  }

  async connect(): Promise<void> {
    this.db = knex(this.knexConfig);
    knexInstance = this.db;
    await this.db.raw("SELECT 1");
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      await this.db.destroy();
      this.db = null;
      knexInstance = null;
    }
  }

  isConnected(): boolean {
    return this.db !== null;
  }

  private getDb(): Knex {
    if (!this.db) throw new Error("Database not connected. Call connect() first.");
    return this.db;
  }

  /** Check whether a table has a specific column (cached per table). */
  private async hasColumn(table: string, column: string): Promise<boolean> {
    if (!this.tableColumns.has(table)) {
      const db = this.getDb();
      const cols = await db(table).columnInfo();
      this.tableColumns.set(table, new Set(Object.keys(cols)));
    }
    return this.tableColumns.get(table)!.has(column);
  }

  // Migrations
  async migrate(): Promise<void> {
    await this.getDb().migrate.latest();
  }

  async rollback(): Promise<void> {
    await this.getDb().migrate.rollback();
  }

  async seed(seedName?: string): Promise<void> {
    await this.getDb().seed.run(seedName ? { specific: seedName } : undefined);
  }

  // CRUD
  async findById<T>(table: string, id: string): Promise<T | null> {
    const row = await this.getDb()(table).where({ id }).first();
    return row ? (keysToCamel(row) as T) : null;
  }

  async findOne<T>(table: string, where: Record<string, any>): Promise<T | null> {
    const snakeWhere = keysToSnake(where);
    const row = await this.getDb()(table).where(snakeWhere).first();
    return row ? (keysToCamel(row) as T) : null;
  }

  async findMany<T>(table: string, options?: QueryOptions): Promise<QueryResult<T>> {
    const db = this.getDb();
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const offset = (page - 1) * limit;

    let query = db(table);

    // Apply filters
    if (options?.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        const snakeKey = toSnakeCase(key);
        if (value === null) {
          query = query.whereNull(snakeKey);
        } else if (Array.isArray(value)) {
          query = query.whereIn(snakeKey, value);
        } else if (typeof value === "object" && value.op) {
          query = query.where(snakeKey, value.op, value.value);
        } else {
          query = query.where(snakeKey, value);
        }
      }
    }

    // Apply search
    if (options?.search && options.search.term && options.search.fields.length > 0) {
      const term = `%${options.search.term}%`;
      query = query.where(function (this: Knex.QueryBuilder) {
        for (const field of options.search!.fields) {
          const snakeField = toSnakeCase(field);
          this.orWhere(snakeField, "LIKE", term);
        }
      });
    }

    // Get total count
    const [{ count: total }] = await query.clone().count("* as count");

    // Apply sort
    if (options?.sort) {
      query = query.orderBy(toSnakeCase(options.sort.field), options.sort.order);
    } else {
      query = query.orderBy("created_at", "desc");
    }

    // Apply pagination
    const rows = await query.limit(limit).offset(offset);

    return {
      data: rowsToCamel<T>(rows),
      total: Number(total),
      page,
      limit,
      totalPages: Math.ceil(Number(total) / limit),
    };
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const id = (data as any).id || uuidv4();
    const now = new Date();
    const snakeData = keysToSnake(data as Record<string, any>);
    const record: Record<string, any> = {
      ...snakeData,
      id,
      created_at: now,
    };

    if (await this.hasColumn(table, "updated_at")) {
      record.updated_at = now;
    }

    await this.getDb()(table).insert(record);
    return this.findById<T>(table, id) as Promise<T>;
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    const now = new Date();
    const hasUpdatedAt = await this.hasColumn(table, "updated_at");
    const records = data.map((d) => {
      const snakeData = keysToSnake(d as Record<string, any>);
      const rec: Record<string, any> = {
        ...snakeData,
        id: (d as any).id || uuidv4(),
        created_at: now,
      };
      if (hasUpdatedAt) rec.updated_at = now;
      return rec;
    });

    await this.getDb().batchInsert(table, records as any[], 500);
    const ids = records.map((r) => r.id);
    const rows = await this.getDb()(table).whereIn("id", ids);
    return rowsToCamel<T>(rows);
  }

  async update<T>(table: string, id: string, data: Partial<T>): Promise<T> {
    const snakeData = keysToSnake(data as Record<string, any>);
    const record: Record<string, any> = { ...snakeData };
    delete record.id;
    delete record.created_at;

    if (await this.hasColumn(table, "updated_at")) {
      record.updated_at = new Date();
    }

    await this.getDb()(table).where({ id }).update(record);
    return this.findById<T>(table, id) as Promise<T>;
  }

  async updateMany(table: string, where: Record<string, any>, data: Record<string, any>): Promise<number> {
    const snakeWhere = keysToSnake(where);
    const snakeData = keysToSnake(data);
    const record: Record<string, any> = { ...snakeData };
    if (await this.hasColumn(table, "updated_at")) {
      record.updated_at = new Date();
    }
    return this.getDb()(table)
      .where(snakeWhere)
      .update(record);
  }

  async delete(table: string, id: string): Promise<boolean> {
    const count = await this.getDb()(table).where({ id }).del();
    return count > 0;
  }

  async deleteMany(table: string, where: Record<string, any>): Promise<number> {
    const snakeWhere = keysToSnake(where);
    return this.getDb()(table).where(snakeWhere).del();
  }

  // Aggregations
  async count(table: string, where?: Record<string, any>): Promise<number> {
    let query = this.getDb()(table);
    if (where) query = query.where(keysToSnake(where));
    const [{ count }] = await query.count("* as count");
    return Number(count);
  }

  async sum(table: string, field: string, where?: Record<string, any>): Promise<number> {
    const snakeField = toSnakeCase(field);
    let query = this.getDb()(table);
    if (where) query = query.where(keysToSnake(where));
    const [{ total }] = await query.sum(`${snakeField} as total`);
    return Number(total) || 0;
  }

  // Transactions
  async transaction<T>(fn: (trx: TransactionContext) => Promise<T>): Promise<T> {
    const db = this.getDb();
    return db.transaction(async (trx) => {
      const ctx: TransactionContext = {
        commit: async () => { await trx.commit(); },
        rollback: async () => { await trx.rollback(); },
      };
      return fn(ctx);
    });
  }

  // Raw
  async raw<T>(query: string, params?: any[]): Promise<T> {
    const result = await this.getDb().raw(query, params || []);
    return result as T;
  }
}
