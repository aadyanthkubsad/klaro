/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SQLite database persistence layer for Lumina.
 *
 * Uses better-sqlite3 for synchronous, fast, embedded database.
 * Data is stored in ./data/klaro.db — survives server restarts.
 *
 * Tables: users, stats, library_items, kits, payments, sessions,
 *   quiz_attempts, mistake_entries, mastery_entries, daily_tasks,
 *   activity_log, usage_counters, planner_events, written_answers, streak_info
 *
 * On first run, automatically migrates data from the legacy
 * klaro-db.json file (if present) into SQLite.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'klaro.db');
const SCHEMA_PATH = path.join(process.cwd(), 'server', 'schema.sql');

let db: Database.Database;

// ─── Initialization ─────────────────────────────────────────────────────────

/** Initialize SQLite database — create tables, migrate legacy data. */
export async function initDatabase(): Promise<void> {
  // Retry to handle persistent-volume mount races on Railway-style hosts.
  // The container can boot before /app/data is mounted; opening the DB then
  // throws SQLITE_CANTOPEN and the container restart-loops before the volume
  // ever becomes ready. Wait up to ~15s for the directory to be writable.
  const MAX_ATTEMPTS = 10;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      // Confirm we can actually write to DATA_DIR before opening the DB.
      // On a not-yet-mounted volume, mkdirSync sometimes succeeds against
      // the underlying overlay but the real volume is unwritable.
      const probePath = path.join(DATA_DIR, '.write-probe');
      fs.writeFileSync(probePath, String(Date.now()));
      fs.unlinkSync(probePath);

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
      logger.info('SQLite database initialized', { meta: { path: DB_PATH, attempt, ...stats } });
      return;
    } catch (err) {
      lastError = err;
      const msg = (err as Error)?.message ?? String(err);
      const isLast = attempt === MAX_ATTEMPTS;
      // Exponential backoff capped at 3s: 200ms, 400ms, 800ms, 1600ms, 3000ms...
      const delayMs = Math.min(3000, 200 * Math.pow(2, attempt - 1));

      logger.warn('Database init attempt failed', {
        meta: { attempt, maxAttempts: MAX_ATTEMPTS, error: msg, willRetry: !isLast, nextDelayMs: isLast ? 0 : delayMs },
      });

      if (isLast) break;
      await new Promise<void>(resolve => setTimeout(resolve, delayMs));
    }
  }

  logger.error('Database init failed after all retries', { meta: { attempts: MAX_ATTEMPTS, dataDir: DATA_DIR } });
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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

/**
 * One-time migration: update library items with type='revision-kit' to their
 * correct VARK type by examining the associated kit data and title prefix.
 * Returns the number of items updated.
 */
export function backfillVarkTypes(userId: string = 'u-migrated'): number {
  const items = db.prepare(
    "SELECT id, title, type FROM library_items WHERE user_id = ? AND type = 'revision-kit'"
  ).all(userId) as any[];

  let updated = 0;
  const updateStmt = db.prepare('UPDATE library_items SET type = ? WHERE id = ? AND user_id = ?');

  for (const item of items) {
    const titleLC = (item.title || '').toLowerCase();

    // 1. Infer from title prefix (e.g. "Audio: Chapter Name", "Visual: ...")
    if (/^(audio|aural)\s*[:\-–]/i.test(item.title)) {
      updateStmt.run('aural', item.id, userId);
      updated++;
      continue;
    }
    if (/^visual\s*[:\-–]/i.test(item.title)) {
      updateStmt.run('visual', item.id, userId);
      updated++;
      continue;
    }
    if (/^(read\/?write|readwrite)\s*[:\-–]/i.test(item.title)) {
      updateStmt.run('readwrite', item.id, userId);
      updated++;
      continue;
    }

    // 2. Infer from kit data content density
    const kitRow = db.prepare('SELECT data FROM kits WHERE id = ?').get(item.id) as any;
    if (kitRow) {
      try {
        const kit = JSON.parse(kitRow.data);
        const visualLen = JSON.stringify(kit.visual || kit.mindMap || kit.flowchart || '').length;
        const rwLen = JSON.stringify(kit.readWrite || kit.summary || '').length;
        const auralLen = JSON.stringify(kit.aural || kit.audioScript || '').length;

        if (visualLen > rwLen && visualLen > auralLen && visualLen > 100) {
          updateStmt.run('visual', item.id, userId);
          updated++;
        } else if (auralLen > rwLen && auralLen > visualLen && auralLen > 100) {
          updateStmt.run('aural', item.id, userId);
          updated++;
        } else if (rwLen > 100) {
          updateStmt.run('readwrite', item.id, userId);
          updated++;
        }
        // If no section has significant content, leave as revision-kit
      } catch {
        // JSON parse failed — leave as revision-kit
      }
    }
  }

  return updated;
}

/** Update only the date field on a library item (for "last studied" tracking). */
export function touchLibraryItem(id: string, userId: string = 'u-migrated'): boolean {
  const result = db.prepare('UPDATE library_items SET date = ? WHERE id = ? AND user_id = ?')
    .run(new Date().toLocaleDateString(), id, userId);
  return result.changes > 0;
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

// ─── Quiz Attempts ──────────────────────────────────────────────────────────

export function getQuizAttempts(userId: string): any[] {
  return db.prepare('SELECT * FROM quiz_attempts WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

export function upsertQuizAttempts(userId: string, attempts: any[]): void {
  const upsert = db.prepare(`
    INSERT INTO quiz_attempts (id, user_id, topic, chapter_title, subject, score, total, percentage, weak_topics, answers, mode_used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      score = excluded.score, total = excluded.total, percentage = excluded.percentage,
      weak_topics = excluded.weak_topics, answers = excluded.answers
  `);
  const batch = db.transaction(() => {
    for (const a of attempts) {
      upsert.run(
        a.id, userId, a.topic || '', a.chapterTitle || a.chapter_title || '', a.subject || '',
        a.score || 0, a.total || 0, a.percentage || 0,
        JSON.stringify(a.weakTopics || a.weak_topics || []),
        JSON.stringify(a.answers || []),
        a.modeUsed || a.mode_used || '', a.createdAt || a.created_at || new Date().toISOString()
      );
    }
  });
  batch();
}

// ─── Mistake Entries ────────────────────────────────────────────────────────

export function getMistakeEntries(userId: string): any[] {
  return db.prepare('SELECT * FROM mistake_entries WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

export function upsertMistakeEntries(userId: string, entries: any[]): void {
  const upsert = db.prepare(`
    INSERT INTO mistake_entries (id, user_id, quiz_id, topic, question, selected_answer, correct_answer, explanation, topic_tag, mode_used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  const batch = db.transaction(() => {
    for (const e of entries) {
      upsert.run(
        e.id, userId, e.quizId || e.quiz_id || '', e.topic || '', e.question || '',
        e.selectedAnswer || e.selected_answer || '', e.correctAnswer || e.correct_answer || '',
        e.explanation || '', e.topicTag || e.topic_tag || '',
        e.modeUsed || e.mode_used || '', e.createdAt || e.created_at || new Date().toISOString()
      );
    }
  });
  batch();
}

// ─── Mastery Entries ────────────────────────────────────────────────────────

export function getMasteryEntries(userId: string): any[] {
  return db.prepare('SELECT * FROM mastery_entries WHERE user_id = ?').all(userId);
}

export function upsertMasteryEntries(userId: string, entries: any[]): void {
  const upsert = db.prepare(`
    INSERT INTO mastery_entries (id, user_id, topic, mastery_score, status, last_attempt_date, next_revision_date, forgetting_risk, attempts, mistake_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      mastery_score = excluded.mastery_score, status = excluded.status,
      last_attempt_date = excluded.last_attempt_date, next_revision_date = excluded.next_revision_date,
      forgetting_risk = excluded.forgetting_risk, attempts = excluded.attempts, mistake_count = excluded.mistake_count
  `);
  const batch = db.transaction(() => {
    for (const e of entries) {
      upsert.run(
        e.id || `mastery-${e.topic}`, userId, e.topic,
        e.masteryScore || e.mastery_score || 0.3,
        e.status || 'not-started',
        e.lastAttemptDate || e.last_attempt_date || null,
        e.nextRevisionDate || e.next_revision_date || null,
        e.forgettingRisk || e.forgetting_risk || 'unknown',
        e.attempts || 0, e.mistakeCount || e.mistake_count || 0
      );
    }
  });
  batch();
}

// ─── Daily Tasks ────────────────────────────────────────────────────────────

export function getDailyTasksDb(userId: string): any[] {
  return db.prepare('SELECT * FROM daily_tasks WHERE user_id = ? ORDER BY due_date ASC').all(userId);
}

export function upsertDailyTasks(userId: string, tasks: any[]): void {
  const upsert = db.prepare(`
    INSERT INTO daily_tasks (id, user_id, source_quiz_id, source_kit_id, title, topic, due_date, action_type, status, completed_date, estimated_minutes, reason, plan_required)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status, completed_date = excluded.completed_date
  `);
  const batch = db.transaction(() => {
    for (const t of tasks) {
      upsert.run(
        t.id, userId, t.sourceQuizId || t.source_quiz_id || '',
        t.sourceKitId || t.source_kit_id || '', t.title || '',
        t.topic || '', t.dueDate || t.due_date || '',
        t.actionType || t.action_type || '', t.status || 'pending',
        t.completedDate || t.completed_date || null,
        t.estimatedMinutes || t.estimated_minutes || 10,
        t.reason || '', t.planRequired || t.plan_required || null
      );
    }
  });
  batch();
}

// ─── Activity Log ───────────────────────────────────────────────────────────

export function getActivityLog(userId: string): any[] {
  return db.prepare('SELECT * FROM activity_log WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

export function upsertActivityLog(userId: string, activities: any[]): void {
  const upsert = db.prepare(`
    INSERT INTO activity_log (id, user_id, type, chapter_id, chapter_title, subject, xp_earned, meta, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  const batch = db.transaction(() => {
    for (const a of activities) {
      upsert.run(
        a.id, userId, a.type,
        a.chapterId || a.chapter_id || '',
        a.chapterTitle || a.chapter_title || '',
        a.subject || '', a.xpEarned || a.xp_earned || 0,
        JSON.stringify(a.meta || {}),
        a.createdAt || a.created_at || new Date().toISOString()
      );
    }
  });
  batch();
}

// ─── Streak ─────────────────────────────────────────────────────────────────

export function getStreakInfo(userId: string): any {
  return db.prepare('SELECT * FROM streak_info WHERE user_id = ?').get(userId) || {
    current_streak: 0, longest_streak: 0, last_active_date: null, is_active_today: 0
  };
}

export function upsertStreakInfo(userId: string, streak: any): void {
  db.prepare(`
    INSERT INTO streak_info (user_id, current_streak, longest_streak, last_active_date, is_active_today)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      current_streak = excluded.current_streak, longest_streak = excluded.longest_streak,
      last_active_date = excluded.last_active_date, is_active_today = excluded.is_active_today
  `).run(userId, streak.current || 0, streak.longest || 0, streak.lastActiveDate || streak.last_active_date || null, streak.isActiveToday ? 1 : 0);
}

// ─── Usage Counters ─────────────────────────────────────────────────────────

export function getUsageCountersDb(userId: string, date: string): any[] {
  return db.prepare('SELECT * FROM usage_counters WHERE user_id = ? AND counter_date = ?').all(userId, date);
}

export function upsertUsageCounter(userId: string, date: string, counterType: string, value: number): void {
  db.prepare(`
    INSERT INTO usage_counters (user_id, counter_date, counter_type, value)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, counter_date, counter_type) DO UPDATE SET value = excluded.value
  `).run(userId, date, counterType, value);
}

// ─── Planner Events ─────────────────────────────────────────────────────────

export function getPlannerEventsDb(userId: string): any[] {
  return db.prepare('SELECT * FROM planner_events WHERE user_id = ? ORDER BY date ASC').all(userId);
}

export function upsertPlannerEvents(userId: string, events: any[]): void {
  const upsert = db.prepare(`
    INSERT INTO planner_events (id, user_id, title, date, type, source)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, date = excluded.date
  `);
  const batch = db.transaction(() => {
    for (const e of events) {
      upsert.run(e.id, userId, e.title, e.date, e.type || 'exam', e.source || null);
    }
  });
  batch();
}

// ─── Written Answers ────────────────────────────────────────────────────────

export function getWrittenAnswersDb(userId: string): any[] {
  return db.prepare('SELECT * FROM written_answers WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

export function upsertWrittenAnswers(userId: string, answers: any[]): void {
  const upsert = db.prepare(`
    INSERT INTO written_answers (id, user_id, question, student_answer, marks_scored, total_marks, missing_keywords, strengths, improvements, model_answer, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  const batch = db.transaction(() => {
    for (const a of answers) {
      upsert.run(
        a.id, userId, a.question || '', a.studentAnswer || a.student_answer || '',
        a.marksScored || a.marks_scored || 0, a.totalMarks || a.total_marks || 0,
        JSON.stringify(a.missingKeywords || a.missing_keywords || []),
        JSON.stringify(a.strengths || []), JSON.stringify(a.improvements || []),
        a.modelAnswer || a.model_answer || '',
        a.createdAt || a.created_at || new Date().toISOString()
      );
    }
  });
  batch();
}

// ─── Account Deletion (DPDP compliance) ────────────────────────────────────

export function deleteUserData(userId: string): void {
  const tables = [
    'stats', 'library_items', 'kits', 'payments', 'sessions',
    'quiz_attempts', 'mistake_entries', 'mastery_entries', 'daily_tasks',
    'activity_log', 'usage_counters', 'planner_events', 'written_answers', 'streak_info',
  ];
  const deleteAll = db.transaction(() => {
    for (const table of tables) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });
  deleteAll();
}
