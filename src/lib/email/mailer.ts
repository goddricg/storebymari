import nodemailer from "nodemailer";

export interface SendEmailOptions {
  from?: string;
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export function getConfiguredEmailRecipient(): string | null {
  const recipient = process.env.RESTOCK_ALERT_RECIPIENT?.trim();
  return recipient || null;
}

export function createMailerTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const portText = process.env.SMTP_PORT?.trim() || "465";
  const secure = process.env.SMTP_SECURE === "false" ? false : true;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD;

  const port = Number(portText);
  if (!host || !user || pass === undefined || pass.length === 0) {
    throw new Error("SMTP configuration is missing");
  }
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP configuration requires a valid SMTP_PORT");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

export async function sendSystemEmail(
  options: SendEmailOptions,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = createMailerTransport();
    const fromAddress =
      options.from ||
      process.env.SMTP_FROM?.trim() ||
      process.env.SMTP_USER?.trim();

    if (!fromAddress) {
      throw new Error("SMTP_FROM is missing");
    }

    const info = await transporter.sendMail({
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    console.log("[Email] Sent successfully:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("[Email] Failed to send email:", error?.message || error);
    return { success: false, error: error?.message || "Send email failed" };
  }
}
