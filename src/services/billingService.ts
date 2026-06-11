/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * billingService — plan management, usage counters, and paywall gating.
 *
 * Pricing (INR):
 *   Free  — ₹0
 *   Plus  — ₹249/month | ₹1,799/year
 *   Exam Pro — ₹499/month | ₹3,499/year
 *
 * All counters persist to localStorage. Daily counters reset at midnight
 * (checked by comparing ISO date strings). Monthly counters reset on the
 * 1st of each month. No real payment gateway yet — plan changes happen
 * via in-app toggles.
 */

import { PlanType, PlanLimits, UsageCounters } from '../types';
import { schedulePush } from './syncService';

// ─── storage keys ───────────────────────────────────────────────────────────

const KEYS = {
  plan: 'lumina:plan',
  legacyPremium: 'varkify:isPremium',
  usage: 'lumina:usage',
};

const CHANGE_EVENT = 'lumina:billing-change';

/**
 * DEV-only flag. While true, forces every user into "pro" so the full
 * feature surface is available without payment integration.
 * Set to false for production / realistic testing.
 */
export const DEV_FORCE_PRO = false;

// ─── pricing data (exported for OffersView) ─────────────────────────────────

export interface PricingTier {
  id: PlanType;
  name: string;
  tagline: string;
  monthlyPrice: number;
  yearlyPrice: number;
  badge?: string;
  highlight?: boolean;
  features: string[];
}

export const PRICING: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Try Lumina and build a study habit',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      '7 revision kits per day',
      '7 quizzes per day',
      'Basic flashcards',
      'Mistakes notebook',
      'Daily tasks',
      'Limited library saves (10 items)',
    ],
  },
  {
    id: 'plus',
    name: 'Plus',
    tagline: 'For regular weekly revisers',
    monthlyPrice: 249,
    yearlyPrice: 1799,
    features: [
      '20 revision kits per day',
      'Flashcards within fair use',
      'PDF downloads',
      'Weak-topic retests',
      'Previous-year paper practice',
      'Daily spaced revision tasks',
      '5 YouTube Recall kits per month',
      'Saved library (no limit)',
    ],
  },
  {
    id: 'pro',
    name: 'Exam Pro',
    tagline: 'For serious exam preparation',
    monthlyPrice: 499,
    yearlyPrice: 3499,
    badge: 'Best for exam prep',
    highlight: true,
    features: [
      '50 revision kits per day',
      'YouTube Recall Kit (30/month)',
      'Monthly revision planner',
      'Advanced analytics',
      'Mastery tracking',
      'Forgetting-curve calendar',
      'Written answer feedback',
      'Mock test mode',
      'Priority AI generation queue',
    ],
  },
];

// ─── plan persistence ───────────────────────────────────────────────────────

const OWNER_EMAILS = ['prashanth.kubsad@gmail.com', 'kubsadaadyanth@gmail.com'];

export function isOwner(): boolean {
  try {
    // Primary: check the email AuthContext stores on login/register/me
    const email = window.localStorage.getItem('lumina:user-email');
    if (email && OWNER_EMAILS.includes(email.toLowerCase())) return true;
  } catch { /* ignore */ }
  try {
    // Fallback: decode JWT payload (handles URL-safe base64) and self-heal
    const token = window.localStorage.getItem('lumina:auth-token');
    if (token) {
      const parts = token.split('.');
      if (parts.length === 3) {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64));
        if (payload.email) {
          window.localStorage.setItem('lumina:user-email', payload.email);
        }
        if (payload.email && OWNER_EMAILS.includes(payload.email.toLowerCase())) return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}

export function getPlan(): PlanType {
  if (DEV_FORCE_PRO || isOwner()) {
    try {
      window.localStorage.setItem(KEYS.plan, 'pro');
      // Reset stale usage counters for owner so they never hit limits
      const counters = getDefaultCounters();
      window.localStorage.setItem(KEYS.usage, JSON.stringify(counters));
    } catch { /* ignore */ }
    return 'pro';
  }
  try {
    const v = window.localStorage.getItem(KEYS.plan);
    if (v === 'free' || v === 'plus' || v === 'pro') return v;
    if (window.localStorage.getItem(KEYS.legacyPremium) === 'true') {
      window.localStorage.setItem(KEYS.plan, 'pro');
      window.localStorage.removeItem(KEYS.legacyPremium);
      return 'pro';
    }
  } catch { /* ignore */ }
  return 'free';
}

export function setPlan(p: PlanType): void {
  try {
    window.localStorage.setItem(KEYS.plan, p);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch { /* ignore */ }
}

export function onPlanChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

// ─── plan limits table ──────────────────────────────────────────────────────

export function getLimitsFor(plan: PlanType): PlanLimits {
  switch (plan) {
    case 'pro':
      return {
        dailyKitsLimit: 50,
        dailyQuizLimit: 100,
        dailyFlashcardSetsLimit: 50,
        dailyPdfDownloadsLimit: 50,
        dailyWrittenAnswersLimit: 50,
        monthlyYoutubeRecallLimit: 30,
        unlimitedFlashcards: true,
        pdfExport: true,
        audioSummaries: true,
        mistakeSlideshow: true,
        monthlyPlanner: true,
        masteryAnalytics: true,
        premium3D: true,
        mp3Download: true,
        prioritisedGeneration: true,
        librarySaveLimit: Infinity,
        weakTopicRetests: true,
        previousYearPapers: true,
        spacedRevisionTasks: true,
        youtubeRecall: true,
        writtenAnswerFeedback: true,
        mockTestMode: true,
        forgettingCurveCalendar: true,
        advancedAnalytics: true,
        masteryTracking: true,
        dailyAudioGenerationsLimit: 30,
        aiNarration: true,
        storyModeNarration: true,
      };
    case 'plus':
      return {
        dailyKitsLimit: 20,
        dailyQuizLimit: 30,
        dailyFlashcardSetsLimit: 20,
        dailyPdfDownloadsLimit: 20,
        dailyWrittenAnswersLimit: 15,
        monthlyYoutubeRecallLimit: 5,
        unlimitedFlashcards: true,
        pdfExport: true,
        audioSummaries: true,
        mistakeSlideshow: true,
        monthlyPlanner: false,
        masteryAnalytics: false,
        premium3D: false,
        mp3Download: false,
        prioritisedGeneration: false,
        librarySaveLimit: Infinity,
        weakTopicRetests: true,
        previousYearPapers: true,
        spacedRevisionTasks: true,
        youtubeRecall: true,
        writtenAnswerFeedback: false,
        mockTestMode: false,
        forgettingCurveCalendar: false,
        advancedAnalytics: false,
        masteryTracking: false,
        dailyAudioGenerationsLimit: 10,
        aiNarration: true,
        storyModeNarration: false,
      };
    case 'free':
    default:
      return {
        dailyKitsLimit: 7,
        dailyQuizLimit: 7,
        dailyFlashcardSetsLimit: 7,
        dailyPdfDownloadsLimit: 0,
        dailyWrittenAnswersLimit: 0,
        monthlyYoutubeRecallLimit: 0,
        unlimitedFlashcards: false,
        pdfExport: false,
        audioSummaries: false,
        mistakeSlideshow: false,
        monthlyPlanner: false,
        masteryAnalytics: false,
        premium3D: false,
        mp3Download: false,
        prioritisedGeneration: false,
        librarySaveLimit: 10,
        weakTopicRetests: false,
        previousYearPapers: false,
        spacedRevisionTasks: false,
        youtubeRecall: false,
        writtenAnswerFeedback: false,
        mockTestMode: false,
        forgettingCurveCalendar: false,
        advancedAnalytics: false,
        masteryTracking: false,
        dailyAudioGenerationsLimit: 0,
        aiNarration: false,
        storyModeNarration: false,
      };
  }
}

// ─── usage counters ─────────────────────────────────────────────────────────

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function getDefaultCounters(): UsageCounters {
  return {
    kitsGeneratedToday: 0,
    quizzesTakenToday: 0,
    youtubeRecallUsedThisMonth: 0,
    pdfDownloadsToday: 0,
    writtenAnswersEvaluatedToday: 0,
    flashcardSetsGeneratedToday: 0,
    dailyResetDate: todayISODate(),
    monthlyResetMonth: currentMonth(),
  };
}

/** Load counters from localStorage, auto-resetting stale values. */
export function getUsageCounters(): UsageCounters {
  try {
    const raw = window.localStorage.getItem(KEYS.usage);
    if (!raw) return getDefaultCounters();
    const parsed: UsageCounters = JSON.parse(raw);
    const today = todayISODate();
    const month = currentMonth();

    // Daily reset
    if (parsed.dailyResetDate !== today) {
      parsed.kitsGeneratedToday = 0;
      parsed.quizzesTakenToday = 0;
      parsed.pdfDownloadsToday = 0;
      parsed.writtenAnswersEvaluatedToday = 0;
      parsed.flashcardSetsGeneratedToday = 0;
      parsed.dailyResetDate = today;
    }

    // Monthly reset
    if (parsed.monthlyResetMonth !== month) {
      parsed.youtubeRecallUsedThisMonth = 0;
      parsed.monthlyResetMonth = month;
    }

    return parsed;
  } catch {
    return getDefaultCounters();
  }
}

function saveCounters(counters: UsageCounters): void {
  try {
    window.localStorage.setItem(KEYS.usage, JSON.stringify(counters));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    schedulePush(KEYS.usage);
  } catch { /* ignore */ }
}

// ─── increment helpers ──────────────────────────────────────────────────────

export function incrementKitsUsedToday(): void {
  const c = getUsageCounters();
  c.kitsGeneratedToday++;
  saveCounters(c);
}

export function incrementQuizzesToday(): void {
  const c = getUsageCounters();
  c.quizzesTakenToday++;
  saveCounters(c);
}

export function incrementYoutubeRecallThisMonth(): void {
  const c = getUsageCounters();
  c.youtubeRecallUsedThisMonth++;
  saveCounters(c);
}

export function incrementPdfDownloadsToday(): void {
  const c = getUsageCounters();
  c.pdfDownloadsToday++;
  saveCounters(c);
}

export function incrementWrittenAnswersToday(): void {
  const c = getUsageCounters();
  c.writtenAnswersEvaluatedToday++;
  saveCounters(c);
}

export function incrementFlashcardSetsToday(): void {
  const c = getUsageCounters();
  c.flashcardSetsGeneratedToday++;
  saveCounters(c);
}

// ─── gate checks ────────────────────────────────────────────────────────────
// Each returns { allowed, used, limit } so the caller can show counters.

export interface GateResult {
  allowed: boolean;
  used: number;
  limit: number;
}

export function getKitsUsedToday(): number {
  return getUsageCounters().kitsGeneratedToday;
}

export function canGenerateKitToday(plan: PlanType): GateResult {
  const limit = getLimitsFor(plan).dailyKitsLimit;
  const used = getUsageCounters().kitsGeneratedToday;
  return { allowed: used < limit, used, limit };
}

export function canTakeQuizToday(plan: PlanType): GateResult {
  const limit = getLimitsFor(plan).dailyQuizLimit;
  const used = getUsageCounters().quizzesTakenToday;
  return { allowed: used < limit, used, limit };
}

export function canUseYoutubeRecall(plan: PlanType): GateResult {
  const limits = getLimitsFor(plan);
  if (!limits.youtubeRecall) return { allowed: false, used: 0, limit: 0 };
  const used = getUsageCounters().youtubeRecallUsedThisMonth;
  return { allowed: used < limits.monthlyYoutubeRecallLimit, used, limit: limits.monthlyYoutubeRecallLimit };
}

export function canDownloadPdf(plan: PlanType): GateResult {
  const limits = getLimitsFor(plan);
  if (!limits.pdfExport) return { allowed: false, used: 0, limit: 0 };
  const used = getUsageCounters().pdfDownloadsToday;
  return { allowed: used < limits.dailyPdfDownloadsLimit, used, limit: limits.dailyPdfDownloadsLimit };
}

export function canEvaluateWrittenAnswer(plan: PlanType): GateResult {
  const limits = getLimitsFor(plan);
  if (!limits.writtenAnswerFeedback) return { allowed: false, used: 0, limit: 0 };
  const used = getUsageCounters().writtenAnswersEvaluatedToday;
  return { allowed: used < limits.dailyWrittenAnswersLimit, used, limit: limits.dailyWrittenAnswersLimit };
}

export function canGenerateFlashcards(plan: PlanType): GateResult {
  const limit = getLimitsFor(plan).dailyFlashcardSetsLimit;
  const used = getUsageCounters().flashcardSetsGeneratedToday;
  return { allowed: used < limit, used, limit };
}
