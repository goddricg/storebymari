import assert from "node:assert/strict";
import test from "node:test";
import { absoluteUrl, catalogPath, decodeProductPathSegment, pageMetadata, parseCatalogQuery, productPath, serializeJsonLd } from "../src/lib/seo";
import { productStructuredData } from "../src/lib/products/seo";
import type { PublicStorefrontProduct } from "../src/lib/products/public-product";
import { getSiteConfig } from "../src/lib/site-config";

const product: PublicStorefrontProduct = {
  id: "sample", typeId: "appbymari:รายการ / A", name: "Example Premium", details: "รายละเอียด </script><script>alert(1)</script>",
  imageUrl: "/example.png", typeImageUrl: null, price: 100, priceVip: 80, priceWalkin: 120,
  stock: 2, typeMenu: "Streaming", categoryId: null, isPublished: true, badge: null, createdAt: "", updatedAt: "",
};

test("StoreByMari canonicals resolve directly to the production www host", () => {
  const previousBase = process.env.NEXT_PUBLIC_BASE_URL;
  const previousSite = process.env.NEXT_PUBLIC_SITE_ID;
  try {
    process.env.NEXT_PUBLIC_SITE_ID = "main";
    process.env.NEXT_PUBLIC_BASE_URL = "https://storebymari.com/";
    assert.equal(getSiteConfig().siteUrl, "https://www.storebymari.com");
    process.env.NEXT_PUBLIC_BASE_URL = "https://another.example/";
    assert.equal(getSiteConfig().siteUrl, "https://another.example");
  } finally {
    if (previousBase === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_BASE_URL = previousBase;
    if (previousSite === undefined) delete process.env.NEXT_PUBLIC_SITE_ID;
    else process.env.NEXT_PUBLIC_SITE_ID = previousSite;
  }
});

test("JSON-LD safely roundtrips catalogue text without closing its script", () => {
  const value = { description: product.details, name: "A&B > C" };
  const serialized = serializeJsonLd(value);
  assert.ok(!serialized.includes("<"));
  assert.deepEqual(JSON.parse(serialized), value);
});

test("product URLs safely encode reserved characters and Thai names", () => {
  const path = productPath(product.typeId);
  assert.equal(path.split("/").length, 3);
  assert.equal(decodeURIComponent(path.slice("/products/".length)), product.typeId);
  assert.equal(decodeProductPathSegment(path.slice("/products/".length)), product.typeId);
  assert.equal(decodeProductPathSegment(product.typeId), product.typeId);
});

test("catalogue URLs preserve page and filters with bounded input", () => {
  assert.equal(parseCatalogQuery({ page: "-1" }).page, 1);
  assert.equal(parseCatalogQuery({ page: "Infinity" }).page, 1);
  assert.equal(parseCatalogQuery({ page: "1001" }).page, 1000);
  const query = parseCatalogQuery({ page: ["2", "9"], category: " แอพทำงาน ", search: "A & B" });
  const url = new URL(catalogPath(query), "https://example.test");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("category"), "แอพทำงาน");
  assert.equal(url.searchParams.get("search"), "A & B");
  assert.equal(catalogPath(parseCatalogQuery({})), "/products");
});

test("public pages have their own canonical and search results opt out of indexing", () => {
  assert.deepEqual(pageMetadata("Products", "Description", "/products?page=2").alternates, { canonical: absoluteUrl("/products?page=2") });
  assert.deepEqual(pageMetadata("Search", "Description", "/products?search=x", true).robots, { index: false, follow: true });
});

test("product offers match guest pricing and stock without inventing ratings or leaking internal data", () => {
  const schema = productStructuredData({ ...product, accountPassword: "DO_NOT_EXPOSE", costPrice: 10 } as PublicStorefrontProduct);
  assert.equal(schema.offers?.price, "120.00");
  assert.equal(schema.offers?.priceCurrency, "THB");
  assert.equal(schema.offers?.availability, "https://schema.org/InStock");
  assert.ok(!JSON.stringify(schema).includes("DO_NOT_EXPOSE"));
  assert.ok(!("aggregateRating" in schema));
  assert.ok(!("costPrice" in schema));
  assert.equal(productStructuredData({ ...product, stock: 0, priceWalkin: null }).offers?.price, "100.00");
  assert.equal(productStructuredData({ ...product, stock: 0 }).offers?.availability, "https://schema.org/OutOfStock");
});

test("missing or invalid public prices do not generate misleading offers", () => {
  for (const value of [null, NaN, -1, Infinity]) {
    assert.ok(!("offers" in productStructuredData({ ...product, price: value, priceWalkin: null })));
  }
  assert.equal(productStructuredData({ ...product, priceWalkin: 0 }).offers?.price, "0.00");
  assert.ok(!("image" in productStructuredData({ ...product, imageUrl: "javascript:alert(1)" })));
});
