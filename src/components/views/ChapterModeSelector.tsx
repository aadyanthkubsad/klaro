/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ChapterModeSelector — modal shown after a student clicks a chapter card
 * in Library.
 *
 * Step 1: Pick a learning mode (Visual / Read–Write / Audio / Practice Quiz).
 * Step 2 (Hindi chapters only): Pick the content language (हिंदी / English).
 *         Hindi is the default and shown first; English is offered as a
 *         secondary option per the Class 10 Hindi syllabus design.
 *
 * Once both steps are resolved we call onPickMode upstream, which reuses
 * a saved kit (matched by chapter + language) or generates a fresh one.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Eye, Headphones, FileText, Target, X, BookOpen, Loader2, RefreshCw, AlertCircle,
  Languages, ArrowLeft,
} from 'lucide-react';
import { ChapterItem, ChapterMode } from '../../data/class10Syllabus';

interface ChapterModeSelectorProps {
  chapter: ChapterItem | null;
  /** True if this chapter already has a saved kit — surfaces a Regenerate option. */
  hasExistingKit?: boolean;
  /** Loading + error states surfaced from the upstream generator. */
  isGenerating?: boolean;
  generationError?: string | null;
  onPickMode: (
    mode: ChapterMode,
    opts?: { regenerate?: boolean; language?: 'hi' | 'en' },
  ) => void;
  onClose: () => void;
  onRetry?: () => void;
}

const MODE_META: Record<ChapterMode, {
  label: string;
  category: string;
  desc: string;
  icon: React.ComponentType<any>;
  hex: string;
}> = {
  visual: {
    label: 'Visual',
    category: 'See it',
    desc: 'Mind map, flowchart, diagrams, visual summary cards & flashcards.',
    icon: Eye,
    hex: '#FACC15',
  },
  readwrite: {
    label: 'Read / Write',
    category: 'Read it',
    desc: 'Summary, key points, definitions, short-answer questions & flashcards.',
    icon: FileText,
    hex: '#2DE2C8',
  },
  audio: {
    label: 'Aural',
    category: 'Hear it',
    desc: 'Audio-style explanation, lecture notes, key vocabulary & a hub quiz.',
    icon: Headphones,
    hex: '#C4B5FD',
  },
  practice: {
    label: 'Practice Quiz',
    category: 'Test it',
    desc: 'CBSE-style MCQs, score tracking, mistake notebook & analytics.',
    icon: Target,
    hex: '#A855F7',
  },
};

const ModeCard: React.FC<{
  mode: string;
  meta: (typeof MODE_META)[ChapterMode];
  onClick: () => void;
}> = ({ meta, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const c = meta.hex;
  const Icon = meta.icon;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="mode-card p-5 rounded-2xl border-l-4 flex flex-col items-start text-left hover:-translate-y-1 group"
      style={{
        borderLeftColor: c,
        borderTopColor: hovered ? `${c}8C` : `${c}4D`,
        borderRightColor: hovered ? `${c}8C` : `${c}4D`,
        borderBottomColor: hovered ? `${c}8C` : `${c}4D`,
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        backgroundColor: `${c}0A`,
        boxShadow: hovered ? `0 4px 24px -4px ${c}40` : 'none',
      }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
        style={{ backgroundColor: `${c}24`, color: c }}
      >
        <Icon size={22} />
      </div>
      <span
        className="text-[10px] font-black uppercase tracking-widest"
        style={{ color: c }}
      >
        {meta.category}
      </span>
      <h4 className="text-lg font-black mt-0.5 text-on-surface group-hover:text-primary transition-colors">
        {meta.label}
      </h4>
      <p className="text-xs text-on-surface-variant font-medium mt-2 leading-relaxed">
        {meta.desc}
      </p>
    </button>
  );
};

export const ChapterModeSelector = ({
  chapter,
  hasExistingKit,
  isGenerating,
  generationError,
  onPickMode,
  onClose,
  onRetry,
}: ChapterModeSelectorProps) => {
  const isHindiChapter = chapter?.subject === 'Hindi';
  const [pendingMode, setPendingMode] = useState<ChapterMode | null>(null);

  // Reset the inner step every time the modal closes / chapter changes.
  useEffect(() => {
    if (!chapter) setPendingMode(null);
  }, [chapter]);

  const handleModeClick = (mode: ChapterMode) => {
    if (isHindiChapter) {
      // Hindi chapters → defer generation until the student picks a language.
      setPendingMode(mode);
    } else {
      onPickMode(mode);
    }
  };

  const handleLanguagePick = (language: 'hi' | 'en') => {
    if (!pendingMode) return;
    onPickMode(pendingMode, { language });
  };

  const showLanguageStep =
    isHindiChapter && pendingMode !== null && !isGenerating && !generationError;

  return (
    <AnimatePresence>
      {chapter && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            className="bg-white rounded-[28px] p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <button
              aria-label="Close"
              onClick={onClose}
              className="absolute top-5 right-5 w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
            >
              <X size={18} />
            </button>

            <div className="flex items-start gap-3 mb-6 pr-10">
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <BookOpen size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  {chapter.subject}
                  {chapter.book ? ` · ${chapter.book}` : ''} · {chapter.classLevel} · {chapter.board} · {chapter.academicYear}
                </p>
                <h3 className="text-2xl font-black text-on-surface leading-snug">
                  {chapter.chapterTitle}
                </h3>
                <p className="text-xs text-on-surface-variant font-medium mt-1">
                  {showLanguageStep
                    ? 'यह हिंदी पाठ है — पाठ्य-सामग्री की भाषा चुनें। हिंदी (देवनागरी) प्राथमिक भाषा है।'
                    : isHindiChapter
                      ? 'अध्ययन का तरीका चुनें। आपकी रिवीज़न किट बनाकर लाइब्रेरी में सहेजी जाएगी।'
                      : 'Pick how you want to learn. Your revision kit will be generated and saved to your Library.'}
                </p>
              </div>
            </div>

            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Loader2 size={36} className="text-primary animate-spin mb-3" />
                <p className="text-sm font-bold text-on-surface">
                  Generating your chapter revision kit...
                </p>
                <p className="text-xs text-on-surface-variant font-medium mt-1 max-w-sm">
                  This usually takes 10-30 seconds. We're aligning the kit with {chapter.board || 'CBSE'} {chapter.classLevel || 'Class 10'} syllabus. If the AI is busy, we'll retry automatically.
                </p>
              </div>
            ) : generationError ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <AlertCircle size={32} className="text-rose-500 mb-3" />
                <p className="text-sm font-bold text-on-surface mb-1">Couldn't generate the kit</p>
                <p className="text-xs text-on-surface-variant font-medium max-w-sm mb-5">
                  {generationError}
                </p>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest"
                  >
                    <RefreshCw size={14} /> Retry
                  </button>
                )}
              </div>
            ) : showLanguageStep ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setPendingMode(null)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-on-surface-variant hover:text-on-surface"
                  >
                    <ArrowLeft size={12} /> Change mode
                  </button>
                  <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70">
                    · Step 2 of 2
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => handleLanguagePick('hi')}
                    className="p-5 rounded-2xl border border-surface-container border-l-4 border-l-amber-500 bg-amber-50 flex flex-col items-start text-left transition-all hover:-translate-y-1 hover:shadow-md group"
                  >
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3 bg-amber-100 text-amber-700">
                      <Languages size={22} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                      Primary
                    </span>
                    <h4 className="text-lg font-black mt-0.5 text-on-surface">हिंदी (Devanagari)</h4>
                    <p className="text-xs text-on-surface-variant font-medium mt-2 leading-relaxed">
                      इस पाठ के लिए अनुशंसित। सारांश, मुख्य बिंदु, शब्दावली, फ्लैशकार्ड और प्रश्नोत्तरी — सब कुछ देवनागरी हिंदी में।
                    </p>
                  </button>

                  <button
                    onClick={() => handleLanguagePick('en')}
                    className="p-5 rounded-2xl border border-surface-container border-l-4 border-l-indigo-500 bg-indigo-50 flex flex-col items-start text-left transition-all hover:-translate-y-1 hover:shadow-md group"
                  >
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3 bg-indigo-100 text-indigo-700">
                      <Languages size={22} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
                      Secondary
                    </span>
                    <h4 className="text-lg font-black mt-0.5 text-on-surface">English</h4>
                    <p className="text-xs text-on-surface-variant font-medium mt-2 leading-relaxed">
                      Secondary option — study this Hindi chapter with English explanations. You can regenerate in Hindi any time.
                    </p>
                  </button>
                </div>
              </>
            ) : (
              <>
                {chapter.syllabusStatus === 'needs-review' && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 mb-4">
                    <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 font-medium leading-relaxed">
                      This chapter may need syllabus verification for the current academic year ({chapter.academicYear}). Content will still be generated but may not reflect the latest CBSE curriculum.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(['visual', 'readwrite', 'audio', 'practice'] as ChapterMode[])
                    .filter(m => chapter.availableModes.includes(m))
                    .map(m => (
                      <ModeCard key={m} mode={m} meta={MODE_META[m]} onClick={() => handleModeClick(m)} />
                    ))}
                </div>

                {isHindiChapter && (
                  <p className="mt-4 text-[11px] text-on-surface-variant font-bold text-center">
                    मोड चुनने के बाद आप हिंदी (देवनागरी) या English में से एक भाषा चुनेंगे।
                  </p>
                )}

                {hasExistingKit && (
                  <div className="mt-5 flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container-low">
                    <p className="text-[11px] text-on-surface-variant font-bold">
                      A saved kit exists for this chapter — clicking a mode reuses it instantly.
                    </p>
                    <button
                      onClick={() => onPickMode('readwrite', { regenerate: true })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-surface-container text-on-surface text-[11px] font-black uppercase tracking-widest hover:border-primary/30"
                      title="Discard the saved kit and ask Gemini to generate a fresh one"
                    >
                      <RefreshCw size={11} /> Regenerate
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
