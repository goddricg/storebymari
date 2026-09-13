/**
 * LINE Quick Reply templates for Customer 1:1 Chat
 * These provide quick action chips floating right above the user's keyboard
 */

export function getCustomerQuickReply() {
  return {
    items: [
      {
        type: "action",
        action: {
          type: "message",
          label: "📦 เช็กสต๊อก",
          text: "มิมิ ช่วยเช็กสต๊อกสินค้าให้หน่อย",
        },
      },
      {
        type: "action",
        action: {
          type: "message",
          label: "🔧 แจ้งปัญหา",
          text: "มิมิ มีปัญหาการใช้งาน ขอให้ช่วยหน่อย",
        },
      },
      {
        type: "action",
        action: {
          type: "message",
          label: "🙋‍♀️ ติดต่อแอดมิน",
          text: "ขอคุยกับแอดมิน",
        },
      },
      {
        type: "action",
        action: {
          type: "uri",
          label: "🛒 เว็บไซต์ร้าน",
          uri: "https://storebymari.com",
        },
      },
    ],
  };
}
