import { Redis } from 'ioredis';
import { env } from './env.js';

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(env.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });

    redisInstance.on('error', (err) => {
      console.warn('[Redis Core Error]', err.message);
    });
  }
  return redisInstance;
}
