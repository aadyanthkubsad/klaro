/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// aiService — thin frontend wrapper over the backend AI endpoints.
//
// ARCHITECTURAL RULE (stripped from production bundle by Vite minifier):
// This file MUST NEVER import an AI SDK. All Gemini calls live in server.ts
// and read the API key server-side only. The frontend talks to /api/* over
// fetch and never sees the key. To add a new AI capability, add a /api/...
// endpoint in server.ts and expose a fetch() wrapper below.

export interface AIResult<T> {
  data: T;
  rawResponse: string;
}

export interface SummaryData {
  summary: string;
  keyTakeaways: string[];
  complexity: 'Beginner' | 'Intermediate' | 'Advanced';
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  topicTag?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface QuizData {
  title: string;
  questions: QuizQuestion[];
}

export interface Flashcard {
  front: string;
  back: string;
  category?: string;
  topicTag?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface FlashcardData {
  cards: Flashcard[];
}

export interface DetailedSummary {
  text: string;
  executiveSummary: string;
  keyPoints: string[];
  keyVocabulary: { word: string; definition: string }[];
}

export interface DetailedVisual {
  videoDescription: string;
  graphicDescription: string;
  conceptMap: { node: string; relatesTo: string; reason: string }[];
}

export interface DetailedAural {
  audioScript: string;
  lectureNotes: string | string[];
}

export interface DetailedReadWrite {
  externalReferences: string[];
  tips: string[];
  synthesisPrompt: string;
}

export interface ComprehensiveKit {
  summary: DetailedSummary;
  quiz: QuizData;
  flashcards: FlashcardData;
  visual: DetailedVisual;
  aural: DetailedAural;
  readWrite: DetailedReadWrite;
}

/**
 * Service to handle AI operations using Google Gemini API via backend.
 * Every method is a thin POST to a /api/... endpoint — no SDK, no key.
 */
export const aiService = {
  async generateRevisionKit(params: {
    topic?: string;
    manualText?: string;
    sourceText?: string;
    classLevel?: string;
    examMode?: string;
    sourceType?: 'topic' | 'text' | 'image' | 'file';
    imageBase64?: string;
    mimeType?: string;
    /** Predefined-chapter context — when set, the server prompt is constrained to the chapter syllabus. */
    chapterTitle?: string;
    subject?: string;
    board?: string;
    /** Learning mode the student picked; affects which fields the kit emphasises. */
    mode?: 'visual' | 'readwrite' | 'audio' | 'practice';
    /** Explicit content language. 'hi' forces Devanagari primary text; 'en' forces English. */
    language?: 'hi' | 'en';
    /** Stable chapter ID from the syllabus — enables RAG chunk retrieval. */
    chapterId?: string;
    /** Academic year for syllabus-aware generation. */
    academicYear?: string;
  }): Promise<ComprehensiveKit> {
    const response = await fetch('/api/generate-kit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.data as ComprehensiveKit;
  },

  // Removed legacy general helpers
  
  /**
   * Generates a structural summary of text content
   */
  async generateSummary(text: string): Promise<SummaryData> {
    const response = await fetch('/api/ai/generate-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.data as SummaryData;
  },

  // generateFullKit removed since we use generateRevisionKit  
  
  /**
   * Generates a focused review quiz based on weak topics and past mistakes
   */
  async generateWeakTopicAnalysis(weakTopics: string[], mistakes: any[]): Promise<{ notes: string, tips: string, keywords: string[], quiz: QuizData }> {
    const response = await fetch('/api/ai/generate-weak-topic-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weakTopics, mistakes })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.data;
  },
  
  async generateFocusedReview(weakTopics: string[], mistakes: any[]): Promise<QuizData> {
    const response = await fetch('/api/ai/generate-focused-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weakTopics, mistakes })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.data as QuizData;
  },

  /**
   * Generates a CBSE-style quiz.
   * If weakTopics are provided, questions target only those subtopics.
   */
  async generateQuiz(params: {
    topic: string;
    classLevel?: string;
    examMode?: string;
    sourceText?: string;
    weakTopics?: string[];
    count?: number;
  }): Promise<{ topic: string; questions: QuizQuestion[] }> {
    const response = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Quiz generation failed. Please try again.');
    return result.data as { topic: string; questions: QuizQuestion[] };
  },

  /**
   * YouTube companion: student pastes a video title/topic and (optionally) a transcript.
   * We reuse /api/generate-quiz with sourceText=transcript so the questions are grounded
   * in whatever the student actually watched. Returns 5 quick MCQs.
   */
  async generateYouTubeStudy(params: {
    title: string;
    transcript?: string;
    classLevel?: string;
    examMode?: string;
  }): Promise<{ topic: string; questions: QuizQuestion[] }> {
    const response = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: params.title,
        sourceText: params.transcript || '',
        classLevel: params.classLevel || 'Class 10',
        examMode: params.examMode || 'CBSE',
        count: 5,
      }),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'YouTube study generation failed. Please try again.');
    return result.data as { topic: string; questions: QuizQuestion[] };
  },

  /**
   * Generate structured study notes in one of 7 note styles.
   * The backend prompt is style-aware and subject-aware (Science/Maths/SS/English/Hindi).
   * API key never leaves the server.
   */
  async generateStudyNotes(params: {
    chapterTitle: string;
    subject: string;
    noteStyle: string;
    classLevel?: string;
    examMode?: string;
    board?: string;
    language?: 'hi' | 'en';
  }): Promise<any> {
    const response = await fetch('/api/generate-study-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      let msg = 'Notes generation failed.';
      try {
        const err = await response.json();
        msg = err?.error || msg;
      } catch { /* body wasn't JSON — use default */ }
      throw new Error(msg);
    }
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Notes generation failed. Please try again.');
    return result.data;
  },

  /**
   * Evaluate a student's written exam answer using AI.
   * Returns marks, missing keywords, strengths, improvements, and model answer.
   */
  async evaluateExamAnswer(params: {
    question: string;
    studentAnswer: string;
    totalMarks: number;
    subject?: string;
    chapterTitle?: string;
    classLevel?: string;
  }): Promise<{
    marksScored: number;
    totalMarks: number;
    missingKeywords: string[];
    strengths: string[];
    improvements: string[];
    modelAnswer: string;
  }> {
    const response = await fetch('/api/evaluate-exam-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      let msg = 'Evaluation failed.';
      try { const err = await response.json(); msg = err?.error || msg; } catch {}
      throw new Error(msg);
    }
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Evaluation failed.');
    return result.data;
  },

  /**
   * Generate at least 8 CBSE Class 10-style flashcards for a topic.
   * Used by openFlashcards() when no kit-bundled flashcards exist.
   */
  async generateFlashcards(params: {
    topic: string;
    classLevel?: string;
    examMode?: string;
    sourceText?: string;
  }): Promise<{ topic: string; flashcards: Flashcard[] }> {
    const response = await fetch('/api/generate-flashcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Flashcard generation failed. Please try again.');
    return result.data as { topic: string; flashcards: Flashcard[] };
  },
};
