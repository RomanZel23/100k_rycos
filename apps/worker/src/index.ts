import { env } from './config/env.js';
import { startFiscalWorker } from './processors/fiscalProcessor.js';
import { startOutboxDispatcher } from './processors/outboxDispatcher.js';

async function bootstrap() {
  console.log('⚡ [100k_rycos Worker] Starting background worker services...');
  console.log(`📡 [100k_rycos Worker] DATABASE target: ${env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`📡 [100k_rycos Worker] REDIS target: ${env.REDIS_URL.replace(/:[^:@]+@/, ':****@')}`);

  // Start BullMQ Fiscal Worker
  startFiscalWorker();

  // Start Outbox Poller / Dispatcher
  startOutboxDispatcher();

  console.log('✓ [100k_rycos Worker] All worker processors are active');
}

bootstrap().catch((err) => {
  console.error('Fatal worker error:', err);
  process.exit(1);
});
