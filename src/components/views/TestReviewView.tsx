/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * TestReviewView — slideshow review of wrong answers from one quiz attempt.
 * Opened from Library → Tests → "View Wrong Answers" or from the
 * Practice quiz results screen.
 *
 * One wrong answer per slide: question · your answer · correct answer ·
 * explanation · topic tag. Navigation: Previous / Next / Retest This
 * Topic / Back to Tests. A separate "Open Mistakes Notebook" button is
 * shown — we never auto-redirect there.
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ArrowRight, BookOpen, ChevronLeft, RotateCcw, XCircle, Tag, CheckCircle2,
} from 'lucide-react';
import { getQuizAttempt, resolveAnswerParts } from '../../services/learningService';

/**
 * Build the "B) full text" display string for an answer record, regardless of
 * whether normalised fields exist or we have to derive from options[].
 */
function displayAnswer(
  rec: { selectedAnswer?: string; correctAnswer?: string; options?: string[]; selectedAnswerText?: string; correctAnswerText?: string; selectedOptionLetter?: string; correctOptionLetter?: string },
  which: 'selected' | 'correct'
): string {
  const textField = which === 'selected' ? rec.selectedAnswerText : rec.correctAnswerText;
  const letterField = which === 'selected' ? rec.selectedOptionLetter : rec.correctOptionLetter;
  const rawField = which === 'selected' ? rec.selectedAnswer : rec.correctAnswer;
  // Prefer the normalised text (already "B) full text" when derived from options).
  if (textField && textField.length > 1) return textField;
  // Derive on the fly from the raw + options.
  const { letter, text } = resolveAnswerParts(rawField || '', rec.options || []);
  if (text && text.length > 1) return text;
  // Last resort: combine letter + (maybe) the field.
  if (letter) return rawField && rawField !== letter ? `${letter}) ${rawField}` : letter;
  return rawField || '';
}

interface Props {
  attemptId: string | null;
  setView: (v: string) => void;
  generateFocusedReview: () => void;
}

export const TestReviewView = ({ attemptId, setView, generateFocusedReview }: Props) => {
  const attempt = useMemo(() => (attemptId ? getQuizAttempt(attemptId) : undefined), [attemptId]);
  const wrong = useMemo(() => (attempt ? attempt.answers.filter(a => !a.isCorrect) : []), [attempt]);
  const [idx, setIdx] = useState(0);

  if (!attempt) {
    return (
      <div className="max-w-2xl mx-auto py-24 text-center">
        <h2 className="text-2xl font-black text-on-surface mb-3">Quiz attempt not found</h2>
        <p className="text-on-surface-variant font-medium mb-8">
          This attempt may have been cleared. Try a new quiz to generate fresh review data.
        </p>
        <button
          onClick={() => setView('library')}
          className="px-8 py-3 bg-primary text-white rounded-xl font-bold"
        >
          Back to Library
        </button>
      </div>
    );
  }

  if (wrong.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-24 text-center">
        <CheckCircle2 size={48} className="text-emerald-600 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-on-surface mb-3">All answers were correct!</h2>
        <p className="text-on-surface-variant font-medium mb-8">
          No wrong answers to review for "{attempt.topic}".
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => setView('library')}
            className="px-6 py-3 bg-surface-container text-on-surface rounded-xl font-bold"
          >
            Back to Tests
          </button>
          <button
            onClick={() => setView('progress')}
            className="px-6 py-3 bg-primary text-white rounded-xl font-bold"
          >
            View Progress
          </button>
        </div>
      </div>
    );
  }

  const cur = wrong[idx];
  const canPrev = idx > 0;
  const canNext = idx < wrong.length - 1;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto pb-20 space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setView('library')}
          className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface font-bold text-sm"
        >
          <ChevronLeft size={18} /> Back to Tests
        </button>
        <div className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
          Wrong answer {idx + 1} of {wrong.length}
        </div>
      </div>

      {/* Slide */}
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-[32px] border border-surface-container shadow-sm p-8 space-y-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full">
              {attempt.topic}
            </span>
            {cur.topicTag && cur.topicTag !== attempt.topic && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-surface-container-low text-on-surface-variant text-[10px] font-black uppercase tracking-widest rounded-full">
                <Tag size={10} /> {cur.topicTag}
              </span>
            )}
          </div>

          <h2 className="text-2xl font-bold text-on-surface leading-relaxed">{cur.question}</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl">
              <div className="flex items-center gap-2 text-[10px] font-black text-rose-700 uppercase tracking-widest mb-2">
                <XCircle size={14} /> Your answer
              </div>
              <p className="text-sm font-medium text-rose-900 leading-relaxed">
                {displayAnswer(cur, 'selected') || '(no answer recorded)'}
              </p>
            </div>
            <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <div className="flex items-center gap-2 text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2">
                <CheckCircle2 size={14} /> Correct answer
              </div>
              <p className="text-sm font-medium text-emerald-900 leading-relaxed">{displayAnswer(cur, 'correct')}</p>
            </div>
          </div>

          {cur.explanation && (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl">
              <div className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2">
                Explanation
              </div>
              <p className="text-sm text-amber-900 leading-relaxed">{cur.explanation}</p>
            </div>
          )}

          {/* Smart feedback — what to revise next */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-bold text-on-surface-variant">What to revise next:</span>
            <button
              onClick={() => setView('todo')}
              className="px-2.5 py-1 bg-primary/10 text-primary rounded-full font-black uppercase tracking-widest text-[10px] hover:bg-primary/20"
            >
              {cur.topicTag || attempt.topic} →
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          onClick={() => canPrev && setIdx(i => i - 1)}
          disabled={!canPrev}
          className="flex items-center gap-2 px-5 py-3 border border-surface-container rounded-xl font-bold text-sm disabled:opacity-30 hover:bg-surface-container-low"
        >
          <ArrowLeft size={16} /> Previous
        </button>
        <button
          onClick={() => canNext && setIdx(i => i + 1)}
          disabled={!canNext}
          className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-xl font-bold text-sm disabled:opacity-30 hover:brightness-110"
        >
          Next <ArrowRight size={16} />
        </button>
        <div className="ml-auto flex flex-wrap gap-3">
          <button
            onClick={generateFocusedReview}
            className="flex items-center gap-2 px-5 py-3 bg-navy-dark text-white rounded-xl font-bold text-sm hover:brightness-110"
          >
            <RotateCcw size={16} /> Retest This Topic
          </button>
          <button
            onClick={() => setView('mistakes')}
            className="flex items-center gap-2 px-5 py-3 border border-surface-container text-on-surface-variant rounded-xl font-bold text-sm hover:bg-surface-container-low"
          >
            <BookOpen size={16} /> Open Mistakes Notebook
          </button>
        </div>
      </div>
    </motion.div>
  );
};
