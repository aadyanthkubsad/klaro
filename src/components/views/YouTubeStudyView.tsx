/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * YouTubeStudyView — "Studied from YouTube? Test yourself here."
 *
 * Pro feature. Students enter the video topic and optionally paste
 * the transcript/notes. Lumina generates a full recall kit: summary,
 * key points, flashcards, 5-question quiz, weak-topic tags, and a
 * spaced revision task.
 *
 * Input: Topic (required) + Transcript (optional) + Output Language.
 * No YouTube URL input — the old URL-based flow caused wrong-topic
 * generation when transcript fetch failed.
 *
 * Result page features:
 *   - Carousel slides for Summary and Key Points (compact, equal-height cards)
 *   - Compact note-style selector that opens a bottom-sheet modal
 *   - Premium lavender Pro workspace background
 *   - Dedicated purple/indigo theme (scoped to this view only)
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Youtube, Sparkles, FileText, AlertTriangle, RefreshCw, BookOpen, Brain,
  CheckCircle2, MoreHorizontal, Globe, Info,
  FileStack, Layers, Grid3X3, Lightbulb, StickyNote, BarChart3,
  ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import { aiService, YouTubeRecallKit, QuizData } from '../../services/aiService';
import { NoteStyle, PlanType, GeneratedNotes } from '../../types';
import { StudyNotesPanel } from './StudyNotesPanel';

// ─── Props ───────────────────────────────────────────────────────────────────

interface YouTubeStudyViewProps {
  setView: (v: string) => void;
  onQuizReady: (quiz: QuizData) => void;
  onSaveToLibrary?: (item: any, kit?: any) => void;
  openFlashcards?: (topic: string, sourceKitId?: string, preloadedCards?: any[]) => void;
  isPro?: boolean;
  showPaywall?: (cfg: any) => void;
  onGenerateNotes?: (topic: string, noteStyle: NoteStyle) => void;
}

type Phase = 'input' | 'loading' | 'error' | 'result';

// ─── Carousel helpers ────────────────────────────────────────────────────────

function splitTextIntoSlides(text: string, sentencesPerSlide: number = 2): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const slides: string[] = [];
  for (let i = 0; i < sentences.length; i += sentencesPerSlide) {
    slides.push(sentences.slice(i, i + sentencesPerSlide).join(' ').trim());
  }
  return slides.length > 0 ? slides : [text];
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

const SlideCarousel: React.FC<{ slides: React.ReactNode[] }> = ({ slides }) => {
  const [current, setCurrent] = useState(0);
  const total = slides.length;

  if (total <= 1) return <>{slides[0]}</>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.15 }}
          >
            {slides[current]}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-indigo-50">
        <button
          onClick={() => setCurrent(p => Math.max(0, p - 1))}
          disabled={current === 0}
          className="p-1 rounded-lg hover:bg-indigo-50 disabled:opacity-25 transition-all"
        >
          <ChevronLeft size={14} className="text-indigo-400" />
        </button>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === current
                  ? 'bg-indigo-500 w-4'
                  : 'bg-indigo-200 w-1.5 hover:bg-indigo-300'
              }`}
            />
          ))}
        </div>
        <button
          onClick={() => setCurrent(p => Math.min(total - 1, p + 1))}
          disabled={current === total - 1}
          className="p-1 rounded-lg hover:bg-indigo-50 disabled:opacity-25 transition-all"
        >
          <ChevronRight size={14} className="text-indigo-400" />
        </button>
      </div>
    </div>
  );
};

// ─── Constants ───────────────────────────────────────────────────────────────

const KEY_POINT_COLORS = [
  'bg-orange-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-amber-600',
  'bg-orange-600',
];

const NOTE_STYLES: { id: NoteStyle; shortLabel: string; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'smart',           shortLabel: 'Smart',       label: 'Smart Notes',       icon: <Lightbulb size={20} />, desc: 'All-in-one comprehensive' },
  { id: 'cornell',         shortLabel: 'Cornell',     label: 'Cornell Notes',     icon: <FileStack size={20} />, desc: 'Two-column academic format' },
  { id: 'outline',         shortLabel: 'Outline',     label: 'Outline Notes',     icon: <Layers size={20} />,    desc: 'Hierarchical exam revision' },
  { id: 'comparison',      shortLabel: 'Table',       label: 'Comparison Table',  icon: <BarChart3 size={20} />, desc: 'Table-driven comparisons' },
  { id: 'recall',          shortLabel: 'Recall',      label: 'Recall Notes',      icon: <Brain size={20} />,     desc: 'Active recall & repetition' },
  { id: 'concept-map',     shortLabel: 'Concept Map', label: 'Concept Map',       icon: <StickyNote size={20} />,desc: 'Relationship-focused mind map' },
  { id: 'knowledge-cards', shortLabel: 'Atomic',      label: 'Atomic Notes',      icon: <Grid3X3 size={20} />,   desc: 'One idea per card' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export const YouTubeStudyView = ({
  setView, onQuizReady, onSaveToLibrary, openFlashcards,
  isPro = false, showPaywall, onGenerateNotes,
}: YouTubeStudyViewProps) => {
  // ── State ───────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('input');
  const [topicInput, setTopicInput] = useState('');
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [recallKit, setRecallKit] = useState<YouTubeRecallKit | null>(null);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedNoteStyle, setSelectedNoteStyle] = useState<NoteStyle>('smart');
  const [outputLanguage, setOutputLanguage] = useState<'en' | 'hi' | 'auto'>('en');

  // Topic is required (at least 3 chars)
  const canSubmit = topicInput.trim().length >= 3 && phase !== 'loading';

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleProGate = (): boolean => {
    // Plus users get 5/month, Pro gets 30/month, Free gets 0
    if (isPro) return true; // Pro always passes (limit checked by counter below)
    if (showPaywall) {
      showPaywall({
        title: 'Unlock YouTube Recall',
        description: 'Turn any YouTube video into a recall quiz, flashcards, and revision plan. Available on Plus (5/month) and Exam Pro (30/month).',
        ctaLabel: 'Upgrade to Plus — ₹249/mo',
        requiredPlan: 'plus' as const,
        secondaryLabel: 'Not now',
        benefits: [
          'YouTube video → full recall kit',
          'Summary, flashcards, and quiz generated',
          'Cornell, Outline, Atomic note styles',
          'Spaced revision tasks auto-created',
          'Weak-topic tags for focused study',
        ],
      });
    }
    return false;
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!handleProGate()) return;

    // Clear stale state before every new generation
    setRecallKit(null);
    setSavedToLibrary(false);
    setErrorMsg('');
    setPhase('loading');

    try {
      const kit = await aiService.generateYouTubeRecall({
        topic: topicInput.trim(),
        videoTitle: topicInput.trim(),
        transcript: transcript.trim() || undefined,
        classLevel: 'Class 10',
        examMode: 'CBSE',
        outputLanguage,
      });
      setRecallKit(kit);
      setPhase('result');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not generate recall kit. Please try again.');
      setPhase('error');
    }
  };

  const handleStartQuiz = () => {
    if (!recallKit) return;
    const quizData: QuizData = {
      title: recallKit.title,
      questions: recallKit.quiz.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        topicTag: q.topicTag,
      })),
    };
    onQuizReady(quizData);
  };

  const handleOpenFlashcards = () => {
    if (!recallKit || !openFlashcards) return;
    openFlashcards(recallKit.title, undefined, recallKit.flashcards);
  };

  const handleSaveToLibrary = () => {
    if (!recallKit || !onSaveToLibrary) return;
    onSaveToLibrary(
      {
        title: recallKit.title,
        type: 'revision-kit',
        tags: ['YouTube', 'CBSE', 'Class 10'],
        contentSnippet: recallKit.summary.substring(0, 120),
      },
      recallKit,
    );
    setSavedToLibrary(true);
  };

  const handleAddToTasks = () => {
    setView('todo');
  };

  const handleNoteStyleClick = (style: NoteStyle) => {
    setSelectedNoteStyle(style);
    setNotesModalOpen(true);
  };

  const handleReset = () => {
    setPhase('input');
    setRecallKit(null);
    setTopicInput('');
    setTranscript('');
    setSavedToLibrary(false);
    setNotesModalOpen(false);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ══ LOADING STATE ═════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════

  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6" style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #e0e7ff 100%)' }}>
        <div className="relative">
          <div className="w-32 h-32 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <Youtube size={48} className="absolute inset-0 m-auto text-indigo-600" />
        </div>
        <div className="text-center space-y-3">
          <p className="text-indigo-700 font-bold uppercase tracking-widest text-lg animate-pulse">
            Building your YouTube Recall Kit…
          </p>
          <p className="text-sm text-indigo-400">Generating summary, flashcards, quiz, and revision plan</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ══ RESULT STATE — PREMIUM LAVENDER PRO WORKSPACE ═════════════════════
  // ══════════════════════════════════════════════════════════════════════════

  if (phase === 'result' && recallKit) {
    const summarySlides = splitTextIntoSlides(recallKit.summary, 2);
    const keyPointChunks = chunkArray(recallKit.keyPoints.slice(0, 6), 2);

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="min-h-screen"
        style={{ background: 'linear-gradient(180deg, #ede9fe 0%, #f5f3ff 25%, #faf9fe 55%, #ffffff 100%)' }}
      >
        <div className="max-w-5xl mx-auto px-6 md:px-10 pt-10 pb-20">

          {/* ── Pro Badge + Title ──────────────────────────────────────── */}
          <div className="text-center mb-10 space-y-3">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-600/10 border border-indigo-200/60">
              <Youtube size={14} className="text-indigo-600" />
              <span className="text-[11px] font-black uppercase tracking-widest text-indigo-600">
                YouTube Recall Kit · Exam Pro
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-gray-900">
              {recallKit.title}
            </h1>
          </div>

          {/* ── Source Confidence Banner ────────────────────────────────── */}
          {(recallKit.sourceConfidence === 'title-only' || recallKit.sourceConfidence === 'manual-topic') && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 flex items-start gap-3">
              <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-900">
                  Based on: topic — "{recallKit.detectedTopic || recallKit.title}"
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  No transcript was provided, so this kit is based on the topic and standard curriculum. For more accurate results, paste the video transcript next time.
                </p>
              </div>
            </div>
          )}
          {recallKit.sourceConfidence === 'user-notes' && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-5 flex items-start gap-3">
              <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-blue-900">Based on: your pasted notes</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  This kit is based on the brief notes you provided. For a more detailed kit, paste the full video transcript.
                </p>
              </div>
            </div>
          )}
          {recallKit.sourceConfidence === 'full-transcript' && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-5 flex items-start gap-3">
              <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-green-900">Based on: full transcript</p>
                <p className="text-xs text-green-700 mt-0.5">
                  This kit was generated from the complete video transcript for maximum accuracy.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-5">

            {/* ── Row 1: Summary (carousel) + Key Points (carousel) ────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Quick Summary */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-indigo-100/60 min-h-[210px] flex flex-col">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-indigo-500 mb-3 flex items-center gap-1.5 shrink-0">
                  <BookOpen size={14} /> Quick Summary
                </h2>
                <div className="flex-1 flex flex-col">
                  <SlideCarousel
                    slides={summarySlides.map((slide, i) => (
                      <p key={i} className="text-[13px] text-gray-700 leading-relaxed">{slide}</p>
                    ))}
                  />
                </div>
              </div>

              {/* Key Points */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-indigo-100/60 min-h-[210px] flex flex-col">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-indigo-500 mb-3 flex items-center gap-1.5 shrink-0">
                  <Sparkles size={14} className="text-orange-500" /> Key Points
                </h2>
                <div className="flex-1 flex flex-col">
                  <SlideCarousel
                    slides={keyPointChunks.map((chunk, slideIdx) => (
                      <div key={slideIdx} className="space-y-3">
                        {chunk.map((kp, j) => {
                          const globalIdx = slideIdx * 2 + j;
                          return (
                            <div key={j} className="flex items-start gap-3">
                              <span className={`w-7 h-7 rounded-full ${KEY_POINT_COLORS[globalIdx % KEY_POINT_COLORS.length]} text-white text-xs font-black flex items-center justify-center shrink-0`}>
                                {globalIdx + 1}
                              </span>
                              <span className="text-[13px] text-gray-700 leading-snug pt-0.5">{kp}</span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  />
                </div>
              </div>
            </div>

            {/* ── Row 2: Flashcards + Quiz ─────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Flashcards */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-indigo-100/60">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[11px] font-black uppercase tracking-widest text-indigo-500">
                    Flashcards ({recallKit.flashcards.length})
                  </h2>
                  <button onClick={handleOpenFlashcards} className="text-indigo-300 hover:text-indigo-500 transition-colors">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
                {recallKit.flashcards.slice(0, 1).map((fc, i) => (
                  <div key={i} className="bg-indigo-50/50 rounded-xl p-3.5 border border-indigo-100/50">
                    <p className="text-sm font-bold text-gray-800">{fc.front}</p>
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{fc.back}</p>
                  </div>
                ))}
              </div>

              {/* Quiz Preview */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-indigo-100/60">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[11px] font-black uppercase tracking-widest text-indigo-500">
                    Recall Quiz ({recallKit.quiz.length} Questions)
                  </h2>
                  <button onClick={handleStartQuiz} className="text-indigo-300 hover:text-indigo-500 transition-colors">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
                {recallKit.quiz.slice(0, 1).map((q, i) => (
                  <div key={i} className="bg-indigo-50/50 rounded-xl p-3.5 border border-indigo-100/50">
                    <p className="text-sm font-semibold text-gray-800">{q.question}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Study Notes Selector (compact buttons → opens modal) ── */}
            {isPro && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-indigo-100/60">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-indigo-500 mb-1">
                  Generate Study Notes
                </h2>
                <p className="text-xs text-gray-400 mb-4">Choose a note format to open the Study Workspace</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {NOTE_STYLES.map((ns) => (
                    <button
                      key={ns.id}
                      onClick={() => handleNoteStyleClick(ns.id)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-indigo-100/80 bg-indigo-50/30 hover:bg-indigo-100/60 hover:border-indigo-300 hover:shadow-sm transition-all group"
                    >
                      <span className="text-indigo-400 group-hover:text-indigo-600 transition-colors">{ns.icon}</span>
                      <span className="text-[10px] font-bold text-gray-500 group-hover:text-indigo-700 transition-colors text-center leading-tight">{ns.shortLabel}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Focus Topics ─────────────────────────────────────────── */}
            {recallKit.weakTopicTags.length > 0 && (
              <div>
                <h2 className="text-[11px] font-black uppercase tracking-widest text-indigo-500 mb-2.5">
                  Focus Topics
                </h2>
                <div className="flex flex-wrap gap-2">
                  {recallKit.weakTopicTags.map((tag, i) => (
                    <span key={i} className="px-4 py-1.5 bg-indigo-600 text-white rounded-full text-xs font-bold shadow-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── CTA Buttons ──────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <button
                onClick={handleStartQuiz}
                className="w-full sm:w-auto px-8 py-3.5 bg-indigo-700 text-white rounded-full font-black uppercase tracking-widest text-xs hover:bg-indigo-800 transition-all shadow-md shadow-indigo-200"
              >
                Start Recall Quiz
              </button>
              {openFlashcards && (
                <button
                  onClick={handleOpenFlashcards}
                  className="w-full sm:w-auto px-6 py-3 bg-white border border-indigo-200 rounded-full font-bold text-xs text-indigo-700 hover:bg-indigo-50 transition-all"
                >
                  Open Flashcards
                </button>
              )}
              {onSaveToLibrary && (
                <button
                  onClick={handleSaveToLibrary}
                  disabled={savedToLibrary}
                  className="w-full sm:w-auto px-6 py-3 bg-white border border-indigo-200 rounded-full font-bold text-xs text-indigo-700 hover:bg-indigo-50 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {savedToLibrary && <CheckCircle2 size={12} className="text-green-600" />}
                  {savedToLibrary ? 'Saved' : 'Save to Library'}
                </button>
              )}
              <button
                onClick={handleAddToTasks}
                className="w-full sm:w-auto px-6 py-3 bg-white border border-indigo-200 rounded-full font-bold text-xs text-indigo-700 hover:bg-indigo-50 transition-all"
              >
                Add to Daily Tasks
              </button>
            </div>

            {/* ── Try Another Video ─────────────────────────────────────── */}
            <div className="text-center pt-2 pb-4">
              <button
                onClick={handleReset}
                className="text-sm text-indigo-400 hover:text-indigo-600 font-medium underline underline-offset-2 transition-colors"
              >
                Try Another Video
              </button>
            </div>
          </div>
        </div>

        {/* ── Notes Modal (Bottom-Sheet Drawer) ──────────────────────────── */}
        <AnimatePresence>
          {notesModalOpen && (
            <motion.div
              className="fixed inset-0 z-[100]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
                onClick={() => setNotesModalOpen(false)}
              />
              {/* Bottom Sheet */}
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="absolute bottom-0 left-0 right-0 max-h-[88vh] bg-white rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
              >
                {/* Sheet header */}
                <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 pt-3 pb-4 shrink-0">
                  <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-3" />
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-black text-gray-900">Study Notes</h3>
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[260px] sm:max-w-none">{recallKit.title}</p>
                    </div>
                    <button
                      onClick={() => setNotesModalOpen(false)}
                      className="p-2 rounded-xl hover:bg-gray-100 transition-colors shrink-0 ml-4"
                    >
                      <X size={18} className="text-gray-400" />
                    </button>
                  </div>
                </div>
                {/* Sheet body */}
                <div className="flex-1 overflow-y-auto p-6">
                  <StudyNotesPanel
                    key={selectedNoteStyle}
                    kit={{
                      title: recallKit.title,
                      chapterTitle: recallKit.title,
                      subject: 'General',
                      classLevel: 'Class 10',
                      examMode: 'CBSE',
                      sourceContent: [
                        transcript.trim() ? `Video Transcript:\n${transcript.trim()}` : '',
                        `Video Summary: ${recallKit.summary}`,
                        `Key Points:\n${recallKit.keyPoints.map((kp, i) => `${i + 1}. ${kp}`).join('\n')}`,
                      ].filter(Boolean).join('\n\n'),
                    }}
                    planType={'pro' as PlanType}
                    initialStyle={selectedNoteStyle}
                    onOpenFlashcards={openFlashcards ? () => openFlashcards(recallKit.title, undefined, recallKit.flashcards) : undefined}
                    onGoToQuiz={() => { setNotesModalOpen(false); handleStartQuiz(); }}
                    onSave={(notes: GeneratedNotes) => onSaveToLibrary?.({
                      title: `Notes: ${notes.topic}`,
                      type: 'readwrite',
                      contentSnippet: notes.summary?.substring(0, 120) || '',
                    })}
                    onPaywall={showPaywall}
                  />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ══ INPUT STATE ═══════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto pb-20 space-y-6"
    >
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-50 text-rose-600">
          <Youtube size={26} />
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-on-surface">
          Studied from YouTube? Test yourself here.
        </h1>
        <p className="text-on-surface-variant font-medium max-w-lg mx-auto">
          Enter the video topic and paste the transcript. Lumina will turn it into a recall quiz, flashcards, and revision plan.
        </p>
        {!isPro && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase tracking-widest">
            Plus / Exam Pro Feature
          </div>
        )}
      </div>

      <div className="bg-white border border-surface-container rounded-[24px] p-6 space-y-5 shadow-sm">
        {/* ── Topic input (required) ─────────────────────────────────── */}
        <div>
          <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant block mb-2">
            Video Topic <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            placeholder="e.g. Electricity, Photosynthesis, Quadratic Equations"
            className="w-full bg-surface-container-lowest border border-surface-container rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) handleSubmit();
            }}
          />
          <p className="text-[11px] text-on-surface-variant mt-1.5">
            Enter the chapter or topic from the YouTube video you watched.
          </p>
        </div>

        {/* ── Transcript / Notes (optional but encouraged) ───────────── */}
        <div>
          <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant block mb-2">
            Video Transcript or Notes{' '}
            <span className="font-medium text-on-surface-variant/60 normal-case tracking-normal">
              (optional — improves accuracy)
            </span>
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={"How to get the transcript:\n1. Open your YouTube video\n2. Click \"...\" (More) below the video\n3. Click \"Show transcript\"\n4. Copy all the text and paste it here\n\nYou can also paste your own handwritten notes from the video."}
            rows={8}
            className="w-full bg-surface-container-lowest border border-surface-container rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary resize-none"
          />
          {transcript.trim().length > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-green-600" />
              <span className="text-[11px] text-green-700 font-medium">
                {transcript.trim().length > 200
                  ? `Transcript added (${transcript.trim().length} characters) — great, this will produce a detailed kit!`
                  : `Notes added (${transcript.trim().length} characters) — for best results, paste the full transcript.`
                }
              </span>
            </div>
          )}
          {transcript.trim().length === 0 && (
            <div className="mt-2 flex items-start gap-1.5 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
              <Info size={12} className="text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-700">
                Without a transcript, the kit will be based on the topic and standard curriculum only. Pasting the transcript makes the quiz and flashcards much more accurate.
              </p>
            </div>
          )}
        </div>

        {/* ── Output Language Selector ────────────────────────────────── */}
        <div>
          <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant block mb-2 flex items-center gap-1.5">
            <Globe size={12} /> Output Language
          </label>
          <div className="flex gap-2">
            {([
              { value: 'en' as const, label: 'English', desc: 'Kit in English (even if video was in Hindi)' },
              { value: 'hi' as const, label: 'Hindi', desc: 'Kit in Hindi (Devanagari)' },
              { value: 'auto' as const, label: 'Same as video', desc: 'Match the language of the transcript' },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setOutputLanguage(opt.value)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                  outputLanguage === opt.value
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-surface-container-lowest border-surface-container text-on-surface-variant hover:border-primary/40'
                }`}
                title={opt.desc}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-on-surface-variant mt-1.5">
            {outputLanguage === 'en' && 'The recall kit will be generated in English, even if the video or transcript is in Hindi.'}
            {outputLanguage === 'hi' && 'The recall kit will be generated in Hindi (Devanagari). Scientific terms stay in English.'}
            {outputLanguage === 'auto' && 'The kit will match the language of your transcript. Defaults to English if no transcript is provided.'}
          </p>
        </div>

        {/* ── Generate Button ─────────────────────────────────────────── */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-4 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-md hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Sparkles size={16} /> Generate YouTube Recall Kit
        </button>

        {/* ── Error ───────────────────────────────────────────────────── */}
        {phase === 'error' && (
          <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl">
            <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-rose-900">{errorMsg}</p>
              <button
                onClick={handleSubmit}
                className="mt-2 text-xs font-bold text-rose-700 hover:underline flex items-center gap-1"
              >
                <RefreshCw size={12} /> Try again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── What you'll get ────────────────────────────────────────────── */}
      <div className="bg-surface-container-low rounded-[24px] p-5">
        <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <FileText size={12} /> What you'll get
        </p>
        <ul className="space-y-2 text-sm text-on-surface">
          <li className="flex gap-2"><span className="text-primary font-black">1.</span> Quick summary + key points from the video</li>
          <li className="flex gap-2"><span className="text-primary font-black">2.</span> 8+ flashcards for active recall</li>
          <li className="flex gap-2"><span className="text-primary font-black">3.</span> 5 MCQs to test what you actually remember</li>
          <li className="flex gap-2"><span className="text-primary font-black">4.</span> Cornell, Outline, Atomic and more note styles</li>
          <li className="flex gap-2"><span className="text-primary font-black">5.</span> Spaced revision task created automatically</li>
        </ul>
      </div>

      <button
        onClick={() => setView('dashboard')}
        className="w-full py-3 text-on-surface-variant font-bold text-sm hover:bg-surface-container-low rounded-xl"
      >
        Back to Dashboard
      </button>
    </motion.div>
  );
};

export default YouTubeStudyView;
