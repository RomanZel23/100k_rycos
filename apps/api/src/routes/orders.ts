import { FastifyInstance } from 'fastify';
import { CreateOrderRequestSchema, UpdateOrderStatusRequestSchema } from '@rycos/shared';
import { getDatabase, orders, orderItems, eq, and, desc, sql } from '@rycos/database';
import { createOrder, getOrderById, updateOrderStatus, recordOrderPayment } from '../services/orderEngine.js';
import { broadcastToStaff, broadcastToOrder } from '../plugins/websocket.js';
import { requestTapPayment, cancelTapPayment } from '../services/terminalPaymentService.js';
import { fiscalizeOrder, printFiscalJob } from '../services/fiscalService.js';

export async function orderRoutes(fastify: FastifyInstance) {
  // POST /v1/orders - Place a new order
  fastify.post('/v1/orders', async (req, reply) => {
    const parseResult = CreateOrderRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    try {
      const { order, isDuplicate } = await createOrder(parseResult.data, idempotencyKey);
      const statusCode = isDuplicate ? 200 : 201;
      return reply.code(statusCode).send({ data: order, duplicate: isDuplicate });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Failed to create order' });
    }
  });

  // POST /v1/pos/tap-payment (and /pos_tap_payment) - Request Tap card payment on SBR-* terminal via MQTT
  const tapPaymentHandler = async (req: any, reply: any) => {
    const body = (req.body ?? {}) as {
      company_id?: number;
      companyId?: number;
      terminal_id?: string;
      terminalId?: string;
      tap_device_id?: string;
      tapDeviceId?: string;
      amount_grosz?: number;
      amountGrosz?: number;
      currency?: string;
      reference?: string;
      id_pay?: string;
      idPay?: string;
      order_id?: string;
      orderId?: string;
      auto_print?: boolean;
      autoPrint?: boolean;
    };

    const companyId = body.company_id ?? body.companyId;
    const terminalId = body.terminal_id ?? body.terminalId;
    const tapDeviceId = body.tap_device_id ?? body.tapDeviceId;
    const amountGrosz = body.amount_grosz ?? body.amountGrosz;
    const orderId = body.order_id ?? body.orderId;
    const idPay = body.id_pay ?? body.idPay;
    const autoPrint = body.auto_print ?? body.autoPrint ?? false;

    if (!amountGrosz || amountGrosz <= 0) {
      return reply.code(400).send({ error: 'amount_grosz must be a positive integer in grosze' });
    }

    try {
      const result = await requestTapPayment({
        companyId,
        terminalId,
        tapDeviceId,
        amountGrosz,
        currency: body.currency || 'PLN',
        reference: body.reference,
        idPay,
      });

      if (!result.success || result.result === 'WPI_RESULT_FAILURE') {
        return reply.code(402).send({
          success: false,
          result: result.result || 'WPI_RESULT_FAILURE',
          errorCondition: result.errorCondition,
          remark: result.remark || result.error || 'Płatność kartą odrzucona',
          displayId: result.displayId,
        });
      }

      // If linked to an order, settle payment and trigger fiscalization
      let updatedOrder = null;
      let fiscalData = null;
      if (orderId) {
        try {
          updatedOrder = await recordOrderPayment(orderId, 'card', terminalId);
          try {
            fiscalData = await fiscalizeOrder({
              orderId,
              autoPrint,
              terminalId,
            });
          } catch (fErr: any) {
            console.warn('[Tap Payment] Fiscalization warning:', fErr.message);
          }
        } catch (orderErr: any) {
          console.warn('[Tap Payment] Failed to record order payment:', orderErr);
        }
      }

      return reply.send({
        success: true,
        result: result.result || 'WPI_RESULT_SUCCESS',
        paymentSolutionReference: result.paymentSolutionReference,
        brandName: result.brandName,
        idPay: result.idPay,
        displayId: result.displayId,
        order: updatedOrder,
        fiscal: fiscalData,
      });
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message || 'Błąd komunikacji z terminalem płatniczym',
      });
    }
  };

  fastify.post('/v1/pos/tap-payment', tapPaymentHandler);
  fastify.post('/pos_tap_payment', tapPaymentHandler);

  // POST /v1/pos/tap-payment/cancel (and /pos_tap_payment/cancel)
  const tapPaymentCancelHandler = async (req: any, reply: any) => {
    const body = (req.body ?? {}) as {
      company_id?: number;
      companyId?: number;
      terminal_id?: string;
      terminalId?: string;
      tap_device_id?: string;
      tapDeviceId?: string;
      id_pay?: string;
      idPay?: string;
    };

    const idPay = body.id_pay ?? body.idPay;
    if (!idPay) {
      return reply.code(400).send({ error: 'id_pay is required' });
    }

    try {
      const res = await cancelTapPayment({
        companyId: body.company_id ?? body.companyId,
        terminalId: body.terminal_id ?? body.terminalId,
        tapDeviceId: body.tap_device_id ?? body.tapDeviceId,
        idPay,
      });
      return reply.send(res);
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message });
    }
  };

  fastify.post('/v1/pos/tap-payment/cancel', tapPaymentCancelHandler);
  fastify.post('/pos_tap_payment/cancel', tapPaymentCancelHandler);

  // POST /v1/pos/print-receipt (and /print_fiscal_receipt) - Print paper receipt on thermal printer SBR-*
  const printReceiptHandler = async (req: any, reply: any) => {
    const body = (req.body ?? {}) as {
      order_id?: string;
      orderId?: string;
      company_id?: number;
      companyId?: number;
      terminal_id?: string;
      terminalId?: string;
      printer_device_id?: string;
      printerDeviceId?: string;
      job_id?: string;
      jobId?: string;
    };

    const orderId = body.order_id ?? body.orderId;
    const companyId = body.company_id ?? body.companyId;
    const terminalId = body.terminal_id ?? body.terminalId;
    const printerDeviceId = body.printer_device_id ?? body.printerDeviceId;
    const jobId = body.job_id ?? body.jobId;

    try {
      const res = await printFiscalJob({
        orderId,
        companyId,
        terminalId,
        printerDeviceId,
        jobId,
      });
      return reply.send({ message: 'Wydruk przekazany do drukarki', ...res });
    } catch (err: any) {
      return reply.code(400).send({
        success: false,
        error: err.message || 'Nie udało się wydrukować paragonu na drukarce termicznej',
      });
    }
  };

  fastify.post('/v1/pos/print-receipt', printReceiptHandler);
  fastify.post('/print_fiscal_receipt', printReceiptHandler);

  // POST /v1/orders/:id/fiscalize - Manually or synchronously fiscalize order
  fastify.post('/v1/orders/:id/fiscalize', async (req, reply) => {
    const params = req.params as { id: string };
    const body = (req.body ?? {}) as { autoPrint?: boolean; terminalId?: string };

    try {
      const res = await fiscalizeOrder({
        orderId: params.id,
        autoPrint: body.autoPrint,
        terminalId: body.terminalId,
      });
      return reply.send({ success: true, data: res });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Błąd fiskalizacji zamówienia' });
    }
  });

  // POST /v1/orders/:id/pay - Settle payment & fiscalize
  fastify.post('/v1/orders/:id/pay', async (req, reply) => {
    const params = req.params as { id: string };
    const body = (req.body ?? {}) as { paymentMethod?: string; terminalId?: string; autoPrint?: boolean };

    try {
      const order = await recordOrderPayment(params.id, body.paymentMethod || 'cash', body.terminalId);
      let fiscalData = null;
      try {
        fiscalData = await fiscalizeOrder({
          orderId: params.id,
          autoPrint: body.autoPrint,
          terminalId: body.terminalId,
        });
      } catch (fErr: any) {
        console.warn('[Orders Pay] Fiscalization warning:', fErr.message);
      }

      return reply.send({ data: order, fiscal: fiscalData, success: true });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Failed to settle order payment' });
    }
  });

  // GET /v1/orders/:id - Get order details
  fastify.get('/v1/orders/:id', async (req, reply) => {
    const params = req.params as { id: string };
    const order = await getOrderById(params.id);

    if (!order) {
      return reply.code(404).send({ error: 'Order not found' });
    }

    return reply.send({ data: order });
  });

  // PATCH /v1/orders/:id/status - Update order status (Staff / KDS)
  fastify.patch('/v1/orders/:id/status', async (req, reply) => {
    const params = req.params as { id: string };
    const parseResult = UpdateOrderStatusRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    try {
      const order = await updateOrderStatus(params.id, parseResult.data.status, parseResult.data.cancellationReason);
      return reply.send({ data: order });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Failed to update order status' });
    }
  });

  // POST /v1/orders/service-call - Customer calls waiter or requests bill
  fastify.post('/v1/orders/service-call', async (req, reply) => {
    const body = (req.body ?? {}) as {
      companyId?: number;
      brandId?: number;
      tableLabel?: string;
      parkingSpot?: string;
      serviceType?: 'call_waiter' | 'request_bill' | 'custom';
      note?: string;
    };

    if (!body.tableLabel && !body.parkingSpot) {
      return reply.code(400).send({ error: 'tableLabel or parkingSpot is required' });
    }

    const companyId = body.companyId || 1;
    const event = {
      type: 'service_call' as const,
      data: {
        companyId,
        brandId: body.brandId,
        tableLabel: body.tableLabel,
        parkingSpot: body.parkingSpot,
        serviceType: body.serviceType || 'call_waiter',
        note: body.note,
        timestamp: new Date().toISOString(),
      },
    };

    await broadcastToStaff(companyId, event as any);

    return reply.send({
      success: true,
      message: 'Service request sent to staff',
      data: event.data,
    });
  });

  // POST /v1/orders/verify-pin - Staff / POS / KDS verification
  fastify.post('/v1/orders/verify-pin', async (req, reply) => {
    const db = getDatabase();
    let { orderId, orderNumber, pin, qrData, companyId } = (req.body ?? {}) as {
      orderId?: string;
      orderNumber?: number | string;
      pin?: string;
      qrData?: string;
      companyId?: number;
    };

    if (qrData && typeof qrData === 'string') {
      const parts = qrData.trim().split(':');
      if (parts.length === 2) {
        if (parts[0].length > 10) {
          orderId = parts[0];
        } else {
          orderNumber = parseInt(parts[0], 10);
        }
        pin = parts[1];
      } else if (parts.length === 1) {
        pin = parts[0];
      }
    }

    if (!pin) {
      return reply.code(400).send({ error: 'Wprowadź 4-cyfrowy PIN lub zeskanuj kod QR' });
    }

    const cleanPin = String(pin).trim();
    const effectiveCompanyId = companyId || 1;

    let targetOrder = null;
    if (orderId) {
      const [o] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.companyId, effectiveCompanyId), eq(orders.id, orderId)))
        .limit(1);
      targetOrder = o;
    } else if (orderNumber && !isNaN(Number(orderNumber))) {
      const [o] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.companyId, effectiveCompanyId), eq(orders.orderNumber, Number(orderNumber))))
        .limit(1);
      targetOrder = o;
    } else {
      const candidates = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.companyId, effectiveCompanyId),
            sql`${orders.status} IN ('ready_to_collect', 'in_progress', 'paid')`,
            eq(orders.collectionPin, cleanPin)
          )
        )
        .orderBy(desc(orders.createdAt))
        .limit(1);
      targetOrder = candidates[0];
    }

    if (!targetOrder) {
      return reply.code(404).send({ error: 'Nie znaleziono zamówienia pasującego do podanego PIN-u' });
    }

    if (targetOrder.collectionPin !== cleanPin) {
      return reply.code(400).send({ error: `Błędny PIN dla zamówienia #${targetOrder.orderNumber}` });
    }

    if (targetOrder.status === 'completed') {
      const completionTime = targetOrder.updatedAt
        ? new Date(targetOrder.updatedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
        : '';
      return reply.code(400).send({
        error: `⚠️ Zamówienie #${targetOrder.orderNumber} zostało już wcześniej odebrane / wydane${completionTime ? ` o godz. ${completionTime}` : ''}!`,
        alreadyCompleted: true,
      });
    }

    if (targetOrder.status === 'cancelled') {
      return reply.code(400).send({
        error: `⚠️ Zamówienie #${targetOrder.orderNumber} zostało anulowane i nie może zostać wydane!`,
        cancelled: true,
      });
    }

    if (targetOrder.status === 'pending_payment' || targetOrder.paymentStatus === 'pending') {
      return reply.code(400).send({
        error: `⚠️ Zamówienie #${targetOrder.orderNumber} nie zostało jeszcze opłacone!`,
        unpaid: true,
      });
    }

    try {
      const updated = await updateOrderStatus(targetOrder.id, 'completed');
      return reply.send({
        success: true,
        message: `Zamówienie #${targetOrder.orderNumber} zostało pomyślnie wydane!`,
        data: updated,
      });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Nie udało się wydać zamówienia' });
    }
  });

  // POST /v1/orders/pickup-challenge - Staff scans QR code -> Backend pushes challenge PIN to customer phone & returns order details to staff
  fastify.post('/v1/orders/pickup-challenge', async (req, reply) => {
    const db = getDatabase();
    let { orderId, orderNumber, qrData, companyId } = (req.body ?? {}) as {
      orderId?: string;
      orderNumber?: number | string;
      qrData?: string;
      companyId?: number;
    };

    if (qrData && typeof qrData === 'string') {
      const raw = qrData.trim();
      if (raw.startsWith('rycos:pickup:')) {
        orderId = raw.replace('rycos:pickup:', '').trim();
      } else if (raw.includes(':')) {
        const parts = raw.split(':');
        if (parts[0].length > 10) {
          orderId = parts[0];
        } else {
          orderNumber = parseInt(parts[0], 10);
        }
      } else {
        orderId = raw;
      }
    }

    const effectiveCompanyId = companyId || 1;

    let targetOrder = null;
    if (orderId) {
      const [o] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.companyId, effectiveCompanyId), eq(orders.id, orderId)))
        .limit(1);
      targetOrder = o;
    } else if (orderNumber && !isNaN(Number(orderNumber))) {
      const [o] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.companyId, effectiveCompanyId), eq(orders.orderNumber, Number(orderNumber))))
        .limit(1);
      targetOrder = o;
    }

    if (!targetOrder) {
      return reply.code(404).send({ error: 'Nie znaleziono zamówienia do wydania' });
    }

    if (targetOrder.status === 'completed') {
      return reply.code(400).send({
        error: `⚠️ Zamówienie #${targetOrder.orderNumber} zostało już wcześniej odebrane / wydane!`,
        alreadyCompleted: true,
        data: targetOrder,
      });
    }

    if (targetOrder.status === 'cancelled') {
      return reply.code(400).send({
        error: `⚠️ Zamówienie #${targetOrder.orderNumber} zostało anulowane i nie może zostać wydane!`,
        cancelled: true,
      });
    }

    if (targetOrder.status === 'pending_payment' || targetOrder.paymentStatus === 'pending') {
      return reply.code(400).send({
        error: `⚠️ Zamówienie #${targetOrder.orderNumber} nie zostało jeszcze opłacone!`,
        unpaid: true,
      });
    }

    const items = await db
      .select({
        id: orderItems.id,
        name: orderItems.name,
        quantity: orderItems.quantity,
        addons: orderItems.addonsJson,
        specialInstructions: orderItems.specialInstructions,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, targetOrder.id));

    // Push live challenge PIN to customer's order tracker via WebSocket
    await broadcastToOrder(targetOrder.id, {
      type: 'pickup.challenge',
      orderId: targetOrder.id,
      orderNumber: targetOrder.orderNumber,
      pin: targetOrder.collectionPin,
      timestamp: new Date().toISOString(),
    });

    return reply.send({
      success: true,
      challengeActive: true,
      order: {
        id: targetOrder.id,
        orderNumber: targetOrder.orderNumber,
        orderType: targetOrder.orderType,
        tableLabel: targetOrder.tableLabel,
        parkingSpot: targetOrder.parkingSpot,
        totalAmount: targetOrder.totalAmount,
        currency: targetOrder.currency,
        status: targetOrder.status,
        customerNote: targetOrder.customerNote,
        items,
      },
      message: `Kod QR poprawny! PIN został wygenerowany na telefonie klienta. Zapytaj klienta o PIN.`,
    });
  });

  // POST /v1/orders/pickup-confirm - Staff inputs the customer's PIN to finalize handover
  fastify.post('/v1/orders/pickup-confirm', async (req, reply) => {
    const db = getDatabase();
    const { orderId, pin, companyId } = (req.body ?? {}) as {
      orderId?: string;
      pin?: string;
      companyId?: number;
    };

    if (!orderId || !pin) {
      return reply.code(400).send({ error: 'orderId oraz pin są wymagane do potwierdzenia odbioru' });
    }

    const cleanPin = String(pin).trim();
    const effectiveCompanyId = companyId || 1;

    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.companyId, effectiveCompanyId), eq(orders.id, orderId)))
      .limit(1);

    if (!order) {
      return reply.code(404).send({ error: 'Nie znaleziono zamówienia' });
    }

    if (order.collectionPin !== cleanPin) {
      return reply.code(400).send({ error: `Nieprawidłowy PIN klienta dla zamówienia #${order.orderNumber}` });
    }

    if (order.status === 'completed') {
      return reply.code(400).send({
        error: `Zamówienie #${order.orderNumber} zostało już wcześniej wydane!`,
        alreadyCompleted: true,
      });
    }

    try {
      const updated = await updateOrderStatus(order.id, 'completed');

      // Notify customer tracker
      await broadcastToOrder(order.id, {
        type: 'order.status_updated',
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: 'completed',
          collectionPin: order.collectionPin,
        },
      });

      return reply.send({
        success: true,
        message: `Zamówienie #${order.orderNumber} zostało pomyślnie wydane!`,
        data: updated,
      });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message || 'Błąd finalizacji wydania zamówienia' });
    }
  });
}
