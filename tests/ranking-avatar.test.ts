import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_PROFILE_AVATAR_URL,
  RANKING_AVATAR_COUNT,
  RANKING_AVATAR_KEYS,
  getProfileAvatarUrl,
  getDefaultAvatarKeyForUser,
  getRankingAvatarUrl,
  isValidRankingAvatarKey,
} from "@/lib/ranking/avatars";

test("profile avatar defaults to the supplied silhouette", () => {
  assert.equal(getProfileAvatarUrl(null), DEFAULT_PROFILE_AVATAR_URL);
  assert.equal(getRankingAvatarUrl(undefined), DEFAULT_PROFILE_AVATAR_URL);
});

test("avatar collection exposes only the cropped source assets", () => {
  assert.equal(RANKING_AVATAR_COUNT, 195);
  assert.equal(RANKING_AVATAR_KEYS.length, 195);
  assert.equal(isValidRankingAvatarKey("avatar-195"), true);
  assert.equal(isValidRankingAvatarKey("avatar-196"), false);
});

test("temporary default avatars are stable and valid per account", () => {
  const first = getDefaultAvatarKeyForUser("user-a");
  const second = getDefaultAvatarKeyForUser("user-b");

  assert.equal(getDefaultAvatarKeyForUser("user-a"), first);
  assert.equal(isValidRankingAvatarKey(first), true);
  assert.equal(isValidRankingAvatarKey(second), true);
});
