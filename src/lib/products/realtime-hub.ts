import { collection, onSnapshot } from "firebase/firestore";
import { clientDb } from "@/lib/firebase-client";
import {
  rowToProductLivePatch,
  type ProductLivePatch,
  type ProductRealtimeRow,
} from "@/lib/products/realtime-types";

export type ProductRealtimeListener = (patch: ProductLivePatch) => void;

const listeners = new Set<ProductRealtimeListener>();
let unsubscribeSnapshot: (() => void) | null = null;
let subscriberCount = 0;
const realtimePushEnabled =
  process.env.NEXT_PUBLIC_FIREBASE_REALTIME_ENABLED === "true";

function emit(patch: ProductLivePatch) {
  listeners.forEach((listener) => {
    try {
      listener(patch);
    } catch (error) {
      console.error("[realtime] listener error:", error);
    }
  });
}

function handleDocChange(type: "added" | "modified" | "removed", docId: string, data: any) {
  if (type === "removed") {
    emit({
      id: docId,
      typeId: data.type_id ?? "",
      stock: 0,
      badge: null,
      isPublished: false,
      price: null,
      priceVip: null,
      priceWalkin: null,
    });
    return;
  }

  const row: ProductRealtimeRow = {
    id: docId,
    type_id: data.type_id ?? "",
    stock: data.stock ?? null,
    account_data: data.account_data ?? null,
    badge: data.badge ?? null,
    is_published: data.is_published ?? false,
    price: data.price !== undefined ? data.price : undefined,
    price_vip: data.price_vip !== undefined ? data.price_vip : undefined,
    price_walkin: data.price_walkin !== undefined ? data.price_walkin : undefined,

    price_main: data.price_main !== undefined ? data.price_main : undefined,
    price_main_vip: data.price_main_vip !== undefined ? data.price_main_vip : undefined,
    price_main_walkin: data.price_main_walkin !== undefined ? data.price_main_walkin : undefined,

    price_child1: data.price_child1 !== undefined ? data.price_child1 : undefined,
    price_child1_vip: data.price_child1_vip !== undefined ? data.price_child1_vip : undefined,
    price_child1_walkin: data.price_child1_walkin !== undefined ? data.price_child1_walkin : undefined,

    price_child2: data.price_child2 !== undefined ? data.price_child2 : undefined,
    price_child2_vip: data.price_child2_vip !== undefined ? data.price_child2_vip : undefined,
    price_child2_walkin: data.price_child2_walkin !== undefined ? data.price_child2_walkin : undefined,
  };

  const patch = rowToProductLivePatch(row);
  if (patch) {
    emit(patch);
  }
}

function ensureChannel() {
  if (!realtimePushEnabled) {
    return;
  }
  if (unsubscribeSnapshot) {
    return;
  }

  try {
    const productsCol = collection(clientDb, "products");
    
    unsubscribeSnapshot = onSnapshot(productsCol, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const docId = change.doc.id;
        const data = change.doc.data();
        handleDocChange(change.type, docId, data);
      });
    }, (error) => {
      console.warn("[realtime] Firestore listener error:", error.message);
    });
  } catch (error: any) {
    console.error("[realtime] Failed to setup Firestore listener:", error.message);
  }
}

function teardownChannel() {
  if (!unsubscribeSnapshot) {
    return;
  }
  unsubscribeSnapshot();
  unsubscribeSnapshot = null;
}

/** สมัครรับการเปลี่ยนแปลงสต็อกสินค้า (channel เดียวต่อแท็บ) */
export function subscribeProductStockRealtime(
  listener: ProductRealtimeListener
): () => void {
  listeners.add(listener);
  subscriberCount += 1;
  ensureChannel();

  return () => {
    listeners.delete(listener);
    subscriberCount -= 1;
    if (subscriberCount <= 0) {
      subscriberCount = 0;
      teardownChannel();
    }
  };
}
