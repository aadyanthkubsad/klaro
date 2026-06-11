/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { retrieveChunks } from './src/data/syllabusRetrieval.js';
import { getChapterContext } from './src/data/cbseChapterContext.js';
import { logger, generateRequestId } from './server/logger.js';
import { validateGenerateKit, validateYouTubeRecall, validateStudyNotes, validateEvaluateAnswer, validateGenerateQuiz, validateGenerateFlashcards, validateWeakTopicAnalysis, validateGenerateAudio, sendValidationErrors, LIMITS } from './server/validate.js';
import { generateAudio, validateSarvamConfig, SarvamError, cleanupOldAudioFiles } from './server/services/sarvamService.js';
import { getChapterAudioTarget, describeTarget } from './server/data/chapterWeightage.js';
import { checkRateLimit, cleanupStaleEntries, getUsageStats, type EndpointBucket, type PlanType } from './server/rateLimiter.js';
import { enqueueAIRequest, configureQueue, getQueueStats } from './server/queue.js';
import { cacheGet, cacheSet, buildCacheKey, configureCache, getCacheStats, cleanupExpiredCache, cacheInvalidate, cacheInvalidateByPrefix } from './server/cache.js';
import { initDatabase, flushDatabase, getStats, updateStats, getLibrary, addToLibrary, removeFromLibrary, cleanupLibrary, getKit, saveKit, getOrCreateUser, getUserPlan, incrementUserKitCount, getDatabaseStats, getAllKits, createUser, getUserByEmail, getUserById, updateUserPlan, createPaymentRecord, markPaymentPaid, getPaymentByOrderId, getQuizAttempts, upsertQuizAttempts, getMistakeEntries, upsertMistakeEntries, getMasteryEntries, upsertMasteryEntries, getDailyTasksDb, upsertDailyTasks, getActivityLog, upsertActivityLog, getStreakInfo, upsertStreakInfo, getUsageCountersDb, upsertUsageCounter, getPlannerEventsDb, upsertPlannerEvents, getWrittenAnswersDb, upsertWrittenAnswers, touchLibraryItem, backfillVarkTypes, deleteUserData } from './server/database.js';
import { authMiddleware, requireAuth, hashPassword, verifyPassword, generateToken } from './server/auth.js';
import { createOrder, verifyPaymentSignature, isRazorpayConfigured, PLAN_PRICES } from './server/payments.js';
import { verifyChapter, verifyAllChapters, getVerifiedSubjects } from './server/syllabusVerifier.js';

const __filename = fileURLToPath(import.meta.url);
// Initialize path helpers
const __dirname = path.dirname(__filename);

const SERVER_VERSION = '1.1.0';
const SERVER_START_TIME = Date.now();

/** Format milliseconds into a human-readable uptime string. */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

/**
 * Safe one-line summary of the configured Gemini API key.
 * Never prints the actual key — just whether it exists and its length.
 */
function logApiKeyStatus() {
  const raw = process.env.GEMINI_API_KEY || '';
  const trimmed = raw.replace(/^["']|["']$/g, '').trim();
  const isPlaceholder = trimmed === '' || trimmed === 'your_api_key_here' || trimmed === 'undefined' || trimmed === 'null';
  logger.info('Gemini API key check', { meta: { exists: !isPlaceholder, keyLength: trimmed.length } });
  if (isPlaceholder) {
    logger.warn('Gemini API key missing — add a real key to .env then restart');
  }
}

function logSarvamKeyStatus() {
  const sarvamCheck = validateSarvamConfig();
  logger.info('Sarvam TTS key check', { meta: { configured: sarvamCheck.ok } });
  if (!sarvamCheck.ok) {
    logger.warn('Sarvam TTS disabled — add SARVAM_API_KEY to .env; falling back to browser speech synthesis');
  }
}

async function startServer() {
  logApiKeyStatus();
  logSarvamKeyStatus();

  // ── Initialize infrastructure ──────────────────────────────────────────────
  initDatabase();

  // One-time migration: backfill VARK types for legacy 'revision-kit' library items
  const varkBackfilled = backfillVarkTypes();
  if (varkBackfilled > 0) {
    logger.info(`VARK backfill: updated ${varkBackfilled} library items`);
  }

  // Invalidate cached notes and kits so they regenerate with the new topper's notebook prompt
  const notesInvalidated = cacheInvalidateByPrefix('study-notes');
  const kitsInvalidated = cacheInvalidateByPrefix('generate-kit');
  const totalInvalidated = notesInvalidated + kitsInvalidated;
  if (totalInvalidated > 0) {
    logger.info(`Cache invalidated: ${notesInvalidated} notes, ${kitsInvalidated} kits`);
  }

  configureQueue({
    maxConcurrent: parseInt(process.env.AI_MAX_CONCURRENT || '5', 10),
    maxQueueLength: parseInt(process.env.AI_MAX_QUEUE || '50', 10),
    requestTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '180000', 10),
  });
  configureCache({
    ttlMs: parseInt(process.env.CACHE_TTL_MS || '3600000', 10),
    maxEntries: parseInt(process.env.CACHE_MAX_ENTRIES || '200', 10),
  });

  // Periodic cleanup tasks
  setInterval(() => { cleanupStaleEntries(); cleanupExpiredCache(); cleanupOldAudioFiles(); }, 60 * 60 * 1000); // Every hour

  // Graceful shutdown — flush DB on SIGTERM/SIGINT
  const shutdown = () => { logger.info('Shutting down — flushing database...'); flushDatabase(); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "https://lumberjack-cx.razorpay.com", "https://api.razorpay.com"],
        frameSrc: ["https://api.razorpay.com"],
      },
    },
  }));

  app.use(express.json({ limit: '1mb' }));
  const largeBodyParser = express.json({ limit: '15mb' });

  // Serve generated audio files (Sarvam TTS output)
  app.use('/generated-audio', express.static(path.join(process.cwd(), 'public', 'generated-audio')));

  // ── Request logging & ID middleware ────────────────────────────────────────
  app.use((req, res, next) => {
    const requestId = generateRequestId();
    (req as any).requestId = requestId;
    (req as any).startTime = Date.now();

    // Extract client IP for rate limiting
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress || 'unknown';
    (req as any).clientIp = clientIp;

    // Resolve plan type from DB (MVP: stored per IP)
    const plan = getUserPlan(clientIp);
    (req as any).userPlan = plan;

    // Touch user record
    getOrCreateUser(clientIp);

    // Log completion (read req.userPlan at finish time to capture owner overrides)
    res.on('finish', () => {
      const duration = Date.now() - (req as any).startTime;
      if (req.path.startsWith('/api/')) {
        logger.info(`${req.method} ${req.path} ${res.statusCode}`, {
          requestId,
          endpoint: req.path,
          userPlan: (req as any).userPlan || plan,
          clientIp,
          durationMs: duration,
        });
      }
    });

    next();
  });

  // ── Auth middleware (sets req.userId — allows anonymous fallback) ─────────
  app.use(authMiddleware);

  // ── Owner override — grant Pro plan to founder emails ──────────────────────
  const OWNER_EMAILS = (process.env.OWNER_EMAILS || 'prashanth.kubsad@gmail.com,kubsadaadyanth@gmail.com')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  app.use((req: any, _res: any, next: any) => {
    if (req.userEmail && OWNER_EMAILS.includes(req.userEmail.toLowerCase())) {
      req.userPlan = 'pro';
      return next();
    }
    if (req.userId && req.userId !== 'u-migrated') {
      try {
        const dbUser = getUserById(req.userId);
        if (dbUser?.email && OWNER_EMAILS.includes(dbUser.email.toLowerCase())) {
          req.userEmail = dbUser.email;
          req.userPlan = 'pro';
          return next();
        }
      } catch { /* DB lookup failed — continue */ }
    }
    next();
  });

  // ── Auth endpoints ──────────────────────────────────────────────────────────

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

  app.delete('/api/account', requireAuth, (req: any, res) => {
    try {
      deleteUserData(req.userId);
      logger.info('Account deleted', { endpoint: '/api/account', meta: { userId: req.userId } });
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Account deletion failed', { endpoint: '/api/account', meta: { userId: req.userId, error: err.message } });
      res.status(500).json({ success: false, error: 'Failed to delete account' });
    }
  });

  // ── Payment endpoints ────────────────────────────────────────────────────

  app.post('/api/payments/create-order', requireAuth, async (req: any, res) => {
    if (!isRazorpayConfigured()) {
      return res.status(503).json({ success: false, error: 'Payment system not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env' });
    }
    try {
      const { planKey } = req.body;
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
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ success: false, error: 'Missing payment details' });
      }
      const isValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
      if (!isValid) {
        return res.status(400).json({ success: false, error: 'Payment verification failed — invalid signature' });
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

  // ── Sync endpoints ──────────────────────────────────────────────────────

  app.get('/api/sync/pull', requireAuth, (req: any, res) => {
    try {
      const userId = req.userId;
      res.json({
        success: true,
        data: {
          quizHistory: getQuizAttempts(userId),
          mistakes: getMistakeEntries(userId),
          mastery: getMasteryEntries(userId),
          dailyTasks: getDailyTasksDb(userId),
          activityLog: getActivityLog(userId),
          streak: getStreakInfo(userId),
          plannerEvents: getPlannerEventsDb(userId),
          writtenAnswers: getWrittenAnswersDb(userId),
        }
      });
    } catch (err: any) {
      logger.error('Sync pull failed', { meta: { error: err.message } });
      res.status(500).json({ success: false, error: 'Sync pull failed' });
    }
  });

  app.post('/api/sync/push', requireAuth, (req: any, res) => {
    try {
      const userId = req.userId;
      const { quizHistory, mistakes, mastery, dailyTasks, activityLog, streak, usageCounters, plannerEvents, writtenAnswers } = req.body;

      if (quizHistory) upsertQuizAttempts(userId, quizHistory);
      if (mistakes) upsertMistakeEntries(userId, mistakes);
      if (mastery) upsertMasteryEntries(userId, mastery);
      if (dailyTasks) upsertDailyTasks(userId, dailyTasks);
      if (activityLog) upsertActivityLog(userId, activityLog);
      if (streak) upsertStreakInfo(userId, streak);
      if (usageCounters && Array.isArray(usageCounters)) {
        for (const c of usageCounters) {
          upsertUsageCounter(userId, c.date, c.type, c.value);
        }
      }
      if (plannerEvents) upsertPlannerEvents(userId, plannerEvents);
      if (writtenAnswers) upsertWrittenAnswers(userId, writtenAnswers);

      res.json({ success: true });
    } catch (err: any) {
      logger.error('Sync push failed', { meta: { error: err.message } });
      res.status(500).json({ success: false, error: 'Sync push failed' });
    }
  });

  // ── Syllabus verification endpoint ───────────────────────────────────────

  app.post('/api/verify-syllabus', (req: any, res) => {
    const { chapters, classLevel } = req.body;
    if (!chapters || !Array.isArray(chapters)) {
      return res.status(400).json({ success: false, error: 'chapters array required (each with title and subject)' });
    }
    const results = verifyAllChapters(chapters, classLevel || 'Class 10');
    const verified = results.filter(r => r.found).length;
    res.json({
      success: true,
      summary: { total: results.length, verified, unverified: results.length - verified },
      subjects: getVerifiedSubjects(),
      results,
    });
  });

  app.get('/api/verify-chapter', (req: any, res) => {
    const { chapter, subject, classLevel } = req.query;
    if (!chapter || !subject) {
      return res.status(400).json({ success: false, error: 'chapter and subject query params required' });
    }
    const result = verifyChapter(chapter as string, subject as string, (classLevel as string) || 'Class 10');
    res.json({ success: true, result });
  });

  // ── Helper: rate limit middleware factory ──────────────────────────────────
  function rateLimitMiddleware(bucket: EndpointBucket) {
    return (req: any, res: any, next: any) => {
      const result = checkRateLimit(req.clientIp, bucket, req.userPlan);
      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);

      if (!result.allowed) {
        if (result.limit === 0) {
          // Feature not available for this plan
          const requiredPlan = bucket === 'youtube-recall' ? 'Pro' : 'Plus';
          return res.status(403).json({
            success: false,
            error: `This feature requires ${requiredPlan} plan. Upgrade to access it.`,
            errorCode: 'PLAN_REQUIRED',
          });
        }
        if (result.retryAfterSeconds) {
          res.setHeader('Retry-After', result.retryAfterSeconds);
        }
        return res.status(429).json({
          success: false,
          error: `Daily limit reached (${result.limit}/${result.limit} used). Try again tomorrow or upgrade your plan.`,
          errorCode: 'RATE_LIMITED',
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }
      next();
    };
  }

  // ── Health Check — public liveness probe (no sensitive data) ──────────────
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: SERVER_VERSION, uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000) });
  });

  // ── Admin health — full stats, requires auth ────────────────────────────
  app.get('/api/admin/health', requireAuth, (_req, res) => {
    const raw = process.env.GEMINI_API_KEY || '';
    const trimmed = raw.replace(/^["']|["']$/g, '').trim();
    const geminiConfigured = !!trimmed && trimmed !== 'your_api_key_here' && trimmed !== 'undefined';
    res.json({
      status: 'ok',
      version: SERVER_VERSION,
      uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
      uptimeFormatted: formatUptime(Date.now() - SERVER_START_TIME),
      geminiConfigured,
      queue: getQueueStats(),
      cache: getCacheStats(),
      database: getDatabaseStats(),
    });
  });

  // ── Paper link validation (HEAD request proxy) ───────────────────────────
  app.get('/api/check-paper-link', async (req: any, res) => {
    const url = req.query.url as string;
    if (!url || !/^https:\/\/(cbseacademic\.nic\.in|cbse\.gov\.in)\//i.test(url)) {
      return res.json({ ok: false, reason: 'invalid-url' });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
      clearTimeout(timeout);
      const contentType = resp.headers.get('content-type') || '';
      const ok = resp.ok && (contentType.includes('pdf') || contentType.includes('octet-stream') || contentType.includes('html'));
      res.json({ ok, status: resp.status, contentType });
    } catch {
      res.json({ ok: false, reason: 'unreachable' });
    }
  });

  // ── Usage stats endpoint (auth-gated) ─────────────────────────────────────
  app.get('/api/usage', requireAuth, (req: any, res) => {
    const ip = req.clientIp;
    res.json({
      success: true,
      clientIp: ip,
      plan: getUserPlan(ip),
      usage: getUsageStats(ip),
    });
  });

  // ── Admin: Note-type usage analytics ──────────────────────────────────────
  // Returns aggregated counts of which note styles students are using.
  // Reads from the activity_log table where type='note-view'.
  app.get('/api/analytics/note-types', (req, res) => {
    try {
      const activities = getActivityLog('u-migrated');
      const noteViews = activities.filter((a: any) => a.type === 'note-view');

      // Aggregate by note style
      const byStyle: Record<string, { count: number; chapters: Set<string> }> = {};
      for (const a of noteViews) {
        const meta = typeof a.meta === 'string' ? JSON.parse(a.meta) : (a.meta || {});
        const style = meta.noteStyle || 'unknown';
        if (!byStyle[style]) byStyle[style] = { count: 0, chapters: new Set() };
        byStyle[style].count++;
        if (a.chapter_title) byStyle[style].chapters.add(a.chapter_title);
      }

      const result = Object.entries(byStyle).map(([style, data]) => ({
        noteStyle: style,
        viewCount: data.count,
        uniqueChapters: data.chapters.size,
        chapters: [...data.chapters],
      })).sort((a, b) => b.viewCount - a.viewCount);

      res.json({
        success: true,
        data: {
          totalNoteViews: noteViews.length,
          byStyle: result,
          // Summary for tier planning: which styles are most used?
          tierRecommendation: result.length > 0
            ? `Most used: ${result[0].noteStyle} (${result[0].viewCount} views). Consider keeping popular styles in Free tier.`
            : 'No note-type usage data yet.',
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Reference to sessionData for backward compat with existing endpoints
  // All data now flows through database.ts, this is just an alias layer
  const sessionData = {
    get stats() { return getStats(); },
    set stats(v: any) { updateStats(v); },
    get library() { return getLibrary(); },
    set library(v: any) { /* handled via addToLibrary/removeFromLibrary */ },
    get kits() { return getAllKits(); },
    set kits(v: any) { /* handled via saveKit */ },
  };

  /**
   * Endpoint: /api/dashboard-data
   * Purpose: Returns library and user stats.
   */
  app.get('/api/dashboard-data', (req, res) => {
    res.json({
      success: true,
      data: {
        stats: getStats(),
        library: getLibrary(),
      }
    });
  });

  /**
   * Endpoint: /api/get-kit/:id
   * Purpose: Retrieves a specific revision kit by ID.
   */
  app.get('/api/get-kit/:id', (req, res) => {
    const { id } = req.params;
    const kit = getKit(id);
    if (!kit) return res.status(404).json({ error: 'Kit not found' });
    // Update "last studied" timestamp on the matching library item
    touchLibraryItem(id);
    res.json({ success: true, data: kit });
  });

  /**
   * Endpoint: /api/save-to-library
   * Purpose: Saves an item to the persistent library.
   */
  app.post('/api/save-to-library', (req, res) => {
    const { item, kit } = req.body;
    if (!item) return res.status(400).json({ error: 'Item is required' });

    const id = item.id || Math.random().toString(36).substr(2, 9);
    item.id = id;
    if (!item.date) item.date = 'Just now';

    if (kit) {
      saveKit(id, kit);
    }

    addToLibrary(item);

    res.json({ success: true, data: { stats: getStats(), library: getLibrary() } });
  });

  app.post('/api/update-stats', (req, res) => {
    const changes = req.body;
    const updated = updateStats(changes);
    res.json({ success: true, data: updated });
  });

  app.post('/api/delete-library-item', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'id is required' });
    const removed = removeFromLibrary(id);
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, data: { library: getLibrary(), stats: getStats() } });
  });

  app.post('/api/cleanup-library', (req, res) => {
    const cleaned = cleanupLibrary();
    res.json({ success: true, data: { library: cleaned, stats: getStats() } });
  });

  const handleSDKError = (e: any) => {
    let msg = e.message || String(e);
    if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
      return `Invalid GEMINI_API_KEY. Please check your Google AI Studio API key.`;
    }
    try {
      const parsed = JSON.parse(msg);
      if (parsed.error && parsed.error.message) {
        if (parsed.error.message.includes("API key not valid") || parsed.error.message.includes("API_KEY_INVALID")) {
          return `Invalid GEMINI_API_KEY. Please check your Google AI Studio API key.`;
        }
        return parsed.error.message;
      }
    } catch (_) {}
    return msg;
  };

  const classifyAIError = (error: any): { code: string; message: string; status: number } => {
    const msg = (error?.message || String(error)).toLowerCase();
    if (msg.includes('quota') || msg.includes('rate') || msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('free_tier_requests')) {
      return { code: 'QUOTA_EXCEEDED', status: 429, message: 'AI quota exceeded — the free-tier limit has been reached. Please wait a few minutes and try again, or use Type/Paste Text instead.' };
    }
    if (msg.includes('api_key_invalid') || msg.includes('api key not valid') || msg.includes('not configured')) {
      return { code: 'API_KEY_ERROR', status: 500, message: 'AI service is not properly configured. Please check the API key setup.' };
    }
    if (msg.includes('blocked') || msg.includes('safety')) {
      return { code: 'CONTENT_BLOCKED', status: 400, message: 'The AI content filter blocked this request. This may be a false positive — please try again.' };
    }
    if (msg.includes('invalid json') || msg.includes('truncated') || msg.includes('parse') || msg.includes('incomplete')) {
      return { code: 'PARSE_ERROR', status: 502, message: 'The AI response was incomplete or corrupted. Please try again.' };
    }
    if (msg.includes('timed out') || msg.includes('timeout')) {
      return { code: 'TIMEOUT', status: 504, message: 'AI generation took too long. This can happen when the AI service is busy — please try again.' };
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused') || msg.includes('enotfound')) {
      return { code: 'NETWORK_ERROR', status: 503, message: 'Could not reach the AI service. Check your internet connection and try again.' };
    }
    if (msg.includes('unavailable') || msg.includes('high demand') || msg.includes('503') || msg.includes('overloaded')) {
      return { code: 'SERVICE_BUSY', status: 503, message: 'The AI service is temporarily busy due to high demand. Please try again in a minute.' };
    }
    return { code: 'UNKNOWN', status: 500, message: error?.message || 'Something went wrong while generating content. Please try again.' };
  };

  /**
   * AI Service Endpoints
   */
  const callGemini = async (contents: any[], respFormat = "application/json") => {
    let rawKey = process.env.GEMINI_API_KEY || "";
    const apiKey = rawKey.replace(/^["']|["']$/g, '').trim();

    if (!apiKey || apiKey === "undefined" || apiKey === "null" || apiKey === "" || apiKey === "your_api_key_here") {
      throw new Error("GEMINI_API_KEY is not configured. Add it to .env at the project root (e.g. GEMINI_API_KEY=AIza...) and restart `npm run dev`.");
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const contentsObj = typeof contents[0] === 'string' ? [{ role: "user", parts: contents.map(c => ({ text: c })) }] : contents;

    // Primary models for large prompts (kit generation); lite models as last resort.
    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];
    let response;
    let lastError: any;

    // Per-attempt timeout prevents one slow model from eating the entire queue budget.
    const PER_ATTEMPT_TIMEOUT_MS = 45_000; // 45 seconds per attempt

    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const attemptPromise = ai.models.generateContent({
            model,
            contents: contentsObj,
            config: {
              temperature: 0.4,
              responseMimeType: respFormat,
              maxOutputTokens: 65536,
              safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT" as any, threshold: "BLOCK_ONLY_HIGH" as any },
                { category: "HARM_CATEGORY_HATE_SPEECH" as any, threshold: "BLOCK_ONLY_HIGH" as any },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT" as any, threshold: "BLOCK_ONLY_HIGH" as any },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT" as any, threshold: "BLOCK_ONLY_HIGH" as any },
              ],
            }
          });

          // Race against per-attempt timeout
          response = await Promise.race([
            attemptPromise,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Model ${model} timed out after ${PER_ATTEMPT_TIMEOUT_MS / 1000}s`)), PER_ATTEMPT_TIMEOUT_MS)
            ),
          ]);
          break;
        } catch (e: any) {
          lastError = e;
          const msg = (e.message || '').toLowerCase();
          const isTimeout = msg.includes('timed out') || msg.includes('timeout');
          const isTransient = msg.includes('503') || msg.includes('unavailable') || msg.includes('high demand') || msg.includes('overloaded');
          const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('rate_limit');
          const isDailyQuota = isQuota && msg.includes('limit: 0');
          const isNotFound = msg.includes('404') || msg.includes('not found') || msg.includes('not_found');
          const canFallback = isTransient || isQuota || isNotFound || isTimeout;
          if ((isTransient || isTimeout || (isQuota && !isDailyQuota)) && attempt === 0) {
            const waitSec = isQuota ? 5 : 2;
            logger.warn(`Gemini ${model} ${isTimeout ? 'timed out' : isQuota ? '429' : '503'}, retrying in ${waitSec}s`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
          }
          if (canFallback && models.indexOf(model) < models.length - 1) {
            logger.warn(`Gemini ${model} unavailable (${isTimeout ? 'timeout' : isDailyQuota ? 'daily quota' : isQuota ? 'rate limit' : isNotFound ? 'not found' : '503'}), falling back`);
            break;
          }
          logger.error('Gemini error', { meta: { error: e.message || String(e) } });
          throw new Error(handleSDKError(e));
        }
      }
      if (response) break;
    }

    if (!response) {
      logger.error('Gemini all models exhausted', { meta: { error: lastError?.message || 'All models unavailable' } });
      throw new Error(handleSDKError(lastError));
    }

    // Log finish reason / block info for debugging Hindi generation issues.
    const candidate = (response as any)?.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      logger.warn('Gemini non-STOP finish', { meta: { finishReason: candidate.finishReason, safetyRatings: candidate.safetyRatings } });
    }

    let rawText = '';
    try {
      rawText = response.text || "";
    } catch (textErr: any) {
      // response.text getter can throw if the response was blocked
      logger.error('Gemini response.text threw', { meta: { error: textErr.message } });
      throw new Error("AI response was blocked. This may be a false positive for Hindi educational content — please try again.");
    }

    if (!rawText) {
      throw new Error(`Gemini returned no text. Finish reason: ${candidate?.finishReason || 'unknown'}`);
    }

    if (respFormat === "application/json") {
       let cleanText = rawText;

       // Strip ANSI escape codes that Gemini sometimes injects (ESC[1m, ESC[0m, etc.)
       // These render as □ boxes in the browser.
       // eslint-disable-next-line no-control-regex
       cleanText = cleanText.replace(/\x1b\[[\d;]*[A-Za-z]/g, '');
       // Also strip any remaining raw control characters (except \n \r \t which are valid in JSON strings)
       // eslint-disable-next-line no-control-regex
       cleanText = cleanText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

       const codeBlockMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
       if (codeBlockMatch) cleanText = codeBlockMatch[1];

       // Fix invalid escape sequences — only touch backslashes followed by
       // ASCII chars that aren't valid JSON escapes. Leave all non-ASCII
       // (Devanagari, extended Unicode, etc.) untouched.
       cleanText = cleanText.replace(/\\([^"\\/bfnrtu\x80-￿])/g, '\\\\$1');

       try {
         return JSON.parse(cleanText);
       } catch (e2) {
         try {
           // Collapse newlines/returns that break string boundaries
           cleanText = cleanText.replace(/\n/g, ' ').replace(/\r/g, '');
           return JSON.parse(cleanText);
         } catch (e3) {
           // Last-ditch: try to extract the first complete JSON object
           try {
             const firstBrace = cleanText.indexOf('{');
             const lastBrace = cleanText.lastIndexOf('}');
             if (firstBrace !== -1 && lastBrace > firstBrace) {
               const trimmed = cleanText.substring(firstBrace, lastBrace + 1);
               return JSON.parse(trimmed);
             }
           } catch (_) { /* fall through */ }

           // ── Truncated JSON repair ──────────────────────────────────────
           // Gemini sometimes returns JSON that's cut off mid-string or
           // mid-array. Try to close open brackets/braces to salvage the
           // partial data rather than failing entirely.
           try {
             let repaired = cleanText.trim();
             // Strip trailing comma before we close structures
             repaired = repaired.replace(/,\s*$/, '');
             // Close any unclosed strings
             const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
             if (quoteCount % 2 !== 0) repaired += '"';
             // Count open vs close braces/brackets
             let openBraces = 0, openBrackets = 0;
             let inString = false;
             for (let ci = 0; ci < repaired.length; ci++) {
               const ch = repaired[ci];
               if (ch === '"' && (ci === 0 || repaired[ci - 1] !== '\\')) { inString = !inString; continue; }
               if (inString) continue;
               if (ch === '{') openBraces++;
               else if (ch === '}') openBraces--;
               else if (ch === '[') openBrackets++;
               else if (ch === ']') openBrackets--;
             }
             // Strip trailing comma again after quote fix
             repaired = repaired.replace(/,\s*$/, '');
             // Close remaining open structures
             while (openBrackets > 0) { repaired += ']'; openBrackets--; }
             while (openBraces > 0) { repaired += '}'; openBraces--; }
             const repairedObj = JSON.parse(repaired);
             logger.warn('Repaired truncated JSON', { meta: { originalLength: rawText.length } });
             return repairedObj;
           } catch (_repairErr) { /* repair failed too */ }

           logger.error('Failed to parse JSON from Gemini', { meta: { length: rawText.length, preview: rawText.substring(0, 200) } });
           throw new Error("The AI response was incomplete or corrupted. Please try again.");
         }
       }
    }
    return rawText;
  };

  // Removed legacy varkify and full kit endpoints, all generation happens in generate-kit now.

  app.post("/api/ai/generate-weak-topic-analysis", rateLimitMiddleware('weak-topic'), async (req: any, res) => {
    try {
      const valErrors = validateWeakTopicAnalysis(req.body);
      if (sendValidationErrors(res, valErrors)) return;

      const { weakTopics, mistakes, subject = '', chapterTitle = '' } = req.body;
      const mistakesContext = mistakes.map((m: any) => `Q: ${m.question}\nCorrect: ${m.correction}`).join("\n\n");
      const topicsContext = weakTopics.join(", ");
      const isHindiSubject = (subject || '').toLowerCase() === 'hindi';
      const hindiLangRule = isHindiSubject
        ? `\n\nLANGUAGE RULE — MANDATORY: Write ALL output in HINDI using Devanagari script (देवनागरी लिपि). This includes notes, tips, keywords, quiz questions, options, and explanations. Do NOT use English anywhere except JSON keys. Do NOT transliterate Hindi using Roman/Latin characters.`
        : '';
      const chapterScope = chapterTitle
        ? `\nThe student is studying the chapter "${chapterTitle}"${subject ? ` in ${subject}` : ''}. Focus ONLY on this chapter.`
        : '';

      const prompt = `Analyze the user's mistakes and weak topics. Weak topics: ${topicsContext}.${chapterScope}
Here are the past mistakes they made:
${mistakesContext}

CRITICAL RULES:
- Focus ONLY on the SINGLE most recent chapter/topic the student studied. Do NOT mix concepts from different chapters.
- If multiple chapters appear in the mistakes, pick the one with the most mistakes and cover ONLY that chapter.
- The notes must be chapter-specific — e.g. "Acids, Bases and Salts" only, not a mix of Chemistry and Biology.${hindiLangRule}

Identify the specific sub-topics or conceptual gaps based on these mistakes.
Generate:
1) 'notes': Conceptual synthesis as a BULLETED LIST. Each bullet point should cover ONE concept in 1-2 sentences. Use "• " to start each point. Group related points under a bold heading using "**Heading**". Every bullet must be specific and actionable.
2) 'tips': Strategies and tricks as a bulleted list (use "• " prefix). Each tip should be a concrete, exam-focused action.
3) 'keywords': Keywords from the SINGLE chapter covered.
4) 'quiz': A small quiz (5 questions) focusing strictly on the weak areas of this ONE chapter.

Respond ONLY with a JSON object that strictly follows this interface:
{
  "notes": "string — bulleted list with • prefix, grouped under **bold headings**",
  "tips": "string — bulleted list of actionable tips with • prefix",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "quiz": {
    "title": "${chapterTitle ? `${chapterTitle} — Remediation Quiz` : 'Weak Topic Remediation Quiz'}",
    "questions": [
      {
        "question": "...",
        "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
        "answer": "A",
        "explanation": "..."
      }
    ]
  }
}`;
      const data = await enqueueAIRequest(() => callGemini([prompt]), (req as any).requestId);
      res.json({ success: true, data });
    } catch (e: any) {
      const classified = classifyAIError(e);
      res.status(classified.status).json({ success: false, error: classified.message, errorCode: classified.code });
    }
  });

  app.post("/api/ai/generate-focused-review", rateLimitMiddleware('focused-review'), async (req: any, res) => {
    try {
      const valErrors = validateWeakTopicAnalysis(req.body);
      if (sendValidationErrors(res, valErrors)) return;

      const { weakTopics, mistakes } = req.body;
      const mistakesContext = mistakes.map((m: any) => `Q: ${m.question}\nCorrect: ${m.correction}`).join("\n\n");
      const topicsContext = weakTopics.join(", ");
      
      const prompt = `You are an expert CBSE Class 10 teacher. Generate a focused review quiz of EXACTLY 10 new questions. The user is a Class 10 student weak in the following topics: ${topicsContext}.
Here are some past mistakes they made:
${mistakesContext}

Create a new set of strictly 10 multiple-choice questions that specifically target these weak areas and past mistakes. Mix difficulty: 3 easy, 5 medium, 2 hard. Include a "difficulty" field ("easy"|"medium"|"hard"), "topicTag" field, and "cognitiveLevel" field ("recall"|"understand"|"apply"|"analyze") for each question. Bloom's levels: recall = facts/definitions, understand = explain/compare, apply = solve/use in new context, analyze = multi-step/evaluate.

IMPORTANT — SYLLABUS BOUNDARY:
- You MUST only ask questions within the CBSE Class 10 NCERT syllabus.
- Do NOT include Class 11/12, JEE, NEET, or competitive exam level questions.
- No molarity calculations, titration numericals, advanced organic chemistry, calculus, matrices, or any topic beyond Class 10 NCERT.
- Keep language simple and age-appropriate for a Class 10 student (14-16 years old).

Respond with ONLY a JSON object that satisfies this EXACT interface:
{
  "title": "Focused Review Quiz",
  "questions": [
    {
      "question": "...",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "answer": "A",
      "explanation": "..."
    }
  ]
}`;
      const data = await enqueueAIRequest(() => callGemini([prompt]), (req as any).requestId);
      res.json({ success: true, data });
    } catch (e: any) {
      const classified = classifyAIError(e);
      res.status(classified.status).json({ success: false, error: classified.message, errorCode: classified.code });
    }
  });
  app.post("/api/generate-kit", largeBodyParser, rateLimitMiddleware('generate-kit'), async (req: any, res) => {
    try {
      // ── Input validation ────────────────────────────────────────────────
      const valErrors = validateGenerateKit(req.body);
      if (sendValidationErrors(res, valErrors)) return;

      logger.info('generate-kit request', {
        requestId: req.requestId,
        endpoint: '/api/generate-kit',
        meta: {
          sourceType: req.body.sourceType || 'topic',
          topicLen: (req.body.topic || '').length,
          textLen: (req.body.manualText || req.body.sourceText || '').length,
          hasImage: !!(req.body.sourceType === 'image' && req.body.imageBase64),
        },
      });

      let { topic, manualText, sourceText, classLevel, examMode, sourceType, imageBase64, mimeType, chapterTitle, subject, board, mode, language, chapterId, academicYear, stream } = req.body;

      let rawKey = process.env.GEMINI_API_KEY || "";
      const apiKey = rawKey.replace(/^["']|["']$/g, '').trim();

      if (!apiKey || apiKey === "undefined" || apiKey === "null" || apiKey === "" || apiKey === "your_api_key_here") {
        return res.status(500).json({
          success: false,
          error: "GEMINI_API_KEY is not configured. Add it to .env at the project root (e.g. GEMINI_API_KEY=AIza...) and restart `npm run dev`.",
        });
      }

      // 6. Derive topic from manualText/sourceText if missing
      const textRef = manualText || sourceText || "";
      if (!topic && textRef) {
        topic = textRef.substring(0, 50) + (textRef.length > 50 ? "..." : "");
      }

      // 7. If both topic and text and image are missing
      if (!topic && !textRef && !imageBase64) {
        return res.status(400).json({ success: false, error: "Please enter a topic or upload content." });
      }

      // Debug logging for kit generation context
      if (chapterTitle) {
        logger.info('generate-kit request', { endpoint: '/api/generate-kit', meta: { chapter: chapterTitle, class: classLevel || 'Class 10', subject, mode: mode || 'all' } });
      }
      logger.debug(`Resolved topic: ${topic || 'Extracted from image'}`, { endpoint: '/api/generate-kit' });

      // ── Syllabus chunk retrieval (RAG-ready grounding) ────────────────────
      const retrieval = retrieveChunks({
        chapterId,
        chapterTitle,
        subject,
        academicYear,
      });
      const syllabusGrounding = retrieval.chunks.length > 0
        ? `
SYLLABUS GROUNDING (${retrieval.academicYear}):
${retrieval.chunks.map(c => `[${c.chunkType.toUpperCase()}] ${c.text}`).join('\n')}

Use only the provided syllabus context and general educational explanation. Do not invent out-of-syllabus sections.
`
        : '';
      logger.debug(`Syllabus retrieval: ${retrieval.chunks.length} chunks for ${chapterTitle || topic || 'unknown'}`, { endpoint: '/api/generate-kit' });

      // When the request comes from the predefined chapter library, lock the
      // prompt to that chapter so Gemini doesn't drift into adjacent syllabus.
      // Also inject the complete NCERT topic list so no sub-topic is skipped.
      const chapterCtx = chapterTitle ? getChapterContext(chapterTitle, subject, classLevel) : null;
      const ncertTopicList = chapterCtx?.ncertTopics?.length
        ? `
MANDATORY NCERT TOPIC COVERAGE (you MUST cover ALL of these — do not skip any):
${chapterCtx.ncertTopics.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}

IMPORTANT: Every single topic listed above MUST appear in your output — in definitions, keyPoints, summary, quiz questions, or flashcards. If a topic has formulas, include them. If it has numerical methods (e.g. limiting reagent calculations), include a worked example. Skipping any topic is a generation failure.
`
        : '';
      const chapterContext = chapterTitle
        ? `
You are generating a ${board || examMode || 'CBSE'} ${classLevel || 'Class 10'}${stream ? ` ${stream} stream` : ''} revision kit for the chapter "${chapterTitle}"${subject ? ` in ${subject}` : ''}.
Academic year: ${retrieval.academicYear}.
${ncertTopicList}
SYLLABUS VALIDATION RULES (MANDATORY):
1. ONLY include concepts that appear in the official NCERT ${classLevel || 'Class 10'} ${subject || ''} textbook for this chapter.
2. If a topic was REMOVED or REDUCED in recent CBSE syllabus rationalization, do NOT include it.
3. Do NOT include topics from coaching material, reference books, or competitive exam syllabi unless they are in NCERT.
4. If you are unsure whether a topic is in the current syllabus, EXCLUDE it rather than risk including out-of-syllabus content.
5. Flag any concept that is at the boundary of the syllabus by adding "(verify syllabus)" in its examTip.

Keep answers student-friendly, exam-focused, and aligned with the chapter title.
Do not invent syllabus outside the chapter.
${mode ? `The student picked the "${mode}" learning mode — emphasise that section while still returning the full JSON shape.` : ''}
${(subject || '').toLowerCase() === 'english' ? `
ENGLISH SUBJECT — SPECIAL INSTRUCTIONS:
  - "definitions" = important word meanings + literary devices used in the chapter (term + meaning + example from text)
  - "summary" = chapter/poem summary covering theme, characters, plot progression, and moral
  - "keyPoints" = include character traits, themes, important quotes, and literary devices — NOT generic points
  - "flashcards" = front: quote/extract from text → back: speaker, context, significance, literary device
  - "quiz" = extract-based MCQs (give a passage, ask about meaning/speaker/device), NOT just factual recall
  - "formulaTable" = use for: Literary Device → Example from Text → Effect/Purpose (rename columns in frontend)
  - "readWrite.tips" = CBSE answer-writing tips: word limits, marking scheme format, must-include keywords
  - Include character sketches, extract-based questions, and model answer formats in the content
` : ''}
${syllabusGrounding}
`
        : '';

      // Force-Hindi when the student explicitly picked Hindi via the language
      // picker, OR when the chapter belongs to the Hindi syllabus and no
      // explicit language was requested.
      const isHindiSubject = (subject || '').toString().trim().toLowerCase() === 'hindi';
      const forceHindi = language === 'hi' || (language !== 'en' && isHindiSubject);

      // Language directive at the TOP of the prompt — reinforced again at the
      // bottom. The JSON skeleton in the middle uses English placeholder words
      // ("Topic Title", "Definition"...) which can otherwise prime Gemini to
      // keep emitting English, so we bracket the skeleton with explicit Hindi
      // constraints on both sides when forceHindi is true.
      const hindiTopDirective = forceHindi
        ? `
SYSTEM LANGUAGE CONSTRAINT (read first, obey throughout):
Every string value in your JSON response MUST be written in HINDI using Devanagari script (देवनागरी). The JSON skeleton below uses English placeholder words ("Topic Title", "Definition", "Point 1", ...) — those are STRUCTURAL HINTS ONLY. Replace each placeholder with real Hindi content in Devanagari. Do not copy the English placeholder text. Do not transliterate Hindi into Latin letters. Hindi is the primary teaching language; English is allowed ONLY inside the dedicated "englishGloss" block.
`
        : '';

      // Hindi override placed at the END of the prompt (after the JSON skeleton)
      // because the skeleton itself contains English placeholders that otherwise
      // prime Gemini to keep using English.
      const hindiFinalOverride = forceHindi
        ? `

===============================================================
MANDATORY LANGUAGE OVERRIDE — READ THIS LAST AND OBEY ABSOLUTELY
===============================================================
The student is studying a Hindi (${classLevel || 'Class 10'}) chapter. Every single string value in the JSON you return MUST be written in HINDI using Devanagari script (देवनागरी लिपि).

This applies to:
- title, subject, summary, keyPoints, definitions (term AND meaning)
- flashcards (front AND back)
- quiz (question, every option, answer letter is still A-D, explanation, topicTag)
- commonMistakes, weakTopicTags, mindMap (label AND children)
- readWrite.synthesisPrompt, readWrite.tips
- visual.videoDescription, visual.graphicDescription, visual.conceptMap (node, relatesTo, reason)
- aural.audioScript, aural.lectureNotes

DO NOT write English in any of these fields.
DO NOT transliterate Hindi using Roman/Latin characters (write "पढ़ाई", never "padhai").
DO NOT mix English and Hindi inside the same string.
DO NOT copy the English placeholder words from the JSON skeleton above — those are structural hints only.

Correct examples:
  "title": "नेताजी का चश्मा"   (NOT "Netaji Ka Chashma")
  "keyPoints": ["देशभक्ति केवल सीमाओं तक सीमित नहीं है", ...]   (NOT "Patriotism is not limited to borders")
  "summary": "स्वयं प्रकाश द्वारा लिखी यह कहानी ..." (full paragraph in Devanagari)

ONE EXCEPTION — Add a single top-level field "englishGloss" with a SHORT English summary (2-3 sentences max) so non-Hindi readers can follow:
"englishGloss": { "summary": "<2-3 sentence English summary of the chapter>" }
Keep englishGloss minimal — do NOT duplicate keyPoints or vocabulary in English. Hindi remains the primary teaching language everywhere else.
`
        : language === 'en'
          ? `

===============================================================
LANGUAGE: ENGLISH (student picked English).
===============================================================
Write every field in clear, exam-focused English. Do not include any Hindi/Devanagari text. Do not emit an englishGloss field.
`
          : '';

      // When forceHindi is true, use Devanagari placeholder words in the JSON
      // skeleton so the model is primed to emit Hindi rather than being pulled
      // back to English by the structural hint text.
      const jsonSkeleton = forceHindi ? `{
  "title": "पाठ/अध्याय का शीर्षक",
  "subject": "विषय",
  "summary": "विषय की विस्तृत व्याख्या देवनागरी में",
  "keyPoints": ["मुख्य बिंदु 1", "मुख्य बिंदु 2", "मुख्य बिंदु 3", "मुख्य बिंदु 4", "मुख्य बिंदु 5"],
  "definitions": [
    { "term": "शब्द/पद", "meaning": "परिभाषा देवनागरी में" }
  ],
  "flashcards": [
    { "front": "प्रश्न/शब्द", "back": "उत्तर/व्याख्या" }
  ],
  "quiz": [
    {
      "question": "प्रश्न का पाठ",
      "options": ["A) विकल्प 1", "B) विकल्प 2", "C) विकल्प 3", "D) विकल्प 4"],
      "answer": "A",
      "explanation": "सही उत्तर की विस्तृत व्याख्या",
      "topicTag": "उप-विषय",
      "difficulty": "easy|medium|hard",
      "cognitiveLevel": "recall|understand|apply|analyze"
    }
  ],
  "commonMistakes": ["सामान्य गलती 1", "सामान्य गलती 2"],
  "weakTopicTags": ["उप-विषय 1", "उप-विषय 2"],
  "mindMap": [
    { "label": "मुख्य विचार 1", "children": ["उप-शाखा अ", "उप-शाखा ब", "उप-शाखा स"] },
    { "label": "मुख्य विचार 2", "children": ["उप-शाखा अ", "उप-शाखा ब"] },
    { "label": "मुख्य विचार 3", "children": ["उप-शाखा अ", "उप-शाखा ब", "उप-शाखा स"] },
    { "label": "मुख्य विचार 4", "children": ["उप-शाखा अ", "उप-शाखा ब"] }
  ],
  "retestQuestions": [],
  "readWrite": {
    "externalReferences": ["https://ncert.nic.in/textbook.php"],
    "tips": ["अध्ययन सुझाव 1", "अध्ययन सुझाव 2", "अध्ययन सुझाव 3"],
    "synthesisPrompt": "गहरी समझ के लिए एक विचारशील प्रश्न।"
  },
  "visual": {
    "videoDescription": "विषय पर वैचारिक वीडियो की व्याख्यात्मक कथन",
    "graphicDescription": "इस विषय के लिए आदर्श आरेख का विवरण",
    "conceptMap": [
      { "node": "मुख्य विचार 1", "relatesTo": "उपशाखा 1", "reason": "संबंध का विवरण" },
      { "node": "मुख्य विचार 2", "relatesTo": "उपशाखा 2", "reason": "संबंध का विवरण" },
      { "node": "मुख्य विचार 3", "relatesTo": "उपशाखा 3", "reason": "संबंध का विवरण" },
      { "node": "मुख्य विचार 4", "relatesTo": "उपशाखा 4", "reason": "संबंध का विवरण" }
    ]
  },
  "formulaTable": [
    { "name": "सूत्र/नियम का नाम", "formula": "गणितीय व्यंजक", "notes": "SI मात्रक, विमीय सूत्र, परीक्षा संकेत" }
  ],
  "aural": {
    "audioScript": "पूरे अध्याय की विस्तृत व्याख्या बोलकर सुनाने के लिए। हर मुख्य अवधारणा, परिभाषा, सूत्र और उदाहरण शामिल करें। छोटे वाक्य (15-20 शब्द) में लिखें। बिंदु चिह्न या ... का उपयोग न करें। 800-1200 शब्दों का लक्ष्य रखें।",
    "lectureNotes": ["विस्तृत व्याख्यान बिंदु अ", "विस्तृत व्याख्यान बिंदु ब", "विस्तृत व्याख्यान बिंदु स", "विस्तृत व्याख्यान बिंदु द", "विस्तृत व्याख्यान बिंदु इ"]
  }
}` : `{
  "title": "Topic Title",
  "subject": "Subject Name",
  "summary": "Detailed explanation of the topic",
  "keyPoints": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"],
  "definitions": [
    { "term": "Term", "meaning": "Definition" }
  ],
  "flashcards": [
    { "front": "Question/Term", "back": "Answer/Explanation" }
  ],
  "quiz": [
    {
      "question": "The question text",
      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
      "answer": "A",
      "explanation": "Detailed explanation of why A is correct.",
      "topicTag": "Subtopic tag string",
      "difficulty": "easy|medium|hard",
      "cognitiveLevel": "recall|understand|apply|analyze"
    }
  ],
  "commonMistakes": ["Mistake 1", "Mistake 2"],
  "weakTopicTags": ["Subtopic 1", "Subtopic 2"],
  "mindMap": [
    { "label": "Core Concept 1", "children": ["Sub-branch A", "Sub-branch B", "Sub-branch C"] },
    { "label": "Core Concept 2", "children": ["Sub-branch A", "Sub-branch B"] },
    { "label": "Core Concept 3", "children": ["Sub-branch A", "Sub-branch B", "Sub-branch C"] },
    { "label": "Core Concept 4", "children": ["Sub-branch A", "Sub-branch B"] }
  ],
  "retestQuestions": [],
  "readWrite": {
    "externalReferences": ["https://example.com/source1", "https://example.com/source2"],
    "tips": ["Study tip 1", "Study tip 2", "Study tip 3"],
    "synthesisPrompt": "A reflective question to test deeper understanding."
  },
  "visual": {
    "videoDescription": "Explanatory narration for a conceptual video about the topic",
    "graphicDescription": "Description of an ideal diagram for this topic",
    "conceptMap": [
      { "node": "Core Concept 1", "relatesTo": "Related Topic 1", "reason": "Connection description" },
      { "node": "Core Concept 2", "relatesTo": "Related Topic 2", "reason": "Connection description" },
      { "node": "Core Concept 3", "relatesTo": "Related Topic 3", "reason": "Connection description" },
      { "node": "Core Concept 4", "relatesTo": "Related Topic 4", "reason": "Connection description" }
    ]
  },
  "formulaTable": [
    { "name": "Formula/Concept Name", "formula": "Mathematical expression or rule", "notes": "SI units, dimensional formula, exam tip" }
  ],
  "aural": {
    "audioScript": "A detailed conversational script explaining the full chapter for spoken narration. Cover every key concept, definition, formula, and example. Use short spoken sentences (max 15-20 words). Do NOT use ellipsis dots or bullet points. Write in flowing paragraphs suitable for text-to-speech. Target 800-1200 words so the narration lasts 5-8 minutes.",
    "lectureNotes": ["Detailed lecture note 1", "Detailed lecture note 2", "Detailed lecture note 3", "Detailed lecture note 4", "Detailed lecture note 5"]
  }
}`;

      // ── Class-aware syllabus boundary ─────────────────────────────────
      const resolvedClass = classLevel || 'Class 10';
      const resolvedStream = stream || '';
      const ageRange = resolvedClass === 'Class 12' ? '17-18' : resolvedClass === 'Class 11' ? '16-17' : '14-16';
      // Build a dynamic boundary that doesn't forbid the student's own class level
      const aboveLevels = resolvedClass === 'Class 12'
        ? 'college-level, JEE Advanced, NEET UG competitive-level'
        : resolvedClass === 'Class 11'
          ? 'Class 12, college-level, JEE Advanced, NEET UG competitive-level'
          : 'Class 11, Class 12, JEE, NEET, or competitive exams';
      const scienceBoundary = resolvedClass === 'Class 10'
        ? 'For Science: no molarity calculations, titration numericals, advanced organic chemistry, or college-level concepts.'
        : resolvedClass === 'Class 11'
          ? `For Science (${resolvedStream || 'Science'} stream): cover the NCERT ${resolvedClass} syllabus for the specific chapter. Include formulas, derivations, and numerical examples appropriate to ${resolvedClass} NCERT. Do not go beyond ${resolvedClass} NCERT depth.`
          : `For Science (${resolvedStream || 'Science'} stream): cover the NCERT ${resolvedClass} syllabus for the specific chapter. Include board-exam-level derivations, numericals, and diagrams. Do not include JEE Advanced or NEET competitive-level content.`;
      const mathBoundary = resolvedClass === 'Class 10'
        ? `For Maths: no calculus, matrices, or topics beyond ${resolvedClass} NCERT.`
        : `For Maths: cover the NCERT ${resolvedClass} syllabus depth including all formulas, theorems, proofs, and worked examples. Do not go beyond NCERT ${resolvedClass} scope.`;

      const promptTemplate = `${hindiTopDirective}
You generate exam-ready revision kits in the style of a ${examMode || 'CBSE'} topper's notebook for ${resolvedClass}${resolvedStream ? ` ${resolvedStream} stream` : ''} students. No filler, no textbook padding — only content that scores marks.
${chapterContext}
Topic/Source Material: ${topic || chapterTitle || 'Extracted from image'} ${textRef ? `\nContent: ${textRef}` : ''}
Level: ${resolvedClass}${resolvedStream ? ` (${resolvedStream} stream)` : ''}
Exam mode: ${examMode || "CBSE"}

CONTENT RULES:
- Summary: 3-5 crisp sentences covering what the chapter is about and what's most exam-critical. NEVER open with "This chapter introduces/lays the foundation/covers..." — that is textbook padding. Start with the most important fact or formula.
- KeyPoints: tight one-line revision bullets — each a fact, formula, or rule. Not vague headings.
- Definitions: NCERT-exact wording in PLAIN TEXT. No LaTeX, no special Unicode symbols. Write "Delta x" not "\\Delta x". Highlight scoring keywords.
- Quiz: questions phrased as actual board exams ask them — competency-based (scenario/data/derivation), not "explain the importance of X". Every 3-mark and 5-mark Q must involve derivation, numerical, or data analysis.
- Flashcards: mix definitions, formulae, common mistakes, numerical answers.

SYLLABUS BOUNDARY:
- ALL content MUST stay strictly within the ${examMode || "CBSE"} ${resolvedClass}${resolvedStream ? ` ${resolvedStream}` : ''} NCERT syllabus for the specific chapter/topic.
- Do NOT include topics from ${aboveLevels}.
- ${scienceBoundary}
- ${mathBoundary}
- Use clear, age-appropriate language for a ${resolvedClass} student (${ageRange} years old).
- The content MUST be specifically about "${topic || chapterTitle}" — do NOT substitute a different topic or give generic content.

Return ONLY valid JSON.
Do NOT include any markdown formatting or backticks.
Ensure all strings are correctly closed and there are no stray quotes.

Use this EXACT nested structure:

${jsonSkeleton}

Requirements:
- Create exactly 10 questions for the quiz. Mix difficulty: 3 easy, 5 medium, 2 hard. Include at least 2 questions based on previous year CBSE board exam patterns.
- Tag each question with "cognitiveLevel" using Bloom's taxonomy: "recall" (definitions, facts, lists), "understand" (explain, compare, interpret), "apply" (solve numerical, use formula in new context), "analyze" (multi-step reasoning, evaluate, infer). Mix: ~3 recall, ~3 understand, ~2 apply, ~2 analyze.
- Create at least 8 flashcards covering: NCERT definitions, formulas with units, processes/reactions, common student mistakes, and comparison pairs.
- Quiz answers MUST be the single letter (A, B, C, or D) that matches the correct option.
- Options MUST start with "A) ", "B) ", "C) ", "D) ".
- Explanations MUST be provided for every question and must reference the NCERT concept.
- All strings must be valid and escape double quotes if they appear within text.
- mindMap MUST have 4 to 6 nodes representing the KEY EXAM TOPICS for this chapter. Each node MUST have a descriptive "label" and 2 to 4 "children" sub-branches.
  Children MUST be specific exam-relevant content: formulas (e.g. "F = ma [MLT⁻²]"), key facts (e.g. "7 fundamental SI units"), relationships (e.g. "Accuracy ≠ Precision"), and common exam questions.
  Do NOT use vague labels like "definition" or "concept" — every child must help a student score marks.
- conceptMap MUST have 4 to 6 entries showing how concepts CONNECT to each other with exam-relevant "reason" values (e.g. "Dimensional analysis uses fundamental units to verify formula correctness — frequently asked in 2-mark questions").
- Create at least 7 keyPoints that cover the most important exam-relevant facts. Write as one-line revision statements a student can scan before an exam.
- Create at least 4 tips in readWrite.tips including: study strategies, common mistakes to avoid, marking scheme insights, and formula memory tricks.
- readWrite.externalReferences MUST include real, valid NCERT links (https://ncert.nic.in/textbook.php?...) and reputable Indian education sites (Byjus, Vedantu, etc.).
- formulaTable MUST include EVERY formula, equation, and mathematical relationship that appears in the NCERT textbook for this specific chapter — no limit. For Science/Maths: include all named formulas, derived expressions, chemical equations, conversion relations, and any mathematical rule stated in the chapter (e.g. for "Some Basic Concepts of Chemistry" include: mole concept, molar mass, molarity, molality, mole fraction, mass percentage, ppm, mass of one atom, Avogadro's number relation, percentage composition, empirical/molecular formula relation, stoichiometric calculations, limiting reagent formula, percent yield, Gay-Lussac's law, density relations, etc.). For non-Science subjects, include key facts/dates/rules/literary devices instead. Each entry needs: name (what it is), formula (the expression/rule), notes (SI units, dimensional formula, exam frequency hint). Aim for completeness — missing a formula means the student has an incomplete reference sheet.
${hindiFinalOverride}`;

      let contents: any[] = [];
      if (sourceType === 'image' && imageBase64 && mimeType) {
        contents = [{
          parts: [
            { inlineData: { data: imageBase64, mimeType } },
            { text: `Analyze this document/image and extract the core topic and details. ${promptTemplate}` }
          ]
        }];
      } else {
        contents = [{ parts: [{ text: promptTemplate }] }];
      }

      logger.info('Calling Gemini for generate-kit', { requestId: req.requestId, meta: { forceHindi, language } });
      let parsedKit: any;

      // ── Cache check (skip for image uploads — not cache-friendly) ────
      const cacheKey = sourceType !== 'image' ? buildCacheKey({
        endpoint: 'generate-kit',
        topic: topic || chapterTitle,
        chapterId,
        chapterTitle,
        subject,
        classLevel,
        mode,
        language: forceHindi ? 'hi' : (language || 'en'),
        examMode,
      }) : null;

      if (cacheKey) {
        const cached = cacheGet(cacheKey);
        if (cached) {
          logger.info('Cache hit for generate-kit', { requestId: req.requestId, cacheHit: true });
          return res.json({ success: true, data: cached });
        }
      }

      // Helper: attempt Gemini call and JSON-parse the result.
      const attemptGeneration = async (c: any[]): Promise<any> => {
        const resultStringOrObject = await callGemini(c);
        if (typeof resultStringOrObject === "string") {
          try {
            return JSON.parse(resultStringOrObject);
          } catch (jsonErr) {
            logger.error('Manual JSON parse error on raw string', { endpoint: '/api/generate-kit', meta: { preview: resultStringOrObject.substring(0, 100) } });
            throw new Error("Failed to parse JSON structure. API returned: " + resultStringOrObject.substring(0, 100));
          }
        }
        return resultStringOrObject;
      };

      // ── Queue-wrapped AI generation ─────────────────────────────────
      parsedKit = await enqueueAIRequest(async () => {
        try {
          return await attemptGeneration(contents);
        } catch (firstError: any) {
          // For Hindi content, retry once with a streamlined prompt that drops englishGloss
          // to reduce output size (truncation is the most common failure mode).
          if (forceHindi) {
            logger.warn('Hindi kit generation failed, retrying with simplified prompt', { endpoint: '/api/generate-kit', meta: { error: firstError.message } });
            const simplifiedPrompt = promptTemplate
              .replace(/ONE EXCEPTION[\s\S]*?primary teaching language everywhere else\./g,
                'Do NOT include any englishGloss field. Write everything in Hindi Devanagari only.')
              .replace(/englishGloss[\s\S]*?\}/g, '');
            const retryContents = sourceType === 'image' && imageBase64 && mimeType
              ? [{ parts: [{ inlineData: { data: imageBase64, mimeType } }, { text: `Analyze this document/image and extract the core topic and details. ${simplifiedPrompt}` }] }]
              : [{ parts: [{ text: simplifiedPrompt }] }];
            return await attemptGeneration(retryContents);
          }
          throw firstError;
        }
      }, req.requestId);

      logger.debug('Parsed revision kit successfully', { endpoint: '/api/generate-kit' });

      // Tag the kit with its language, subject, classLevel, and stream so
      // the client can render class-appropriate UI and match cached kits.
      parsedKit.language = forceHindi ? 'hi' : 'en';
      parsedKit.classLevel = classLevel || 'Class 10';
      if (stream) {
        parsedKit.stream = stream;
      }
      if (subject) {
        parsedKit.subject = parsedKit.subject || subject;
      }
      if (chapterTitle) {
        parsedKit.chapterTitle = chapterTitle;
      }

      const kitId = Date.now().toString();

      const kitData = {
        id: kitId,
        ...parsedKit,
        createdAt: new Date().toISOString(),
        grounding: {
          academicYear: retrieval.academicYear,
          sourcesUsed: retrieval.sourcesUsed,
          syllabusStatus: retrieval.syllabusStatus,
          chunksUsed: retrieval.chunks.length,
        },
      };

      // Persist to SQLite via saveKit (sessionData.kits is a getter
      // proxy — direct assignment would silently drop the data).
      saveKit(kitId, kitData);

      const finalTopic = parsedKit.quiz?.title || parsedKit.title || topic || "Generated Revision Kit";

      const modeToLibType: Record<string, string> = {
        visual: 'visual',
        readwrite: 'readwrite',
        audio: 'aural',
        practice: 'revision-kit',
      };
      const libraryType = (mode && modeToLibType[mode]) || 'revision-kit';

      addToLibrary({
        id: kitId,
        title: finalTopic,
        type: libraryType,
        date: new Date().toLocaleDateString(),
        progress: 0,
        contentSnippet: typeof parsedKit?.summary === 'string' ? parsedKit.summary : (parsedKit?.summary?.executiveSummary || parsedKit?.summary?.text || ""),
        // Tags carry the chapter id + language so the client can match a
        // cached kit by (chapter, language) without fetching every kit.
        tags: [
          examMode || "CBSE",
          classLevel || "Class 10",
          ...(chapterTitle ? [`chapter:${chapterTitle}`] : []),
          `lang:${forceHindi ? 'hi' : 'en'}`,
          ...(subject ? [subject] : []),
        ],
      });

      // ── Cache the successful result ─────────────────────────────────
      if (cacheKey) {
        cacheSet(cacheKey, kitData);
      }

      incrementUserKitCount(req.clientIp);
      res.json({ success: true, data: kitData });
    } catch (error: any) {
      const classified = classifyAIError(error);
      logger.error('generate-kit failed', {
        requestId: req.requestId,
        errorCode: classified.code,
        meta: { sourceType: req.body.sourceType || 'unknown', topic: req.body.topic || req.body.chapterTitle || 'unknown' },
      });
      res.status(classified.status).json({
        success: false,
        error: classified.message,
        errorCode: classified.code,
      });
    }
  });

  // ── /api/generate-study-notes ────────────────────────────────────────────────
  // Generates richly-structured study notes in one of 7 VARK-aligned styles.
  // The prompt is subject-aware (Science/Maths/SS/English/Hindi) and style-aware.
  app.post('/api/generate-study-notes', rateLimitMiddleware('study-notes'), async (req: any, res) => {
    try {
      // ── Input validation ────────────────────────────────────────────
      const valErrors = validateStudyNotes(req.body);
      if (sendValidationErrors(res, valErrors)) return;

      const { chapterTitle, subject, noteStyle, classLevel, examMode, board, language, sourceContent } = req.body;

      const rawKey = process.env.GEMINI_API_KEY || "";
      const apiKey = rawKey.replace(/^["']|["']$/g, '').trim();
      if (!apiKey || apiKey === "undefined" || apiKey === "null") {
        return res.status(500).json({ success: false, error: "GEMINI_API_KEY is not configured." });
      }

      // ── Cache check ─────────────────────────────────────────────────
      const cacheKey = buildCacheKey({
        endpoint: 'study-notes',
        chapterTitle,
        subject,
        classLevel,
        noteStyle: noteStyle,
        language: language || 'en',
      });
      const cached = cacheGet(cacheKey);
      if (cached) {
        logger.info('Cache hit for study-notes', { requestId: req.requestId, cacheHit: true });
        return res.json({ success: true, data: cached });
      }

      const isHindi = language === 'hi' || (language !== 'en' && (subject || '').toLowerCase() === 'hindi');
      const lvl   = classLevel || 'Class 10';
      const board_ = board || examMode || 'CBSE';

      // ── Compute dynamic slide count based on NCERT topics ─────────────
      const slidesChapterCtx = getChapterContext(chapterTitle, subject, classLevel);
      const ncertTopicCount = slidesChapterCtx?.ncertTopics?.length || 0;
      // ~2-3 topics per slide. Minimum 6, maximum 14.
      const dynamicSlideCount = ncertTopicCount > 0
        ? Math.min(14, Math.max(6, Math.ceil(ncertTopicCount / 2)))
        : 8; // default when no NCERT topic list available
      const slideRange = ncertTopicCount > 0
        ? `${Math.max(6, dynamicSlideCount - 2)}-${dynamicSlideCount}`
        : '6-10';

      // ── Style-specific instructions (topper's notebook format) ─────────────────
      const styleInstructions: Record<string, string> = {
        smart: `Generate SMART NOTES — dense, structured revision slides. Each slide covers 1-2 closely related NCERT sub-topics.

ABSOLUTE RULES — violating these is a generation failure:
1. NO OVERVIEW / INTRODUCTION. First slide = first actual NCERT topic (e.g. "Matter and Its Classification", "Physical Quantities and Units"). Never "Overview", "Introduction", "Sub-topics".
2. SUBJECT-TOPIC GUARDRAIL: Only content from THIS chapter's NCERT textbook. No cross-chapter/cross-subject contamination.
3. DENSITY: Each slide must have 7-12 distinct info units (definitions + table rows + formulae + example steps all count). A slide with just 3-4 bullets is a failure.
4. NO RAW MARKDOWN: No **, ##, *, etc. in output — the frontend renders structured data.

Fill the "slides" array (${slideRange} slides covering the ENTIRE chapter — use MORE slides for chapters with many topics). Each slide is a JSON object with these OPTIONAL sections (include only what's relevant to the topic):
  "definitions": [{ "term": "...", "definition": "...", "example": "e.g., ..." }]
  "tables": [{ "label": "UPPERCASE LABEL", "columns": [...], "rows": [[...]] }] — use for ANY comparison of ≥2 things. Show ALL rows, never truncate.
  "comparison_panels": [{ "left": { "title": "...", "content": "..." }, "right": { "title": "...", "content": "..." } }]
  "compact_grid": [{ "primary": "symbol/label", "secondary": "description" }] — for SI units, postulates, lists of items
  "formulae": [{ "label": "Name", "formula": "expression with subscripts ₀₁₂₃ and superscripts ⁰¹²³⁻⁺" }]
  "step_method": { "label": "HOW TO...", "steps": ["Step 1...", "Step 2..."] }
  "solved_example": { "mark_pattern": "3-mark numerical", "question": "...", "steps": ["..."], "answer": "bold final answer" }
  "common_mistake": "One specific error students make + correct approach"
  "exam_tip": "Cite specific marks + years. Never vague 'this is important'."

Also fill: summary (3-5 crisp sentences, NOT "This chapter introduces..."),
keyPoints (8-10 one-line bullets), definitions (ALL key terms), flashcards (10 cards).
Leave sections/tables/recallQuestions/conceptConnections/knowledgeCards/examOutline as empty arrays — all content goes in slides.`,

        cornell: `Generate CORNELL NOTES — two-column revision format.
Fill: summary (3-5 sentences — start with the most critical fact, NOT "This chapter introduces..."),
keyPoints (6-8 one-line bullets — facts, not headings),
definitions (key terms with NCERT-exact meaning),
sections (one per subtopic — FIRST section must be the first actual topic per NCERT order, NEVER "Overview" or "Introduction";
  section.content = right-column notes: definitions → formulae → key points → solved example → common mistakes,
  all as numbered bullets with line breaks NOT prose paragraphs;
  section.cueQuestions = 3-4 self-test Qs for the left cue column, phrased as board-exam questions with marks;
  section.examTips = specific marking scheme tips),
recallQuestions (8-10 Q+hint+answer — questions must match board-exam phrasing, not textbook "explain why"),
flashcards (8 cards). Leave slides/tables/conceptConnections/knowledgeCards/examOutline empty arrays.`,

        outline: `Generate EXAM OUTLINE — hierarchical skeleton for rapid revision.
Fill: summary (3 sentences), keyPoints (top 5 exam-critical points with mark weightage),
examOutline.mainTopic and examOutline.subtopics (4-6 subtopics, each with:
  keyPoints = 4-6 tight bullets covering definition + formula + key fact,
  examples = 2-3 including at least 1 solved numerical,
  examQuestions = 3-4 questions phrased EXACTLY as board exams ask them with marks specified),
sections (one per subtopic — structured bullets mirroring the outline, with examTips citing years),
flashcards (8 cards covering likely exam answers).
Leave tables/recallQuestions/conceptConnections/knowledgeCards empty arrays.`,

        comparison: `Generate COMPARISON NOTES — table-first format, zero paragraphs for comparisons.
Fill: summary (3 sentences), keyPoints (5-6 bullets), definitions (key terms),
tables (3-5 comparison tables; each table MUST have: descriptive title, 4-6 columns e.g.
"Property", "Concept A", "Concept B", "Key Difference", "Exam Tip",
and 3-6 data rows with COMPLETE content in every cell — no blanks, no "same as above"),
sections (brief context for each table — why this comparison matters for the exam, with examTips citing specific marks),
flashcards (8 cards). Leave recallQuestions/conceptConnections/knowledgeCards/examOutline empty arrays.`,

        recall: `Generate RECALL NOTES — active-recall format for self-testing.
Fill: summary (3 sentences), keyPoints (6-8 bullets), definitions (all key terms),
recallQuestions (12-15 questions — phrased as ACTUAL board exam questions:
  "Write the dimensional formula of X" not "What do you know about X?";
  each with a one-line hint and a FULL correct answer that would score full marks),
sections (4-5 sections with content as structured bullets + cueQuestions for self-testing),
flashcards (12 cards — emphasize formula recall, common mistakes, numerical answers).
Leave tables/conceptConnections/knowledgeCards/examOutline empty arrays.`,

        'concept-map': `Generate CONCEPT MAP NOTES — relationship-focused connections.
Fill: summary (3 sentences — start with core concept, NOT "This chapter introduces..."),
keyPoints (5-7 bullets), definitions (all key terms),
conceptConnections (12-18 connections; each with concept, connectedConcept,
  relationship = precise link e.g. "Dimensional formula of velocity = [M⁰L¹T⁻¹] derives from distance/time",
  whyItMatters = exam relevance e.g. "Understanding this connection helps solve 3-mark derivation Qs"),
sections (3-4 sections — FIRST section must be the first actual topic per NCERT order, NEVER "Overview";
  each groups related concepts and explains the cluster with examTips),
flashcards (8 cards on the most exam-critical concept pairs).
Leave slides/tables/recallQuestions/knowledgeCards/examOutline empty arrays.`,

        'knowledge-cards': `Generate KNOWLEDGE CARDS — Zettelkasten-style atomic revision cards.
Fill: summary (3 sentences), keyPoints (5-6 bullets), definitions (key terms),
knowledgeCards (12-18 cards; each with:
  idea = one atomic concept (3-7 words, e.g. "Dimensional formula of force"),
  explanation = 2-3 sentences covering definition + formula + exam tip (NOT paragraph fluff),
  linkedConcepts = 2-4 related card ideas,
  quizQuestion = board-exam-style question testing this idea with the answer embedded),
sections (3-4 sections grouping cards by exam topic cluster),
flashcards (10 cards matching the knowledge card questions).
Leave tables/recallQuestions/conceptConnections/examOutline empty arrays.`,
      };

      // ── Subject-specific instructions ────────────────────────────────────────
      const subjectLC = (subject || '').toLowerCase();
      const subjectInstructions =
        subjectLC === 'science' || subjectLC === 'physics' || subjectLC === 'chemistry' || subjectLC === 'biology'
          ? `SCIENCE-SPECIFIC: Include chemical/physical equations using → symbol, descriptions of diagrams to draw, clear definitions of all scientific terms, SI units where applicable, and a "Common Exam Mistakes" section listing frequent student errors.`
        : subjectLC === 'mathematics' || subjectLC === 'maths'
          ? `MATHS-SPECIFIC: List ALL relevant formulas in a dedicated section. For each major concept include a fully worked step-by-step solved example. Highlight common calculation/sign mistakes. Include proof steps where relevant.`
        : subjectLC === 'social science' || subjectLC === 'history' || subjectLC === 'geography' || subjectLC === 'civics' || subjectLC === 'economics'
          ? `SOCIAL SCIENCE-SPECIFIC: Include a chronological timeline of key events (if history), important personalities and their roles, cause-and-effect chains, geographical or map-based points, important statistics or data, and treaty/act names with dates.`
        : subjectLC === 'english'
          ? `ENGLISH-SPECIFIC (modelled on CBSE English topper handwritten notes — follow this EXACT structure):

CBSE ENGLISH BOARD EXAM PATTERN (2025-26):
  - Reading comprehension (26 marks): Unseen passages — factual, discursive, case-based
  - Writing skills (26 marks): Notice/invitation, article/report/speech, letter (formal/informal)
  - Literature (28 marks): Extract-based (1-mark MCQs), short answer (2-mark), long answer (5-mark)

FOR PROSE CHAPTERS (Flamingo / Hornbill / Snapshots / Vistas):
  1. CHAPTER AT A GLANCE: 3-4 line summary covering setting, main events, and outcome
  2. THEME & CENTRAL IDEA: State the theme in 2-3 exam-ready sentences (these exact lines score full marks in 2-mark questions)
  3. CHARACTER SKETCHES: For each major character create a card:
     • Name → Personality traits (3-4 adjectives) → Role in the story → Key quote from the text
     • Include the character's transformation/arc if any
  4. IMPORTANT EXTRACTS: Pick 4-6 key passages that are most likely to appear in extract-based questions:
     • Quote the exact lines → Explain the meaning → Identify the speaker/context → Note the literary device used
  5. WORD MEANINGS: List 10-15 difficult words from the chapter with meanings (these appear as 1-mark MCQs)
  6. SHORT ANSWER QUESTIONS (2-mark pattern): Include 5-6 questions with model answers (40-50 words each):
     • Answer format: Direct statement + brief explanation + textual evidence
     • Start with the chapter/author reference: "In the chapter [X], the author [Y]..."
  7. LONG ANSWER QUESTIONS (5-mark pattern): Include 2-3 questions with model answers (120-150 words):
     • CBSE marking scheme: Introduction (1 mark) + 3 content points with textual evidence (3 marks) + Conclusion (1 mark)
     • Use phrases: "The author conveys...", "This is evident when...", "For instance, in the text..."
  8. MESSAGE / MORAL: What the chapter teaches — exam-ready 2-3 sentences
  9. AUTHOR'S STYLE: Writing technique, narrative perspective, tone (these appear in extract-based questions)

FOR POETRY (Flamingo / Hornbill poems):
  1. POEM SUMMARY: 3-4 lines covering the poem's subject and progression
  2. CENTRAL THEME: Exam-ready statement of the poet's message
  3. STANZA-BY-STANZA EXPLANATION: For each important stanza:
     • Quote key lines → Paraphrase in simple English → Identify poetic devices (metaphor, simile, alliteration, personification, imagery, enjambment, rhyme scheme)
  4. LITERARY DEVICES: Create a table: Device → Example from poem → Effect/Purpose
  5. EXTRACT-BASED QUESTIONS: 4-5 probable extracts with MCQ-style questions and answers
  6. SHORT & LONG ANSWER QUESTIONS: With model answers using the marking scheme format
  7. POET'S BIOGRAPHY: 2-3 lines (name, era, major works, writing style) — appears in 1-mark questions
  8. DIFFICULT WORDS: Word → Meaning → Sentence usage

TOPPER ANSWER FORMAT RULES (NON-NEGOTIABLE):
  • Start every answer with a reference to the text: "In [chapter/poem name] by [author]..."
  • Include at least one direct quote from the text in every 5-mark answer
  • Use transitional phrases: "Furthermore...", "Additionally...", "This is significant because..."
  • For character sketches: use adjectives from the text, not generic ones
  • For extract-based: always identify speaker, context, and literary device
  • Keep word limits strict: 2-mark = 40-50 words, 5-mark = 120-150 words`
        : subjectLC === 'hindi'
          ? `HINDI-SPECIFIC: पाठ का केंद्रीय विषय, पात्र-चित्रण (नाम → स्वभाव → भूमिका → महत्वपूर्ण पंक्ति), कठिन शब्दों के अर्थ, महत्वपूर्ण पंक्तियों की व्याख्या, और संभावित प्रश्न-उत्तर शामिल करें।`
        : `Include relevant formulas/definitions, real-life examples, key facts, and common mistakes.`;

      const langDirective = isHindi
        ? `LANGUAGE: Write ALL content in Hindi using Devanagari script (देवनागरी). Do NOT write in English except for proper nouns or chemical symbols. JSON keys remain in English.`
        : `LANGUAGE: Write all content in clear, student-friendly English.`;

      const sourceBlock = sourceContent
        ? `\nSOURCE MATERIAL (base your notes ENTIRELY on this content — do NOT invent facts beyond it):\n---\n${sourceContent}\n---\nIMPORTANT: Your notes MUST be grounded in the source material above. Extract, reorganise, and elaborate on what is provided. Do not add unrelated information.\n`
        : '';

      // ── CBSE board exam question pattern alignment ──────────────────────────
      // Research findings from CBSE topper handwritten notes (2024-2026 board years):
      //   - Toppers open with a chapter-at-a-glance card: sub-topics list, key formulae snapshot, high-frequency Qs
      //   - Definitions: NCERT-exact, 1-2 lines max, scoring keywords underlined/bolded
      //   - Tables and bullets dominate; prose paragraphs are almost never used
      //   - Formulae get their own boxed/highlighted line with SI units and dimensional formula
      //   - Important points marked with stars/boxes (sparingly, 3-4 per section max)
      //   - Diagrams referenced inline ("draw and label" notes) even in handwritten format
      //   - Compact: one chapter fits 4-8 pages, not 20+ pages of textbook reproduction
      //   - CBSE 2025-26 pattern: 50% competency-based, 20% MCQ, 30% descriptive
      //   - Competency-based = scenario/data/case-study → apply/analyze/derive (NOT "explain importance")
      const examPatternBlock = `
BOARD EXAM QUESTION ALIGNMENT (MANDATORY for examTips and sections):

CBSE 2025-26 QUESTION RULES (50% competency-based, 20% MCQ, 30% descriptive):
Competency-based means the question gives a SITUATION, DATA, or SCENARIO and asks the student to APPLY, ANALYZE, or DERIVE — not merely recall or explain importance.

Mark-wise patterns:
  1-mark: Direct recall OR competency MCQ with a scenario
    ✓ "The dimensional formula of angular momentum is ___"
    ✓ "A student measures the diameter of a wire as 2.34 cm using a screw gauge of least count 0.01 cm. The number of significant figures is ___"
    ✗ "Define physical quantity" (too plain for competency)
  2-mark: Short application or distinguish-with-example
    ✓ "A measurement gives values 5.12, 5.15, 5.13, 5.14. The true value is 5.20. Comment on accuracy and precision."
    ✓ "Distinguish between fundamental and derived units. Give one example each."
  3-mark: Derivation OR data-based numerical
    ✓ "Using dimensional analysis, derive the expression for the time period of a simple pendulum T = f(l, g)."
    ✓ "The length of a rod is measured as 25.6 ± 0.1 cm and diameter as 2.40 ± 0.02 cm. Calculate the percentage error in its volume."
  5-mark: Multi-part derivation + application OR case-study based [split as 2+2+1 or 3+2]
    ✓ "(a) State the principle of homogeneity of dimensions. (b) Using dimensional analysis, derive the relation between frequency, length, tension, and linear mass density. (c) State two limitations. [2+2+1]"
    ✓ "A student records the following measurements: [data table]. (a) Calculate mean value and absolute error. (b) Find relative and percentage error. (c) Express with correct significant figures. [2+2+1]"
    ✗ "Explain why accuracy, precision, and significant figures are interconnected and crucial for scientists." — CBSE NEVER asks this.

EVERY 3-mark and 5-mark question MUST involve either a derivation, a numerical calculation, or analysis of given data/scenario. Pure "explain the importance" questions are NOT competency-based and must not be generated.

For Commerce subjects (Accountancy, Business Studies, Economics): competency-based means case studies, journal entries from a scenario, graph interpretation, statement analysis — not "explain the importance of accounting."

Reference latest CBSE sample papers and marking scheme. Include worked numerical examples with CBSE-style values.
Show step-by-step solution format that earns full marks per the marking scheme.
`;

      // ── NCERT topic coverage list for study notes ─────────────────
      const notesChapterCtx = getChapterContext(chapterTitle, subject, classLevel);
      const notesNcertTopics = notesChapterCtx?.ncertTopics?.length
        ? `
MANDATORY NCERT TOPIC LIST — you MUST cover EVERY topic below. Skipping any is a failure:
${notesChapterCtx.ncertTopics.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}

For SMART notes: each slide should cover 1-3 of these topics. Ensure ALL topics appear across your slides.
For CORNELL notes: each section should cover 1-2 topics. Ensure ALL topics appear.
For CONCEPT MAP: every topic must appear as a node or connection.
`
        : '';

      const prompt = `${langDirective}

You generate revision notes in the style of a ${board_} topper's handwritten notebook — the kind every student wants to photocopy. You are NOT explaining or teaching. You are producing clean, exam-ready reference notes for ${lvl} ${subject}.

Chapter / Topic: ${chapterTitle}
Subject: ${subject}
Note Style: ${noteStyle.toUpperCase()}
Class: ${lvl}  |  Board: ${board_}
${notesNcertTopics}
${sourceBlock}
NOTE STYLE INSTRUCTIONS:
${styleInstructions[noteStyle] || styleInstructions['smart']}

SUBJECT-SPECIFIC INSTRUCTIONS:
${subjectInstructions}

${examPatternBlock}

TOPPER'S NOTEBOOK RULES (NON-NEGOTIABLE):

0. NO OVERVIEW / INTRODUCTION SLIDES. NEVER generate:
   • "Overview" or "Introduction" as a section title
   • "This chapter introduces/establishes/covers/explores..."
   • "In this chapter we will learn..."
   • "Sub-topics List" as a section — this is a table of contents, not content
   • Any paragraph that DESCRIBES what the chapter is about rather than teaching it
   The FIRST section MUST be the FIRST actual topic of the chapter, following NCERT textbook order.
   Examples: Chemistry "Some Basic Concepts" → first section = "Matter and Its Classification". Physics "Units and Measurement" → first section = "Physical Quantities and Units".
   Start each section with its core definition or concept, then formulae, then key points.

1. NO FILLER. No "dear students", no "physics is an experimental science and accurate measurement is fundamental." That is textbook padding. Cut it. Every sentence must earn its space.

2. STRUCTURE every topic as:
   • Definition: 1-2 lines, board-exam precise wording that scores full marks
   • Formula / expression: clearly notated, boxed with ★ if high-yield
   • Key points: tight numbered bullets, max 1 line each. If it needs 2 lines, split into 2 bullets
   • Derivation steps (where applicable): numbered, compact, each step ≤1 line
   • Comparison tables: use tables whenever comparing ≥2 things (NEVER paragraphs for comparisons)
   • Solved example: ${board_}-pattern numerical with stepwise working
   • Common mistakes / traps: what specifically loses marks
   • Exam tip: cite specific mark weightage and year (e.g. "3-mark derivation in 2023, 2024 boards"), NOT generic "this is important"

3. CONTENT must match ${board_} marking scheme:
   • 1-mark answers: crisp definition or SI unit — max 1-2 lines
   • 2-mark answers: state + brief explain, OR distinguish between using a mini table
   • 3-mark answers: derivation with numbered steps, OR numerical with 3 clear steps
   • 5-mark answers: full derivation with assumptions + limitations listed, OR multi-part numerical

4. NCERT ONLY. Only include concepts from the official NCERT ${lvl} ${subject} textbook. No coaching material, no reference book extras. Use exact NCERT definitions — highlight keywords examiners look for.

5. FORMATTING:
   • Tables over paragraphs whenever comparing ≥2 things
   • Every formula gets its own line with clear notation
   • Use ⭐ sparingly (max 3-4 per section) for genuinely high-probability exam content
   • examTips must cite specific marks and frequency, never generic warnings
   • keyPoints = 1-line revision facts a student can scan at 11 PM before the exam

6. WHAT TO PRIORITIZE vs SKIP:
   • PRIORITIZE: Dimensional formulae tables, derivation steps, error propagation formulae, solved numericals, comparison tables, common mistakes, marking scheme tips
   • SKIP/MINIMIZE: Historical context ("why is X important"), motivational content, lengthy introductions, paragraph-form explanations of things that fit in a table
   • The litmus test: if a student opened this note at 11 PM before the exam, would they find exactly what they need in 5 seconds? If no, rewrite.

7. QUALITY GATES:${sourceContent ? '\n   • All notes must reflect the source material provided. Do not generate unrelated content.' : ''}
   • definitions.meaning = NCERT wording + example in brackets. Use PLAIN TEXT only — no LaTeX (\\Delta, \\frac), no special Unicode symbols, no markdown. Write "Delta x" not "Δx", "m/s" not "ms⁻¹" in definitions.
   • flashcards = different angles: definition, numerical, formula, mistake, comparison
   • Do NOT repeat the same sentence across fields
   • All arrays must meet the minimum counts in the style instructions
   • Zero tolerance for vague exam questions like "explain the importance of X" — ${board_} never asks this for 3+ marks

Return ONLY valid JSON matching this EXACT structure (no markdown, no backticks):

{
  "topic": "${chapterTitle}",
  "subject": "${subject}",
  "noteStyle": "${noteStyle}",
  "summary": "detailed summary paragraph(s)",
  "keyPoints": ["specific point 1", "specific point 2"],
  "definitions": [{ "term": "Term", "meaning": "Clear meaning with example" }],
  "slides": [],
  "sections": [
    {
      "title": "Section Title",
      "content": "Detailed paragraph content",
      "cueQuestions": ["Self-test question?"],
      "examTips": ["Specific exam tip"],
      "examples": ["Concrete example"]
    }
  ],
  "tables": [
    {
      "title": "Table Title",
      "columns": ["Col 1", "Col 2", "Col 3"],
      "rows": [["Row 1 Col 1", "Row 1 Col 2", "Row 1 Col 3"]]
    }
  ],
  "recallQuestions": [{ "question": "Q?", "hint": "Think about...", "answer": "Full answer" }],
  "flashcards": [{ "front": "Question or term", "back": "Answer or definition" }],
  "conceptConnections": [
    { "concept": "A", "connectedConcept": "B", "relationship": "how A relates to B", "whyItMatters": "exam relevance" }
  ],
  "knowledgeCards": [
    { "idea": "Atomic idea title", "explanation": "2-3 sentence explanation", "linkedConcepts": ["related idea"], "quizQuestion": "Question testing this idea?" }
  ],
  "examOutline": {
    "mainTopic": "${chapterTitle}",
    "subtopics": [
      { "title": "Subtopic", "keyPoints": ["point"], "examples": ["example"], "examQuestions": ["Q?"] }
    ]
  }
}`;

      logger.info('Calling Gemini for study notes', { requestId: req.requestId, meta: { noteStyle, chapterTitle } });

      // ── Queue-wrapped AI generation ─────────────────────────────────
      const parsed = await enqueueAIRequest(() => callGemini([prompt]), req.requestId);

      // Ensure required arrays exist
      parsed.slides          = parsed.slides          || [];
      parsed.sections        = parsed.sections        || [];
      parsed.definitions     = parsed.definitions     || [];
      parsed.keyPoints       = parsed.keyPoints       || [];
      parsed.flashcards      = parsed.flashcards      || [];
      parsed.tables          = parsed.tables          || [];
      parsed.recallQuestions = parsed.recallQuestions || [];
      parsed.conceptConnections = parsed.conceptConnections || [];
      parsed.knowledgeCards  = parsed.knowledgeCards  || [];

      // ── Auto-continue for truncated SMART notes ────────────────────
      // If fewer slides than expected were returned, the response was likely
      // truncated. Send a continuation prompt to get the remaining slides.
      // Dynamic threshold: use ~60% of the target slide count.
      const MIN_SLIDES = ncertTopicCount > 0
        ? Math.max(4, Math.ceil(dynamicSlideCount * 0.6))
        : 4;
      if (noteStyle === 'smart' && parsed.slides.length > 0 && parsed.slides.length < MIN_SLIDES) {
        logger.info('Auto-continuing truncated SMART notes', {
          requestId: req.requestId,
          meta: { slidesReceived: parsed.slides.length, target: MIN_SLIDES, chapter: chapterTitle },
        });
        const existingTopics = parsed.slides.map((s: any) => {
          // Gather topics already covered from definitions, tables, etc.
          const defs = (s.definitions || []).map((d: any) => d.term).join(', ');
          const tables = (s.tables || []).map((t: any) => t.label).join(', ');
          return [defs, tables].filter(Boolean).join('; ');
        }).filter(Boolean).join(' | ');

        const targetTotal = ncertTopicCount > 0 ? dynamicSlideCount : 8;
        const moreNeeded = Math.max(2, targetTotal - parsed.slides.length);
        const continuePrompt = `You already generated ${parsed.slides.length} slides for "${chapterTitle}" (${subject}, ${lvl}). Topics covered so far: ${existingTopics || 'partial coverage'}.

The chapter needs ${moreNeeded} MORE slides (target: ${targetTotal} total) to cover the remaining NCERT sub-topics. Generate ONLY the additional slides — do NOT repeat topics already covered.

Return valid JSON: { "slides": [ ...additional slides only... ] }

Use the same dense slide format: definitions, tables, comparison_panels, compact_grid, formulae, step_method, solved_example, common_mistake, exam_tip. Each slide must have 7-12 info units.`;

        try {
          const continuation = await enqueueAIRequest(() => callGemini([continuePrompt]), `${req.requestId}-continue`);
          const extraSlides = continuation?.slides || [];
          if (extraSlides.length > 0) {
            parsed.slides = [...parsed.slides, ...extraSlides];
            logger.info('Auto-continue added slides', { requestId: req.requestId, meta: { added: extraSlides.length, total: parsed.slides.length } });
          }
        } catch (contErr: any) {
          // Non-fatal — we have partial slides, better than nothing
          logger.warn('Auto-continue failed, using partial slides', { requestId: req.requestId, meta: { error: contErr?.message } });
        }
      }

      parsed.noteStyle       = noteStyle;
      parsed.subject         = subject;
      parsed.topic           = chapterTitle;
      parsed.language        = isHindi ? 'hi' : 'en';
      parsed.noteVersion     = parsed.slides?.length > 0 ? 2 : 1;

      // ── Cache store ─────────────────────────────────────────────────
      cacheSet(cacheKey, parsed);

      res.json({ success: true, data: parsed });
    } catch (err: any) {
      const classified = classifyAIError(err);
      logger.error('generate-study-notes failed', {
        requestId: req.requestId,
        errorCode: classified.code,
        meta: { noteStyle: req.body.noteStyle, chapter: req.body.chapterTitle },
      });
      res.status(classified.status).json({ success: false, error: classified.message, errorCode: classified.code });
    }
  });

  // ── /api/evaluate-exam-answer ─────────────────────────────────────────────────
  // AI-evaluates a student's written exam answer against CBSE rubrics and returns
  // structured feedback: marks, missing keywords, strengths, improvements, model answer.
  app.post('/api/evaluate-exam-answer', rateLimitMiddleware('evaluate-answer'), async (req: any, res) => {
    try {
      const valErrors = validateEvaluateAnswer(req.body);
      if (sendValidationErrors(res, valErrors)) return;

      const { question, studentAnswer, totalMarks, subject, chapterTitle, classLevel } = req.body;
      const lvl = classLevel || 'Class 10';
      const sub = subject || 'General';
      const prompt = `You are a strict but encouraging ${sub} teacher evaluating a ${lvl} CBSE exam answer.

Question (${totalMarks || 3} marks): ${question}

Student's Answer: ${studentAnswer}

Evaluate the answer and return ONLY valid JSON:
{
  "marksScored": <number out of ${totalMarks || 3}>,
  "totalMarks": ${totalMarks || 3},
  "missingKeywords": ["keyword the student should have mentioned but didn't"],
  "strengths": ["what the student did well"],
  "improvements": ["specific advice to improve the answer"],
  "modelAnswer": "The ideal answer a topper would write for full marks"
}

Grading rules:
- Be fair but strict — CBSE examiners look for specific keywords and structure.
- For 1-mark answers: 1 keyword/definition is enough for full marks.
- For 3-mark answers: expect 3 distinct points or a definition + example + application.
- For 5-mark answers: expect an introduction, 4-5 key points, examples, and a conclusion.
- If the student's answer is empty or gibberish, give 0 marks.
- missingKeywords should list specific terms/facts the student missed.
- modelAnswer should be exactly what a full-marks answer looks like.`;

      const parsed = await enqueueAIRequest(() => callGemini([prompt]), req.requestId);
      parsed.marksScored = Number(parsed.marksScored) || 0;
      parsed.totalMarks = Number(parsed.totalMarks) || totalMarks || 3;
      res.json({ success: true, data: parsed });
    } catch (err: any) {
      const classified = classifyAIError(err);
      logger.error('evaluate-exam-answer failed', { requestId: req.requestId, errorCode: classified.code });
      res.status(classified.status).json({ success: false, error: classified.message, errorCode: classified.code });
    }
  });

  // ── /api/extract-handwritten-answer ──────────────────────────────────────────
  // DISABLED for MVP — OCR not reliable enough for production use.
  // Kept for future re-enablement when handwriting recognition improves.
  // Uses Gemini Vision to extract text from a photo of a handwritten answer.
  // API key stays server-side; the frontend sends the image as base64.
  // Returns extracted text, unclear words, confidence level, and review flag.
  app.post('/api/extract-handwritten-answer', largeBodyParser, async (_req, res) => {
    return res.status(410).json({ success: false, error: 'Handwritten answer upload is temporarily disabled. Please type your answer instead.' });
    /* --- OCR implementation preserved for future use ---
    try {
      const { imageBase64, mimeType, question, topic, subject, totalMarks } = req.body;
      if (!imageBase64 || !mimeType) {
        return res.status(400).json({ success: false, error: 'imageBase64 and mimeType are required.' });
      }

      const questionCtx = question
        ? `The student was answering this exam question (${totalMarks || 3} marks, ${subject || 'General'}, topic: ${topic || 'unknown'}): "${question}"\nUse this context to better interpret unclear handwriting — if a word is ambiguous, prefer the interpretation that makes sense for this question and subject.`
        : '';

      const contents = [{
        parts: [
          { inlineData: { data: imageBase64, mimeType } },
          { text: `Extract the handwritten student answer from this image. The handwriting may be neat, messy, slanted, cursive, semi-cursive, light, formula-heavy, or rotated. First mentally correct orientation. Read line by line. Preserve meaning, formulas, units, and line breaks. Do not grade the answer. Do not invent missing text. Ignore clearly crossed-out words. If a word is unreadable, write [unclear]. If a formula is present, preserve it as accurately as possible (e.g. V=IR, F=ma, H₂O).

${questionCtx}

If a sentence is partly readable, keep the readable part and mark unclear parts with [unclear]. Do not silently remove unclear parts. Preserve the student's original wording, spelling, and sentence structure. Keep line breaks where possible to match the student's layout. If a word looks misspelled but you can understand the intended word from context, extract the word as-is (do not correct it). Only mark as [unclear] when you truly cannot determine what the word says.

If the image contains diagrams or labels mixed with text, extract only the written text and diagram labels. Ignore purely decorative drawings.

Return ONLY valid JSON — no markdown, no backticks:
{
  "extractedText": "The full text extracted from the handwriting, with [unclear] markers where needed",
  "lineByLineText": ["Line 1 of the answer", "Line 2 of the answer"],
  "formulas": ["V=IR", "F=ma"],
  "unclearWords": ["list of words or phrases you marked as [unclear] or found hard to read"],
  "confidence": "high or medium or low",
  "needsReview": true
}

Field rules:
- extractedText: The complete extracted answer as a single string with line breaks preserved.
- lineByLineText: The same text split into an array, one entry per line of handwriting. If only one line, return a single-element array.
- formulas: Any mathematical or scientific formulas detected. Empty array if none found.
- unclearWords: Words or phrases marked [unclear] or that were hard to interpret.

Confidence rules:
- "high": All text is clearly readable, no [unclear] markers needed.
- "medium": Most text is readable but 1-3 words are uncertain or marked [unclear].
- "low": Many words are unclear, significant parts marked [unclear], or image quality is poor.

Set needsReview to true if confidence is "medium" or "low", or if any [unclear] markers are present. Set to false only when confidence is "high" and no unclear markers exist.

If the image contains no readable text at all, return extractedText as empty string, lineByLineText as empty array, formulas as empty array, unclearWords as empty array, confidence as "low", and needsReview as true.` }
        ]
      }];

      const parsed = await callGemini(contents);

      const extractedText = parsed.extractedText || '';
      const lineByLineText = Array.isArray(parsed.lineByLineText) ? parsed.lineByLineText : [];
      const formulas = Array.isArray(parsed.formulas) ? parsed.formulas : [];
      const unclearWords = Array.isArray(parsed.unclearWords) ? parsed.unclearWords : [];
      const confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium';
      const hasUnclear = extractedText.includes('[unclear]') || unclearWords.length > 0;
      const needsReview = parsed.needsReview === true || confidence !== 'high' || hasUnclear;

      res.json({
        success: true,
        data: {
          extractedText,
          lineByLineText,
          formulas,
          unclearWords,
          confidence,
          needsReview,
        },
      });
    } catch (err: any) {
      logger.error('extract-handwritten-answer error', { endpoint: '/api/ai/extract-handwritten-answer', meta: { error: err.message } });
      const classified = classifyAIError(err);
      res.status(classified.status).json({
        success: false,
        error: classified.code === 'UNKNOWN'
          ? 'Could not read the answer clearly. You can type your answer or upload a clearer image.'
          : classified.message,
      });
    }
  --- end of disabled OCR implementation */
  });

  // ── /api/evaluate-answer ────────────────────────────────────────────────────
  // Evaluates typed exam answers with structured AI feedback.
  // Returns marks, missing keywords, strengths, improvements, model answer, exam tip.
  app.post('/api/evaluate-answer', rateLimitMiddleware('evaluate-answer'), async (req: any, res) => {
    try {
      const valErrors = validateEvaluateAnswer(req.body);
      if (sendValidationErrors(res, valErrors)) return;

      const { topic, subject, classLevel, examMode, question, studentAnswer, totalMarks, answerMode } = req.body;
      const lvl = classLevel || 'Class 10';
      const sub = subject || 'General';
      const mode = examMode || 'CBSE';
      const marks = totalMarks || 3;

      const modeNote = answerMode === 'uploaded'
        ? '\nNote: This answer was extracted from a handwritten upload via OCR. Minor OCR errors in spelling should not be penalised, but missing content should.'
        : '';

      const prompt = `You are a strict but encouraging ${sub} teacher evaluating a ${lvl} ${mode} exam answer.${modeNote}

Topic: ${topic || 'General'}
Question (${marks} marks): ${question}

Student's Answer: ${studentAnswer}

Evaluate the answer and return ONLY valid JSON:
{
  "marksScored": <number out of ${marks}>,
  "totalMarks": ${marks},
  "missingKeywords": ["keyword the student should have mentioned but didn't"],
  "strengths": ["what the student did well"],
  "improvements": ["specific advice to improve the answer"],
  "modelAnswer": "The ideal answer a topper would write for full marks",
  "examTip": "One practical exam tip related to this type of question"
}

Grading rules:
- Be fair but strict — ${mode} examiners look for specific keywords and structure.
- For 1-mark answers: 1 keyword/definition is enough for full marks. Model answer: 2-3 lines.
- For 3-mark answers: expect 3 distinct points or a definition + example + application. Model answer: 5-7 lines.
- For 5-mark answers: expect an introduction, 4-5 key points, examples, and a conclusion. Model answer: 8-12 lines.
- If the student's answer is empty or gibberish, give 0 marks.
- missingKeywords should list specific terms/facts the student missed.
- modelAnswer should be exactly what a full-marks answer looks like, matching the mark-based length guidelines above.
- examTip should be a specific, actionable tip for this type of question.
- Keep all feedback student-friendly — no jargon, no markdown symbols.`;

      const parsed = await enqueueAIRequest(() => callGemini([prompt]), req.requestId);
      parsed.marksScored = Number(parsed.marksScored) || 0;
      parsed.totalMarks = Number(parsed.totalMarks) || marks;
      parsed.examTip = parsed.examTip || '';
      res.json({ success: true, data: parsed });
    } catch (err: any) {
      const classified = classifyAIError(err);
      logger.error('evaluate-answer failed', { requestId: req.requestId, errorCode: classified.code });
      res.status(classified.status).json({ success: false, error: classified.message, errorCode: classified.code });
    }
  });

  // ── /api/generate-audio ──────────────────────────────────────────────────────
  // Generates narration audio via Sarvam AI TTS. Requires Plus/Pro plan.
  // First generates an engaging explanation script via Gemini, then converts to
  // speech via Sarvam. Returns audio URL + script + duration.
  app.post('/api/generate-audio', rateLimitMiddleware('generate-audio'), async (req: any, res) => {
    try {
      // If only topic sent (no script), generate the script via Gemini first
      let { topic, subject, classLevel, script, language, voiceStyle } = req.body;

      if (!topic || typeof topic !== 'string' || !topic.trim()) {
        return res.status(400).json({ success: false, error: 'Topic is required.' });
      }

      const sub = subject || 'General';
      const lvl = classLevel || 'Class 10';
      const lang = language || 'en-IN';
      const style = voiceStyle || 'clear-teacher';

      // ── Step 0: Look up CBSE weightage-based audio target ──────────
      const audioTarget = getChapterAudioTarget(lvl, sub, topic);
      logger.info('Audio target for chapter', {
        meta: { topic, classLevel: lvl, subject: sub, target: describeTarget(audioTarget) },
      });

      // ── Step 1: Generate script via Gemini if not provided ──────────
      if (!script || typeof script !== 'string' || script.trim().length < 20) {

        // Check Gemini script cache first (keyed by topic+language+voiceStyle)
        const scriptCacheKey = buildCacheKey({
          endpoint: 'audio-script',
          topic,
          subject: sub,
          classLevel: lvl,
          language: lang,
          voiceStyle: style,
        });
        const cachedScript = cacheGet(scriptCacheKey);
        if (cachedScript && typeof cachedScript === 'object' && cachedScript.fullScript) {
          logger.info('Audio script cache HIT', { meta: { topic, style, lang } });
          script = cachedScript.fullScript;
          (req as any)._scriptSections = cachedScript;
        } else {

        // Dynamic word targets based on CBSE chapter weightage
        const tgtMin = audioTarget.targetMinutes;
        const tgtWords = style === 'clear-narrator' ? Math.round(audioTarget.targetWords * 0.7) : audioTarget.targetWords;
        const marksNote = audioTarget.estimatedMarks;
        const depthNote = audioTarget.contentDepth;
        const numExamples = depthNote === 'very-heavy' ? '5-6' : depthNote === 'heavy' ? '4-5' : '3-4';

        const langLabel = lang === 'hi-IN' ? 'Hindi (Devanagari script)' : lang === 'hinglish' ? 'Hinglish (Roman script, natural mix of Hindi and English)' : 'English';

        // ── NCERT topic list for audio scripts ───────────────────────
        const audioChapterCtx = getChapterContext(topic, sub, lvl);
        const audioNcertTopics = audioChapterCtx?.ncertTopics?.length
          ? `
MANDATORY NCERT TOPIC LIST — your script MUST explain EVERY topic below. Skipping any is a failure:
${audioChapterCtx.ncertTopics.map((t: string, i: number) => `  ${i + 1}. ${t}`).join('\n')}

Cover ALL listed topics in your narration. Each topic needs at least a brief explanation.`
          : '';

        // ── Common preamble shared by all styles ──────────────────────
        const preamble = `You are explaining the chapter "${topic}" to a ${lvl} ${sub} student in ${langLabel}.

CHAPTER IMPORTANCE: ~${marksNote} marks in CBSE boards. Depth: "${depthNote}".

MANDATORY LENGTH: fullScript MUST be ${tgtWords}+ words (≈${style === 'clear-narrator' ? Math.round(tgtMin * 0.7) : tgtMin} min at 130 wpm). Shorter than ${Math.round(tgtWords * 0.8)} words is REJECTED.
${audioNcertTopics}
NARRATION RULES (for TTS — text-to-speech engine reads this aloud):
- SHORT sentences (max 15-20 words). One idea per sentence.
- Use [short pause] after each definition or key term.
- Use [medium pause] before examples, before exam tips, and between subtopics.
- Use [long pause] between major topic transitions and before dramatic reveals.
- NEVER use "...", bullet points, asterisks, markdown, or numbered lists.
- Write in flowing spoken paragraphs only.
- Spell out formulas in words ("V equals I times R").
- Read chemical equations naturally ("zinc reacts with HCl to form zinc chloride and hydrogen gas").
- NEVER abbreviate without spelling out first.`;

        // ── Style-specific prompt body ────────────────────────────────
        const stylePrompts: Record<string, string> = {

          'clear-teacher': `${preamble}

YOU ARE: A calm, confident CBSE classroom teacher who explains step-by-step, like the best school teacher a student has ever had. You speak slowly and repeat important keywords.

VOICE: Calm. Structured. Slow. Patient. One concept at a time.
PHRASES YOU MUST USE: "Let us understand this step by step.", "Now pay attention here.", "This is very important.", "Let me repeat that.", "Are you following so far?", "Let me say that again."
DO NOT rush. DO NOT pile up concepts. Explain each idea fully before moving on.

FORBIDDEN PHRASES (never use these — they belong to other styles):
- "Imagine..." / "Picture this..." / "Our hero..." (these are Story Mode)
- "Guaranteed marks" / "This carries X marks" (these are Exam Coach)
- "Think of it like this" / "You're doing great!" (these are Friendly Tutor)

SCRIPT STRUCTURE (follow this exact flow):
1. HOOK: Short welcome + why this chapter matters. (40-60 words)
2. MAIN EXPLANATION: Go through EVERY concept in the chapter one by one. For each concept:
   - State the definition clearly. [short pause]
   - Explain what it means in simple words. [short pause]
   - Give an example. [medium pause]
   - Mention common mistakes students make. [short pause]
   Cover ALL definitions, formulas, reactions, properties, types, classifications. (${Math.round(tgtWords * 0.55)}+ words)
3. WORKED EXAMPLES: Step-by-step solved examples and real-life connections. ${numExamples} examples minimum. [medium pause] between examples. (${Math.round(tgtWords * 0.15)}+ words)
4. COMMON MISTAKES: What students get wrong and how to fix it. (${Math.round(tgtWords * 0.05)}+ words)
5. EXAM TIP: [long pause] How this appears in boards, mark distribution, model answer structure, keywords examiners want. (${Math.round(tgtWords * 0.10)}+ words)
6. RECAP: [long pause] Quick summary of ALL key points covered. (${Math.round(tgtWords * 0.08)}+ words)
7. CHALLENGE: Encourage the student to test themselves. (30 words)`,

          'friendly-tutor': `${preamble}

YOU ARE: A warm, friendly older sibling or private tutor who makes tough concepts feel easy. You use everyday analogies, celebrate progress, and keep the mood light and supportive.

VOICE: Conversational. Warm. Encouraging. Simple. Relatable. Supportive.
PHRASES YOU MUST USE: "Think of it like this.", "See? That wasn't so hard!", "Let's figure this out together.", "You're doing great!", "Suppose you're at home and...", "It's like when you...", "Pretty cool, right?", "Don't worry, we'll break this down."
Use "we" and "let's" throughout. Ask friendly questions. Use analogies from daily life (cooking, cricket, mobile phones, movies, social media, WhatsApp, Instagram).

FORBIDDEN PHRASES (never use these):
- "Let us understand this step by step." / "Pay attention" (Class Teacher)
- "Imagine..." / "Our hero..." / "Plot twist!" (Story Mode)
- "This carries X marks" / "Guaranteed marks" (Exam Coach)

SCRIPT STRUCTURE:
1. HOOK: A friendly question or relatable scenario that connects to the student's life. "Hey! Have you ever wondered why...?" (40-60 words)
2. MAIN EXPLANATION: Explain every concept through analogies and everyday connections. For each concept:
   - Start with a relatable analogy. [short pause]
   - Then give the textbook definition simply. [short pause]
   - Then explain why it matters in real life. [medium pause]
   - Celebrate: "See? Makes sense now, right?" [short pause]
   Cover ALL chapter content through this conversational approach. (${Math.round(tgtWords * 0.55)}+ words)
3. REAL-LIFE CONNECTIONS: Show how these concepts appear in daily life. ${numExamples} examples with vivid analogies. [medium pause] between each. (${Math.round(tgtWords * 0.15)}+ words)
4. COMMON CONFUSIONS: "A lot of students get confused here, but don't worry..." Address confusions supportively. (${Math.round(tgtWords * 0.05)}+ words)
5. EXAM TIP: [long pause] Exam advice given like a caring mentor. "Here's a small tip for your exam..." (${Math.round(tgtWords * 0.10)}+ words)
6. RECAP: Quick friendly summary. "So, to wrap up what we learned today..." (${Math.round(tgtWords * 0.08)}+ words)
7. CHALLENGE: Warm encouragement. "You've got this! Try the quiz now and see how much you remember." (30 words)`,

          'exam-coach': `${preamble}

YOU ARE: An intense, marks-focused exam coach from the best coaching institute. Every single word you say is about scoring maximum marks. You think in terms of mark distribution, must-write keywords, and model answer formats.

VOICE: Direct. Strategic. Precise. Crisp. No fluff. Every sentence tied to marks.
PHRASES YOU MUST USE: "This carries X marks.", "Guaranteed marks if you write this.", "Examiners always look for this keyword.", "Common mistake that loses marks.", "Here's how to write a perfect 5-mark answer.", "Write this line for full marks.", "If you remember nothing else, remember this.", "This is a must-write keyword."
Structure EVERYTHING around marks and question types.

FORBIDDEN PHRASES (never use these):
- "Let us understand" / "Are you following?" (Class Teacher)
- "Think of it like this" / "Pretty cool, right?" (Friendly Tutor)
- "Imagine..." / "Picture this..." / "Our hero..." (Story Mode)

SCRIPT STRUCTURE:
1. HOOK: "This chapter carries ${marksNote} marks. Here's how to score FULL marks." (30-50 words)
2. KEY DEFINITIONS (exam-ready): Every important definition stated in exam-answer format. After each: "If this comes as a 1-mark question, write exactly this." [short pause] (${Math.round(tgtWords * 0.25)}+ words)
3. MUST-WRITE KEYWORDS AND FORMULAS: [long pause] Every formula, reaction, theorem listed with exam context. "This formula appears in 3-mark numericals every year." List the exact keywords examiners look for. [short pause] after each keyword. (${Math.round(tgtWords * 0.15)}+ words)
4. QUESTION-TYPE BREAKDOWN: [long pause] How to answer 1-mark MCQs, 2-mark short answers, 3-mark questions, and 5-mark long answers from this chapter. Give model answer structures for each type. [medium pause] between types. (${Math.round(tgtWords * 0.20)}+ words)
5. COMMON MISTAKES THAT LOSE MARKS: "Students lose marks because they forget to...", "Never write X, always write Y." (${Math.round(tgtWords * 0.10)}+ words)
6. RAPID REVISION CHECKLIST: [long pause] Quick-fire list of everything to remember. "If you remember these ${depthNote === 'very-heavy' ? '15' : '10'} points, you will score full marks." (${Math.round(tgtWords * 0.10)}+ words)
7. FINAL PUSH: Motivational exam-day advice. (30 words)`,

          'story-mode': `${preamble}

YOU ARE: A master storyteller and narrator. You transform textbook chapters into vivid, unforgettable stories. You teach science and concepts through scenes, characters, dialogue, emotions, and adventure. You are NOT a teacher. You are a storyteller.

VOICE: Dramatic. Expressive. Energetic. Curious. Imaginative. Like a movie narrator or adventure podcast host.
PHRASES YOU MUST USE: "Imagine...", "Picture this...", "But then something unexpected happened...", "And that is when everything changed...", "Plot twist!", "Can you guess what happened next?", "Our character discovered something incredible..."
Use vivid descriptions: colors, sounds, feelings, movement. Use dialogue between characters. Use dramatic reveals.

ABSOLUTELY FORBIDDEN PHRASES — using ANY of these will make the script INVALID:
- "Let me explain" / "Let us understand" / "Now let us understand"
- "Pay attention" / "This is very important" / "This is important for exams"
- "In this chapter" / "Today we will learn" / "Let us study"
- "The definition of X is..." / "X is defined as..."
- "Remember this for your exam" / "This carries X marks"
- "Are you following?" / "Let me repeat that"

HOW TO TEACH THROUGH STORY (follow this pattern):
- BAD: "Refraction is the bending of light when it passes from one medium to another."
- GOOD: "As the beam of light hit the water surface, something strange happened. It bent. Changed direction. Almost like it stumbled as it crossed from air into water. [short pause] Scientists call this refraction."

EXAMPLE OPENING (use this caliber, not this exact text):
"Picture a world where atoms are tiny people living in a molecular city. Carbon is the most popular kid in town. Why? Because Carbon can hold hands with four friends at once. [short pause] That special ability? Scientists call it tetravalency. [medium pause] But here is where the story gets really interesting..."

SCRIPT STRUCTURE:
1. SCENE SETTING (this becomes "hook" in JSON): Open with "Imagine..." or "Picture this..." Set a vivid scene with a character, a place, or a situation. Make the listener curious. Do NOT open with any textbook language. (60-80 words)
2. THE STORY ARC (this becomes "mainExplanation" in JSON): Build a narrative where your character encounters each concept as part of their journey. For each concept:
   - Show it happening in the story through action and dialogue. [short pause]
   - Use a dramatic reveal or surprise. [medium pause]
   - THEN briefly connect to the textbook term: "And that, in science, is what we call [term]." [short pause]
   Cover ALL chapter concepts woven into the narrative. Use multiple scenes. Use dialogue. (${Math.round(tgtWords * 0.60)}+ words)
3. THE TWIST (this becomes "example" in JSON): [long pause] A surprising connection or revelation that ties all concepts together. "But here is the most amazing part..." (${Math.round(tgtWords * 0.10)}+ words)
4. BACK TO THE TEXTBOOK (this becomes "examTip" in JSON): [long pause] Brief section connecting story scenes back to exam terms. "So remember, when your textbook says refraction, think of that beam of light stumbling into water." Give 3-5 exam keywords from the story. (${Math.round(tgtWords * 0.10)}+ words)
5. STORY RECAP (this becomes "recap" in JSON): Quick story-style summary. "Our character learned that..." (${Math.round(tgtWords * 0.08)}+ words)
6. CHALLENGE: "Now it is your turn to be the hero. Test yourself!" (30 words)`,

          'clear-narrator': `${preamble}

YOU ARE: A neutral, professional narrator delivering a clean audio summary. No personality, no enthusiasm, no engagement phrases. Just clear, factual, well-paced information.

VOICE: Neutral. Smooth. Clean. Simple. Like a professional audiobook narrator reading a textbook summary.
PHRASES TO AVOID: Do NOT use "Let us understand", "Imagine", "Pay attention", "You're doing great", "This carries X marks", or any engagement phrases. Simply state facts clearly.

SCRIPT STRUCTURE:
1. HOOK: One sentence stating what this chapter covers. (20-30 words)
2. MAIN EXPLANATION: Cover all key concepts in simple, clear language. One concept per paragraph. State definition, then brief explanation, then move on. No analogies, no stories, no exam coaching. [short pause] after each concept. (${Math.round(tgtWords * 0.60)}+ words)
3. KEY EXAMPLES: Brief factual examples for important concepts. [medium pause] between examples. (${Math.round(tgtWords * 0.15)}+ words)
4. SUMMARY NOTES: Important formulas, reactions, or classifications listed clearly. (${Math.round(tgtWords * 0.10)}+ words)
5. RECAP: [long pause] Concise summary of all key points. (${Math.round(tgtWords * 0.08)}+ words)
6. CHALLENGE: "Review what you have learned. Take the quiz." (15 words)`,
        };

        const stylePrompt = stylePrompts[style] || stylePrompts['clear-teacher'];

        // ── Language enforcement block ──────────────────────────────────
        const langEnforcement = lang === 'hi-IN'
          ? `\n\nABSOLUTE LANGUAGE REQUIREMENT (CRITICAL — violating this makes the response INVALID):\nThe fullScript and EVERY section (hook, mainExplanation, example, examTip, recap, challenge) MUST be written entirely in Hindi using Devanagari script.\nScientific terms and formulas may remain in English, but ALL explanations, sentences, and connecting words MUST be in Hindi.\nDo NOT write in English. Do NOT fall back to English.\nExample: "कार्बन एक विशेष तत्व है क्योंकि यह चार बंध बना सकता है। इस गुण को tetravalency कहते हैं।"`
          : lang === 'hinglish'
          ? `\n\nABSOLUTE LANGUAGE REQUIREMENT (CRITICAL — violating this makes the response INVALID):\nThe fullScript and EVERY section MUST be written in Hinglish using Roman script.\nHinglish means naturally mixing Hindi and English the way Indian students actually speak.\nScientific terms and formulas stay in English. Everything else mixes Hindi and English naturally.\nDo NOT write purely in English. Do NOT write in Devanagari.\nExample: "Carbon ek special element hai kyunki yeh four bonds bana sakta hai. Is property ko tetravalency kehte hain. Aur jab carbon atoms ek doosre se bond banate hain, toh long chains form hoti hain. Isse catenation kehte hain."`
          : '';

        const scriptPrompt = `${stylePrompt}
${langEnforcement}

Output a JSON object with this EXACT structure:
{
  "hook": "The opening section",
  "mainExplanation": "The core content section (largest part of the script)",
  "example": "Examples, analogies, or story scenes that illustrate concepts",
  "examTip": "Exam strategy, tips, or textbook connections",
  "recap": "Quick summary of everything covered",
  "challenge": "Motivational closing line (30 words)",
  "fullScript": "The COMPLETE narration combining ALL sections above into one continuous, flowing script with [short pause], [medium pause], and [long pause] markers. MUST be ${tgtWords}+ words.",
  "quickRecap": ["Key point 1 (under 18 words)", "Key point 2", "Key point 3", "Key point 4", "Key point 5", "Key point 6", "Key point 7"],
  "keyVocabulary": [
    {"term": "Term name", "meaning": "Simple one-line meaning", "examUse": "How to use this term in exam answers"},
    {"term": "Term 2", "meaning": "Meaning", "examUse": "Exam usage"}
  ]
}

RULES for quickRecap: Exactly 5-7 bullet points. Each under 18 words. Exam-focused.
RULES for keyVocabulary: 8-12 important terms from this chapter. Each with term, meaning, examUse.

Respond ONLY with valid JSON. No markdown, no code fences.`;

        const parsed = await callGemini([scriptPrompt], 'application/json');

        if (!parsed || typeof parsed !== 'object') {
          return res.status(500).json({ success: false, error: 'Failed to generate explanation script.' });
        }

        script = parsed.fullScript || [
          parsed.hook,
          parsed.mainExplanation,
          parsed.example,
          parsed.examTip,
          parsed.recap,
          parsed.challenge,
        ].filter(Boolean).join('\n\n');

        // Light sanitisation (heavy sanitisation happens in sarvamService before TTS)
        script = script
          .replace(/\.{2,}/g, '.')
          .replace(/\*+/g, '')
          .replace(/#+\s*/g, '')
          .replace(/^[-–—•]\s*/gm, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        // Cache the Gemini-generated script for this (topic, language, voiceStyle) combo
        cacheSet(scriptCacheKey, parsed);

        // Return script sections + new quickRecap/keyVocabulary alongside the audio
        (req as any)._scriptSections = parsed;
        } // end cache else
      }

      // ── Step 2: Validate the final payload ─────────────────────────
      const valErrors = validateGenerateAudio({ topic, script, language: lang, voiceStyle: style });
      if (sendValidationErrors(res, valErrors)) return;

      // ── Step 3: Check Sarvam config ────────────────────────────────
      const sarvamCheck = validateSarvamConfig();
      if (!sarvamCheck.ok) {
        // Sarvam not configured — return script only (graceful degradation)
        logger.warn('Sarvam not configured, returning script only');
        return res.json({
          success: true,
          data: {
            audioUrl: null,
            duration: null,
            script,
            scriptSections: (req as any)._scriptSections || null,
            cached: false,
            sarvamUnavailable: true,
            message: 'Audio generation is currently unavailable. You can still read the explanation script.',
          },
        });
      }

      // ── Step 4: Generate audio via Sarvam ──────────────────────────
      const audioResult = await generateAudio({
        topic,
        subject: sub,
        classLevel: lvl,
        script,
        language: lang,
        voiceStyle: style,
      });

      res.json({
        success: true,
        data: {
          audioUrl: audioResult.audioUrl,
          duration: audioResult.duration,
          script: audioResult.script,
          scriptSections: (req as any)._scriptSections || null,
          cached: audioResult.cached,
          sarvamUnavailable: false,
        },
      });

    } catch (err: any) {
      if (err instanceof SarvamError) {
        logger.error('Sarvam TTS error', { requestId: req.requestId, errorCode: err.code, meta: { message: err.message } });

        // Graceful degradation: if Sarvam fails, still return the script
        const script = req.body?.script || '';
        return res.status(err.code === 'QUOTA_EXCEEDED' ? 429 : 500).json({
          success: false,
          error: err.message,
          errorCode: err.code,
          data: {
            script,
            scriptSections: (req as any)?._scriptSections || null,
            sarvamUnavailable: true,
            message: 'Audio generation is currently unavailable. You can still read the explanation script.',
          },
        });
      }

      const classified = classifyAIError(err);
      logger.error('generate-audio failed', { requestId: req.requestId, errorCode: classified.code });
      res.status(classified.status).json({ success: false, error: classified.message, errorCode: classified.code });
    }
  });

  // ── /api/ai/generate-summary ─────────────────────────────────────────────────
  app.post('/api/ai/generate-summary', rateLimitMiddleware('summary'), async (req: any, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'text is required.' });
      }
      if (text.length > LIMITS.TEXT_MAX) {
        return res.status(400).json({ success: false, error: `Text too long (max ${LIMITS.TEXT_MAX} characters).` });
      }

      // ── Cache check ─────────────────────────────────────────────────
      const cacheKey = buildCacheKey({ endpoint: 'summary', topic: text.substring(0, 200) });
      const cached = cacheGet(cacheKey);
      if (cached) {
        logger.info('Cache hit for summary', { requestId: req.requestId, cacheHit: true });
        return res.json({ success: true, data: cached });
      }

      const prompt = `You are Lumina, a friendly AI study coach. Summarise the following and respond helpfully.

Input: "${text}"

Respond ONLY with a JSON object:
{
  "summary": "Your helpful response here",
  "keyTakeaways": ["Point 1", "Point 2", "Point 3"],
  "complexity": "Beginner"
}

complexity must be one of: Beginner | Intermediate | Advanced`;

      const data = await enqueueAIRequest(() => callGemini([prompt]), req.requestId);
      cacheSet(cacheKey, data);
      res.json({ success: true, data });
    } catch (e: any) {
      const classified = classifyAIError(e);
      logger.error('generate-summary failed', { requestId: req.requestId, errorCode: classified.code });
      res.status(classified.status).json({ success: false, error: classified.message, errorCode: classified.code });
    }
  });

  // ── /api/generate-flashcards ─────────────────────────────────────────────────
  // Generates standalone flashcards for a topic. Used by the shared
  // openFlashcards() flow when no kit-bundled flashcards are available.
  app.post('/api/generate-flashcards', rateLimitMiddleware('generate-flashcards'), async (req: any, res) => {
    try {
      const valErrors = validateGenerateFlashcards(req.body);
      if (sendValidationErrors(res, valErrors)) return;

      const {
        topic,
        classLevel = 'Class 10',
        examMode   = 'CBSE',
        sourceText = '',
      } = req.body;

      // ── Cache check ─────────────────────────────────────────────────
      const cacheKey = buildCacheKey({ endpoint: 'flashcards', topic, classLevel, examMode: examMode });
      const cached = cacheGet(cacheKey);
      if (cached) {
        logger.info('Cache hit for flashcards', { requestId: req.requestId, cacheHit: true });
        return res.json({ success: true, data: cached });
      }

      const sourceCtx = sourceText
        ? `\n\nExtra context from the student's revision kit:\n${String(sourceText).substring(0, 2000)}`
        : '';

      const prompt = `You are an expert ${examMode} teacher creating revision flashcards for a ${classLevel} student.

Topic: "${topic}"${sourceCtx}

Generate at least 8 flashcards covering definitions, processes, equations and common mistakes.
Use student-friendly language suitable for a Class 10 student.

Return ONLY a valid JSON object — no markdown, no code fences, no extra text:
{
  "topic": "${topic}",
  "flashcards": [
    {
      "front": "Short question, term or concept",
      "back": "Clear explanation or answer (2–3 sentences max)",
      "topicTag": "Specific subtopic label",
      "difficulty": "easy"
    }
  ]
}

Rules:
- At least 8 flashcards.
- difficulty must be one of: easy | medium | hard.
- Cover definitions, processes, equations and common mistakes.
- All JSON strings must be properly escaped.`;

      const raw = await enqueueAIRequest(() => callGemini([prompt]), req.requestId);

      const cards: any[] = (raw.flashcards || []).map((c: any, i: number) => ({
        front:      c.front      || `Card ${i + 1}`,
        back:       c.back       || '',
        topicTag:   c.topicTag   || topic,
        difficulty: c.difficulty || 'medium',
      })).filter((c: any) => c.front && c.back);

      if (cards.length === 0) {
        return res.status(502).json({ success: false, error: 'AI returned no usable flashcards. Please retry.' });
      }

      const result = { topic: raw.topic || topic, flashcards: cards };
      cacheSet(cacheKey, result);

      res.json({ success: true, data: result });
    } catch (e: any) {
      const classified = classifyAIError(e);
      logger.error('generate-flashcards failed', { requestId: req.requestId, errorCode: classified.code });
      res.status(classified.status).json({ success: false, error: classified.message, errorCode: classified.code });
    }
  });

  // ── /api/generate-quiz ────────────────────────────────────────────────────────
  // Generates CBSE-style MCQs. If weakTopics are provided, questions target those
  // subtopics only. Returns questions with id, difficulty, topicTag fields.
  app.post('/api/generate-quiz', rateLimitMiddleware('generate-quiz'), async (req: any, res) => {
    try {
      const valErrors = validateGenerateQuiz(req.body);
      if (sendValidationErrors(res, valErrors)) return;

      const {
        topic,
        classLevel = 'Class 10',
        examMode   = 'CBSE',
        sourceText = '',
        weakTopics = [] as string[],
        count      = 5,
        subject    = '',
      } = req.body;

      // ── Cache check (skip when targeting weak topics — personalized) ──
      const cacheKey = weakTopics.length === 0
        ? buildCacheKey({ endpoint: 'quiz', topic, classLevel, examMode: examMode })
        : null;
      if (cacheKey) {
        const cached = cacheGet(cacheKey);
        if (cached) {
          logger.info('Cache hit for quiz', { requestId: req.requestId, cacheHit: true });
          return res.json({ success: true, data: cached });
        }
      }

      // Build context block
      const weakCtx = weakTopics.length > 0
        ? `\nFocus ONLY on these weak subtopics: ${weakTopics.join(', ')}.`
        : '';
      const sourceCtx = sourceText
        ? `\n\nExtra context from the student's revision kit:\n${sourceText.substring(0, 2000)}`
        : '';

      // NCERT topic injection — ensure every topic in the chapter gets at least one question
      const quizChapterCtx = getChapterContext(topic, subject, classLevel);
      const ncertTopics = quizChapterCtx?.ncertTopics || [];
      const ncertTopicCtx = ncertTopics.length > 0
        ? `\n\nNCERT TOPICS for this chapter (you MUST cover EVERY topic with at least one question):\n${ncertTopics.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}\n\nDistribute questions evenly across ALL topics above. No topic should be left uncovered.`
        : '';
      const isHindiQuiz = (subject || '').toLowerCase() === 'hindi';
      const hindiQuizCtx = isHindiQuiz
        ? `\n\nLANGUAGE RULE: Write ALL question text, options, and explanations in HINDI using Devanagari script (देवनागरी लिपि). Do NOT use English — every string must be in Hindi. Only the JSON keys remain in English.`
        : '';

      // For large question counts, compute difficulty distribution
      const easyCount = Math.round(count * 0.3);
      const medCount  = Math.round(count * 0.5);
      const hardCount = count - easyCount - medCount;

      const prompt = `You are an expert ${examMode} teacher preparing a ${classLevel} quiz${subject ? ` for ${subject}` : ''}.

Topic: "${topic}"${weakCtx}${sourceCtx}${ncertTopicCtx}${hindiQuizCtx}

Generate exactly ${count} multiple-choice questions in ${examMode} ${classLevel} style.
Mix difficulty: 30% easy, 50% medium, 20% hard (${easyCount} easy, ${medCount} medium, ${hardCount} hard).
Tag each question with "cognitiveLevel": "recall" (definitions, facts), "understand" (explain, compare), "apply" (solve, use formula), "analyze" (multi-step, evaluate). For ${count} questions, distribute: ~${Math.round(count * 0.25)} recall, ~${Math.round(count * 0.3)} understand, ~${Math.round(count * 0.25)} apply, ~${Math.round(count * 0.2)} analyze.

IMPORTANT — COMPREHENSIVE COVERAGE:
- Every question MUST test a DIFFERENT concept or subtopic. No two questions should test the same idea.
- Questions should progress from basic recall to higher-order thinking.
- Include at least 3 questions based on previous year CBSE board exam patterns.

IMPORTANT — SYLLABUS BOUNDARY:
- You MUST only ask questions that fall within the ${examMode} ${classLevel} syllabus (NCERT textbook scope).
- Do NOT include topics beyond ${classLevel} NCERT.
- Keep language simple and age-appropriate for a ${classLevel} student.

Return ONLY a valid JSON object — no markdown, no code fences, no extra text:
{
  "topic": "${topic}",
  "questions": [
    {
      "id": "q1",
      "question": "Full question text?",
      "options": ["A) Option one", "B) Option two", "C) Option three", "D) Option four"],
      "answer": "A",
      "explanation": "Clear explanation of why A is correct.",
      "topicTag": "Specific subtopic label",
      "difficulty": "easy",
      "cognitiveLevel": "recall"
    }
  ]
}

Rules:
- id must be "q1", "q2", … "q${count}".
- options must start with "A) ", "B) ", "C) ", "D) ".
- answer must be a single letter: A, B, C, or D.
- difficulty must be one of: easy | medium | hard.
- Every question must include explanation and topicTag.
- All JSON strings must be properly escaped.`;

      const raw = await enqueueAIRequest(() => callGemini([prompt]), req.requestId);

      // Normalise: ensure questions have the id field
      const questions: any[] = (raw.questions || []).map((q: any, i: number) => ({
        id: q.id || `q${i + 1}`,
        question:    q.question   || '',
        options:     q.options    || [],
        answer:      q.answer     || 'A',
        explanation: q.explanation|| '',
        topicTag:    q.topicTag   || topic,
        difficulty:  q.difficulty || 'medium',
      }));

      const result = { topic: raw.topic || topic, questions };
      if (cacheKey) cacheSet(cacheKey, result);

      res.json({ success: true, data: result });
    } catch (e: any) {
      const classified = classifyAIError(e);
      logger.error('generate-quiz failed', { requestId: req.requestId, errorCode: classified.code });
      res.status(classified.status).json({ success: false, error: classified.message, errorCode: classified.code });
    }
  });

  // ── /api/youtube-recall ─────────────────────────────────────────────────────
  // Generates a full recall kit from a YouTube video: summary, key points,
  // flashcards, quiz, weak-topic tags, and a spaced revision task.
  //
  // Input: topic (required), transcript (optional), outputLanguage ('en'|'hi'|'auto').
  // The frontend no longer sends YouTube URLs — the student enters the topic
  // directly and optionally pastes the transcript. This eliminates the entire
  // class of wrong-topic bugs caused by URL-only fallback paths.
  app.post('/api/youtube-recall', rateLimitMiddleware('youtube-recall'), async (req: any, res) => {
    try {
      const valErrors = validateYouTubeRecall(req.body);
      if (sendValidationErrors(res, valErrors)) return;

      const {
        videoTitle,
        transcript,
        topic,
        manualTopic,
        classLevel = 'Class 10',
        examMode = 'CBSE',
        outputLanguage = 'en',
        sourceLanguage = 'auto',
      } = req.body;

      // ── Helper: detect if a string is a URL (not a topic) ──────────
      const looksLikeUrl = (s: string | undefined): boolean => {
        if (!s) return false;
        const t = s.trim();
        return /^https?:\/\//i.test(t) || /^www\./i.test(t) ||
               /youtube\.com|youtu\.be/i.test(t);
      };

      // ── Helper: detect Hindi (Devanagari) content in text ──────────
      // Checks if ≥ 10% of the text contains Devanagari characters.
      const containsHindi = (text: string): boolean => {
        if (!text) return false;
        const devanagariChars = text.match(/[ऀ-ॿ]/g);
        if (!devanagariChars) return false;
        const alphaChars = text.replace(/[\s\d\p{P}]/gu, '');
        return alphaChars.length > 0 && (devanagariChars.length / alphaChars.length) > 0.1;
      };

      // ── Sanitise inputs: strip URL values from topic/title fields ──
      const safeTitle = (videoTitle && !looksLikeUrl(videoTitle)) ? videoTitle.trim() : '';
      const safeTopic = (topic && !looksLikeUrl(topic)) ? topic.trim() : '';
      const safeManualTopic = (manualTopic && !looksLikeUrl(manualTopic)) ? manualTopic.trim() : '';

      // Determine what content we have to work with
      const hasTranscript = transcript && transcript.trim().length > 0;
      const hasTitle = safeTitle.length > 0 || safeTopic.length > 0 || safeManualTopic.length > 0;

      logger.debug('youtube-recall request', { endpoint: '/api/ai/youtube-recall-kit', meta: { hasTranscript, transcriptLen: hasTranscript ? transcript.trim().length : 0, hasTitle, outputLanguage, sourceLanguage } });

      // ── Guard: must have at least a topic ──────────────────────────
      if (!hasTitle && !hasTranscript) {
        logger.debug('youtube-recall blocked: no topic or transcript', { endpoint: '/api/ai/youtube-recall-kit' });
        return res.status(400).json({
          success: false,
          error: 'Please enter the video topic to generate a recall kit.',
        });
      }

      // ── Resolve title & source confidence ──────────────────────────
      // Priority: manualTopic > topic > videoTitle
      const resolvedTitle = (safeManualTopic || safeTopic || safeTitle || 'YouTube Video');
      let sourceConfidence: 'full-transcript' | 'user-notes' | 'title-only' | 'manual-topic';

      if (hasTranscript && transcript.trim().length > 200) {
        sourceConfidence = 'full-transcript';
      } else if (hasTranscript) {
        sourceConfidence = 'user-notes';
      } else if (safeManualTopic.length > 0) {
        sourceConfidence = 'manual-topic';
      } else {
        sourceConfidence = 'title-only';
      }

      // ── Final safety: abort if resolvedTitle is generic ────────────
      if (resolvedTitle === 'YouTube Video' && !hasTranscript) {
        logger.debug('youtube-recall blocked: no meaningful topic', { endpoint: '/api/ai/youtube-recall-kit' });
        return res.status(400).json({
          success: false,
          error: 'Please enter the video topic to generate a recall kit.',
        });
      }

      logger.info('youtube-recall generating', { endpoint: '/api/ai/youtube-recall-kit', meta: { resolvedTitle, sourceConfidence, outputLanguage } });

      const transcriptCtx = hasTranscript
        ? `\n\nVideo Transcript / Student Notes:\n${transcript.trim().substring(0, 12000)}`
        : '';

      const sourceNote = sourceConfidence === 'full-transcript'
        ? 'Base your entire output strictly on the transcript provided. Do not invent facts beyond what the transcript covers.'
        : sourceConfidence === 'user-notes'
          ? 'The student provided brief notes. Use them as the primary source, but you may supplement with standard curriculum knowledge for this topic and class level.'
          : 'The student only provided a topic/title (no transcript). Generate educational content STRICTLY on this exact topic — do NOT switch to a different chapter or subject. Clearly base content on the standard curriculum.';

      // ── Language: auto-detect Hindi in transcript ──────────────────
      // The old code only checked sourceLanguage === 'hi', but the
      // frontend never sent sourceLanguage explicitly. Now we auto-detect
      // Hindi content via Devanagari character analysis.
      const transcriptIsHindi = hasTranscript && containsHindi(transcript.trim());
      const detectedSourceLang = sourceLanguage !== 'auto' ? sourceLanguage
        : transcriptIsHindi ? 'hi' : 'en';

      const resolvedOutputLang = outputLanguage === 'auto' ? detectedSourceLang : outputLanguage;

      let langInstruction = '';
      if (resolvedOutputLang === 'hi') {
        langInstruction = '\n\nIMPORTANT LANGUAGE RULE: Write ALL output text in Hindi (Devanagari script). Quiz options, flashcard text, summary, key points — everything must be in Hindi. Only keep scientific terms/formulas in English where standard.';
      } else {
        langInstruction = '\n\nIMPORTANT LANGUAGE RULE: Write ALL output text in English. Every part of your response — title, summary, key points, flashcard text, quiz questions, quiz options, explanations — MUST be in English.';
        if (transcriptIsHindi || detectedSourceLang === 'hi') {
          langInstruction += ' The provided transcript/notes are in Hindi — you MUST translate everything into clear English. Do NOT output any Hindi text. All Devanagari content must be translated to English.';
        }
      }

      logger.debug('youtube-recall language detection', { endpoint: '/api/ai/youtube-recall-kit', meta: { transcriptIsHindi, detectedSourceLang, resolvedOutputLang } });

      const prompt = `You are an expert ${examMode} ${classLevel} teacher. A student watched a YouTube video and wants a recall kit to test their understanding.

Video Title / Topic: "${resolvedTitle}"${transcriptCtx}

${sourceNote}${langInstruction}

CRITICAL RULE: Your output MUST be about "${resolvedTitle}" and ONLY about "${resolvedTitle}". Do NOT generate content about any other chapter or topic. If the title says "Electricity", every question/flashcard/summary must be about Electricity — never about History, Nationalism, or any unrelated subject.

Generate a comprehensive YouTube Recall Kit. Return ONLY valid JSON — no markdown, no backticks:
{
  "title": "${resolvedTitle}",
  "sourceType": "youtube",
  "detectedSubject": "The school subject this topic belongs to, e.g. Science, Mathematics, Social Science, English, Hindi",
  "summary": "A clear 3-5 sentence summary of the video content about ${resolvedTitle}",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3", "Key point 4", "Key point 5"],
  "flashcards": [
    { "front": "Question or term", "back": "Answer or explanation", "topicTag": "subtopic" }
  ],
  "quiz": [
    {
      "question": "Full question text?",
      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
      "answer": "A",
      "explanation": "Why A is correct",
      "topicTag": "subtopic"
    }
  ],
  "weakTopicTags": ["subtopic1", "subtopic2"],
  "nextRevisionTask": {
    "title": "Revise: ${resolvedTitle}",
    "dueDate": "${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}",
    "actionType": "revision"
  }
}

Requirements:
- title: MUST match the given topic "${resolvedTitle}" — never change it to a different chapter.
- detectedSubject: the school subject this belongs to (Science, Mathematics, Social Science, English, Hindi, etc.).
- summary: 3-5 sentences covering what the video teaches about ${resolvedTitle}.
- keyPoints: exactly 5 key takeaways, all about ${resolvedTitle}.
- flashcards: at least 8 flashcards about ${resolvedTitle} covering definitions, processes, facts and common mistakes.
- quiz: exactly 10 MCQs about ${resolvedTitle}. Mix difficulty: 3 easy, 5 medium, 2 hard. Options start with "A) ", "B) ", "C) ", "D) ". Answer is a single letter.
- weakTopicTags: 2-4 subtopics of ${resolvedTitle} the student should focus on.
- nextRevisionTask: one revision task for tomorrow.
- All strings properly escaped. No trailing commas.`;

      // ── Cache check ─────────────────────────────────────────────────
      const cacheKey = buildCacheKey({
        endpoint: 'youtube-recall',
        topic: resolvedTitle,
        classLevel,
        language: resolvedOutputLang,
      });
      const cached = cacheGet(cacheKey);
      if (cached) {
        logger.info('Cache hit for youtube-recall', { requestId: req.requestId, cacheHit: true });
        return res.json({ success: true, data: cached });
      }

      const raw = await enqueueAIRequest(() => callGemini([prompt]), req.requestId);

      // Normalise the response
      const kit = {
        title: raw.title || resolvedTitle,
        sourceType: 'youtube' as const,
        summary: raw.summary || '',
        keyPoints: Array.isArray(raw.keyPoints) ? raw.keyPoints : [],
        flashcards: (raw.flashcards || []).map((c: any) => ({
          front: c.front || '',
          back: c.back || '',
          topicTag: c.topicTag || resolvedTitle,
        })).filter((c: any) => c.front && c.back),
        quiz: (raw.quiz || []).map((q: any, i: number) => ({
          id: `q${i + 1}`,
          question: q.question || '',
          options: q.options || [],
          answer: q.answer || 'A',
          explanation: q.explanation || '',
          topicTag: q.topicTag || resolvedTitle,
        })).filter((q: any) => q.question),
        weakTopicTags: Array.isArray(raw.weakTopicTags) ? raw.weakTopicTags : [],
        nextRevisionTask: raw.nextRevisionTask || {
          title: `Revise: ${resolvedTitle}`,
          dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          actionType: 'revision',
        },
        sourceConfidence,
        outputLanguage: resolvedOutputLang,
        detectedTopic: resolvedTitle,
        detectedSubject: raw.detectedSubject || '',
      };

      logger.info('youtube-recall kit generated', { endpoint: '/api/ai/youtube-recall-kit', meta: { title: kit.title, subject: kit.detectedSubject, flashcards: kit.flashcards.length, quizzes: kit.quiz.length } });

      // Store as a kit in SQLite for library save
      const kitId = Date.now().toString();
      const kitData = { id: kitId, ...kit, createdAt: new Date().toISOString() };
      saveKit(kitId, kitData);

      // ── Cache store ─────────────────────────────────────────────────
      cacheSet(cacheKey, { ...kit, id: kitId });

      res.json({ success: true, data: kitData });
    } catch (e: any) {
      const classified = classifyAIError(e);
      logger.error('youtube-recall failed', { requestId: req.requestId, errorCode: classified.code });
      res.status(classified.status).json({ success: false, error: classified.message, errorCode: classified.code });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });
}

startServer();