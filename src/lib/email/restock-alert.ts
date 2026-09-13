import { getConfiguredEmailRecipient, sendSystemEmail } from "./mailer";

export interface RestockAlertParams {
  productName: string;
  amount: number;
  price?: number | string | null;
  category?: string | null;
  note?: string | null;
  previousStock?: number | null;
  remainingStock?: number | null;
  actorName?: string | null;
  actorEmail?: string | null;
  timestamp?: Date | string;
}

export async function sendRestockAlertEmail(
  params: RestockAlertParams,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const timestamp = params.timestamp
    ? new Date(params.timestamp).toISOString()
    : new Date().toISOString();

  const recipient = getConfiguredEmailRecipient();
  if (!recipient) {
    return {
      success: false,
      error: "RESTOCK_ALERT_RECIPIENT is missing",
    };
  }
  const subject = `[APPMARI-SIGNAL:RESTOCK] ${params.productName} (เติม ${params.amount} ชิ้น)`;

  const bodyLines = [
    `[EVENT]: STOCK_RESTOCK`,
    `[PRODUCT]: ${params.productName}`,
    `[AMOUNT]: ${params.amount}`,
    `[PRICE]: ${params.price != null ? params.price : "N/A"}`,
    `[CATEGORY]: ${params.category || "General"}`,
    `[PREVIOUS_STOCK]: ${params.previousStock != null ? params.previousStock : "N/A"}`,
    `[REMAINING_STOCK]: ${params.remainingStock != null ? params.remainingStock : "N/A"}`,
    `[ACTOR]: ${params.actorName || "Admin"} (${params.actorEmail || "system"})`,
    `[NOTE]: ${params.note || "Restocked via Admin Stock Management"}`,
    `[TIMESTAMP]: ${timestamp}`,
  ];

  const textBody = bodyLines.join("\n");

  console.log(`[RestockAlert] Sending restock alert email for "${params.productName}" (+${params.amount}) to ${recipient}...`);
  const result = await sendSystemEmail({
    to: recipient,
    subject,
    text: textBody,
  });

  if (result.success) {
    console.log(`[RestockAlert] Restock email delivered successfully. MessageId:`, result.messageId);
  } else {
    console.error(`[RestockAlert] Failed to deliver restock email:`, result.error);
  }

  return result;
}
