export type ManagedUserTier = "normal" | "vip" | "walkin";

export function normalizeUserTier(value: unknown): ManagedUserTier {
  if (value === "vip" || value === "walkin" || value === "normal") {
    return value;
  }

  return "normal";
}

export function getEffectiveUserTier(
  value: unknown,
  expiresAt?: Date | string | null,
  now = Date.now()
): ManagedUserTier {
  const tier = normalizeUserTier(value);
  if (tier === "normal" || !expiresAt) return tier;

  const expiryTime = expiresAt instanceof Date
    ? expiresAt.getTime()
    : new Date(expiresAt).getTime();

  if (Number.isFinite(expiryTime) && expiryTime <= now) {
    return "normal";
  }

  return tier;
}

export function toOptionalIsoDate(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
