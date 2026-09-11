import { z } from 'zod';

export const FiscalItemSchema = z.object({
  nameItem: z.string().max(40),
  ptuCode: z.enum(['a', 'b', 'c', 'd', 'e', 'f', 'g']).default('a'),
  priceItem: z.number().int().positive(), // in grosze
  qty: z.number().positive().default(1),
  typeItem: z.string().default('GENERAL'),
  units: z.string().default('szt'),
});
export type FiscalItem = z.infer<typeof FiscalItemSchema>;

export const RycosFiscalPayloadSchema = z.object({
  header: z.object({
    externalrefFR: z.string().max(40),
    currency: z.string().default('PLN'),
    customerNIP: z.string().nullable().optional(),
  }),
  items: z.array(FiscalItemSchema),
  payment: z.array(
    z.object({
      paymentMethod: z.enum(['Cash', 'Card', 'Mobile', 'Transfer', 'Other']),
      amount: z.number().int().positive(), // in grosze
      currency: z.string().default('PLN'),
    })
  ),
  output: z.object({
    autoPrint: z.boolean().default(false),
    showQrScreen: z.boolean().default(false),
    returnQrCodeBase64: z.boolean().default(false),
  }),
});
export type RycosFiscalPayload = z.infer<typeof RycosFiscalPayloadSchema>;

export const FiscalResultSchema = z.object({
  success: z.boolean(),
  displayId: z.string(),
  receiptNumber: z.string().nullable().optional(),
  jpkId: z.string().nullable().optional(),
  jobId: z.string().nullable().optional(),
  pdfReceiptUrl: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
});
export type FiscalResult = z.infer<typeof FiscalResultSchema>;
