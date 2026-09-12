import { z } from 'zod';

export const TerminalRoleSchema = z.enum([
  'all_in_one',
  'pos',
  'pickup',
  'kds',
  'kiosk',
  'fiscal_hub',
]);

export type TerminalRole = z.infer<typeof TerminalRoleSchema>;

export const TerminalCapabilitiesSchema = z.object({
  can_sell: z.boolean().default(true),
  can_kds: z.boolean().default(true),
  can_pickup: z.boolean().default(true),
  has_softpos: z.boolean().default(false),
  has_printer: z.boolean().default(false),
});

export type TerminalCapabilities = z.infer<typeof TerminalCapabilitiesSchema>;

export const WorkstationSchema = z.object({
  id: z.number(),
  terminal_id: z.string(),
  name: z.string(),
  role: TerminalRoleSchema.default('all_in_one'),
  location_id: z.number().nullable().optional(),
  location_name: z.string().nullable().optional(),
  assigned_brand_ids: z.array(z.number()).default([]),
  printer_device_id: z.string().nullable().optional(),
  tap_device_id: z.string().nullable().optional(),
  fiscal_device_id: z.string().nullable().optional(),
  capabilities: TerminalCapabilitiesSchema.optional(),
  config_json: z.record(z.any()).default({}),
  is_primary: z.boolean().default(false),
  status: z.string().default('active'),
  last_active: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export type Workstation = z.infer<typeof WorkstationSchema>;
