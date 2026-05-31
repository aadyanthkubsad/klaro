# Klaro Critical Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Klaro's JSON-file storage with SQLite, add email+password auth with JWT, integrate Razorpay payments, and add CBSE syllabus verification.

**Architecture:** Four phases executed sequentially — SQLite database first (foundation), then auth (user identity), then payments (monetization), then syllabus verification (data quality). Each phase produces a working, independently testable system.

**Tech Stack:** better-sqlite3, bcryptjs, jsonwebtoken, razorpay (Node SDK), Express middleware, React context for auth state.

---

## Phase 1: SQLite Database

### Task 1: Install better-sqlite3 and create schema

**Files:**
- Modify: `package.json` (add better-sqlite3 + types)
- Create: `server/schema.sql`
- Rewrite: `server/database.ts`

- [ ] **Step 1: Install dependencies**

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

- [ ] **Step 2: Create SQL schema file**

Create `server/schema.sql`:

```sql
-- Klaro SQLite Schema v1

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT NOT NULL DEFAULT 'Learner',
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK(plan_type IN ('free', 'plus', 'pro')),
  plan_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
  total_kits_generated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stats (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  streak INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  weak_topics TEXT NOT NULL DEFAULT '[]',
  strengths TEXT NOT NULL DEFAULT '[]',
  quiz_scores TEXT NOT NULL DEFAULT '[]',
  mistakes TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  content_snippet TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  kit_data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  plan_type TEXT NOT NULL CHECK(plan_type IN ('plus', 'pro')),
  billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly', 'yearly')),
  status TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created', 'paid', 'failed', 'refunded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_library_user ON library_items(user_id);
CREATE INDEX IF NOT EXISTS idx_kits_user ON kits(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
```

- [ ] **Step 3: Rewrite `server/database.ts` with better-sqlite3**

Replace the entire file with SQLite-backed functions. Keep the same export signatures so `server.ts` doesn't break. Key changes:

```typescript
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'klaro.db');
const SCHEMA_PATH = path.join(process.cwd(), 'server', 'schema.sql');

let db: Database.Database;

export function initDatabase(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  // Migrate existing JSON data if klaro-db.json exists and SQLite is empty
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get() as any;
  if (userCount.c === 0) {
    migrateFromJson();
  }

  logger.info('SQLite database initialized', { meta: { path: DB_PATH } });
}

function migrateFromJson(): void {
  const jsonPath = path.join(DATA_DIR, 'klaro-db.json');
  if (!fs.existsSync(jsonPath)) return;

  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    // Create a default anonymous user for the migrated data
    const userId = 'u-migrated';
    db.prepare('INSERT OR IGNORE INTO users (id, display_name, plan_type) VALUES (?, ?, ?)').run(userId, 'Learner', 'free');
    db.prepare('INSERT OR IGNORE INTO stats (user_id, streak, xp, level, weak_topics, strengths, quiz_scores, mistakes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      userId, raw.stats?.streak || 0, raw.stats?.xp || 0, raw.stats?.level || 1,
      JSON.stringify(raw.stats?.weakTopics || []), JSON.stringify(raw.stats?.strengths || []),
      JSON.stringify(raw.stats?.quizScores || []), JSON.stringify(raw.stats?.mistakes || [])
    );
    for (const item of (raw.library || [])) {
      db.prepare('INSERT OR IGNORE INTO library_items (id, user_id, title, type, date, progress, content_snippet, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        item.id, userId, item.title, item.type, item.date || '', item.progress || 0, item.contentSnippet || '', JSON.stringify(item.tags || [])
      );
    }
    for (const [kitId, kitData] of Object.entries(raw.kits || {})) {
      db.prepare('INSERT OR IGNORE INTO kits (id, user_id, data) VALUES (?, ?, ?)').run(kitId, userId, JSON.stringify(kitData));
    }
    logger.info('Migrated data from klaro-db.json to SQLite');
  } catch (err) {
    logger.error('JSON migration failed', { meta: { error: (err as Error).message } });
  }
}

export function flushDatabase(): void {
  if (db) db.close();
}

// --- User management (updated for auth in Phase 2) ---

export function getOrCreateUser(identifier: string): any {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(identifier);
  if (!user) {
    const id = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    db.prepare('INSERT INTO users (id, display_name) VALUES (?, ?)').run(id, 'Learner');
    db.prepare('INSERT INTO stats (user_id) VALUES (?)').run(id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  db.prepare('UPDATE users SET last_active_at = datetime("now") WHERE id = ?').run((user as any).id);
  return user;
}

export function getUserPlan(userId: string): 'free' | 'plus' | 'pro' {
  const user = db.prepare('SELECT plan_type FROM users WHERE id = ?').get(userId) as any;
  return user?.plan_type || 'free';
}

export function incrementUserKitCount(userId: string): void {
  db.prepare('UPDATE users SET total_kits_generated = total_kits_generated + 1 WHERE id = ?').run(userId);
}

// --- Stats ---

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
  db.prepare(
    'INSERT INTO stats (user_id, streak, xp, level, weak_topics, strengths, quiz_scores, mistakes) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET streak=?, xp=?, level=?, weak_topics=?, strengths=?, quiz_scores=?, mistakes=?'
  ).run(
    userId, merged.streak, merged.xp, merged.level,
    JSON.stringify(merged.weakTopics), JSON.stringify(merged.strengths),
    JSON.stringify(merged.quizScores), JSON.stringify(merged.mistakes),
    merged.streak, merged.xp, merged.level,
    JSON.stringify(merged.weakTopics), JSON.stringify(merged.strengths),
    JSON.stringify(merged.quizScores), JSON.stringify(merged.mistakes)
  );
  return merged;
}

// --- Library ---

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
      item.title, item.type, item.date || '', item.progress || 0, item.contentSnippet || '', JSON.stringify(item.tags || []),
      item.kitData ? JSON.stringify(item.kitData) : null, item.id, userId
    );
  } else {
    db.prepare('INSERT INTO library_items (id, user_id, title, type, date, progress, content_snippet, tags, kit_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      item.id, userId, item.title, item.type, item.date || '', item.progress || 0, item.contentSnippet || '', JSON.stringify(item.tags || []),
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
  // Remove duplicates — keep the most recent entry for each normalized title+type pair
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
    const placeholders = toDelete.map(() => '?').join(',');
    db.prepare(`DELETE FROM library_items WHERE id IN (${placeholders}) AND user_id = ?`).run(...toDelete, userId);
  }
  return getLibrary(userId);
}

// --- Kits ---

export function getKit(id: string, userId: string = 'u-migrated') {
  const row = db.prepare('SELECT data FROM kits WHERE id = ? AND user_id = ?').get(id, userId) as any;
  return row ? JSON.parse(row.data) : null;
}

export function saveKit(id: string, kit: any, userId: string = 'u-migrated') {
  db.prepare('INSERT INTO kits (id, user_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = ?').run(
    id, userId, JSON.stringify(kit), JSON.stringify(kit)
  );
}

export function getAllKits(userId: string = 'u-migrated') {
  const rows = db.prepare('SELECT id, data FROM kits WHERE user_id = ?').all(userId) as any[];
  const result: Record<string, any> = {};
  for (const r of rows) {
    result[r.id] = JSON.parse(r.data);
  }
  return result;
}

// --- Database stats ---

export function getDatabaseStats() {
  const users = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
  const kits = (db.prepare('SELECT COUNT(*) as c FROM kits').get() as any).c;
  const library = (db.prepare('SELECT COUNT(*) as c FROM library_items').get() as any).c;
  const dbSize = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  return { users, kits, libraryItems: library, dbSizeBytes: dbSize };
}
```

- [ ] **Step 4: Update `server.ts` imports and API endpoints**

The database functions now accept `userId` parameters. For Phase 1 (no auth yet), use a fallback anonymous user. Update each endpoint that calls `getStats()`, `getLibrary()`, etc. to pass a default userId. This is a compatibility bridge until auth is added in Phase 2.

Key pattern — in every endpoint that currently calls `getStats()`:
```typescript
// Before:
const stats = getStats();
// After (Phase 1 — no auth yet, use anonymous):
const userId = 'u-migrated';
const stats = getStats(userId);
```

Apply this pattern to all endpoints: `/api/dashboard-data`, `/api/save-to-library`, `/api/update-stats`, `/api/delete-library-item`, `/api/cleanup-library`, `/api/get-kit/:id`, and all AI endpoints that save kits.

- [ ] **Step 5: Add `klaro.db` and `klaro-db.json.bak` to `.gitignore`**

```
data/klaro.db
data/klaro.db-wal
data/klaro.db-shm
data/klaro-db.json.bak
```

- [ ] **Step 6: Test the migration**

```bash
npm run dev
```

Open the app, verify:
1. Existing library items still appear
2. Stats (streak, XP) are preserved
3. New kits can be generated and saved
4. `data/klaro.db` exists and grows as data is written

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: migrate from JSON file to SQLite database

- Replace klaro-db.json with better-sqlite3 (klaro.db)
- Auto-migrate existing JSON data on first run
- WAL mode for concurrent read performance
- Schema: users, stats, library_items, kits, payments, sessions"
```

---

## Phase 2: Email + Password Authentication

### Task 2: Auth backend — registration, login, JWT middleware

**Files:**
- Modify: `package.json` (add bcryptjs, jsonwebtoken)
- Create: `server/auth.ts`
- Modify: `server/database.ts` (add auth-specific queries)
- Modify: `server.ts` (add auth endpoints + middleware)

- [ ] **Step 1: Install dependencies**

```bash
npm install bcryptjs jsonwebtoken
npm install -D @types/bcryptjs @types/jsonwebtoken
```

- [ ] **Step 2: Create `server/auth.ts`**

```typescript
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'klaro-dev-secret-change-in-production';
const JWT_EXPIRY = '7d';
const SALT_ROUNDS = 10;

export interface AuthPayload {
  userId: string;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function authMiddleware(req: any, res: any, next: any): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    // Allow anonymous access with fallback user for backward compatibility
    req.userId = 'u-migrated';
    return next();
  }
  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
  req.userId = payload.userId;
  req.userEmail = payload.email;
  next();
}

export function requireAuth(req: any, res: any, next: any): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
  req.userId = payload.userId;
  req.userEmail = payload.email;
  next();
}
```

- [ ] **Step 3: Add auth queries to `server/database.ts`**

Add these functions to the database module:

```typescript
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
```

- [ ] **Step 4: Add auth endpoints to `server.ts`**

Add before the existing API routes:

```typescript
import { authMiddleware, requireAuth, hashPassword, verifyPassword, generateToken } from './server/auth.js';
import { createUser, getUserByEmail, getUserById, updateUserPlan } from './server/database.js';

// Apply auth middleware globally (allows anonymous)
app.use(authMiddleware);

// --- Auth endpoints ---

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }
    const existing = getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists' });
    }
    const hash = await hashPassword(password);
    const user = createUser(email, hash, displayName || 'Learner');
    const token = generateToken({ userId: user.id, email: user.email });
    res.json({ success: true, token, user: { id: user.id, email: user.email, displayName: user.display_name, planType: user.plan_type } });
  } catch (err: any) {
    logger.error('Registration failed', { meta: { error: err.message } });
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }
    const user = getUserByEmail(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }
    const token = generateToken({ userId: user.id, email: user.email });
    res.json({ success: true, token, user: { id: user.id, email: user.email, displayName: user.display_name, planType: user.plan_type } });
  } catch (err: any) {
    logger.error('Login failed', { meta: { error: err.message } });
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

app.get('/api/auth/me', requireAuth, (req: any, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true, user: { id: user.id, email: user.email, displayName: user.display_name, planType: user.plan_type } });
});
```

- [ ] **Step 5: Update existing endpoints to use `req.userId`**

Replace all hardcoded `'u-migrated'` references in endpoints with `req.userId` (set by `authMiddleware`). For example:

```typescript
// Before:
app.get('/api/dashboard-data', (req, res) => {
  const stats = getStats('u-migrated');
  const library = getLibrary('u-migrated');

// After:
app.get('/api/dashboard-data', (req: any, res) => {
  const stats = getStats(req.userId);
  const library = getLibrary(req.userId);
```

- [ ] **Step 6: Create frontend auth context**

Create `src/contexts/AuthContext.tsx`:

```typescript
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface User {
  id: string;
  email: string;
  displayName: string;
  planType: 'free' | 'plus' | 'pro';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>(null!);
export const useAuth = () => useContext(AuthContext);

const TOKEN_KEY = 'klaro:auth-token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(true);

  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const headers: any = { 'Content-Type': 'application/json', ...options.headers };
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) headers['Authorization'] = `Bearer ${t}`;
    return fetch(url, { ...options, headers });
  }, []);

  useEffect(() => {
    if (!token) { setIsLoading(false); return; }
    authFetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data.success) setUser(data.user);
        else { localStorage.removeItem(TOKEN_KEY); setToken(null); }
      })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); })
      .finally(() => setIsLoading(false));
  }, [token, authFetch]);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const register = async (email: string, password: string, displayName: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
```

- [ ] **Step 7: Create Login/Register page component**

Create `src/components/views/AuthView.tsx` — a form with email, password, display name (for register), and toggle between login/register modes. Use the `useAuth()` hook to call `login()` or `register()`. On success, redirect to dashboard.

- [ ] **Step 8: Wire auth into `App.tsx`**

Wrap the app in `<AuthProvider>`. Add the auth token to all `fetch()` calls. Show `AuthView` when not logged in (or allow guest access with limited features).

- [ ] **Step 9: Update `billingService.ts`**

Set `DEV_FORCE_PRO = false`. Read the plan from the authenticated user's data instead of localStorage:

```typescript
export const DEV_FORCE_PRO = false;

export function getPlan(): PlanType {
  // Read from localStorage where AuthContext stores it
  const stored = localStorage.getItem('klaro:plan');
  if (stored === 'free' || stored === 'plus' || stored === 'pro') return stored;
  return 'free';
}
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add email+password authentication with JWT

- Registration with bcrypt password hashing
- Login returns JWT token (7-day expiry)
- Auth middleware on all endpoints (allows anonymous fallback)
- AuthContext for React state management
- Login/Register UI component"
```

---

## Phase 3: Razorpay Payment Integration

### Task 3: Razorpay backend — order creation, payment verification, webhooks

**Files:**
- Modify: `package.json` (add razorpay)
- Create: `server/payments.ts`
- Modify: `server/database.ts` (add payment queries)
- Modify: `server.ts` (add payment endpoints)

- [ ] **Step 1: Install Razorpay SDK**

```bash
npm install razorpay
npm install -D @types/razorpay
```

- [ ] **Step 2: Create `server/payments.ts`**

```typescript
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { logger } from './logger.js';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

export const PLAN_PRICES: Record<string, { amount: number; currency: string }> = {
  'plus-monthly': { amount: 24900, currency: 'INR' },   // ₹249
  'plus-yearly': { amount: 179900, currency: 'INR' },   // ₹1799
  'pro-monthly': { amount: 49900, currency: 'INR' },    // ₹499
  'pro-yearly': { amount: 349900, currency: 'INR' },    // ₹3499
};

export async function createOrder(planKey: string, userId: string): Promise<any> {
  const price = PLAN_PRICES[planKey];
  if (!price) throw new Error(`Invalid plan: ${planKey}`);

  const order = await razorpay.orders.create({
    amount: price.amount,
    currency: price.currency,
    receipt: `klaro_${userId}_${Date.now()}`,
    notes: { userId, planKey },
  });

  return order;
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return expectedSignature === signature;
}

export function isRazorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}
```

- [ ] **Step 3: Add payment queries to `server/database.ts`**

```typescript
export function createPaymentRecord(userId: string, orderId: string, amount: number, currency: string, planType: string, billingCycle: string): void {
  const id = `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  db.prepare('INSERT INTO payments (id, user_id, razorpay_order_id, amount, currency, plan_type, billing_cycle) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, userId, orderId, amount, currency, planType, billingCycle
  );
}

export function markPaymentPaid(orderId: string, paymentId: string, signature: string): void {
  db.prepare('UPDATE payments SET razorpay_payment_id = ?, razorpay_signature = ?, status = ?, paid_at = datetime("now") WHERE razorpay_order_id = ?').run(
    paymentId, signature, 'paid', orderId
  );
}

export function getPaymentByOrderId(orderId: string): any {
  return db.prepare('SELECT * FROM payments WHERE razorpay_order_id = ?').get(orderId);
}
```

- [ ] **Step 4: Add payment endpoints to `server.ts`**

```typescript
import { createOrder, verifyPaymentSignature, isRazorpayConfigured, PLAN_PRICES } from './server/payments.js';
import { createPaymentRecord, markPaymentPaid, getPaymentByOrderId } from './server/database.js';

app.post('/api/payments/create-order', requireAuth, async (req: any, res) => {
  if (!isRazorpayConfigured()) {
    return res.status(503).json({ success: false, error: 'Payment system not configured' });
  }
  try {
    const { planKey } = req.body; // e.g. "plus-monthly", "pro-yearly"
    if (!PLAN_PRICES[planKey]) {
      return res.status(400).json({ success: false, error: 'Invalid plan' });
    }
    const order = await createOrder(planKey, req.userId);
    const [planType, billingCycle] = planKey.split('-');
    createPaymentRecord(req.userId, order.id, order.amount, order.currency, planType, billingCycle);
    res.json({
      success: true,
      order: { id: order.id, amount: order.amount, currency: order.currency },
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err: any) {
    logger.error('Payment order creation failed', { meta: { error: err.message } });
    res.status(500).json({ success: false, error: 'Could not create payment order' });
  }
});

app.post('/api/payments/verify', requireAuth, async (req: any, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const isValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Payment verification failed' });
    }
    markPaymentPaid(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    const payment = getPaymentByOrderId(razorpay_order_id);
    if (payment) {
      const expiresAt = payment.billing_cycle === 'yearly'
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      updateUserPlan(req.userId, payment.plan_type, expiresAt);
    }
    const user = getUserById(req.userId);
    res.json({ success: true, user: { id: user.id, planType: user.plan_type } });
  } catch (err: any) {
    logger.error('Payment verification failed', { meta: { error: err.message } });
    res.status(500).json({ success: false, error: 'Payment verification failed' });
  }
});
```

- [ ] **Step 5: Add `.env` variables for Razorpay**

Add to `.env`:
```
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
JWT_SECRET=your-production-secret-here
```

- [ ] **Step 6: Update frontend `OffersView.tsx` with Razorpay checkout**

Load the Razorpay checkout script dynamically. When user clicks "Subscribe", call `/api/payments/create-order`, then open Razorpay checkout modal, then call `/api/payments/verify` on success.

Key pattern:
```typescript
const handleSubscribe = async (planKey: string) => {
  const res = await authFetch('/api/payments/create-order', {
    method: 'POST', body: JSON.stringify({ planKey }),
  });
  const { order, key } = await res.json();

  const options = {
    key,
    amount: order.amount,
    currency: order.currency,
    name: 'Klaro Learn',
    description: `${planKey} subscription`,
    order_id: order.id,
    handler: async (response: any) => {
      await authFetch('/api/payments/verify', {
        method: 'POST', body: JSON.stringify(response),
      });
      // Refresh user data to reflect new plan
    },
    prefill: { email: user?.email },
    theme: { color: '#0058be' },
  };
  const rzp = new (window as any).Razorpay(options);
  rzp.open();
};
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: integrate Razorpay payment gateway

- Order creation and signature verification
- Payment records in SQLite
- Plan upgrade on successful payment
- Razorpay checkout modal in OffersView
- Test mode keys in .env"
```

---

## Phase 4: Syllabus Verification

### Task 4: Verify chapter data against official CBSE curriculum

**Files:**
- Modify: `src/data/class10Syllabus.ts` (add verification metadata)
- Modify: `src/data/syllabus.ts` (add verification status)
- Create: `server/syllabusVerifier.ts`
- Modify: `server.ts` (add verification endpoint)

- [ ] **Step 1: Add verification metadata to chapter type**

In `src/data/class10Syllabus.ts`, extend `SyllabusSource` or add to `ChapterItem`:

```typescript
export interface SyllabusSource {
  sourceName: string;
  sourceType: 'CBSE-Academic' | 'NCERT-TOC' | 'Manual';
  academicYear: string;
  verified: boolean;
  lastChecked: string;
  verificationUrl?: string;
}
```

- [ ] **Step 2: Create `server/syllabusVerifier.ts`**

Build a server-side verifier that checks chapter names against CBSE's published curriculum pages:

```typescript
import { logger } from './logger.js';

interface VerificationResult {
  chapter: string;
  subject: string;
  classLevel: string;
  found: boolean;
  officialName?: string;
  source: string;
  checkedAt: string;
}

// Known CBSE Class 10 curriculum (2025-26) — manually verified reference data
const CBSE_CLASS10_CURRICULUM: Record<string, string[]> = {
  'Science': [
    'Chemical Reactions and Equations',
    'Acids, Bases and Salts',
    'Metals and Non-metals',
    'Carbon and its Compounds',
    'Life Processes',
    'Control and Coordination',
    'How do Organisms Reproduce?',
    'Heredity',
    'Light – Reflection and Refraction',
    'The Human Eye and the Colourful World',
    'Electricity',
    'Magnetic Effects of Electric Current',
    'Our Environment',
  ],
  'Mathematics': [
    'Real Numbers',
    'Polynomials',
    'Pair of Linear Equations in Two Variables',
    'Quadratic Equations',
    'Arithmetic Progressions',
    'Triangles',
    'Coordinate Geometry',
    'Introduction to Trigonometry',
    'Some Applications of Trigonometry',
    'Circles',
    'Areas Related to Circles',
    'Surface Areas and Volumes',
    'Statistics',
    'Probability',
  ],
  // Add Social Science, English, Hindi...
};

export function verifyChapter(chapter: string, subject: string, classLevel: string = 'Class 10'): VerificationResult {
  const curriculum = CBSE_CLASS10_CURRICULUM[subject] || [];
  const normalized = chapter.trim().toLowerCase();
  const match = curriculum.find(c => c.toLowerCase() === normalized);
  const fuzzyMatch = !match ? curriculum.find(c =>
    c.toLowerCase().includes(normalized) || normalized.includes(c.toLowerCase())
  ) : null;

  return {
    chapter,
    subject,
    classLevel,
    found: !!match || !!fuzzyMatch,
    officialName: match || fuzzyMatch || undefined,
    source: 'CBSE Academic Curriculum 2025-26',
    checkedAt: new Date().toISOString(),
  };
}

export function verifyAllChapters(chapters: Array<{ title: string; subject: string }>, classLevel: string = 'Class 10'): VerificationResult[] {
  return chapters.map(c => verifyChapter(c.title, c.subject, classLevel));
}
```

- [ ] **Step 3: Add verification endpoint to `server.ts`**

```typescript
import { verifyChapter, verifyAllChapters } from './server/syllabusVerifier.js';

app.post('/api/verify-syllabus', (req: any, res) => {
  const { chapters, classLevel } = req.body;
  if (!chapters || !Array.isArray(chapters)) {
    return res.status(400).json({ success: false, error: 'chapters array required' });
  }
  const results = verifyAllChapters(chapters, classLevel || 'Class 10');
  const verified = results.filter(r => r.found).length;
  res.json({
    success: true,
    summary: { total: results.length, verified, unverified: results.length - verified },
    results,
  });
});
```

- [ ] **Step 4: Update the syllabus data files with verification status**

For each chapter in `class10Syllabus.ts`, set `verified: true` and `lastChecked: '2026-05-31'` for chapters that match the CBSE reference data. Set `verified: false` for any chapter that doesn't match.

- [ ] **Step 5: Show verification badge in Dashboard chapter cards**

In the chapter list UI, show a small green checkmark for verified chapters and an amber warning for unverified ones (already partially implemented — extend to use the `SyllabusSource.verified` field).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add CBSE syllabus verification

- Reference curriculum data for Class 10 Science + Mathematics
- Server endpoint to verify chapter names against CBSE curriculum
- Verification metadata on chapter items
- Visual indicators for verified/unverified chapters"
```

---

## Implementation Order Summary

| Phase | Feature | Depends On | Key Deliverable |
|-------|---------|------------|-----------------|
| 1 | SQLite Database | — | `data/klaro.db` replaces JSON file |
| 2 | Email + Password Auth | Phase 1 | JWT login, user accounts |
| 3 | Razorpay Payments | Phase 1 + 2 | Real plan upgrades |
| 4 | Syllabus Verification | — (can run in parallel) | Chapter verification badges |
