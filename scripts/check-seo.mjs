import assert from "node:assert/strict";

const base = new URL(process.argv[2] || "http://127.0.0.1:3100");
const canonicalOrigin = "https://www.storebymari.com";
const read = async (path) => {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000) });
  const html = await response.text();
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return html;
};
const canonical = html => html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
const schemas = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
const productLinks = html => new Set([...html.matchAll(/href="(\/products\/[^"?#]+)"/g)].map(match => match[1]));

for (const path of ["/", "/products", "/buying-guide"]) {
  const html = await read(path);
  assert.equal(new URL(canonical(html)).href, `${canonicalOrigin}${path}`, `${path}: canonical`);
  assert.match(html, /name="robots" content="index, follow"/);
  assert.match(html, /<h1\b/);
  assert.ok(schemas(html).some(item => item["@type"] === "Organization"));
  if (path === "/products") assert.ok(productLinks(html).size > 0, "Products must be in server HTML without executing JavaScript");
  if (path === "/buying-guide") {
    const faq = schemas(html).find(item => item["@type"] === "FAQPage");
    assert.ok(faq.mainEntity.length >= 5);
    for (const item of faq.mainEntity) assert.ok(html.includes(item.name) && html.includes(item.acceptedAnswer.text), "FAQ content must be visible too");
  }
  console.log(`PASS ${path}: canonical, indexability, server HTML, JSON-LD`);
}
const sitemap = await read("/sitemap.xml");
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert.equal(urls.length, new Set(urls).size);
assert.ok(urls.every(url => url.startsWith(`${canonicalOrigin}/`)));
assert.ok(urls.every(url => !/\/(admin|dashboard|api|support|login|register)(\/|$)/.test(new URL(url).pathname)));
const products = urls.filter(url => new URL(url).pathname.startsWith("/products/"));
assert.ok(products.length > 0, "Published product sitemap must not be empty");
const detailPath = new URL(products[0]).pathname;
const detail = await read(detailPath);
assert.equal(canonical(detail), products[0]);
const schema = schemas(detail).find(item => item["@type"] === "Product");
assert.ok(schema?.name && schema?.url);
assert.ok(!("aggregateRating" in schema));
assert.ok(!/accountPassword|accountEmail|accountData|costPrice|apiProviderId/.test(JSON.stringify(schema)));
console.log(`PASS product detail: server content and public Product schema; sitemap ${products.length} products`);
if (products.length > 12) {
  const first = productLinks(await read("/products"));
  const secondHtml = await read("/products?page=2");
  assert.equal(canonical(secondHtml), `${canonicalOrigin}/products?page=2`);
  const second = productLinks(secondHtml);
  assert.ok(second.size > 0 && [...second].some(link => !first.has(link)), "Page two must render different products on the server");
  console.log("PASS pagination: distinct server-rendered products and self-canonical");
}
for (const path of ["/login", "/register", "/cart", "/support/check"]) {
  assert.match(await read(path), /name="robots" content="noindex, follow"/, `${path}: noindex`);
}
const filtered = await read("/products?search=seo-unmatched-fixture");
assert.match(filtered, /name="robots" content="noindex, follow"/);
const missing = await fetch(new URL("/products/seo-nonexistent-fixture-20260917", base));
const missingHtml = await missing.text();
assert.ok(missing.status === 404 || /name="robots" content="noindex"/.test(missingHtml), "Unknown products must be 404 or a streamed Next not-found with noindex");
const robots = await read("/robots.txt");
assert.ok(robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`));
assert.ok(robots.includes("Disallow: /api/"));
console.log("PASS noindex boundaries, missing product, and robots.txt");
