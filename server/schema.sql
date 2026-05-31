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
