/**
 * Mimi AI Core Brain Gateway
 * Central orchestrator for the Modular Multi-Brain Architecture:
 * - Level 0: Micro-Reflex Engine (<1ms, 0 Token)
 * - Level 1: High-Speed Intent Classifier (<2ms)
 * - Sub-Brain A: Support & Troubleshooting (Strict, no sales, step-by-step)
 * - Sub-Brain B: Sales & Storefront (Filtered catalog, 24h auto web orders)
 * - Sub-Brain C: Concierge & Hospitality (Friendly greeter, Genius Brat)
 * - Sub-Brain D: Admin Operations & Security (LINE group tier matrix & financial shielding)
 */

import { matchMicroReflex } from "./router/micro-reflex";
import { classifyCustomerIntent, MimiCustomerIntent } from "./router/intent-router";
import { generateSupportReply } from "./brains/support-brain";
import { generateSalesReply } from "./brains/sales-brain";
import { generateConciergeReply } from "./brains/concierge-brain";
import { parseAdminMessageWithGemini } from "./brains/admin-brain";
import { MimiCustomerProfile, ConversationMessage } from "./memory";
import { SimpleProduct } from "@/lib/line/handler";

export * from "./personality";
export * from "./knowledge";
export * from "./database-access";
export * from "./admin-tiers";
export * from "./memory";
export * from "./router/micro-reflex";
export * from "./router/intent-router";
export * from "./brains/support-brain";
export * from "./brains/sales-brain";
export * from "./brains/concierge-brain";
export * from "./brains/admin-brain";

export interface DispatchCustomerResult {
  replyText: string;
  intent: MimiCustomerIntent;
  wasReflex: boolean;
}

export interface DispatchCustomerParams {
  userText: string;
  products: SimpleProduct[];
  history?: ConversationMessage[];
  profile?: MimiCustomerProfile;
  imagePart?: { mimeType: string; data: string };
}

/**
 * Dispatches customer message to the optimal sub-brain with zero delay.
 */
export async function dispatchMimiBrain(
  params: DispatchCustomerParams
): Promise<DispatchCustomerResult> {
  const { userText, products, history = [], profile, imagePart } = params;

  // 1. Level 0: Instant Micro-Reflex (< 1ms, 0 tokens)
  // Gratitude / OK / confirmations bypass LLM entirely
  if (!imagePart) {
    const reflexReply = matchMicroReflex(userText);
    if (reflexReply) {
      return {
        replyText: reflexReply,
        intent: "MICRO_REFLEX",
        wasReflex: true,
      };
    }
  }

  // 2. Level 1: Intent Classification (< 2ms) with multi-turn conversation context
  const classification = classifyCustomerIntent(userText, Boolean(imagePart), history);

  let replyText = "";

  switch (classification.intent) {
    case "SUPPORT":
      replyText = await generateSupportReply({
        userText,
        history,
        profile,
        imagePart,
      });
      break;

    case "SALES":
      replyText = await generateSalesReply({
        userText,
        products,
        matchedApps: classification.matchedApps,
        excludedApps: classification.excludedApps,
        isAskingAllCatalog: classification.isAskingAllCatalog,
        isAskingOtherProducts: classification.isAskingOtherProducts,
        history,
        profile,
      });
      break;

    case "CONCIERGE":
    default:
      replyText = await generateConciergeReply({
        userText,
        history,
        profile,
      });
      break;
  }

  return {
    replyText,
    intent: classification.intent,
    wasReflex: false,
  };
}
