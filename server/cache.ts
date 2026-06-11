/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * In-memory cache for generated AI content.
 * Avoids duplicate Gemini calls when the same user regenerates the same kit.
 *
 * Cache key is built from: topic/chapterId, subject, classLevel, mode, language, noteStyle.
 * TTL: 1 hour by default.
 *
 * MVP: in-memory Map. TODO: move to Redis for multi-instance.
 */

import { logger } from './logger.js';

export interface CacheConfig {
  /** TTL in milliseconds. Default: 1 hour. */
  ttlMs: number;
  /** Max entries. Default: 200. */
  maxEntries: number;
}

const DEFAULT_CONFIG: CacheConfig = {
  ttlMs: 60 * 60 * 1000, // 1 hour
  maxEntries: 200,
};

interface CacheEntry {
  data: any;
  createdAt: number;
  hits: number;
}

const store = new Map<string, CacheEntry>();
let config: CacheConfig = { ...DEFAULT_CONFIG };

// Stats
let totalHits = 0;
let totalMisses = 0;

export function configureCache(overrides?: Partial<CacheConfig>): void {
  config = { ...DEFAULT_CONFIG, ...overrides };
  logger.info(`Cache configured: ttl=${config.ttlMs}ms maxEntries=${config.maxEntries}`);
}

/** Build a deterministic cache key from request parameters. */
export function buildCacheKey(params: {
  endpoint: string;
  topic?: string;
  chapterId?: string;
  chapterTitle?: string;
  subject?: string;
  classLevel?: string;
  mode?: string;
  language?: string;
  noteStyle?: string;
  examMode?: string;
  voiceStyle?: string;
}): string {
  const parts = [
    params.endpoint,
    params.chapterId || params.chapterTitle || params.topic || '',
    params.subject || '',
    params.classLevel || '',
    params.mode || '',
    params.language || '',
    params.noteStyle || '',
    params.examMode || '',
    params.voiceStyle || '',
  ];
  return parts.map(p => (p || '').toLowerCase().trim()).join('::');
}

/** Get a cached entry. Returns undefined on miss. */
export function cacheGet(key: string): any | undefined {
  const entry = store.get(key);
  if (!entry) {
    totalMisses++;
    return undefined;
  }

  // Check TTL
  if (Date.now() - entry.createdAt > config.ttlMs) {
    store.delete(key);
    totalMisses++;
    return undefined;
  }

  entry.hits++;
  totalHits++;
  logger.debug('Cache hit', { meta: { key: key.substring(0, 80), hits: entry.hits } });
  return entry.data;
}

/** Store data in cache. */
export function cacheSet(key: string, data: any): void {
  // Evict if at capacity (remove oldest entry)
  if (store.size >= config.maxEntries) {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [k, v] of store.entries()) {
      if (v.createdAt < oldestTime) {
        oldestTime = v.createdAt;
        oldestKey = k;
      }
    }
    if (oldestKey) store.delete(oldestKey);
  }

  store.set(key, { data, createdAt: Date.now(), hits: 0 });
}

/** Invalidate a specific cache entry (e.g., on "Regenerate" click). */
export function cacheInvalidate(key: string): boolean {
  return store.delete(key);
}

/** Invalidate all cache entries whose key contains the given substring. Returns count removed. */
export function cacheInvalidateByPrefix(prefix: string): number {
  let removed = 0;
  for (const key of store.keys()) {
    if (key.includes(prefix)) { store.delete(key); removed++; }
  }
  return removed;
}

/** Clear all cached data. */
export function cacheClear(): void {
  store.clear();
  totalHits = 0;
  totalMisses = 0;
}

/** Get cache stats for health endpoint. */
export function getCacheStats() {
  let expiredCount = 0;
  const now = Date.now();
  for (const [, v] of store.entries()) {
    if (now - v.createdAt > config.ttlMs) expiredCount++;
  }

  return {
    entries: store.size,
    maxEntries: config.maxEntries,
    totalHits,
    totalMisses,
    hitRate: totalHits + totalMisses > 0 ? Math.round((totalHits / (totalHits + totalMisses)) * 100) : 0,
    expiredPending: expiredCount,
  };
}

/** Periodic cleanup of expired entries. */
export function cleanupExpiredCache(): void {
  const now = Date.now();
  let removed = 0;
  for (const [key, entry] of store.entries()) {
    if (now - entry.createdAt > config.ttlMs) {
      store.delete(key);
      removed++;
    }
  }
  if (removed > 0) {
    logger.debug(`Cache cleanup: removed ${removed} expired entries`);
  }
}
