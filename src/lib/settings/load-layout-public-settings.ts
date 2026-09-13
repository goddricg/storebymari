import { cache } from "react";
import { getSettingValuesCached } from "@/lib/settings/repository";
import {
  LAYOUT_PUBLIC_SETTING_KEYS,
  type LayoutPublicSettings,
} from "@/lib/settings/public-keys";

export const loadLayoutPublicSettings = cache(async (): Promise<LayoutPublicSettings> => {
  try {
    const values = await getSettingValuesCached([...LAYOUT_PUBLIC_SETTING_KEYS]);
    return values as LayoutPublicSettings;
  } catch {
    return Object.fromEntries(
      LAYOUT_PUBLIC_SETTING_KEYS.map((key) => [key, null])
    ) as LayoutPublicSettings;
  }
});
