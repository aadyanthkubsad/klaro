/**
 * syncService — background sync between localStorage and server.
 *
 * On login: pulls server data → merges into localStorage (server wins on conflicts).
 * On data writes: debounced push of changed data to server.
 * Guest users: no-op (data stays in localStorage only).
 */

const SYNC_DEBOUNCE_MS = 2000;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingKeys: Set<string> = new Set();

function getToken(): string | null {
  try { return localStorage.getItem('lumina:auth-token'); } catch { return null; }
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

export async function pullFromServer(): Promise<void> {
  const token = getToken();
  if (!token) return;

  try {
    const res = await authFetch('/api/sync/pull');
    const data = await res.json();
    if (!data.success) return;

    const d = data.data;

    if (d.quizHistory?.length) {
      const local = readLocal('varkify:quizHistory', []);
      const merged = mergeById(local, d.quizHistory.map(mapQuizFromServer));
      writeLocal('varkify:quizHistory', merged);
    }

    if (d.mistakes?.length) {
      const local = readLocal('varkify:mistakeNotebook', []);
      const merged = mergeById(local, d.mistakes.map(mapMistakeFromServer));
      writeLocal('varkify:mistakeNotebook', merged);
    }

    if (d.mastery?.length) {
      const local = readLocal('varkify:masteryMap', []);
      const serverMapped = d.mastery.map(mapMasteryFromServer);
      const merged = mergeByField(local, serverMapped, 'topic');
      writeLocal('varkify:masteryMap', merged);
    }

    if (d.dailyTasks?.length) {
      const local = readLocal('varkify:dailyTasks', []);
      const merged = mergeById(local, d.dailyTasks.map(mapTaskFromServer));
      writeLocal('varkify:dailyTasks', merged);
    }

    if (d.activityLog?.length) {
      const local = readLocal('lumina:activityLog', []);
      const merged = mergeById(local, d.activityLog.map(mapActivityFromServer));
      writeLocal('lumina:activityLog', merged);
    }

    if (d.streak) {
      writeLocal('lumina:streak', {
        current: d.streak.current_streak,
        longest: d.streak.longest_streak,
        lastActiveDate: d.streak.last_active_date,
        isActiveToday: !!d.streak.is_active_today,
      });
    }

    if (d.plannerEvents?.length) {
      const local = readLocal('lumina:examDates', []);
      const merged = mergeById(local, d.plannerEvents.map(mapPlannerFromServer));
      writeLocal('lumina:examDates', merged);
    }

    if (d.writtenAnswers?.length) {
      const local = readLocal('lumina:writtenAnswers', []);
      const merged = mergeById(local, d.writtenAnswers.map(mapWrittenFromServer));
      writeLocal('lumina:writtenAnswers', merged);
    }
  } catch {
    // Silent — sync is best-effort
  }
}

export function schedulePush(...keys: string[]): void {
  if (!getToken()) return;
  for (const k of keys) pendingKeys.add(k);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(executePush, SYNC_DEBOUNCE_MS);
}

async function executePush(): Promise<void> {
  const keys = new Set(pendingKeys);
  pendingKeys.clear();
  pushTimer = null;

  const body: Record<string, any> = {};

  if (keys.has('varkify:quizHistory')) {
    body.quizHistory = readLocal('varkify:quizHistory', []);
  }
  if (keys.has('varkify:mistakeNotebook')) {
    body.mistakes = readLocal('varkify:mistakeNotebook', []);
  }
  if (keys.has('varkify:masteryMap')) {
    body.mastery = readLocal('varkify:masteryMap', []);
  }
  if (keys.has('varkify:dailyTasks')) {
    body.dailyTasks = readLocal('varkify:dailyTasks', []);
  }
  if (keys.has('lumina:activityLog')) {
    body.activityLog = readLocal('lumina:activityLog', []);
  }
  if (keys.has('lumina:streak')) {
    body.streak = readLocal('lumina:streak', {});
  }
  if (keys.has('lumina:examDates')) {
    body.plannerEvents = readLocal('lumina:examDates', []);
  }
  if (keys.has('lumina:writtenAnswers')) {
    body.writtenAnswers = readLocal('lumina:writtenAnswers', []);
  }
  if (keys.has('lumina:usage')) {
    const counters = readLocal('lumina:usage', {} as any);
    const date = counters.dailyResetDate || new Date().toISOString().slice(0, 10);
    body.usageCounters = [
      { date, type: 'kitsGeneratedToday', value: counters.kitsGeneratedToday || 0 },
      { date, type: 'quizzesTakenToday', value: counters.quizzesTakenToday || 0 },
      { date, type: 'pdfDownloadsToday', value: counters.pdfDownloadsToday || 0 },
      { date, type: 'writtenAnswersEvaluatedToday', value: counters.writtenAnswersEvaluatedToday || 0 },
      { date, type: 'flashcardSetsGeneratedToday', value: counters.flashcardSetsGeneratedToday || 0 },
      { date: counters.monthlyResetMonth || date.slice(0, 7), type: 'youtubeRecallUsedThisMonth', value: counters.youtubeRecallUsedThisMonth || 0 },
    ];
  }

  if (Object.keys(body).length === 0) return;

  try {
    await authFetch('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch {
    for (const k of keys) pendingKeys.add(k);
    pushTimer = setTimeout(executePush, SYNC_DEBOUNCE_MS * 3);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function writeLocal<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

function mergeById(local: any[], server: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of local) if (item.id) map.set(item.id, item);
  for (const item of server) if (item.id) map.set(item.id, item);
  return Array.from(map.values());
}

function mergeByField(local: any[], server: any[], field: string): any[] {
  const map = new Map<string, any>();
  for (const item of local) if (item[field]) map.set(item[field], item);
  for (const item of server) if (item[field]) map.set(item[field], item);
  return Array.from(map.values());
}

// ─── Server → Client mapping ───────────────────────────────────────────────

function mapQuizFromServer(row: any): any {
  return {
    id: row.id, topic: row.topic, chapterTitle: row.chapter_title, subject: row.subject,
    score: row.score, total: row.total, percentage: row.percentage,
    weakTopics: typeof row.weak_topics === 'string' ? JSON.parse(row.weak_topics) : row.weak_topics || [],
    answers: typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers || [],
    modeUsed: row.mode_used, createdAt: row.created_at,
  };
}

function mapMistakeFromServer(row: any): any {
  return {
    id: row.id, quizId: row.quiz_id, topic: row.topic, question: row.question,
    selectedAnswer: row.selected_answer, correctAnswer: row.correct_answer,
    explanation: row.explanation, topicTag: row.topic_tag, modeUsed: row.mode_used,
    createdAt: row.created_at,
  };
}

function mapMasteryFromServer(row: any): any {
  return {
    id: row.id, topic: row.topic, masteryScore: row.mastery_score, status: row.status,
    lastAttemptDate: row.last_attempt_date, nextRevisionDate: row.next_revision_date,
    forgettingRisk: row.forgetting_risk, attempts: row.attempts, mistakeCount: row.mistake_count,
  };
}

function mapTaskFromServer(row: any): any {
  return {
    id: row.id, sourceQuizId: row.source_quiz_id, sourceKitId: row.source_kit_id,
    title: row.title, topic: row.topic, dueDate: row.due_date,
    actionType: row.action_type, status: row.status, completedDate: row.completed_date,
    estimatedMinutes: row.estimated_minutes, reason: row.reason, planRequired: row.plan_required,
  };
}

function mapActivityFromServer(row: any): any {
  return {
    id: row.id, type: row.type, chapterId: row.chapter_id, chapterTitle: row.chapter_title,
    subject: row.subject, xpEarned: row.xp_earned,
    meta: typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta || {},
    createdAt: row.created_at,
  };
}

function mapPlannerFromServer(row: any): any {
  return { id: row.id, title: row.title, date: row.date, type: row.type, source: row.source };
}

function mapWrittenFromServer(row: any): any {
  return {
    id: row.id, question: row.question, studentAnswer: row.student_answer,
    marksScored: row.marks_scored, totalMarks: row.total_marks,
    missingKeywords: typeof row.missing_keywords === 'string' ? JSON.parse(row.missing_keywords) : row.missing_keywords || [],
    strengths: typeof row.strengths === 'string' ? JSON.parse(row.strengths) : row.strengths || [],
    improvements: typeof row.improvements === 'string' ? JSON.parse(row.improvements) : row.improvements || [],
    modelAnswer: row.model_answer, createdAt: row.created_at,
  };
}
