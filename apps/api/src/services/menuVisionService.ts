import { env } from '../config/env.js';
import { parsePrice, parseTaxRate, DEFAULT_TAX_RATE, type DraftItem, type MenuDraft } from './menuImportService.js';

/**
 * Odczyt karty dań ze zdjęć / PDF-a do tego samego draftu, który produkuje import z pliku.
 * Dostawca modelu siedzi za jedną funkcją — podmiana to zmiana MENU_AI_PROVIDER, nie przepisywanie importu.
 */

export interface MenuImageInput {
  /** image/jpeg, image/png, image/webp albo application/pdf */
  mimeType: string;
  /** Zawartość pliku w base64 (bez prefiksu data:). */
  data: string;
  filename?: string;
}

const PROMPT = `Jesteś asystentem, który przepisuje kartę dań restauracji do systemu sprzedaży.

Odczytaj ze zdjęć wszystkie pozycje menu wraz z cenami. Zasady:
- Przepisuj wyłącznie to, co widać. Nie dopisuj pozycji, których nie ma na zdjęciu.
- Zachowaj oryginalną pisownię nazw, razem z polskimi znakami.
- Nagłówki sekcji (np. PRZYSTAWKI, NAPOJE) traktuj jako kategorię kolejnych pozycji.
- Jeśli pozycja ma kilka wariantów ceny (np. mała 24 zł / duża 32 zł), utwórz osobną pozycję dla każdego wariantu i dopisz wariant do nazwy.
- Cenę przepisz dokładnie tak, jak w karcie (np. "32,00" albo "32 zł").
- Opis to lista składników pod nazwą dania, jeśli jest. Bez opisu zostaw pole puste.
- Stawkę VAT podaj tylko wtedy, gdy jest wprost wydrukowana w karcie. W przeciwnym razie zostaw puste.
- Pomiń informacje niebędące pozycjami menu: godziny otwarcia, adres, alergeny, stopki, numery telefonów.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'string' },
          taxRate: { type: 'string' },
        },
        required: ['name', 'price'],
      },
    },
  },
  required: ['items'],
};

interface RawVisionItem {
  category?: string;
  name?: string;
  description?: string;
  price?: string;
  taxRate?: string;
}

export function visionConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

async function callGemini(images: MenuImageInput[]): Promise<RawVisionItem[]> {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  const parts: any[] = images.map((img) => ({
    inline_data: { mime_type: img.mimeType, data: img.data },
  }));
  parts.push({ text: PROMPT });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
  } catch (err: any) {
    throw new Error(err?.name === 'AbortError' ? 'Model nie odpowiedział w ciągu 60 sekund' : `Błąd połączenia z modelem: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const bodyText = await response.text();
  let payload: any = {};
  try {
    payload = JSON.parse(bodyText);
  } catch {
    payload = {};
  }

  if (!response.ok) {
    // Odpowiedź bez JSON-owego błędu zwykle nie pochodzi od modelu, tylko od czegoś po drodze
    // (proxy, firewall, blokada klucza) — wtedy pokazujemy fragment treści, bo to on mówi, co się stało.
    const detail = payload?.error?.message || bodyText.trim().slice(0, 200) || `HTTP ${response.status}`;
    throw new Error(`Model odrzucił żądanie (HTTP ${response.status}): ${detail}`);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') || '';
  if (!text.trim()) {
    const reason = payload?.candidates?.[0]?.finishReason;
    throw new Error(reason ? `Model nie zwrócił treści (${reason})` : 'Model nie zwrócił treści');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Model zwrócił odpowiedź, której nie da się odczytać jako JSON');
  }
  return Array.isArray(parsed?.items) ? parsed.items : [];
}

/** Zdjęcia → draft w tym samym formacie co import z pliku. */
export async function analyzeMenuImages(images: MenuImageInput[]): Promise<MenuDraft> {
  if (!visionConfigured()) {
    throw new Error('Odczyt zdjęć nie jest skonfigurowany — brakuje klucza modelu w ustawieniach serwera');
  }

  const rawItems = await callGemini(images);
  const warnings: string[] = [];
  const items: DraftItem[] = [];

  for (const raw of rawItems) {
    const name = String(raw?.name || '').trim();
    if (!name) continue;

    const itemWarnings: string[] = [];
    const price = parsePrice(String(raw?.price ?? ''));
    if (price === null) itemWarnings.push('brak ceny');

    const parsedTax = parseTaxRate(String(raw?.taxRate ?? ''));
    if (parsedTax === null) itemWarnings.push(`przyjęto ${DEFAULT_TAX_RATE}% VAT — sprawdź stawkę`);

    items.push({
      category: String(raw?.category || '').trim() || null,
      name: name.substring(0, 255),
      description: String(raw?.description || '').trim().substring(0, 1000) || null,
      price,
      taxRate: parsedTax ?? DEFAULT_TAX_RATE,
      barcode: null,
      warnings: itemWarnings,
    });
  }

  if (items.length === 0) {
    warnings.push('Na zdjęciach nie rozpoznano żadnej pozycji menu. Spróbuj zrobić zdjęcie z bliska, prosto na kartę i przy dobrym świetle.');
  } else {
    warnings.push('Odczyt ze zdjęcia bywa omylny przy cenach i polskich znakach — przejrzyj tabelę przed zapisem.');
  }

  return {
    items,
    warnings,
    meta: {
      rows: items.length,
      delimiter: '-',
      encoding: 'vision',
      columns: { source: `${images.length} plik(ów)`, model: env.GEMINI_MODEL || 'gemini-2.5-flash' },
    },
  };
}
