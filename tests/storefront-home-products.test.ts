import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ProductsGridClient from "../src/components/products/products-grid-client";
import { CartProvider } from "../src/components/cart/cart-provider";
import { ProductStockRealtimeProvider } from "../src/components/products/product-stock-realtime-provider";
import { PublicSettingsProvider } from "../src/components/public-settings-provider";
import { LAYOUT_PUBLIC_SETTING_KEYS, type LayoutPublicSettings } from "../src/lib/settings/public-keys";

const testPublicSettings = Object.fromEntries(
  LAYOUT_PUBLIC_SETTING_KEYS.map((key) => [key, null]),
) as LayoutPublicSettings;

function withChild<P extends { children: ReactNode }>(
  Component: ComponentType<P>,
  props: Omit<P, "children">,
  child: ReactNode,
) {
  return createElement(Component, props as P, child);
}

test("homepage does not render product cards when there are no published products", () => {
  const markup = renderToStaticMarkup(
    createElement(ProductsGridClient, {
      initialProducts: [],
      initialTotal: 0,
      initialTotalPages: 1,
      layout: "home",
      showFilters: false,
      showPagination: true,
    }),
  );

  assert.match(markup, /data-testid="homepage-product-grid"/);
  assert.match(markup, /ขณะนี้ยังไม่มีสินค้าในหน้าร้าน/);
  assert.doesNotMatch(markup, /aria-label="เลือกหน้า"|>NEXT</);
  assert.doesNotMatch(markup, /storefront-product-card|การ์ดตัวอย่างสินค้า|DEMO/);
});

test("homepage shows page selection and NEXT when there is more than one 10-item page", () => {
  const markup = renderToStaticMarkup(
    createElement(ProductsGridClient, {
      initialProducts: [],
      initialTotal: 21,
      initialTotalPages: 2,
      layout: "home",
      showFilters: false,
      pageSize: 10,
      showPagination: true,
    }),
  );

  assert.match(markup, /aria-label="เลือกหน้า"/);
  assert.match(markup, /<option[^>]*value="1"[^>]*>หน้า 1<\/option>/);
  assert.match(markup, /<option[^>]*value="2"[^>]*>หน้า 2<\/option>/);
  assert.match(markup, />NEXT</);
});

test("homepage caps each product page at ten cards in a five-column grid", () => {
  const products = Array.from({ length: 12 }, (_, index) => ({
    id: `product-${index + 1}`,
    typeId: `type-${index + 1}`,
    name: `สินค้า ${index + 1}`,
    imageUrl: null,
    typeImageUrl: null,
    details: null,
    price: 10,
    priceVip: null,
    priceWalkin: null,
    stock: 1,
    typeMenu: null,
    badge: null,
  }));

  const markup = renderToStaticMarkup(
    withChild(
      PublicSettingsProvider,
      { settings: testPublicSettings },
      withChild(
        CartProvider,
        {},
        withChild(
          ProductStockRealtimeProvider,
          {},
          createElement(ProductsGridClient, {
            initialProducts: products,
            initialTotal: products.length,
            initialTotalPages: 2,
            layout: "home",
            showFilters: false,
            pageSize: 10,
            showPagination: true,
          }),
        ),
      ),
    ),
  );

  assert.equal((markup.match(/data-card-layer="background"/g) ?? []).length, 10);
  assert.match(markup, /grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5/);
});

test("catalog chips layout keeps the catalog grid at six columns on wide screens", () => {
  const products = Array.from({ length: 12 }, (_, index) => ({
    id: `catalog-product-${index + 1}`,
    typeId: `catalog-type-${index + 1}`,
    name: `สินค้าแคตตาล็อก ${index + 1}`,
    imageUrl: null,
    typeImageUrl: null,
    details: null,
    price: 69,
    priceVip: null,
    priceWalkin: null,
    stock: 1,
    typeMenu: null,
    badge: null,
  }));

  const markup = renderToStaticMarkup(
    withChild(
      PublicSettingsProvider,
      { settings: testPublicSettings },
      withChild(
        CartProvider,
        {},
        withChild(
          ProductStockRealtimeProvider,
          {},
          createElement(ProductsGridClient, {
            initialProducts: products,
            initialTotal: products.length,
            initialTotalPages: 1,
            initialCategories: [{ category: "Netflix", imageUrl: null, count: products.length }],
            categoryLayout: "chips",
            pageSize: 12,
            showPagination: true,
          }),
        ),
      ),
    ),
  );

  assert.match(markup, /class="products-grid-client products-grid-client--chips w-full"/);
  assert.match(markup, /class="products-catalog-category-strip w-full"/);
  assert.match(markup, /data-testid="catalog-product-grid"[^>]*xl:grid-cols-4[^>]*2xl:grid-cols-6/);
  assert.equal((markup.match(/data-card-layer="background"/g) ?? []).length, 24);
  assert.doesNotMatch(markup, /<aside class="hidden lg:block">/);
});
