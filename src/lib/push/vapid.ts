import webpush from "web-push";

let vapidConfigured = false;

export const DEFAULT_VAPID_PUBLIC_KEY = "";
export const DEFAULT_VAPID_PRIVATE_KEY = "";
export const DEFAULT_VAPID_SUBJECT = "";

export function configureVapid(): boolean {
  if (vapidConfigured) return true;

  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    process.env.VAPID_PUBLIC_KEY ||
    DEFAULT_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    console.warn("[VAPID] Keys are missing. Web Push notifications cannot be sent.");
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
  } catch (err) {
    console.error("[VAPID] Failed to configure VAPID details:", err);
    return false;
  }
}

export function getVapidPublicKey(): string {
  return (
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    process.env.VAPID_PUBLIC_KEY ||
    DEFAULT_VAPID_PUBLIC_KEY
  );
}

export { webpush };
