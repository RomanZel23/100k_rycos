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
  SUPABASE_URL: z.string().default(process.env.SUPABASE_URL || 'http://host.docker.internal:8000'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vc2FpcXR2YnVrZmJpZ3JucmlwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAxMTY1NCwiZXhwIjoyMDg2NTg3NjU0fQ.gESbCk2e8hE6lR0kHrDVfVDaHY8p1--g5_oEIUNB-tg'
  ),
  SUPABASE_STORAGE_BUCKET: z.string().default(process.env.SUPABASE_STORAGE_BUCKET || 'products'),
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
  // RYCOS MQTT Bridge (SBR-* and Fiscal Devices)
  RYCOS_MQTT_HOST: z.string().default(process.env.RYCOS_MQTT_HOST || 'rycos.eu'),
  RYCOS_MQTT_PORT: z.coerce.number().default(Number(process.env.RYCOS_MQTT_PORT) || 8883),
  RYCOS_MQTT_USERNAME: z.string().default(process.env.RYCOS_MQTT_USERNAME || 'rycos_portal'),
  RYCOS_MQTT_PASSWORD: z.string().default(process.env.RYCOS_MQTT_PASSWORD || 'Rycos$ala#'),
  RYCOS_DISPLAY_ID: z.string().default(process.env.RYCOS_DISPLAY_ID || 'SBT-NMLL2M'),
  // Deprecated OVH S3 Object Storage (Images now use local Supabase Storage)
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
