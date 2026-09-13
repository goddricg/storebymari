/** Fields that must never remain in client-readable realtime product documents. */
export const FIRESTORE_PRODUCT_FIELDS_TO_DELETE = [
  "account_email",
  "account_password",
  "account_data",
  "accountEmail",
  "accountPassword",
  "accountData",
  "cost_price",
  "costPrice",
  "raw_response",
  "rawResponse",
] as const;
