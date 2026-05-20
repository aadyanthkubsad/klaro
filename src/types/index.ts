/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LibraryItem {
  id: string;
  title: string;
  type: 'readwrite' | 'visual' | 'aural' | 'analysis' | 'revision-kit';
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
}

export interface QuizAttempt {
  id: string;
  topic: string;
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
  masteryScore: number;
  status: MasteryStatus;
  lastAttemptDate: string;
  nextRevisionDate: string;
  mistakeCount: number;
  attempts: number;
  /** Ebbinghaus-derived: how likely is this topic to be forgotten right now? */
  forgettingRisk: ForgettingRisk;
}

export type TaskActionType = 'revision' | 'retest' | 'mistake-review' | 'flashcards' | 'youtube-quiz';

export interface DailyTask {
  id: string;
  title: string;
  topic: string;
  /** Chapter name — falls back to topic when not derivable. Used in Library mode tiles. */
  chapter?: string;
  reason: string;
  dueDate: string;
  estimatedMinutes: number;
  status: 'pending' | 'completed';
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
  dailyKitsLimit: number; // Infinity for unlimited
  unlimitedFlashcards: boolean;
  pdfExport: boolean;
  audioSummaries: boolean;
  mistakeSlideshow: boolean;
  monthlyPlanner: boolean;
  masteryAnalytics: boolean;
  premium3D: boolean;
  mp3Download: boolean;
  prioritisedGeneration: boolean;
  librarySaveLimit: number; // Infinity for unlimited
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
}
