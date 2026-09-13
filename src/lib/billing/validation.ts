import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((value) => value || null).nullable().optional();

export const billingProfileSchema = z.object({
  fullName: optionalText(255),
  taxId: z
    .string()
    .trim()
    .regex(/^\d{13}$/, "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก")
    .nullable()
    .optional()
    .transform((value) => value || null),
  addressLine1: optionalText(1000),
  addressLine2: optionalText(1000),
  subdistrict: optionalText(255),
  district: optionalText(255),
  province: optionalText(255),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก")
    .nullable()
    .optional()
    .transform((value) => value || null),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+()\-\s]{8,25}$/, "รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง")
    .nullable()
    .optional()
    .transform((value) => value || null),
});

export type BillingProfileInput = z.infer<typeof billingProfileSchema>;
