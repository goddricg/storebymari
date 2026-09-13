import assert from "node:assert/strict";
import test from "node:test";
import { formatGroupHistoryForAgent, type GroupMessageContext } from "../src/lib/mimi/memory";

test("group history keeps teammate identity and alternates MIMI replies", () => {
  const history: GroupMessageContext[] = [
    { groupId: "group-1", senderId: "Ustaff", senderName: "Som", tier: "B", callName: "พี่ส้ม", text: "Capcut เหลือเท่าไหร่", timestamp: 1 },
    { groupId: "group-1", senderId: "__mimi__", senderName: "มิมิ", tier: "MIMI", callName: "มิมิ", text: "เดี๋ยวมิมิหยิบข้อมูลสดให้ค่า", timestamp: 2 },
  ];
  assert.deepEqual(formatGroupHistoryForAgent(history).map((entry) => entry.role), ["user", "model"]);
  assert.match(formatGroupHistoryForAgent(history)[0].text, /Tier B/);
  assert.match(formatGroupHistoryForAgent(history)[0].text, /Capcut/);
  assert.equal(formatGroupHistoryForAgent(history)[1].text, "เดี๋ยวมิมิหยิบข้อมูลสดให้ค่า");
});
