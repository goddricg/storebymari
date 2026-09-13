import test from "node:test";
import assert from "node:assert/strict";
import { deliverAgentReply, type AgentDeliveryDependencies } from "../src/lib/line/agent-delivery";

function harness(overrides: Partial<AgentDeliveryDependencies> = {}) {
  const actions: string[] = [];
  const deps: AgentDeliveryDependencies = {
    canSend: async () => true,
    notify: async () => { actions.push("notify"); return true; },
    reply: async text => { actions.push(`reply:${text}`); },
    remember: async () => { actions.push("remember"); },
    pause: async () => { actions.push("pause"); },
    ...overrides,
  };
  return { actions, deps };
}
test("handoff reply is delivered before our own chat pause", async () => {
  const h = harness();
  assert.deepEqual(await deliverAgentReply("answer", true, h.deps), {sent:true, notified:true});
  assert.equal(h.actions[0], "notify");
  assert.match(h.actions[1], /^reply:.*แจ้งเรื่องให้ทีมแอดมินแล้ว/u);
  assert.deepEqual(h.actions.slice(2), ["pause", "remember"]);
});
test("failed notification never claims success or pauses conversation", async () => {
  const h = harness({notify: async () => false});
  await deliverAgentReply("answer", true, h.deps);
  assert.match(h.actions[0], /ยังส่งแจ้งเตือนให้ทีมแอดมินไม่สำเร็จ/u);
  assert.equal(h.actions.includes("pause"), false);
});
test("external human takeover during notification suppresses AI reply", async () => {
  let checks = 0;
  const h = harness({canSend: async () => ++checks === 1});
  assert.equal((await deliverAgentReply("answer", true, h.deps)).sent, false);
  assert.deepEqual(h.actions, ["notify"]);
});
test("failed LINE reply cannot write memory or pause", async () => {
  const h = harness({reply: async () => { throw new Error("offline"); }});
  await assert.rejects(deliverAgentReply("answer", true, h.deps));
  assert.deepEqual(h.actions, ["notify"]);
});
test("ordinary AI answer does not notify or pause", async () => {
  const h = harness();
  await deliverAgentReply("ผลการตรวจ", false, h.deps);
  assert.deepEqual(h.actions, ["reply:ผลการตรวจ", "remember"]);
});
