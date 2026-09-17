'use client';

import React, { useState, useEffect, useTransition, useMemo } from 'react';
import type { AdminLocale } from '@/lib/i18n';
import { getTranslation } from '@/lib/i18n';
import type { TableMeta, ColumnMeta } from './actions';
import {
  fetchDatabaseTablesAction,
  fetchTableRowsAction,
  insertTableRowAction,
  updateTableRowAction,
  deleteTableRowAction,
  executeSqlAction,
} from './actions';

interface DatabaseClientProps {
  initialTables: TableMeta[];
  initialError?: string | null;
  locale?: AdminLocale;
}

export function DatabaseClient({ initialTables, initialError = null, locale = 'pl' }: DatabaseClientProps) {
  const [activeTab, setActiveTab] = useState<'tables' | 'sql'>('tables');

  // Tables state
  const [tables, setTables] = useState<TableMeta[]>(initialTables);
  const [isLoadingTables, setIsLoadingTables] = useState<boolean>(false);
  const [tableListError, setTableListError] = useState<string | null>(initialError || null);
  const [selectedTableName, setSelectedTableName] = useState<string>(
    initialTables.length > 0 ? initialTables[0].name : ''
  );
  const [tableSearch, setTableSearch] = useState('');

  // Selected table metadata
  const selectedTable = useMemo(
    () => tables.find((t) => t.name === selectedTableName) || null,
    [tables, selectedTableName]
  );

  // Table Data Query State
  const [rows, setRows] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [sortBy, setSortBy] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSearch, setActiveSearch] = useState<string>('');
  const [isLoadingRows, setIsLoadingRows] = useState<boolean>(false);
  const [tableError, setTableError] = useState<string | null>(null);

  // Modals state
  const [viewModalRow, setViewModalRow] = useState<any | null>(null);
  const [editModalRow, setEditModalRow] = useState<any | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [deleteModalRow, setDeleteModalRow] = useState<any | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [addFormData, setAddFormData] = useState<Record<string, any>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActionPending, startActionTransition] = useTransition();

  // SQL Console State
  const [sqlQuery, setSqlQuery] = useState<string>(
    'SELECT * FROM companies ORDER BY id ASC LIMIT 25;'
  );
  const [sqlResult, setSqlResult] = useState<{
    rows: any[];
    columns: string[];
    rowCount: number;
    executionTimeMs: number;
  } | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [isExecutingSql, setIsExecutingSql] = useState<boolean>(false);

  // Filtered tables for sidebar/selector
  const filteredTables = useMemo(() => {
    if (!tableSearch.trim()) return tables;
    const q = tableSearch.toLowerCase();
    return tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, tableSearch]);

  // Load rows when table, page, pageSize, sort or activeSearch changes
  const loadTableData = async (
    table: string,
    page: number,
    limit: number,
    sort?: string,
    dir?: 'asc' | 'desc',
    search?: string
  ) => {
    if (!table) return;
    setIsLoadingRows(true);
    setTableError(null);

    const res = await fetchTableRowsAction({
      table,
      page,
      limit,
      sortBy: sort || undefined,
      sortDir: dir || 'desc',
      search: search || undefined,
    });

    setIsLoadingRows(false);
    if (!res.success) {
      setTableError(res.error || 'Nie udało się pobrać danych');
      setRows([]);
      setTotalRows(0);
    } else {
      setRows(res.rows);
      setTotalRows(res.total);
      setCurrentPage(res.page);
    }
  };

  const loadTables = async () => {
    setIsLoadingTables(true);
    setTableListError(null);
    const res = await fetchDatabaseTablesAction();
    setIsLoadingTables(false);

    if (res.success && res.tables) {
      setTables(res.tables);
      if (res.tables.length > 0) {
        setSelectedTableName((prev) => (prev && res.tables.some((t) => t.name === prev) ? prev : res.tables[0].name));
      }
    } else {
      setTableListError(res.error || 'Nie udało się pobrać listy tabel');
    }
  };

  useEffect(() => {
    if (tables.length === 0) {
      loadTables();
    }
  }, []);

  useEffect(() => {
    if (selectedTableName) {
      const defaultSort = selectedTable?.primaryKey || selectedTable?.columns[0]?.name || 'id';
      setSortBy(defaultSort);
      setSortDir('desc');
      setCurrentPage(1);
      setActiveSearch('');
      setSearchQuery('');
      loadTableData(selectedTableName, 1, pageSize, defaultSort, 'desc', '');
    }
  }, [selectedTableName]);

  const handleRefresh = () => {
    if (selectedTableName) {
      loadTableData(selectedTableName, currentPage, pageSize, sortBy, sortDir, activeSearch);
    }
  };

  const handleSort = (colName: string) => {
    let nextDir: 'asc' | 'desc' = 'asc';
    if (sortBy === colName) {
      nextDir = sortDir === 'asc' ? 'desc' : 'asc';
    }
    setSortBy(colName);
    setSortDir(nextDir);
    loadTableData(selectedTableName, 1, pageSize, colName, nextDir, activeSearch);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery.trim());
    setCurrentPage(1);
    loadTableData(selectedTableName, 1, pageSize, sortBy, sortDir, searchQuery.trim());
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    loadTableData(selectedTableName, newPage, pageSize, sortBy, sortDir, activeSearch);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    loadTableData(selectedTableName, 1, newSize, sortBy, sortDir, activeSearch);
  };

  // Open Edit Modal
  const handleOpenEdit = (row: any) => {
    setEditModalRow(row);
    setActionError(null);
    const initial: Record<string, any> = {};
    if (selectedTable) {
      for (const col of selectedTable.columns) {
        const val = row[col.name];
        if (typeof val === 'object' && val !== null) {
          initial[col.name] = JSON.stringify(val, null, 2);
        } else if (val === null || val === undefined) {
          initial[col.name] = '';
        } else {
          initial[col.name] = String(val);
        }
      }
    }
    setEditFormData(initial);
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setIsAddModalOpen(true);
    setActionError(null);
    const initial: Record<string, any> = {};
    if (selectedTable) {
      for (const col of selectedTable.columns) {
        if (col.defaultValue?.includes('nextval')) {
          continue; // auto-generated
        }
        if (col.dataType === 'boolean') {
          initial[col.name] = false;
        } else {
          initial[col.name] = '';
        }
      }
    }
    setAddFormData(initial);
  };

  // Submit Edit
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTable || !editModalRow) return;
    const pk = selectedTable.primaryKey;
    if (!pk) {
      setActionError('Tabela nie posiada zdefiniowanego klucza głównego (PK)');
      return;
    }

    setActionError(null);
    startActionTransition(async () => {
      const dataToSave: Record<string, any> = {};
      for (const col of selectedTable.columns) {
        if (col.name === pk) continue;
        const rawVal = editFormData[col.name];
        if (rawVal === '' || rawVal === undefined) {
          dataToSave[col.name] = null;
        } else if (col.dataType === 'boolean') {
          dataToSave[col.name] = rawVal === true || rawVal === 'true';
        } else if (['integer', 'smallint', 'bigint'].includes(col.dataType)) {
          dataToSave[col.name] = parseInt(rawVal, 10);
        } else if (['numeric', 'real', 'double precision'].includes(col.dataType)) {
          dataToSave[col.name] = parseFloat(rawVal);
        } else if (col.udtName === 'jsonb' || col.dataType === 'json') {
          try {
            dataToSave[col.name] = JSON.parse(rawVal);
          } catch {
            dataToSave[col.name] = rawVal;
          }
        } else {
          dataToSave[col.name] = rawVal;
        }
      }

      const res = await updateTableRowAction(
        selectedTable.name,
        pk,
        editModalRow[pk],
        dataToSave
      );

      if (!res.success) {
        setActionError(res.error || 'Błąd aktualizacji rekordu');
      } else {
        setEditModalRow(null);
        handleRefresh();
      }
    });
  };

  // Submit Add
  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTable) return;

    setActionError(null);
    startActionTransition(async () => {
      const dataToSave: Record<string, any> = {};
      for (const col of selectedTable.columns) {
        const rawVal = addFormData[col.name];
        if (rawVal === '' || rawVal === undefined) {
          continue; // let DB default apply
        } else if (col.dataType === 'boolean') {
          dataToSave[col.name] = rawVal === true || rawVal === 'true';
        } else if (['integer', 'smallint', 'bigint'].includes(col.dataType)) {
          dataToSave[col.name] = parseInt(rawVal, 10);
        } else if (['numeric', 'real', 'double precision'].includes(col.dataType)) {
          dataToSave[col.name] = parseFloat(rawVal);
        } else if (col.udtName === 'jsonb' || col.dataType === 'json') {
          try {
            dataToSave[col.name] = JSON.parse(rawVal);
          } catch {
            dataToSave[col.name] = rawVal;
          }
        } else {
          dataToSave[col.name] = rawVal;
        }
      }

      const res = await insertTableRowAction(selectedTable.name, dataToSave);
      if (!res.success) {
        setActionError(res.error || 'Błąd dodawania rekordu');
      } else {
        setIsAddModalOpen(false);
        handleRefresh();
      }
    });
  };

  // Delete Row
  const handleConfirmDelete = () => {
    if (!selectedTable || !deleteModalRow) return;
    const pk = selectedTable.primaryKey;
    if (!pk) {
      setActionError('Brak klucza głównego (PK) dla tej tabeli');
      return;
    }

    setActionError(null);
    startActionTransition(async () => {
      const res = await deleteTableRowAction(
        selectedTable.name,
        pk,
        deleteModalRow[pk]
      );
      if (!res.success) {
        setActionError(res.error || 'Błąd usuwania rekordu');
      } else {
        setDeleteModalRow(null);
        handleRefresh();
      }
    });
  };

  // Execute Custom SQL
  const handleRunSql = async () => {
    if (!sqlQuery.trim()) return;
    setIsExecutingSql(true);
    setSqlError(null);
    setSqlResult(null);

    const res = await executeSqlAction(sqlQuery.trim());
    setIsExecutingSql(false);

    if (!res.success) {
      setSqlError(res.error || 'Błąd wykonania zapytania SQL');
    } else {
      setSqlResult({
        rows: res.rows || [],
        columns: res.columns || [],
        rowCount: res.rowCount ?? 0,
        executionTimeMs: res.executionTimeMs ?? 0,
      });
    }
  };

  // Quick SQL templates
  const applySqlTemplate = (query: string) => {
    setSqlQuery(query);
    setSqlError(null);
    setSqlResult(null);
  };

  // Total pages calculation
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-neutral-900 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              🗄️
            </div>
            <h1 className="text-xl font-black text-neutral-900 tracking-tight">
              {locale === 'pl' ? 'Baza Danych (PostgreSQL Explorer)' : 'Database Explorer (PostgreSQL)'}
            </h1>
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-800 uppercase tracking-wide">
              Super-Admin
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 font-medium">
            {locale === 'pl'
              ? 'Bezpośredni podgląd, modyfikacja tabel klastra RYCOS oraz konsola SQL zapytań deweloperskich.'
              : 'Direct live browsing, table manipulation and SQL query runner for RYCOS cluster.'}
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="inline-flex rounded-xl bg-neutral-200/70 p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('tables')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'tables'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <span>🗂️</span>
            <span>{locale === 'pl' ? 'Przeglądarka Tabel' : 'Table Explorer'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sql')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'sql'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <span>💻</span>
            <span>{locale === 'pl' ? 'Konsola SQL' : 'SQL Console'}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: TABLE EXPLORER */}
      {activeTab === 'tables' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Sidebar: Tables List */}
          <div className="lg:col-span-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                {locale === 'pl' ? 'Tabele' : 'Tables'} ({tables.length})
              </span>
              <button
                type="button"
                onClick={loadTables}
                disabled={isLoadingTables}
                title={locale === 'pl' ? 'Odśwież listę tabel' : 'Refresh tables list'}
                className="text-xs font-bold text-neutral-500 hover:text-neutral-900 disabled:opacity-50 cursor-pointer p-1 rounded-md hover:bg-neutral-100"
              >
                {isLoadingTables ? '⟳ ...' : '⟳'}
              </button>
            </div>

            {tableListError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-[11px] font-bold text-red-700 space-y-1.5">
                <p>⚠️ {tableListError}</p>
                <button
                  type="button"
                  onClick={loadTables}
                  className="w-full py-1 rounded bg-red-100 hover:bg-red-200 text-red-800 text-[10px] font-bold cursor-pointer"
                >
                  {locale === 'pl' ? 'Ponów próbę' : 'Retry'}
                </button>
              </div>
            )}

            {/* Table search filter */}
            <input
              type="text"
              placeholder={locale === 'pl' ? 'Filtruj tabele...' : 'Filter tables...'}
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-800 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            />

            {/* List */}
            <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
              {isLoadingTables && tables.length === 0 ? (
                <p className="text-center py-4 text-xs text-neutral-400 animate-pulse">
                  {locale === 'pl' ? 'Ładowanie tabel...' : 'Loading tables...'}
                </p>
              ) : filteredTables.length === 0 ? (
                <div className="text-center py-6 space-y-2">
                  <p className="text-xs text-neutral-400">
                    {tableListError
                      ? (locale === 'pl' ? 'Błąd połączenia z bazą' : 'Database connection error')
                      : (locale === 'pl' ? 'Brak tabel w bazie' : 'No tables found')}
                  </p>
                  <button
                    type="button"
                    onClick={loadTables}
                    className="px-3 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-[11px] font-bold text-neutral-700 cursor-pointer"
                  >
                    ⟳ {locale === 'pl' ? 'Pobierz tabele' : 'Fetch tables'}
                  </button>
                </div>
              ) : (
                filteredTables.map((t) => {
                  const isSelected = t.name === selectedTableName;
                  return (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => setSelectedTableName(t.name)}
                      className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-neutral-900 text-white shadow-xs'
                          : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <span className="truncate font-mono">{t.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                          isSelected
                            ? 'bg-neutral-800 text-neutral-300'
                            : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        ~{t.rowCountEst}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Area: Table Grid & Controls */}
          <div className="lg:col-span-9 space-y-4">
            {selectedTable ? (
              <div className="rounded-2xl border border-neutral-200 bg-white shadow-xs overflow-hidden">
                {/* Table Info & Action Bar */}
                <div className="border-b border-neutral-200 bg-neutral-50/70 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-base font-black font-mono text-neutral-900">
                        {selectedTable.name}
                      </h2>
                      {selectedTable.primaryKey && (
                        <span className="rounded-md bg-neutral-200 px-2 py-0.5 text-[11px] font-bold font-mono text-neutral-700">
                          PK: {selectedTable.primaryKey}
                        </span>
                      )}
                      <span className="text-xs text-neutral-500 font-medium">
                        {totalRows} {locale === 'pl' ? 'rekordów' : 'records'} · {selectedTable.columns.length} {locale === 'pl' ? 'kolumn' : 'columns'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={isLoadingRows}
                        className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
                      >
                        {isLoadingRows ? '⟳ ...' : '⟳ ' + (locale === 'pl' ? 'Odśwież' : 'Refresh')}
                      </button>

                      <button
                        type="button"
                        onClick={handleOpenAdd}
                        className="rounded-xl bg-brand hover:bg-brand-600 text-white px-3.5 py-1.5 text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer"
                      >
                        <span className="text-sm font-black">+</span>
                        <span>{locale === 'pl' ? 'Dodaj rekord' : 'Insert Row'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Search and Page Size Filter Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-sm flex-1">
                      <input
                        type="text"
                        placeholder={locale === 'pl' ? 'Szukaj wierszy (Enter)...' : 'Search rows...'}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand"
                      />
                      {activeSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setActiveSearch('');
                            loadTableData(selectedTableName, 1, pageSize, sortBy, sortDir, '');
                          }}
                          className="text-xs text-neutral-400 hover:text-neutral-700 px-1 font-bold cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </form>

                    <div className="flex items-center gap-2 text-xs font-semibold text-neutral-600">
                      <span>{locale === 'pl' ? 'Pokaż:' : 'Show:'}</span>
                      <select
                        value={pageSize}
                        onChange={(e) => handlePageSizeChange(parseInt(e.target.value, 10))}
                        className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs font-semibold text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={250}>250</option>
                      </select>
                    </div>
                  </div>
                </div>

                  {/* Table Error Notice */}
                  {tableError && (
                    <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                      ⚠️ {tableError}
                    </div>
                  )}

                  {/* Data Grid */}
                  <div className="overflow-x-auto max-h-[650px] relative">
                    <table className="w-full text-left text-xs text-neutral-700 border-collapse">
                      <thead className="bg-neutral-100 text-neutral-600 font-semibold border-b border-neutral-200 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-2.5 text-right w-24 bg-neutral-100">
                            {locale === 'pl' ? 'Akcje' : 'Actions'}
                          </th>
                          {selectedTable.columns.map((col) => (
                            <th
                              key={col.name}
                              onClick={() => handleSort(col.name)}
                              className="px-4 py-2.5 font-mono cursor-pointer hover:bg-neutral-200/70 transition-colors select-none whitespace-nowrap bg-neutral-100"
                            >
                              <div className="flex items-center gap-1.5">
                                <span>{col.name}</span>
                                {col.isPrimaryKey && (
                                  <span className="text-[10px] text-amber-600 font-bold">🔑</span>
                                )}
                                <span className="text-neutral-400 font-normal">
                                  {sortBy === col.name ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                                </span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {rows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={selectedTable.columns.length + 1}
                              className="p-8 text-center text-sm text-neutral-400"
                            >
                              {isLoadingRows
                                ? 'Ładowanie rekordów...'
                                : 'Brak rekordów w tabeli.'}
                            </td>
                          </tr>
                        ) : (
                          rows.map((row, idx) => {
                            const pk = selectedTable.primaryKey;
                            const pkVal = pk ? row[pk] : idx;

                            return (
                              <tr
                                key={pkVal}
                                className="hover:bg-neutral-50/80 transition-colors"
                              >
                                {/* Actions */}
                                <td className="px-4 py-2 text-right whitespace-nowrap">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      title="Podgląd szczegółów"
                                      onClick={() => setViewModalRow(row)}
                                      className="p-1 rounded hover:bg-neutral-200 text-neutral-500 hover:text-neutral-900 cursor-pointer"
                                    >
                                      🔍
                                    </button>
                                    <button
                                      type="button"
                                      title="Edytuj wiersz"
                                      onClick={() => handleOpenEdit(row)}
                                      className="p-1 rounded hover:bg-neutral-200 text-neutral-500 hover:text-neutral-900 cursor-pointer"
                                    >
                                      ✏️
                                    </button>
                                    {pk && (
                                      <button
                                        type="button"
                                        title="Usuń wiersz"
                                        onClick={() => setDeleteModalRow(row)}
                                        className="p-1 rounded hover:bg-red-100 text-neutral-400 hover:text-red-700 cursor-pointer"
                                      >
                                        🗑️
                                      </button>
                                    )}
                                  </div>
                                </td>

                                {/* Column Cells */}
                                {selectedTable.columns.map((col) => {
                                  const val = row[col.name];
                                  return (
                                    <td
                                      key={col.name}
                                      className="px-4 py-2 font-mono whitespace-nowrap max-w-xs truncate"
                                    >
                                      {formatCellValue(val, col)}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Bar */}
                  <div className="border-t border-neutral-200 bg-neutral-50/50 px-4 py-3 flex items-center justify-between gap-3 text-xs">
                    <span className="text-neutral-500 font-medium">
                      {locale === 'pl'
                        ? `Strona ${currentPage} z ${totalPages} (${totalRows} rekordów)`
                        : `Page ${currentPage} of ${totalPages} (${totalRows} rows)`}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage <= 1 || isLoadingRows}
                        className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 cursor-pointer"
                      >
                        ‹ {locale === 'pl' ? 'Poprzednia' : 'Prev'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages || isLoadingRows}
                        className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 cursor-pointer"
                      >
                        {locale === 'pl' ? 'Następna' : 'Next'} ›
                      </button>
                    </div>
                  </div>
              </div>
            ) : (
              <div className="p-12 text-center text-neutral-400">
                Wybierz tabelę z listy po lewej stronie.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SQL CONSOLE */}
      {activeTab === 'sql' && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <span>💻</span>
              <span>{locale === 'pl' ? 'Konsola zapytań SQL' : 'Direct SQL Query Console'}</span>
            </h2>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-neutral-400 font-medium">
                {locale === 'pl' ? 'Szablony:' : 'Templates:'}
              </span>
              <button
                type="button"
                onClick={() => applySqlTemplate('SELECT * FROM companies LIMIT 25;')}
                className="rounded-lg bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 font-mono text-[11px] text-neutral-700 cursor-pointer"
              >
                companies
              </button>
              <button
                type="button"
                onClick={() => applySqlTemplate('SELECT * FROM orders ORDER BY id DESC LIMIT 25;')}
                className="rounded-lg bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 font-mono text-[11px] text-neutral-700 cursor-pointer"
              >
                orders
              </button>
              <button
                type="button"
                onClick={() => applySqlTemplate('SELECT * FROM terminals ORDER BY id DESC LIMIT 25;')}
                className="rounded-lg bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 font-mono text-[11px] text-neutral-700 cursor-pointer"
              >
                terminals
              </button>
              <button
                type="button"
                onClick={() => applySqlTemplate('SELECT * FROM fiscal_devices;')}
                className="rounded-lg bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 font-mono text-[11px] text-neutral-700 cursor-pointer"
              >
                fiscal_devices
              </button>
            </div>
          </div>

          {/* SQL Editor Area */}
          <div className="relative">
            <textarea
              rows={5}
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder="SELECT * FROM table_name WHERE ...;"
              className="w-full rounded-xl border border-neutral-300 bg-neutral-900 p-3 font-mono text-xs font-semibold text-emerald-400 focus:outline-none focus:ring-2 focus:ring-brand shadow-inner"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-neutral-400">
              💡 {locale === 'pl' ? 'Możesz wykonywać zapytania SELECT, INSERT, UPDATE, DELETE oraz EXPLAIN.' : 'You can run SELECT, INSERT, UPDATE, DELETE and EXPLAIN.'}
            </span>

            <button
              type="button"
              onClick={handleRunSql}
              disabled={isExecutingSql || !sqlQuery.trim()}
              className="rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white px-5 py-2 text-xs font-bold transition-all shadow-xs flex items-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isExecutingSql ? (
                <>
                  <span className="animate-spin">⟳</span>
                  <span>{locale === 'pl' ? 'Wykonywanie...' : 'Running...'}</span>
                </>
              ) : (
                <>
                  <span>▶</span>
                  <span>{locale === 'pl' ? 'Wykonaj zapytanie' : 'Run Query'}</span>
                </>
              )}
            </button>
          </div>

          {/* SQL Error */}
          {sqlError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 font-mono text-xs text-red-700 space-y-1">
              <p className="font-bold">⚠️ Błąd zapytania:</p>
              <p className="whitespace-pre-wrap">{sqlError}</p>
            </div>
          )}

          {/* SQL Results */}
          {sqlResult && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-2 text-xs">
                <span className="text-neutral-600 font-semibold">
                  {locale === 'pl' ? 'Wynik:' : 'Result:'}{' '}
                  <strong className="text-neutral-900">{sqlResult.rowCount}</strong>{' '}
                  {locale === 'pl' ? 'wierszy' : 'rows'} ·{' '}
                  <span className="font-mono text-emerald-600">{sqlResult.executionTimeMs} ms</span>
                </span>

                <button
                  type="button"
                  onClick={() => {
                    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(sqlResult.rows, null, 2));
                    const downloadAnchor = document.createElement('a');
                    downloadAnchor.setAttribute('href', dataStr);
                    downloadAnchor.setAttribute('download', `query_result_${Date.now()}.json`);
                    document.body.appendChild(downloadAnchor);
                    downloadAnchor.click();
                    downloadAnchor.remove();
                  }}
                  className="text-xs font-bold text-brand hover:underline cursor-pointer"
                >
                  📥 {locale === 'pl' ? 'Eksportuj do JSON' : 'Export JSON'}
                </button>
              </div>

              {sqlResult.rows.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-400">
                  Zapytanie wykonane pomyślnie. Brak zwróconych wierszy danych.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[500px] rounded-xl border border-neutral-200">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-neutral-100 text-neutral-700 border-b border-neutral-200 sticky top-0">
                      <tr>
                        {sqlResult.columns.map((col) => (
                          <th key={col} className="px-3.5 py-2 whitespace-nowrap bg-neutral-100">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {sqlResult.rows.map((r, i) => (
                        <tr key={i} className="hover:bg-neutral-50">
                          {sqlResult.columns.map((col) => (
                            <td key={col} className="px-3.5 py-1.5 whitespace-nowrap max-w-xs truncate">
                              {typeof r[col] === 'object' && r[col] !== null
                                ? JSON.stringify(r[col])
                                : r[col] === null
                                ? <span className="text-neutral-400 italic">null</span>
                                : String(r[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL: VIEW DETAILS */}
      {viewModalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-black text-neutral-900 font-mono">
                🔍 {selectedTable?.name} - Szczegóły rekordu
              </h3>
              <button
                type="button"
                onClick={() => setViewModalRow(null)}
                className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 hover:bg-neutral-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-100 text-xs">
                {Object.entries(viewModalRow).map(([k, v]) => (
                  <div key={k} className="p-2.5 flex items-start gap-4">
                    <span className="w-1/3 font-mono font-bold text-neutral-600 truncate">{k}</span>
                    <div className="w-2/3 font-mono text-neutral-900 break-all">
                      {typeof v === 'object' && v !== null ? (
                        <pre className="bg-neutral-900 text-emerald-400 p-2 rounded-lg text-[11px] overflow-x-auto">
                          {JSON.stringify(v, null, 2)}
                        </pre>
                      ) : v === null ? (
                        <span className="text-neutral-400 italic">null</span>
                      ) : (
                        String(v)
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setViewModalRow(null)}
                className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-xs font-bold text-neutral-700 cursor-pointer"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT ROW */}
      {editModalRow && selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-black text-neutral-900 font-mono">
                ✏️ Edycja: {selectedTable.name} (#{selectedTable.primaryKey ? editModalRow[selectedTable.primaryKey] : ''})
              </h3>
              <button
                type="button"
                onClick={() => setEditModalRow(null)}
                className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 hover:bg-neutral-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {actionError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                ⚠️ {actionError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedTable.columns.map((col) => {
                  const isPk = col.isPrimaryKey;
                  const val = editFormData[col.name] ?? '';

                  if (col.udtName === 'jsonb' || col.dataType === 'json') {
                    return (
                      <div key={col.name} className="md:col-span-2">
                        <label className="text-xs font-bold font-mono text-neutral-700 block mb-1">
                          {col.name} <span className="text-neutral-400 font-normal">(jsonb)</span>
                        </label>
                        <textarea
                          rows={4}
                          value={val}
                          onChange={(e) => setEditFormData({ ...editFormData, [col.name]: e.target.value })}
                          className="w-full rounded-xl border border-neutral-300 bg-neutral-900 p-2 text-xs font-mono text-emerald-400 focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                      </div>
                    );
                  }

                  if (col.dataType === 'boolean') {
                    return (
                      <div key={col.name} className="flex items-center gap-2 pt-5">
                        <input
                          type="checkbox"
                          id={`edit-${col.name}`}
                          checked={val === true || val === 'true'}
                          onChange={(e) => setEditFormData({ ...editFormData, [col.name]: e.target.checked })}
                          className="h-4 w-4 rounded text-brand focus:ring-brand"
                        />
                        <label htmlFor={`edit-${col.name}`} className="text-xs font-bold font-mono text-neutral-700 cursor-pointer">
                          {col.name}
                        </label>
                      </div>
                    );
                  }

                  return (
                    <div key={col.name}>
                      <label className="text-xs font-bold font-mono text-neutral-700 block mb-1">
                        {col.name}{' '}
                        {isPk && <span className="text-amber-600 font-bold">(PK)</span>}{' '}
                        <span className="text-neutral-400 font-normal">({col.dataType})</span>
                      </label>
                      <input
                        type="text"
                        disabled={isPk}
                        value={val}
                        onChange={(e) => setEditFormData({ ...editFormData, [col.name]: e.target.value })}
                        className={`w-full rounded-xl border p-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand ${
                          isPk
                            ? 'bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed'
                            : 'bg-white border-neutral-300 text-neutral-900'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-neutral-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditModalRow(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-100 cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={isActionPending}
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-600 text-white font-bold text-xs shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isActionPending ? 'Zapisywanie...' : 'Zapisz zmiany'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD ROW */}
      {isAddModalOpen && selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-black text-neutral-900 font-mono">
                ➕ Nowy rekord w tabeli: {selectedTable.name}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 hover:bg-neutral-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {actionError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                ⚠️ {actionError}
              </div>
            )}

            <form onSubmit={handleSaveAdd} className="space-y-3.5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedTable.columns.map((col) => {
                  const isAuto = col.defaultValue?.includes('nextval');
                  const val = addFormData[col.name] ?? '';

                  if (isAuto) return null; // skip auto-increment primary key in create form

                  if (col.udtName === 'jsonb' || col.dataType === 'json') {
                    return (
                      <div key={col.name} className="md:col-span-2">
                        <label className="text-xs font-bold font-mono text-neutral-700 block mb-1">
                          {col.name} <span className="text-neutral-400 font-normal">(jsonb)</span>
                        </label>
                        <textarea
                          rows={3}
                          value={val}
                          placeholder="{}"
                          onChange={(e) => setAddFormData({ ...addFormData, [col.name]: e.target.value })}
                          className="w-full rounded-xl border border-neutral-300 bg-neutral-900 p-2 text-xs font-mono text-emerald-400 focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                      </div>
                    );
                  }

                  if (col.dataType === 'boolean') {
                    return (
                      <div key={col.name} className="flex items-center gap-2 pt-5">
                        <input
                          type="checkbox"
                          id={`add-${col.name}`}
                          checked={val === true || val === 'true'}
                          onChange={(e) => setAddFormData({ ...addFormData, [col.name]: e.target.checked })}
                          className="h-4 w-4 rounded text-brand focus:ring-brand"
                        />
                        <label htmlFor={`add-${col.name}`} className="text-xs font-bold font-mono text-neutral-700 cursor-pointer">
                          {col.name}
                        </label>
                      </div>
                    );
                  }

                  return (
                    <div key={col.name}>
                      <label className="text-xs font-bold font-mono text-neutral-700 block mb-1">
                        {col.name}{' '}
                        <span className="text-neutral-400 font-normal">
                          ({col.dataType}) {col.isNullable ? '' : '*'}
                        </span>
                      </label>
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => setAddFormData({ ...addFormData, [col.name]: e.target.value })}
                        className="w-full rounded-xl border border-neutral-300 bg-white p-2 text-xs font-mono text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-neutral-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-100 cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={isActionPending}
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-600 text-white font-bold text-xs shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isActionPending ? 'Dodawanie...' : 'Utwórz rekord'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {deleteModalRow && selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-neutral-900">
              🗑️ Potwierdź usunięcie rekordu
            </h3>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Czy na pewno chcesz bezpowrotnie usunąć rekord z tabeli{' '}
              <strong className="font-mono text-neutral-900">{selectedTable.name}</strong> o kluczu{' '}
              <strong className="font-mono text-neutral-900">
                {selectedTable.primaryKey} = {deleteModalRow[selectedTable.primaryKey!]}
              </strong>
              ?
            </p>

            {actionError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                ⚠️ {actionError}
              </div>
            )}

            <div className="pt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteModalRow(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-100 cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isActionPending}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isActionPending ? 'Usuwanie...' : 'Usuń rekord'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper formatting cell values for grid display
function formatCellValue(val: any, col: ColumnMeta): React.ReactNode {
  if (val === null || val === undefined) {
    return <span className="text-neutral-300 italic">null</span>;
  }

  if (typeof val === 'boolean') {
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
          val
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-red-100 text-red-800'
        }`}
      >
        {val ? 'true' : 'false'}
      </span>
    );
  }

  if (typeof val === 'object') {
    return (
      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600 font-mono">
        {JSON.stringify(val).slice(0, 30)}...
      </span>
    );
  }

  return String(val);
}
