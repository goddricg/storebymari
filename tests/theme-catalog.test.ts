import assert from "node:assert/strict";
import test from "node:test";

import {
  canUseThemeSettingValue,
  getThemeCssVariables,
  normalizeThemeMode,
  normalizeThemePack,
  resolveThemeMode,
  THEME_PACK_IDS,
} from "../src/lib/theme/catalog";

test("theme catalog includes the requested default and seasonal packs", () => {
  assert.deepEqual(THEME_PACK_IDS, [
    "default",
    "halloween",
    "christmas",
    "new-year",
    "valentine",
    "songkran",
  ]);
});

test("theme normalizers fail safely to Default Day", () => {
  assert.equal(normalizeThemePack("unknown-season"), "default");
  assert.equal(normalizeThemeMode("midnight"), "day");
  assert.equal(resolveThemeMode("auto", true), "night");
  assert.equal(resolveThemeMode("auto", false), "day");
});

test("legacy color overrides remain available only for Default Day", () => {
  const legacyColors = { theme_color: "#123456" };
  const defaultDay = getThemeCssVariables("default", "day", legacyColors);
  const defaultNight = getThemeCssVariables("default", "night", legacyColors);
  const halloweenDay = getThemeCssVariables("halloween", "day", legacyColors);

  assert.equal(defaultDay["--theme-color"], "#123456");
  assert.notEqual(defaultNight["--theme-color"], "#123456");
  assert.notEqual(halloweenDay["--theme-color"], "#123456");
});

test("every theme pack resolves complete Day and Night presentation tokens", () => {
  for (const pack of THEME_PACK_IDS) {
    for (const mode of ["day", "night"] as const) {
      const variables = getThemeCssVariables(pack, mode);

      assert.match(variables["--theme-color"], /^#/);
      assert.match(variables["--theme-color-bg-top"], /^#/);
      assert.match(variables["--theme-color-bg-bottom"], /^#/);
      assert.ok(variables["--card"]);
      assert.ok(variables["--foreground"]);
      assert.ok(variables["--dreamy-shadow"]);
    }
  }
});

test("only allowlisted Theme Manager setting values are accepted", () => {
  assert.equal(canUseThemeSettingValue("site_theme_pack", "songkran"), true);
  assert.equal(canUseThemeSettingValue("site_theme_mode", "auto"), true);
  assert.equal(canUseThemeSettingValue("site_theme_allow_user_mode", "false"), true);
  assert.equal(canUseThemeSettingValue("site_theme_pack", "arbitrary-css"), false);
  assert.equal(canUseThemeSettingValue("site_theme_mode", "system-dark"), false);
  assert.equal(canUseThemeSettingValue("site_theme_allow_user_mode", "yes"), false);
});
