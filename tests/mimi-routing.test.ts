import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorizedAdminSource, isExplicitAdminOperation, isExplicitHumanRequest } from "../src/lib/line/agent-routing";
import { resolveAdminTier } from "../src/lib/mimi/admin-tiers";
import { getMimiToolDeclarations } from "../src/lib/mimi/agent-tools";

test("ordinary questions and follow-ups reach AI, operations remain explicit", () => {
  for (const text of ["ดูไม่ได้", "เช็กสต็อก", "มีแอปอะไรบ้าง", "แล้วเมื่อวานล่ะ", "ทำอะไรได้บ้าง", "วันนี้มีใครเติมสต็อกไหม"])
    assert.equal(isExplicitAdminOperation(text), false, text);
  assert.equal(isExplicitAdminOperation("เติมสต็อก Netflix"), true);
  assert.equal(isExplicitAdminOperation("หยุดตอบ 30 นาที"), true);
  assert.equal(isExplicitHumanRequest("Netflix เปลี่ยนจอแล้วยังดูไม่ได้"), false);
  assert.equal(isExplicitHumanRequest("ขอคุยกับแอดมิน"), true);
});

test("only the configured group can enter admin paths", () => {
  assert.equal(isAuthorizedAdminSource({type:"group",groupId:"trusted"}, "trusted"), true);
  for (const source of [{type:"group",groupId:"other"}, {type:"room"}, {type:"user"}])
    assert.equal(isAuthorizedAdminSource(source, "trusted"), false);
  assert.equal(isAuthorizedAdminSource({type:"group",groupId:""}, ""), false);
});

test("display names and emoji cannot grant admin privileges", () => {
  for (const name of ["🦁", "Zeries Sand", "ปะป๊า", "Mari", "Som"])
    assert.equal(resolveAdminTier("unregistered", name).tier, "E");
});

test("active LINE UIDs resolve to their respective admin tiers", () => {
  const papa = resolveAdminTier("U366bbe749237c0efd4bc388958e7a299", "🦁 Zeries Sand 🦁");
  assert.equal(papa.tier, "SSS");
  assert.equal(papa.callName, "ป๊า");
  assert.equal(papa.canManageSystem, true);
  assert.equal(papa.canAccessDeepFinance, true);

  const som = resolveAdminTier("U11fa5166f9cc33b8c7258dbb22c9733d", "|• SOM •|🐝~04");
  assert.equal(som.tier, "B");
  assert.equal(som.callName, "พี่ส้ม");
});

test("admin agent tools follow the resolved LINE UID tier", () => {
  const guestTools = getMimiToolDeclarations("admin", "E").map((tool) => tool.name);
  const staffTools = getMimiToolDeclarations("admin", "B").map((tool) => tool.name);
  assert.deepEqual(guestTools, ["search_products", "show_product_cards", "list_categories", "search_knowledge"]);
  assert.ok(staffTools.includes("list_support_cases"));
  assert.ok(staffTools.includes("find_customers"));
});

test("admin identity commands are recognized as explicit operations", () => {
  for (const text of [
    "เช็คไอดี", "เช็กไอดี", "ดูไอดี", "whoami", "uid",
    "ตั้งสิทธิ์ หม่ามี้ U123", "ผูกสิทธิ์ พี่ปอ U456",
    "รายชื่อแอดมิน", "สิทธิ์แอดมิน",
    "แผงควบคุม", "ขอแผงควบคุม", "เปิดแผงควบคุม", "ดูแผงควบคุม",
    "สวิตช์", "dashboard", "control panel"
  ]) {
    assert.equal(isExplicitAdminOperation(text), true, text);
  }
});

test("dynamically registered UIDs resolve to correct tiers", async () => {
  const { registerDynamicAdminUid, getRegisteredAdminList } = await import("../src/lib/mimi/admin-tiers");
  const testUid = "Utest9999999999999999999999999999";
  assert.equal(resolveAdminTier(testUid, "Guest").tier, "E");

  registerDynamicAdminUid(testUid, "POR");
  const resolved = resolveAdminTier(testUid, "Raya");
  assert.equal(resolved.tier, "B");
  assert.equal(resolved.callName, "พี่ปอ");

  const list = getRegisteredAdminList();
  const porEntry = list.find((item) => item.key === "POR");
  assert.ok(porEntry);
  assert.ok(porEntry.uids.includes(testUid));
});

