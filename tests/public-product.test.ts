import assert from "node:assert/strict";
import { test } from "node:test";

import { toPublicStorefrontProduct } from "../src/lib/products/public-product";
import { FIRESTORE_PRODUCT_FIELDS_TO_DELETE } from "../src/lib/products/realtime-sanitization";
import type { Product } from "../src/lib/products/types";

const secretMarker = "test-only-delivery-secret";

const product: Product = {
  id: "product-1",
  typeId: "canva-edu",
  name: "Canva EDU",
  imageUrl: "/uploads/canva.png",
  typeImageUrl: "/uploads/canva.png",
  details: "Public product description",
  price: 100,
  mainPrice: 90,
  priceVip: 95,
  costPrice: 3,
  priceWalkin: 100,
  stock: 12,
  typeMenu: "Canva",
  categoryId: "category-1",
  accountEmail: `email-${secretMarker}`,
  accountPassword: secretMarker,
  accountData: [
    {
      email: `email-${secretMarker}`,
      password: secretMarker,
      details: secretMarker,
    },
  ],
  isPublished: true,
  apiProviderId: "provider-internal",
  badge: "recommended",
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
};

test("public storefront product never serializes delivery or internal fields", () => {
  const publicProduct = toPublicStorefrontProduct(product);
  const serialized = JSON.stringify(publicProduct);

  assert.equal("accountEmail" in publicProduct, false);
  assert.equal("accountPassword" in publicProduct, false);
  assert.equal("accountData" in publicProduct, false);
  assert.equal("costPrice" in publicProduct, false);
  assert.equal("mainPrice" in publicProduct, false);
  assert.equal("apiProviderId" in publicProduct, false);
  assert.equal(serialized.includes(secretMarker), false);
});

test("realtime cleanup removes credential and internal product fields", () => {
  assert.deepEqual(FIRESTORE_PRODUCT_FIELDS_TO_DELETE, [
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
  ]);
});
