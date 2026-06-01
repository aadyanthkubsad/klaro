/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { retrieveChunks } from './src/data/syllabusRetrieval.js';
import { logger, generateRequestId } from './server/logger.js';
import { validateGenerateKit, validateYouTubeRecall, validateStudyNotes, validateEvaluateAnswer, validateGenerateQuiz, validateGenerateFlashcards, validateWeakTopicAnalysis, validateGenerateAudio, sendValidationErrors, LIMITS } from './server/validate.js';
import { generateAudio, validateSarvamConfig, SarvamError, cleanupOldAudioFiles } from './server/services/sarvamService.js';
import { getChapterAudioTarget, describeTarget } from './server/data/chapterWeightage.js';
import { checkRateLimit, cleanupStaleEntries, getUsageStats, type EndpointBucket, type PlanType } from './server/rateLimiter.js';
import { enqueueAIRequest, configureQueue, getQueueStats } from './server/queue.js';
import { cacheGet, cacheSet, buildCacheKey, configureCache, getCacheStats, cleanupExpiredCache, cacheInvalidate } from './server/cache.js';
import { initDatabase, flushDatabase, getStats, updateStats, getLibrary, addToLibrary, removeFromLibrary, cleanupLibrary, getKit, saveKit, getOrCreateUser, getUserPlan, incrementUserKitCount, getDatabaseStats, getAllKits, createUser, getUserByEmail, getUserById, updateUserPlan, createPaymentRecord, markPaymentPaid, getPaymentByOrderId, getQuizAttempts, upsertQuizAttempts, getMistakeEntries, upsertMistakeEntries, getMasteryEntries, upsertMasteryEntries, getDailyTasksDb, upsertDailyTasks, getActivityLog, upsertActivityLog, getStreakInfo, upsertStreakInfo, getUsageCountersDb, upsertUsageCounter, getPlannerEventsDb, upsertPlannerEvents, getWrittenAnswersDb, upsertWrittenAnswers } from './server/database.js';
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
  console.log('--------------------------------------------------');
  console.log('[VARKify] Gemini API key check');
  console.log('  API key exists:', !isPlaceholder);
  console.log('  API key length:', trimmed.length);
  console.log('  Source:         process.env.GEMINI_API_KEY (.env via dotenv)');
  if (isPlaceholder) {
    console.log('  ⚠️  Add a real key to .env at the project root, then restart.');
  }
  console.log('--------------------------------------------------');
}

function logSarvamKeyStatus() {
  const sarvamCheck = validateSarvamConfig();
  console.log('--------------------------------------------------');
  console.log('[Klaro] Sarvam TTS key check');
  console.log('  Configured:', sarvamCheck.ok);
  if (!sarvamCheck.ok) {
    console.log('  ⚠️  Sarvam TTS disabled. Add SARVAM_API_KEY to .env for AI narration.');
    console.log('  Fallback: browser speech synthesis will be used.');
  } else {
    console.log('  Status: Ready for AI narration');
  }
  console.log('--------------------------------------------------');
}

async function startServer() {
  logApiKeyStatus();
  logSarvamKeyStatus();

  // ── Initialize infrastructure ──────────────────────────────────────────────
  initDatabase();
  configureQueue({
    maxConcurrent: parseInt(process.env.AI_MAX_CONCURRENT || '5', 10),
    maxQueueLength: parseInt(process.env.AI_MAX_QUEUE || '50', 10),
    requestTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '120000', 10),
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

  // Middleware for parsing JSON — 15MB to handle handwritten answer image uploads
  app.use(express.json({ limit: '15mb' }));

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

    // Log completion
    res.on('finish', () => {
      const duration = Date.now() - (req as any).startTime;
      if (req.path.startsWith('/api/')) {
        logger.info(`${req.method} ${req.path} ${res.statusCode}`, {
          requestId,
          endpoint: req.path,
          userPlan: plan,
          clientIp,
          durationMs: duration,
        });
      }
    });

    next();
  });

  // ── Auth middleware (sets req.userId — allows anonymous fallback) ─────────
  app.use(authMiddleware);

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

  // ── Health Check Endpoint ─────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
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
      rateLimiter: { note: 'Use GET /api/usage?ip=<IP> for per-user stats' },
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

  // ── Usage stats endpoint ──────────────────────────────────────────────────
  app.get('/api/usage', (req: any, res) => {
    const ip = (req.query.ip as string) || req.clientIp;
    res.json({
      success: true,
      clientIp: ip,
      plan: getUserPlan(ip),
      usage: getUsageStats(ip),
    });
  });

  // Safe debug endpoint — exposes existence + length only, never the key.
  app.get("/api/debug-key", (_req, res) => {
    const raw = process.env.GEMINI_API_KEY || '';
    const trimmed = raw.replace(/^["']|["']$/g, '').trim();
    const isPlaceholder = trimmed === '' || trimmed === 'your_api_key_here' || trimmed === 'undefined' || trimmed === 'null';
    res.json({
      exists: !isPlaceholder,
      length: trimmed.length,
      source: 'process.env.GEMINI_API_KEY',
    });
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
      return { code: 'PARSE_ERROR', status: 502, message: 'The AI response was incomplete or corrupted. Please try again — Hindi chapters may need a second attempt.' };
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused') || msg.includes('timeout') || msg.includes('enotfound')) {
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

    const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"];
    let response;
    let lastError: any;

    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await ai.models.generateContent({
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
          break;
        } catch (e: any) {
          lastError = e;
          const msg = (e.message || '').toLowerCase();
          const isTransient = msg.includes('503') || msg.includes('unavailable') || msg.includes('high demand') || msg.includes('overloaded');
          const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('rate_limit');
          const isDailyQuota = isQuota && msg.includes('limit: 0');
          const isNotFound = msg.includes('404') || msg.includes('not found') || msg.includes('not_found');
          const canFallback = isTransient || isQuota || isNotFound;
          if ((isTransient || (isQuota && !isDailyQuota)) && attempt === 0) {
            const waitSec = isQuota ? 5 : 3;
            console.warn(`Gemini ${model} returned ${isQuota ? '429' : '503'}, retrying in ${waitSec}s...`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
          }
          if (canFallback && models.indexOf(model) < models.length - 1) {
            console.warn(`Gemini ${model} unavailable (${isDailyQuota ? 'daily quota' : isQuota ? 'rate limit' : isNotFound ? 'not found' : '503'}), falling back to next model...`);
            break;
          }
          console.error("Gemini error response:", e.message || String(e));
          throw new Error(handleSDKError(e));
        }
      }
      if (response) break;
    }

    if (!response) {
      console.error("Gemini error response:", lastError?.message || 'All models unavailable');
      throw new Error(handleSDKError(lastError));
    }

    // Log finish reason / block info for debugging Hindi generation issues.
    const candidate = (response as any)?.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      console.warn("Gemini finish reason:", candidate.finishReason,
        "safetyRatings:", JSON.stringify(candidate.safetyRatings || []));
    }

    let rawText = '';
    try {
      rawText = response.text || "";
    } catch (textErr: any) {
      // response.text getter can throw if the response was blocked
      console.error("response.text threw:", textErr.message);
      throw new Error("AI response was blocked. This may be a false positive for Hindi educational content — please try again.");
    }

    if (!rawText) {
      throw new Error(`Gemini returned no text. Finish reason: ${candidate?.finishReason || 'unknown'}`);
    }

    if (respFormat === "application/json") {
       let cleanText = rawText;
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
           console.error("Failed to parse JSON from Gemini. Length:", rawText.length, "First 500 chars:", rawText.substring(0, 500));
           throw new Error("Invalid JSON from Gemini. The response may have been truncated — please try again.");
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

      const { weakTopics, mistakes } = req.body;
      const mistakesContext = mistakes.map((m: any) => `Q: ${m.question}\nCorrect: ${m.correction}`).join("\n\n");
      const topicsContext = weakTopics.join(", ");
      
      const prompt = `Analyze the user's mistakes and weak topics. Weak topics: ${topicsContext}.
Here are the past mistakes they made:
${mistakesContext}

CRITICAL RULES:
- Focus ONLY on the SINGLE most recent chapter/topic the student studied. Do NOT mix concepts from different chapters.
- If multiple chapters appear in the mistakes, pick the one with the most mistakes and cover ONLY that chapter.
- The notes must be chapter-specific — e.g. "Acids, Bases and Salts" only, not a mix of Chemistry and Biology.

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
    "title": "Weak Topic Remediation Quiz",
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

Create a new set of strictly 10 multiple-choice questions that specifically target these weak areas and past mistakes. Mix difficulty: 3 easy, 5 medium, 2 hard. Include a "difficulty" field ("easy"|"medium"|"hard") and "topicTag" field for each question.

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
  app.post("/api/generate-kit", rateLimitMiddleware('generate-kit'), async (req: any, res) => {
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

      let { topic, manualText, sourceText, classLevel, examMode, sourceType, imageBase64, mimeType, chapterTitle, subject, board, mode, language, chapterId, academicYear } = req.body;

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

      console.log("Resolved topic:", topic || "Extracted from image");

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
      console.log(`Syllabus retrieval: ${retrieval.chunks.length} chunks found for ${chapterTitle || topic || 'unknown'}`);

      // When the request comes from the predefined chapter library, lock the
      // prompt to that chapter so Gemini doesn't drift into adjacent syllabus.
      const chapterContext = chapterTitle
        ? `
You are generating a ${board || examMode || 'CBSE'} ${classLevel || 'Class 10'} revision kit for the chapter "${chapterTitle}"${subject ? ` in ${subject}` : ''}.
Academic year: ${retrieval.academicYear}.
Keep answers student-friendly, exam-focused, and aligned with the chapter title.
Do not invent syllabus outside the chapter.
${mode ? `The student picked the "${mode}" learning mode — emphasise that section while still returning the full JSON shape.` : ''}
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
The student is studying a Hindi (Class 10) chapter. Every single string value in the JSON you return MUST be written in HINDI using Devanagari script (देवनागरी लिपि).

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
      "topicTag": "उप-विषय"
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
      "topicTag": "Subtopic tag string"
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
  "aural": {
    "audioScript": "A detailed conversational script explaining the full chapter for spoken narration. Cover every key concept, definition, formula, and example. Use short spoken sentences (max 15-20 words). Do NOT use ellipsis dots or bullet points. Write in flowing paragraphs suitable for text-to-speech. Target 800-1200 words so the narration lasts 5-8 minutes.",
    "lectureNotes": ["Detailed lecture note 1", "Detailed lecture note 2", "Detailed lecture note 3", "Detailed lecture note 4", "Detailed lecture note 5"]
  }
}`;

      const promptTemplate = `${hindiTopDirective}
You are an expert Indian school teacher for ${classLevel || "Class 10"} students.
${chapterContext}
Generate a comprehensive revision kit for this topic.
Topic/Source Material: ${topic || chapterTitle || 'Extracted from image'} ${textRef ? `\nContent: ${textRef}` : ''}
Level: ${classLevel || "Class 10"}
Exam mode: ${examMode || "CBSE"}

IMPORTANT — SYLLABUS BOUNDARY:
- ALL content (summary, quiz, flashcards, definitions, keyPoints) MUST stay strictly within the ${examMode || "CBSE"} ${classLevel || "Class 10"} NCERT syllabus.
- Do NOT include topics from Class 11, Class 12, JEE, NEET, or competitive exams.
- For Science: no molarity calculations, titration numericals, advanced organic chemistry, or college-level concepts.
- For Maths: no calculus, matrices, or topics beyond ${classLevel || "Class 10"} NCERT.
- Keep all explanations simple and age-appropriate for a ${classLevel || "Class 10"} student (14-16 years old).

Return ONLY valid JSON.
Do NOT include any markdown formatting or backticks.
Ensure all strings are correctly closed and there are no stray quotes.

Use this EXACT nested structure:

${jsonSkeleton}

Requirements:
- Create exactly 10 questions for the quiz. Mix difficulty: 3 easy, 5 medium, 2 hard.
- Create at least 8 flashcards covering definitions, processes, equations, and common mistakes.
- Quiz answers MUST be the single letter (A, B, C, or D) that matches the correct option.
- Options MUST start with "A) ", "B) ", "C) ", "D) ".
- Explanations MUST be provided for every question.
- All strings must be valid and escape double quotes if they appear within text.
- mindMap MUST have 4 to 6 nodes. Each node MUST have a descriptive "label" and 2 to 4 "children" sub-branches.
  Children should be short, meaningful labels (not vague words like "definition" or "concept").
  Include exam-important facts, formulas, and examples as children.
- conceptMap MUST have 4 to 6 entries with meaningful "node", "relatesTo", and "reason" values.
- Create at least 5 keyPoints that cover the most important exam-relevant facts.
- Create at least 3 tips in readWrite.tips that help students study and avoid common mistakes.
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
            console.error("Manual JSON Parse Error on raw string:", jsonErr);
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
            console.warn("Hindi kit generation failed on first attempt, retrying with simplified prompt...", firstError.message);
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

      console.log("Parsed revision kit successfully. Extracting keys.");

      // Tag the kit with its language and subject so the client can render
      // Hindi-specific UI (e.g. an English-translation toggle) and match
      // cached kits by language without re-deriving from the title.
      parsedKit.language = forceHindi ? 'hi' : 'en';
      if (subject) {
        parsedKit.subject = parsedKit.subject || subject;
      }
      if (chapterTitle) {
        parsedKit.chapterTitle = chapterTitle;
      }

      const kitId = Date.now().toString();

      sessionData.kits[kitId] = {
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

      const finalTopic = parsedKit.quiz?.title || parsedKit.title || topic || "Generated Revision Kit";

      sessionData.library.unshift({
        id: kitId,
        title: finalTopic,
        type: "revision-kit",
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

      const kitData = sessionData.kits[kitId];

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

      // ── Style-specific instructions ──────────────────────────────────────────
      const styleInstructions: Record<string, string> = {
        smart: `Generate SMART NOTES — the most useful all-in-one notes style.
Fill: summary (2-3 detailed paragraphs), keyPoints (8-10 bullets), definitions (all key terms),
sections (4-6 sections, each with title + detailed content + 2-3 examTips + examples),
flashcards (10 cards). Leave tables/recallQuestions/conceptConnections/knowledgeCards/examOutline empty arrays.`,

        cornell: `Generate CORNELL NOTES — the two-column academic note style.
Fill: summary (concise 1-paragraph recap), keyPoints (6-8 bullets), definitions (key terms),
sections (one per major subtopic; each section.content = detailed notes in that cell,
section.cueQuestions = 3-4 self-test questions for the left cue column, section.examTips = exam tips),
recallQuestions (8-10 active-recall Q+hint+answer pairs),
flashcards (8 cards). Leave tables/conceptConnections/knowledgeCards/examOutline empty arrays.`,

        outline: `Generate an EXAM OUTLINE — hierarchical notes optimised for exam revision.
Fill: summary (1 paragraph), keyPoints (top 5 most exam-relevant points),
examOutline.mainTopic and examOutline.subtopics (4-6 subtopics, each with 4-6 keyPoints, 2-3 examples, 3-4 examQuestions),
sections (mirror the outline as readable paragraphs with examTips),
flashcards (8 cards covering likely exam answers).
Leave tables/recallQuestions/conceptConnections/knowledgeCards empty arrays.`,

        comparison: `Generate COMPARISON NOTES — table-driven notes ideal for topics with contrasting concepts.
Fill: summary (1 paragraph), keyPoints (5-6 bullets), definitions (key terms),
tables (3-5 comparison tables; each table has a descriptive title, 5-6 meaningful columns e.g.
"Concept", "Meaning / Definition", "Key Features", "Real-life Example", "Difference from X", "Exam Tip",
and 3-6 data rows with complete content in every cell — never leave cells blank),
sections (written context for each comparison with examTips),
flashcards (8 cards). Leave recallQuestions/conceptConnections/knowledgeCards/examOutline empty arrays.`,

        recall: `Generate RECALL NOTES — active-recall format for spaced repetition study.
Fill: summary (1 paragraph), keyPoints (6-8 bullets), definitions (all key terms),
recallQuestions (12-15 questions — each must have a clear question, a one-sentence hint, and a full correct answer),
sections (4-5 sections with content + cueQuestions for additional recall prompts),
flashcards (12 cards with varied front/back phrasing for maximum recall coverage).
Leave tables/conceptConnections/knowledgeCards/examOutline empty arrays.`,

        'concept-map': `Generate CONCEPT MAP NOTES — relationship-focused text-based mind map.
Fill: summary (1 paragraph), keyPoints (5-7 bullets), definitions (all key terms),
conceptConnections (12-18 connections; each with concept, connectedConcept, relationship description, whyItMatters for exam),
sections (3-4 narrative sections explaining how the concepts cluster together),
flashcards (8 cards on the most important concept pairs).
Leave tables/recallQuestions/knowledgeCards/examOutline empty arrays.`,

        'knowledge-cards': `Generate KNOWLEDGE CARDS (Zettelkasten-style atomic notes) — one idea per card.
Fill: summary (1 paragraph), keyPoints (5-6 bullets), definitions (key terms),
knowledgeCards (12-18 cards; each with a single atomic idea (3-7 words), a 2-3 sentence explanation,
2-4 linkedConcepts (other card ideas), and a precise quizQuestion with the answer embedded in it),
sections (3-4 sections grouping the cards by theme),
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
          ? `ENGLISH-SPECIFIC: Include theme and central idea, a chapter/poem summary, character sketches (name → personality → role → key quote), important lines/stanzas with explanation, word meanings and literary devices, and likely long-answer question themes.`
        : subjectLC === 'hindi'
          ? `HINDI-SPECIFIC: पाठ का केंद्रीय विषय, पात्र-चित्रण (नाम → स्वभाव → भूमिका → महत्वपूर्ण पंक्ति), कठिन शब्दों के अर्थ, महत्वपूर्ण पंक्तियों की व्याख्या, और संभावित प्रश्न-उत्तर शामिल करें।`
        : `Include relevant formulas/definitions, real-life examples, key facts, and common mistakes.`;

      const langDirective = isHindi
        ? `LANGUAGE: Write ALL content in Hindi using Devanagari script (देवनागरी). Do NOT write in English except for proper nouns or chemical symbols. JSON keys remain in English.`
        : `LANGUAGE: Write all content in clear, student-friendly English.`;

      const sourceBlock = sourceContent
        ? `\nSOURCE MATERIAL (base your notes ENTIRELY on this content — do NOT invent facts beyond it):\n---\n${sourceContent}\n---\nIMPORTANT: Your notes MUST be grounded in the source material above. Extract, reorganise, and elaborate on what is provided. Do not add unrelated information.\n`
        : '';

      const prompt = `${langDirective}

You are an expert ${board_} ${lvl} ${subject} teacher. Generate structured study notes.

Chapter / Topic: ${chapterTitle}
Subject: ${subject}
Note Style: ${noteStyle.toUpperCase()}
Class: ${lvl}  |  Board: ${board_}
${sourceBlock}
NOTE STYLE INSTRUCTIONS:
${styleInstructions[noteStyle] || styleInstructions['smart']}

SUBJECT-SPECIFIC INSTRUCTIONS:
${subjectInstructions}

QUALITY RULES:
- Write like a real teacher — not generic filler. Every sentence must help a student understand or remember.${sourceContent ? '\n- All notes must reflect the source material provided. Do not generate unrelated content.' : ''}
- keyPoints must be specific facts/rules/formulas, NOT vague headings.
- sections.content must be detailed (4-8 sentences minimum per section).
- definitions.meaning must include an example in brackets where possible.
- flashcards must cover different angles: definition, application, equation, common mistake, comparison.
- examTips must be specific and actionable (e.g. "CBSE often asks about X in 3-mark questions").
- Do NOT repeat the same sentence in multiple fields.
- All arrays must have at least the minimum count stated in the style instructions.

Return ONLY valid JSON matching this EXACT structure (no markdown, no backticks):

{
  "topic": "${chapterTitle}",
  "subject": "${subject}",
  "noteStyle": "${noteStyle}",
  "summary": "detailed summary paragraph(s)",
  "keyPoints": ["specific point 1", "specific point 2"],
  "definitions": [{ "term": "Term", "meaning": "Clear meaning with example" }],
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
      parsed.sections        = parsed.sections        || [];
      parsed.definitions     = parsed.definitions     || [];
      parsed.keyPoints       = parsed.keyPoints       || [];
      parsed.flashcards      = parsed.flashcards      || [];
      parsed.tables          = parsed.tables          || [];
      parsed.recallQuestions = parsed.recallQuestions || [];
      parsed.conceptConnections = parsed.conceptConnections || [];
      parsed.knowledgeCards  = parsed.knowledgeCards  || [];
      parsed.noteStyle       = noteStyle;
      parsed.subject         = subject;
      parsed.topic           = chapterTitle;
      parsed.language        = isHindi ? 'hi' : 'en';

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
  app.post('/api/extract-handwritten-answer', async (_req, res) => {
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
      console.error('extract-handwritten-answer error:', err);
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

        // ── Common preamble shared by all styles ──────────────────────
        const preamble = `You are explaining the chapter "${topic}" to a ${lvl} ${sub} student in ${langLabel}.

CHAPTER IMPORTANCE: ~${marksNote} marks in CBSE boards. Depth: "${depthNote}".

MANDATORY LENGTH: fullScript MUST be ${tgtWords}+ words (≈${style === 'clear-narrator' ? Math.round(tgtMin * 0.7) : tgtMin} min at 130 wpm). Shorter than ${Math.round(tgtWords * 0.8)} words is REJECTED.

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

      const prompt = `You are an expert ${examMode} teacher preparing a ${classLevel} quiz.

Topic: "${topic}"${weakCtx}${sourceCtx}

Generate exactly ${count} multiple-choice questions in ${examMode} ${classLevel} style.
Mix difficulty: 30% easy, 50% medium, 20% hard (e.g. for 10 questions: 3 easy, 5 medium, 2 hard).

IMPORTANT — SYLLABUS BOUNDARY:
- You MUST only ask questions that fall within the ${examMode} ${classLevel} syllabus (NCERT textbook scope).
- Do NOT include topics from Class 11, Class 12, JEE, NEET, or competitive exams.
- For Science: stick to NCERT ${classLevel} chapters only. No molarity calculations, titration numericals, advanced organic chemistry, or college-level concepts.
- For Maths: no calculus, matrices, or topics beyond ${classLevel} NCERT.
- Keep language simple and age-appropriate for a ${classLevel} student (14-16 years old).

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
      "difficulty": "easy"
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

      // ── Debug logging (no API keys) ────────────────────────────────
      console.log('[youtube-recall] Request:', {
        hasTranscript,
        transcriptLen: hasTranscript ? transcript.trim().length : 0,
        hasTitle,
        safeTitle: safeTitle || '(none)',
        safeTopic: safeTopic || '(none)',
        safeManualTopic: safeManualTopic || '(none)',
        outputLanguage,
        sourceLanguage,
      });

      // ── Guard: must have at least a topic ──────────────────────────
      if (!hasTitle && !hasTranscript) {
        console.log('[youtube-recall] → blocked: no topic or transcript');
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
        console.log('[youtube-recall] → blocked: no meaningful topic');
        return res.status(400).json({
          success: false,
          error: 'Please enter the video topic to generate a recall kit.',
        });
      }

      console.log('[youtube-recall] Generating kit:', {
        resolvedTitle,
        sourceConfidence,
        outputLanguage,
      });

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

      console.log('[youtube-recall] Language:', {
        transcriptIsHindi,
        detectedSourceLang,
        resolvedOutputLang,
        requestedOutputLanguage: outputLanguage,
      });

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

      console.log('[youtube-recall] Kit generated:', {
        title: kit.title,
        detectedSubject: kit.detectedSubject,
        sourceConfidence: kit.sourceConfidence,
        outputLanguage: kit.outputLanguage,
        flashcardCount: kit.flashcards.length,
        quizCount: kit.quiz.length,
      });

      // Store as a kit in session for library save
      const kitId = Date.now().toString();
      const kitData = { id: kitId, ...kit, createdAt: new Date().toISOString() };
      sessionData.kits[kitId] = kitData;

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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();