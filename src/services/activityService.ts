/**
 * activityService — shared learning activity logger.
 *
 * Every meaningful user action (kit generation, quiz completion, mistake review,
 * flashcard use, etc.) creates an activity event. These events drive:
 *   - The Learning Activity chart on the Progress page
 *   - Streak calculation (consecutive active days)
 *   - XP accumulation
 *   - Weekly reports
 *
 * State is persisted to localStorage and emits a custom event so listening
 * components (ProgressView etc.) refresh automatically.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ActivityType =
  | 'revision-kit'
  | 'quiz'
  | 'mistake-review'
  | 'flashcards'
  | 'daily-task'
  | 'pdf-download'
  | 'library-save'
  | 'resume-learning'
  | 'written-answer'
  | 'weak-topic-retest'
  | 'note-view';

export interface LearningActivity {
  id: string;
  type: ActivityType;
  chapterId?: string;
  chapterTitle?: string;
  subject?: string;
  classLevel?: string;
  stream?: 'Science' | 'Commerce';
  xpEarned: number;
  /** ISO date string */
  createdAt: string;
  /** Optional metadata (quiz score, kit title, etc.) */
  meta?: Record<string, any>;
}

export interface StreakInfo {
  current: number;
  longest: number;
  lastActiveDate: string;
  isActiveToday: boolean;
}

export interface DayActivity {
  /** YYYY-MM-DD */
  date: string;
  /** Short label: Mon, Tue, etc. */
  dayLabel: string;
  count: number;
  xp: number;
  types: ActivityType[];
}

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  totalActions: number;
  quizzesCompleted: number;
  averageQuizScore: number;
  xpGained: number;
  mistakesReviewed: number;
  strongestChapter: string | null;
  weakestChapter: string | null;
  recommendations: string[];
  breakdownByType: Record<string, number>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

import { schedulePush } from './syncService';

const STORAGE_KEY = 'lumina:activityLog';
const STREAK_KEY = 'lumina:streak';
const CHANGE_EVENT = 'lumina:activity-change';

/** XP awarded per activity type (defaults) */
const XP_DEFAULTS: Record<ActivityType, number> = {
  'revision-kit': 20,
  'quiz': 30,
  'mistake-review': 10,
  'flashcards': 15,
  'daily-task': 10,
  'pdf-download': 5,
  'library-save': 5,
  'resume-learning': 5,
  'written-answer': 25,
  'weak-topic-retest': 30,
  'note-view': 3,
};

// ─── Storage helpers ────────────────────────────────────────────────────────

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    schedulePush(key);
  } catch {
    /* ignore quota errors */
  }
}

function genId(): string {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Core API ───────────────────────────────────────────────────────────────

/** Log a new learning activity. Returns the created activity. */
export function logActivity(params: Omit<LearningActivity, 'id' | 'createdAt'> & { createdAt?: string }): LearningActivity {
  const activity: LearningActivity = {
    id: genId(),
    type: params.type,
    chapterId: params.chapterId,
    chapterTitle: params.chapterTitle,
    subject: params.subject,
    classLevel: params.classLevel,
    stream: params.stream,
    xpEarned: params.xpEarned || XP_DEFAULTS[params.type] || 10,
    createdAt: params.createdAt || new Date().toISOString(),
    meta: params.meta,
  };

  const log = readStorage<LearningActivity[]>(STORAGE_KEY, []);
  log.push(activity);
  writeStorage(STORAGE_KEY, log);

  // Update streak
  updateStreak();

  return activity;
}

/** Get all activities, newest first. */
export function getActivities(): LearningActivity[] {
  return readStorage<LearningActivity[]>(STORAGE_KEY, []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Return the most recently studied chapter info from the activity log.
 * Looks for revision-kit, quiz, note-view, or written-answer activities
 * that have a chapterTitle set.  Returns null if nothing found.
 */
export function getLastStudiedChapter(): { chapterTitle: string; subject?: string; classLevel?: string } | null {
  const all = getActivities(); // already newest-first
  for (const a of all) {
    if (a.chapterTitle) {
      return { chapterTitle: a.chapterTitle, subject: a.subject, classLevel: a.classLevel };
    }
  }
  return null;
}

/** Get activities within the last N days (inclusive of today). */
export function getActivitiesForDays(days: number): DayActivity[] {
  const all = readStorage<LearningActivity[]>(STORAGE_KEY, []);
  const now = new Date();
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const result: DayActivity[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = toDateStr(d);
    const dayActivities = all.filter(a => a.createdAt.startsWith(dateStr));

    result.push({
      date: dateStr,
      dayLabel: dayLabels[d.getDay()],
      count: dayActivities.length,
      xp: dayActivities.reduce((sum, a) => sum + a.xpEarned, 0),
      types: [...new Set(dayActivities.map(a => a.type))],
    });
  }
  return result;
}

/** Get total XP from all activities. */
export function getTotalXP(): number {
  const all = readStorage<LearningActivity[]>(STORAGE_KEY, []);
  return all.reduce((sum, a) => sum + a.xpEarned, 0);
}

/** Get activity count grouped by type. */
export function getActivityCounts(): Record<ActivityType, number> {
  const all = readStorage<LearningActivity[]>(STORAGE_KEY, []);
  const counts = {} as Record<ActivityType, number>;
  for (const a of all) {
    counts[a.type] = (counts[a.type] || 0) + 1;
  }
  return counts;
}

// ─── Streak ─────────────────────────────────────────────────────────────────

function updateStreak(): void {
  const all = readStorage<LearningActivity[]>(STORAGE_KEY, []);
  const today = toDateStr(new Date());

  // Collect all unique active dates
  const activeDates = new Set<string>();
  for (const a of all) {
    activeDates.add(a.createdAt.slice(0, 10));
  }

  // Walk backwards from today to calculate current streak
  let current = 0;
  const d = new Date();
  while (true) {
    const ds = toDateStr(d);
    if (activeDates.has(ds)) {
      current++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  // Calculate longest streak
  const sortedDates = [...activeDates].sort();
  let longest = 0;
  let run = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]);
    const curr = new Date(sortedDates[i]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      run++;
    } else {
      longest = Math.max(longest, run);
      run = 1;
    }
  }
  longest = Math.max(longest, run);
  if (sortedDates.length === 0) longest = 0;

  const streak: StreakInfo = {
    current,
    longest,
    lastActiveDate: today,
    isActiveToday: activeDates.has(today),
  };
  writeStorage(STREAK_KEY, streak);
}

/** Get current streak info (read-only — does NOT dispatch change events). */
export function getStreak(): StreakInfo {
  const all = readStorage<LearningActivity[]>(STORAGE_KEY, []);
  const today = toDateStr(new Date());

  const activeDates = new Set<string>();
  for (const a of all) activeDates.add(a.createdAt.slice(0, 10));

  let current = 0;
  const d = new Date();
  while (true) {
    const ds = toDateStr(d);
    if (activeDates.has(ds)) { current++; d.setDate(d.getDate() - 1); } else break;
  }

  const sortedDates = [...activeDates].sort();
  let longest = 0, run = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]);
    const curr = new Date(sortedDates[i]);
    if (Math.round((curr.getTime() - prev.getTime()) / 86_400_000) === 1) run++;
    else { longest = Math.max(longest, run); run = 1; }
  }
  longest = Math.max(longest, run);
  if (sortedDates.length === 0) longest = 0;

  return { current, longest, lastActiveDate: today, isActiveToday: activeDates.has(today) };
}

// ─── Weekly Report ──────────────────────────────────────────────────────────

/** Generate a weekly learning report from the last 7 days of activity. */
export function generateWeeklyReport(): WeeklyReport {
  const days = getActivitiesForDays(7);
  const allWeek = readStorage<LearningActivity[]>(STORAGE_KEY, []).filter(a => {
    const d = new Date(a.createdAt);
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  });

  const totalActions = allWeek.length;
  const quizzes = allWeek.filter(a => a.type === 'quiz');
  const quizzesCompleted = quizzes.length;
  const quizScores = quizzes
    .map(a => a.meta?.percentage)
    .filter((s): s is number => typeof s === 'number');
  const averageQuizScore = quizScores.length > 0
    ? Math.round(quizScores.reduce((s, x) => s + x, 0) / quizScores.length)
    : 0;
  const xpGained = allWeek.reduce((s, a) => s + a.xpEarned, 0);
  const mistakesReviewed = allWeek.filter(a => a.type === 'mistake-review').length;

  // Chapter analysis
  const chapterScores: Record<string, number[]> = {};
  for (const a of quizzes) {
    const ch = a.chapterTitle || a.subject || 'Unknown';
    if (!chapterScores[ch]) chapterScores[ch] = [];
    if (typeof a.meta?.percentage === 'number') chapterScores[ch].push(a.meta.percentage);
  }
  let strongestChapter: string | null = null;
  let weakestChapter: string | null = null;
  let bestAvg = -1;
  let worstAvg = 101;
  for (const [ch, scores] of Object.entries(chapterScores)) {
    const avg = scores.reduce((s, x) => s + x, 0) / scores.length;
    if (avg > bestAvg) { bestAvg = avg; strongestChapter = ch; }
    if (avg < worstAvg) { worstAvg = avg; weakestChapter = ch; }
  }

  // Breakdown by type
  const breakdownByType: Record<string, number> = {};
  for (const a of allWeek) {
    breakdownByType[a.type] = (breakdownByType[a.type] || 0) + 1;
  }

  // Recommendations
  const recommendations: string[] = [];
  if (quizzesCompleted === 0) recommendations.push('Take at least one quiz this week to track your learning.');
  if (mistakesReviewed === 0 && totalActions > 0) recommendations.push('Review your mistakes notebook to reinforce weak areas.');
  if (weakestChapter) recommendations.push(`Focus on "${weakestChapter}" — it needs the most improvement.`);
  if (totalActions < 5) recommendations.push('Try to complete at least 5 learning actions per week for consistent progress.');
  if (averageQuizScore > 0 && averageQuizScore < 60) recommendations.push('Your average score is below 60%. Consider revising before taking more quizzes.');
  if (recommendations.length === 0) recommendations.push('Great week! Keep up the consistent study routine.');

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  return {
    weekStart: toDateStr(weekAgo),
    weekEnd: toDateStr(now),
    totalActions,
    quizzesCompleted,
    averageQuizScore,
    xpGained,
    mistakesReviewed,
    strongestChapter,
    weakestChapter,
    recommendations,
    breakdownByType,
  };
}

// ─── Subscription ───────────────────────────────────────────────────────────

/** Subscribe to activity changes. Returns an unsubscribe function. */
export function onActivityChange(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}
