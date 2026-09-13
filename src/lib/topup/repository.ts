import { createHash, randomUUID } from "crypto";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import pool from "@/lib/mysql";
import {
  ErrorCodes,
  SlipVerificationError,
  type VerifySlipResponse,
} from "@/lib/slip/types";
import { getTopupFailureReason } from "@/lib/topup/history";
import {
  applyTopupBonusDailyLimit,
  emptyTopupBonusAward,
  roundTopupPoints,
  TOPUP_BONUS_DAILY_LIMIT,
  type TopupBonusAward,
} from "@/lib/topup/bonus";
import { resolveTopupBonus } from "@/lib/topup/bonus-repository";
import { createTopupCashReceiptWithinTransaction } from "@/lib/receipts/topup-repository";

const PROCESSING_WAIT_MS = 5_000;
const PROCESSING_POLL_MS = 50;
const PROCESSING_LEASE_MS = 10 * 60_000;

type TopupRequestRow = RowDataPacket & {
  id: string;
  site_id: string;
  user_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  status: string;
  processing_token: string;
  lease_expires_at: Date | string | null;
  transaction_id: string | null;
  amount: number | string | null;
  bonus_rule_id: string | null;
  bonus_points: number | string | null;
  credited_points: number | string | null;
  bonus_award_finalized: number | boolean | null;
  verified_qr_payload: string | null;
  verified_at: Date | string | null;
  response_status: number | null;
  saved_response: string | null;
  failure_reason: string | null;
  created_at: Date | string;
};

type BonusUsageRow = RowDataPacket & {
  bonus_usage_count: number | string | null;
};

function isBonusAwardFinalized(value: number | boolean | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  return Boolean(Number(value));
}

function getBangkokDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function getBangkokDayRange(value: Date): { start: Date; end: Date } {
  const start = new Date(`${getBangkokDateKey(value)}T00:00:00.000+07:00`);
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
}

async function countDailyTopupBonusUses(
  connection: PoolConnection,
  input: {
    siteId: string;
    userId: string;
    bonusRuleId: string;
    completedAt: Date;
  },
): Promise<number> {
  const { start, end } = getBangkokDayRange(input.completedAt);
  const [rows] = await connection.execute<BonusUsageRow[]>(
    `SELECT COUNT(*) AS bonus_usage_count
     FROM slip_history
     WHERE site_id = ?
       AND user_id = ?
       AND bonus_rule_id = ?
       AND status = 'success'
       AND source_type = 'SYSTEM'
       AND bonus_points > 0
       AND created_at >= ?
       AND created_at < ?`,
    [input.siteId, input.userId, input.bonusRuleId, start, end],
  );
  const count = Number(rows[0]?.bonus_usage_count ?? 0);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

export type TopupExistingDecision =
  | { kind: "conflict" }
  | { kind: "processing" }
  | { kind: "replay"; status: number; body: VerifySlipResponse };

export type TopupClaimResult =
  | {
      kind: "claimed";
      requestId: string;
      processingToken: string;
      verified: VerifiedTopupSnapshot | null;
    }
  | { kind: "existing"; decision: TopupExistingDecision };

export type VerifiedTopupSnapshot = {
  transactionId: string;
  amount: number;
  qrPayload: string;
  bonusRuleId: string | null;
  bonusPoints: number;
  creditedPoints: number;
};

export type VerifiedTopupResult = {
  currentPoints: number;
  pointsAdded: number;
  transactionAmount: number;
  topupAmount: number;
  bonusPoints: number;
  creditedPoints: number;
  topupReceiptId: string;
  topupReceiptNo: string;
  replayed: boolean;
};

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

function parseSavedResponse(value: string | null): VerifySlipResponse | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as VerifySlipResponse;
    return typeof parsed.success === "boolean" ? parsed : null;
  } catch {
    return null;
  }
}

function verifiedSnapshotFromRow(row: TopupRequestRow): VerifiedTopupSnapshot | null {
  if (
    !row.verified_at ||
    !row.transaction_id ||
    row.amount === null ||
    row.verified_qr_payload === null
  ) {
    return null;
  }

  const amount = Number(row.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    transactionId: row.transaction_id,
    amount,
    qrPayload: row.verified_qr_payload,
    bonusRuleId: row.bonus_rule_id ?? null,
    bonusPoints: Number(row.bonus_points ?? 0),
    creditedPoints: Number(row.credited_points ?? amount),
  };
}

function leaseExpired(value: Date | string | null): boolean {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

function nextClaim() {
  const now = new Date();
  return {
    requestId: randomUUID(),
    processingToken: randomUUID(),
    now,
    leaseExpiresAt: new Date(now.getTime() + PROCESSING_LEASE_MS),
  };
}

function decisionForRow(row: TopupRequestRow, requestFingerprint: string): TopupExistingDecision {
  if (row.request_fingerprint !== requestFingerprint) {
    return { kind: "conflict" };
  }

  if (row.status === "SUCCEEDED" && row.response_status) {
    const body = parseSavedResponse(row.saved_response);
    if (body) {
      return { kind: "replay", status: row.response_status, body };
    }
  }

  return { kind: "processing" };
}

async function findTopupRequest(
  siteId: string,
  userId: string,
  idempotencyKey: string
): Promise<TopupRequestRow | null> {
  const [rows] = await pool.execute<TopupRequestRow[]>(
    `SELECT *
     FROM topup_requests
     WHERE site_id = ? AND user_id = ? AND idempotency_key = ?
     LIMIT 1`,
    [siteId, userId, idempotencyKey]
  );
  return rows[0] ?? null;
}

export function createTopupFingerprint(fileBytes: Uint8Array): string {
  return createHash("sha256").update(fileBytes).digest("hex");
}

export function resolveTopupIdempotencyKey(input: {
  headerKey: string | null;
  requestFingerprint: string;
}): { key: string; isLegacy: boolean } {
  const headerKey = input.headerKey?.trim();
  if (headerKey) {
    return { key: headerKey, isLegacy: false };
  }

  return {
    key: `slip-${input.requestFingerprint}`,
    isLegacy: true,
  };
}

export async function assertTopupBuyerActive(input: {
  siteId: string;
  userId: string;
}): Promise<void> {
  const [rows] = await pool.execute<
    (RowDataPacket & { id: string; is_active: number | boolean })[]
  >(
    `SELECT id, is_active
     FROM users
     WHERE id = ? AND site_id = ?
     LIMIT 1`,
    [input.userId, input.siteId]
  );
  const user = rows[0];
  if (!user || user.is_active === 0 || user.is_active === false) {
    throw new SlipVerificationError(
      "Buyer account is unavailable.",
      ErrorCodes.UNAUTHORIZED,
      401
    );
  }
}

export async function claimTopupRequest(input: {
  siteId: string;
  userId: string;
  idempotencyKey: string;
  requestFingerprint: string;
}): Promise<TopupClaimResult> {
  const claim = nextClaim();

  try {
    await pool.execute(
      `INSERT INTO topup_requests (
         id, site_id, user_id, idempotency_key, request_fingerprint,
         status, processing_token, lease_expires_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'PROCESSING', ?, ?, ?, ?)`,
      [
        claim.requestId,
        input.siteId,
        input.userId,
        input.idempotencyKey,
        input.requestFingerprint,
        claim.processingToken,
        claim.leaseExpiresAt,
        claim.now,
        claim.now,
      ]
    );
    return {
      kind: "claimed",
      requestId: claim.requestId,
      processingToken: claim.processingToken,
      verified: null,
    };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }

  const existing = await findTopupRequest(
    input.siteId,
    input.userId,
    input.idempotencyKey
  );
  if (!existing) {
    return { kind: "existing", decision: { kind: "processing" } };
  }

  const initialDecision = decisionForRow(existing, input.requestFingerprint);
  if (initialDecision.kind === "conflict" || initialDecision.kind === "replay") {
    return { kind: "existing", decision: initialDecision };
  }

  if (existing.status === "PROCESSING" && leaseExpired(existing.lease_expires_at)) {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE topup_requests
       SET processing_token = ?, lease_expires_at = ?, updated_at = ?
       WHERE id = ? AND request_fingerprint = ? AND status = 'PROCESSING'
         AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
      [
        claim.processingToken,
        claim.leaseExpiresAt,
        claim.now,
        existing.id,
        input.requestFingerprint,
        claim.now,
      ]
    );
    if (result.affectedRows === 1) {
      return {
        kind: "claimed",
        requestId: existing.id,
        processingToken: claim.processingToken,
        verified: verifiedSnapshotFromRow(existing),
      };
    }
  }

  if (existing.status === "FAILED") {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE topup_requests
       SET status = 'PROCESSING', processing_token = ?, lease_expires_at = ?,
           response_status = NULL, saved_response = NULL, error_code = NULL,
           failure_reason = NULL,
           updated_at = ?
       WHERE id = ? AND request_fingerprint = ? AND status = 'FAILED'`,
      [
        claim.processingToken,
        claim.leaseExpiresAt,
        claim.now,
        existing.id,
        input.requestFingerprint,
      ]
    );
    if (result.affectedRows === 1) {
      return {
        kind: "claimed",
        requestId: existing.id,
        processingToken: claim.processingToken,
        verified: verifiedSnapshotFromRow(existing),
      };
    }
  }

  return { kind: "existing", decision: { kind: "processing" } };
}

export async function waitForTopupRequest(input: {
  siteId: string;
  userId: string;
  idempotencyKey: string;
  requestFingerprint: string;
}): Promise<TopupExistingDecision> {
  const deadline = Date.now() + PROCESSING_WAIT_MS;
  while (Date.now() < deadline) {
    const existing = await findTopupRequest(
      input.siteId,
      input.userId,
      input.idempotencyKey
    );
    if (!existing) return { kind: "processing" };
    const decision = decisionForRow(existing, input.requestFingerprint);
    if (decision.kind === "conflict" || decision.kind === "replay") {
      return decision;
    }
    await new Promise((resolve) => setTimeout(resolve, PROCESSING_POLL_MS));
  }
  return { kind: "processing" };
}

export async function markTopupRequestFailed(input: {
  requestId: string;
  processingToken: string;
  status: number;
  body: VerifySlipResponse;
  errorCode?: string;
}): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [requestRows] = await connection.execute<TopupRequestRow[]>(
      `SELECT id, site_id, user_id, idempotency_key, request_fingerprint,
              transaction_id, amount, status, processing_token, created_at
       FROM topup_requests
       WHERE id = ? AND processing_token = ? AND status = 'PROCESSING'
       LIMIT 1
       FOR UPDATE`,
      [input.requestId, input.processingToken]
    );
    const requestRow = requestRows[0];
    if (!requestRow) {
      await connection.commit();
      return;
    }

    const now = new Date();
    const failureReason = getTopupFailureReason(input.errorCode, input.body.error);
    await connection.execute(
      `INSERT INTO topup_attempt_history (
         id, request_id, site_id, user_id, idempotency_key, request_fingerprint,
         transaction_id, amount, status, response_status, error_code, failure_reason,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'FAILED', ?, ?, ?, ?)`,
      [
        randomUUID(),
        requestRow.id,
        requestRow.site_id,
        requestRow.user_id,
        requestRow.idempotency_key,
        requestRow.request_fingerprint,
        requestRow.transaction_id,
        requestRow.amount,
        input.status,
        input.errorCode ?? null,
        failureReason,
        now,
      ]
    );

    await connection.execute(
      `UPDATE topup_requests
       SET status = 'FAILED', response_status = ?, saved_response = ?, error_code = ?,
           failure_reason = ?, lease_expires_at = NULL, updated_at = ?
       WHERE id = ? AND processing_token = ? AND status = 'PROCESSING'`,
      [
        input.status,
        JSON.stringify(input.body),
        input.errorCode ?? null,
        failureReason,
        now,
        input.requestId,
        input.processingToken,
      ]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function saveVerifiedTopup(input: {
  requestId: string;
  processingToken: string;
  transactionId: string;
  amount: number;
  qrPayload: string;
}): Promise<void> {
  const verifiedAt = new Date();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [requestRows] = await connection.execute<TopupRequestRow[]>(
      `SELECT *
       FROM topup_requests
       WHERE id = ? AND processing_token = ? AND status = 'PROCESSING'
       LIMIT 1
       FOR UPDATE`,
      [input.requestId, input.processingToken]
    );
    const requestRow = requestRows[0];
    if (!requestRow) {
      throw new Error("Top-up request is no longer active.");
    }

    // Once a provider result has been journaled, keep its award snapshot stable
    // across retries even if an admin edits the matching rule in the meantime.
    const hasAwardSnapshot =
      isBonusAwardFinalized(requestRow.bonus_award_finalized) &&
      requestRow.credited_points !== null;
    const award: TopupBonusAward = hasAwardSnapshot
      ? {
          ruleId: requestRow.bonus_rule_id ?? null,
          bonusPoints: Number(requestRow.bonus_points ?? 0),
          creditedPoints: Number(requestRow.credited_points ?? input.amount),
        }
      : await resolveTopupBonus(connection, requestRow.site_id, input.amount);

    await connection.execute(
      `UPDATE topup_requests
       SET transaction_id = ?, amount = ?, bonus_rule_id = ?, bonus_points = ?,
           credited_points = ?, bonus_award_finalized = 0,
           verified_qr_payload = ?, verified_at = ?,
           updated_at = ?
       WHERE id = ? AND processing_token = ? AND status = 'PROCESSING'`,
      [
        input.transactionId,
        input.amount,
        award.ruleId,
        award.bonusPoints,
        award.creditedPoints,
        input.qrPayload,
        verifiedAt,
        verifiedAt,
        input.requestId,
        input.processingToken,
      ]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function insertSlipHistory(
  connection: PoolConnection,
  input: {
    id: string;
    userId: string;
    siteId: string;
    transactionId: string;
    amount: number;
    bonusRuleId?: string | null;
    bonusPoints?: number;
    creditedPoints?: number;
    qrPayload: string;
    createdAt: Date;
    sourceType?: "SYSTEM" | "ADMIN";
    sourceUserId?: string | null;
    sourceLabel?: string | null;
    sourceEmail?: string | null;
    note?: string | null;
  }
): Promise<void> {
  await connection.execute(
    `INSERT INTO slip_history (
       id, user_id, transaction_id, amount, bonus_rule_id, bonus_points,
       credited_points, qr_payload, status,
       site_id, source_type, source_user_id, source_label, source_email, note,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.userId,
      input.transactionId,
      input.amount,
      input.bonusRuleId ?? null,
      input.bonusPoints ?? 0,
      input.creditedPoints ?? roundTopupPoints(input.amount + (input.bonusPoints ?? 0)),
      input.qrPayload,
      input.siteId,
      input.sourceType ?? "SYSTEM",
      input.sourceUserId ?? null,
      input.sourceLabel ?? null,
      input.sourceEmail ?? null,
      input.note ?? null,
      input.createdAt,
      input.createdAt,
    ]
  );
}

export async function insertManualTopupHistory(
  connection: PoolConnection,
  input: {
    userId: string;
    siteId: string;
    amount: number;
    createdAt?: Date;
    sourceUserId?: string | null;
    sourceLabel?: string | null;
    sourceEmail?: string | null;
    note?: string | null;
  }
): Promise<string> {
  const createdAt = input.createdAt ?? new Date();
  const id = randomUUID();
  const transactionId = `manual-${id}`;
  await insertSlipHistory(connection, {
    id,
    userId: input.userId,
    siteId: input.siteId,
    transactionId,
    amount: input.amount,
    bonusRuleId: null,
    bonusPoints: 0,
    creditedPoints: input.amount,
    qrPayload: "manual",
    createdAt,
    sourceType: "ADMIN",
    sourceUserId: input.sourceUserId ?? null,
    sourceLabel: input.sourceLabel ?? null,
    sourceEmail: input.sourceEmail ?? null,
    note: input.note ?? "พ้อยท์ถูกเติมเงินสำเร็จผ่าน Admin",
  });
  await createTopupCashReceiptWithinTransaction(connection, {
    siteId: input.siteId,
    topupRequestId: id,
    transactionId,
    buyerUserId: input.userId,
    issuedAt: createdAt,
    amountPaid: input.amount,
    basePoints: input.amount,
    bonusPoints: 0,
    creditedPoints: input.amount,
    bonusRuleId: null,
  });
  return id;
}

export function shouldRecordManualTopupHistory(targetIsAdmin: boolean): boolean {
  return !targetIsAdmin;
}

export async function completeVerifiedTopup(input: {
  requestId: string;
  processingToken: string;
  siteId: string;
  userId: string;
  transactionId: string;
  amount: number;
  qrPayload: string;
  minimumAmount: number;
  message: string;
  completedAt?: Date;
}): Promise<VerifiedTopupResult & { body: VerifySlipResponse }> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [requestRows] = await connection.execute<TopupRequestRow[]>(
      `SELECT *
       FROM topup_requests
       WHERE id = ? AND processing_token = ?
       LIMIT 1
       FOR UPDATE`,
      [input.requestId, input.processingToken]
    );
    const requestRow = requestRows[0];
    if (!requestRow || requestRow.status !== "PROCESSING") {
      throw new Error("Top-up request is no longer active.");
    }

    if (requestRow.site_id !== input.siteId || requestRow.user_id !== input.userId) {
      throw new Error("Top-up request ownership does not match the current buyer.");
    }

    const currentAmount = Number(requestRow.amount ?? input.amount);
    if (!Number.isFinite(currentAmount) || currentAmount <= 0) {
      throw new SlipVerificationError(
        "The verified amount is invalid.",
        ErrorCodes.INVALID_AMOUNT
      );
    }

    // New provider results keep a persisted rule/bonus candidate, then the
    // daily quota is finalized only inside the balance transaction. Legacy
    // requests without an award snapshot remain intentionally bonus-free.
    const awardIsFinalized = isBonusAwardFinalized(requestRow.bonus_award_finalized);
    const storedBonusPoints = Number(requestRow.bonus_points ?? 0);
    let award: TopupBonusAward =
      Number.isFinite(storedBonusPoints) &&
      (requestRow.credited_points !== null || requestRow.bonus_rule_id !== null)
        ? {
            ruleId: requestRow.bonus_rule_id ?? null,
            bonusPoints: storedBonusPoints,
            creditedPoints: Number(
              requestRow.credited_points ?? currentAmount + storedBonusPoints,
            ),
          }
        : emptyTopupBonusAward(currentAmount);
    const transactionId = requestRow.transaction_id ?? input.transactionId;
    const qrPayload = requestRow.verified_qr_payload ?? input.qrPayload;

    // Serialize all balance completions for the same buyer before probing for
    // a missing transaction row. This keeps the quota read and history insert
    // in one deterministic lock order during concurrent top-ups.
    const [userRows] = await connection.execute<
      (RowDataPacket & {
        id: string;
        points: number | string | null;
        is_active: number | boolean;
      })[]
    >(
      `SELECT id, points, is_active
       FROM users
       WHERE id = ? AND site_id = ?
       LIMIT 1
       FOR UPDATE`,
      [input.userId, input.siteId]
    );
    const userRow = userRows[0];
    if (!userRow || userRow.is_active === 0 || userRow.is_active === false) {
      throw new SlipVerificationError(
        "Buyer account is unavailable.",
        ErrorCodes.UNAUTHORIZED,
        401
      );
    }

    const [historyRows] = await connection.execute<
      (RowDataPacket & {
        id: string;
        user_id: string | null;
        amount: number | string;
        bonus_rule_id: string | null;
        bonus_points: number | string | null;
        credited_points: number | string | null;
        status: string;
        created_at: Date | string | null;
      })[]
    >(
      `SELECT id, user_id, amount, bonus_rule_id, bonus_points, credited_points, status, created_at
       FROM slip_history
       WHERE transaction_id = ? AND site_id = ?
       LIMIT 1
       FOR UPDATE`,
      [transactionId, input.siteId]
    );
    const existingHistory = historyRows[0];

    let bonusUsageCount: number | null = null;
    let bonusLimitReached = false;
    const completionNow = input.completedAt ?? new Date();
    if (
      !existingHistory &&
      !awardIsFinalized &&
      award.ruleId &&
      award.bonusPoints > 0
    ) {
      const priorUsageCount = await countDailyTopupBonusUses(connection, {
        siteId: input.siteId,
        userId: input.userId,
        bonusRuleId: award.ruleId,
        completedAt: completionNow,
      });
      const limitedAward = applyTopupBonusDailyLimit(
        award,
        priorUsageCount,
        TOPUP_BONUS_DAILY_LIMIT,
      );
      award = limitedAward.award;
      bonusUsageCount = limitedAward.bonusUsesToday;
      bonusLimitReached = limitedAward.bonusLimitReached;
    }

    let pointsAdded = award.creditedPoints;
    let bonusPoints = award.bonusPoints;
    let creditedPoints = award.creditedPoints;
    let appliedRuleId = award.ruleId;
    let topupAmount = currentAmount;
    let replayed = false;
    if (existingHistory) {
      if (existingHistory.user_id !== input.userId || existingHistory.status !== "success") {
        throw new SlipVerificationError(
          "This slip has already been used.",
          ErrorCodes.DUPLICATE_SLIP
        );
      }
      topupAmount = Number(existingHistory.amount);
      bonusPoints = Number(existingHistory.bonus_points ?? 0);
      creditedPoints = Number(
        existingHistory.credited_points ?? topupAmount + bonusPoints
      );
      pointsAdded = creditedPoints;
      appliedRuleId = existingHistory.bonus_rule_id ?? null;
      replayed = true;
    } else {
      const [updateResult] = await connection.execute<ResultSetHeader>(
        `UPDATE users
         SET points = COALESCE(points, 0) + ?,
             total_topup_amount = COALESCE(total_topup_amount, 0) + ?,
             topup_count = COALESCE(topup_count, 0) + 1,
         last_topup_at = ?,
         updated_at = ?
         WHERE id = ? AND site_id = ?`,
        [
          creditedPoints,
          topupAmount,
          completionNow,
          completionNow,
          input.userId,
          input.siteId,
        ]
      );
      if (updateResult.affectedRows !== 1) {
        throw new Error("Unable to update the user balance.");
      }

      await insertSlipHistory(connection, {
        id: randomUUID(),
        userId: input.userId,
        siteId: input.siteId,
        transactionId,
        amount: topupAmount,
        bonusRuleId: appliedRuleId,
        bonusPoints,
        creditedPoints,
        qrPayload,
        createdAt: completionNow,
        sourceType: "SYSTEM",
        note:
          bonusLimitReached
            ? `พ้อยท์ถูกเติมเงินสำเร็จผ่านระบบ โบนัสโปรโมชั่นนี้ใช้ครบ ${TOPUP_BONUS_DAILY_LIMIT} ครั้งต่อวันแล้ว`
            : bonusPoints > 0
              ? `พ้อยท์ถูกเติมเงินสำเร็จผ่านระบบ รวมโบนัส ${bonusPoints.toLocaleString()} พ้อยท์`
              : "พ้อยท์ถูกเติมเงินสำเร็จผ่านระบบ",
      });
    }

    const currentPoints = Number(userRow.points ?? 0) + (replayed ? 0 : creditedPoints);
    const parsedHistoryCreatedAt = existingHistory?.created_at
      ? new Date(existingHistory.created_at)
      : null;
    const receiptIssuedAt = parsedHistoryCreatedAt && Number.isFinite(parsedHistoryCreatedAt.getTime())
      ? parsedHistoryCreatedAt
      : completionNow;
    const topupReceipt = await createTopupCashReceiptWithinTransaction(connection, {
      siteId: input.siteId,
      topupRequestId: input.requestId,
      transactionId,
      buyerUserId: input.userId,
      issuedAt: receiptIssuedAt,
      amountPaid: topupAmount,
      basePoints: topupAmount,
      bonusPoints,
      creditedPoints,
      bonusRuleId: appliedRuleId,
    });
    const successMessage =
      bonusLimitReached
        ? `เติมเงินสำเร็จ! จำนวน ${topupAmount.toFixed(2)} บาท ได้รับ ${topupAmount.toLocaleString()} พ้อยท์ (โปรโมชั่นนี้รับโบนัสครบ ${TOPUP_BONUS_DAILY_LIMIT} ครั้งในวันนี้แล้ว)`
        : bonusPoints > 0
        ? `เติมเงินสำเร็จ! จำนวน ${topupAmount.toFixed(2)} บาท ได้รับ ${topupAmount.toLocaleString()} พ้อยท์ + โบนัส ${bonusPoints.toLocaleString()} พ้อยท์ รวม ${creditedPoints.toLocaleString()} พ้อยท์`
        : input.message;
    const body: VerifySlipResponse = {
      success: true,
      data: {
        message: successMessage,
        pointsAdded: creditedPoints,
        currentPoints,
        transactionAmount: topupAmount,
        topupAmount,
        bonusPoints,
        creditedPoints,
        topupReceiptId: topupReceipt.id,
        topupReceiptNo: topupReceipt.receiptNo,
        minimumAmount: input.minimumAmount,
        ...(bonusUsageCount !== null
          ? {
              bonusUsageCount,
              bonusDailyLimit: TOPUP_BONUS_DAILY_LIMIT,
            }
          : {}),
        ...(bonusLimitReached ? { bonusLimitReached: true } : {}),
      },
    };

    await connection.execute(
      `UPDATE topup_requests
       SET status = 'SUCCEEDED', response_status = 200, saved_response = ?,
           transaction_id = ?, amount = ?, bonus_rule_id = ?, bonus_points = ?,
           credited_points = ?, bonus_award_finalized = 1,
           verified_qr_payload = COALESCE(verified_qr_payload, ?),
           verified_at = COALESCE(verified_at, ?),
           lease_expires_at = NULL, updated_at = ?
       WHERE id = ? AND processing_token = ? AND status = 'PROCESSING'`,
      [
        JSON.stringify(body),
        transactionId,
        topupAmount,
        appliedRuleId,
        bonusPoints,
        creditedPoints,
        qrPayload,
        completionNow,
        completionNow,
        input.requestId,
        input.processingToken,
      ]
    );

    await connection.commit();
    return {
      ...body.data!,
      pointsAdded,
      topupReceiptId: topupReceipt.id,
      topupReceiptNo: topupReceipt.receiptNo,
      replayed,
      body,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
