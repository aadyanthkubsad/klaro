/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Library, RotateCcw, Network, Lightbulb, Sparkles, ClipboardCheck, Download, GitBranch, Layers, ArrowRight, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AIGuide } from '../common/AIGuide';
import { EnglishGlossPanel } from '../common/EnglishGlossPanel';
import { exportKitToPDF, setLastLearningMode } from '../../lib/pdfExport';
import { UserStats } from '../../types';

interface VisualHubProps {
  setView: (v: string) => void;
  onSave: (item: any) => void;
  kit?: any;
  stats: UserStats;
  saveMistake: (mistake: { question: string, userAnswer: string, correction: string, mode: 'visual' | 'aural' | 'readwrite', topic: string }) => void;
  openFlashcards?: (topic: string, sourceKitId?: string) => void;
  openPremium3D?: () => void;
  isPro?: boolean;
}

// ─── Formula Carousel for Visual Hub ─────────────────────────────────────────

const VIS_FORMULAS_PER_PAGE = 4;

const VisualFormulaCarousel: React.FC<{ formulas: any[] }> = ({ formulas }) => {
  const [fPage, setFPage] = useState(0);
  const totalPages = Math.ceil(formulas.length / VIS_FORMULAS_PER_PAGE);
  const start = fPage * VIS_FORMULAS_PER_PAGE;
  const visible = formulas.slice(start, start + VIS_FORMULAS_PER_PAGE);

  return (
    <div className="bg-white border-2 border-surface-container-high rounded-3xl overflow-hidden">
      <div className="px-6 md:px-10 py-6 flex items-center gap-3">
        <div className="p-2.5 bg-emerald-500 text-white rounded-xl">
          <Layers size={20} />
        </div>
        <div>
          <h3 className="text-xl font-black text-on-surface">Formula Revision</h3>
          <p className="text-xs text-on-surface-variant font-medium">Quick-scan formulas and key facts</p>
        </div>
        <span className="ml-auto px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-black">{formulas.length} formulas</span>
      </div>

      <div className="relative">
        <button
          onClick={() => totalPages > 1 && setFPage(p => (p - 1 + totalPages) % totalPages)}
          className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all ${totalPages > 1 ? 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer' : 'bg-emerald-200 text-emerald-400 cursor-default'}`}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => totalPages > 1 && setFPage(p => (p + 1) % totalPages)}
          className={`absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all ${totalPages > 1 ? 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer' : 'bg-emerald-200 text-emerald-400 cursor-default'}`}
        >
          <ChevronRight size={18} />
        </button>

        <div className="px-12 md:px-16 pb-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={fPage}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ duration: 0.25 }}
              className="overflow-x-auto"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-emerald-50 border-b-2 border-emerald-200">
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-emerald-700">Name</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-emerald-700">Formula / Rule</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-emerald-700">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row: any, i: number) => (
                    <tr key={i} className={`border-b border-surface-container-high ${i % 2 === 0 ? 'bg-white' : 'bg-emerald-50/30'}`}>
                      <td className="px-4 py-3 text-xs font-bold text-on-surface whitespace-nowrap">{row.name}</td>
                      <td className="px-4 py-3 text-xs text-on-surface font-mono font-semibold">{row.formula}</td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant leading-relaxed">{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 pb-4 border-t border-surface-container-high pt-3 mx-6 md:mx-10">
        <div className="flex gap-1.5 items-center">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setFPage(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${i === fPage ? 'bg-emerald-500 scale-110' : 'bg-emerald-200 hover:bg-emerald-300'}`}
            />
          ))}
        </div>
        <span className="text-[10px] text-emerald-600 font-bold ml-2">{fPage + 1} / {totalPages}</span>
      </div>
    </div>
  );
};

// ─── Color palette for mind map branches ───────────────────────────────────
const BRANCH_STYLES = [
  { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   accent: 'bg-blue-500',   titleColor: 'text-blue-600',   line: '#3b82f6',  dot: 'bg-blue-400' },
  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  accent: 'bg-green-500',  titleColor: 'text-green-600',  line: '#22c55e',  dot: 'bg-green-400' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', accent: 'bg-purple-500', titleColor: 'text-purple-600', line: '#a855f7',  dot: 'bg-purple-400' },
  { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', accent: 'bg-orange-500', titleColor: 'text-orange-600', line: '#f97316',  dot: 'bg-orange-400' },
  { bg: 'bg-pink-50',   border: 'border-pink-200',   text: 'text-pink-700',   accent: 'bg-pink-500',   titleColor: 'text-pink-600',   line: '#ec4899',  dot: 'bg-pink-400' },
  { bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-700',   accent: 'bg-teal-500',   titleColor: 'text-teal-600',   line: '#14b8a6',  dot: 'bg-teal-400' },
];

// ─── SVG connector lines from center to each branch position ───────────────
// Computed dynamically based on how many branches exist in each row so lines
// always point to the center of the actual grid cell.

function computeConnectorPaths(totalBranches: number): [number, number, number, number][] {
  const topCount = Math.min(totalBranches, 3);
  const bottomCount = Math.max(0, totalBranches - 3);

  const cellCenters = (count: number): number[] => {
    if (count === 0) return [];
    if (count === 1) return [50];
    if (count === 2) return [33, 67];
    return [18, 50, 82];
  };

  const topXs = cellCenters(topCount);
  const bottomXs = cellCenters(bottomCount);
  const paths: [number, number, number, number][] = [];

  for (const x of topXs) paths.push([50, 42, x, 22]);
  for (const x of bottomXs) paths.push([50, 58, x, 78]);

  return paths;
}

export const VisualHub = ({ setView, onSave, kit, stats, saveMistake, openFlashcards, openPremium3D, isPro }: VisualHubProps) => {
  const [expandedBranch, setExpandedBranch] = useState<number | null>(null);
  const [carouselSlide, setCarouselSlide] = useState(0);
  const [summaryCardIdx, setSummaryCardIdx] = useState(0);

  const TOTAL_SLIDES = 2; // 0 = Mind Map, 1 = Flowchart

  const nextSlide = useCallback(() => setCarouselSlide(s => (s + 1) % TOTAL_SLIDES), []);
  const prevSlide = useCallback(() => setCarouselSlide(s => (s - 1 + TOTAL_SLIDES) % TOTAL_SLIDES), []);

  if (!kit) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600"><path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
        </div>
        <h3 className="text-lg font-bold text-on-surface mb-2">No content loaded</h3>
        <p className="text-sm text-on-surface-variant max-w-sm mb-6">Please select a chapter from the Library first. Visual content will be generated for the selected chapter.</p>
        <button onClick={() => setView('library')} className="px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:brightness-110">Go to Library</button>
      </div>
    );
  }

  const data = kit;

  const visualData = data.visual || { graphicDescription: "", conceptMap: [] };
  const topicTitle = data.quiz?.title || data.title || 'the topic';
  const mindMapRaw = data.mindMap || [];
  const keyPoints = typeof data.summary === 'string' ? (data.keyPoints || []) : (data.summary?.keyPoints || data.keyPoints || []);
  const definitions = typeof data.summary === 'string' ? (data.definitions || []) : (data.summary?.keyVocabulary || data.definitions || []);
  const commonMistakes = data.commonMistakes || [];
  const tips = data.readWrite?.tips || [];
  const formulaTable = data.formulaTable || [];

  // ── Build structured mind map from kit data ──────────────────────────────
  const mindMapBranches = useMemo(() => {
    if (mindMapRaw.length > 0) {
      return mindMapRaw.slice(0, 6).map((node: any) => ({
        title: node.label || node.title || 'Topic',
        children: (node.children || []).slice(0, 4),
      }));
    }
    if (visualData.conceptMap?.length > 0) {
      return visualData.conceptMap.slice(0, 6).map((item: any) => ({
        title: item.node || 'Concept',
        children: [item.reason || item.relatesTo || ''].filter(Boolean),
      }));
    }
    if (keyPoints.length > 0) {
      const chunks: { title: string; children: string[] }[] = [];
      for (let i = 0; i < Math.min(keyPoints.length, 6); i++) {
        chunks.push({ title: `Key Point ${i + 1}`, children: [keyPoints[i]] });
      }
      return chunks;
    }
    return [];
  }, [mindMapRaw, visualData.conceptMap, keyPoints]);

  // ── Build flowchart steps ────────────────────────────────────────────────
  const flowchartSteps = useMemo(() => {
    if (keyPoints.length >= 3) {
      return keyPoints.slice(0, 8);
    }
    return [
      `Understand the basics of ${topicTitle}`,
      'Identify key terms and definitions',
      'Learn the formulas and relationships',
      'Practice with examples',
      'Review common mistakes',
      'Test your knowledge',
    ];
  }, [keyPoints, topicTitle]);

  // ── Build visual summary cards ───────────────────────────────────────────
  const summaryCards = useMemo(() => {
    const cards: { title: string; meaning: string; examTip?: string }[] = [];
    if (definitions.length > 0) {
      definitions.slice(0, 6).forEach((d: any) => {
        cards.push({
          title: d.word || d.term || 'Term',
          meaning: d.definition || d.def || d.meaning || '',
          examTip: d.examUse || d.usage || undefined,
        });
      });
    }
    if (cards.length < 4 && keyPoints.length > 0) {
      keyPoints.slice(0, 6 - cards.length).forEach((kp: string) => {
        cards.push({ title: `Key Concept ${cards.length + 1}`, meaning: kp });
      });
    }
    return cards.slice(0, 6);
  }, [definitions, keyPoints]);

  React.useEffect(() => { setLastLearningMode('visual'); }, []);

  // ── Slide labels for carousel dots ───────────────────────────────────────
  const slideLabels = ['Concept Mind Map', 'Process Flowchart'];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-20">
      {/* ─── Header ───────────────────────────────────────────────────── */}
      <div className="space-y-5 mb-6">
        <div>
          <span className="px-3 py-1 rounded bg-amber-100 text-[10px] font-bold uppercase tracking-widest text-amber-600 border border-amber-200">Visual & Interactive Mapping</span>
          <h2 className="text-3xl font-bold tracking-tight text-on-surface mt-2">{topicTitle} — Visual Mode</h2>
        </div>

        {/* ─── Consistent Action Bar ──────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <button
            onClick={() => onSave({ title: topicTitle, type: 'visual', contentSnippet: 'Visual summary and interactive lab completed.' })}
            className="h-11 flex items-center justify-center gap-2 bg-amber-100 text-amber-700 px-4 rounded-lg shadow-sm hover:bg-amber-200 transition-all font-bold text-sm"
          >
            <Library size={16} />
            Save to Library
          </button>
          <button
            onClick={() => setView('practice')}
            className="h-11 flex items-center justify-center gap-2 bg-navy-dark text-white px-4 rounded-lg shadow-sm hover:bg-amber-600 transition-all font-bold text-sm"
          >
            <ClipboardCheck size={16} />
            Take Hub Quiz
          </button>
          <button
            onClick={() => openFlashcards?.(topicTitle, data.id)}
            className="h-11 flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 rounded-lg shadow-sm hover:brightness-110 transition-all font-bold text-xs leading-tight text-center"
          >
            <Sparkles size={16} className="shrink-0" />
            <span>Visual Flashcards</span>
          </button>
          <button
            onClick={() => setView('dashboard')}
            className="h-11 flex items-center justify-center gap-2 bg-white border border-surface-container-high text-on-surface px-4 rounded-lg shadow-sm hover:bg-surface-container-low transition-all font-bold text-sm"
          >
            <RotateCcw size={16} />
            Reset
          </button>
          <button
            onClick={() => exportKitToPDF(data, 'visual')}
            className="h-11 flex items-center justify-center gap-2 bg-primary text-white px-4 rounded-lg shadow-md hover:opacity-90 active:scale-95 transition-all font-bold text-sm"
          >
            <Download size={16} />
            Download PDF
          </button>
        </div>
      </div>

      {/* ─── Two-Column Layout ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* ─── Left Main Area (8 cols) ───────────────────────────────── */}
        <div className="lg:col-span-8 flex flex-col gap-8">

          {/* ══════════════════════════════════════════════════════════════
              CAROUSEL — Mind Map (slide 0) + Flowchart (slide 1)
             ══════════════════════════════════════════════════════════════ */}
          <div className="bg-white border-2 border-surface-container-high rounded-3xl overflow-hidden">

            {/* Carousel Header */}
            <div className="px-6 md:px-10 pt-8 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 text-white rounded-xl ${carouselSlide === 0 ? 'bg-amber-500' : 'bg-teal-500'}`}>
                  {carouselSlide === 0 ? <Network size={20} /> : <GitBranch size={20} />}
                </div>
                <div>
                  <h3 className="text-xl font-black text-on-surface">{slideLabels[carouselSlide]}</h3>
                  <p className="text-xs text-on-surface-variant font-medium">
                    {carouselSlide === 0 ? 'Core concepts and their connections' : 'Step-by-step concept flow'}
                  </p>
                </div>
              </div>

              {/* Navigation Arrows */}
              <div className="flex items-center gap-2">
                <button
                  onClick={prevSlide}
                  className="w-9 h-9 rounded-full border-2 border-surface-container-high flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low hover:border-primary hover:text-primary transition-all"
                  title="Previous"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={nextSlide}
                  className="w-9 h-9 rounded-full border-2 border-surface-container-high flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low hover:border-primary hover:text-primary transition-all"
                  title="Next"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Dot indicators */}
            <div className="flex items-center justify-center gap-3 pb-4">
              {slideLabels.map((label, i) => (
                <button
                  key={i}
                  onClick={() => setCarouselSlide(i)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                    carouselSlide === i
                      ? 'bg-primary/10 text-primary border border-primary/30'
                      : 'text-on-surface-variant hover:bg-surface-container-low border border-transparent'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full transition-all ${carouselSlide === i ? 'bg-primary' : 'bg-surface-container-high'}`} />
                  {label}
                </button>
              ))}
            </div>

            {/* Carousel Content */}
            <div className="px-6 md:px-10 pb-8 min-h-[420px]">
              <AnimatePresence mode="wait">
                {/* ── Slide 0: Concept Mind Map ─────────────────────────── */}
                {carouselSlide === 0 && (
                  <motion.div
                    key="mindmap"
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    transition={{ duration: 0.3 }}
                  >
                    {mindMapBranches.length > 0 ? (
                      <div className="relative">
                        {/* ── SVG Connector Lines ──────────────────────── */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" preserveAspectRatio="none" viewBox="0 0 100 100" style={{ minHeight: 420 }}>
                          {(() => {
                            const paths = computeConnectorPaths(mindMapBranches.length);
                            return paths;
                          })().map((path, i) => {
                            if (!path) return null;
                            const color = BRANCH_STYLES[i % BRANCH_STYLES.length];
                            return (
                              <line
                                key={i}
                                x1={`${path[0]}%`} y1={`${path[1]}%`}
                                x2={`${path[2]}%`} y2={`${path[3]}%`}
                                stroke={color.line}
                                strokeWidth="0.4"
                                strokeLinecap="round"
                                opacity="0.5"
                              />
                            );
                          })}
                        </svg>

                        {/* ── Central Topic Node ──────────────────────── */}
                        <div className="flex justify-center pt-2 pb-6 relative z-10">
                          {/* The branch grid goes around this; we need a layout where center is in the middle */}
                        </div>

                        {/* Grid: Row 1 (3 cards) → Center Node → Row 2 (up to 3 cards) */}
                        <div className="flex flex-col items-center gap-5 relative z-10">
                          {/* Top row of branches */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                            {mindMapBranches.slice(0, 3).map((branch: any, i: number) => {
                              const style = BRANCH_STYLES[i % BRANCH_STYLES.length];
                              return (
                                <motion.div
                                  key={i}
                                  initial={{ opacity: 0, y: 20 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.1 }}
                                  onClick={() => setExpandedBranch(expandedBranch === i ? null : i)}
                                  className={`relative cursor-pointer rounded-2xl border-2 ${style.border} ${style.bg} transition-all p-4 shadow-sm hover:shadow-lg`}
                                >
                                  <div className="flex items-start gap-2.5 mb-2">
                                    <span className={`shrink-0 w-7 h-7 rounded-full ${style.accent} text-white flex items-center justify-center text-xs font-black shadow-md`}>
                                      {i + 1}
                                    </span>
                                    <h4 className={`text-sm font-black ${style.titleColor} leading-snug`}>{branch.title}</h4>
                                  </div>
                                  <div className={`w-8 border-t-2 ${style.border} mb-2 ml-9`} />
                                  <ul className="space-y-1.5 ml-9">
                                    {branch.children.slice(0, expandedBranch === i ? undefined : 3).map((child: string, ci: number) => (
                                      <li key={ci} className="flex items-start gap-2 text-xs text-on-surface leading-relaxed">
                                        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${style.dot} mt-1.5`} />
                                        {child}
                                      </li>
                                    ))}
                                    {expandedBranch !== i && branch.children.length > 3 && (
                                      <li className={`text-[10px] font-bold ${style.text} mt-1`}>+{branch.children.length - 3} more...</li>
                                    )}
                                  </ul>
                                </motion.div>
                              );
                            })}
                          </div>

                          {/* Central Topic Circle */}
                          <div className="flex justify-center py-2">
                            <div className="relative">
                              {/* Outer glow ring */}
                              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400/30 to-orange-400/30 blur-md scale-125" />
                              <div className="relative z-10 w-36 h-36 rounded-full bg-gradient-to-br from-[#1a2332] to-[#2d3748] border-4 border-white shadow-2xl flex flex-col items-center justify-center text-center px-3">
                                <div className="text-amber-400 mb-1">
                                  <Sparkles size={22} />
                                </div>
                                <p className="text-white font-black text-sm leading-tight break-words">{topicTitle}</p>
                              </div>
                            </div>
                          </div>

                          {/* Bottom row of branches */}
                          {mindMapBranches.length > 3 && (
                            <div className={`grid grid-cols-1 gap-4 w-full ${
                              mindMapBranches.length - 3 === 1 ? 'sm:grid-cols-1 max-w-sm mx-auto' :
                              mindMapBranches.length - 3 === 2 ? 'sm:grid-cols-2 max-w-2xl mx-auto' :
                              'sm:grid-cols-3'
                            }`}>
                              {mindMapBranches.slice(3, 6).map((branch: any, idx: number) => {
                                const i = idx + 3;
                                const style = BRANCH_STYLES[i % BRANCH_STYLES.length];
                                return (
                                  <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    onClick={() => setExpandedBranch(expandedBranch === i ? null : i)}
                                    className={`relative cursor-pointer rounded-2xl border-2 ${style.border} ${style.bg} transition-all p-4 shadow-sm hover:shadow-lg`}
                                  >
                                    <div className="flex items-start gap-2.5 mb-2">
                                      <span className={`shrink-0 w-7 h-7 rounded-full ${style.accent} text-white flex items-center justify-center text-xs font-black shadow-md`}>
                                        {i + 1}
                                      </span>
                                      <h4 className={`text-sm font-black ${style.titleColor} leading-snug`}>{branch.title}</h4>
                                    </div>
                                    <div className={`w-8 border-t-2 ${style.border} mb-2 ml-9`} />
                                    <ul className="space-y-1.5 ml-9">
                                      {branch.children.slice(0, expandedBranch === i ? undefined : 3).map((child: string, ci: number) => (
                                        <li key={ci} className="flex items-start gap-2 text-xs text-on-surface leading-relaxed">
                                          <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${style.dot} mt-1.5`} />
                                          {child}
                                        </li>
                                      ))}
                                      {expandedBranch !== i && branch.children.length > 3 && (
                                        <li className={`text-[10px] font-bold ${style.text} mt-1`}>+{branch.children.length - 3} more...</li>
                                      )}
                                    </ul>
                                  </motion.div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-16 text-on-surface-variant">
                        <Network size={48} className="mx-auto mb-3 text-surface-container-high" />
                        <p className="text-sm font-medium">Mind map will appear once content is generated.</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── Slide 1: Process Flowchart ────────────────────────── */}
                {carouselSlide === 1 && (
                  <motion.div
                    key="flowchart"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="flex flex-col items-center gap-0">
                      {flowchartSteps.map((step: string, i: number) => (
                        <React.Fragment key={i}>
                          <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className={`w-full max-w-lg p-4 rounded-xl border-2 transition-all hover:shadow-lg ${
                              i === 0
                                ? 'bg-teal-50 border-teal-300 shadow-md'
                                : i === flowchartSteps.length - 1
                                  ? 'bg-green-50 border-green-300 shadow-md'
                                  : 'bg-white border-surface-container-high hover:border-teal-300'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shadow-sm ${
                                i === 0 ? 'bg-teal-500' : i === flowchartSteps.length - 1 ? 'bg-green-500' : 'bg-slate-400'
                              }`}>
                                {i + 1}
                              </span>
                              <p className="text-sm text-on-surface font-semibold leading-relaxed flex-1">{step}</p>
                            </div>
                          </motion.div>
                          {i < flowchartSteps.length - 1 && (
                            <div className="flex flex-col items-center py-1">
                              <div className="w-0.5 h-4 bg-teal-300" />
                              <ArrowRight size={14} className="text-teal-400 rotate-90" />
                            </div>
                          )}
                        </React.Fragment>
                      ))}
                    </div>

                    {/* Exam Tip below flowchart */}
                    {commonMistakes.length > 0 && (
                      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <Lightbulb size={14} className="text-amber-500" />
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Exam Tip</p>
                        </div>
                        <p className="text-xs text-amber-800 font-medium leading-relaxed">
                          Avoid common mistake: {commonMistakes[0]}
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Formula Revision Carousel ───────────────────────────────── */}
          {formulaTable.length > 0 && (
            <VisualFormulaCarousel formulas={formulaTable} />
          )}

          {/* ── English Gloss Panel ─────────────────────────────────────── */}
          <EnglishGlossPanel kit={data} />
        </div>

        {/* ─── Right Side Panel (4 cols) ─────────────────────────────── */}
        <div className="lg:col-span-4 space-y-6">

          {/* ── Tips and Suggestions ─────────────────────────────────── */}
          <AIGuide topic={topicTitle} customTips={tips.length > 0 ? tips : undefined} />

          {/* ── Premium Interactive Lab — Coming Soon ────────────────── */}
          <div className="bg-white border border-surface-container rounded-[32px] overflow-hidden card-shadow">
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center gap-3">
              <Sparkles size={18} className="text-white" />
              <div>
                <h4 className="text-sm font-black text-white">Premium Interactive Lab</h4>
                <p className="text-[10px] text-indigo-200 font-medium">Simulations & Drag-and-Drop</p>
              </div>
            </div>
            <div className="p-6 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-4">
                <Clock size={28} className="text-indigo-400" />
              </div>
              <h4 className="text-sm font-bold text-on-surface mb-1">Coming Soon</h4>
              <p className="text-xs text-on-surface-variant font-medium leading-relaxed max-w-[220px]">
                Interactive simulations, 3D-style hotspots, and drag-and-drop labs are on the way.
              </p>
            </div>
          </div>

          {/* ── Visual Summary Cards — Carousel ────────────────────── */}
          {summaryCards.length > 0 && (() => {
            const safeIdx = Math.min(summaryCardIdx, summaryCards.length - 1);
            const card = summaryCards[safeIdx];
            const style = BRANCH_STYLES[safeIdx % BRANCH_STYLES.length];
            return (
              <div className="bg-white border border-surface-container rounded-[32px] p-5 card-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-violet-50 rounded-lg text-violet-600">
                      <Layers size={16} />
                    </div>
                    <h3 className="text-sm font-black text-on-surface">Visual Summary Cards</h3>
                  </div>
                  <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
                    {safeIdx + 1} / {summaryCards.length}
                  </span>
                </div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={safeIdx}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    transition={{ duration: 0.2 }}
                    className={`rounded-xl border-2 ${style.border} ${style.bg} p-4 min-h-[100px]`}
                  >
                    <h4 className={`text-sm font-black ${style.text} mb-2`}>{card.title}</h4>
                    <p className="text-xs text-on-surface leading-relaxed mb-2">{card.meaning}</p>
                    {card.examTip && (
                      <p className="text-[10px] text-amber-600 font-medium mt-auto pt-2 border-t border-amber-100">
                        <Lightbulb size={10} className="inline mr-1 -mt-0.5" />
                        {card.examTip}
                      </p>
                    )}
                  </motion.div>
                </AnimatePresence>
                <div className="flex items-center justify-between mt-3">
                  <button
                    onClick={() => setSummaryCardIdx(safeIdx <= 0 ? summaryCards.length - 1 : safeIdx - 1)}
                    className="w-9 h-9 rounded-full border border-violet-200 bg-violet-50 text-violet-600 flex items-center justify-center hover:bg-violet-100 transition-colors"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="flex gap-1.5">
                    {summaryCards.map((_: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => setSummaryCardIdx(i)}
                        className={`w-2 h-2 rounded-full transition-all ${i === safeIdx ? 'bg-violet-500 scale-125' : 'bg-violet-200 hover:bg-violet-300'}`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => setSummaryCardIdx(safeIdx >= summaryCards.length - 1 ? 0 : safeIdx + 1)}
                    className="w-9 h-9 rounded-full border border-violet-200 bg-violet-50 text-violet-600 flex items-center justify-center hover:bg-violet-100 transition-colors"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </motion.div>
  );
};
