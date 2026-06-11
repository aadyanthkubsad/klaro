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

export type SourceConfidence = 'full-transcript' | 'user-notes' | 'title-only' | 'manual-topic';

export interface YouTubeRecallKit {
  id: string;
  title: string;
  sourceType: 'youtube';
  videoId?: string;
  summary: string;
  keyPoints: string[];
  flashcards: { front: string; back: string; topicTag: string }[];
  quiz: {
    id: string;
    question: string;
    options: string[];
    answer: string;
    explanation: string;
    topicTag: string;
  }[];
  weakTopicTags: string[];
  nextRevisionTask: {
    title: string;
    dueDate: string;
    actionType: 'quiz' | 'flashcards' | 'revision';
  };
  /** How much source material was available when this kit was generated. */
  sourceConfidence: SourceConfidence;
  /** Language the kit was generated in. */
  outputLanguage?: 'en' | 'hi';
  /** The topic that was actually used for generation (for UI validation). */
  detectedTopic?: string;
  /** The subject Gemini inferred (for UI validation). */
  detectedSubject?: string;
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

/** Build auth headers so the server can identify the logged-in user. */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = window.localStorage.getItem('lumina:auth-token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch { /* SSR / no localStorage */ }
  return headers;
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
    /** Stream (Science/Commerce) for Class 11/12. */
    stream?: string;
  }): Promise<ComprehensiveKit> {
    // Frontend abort after 170s — slightly longer than the server's 180s queue
    // timeout so we prefer the server's classified error over a raw AbortError.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 170_000);
    try {
      const response = await fetch('/api/generate-kit', {
        method: 'POST',
        headers: authHeaders(),
        signal: controller.signal,
        body: JSON.stringify(params)
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data as ComprehensiveKit;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('AI generation took too long. The AI service may be busy — please try again.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  // Removed legacy general helpers
  
  /**
   * Generates a structural summary of text content
   */
  async generateSummary(text: string): Promise<SummaryData> {
    const response = await fetch('/api/ai/generate-summary', {
      method: 'POST',
      headers: authHeaders(),
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
  async generateWeakTopicAnalysis(weakTopics: string[], mistakes: any[], subject?: string, chapterTitle?: string): Promise<{ notes: string, tips: string, keywords: string[], quiz: QuizData }> {
    const response = await fetch('/api/ai/generate-weak-topic-analysis', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ weakTopics, mistakes, subject, chapterTitle })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.data;
  },
  
  async generateFocusedReview(weakTopics: string[], mistakes: any[]): Promise<QuizData> {
    const response = await fetch('/api/ai/generate-focused-review', {
      method: 'POST',
      headers: authHeaders(),
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
    subject?: string;
  }): Promise<{ topic: string; questions: QuizQuestion[] }> {
    const response = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: authHeaders(),
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
      headers: authHeaders(),
      body: JSON.stringify({
        topic: params.title,
        sourceText: params.transcript || '',
        classLevel: params.classLevel || 'Class 10',
        examMode: params.examMode || 'CBSE',
        count: 10,
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
    sourceContent?: string;
  }): Promise<any> {
    const response = await fetch('/api/generate-study-notes', {
      method: 'POST',
      headers: authHeaders(),
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

  async generatePracticeFromPattern(params: {
    subject: string;
    year: string;
    paperType: string;
    classLevel?: string;
    count?: number;
  }): Promise<{ topic: string; questions: QuizQuestion[] }> {
    const topic = `${params.subject} — Practice based on CBSE ${params.year} ${params.paperType.replace('-', ' ')} pattern`;
    const response = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        topic,
        classLevel: params.classLevel || 'Class 10',
        examMode: 'CBSE',
        count: params.count || 10,
        sourceText: `Generate original practice MCQ questions that follow the PATTERN and difficulty level of the CBSE ${params.year} ${params.paperType.replace('-', ' ')} for ${params.subject} (Class 10). Do NOT copy actual questions — create new ones covering similar topics and question styles. Label clearly as AI-generated practice.`,
      }),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Practice test generation failed.');
    return result.data as { topic: string; questions: QuizQuestion[] };
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
      headers: authHeaders(),
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
   * Extract text from a handwritten answer image using backend OCR (Gemini Vision).
   * API key stays server-side. Returns extracted text with confidence metadata.
   */
  async extractHandwrittenAnswer(params: {
    imageBase64: string;
    mimeType: string;
    question?: string;
    topic?: string;
    subject?: string;
    totalMarks?: number;
  }): Promise<{
    extractedText: string;
    lineByLineText: string[];
    formulas: string[];
    unclearWords: string[];
    confidence: 'high' | 'medium' | 'low';
    needsReview: boolean;
  }> {
    const response = await fetch('/api/extract-handwritten-answer', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      let msg = 'Could not read the answer clearly. You can type your answer or upload a clearer image.';
      try { const err = await response.json(); msg = err?.error || msg; } catch {}
      throw new Error(msg);
    }
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Extraction failed.');
    return result.data;
  },

  /**
   * Evaluate a student's exam answer (typed or uploaded) with structured feedback.
   * Returns marks, missing keywords, strengths, improvements, model answer, and exam tip.
   */
  async evaluateAnswer(params: {
    topic?: string;
    subject?: string;
    classLevel?: string;
    examMode?: string;
    question: string;
    studentAnswer: string;
    totalMarks: number;
    answerMode: 'typed' | 'uploaded';
  }): Promise<{
    marksScored: number;
    totalMarks: number;
    missingKeywords: string[];
    strengths: string[];
    improvements: string[];
    modelAnswer: string;
    examTip: string;
  }> {
    const response = await fetch('/api/evaluate-answer', {
      method: 'POST',
      headers: authHeaders(),
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
   * Generate AI narration audio via Sarvam TTS.
   * Step 1: Gemini generates an engaging explanation script.
   * Step 2: Sarvam converts the script into spoken audio.
   * Returns audio URL, duration, script text, and structured script sections.
   */
  async generateAudioNarration(params: {
    topic: string;
    subject?: string;
    classLevel?: string;
    script?: string;
    language?: string;
    voiceStyle?: string;
  }): Promise<{
    audioUrl: string | null;
    duration: string | null;
    script: string;
    scriptSections: {
      intro: string;
      explanation: string;
      example: string;
      examTip: string;
      recap: string;
      quizCTA: string;
    } | null;
    cached: boolean;
    sarvamUnavailable: boolean;
    message?: string;
  }> {
    const response = await fetch('/api/generate-audio', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      let msg = 'Audio generation failed.';
      let data = null;
      try {
        const err = await response.json();
        msg = err?.error || msg;
        data = err?.data || null;
      } catch {}
      // If we got script data despite the error, return it for graceful degradation
      if (data && data.script) {
        return {
          audioUrl: null,
          duration: null,
          script: data.script,
          scriptSections: data.scriptSections || null,
          cached: false,
          sarvamUnavailable: true,
          message: data.message || msg,
        };
      }
      throw new Error(msg);
    }
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Audio generation failed.');
    return result.data;
  },

  /**
   * YouTube Recall: generates a full recall kit (summary, key points, flashcards,
   * quiz, weak-topic tags, revision task) from a topic and optional transcript.
   * The student enters the video topic directly — no YouTube URL needed.
   */
  async generateYouTubeRecall(params: {
    videoTitle?: string;
    transcript?: string;
    topic?: string;
    classLevel?: string;
    examMode?: string;
    /** Desired output language for the kit: 'en' (English), 'hi' (Hindi), or 'auto' (same as video). */
    outputLanguage?: 'en' | 'hi' | 'auto';
    /** Detected/stated source language of the video. */
    sourceLanguage?: 'en' | 'hi' | 'auto';
  }): Promise<YouTubeRecallKit> {
    const response = await fetch('/api/youtube-recall', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(params),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'YouTube Recall generation failed.');
    return result.data as YouTubeRecallKit;
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
      headers: authHeaders(),
      body: JSON.stringify(params),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Flashcard generation failed. Please try again.');
    return result.data as { topic: string; flashcards: Flashcard[] };
  },
};
