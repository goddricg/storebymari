import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const repositoryRoot = path.resolve(__dirname, "..");

function assetPath(relativePath: string) {
  return path.join(repositoryRoot, relativePath);
}

function readPngDimensions(relativePath: string) {
  const contents = readFileSync(assetPath(relativePath));
  assert.equal(contents.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  return {
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
  };
}

test("Store by Mari favicon and app icons are present in every supported size", () => {
  const canonicalLogo = readFileSync(assetPath("public/branding/storebymari-logo.png"));
  const canonicalLogoHash = createHash("sha256").update(canonicalLogo).digest("hex");

  assert.equal(canonicalLogoHash, "f544cc48fe4159f239fa4397d161933986dd968c3c3c2d57fd569ca603f5eebf");
  assert.deepEqual(readPngDimensions("src/app/icon.png"), { width: 512, height: 512 });
  assert.deepEqual(readPngDimensions("src/app/apple-icon.png"), { width: 180, height: 180 });

  for (const relativePath of [
    "public/apple-touch-icon.png",
    "public/apple-icon.png",
    "public/pwa-app-icon-192.png",
    "public/pwa-app-icon-512.png",
    "public/pwa-app-icon-maskable-192.png",
    "public/pwa-app-icon-maskable-512.png",
    "public/icon-192x192.png",
    "public/icon-512x512.png",
    "public/icons/icon-192x192.png",
    "public/icons/icon-maskable-192x192.png",
    "public/icons/icon-512x512.png",
    "public/icons/icon-maskable-512x512.png",
    "public/badge-72x72.png",
  ]) {
    assert.ok(statSync(assetPath(relativePath)).size > 0, `${relativePath} should not be empty`);
  }

  const favicon = readFileSync(assetPath("src/app/favicon.ico"));
  assert.equal(favicon.readUInt16LE(0), 0, "favicon ICO reserved field");
  assert.equal(favicon.readUInt16LE(2), 1, "favicon ICO type field");
  assert.ok(favicon.readUInt16LE(4) >= 3, "favicon should include browser sizes");
});
