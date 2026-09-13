import {
  mysqlTable,
  varchar,
  text,
  mediumtext,
  longtext,
  int,
  tinyint,
  decimal,
  datetime,
} from "drizzle-orm/mysql-core";

// ==========================================
// Settings Table
// ==========================================
export const settings = mysqlTable("settings", {
  id: varchar("id", { length: 128 }).primaryKey().notNull(),
  key: varchar("key", { length: 255 }),
  value: mediumtext("value"),
  description: text("description"),
  createdAt: datetime("created_at", { fsp: 6 }),
  updatedAt: datetime("updated_at", { fsp: 6 }),
  siteId: varchar("site_id", { length: 50 }).notNull().default("main"),
});

// ==========================================
// Categories Table
// ==========================================
export const categories = mysqlTable("categories", {
  id: varchar("id", { length: 128 }).primaryKey().notNull(),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  imageUrl: longtext("image_url"),
  displayOrder: int("display_order"),
  isActive: tinyint("is_active").default(1),
  createdAt: datetime("created_at", { fsp: 6 }),
  updatedAt: datetime("updated_at", { fsp: 6 }),
  siteId: varchar("site_id", { length: 255 }).default("main"),
  isLocal: tinyint("is_local").notNull().default(0),
});

// ==========================================
// Products Table
// ==========================================
export const products = mysqlTable("products", {
  id: varchar("id", { length: 128 }).primaryKey().notNull(),
  siteId: varchar("site_id", { length: 50 }).default("main"),
  isLocal: tinyint("is_local").default(0),
  typeId: varchar("type_id", { length: 255 }),
  name: varchar("name", { length: 255 }),
  imageUrl: longtext("image_url"),
  details: text("details"),
  price: decimal("price", { precision: 10, scale: 2 }),
  priceVip: decimal("price_vip", { precision: 10, scale: 2 }),
  priceWalkin: decimal("price_walkin", { precision: 10, scale: 2 }),
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }),
  stock: int("stock").default(0),
  typeMenu: varchar("type_menu", { length: 255 }),
  isPublished: tinyint("is_published").default(0),
  createdAt: datetime("created_at", { fsp: 6 }),
  updatedAt: datetime("updated_at", { fsp: 6 }),
  apiProviderId: varchar("api_provider_id", { length: 128 }),
  badge: varchar("badge", { length: 100 }),
  categoryId: varchar("category_id", { length: 128 }),
  accountEmail: varchar("account_email", { length: 255 }),
  accountPassword: varchar("account_password", { length: 255 }),
  accountData: longtext("account_data"),
  stockDeliveryType: varchar("stock_delivery_type", { length: 32 }).notNull().default("account-pool"),
});

// ==========================================
// Users Table
// ==========================================
export const users = mysqlTable("users", {
  id: varchar("id", { length: 128 }).primaryKey().notNull(),
  email: varchar("email", { length: 255 }),
  passwordHash: varchar("password_hash", { length: 255 }),
  displayName: varchar("display_name", { length: 255 }),
  createdAt: datetime("created_at", { fsp: 6 }),
  updatedAt: datetime("updated_at", { fsp: 6 }),
  isAdmin: tinyint("is_admin").default(0),
  isActive: tinyint("is_active").default(1),
  points: decimal("points", { precision: 10, scale: 2 }).default("0.00"),
  role: varchar("role", { length: 50 }).default("member"),
  userTier: varchar("user_tier", { length: 50 }).default("normal"),
  tierExpiresAt: datetime("tier_expires_at", { fsp: 6 }),
  isBanned: tinyint("is_banned").notNull().default(0),
  totalTopupAmount: decimal("total_topup_amount", { precision: 10, scale: 2 }).default("0.00"),
  topupCount: int("topup_count").default(0),
  lastTopupAt: datetime("last_topup_at", { fsp: 6 }),
  siteId: varchar("site_id", { length: 50 }).notNull().default("main"),
  isApiEnabled: tinyint("is_api_enabled").default(0),
});

// ==========================================
// Orders Table
// ==========================================
export const orders = mysqlTable("orders", {
  id: varchar("id", { length: 128 }).primaryKey().notNull(),
  caseOrderId: varchar("case_order_id", { length: 36 }),
  caseItemIndex: int("case_item_index"),
  purchaseRequestId: varchar("purchase_request_id", { length: 36 }),
  purchaseItemIndex: int("purchase_item_index"),
  purchaseOptionId: varchar("purchase_option_id", { length: 128 }),
  purchaseOptionName: varchar("purchase_option_name", { length: 255 }),
  purchaseOptionQuantity: int("purchase_option_quantity"),
  externalUid: varchar("external_uid", { length: 255 }),
  productTypeId: varchar("product_type_id", { length: 255 }),
  productName: varchar("product_name", { length: 255 }),
  productImage: text("product_image"),
  productDetails: text("product_details"),
  price: decimal("price", { precision: 10, scale: 2 }),
  typeMenu: varchar("type_menu", { length: 255 }),
  purchaseDate: datetime("purchase_date", { fsp: 6 }),
  usernameBuy: varchar("username_buy", { length: 255 }),
  buyerUserId: varchar("buyer_user_id", { length: 128 }),
  rawResponse: longtext("raw_response"),
  createdAt: datetime("created_at", { fsp: 6 }),
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }),
  profit: decimal("profit", { precision: 10, scale: 2 }),
  buyerEmail: varchar("buyer_email", { length: 255 }),
  buyerDisplayName: varchar("buyer_display_name", { length: 255 }),
  apiProviderId: varchar("api_provider_id", { length: 128 }),
  accountEmail: varchar("account_email", { length: 255 }),
  accountPassword: varchar("account_password", { length: 255 }),
  siteId: varchar("site_id", { length: 50 }).notNull().default("main"),
  isLocal: tinyint("is_local").default(0),
});

// ==========================================
// Support Cases Table
// ==========================================
export const supportCases = mysqlTable("support_cases", {
  id: varchar("id", { length: 128 }).primaryKey().notNull(),
  caseCode: varchar("case_code", { length: 100 }),
  userId: varchar("user_id", { length: 128 }),
  orderId: varchar("order_id", { length: 128 }),
  productTypeId: varchar("product_type_id", { length: 255 }),
  productName: varchar("product_name", { length: 255 }),
  accountEmail: varchar("account_email", { length: 255 }),
  accountPassword: varchar("account_password", { length: 255 }),
  expirationDate: varchar("expiration_date", { length: 100 }),
  caseType: varchar("case_type", { length: 100 }),
  screenNumber: varchar("screen_number", { length: 50 }),
  problemDescription: text("problem_description"),
  status: varchar("status", { length: 50 }).default("pending"),
  adminNote: text("admin_note"),
  adminResponse: text("admin_response"),
  createdAt: datetime("created_at", { fsp: 6 }),
  updatedAt: datetime("updated_at", { fsp: 6 }),
  siteId: varchar("site_id", { length: 50 }).notNull().default("main"),
  shopName: varchar("shop_name", { length: 255 }),
  handledById: varchar("handled_by_id", { length: 128 }),
  handledByName: varchar("handled_by_name", { length: 100 }),
  handledAt: datetime("handled_at", { fsp: 6 }),
  claimIteration: int("claim_iteration").notNull().default(1),
  previousCaseId: varchar("previous_case_id", { length: 128 }),
  isDisputed: tinyint("is_disputed").notNull().default(0),
  disputeReason: text("dispute_reason"),
  verifiedWarrantyStatus: varchar("verified_warranty_status", { length: 50 }),
  verifiedRemainingDays: int("verified_remaining_days"),
});

// ==========================================
// Web Push Subscriptions Table
// ==========================================
export const webPushSubscriptions = mysqlTable("web_push_subscriptions", {
  id: varchar("id", { length: 128 }).primaryKey().notNull(),
  userId: varchar("user_id", { length: 128 }).notNull(),
  siteId: varchar("site_id", { length: 50 }).notNull().default("main"),
  endpoint: text("endpoint").notNull(),
  endpointHash: varchar("endpoint_hash", { length: 64 }).notNull(),
  p256dh: text("p256dh").notNull(),
  auth: varchar("auth", { length: 255 }).notNull(),
  userAgent: varchar("user_agent", { length: 255 }),
  role: varchar("role", { length: 50 }).notNull().default("user"),
  createdAt: datetime("created_at", { fsp: 6 }),
  updatedAt: datetime("updated_at", { fsp: 6 }),
});

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = typeof settings.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;
export type SupportCase = typeof supportCases.$inferSelect;
export type InsertSupportCase = typeof supportCases.$inferInsert;
export type WebPushSubscription = typeof webPushSubscriptions.$inferSelect;
export type InsertWebPushSubscription = typeof webPushSubscriptions.$inferInsert;

