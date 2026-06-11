/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * FlashcardsView — the shared full-screen flashcard player.
 *
 * It receives a FlashcardSet through props (set in App.tsx via openFlashcards).
 * If the set is null but a topic is pending, it shows a loading state and lets
 * the parent know to fetch from /api/generate-flashcards.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ArrowRight, ChevronLeft, RotateCcw, RefreshCw, Sparkles, BookOpen, AlertTriangle,
} from 'lucide-react';
import { FlashcardSet } from '../../types';

interface FlashcardsViewProps {
  set: FlashcardSet | null;
  isLoading: boolean;
  error: string | null;
  setView: (v: string) => void;
  onRetry: () => void;
}

export const FlashcardsView = ({ set, isLoading, error, setView, onRetry }: FlashcardsViewProps) => {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Reset position whenever a new set arrives
  React.useEffect(() => {
    setIdx(0);
    setFlipped(false);
  }, [set?.topic, set?.cards?.length]);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-32 flex flex-col items-center gap-6">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-on-surface-variant font-bold uppercase tracking-widest text-sm animate-pulse">
          Generating flashcards…
        </p>
        <p className="text-xs text-on-surface-variant/60">This usually takes 5–10 seconds</p>
      </div>
    );
  }

  if (error) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto py-24 flex flex-col items-center text-center gap-6">
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle size={40} className="text-red-500" />
        </div>
        <h2 className="text-2xl font-black">Could not generate flashcards. Try again.</h2>
        <p className="text-on-surface-variant font-medium max-w-sm">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={onRetry}
            className="px-6 py-3 bg-primary text-white rounded-xl font-bold flex items-center gap-2 hover:brightness-110"
          >
            <RefreshCw size={16} /> Retry
          </button>
          <button
            onClick={() => setView('dashboard')}
            className="px-6 py-3 border border-surface-container rounded-xl font-bold text-on-surface-variant hover:bg-surface-container-low"
          >
            Back to Dashboard
          </button>
        </div>
      </motion.div>
    );
  }

  if (!set || set.cards.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-24 text-center">
        <BookOpen size={40} className="text-on-surface-variant/40 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-on-surface mb-2">No flashcards yet</h2>
        <p className="text-on-surface-variant font-medium mb-8">
          Open a topic from the Library or take a quiz first.
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

  const card = set.cards[idx];
  const canPrev = idx > 0;
  const canNext = idx < set.cards.length - 1;

  const difficultyColor =
    card.difficulty === 'easy'   ? 'bg-emerald-100 text-emerald-700' :
    card.difficulty === 'hard'   ? 'bg-rose-100 text-rose-700' :
                                   'bg-amber-100 text-amber-700';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto pb-20 flex flex-col items-center"
    >
      {/* Topic + progress header */}
      <div className="w-full flex flex-col items-center gap-3 mb-6">
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="px-4 py-1.5 bg-primary/10 text-primary text-[11px] font-black uppercase tracking-widest rounded-full">
            {set.topic}
          </span>
          {card.topicTag && card.topicTag !== set.topic && (
            <span className="px-4 py-1.5 bg-surface-container-low text-on-surface-variant text-[11px] font-black uppercase tracking-widest rounded-full">
              {card.topicTag}
            </span>
          )}
          {card.difficulty && (
            <span className={`px-4 py-1.5 text-[11px] font-black uppercase tracking-widest rounded-full ${difficultyColor}`}>
              {card.difficulty}
            </span>
          )}
        </div>
        <div className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
          Card {idx + 1} of {set.cards.length}
        </div>
      </div>

      {/* Card — large, centered, click-to-flip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={idx + (flipped ? '-back' : '-front')}
          initial={{ opacity: 0, y: 20, rotateY: flipped ? -90 : 90 }}
          animate={{ opacity: 1, y: 0, rotateY: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          onClick={() => setFlipped(f => !f)}
          className={`w-full min-h-[420px] md:min-h-[480px] rounded-[40px] border-2 shadow-lg p-12 md:p-16 cursor-pointer flex flex-col items-center justify-center text-center select-none ${
            flipped
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-white border-surface-container text-on-surface'
          }`}
        >
          <p className="text-xs font-black uppercase tracking-[0.25em] mb-8 opacity-60">
            {flipped ? 'Answer' : 'Question'}
          </p>
          <p className={`leading-snug font-black ${flipped ? 'text-2xl md:text-3xl' : 'text-3xl md:text-5xl'} max-w-3xl`}>
            {flipped ? card.back : card.front}
          </p>
          <p className="mt-12 text-xs font-bold opacity-50 uppercase tracking-widest">Tap the card to flip</p>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="w-full flex flex-wrap items-center justify-center gap-3 pt-8">
        <button
          onClick={() => { if (canPrev) { setIdx(i => i - 1); setFlipped(false); } }}
          disabled={!canPrev}
          className="flex items-center gap-2 px-6 py-3 border border-surface-container rounded-xl font-bold text-sm disabled:opacity-30 hover:bg-surface-container-low"
        >
          <ArrowLeft size={16} /> Previous
        </button>
        <button
          onClick={() => setFlipped(f => !f)}
          className="flex items-center gap-2 px-6 py-3 bg-surface-container text-on-surface rounded-xl font-bold text-sm hover:bg-surface-container-high"
        >
          <RotateCcw size={16} /> Flip
        </button>
        <button
          onClick={() => { if (canNext) { setIdx(i => i + 1); setFlipped(false); } }}
          disabled={!canNext}
          className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm disabled:opacity-30 hover:brightness-110"
        >
          Next <ArrowRight size={16} />
        </button>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs font-bold text-on-surface-variant">
        <Sparkles size={14} className="text-primary" /> {set.cards.length} flashcards
      </div>
    </motion.div>
  );
};
