import { createHash, randomUUID } from "crypto";

export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export type PurchasePayload = {
  typeId: string;
  quantity: number;
};

export type ExistingPurchaseSnapshot = {
  requestFingerprint: string | null;
  status: string;
  responseStatus: number | null;
  savedResponse: string | null;
};

export type ExistingPurchaseDecision =
  | { kind: "conflict" }
  | { kind: "processing" }
  | { kind: "replay"; status: number; body: unknown };

export function createPurchaseFingerprint(payload: PurchasePayload): string {
  const canonicalPayload = JSON.stringify({
    quantity: payload.quantity,
    typeId: payload.typeId,
  });

  return createHash("sha256").update(canonicalPayload).digest("hex");
}

export function resolvePurchaseIdempotencyKey(input: {
  headerKey: string | null;
  requestId?: string;
}): { key: string; isLegacy: boolean } {
  const headerKey = input.headerKey?.trim();
  if (headerKey) {
    return { key: headerKey, isLegacy: false };
  }

  const requestId = input.requestId?.trim();
  if (requestId) {
    return { key: requestId, isLegacy: false };
  }

  return { key: `legacy-${randomUUID()}`, isLegacy: true };
}

export function decideExistingPurchase(
  snapshot: ExistingPurchaseSnapshot,
  requestFingerprint: string
): ExistingPurchaseDecision {
  if (
    snapshot.requestFingerprint &&
    snapshot.requestFingerprint !== requestFingerprint
  ) {
    return { kind: "conflict" };
  }

  if (
    (snapshot.status === "SUCCEEDED" || snapshot.status === "FAILED") &&
    snapshot.savedResponse &&
    snapshot.responseStatus
  ) {
    try {
      return {
        kind: "replay",
        status: snapshot.responseStatus,
        body: JSON.parse(snapshot.savedResponse) as unknown,
      };
    } catch {
      return { kind: "processing" };
    }
  }

  return { kind: "processing" };
}
