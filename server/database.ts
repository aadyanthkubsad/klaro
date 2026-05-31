/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SQLite database persistence layer for Klaro.
 *
 * Uses better-sqlite3 for synchronous, fast, embedded database.
 * Data is stored in ./data/klaro.db — survives server restarts.
 *
 * Tables: users, stats, library_items, kits, payments, sessions
 *
 * On first run, automatically migrates data from the legacy
 * klaro-db.json file (if present) into SQLite.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'klaro.db');
const SCHEMA_PATH = path.join(process.cwd(), 'server', 'schema.sql');

let db: Database.Database;

// ─── Initialization ─────────────────────────────────────────────────────────

/** Initialize SQLite database — create tables, migrate legacy data. */
export function initDatabase(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
  if (userCount === 0) {
    migrateFromJson();
  }

  const stats = getDatabaseStats();
  logger.info('SQLite database initialized', { meta: { path: DB_PATH, ...stats } });
}

/** Migrate legacy klaro-db.json into SQLite (runs once on first start). */
function migrateFromJson(): void {
  const jsonPath = path.join(DATA_DIR, 'klaro-db.json');
  if (!fs.existsSync(jsonPath)) {
    // No JSON file — create a default user
    db.prepare('INSERT INTO users (id, display_name) VALUES (?, ?)').run('u-migrated', 'Learner');
    db.prepare('INSERT INTO stats (user_id) VALUES (?)').run('u-migrated');
    return;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const userId = 'u-migrated';

    const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, display_name, plan_type) VALUES (?, ?, ?)');
    const insertStats = db.prepare('INSERT OR IGNORE INTO stats (user_id, streak, xp, level, weak_topics, strengths, quiz_scores, mistakes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insertLibrary = db.prepare('INSERT OR IGNORE INTO library_items (id, user_id, title, type, date, progress, content_snippet, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insertKit = db.prepare('INSERT OR IGNORE INTO kits (id, user_id, data) VALUES (?, ?, ?)');

    const migrate = db.transaction(() => {
      insertUser.run(userId, 'Learner', 'free');
      insertStats.run(
        userId, raw.stats?.streak || 0, raw.stats?.xp || 0, raw.stats?.level || 1,
        JSON.stringify(raw.stats?.weakTopics || []), JSON.stringify(raw.stats?.strengths || []),
        JSON.stringify(raw.stats?.quizScores || []), JSON.stringify(raw.stats?.mistakes || [])
      );
      for (const item of (raw.library || [])) {
        insertLibrary.run(
          item.id, userId, item.title || '', item.type || '', item.date || '',
          item.progress || 0, item.contentSnippet || '', JSON.stringify(item.tags || [])
        );
      }
      for (const [kitId, kitData] of Object.entries(raw.kits || {})) {
        insertKit.run(kitId, userId, JSON.stringify(kitData));
      }
    });

    migrate();
    logger.info('Migrated data from klaro-db.json to SQLite');
  } catch (err) {
    logger.error('JSON migration failed', { meta: { error: (err as Error).message } });
    // Ensure at least a default user exists
    db.prepare('INSERT OR IGNORE INTO users (id, display_name) VALUES (?, ?)').run('u-migrated', 'Learner');
    db.prepare('INSERT OR IGNORE INTO stats (user_id) VALUES (?)').run('u-migrated');
  }
}

/** Close the database connection (call on shutdown). */
export function flushDatabase(): void {
  if (db) {
    try { db.close(); } catch { /* already closed */ }
  }
}

// ─── User management ────────────────────────────────────────────────────────

export function getOrCreateUser(identifier: string): any {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(identifier) as any;
  if (!user) {
    const id = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    db.prepare('INSERT INTO users (id, display_name) VALUES (?, ?)').run(id, 'Learner');
    db.prepare('INSERT INTO stats (user_id) VALUES (?)').run(id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  db.prepare("UPDATE users SET last_active_at = datetime('now') WHERE id = ?").run((user as any).id);
  return user;
}

export function getUserPlan(userId: string): 'free' | 'plus' | 'pro' {
  const user = db.prepare('SELECT plan_type FROM users WHERE id = ?').get(userId) as any;
  return user?.plan_type || 'free';
}

export function incrementUserKitCount(userId: string): void {
  db.prepare('UPDATE users SET total_kits_generated = total_kits_generated + 1 WHERE id = ?').run(userId);
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export function getStats(userId: string = 'u-migrated') {
  const row = db.prepare('SELECT * FROM stats WHERE user_id = ?').get(userId) as any;
  if (!row) return { streak: 0, xp: 0, level: 1, weakTopics: [], strengths: [], quizScores: [], mistakes: [] };
  return {
    streak: row.streak,
    xp: row.xp,
    level: row.level,
    weakTopics: JSON.parse(row.weak_topics),
    strengths: JSON.parse(row.strengths),
    quizScores: JSON.parse(row.quiz_scores),
    mistakes: JSON.parse(row.mistakes),
  };
}

export function updateStats(changes: any, userId: string = 'u-migrated') {
  const current = getStats(userId);
  const merged = { ...current, ...changes };
  db.prepare(`
    INSERT INTO stats (user_id, streak, xp, level, weak_topics, strengths, quiz_scores, mistakes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      streak = excluded.streak, xp = excluded.xp, level = excluded.level,
      weak_topics = excluded.weak_topics, strengths = excluded.strengths,
      quiz_scores = excluded.quiz_scores, mistakes = excluded.mistakes
  `).run(
    userId, merged.streak, merged.xp, merged.level,
    JSON.stringify(merged.weakTopics), JSON.stringify(merged.strengths),
    JSON.stringify(merged.quizScores), JSON.stringify(merged.mistakes)
  );
  return merged;
}

// ─── Library ────────────────────────────────────────────────────────────────

export function getLibrary(userId: string = 'u-migrated') {
  const rows = db.prepare('SELECT * FROM library_items WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
  return rows.map(r => ({
    id: r.id, title: r.title, type: r.type, date: r.date,
    progress: r.progress, contentSnippet: r.content_snippet,
    tags: JSON.parse(r.tags), kitData: r.kit_data ? JSON.parse(r.kit_data) : undefined,
  }));
}

export function addToLibrary(item: any, userId: string = 'u-migrated') {
  const existing = db.prepare('SELECT id FROM library_items WHERE id = ? AND user_id = ?').get(item.id, userId);
  if (existing) {
    db.prepare('UPDATE library_items SET title=?, type=?, date=?, progress=?, content_snippet=?, tags=?, kit_data=? WHERE id=? AND user_id=?').run(
      item.title, item.type, item.date || '', item.progress || 0, item.contentSnippet || '',
      JSON.stringify(item.tags || []), item.kitData ? JSON.stringify(item.kitData) : null,
      item.id, userId
    );
  } else {
    db.prepare('INSERT INTO library_items (id, user_id, title, type, date, progress, content_snippet, tags, kit_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      item.id, userId, item.title, item.type, item.date || '', item.progress || 0,
      item.contentSnippet || '', JSON.stringify(item.tags || []),
      item.kitData ? JSON.stringify(item.kitData) : null
    );
    db.prepare('UPDATE stats SET xp = xp + 50 WHERE user_id = ?').run(userId);
  }
}

export function removeFromLibrary(id: string, userId: string = 'u-migrated'): boolean {
  const result = db.prepare('DELETE FROM library_items WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes > 0;
}

export function cleanupLibrary(userId: string = 'u-migrated'): any[] {
  const all = getLibrary(userId);
  const seen = new Set<string>();
  const toDelete: string[] = [];
  for (const item of all) {
    const key = `${item.title.replace(/^\s*(audio|visual|read\/write|readwrite|read|write)\s*[:\-–]\s*/i, '').trim().toLowerCase()}::${item.type}`;
    if (seen.has(key)) {
      toDelete.push(item.id);
    } else {
      seen.add(key);
    }
  }
  if (toDelete.length > 0) {
    const del = db.prepare('DELETE FROM library_items WHERE id = ? AND user_id = ?');
    const batch = db.transaction(() => {
      for (const id of toDelete) del.run(id, userId);
    });
    batch();
  }
  return getLibrary(userId);
}

// ─── Kits ───────────────────────────────────────────────────────────────────

export function getKit(id: string) {
  const row = db.prepare('SELECT data FROM kits WHERE id = ?').get(id) as any;
  return row ? JSON.parse(row.data) : null;
}

export function saveKit(id: string, kit: any, userId: string = 'u-migrated') {
  db.prepare(`
    INSERT INTO kits (id, user_id, data) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data
  `).run(id, userId, JSON.stringify(kit));
}

export function getAllKits(userId: string = 'u-migrated') {
  const rows = db.prepare('SELECT id, data FROM kits WHERE user_id = ?').all(userId) as any[];
  const result: Record<string, any> = {};
  for (const r of rows) {
    result[r.id] = JSON.parse(r.data);
  }
  return result;
}

// ─── Auth helpers (used by Phase 2) ─────────────────────────────────────────

export function createUser(email: string, passwordHash: string, displayName: string): any {
  const id = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  db.prepare('INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)').run(id, email.toLowerCase(), passwordHash, displayName);
  db.prepare('INSERT INTO stats (user_id) VALUES (?)').run(id);
  return db.prepare('SELECT id, email, display_name, plan_type, created_at FROM users WHERE id = ?').get(id);
}

export function getUserByEmail(email: string): any {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}

export function getUserById(id: string): any {
  return db.prepare('SELECT id, email, display_name, plan_type, plan_expires_at, created_at FROM users WHERE id = ?').get(id);
}

export function updateUserPlan(userId: string, planType: 'free' | 'plus' | 'pro', expiresAt: string | null): void {
  db.prepare('UPDATE users SET plan_type = ?, plan_expires_at = ? WHERE id = ?').run(planType, expiresAt, userId);
}

// ─── Payment helpers (used by Phase 3) ──────────────────────────────────────

export function createPaymentRecord(userId: string, orderId: string, amount: number, currency: string, planType: string, billingCycle: string): void {
  const id = `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  db.prepare('INSERT INTO payments (id, user_id, razorpay_order_id, amount, currency, plan_type, billing_cycle) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, userId, orderId, amount, currency, planType, billingCycle
  );
}

export function markPaymentPaid(orderId: string, paymentId: string, signature: string): void {
  db.prepare("UPDATE payments SET razorpay_payment_id = ?, razorpay_signature = ?, status = ?, paid_at = datetime('now') WHERE razorpay_order_id = ?").run(
    paymentId, signature, 'paid', orderId
  );
}

export function getPaymentByOrderId(orderId: string): any {
  return db.prepare('SELECT * FROM payments WHERE razorpay_order_id = ?').get(orderId);
}

// ─── Database stats ─────────────────────────────────────────────────────────

export function getDatabaseStats() {
  const users = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
  const kits = (db.prepare('SELECT COUNT(*) as c FROM kits').get() as any).c;
  const library = (db.prepare('SELECT COUNT(*) as c FROM library_items').get() as any).c;
  const dbSize = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  return { users, kits, libraryItems: library, dbSizeBytes: dbSize };
}
