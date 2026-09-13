import assert from "node:assert/strict";
import test from "node:test";
import { getCustomerQuickReply } from "../src/lib/line/quick-reply";
import { getCustomerRichMenuMessage } from "../src/lib/line/rich-menu";

test("customer shortcuts use four compact actions with the live MIMI path", () => {
  const quickReply = getCustomerQuickReply();
  assert.equal(quickReply.items.length, 4);
  assert.deepEqual(
    quickReply.items.map((item) => item.action.label),
    ["📦 เช็กสต๊อก", "🔧 แจ้งปัญหา", "🙋‍♀️ ติดต่อแอดมิน", "🛒 เว็บไซต์ร้าน"],
  );
  assert.deepEqual(quickReply.items.slice(0, 3).map((item) => item.action.type), ["message", "message", "message"]);
  assert.equal(quickReply.items[0].action.text, "มิมิ ช่วยเช็กสต๊อกสินค้าให้หน่อย");
  assert.equal(quickReply.items[1].action.text, "มิมิ มีปัญหาการใช้งาน ขอให้ช่วยหน่อย");
  assert.equal(quickReply.items[2].action.text, "ขอคุยกับแอดมิน");
  assert.deepEqual(quickReply.items[3].action, {
    type: "uri",
    label: "🛒 เว็บไซต์ร้าน",
    uri: "https://storebymari.com",
  });
});

test("legacy public menu postbacks stay on the customer agent path", () => {
  assert.equal(getCustomerRichMenuMessage("action=stock"), "มิมิ ช่วยเช็กสต็อกสินค้าให้หน่อย");
  assert.equal(getCustomerRichMenuMessage("product_catalog"), "มิมิ ช่วยเช็กราคาและสินค้าที่มีให้หน่อย");
  assert.equal(getCustomerRichMenuMessage("action=confirmstockfill"), null);
  assert.equal(getCustomerRichMenuMessage("unknown-action"), null);
});
