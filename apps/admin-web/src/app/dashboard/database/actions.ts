'use server';

import { revalidatePath } from 'next/cache';
import { adminApi } from '@/lib/api';

export interface ColumnMeta {
  name: string;
  dataType: string;
  udtName?: string;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  position: number;
}

export interface TableMeta {
  name: string;
  primaryKey: string | null;
  rowCountEst: number;
  columns: ColumnMeta[];
}

export async function fetchDatabaseTablesAction(): Promise<{ success: boolean; tables: TableMeta[]; error?: string }> {
  try {
    const res = await adminApi('/master/database/tables');
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return { success: false, tables: [], error: json.message || 'Nie udało się pobrać struktury tabel' };
    }
    const json = await res.json();
    return { success: true, tables: json.data?.tables || [] };
  } catch (err: any) {
    return { success: false, tables: [], error: err.message || 'Błąd połączenia z serwerem API' };
  }
}

export async function fetchTableRowsAction(params: {
  table: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  search?: string;
}): Promise<{
  success: boolean;
  rows: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  error?: string;
}> {
  try {
    const res = await adminApi('/master/database/query', {
      method: 'POST',
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return {
        success: false,
        rows: [],
        total: 0,
        page: 1,
        limit: params.limit || 25,
        totalPages: 1,
        error: json.message || 'Nie udało się pobrać danych tabeli',
      };
    }

    const json = await res.json();
    return {
      success: true,
      rows: json.data?.rows || [],
      total: json.data?.total || 0,
      page: json.data?.page || 1,
      limit: json.data?.limit || 25,
      totalPages: json.data?.totalPages || 1,
    };
  } catch (err: any) {
    return {
      success: false,
      rows: [],
      total: 0,
      page: 1,
      limit: params.limit || 25,
      totalPages: 1,
      error: err.message || 'Błąd połączenia z serwerem API',
    };
  }
}

export async function insertTableRowAction(
  table: string,
  data: Record<string, any>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const res = await adminApi('/master/database/rows', {
      method: 'POST',
      body: JSON.stringify({ table, data }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return { success: false, error: json.message || 'Nie udało się utworzyć rekordu' };
    }

    const json = await res.json();
    revalidatePath('/dashboard/database');
    return { success: true, data: json.data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Błąd połączenia z serwerem API' };
  }
}

export async function updateTableRowAction(
  table: string,
  primaryKey: string,
  primaryKeyValue: any,
  data: Record<string, any>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const res = await adminApi('/master/database/rows', {
      method: 'PUT',
      body: JSON.stringify({ table, primaryKey, primaryKeyValue, data }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return { success: false, error: json.message || 'Nie udało się zaktualizować rekordu' };
    }

    const json = await res.json();
    revalidatePath('/dashboard/database');
    return { success: true, data: json.data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Błąd połączenia z serwerem API' };
  }
}

export async function deleteTableRowAction(
  table: string,
  primaryKey: string,
  primaryKeyValue: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await adminApi('/master/database/rows', {
      method: 'DELETE',
      body: JSON.stringify({ table, primaryKey, primaryKeyValue }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return { success: false, error: json.message || 'Nie udało się usunąć rekordu' };
    }

    revalidatePath('/dashboard/database');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Błąd połączenia z serwerem API' };
  }
}

export async function executeSqlAction(
  sql: string
): Promise<{ success: boolean; rows?: any[]; columns?: string[]; rowCount?: number; executionTimeMs?: number; error?: string }> {
  try {
    const res = await adminApi('/master/database/sql', {
      method: 'POST',
      body: JSON.stringify({ sql }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return { success: false, error: json.message || 'Błąd wykonania zapytania SQL' };
    }

    const json = await res.json();
    return {
      success: true,
      rows: json.data?.rows || [],
      columns: json.data?.columns || [],
      rowCount: json.data?.rowCount ?? 0,
      executionTimeMs: json.data?.executionTimeMs ?? 0,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Błąd połączenia z serwerem API' };
  }
}
