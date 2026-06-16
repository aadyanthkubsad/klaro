/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-user/IP rate limiter for AI endpoints.
 *
 * Limits (per rolling 24 h window):
 *   Free:  7 kits, 7 quizzes, 7 flashcards, 0 YouTube recall, 0 PDF, 0 written answer
 *   Plus: 20 kits, 30 quizzes, 20 flashcards, 5 YouTube recall/day, 20 PDF, 15 written answer
 *   Pro:  50 kits, 100 quizzes, 50 flashcards, 30 YouTube recall/day, 50 PDF, 50 written answer
 *
 * Pricing: Free ₹0 | Plus ₹249/mo ₹1799/yr | Exam Pro ₹499/mo ₹3499/yr
 *
 * MVP: in-memory store keyed by client IP. Resets on server restart.
 * TODO: move to Redis when deploying multi-instance.
 */

import { logger } from './logger.js';

export type PlanType = 'free' | 'plus' | 'pro';

export type EndpointBucket =
  | 'generate-kit'
  | 'study-notes'
  | 'generate-quiz'
  | 'generate-flashcards'
  | 'youtube-recall'
  | 'evaluate-answer'
  | 'pdf-export'
  | 'weak-topic'
  | 'focused-review'
  | 'summary'
  | 'generate-audio';

/**
 * Daily limits per plan per bucket.
 *
 * Pricing model:
 *   Free     — ₹0
 *   Plus     — ₹249/month | ₹1,799/year
 *   Exam Pro — ₹499/month | ₹3,499/year
 *
 * Important: "unlimited" is never used for AI-heavy features.
 * Fair-usage caps apply to all tiers to protect API costs.
 */
const PLAN_LIMITS: Record<PlanType, Record<EndpointBucket, number>> = {
  free: {
    'generate-kit':        7,
    'study-notes':         7,
    'generate-quiz':       7,
    'generate-flashcards': 7,
    'youtube-recall':      0,   // Plus/Pro only
    'evaluate-answer':     0,   // Pro only (written answer feedback)
    'pdf-export':          0,   // Plus/Pro only
    'weak-topic':          3,
    'focused-review':      3,
    'summary':             7,
    'generate-audio':      0,   // Plus/Pro only
  },
  plus: {
    'generate-kit':        20,
    'study-notes':         20,
    'generate-quiz':       30,
    'generate-flashcards': 20,
    'youtube-recall':      5,   // 5/month enforced client-side, server allows 5/day as safety
    'evaluate-answer':     15,
    'pdf-export':          20,
    'weak-topic':          10,
    'focused-review':      15,
    'summary':             30,
    'generate-audio':      10,  // 10 audio generations/day for Plus
  },
  pro: {
    'generate-kit':        50,
    'study-notes':         50,
    'generate-quiz':       100,
    'generate-flashcards': 50,
    'youtube-recall':      30,  // 30/month enforced client-side, server allows 30/day as safety
    'evaluate-answer':     50,
    'pdf-export':          50,
    'weak-topic':          30,
    'focused-review':      50,
    'summary':             100,
    'generate-audio':      30,  // 30 audio generations/day for Pro
  },
};

interface UsageRecord {
  timestamps: number[];
}

// key: `${clientIp}::${bucket}`
const usageStore = new Map<string, UsageRecord>();

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Prune timestamps older than 24 h. */
function pruneOld(record: UsageRecord): void {
  const cutoff = Date.now() - ONE_DAY_MS;
  record.timestamps = record.timestamps.filter(t => t >= cutoff);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds?: number;
}

/**
 * Check and consume one unit of the rate limit.
 * Returns whether the request is allowed and how many remain.
 */
export function checkRateLimit(
  clientIp: string,
  bucket: EndpointBucket,
  plan: PlanType = 'free',
): RateLimitResult {
  // Open-beta bypass: skip all rate limits while testing.
  // Set BETA_FREE_FOR_ALL=false in Railway to restore normal gating.
  if ((process.env.BETA_FREE_FOR_ALL ?? 'true').toLowerCase() !== 'false') {
    return { allowed: true, remaining: Infinity, limit: Infinity };
  }

  const limit = PLAN_LIMITS[plan]?.[bucket] ?? PLAN_LIMITS.free[bucket] ?? 5;

  // Limit of 0 = feature not available for this plan
  if (limit === 0) {
    const requiredPlan = bucket === 'youtube-recall' ? 'pro' : 'plus';
    return { allowed: false, remaining: 0, limit: 0, retryAfterSeconds: undefined };
  }

  const key = `${clientIp}::${bucket}`;
  let record = usageStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    usageStore.set(key, record);
  }

  pruneOld(record);

  if (record.timestamps.length >= limit) {
    const oldestInWindow = record.timestamps[0];
    const retryAfterSeconds = Math.ceil((oldestInWindow + ONE_DAY_MS - Date.now()) / 1000);
    logger.warn('Rate limit exceeded', {
      clientIp,
      endpoint: bucket,
      userPlan: plan,
      meta: { limit, used: record.timestamps.length },
    });
    return {
      allowed: false,
      remaining: 0,
      limit,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  // Consume one unit
  record.timestamps.push(Date.now());
  return {
    allowed: true,
    remaining: limit - record.timestamps.length,
    limit,
  };
}

/** Get usage stats for a client (for debugging / health). */
export function getUsageStats(clientIp: string): Record<EndpointBucket, { used: number }> {
  const stats: any = {};
  for (const bucket of Object.keys(PLAN_LIMITS.free) as EndpointBucket[]) {
    const key = `${clientIp}::${bucket}`;
    const record = usageStore.get(key);
    if (record) {
      pruneOld(record);
      stats[bucket] = { used: record.timestamps.length };
    } else {
      stats[bucket] = { used: 0 };
    }
  }
  return stats;
}

/** Clear all rate limit data (for tests). */
export function clearAllRateLimits(): void {
  usageStore.clear();
}

/** Periodic cleanup of stale entries (call every hour). */
export function cleanupStaleEntries(): void {
  const now = Date.now();
  for (const [key, record] of usageStore.entries()) {
    pruneOld(record);
    if (record.timestamps.length === 0) {
      usageStore.delete(key);
    }
  }
}
