import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/postgres'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  RYCOS_MQTT_HOST: z.string().default('rycos.eu'),
  RYCOS_MQTT_PORT: z.coerce.number().default(8883),
  RYCOS_MQTT_USERNAME: z.string().default('rycos_yallaorder'),
  RYCOS_MQTT_PASSWORD: z.string().default('Rycos$ala#'),
  RYCOS_DEFAULT_DISPLAY_ID: z.string().default('SBT-NMLL2M'),
});

export const env = envSchema.parse(process.env);
