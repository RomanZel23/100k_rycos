import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/postgres'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SUPABASE_JWT_SECRET: z.string().optional(),
  CORS_ORIGIN: z.string().default('*'),
  // Saferpay Payment Gateway
  SAFERPAY_CUSTOMER_ID: z.string().default('278134'),
  SAFERPAY_TERMINAL_ID: z.string().default('17770989'),
  SAFERPAY_API_USERNAME: z.string().default('API_278134_98615439'),
  SAFERPAY_API_PASSWORD: z.string().default('RomanTest100krycos'),
  SAFERPAY_TEST_MODE: z.coerce.boolean().default(true),
  // Public URLs for redirects and notifications
  PUBLIC_API_URL: z.string().default('https://100k-api.rycos.eu'),
  PUBLIC_CUSTOMER_URL: z.string().default('https://100k.rycos.eu'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
