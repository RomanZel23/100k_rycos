import { FastifyInstance } from 'fastify';
import { CreateOrderRequestSchema, UpdateOrderStatusRequestSchema } from '@rycos/shared';
import { getDatabase, brands, eq } from '@rycos/database';
import { createOrder, getOrderById, updateOrderStatus, markOrderPaid } from '../services/orderEngine.js';
import { broadcastToStaff } from '../plugins/websocket.js';
import { requestTapPayment, cancelTapPayment } from '../services/terminalPaymentService.js';
import { fiscalizeOrder, printFiscalJob } from '../services/fiscalService.js';
import { verifyPinAndComplete, pickupChallenge, pickupConfirm } from '../services/pickupService.js';
import { requireStaffAuth, resolveAnyPrincipal, getCompanyId } from '../middleware/adminAuth.js';
import { sendHttpError } from '../lib/response.js';
import { rateLimit } from '../lib/rateLimit.js';

const CASH_LIKE_METHODS = new Set(['cash', 'card', 'terminal_tap', 'blik', 'voucher', 'other']);

export async function orderRoutes(fastify: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // PUBLIC (customer) endpoints
  // ---------------------------------------------------------------------------

  // POST /v1/orders - Place a new order (customer PWA or POS; POS identified by terminal token)
  fastify.post('/v1/orders', async (req, reply) => {
    const parseResult = CreateOrderRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parseResult.error.format() });
    }

    if (!(await rateLimit(`order:${req.ip}`, 60, 60))) {
      return reply.code(429).send({ error: 'Zbyt wiele zamówień z tego urządzenia. Spróbuj za chwilę.' });
    }

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const principal = await resolveAnyPrincipal(req).catch(() => null);

    try {
      const { order, isDuplicate } = await createOrder(parseResult.data, idempotencyKey, principal);
      return reply.code(isDuplicate ? 200 : 201).send({ data: order, duplicate: isDuplicate });
    } catch (err: any) {
      return sendHttpError(reply, err, 'Failed to create order');
    }
  });

  // GET /v1/orders/:id - Order tracker (UUID acts as the capability)
  fastify.get('/v1/orders/:id', async (req, reply) => {
    const params = req.params as { id: string };
    const order = await getOrderById(params.id);
    if (!order) return reply.code(404).send({ error: 'Order not found' });
    return reply.send({ data: order });
  });

  // POST /v1/orders/service-call - Customer calls waiter or requests bill (company derived from brand)
  fastify.post('/v1/orders/service-call', async (req, reply) => {
    const body = (req.body ?? {}) as {
      brandId?: number;
      tableLabel?: string;
      parkingSpot?: string;
      serviceType?: 'call_waiter' | 'request_bill' | 'custom';
      note?: string;
    };

    if (!body.tableLabel && !body.parkingSpot) {
      return reply.code(400).send({ error: 'tableLabel or parkingSpot is required' });
    }
    const brandId = Number(body.brandId);
    if (!Number.isFinite(brandId) || brandId <= 0) {
      return reply.code(400).send({ error: 'brandId is required' });
    }
    if (!(await rateLimit(`svc:${req.ip}`, 10, 60))) {
      return reply.code(429).send({ error: 'Zbyt wiele wezwań. Obsługa już została powiadomiona.' });
    }

    const [brand] = await getDatabase().select({ companyId: brands.companyId }).from(brands).where(eq(brands.id, brandId)).limit(1);
    if (!brand) return reply.code(404).send({ error: 'Brand not found' });

    const serviceType = ['call_waiter', 'request_bill', 'custom'].includes(String(body.serviceType)) ? body.serviceType : 'call_waiter';
    const event = {
      type: 'service_call' as const,
      data: {
        companyId: brand.companyId,
        brandId,
        tableLabel: body.tableLabel ? String(body.tableLabel).slice(0, 50) : undefined,
        parkingSpot: body.parkingSpot ? String(body.parkingSpot).slice(0, 50) : undefined,
        serviceType,
        note: body.note ? String(body.note).slice(0, 250) : undefined,
        timestamp: new Date().toISOString(),
      },
    };

    await broadcastToStaff(brand.companyId, event as any);
    return reply.send({ success: true, message: 'Service request sent to staff', data: event.data });
  });

  // ---------------------------------------------------------------------------
  // STAFF / DEVICE endpoints — require admin JWT or paired terminal token.
  // Company is ALWAYS taken from the authenticated principal, never from the body.
  // ---------------------------------------------------------------------------
  await fastify.register(async (staff) => {
    staff.addHook('preHandler', requireStaffAuth);

    const actorKey = (req: any) => String(req.user?.terminal_id || req.user?.id || req.ip);

    // POST /v1/pos/tap-payment - Charge an order on SBR-* / SoftPOS. Amount comes from the order.
    const tapPaymentHandler = async (req: any, reply: any) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const companyId = getCompanyId(req);
      const terminalId = req.user?.terminal_id || body.terminal_id || body.terminalId;
      const orderId = body.order_id ?? body.orderId;
      const clientAmount = body.amount_grosz ?? body.amountGrosz;

      if (!orderId) {
        return reply.code(400).send({ success: false, error: 'order_id jest wymagany — płatność kartą zawsze dotyczy zamówienia' });
      }

      try {
        const result = await requestTapPayment({
          companyId,
          terminalId,
          tapDeviceId: body.tap_device_id ?? body.tapDeviceId,
          orderId,
          clientAmountGrosz: clientAmount !== undefined ? Number(clientAmount) : undefined,
          currency: body.currency,
          reference: body.reference,
          idPay: body.id_pay ?? body.idPay,
        });

        if (!result.success) {
          return reply.code(402).send({
            success: false,
            result: result.result || 'WPI_RESULT_FAILURE',
            errorCondition: result.errorCondition,
            remark: result.remark || result.error || 'Płatność kartą odrzucona',
            error: result.remark || result.error || 'Płatność kartą odrzucona',
            displayId: result.displayId,
            idPay: result.idPay,
          });
        }

        // Fiscalize synchronously for the POS (safe: atomic claim shared with the worker)
        let fiscalData = null;
        try {
          fiscalData = await fiscalizeOrder({ orderId, autoPrint: body.auto_print ?? body.autoPrint ?? false, terminalId, companyId });
        } catch (fErr: any) {
          console.warn('[Tap Payment] Fiscalization deferred to worker:', fErr.message);
        }

        return reply.send({
          success: true,
          alreadyPaid: (result as any).alreadyPaid || false,
          result: result.result || 'WPI_RESULT_SUCCESS',
          paymentSolutionReference: result.paymentSolutionReference,
          brandName: result.brandName,
          idPay: result.idPay,
          displayId: result.displayId,
          order: await getOrderById(orderId),
          fiscal: fiscalData,
        });
      } catch (err: any) {
        return sendHttpError(reply, err, 'Błąd komunikacji z terminalem płatniczym', 500);
      }
    };
    staff.post('/v1/pos/tap-payment', tapPaymentHandler);
    staff.post('/pos_tap_payment', tapPaymentHandler);

    const tapPaymentCancelHandler = async (req: any, reply: any) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const idPay = body.id_pay ?? body.idPay;
      if (!idPay) return reply.code(400).send({ error: 'id_pay is required' });
      try {
        const res = await cancelTapPayment({
          companyId: getCompanyId(req),
          terminalId: req.user?.terminal_id || body.terminal_id || body.terminalId,
          tapDeviceId: body.tap_device_id ?? body.tapDeviceId,
          idPay,
        });
        return reply.send(res);
      } catch (err: any) {
        return sendHttpError(reply, err, 'Nie udało się anulować płatności', 500);
      }
    };
    staff.post('/v1/pos/tap-payment/cancel', tapPaymentCancelHandler);
    staff.post('/pos_tap_payment/cancel', tapPaymentCancelHandler);

    // POST /v1/pos/print-receipt - Print paper receipt on thermal printer (own company only)
    const printReceiptHandler = async (req: any, reply: any) => {
      const body = (req.body ?? {}) as Record<string, any>;
      try {
        const res = await printFiscalJob({
          orderId: body.order_id ?? body.orderId,
          companyId: getCompanyId(req),
          terminalId: req.user?.terminal_id || body.terminal_id || body.terminalId,
          printerDeviceId: body.printer_device_id ?? body.printerDeviceId,
          jobId: body.job_id ?? body.jobId,
        });
        return reply.send({ message: 'Wydruk przekazany do drukarki', ...res });
      } catch (err: any) {
        return sendHttpError(reply, err, 'Nie udało się wydrukować paragonu na drukarce termicznej');
      }
    };
    staff.post('/v1/pos/print-receipt', printReceiptHandler);
    staff.post('/print_fiscal_receipt', printReceiptHandler);

    // POST /v1/orders/:id/fiscalize - Manual (re)fiscalization of a PAID order
    staff.post('/v1/orders/:id/fiscalize', async (req: any, reply) => {
      const body = (req.body ?? {}) as { autoPrint?: boolean; repair?: boolean; terminalId?: string; terminal_id?: string };
      try {
        const res = await fiscalizeOrder({
          orderId: req.params.id,
          autoPrint: body.autoPrint,
          terminalId: req.user?.terminal_id || body.terminalId || body.terminal_id,
          companyId: getCompanyId(req),
          // A manual retry releases an order stuck in 'issued' with no receipt data at all
          repair: body.repair !== false,
        });
        return reply.send({ success: res.success, error: res.error, data: res });
      } catch (err: any) {
        return sendHttpError(reply, err, 'Błąd fiskalizacji zamówienia');
      }
    });

    // POST /v1/orders/:id/pay - Record a counter payment (cash / external card) & fiscalize
    staff.post('/v1/orders/:id/pay', async (req: any, reply) => {
      const body = (req.body ?? {}) as { paymentMethod?: string; autoPrint?: boolean };
      const method = String(body.paymentMethod || 'cash');
      if (!CASH_LIKE_METHODS.has(method)) {
        return reply.code(400).send({ error: `Nieobsługiwana metoda płatności przy kasie: ${method}` });
      }
      const companyId = getCompanyId(req);
      try {
        const { order } = await markOrderPaid(req.params.id, {
          method,
          terminalId: req.user?.terminal_id || null,
          companyId,
          actor: actorKey(req),
        });
        let fiscalData = null;
        try {
          fiscalData = await fiscalizeOrder({ orderId: req.params.id, autoPrint: body.autoPrint, terminalId: req.user?.terminal_id, companyId });
        } catch (fErr: any) {
          console.warn('[Orders Pay] Fiscalization deferred to worker:', fErr.message);
        }
        return reply.send({ data: order, fiscal: fiscalData, success: true });
      } catch (err: any) {
        return sendHttpError(reply, err, 'Failed to settle order payment');
      }
    });

    // PATCH /v1/orders/:id/status - Kitchen / pickup lifecycle (validated state machine)
    staff.patch('/v1/orders/:id/status', async (req: any, reply) => {
      const parseResult = UpdateOrderStatusRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.code(400).send({ error: 'Validation failed', details: parseResult.error.format() });
      }
      try {
        const order = await updateOrderStatus(req.params.id, parseResult.data.status, {
          reason: parseResult.data.cancellationReason,
          companyId: getCompanyId(req),
          actor: actorKey(req),
        });
        return reply.send({ data: order });
      } catch (err: any) {
        return sendHttpError(reply, err, 'Failed to update order status');
      }
    });

    // POST /v1/orders/verify-pin
    staff.post('/v1/orders/verify-pin', async (req: any, reply) => {
      try {
        const res = await verifyPinAndComplete({ ...(req.body ?? {}), companyId: getCompanyId(req), actorKey: actorKey(req) });
        return reply.send({ success: true, message: res.message, data: res.order });
      } catch (err: any) {
        return sendHttpError(reply, err, 'Nie udało się wydać zamówienia');
      }
    });

    // POST /v1/orders/pickup-challenge
    staff.post('/v1/orders/pickup-challenge', async (req: any, reply) => {
      try {
        const res = await pickupChallenge({ ...(req.body ?? {}), companyId: getCompanyId(req), actorKey: actorKey(req) });
        return reply.send({
          success: true,
          ...res,
          message: 'Kod QR poprawny! PIN został wyświetlony na telefonie klienta. Zapytaj klienta o PIN.',
        });
      } catch (err: any) {
        return sendHttpError(reply, err, 'Nie znaleziono zamówienia do wydania');
      }
    });

    // POST /v1/orders/pickup-confirm
    staff.post('/v1/orders/pickup-confirm', async (req: any, reply) => {
      try {
        const res = await pickupConfirm({ ...(req.body ?? {}), companyId: getCompanyId(req), actorKey: actorKey(req) });
        return reply.send({ success: true, message: res.message, data: res.order });
      } catch (err: any) {
        return sendHttpError(reply, err, 'Błąd finalizacji wydania zamówienia');
      }
    });
  });
}
