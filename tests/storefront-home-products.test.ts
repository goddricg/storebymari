import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ProductsGridClient from "../src/components/products/products-grid-client";

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

test("homepage shows page selection and NEXT when there is more than one 20-item page", () => {
  const markup = renderToStaticMarkup(
    createElement(ProductsGridClient, {
      initialProducts: [],
      initialTotal: 21,
      initialTotalPages: 2,
      layout: "home",
      showFilters: false,
      pageSize: 20,
      showPagination: true,
    }),
  );

  assert.match(markup, /aria-label="เลือกหน้า"/);
  assert.match(markup, /<option[^>]*value="1"[^>]*>หน้า 1<\/option>/);
  assert.match(markup, /<option[^>]*value="2"[^>]*>หน้า 2<\/option>/);
  assert.match(markup, />NEXT</);
});
