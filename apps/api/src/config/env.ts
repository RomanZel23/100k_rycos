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
  SUPABASE_URL: z.string().default(process.env.SUPABASE_URL || 'http://localhost:8000'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
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
  // OVH S3 Object Storage (Images)
  S3_ENDPOINT: z.string().default(process.env.S3_ENDPOINT || 'https://s3.waw.io.cloud.ovh.net/'),
  S3_REGION: z.string().default(process.env.S3_REGION || 'waw'),
  S3_BUCKET: z.string().default(process.env.S3_BUCKET || 'yalla-images'),
  S3_ACCESS_KEY_ID: z.string().default(process.env.S3_ACCESS_KEY_ID || '96dca1604aed428090afc6ea349c966c'),
  S3_SECRET_ACCESS_KEY: z.string().default(process.env.S3_SECRET_ACCESS_KEY || 'eaa64fc5d7184b9bab9f91c65b1aba58'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
