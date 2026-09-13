export const RECEIPT_FIXED_SELLER = {
  name: "หจก. มาริ สตูดิโอ",
  addressLine1: "ที่อยู่ : 81/748 ซอยประชาอุทิศ 79",
  addressLine2: "แขวง ทุ่งครุ เขตทุ่งครุ กรุงเทพมหานคร 10140",
  address: "ที่อยู่ : 81/748 ซอยประชาอุทิศ 79 แขวง ทุ่งครุ เขตทุ่งครุ กรุงเทพมหานคร 10140",
  taxId: "0103569007994",
  email: process.env.SELLER_EMAIL?.trim() || "",
  phone: "096-605-6254",
  footer: "storebymari.com - หจก. มาริ สตูดิโอ",
} as const;
