import type { ExamMode, NoteStyle, GeneratedNotes, Flashcard } from './index';

/** Shape returned by /api/generate-kit and consumed by all hub views. */
export interface RevisionKit {
  id?: string;
  title?: string;
  topic?: string;
  chapterTitle?: string;
  subject?: string;
  classLevel?: string;
  board?: string;
  examMode?: ExamMode;
  language?: 'hi' | 'en';
  noteStyle?: NoteStyle;

  // Content fields — each hub uses a subset
  summary?: string;
  keyPoints?: string[];
  definitions?: { term: string; meaning: string }[];
  sections?: GeneratedNotes['sections'];
  tables?: GeneratedNotes['tables'];
  slides?: GeneratedNotes['slides'];
  flashcards?: { cards: Flashcard[] } | Flashcard[];

  // Visual / mind-map fields
  mindMap?: unknown;
  conceptMap?: unknown;
  flowchart?: unknown;

  // Audio fields
  narrationScript?: string;
  audioSummary?: string;

  // Quiz fields
  quiz?: { id: string; question: string; options: string[]; answer: string; explanation: string; topicTag?: string }[];

  // Analytics / mastery
  weakTopics?: string[];
  masteryScore?: number;

  // Catch-all for server extras not yet typed
  [key: string]: unknown;
}
