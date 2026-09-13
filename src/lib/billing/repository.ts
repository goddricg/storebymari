import type { RowDataPacket } from "mysql2/promise";

import pool from "@/lib/mysql";
import { getSiteId } from "@/lib/site";
import type { BillingProfileInput } from "@/lib/billing/validation";

export type BillingProfile = {
  siteId: string;
  userId: string;
  fullName: string | null;
  taxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type BillingRow = RowDataPacket & {
  site_id: string;
  user_id: string;
  full_name: string | null;
  tax_id: string | null;
  address_line1: string | null;
  address_line2: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postal_code: string | null;
  phone: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toBillingProfile(row: BillingRow): BillingProfile {
  return {
    siteId: row.site_id,
    userId: row.user_id,
    fullName: row.full_name,
    taxId: row.tax_id,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    subdistrict: row.subdistrict,
    district: row.district,
    province: row.province,
    postalCode: row.postal_code,
    phone: row.phone,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function getBillingProfile(
  userId: string,
  siteId = getSiteId(),
): Promise<BillingProfile | null> {
  const [rows] = await pool.execute<BillingRow[]>(
    `SELECT *
     FROM user_billing_profiles
     WHERE site_id = ? AND user_id = ?
     LIMIT 1`,
    [siteId, userId],
  );
  return rows[0] ? toBillingProfile(rows[0]) : null;
}

export async function upsertBillingProfile(
  userId: string,
  input: BillingProfileInput,
  siteId = getSiteId(),
): Promise<BillingProfile> {
  const now = new Date();
  await pool.execute(
    `INSERT INTO user_billing_profiles (
       site_id, user_id, full_name, tax_id, address_line1, address_line2,
       subdistrict, district, province, postal_code, phone, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       tax_id = VALUES(tax_id),
       address_line1 = VALUES(address_line1),
       address_line2 = VALUES(address_line2),
       subdistrict = VALUES(subdistrict),
       district = VALUES(district),
       province = VALUES(province),
       postal_code = VALUES(postal_code),
       phone = VALUES(phone),
       updated_at = VALUES(updated_at)`,
    [
      siteId,
      userId,
      input.fullName ?? null,
      input.taxId ?? null,
      input.addressLine1 ?? null,
      input.addressLine2 ?? null,
      input.subdistrict ?? null,
      input.district ?? null,
      input.province ?? null,
      input.postalCode ?? null,
      input.phone ?? null,
      now,
      now,
    ],
  );
  const profile = await getBillingProfile(userId, siteId);
  if (!profile) throw new Error("ไม่สามารถบันทึกข้อมูลสำหรับออกบิลได้");
  return profile;
}
