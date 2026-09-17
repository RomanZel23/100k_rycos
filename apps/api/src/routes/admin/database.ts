import type { FastifyInstance } from 'fastify';
import { getRawClient } from '@rycos/database';
import { requirePlatformAdmin } from '../../middleware/adminAuth.js';
import { success, error } from '../../lib/response.js';

export async function adminDatabaseRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requirePlatformAdmin);

  // Helper to validate table and column names to prevent SQL injection
  const sanitizeIdentifier = (name: string): string => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Nieprawidłowa nazwa identyfikatora: ${name}`);
    }
    return name;
  };

  // GET /v1/admin/master/database/tables - List all tables and metadata
  fastify.get('/v1/admin/master/database/tables', async (_req, reply) => {
    const rawSql = getRawClient();
    if (!rawSql) {
      return error(reply, 'Brak połączenia z bazą danych', 500);
    }

    try {
      // 1. Get base tables in public schema
      const tablesRes = await rawSql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name ASC;
      `;

      // 2. Get all columns
      const columnsRes = await rawSql`
        SELECT 
          table_name, 
          column_name, 
          data_type, 
          udt_name,
          is_nullable, 
          column_default, 
          ordinal_position
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position ASC;
      `;

      // 3. Get primary keys
      const pksRes = await rawSql`
        SELECT 
          tc.table_name, 
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public';
      `;

      // 4. Get row count estimates
      const rowCountsRes = await rawSql`
        SELECT 
          relname AS table_name, 
          n_live_tup AS row_count_est
        FROM pg_stat_user_tables
        WHERE schemaname = 'public';
      `;

      const pkMap = new Map<string, string>();
      for (const pk of pksRes) {
        pkMap.set(pk.table_name, pk.column_name);
      }

      const countMap = new Map<string, number>();
      for (const c of rowCountsRes) {
        countMap.set(c.table_name, Math.max(0, parseInt(c.row_count_est || '0', 10)));
      }

      const colsByTable = new Map<string, any[]>();
      for (const col of columnsRes) {
        if (!colsByTable.has(col.table_name)) {
          colsByTable.set(col.table_name, []);
        }
        const isPk = pkMap.get(col.table_name) === col.column_name;
        colsByTable.get(col.table_name)!.push({
          name: col.column_name,
          dataType: col.data_type,
          udtName: col.udt_name,
          isNullable: col.is_nullable === 'YES',
          defaultValue: col.column_default,
          isPrimaryKey: isPk,
          position: col.ordinal_position,
        });
      }

      const tables = tablesRes.map((t: any) => {
        const name = t.table_name;
        return {
          name,
          primaryKey: pkMap.get(name) || null,
          rowCountEst: countMap.get(name) ?? 0,
          columns: colsByTable.get(name) || [],
        };
      });

      return success(reply, { tables }, 'Struktura bazy danych pobrana');
    } catch (err: any) {
      return error(reply, err.message || 'Błąd pobierania tabel bazy danych', 500);
    }
  });

  // POST /v1/admin/master/database/query - Query rows from a table with pagination and filtering
  fastify.post('/v1/admin/master/database/query', async (req, reply) => {
    const rawSql = getRawClient();
    if (!rawSql) return error(reply, 'Brak połączenia z bazą danych', 500);

    const body = (req.body ?? {}) as {
      table: string;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
      search?: string;
    };

    if (!body.table) {
      return error(reply, 'Nazwa tabeli jest wymagana', 400);
    }

    try {
      const table = sanitizeIdentifier(body.table);
      const page = Math.max(1, parseInt(String(body.page || 1), 10));
      const limit = Math.min(500, Math.max(1, parseInt(String(body.limit || 25), 10)));
      const offset = (page - 1) * limit;

      // Verify table exists
      const [tableExists] = await rawSql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = ${table};
      `;
      if (!tableExists) {
        return error(reply, `Tabela "${table}" nie istnieje`, 404);
      }

      // Fetch column metadata for search & sort validation
      const columnsRes = await rawSql`
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table};
      `;
      const colNames = new Set(columnsRes.map((c: any) => c.column_name));

      let sortCol = body.sortBy && colNames.has(body.sortBy) ? body.sortBy : null;
      if (!sortCol) {
        // default to 'id' or first column
        sortCol = colNames.has('id') ? 'id' : columnsRes[0]?.column_name || null;
      }
      const sortDir = body.sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      const search = body.search ? String(body.search).trim() : '';

      if (search) {
        const textCols = columnsRes
          .filter((c: any) => ['text', 'varchar', 'character varying', 'uuid', 'integer', 'bigint'].includes(c.data_type) || c.udt_name === 'jsonb')
          .map((c: any) => `CAST("${c.column_name}" AS TEXT) ILIKE '%${search.replace(/'/g, "''")}%'`)
          .join(' OR ');

        const whereClause = textCols.length > 0 ? `WHERE (${textCols})` : '';

        const countRes = await rawSql.unsafe(`SELECT count(*)::int as total FROM "public"."${table}" ${whereClause}`);
        const total = countRes[0]?.total || 0;

        const orderClause = sortCol ? `ORDER BY "${sanitizeIdentifier(sortCol)}" ${sortDir}` : '';
        const rows = await rawSql.unsafe(
          `SELECT * FROM "public"."${table}" ${whereClause} ${orderClause} LIMIT ${limit} OFFSET ${offset}`
        );

        return success(reply, {
          rows: Array.from(rows),
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        });
      } else {
        const countRes = await rawSql.unsafe(`SELECT count(*)::int as total FROM "public"."${table}"`);
        const total = countRes[0]?.total || 0;

        const orderClause = sortCol ? `ORDER BY "${sanitizeIdentifier(sortCol)}" ${sortDir}` : '';
        const rows = await rawSql.unsafe(
          `SELECT * FROM "public"."${table}" ${orderClause} LIMIT ${limit} OFFSET ${offset}`
        );

        return success(reply, {
          rows: Array.from(rows),
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        });
      }
    } catch (err: any) {
      return error(reply, err.message || 'Błąd wykonania zapytania tabeli', 500);
    }
  });

  // POST /v1/admin/master/database/rows - Insert row
  fastify.post('/v1/admin/master/database/rows', async (req, reply) => {
    const rawSql = getRawClient();
    if (!rawSql) return error(reply, 'Brak połączenia z bazą danych', 500);

    const body = (req.body ?? {}) as {
      table: string;
      data: Record<string, any>;
    };

    if (!body.table || !body.data || typeof body.data !== 'object') {
      return error(reply, 'Wymagana jest nazwa tabeli oraz obiekt danych', 400);
    }

    try {
      const table = sanitizeIdentifier(body.table);
      const colsRes = await rawSql`
        SELECT column_name, data_type, udt_name, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table};
      `;
      const colMap = new Map(colsRes.map((c: any) => [c.column_name, c]));

      const cleanData: Record<string, any> = {};
      for (const [key, val] of Object.entries(body.data)) {
        if (!colMap.has(key)) continue;
        const col = colMap.get(key)!;

        // Skip auto-increment/serial primary key if empty/null
        if (col.column_default?.includes('nextval') && (val === null || val === undefined || val === '')) {
          continue;
        }

        cleanData[sanitizeIdentifier(key)] = parseColumnValue(val, col);
      }

      if (Object.keys(cleanData).length === 0) {
        return error(reply, 'Brak poprawnych pól do wstawienia', 400);
      }

      const [inserted] = await rawSql`
        INSERT INTO ${rawSql(table)} ${rawSql(cleanData)}
        RETURNING *
      `;

      return success(reply, inserted, 'Rekord został pomyślnie utworzony');
    } catch (err: any) {
      return error(reply, err.message || 'Nie udało się wstawić rekordu', 500);
    }
  });

  // PUT /v1/admin/master/database/rows - Update row by PK
  fastify.put('/v1/admin/master/database/rows', async (req, reply) => {
    const rawSql = getRawClient();
    if (!rawSql) return error(reply, 'Brak połączenia z bazą danych', 500);

    const body = (req.body ?? {}) as {
      table: string;
      primaryKey: string;
      primaryKeyValue: any;
      data: Record<string, any>;
    };

    if (!body.table || !body.primaryKey || body.primaryKeyValue === undefined || !body.data) {
      return error(reply, 'Wymagane pola: table, primaryKey, primaryKeyValue, data', 400);
    }

    try {
      const table = sanitizeIdentifier(body.table);
      const pk = sanitizeIdentifier(body.primaryKey);

      const colsRes = await rawSql`
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table};
      `;
      const colMap = new Map(colsRes.map((c: any) => [c.column_name, c]));

      const cleanData: Record<string, any> = {};
      for (const [key, val] of Object.entries(body.data)) {
        if (!colMap.has(key) || key === pk) continue;
        const col = colMap.get(key)!;
        cleanData[sanitizeIdentifier(key)] = parseColumnValue(val, col);
      }

      if (Object.keys(cleanData).length === 0) {
        return error(reply, 'Brak zmienionych pól do aktualizacji', 400);
      }

      const [updated] = await rawSql`
        UPDATE ${rawSql(table)}
        SET ${rawSql(cleanData)}
        WHERE ${rawSql(pk)} = ${body.primaryKeyValue}
        RETURNING *
      `;

      if (!updated) {
        return error(reply, 'Nie znaleziono wskazanego rekordu do aktualizacji', 404);
      }

      return success(reply, updated, 'Rekord został zaktualizowany');
    } catch (err: any) {
      return error(reply, err.message || 'Błąd aktualizacji rekordu', 500);
    }
  });

  // DELETE /v1/admin/master/database/rows - Delete row by PK
  fastify.delete('/v1/admin/master/database/rows', async (req, reply) => {
    const rawSql = getRawClient();
    if (!rawSql) return error(reply, 'Brak połączenia z bazą danych', 500);

    const body = (req.body ?? {}) as {
      table: string;
      primaryKey: string;
      primaryKeyValue: any;
    };

    if (!body.table || !body.primaryKey || body.primaryKeyValue === undefined) {
      return error(reply, 'Wymagane pola: table, primaryKey, primaryKeyValue', 400);
    }

    try {
      const table = sanitizeIdentifier(body.table);
      const pk = sanitizeIdentifier(body.primaryKey);

      const [deleted] = await rawSql`
        DELETE FROM ${rawSql(table)}
        WHERE ${rawSql(pk)} = ${body.primaryKeyValue}
        RETURNING *
      `;

      if (!deleted) {
        return error(reply, 'Nie znaleziono rekordu do usunięcia', 404);
      }

      return success(reply, { deleted: true, primaryKeyValue: body.primaryKeyValue }, 'Rekord został pomyślnie usunięty');
    } catch (err: any) {
      return error(reply, err.message || 'Błąd usuwania rekordu', 500);
    }
  });

  // POST /v1/admin/master/database/sql - Execute raw SQL query from Super-Admin
  fastify.post('/v1/admin/master/database/sql', async (req, reply) => {
    const rawSql = getRawClient();
    if (!rawSql) return error(reply, 'Brak połączenia z bazą danych', 500);

    const body = (req.body ?? {}) as { sql: string };
    const query = String(body.sql || '').trim();

    if (!query) {
      return error(reply, 'Wprowadź treść zapytania SQL', 400);
    }

    try {
      const startTime = performance.now();
      const result = await rawSql.unsafe(query);
      const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

      const rows = Array.isArray(result) ? Array.from(result) : [];
      const columns = result.columns ? result.columns.map((c: any) => c.name) : rows.length > 0 ? Object.keys(rows[0]) : [];

      return success(reply, {
        rows,
        columns,
        rowCount: result.count ?? rows.length,
        executionTimeMs,
      }, 'Zapytanie wykonane pomyślnie');
    } catch (err: any) {
      return error(reply, err.message || 'Błąd wykonania zapytania SQL', 400);
    }
  });
}

function parseColumnValue(val: any, col: { data_type: string; udt_name: string }): any {
  if (val === null || val === undefined || val === '') {
    return null;
  }

  const type = col.data_type.toLowerCase();
  const udt = col.udt_name?.toLowerCase() || '';

  if (type === 'boolean') {
    if (typeof val === 'boolean') return val;
    return val === 'true' || val === '1' || val === 1;
  }

  if (type === 'integer' || type === 'smallint' || type === 'bigint') {
    const num = parseInt(String(val), 10);
    return isNaN(num) ? null : num;
  }

  if (type === 'numeric' || type === 'real' || type === 'double precision') {
    const num = parseFloat(String(val));
    return isNaN(num) ? null : num;
  }

  if (type === 'json' || type === 'jsonb' || udt === 'json' || udt === 'jsonb') {
    if (typeof val === 'object') return JSON.stringify(val);
    try {
      JSON.parse(val);
      return val;
    } catch {
      return JSON.stringify(val);
    }
  }

  if (type === 'timestamp without time zone' || type === 'timestamp with time zone' || type === 'date') {
    if (val instanceof Date) return val.toISOString();
    return new Date(val).toISOString();
  }

  return String(val);
}
