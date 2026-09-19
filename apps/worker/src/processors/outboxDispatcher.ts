import { getDatabase, outboxEvents, eq, sql, inArray } from '@rycos/database';
import { fiscalQueue } from '../queues/index.js';
import { env } from '../config/env.js';

let isRunning = false;

/**
 * Transactional outbox dispatcher.
 * - claims due 'pending' events with SKIP LOCKED (safe with many worker instances)
 * - reclaims events stuck in 'processing' (crash after claim) after 2 minutes
 * - failed dispatches are retried with exponential backoff up to OUTBOX_MAX_RETRIES
 * - events without a consumer are completed (not queued into a queue nobody reads)
 */
export async function dispatchOutboxBatch() {
  if (isRunning) return;
  isRunning = true;

  try {
    const db = getDatabase();

    const pendingEvents: any[] = await db.transaction(async (tx) => {
      const rows: any = await tx.execute(sql`
        SELECT id, aggregate_type, aggregate_id, event_type, payload, retry_count
        FROM outbox_events
        WHERE (status = 'pending' AND next_attempt_at <= now())
           OR (status = 'processing' AND (locked_at IS NULL OR locked_at < now() - interval '2 minutes'))
        ORDER BY id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 100
      `);
      if (rows.length === 0) return [];

      const ids = rows.map((r: any) => Number(r.id));
      await tx.update(outboxEvents).set({ status: 'processing', lockedAt: new Date() }).where(inArray(outboxEvents.id, ids));
      return rows;
    });

    for (const evt of pendingEvents) {
      try {
        if (evt.event_type === 'order.fiscalize') {
          // jobId = orderId → BullMQ de-duplicates concurrent fiscalization jobs for one order
          await fiscalQueue.add(
            'fiscalize',
            { orderId: evt.payload.orderId, companyId: evt.payload.companyId },
            { jobId: `fiscal-${evt.payload.orderId}` }
          );
        } else if (evt.event_type === 'order.refund_required') {
          console.warn(`[Outbox] REFUND REQUIRED for order ${evt.payload?.orderId}: ${evt.payload?.note || ''}`);
        }
        // other event types have no consumer yet — completing them keeps the table clean

        await db
          .update(outboxEvents)
          .set({ status: 'completed', processedAt: new Date(), lockedAt: null })
          .where(eq(outboxEvents.id, Number(evt.id)));
      } catch (err: any) {
        const retries = Number(evt.retry_count || 0) + 1;
        const giveUp = retries >= env.OUTBOX_MAX_RETRIES;
        const delaySeconds = Math.min(3600, 5 * 2 ** retries);
        await db
          .update(outboxEvents)
          .set({
            status: giveUp ? 'failed' : 'pending',
            lastError: String(err.message).slice(0, 2000),
            retryCount: retries,
            lockedAt: null,
            nextAttemptAt: sql`now() + make_interval(secs => ${delaySeconds})`,
          })
          .where(eq(outboxEvents.id, Number(evt.id)));
      }
    }
  } catch (err) {
    console.error('[Outbox Dispatcher] Batch error:', err);
  } finally {
    isRunning = false;
  }
}

/** Remove completed events older than 7 days (hourly). */
async function purgeCompleted() {
  try {
    await getDatabase().execute(sql`DELETE FROM outbox_events WHERE status = 'completed' AND processed_at < now() - interval '7 days'`);
  } catch (err: any) {
    console.warn('[Outbox] purge failed:', err.message);
  }
}

export function startOutboxDispatcher() {
  console.log('[Outbox Dispatcher] Started polling outbox_events (1s interval)');
  setInterval(dispatchOutboxBatch, 1000);
  setInterval(purgeCompleted, 3600 * 1000);
}
