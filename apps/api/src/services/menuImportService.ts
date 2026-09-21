/**
 * Import menu z pliku: parsowanie do wspólnego formatu roboczego (draft), który panel
 * pokazuje do korekty, a następnie zatwierdza przez /menu-import/commit.
 *
 * Ten sam draft produkuje później ścieżka ze zdjęciem karty — dzięki temu ekran korekty
 * i zapis są wspólne dla wszystkich źródeł.
 */

export interface DraftItem {
  /** Nazwa kategorii tak, jak w pliku; pusta = produkt bez kategorii. */
  category: string | null;
  name: string;
  description: string | null;
  /** Cena w złotych; null = nie udało się odczytać i użytkownik musi ją uzupełnić. */
  price: number | null;
  /** Stawka VAT: z pliku, a gdy jej nie ma — bezpieczne 23% z ostrzeżeniem do sprawdzenia. */
  taxRate: number;
  barcode: string | null;
  /** Co wymaga uwagi człowieka w tym wierszu. */
  warnings: string[];
}

export interface MenuDraft {
  items: DraftItem[];
  /** Uwagi dotyczące całego pliku (np. nierozpoznane kolumny). */
  warnings: string[];
  /** Jak zinterpretowaliśmy plik — panel pokazuje to nad tabelą. */
  meta: {
    rows: number;
    delimiter: string;
    encoding: string;
    columns: Record<string, string | null>;
  };
}

const HEADER_ALIASES: Record<keyof Omit<DraftItem, 'warnings'>, string[]> = {
  category: ['kategoria', 'category', 'grupa', 'dzial', 'dział', 'sekcja'],
  name: ['nazwa', 'name', 'produkt', 'pozycja', 'danie', 'title'],
  description: ['opis', 'description', 'sklad', 'skład', 'składniki', 'skladniki'],
  price: ['cena', 'price', 'kwota', 'cena brutto', 'brutto'],
  taxRate: ['vat', 'stawka', 'stawka vat', 'ptu', 'tax', 'tax_rate', 'podatek'],
  barcode: ['kod', 'ean', 'sku', 'barcode', 'kod kreskowy', 'indeks'],
};

/** Plik z Excela bywa w cp1250; UTF-8 z nieprawidłowymi znakami zdradza się znakiem zastępczym. */
export function decodeText(buffer: Buffer): { text: string; encoding: string } {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (!utf8.includes('�')) {
    return { text: utf8.replace(/^﻿/, ''), encoding: 'utf-8' };
  }
  try {
    const win = new TextDecoder('windows-1250').decode(buffer);
    return { text: win.replace(/^﻿/, ''), encoding: 'windows-1250' };
  } catch {
    return { text: utf8.replace(/^﻿/, ''), encoding: 'utf-8' };
  }
}

/**
 * Excel w polskiej lokalizacji zapisuje CSV ze średnikiem, ale pierwszy wiersz bywa nazwą sekcji
 * bez żadnego separatora — dlatego patrzymy na kilkanaście pierwszych wierszy, nie na jeden.
 */
export function sniffDelimiter(text: string): string {
  const candidates = [';', ',', '\t', '|'];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 20);

  let best = ';';
  let bestScore = 0;
  for (const candidate of candidates) {
    // Liczy się, w ilu wierszach separator faktycznie dzieli tekst, a nie suma wystąpień
    const linesWith = lines.filter((line) => line.includes(candidate)).length;
    const total = lines.reduce((sum, line) => sum + (line.split(candidate).length - 1), 0);
    const score = linesWith * 100 + total;
    if (linesWith > 0 && score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** Parser CSV z obsługą cudzysłowów i podwójnych cudzysłowów w środku pola. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** "32,00 zł", "1 234,50", "12.90 PLN" → liczba w złotych. */
export function parsePrice(raw: string): number | null {
  const cleaned = String(raw || '')
    .replace(/[^\d.,-]/g, '')
    .replace(/\s/g, '');
  if (!cleaned) return null;

  // Ostatni separator decyduje o części dziesiętnej: "1.234,50" i "1,234.50" znaczą to samo
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;

  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '');
  }

  const value = parseFloat(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

/** Domyślna stawka, gdy źródło jej nie podaje — wyższa jest bezpieczniejsza podatkowo. */
export const DEFAULT_TAX_RATE = 23;

/** "8", "8%", "vat 8" → 8; nieznana wartość → null (wołający podstawia DEFAULT_TAX_RATE). */
export function parseTaxRate(raw: string): number | null {
  const match = String(raw || '').match(/\d{1,2}/);
  if (!match) return null;
  const value = parseInt(match[0], 10);
  return [0, 5, 8, 23].includes(value) ? value : null;
}

function normalizeHeader(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Dopasowanie kolumn pliku do pól draftu; zwraca indeks kolumny dla każdego pola. */
export function mapColumns(header: string[]): Record<string, number | null> {
  const normalized = header.map(normalizeHeader);
  const mapping: Record<string, number | null> = {
    category: null,
    name: null,
    description: null,
    price: null,
    taxRate: null,
    barcode: null,
  };

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = normalized.findIndex((cell) => aliases.includes(cell));
    if (index >= 0) mapping[field] = index;
  }
  return mapping;
}

/**
 * Plik → draft. Rozpoznaje nagłówki po polsku i angielsku, radzi sobie z plikiem bez nagłówka
 * oraz z wierszami, które są nazwą sekcji menu (jedna wypełniona komórka) zamiast produktem.
 */
export function parseMenuFile(buffer: Buffer, filename = ''): MenuDraft {
  const { text, encoding } = decodeText(buffer);
  const delimiter = sniffDelimiter(text);
  const rows = parseCsv(text, delimiter);

  const warnings: string[] = [];
  if (rows.length === 0) {
    return {
      items: [],
      warnings: ['Plik jest pusty albo nie udało się odczytać żadnego wiersza.'],
      meta: { rows: 0, delimiter, encoding, columns: {} },
    };
  }

  let mapping = mapColumns(rows[0]);
  let dataRows = rows.slice(1);
  const hasHeader = mapping.name !== null || mapping.price !== null;

  if (!hasHeader) {
    // Bez nagłówka zakładamy najczęstszy układ: nazwa, cena, (opis)
    mapping = { category: null, name: 0, description: rows[0].length > 2 ? 2 : null, price: 1, taxRate: null, barcode: null };
    dataRows = rows;
    warnings.push('Plik nie ma nagłówka — przyjęto kolejność: nazwa, cena, opis. Sprawdź tabelę poniżej.');
  }
  if (mapping.price === null) {
    warnings.push('Nie znaleziono kolumny z ceną — ceny trzeba uzupełnić ręcznie.');
  }
  if (mapping.taxRate === null) {
    warnings.push(`Brak kolumny ze stawką VAT — wszystkim pozycjom przypisano ${DEFAULT_TAX_RATE}%. Popraw je nad tabelą, jeśli to gastronomia na miejscu (zwykle 8%).`);
  }

  const cell = (row: string[], index: number | null): string => (index === null ? '' : String(row[index] ?? '').trim());

  const items: DraftItem[] = [];
  let sectionCategory: string | null = null;
  const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);

  for (const row of dataRows) {
    const filled = row.filter((c) => String(c ?? '').trim() !== '');
    const name = cell(row, mapping.name);

    // Wiersz z jedną wypełnioną komórką to zwykle nagłówek sekcji w karcie dań
    // (o ile plik w ogóle ma więcej kolumn — inaczej to po prostu lista nazw)
    if (filled.length === 1 && name && maxColumns > 1) {
      sectionCategory = name;
      continue;
    }
    if (!name) continue;

    const itemWarnings: string[] = [];
    const price = parsePrice(cell(row, mapping.price));
    if (price === null) itemWarnings.push('brak ceny');
    else if (price === 0) itemWarnings.push('cena zero');

    const parsedTax = parseTaxRate(cell(row, mapping.taxRate));
    const taxRate = parsedTax ?? DEFAULT_TAX_RATE;
    if (parsedTax === null) itemWarnings.push(`przyjęto ${DEFAULT_TAX_RATE}% VAT — sprawdź stawkę`);

    const category = cell(row, mapping.category) || sectionCategory;

    items.push({
      category: category || null,
      name: name.substring(0, 255),
      description: cell(row, mapping.description).substring(0, 1000) || null,
      price,
      taxRate,
      barcode: cell(row, mapping.barcode) || null,
      warnings: itemWarnings,
    });
  }

  if (items.length === 0) {
    warnings.push('Nie rozpoznano żadnej pozycji menu w tym pliku.');
  }
  if (filename && !/\.(csv|txt|tsv)$/i.test(filename)) {
    warnings.push(`Plik ${filename} nie wygląda na CSV — jeśli to Excel, zapisz go jako CSV (średnik) i spróbuj ponownie.`);
  }

  return {
    items,
    warnings,
    meta: {
      rows: dataRows.length,
      delimiter: delimiter === '\t' ? 'tab' : delimiter,
      encoding,
      columns: Object.fromEntries(
        Object.entries(mapping).map(([field, index]) => [field, index === null ? null : String(rows[0]?.[index] ?? `kolumna ${index + 1}`)])
      ),
    },
  };
}
