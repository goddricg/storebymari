export const RANKING_AVATAR_COUNT = 195;
export const DEFAULT_PROFILE_AVATAR_URL = "/avatars/default-profile.png";

export const RANKING_AVATAR_KEYS = Array.from(
  { length: RANKING_AVATAR_COUNT },
  (_, index) => `avatar-${String(index + 1).padStart(3, "0")}`
);

const AVATAR_KEY_PATTERN = /^avatar-(\d{3})$/;

export function isValidRankingAvatarKey(value: string): boolean {
  const match = AVATAR_KEY_PATTERN.exec(value);
  if (!match) return false;
  const index = Number(match[1]);
  return index >= 1 && index <= RANKING_AVATAR_COUNT;
}

// Keep the temporary avatar assignment stable per account without requiring a
// backfill. A user can replace this value through the profile preference API.
export function getDefaultAvatarKeyForUser(userId: string): string {
  let hash = 2166136261;

  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return RANKING_AVATAR_KEYS[(hash >>> 0) % RANKING_AVATAR_COUNT];
}

export function getProfileAvatarUrl(avatarKey: string | null | undefined): string {
  if (!avatarKey || !isValidRankingAvatarKey(avatarKey)) return DEFAULT_PROFILE_AVATAR_URL;
  return `/avatars/ranking/${avatarKey}.jpg`;
}

export function getRankingAvatarUrl(avatarKey: string | null | undefined): string {
  return getProfileAvatarUrl(avatarKey);
}
