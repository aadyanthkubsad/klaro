/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { XCircle, CheckCircle2, ArrowRight, Rocket, Lightbulb, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserStats } from '../../types';
import { getMistakes, onLearningChange } from '../../services/learningService';

interface MistakesNotebookProps {
  stats: UserStats;
  generateFocusedReview?: () => void;
  goToAnalyticsWeakTopics?: () => void;
  initialTopicFilter?: string | null;
  onClearFilter?: () => void;
}


const MistakeCard = ({ m, mode, isRepeated }: { m: any, mode: string, isRepeated?: boolean }) => {
  const newCorrect = m.correctAnswer || '';
  const newSelected = m.selectedAnswer || '';
  const newExplanation = m.explanation || '';

  let correctAnswer: string;
  let explanation: string;
  let userAnswer: string;

  if (newCorrect && (newExplanation || newCorrect.length > 2)) {
    correctAnswer = newCorrect;
    explanation   = newExplanation;
    userAnswer    = newSelected;
  } else {
    const correctionText: string = m.correction || '';
    const correctMatch = correctionText.match(/^Correct(?:\s+Answer)?:\s*(.+?)\.?\s{1,2}(.*)$/s);
    correctAnswer = correctMatch ? correctMatch[1].trim() : correctionText;
    explanation   = correctMatch ? correctMatch[2].trim() : '';
    userAnswer    = m.userAnswer || '';
  }

  return (
    <div className="bg-white border border-surface-container rounded-2xl p-6 shadow-sm min-h-[280px] flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <span className="px-3 py-1 bg-surface-container-low text-on-surface-variant rounded-lg text-[10px] font-black uppercase tracking-wider">
          {mode.toUpperCase()} {m.date ? `· ${m.date}` : ''}
        </span>
        {isRepeated && (
          <span className="flex items-center gap-1.5 text-rose-600 bg-rose-50 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border border-rose-100">
            <XCircle size={12} /> Repeated
          </span>
        )}
      </div>

      {/* Question */}
      <h4 className="text-base font-bold text-on-surface mb-5 leading-snug">{m.question}</h4>

      {/* Answer comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
          <div className="text-[10px] font-black text-rose-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <XCircle size={12} /> Your Answer (Wrong)
          </div>
          <p className="text-sm font-semibold text-rose-900 leading-snug">
            {userAnswer || <span className="italic opacity-60">Not recorded</span>}
          </p>
        </div>
        <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl">
          <div className="text-[10px] font-black text-teal-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <CheckCircle2 size={12} /> Correct Answer
          </div>
          <p className="text-sm font-semibold text-teal-900 leading-snug">{correctAnswer}</p>
        </div>
      </div>

      {/* Explanation */}
      {explanation && (
        <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex gap-3 mt-auto">
          <Lightbulb size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-900 mb-1">Why?</p>
            <p className="text-xs text-amber-800/90 leading-relaxed">{explanation}</p>
          </div>
        </div>
      )}
    </div>
  );
};

/** Carousel for a single chapter's mistakes */
const ChapterCarousel = ({ chapter, mistakes, questionCounts }: { chapter: string, mistakes: any[], questionCounts: Map<string, number> }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const total = mistakes.length;
  const m = mistakes[currentIdx];

  const prev = () => setCurrentIdx(i => (i - 1 + total) % total);
  const next = () => setCurrentIdx(i => (i + 1) % total);

  return (
    <div className="bg-surface-container-low rounded-[28px] p-6 border border-surface-container">
      {/* Chapter header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen size={18} className="text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-black text-on-surface">{chapter}</h4>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{total} mistake{total !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={prev}
            disabled={total <= 1}
            className="w-9 h-9 rounded-xl bg-white border border-surface-container flex items-center justify-center hover:bg-surface-container-low disabled:opacity-30 transition-all shadow-sm"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-black text-on-surface-variant min-w-[48px] text-center">
            {currentIdx + 1} / {total}
          </span>
          <button
            onClick={next}
            disabled={total <= 1}
            className="w-9 h-9 rounded-xl bg-white border border-surface-container flex items-center justify-center hover:bg-surface-container-low disabled:opacity-30 transition-all shadow-sm"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Slide */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIdx}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.2 }}
        >
          <MistakeCard m={m} mode={m.mode} isRepeated={(questionCounts.get(m.question) ?? 0) > 1} />
        </motion.div>
      </AnimatePresence>

      {/* Dot indicators */}
      {total > 1 && total <= 12 && (
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {mistakes.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIdx(i)}
              className={`w-2 h-2 rounded-full transition-all ${i === currentIdx ? 'bg-primary w-5' : 'bg-surface-container-high hover:bg-on-surface-variant/30'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const MistakesNotebook = ({ stats, generateFocusedReview, goToAnalyticsWeakTopics, initialTopicFilter, onClearFilter }: MistakesNotebookProps) => {
  const [activeFilter, setActiveFilter] = useState('All');
  const [topicFilter, setTopicFilter] = useState<string | null>(initialTopicFilter ?? null);

  const [loopMistakes, setLoopMistakes] = useState(() => getMistakes());
  useEffect(() => {
    const refresh = () => setLoopMistakes(getMistakes());
    refresh();
    return onLearningChange(refresh);
  }, []);

  const { groupedByChapter, questionCounts } = React.useMemo(() => {
    const seen = new Set<string>();
    const merged: any[] = [];
    loopMistakes.forEach(m => {
      if (seen.has(m.question)) return;
      seen.add(m.question);
      merged.push({ ...m, mode: m.modeUsed === 'aural' ? 'aural' : m.modeUsed === 'visual' ? 'visual' : 'readwrite' });
    });
    [...stats.mistakes].reverse().forEach(m => {
      if (seen.has(m.question)) return;
      seen.add(m.question);
      merged.push(m);
    });

    let list = merged;
    if (activeFilter === 'Visual') list = list.filter(m => m.mode === 'visual');
    else if (activeFilter === 'Auditory') list = list.filter(m => m.mode === 'aural');
    else if (activeFilter === 'Read/Write') list = list.filter(m => m.mode === 'readwrite');
    if (topicFilter) list = list.filter(m => m.topic === topicFilter);

    const counts = new Map<string, number>();
    list.forEach(m => counts.set(m.question, (counts.get(m.question) ?? 0) + 1));

    // Group by chapter/topic
    const groups = new Map<string, any[]>();
    list.forEach(m => {
      const chapter = m.topic || m.topicTag || 'Uncategorised';
      if (!groups.has(chapter)) groups.set(chapter, []);
      groups.get(chapter)!.push(m);
    });

    return { groupedByChapter: groups, questionCounts: counts };
  }, [stats.mistakes, loopMistakes, activeFilter, topicFilter]);

  const totalMistakes = Array.from(groupedByChapter.values()).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 pb-20 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2 mb-6">
        <div>
          <h2 className="text-4xl font-black text-on-surface tracking-tight mb-2">Mistakes Notebook</h2>
          <p className="text-on-surface-variant font-medium flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            Tracking {totalMistakes} unmastered concepts across {groupedByChapter.size} chapter{groupedByChapter.size !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={generateFocusedReview}
          className="flex items-center gap-2 px-6 py-3 bg-teal-800 text-white rounded-xl font-bold hover:bg-teal-900 transition-colors"
        >
          <Rocket size={18} />
          Retest Weak Areas
        </button>
      </div>

      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {['All', 'Visual', 'Auditory', 'Read/Write'].map(topic => {
          const defaultColors = {
            'All': 'bg-gray-800 border-gray-900 text-white',
            'Visual': 'bg-amber-100 border-amber-200 text-amber-900',
            'Auditory': 'bg-purple-100 border-purple-200 text-purple-900',
            'Read/Write': 'bg-teal-100 border-teal-200 text-teal-900'
          };

          const isActive = activeFilter === topic;
          const style = defaultColors[topic as keyof typeof defaultColors];
          const activeStyle = isActive ? 'ring-2 ring-offset-2 ring-navy' : 'opacity-60 hover:opacity-100';

          return (
            <button
              key={topic}
              onClick={() => setActiveFilter(topic)}
              className={`px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border ${style} ${activeStyle}`}
            >
              {topic}
            </button>
          );
        })}
      </div>

      {topicFilter && (
        <div className="flex items-center gap-3 px-5 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-800 mb-2">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>Filtered by assessment: <span className="text-emerald-700 font-black">{topicFilter}</span></span>
          <button
            onClick={() => { setTopicFilter(null); onClearFilter?.(); }}
            className="ml-auto text-xs px-3 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg font-bold transition-colors"
          >
            &times; Clear Filter
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Chapter carousels */}
        <div className="lg:col-span-8 space-y-8">
          {groupedByChapter.size > 0 ? (
            Array.from(groupedByChapter.entries()).map(([chapter, mistakes]) => (
              <ChapterCarousel key={chapter} chapter={chapter} mistakes={mistakes} questionCounts={questionCounts} />
            ))
          ) : (
            <div className="bg-white/50 border border-dashed border-surface-container rounded-[32px] p-8 text-center text-xs text-on-surface-variant font-medium">
              No mistakes found.
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-8">
          {/* Weak Topic Insights */}
          <div className="bg-navy-dark rounded-[32px] p-8 text-white shadow-xl relative overflow-hidden">
            <h3 className="text-xl font-black mb-6">Weak Topic Insights</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span>Total Errors Tracked</span>
                  <span>{totalMistakes}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full bg-primary ${totalMistakes > 0 ? 'w-full' : 'w-0'}`} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span>Weakest Clusters</span>
                  <span>{stats.weakTopics.length} Topics</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full bg-teal-500 ${stats.weakTopics.length > 0 ? 'w-full' : 'w-0'}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Active Weak Topics — bright, flashy, black text */}
          <div
            className="bg-gradient-to-br from-amber-300 via-yellow-300 to-orange-300 border-2 border-amber-400 rounded-[32px] p-8 shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all cursor-pointer group"
            onClick={goToAnalyticsWeakTopics}
          >
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-sm font-black text-black uppercase tracking-widest">Active Weak Topics</h3>
              <div className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                <ArrowRight size={16} className="text-black" />
              </div>
            </div>
            <p className="text-sm font-semibold text-black/80 mb-6 leading-relaxed">
              You have <span className="font-black text-black">{stats.weakTopics.length} weak topics</span> overall.
              Analyze them to generate targeted short notes, smart tips, and remediation quizzes.
            </p>
            <button className="w-full py-4 bg-black text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-900 transition-colors shadow-md">
              Analyze in Analytics
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
