import crypto from "crypto";
import { getSettingValue, updateSetting } from "@/lib/settings/repository";

export const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID?.trim() || "";
export const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || "";

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Fetches or returns a cached Channel Access Token via OAuth v2.1 client_credentials
 */
export async function getLineChannelAccessToken(): Promise<string> {
  if (!LINE_CHANNEL_ID || !LINE_CHANNEL_SECRET) {
    throw new Error("LINE channel configuration is missing");
  }

  // If we already have an unexpired cached token with at least 5 minutes buffer, use it
  if (cachedToken && Date.now() < tokenExpiresAt - 300000) {
    return cachedToken;
  }

  // Check if token exists in DB settings
  try {
    const dbTokenJson = await getSettingValue("line_channel_access_token_cache");
    if (dbTokenJson) {
      const parsed = JSON.parse(dbTokenJson);
      if (parsed.token && parsed.expiresAt && Date.now() < parsed.expiresAt - 300000) {
        cachedToken = parsed.token;
        tokenExpiresAt = parsed.expiresAt;
        return cachedToken as string;
      }
    }
  } catch (e) {
    // Ignore DB cache read error and fetch fresh
  }

  // Request fresh access token from LINE OAuth v2.1
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", LINE_CHANNEL_ID);
  params.append("client_secret", LINE_CHANNEL_SECRET);

  const res = await fetch("https://api.line.me/v2/oauth/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to obtain LINE Channel Access Token: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const token = data.access_token as string;
  const expiresIn = (data.expires_in as number) || 2592000;

  cachedToken = token;
  tokenExpiresAt = Date.now() + expiresIn * 1000;

  // Persist to DB cache
  try {
    await updateSetting(
      "line_channel_access_token_cache",
      JSON.stringify({ token: cachedToken, expiresAt: tokenExpiresAt })
    );
  } catch (e) {
    // Non-fatal
  }

  return token;
}

/**
 * Verifies LINE Webhook HMAC-SHA256 signature
 */
export function verifyLineSignature(body: string, signature: string | null): boolean {
  if (!signature || !LINE_CHANNEL_SECRET) return false;
  try {
    const hmac = crypto.createHmac("sha256", LINE_CHANNEL_SECRET);
    hmac.update(body, "utf8");
    const expectedSignature = hmac.digest("base64");
    return crypto.timingSafeEqual(
      Buffer.from(signature, "base64"),
      Buffer.from(expectedSignature, "base64")
    );
  } catch (e) {
    console.error("[LINE verifyLineSignature Error]:", e);
    return false;
  }
}
