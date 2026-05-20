/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * billingService — MVP plan + usage gating, persisted to localStorage.
 * No real payment gateway. Razorpay/Stripe integration is intentionally
 * deferred. Plan changes happen via in-app toggles (Settings or the
 * Upgrade modal's "DEV: Unlock for testing" affordance).
 */

import { PlanType, PlanLimits } from '../types';

const KEYS = {
  plan: 'klaro:plan',
  legacyPremium: 'varkify:isPremium', // migration from earlier state
  kitsToday: 'klaro:kitsToday',       // single-entry { date, count }
};

const CHANGE_EVENT = 'klaro:billing-change';

/**
 * DEV-only flag. While true, the app forces every user into "pro" so the
 * full Exam Pro feature surface (Monthly Planner, mastery analytics, etc.)
 * is available without payment integration.
 *
 * To disable demo access:
 *   1. set DEV_FORCE_PRO to false
 *   2. clear localStorage key "klaro:plan" (or use Settings → plan switcher)
 */
export const DEV_FORCE_PRO = true;

// ─── plan persistence ────────────────────────────────────────────────────────

export function getPlan(): PlanType {
  // Dev override: while DEV_FORCE_PRO is on, everyone is on Pro.
  // Toggle the constant in this file to turn off demo access.
  if (DEV_FORCE_PRO) {
    try { window.localStorage.setItem(KEYS.plan, 'pro'); } catch { /* ignore */ }
    return 'pro';
  }
  try {
    const v = window.localStorage.getItem(KEYS.plan);
    if (v === 'free' || v === 'plus' || v === 'pro') return v;
    // Migrate from old varkify:isPremium boolean flag
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

// ─── plan limits table ───────────────────────────────────────────────────────

export function getLimitsFor(plan: PlanType): PlanLimits {
  switch (plan) {
    case 'pro':
      return {
        dailyKitsLimit: Infinity,
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
      };
    case 'plus':
      return {
        dailyKitsLimit: 20,
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
      };
    case 'free':
    default:
      return {
        dailyKitsLimit: 3,
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
      };
  }
}

// ─── daily kit counter ───────────────────────────────────────────────────────

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getKitsUsedToday(): number {
  try {
    const raw = window.localStorage.getItem(KEYS.kitsToday);
    if (!raw) return 0;
    const { date, count } = JSON.parse(raw) as { date: string; count: number };
    if (date !== todayISODate()) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

export function incrementKitsUsedToday(): void {
  try {
    const used = getKitsUsedToday();
    window.localStorage.setItem(
      KEYS.kitsToday,
      JSON.stringify({ date: todayISODate(), count: used + 1 })
    );
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch { /* ignore */ }
}

/** Returns true if user is below today's plan limit. */
export function canGenerateKitToday(plan: PlanType): { allowed: boolean; used: number; limit: number } {
  const limit = getLimitsFor(plan).dailyKitsLimit;
  const used = getKitsUsedToday();
  return { allowed: used < limit, used, limit };
}
