export type TopupEventStatus = "success" | "failed" | "pending";

export type TopupSourceInput = {
  sourceType?: string | null;
  sourceLabel?: string | null;
  sourceEmail?: string | null;
  isManual?: boolean;
};

function cleanMessage(value: string | null | undefined): string {
  return typeof value === "string"
    ? value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 255)
    : "";
}

/**
 * Convert internal/provider failure codes into a short explanation that an
 * admin can understand without exposing raw provider responses.
 */
export function getTopupFailureReason(
  errorCode: string | null | undefined,
  errorMessage?: string | null
): string {
  const code = (errorCode ?? "").trim().toUpperCase();
  const message = cleanMessage(errorMessage);

  switch (code) {
    case "DUPLICATE_SLIP":
      return "สลิปซ้ำ";
    case "INVALID_ACCOUNT":
      return "บัญชีผู้รับเงินไม่ตรงกับระบบ";
    case "INVALID_AMOUNT":
      return message.includes("ไม่น้อยกว่า")
        ? message
        : "ยอดเงินไม่ถูกต้องหรือไม่ถึงขั้นต่ำ";
    case "INVALID_QR":
      return /ปลอม|เสีย/.test(message)
        ? "สลิปเสียหรือสลิปปลอม"
        : /ไม่พบ|อ่าน/.test(message)
          ? "อ่านข้อมูลสลิปไม่ได้"
          : "ข้อมูลสลิปไม่ถูกต้อง";
    case "API_ERROR":
      return "ระบบตรวจสอบสลิปขัดข้องชั่วคราว";
    case "DATABASE_ERROR":
      return "ระบบบันทึกข้อมูลขัดข้อง";
    case "UNAUTHORIZED":
      return "บัญชีผู้ใช้ไม่พร้อมใช้งาน";
    default:
      return message && /[\u0E00-\u0E7F]/.test(message)
        ? message
        : "ไม่สามารถตรวจสอบรายการได้";
  }
}

export function getTopupStatusLabel(status: TopupEventStatus): string {
  switch (status) {
    case "success":
      return "สำเร็จ";
    case "failed":
      return "ไม่สำเร็จ";
    case "pending":
      return "กำลังตรวจสอบ";
  }
}

export function getTopupSourceLabel(input: TopupSourceInput): string {
  const isManual = input.isManual || input.sourceType === "ADMIN";
  if (!isManual) return "ผ่านระบบตรวจสอบสลิป";

  const actor = cleanMessage(input.sourceLabel) || cleanMessage(input.sourceEmail);
  return actor ? `ผ่าน Admin: ${actor}` : "ผ่าน Admin: ไม่ระบุชื่อ";
}

export function parseSavedTopupError(savedResponse: string | null | undefined): string | null {
  if (!savedResponse) return null;

  try {
    const parsed = JSON.parse(savedResponse) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : null;
  } catch {
    return null;
  }
}
