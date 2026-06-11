/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * StudyNotesPanel — "Study Workspace" with 3 note styles (Smart, Cornell, Concept Map).
 * Accordion sections keep the view short; students expand only what they need.
 * Each expanded section shows: explanation, key points, examples, exam tips, cue questions.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, Brain, ListTree, Table2, RotateCcw, GitFork, Layers,
  ChevronDown, AlertCircle, AlertTriangle, Loader2, Lock, Download,
  BookOpen, Lightbulb, CheckCircle, ArrowRight, HelpCircle, Star,
  FileText, Zap, RefreshCw,
} from 'lucide-react';
import { aiService } from '../../services/aiService';
import { NoteStyle, GeneratedNotes, PlanType, SmartSlide } from '../../types';
import { exportKitToPDF } from '../../lib/pdfExport';
import { logActivity } from '../../services/activityService';

// ─── Style metadata ──────────────────────────────────────────────────────────

interface StyleMeta {
  id: NoteStyle;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<any>;
  desc: string;
  color: string;
  bg: string;
  border: string;
  minPlan: PlanType;
}

const STYLES: StyleMeta[] = [
  { id: 'smart', label: 'Smart Notes', shortLabel: 'Smart', icon: Sparkles,
    desc: 'Structured notes + tables + definitions + exam tips.',
    color: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-400', minPlan: 'free' },
  { id: 'cornell', label: 'Cornell Notes', shortLabel: 'Cornell', icon: FileText,
    desc: 'Two-column format · Cue questions · Summary for review.',
    color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-400', minPlan: 'plus' },
  { id: 'concept-map', label: 'Concept Map', shortLabel: 'Concept Map', icon: GitFork,
    desc: 'Visual relationship mapping between concepts.',
    color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-400', minPlan: 'pro' },
];

const PLAN_ORDER: Record<PlanType, number> = { free: 0, plus: 1, pro: 2 };
function planAllows(userPlan: PlanType, required: PlanType) {
  return PLAN_ORDER[userPlan] >= PLAN_ORDER[required];
}

function getRecommendedStyle(subject: string): NoteStyle {
  const s = (subject || '').toLowerCase();
  if (s === 'biology') return 'concept-map';
  if (s === 'history' || s === 'civics' || s === 'political science' || s === 'english' || s === 'hindi') return 'cornell';
  return 'smart';
}

// ─── Reusable Accordion Item ────────────────────────────────────────────────

const AccordionItem: React.FC<{
  title: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, accentBg, accentText, accentBorder, badge, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`border ${accentBorder} rounded-xl overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-4 py-3 ${accentBg} hover:brightness-[0.97] transition-all`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {badge && (
            <span className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${accentText} bg-white/60`}>
              {badge}
            </span>
          )}
          <h4 className={`text-sm font-bold ${accentText} text-left truncate`}>{title}</h4>
        </div>
        <ChevronDown
          size={15}
          className={`shrink-0 ml-2 ${accentText} opacity-50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 py-4 space-y-3 bg-white">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Recall Card (compact) ──────────────────────────────────────────────────

const RecallCard: React.FC<{ q: any; index: number }> = ({ q, index }) => {
  const [stage, setStage] = useState<'hidden' | 'hint' | 'revealed'>('hidden');
  return (
    <div className="border border-rose-100 rounded-xl overflow-hidden bg-white">
      <div className="px-4 py-3 bg-rose-50 border-b border-rose-100">
        <p className="text-[10px] font-black uppercase tracking-widest text-rose-400 mb-0.5">Q{index + 1}</p>
        <p className="text-sm font-bold text-on-surface leading-snug">{q.question}</p>
      </div>
      <div className="p-3 space-y-2">
        {stage === 'hidden' && (
          <button onClick={() => setStage('hint')}
            className="w-full py-2 rounded-lg bg-rose-100 text-rose-700 font-bold text-xs hover:bg-rose-200 transition-all">
            Show Hint
          </button>
        )}
        {stage === 'hint' && (
          <>
            <div className="flex items-start gap-1.5 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
              <Lightbulb size={13} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 font-medium">{q.hint}</p>
            </div>
            <button onClick={() => setStage('revealed')}
              className="w-full py-2 rounded-lg bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 transition-all">
              Reveal Answer
            </button>
          </>
        )}
        {stage === 'revealed' && (
          <>
            {q.hint && (
              <div className="flex items-start gap-1.5 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                <Lightbulb size={13} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 font-medium">{q.hint}</p>
              </div>
            )}
            <div className="flex items-start gap-1.5 p-2.5 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle size={13} className="text-green-600 shrink-0 mt-0.5" />
              <p className="text-xs text-green-800 font-semibold">{q.answer}</p>
            </div>
            <button onClick={() => setStage('hidden')}
              className="text-[10px] text-rose-400 hover:text-rose-600 font-medium">
              ↺ Reset
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Style-specific renderers (all compact / accordion-based) ───────────────

// Accent theme shorthand objects
const TH = { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' };
const IH = { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' };
const VH = { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' };
const SH = { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' };
const RH = { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
const AH = { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
const EH = { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };

/* ── Dense Slide Renderer (v2 SMART format) ─────────────────────────────── */

const SL = { label: 'text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2' };

const DenseSlide: React.FC<{ slide: SmartSlide }> = ({ slide }) => (
  <div className="space-y-4">
    {/* Definitions */}
    {slide.definitions?.length > 0 && (
      <div>
        <ul className="space-y-1.5">
          {slide.definitions.filter(Boolean).map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-on-surface leading-relaxed">
              <span className="shrink-0 w-2 h-2 rounded-full bg-teal-500 mt-2" />
              <span><strong className="text-teal-800">{d?.term || ''}</strong> — {d?.definition || ''}
                {d?.example && <span className="text-on-surface-variant"> ({d.example})</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )}

    {/* Tables */}
    {slide.tables?.filter(Boolean).map((tbl, ti) => tbl?.columns?.length > 0 ? (
      <div key={ti}>
        <p className={SL.label}>{tbl.label || ''}</p>
        <div className="overflow-x-auto rounded-lg border border-surface-container-high -mx-1 sm:mx-0">
          <table className="w-full text-xs min-w-[320px]">
            <thead>
              <tr className="bg-teal-50 border-b border-surface-container-high">
                {tbl.columns.map((col, ci) => (
                  <th key={ci} className="px-2 sm:px-2.5 py-1.5 text-left text-[10px] font-black uppercase tracking-wider text-teal-700">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(tbl.rows || []).map((row, ri) => (
                <tr key={ri} className={`border-b border-surface-container-high/50 ${ri % 2 ? 'bg-teal-50/20' : ''}`}>
                  {(row || []).map((cell, ci) => (
                    <td key={ci} className="px-2 sm:px-2.5 py-1.5 text-on-surface leading-relaxed">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ) : null)}

    {/* Comparison Panels */}
    {slide.comparison_panels?.filter(Boolean).map((cp, ci) => cp?.left && cp?.right ? (
      <div key={ci} className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        <div className="border-l-2 border-blue-400 pl-3 py-2">
          <p className="text-xs font-black text-blue-700 mb-1">{cp.left.title || ''}</p>
          <p className="text-xs text-on-surface-variant leading-relaxed">{cp.left.content || ''}</p>
        </div>
        <div className="border-l-2 border-amber-400 pl-3 py-2">
          <p className="text-xs font-black text-amber-700 mb-1">{cp.right.title || ''}</p>
          <p className="text-xs text-on-surface-variant leading-relaxed">{cp.right.content || ''}</p>
        </div>
      </div>
    ) : null)}

    {/* Compact Grid */}
    {slide.compact_grid?.length > 0 && (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {slide.compact_grid.filter(Boolean).map((item, i) => (
          <div key={i} className="bg-surface-container-low rounded-lg p-2 sm:p-2.5 text-center border border-surface-container-high">
            <p className="text-xs sm:text-sm font-black text-on-surface break-words">{item?.primary || ''}</p>
            <p className="text-[10px] text-on-surface-variant mt-0.5">{item?.secondary || ''}</p>
          </div>
        ))}
      </div>
    )}

    {/* Formulae */}
    {slide.formulae?.length > 0 && (
      <div>
        <p className={SL.label}>FORMULAE</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {slide.formulae.filter(Boolean).map((f, i) => (
            <div key={i} className="bg-surface-container-low rounded-lg p-2 sm:p-2.5 border border-surface-container-high">
              <p className="text-[10px] text-on-surface-variant font-bold mb-0.5">{f?.label || ''}</p>
              <p className="text-xs font-mono font-bold text-on-surface break-all">{f?.formula || ''}</p>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Step Method */}
    {slide.step_method && (
      <div>
        <p className={SL.label}>{slide.step_method.label || 'HOW TO'}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {(slide.step_method.steps || []).filter(Boolean).map((step, i) => (
            <div key={i} className="bg-violet-50 rounded-lg p-2 sm:p-2.5 text-center border border-violet-100">
              <p className="text-[10px] font-black text-violet-600 mb-1">Step {i + 1}</p>
              <p className="text-xs text-on-surface leading-relaxed">{step}</p>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Solved Example */}
    {slide.solved_example && (
      <div className="border-l-2 border-blue-400 pl-4 py-2 bg-blue-50/30 rounded-r-lg">
        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1.5">
          SOLVED — {slide.solved_example.mark_pattern || ''}
        </p>
        <p className="text-xs text-on-surface font-medium mb-2">{slide.solved_example.question || ''}</p>
        <div className="space-y-1 mb-2">
          {(slide.solved_example.steps || []).filter(Boolean).map((s, i) => (
            <p key={i} className="text-xs text-on-surface-variant leading-relaxed">{s}</p>
          ))}
        </div>
        <p className="text-xs font-bold text-on-surface">Answer: {slide.solved_example.answer || ''}</p>
      </div>
    )}

    {/* Common Mistake */}
    {slide.common_mistake && (
      <div className="flex items-start gap-2 p-2.5 bg-rose-50 rounded-lg border border-rose-200">
        <AlertTriangle size={12} className="text-rose-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-rose-800 font-medium leading-relaxed">{slide.common_mistake}</p>
      </div>
    )}

    {/* Exam Tip */}
    {slide.exam_tip && (
      <div className="flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
        <Star size={12} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-800 font-semibold leading-relaxed">{slide.exam_tip}</p>
      </div>
    )}
  </div>
);

const DenseSlideshow: React.FC<{ slides: SmartSlide[]; summary?: string; keyPoints?: string[] }> = ({ slides, summary, keyPoints }) => {
  const [current, setCurrent] = React.useState(0);
  const slide = slides[current];
  if (!slide) return null;

  return (
    <div className="space-y-4">
      {/* Chapter Summary — visible only on slide 1 */}
      {current === 0 && summary && (
        <div className="p-4 bg-teal-50/70 rounded-xl border border-teal-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-teal-600 mb-1.5">Chapter Summary</p>
          <p className="text-sm text-on-surface leading-relaxed">{summary}</p>
          {keyPoints && keyPoints.length > 0 && (
            <div className="mt-3 pt-3 border-t border-teal-200/60">
              <p className="text-[10px] font-black uppercase tracking-widest text-teal-500 mb-1.5">Key Points</p>
              <ul className="space-y-1">
                {keyPoints.slice(0, 5).map((pt, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-on-surface leading-relaxed">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[9px] font-black mt-0.5">{i + 1}</span>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.2 }}
          className="p-5 rounded-xl border-2 border-teal-400 bg-white"
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase text-teal-700 bg-teal-50">
              {current + 1} / {slides.length}
            </span>
            <h4 className="text-sm font-black text-teal-700">{slide.title || `Slide ${current + 1}`}</h4>
          </div>
          <DenseSlide slide={slide} />
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrent(c => c - 1)}
          disabled={current === 0}
          className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs font-bold disabled:opacity-30 hover:bg-surface-container-high transition-all"
        >
          ← Previous
        </button>
        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="w-2 h-2 rounded-full transition-all text-teal-700"
              style={{ backgroundColor: i === current ? 'currentColor' : 'var(--md-sys-color-surface-container-high, #e0e0e0)', transform: i === current ? 'scale(1.3)' : 'scale(1)' }}
            />
          ))}
        </div>
        <button
          onClick={() => setCurrent(c => c + 1)}
          disabled={current === slides.length - 1}
          className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs font-bold disabled:opacity-30 hover:bg-surface-container-high transition-all"
        >
          Next →
        </button>
      </div>
    </div>
  );
};

const DenseFullView: React.FC<{ slides: SmartSlide[]; notes: GeneratedNotes }> = ({ slides, notes }) => (
  <div className="space-y-3">
    {/* Key Points accordion */}
    {notes.keyPoints?.length > 0 && (
      <AccordionItem title="Key Points" accentBg={TH.bg} accentText={TH.text} accentBorder={TH.border} defaultOpen>
        <ul className="space-y-1.5">
          {notes.keyPoints.map((pt, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-on-surface leading-relaxed">
              <span className="shrink-0 w-5 h-5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[10px] font-black mt-0.5">{i + 1}</span>
              {pt}
            </li>
          ))}
        </ul>
      </AccordionItem>
    )}

    {/* Each slide as an accordion */}
    {slides.filter(Boolean).map((slide, i) => (
      <AccordionItem key={i} title={slide?.title || `Slide ${i + 1}`} badge={`${i + 1}`} accentBg={TH.bg} accentText={TH.text} accentBorder={TH.border}>
        <DenseSlide slide={slide} />
      </AccordionItem>
    ))}

    {/* Definitions accordion */}
    {notes.definitions?.length > 0 && (
      <AccordionItem title="Key Definitions" accentBg={TH.bg} accentText={TH.text} accentBorder={TH.border}>
        <div className="grid sm:grid-cols-2 gap-2">
          {notes.definitions.map((d, i) => (
            <div key={i} className="p-3 bg-teal-50/50 rounded-lg border border-teal-100">
              <p className="text-sm font-black text-teal-700">{d.term}</p>
              <p className="text-xs text-on-surface-variant leading-relaxed mt-0.5">{d.meaning}</p>
            </div>
          ))}
        </div>
      </AccordionItem>
    )}
  </div>
);

/* ── Smart Notes ─────────────────────────────────────────────────────────── */

const SmartNotesRenderer: React.FC<{ notes: GeneratedNotes }> = ({ notes }) => (
  <div className="space-y-3">
    {/* Compact summary — always visible (only in Smart Notes) */}
    {notes.summary && (
      <div className="p-3.5 bg-teal-50/60 rounded-xl border border-teal-100">
        <p className="text-[10px] font-black uppercase tracking-widest text-teal-500 mb-1">Chapter Summary</p>
        <p className="text-sm text-on-surface leading-relaxed">{notes.summary}</p>
      </div>
    )}

    {/* Key Points accordion — default open */}
    {notes.keyPoints?.length > 0 && (
      <AccordionItem title="Key Points" accentBg={TH.bg} accentText={TH.text} accentBorder={TH.border} defaultOpen>
        <ul className="space-y-1.5">
          {notes.keyPoints.map((pt, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-on-surface leading-relaxed">
              <span className="shrink-0 w-5 h-5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[10px] font-black mt-0.5">{i + 1}</span>
              {pt}
            </li>
          ))}
        </ul>
      </AccordionItem>
    )}

    {/* Section accordions — collapsed by default, skip overview/intro */}
    {notes.sections?.filter(sec => sec && sec.title && !/^(overview|introduction|chapter at a glance|sub-?topics)/i.test(sec.title)).map((sec, i) => (
      <AccordionItem key={i} title={stripMarkdown(sec.title)} badge={`${i + 1}`} accentBg={TH.bg} accentText={TH.text} accentBorder={TH.border}>
        {/* Short explanation */}
        <p className="text-sm text-on-surface leading-relaxed whitespace-pre-line">{stripMarkdown(sec.content || '')}</p>
        {/* Examples */}
        {sec.examples && sec.examples.length > 0 && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 mb-1">Example{sec.examples.length > 1 ? 's' : ''}</p>
            {sec.examples.map((ex, j) => (
              <p key={j} className="text-xs text-blue-800 font-medium leading-relaxed">{ex}</p>
            ))}
          </div>
        )}
        {/* Exam tips */}
        {sec.examTips && sec.examTips.length > 0 && sec.examTips.map((tip, j) => (
          <div key={j} className="flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
            <Star size={12} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 font-semibold">{tip}</p>
          </div>
        ))}
        {/* Cue questions */}
        {sec.cueQuestions && sec.cueQuestions.length > 0 && (
          <div className="pt-2 border-t border-surface-container-high/50">
            <p className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant mb-1.5">Cue Questions</p>
            <ul className="space-y-1">
              {sec.cueQuestions.map((q, j) => (
                <li key={j} className="flex items-start gap-1.5 text-xs text-on-surface-variant font-medium">
                  <HelpCircle size={11} className="shrink-0 mt-0.5 opacity-60" />{q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </AccordionItem>
    ))}

    {/* Definitions accordion */}
    {notes.definitions?.length > 0 && (
      <AccordionItem title="Key Definitions" accentBg={TH.bg} accentText={TH.text} accentBorder={TH.border}>
        <div className="grid sm:grid-cols-2 gap-2">
          {notes.definitions.map((d, i) => (
            <div key={i} className="p-3 bg-teal-50/50 rounded-lg border border-teal-100">
              <p className="text-sm font-black text-teal-700">{d.term}</p>
              <p className="text-xs text-on-surface-variant leading-relaxed mt-0.5">{d.meaning}</p>
            </div>
          ))}
        </div>
      </AccordionItem>
    )}
  </div>
);

/* ── Cornell Notes ───────────────────────────────────────────────────────── */

const CornellNotesRenderer: React.FC<{ notes: GeneratedNotes }> = ({ notes }) => (
  <div className="space-y-3">
    {notes.sections?.map((sec, i) => (
      <AccordionItem key={i} title={sec.title} badge={`${i + 1}`} accentBg={IH.bg} accentText={IH.text} accentBorder={IH.border} defaultOpen={i === 0}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Cue column */}
          {sec.cueQuestions && sec.cueQuestions.length > 0 && (
            <div className="md:col-span-1 p-3 bg-indigo-50/60 rounded-lg border border-indigo-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">Cue Questions</p>
              <ul className="space-y-2">
                {sec.cueQuestions.map((q, j) => (
                  <li key={j} className="flex items-start gap-1.5 text-xs text-indigo-800 font-semibold leading-snug">
                    <HelpCircle size={12} className="shrink-0 mt-0.5 text-indigo-400" />{q}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Notes column */}
          <div className={sec.cueQuestions?.length ? 'md:col-span-2' : 'md:col-span-3'}>
            <p className="text-sm text-on-surface leading-relaxed">{asString(sec.content)}</p>
            {sec.examples && sec.examples.length > 0 && (
              <div className="mt-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 mb-1">Example</p>
                {sec.examples.map((ex, j) => (
                  <p key={j} className="text-xs text-blue-800 font-medium">{ex}</p>
                ))}
              </div>
            )}
            {sec.examTips?.map((tip, j) => (
              <div key={j} className="mt-2 flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                <Star size={12} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 font-semibold">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      </AccordionItem>
    ))}

    {/* Recall Practice */}
    {notes.recallQuestions && notes.recallQuestions.length > 0 && (
      <AccordionItem title="Recall Practice" accentBg={IH.bg} accentText={IH.text} accentBorder={IH.border}>
        <div className="grid gap-3 sm:grid-cols-2">
          {notes.recallQuestions.map((q, i) => <RecallCard key={i} q={q} index={i} />)}
        </div>
      </AccordionItem>
    )}
  </div>
);

/* ── Exam Outline ────────────────────────────────────────────────────────── */

const OutlineRenderer: React.FC<{ notes: GeneratedNotes }> = ({ notes }) => (
  <div className="space-y-3">
    {notes.examOutline?.subtopics?.map((sub, i) => (
      <AccordionItem key={i} title={sub.title} badge={`${i + 1}`} accentBg={VH.bg} accentText={VH.text} accentBorder={VH.border} defaultOpen={i === 0}>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-500 mb-2">Key Points</p>
            <ul className="space-y-1">
              {sub.keyPoints?.map((pt, j) => (
                <li key={j} className="flex items-start gap-1.5 text-xs text-on-surface leading-snug">
                  <span className="shrink-0 w-1 h-1 rounded-full bg-violet-400 mt-1.5" />{pt}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-2">Examples</p>
            <ul className="space-y-1">
              {sub.examples?.map((ex, j) => (
                <li key={j} className="text-xs text-blue-800 bg-blue-50 rounded px-2 py-1 leading-snug">{ex}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-2">Exam Questions</p>
            <ul className="space-y-1">
              {sub.examQuestions?.map((q, j) => (
                <li key={j} className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 rounded px-2 py-1 leading-snug">
                  <Star size={11} className="shrink-0 mt-0.5 text-amber-500" />{q}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </AccordionItem>
    ))}

    {/* Additional sections */}
    {notes.sections?.map((sec, i) => (
      <AccordionItem key={`sec-${i}`} title={sec.title} accentBg={VH.bg} accentText={VH.text} accentBorder={VH.border}>
        <p className="text-sm text-on-surface-variant leading-relaxed">{asString(sec.content)}</p>
        {sec.examTips?.map((tip, j) => (
          <div key={j} className="flex items-start gap-2 p-2 bg-amber-50 rounded border border-amber-100">
            <Star size={11} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 font-medium">{tip}</p>
          </div>
        ))}
        {sec.cueQuestions && sec.cueQuestions.length > 0 && (
          <div className="pt-2 border-t border-surface-container-high/50">
            <p className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant mb-1.5">Cue Questions</p>
            <ul className="space-y-1">
              {sec.cueQuestions.map((q, j) => (
                <li key={j} className="flex items-start gap-1.5 text-xs text-on-surface-variant font-medium">
                  <HelpCircle size={11} className="shrink-0 mt-0.5 opacity-60" />{q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </AccordionItem>
    ))}
  </div>
);

/* ── Comparison Table ────────────────────────────────────────────────────── */

const ComparisonRenderer: React.FC<{ notes: GeneratedNotes }> = ({ notes }) => (
  <div className="space-y-3">
    {notes.tables?.map((tbl, i) => (
      <AccordionItem key={i} title={tbl.title} accentBg={SH.bg} accentText={SH.text} accentBorder={SH.border} defaultOpen={i === 0}>
        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sky-50/60">
                {tbl.columns?.map((col, j) => (
                  <th key={j} className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-sky-700 border-b border-sky-200 whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tbl.rows?.map((row, j) => (
                <tr key={j} className={j % 2 === 0 ? 'bg-white' : 'bg-sky-50/30'}>
                  {row.map((cell, k) => (
                    <td key={k} className="px-3 py-2 text-xs text-on-surface border-b border-surface-container-high/50 leading-relaxed">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AccordionItem>
    ))}

    {notes.sections?.map((sec, i) => (
      <AccordionItem key={`sec-${i}`} title={sec.title} accentBg={SH.bg} accentText={SH.text} accentBorder={SH.border}>
        <p className="text-sm text-on-surface-variant leading-relaxed">{asString(sec.content)}</p>
        {sec.examTips?.map((tip, j) => (
          <div key={j} className="flex items-start gap-2 p-2 bg-amber-50 rounded border border-amber-100">
            <Star size={11} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 font-medium">{tip}</p>
          </div>
        ))}
      </AccordionItem>
    ))}
  </div>
);

/* ── Recall Notes ────────────────────────────────────────────────────────── */

const RecallRenderer: React.FC<{ notes: GeneratedNotes }> = ({ notes }) => (
  <div className="space-y-3">
    <div className="p-3 bg-rose-50/60 border border-rose-100 rounded-lg">
      <p className="text-xs text-rose-800 font-medium">
        <strong>How to use:</strong> Read the question → try to answer in your head → reveal hint → reveal full answer.
      </p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {notes.recallQuestions?.map((q, i) => <RecallCard key={i} q={q} index={i} />)}
    </div>
    {notes.definitions?.length > 0 && (
      <AccordionItem title="Key Definitions" accentBg={RH.bg} accentText={RH.text} accentBorder={RH.border}>
        <div className="grid sm:grid-cols-2 gap-2">
          {notes.definitions.map((d, i) => (
            <div key={i} className="p-3 bg-rose-50/50 rounded-lg border border-rose-100">
              <p className="text-sm font-black text-rose-700">{d.term}</p>
              <p className="text-xs text-on-surface-variant leading-relaxed mt-0.5">{d.meaning}</p>
            </div>
          ))}
        </div>
      </AccordionItem>
    )}
  </div>
);

/* ── Concept Map ─────────────────────────────────────────────────────────── */

const ConceptMapRenderer: React.FC<{ notes: GeneratedNotes }> = ({ notes }) => (
  <div className="space-y-3">
    {/* Core concepts chips */}
    {notes.keyPoints?.length > 0 && (
      <div className="flex flex-wrap gap-2 p-3 bg-amber-50/60 border border-amber-100 rounded-xl">
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 w-full mb-1">Core Concepts</p>
        {notes.keyPoints.map((pt, i) => (
          <span key={i} className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold border border-amber-200">{pt}</span>
        ))}
      </div>
    )}

    {/* Connections as compact cards */}
    <div className="grid gap-3 sm:grid-cols-2">
      {notes.conceptConnections?.map((conn, i) => (
        <div key={i} className="bg-white border border-amber-200 rounded-xl p-4 hover:shadow-sm transition-all">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-black">{conn.concept}</span>
            <ArrowRight size={14} className="text-amber-400 shrink-0" />
            <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded text-xs font-black">{conn.connectedConcept}</span>
          </div>
          <p className="text-xs text-on-surface font-semibold">{conn.relationship}</p>
          <div className="flex items-start gap-1.5 mt-2 p-2 bg-amber-50 rounded">
            <Star size={11} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800">{conn.whyItMatters}</p>
          </div>
        </div>
      ))}
    </div>

    {notes.sections?.map((sec, i) => (
      <AccordionItem key={i} title={sec.title} accentBg={AH.bg} accentText={AH.text} accentBorder={AH.border}>
        <p className="text-sm text-on-surface-variant leading-relaxed">{asString(sec.content)}</p>
        {sec.cueQuestions && sec.cueQuestions.length > 0 && (
          <div className="pt-2 border-t border-surface-container-high/50">
            <p className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant mb-1.5">Cue Questions</p>
            <ul className="space-y-1">
              {sec.cueQuestions.map((q, j) => (
                <li key={j} className="flex items-start gap-1.5 text-xs text-on-surface-variant font-medium">
                  <HelpCircle size={11} className="shrink-0 mt-0.5 opacity-60" />{q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </AccordionItem>
    ))}
  </div>
);

/* ── Knowledge Cards (Atomic) ────────────────────────────────────────────── */

const KnowledgeCardsRenderer: React.FC<{ notes: GeneratedNotes }> = ({ notes }) => (
  <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      {notes.knowledgeCards?.map((card, i) => (
        <div key={i} className="bg-white border border-emerald-200 rounded-xl overflow-hidden hover:shadow-sm transition-all">
          <div className="px-3.5 py-2.5 bg-emerald-600">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">#{i + 1}</p>
            <h5 className="text-xs font-black text-white leading-snug">{card.idea}</h5>
          </div>
          <div className="p-3.5 space-y-2">
            <p className="text-xs text-on-surface leading-relaxed">{card.explanation}</p>
            {card.linkedConcepts?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {card.linkedConcepts.map((lc, j) => (
                  <span key={j} className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-semibold">{lc}</span>
                ))}
              </div>
            )}
            <div className="pt-2 border-t border-surface-container-high/50">
              <p className="text-[10px] font-black uppercase text-on-surface-variant mb-0.5">Quiz Q</p>
              <p className="text-[11px] text-on-surface font-semibold leading-snug">{card.quizQuestion}</p>
            </div>
          </div>
        </div>
      ))}
    </div>

    {notes.sections?.map((sec, i) => (
      <AccordionItem key={i} title={sec.title} accentBg={EH.bg} accentText={EH.text} accentBorder={EH.border}>
        <p className="text-sm text-on-surface-variant leading-relaxed">{asString(sec.content)}</p>
      </AccordionItem>
    ))}
  </div>
);

// ─── Slideshow ──────────────────────────────────────────────────────────────

interface NoteSlide {
  title: string;
  explanation: string;
  bullets: string[];
  examTip?: string;
  cueQuestion?: string;
}

/** Coerce any AI-returned value to a plain string (content can arrive as array/object). */
function asString(val: unknown): string {
  if (typeof val === 'string') return val;
  if (val == null) return '';
  if (Array.isArray(val)) return val.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join('\n');
  return JSON.stringify(val);
}

function stripMarkdown(text: string | unknown): string {
  let t = asString(text);
  t = t.replace(/\*\*(.+?)\*\*/g, '$1');
  t = t.replace(/\*(.+?)\*/g, '$1');
  t = t.replace(/__(.+?)__/g, '$1');
  t = t.replace(/_(.+?)_/g, '$1');
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/`([^`]+)`/g, '$1');
  return t.trim();
}

function buildSlides(notes: GeneratedNotes): NoteSlide[] {
  const slides: NoteSlide[] = [];
  const isOverview = (title: string) =>
    /^(overview|introduction|chapter at a glance|sub-?topics)/i.test(title);

  for (const sec of (notes.sections || [])) {
    if (isOverview(sec.title || '')) continue;
    // Gemini sometimes returns content as an array or object — coerce to string.
    const raw = asString(sec.content);
    const contentBullets = raw
      .split(/(?<=[.!?।])\s+|\n+/)
      .map((s: string) => stripMarkdown(s))
      .filter((s: string) => s.length > 10)
      .slice(0, 5);
    slides.push({
      title: stripMarkdown(sec.title || 'Section'),
      explanation: stripMarkdown(raw.substring(0, 220)) + (raw.length > 220 ? '…' : ''),
      bullets: contentBullets,
      examTip: sec.examTips?.[0] ? stripMarkdown(String(sec.examTips[0])) : undefined,
      cueQuestion: sec.cueQuestions?.[0],
    });
  }

  if (notes.definitions?.length && slides.length < 3) {
    slides.push({
      title: 'Key Definitions',
      explanation: 'Important terms for your exam preparation.',
      bullets: notes.definitions.slice(0, 5).map(d => `${d.term} — ${stripMarkdown(d.meaning)}`),
    });
  }

  if (notes.conceptConnections?.length && slides.length < 3) {
    slides.push({
      title: 'Concept Connections',
      explanation: 'How key concepts relate to each other.',
      bullets: notes.conceptConnections.slice(0, 5).map(c => `${c.concept} → ${c.connectedConcept}: ${c.relationship}`),
    });
  }

  return slides.length > 0 ? slides : [{ title: 'Notes', explanation: 'Content is available in the full view.', bullets: [] }];
}

const NoteSlideshow: React.FC<{
  slides: NoteSlide[];
  accentColor: string;
  accentBg: string;
  accentBorder: string;
}> = ({ slides, accentColor, accentBg, accentBorder }) => {
  const [current, setCurrent] = React.useState(0);
  const slide = slides[current];

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.2 }}
          className={`p-5 rounded-xl border-2 ${accentBorder} bg-white`}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${accentColor} ${accentBg}`}>
              {current + 1} / {slides.length}
            </span>
            <h4 className={`text-sm font-black ${accentColor}`}>{slide.title}</h4>
          </div>

          <p className="text-sm text-on-surface leading-relaxed mb-3">{slide.explanation}</p>

          {slide.bullets.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {slide.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-on-surface leading-relaxed">
                  <span className={`shrink-0 w-4 h-4 rounded-full ${accentBg} ${accentColor} flex items-center justify-center text-[9px] font-black mt-0.5`}>
                    {i + 1}
                  </span>
                  <span className="flex-1">{b}</span>
                </li>
              ))}
            </ul>
          )}

          {slide.examTip && (
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100 mb-2">
              <Star size={12} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 font-semibold">{slide.examTip}</p>
            </div>
          )}

          {slide.cueQuestion && (
            <div className="flex items-start gap-1.5 text-xs text-on-surface-variant font-medium">
              <HelpCircle size={11} className="shrink-0 mt-0.5 opacity-60" />
              <span>{slide.cueQuestion}</span>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrent(c => c - 1)}
          disabled={current === 0}
          className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs font-bold disabled:opacity-30 hover:bg-surface-container-high transition-all"
        >
          ← Previous
        </button>
        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-2 h-2 rounded-full transition-all ${accentColor}`}
              style={{ backgroundColor: i === current ? 'currentColor' : 'var(--md-sys-color-surface-container-high, #e0e0e0)', transform: i === current ? 'scale(1.3)' : 'scale(1)' }}
            />
          ))}
        </div>
        <button
          onClick={() => setCurrent(c => c + 1)}
          disabled={current === slides.length - 1}
          className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs font-bold disabled:opacity-30 hover:bg-surface-container-high transition-all"
        >
          Next →
        </button>
      </div>
    </div>
  );
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface StudyNotesPanelProps {
  kit: any;
  planType: PlanType;
  initialStyle?: NoteStyle;
  onOpenFlashcards?: (topic: string) => void;
  onGoToQuiz?: () => void;
  onSave?: (notes: GeneratedNotes) => void;
  onPaywall?: (config: any) => void;
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export const StudyNotesPanel: React.FC<StudyNotesPanelProps> = ({
  kit, planType, initialStyle, onOpenFlashcards, onGoToQuiz, onSave, onPaywall,
}) => {
  const [activeStyle, setActiveStyle] = useState<NoteStyle>(initialStyle || 'smart');
  const [notes, setNotes] = useState<Record<string, GeneratedNotes | null>>({
    smart: null, cornell: null, 'concept-map': null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'slideshow' | 'full'>('slideshow');

  const topic = kit?.chapterTitle || kit?.title || kit?.quiz?.title || 'Topic';
  const subject = kit?.subject || 'General';

  const generate = useCallback(async (style: NoteStyle) => {
    setLoading(true);
    setError(null);
    const params = {
      chapterTitle: topic,
      subject,
      noteStyle: style,
      classLevel: kit?.classLevel || 'Class 10',
      examMode: kit?.examMode || kit?.board || 'CBSE',
      board: kit?.board,
      language: kit?.language,
      sourceContent: kit?.sourceContent,
    };
    // Auto-retry once on parse/network errors before showing error
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const data = await aiService.generateStudyNotes(params);
        setNotes(prev => ({ ...prev, [style]: data }));
        setLoading(false);
        return;
      } catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        const isRetryable = msg.includes('incomplete') || msg.includes('corrupted') || msg.includes('parse') || msg.includes('network') || msg.includes('busy');
        if (attempt === 0 && isRetryable) {
          console.warn(`[StudyNotes] Auto-retrying after: ${e?.message}`);
          continue;
        }
        setError(e?.message || 'Generation failed. Please try again.');
      }
    }
    setLoading(false);
  }, [topic, subject, kit]);

  React.useEffect(() => {
    if (initialStyle) {
      const meta = STYLES.find(s => s.id === initialStyle);
      if (meta && planAllows(planType, meta.minPlan)) {
        generate(initialStyle);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStyleSelect = (style: NoteStyle) => {
    const meta = STYLES.find(s => s.id === style)!;
    if (!planAllows(planType, meta.minPlan)) {
      onPaywall?.({
        title: `${meta.label} requires ${meta.minPlan === 'pro' ? 'Pro' : 'Plus'}`,
        description: `Upgrade to unlock ${meta.label} and all other premium note styles.`,
        ctaLabel: `Upgrade to ${meta.minPlan === 'pro' ? 'Pro' : 'Plus'}`,
        requiredPlan: meta.minPlan,
        benefits: [
          'Cornell Notes — two-column format with cue questions for review',
          'Concept Map — visual relationship mapping between topics',
          'All note types include tables, outlines, and exam tips',
        ],
      });
      return;
    }
    setActiveStyle(style);
    if (!notes[style]) generate(style);

    // Track note-type usage for analytics
    logActivity({
      type: 'note-view',
      chapterTitle: topic,
      subject,
      xpEarned: 3,
      meta: { noteStyle: style },
    });
  };

  const handleExportPDF = () => {
    const current = notes[activeStyle];
    if (!current) return;
    try {
      exportKitToPDF({ ...kit, studyNotes: current, title: topic }, 'readwrite');
    } catch {
      alert('PDF export failed. Please try again.');
    }
  };

  const currentNotes = notes[activeStyle];
  const activeMeta = STYLES.find(s => s.id === activeStyle)!;

  return (
    <div className="bg-white border border-surface-container-high rounded-2xl overflow-hidden card-shadow">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="px-5 py-5 border-b border-surface-container-high">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-teal-50 rounded-xl text-teal-600">
            <BookOpen size={22} />
          </div>
          <div>
            <h3 className="text-lg font-black text-on-surface">Study Workspace</h3>
            <p className="text-xs text-on-surface-variant font-medium mt-0.5">Choose a note style and revise this chapter your way.</p>
          </div>
        </div>

        {/* Style selector with subject recommendation */}
        <div className="flex flex-wrap gap-2">
          {STYLES.map(meta => {
            const allowed = planAllows(planType, meta.minPlan);
            const Icon = meta.icon;
            const isActive = activeStyle === meta.id;
            const isRecommended = meta.id === getRecommendedStyle(subject);
            return (
              <button
                key={meta.id}
                onClick={() => handleStyleSelect(meta.id)}
                title={allowed ? meta.desc : `Requires ${meta.minPlan} plan`}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider border-2 transition-all
                  ${isActive
                    ? `${meta.bg} ${meta.border} ${meta.color} shadow-sm`
                    : 'bg-white border-surface-container-high text-on-surface-variant hover:border-surface-container'}
                  ${!allowed ? 'opacity-60' : ''}
                  ${isRecommended && !isActive ? 'ring-2 ring-amber-300/50' : ''}
                `}
              >
                {!allowed && <Lock size={11} className="shrink-0" />}
                <Icon size={13} className="shrink-0" />
                {meta.shortLabel}
                {meta.minPlan !== 'free' && (
                  <span className={`ml-0.5 px-1 py-0.5 rounded text-[9px] font-black uppercase ${meta.minPlan === 'pro' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {meta.minPlan}
                  </span>
                )}
                {isRecommended && (
                  <span className="absolute -top-1.5 -right-1.5 px-1 py-0.5 bg-amber-400 text-amber-900 rounded text-[7px] font-black leading-none">
                    REC
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className="p-5">
        {/* Generate CTA */}
        {!loading && !error && !currentNotes && (
          <div className="text-center py-10">
            <div className={`w-14 h-14 rounded-2xl ${activeMeta.bg} flex items-center justify-center mx-auto mb-3`}>
              <activeMeta.icon size={28} className={activeMeta.color} />
            </div>
            <h4 className="text-base font-black text-on-surface mb-1.5">{activeMeta.label}</h4>
            <p className="text-sm text-on-surface-variant max-w-xs mx-auto mb-5">{activeMeta.desc}</p>
            <button
              onClick={() => generate(activeStyle)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-teal-700 transition-all shadow-md hover:-translate-y-0.5"
            >
              <Zap size={15} />Generate {activeMeta.shortLabel} Notes
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <Loader2 size={32} className="text-teal-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-on-surface">Generating {activeMeta.label}…</p>
            <p className="text-xs text-on-surface-variant mt-1">Tailoring for {subject} — {kit?.board || 'CBSE'} {kit?.classLevel || ''}</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center py-8 text-center">
            <AlertCircle size={28} className="text-rose-500 mb-2" />
            <p className="text-sm font-bold text-on-surface mb-1">Couldn't generate notes</p>
            <p className="text-xs text-on-surface-variant max-w-sm mb-4">{error}</p>
            <button
              onClick={() => generate(activeStyle)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl font-black text-xs uppercase tracking-widest"
            >
              <RotateCcw size={13} /> Retry
            </button>
          </div>
        )}

        {/* Notes content */}
        {!loading && !error && currentNotes && (
          <>
            {/* v1 → v2 upgrade banner: shown for SMART notes without dense slides */}
            {activeStyle === 'smart' && (!currentNotes.slides || currentNotes.slides.length === 0) && (
              <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-xl bg-amber-50 border border-amber-200">
                <RefreshCw size={16} className="text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-amber-800">Updated format available</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    Dense exam-ready slides with tables, formulas, and comparison panels.
                  </p>
                </div>
                <button
                  onClick={() => generate(activeStyle)}
                  className="shrink-0 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[11px] font-black uppercase tracking-wider hover:bg-amber-700 transition-all"
                >
                  Upgrade
                </button>
              </div>
            )}

            {/* View mode toggle */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setViewMode('slideshow')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'slideshow' ? 'bg-teal-600 text-white shadow-sm' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                Slideshow
              </button>
              <button
                onClick={() => setViewMode('full')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'full' ? 'bg-teal-600 text-white shadow-sm' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                Expand Full Notes
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeStyle}-${viewMode}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* Dense slides (v2) for SMART when available */}
                {activeStyle === 'smart' && currentNotes.slides?.length > 0 ? (
                  viewMode === 'slideshow'
                    ? <DenseSlideshow slides={currentNotes.slides.filter(Boolean)} summary={currentNotes.summary} keyPoints={currentNotes.keyPoints} />
                    : <DenseFullView slides={currentNotes.slides.filter(Boolean)} notes={currentNotes} />
                ) : viewMode === 'slideshow' ? (
                  <NoteSlideshow
                    slides={buildSlides(currentNotes)}
                    accentColor={activeMeta.color}
                    accentBg={activeMeta.bg}
                    accentBorder={activeMeta.border}
                  />
                ) : (
                  <>
                    {activeStyle === 'cornell'     ? <CornellNotesRenderer notes={currentNotes} />
                    : activeStyle === 'concept-map' ? <ConceptMapRenderer   notes={currentNotes} />
                    : <SmartNotesRenderer notes={currentNotes} />}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>

      {/* ── Action Bar ─────────────────────────────────────────────── */}
      {currentNotes && !loading && (
        <div className="px-5 py-3.5 border-t border-surface-container-high bg-surface-container-low flex flex-wrap gap-2.5">
          {onOpenFlashcards && (
            <button onClick={() => onOpenFlashcards(topic)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white rounded-xl font-black text-[11px] uppercase tracking-widest hover:brightness-110 transition-all">
              <Sparkles size={13} />Flashcards
            </button>
          )}
          {onGoToQuiz && (
            <button onClick={onGoToQuiz}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-700 text-white rounded-xl font-black text-[11px] uppercase tracking-widest hover:brightness-110 transition-all">
              <Brain size={13} />Quiz
            </button>
          )}
          {onSave && (
            <button onClick={() => onSave(currentNotes)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-surface-container-high text-on-surface rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-surface-container-low transition-all">
              <BookOpen size={13} />Save
            </button>
          )}
          <button onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-surface-container-high text-on-surface rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-surface-container-low transition-all">
            <Download size={13} />PDF
          </button>
          <button
            onClick={() => { setNotes(prev => ({ ...prev, [activeStyle]: null })); generate(activeStyle); }}
            className="ml-auto flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface font-bold">
            <RotateCcw size={12} />Regenerate
          </button>
        </div>
      )}
    </div>
  );
};
