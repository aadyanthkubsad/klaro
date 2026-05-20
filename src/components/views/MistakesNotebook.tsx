/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { XCircle, CheckCircle2, ArrowRight, Timer, Milestone, Rocket, Lightbulb } from 'lucide-react';
import { motion } from 'motion/react';
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
  // Two possible shapes:
  //  (a) New learningService MistakeEntry — has selectedAnswer + correctAnswer + explanation (already normalised to full text)
  //  (b) Legacy UserStats.mistakes — has userAnswer + correction blob to be parsed
  const newCorrect = m.correctAnswer || '';
  const newSelected = m.selectedAnswer || '';
  const newExplanation = m.explanation || '';

  let correctAnswer: string;
  let explanation: string;
  let userAnswer: string;

  if (newCorrect && (newExplanation || newCorrect.length > 2)) {
    // (a) New shape — fields already normalised
    correctAnswer = newCorrect;
    explanation   = newExplanation;
    userAnswer    = newSelected;
  } else {
    // (b) Legacy — parse "Correct Answer: A. Explanation text"
    const correctionText: string = m.correction || '';
    const correctMatch = correctionText.match(/^Correct(?:\s+Answer)?:\s*(.+?)\.?\s{1,2}(.*)$/s);
    correctAnswer = correctMatch ? correctMatch[1].trim() : correctionText;
    explanation   = correctMatch ? correctMatch[2].trim() : '';
    userAnswer    = m.userAnswer || '';
  }

  return (
    <div className="bg-white border border-surface-container rounded-2xl p-6 shadow-sm hover:border-rose-200 transition-all">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <span className="px-3 py-1 bg-surface-container-low text-on-surface-variant rounded-lg text-[10px] font-black uppercase tracking-wider">
          {mode.toUpperCase()} · {m.date}
        </span>
        {isRepeated && (
          <span className="flex items-center gap-1.5 text-rose-600 bg-rose-50 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border border-rose-100">
            <XCircle size={12} /> Repeated Mistake
          </span>
        )}
        {m.topic && (
          <span className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-black uppercase tracking-wider">
            {m.topic}
          </span>
        )}
      </div>

      {/* Question */}
      <h4 className="text-base font-bold text-on-surface mb-5 leading-snug">{m.question}</h4>

      {/* Answer comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
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
        <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex gap-3 mb-5">
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

export const MistakesNotebook = ({ stats, generateFocusedReview, goToAnalyticsWeakTopics, initialTopicFilter, onClearFilter }: MistakesNotebookProps) => {
  const [activeFilter, setActiveFilter] = useState('All');
  const [topicFilter, setTopicFilter] = useState<string | null>(initialTopicFilter ?? null);

  // Pull mistakes from the learningService localStorage store too
  const [loopMistakes, setLoopMistakes] = useState(() => getMistakes());
  useEffect(() => {
    const refresh = () => setLoopMistakes(getMistakes());
    refresh();
    return onLearningChange(refresh);
  }, []);

  const { filteredMistakes, questionCounts } = React.useMemo(() => {
    // Merge legacy + new, deduping by question text. New entries take priority because
    // they have normalised correctAnswerText/explanation fields.
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
    return { filteredMistakes: list, questionCounts: counts };
  }, [stats.mistakes, loopMistakes, activeFilter, topicFilter]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 pb-20 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2 mb-6">
        <div>
          <h2 className="text-4xl font-black text-on-surface tracking-tight mb-2">Mistakes Notebook</h2>
          <p className="text-on-surface-variant font-medium flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            Tracking {stats.mistakes.length} unmastered concepts
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
            × Clear Filter
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-12">
            <div className="space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-on-surface-variant">Recent Mistakes</h3>
              {filteredMistakes.length > 0 ? (
                filteredMistakes.map((m, i) => (
                  <MistakeCard key={`${m.mode}-${i}`} m={m} mode={m.mode} isRepeated={(questionCounts.get(m.question) ?? 0) > 1} />
                ))
              ) : (
                <div className="bg-white/50 border border-dashed border-surface-container rounded-[32px] p-8 text-center text-xs text-on-surface-variant font-medium">
                  No mistakes found.
                </div>
              )}
            </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="bg-navy-dark rounded-[32px] p-8 text-white shadow-xl relative overflow-hidden">
            <h3 className="text-xl font-black mb-6">Weak Topic Insights</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span>Total Errors Tracked</span>
                  <span>{stats.mistakes.length}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full bg-primary ${stats.mistakes.length > 0 ? 'w-full' : 'w-0'}`} />
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

          <div className="bg-white border border-surface-container rounded-[32px] p-8 shadow-sm hover:border-primary transition-all cursor-pointer group" onClick={goToAnalyticsWeakTopics}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xs font-black text-on-surface-variant group-hover:text-primary uppercase tracking-widest transition-colors">Active Weak Topics</h3>
              <ArrowRight size={16} className="text-on-surface-variant group-hover:text-primary transition-colors" />
            </div>
            <p className="text-sm font-medium text-on-surface-variant mb-8 leading-relaxed">
              You have <span className="font-bold text-teal-600">{stats.weakTopics.length} weak topics</span> overall. 
              Analyze them to generate targeted short notes, smart tips, and remediation quizzes.
            </p>
            <button className="w-full py-4 bg-surface-container-low text-on-surface-variant rounded-2xl font-black text-xs uppercase tracking-widest group-hover:bg-teal-50 group-hover:text-teal-800 transition-colors">
              Analyze in Analytics
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
