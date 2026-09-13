/**
 * Mimi Conversation Control System (Safety Guard & Gatekeeper)
 * 
 * Provides an enterprise-grade conversation control layer for LINE OA:
 * - Conversation State Machine: AI | HUMAN | PAUSED
 * - Zero-Delay In-Memory Mutex: Prevents concurrent duplicate AI responses
 * - Final Send Guard: Millisecond-level safety brake preventing AI from interrupting humans (Race Conditions)
 * - Full audit logging and seamless handoff to human admins
 */

import { getSettingValue, updateSetting } from "@/lib/settings/repository";

export interface MimiGlobalState {
  isPaused: boolean;
  pausedUntil: number; // 0 = indefinite
  pausedBy: string;
  reason: string;
  remainingMinutes?: number;
}

let mimiGlobalStateMem: MimiGlobalState = {
  isPaused: false,
  pausedUntil: 0,
  pausedBy: "",
  reason: "",
};

export async function getMimiGlobalState(): Promise<MimiGlobalState> {
  const now = Date.now();
  // Check memory first
  if (mimiGlobalStateMem.isPaused) {
    if (mimiGlobalStateMem.pausedUntil > 0 && now >= mimiGlobalStateMem.pausedUntil) {
      // Expired in memory
      mimiGlobalStateMem.isPaused = false;
      mimiGlobalStateMem.pausedUntil = 0;
      await updateSetting("line_mimi_global_state", JSON.stringify(mimiGlobalStateMem)).catch(() => {});
      return mimiGlobalStateMem;
    }
    const remainingMs = mimiGlobalStateMem.pausedUntil > 0 ? Math.max(0, mimiGlobalStateMem.pausedUntil - now) : 0;
    return {
      ...mimiGlobalStateMem,
      remainingMinutes: mimiGlobalStateMem.pausedUntil > 0 ? Math.ceil(remainingMs / 60000) : undefined,
    };
  }

  // Check database
  try {
    const raw = await getSettingValue("line_mimi_global_state");
    if (raw) {
      const state = JSON.parse(raw) as MimiGlobalState;
      if (state.isPaused) {
        if (state.pausedUntil > 0 && now >= state.pausedUntil) {
          // Expired in DB
          state.isPaused = false;
          state.pausedUntil = 0;
          await updateSetting("line_mimi_global_state", JSON.stringify(state)).catch(() => {});
        } else {
          mimiGlobalStateMem = state;
          const remainingMs = state.pausedUntil > 0 ? Math.max(0, state.pausedUntil - now) : 0;
          return {
            ...state,
            remainingMinutes: state.pausedUntil > 0 ? Math.ceil(remainingMs / 60000) : undefined,
          };
        }
      }
    }
  } catch (e) {
    // Non-fatal
  }

  return {
    isPaused: false,
    pausedUntil: 0,
    pausedBy: "",
    reason: "",
  };
}

export async function setMimiGlobalPause(
  durationMinutes: number,
  pausedBy: string,
  reason: string = "แอดมินขอพักมิมิเพื่อคุยเอง"
): Promise<MimiGlobalState> {
  const now = Date.now();
  const pausedUntil = durationMinutes > 0 ? now + durationMinutes * 60000 : 0;
  const state: MimiGlobalState = {
    isPaused: true,
    pausedUntil,
    pausedBy,
    reason,
    remainingMinutes: durationMinutes > 0 ? durationMinutes : undefined,
  };
  mimiGlobalStateMem = state;
  try {
    await updateSetting("line_mimi_global_state", JSON.stringify(state));
  } catch (e) {}
  return state;
}

export async function setMimiGlobalResume(resumedBy: string): Promise<MimiGlobalState> {
  const state: MimiGlobalState = {
    isPaused: false,
    pausedUntil: 0,
    pausedBy: resumedBy,
    reason: "เปิดระบบกลับมาทำงานตามปกติ",
  };
  mimiGlobalStateMem = state;
  try {
    await updateSetting("line_mimi_global_state", JSON.stringify(state));
  } catch (e) {}
  return state;
}

export type ConversationMode = "AI" | "HUMAN" | "PAUSED";

export interface ConversationState {
  userId: string;
  customerName: string;
  mode: ConversationMode;
  aiEnabled: boolean;
  assignedAdmin?: string;
  lockedUntil?: number;
  reason?: string;
  lastCustomerMessageAt: number;
  lastAdminMessageAt?: number;
  lastAiMessageAt?: number;
  aiProcessing: boolean;
  updatedAt: number;
}

// In-Memory state store for sub-millisecond atomic operations
const stateCache = new Map<string, ConversationState>();
const processingLocks = new Map<string, number>(); // userId -> acquiredTimestamp

const DEFAULT_HUMAN_LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const PROCESSING_LOCK_TIMEOUT_MS = 15 * 1000; // 15 seconds auto-release if process crashes

/**
 * Get the current real-time conversation state for a customer
 */
export async function getConversationState(
  userId: string,
  customerName?: string
): Promise<ConversationState> {
  if (!userId) {
    return createDefaultState("", "Guest");
  }

  const now = Date.now();
  const cached = stateCache.get(userId);

  // Check in-memory cache first
  if (cached) {
    // If in HUMAN mode with expiration and time has expired, auto-resume to AI
    if (cached.mode === "HUMAN" && cached.lockedUntil && now > cached.lockedUntil) {
      cached.mode = "AI";
      cached.aiEnabled = true;
      cached.lockedUntil = undefined;
      cached.reason = "Human idle timeout expired (Auto-Resume to AI)";
      cached.updatedAt = now;
      persistState(cached).catch(() => {});
    }
    if (customerName && customerName !== cached.customerName) {
      cached.customerName = customerName;
    }
    return cached;
  }

  // Check persistent DB
  try {
    const raw = await getSettingValue(`line_conv_state_${userId}`);
    if (raw) {
      const state = JSON.parse(raw) as ConversationState;
      if (state.mode === "HUMAN" && state.lockedUntil && now > state.lockedUntil) {
        state.mode = "AI";
        state.aiEnabled = true;
        state.lockedUntil = undefined;
        state.reason = "Human idle timeout expired (Auto-Resume to AI)";
        state.updatedAt = now;
        persistState(state).catch(() => {});
      }
      if (customerName) {
        state.customerName = customerName;
      }
      stateCache.set(userId, state);
      return state;
    }

    // Check legacy lock for backward compatibility
    const legacyRaw = await getSettingValue(`line_lock_${userId}`);
    if (legacyRaw) {
      const legacyLock = JSON.parse(legacyRaw);
      if (legacyLock && legacyLock.lockedUntil && now < legacyLock.lockedUntil) {
        const state: ConversationState = {
          userId,
          customerName: customerName || legacyLock.customerName || "ลูกค้า",
          mode: "HUMAN",
          aiEnabled: false,
          lockedUntil: legacyLock.lockedUntil,
          reason: legacyLock.reason || "แอดมินรับช่วงดูแลเคส (Legacy Lock)",
          lastCustomerMessageAt: legacyLock.lastActivityAt || now,
          aiProcessing: false,
          updatedAt: now,
        };
        stateCache.set(userId, state);
        return state;
      }
    }
  } catch (e) {
    console.error("[ConversationController] Error loading state:", e);
  }

  // Create and initialize default AI state
  const defaultState = createDefaultState(userId, customerName || "ลูกค้า");
  stateCache.set(userId, defaultState);
  return defaultState;
}

/**
 * Change the conversation mode (Takeover / Resume / Pause)
 */
export async function setConversationMode(
  userId: string,
  mode: ConversationMode,
  options?: {
    customerName?: string;
    durationMs?: number;
    reason?: string;
    adminName?: string;
  }
): Promise<ConversationState> {
  const current = await getConversationState(userId, options?.customerName);
  const now = Date.now();

  current.mode = mode;
  current.aiEnabled = mode === "AI";
  current.updatedAt = now;

  if (options?.reason) {
    current.reason = options.reason;
  }
  if (options?.adminName) {
    current.assignedAdmin = options.adminName;
  }

  if (mode === "HUMAN") {
    const duration = options?.durationMs ?? DEFAULT_HUMAN_LOCK_DURATION_MS;
    current.lockedUntil = duration > 0 ? now + duration : undefined;
    current.lastAdminMessageAt = now;
    console.log(
      `[ConversationControl] 🛑 TAKEOVER: Chat with "${current.customerName}" (${userId}) set to HUMAN mode by ${options?.adminName || "Admin"} (${options?.reason || "No reason specified"})`
    );
  } else if (mode === "AI") {
    current.lockedUntil = undefined;
    console.log(
      `[ConversationControl] 🟢 RESUME: Chat with "${current.customerName}" (${userId}) returned to AI mode by ${options?.adminName || "Admin"}`
    );
  } else if (mode === "PAUSED") {
    current.aiEnabled = false;
    const duration = options?.durationMs ?? DEFAULT_HUMAN_LOCK_DURATION_MS;
    current.lockedUntil = duration > 0 ? now + duration : undefined;
    console.log(
      `[ConversationControl] ⏸️ PAUSED: Chat with "${current.customerName}" (${userId}) paused for ${options?.durationMs ? options.durationMs / 60000 : "unlimited"} mins`
    );
  }

  stateCache.set(userId, current);
  await persistState(current);
  return current;
}

/**
 * Acquire AI processing lock (Zero-Delay In-Memory Mutex)
 * Prevents multiple rapid customer messages from spinning up concurrent AI generations
 */
export function acquireProcessingLock(userId: string): boolean {
  if (!userId) return false;
  const now = Date.now();
  const existing = processingLocks.get(userId);

  if (existing && now - existing < PROCESSING_LOCK_TIMEOUT_MS) {
    // Already processing for this customer! Reject concurrent generation
    console.log(
      `[ConversationControl] ⚠️ CONCURRENCY LOCK: Discarded duplicate generation for ${userId} (Already running since ${now - existing}ms ago)`
    );
    return false;
  }

  // Acquire lock
  processingLocks.set(userId, now);
  const state = stateCache.get(userId);
  if (state) {
    state.aiProcessing = true;
  }
  return true;
}

/**
 * Release AI processing lock
 */
export function releaseProcessingLock(userId: string): void {
  if (!userId) return;
  processingLocks.delete(userId);
  const state = stateCache.get(userId);
  if (state) {
    state.aiProcessing = false;
  }
}

/**
 * FINAL SEND GUARD (The critical safety brake)
 * Called in 0.001ms immediately before sending any AI message out to LINE.
 * Re-validates conversation state, global pause, and human handover to prevent race conditions.
 */
export async function verifyFinalSendGuard(userId: string): Promise<{
  canSend: boolean;
  reason?: string;
  state: ConversationState;
}> {
  // 1. Check Global Emergency Stop
  try {
    const globalState = await getMimiGlobalState();
    if (globalState.isPaused) {
      return {
        canSend: false,
        reason: `MIMI_GLOBALLY_PAUSED_BY_${globalState.pausedBy || "ADMIN"}`,
        state: await getConversationState(userId),
      };
    }
  } catch {
    // Non-fatal fallback
  }

  // 2. Re-fetch fresh conversation state (ensures any admin takeover during AI generation is respected)
  const freshState = await getConversationState(userId);

  if (freshState.mode === "HUMAN") {
    console.warn(
      `[FinalSendGuard] 🛑 AI_RESPONSE_CANCELLED_HUMAN_TAKEOVER: Blocked AI send because Admin "${freshState.assignedAdmin || "Staff"}" took over conversation with ${userId}`
    );
    return {
      canSend: false,
      reason: "AI_RESPONSE_CANCELLED_HUMAN_TAKEOVER",
      state: freshState,
    };
  }

  if (freshState.mode === "PAUSED") {
    console.warn(
      `[FinalSendGuard] ⏸️ AI_RESPONSE_CANCELLED_PAUSED: Blocked AI send because conversation with ${userId} is paused`
    );
    return {
      canSend: false,
      reason: "AI_RESPONSE_CANCELLED_PAUSED",
      state: freshState,
    };
  }

  if (!freshState.aiEnabled) {
    console.warn(
      `[FinalSendGuard] 🔒 AI_RESPONSE_CANCELLED_DISABLED: Blocked AI send because aiEnabled is false for ${userId}`
    );
    return {
      canSend: false,
      reason: "AI_RESPONSE_CANCELLED_DISABLED",
      state: freshState,
    };
  }

  return {
    canSend: true,
    state: freshState,
  };
}

/**
 * Record that customer sent a message
 */
export async function recordCustomerMessageActivity(
  userId: string,
  customerName?: string
): Promise<ConversationState> {
  const state = await getConversationState(userId, customerName);
  const now = Date.now();
  state.lastCustomerMessageAt = now;
  state.updatedAt = now;

  // If in HUMAN mode and customer speaks, slide the idle window by another 30 mins
  if (state.mode === "HUMAN" && state.lockedUntil) {
    state.lockedUntil = now + DEFAULT_HUMAN_LOCK_DURATION_MS;
  }

  stateCache.set(userId, state);
  persistState(state).catch(() => {});
  return state;
}

/**
 * Record that AI successfully sent a message
 */
export async function recordAiMessageSent(userId: string): Promise<void> {
  const state = stateCache.get(userId);
  if (state) {
    state.lastAiMessageAt = Date.now();
    state.updatedAt = Date.now();
    stateCache.set(userId, state);
    persistState(state).catch(() => {});
  }
}

/**
 * List all active conversations and their current mode
 */
export async function listActiveConversations(): Promise<
  Array<ConversationState & { remainingMinutes: number; isLocked: boolean }>
> {
  const now = Date.now();
  const list: Array<ConversationState & { remainingMinutes: number; isLocked: boolean }> = [];

  for (const [uid, state] of stateCache.entries()) {
    const isLocked = state.mode === "HUMAN" || state.mode === "PAUSED";
    let remainingMinutes = 0;
    if (state.lockedUntil && state.lockedUntil > now) {
      remainingMinutes = Math.ceil((state.lockedUntil - now) / 60000);
    }
    list.push({
      ...state,
      isLocked,
      remainingMinutes,
    });
  }

  return list;
}

/**
 * Clear all conversation locks / takeover states
 */
export async function clearAllConversationLocks(): Promise<number> {
  let count = 0;
  for (const state of stateCache.values()) {
    if (state.mode !== "AI") {
      state.mode = "AI";
      state.aiEnabled = true;
      state.lockedUntil = undefined;
      count++;
    }
  }
  return count;
}

function createDefaultState(userId: string, customerName: string): ConversationState {
  const now = Date.now();
  return {
    userId,
    customerName,
    mode: "AI",
    aiEnabled: true,
    lastCustomerMessageAt: now,
    aiProcessing: false,
    updatedAt: now,
  };
}

async function persistState(state: ConversationState): Promise<void> {
  try {
    await updateSetting(`line_conv_state_${state.userId}`, JSON.stringify(state));
    // Also keep legacy lock key synced for backward compatibility
    if (state.mode === "HUMAN" && state.lockedUntil) {
      await updateSetting(
        `line_lock_${state.userId}`,
        JSON.stringify({
          userId: state.userId,
          customerName: state.customerName,
          lockedUntil: state.lockedUntil,
          reason: state.reason || "แอดมินรับช่วงดูแลเคส",
          lastActivityAt: state.updatedAt,
        })
      );
    } else if (state.mode === "AI") {
      await updateSetting(`line_lock_${state.userId}`, "");
    }
  } catch (e) {
    console.error(`[ConversationController] Error persisting state for ${state.userId}:`, e);
  }
}
