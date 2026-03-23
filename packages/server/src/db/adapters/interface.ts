// ============================================================================
// DATABASE ADAPTER INTERFACE
// Core abstraction that lets you switch between MySQL, PostgreSQL,
// or any future DB without changing business logic.
// ============================================================================

export interface QueryOptions {
  page?: number;
  limit?: number;
  sort?: { field: string; order: "asc" | "desc" };
  filters?: Record<string, any>;
  search?: { fields: string[]; term: string };
}

export interface QueryResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TransactionContext {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Core DB Adapter Interface
// ---------------------------------------------------------------------------
export interface IDBAdapter {
  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Migrations
  migrate(): Promise<void>;
  rollback(): Promise<void>;
  seed(seedName?: string): Promise<void>;

  // CRUD
  findById<T>(table: string, id: string): Promise<T | null>;
  findOne<T>(table: string, where: Record<string, any>): Promise<T | null>;
  findMany<T>(table: string, options?: QueryOptions): Promise<QueryResult<T>>;
  create<T>(table: string, data: Partial<T>): Promise<T>;
  createMany<T>(table: string, data: Partial<T>[]): Promise<T[]>;
  update<T>(table: string, id: string, data: Partial<T>): Promise<T>;
  updateMany(table: string, where: Record<string, any>, data: Record<string, any>): Promise<number>;
  delete(table: string, id: string): Promise<boolean>;
  deleteMany(table: string, where: Record<string, any>): Promise<number>;

  // Aggregations
  count(table: string, where?: Record<string, any>): Promise<number>;
  sum(table: string, field: string, where?: Record<string, any>): Promise<number>;

  // Transactions
  transaction<T>(fn: (trx: TransactionContext) => Promise<T>): Promise<T>;

  // Raw query escape hatch (use sparingly)
  raw<T>(query: string, params?: any[]): Promise<T>;
}

// ---------------------------------------------------------------------------
// Repository Base (uses the adapter)
// ---------------------------------------------------------------------------
export abstract class BaseRepository<T> {
  constructor(
    protected adapter: IDBAdapter,
    protected tableName: string
  ) {}

  async findById(id: string): Promise<T | null> {
    return this.adapter.findById<T>(this.tableName, id);
  }

  async findOne(where: Record<string, any>): Promise<T | null> {
    return this.adapter.findOne<T>(this.tableName, where);
  }

  async findMany(options?: QueryOptions): Promise<QueryResult<T>> {
    return this.adapter.findMany<T>(this.tableName, options);
  }

  async create(data: Partial<T>): Promise<T> {
    return this.adapter.create<T>(this.tableName, data);
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    return this.adapter.update<T>(this.tableName, id, data);
  }

  async delete(id: string): Promise<boolean> {
    return this.adapter.delete(this.tableName, id);
  }

  async count(where?: Record<string, any>): Promise<number> {
    return this.adapter.count(this.tableName, where);
  }
}
