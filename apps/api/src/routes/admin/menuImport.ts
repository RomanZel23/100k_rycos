import type { FastifyInstance } from 'fastify';
import {
  getDatabase,
  categories,
  products,
  brands,
  brandProducts,
  eq,
  and,
  sql,
} from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, error, validationError, notFound, forbidden } from '../../lib/response.js';
import { parseMenuFile, DEFAULT_TAX_RATE, type DraftItem } from '../../services/menuImportService.js';
import {
  analyzeMenuImages,
  visionConfigured,
  getMenuPrompt,
  saveMenuPrompt,
  DEFAULT_PROMPT,
  type MenuImageInput,
} from '../../services/menuVisionService.js';
import { invalidateBrandMenuCache } from '../../services/catalogService.js';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS = 500;
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

/** Prompt odczytu karty jest wspólny dla całej platformy — zmienia go tylko jej operator. */
function isPlatformOperator(req: any): boolean {
  const role = String(req.user?.role || '').toLowerCase();
  return role === 'platform_admin' || role === 'super_admin';
}

export async function adminMenuImportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  /**
   * POST /v1/admin/menu-import/parse
   * Plik (base64) → draft do korekty. Nic nie zapisuje w bazie.
   */
  fastify.post('/v1/admin/menu-import/parse', async (req, reply) => {
    const body = (req.body ?? {}) as { filename?: string; content_base64?: string };
    const raw = String(body.content_base64 || '');

    if (!raw) {
      return validationError(reply, { content_base64: 'Wskaż plik do wczytania' });
    }

    const buffer = Buffer.from(raw.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (buffer.length === 0) {
      return validationError(reply, { content_base64: 'Plik jest pusty' });
    }
    if (buffer.length > MAX_FILE_BYTES) {
      return validationError(reply, { content_base64: 'Plik jest za duży (limit 2 MB)' });
    }

    try {
      const draft = parseMenuFile(buffer, String(body.filename || ''));
      if (draft.items.length > MAX_ITEMS) {
        draft.items = draft.items.slice(0, MAX_ITEMS);
        draft.warnings.push(`Plik zawiera więcej niż ${MAX_ITEMS} pozycji — zaimportujemy pierwsze ${MAX_ITEMS}.`);
      }
      return success(reply, draft, 'Plik odczytany');
    } catch (err: any) {
      return error(reply, err.message || 'Nie udało się odczytać pliku', 400);
    }
  });

  /**
   * GET /v1/admin/menu-import/capabilities
   * Panel pyta, czy pokazać zakładkę ze zdjęciem karty.
   */
  fastify.get('/v1/admin/menu-import/capabilities', async (_req, reply) => {
    return success(reply, {
      file: true,
      images: visionConfigured(),
      max_images: MAX_IMAGES,
      max_image_mb: MAX_IMAGE_BYTES / (1024 * 1024),
      default_tax_rate: DEFAULT_TAX_RATE,
    });
  });

  /**
   * POST /v1/admin/menu-import/analyze-images
   * Zdjęcia karty dań (lub PDF) → ten sam draft co import z pliku. Nic nie zapisuje w bazie.
   */
  fastify.post('/v1/admin/menu-import/analyze-images', async (req, reply) => {
    const body = (req.body ?? {}) as {
      images?: { filename?: string; mime_type?: string; content_base64?: string }[];
      prompt_override?: string;
    };
    const incoming = Array.isArray(body.images) ? body.images : [];

    if (incoming.length === 0) {
      return validationError(reply, { images: 'Dodaj co najmniej jedno zdjęcie karty dań' });
    }
    if (incoming.length > MAX_IMAGES) {
      return validationError(reply, { images: `Maksymalnie ${MAX_IMAGES} plików na raz` });
    }
    if (!visionConfigured()) {
      return error(reply, 'Odczyt zdjęć nie jest włączony na tym serwerze (brak klucza modelu)', 503);
    }

    const images: MenuImageInput[] = [];
    for (const item of incoming) {
      const raw = String(item?.content_base64 || '').replace(/^data:[^;]+;base64,/, '');
      if (!raw) continue;
      const bytes = Buffer.byteLength(raw, 'base64');
      if (bytes > MAX_IMAGE_BYTES) {
        return validationError(reply, { images: `Plik ${item?.filename || ''} jest za duży (limit ${MAX_IMAGE_BYTES / (1024 * 1024)} MB)` });
      }
      const mimeType = String(item?.mime_type || 'image/jpeg').toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
        return validationError(reply, { images: `Nieobsługiwany format: ${mimeType}` });
      }
      images.push({ mimeType, data: raw, filename: item?.filename });
    }

    if (images.length === 0) {
      return validationError(reply, { images: 'Pliki są puste' });
    }

    const startedAt = Date.now();
    try {
      // Podgląd innego promptu bez zapisywania go — wyłącznie dla operatora platformy
      const override = isPlatformOperator(req) ? body.prompt_override : undefined;
      const draft = await analyzeMenuImages(images, override);
      if (draft.items.length > MAX_ITEMS) {
        draft.items = draft.items.slice(0, MAX_ITEMS);
        draft.warnings.push(`Rozpoznano więcej niż ${MAX_ITEMS} pozycji — zaimportujemy pierwsze ${MAX_ITEMS}.`);
      }
      console.log(`[Menu Import] Odczyt ${images.length} zdjec: ${draft.items.length} pozycji w ${Date.now() - startedAt} ms`);
      return success(reply, draft, 'Karta odczytana');
    } catch (err: any) {
      console.error('[Menu Import] Odczyt zdjec nie powiodl sie:', err.message);
      return error(reply, err.message || 'Nie udało się odczytać karty ze zdjęcia', 502);
    }
  });

  /**
   * GET /v1/admin/menu-import/prompt — podgląd i edycja promptu odczytu karty (tylko operator platformy).
   */
  fastify.get('/v1/admin/menu-import/prompt', async (req, reply) => {
    if (!isPlatformOperator(req)) return forbidden(reply, 'Tylko operator platformy może zmieniać prompt');
    const resolved = await getMenuPrompt();
    return success(reply, {
      prompt: resolved.prompt,
      source: resolved.source,
      default_prompt: DEFAULT_PROMPT,
      is_default: resolved.source === 'default',
    });
  });

  /**
   * PUT /v1/admin/menu-import/prompt — zapisuje własną wersję; pusty tekst przywraca wbudowaną.
   */
  fastify.put('/v1/admin/menu-import/prompt', async (req, reply) => {
    if (!isPlatformOperator(req)) return forbidden(reply, 'Tylko operator platformy może zmieniać prompt');
    const body = (req.body ?? {}) as { prompt?: string | null };
    const actor = String((req.user as any)?.email || (req.user as any)?.id || 'admin');

    try {
      await saveMenuPrompt(body.prompt ?? null, actor);
      const resolved = await getMenuPrompt();
      return success(reply, { prompt: resolved.prompt, source: resolved.source }, 'Prompt zapisany');
    } catch (err: any) {
      return error(reply, err.message || 'Nie udało się zapisać promptu', 500);
    }
  });

  /**
   * POST /v1/admin/menu-import/commit
   * Zatwierdzony draft → kategorie, produkty i przypisanie do wybranej marki.
   * Pozycja bez ceny jest pomijana i raportowana; brakująca stawka VAT to bezpieczne 23%.
   */
  fastify.post('/v1/admin/menu-import/commit', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as { brand_id?: number | string; items?: DraftItem[] };

    const brandId = body.brand_id !== undefined ? parseInt(String(body.brand_id), 10) : NaN;
    if (!Number.isFinite(brandId)) {
      return validationError(reply, { brand_id: 'Wybierz markę, do której trafi menu' });
    }
    const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
    if (items.length === 0) {
      return validationError(reply, { items: 'Brak pozycji do zapisania' });
    }

    const [brand] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.companyId, companyId)))
      .limit(1);
    if (!brand) return notFound(reply, 'Nie znaleziono marki');

    const skipped: { name: string; reason: string }[] = [];
    const categoryCache = new Map<string, number>();

    try {
      const created = await db.transaction(async (tx) => {
        let createdProducts = 0;
        let createdCategories = 0;

        for (const item of items) {
          const name = String(item?.name || '').trim();
          if (!name) continue;

          const price = typeof item.price === 'number' ? item.price : parseFloat(String(item.price ?? ''));
          if (!Number.isFinite(price) || price <= 0) {
            skipped.push({ name, reason: 'brak ceny' });
            continue;
          }
          // Stawka spoza listy (albo jej brak) nie blokuje importu — wchodzi bezpieczne 23%,
          // wyróżnione w panelu do poprawy.
          const rawTax = typeof item.taxRate === 'number' ? item.taxRate : parseInt(String(item.taxRate ?? ''), 10);
          const taxRate = [0, 5, 8, 23].includes(rawTax) ? rawTax : DEFAULT_TAX_RATE;

          let categoryId: number | null = null;
          const categoryName = String(item.category || '').trim();
          if (categoryName) {
            const key = categoryName.toLowerCase();
            if (categoryCache.has(key)) {
              categoryId = categoryCache.get(key)!;
            } else {
              const [existing] = await tx
                .select({ id: categories.id })
                .from(categories)
                .where(and(eq(categories.companyId, companyId), sql`lower(${categories.name}) = lower(${categoryName})`))
                .limit(1);
              if (existing) {
                categoryId = existing.id;
              } else {
                const [inserted] = await tx
                  .insert(categories)
                  .values({ companyId, name: categoryName.substring(0, 128) })
                  .returning({ id: categories.id });
                categoryId = inserted.id;
                createdCategories++;
              }
              categoryCache.set(key, categoryId);
            }
          }

          const ptuCode = taxRate === 8 ? 'b' : taxRate === 5 ? 'c' : taxRate === 0 ? 'd' : 'a';
          const [product] = await tx
            .insert(products)
            .values({
              companyId,
              categoryId,
              name: name.substring(0, 255),
              description: item.description ? String(item.description).substring(0, 1000) : null,
              price: price.toFixed(2),
              taxRate,
              ptuCode,
              isAvailable: true,
              barcode: item.barcode ? String(item.barcode).substring(0, 64) : null,
            })
            .returning({ id: products.id });

          await tx.insert(brandProducts).values({ brandId, productId: product.id }).onConflictDoNothing();
          createdProducts++;
        }

        return { createdProducts, createdCategories };
      });

      await invalidateBrandMenuCache(brandId);

      return success(
        reply,
        { ...created, skipped, brand_id: brandId },
        `Zaimportowano ${created.createdProducts} pozycji menu`
      );
    } catch (err: any) {
      return error(reply, err.message || 'Nie udało się zapisać menu', 500);
    }
  });
}
