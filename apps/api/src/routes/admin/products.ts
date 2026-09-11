import type { FastifyInstance } from 'fastify';
import { getDatabase, products, categories, eq, and, desc } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';
import { uploadImageToS3 } from '../../lib/s3.js';

export async function adminProductsRoutes(fastify: FastifyInstance) {
  // Pre-handler for all admin product routes
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/products - List all products for the company
  fastify.get('/v1/admin/products', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const rows = await db
      .select({
        id: products.id,
        companyId: products.companyId,
        categoryId: products.categoryId,
        categoryName: categories.name,
        name: products.name,
        description: products.description,
        price: products.price,
        taxRate: products.taxRate,
        ptuCode: products.ptuCode,
        imageUrl: products.imageUrl,
        isAvailable: products.isAvailable,
        isAgeRestricted: products.isAgeRestricted,
        stockQuantity: products.stockQuantity,
        prepTimeMinutes: products.prepTimeMinutes,
        barcode: products.barcode,
        productOrder: products.productOrder,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.companyId, companyId))
      .orderBy(desc(products.id));

    const mapped = rows.map((r) => ({
      ...r,
      is_available: r.isAvailable,
      stock_quantity: r.stockQuantity,
      image_url: r.imageUrl,
      category_name: r.categoryName,
    }));

    return success(reply, mapped, 'Products retrieved');
  });

  // GET /v1/admin/products/:id - Single product details
  fastify.get('/v1/admin/products/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const productId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [row] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
      .limit(1);

    if (!row) {
      return notFound(reply, 'Product not found');
    }

    return success(reply, row);
  });

  // POST /v1/admin/products - Create a new product
  fastify.post('/v1/admin/products', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    if (!body.name || body.price === undefined) {
      return validationError(reply, {
        name: !body.name ? 'Name is required' : '',
        price: body.price === undefined ? 'Price is required' : '',
      });
    }

    const price = typeof body.price === 'number' ? body.price.toFixed(2) : String(body.price);
    const taxRate = body.taxRate ? parseInt(String(body.taxRate), 10) : 23;
    const ptuCode = taxRate === 8 ? 'b' : taxRate === 5 ? 'c' : taxRate === 0 ? 'd' : 'a';

    try {
      const [inserted] = await db
        .insert(products)
        .values({
          companyId,
          categoryId: body.categoryId ? parseInt(String(body.categoryId), 10) : null,
          name: String(body.name).trim(),
          description: body.description ? String(body.description).trim() : null,
          price,
          taxRate,
          ptuCode,
          imageUrl: body.imageUrl || null,
          isAvailable: body.isAvailable !== false,
          isAgeRestricted: body.isAgeRestricted === true,
          prepTimeMinutes: body.prepTimeMinutes ? parseInt(String(body.prepTimeMinutes), 10) : 10,
          barcode: body.barcode || null,
          productOrder: body.productOrder ? parseInt(String(body.productOrder), 10) : 0,
        })
        .returning();

      return success(reply, inserted, 'Product created', 201);
    } catch (err: any) {
      console.error('[Admin:Products] Insert failed:', err);
      return error(reply, err.message || 'Failed to create product');
    }
  });

  // PUT /v1/admin/products/:id - Update product
  fastify.put('/v1/admin/products/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const productId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();
    const body = req.body as any;

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.description !== undefined) updateData.description = body.description ? String(body.description).trim() : null;
    if (body.price !== undefined) updateData.price = typeof body.price === 'number' ? body.price.toFixed(2) : String(body.price);
    if (body.categoryId !== undefined) updateData.categoryId = body.categoryId ? parseInt(String(body.categoryId), 10) : null;
    if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl;
    if (body.isAvailable !== undefined) updateData.isAvailable = Boolean(body.isAvailable);
    if (body.isAgeRestricted !== undefined) updateData.isAgeRestricted = Boolean(body.isAgeRestricted);
    if (body.taxRate !== undefined) {
      const tr = parseInt(String(body.taxRate), 10);
      updateData.taxRate = tr;
      updateData.ptuCode = tr === 8 ? 'b' : tr === 5 ? 'c' : tr === 0 ? 'd' : 'a';
    }
    if (body.prepTimeMinutes !== undefined) updateData.prepTimeMinutes = parseInt(String(body.prepTimeMinutes), 10);
    if (body.barcode !== undefined) updateData.barcode = body.barcode;
    if (body.productOrder !== undefined) updateData.productOrder = parseInt(String(body.productOrder), 10);

    try {
      const [updated] = await db
        .update(products)
        .set(updateData)
        .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
        .returning();

      if (!updated) {
        return notFound(reply, 'Product not found');
      }

      return success(reply, updated, 'Product updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update product');
    }
  });

  // DELETE /v1/admin/products/:id - Delete product
  fastify.delete('/v1/admin/products/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const productId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [deleted] = await db
      .delete(products)
      .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
      .returning();

    if (!deleted) {
      return notFound(reply, 'Product not found');
    }

    return success(reply, { id: productId }, 'Product deleted');
  });

  // PUT /v1/admin/products/:id/stock - Quick stock + availability update
  fastify.put('/v1/admin/products/:id/stock', async (req, reply) => {
    const { id } = req.params as { id: string };
    const productId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();
    const body = (req.body ?? {}) as any;

    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (body.is_available !== undefined) updateData.isAvailable = Boolean(body.is_available);
    if (body.isAvailable !== undefined) updateData.isAvailable = Boolean(body.isAvailable);

    const rawStock = body.stock_quantity !== undefined ? body.stock_quantity : body.stockQuantity;
    if (rawStock !== undefined) {
      updateData.stockQuantity = rawStock === null || rawStock === '' ? null : parseInt(String(rawStock), 10);
    }

    try {
      const [updated] = await db
        .update(products)
        .set(updateData)
        .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
        .returning();

      if (!updated) {
        return notFound(reply, 'Product not found');
      }

      return success(reply, {
        ...updated,
        is_available: updated.isAvailable,
        stock_quantity: updated.stockQuantity,
      }, 'Stock updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update stock');
    }
  });

  // POST /v1/admin/products/:id/image - Upload product image to OVH S3
  fastify.post('/v1/admin/products/:id/image', async (req, reply) => {
    const { id } = req.params as { id: string };
    const productId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const file = await req.file();
    if (!file) {
      return validationError(reply, { image: 'No image file uploaded' });
    }

    try {
      const buffer = await file.toBuffer();
      const imageUrl = await uploadImageToS3(buffer, file.mimetype, file.filename);

      const [updated] = await db
        .update(products)
        .set({ imageUrl, updatedAt: new Date() })
        .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
        .returning();

      if (!updated) {
        return notFound(reply, 'Product not found');
      }

      return success(reply, {
        id: updated.id,
        imageUrl: updated.imageUrl,
        image_url: updated.imageUrl,
      }, 'Image uploaded successfully');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to upload image to S3');
    }
  });

  // DELETE /v1/admin/products/:id/image - Remove product image
  fastify.delete('/v1/admin/products/:id/image', async (req, reply) => {
    const { id } = req.params as { id: string };
    const productId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    try {
      const [updated] = await db
        .update(products)
        .set({ imageUrl: null, updatedAt: new Date() })
        .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
        .returning();

      if (!updated) {
        return notFound(reply, 'Product not found');
      }

      return success(reply, { id: updated.id, imageUrl: null }, 'Image removed');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to remove image');
    }
  });
}
