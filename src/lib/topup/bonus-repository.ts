import { randomUUID } from "crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/mysql";
import {
  calculateTopupBonus,
  emptyTopupBonusAward,
  roundTopupPoints,
  type TopupBonusAward,
  type TopupBonusRule,
} from "@/lib/topup/bonus";

type BonusRuleRow = RowDataPacket & {
  id: string;
  site_id: string;
  trigger_amount: number | string;
  bonus_points: number | string;
  is_active: number | boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

export type TopupBonusRuleRecord = TopupBonusRule & {
  createdBy: string | null;
  updatedBy: string | null;
};

export type TopupBonusRuleInput = {
  triggerAmount: number;
  bonusPoints: number;
  isActive: boolean;
};

function toIso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function toRecord(row: BonusRuleRow): TopupBonusRuleRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    triggerAmount: Number(row.trigger_amount),
    bonusPoints: Number(row.bonus_points),
    isActive: Boolean(row.is_active),
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function isMissingBonusTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_NO_SUCH_TABLE"
  );
}

export function isTopupBonusSchemaUnavailable(error: unknown): boolean {
  return isMissingBonusTableError(error);
}

export async function listTopupBonusRules(
  siteId: string,
  options: { activeOnly?: boolean } = {}
): Promise<TopupBonusRuleRecord[]> {
  const activeClause = options.activeOnly ? " AND is_active = 1" : "";
  const [rows] = await pool.execute<BonusRuleRow[]>(
    `SELECT id, site_id, trigger_amount, bonus_points, is_active,
            created_by, updated_by, created_at, updated_at
     FROM topup_bonus_rules
     WHERE site_id = ?${activeClause}
     ORDER BY trigger_amount ASC, created_at ASC, id ASC`,
    [siteId]
  );
  return rows.map(toRecord);
}

export async function getTopupBonusRule(
  siteId: string,
  id: string
): Promise<TopupBonusRuleRecord | null> {
  const [rows] = await pool.execute<BonusRuleRow[]>(
    `SELECT id, site_id, trigger_amount, bonus_points, is_active,
            created_by, updated_by, created_at, updated_at
     FROM topup_bonus_rules
     WHERE site_id = ? AND id = ?
     LIMIT 1`,
    [siteId, id]
  );
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function createTopupBonusRule(
  siteId: string,
  input: TopupBonusRuleInput,
  actorId: string | null
): Promise<TopupBonusRuleRecord> {
  const id = randomUUID();
  const now = new Date();
  await pool.execute(
    `INSERT INTO topup_bonus_rules (
       id, site_id, trigger_amount, bonus_points, is_active,
       created_by, updated_by, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      siteId,
      input.triggerAmount,
      roundTopupPoints(input.bonusPoints),
      input.isActive ? 1 : 0,
      actorId,
      actorId,
      now,
      now,
    ]
  );
  const created = await getTopupBonusRule(siteId, id);
  if (!created) throw new Error("Unable to read the created top-up bonus rule.");
  return created;
}

export async function updateTopupBonusRule(
  siteId: string,
  id: string,
  input: TopupBonusRuleInput,
  actorId: string | null
): Promise<TopupBonusRuleRecord> {
  const now = new Date();
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE topup_bonus_rules
     SET trigger_amount = ?, bonus_points = ?, is_active = ?,
         updated_by = ?, updated_at = ?
     WHERE site_id = ? AND id = ?`,
    [
      input.triggerAmount,
      roundTopupPoints(input.bonusPoints),
      input.isActive ? 1 : 0,
      actorId,
      now,
      siteId,
      id,
    ]
  );
  if (result.affectedRows !== 1) {
    throw new Error("ไม่พบกติกาโบนัสเติมเงินที่ต้องการแก้ไข");
  }
  const updated = await getTopupBonusRule(siteId, id);
  if (!updated) throw new Error("Unable to read the updated top-up bonus rule.");
  return updated;
}

export async function archiveTopupBonusRule(
  siteId: string,
  id: string,
  actorId: string | null
): Promise<void> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE topup_bonus_rules
     SET is_active = 0, updated_by = ?, updated_at = ?
     WHERE site_id = ? AND id = ?`,
    [actorId, new Date(), siteId, id]
  );
  if (result.affectedRows !== 1) {
    throw new Error("ไม่พบกติกาโบนัสเติมเงินที่ต้องการปิดใช้งาน");
  }
}

export async function deleteTopupBonusRule(
  siteId: string,
  id: string
): Promise<void> {
  const [result] = await pool.execute<ResultSetHeader>(
    `DELETE FROM topup_bonus_rules
     WHERE site_id = ? AND id = ?`,
    [siteId, id]
  );
  if (result.affectedRows !== 1) {
    throw new Error("ไม่พบกติกาโบนัสเติมเงินที่ต้องการลบ");
  }
}

/** Resolve and snapshot the award while the top-up request is locked. */
export async function resolveTopupBonus(
  connection: PoolConnection,
  siteId: string,
  amount: number
): Promise<TopupBonusAward> {
  try {
    const [rows] = await connection.execute<BonusRuleRow[]>(
      `SELECT id, site_id, trigger_amount, bonus_points, is_active,
              created_by, updated_by, created_at, updated_at
       FROM topup_bonus_rules
       WHERE site_id = ? AND is_active = 1
       ORDER BY trigger_amount ASC, created_at ASC, id ASC`,
      [siteId]
    );
    return calculateTopupBonus(
      amount,
      rows.map(toRecord)
    );
  } catch (error) {
    // If the table is the final missing piece of a staged migration, keep the
    // award at the legacy value; the additive request/history columns are still
    // required before this repository can complete a new top-up.
    if (isMissingBonusTableError(error)) return emptyTopupBonusAward(amount);
    throw error;
  }
}
