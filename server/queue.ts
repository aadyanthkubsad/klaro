/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * In-memory AI request queue.
 * Limits concurrent Gemini API calls to prevent overwhelming the API.
 *
 * MVP: simple in-memory semaphore + FIFO queue.
 * TODO: move to Redis + BullMQ for multi-instance deployments.
 */

import { logger } from './logger.js';

export interface QueueConfig {
  /** Max concurrent AI requests. Default: 5. */
  maxConcurrent: number;
  /** Max queue length before rejecting new requests. Default: 50. */
  maxQueueLength: number;
  /** Timeout per AI request in ms. Default: 120_000 (2 min). */
  requestTimeoutMs: number;
}

const DEFAULT_CONFIG: QueueConfig = {
  maxConcurrent: 5,
  maxQueueLength: 50,
  requestTimeoutMs: 120_000,
};

interface QueuedItem {
  id: string;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  fn: () => Promise<any>;
  enqueuedAt: number;
}

let config: QueueConfig = { ...DEFAULT_CONFIG };
let activeCount = 0;
const waitingQueue: QueuedItem[] = [];

// Stats
let totalProcessed = 0;
let totalRejected = 0;
let totalTimedOut = 0;
let totalErrors = 0;

/** Configure the queue. Call once at startup. */
export function configureQueue(overrides?: Partial<QueueConfig>): void {
  config = { ...DEFAULT_CONFIG, ...overrides };
  logger.info(`AI queue configured: maxConcurrent=${config.maxConcurrent} maxQueue=${config.maxQueueLength} timeout=${config.requestTimeoutMs}ms`);
}

/** Enqueue an AI request. Returns a promise that resolves with the result. */
export function enqueueAIRequest<T>(fn: () => Promise<T>, requestId?: string): Promise<T> {
  const id = requestId || `q-${Date.now().toString(36)}`;

  // Reject if queue is full
  if (waitingQueue.length >= config.maxQueueLength) {
    totalRejected++;
    logger.warn('AI queue full — request rejected', { requestId: id, meta: { queueLength: waitingQueue.length, active: activeCount } });
    return Promise.reject(new Error('AI generation is busy. Too many users are generating content right now. Please try again in a minute.'));
  }

  // If there's capacity, run immediately
  if (activeCount < config.maxConcurrent) {
    return runTask(fn, id);
  }

  // Otherwise queue it
  return new Promise<T>((resolve, reject) => {
    waitingQueue.push({ id, resolve, reject, fn, enqueuedAt: Date.now() });
    logger.info('Request queued', { requestId: id, meta: { position: waitingQueue.length, active: activeCount } });
  });
}

async function runTask<T>(fn: () => Promise<T>, id: string): Promise<T> {
  activeCount++;
  const startTime = Date.now();

  try {
    // Race against timeout
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          totalTimedOut++;
          reject(new Error('AI generation timed out. Please try again.'));
        }, config.requestTimeoutMs)
      ),
    ]);

    totalProcessed++;
    const durationMs = Date.now() - startTime;
    logger.info('AI request completed', { requestId: id, durationMs });
    return result;
  } catch (err) {
    totalErrors++;
    const durationMs = Date.now() - startTime;
    logger.error('AI request failed', { requestId: id, durationMs, meta: { error: (err as Error).message } });
    throw err;
  } finally {
    activeCount--;
    processNext();
  }
}

function processNext(): void {
  if (waitingQueue.length === 0 || activeCount >= config.maxConcurrent) return;

  const next = waitingQueue.shift()!;
  const waitTime = Date.now() - next.enqueuedAt;

  // Check if the queued request has already timed out while waiting
  if (waitTime > config.requestTimeoutMs) {
    totalTimedOut++;
    next.reject(new Error('Your request timed out while waiting in queue. Please try again.'));
    processNext();
    return;
  }

  logger.info('Dequeuing request', { requestId: next.id, meta: { waitTimeMs: waitTime } });

  runTask(next.fn, next.id)
    .then(next.resolve)
    .catch(next.reject);
}

/** Get queue statistics for health endpoint. */
export function getQueueStats() {
  return {
    active: activeCount,
    waiting: waitingQueue.length,
    maxConcurrent: config.maxConcurrent,
    maxQueueLength: config.maxQueueLength,
    totalProcessed,
    totalRejected,
    totalTimedOut,
    totalErrors,
  };
}
