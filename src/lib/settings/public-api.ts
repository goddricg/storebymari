import { LAYOUT_PUBLIC_SETTING_KEYS } from "./public-keys";

export const PUBLIC_SETTING_KEYS = new Set<string>([
  ...LAYOUT_PUBLIC_SETTING_KEYS,
  "home_movie_poster_6",
  "bank_account_number",
  "bank_account_name",
  "bank_name",
  "minimum_topup_amount",
]);

export function isSafePublicSettingKey(key: string): boolean {
  return PUBLIC_SETTING_KEYS.has(key.trim());
}
