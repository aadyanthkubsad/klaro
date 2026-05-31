/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Request validation helpers.
 * Validates all API inputs, rejects empty/oversized payloads, returns clean errors.
 */

/** Max lengths for various input fields. */
export const LIMITS = {
  /** Max topic string length (chars). */
  TOPIC_MAX: 500,
  /** Max manual text / source text length (chars). */
  TEXT_MAX: 50_000,
  /** Max transcript length for YouTube recall (chars). */
  TRANSCRIPT_MAX: 100_000,
  /** Max base64 image size (bytes ≈ 10 MB raw). */
  IMAGE_BASE64_MAX: 14_000_000,
  /** Max question text length. */
  QUESTION_MAX: 2_000,
  /** Max student answer length. */
  ANSWER_MAX: 10_000,
  /** Max note style name length. */
  NOTE_STYLE_MAX: 50,
  /** Max array items for weakTopics / mistakes. */
  ARRAY_MAX: 100,
};

export interface ValidationError {
  field: string;
  message: string;
}

/** Validate /api/generate-kit request body. */
export function validateGenerateKit(body: any): ValidationError[] {
  const errors: ValidationError[] = [];
  const { topic, manualText, sourceText, imageBase64, sourceType } = body || {};

  const textRef = manualText || sourceText || '';

  // Must have at least one source
  if (!topic && !textRef && !imageBase64) {
    errors.push({ field: 'topic', message: 'Please enter a topic, paste text, or upload an image.' });
  }

  if (topic && typeof topic === 'string' && topic.length > LIMITS.TOPIC_MAX) {
    errors.push({ field: 'topic', message: `Topic must be under ${LIMITS.TOPIC_MAX} characters.` });
  }

  if (textRef && typeof textRef === 'string' && textRef.length > LIMITS.TEXT_MAX) {
    errors.push({ field: 'manualText', message: `Text input must be under ${LIMITS.TEXT_MAX} characters.` });
  }

  if (sourceType === 'image' && imageBase64) {
    if (typeof imageBase64 !== 'string') {
      errors.push({ field: 'imageBase64', message: 'Image data must be a string.' });
    } else if (imageBase64.length > LIMITS.IMAGE_BASE64_MAX) {
      errors.push({ field: 'imageBase64', message: 'Image too large. Please upload an image under 10 MB.' });
    }
  }

  return errors;
}

/** Validate /api/youtube-recall request body. */
export function validateYouTubeRecall(body: any): ValidationError[] {
  const errors: ValidationError[] = [];
  const { topic, manualTopic, videoTitle, transcript } = body || {};

  if (!topic && !manualTopic && !videoTitle && !transcript) {
    errors.push({ field: 'topic', message: 'Please enter a video topic or paste a transcript.' });
  }

  if (transcript && typeof transcript === 'string' && transcript.length > LIMITS.TRANSCRIPT_MAX) {
    errors.push({ field: 'transcript', message: `Transcript must be under ${LIMITS.TRANSCRIPT_MAX} characters (≈50 pages).` });
  }

  if (topic && typeof topic === 'string' && topic.length > LIMITS.TOPIC_MAX) {
    errors.push({ field: 'topic', message: `Topic must be under ${LIMITS.TOPIC_MAX} characters.` });
  }

  return errors;
}

/** Validate /api/generate-study-notes request body. */
export function validateStudyNotes(body: any): ValidationError[] {
  const errors: ValidationError[] = [];
  const { chapterTitle, subject, noteStyle, sourceContent } = body || {};

  if (!chapterTitle || typeof chapterTitle !== 'string' || !chapterTitle.trim()) {
    errors.push({ field: 'chapterTitle', message: 'Chapter title is required.' });
  }
  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    errors.push({ field: 'subject', message: 'Subject is required.' });
  }
  if (!noteStyle || typeof noteStyle !== 'string' || !noteStyle.trim()) {
    errors.push({ field: 'noteStyle', message: 'Note style is required.' });
  }
  if (noteStyle && noteStyle.length > LIMITS.NOTE_STYLE_MAX) {
    errors.push({ field: 'noteStyle', message: 'Invalid note style.' });
  }
  if (sourceContent && typeof sourceContent === 'string' && sourceContent.length > LIMITS.TEXT_MAX) {
    errors.push({ field: 'sourceContent', message: `Source content must be under ${LIMITS.TEXT_MAX} characters.` });
  }

  return errors;
}

/** Validate /api/evaluate-answer request body. */
export function validateEvaluateAnswer(body: any): ValidationError[] {
  const errors: ValidationError[] = [];
  const { question, studentAnswer } = body || {};

  if (!question || typeof question !== 'string' || !question.trim()) {
    errors.push({ field: 'question', message: 'Question is required.' });
  }
  if (!studentAnswer || typeof studentAnswer !== 'string' || !studentAnswer.trim()) {
    errors.push({ field: 'studentAnswer', message: 'Student answer is required.' });
  }
  if (question && question.length > LIMITS.QUESTION_MAX) {
    errors.push({ field: 'question', message: `Question must be under ${LIMITS.QUESTION_MAX} characters.` });
  }
  if (studentAnswer && studentAnswer.length > LIMITS.ANSWER_MAX) {
    errors.push({ field: 'studentAnswer', message: `Answer must be under ${LIMITS.ANSWER_MAX} characters.` });
  }

  return errors;
}

/** Validate /api/generate-quiz request body. */
export function validateGenerateQuiz(body: any): ValidationError[] {
  const errors: ValidationError[] = [];
  const { topic } = body || {};

  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    errors.push({ field: 'topic', message: 'Topic is required.' });
  }
  if (topic && topic.length > LIMITS.TOPIC_MAX) {
    errors.push({ field: 'topic', message: `Topic must be under ${LIMITS.TOPIC_MAX} characters.` });
  }

  return errors;
}

/** Validate /api/generate-flashcards request body. */
export function validateGenerateFlashcards(body: any): ValidationError[] {
  return validateGenerateQuiz(body); // Same shape
}

/** Validate weak-topic analysis / focused-review body. */
export function validateWeakTopicAnalysis(body: any): ValidationError[] {
  const errors: ValidationError[] = [];
  const { weakTopics, mistakes } = body || {};

  if (!weakTopics || !Array.isArray(weakTopics) || weakTopics.length === 0) {
    errors.push({ field: 'weakTopics', message: 'At least one weak topic is required.' });
  }
  if (weakTopics && weakTopics.length > LIMITS.ARRAY_MAX) {
    errors.push({ field: 'weakTopics', message: `Too many weak topics (max ${LIMITS.ARRAY_MAX}).` });
  }
  if (mistakes && Array.isArray(mistakes) && mistakes.length > LIMITS.ARRAY_MAX) {
    errors.push({ field: 'mistakes', message: `Too many mistakes (max ${LIMITS.ARRAY_MAX}).` });
  }

  return errors;
}

/** Validate /api/generate-audio request body. */
export function validateGenerateAudio(body: any): ValidationError[] {
  const errors: ValidationError[] = [];
  const { script, topic, language, voiceStyle } = body || {};

  if (!script || typeof script !== 'string' || script.trim().length < 10) {
    errors.push({ field: 'script', message: 'Audio script is required (minimum 10 characters).' });
  }
  if (script && script.length > 30_000) {
    errors.push({ field: 'script', message: 'Script is too long (max 30,000 characters).' });
  }
  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    errors.push({ field: 'topic', message: 'Topic is required.' });
  }
  const validLangs = ['en-IN', 'hi-IN', 'hinglish'];
  if (language && !validLangs.includes(language)) {
    errors.push({ field: 'language', message: `Unsupported language. Use one of: ${validLangs.join(', ')}` });
  }
  const validStyles = ['clear-teacher', 'friendly-tutor', 'exam-coach', 'story-mode', 'clear-narrator'];
  if (voiceStyle && !validStyles.includes(voiceStyle)) {
    errors.push({ field: 'voiceStyle', message: `Unsupported voice style. Use one of: ${validStyles.join(', ')}` });
  }

  return errors;
}

/** Helper: return 400 response if validation errors exist. Returns true if errors were sent. */
export function sendValidationErrors(res: any, errors: ValidationError[]): boolean {
  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: errors[0].message,
      validationErrors: errors,
    });
    return true;
  }
  return false;
}
