/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SQLite database persistence layer for Klaro.
 * Replaces the in-memory sessionData store.
 *
 * Uses better-sqlite3 for synchronous, fast, embedded database.
 * Data is stored in ./data/klaro.db — survives server restarts.
 *
 * Tables: users, kits, library_items, quiz_history, mistakes, tasks
 */

import { logger } from './logger.js';
import path from 'path';
import fs from 'fs';

// We use a JSON-file approach for MVP since better-sqlite3 requires
// native compilation which can be complex in Docker. This gives us
// persistence without native dependencies.

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'klaro-db.json');

interface DBSchema {
  users: Record<string, UserRecord>;
  kits: Record<string, any>;
  library: any[];
  stats: {
    streak: number;
    xp: number;
    level: number;
    weakTopics: string[];
    strengths: string[];
    quizScores: any[];
    mistakes: any[];
  };
  version: number;
}

interface UserRecord {
  id: string;
  ip: string;
  planType: 'free' | 'plus' | 'pro';
  createdAt: string;
  lastActiveAt: string;
  totalKitsGenerated: number;
}

const DEFAULT_DB: DBSchema = {
  users: {},
  kits: {},
  library: [],
  stats: {
    streak: 0,
    xp: 0,
    level: 1,
    weakTopics: [],
    strengths: [],
    quizScores: [],
    mistakes: [],
  },
  version: 1,
};

let db: DBSchema = { ...DEFAULT_DB };
let isDirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Initialize the database — load from disk or create fresh. */
export function initDatabase(): void {
  try {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      db = { ...DEFAULT_DB, ...parsed };
      logger.info(`Database loaded from ${DB_FILE}`, { meta: { kits: Object.keys(db.kits).length, library: db.library.length } });
    } else {
      db = { ...DEFAULT_DB };
      saveToDisk();
      logger.info('Database created fresh');
    }
  } catch (err) {
    logger.error('Failed to load database, starting fresh', { meta: { error: (err as Error).message } });
    db = { ...DEFAULT_DB };
  }
}

/** Save database to disk (debounced — batches rapid writes). */
function scheduleSave(): void {
  isDirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveToDisk();
    saveTimer = null;
  }, 2000); // Batch writes every 2 seconds
}

function saveToDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    isDirty = false;
  } catch (err) {
    logger.error('Failed to save database', { meta: { error: (err as Error).message } });
  }
}

/** Flush any pending writes immediately (call on shutdown). */
export function flushDatabase(): void {
  if (isDirty) {
    saveToDisk();
  }
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

// ─── Public accessors ─────────────────────────────────────────────────────

export function getStats() {
  return db.stats;
}

export function updateStats(changes: Partial<DBSchema['stats']>) {
  db.stats = { ...db.stats, ...changes };
  scheduleSave();
  return db.stats;
}

export function getLibrary() {
  return db.library;
}

export function addToLibrary(item: any) {
  const existingIndex = db.library.findIndex((l: any) => l.id === item.id);
  if (existingIndex >= 0) {
    db.library[existingIndex] = item;
  } else {
    db.library.unshift(item);
    db.stats.xp += 50;
  }
  scheduleSave();
}

export function removeFromLibrary(id: string): boolean {
  const before = db.library.length;
  db.library = db.library.filter((it: any) => it.id !== id);
  if (db.library.length < before) {
    scheduleSave();
    return true;
  }
  return false;
}

export function cleanupLibrary(): any[] {
  const stripPrefix = (t: string) =>
    t.replace(/^\s*(audio|visual|read\/write|readwrite|read|write)\s*[:\-–]\s*/i, '').trim().toLowerCase();
  const seen = new Set<string>();
  db.library = db.library.filter((item: any) => {
    const key = `${stripPrefix(item.title)}::${item.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  scheduleSave();
  return db.library;
}

export function getKit(id: string) {
  return db.kits[id] || null;
}

export function saveKit(id: string, kit: any) {
  db.kits[id] = kit;
  scheduleSave();
}

export function getAllKits() {
  return db.kits;
}

// ─── User management ──────────────────────────────────────────────────────

export function getOrCreateUser(ip: string): UserRecord {
  let user = Object.values(db.users).find(u => u.ip === ip);
  if (!user) {
    user = {
      id: `u-${Date.now().toString(36)}`,
      ip,
      planType: 'free',
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      totalKitsGenerated: 0,
    };
    db.users[user.id] = user;
    scheduleSave();
  } else {
    user.lastActiveAt = new Date().toISOString();
  }
  return user;
}

export function getUserPlan(ip: string): 'free' | 'plus' | 'pro' {
  const user = Object.values(db.users).find(u => u.ip === ip);
  return user?.planType || 'free';
}

export function incrementUserKitCount(ip: string): void {
  const user = Object.values(db.users).find(u => u.ip === ip);
  if (user) {
    user.totalKitsGenerated++;
    scheduleSave();
  }
}

/** Get database stats for health endpoint. */
export function getDatabaseStats() {
  return {
    users: Object.keys(db.users).length,
    kits: Object.keys(db.kits).length,
    libraryItems: db.library.length,
    dbSizeBytes: fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0,
    isDirty,
  };
}
