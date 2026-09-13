import { createHash } from "node:crypto";

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

type Clock = () => number;

const MAX_BUCKETS = 10_000;

/**
 * Small process-local limiter used as a defense-in-depth control.
 * The edge/WAF remains the authoritative distributed limiter when available.
 */
export function createRateLimiter(clock: Clock = () => Date.now()) {
  const buckets = new Map<string, Bucket>();

  function prune(now: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }

    if (buckets.size <= MAX_BUCKETS) return;
    const excess = buckets.size - MAX_BUCKETS;
    let removed = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      removed += 1;
      if (removed >= excess) break;
    }
  }

  function consume(key: string, limit: number, windowMs: number): RateLimitDecision {
    const now = clock();
    prune(now);

    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        retryAfterSeconds: Math.ceil(windowMs / 1000),
      };
    }

    current.count = Math.min(limit + 1, current.count + 1);
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return {
      allowed: current.count <= limit,
      remaining: Math.max(0, limit - current.count),
      retryAfterSeconds,
    };
  }

  return { consume };
}

const globalStore = globalThis as typeof globalThis & {
  __appmymariRateLimiter?: ReturnType<typeof createRateLimiter>;
};

const limiter =
  globalStore.__appmymariRateLimiter ??
  (globalStore.__appmymariRateLimiter = createRateLimiter());

function getClientSignal(request: Request): string {
  const forwarded =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for");

  const signal = forwarded?.split(",", 1)[0]?.trim();
  return signal ? signal.slice(0, 128) : "unknown";
}

function hashSubject(subject: string): string {
  return createHash("sha256").update(subject).digest("hex").slice(0, 16);
}

export function consumeRequestRateLimit(
  request: Request,
  options: {
    scope: string;
    limit: number;
    windowMs: number;
    subject?: string;
  },
): RateLimitDecision {
  const subject = options.subject?.trim().toLowerCase();
  const subjectKey = subject ? `:${hashSubject(subject)}` : "";
  const key = `${options.scope}:${getClientSignal(request)}${subjectKey}`;
  return limiter.consume(key, options.limit, options.windowMs);
}

export function rateLimitResponse(
  message = "มีคำขอมากเกินไป กรุณาลองใหม่ภายหลัง",
  decision: RateLimitDecision,
): Response {
  return Response.json(
    { message },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Retry-After": String(decision.retryAfterSeconds),
      },
    },
  );
}
