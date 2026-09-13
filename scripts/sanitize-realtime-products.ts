import "dotenv/config";
import { FieldValue } from "firebase-admin/firestore";

import { db } from "../src/lib/firebase-admin";
import { FIRESTORE_PRODUCT_FIELDS_TO_DELETE } from "../src/lib/products/realtime-sanitization";

const BATCH_SIZE = 400;

async function main() {
  const references = await db.collection("products").listDocuments();
  let sanitized = 0;

  for (let start = 0; start < references.length; start += BATCH_SIZE) {
    const batch = db.batch();

    for (const reference of references.slice(start, start + BATCH_SIZE)) {
      const deletions = Object.fromEntries(
        FIRESTORE_PRODUCT_FIELDS_TO_DELETE.map((field) => [
          field,
          FieldValue.delete(),
        ])
      );
      batch.set(reference, deletions, { merge: true });
    }

    await batch.commit();
    sanitized += Math.min(BATCH_SIZE, references.length - start);
  }

  console.log(
    `[realtime-security] Removed sensitive fields from ${sanitized} product documents.`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[realtime-security] Sanitization failed: ${message}`);
  process.exitCode = 1;
});
