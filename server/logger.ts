/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Structured logger for Lumina backend.
 * Logs request metadata, generation times, cache hits, and errors.
 * NEVER logs API keys or sensitive credentials.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  requestId?: string;
  endpoint?: string;
  userPlan?: string;
  clientIp?: string;
  message: string;
  durationMs?: number;
  cacheHit?: boolean;
  errorCode?: string;
  meta?: Record<string, any>;
}

// In-memory ring buffer of recent logs for /api/health introspection
const LOG_BUFFER_SIZE = 500;
const recentLogs: LogEntry[] = [];

function addToBuffer(entry: LogEntry) {
  recentLogs.push(entry);
  if (recentLogs.length > LOG_BUFFER_SIZE) {
    recentLogs.shift();
  }
}

function formatEntry(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
  ];
  if (entry.requestId) parts.push(`rid=${entry.requestId}`);
  if (entry.endpoint) parts.push(`ep=${entry.endpoint}`);
  if (entry.userPlan) parts.push(`plan=${entry.userPlan}`);
  parts.push(entry.message);
  if (entry.durationMs !== undefined) parts.push(`(${entry.durationMs}ms)`);
  if (entry.cacheHit !== undefined) parts.push(`cache=${entry.cacheHit ? 'HIT' : 'MISS'}`);
  if (entry.errorCode) parts.push(`errCode=${entry.errorCode}`);
  if (entry.meta) {
    // Redact anything that looks like an API key
    const safeMeta = { ...entry.meta };
    for (const key of Object.keys(safeMeta)) {
      const lk = key.toLowerCase();
      if (lk.includes('key') || lk.includes('token') || lk.includes('secret') || lk.includes('password')) {
        safeMeta[key] = '[REDACTED]';
      }
    }
    parts.push(JSON.stringify(safeMeta));
  }
  return parts.join(' ');
}

export const logger = {
  info(message: string, ctx?: Partial<LogEntry>) {
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: 'info', message, ...ctx };
    addToBuffer(entry);
    console.log(formatEntry(entry));
  },
  warn(message: string, ctx?: Partial<LogEntry>) {
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: 'warn', message, ...ctx };
    addToBuffer(entry);
    console.warn(formatEntry(entry));
  },
  error(message: string, ctx?: Partial<LogEntry>) {
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: 'error', message, ...ctx };
    addToBuffer(entry);
    console.error(formatEntry(entry));
  },
  debug(message: string, ctx?: Partial<LogEntry>) {
    if (process.env.LOG_LEVEL === 'debug') {
      const entry: LogEntry = { timestamp: new Date().toISOString(), level: 'debug', message, ...ctx };
      addToBuffer(entry);
      console.log(formatEntry(entry));
    }
  },

  /** Return recent error logs for health endpoint introspection. */
  getRecentErrors(count = 10): LogEntry[] {
    return recentLogs.filter(e => e.level === 'error').slice(-count);
  },

  /** Return recent logs for admin inspection. */
  getRecentLogs(count = 50): LogEntry[] {
    return recentLogs.slice(-count);
  },
};

/** Generate a short unique request ID. */
export function generateRequestId(): string {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
}
