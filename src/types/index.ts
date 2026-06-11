/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type LibraryItemType =
  | 'readwrite'
  | 'visual'
  | 'aural'
  | 'revision-kit'
  | 'analysis'
  | 'sample-paper'
  | 'previous-year-paper'
  | 'marking-scheme'
  | 'chapter-test'
  | 'quiz-attempt'
  | 'mock-test'
  | 'written-answer-attempt'
  | 'score-analysis'
  | 'weak-topic-analysis'
  | 'mastery-report'
  | 'mistake-analysis';

export type LibraryTab = 'chapters' | 'saved' | 'tests' | 'analysis';

export function getLibraryTabForItem(type: LibraryItemType): LibraryTab {
  switch (type) {
    case 'readwrite':
    case 'visual':
    case 'aural':
    case 'revision-kit':
      return 'saved';
    case 'sample-paper':
    case 'previous-year-paper':
    case 'marking-scheme':
    case 'chapter-test':
    case 'quiz-attempt':
    case 'mock-test':
    case 'written-answer-attempt':
      return 'tests';
    case 'analysis':
    case 'score-analysis':
    case 'weak-topic-analysis':
    case 'mastery-report':
    case 'mistake-analysis':
      return 'analysis';
    default:
      return 'saved';
  }
}

export interface LibraryItem {
  id: string;
  title: string;
  type: LibraryItemType;
  date: string;
  progress: number;
  contentSnippet: string;
  tags?: string[];
}

export type ExamMode = 'CBSE' | 'JEE' | 'SAT' | 'NEET' | 'General';

export interface UserStats {
  streak: number;
  xp: number;
  level: number;
  weakTopics: string[];
  strengths: string[];
  quizScores: { quizTitle: string; score: number; total: number; date: string; topic: string; }[];
  mistakes: { question: string, userAnswer: string, correction: string, date: string, topic: string, mode: 'visual' | 'aural' | 'readwrite' }[];
}

export interface QuizConfig {
  mode: ExamMode;
  subject: string;
  count: number;
}

// ─── Learning Loop ───────────────────────────────────────────────────────────
// Persisted client-side via learningService. These drive the
// Learn → Quiz → Result → Mistakes/Analytics/Progress → Tasks loop.

export type LearningMode = 'readwrite' | 'visual' | 'aural' | 'revision-kit' | 'youtube';

export type CognitiveLevel = 'recall' | 'understand' | 'apply' | 'analyze';

export interface QuizAnswerRecord {
  question: string;
  /** All options the student saw, e.g. ["A) ...", "B) ...", ...]. Used to derive full text. */
  options?: string[];
  /** Legacy / raw — may be either the option letter ("B") or the full text ("B) ..."). */
  selectedAnswer: string;
  correctAnswer: string;
  /** Normalised pair — letter + full text. Populated at record time so display is unambiguous. */
  selectedOptionLetter?: string;
  selectedAnswerText?: string;
  correctOptionLetter?: string;
  correctAnswerText?: string;
  isCorrect: boolean;
  explanation: string;
  topicTag: string;
  /** Bloom's-inspired cognitive level, inferred from difficulty. */
  cognitiveLevel?: CognitiveLevel;
}

export interface QuizAttempt {
  id: string;
  topic: string;
  chapterId?: string;
  chapterTitle?: string;
  subject?: string;
  modeUsed: LearningMode;
  date: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  correctCount: number;
  wrongCount: number;
  weakTopics: string[];
  answers: QuizAnswerRecord[];
}

export interface MistakeEntry {
  id: string;
  quizId: string;
  topic: string;
  question: string;
  selectedAnswer: string;
  correctAnswer: string;
  explanation: string;
  topicTag: string;
  date: string;
  modeUsed: LearningMode;
}

export type MasteryStatus = 'Not started' | 'Weak' | 'Improving' | 'Strong' | 'Mastered';

export type ForgettingRisk = 'Low' | 'Medium' | 'High';

export interface MasteryEntry {
  topic: string;
  /** BKT P(Lₙ) × 100 — mastery score BEFORE Ebbinghaus decay. */
  masteryScore: number;
  status: MasteryStatus;
  lastAttemptDate: string;
  nextRevisionDate: string;
  mistakeCount: number;
  attempts: number;
  /** Ebbinghaus-derived: how likely is this topic to be forgotten right now? */
  forgettingRisk: ForgettingRisk;
  /** BKT raw P(Lₙ) — probability the skill is learned (0–1). */
  pLearned?: number;
  /**
   * Ebbinghaus stability S — half-life in days. Starts at 3, multiplied by
   * 1.5 on each successful retrieval, capped at 90. Inspired by Settles &
   * Meeder (2016) half-life regression from Duolingo.
   */
  stability?: number;
}

export type TaskActionType = 'revision' | 'retest' | 'mistake-review' | 'flashcards' | 'youtube-quiz';

export interface DailyTask {
  id: string;
  title: string;
  topic: string;
  /** Chapter name — falls back to topic when not derivable. Used in Library mode tiles. */
  chapter?: string;
  subject?: string;
  reason: string;
  dueDate: string;
  estimatedMinutes: number;
  status: 'pending' | 'completed';
  completedDate?: string;
  actionType: TaskActionType;
  sourceQuizId?: string;
  sourceKitId?: string;
  modeUsed?: LearningMode;
  /** Plan required to act on this task. Free users see a lock + paywall on Plus/Pro tasks. */
  planRequired?: PlanType;
}

export interface Flashcard {
  front: string;
  back: string;
  topicTag?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface FlashcardSet {
  topic: string;
  cards: Flashcard[];
  sourceKitId?: string;
}

// ─── Monthly Planner ─────────────────────────────────────────────────────────

export type PlannerEventType = 'revision' | 'test' | 'deadline';

export interface PlannerEvent {
  id: string;
  title: string;
  subject: string;
  /** YYYY-MM-DD */
  date: string;
  type: PlannerEventType;
  topic?: string;
  source: 'quiz' | 'manual' | 'forgetting-curve' | 'task';
  /** Optional link back to a quiz attempt / kit for click-through actions. */
  sourceQuizId?: string;
  sourceKitId?: string;
}

// ─── Billing / Plans ─────────────────────────────────────────────────────────
// MVP: persisted to localStorage only. No real payment gateway yet.

export type PlanType = 'free' | 'plus' | 'pro';

export interface PlanLimits {
  dailyKitsLimit: number;
  dailyQuizLimit: number;
  dailyFlashcardSetsLimit: number;
  dailyPdfDownloadsLimit: number;
  dailyWrittenAnswersLimit: number;
  monthlyYoutubeRecallLimit: number;
  unlimitedFlashcards: boolean;
  pdfExport: boolean;
  audioSummaries: boolean;
  mistakeSlideshow: boolean;
  monthlyPlanner: boolean;
  masteryAnalytics: boolean;
  premium3D: boolean;
  mp3Download: boolean;
  prioritisedGeneration: boolean;
  librarySaveLimit: number;
  weakTopicRetests: boolean;
  previousYearPapers: boolean;
  spacedRevisionTasks: boolean;
  youtubeRecall: boolean;
  writtenAnswerFeedback: boolean;
  mockTestMode: boolean;
  forgettingCurveCalendar: boolean;
  advancedAnalytics: boolean;
  masteryTracking: boolean;
  dailyAudioGenerationsLimit: number;
  aiNarration: boolean;
  storyModeNarration: boolean;
}

/** Usage counters persisted to localStorage, reset daily/monthly. */
export interface UsageCounters {
  kitsGeneratedToday: number;
  quizzesTakenToday: number;
  youtubeRecallUsedThisMonth: number;
  pdfDownloadsToday: number;
  writtenAnswersEvaluatedToday: number;
  flashcardSetsGeneratedToday: number;
  /** ISO date string for daily reset detection */
  dailyResetDate: string;
  /** ISO month string (YYYY-MM) for monthly reset detection */
  monthlyResetMonth: string;
}

export interface PaywallConfig {
  title: string;
  description: string;
  ctaLabel: string;
  requiredPlan: 'plus' | 'pro';
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Optional list of bullet features shown under the description. */
  benefits?: string[];
}

// ─── Study Notes ──────────────────────────────────────────────────────────────

export type NoteStyle =
  | 'smart'
  | 'cornell'
  | 'outline'
  | 'comparison'
  | 'recall'
  | 'concept-map'
  | 'knowledge-cards';


export interface NoteSection {
  title: string;
  content: string;
  cueQuestions?: string[];
  examTips?: string[];
  examples?: string[];
}

export interface NoteTable {
  title: string;
  columns: string[];
  rows: string[][];
}

export interface RecallQuestion {
  question: string;
  hint: string;
  answer: string;
}

export interface ConceptConnection {
  concept: string;
  connectedConcept: string;
  relationship: string;
  whyItMatters: string;
}

export interface KnowledgeCard {
  idea: string;
  explanation: string;
  linkedConcepts: string[];
  quizQuestion: string;
}

export interface ExamOutlineSubtopic {
  title: string;
  keyPoints: string[];
  examples: string[];
  examQuestions: string[];
}

export interface ExamOutline {
  mainTopic: string;
  subtopics: ExamOutlineSubtopic[];
}

// ─── Dense Smart Slide format (v2) ────────────────────────────────────────────

export interface SmartSlide {
  slide_number: number;
  title: string;
  definitions?: { term: string; definition: string; example?: string }[];
  tables?: { label: string; columns: string[]; rows: string[][] }[];
  comparison_panels?: { left: { title: string; content: string }; right: { title: string; content: string } }[];
  compact_grid?: { primary: string; secondary: string }[];
  formulae?: { label: string; formula: string }[];
  step_method?: { label: string; steps: string[] };
  solved_example?: { mark_pattern: string; question: string; steps: string[]; answer: string };
  common_mistake?: string;
  exam_tip?: string;
}

export interface GeneratedNotes {
  topic: string;
  subject: string;
  noteStyle: NoteStyle;
  summary: string;
  keyPoints: string[];
  definitions: { term: string; meaning: string }[];
  sections: NoteSection[];
  tables?: NoteTable[];
  recallQuestions?: RecallQuestion[];
  flashcards: { front: string; back: string }[];
  conceptConnections?: ConceptConnection[];
  knowledgeCards?: KnowledgeCard[];
  examOutline?: ExamOutline;
  /** Dense slide format (v2) — used by SMART notes */
  slides?: SmartSlide[];
}

// ─── Written Answer Practice ────────────────────────────────────────────────

export type AnswerMode = 'typed' | 'uploaded';

export interface WrittenAnswerAttempt {
  id: string;
  topic: string;
  subject: string;
  question: string;
  studentAnswer: string;
  answerMode: AnswerMode;
  marksScored: number;
  totalMarks: number;
  missingKeywords: string[];
  strengths: string[];
  improvements: string[];
  modelAnswer: string;
  examTip: string;
  date: string;
}

export interface ExamAnswerFeedback {
  marksScored: number;
  totalMarks: number;
  missingKeywords: string[];
  strengths: string[];
  improvements: string[];
  modelAnswer: string;
  examTip: string;
}

// ─── Previous Year Papers ──────────────────────────────────────────────────

export type PaperYear = '2020' | '2021' | '2022' | '2023' | '2024' | '2025';
export type PaperType = 'previous-year' | 'sample-paper' | 'marking-scheme';
export type PaperSubject =
  | 'Science'
  | 'Maths Standard'
  | 'Maths Basic'
  | 'Social Science'
  | 'English'
  | 'Hindi A'
  | 'Hindi B';

export type PaperLinkStatus = 'verified' | 'needs-review' | 'missing';

export interface PaperSource {
  id: string;
  subject: PaperSubject;
  year: PaperYear;
  classLevel: 'Class 10';
  board: 'CBSE';
  type: PaperType;
  sourceName: 'CBSE';
  directPdfUrl?: string;
  markingSchemeUrl?: string;
  officialIndexUrl: string;
  verified: boolean;
  pdfStatus: PaperLinkStatus;
  markingSchemeStatus: PaperLinkStatus;
  lastChecked: string;
  setLabel?: string;
}

// ─── Razorpay Checkout ──────────────────────────────────────────────────────

declare global {
  interface Window {
    Razorpay: new (options: Record<string, any>) => {
      open: () => void;
      on: (event: string, handler: (response: any) => void) => void;
    };
  }
}
