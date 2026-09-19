import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redisConnection.on('error', (err) => {
  console.warn('[Worker:Redis Error]', err.message);
});

export const fiscalQueue = new Queue('fiscalization', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 3000, // 3s, 6s, 12s, 24s...
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});
