import { getDatabase, outboxEvents, eq, inArray, sql } from '@rycos/database';
import { fiscalQueue, notificationQueue } from '../queues/index.js';

let isRunning = false;

export async function dispatchOutboxBatch() {
  if (isRunning) return;
  isRunning = true;

  try {
    const db = getDatabase();

    // Select pending events using SKIP LOCKED (safe for multiple worker instances)
    const pendingEvents = await db.transaction(async (tx) => {
      const rows = await tx.execute(
        sql`SELECT id, aggregate_type, aggregate_id, event_type, payload
            FROM outbox_events
            WHERE status = 'pending'
            ORDER BY id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 50`
      );

      if (rows.length === 0) return [];

      const ids = rows.map((r: any) => r.id);
      await tx
        .update(outboxEvents)
        .set({ status: 'processing' })
        .where(inArray(outboxEvents.id, ids));

      return rows;
    });

    for (const evt of pendingEvents as any[]) {
      try {
        if (evt.event_type === 'order.fiscalize') {
          await fiscalQueue.add('fiscalize', {
            orderId: evt.payload.orderId,
            companyId: evt.payload.companyId,
          });
        } else {
          await notificationQueue.add(evt.event_type, evt.payload);
        }

        await db
          .update(outboxEvents)
          .set({ status: 'completed', processedAt: new Date() })
          .where(eq(outboxEvents.id, evt.id));
      } catch (err: any) {
        await db
          .update(outboxEvents)
          .set({
            status: 'failed',
            lastError: err.message,
            retryCount: sql`retry_count + 1`,
          })
          .where(eq(outboxEvents.id, evt.id));
      }
    }
  } catch (err) {
    console.error('[Outbox Dispatcher] Batch error:', err);
  } finally {
    isRunning = false;
  }
}

export function startOutboxDispatcher() {
  console.log('[Outbox Dispatcher] Started polling outbox_events (1s interval)');
  setInterval(dispatchOutboxBatch, 1000);
}
