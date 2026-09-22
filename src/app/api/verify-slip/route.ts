import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

import { requireUser } from "@/lib/auth/server";
import { findUserById } from "@/lib/auth/user";
import {
  Slip2GoTransportError,
  verifySlipWithSlip2Go,
} from "@/lib/slip/slip2go-api";
import { validateBankAccount } from "@/lib/slip/validation";
import { getSettingValue } from "@/lib/settings/repository";
import { getSiteId } from "@/lib/site";
import {
  assertTopupBuyerActive,
  claimTopupRequest,
  completeVerifiedTopup,
  createTopupFingerprint,
  markTopupRequestFailed,
  resolveTopupIdempotencyKey,
  saveVerifiedTopup,
  waitForTopupRequest,
  type VerifiedTopupSnapshot,
} from "@/lib/topup/repository";
import {
  SlipVerificationError,
  ErrorCodes,
  type VerifySlipResponse,
  type Slip2GoApiResponse,
  type Slip2GoPayload,
} from "@/lib/slip/types";
import {
  sendDiscordWebhook,
  createTopupEmbed,
} from "@/lib/discord/webhook";
import { logger } from "@/lib/utils/logger";
import { createUserNotification } from "@/lib/notifications/repository";
import { dispatchNotificationToUser } from "@/lib/push/dispatch";

const MAX_SLIP_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
const SUCCESS_CODES = new Set(["200000", "200001", "200200"]);
const PROVIDER_RETRY_MESSAGE =
  "ระบบตรวจสอบสลิปขัดข้องชั่วคราว กรุณาลองใหม่ด้วยสลิปเดิม";
const PROVIDER_FAILURE_MESSAGE =
  "ระบบตรวจสอบสลิปไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ";
const DUPLICATE_RECOVERY_MESSAGE =
  "สลิปนี้ถูกตรวจสอบไปแล้ว แต่ระบบยังอ่านข้อมูลไม่ครบ กรุณาลองใหม่ด้วยสลิปเดิม";
type RequestFormData = { get(name: string): string | File | null };

function createSlip2GoFormData(
  slipFile: File,
  expectedAccount: string | null,
  checkDuplicate: boolean
): FormData {
  const payload: Slip2GoPayload = { checkDuplicate };
  if (expectedAccount) {
    const digits = expectedAccount.replace(/[^0-9]/g, "");
    if (digits.length > 0) {
      payload.checkReceiver = [{ accountNumber: digits }];
    }
  }

  const formData = new FormData();
  formData.append("file", slipFile, slipFile.name || `slip-${Date.now()}.jpg`);
  formData.append("payload", JSON.stringify(payload));
  return formData;
}

function getReceiverAccount(
  data: NonNullable<Slip2GoApiResponse["data"]>
): string {
  return (
    data.receiver?.account?.bank?.account ||
    data.receiver?.account?.proxy?.account ||
    ""
  );
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function safeText(value: unknown, maxLength = 160): string | null {
  if (typeof value !== "string") return null;
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLength) || null;
}

function logVerificationError(input: {
  siteId: string;
  userId: string;
  requestId?: string;
  requestFingerprint?: string;
  legacyClient: boolean;
  phase: string;
  status: number;
  errorCode: string;
  errorMessage: string;
  slip2goData: { code?: string; message?: string } | null;
  providerTransport?: {
    kind?: string;
    httpStatus?: number;
    axiosCode?: string;
    retryable?: boolean;
    message?: string;
  };
  databaseCode?: string;
  databaseState?: string;
}) {
  const safeEntry = {
    timestamp: new Date().toISOString(),
    siteId: safeText(input.siteId, 64) || "unknown",
    userIdHash: shortHash(input.userId || "unknown"),
    requestId: safeText(input.requestId, 64),
    requestFingerprintPrefix: safeText(input.requestFingerprint, 16),
    legacyClient: input.legacyClient,
    phase: safeText(input.phase, 64) || "unknown",
    status: input.status,
    errorCode: safeText(input.errorCode, 64) || "UNKNOWN",
    errorMessage: safeText(input.errorMessage) || "Top-up verification failed",
    provider: input.slip2goData
      ? {
          code: safeText(input.slip2goData.code, 32),
          message: safeText(input.slip2goData.message),
        }
      : null,
    providerTransport: input.providerTransport
      ? {
          kind: safeText(input.providerTransport.kind, 32),
          httpStatus: input.providerTransport.httpStatus,
          axiosCode: safeText(input.providerTransport.axiosCode, 64),
          retryable: input.providerTransport.retryable,
          message: safeText(input.providerTransport.message),
        }
      : null,
    databaseCode: safeText(input.databaseCode, 64),
    databaseState: safeText(input.databaseState, 32),
  };

  try {
    const logDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logPath = path.join(logDir, "verify_errors.log");
    fs.appendFileSync(logPath, JSON.stringify(safeEntry) + "\n");
  } catch (err) {
    console.error("Failed to write to verify_errors.log:", err);
  }

  logger.error("[Verify Slip] sanitized failure", safeEntry);
}

export async function POST(request: NextRequest) {
  let siteId = "unknown";
  let userId = "unknown";
  let requestFingerprint = "";
  let isLegacyClient = false;
  let verificationPhase = "request";
  let slipDetails: { code?: string; message?: string } | null = null;
  let claimedTopup: {
    requestId: string;
    processingToken: string;
    verified: VerifiedTopupSnapshot | null;
  } | null = null;
  try {
    verificationPhase = "authenticate";
    const user = await requireUser();
    userId = user.id;

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json<VerifySlipResponse>(
        {
          success: false,
          error: "รูปแบบข้อมูลไม่ถูกต้อง กรุณาอัปโหลดไฟล์สลิป",
        },
        { status: 415 }
      );
    }

    const formData = await request.formData().catch(() => null) as RequestFormData | null;
    if (!formData) {
      return NextResponse.json<VerifySlipResponse>(
        {
          success: false,
          error: "ไม่สามารถอ่านข้อมูลจากคำขอได้",
        },
        { status: 400 }
      );
    }

    const slipFile = formData.get("slip");
    if (!(slipFile instanceof File)) {
      return NextResponse.json<VerifySlipResponse>(
        {
          success: false,
          error: "ไม่พบไฟล์สลิป กรุณาลองใหม่",
        },
        { status: 400 }
      );
    }

    if (slipFile.size === 0) {
      return NextResponse.json<VerifySlipResponse>(
        {
          success: false,
          error: "ไฟล์สลิปว่างเปล่า กรุณาเลือกไฟล์ใหม่",
        },
        { status: 400 }
      );
    }

    if (slipFile.size > MAX_SLIP_FILE_SIZE) {
      return NextResponse.json<VerifySlipResponse>(
        {
          success: false,
          error: "ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 8 MB)",
        },
        { status: 400 }
      );
    }

    verificationPhase = "validate-buyer";
    siteId = getSiteId();
    await assertTopupBuyerActive({ siteId, userId: user.id });
    const fileBytes = new Uint8Array(await slipFile.arrayBuffer());
    requestFingerprint = createTopupFingerprint(fileBytes);
    const headerKey = request.headers.get("idempotency-key");
    if (headerKey && headerKey.trim().length > 128) {
      throw new SlipVerificationError(
        "Idempotency-Key is too long.",
        ErrorCodes.API_ERROR,
        400
      );
    }

    const { key: idempotencyKey, isLegacy } = resolveTopupIdempotencyKey({
      headerKey,
      requestFingerprint,
    });
    isLegacyClient = isLegacy;
    if (isLegacy) {
      logger.warn("[Verify Slip] Legacy client did not send Idempotency-Key", {
        userId: user.id,
        siteId,
      });
    }

    verificationPhase = "claim-request";
    const claim = await claimTopupRequest({
      siteId,
      userId: user.id,
      idempotencyKey,
      requestFingerprint,
    });

    if (claim.kind === "existing") {
      let decision = claim.decision;
      if (decision.kind === "processing") {
        decision = await waitForTopupRequest({
          siteId,
          userId: user.id,
          idempotencyKey,
          requestFingerprint,
        });
      }

      if (decision.kind === "conflict") {
        return NextResponse.json<VerifySlipResponse>(
          { success: false, error: "The same Idempotency-Key was used with a different slip." },
          { status: 409, headers: { "Cache-Control": "no-store" } }
        );
      }
      if (decision.kind === "replay") {
        return NextResponse.json<VerifySlipResponse>(decision.body, {
          status: decision.status,
          headers: { "Cache-Control": "no-store" },
        });
      }

      return NextResponse.json<VerifySlipResponse>(
        {
          success: false,
          error: "Top-up is still being processed. Please retry with the same slip.",
          retryable: true,
        },
        { status: 202, headers: { "Cache-Control": "no-store" } }
      );
    }

    claimedTopup = claim;

    // A provider-verified request can finish locally without sending the slip again.
    // This closes the gap between provider success and local balance completion.
    if (claimedTopup.verified) {
      const minimumAmountStr = await getSettingValue("minimum_topup_amount");
      const minimumAmount = parseFloat(minimumAmountStr || "49") || 49;
      const completed = await completeVerifiedTopup({
        requestId: claimedTopup.requestId,
        processingToken: claimedTopup.processingToken,
        siteId,
        userId: user.id,
        transactionId: claimedTopup.verified.transactionId,
        amount: claimedTopup.verified.amount,
        qrPayload: claimedTopup.verified.qrPayload,
        minimumAmount,
        message: `เติมเงินสำเร็จ! จำนวน ${claimedTopup.verified.amount.toFixed(2)} บาท ได้รับ ${claimedTopup.verified.amount.toLocaleString()} พ้อยท์`,
      });

      return NextResponse.json<VerifySlipResponse>(completed.body, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    verificationPhase = "load-settings";
    const [
      slip2goSecretSetting,
      slip2goEndpointSetting,
      expectedAccount,
      bankAccountNumber,
      minimumAmountStr,
    ] = await Promise.all([
      getSettingValue("slip2go_api_secret"),
      getSettingValue("slip2go_api_endpoint"),
      getSettingValue("expected_receiver_account"),
      getSettingValue("bank_account_number"),
      getSettingValue("minimum_topup_amount"),
    ]);

    const slip2goSecret =
      slip2goSecretSetting ||
      process.env.SLIP2GO_API_SECRET ||
      process.env.SLIP2GO_SECRET_KEY ||
      "";

    if (!slip2goSecret) {
      throw new SlipVerificationError(
        "ระบบยังไม่ได้ตั้งค่า Slip2Go Secret Key กรุณาติดต่อแอดมิน",
        ErrorCodes.API_ERROR,
        500
      );
    }

    const slip2goEndpoint =
      slip2goEndpointSetting ||
      process.env.SLIP2GO_API_ENDPOINT ||
      "https://connect.slip2go.com/api/verify-slip/qr-image/info";

    const minimumAmount = parseFloat(minimumAmountStr || "49") || 49;
    const configuredReceiverAccount = expectedAccount || bankAccountNumber || null;

    verificationPhase = "provider-verify";
    let slip2goResponse = await verifySlipWithSlip2Go(
      createSlip2GoFormData(slipFile, configuredReceiverAccount, true),
      {
        endpoint: slip2goEndpoint,
        secretKey: slip2goSecret,
      }
    );
    const duplicateProviderResponse = slip2goResponse.code === "200501";

    // A lost provider response can make the next request look duplicated.
    // Re-fetch the slip details without duplicate-checking, then keep the
    // existing local transaction lock and history checks as the final guard.
    if (
      duplicateProviderResponse &&
      !getReceiverAccount(slip2goResponse.data ?? {})
    ) {
      verificationPhase = "provider-duplicate-recovery";
      const recoveredResponse = await verifySlipWithSlip2Go(
        // Ask for the complete provider payload; the local validator below
        // still enforces the configured receiver account.
        createSlip2GoFormData(slipFile, null, false),
        {
          endpoint: slip2goEndpoint,
          secretKey: slip2goSecret,
        }
      );
      logger.warn("[Verify Slip] Recovered duplicate provider response", {
        originalCode: slip2goResponse.code,
        recoveredCode: recoveredResponse.code,
      });
      slip2goResponse = recoveredResponse;
    }

    slipDetails = {
      code: slip2goResponse.code,
      message: slip2goResponse.message,
    };

    const duplicateHasUsableData =
      duplicateProviderResponse &&
      Boolean(slip2goResponse.data) &&
      Boolean(getReceiverAccount(slip2goResponse.data ?? {}));

    if (
      duplicateProviderResponse &&
      !SUCCESS_CODES.has(slip2goResponse.code) &&
      !duplicateHasUsableData
    ) {
      if (slip2goResponse.code === "200401") {
        throw mapSlip2GoError(slip2goResponse.code, slip2goResponse.message);
      }
      throw new SlipVerificationError(
        DUPLICATE_RECOVERY_MESSAGE,
        ErrorCodes.DUPLICATE_SLIP,
        409,
        { retryable: true }
      );
    }

    if (
      (!SUCCESS_CODES.has(slip2goResponse.code) && !duplicateHasUsableData) ||
      !slip2goResponse.data
    ) {
      throw mapSlip2GoError(slip2goResponse.code, slip2goResponse.message);
    }

    const slipData = slip2goResponse.data;
    const amount = Number(slipData.amount ?? 0);
    const receiverAccount = getReceiverAccount(slipData);

    logger.debug("✅ [Verify Slip] Slip2Go data:", {
      amount,
      dateTime: slipData.dateTime,
    });

    if (!receiverAccount && duplicateProviderResponse) {
      throw new SlipVerificationError(
        DUPLICATE_RECOVERY_MESSAGE,
        ErrorCodes.DUPLICATE_SLIP,
        409,
        { retryable: true }
      );
    }

    if (!receiverAccount) {
      throw new SlipVerificationError(
        "ไม่สามารถอ่านบัญชีผู้รับจากสลิปได้",
        ErrorCodes.INVALID_ACCOUNT
      );
    }

    if (amount <= 0) {
      throw new SlipVerificationError(
        "ไม่สามารถอ่านจำนวนเงินจากสลิปได้",
        ErrorCodes.INVALID_AMOUNT
      );
    }

    if (amount < minimumAmount) {
      throw new SlipVerificationError(
        `จำนวนเงินต้องไม่น้อยกว่า ${minimumAmount.toFixed(2)} บาท (ปัจจุบัน: ${amount.toFixed(2)} บาท)`,
        ErrorCodes.INVALID_AMOUNT
      );
    }

    if (!configuredReceiverAccount || !validateBankAccount(configuredReceiverAccount, receiverAccount)) {
      throw new SlipVerificationError(
        "บัญชีผู้รับเงินไม่ถูกต้อง",
        ErrorCodes.INVALID_ACCOUNT
      );
    }

    if (slipData.dateTime) {
      const transactionDate = new Date(slipData.dateTime);
      if (isNaN(transactionDate.getTime())) {
        throw new SlipVerificationError(
          "ไม่สามารถอ่านวันที่จากสลิปได้",
          ErrorCodes.INVALID_QR
        );
      }

      const now = new Date();
      const latestAllowedDate = new Date(now);
      latestAllowedDate.setDate(latestAllowedDate.getDate() - 20);

      if (transactionDate < latestAllowedDate) {
        const daysOld = Math.floor(
          (now.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        throw new SlipVerificationError(
          `ไม่สามารถใช้สลิปที่เก่ากว่า 20 วันได้ (สลิปนี้เก่า ${daysOld} วัน) กรุณาใช้สลิปที่ใหม่กว่า`,
          ErrorCodes.INVALID_QR
        );
      }
    }

    const transactionId =
      slipData.transRef || slipData.referenceId || slipData.decode || "";

    if (!transactionId) {
      throw new SlipVerificationError(
        "ไม่พบเลขอ้างอิงธุรกรรมจากสลิป",
        ErrorCodes.INVALID_QR
      );
    }

    const pointsToAdd = Number(amount);
    const qrPayload = slipData.referenceId || slipData.decode || transactionId;
    verificationPhase = "journal-provider-result";
    await saveVerifiedTopup({
      requestId: claimedTopup.requestId,
      processingToken: claimedTopup.processingToken,
      transactionId,
      amount: pointsToAdd,
      qrPayload,
    });
    verificationPhase = "complete-balance";
    const completed = await completeVerifiedTopup({
      requestId: claimedTopup.requestId,
      processingToken: claimedTopup.processingToken,
      siteId,
      userId: user.id,
      transactionId,
      amount: pointsToAdd,
      qrPayload,
      minimumAmount,
      message: `เติมเงินสำเร็จ! จำนวน ${pointsToAdd.toFixed(2)} บาท ได้รับ ${pointsToAdd.toLocaleString()} พ้อยท์`,
    });

    try {
      const webhookUrl = await getSettingValue("discord_webhook_topup");
      if (webhookUrl) {
        const userRecord = await findUserById(user.id);
        const embed = createTopupEmbed({
          userId: user.id,
          username: userRecord?.display_name || user.email || "Unknown",
          email: user.email || "Unknown",
          amount: completed.topupAmount,
          pointsAdded: completed.pointsAdded,
          bonusPoints: completed.bonusPoints,
          currentPoints: completed.currentPoints,
          transactionId: transactionId || undefined,
        });

        await sendDiscordWebhook(webhookUrl, {
          embeds: [embed],
        });
      }
    } catch (error) {
      logger.error("❌ [Verify Slip] Failed to send Discord webhook:", error);
    }

    try {
      const topupTitle = "🎉 เติมเงินสำเร็จ!";
      const topupMsg = `คุณได้เติมเงินสำเร็จ ${pointsToAdd.toFixed(2)} บาท ได้รับ ${pointsToAdd.toLocaleString()} พ้อยท์`;

      createUserNotification({
        userId: user.id,
        siteId,
        type: "topup_success",
        title: topupTitle,
        message: topupMsg,
        linkUrl: "/dashboard/topup/history",
        referenceId: transactionId || claimedTopup.requestId,
      }).catch((err) => console.error("[Verify Slip] Failed to record user notification:", err));

      dispatchNotificationToUser({
        userId: user.id,
        title: topupTitle,
        body: `${topupMsg} [คลิกเพื่อดูประวัติ]`,
        url: "/dashboard/topup/history",
        soundType: "case_resolved",
        tag: `topup-${transactionId || Date.now()}`,
      }).catch((err) => console.error("[Verify Slip] Failed to dispatch push notification:", err));
    } catch (notifErr) {
      console.error("[Verify Slip] Notification error:", notifErr);
    }

    return NextResponse.json<VerifySlipResponse>(completed.body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logger.error("❌ Slip verification error:", error);
    const transportError = error instanceof Slip2GoTransportError ? error : null;
    const status = error instanceof SlipVerificationError
      ? error.statusCode
      : transportError?.httpStatus === 429
        ? 429
        : transportError?.retryable
          ? 503
          : transportError
            ? 502
            : 500;
    const errorCode = error instanceof SlipVerificationError
      ? error.code
      : transportError
        ? ErrorCodes.API_ERROR
        : ErrorCodes.DATABASE_ERROR;
    const databaseError = error && typeof error === "object"
      ? error as { code?: unknown; sqlState?: unknown }
      : {};
    const errMessage = error instanceof SlipVerificationError
      ? error.message
      : transportError?.message || "Internal top-up verification failure";
    logVerificationError({
      siteId,
      userId,
      requestId: claimedTopup?.requestId,
      requestFingerprint,
      legacyClient: isLegacyClient,
      phase: verificationPhase,
      status,
      errorCode,
      errorMessage: errMessage,
      slip2goData: slipDetails,
      providerTransport: transportError
        ? {
            kind: transportError.kind,
            httpStatus: transportError.httpStatus,
            axiosCode: transportError.axiosCode,
            retryable: transportError.retryable,
            message: transportError.message,
          }
        : undefined,
      databaseCode: typeof databaseError.code === "string" ? databaseError.code : undefined,
      databaseState: typeof databaseError.sqlState === "string" ? databaseError.sqlState : undefined,
    });

    const responseBody: VerifySlipResponse = error instanceof SlipVerificationError
      ? {
          success: false,
          error: error.message,
          ...(error.retryable ? { retryable: true } : {}),
        }
      : transportError
        ? {
            success: false,
            error: transportError.retryable
              ? PROVIDER_RETRY_MESSAGE
              : PROVIDER_FAILURE_MESSAGE,
            retryable: transportError.retryable,
          }
        : {
          success: false,
          error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง",
        };

    if (claimedTopup) {
      try {
        await markTopupRequestFailed({
          ...claimedTopup,
          status,
          body: responseBody,
          errorCode: error instanceof SlipVerificationError
            ? error.code
            : transportError
              ? ErrorCodes.API_ERROR
              : ErrorCodes.DATABASE_ERROR,
        });
      } catch (markError) {
        logger.error("[Verify Slip] Failed to persist top-up failure state", markError);
      }
    }

    if (error instanceof SlipVerificationError) {
      return NextResponse.json<VerifySlipResponse>(
        responseBody,
        { status, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json<VerifySlipResponse>(
      responseBody,
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}

function mapSlip2GoError(code: string, fallbackMessage?: string): SlipVerificationError {
  const defaultMessage = fallbackMessage || "ไม่สามารถตรวจสอบสลิปได้ กรุณาลองใหม่";
  switch (code) {
    case "200401":
      return new SlipVerificationError(
        "บัญชีผู้รับเงินไม่ถูกต้อง",
        ErrorCodes.INVALID_ACCOUNT
      );
    case "200402":
      return new SlipVerificationError(
        "ยอดโอนเงินไม่ตรงเงื่อนไข",
        ErrorCodes.INVALID_AMOUNT
      );
    case "200403":
      return new SlipVerificationError(
        "วันที่โอนไม่ตรงเงื่อนไข",
        ErrorCodes.INVALID_QR
      );
    case "200404":
      return new SlipVerificationError("ไม่พบข้อมูลสลิปในระบบธนาคาร", ErrorCodes.INVALID_QR);
    case "200500":
      return new SlipVerificationError("สลิปเสียหรือสลิปปลอม", ErrorCodes.INVALID_QR);
    case "200502":
      return new SlipVerificationError(
        "ระบบธนาคารหรือผู้ให้บริการตรวจสอบสลิปขัดข้องชั่วคราว กรุณาลองใหม่",
        ErrorCodes.API_ERROR,
        503,
        { retryable: true }
      );
    case "429000":
      return new SlipVerificationError(
        "ระบบตรวจสอบสลิปมีคำขอหนาแน่นชั่วคราว กรุณาลองใหม่อีกครั้ง",
        ErrorCodes.API_ERROR,
        429,
        { retryable: true }
      );
    case "500500":
      return new SlipVerificationError(
        "ระบบธนาคารหรือผู้ให้บริการตรวจสอบสลิปขัดข้องชั่วคราว กรุณาลองใหม่",
        ErrorCodes.API_ERROR,
        503,
        { retryable: true }
      );
    case "200501":
      return new SlipVerificationError(
        "สลิปนี้เคยใช้แล้ว",
        ErrorCodes.DUPLICATE_SLIP,
        409,
        { retryable: true }
      );
    default:
      return new SlipVerificationError(defaultMessage, ErrorCodes.API_ERROR);
  }
}

