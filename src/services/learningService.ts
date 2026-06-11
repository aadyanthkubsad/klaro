/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * learningService — the single source of truth for the learning loop:
 *   Learn → Quiz → Result → Mistakes / Analytics / Progress → Tasks
 *
 * State is persisted to localStorage so it survives page reloads
 * (server state is in-memory and resets on restart). Views read
 * via the get*() functions and subscribe via onChange() to react
 * to updates from any other view.
 */

import {
  QuizAttempt,
  QuizAnswerRecord,
  MistakeEntry,
  MasteryEntry,
  MasteryStatus,
  DailyTask,
  LearningMode,
  ForgettingRisk,
  PlannerEvent,
  WrittenAnswerAttempt,
  CognitiveLevel,
} from '../types';
import { schedulePush } from './syncService';

const STORAGE_KEYS = {
  quizHistory: 'varkify:quizHistory',
  mistakeNotebook: 'varkify:mistakeNotebook',
  masteryMap: 'varkify:masteryMap',
  dailyTasks: 'varkify:dailyTasks',
  /** User-added exam/test dates for the monthly planner (PlannerEvent[]). */
  examDates: 'lumina:examDates',
  /** Written answer attempts — exam answer practice with typed or uploaded answers. */
  writtenAnswers: 'lumina:writtenAnswers',
};

const CHANGE_EVENT = 'varkify:learning-loop-change';

// ─── storage helpers ─────────────────────────────────────────────────────────

function read<T>(key: string, fallback: T): T {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    schedulePush(key);
  } catch {
    /* ignore quota errors */
  }
}

function uid(): string {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Resolve a raw answer string to a {letter, text} pair using the options array.
 * Handles three shapes coming from quiz engines:
 *   - just a letter:        "B"
 *   - "B) full text"        prefixed form
 *   - bare full text:       "Water cannot reach the leaves"
 */
export function resolveAnswerParts(
  raw: string,
  options: string[] = []
): { letter: string; text: string } {
  const r = (raw || '').trim();
  if (!r) return { letter: '', text: '' };

  // Pattern: "X) rest" or "X. rest" or "X rest" where X is A-D
  const prefixMatch = r.match(/^([A-D])[).\s]\s*(.+)$/);
  if (prefixMatch) {
    return { letter: prefixMatch[1], text: r };
  }

  // Single letter A-D
  if (/^[A-D]$/.test(r) && options.length) {
    const found = options.find((o) => {
      const t = o.trim();
      return t.startsWith(`${r})`) || t.startsWith(`${r}.`) || t.startsWith(`${r} `);
    });
    if (found) {
      const lm = found.trim().match(/^([A-D])/);
      return { letter: lm ? lm[1] : r, text: found };
    }
    return { letter: r, text: r };
  }

  // Bare full text — try to look up letter from options
  if (options.length) {
    const idx = options.findIndex((o) => {
      const t = o.trim();
      const stripped = t.replace(/^[A-D][).\s]\s*/, '');
      return t === r || stripped === r || t.includes(r) || (r.length > 3 && r.includes(stripped));
    });
    if (idx >= 0) {
      const found = options[idx];
      const lm = found.trim().match(/^([A-D])/);
      return { letter: lm ? lm[1] : String.fromCharCode(65 + idx), text: found };
    }
  }

  return { letter: '', text: r };
}

function todayISODate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO);
  d.setDate(d.getDate() + days);
  return todayISODate(d);
}

// ─── getters ─────────────────────────────────────────────────────────────────

export function getQuizHistory(): QuizAttempt[] {
  return read<QuizAttempt[]>(STORAGE_KEYS.quizHistory, []);
}

export function getMistakes(): MistakeEntry[] {
  return read<MistakeEntry[]>(STORAGE_KEYS.mistakeNotebook, []);
}

export function getMastery(): MasteryEntry[] {
  const raw = read<MasteryEntry[]>(STORAGE_KEYS.masteryMap, []);
  return raw.map((m) => {
    // Backfill stability and pLearned for old records
    const stability = m.stability || (m.masteryScore >= 75 ? 14 : m.masteryScore >= 55 ? 7 : STABILITY_INIT);
    const pL = m.pLearned ?? m.masteryScore / 100;

    // Apply Ebbinghaus decay to show *current* retention, not last-quiz score
    const daysSince = m.lastAttemptDate
      ? Math.max(0, (Date.now() - new Date(m.lastAttemptDate).getTime()) / 86_400_000)
      : 0;
    const decayedPL = ebbinghausDecay(pL, daysSince, stability);
    const decayedScore = Math.max(0, Math.min(100, Math.round(decayedPL * 100)));

    const risk = computeForgettingRisk(m.lastAttemptDate, decayedScore, stability);
    const status = statusFromScore(decayedScore, m.attempts, risk);

    return {
      ...m,
      masteryScore: decayedScore,
      pLearned: pL,
      stability,
      forgettingRisk: risk,
      status,
      // Recompute next revision from stability if not already done
      nextRevisionDate: m.stability
        ? m.nextRevisionDate
        : nextRevisionDateForStability(stability, m.lastAttemptDate || new Date().toISOString()),
    };
  });
}

export function getDailyTasks(): DailyTask[] {
  return read<DailyTask[]>(STORAGE_KEYS.dailyTasks, []);
}

export function getQuizAttempt(id: string): QuizAttempt | undefined {
  return getQuizHistory().find((a) => a.id === id);
}

/**
 * Remove duplicate quiz attempts, keeping the highest-scoring attempt per
 * (topic, calendar-day) pair. Returns the number of entries removed.
 */
export function deleteQuizAttempt(id: string): void {
  write(STORAGE_KEYS.quizHistory, getQuizHistory().filter(a => a.id !== id));
}

export function deduplicateQuizHistory(): number {
  const history = getQuizHistory();
  // Group by key; keep the attempt with the highest score in each group.
  const best = new Map<string, QuizAttempt>();
  for (const attempt of history) {
    const day = attempt.date ? attempt.date.slice(0, 10) : '';
    const key = `${attempt.topic.trim().toLowerCase()}::${day}`;
    const existing = best.get(key);
    if (!existing || attempt.percentage > existing.percentage) {
      best.set(key, attempt);
    }
  }
  const deduped = Array.from(best.values());
  const removed = history.length - deduped.length;
  if (removed > 0) write(STORAGE_KEYS.quizHistory, deduped);
  return removed;
}

// ─── change subscription ─────────────────────────────────────────────────────

export function onLearningChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(CHANGE_EVENT, handler);
  // also react to storage events from other tabs
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

// ─── Bayesian Knowledge Tracing (BKT) + Ebbinghaus Decay ────────────────────
//
// BKT foundation: Corbett & Anderson (1994), "Knowledge Tracing: Modeling the
// Acquisition of Procedural Knowledge."
//
// P(L) is the probability the student has learned the concept. Updated after
// each quiz response using Bayes' rule, then decayed over time using an
// Ebbinghaus-inspired half-life model (Settles & Meeder, 2016 — Duolingo's
// half-life regression).
//
// Future improvements:
//   - PFA (Pavlik, Cen & Koedinger 2009) — simpler alternative to BKT
//   - IRT 2PL for question-difficulty calibration (~500+ responses/question)
//   - SPARFA (Lan et al. 2014) for auto-tagging question difficulty
//   - DKT (Piech et al. 2015) for cross-skill dependency modeling

const BKT_PARAMS = {
  pInit: 0.1,     // P(L₀) — prior probability of knowing before any attempt
  pTransit: 0.15, // P(T)  — probability of transitioning unlearned → learned per opportunity
  pSlip: 0.1,     // P(S)  — probability of wrong answer despite knowing
  pGuess: 0.25,   // P(G)  — probability of correct guess without knowing (4-option MCQ)
};

/** Initial Ebbinghaus stability in days — half-life of memory. */
const STABILITY_INIT = 3;
/** Factor by which stability grows on each successful retrieval. */
const STABILITY_GROWTH = 1.5;
/** Maximum stability (days). Beyond this, the concept is considered permanent. */
const STABILITY_CAP = 90;

function bktUpdate(pL: number, isCorrect: boolean): number {
  const { pSlip, pGuess, pTransit } = BKT_PARAMS;
  const pCorrectGivenLearned = 1 - pSlip;
  const pCorrectGivenNotLearned = pGuess;

  const pCorrect = pL * pCorrectGivenLearned + (1 - pL) * pCorrectGivenNotLearned;

  let pLGivenObs: number;
  if (isCorrect) {
    pLGivenObs = (pL * pCorrectGivenLearned) / pCorrect;
  } else {
    pLGivenObs = (pL * pSlip) / (pL * pSlip + (1 - pL) * (1 - pGuess));
  }

  // Transition: even if not learned yet, each opportunity has a chance of learning
  return pLGivenObs + (1 - pLGivenObs) * pTransit;
}

/**
 * Ebbinghaus forgetting curve: P(L, t) = P(Lₙ) × e^(-t/S)
 * where t = days since last practice, S = stability (half-life in days).
 *
 * Reference: Settles & Meeder (2016), "A Trainable Spaced Repetition Model
 * for Language Learning" — open-sourced by Duolingo.
 */
function ebbinghausDecay(pL: number, daysSince: number, stability: number): number {
  if (daysSince <= 0 || stability <= 0) return pL;
  return pL * Math.exp(-daysSince / stability);
}

/**
 * Status thresholds — tightened per user requirements:
 *   - Weak:      <60% OR <2 attempts
 *   - Developing: 60–79% OR <3 attempts (maps to "Improving")
 *   - Strong:    ≥80% AND ≥3 attempts
 *   - Mastered:  ≥90% AND ≥5 attempts AND low forget risk
 */
function statusFromScore(score: number, attempts: number, forgettingRisk: ForgettingRisk): MasteryStatus {
  if (attempts === 0) return 'Not started';
  if (score >= 90 && attempts >= 5 && forgettingRisk === 'Low') return 'Mastered';
  if (score >= 80 && attempts >= 3) return 'Strong';
  if (score >= 60 && attempts >= 2) return 'Improving';
  return 'Weak';
}

/**
 * Forgetting risk derived from Ebbinghaus decay.
 * Uses the actual stability value when available, otherwise estimates from mastery.
 */
export function computeForgettingRisk(lastAttemptISO: string, masteryScore: number, stability?: number): ForgettingRisk {
  if (!lastAttemptISO) return 'High';
  const days = Math.max(0, (Date.now() - new Date(lastAttemptISO).getTime()) / 86_400_000);
  const S = stability || (masteryScore >= 75 ? 14 : masteryScore >= 55 ? 7 : STABILITY_INIT);
  const retained = Math.exp(-days / S);
  if (retained >= 0.7) return 'Low';
  if (retained >= 0.4) return 'Medium';
  return 'High';
}

function recomputeMastery(prev: MasteryEntry | undefined, attempt: QuizAttempt): MasteryEntry {
  const attempts = (prev?.attempts || 0) + 1;
  const mistakeCount = (prev?.mistakeCount || 0) + attempt.wrongCount;

  // Run BKT update for each answer in this attempt
  let pL = prev?.pLearned ?? (prev ? prev.masteryScore / 100 : BKT_PARAMS.pInit);
  for (const ans of attempt.answers) {
    pL = bktUpdate(pL, ans.isCorrect);
  }

  // Update stability: grows on successful retrieval (≥70% accuracy), resets partially on failure
  let stability = prev?.stability || STABILITY_INIT;
  if (attempt.percentage >= 70) {
    stability = Math.min(STABILITY_CAP, stability * STABILITY_GROWTH);
  } else if (attempt.percentage < 50) {
    // Poor performance — halve the stability (memory wasn't as strong as we thought)
    stability = Math.max(STABILITY_INIT, stability * 0.5);
  }
  // Otherwise (50-69%), stability stays the same

  // Apply Ebbinghaus decay for time since last practice
  const daysSinceLast = prev?.lastAttemptDate
    ? Math.max(0, (new Date(attempt.date).getTime() - new Date(prev.lastAttemptDate).getTime()) / 86_400_000)
    : 0;
  const decayed = ebbinghausDecay(pL, daysSinceLast, stability);

  const estimated = Math.max(0, Math.min(100, Math.round(decayed * 100)));
  const risk = computeForgettingRisk(attempt.date, estimated, stability);
  const status = statusFromScore(estimated, attempts, risk);

  return {
    topic: attempt.topic,
    masteryScore: estimated,
    pLearned: pL,
    stability,
    status,
    lastAttemptDate: attempt.date,
    nextRevisionDate: nextRevisionDateForStability(stability, attempt.date),
    mistakeCount,
    attempts,
    forgettingRisk: risk,
  };
}

// ─── Ebbinghaus revision scheduler ───────────────────────────────────────────

/**
 * Next revision date driven by stability (half-life).
 * Schedule revision at ~70% retention point: t = S × ln(1/0.7) ≈ S × 0.357
 * Clamped to [1, 30] days.
 */
function nextRevisionDateForStability(stability: number, dateISO: string): string {
  const daysUntilReview = Math.max(1, Math.min(30, Math.round(stability * 0.357)));
  return addDays(dateISO, daysUntilReview);
}

/**
 * Legacy fallback — used when stability isn't available (old mastery entries).
 */
export function nextRevisionDateFor(percentage: number, dateISO: string): string {
  if (percentage < 50) return addDays(dateISO, 1);
  if (percentage < 75) return addDays(dateISO, 3);
  return addDays(dateISO, 7);
}

interface PlanStep {
  offsetDays: number;
  actionType: 'revision' | 'retest';
  reason: string;
}

/**
 * Ebbinghaus-inspired spaced revision schedule.
 *
 * Canonical intervals: Day 1, Day 3, Day 7, Day 14, Day 30.
 * Research says ~50% is forgotten in 24h and ~90% in 30 days without
 * reinforcement — so the first interval is always within a week.
 *
 * Score adjusts the curve:
 *   - Low score  (<50%): compress early intervals (D1, D3, D7, D14)
 *   - Medium     (50–74%): standard set (D3, D7, D14, D30)
 *   - High score (≥75%):  stretch out — already strong recall (D7, D14, D30)
 */
function buildRevisionPlan(percentage: number): PlanStep[] {
  if (percentage < 50) {
    return [
      { offsetDays: 1,  actionType: 'revision', reason: 'Low score — revise tomorrow while it is fresh' },
      { offsetDays: 3,  actionType: 'revision', reason: 'Reinforce after 3 days (Ebbinghaus interval)' },
      { offsetDays: 7,  actionType: 'retest',   reason: 'Retest after a week to check recall' },
      { offsetDays: 14, actionType: 'revision', reason: 'Two-week review to lock in the concept' },
    ];
  }
  if (percentage < 75) {
    return [
      { offsetDays: 3,  actionType: 'revision', reason: 'Reinforce after 3 days (Ebbinghaus interval)' },
      { offsetDays: 7,  actionType: 'retest',   reason: 'Retest after a week to strengthen recall' },
      { offsetDays: 14, actionType: 'revision', reason: 'Two-week review for long-term retention' },
      { offsetDays: 30, actionType: 'revision', reason: 'Monthly review for mastery' },
    ];
  }
  return [
    { offsetDays: 7,  actionType: 'revision', reason: 'Light review after a week' },
    { offsetDays: 14, actionType: 'retest',   reason: 'Two-week mastery check' },
    { offsetDays: 30, actionType: 'revision', reason: 'Monthly review to keep it locked in' },
  ];
}

/**
 * Bucket a "next revision date" into a UI status — drives pills and sorting
 * in Analytics, Progress, and Tasks views.
 */
export type RevisionStatus = 'overdue' | 'due-today' | 'upcoming' | 'far';

export function getRevisionStatus(nextDateISO: string): RevisionStatus {
  if (!nextDateISO) return 'far';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(nextDateISO); due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'due-today';
  if (diffDays <= 7) return 'upcoming';
  return 'far';
}

// ─── task generation ─────────────────────────────────────────────────────────

function tasksFromAttempt(attempt: QuizAttempt, sourceKitId?: string): DailyTask[] {
  const tasks: DailyTask[] = [];
  const weak = attempt.weakTopics.slice(0, 3); // cap to avoid task spam
  const baseFields = {
    sourceQuizId: attempt.id,
    sourceKitId,
    modeUsed: attempt.modeUsed,
    status: 'pending' as const,
    chapter: attempt.chapterTitle || attempt.topic,
    subject: attempt.subject,
  };

  // Day-0 free tasks — every student gets these (mistake review + targeted retests).
  // These are NOT plan-gated; they're the core retrieval-practice loop.
  if (attempt.wrongCount > 0) {
    tasks.push({
      id: uid(),
      title: `Review ${attempt.topic} mistakes`,
      topic: attempt.topic,
      reason: 'Fix what you got wrong while it is fresh',
      dueDate: addDays(attempt.date, 0),
      estimatedMinutes: 10,
      actionType: 'mistake-review',
      planRequired: 'free',
      ...baseFields,
    });

    weak.slice(0, 2).forEach((tag) => {
      tasks.push({
        id: uid(),
        title: `Retest weak topic: ${tag}`,
        topic: attempt.topic,
        reason: `You missed questions on ${tag} — practice 5 focused Qs`,
        dueDate: addDays(attempt.date, 0),
        estimatedMinutes: 8,
        actionType: 'retest',
        planRequired: 'free',
        ...baseFields,
      });
    });
  }

  // Spaced revision plan — Ebbinghaus D1/D3/D7/D14/D30. Day 1 is free; Day 3 onwards
  // is a Plus feature ("daily spaced revision tasks" per the plan matrix).
  const plan = buildRevisionPlan(attempt.percentage);
  plan.forEach((step) => {
    const labelDays =
      step.offsetDays === 1  ? 'tomorrow' :
      step.offsetDays === 3  ? 'after 3 days' :
      step.offsetDays === 7  ? 'after a week' :
      step.offsetDays === 14 ? 'after 2 weeks' :
      step.offsetDays === 30 ? 'after a month' :
      `after ${step.offsetDays} days`;
    tasks.push({
      id: uid(),
      title:
        step.actionType === 'retest'
          ? `Retest ${attempt.topic} (${labelDays})`
          : `Revise ${attempt.topic} (${labelDays})`,
      topic: attempt.topic,
      reason: step.reason,
      dueDate: addDays(attempt.date, step.offsetDays),
      estimatedMinutes: step.actionType === 'retest' ? 12 : 15,
      actionType: step.actionType,
      planRequired: step.offsetDays <= 1 ? 'free' : 'plus',
      ...baseFields,
    });
  });

  return tasks;
}

// ─── core: record a completed quiz ───────────────────────────────────────────

export interface RecordQuizInput {
  topic: string;
  chapterId?: string;
  chapterTitle?: string;
  subject?: string;
  modeUsed: LearningMode;
  answers: QuizAnswerRecord[];
  sourceKitId?: string;
}

export function recordCompletedQuiz(input: RecordQuizInput): QuizAttempt {
  const dateISO = new Date().toISOString();
  const correctCount = input.answers.filter((a) => a.isCorrect).length;
  const wrongCount = input.answers.length - correctCount;
  const percentage = input.answers.length
    ? Math.round((correctCount / input.answers.length) * 100)
    : 0;

  // Normalise every answer so the display layer always has both
  // option-letter and full-text for selected & correct.
  const normalisedAnswers: QuizAnswerRecord[] = input.answers.map((a) => {
    const opts = a.options || [];
    const sel = resolveAnswerParts(a.selectedAnswer, opts);
    const cor = resolveAnswerParts(a.correctAnswer, opts);
    return {
      ...a,
      options: opts,
      selectedOptionLetter: a.selectedOptionLetter ?? sel.letter,
      selectedAnswerText:   a.selectedAnswerText   ?? sel.text,
      correctOptionLetter:  a.correctOptionLetter  ?? cor.letter,
      correctAnswerText:    a.correctAnswerText    ?? cor.text,
      cognitiveLevel: a.cognitiveLevel || inferCognitiveLevel((a as any).difficulty),
    };
  });

  // weak topics = topicTags where the user got it wrong at least once
  const weakTopicSet = new Set<string>();
  normalisedAnswers.forEach((a) => {
    if (!a.isCorrect && a.topicTag) weakTopicSet.add(a.topicTag);
  });
  const weakTopics = Array.from(weakTopicSet);

  const attempt: QuizAttempt = {
    id: uid(),
    topic: input.topic || 'Untitled Topic',
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle || input.topic,
    subject: input.subject,
    modeUsed: input.modeUsed,
    date: dateISO,
    score: correctCount,
    totalQuestions: input.answers.length,
    percentage,
    correctCount,
    wrongCount,
    weakTopics,
    answers: normalisedAnswers,
  };

  // 1. quizHistory
  const history = getQuizHistory();
  write(STORAGE_KEYS.quizHistory, [attempt, ...history]);

  // 2. mistakeNotebook — store normalised display fields too
  const newMistakes: MistakeEntry[] = normalisedAnswers
    .filter((a) => !a.isCorrect)
    .map((a) => ({
      id: uid(),
      quizId: attempt.id,
      topic: attempt.topic,
      question: a.question,
      selectedAnswer: a.selectedAnswerText || a.selectedAnswer,
      correctAnswer: a.correctAnswerText || a.correctAnswer,
      explanation: a.explanation,
      topicTag: a.topicTag || attempt.topic,
      date: dateISO,
      modeUsed: input.modeUsed,
    }));
  if (newMistakes.length) {
    write(STORAGE_KEYS.mistakeNotebook, [...newMistakes, ...getMistakes()]);
  }

  // 3. masteryMap
  const mastery = getMastery();
  const prior = mastery.find((m) => m.topic === attempt.topic);
  const updated = recomputeMastery(prior, attempt);
  const nextMastery = prior
    ? mastery.map((m) => (m.topic === attempt.topic ? updated : m))
    : [...mastery, updated];
  write(STORAGE_KEYS.masteryMap, nextMastery);

  // 4. dailyTasks — append, but de-duplicate by (topic, title, dueDate)
  const existingTasks = getDailyTasks();
  const generated = tasksFromAttempt(attempt, input.sourceKitId);
  const taskKey = (t: DailyTask) => `${t.topic}::${t.title}::${t.dueDate}`;
  const seen = new Set(existingTasks.map(taskKey));
  const fresh = generated.filter((t) => !seen.has(taskKey(t)));
  write(STORAGE_KEYS.dailyTasks, [...existingTasks, ...fresh]);

  return attempt;
}

// ─── task actions ────────────────────────────────────────────────────────────

export function setTaskStatus(id: string, status: 'pending' | 'completed') {
  const tasks = getDailyTasks().map((t) =>
    t.id === id
      ? { ...t, status, ...(status === 'completed' ? { completedDate: new Date().toISOString() } : {}) }
      : t
  );
  write(STORAGE_KEYS.dailyTasks, tasks);
}

// ─── task stats & grouping helpers ──────────────────────────────────────────

export interface TaskStats {
  todayCount: number;
  upcomingCount: number;
  completedCount: number;
  overdueCount: number;
}

export function getTaskStats(): TaskStats {
  const tasks = getDailyTasks();
  const today = new Date().toISOString().slice(0, 10);
  let todayCount = 0, upcomingCount = 0, completedCount = 0, overdueCount = 0;
  for (const t of tasks) {
    if (t.status === 'completed') { completedCount++; continue; }
    const due = t.dueDate.slice(0, 10);
    if (due < today) overdueCount++;
    else if (due === today) todayCount++;
    else upcomingCount++;
  }
  return { todayCount: todayCount + overdueCount, upcomingCount, completedCount, overdueCount };
}

export function getTasksByChapter(tasks: DailyTask[]): Map<string, DailyTask[]> {
  const groups = new Map<string, DailyTask[]>();
  for (const t of tasks) {
    const key = t.chapter || t.topic;
    const arr = groups.get(key) || [];
    arr.push(t);
    groups.set(key, arr);
  }
  return groups;
}

export function deleteTask(id: string) {
  write(
    STORAGE_KEYS.dailyTasks,
    getDailyTasks().filter((t) => t.id !== id)
  );
}

// ─── score analysis derived view ─────────────────────────────────────────────

export interface ScoreAnalysis {
  latestScore: number;
  averageScore: number;
  bestScore: number;
  totalAttempts: number;
  topicScores: { topic: string; avg: number; attempts: number }[];
  weakTopics: { topic: string; avg: number }[];
  strongTopics: { topic: string; avg: number }[];
  recentHistory: QuizAttempt[];
  masteryPercentage: number;
  suggestedAction: string;
}

export function computeScoreAnalysis(): ScoreAnalysis | null {
  const history = getQuizHistory();
  if (history.length === 0) return null;

  const sorted = [...history].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const latestScore = sorted[0].percentage;
  const averageScore = Math.round(
    history.reduce((s, h) => s + h.percentage, 0) / history.length
  );
  const bestScore = history.reduce((m, h) => Math.max(m, h.percentage), 0);

  const byTopic: Record<string, { sum: number; count: number }> = {};
  history.forEach((h) => {
    if (!byTopic[h.topic]) byTopic[h.topic] = { sum: 0, count: 0 };
    byTopic[h.topic].sum += h.percentage;
    byTopic[h.topic].count += 1;
  });
  const topicScores = Object.entries(byTopic).map(([topic, v]) => ({
    topic,
    avg: Math.round(v.sum / v.count),
    attempts: v.count,
  }));

  const weakTopics = topicScores.filter((t) => t.avg < 60).sort((a, b) => a.avg - b.avg);
  const strongTopics = topicScores.filter((t) => t.avg >= 75).sort((a, b) => b.avg - a.avg);

  const mastery = getMastery();
  const masteryPercentage = mastery.length
    ? Math.round(mastery.reduce((s, m) => s + m.masteryScore, 0) / mastery.length)
    : averageScore;

  let suggestedAction: string;
  if (weakTopics.length > 0) {
    suggestedAction = `Focus on "${weakTopics[0].topic}" — your weakest topic. Retest after revision.`;
  } else if (averageScore >= 85) {
    suggestedAction = `Great work! Try a harder mock test or revisit older topics for retention.`;
  } else {
    suggestedAction = `Keep practicing. Take another quiz to push your average over 85%.`;
  }

  return {
    latestScore,
    averageScore,
    bestScore,
    totalAttempts: history.length,
    topicScores,
    weakTopics,
    strongTopics,
    recentHistory: sorted.slice(0, 5),
    masteryPercentage,
    suggestedAction,
  };
}

// ─── monthly planner: derived events ─────────────────────────────────────────
// Pulls together everything the Monthly Planner needs to draw the calendar:
//   • revision/retest events from dailyTasks (Ebbinghaus-derived)
//   • forgetting-curve revisions from masteryMap.nextRevisionDate
//   • user-added exam/test/deadline events from lumina:examDates
//
// All events follow the PlannerEvent shape so the calendar layer doesn't
// have to know where the data came from.

export function getExamDates(): PlannerEvent[] {
  return read<PlannerEvent[]>(STORAGE_KEYS.examDates, []);
}

export function addExamDate(ev: Omit<PlannerEvent, 'id' | 'source'>): PlannerEvent {
  const full: PlannerEvent = { ...ev, id: uid(), source: 'manual' };
  write(STORAGE_KEYS.examDates, [...getExamDates(), full]);
  return full;
}

export function deleteExamDate(id: string): void {
  write(STORAGE_KEYS.examDates, getExamDates().filter(e => e.id !== id));
}

/**
 * Derive the full PlannerEvent list for the calendar from real app state.
 *
 * Sources:
 *   - dailyTasks (revision / retest / mistake-review) → revision events
 *   - masteryMap.nextRevisionDate → forgetting-curve revision events
 *   - lumina:examDates → manual test/deadline events
 *
 * Returns an empty array if nothing has been recorded yet — the Planner
 * view then shows a clean empty state instead of fake data.
 */
export function getPlannerEvents(): PlannerEvent[] {
  const events: PlannerEvent[] = [];

  // 1. Daily tasks (already scheduled via Ebbinghaus in tasksFromAttempt)
  getDailyTasks().forEach(t => {
    const date = t.dueDate.slice(0, 10);
    events.push({
      id: `task-${t.id}`,
      title: t.title,
      subject: t.chapter || t.topic,
      topic: t.topic,
      date,
      type: 'revision', // retests / mistake-reviews are still "revision" on the calendar
      source: 'task',
      sourceQuizId: t.sourceQuizId,
      sourceKitId: t.sourceKitId,
    });
  });

  // 2. Mastery — single "next revision" per topic from the forgetting curve.
  //    Only add it if no daily task already covers that day for the topic.
  const taskKeys = new Set(events.map(e => `${e.topic}::${e.date}`));
  getMastery().forEach(m => {
    if (!m.nextRevisionDate) return;
    const date = m.nextRevisionDate.slice(0, 10);
    const key = `${m.topic}::${date}`;
    if (taskKeys.has(key)) return;
    events.push({
      id: `mastery-${m.topic}-${date}`,
      title: `Revise ${m.topic}`,
      subject: m.topic,
      topic: m.topic,
      date,
      type: 'revision',
      source: 'forgetting-curve',
    });
  });

  // 3. Manual exam/test/deadline events
  getExamDates().forEach(e => events.push({ ...e, date: e.date.slice(0, 10) }));

  return events;
}

// ─── written answer attempts ────────────────────────────────────────────────

export function getWrittenAnswers(): WrittenAnswerAttempt[] {
  return read<WrittenAnswerAttempt[]>(STORAGE_KEYS.writtenAnswers, []);
}

export function recordWrittenAnswer(attempt: Omit<WrittenAnswerAttempt, 'id' | 'date'>): WrittenAnswerAttempt {
  const full: WrittenAnswerAttempt = {
    ...attempt,
    id: uid(),
    date: new Date().toISOString(),
  };
  write(STORAGE_KEYS.writtenAnswers, [full, ...getWrittenAnswers()]);
  return full;
}

export function deleteWrittenAnswer(id: string): void {
  write(STORAGE_KEYS.writtenAnswers, getWrittenAnswers().filter(a => a.id !== id));
}

export interface WrittenAnswerAnalytics {
  totalAttempts: number;
  averageScore: number;
  commonMissingKeywords: { keyword: string; count: number }[];
  scoreOverTime: { date: string; score: number }[];
}

export function computeWrittenAnswerAnalytics(): WrittenAnswerAnalytics {
  const attempts = getWrittenAnswers();
  if (attempts.length === 0) {
    return { totalAttempts: 0, averageScore: 0, commonMissingKeywords: [], scoreOverTime: [] };
  }

  const totalAttempts = attempts.length;
  const averageScore = Math.round(
    attempts.reduce((s, a) => s + (a.marksScored / a.totalMarks) * 100, 0) / totalAttempts
  );

  const kwCount = new Map<string, number>();
  attempts.forEach(a => {
    a.missingKeywords.forEach(kw => {
      const k = kw.toLowerCase();
      kwCount.set(k, (kwCount.get(k) ?? 0) + 1);
    });
  });
  const commonMissingKeywords = Array.from(kwCount.entries())
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const scoreOverTime = [...attempts]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(a => ({
      date: a.date.slice(0, 10),
      score: Math.round((a.marksScored / a.totalMarks) * 100),
    }));

  return { totalAttempts, averageScore, commonMissingKeywords, scoreOverTime };
}

// ─── cognitive level analytics ──────────────────────────────────────────────

export function inferCognitiveLevel(difficulty?: string): CognitiveLevel {
  if (difficulty === 'easy') return 'recall';
  if (difficulty === 'hard') return 'analyze';
  return 'understand';
}

export interface CognitiveBreakdown {
  recall:     { total: number; correct: number; accuracy: number };
  understand: { total: number; correct: number; accuracy: number };
  apply:      { total: number; correct: number; accuracy: number };
  analyze:    { total: number; correct: number; accuracy: number };
}

export function computeCognitiveBreakdown(topicFilter?: string): CognitiveBreakdown {
  const history = getQuizHistory();
  const filtered = topicFilter
    ? history.filter(q => q.topic === topicFilter)
    : history;

  const breakdown: CognitiveBreakdown = {
    recall:     { total: 0, correct: 0, accuracy: 0 },
    understand: { total: 0, correct: 0, accuracy: 0 },
    apply:      { total: 0, correct: 0, accuracy: 0 },
    analyze:    { total: 0, correct: 0, accuracy: 0 },
  };

  for (const attempt of filtered) {
    for (const ans of attempt.answers) {
      const level = ans.cognitiveLevel || inferCognitiveLevel(
        (ans as any).difficulty || (attempt.answers.indexOf(ans) < attempt.answers.length * 0.3 ? 'easy' : attempt.answers.indexOf(ans) > attempt.answers.length * 0.8 ? 'hard' : 'medium')
      );
      breakdown[level].total++;
      if (ans.isCorrect) breakdown[level].correct++;
    }
  }

  for (const level of Object.keys(breakdown) as CognitiveLevel[]) {
    const b = breakdown[level];
    b.accuracy = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0;
  }

  return breakdown;
}

// ─── retrieval practice stats ───────────────────────────────────────────────

export interface RetrievalStats {
  totalAttempts: number;
  totalQuestions: number;
  averageAccuracy: number;
  streakDays: number;
  lastPracticeDate: string | null;
  topicsCovered: number;
  improvingTopics: string[];
  decliningTopics: string[];
}

export function computeRetrievalStats(): RetrievalStats {
  const history = getQuizHistory();
  if (history.length === 0) {
    return { totalAttempts: 0, totalQuestions: 0, averageAccuracy: 0, streakDays: 0, lastPracticeDate: null, topicsCovered: 0, improvingTopics: [], decliningTopics: [] };
  }

  const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const totalQuestions = history.reduce((s, q) => s + q.totalQuestions, 0);
  const totalCorrect = history.reduce((s, q) => s + q.correctCount, 0);
  const topics = new Set(history.map(q => q.topic));

  // Calculate streak
  let streakDays = 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const uniqueDays = [...new Set(sorted.map(q => q.date.slice(0, 10)))].sort().reverse();
  for (let i = 0; i < uniqueDays.length; i++) {
    const d = new Date(uniqueDays[i]); d.setHours(0, 0, 0, 0);
    const expectedDate = new Date(today); expectedDate.setDate(today.getDate() - i);
    if (d.getTime() === expectedDate.getTime()) {
      streakDays++;
    } else {
      break;
    }
  }

  // Improving vs declining: compare last 2 attempts per topic
  const improvingTopics: string[] = [];
  const decliningTopics: string[] = [];
  for (const topic of topics) {
    const topicAttempts = sorted.filter(q => q.topic === topic);
    if (topicAttempts.length >= 2) {
      const recent = topicAttempts[0].percentage;
      const prior = topicAttempts[1].percentage;
      if (recent > prior + 5) improvingTopics.push(topic);
      else if (recent < prior - 5) decliningTopics.push(topic);
    }
  }

  return {
    totalAttempts: history.length,
    totalQuestions,
    averageAccuracy: Math.round((totalCorrect / totalQuestions) * 100),
    streakDays,
    lastPracticeDate: sorted[0]?.date || null,
    topicsCovered: topics.size,
    improvingTopics,
    decliningTopics,
  };
}

// ─── reset (for tests/debug) ─────────────────────────────────────────────────

export function resetLearningData() {
  Object.values(STORAGE_KEYS).forEach((k) => {
    try { window.localStorage.removeItem(k); } catch {}
  });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}
