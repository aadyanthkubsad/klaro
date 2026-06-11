/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ReadWriteHub — compact exam-revision workspace.
 *
 * Layout (top → bottom):
 *   1. Header — title + consistent action buttons (matching Visual/Audio)
 *   2. Grid  Main (col-7)                        | Sidebar (col-5)
 *            └─ Study Workspace (StudyNotesPanel) | Exam Answer Practice (sticky)
 *                                                 | Key Vocabulary carousel
 *   3. Formula/Key Reference Table (full width)
 *   4. Tips and Suggestions + External References (side by side)
 */

import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  Library, ClipboardCheck, RotateCcw, Download, Sparkles, FileText,
  Lightbulb, Edit3, Type, ExternalLink, RefreshCw,
  Send, CheckCircle, AlertTriangle, Loader2,
  X, Eye, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, BookOpen, Target, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { exportKitToPDF, setLastLearningMode } from '../../lib/pdfExport';
import { StudyNotesPanel } from './StudyNotesPanel';
import { aiService } from '../../services/aiService';

import { UserStats, GeneratedNotes, PlanType, ExamAnswerFeedback } from '../../types';
import { recordWrittenAnswer } from '../../services/learningService';
import { getChapterContext } from '../../data/cbseChapterContext';

// ─── Props ───────────────────────────────────────────────────────────────────

interface ReadWriteHubProps {
  setView: (v: string) => void;
  onSave: (item: any) => void;
  kit?: any;
  stats: UserStats;
  planType?: PlanType;
  saveMistake: (mistake: { question: string; userAnswer: string; correction: string; mode: 'visual' | 'aural' | 'readwrite'; topic: string }) => void;
  openFlashcards?: (topic: string, sourceKitId?: string) => void;
  onPaywall?: (config: any) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Strip raw markdown symbols from model answer text. */
function cleanModelAnswer(raw: string): string {
  if (!raw) return '';
  let t = raw;
  t = t.replace(/\*\*(.+?)\*\*/g, '$1');
  t = t.replace(/\*(.+?)\*/g, '$1');
  t = t.replace(/__(.+?)__/g, '$1');
  t = t.replace(/_(.+?)_/g, '$1');
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/\\\(/g, '(').replace(/\\\)/g, ')');
  t = t.replace(/\\\[/g, '[').replace(/\\\]/g, ']');
  t = t.replace(/`([^`]+)`/g, '$1');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

/** Truncate model answer to a reasonable length for the marks. */
function truncateModelAnswer(text: string, marks: number): { short: string; isTruncated: boolean } {
  const maxLines = marks === 1 ? 3 : marks === 3 ? 7 : 12;
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length <= maxLines) return { short: text, isTruncated: false };
  return { short: lines.slice(0, maxLines).join('\n'), isTruncated: true };
}

/** Render cleaned text with bullets and numbered lists styled properly. */
const FormattedText: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n').filter(l => l.trim());
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <div key={i} className="flex items-start gap-2 text-xs text-on-surface leading-relaxed ml-1">
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5" />
              <span>{trimmed.replace(/^[-•]\s*/, '')}</span>
            </div>
          );
        }
        const numMatch = trimmed.match(/^(\d+)[.)]\s*(.*)/);
        if (numMatch) {
          return (
            <div key={i} className="flex items-start gap-2 text-xs text-on-surface leading-relaxed ml-1">
              <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[9px] font-black">{numMatch[1]}</span>
              <span>{numMatch[2]}</span>
            </div>
          );
        }
        return <p key={i} className="text-xs text-on-surface leading-relaxed">{trimmed}</p>;
      })}
    </div>
  );
};

// ─── Vocabulary text cleaner ─────────────────────────────────────────────────
/** Strip ANSI escape codes, Unicode junk, LaTeX, markdown — anything that
 *  renders as □ boxes or garbled text in the browser. */
function cleanVocabText(raw: string): string {
  if (!raw) return '';
  let t = raw;
  // 1. ANSI escape codes: ESC[...m  (the □[1m / □[0m boxes)
  //    ESC can be \x1b, , or the literal □ char (U+FFFD or raw 0x1B)
  // eslint-disable-next-line no-control-regex
  t = t.replace(/(?:\x1b||)?\[[\d;]*[A-Za-z]/g, '');
  // Also catch the visible "□[1m" / "□[0m" pattern (ESC rendered as box)
  t = t.replace(/□\[\d*m/g, '');
  // And raw control chars (0x00-0x1F except \n \r \t)
  // eslint-disable-next-line no-control-regex
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // 2. Unicode replacement char and zero-width chars
  t = t.replace(/[�​‌‍﻿�]/g, '');
  // 3. Stray LaTeX delimiters: \[ \] \( \)
  t = t.replace(/\\[\[\]()]/g, '');
  // 4. Markdown bold/italic/code
  t = t.replace(/\*\*(.+?)\*\*/g, '$1');
  t = t.replace(/\*(.+?)\*/g, '$1');
  t = t.replace(/__(.+?)__/g, '$1');
  t = t.replace(/_(.+?)_/g, '$1');
  t = t.replace(/`([^`]+)`/g, '$1');
  // 5. Orphaned backslash commands (\Delta → Delta)
  t = t.replace(/\\([A-Za-z]+)/g, '$1');
  // 6. Collapse spaces
  t = t.replace(/\s{2,}/g, ' ');
  return t.trim();
}

// ─── Formula Carousel (paginated table slideshow) ────────────────────────────

const FORMULAS_PER_PAGE = 4;

const FormulaCarousel: React.FC<{ formulas: any[]; subject: string }> = ({ formulas, subject }) => {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(formulas.length / FORMULAS_PER_PAGE);
  const start = page * FORMULAS_PER_PAGE;
  const visible = formulas.slice(start, start + FORMULAS_PER_PAGE);
  const canPrev = totalPages > 1;
  const canNext = totalPages > 1;

  const isScienceMath = ['physics', 'chemistry', 'science', 'mathematics', 'maths'].includes((subject || '').toLowerCase());
  const isSocialScience = ['history', 'geography', 'civics', 'social science'].includes((subject || '').toLowerCase());
  const isCommerce = ['accountancy', 'business studies', 'economics'].includes((subject || '').toLowerCase());

  const headerLabel = isScienceMath ? 'Formula Reference' : isSocialScience ? 'Key Dates & Facts' : isCommerce ? 'Key Terms & Rules' : 'Quick Reference';
  const col1 = isSocialScience ? 'Event / Fact' : 'Name';
  const col2 = isScienceMath ? 'Formula / Expression' : isSocialScience ? 'Date / Detail' : 'Rule / Keyword';
  const col3 = isScienceMath ? 'Units / Exam Tip' : 'Notes';

  return (
    <div className="mt-6">
      <div className="bg-white border border-surface-container-high rounded-2xl overflow-hidden card-shadow">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 sm:py-3.5 bg-emerald-600 flex items-center gap-2 sm:gap-3">
          <FileText size={18} className="text-white shrink-0" />
          <h3 className="text-xs sm:text-sm font-black text-white truncate">{headerLabel}</h3>
          <span className="ml-auto px-2 py-0.5 bg-emerald-500 text-white rounded-md text-[10px] font-black shrink-0">{formulas.length} formulas</span>
        </div>

        {/* Carousel body with side arrows */}
        <div className="relative">
          {/* Left arrow — always visible */}
          <button
            onClick={() => canPrev && setPage(p => (p - 1 + totalPages) % totalPages)}
            className={`absolute left-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all ${canPrev ? 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer' : 'bg-emerald-200 text-emerald-400 cursor-default'}`}
          >
            <ChevronLeft size={16} />
          </button>

          {/* Right arrow — always visible */}
          <button
            onClick={() => canNext && setPage(p => (p + 1) % totalPages)}
            className={`absolute right-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all ${canNext ? 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer' : 'bg-emerald-200 text-emerald-400 cursor-default'}`}
          >
            <ChevronRight size={16} />
          </button>

          <div className="p-2 sm:p-4 px-10 sm:px-12">
            <AnimatePresence mode="wait">
              <motion.div
                key={page}
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -60 }}
                transition={{ duration: 0.25 }}
                className="overflow-x-auto"
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-emerald-50 border-b-2 border-emerald-200">
                      <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-emerald-700">{col1}</th>
                      <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-emerald-700">{col2}</th>
                      <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-emerald-700 hidden sm:table-cell">{col3}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row: any, i: number) => (
                      <tr key={i} className={`border-b border-surface-container-high ${i % 2 === 0 ? 'bg-white' : 'bg-emerald-50/30'}`}>
                        <td className="px-2 sm:px-3 py-2 text-xs font-bold text-on-surface">{row.name}</td>
                        <td className="px-2 sm:px-3 py-2 text-xs text-on-surface font-mono font-semibold break-all">{row.formula}</td>
                        <td className="px-2 sm:px-3 py-2 text-xs text-on-surface-variant leading-relaxed hidden sm:table-cell">{row.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Dot indicators + page counter — always visible */}
        <div className="flex items-center justify-center gap-2 pb-3 border-t border-surface-container-high pt-2 mx-4">
          <div className="flex gap-1.5 items-center">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${i === page ? 'bg-emerald-500 scale-110' : 'bg-emerald-200 hover:bg-emerald-300'}`}
              />
            ))}
          </div>
          <span className="text-[10px] text-emerald-600 font-bold ml-2">{page + 1} / {totalPages}</span>
        </div>
      </div>
    </div>
  );
};

// ─── Vocabulary Carousel (compact slideshow) ─────────────────────────────────

const VocabCarousel: React.FC<{ vocab: any[] }> = ({ vocab }) => {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const v = vocab[idx];
  const prev = () => { setIdx(i => (i - 1 + vocab.length) % vocab.length); setFlipped(false); };
  const next = () => { setIdx(i => (i + 1) % vocab.length); setFlipped(false); };

  return (
    <div className="flex flex-col items-center gap-3 h-full">
      <div className="w-full perspective-1000 flex-1 flex flex-col">
        <div
          onClick={() => setFlipped(!flipped)}
          className="relative w-full min-h-[160px] cursor-pointer preserve-3d transition-transform duration-500 flex-1"
          style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          <div className="absolute inset-0 backface-hidden rounded-xl border-2 border-sky-300 bg-gradient-to-br from-sky-50 to-sky-100 p-5 flex flex-col items-center justify-center text-center shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-400 mb-2">Term {idx + 1} / {vocab.length}</p>
            <p className="text-xl font-black text-sky-700">{cleanVocabText(v.word || v.term)}</p>
            <p className="text-[10px] text-sky-500 font-medium mt-3">Tap to reveal definition</p>
          </div>
          <div className="absolute inset-0 backface-hidden rounded-xl border-2 border-sky-300 bg-gradient-to-br from-sky-600 to-sky-700 p-5 flex flex-col items-center justify-center text-center shadow-sm"
            style={{ transform: 'rotateY(180deg)' }}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-200 mb-2">Definition</p>
            <p className="text-sm font-semibold text-white leading-relaxed">{cleanVocabText(v.definition || v.def || v.meaning)}</p>
            <p className="text-[9px] text-sky-200 font-medium mt-3 border-t border-sky-500 pt-2">
              {cleanVocabText(v.examUse || v.usage || 'Often asked as a 1-mark "Define" question.')}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={prev} className="w-7 h-7 rounded-full border-2 border-sky-200 flex items-center justify-center text-sky-600 hover:bg-sky-50 hover:border-sky-400 transition-all">
          <ChevronLeft size={14} />
        </button>
        <div className="flex gap-1">
          {vocab.slice(0, Math.min(vocab.length, 8)).map((_, i) => (
            <button
              key={i}
              onClick={() => { setIdx(i); setFlipped(false); }}
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? 'bg-sky-500 scale-125' : 'bg-sky-200'}`}
            />
          ))}
          {vocab.length > 8 && <span className="text-[8px] text-sky-400 ml-0.5">+{vocab.length - 8}</span>}
        </div>
        <button onClick={next} className="w-7 h-7 rounded-full border-2 border-sky-200 flex items-center justify-center text-sky-600 hover:bg-sky-50 hover:border-sky-400 transition-all">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

// ─── Component ───────────────────────────────────────────────────────────────

export const ReadWriteHub = ({
  setView, onSave, kit, stats, planType = 'free',
  saveMistake, openFlashcards, onPaywall,
}: ReadWriteHubProps) => {

  // ── No kit loaded guard ─────────────────────────────────────────────────
  if (!kit) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-teal-100 flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal-600"><path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
        </div>
        <h3 className="text-lg font-bold text-on-surface mb-2">No content loaded</h3>
        <p className="text-sm text-on-surface-variant max-w-sm mb-6">Please select a chapter from the Library first. Notes and study content will be generated for the selected chapter.</p>
        <button onClick={() => setView('library')} className="px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:brightness-110">Go to Library</button>
      </div>
    );
  }

  // ── Data extraction ──────────────────────────────────────────────────────
  const data = kit;

  const rwData = data.readWrite || { externalReferences: [], tips: [], synthesisPrompt: '' };
  const vocab = typeof data.summary === 'string'
    ? (data.definitions || [])
    : (data.summary?.keyVocabulary || data.definitions || []);
  const keyPoints = typeof data.summary === 'string'
    ? (data.keyPoints || [])
    : (data.summary?.keyPoints || []);
  const summaryText = typeof data.summary === 'string'
    ? data.summary
    : (data.summary?.executiveSummary || data.summary?.text || '');
  const topicTitle = data.quiz?.title || data.title || data.chapterTitle || 'Topic';
  const subject = data.subject || '';
  const kitClassLevel = data.classLevel || 'Class 10';
  const kitStream = data.stream || '';
  const formulaTable = data.formulaTable || [];

  // ── CBSE Previous Year Question-aware exam practice ──────────────────────
  // Uses PYQ bank from cbseChapterContext when available, with regeneration.
  // Falls back to template-based questions for chapters without PYQ data.
  const [questionSeed, setQuestionSeed] = useState(0);

  /** Pick a random item from an array using a seed-based index. */
  const pickFromBank = useCallback((bank: string[], seed: number): string => {
    if (bank.length === 0) return '';
    return bank[seed % bank.length];
  }, []);

  const chapterCtx = useMemo(() =>
    getChapterContext(topicTitle, data?.subject, data?.classLevel),
    [topicTitle, data?.subject, data?.classLevel]
  );

  const isEnglish = (data?.subject || '').toLowerCase() === 'english';
  const isHindi = ['hindi', 'हिंदी', 'हिन्दी'].includes((data?.subject || '').toLowerCase());

  const examQuestions = useMemo(() => {
    const pyq = chapterCtx?.pyqBank;
    const defs = vocab;
    const subjectLC = (data?.subject || '').toLowerCase();
    const isScience = ['science', 'physics', 'chemistry', 'biology'].includes(subjectLC);
    const isMaths = ['mathematics', 'maths'].includes(subjectLC);
    const isCommerce = ['accountancy', 'business studies', 'economics'].includes(subjectLC);
    const isEnglish = subjectLC === 'english';
    const isHindi = ['hindi', 'हिंदी', 'हिन्दी'].includes(subjectLC);
    const term0 = defs[0]?.word || defs[0]?.term || '';
    const term1 = defs[1]?.word || defs[1]?.term || '';

    // Use PYQ bank when available, otherwise fall back to templates.
    // Each seed value produces a different question from the bank.
    const oneMarkQ = pyq?.oneMark?.length
      ? pickFromBank(pyq.oneMark, questionSeed)
      : isScience
        ? (term0 ? `State the SI unit and dimensional formula of "${term0}".` : `State one key principle related to ${topicTitle} with its SI unit.`)
        : isMaths
          ? (keyPoints.length > 0 ? `Write the mathematical expression/formula for: ${keyPoints[0]}.` : `State the formula for ${topicTitle}.`)
          : isCommerce
            ? (term0 ? `Define "${term0}" as per NCERT in one sentence.` : `State one key term related to ${topicTitle}.`)
            : isEnglish
              ? (term0 ? `Define "${term0}".` : `What is the central theme of "${topicTitle}"? Answer in one sentence.`)
              : isHindi
                ? (term0 ? `"${term0}" शब्द का अर्थ लिखिए।` : `"${topicTitle}" पाठ का मूल विषय एक वाक्य में लिखिए।`)
                : (term0 ? `Define "${term0}".` : `State one key principle related to ${topicTitle}.`);

    const twoMarkQ = pyq?.twoMark?.length
      ? pickFromBank(pyq.twoMark, questionSeed)
      : isEnglish
        ? (defs.length > 1
          ? `Distinguish between "${term0}" and "${term1}". Give one example of each.`
          : `What message does the author convey in "${topicTitle}"? Support your answer with one reference from the text.`)
        : isHindi
          ? (defs.length > 1
            ? `"${term0}" और "${term1}" में अंतर स्पष्ट कीजिए। प्रत्येक का एक उदाहरण दीजिए।`
            : `"${topicTitle}" पाठ में लेखक/कवि क्या संदेश देना चाहते हैं? पाठ के आधार पर उत्तर दीजिए।`)
          : defs.length > 1
            ? `Distinguish between "${term0}" and "${term1}". Give one example of each.`
            : keyPoints.length > 0
              ? `State and explain with an example: "${keyPoints[0]}".`
              : `Give two characteristics of ${topicTitle} with examples.`;

    const threeMarkQ = pyq?.threeMark?.length
      ? pickFromBank(pyq.threeMark, questionSeed)
      : isScience
        ? (keyPoints.length > 2
          ? `Derive or prove: "${keyPoints[2]}". Show all steps with proper units and dimensional analysis.`
          : `A student performs an experiment related to ${topicTitle} and records the following observations. Calculate the result showing step-by-step working with proper units and significant figures.`)
        : isMaths
          ? (keyPoints.length > 2 ? `Prove: "${keyPoints[2]}". Show each step clearly.` : `Solve a problem based on ${topicTitle}. Show step-by-step working.`)
          : isCommerce
            ? `A business scenario involves ${topicTitle}. Prepare the relevant journal entries / calculations with proper format. Show all workings.`
            : isEnglish
              ? `Explain with examples: "European art focuses on realistic depiction and creating an illusion of depth and space.". Support your answer with a specific case or data.`
              : isHindi
                ? (keyPoints.length > 1
                  ? `"${keyPoints[1]}" — इस कथन को "${topicTitle}" पाठ के आधार पर उदाहरण सहित स्पष्ट कीजिए।`
                  : `"${topicTitle}" पाठ के किन्हीं तीन प्रमुख बिंदुओं को उदाहरण सहित समझाइए।`)
                : (keyPoints.length > 1
                  ? `Explain with examples: "${keyPoints[1]}". Support your answer with a specific case or data.`
                  : `Explain three key aspects of ${topicTitle} with specific examples or data.`);

    const fiveMarkQ = pyq?.fiveMark?.length
      ? pickFromBank(pyq.fiveMark, questionSeed)
      : isScience
        ? `(a) State the key principle/law related to ${topicTitle}. (b) Derive the main formula/expression using this principle. Show all steps. (c) State two limitations of this method or two assumptions made. [2+2+1]`
        : isMaths
          ? `(a) State and prove the main theorem/formula related to ${topicTitle}. (b) Using this result, solve: [a numerical of medium difficulty]. (c) State one condition where this result does not apply. [2+2+1]`
          : isCommerce
            ? `Read the following case: A company dealing with ${topicTitle} faces a specific situation. (a) Identify the relevant concept and define it. (b) Prepare the required statement/entry/calculation with proper format. (c) State one advantage and one limitation. [2+2+1]`
            : isEnglish
              ? `(a) Define the key concepts related to ${topicTitle} with NCERT definitions. (b) Explain with two specific examples or a case study. (c) State any limitations, criticisms, or exceptions. [2+2+1]`
              : isHindi
                ? `(क) "${topicTitle}" पाठ के मुख्य विषय/भाव को NCERT के अनुसार परिभाषित कीजिए। (ख) पाठ से दो विशिष्ट उदाहरण देकर समझाइए। (ग) इस पाठ की सीमाओं अथवा आलोचनाओं पर टिप्पणी कीजिए। [2+2+1]`
                : `(a) Define the key concepts related to ${topicTitle} with NCERT definitions. (b) Explain with two specific examples or a case study. (c) State any limitations, criticisms, or exceptions. [2+2+1]`;

    return [
      { marks: 1, question: oneMarkQ },
      { marks: 2, question: twoMarkQ },
      { marks: 3, question: threeMarkQ },
      { marks: 5, question: fiveMarkQ },
    ];
  }, [vocab, keyPoints, topicTitle, data?.subject, data?.classLevel, questionSeed, chapterCtx, pickFromBank]);

  const hasPyqBank = !!(chapterCtx?.pyqBank);

  const regenerateQuestions = useCallback(() => {
    setQuestionSeed(prev => prev + 1);
    setSelectedExamQ(null);
    setExamAnswer('');
    setExamFeedback(null);
    setExamError(null);
  }, []);

  // ── State ────────────────────────────────────────────────────────────────
  const [selectedExamQ, setSelectedExamQ] = useState<number | null>(null);
  const [examAnswer, setExamAnswer] = useState('');
  const [examSubmitting, setExamSubmitting] = useState(false);
  const [examFeedback, setExamFeedback] = useState<ExamAnswerFeedback | null>(null);
  const [examError, setExamError] = useState<string | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackTab, setFeedbackTab] = useState<'overview' | 'keywords' | 'model' | 'improve'>('overview');
  const [showFullModelAnswer, setShowFullModelAnswer] = useState(false);

  // Refs for scroll-to
  const notesRef = useRef<HTMLDivElement>(null);
  const vocabRef = useRef<HTMLDivElement>(null);
  const examRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => { setLastLearningMode('readwrite'); }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const exportToPDF = () => {
    try { exportKitToPDF(data, 'readwrite'); }
    catch { alert('Could not generate PDF. Please try again.'); }
  };

  const handleExamSubmit = async () => {
    if (selectedExamQ === null) return;
    if (!examAnswer.trim()) return;
    const q = examQuestions[selectedExamQ];
    setExamSubmitting(true);
    setExamError(null);
    setExamFeedback(null);
    try {
      const fb = await aiService.evaluateAnswer({
        topic: topicTitle,
        subject,
        classLevel: kitClassLevel,
        examMode: 'CBSE',
        question: q.question,
        studentAnswer: examAnswer,
        totalMarks: q.marks,
        answerMode: 'typed',
      });
      setExamFeedback(fb);

      recordWrittenAnswer({
        topic: topicTitle,
        subject,
        question: q.question,
        studentAnswer: examAnswer,
        answerMode: 'typed',
        marksScored: fb.marksScored,
        totalMarks: fb.totalMarks,
        missingKeywords: fb.missingKeywords || [],
        strengths: fb.strengths || [],
        improvements: fb.improvements || [],
        modelAnswer: fb.modelAnswer || '',
        examTip: fb.examTip || '',
      });
    } catch (e: any) {
      setExamError(e?.message || 'Evaluation failed.');
    } finally {
      setExamSubmitting(false);
    }
  };

  const resetExam = () => {
    setSelectedExamQ(null);
    setExamAnswer('');
    setExamFeedback(null);
    setExamError(null);
    setShowFeedbackModal(false);
    setShowFullModelAnswer(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-20">

      {/* ─── Header ───────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="mb-5">
          <span className="inline-block px-3 py-1 rounded bg-teal-100 text-[10px] font-bold mb-3 uppercase tracking-widest text-teal-600 border border-teal-200">
            Read / Write Mode
          </span>
          <h2 className="text-3xl font-black tracking-tight text-on-surface">{topicTitle}</h2>
          <p className="text-on-surface-variant mt-1 text-sm font-medium">Exam revision workspace · CBSE {kitClassLevel}{kitStream ? ` · ${kitStream}` : ''}{subject ? ` · ${subject}` : ''}</p>
        </div>

        {/* ─── Consistent Action Bar (matches Visual/Audio) ───────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <button
            onClick={() => onSave({ title: topicTitle, type: 'readwrite', contentSnippet: summaryText.substring(0, 120) })}
            className="h-11 flex items-center justify-center gap-2 bg-teal-100 text-teal-700 px-4 rounded-lg shadow-sm hover:bg-teal-200 transition-all font-bold text-sm"
          >
            <Library size={16} />
            Save to Library
          </button>
          <button
            onClick={() => setView('practice')}
            className="h-11 flex items-center justify-center gap-2 bg-navy-dark text-white px-4 rounded-lg shadow-sm hover:bg-teal-600 transition-all font-bold text-sm"
          >
            <ClipboardCheck size={16} />
            Take Hub Quiz
          </button>
          <button
            onClick={() => openFlashcards?.(topicTitle, data.id)}
            className="h-11 flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 rounded-lg shadow-sm hover:brightness-110 transition-all font-bold text-xs leading-tight text-center"
          >
            <Sparkles size={16} className="shrink-0" />
            <span>Key Term Flashcards</span>
          </button>
          <button
            onClick={() => setView('dashboard')}
            className="h-11 flex items-center justify-center gap-2 bg-white border border-surface-container-high text-on-surface px-4 rounded-lg shadow-sm hover:bg-surface-container-low transition-all font-bold text-sm"
          >
            <RotateCcw size={16} />
            Reset
          </button>
          <button
            onClick={exportToPDF}
            className="h-11 flex items-center justify-center gap-2 bg-primary text-white px-4 rounded-lg shadow-md hover:opacity-90 active:scale-95 transition-all font-bold text-sm"
          >
            <Download size={16} />
            Download PDF
          </button>
        </div>
      </div>

      {/* ─── Two-Column: Notes (60%) + Exam Practice (40%) ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ─── Left: Study Workspace ──────────────────────────────── */}
        <div className="lg:col-span-7">
          <div ref={notesRef} className="scroll-mt-20">
            <StudyNotesPanel
              kit={kit}
              planType={planType}
              onOpenFlashcards={openFlashcards ? (topic) => openFlashcards(topic, kit?.id) : undefined}
              onGoToQuiz={() => setView('practice')}
              onSave={(notes: GeneratedNotes) => onSave({ title: `Notes: ${notes.topic}`, type: 'readwrite', contentSnippet: notes.summary?.substring(0, 120) || '' })}
              onPaywall={onPaywall}
            />
          </div>

          {/* ─── Formula / Key Reference Carousel (under notes) ────── */}
          {formulaTable.length > 0 && (
            <FormulaCarousel formulas={formulaTable} subject={subject} />
          )}
        </div>

        {/* ─── Right: Exam Answer Practice (40%, compact) ────────── */}
        <div className="lg:col-span-5">
          <div ref={examRef} className="scroll-mt-20 bg-white border border-surface-container-high rounded-2xl overflow-hidden card-shadow lg:sticky lg:top-16">
            <div className="px-5 py-3.5 bg-violet-600 flex items-center gap-3">
              <Edit3 size={18} className="text-white" />
              <div>
                <h3 className="text-sm font-black text-white">Exam Answer Practice</h3>
                <p className="text-[10px] text-violet-200 font-medium">Write · Submit · AI Feedback</p>
              </div>
            </div>

            <div className="p-4">
              {/* Question selection */}
              {selectedExamQ === null && !examFeedback && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Choose a question</p>
                    {hasPyqBank && (
                      <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded-md text-[9px] font-black uppercase">PYQ Based</span>
                    )}
                  </div>
                  {examQuestions.map((q, i) => (
                    <button
                      key={`${questionSeed}-${i}`}
                      onClick={() => { setSelectedExamQ(i); setExamAnswer(''); setExamFeedback(null); }}
                      className="w-full text-left p-3 rounded-xl border-2 border-surface-container-high hover:border-violet-400 hover:shadow-md transition-all group"
                    >
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase mb-1.5 ${
                        q.marks === 1 ? 'bg-green-100 text-green-700' :
                        q.marks === 2 ? 'bg-blue-100 text-blue-700' :
                        q.marks === 3 ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {q.marks} Mark{q.marks > 1 ? 's' : ''}
                      </span>
                      <p className="text-xs text-on-surface font-semibold group-hover:text-violet-700 transition-colors leading-relaxed">{q.question}</p>
                    </button>
                  ))}

                  {/* Regenerate button */}
                  <button
                    onClick={regenerateQuestions}
                    className="w-full flex items-center justify-center gap-2 py-2.5 mt-1 rounded-xl border-2 border-dashed border-violet-300 text-violet-600 hover:bg-violet-50 hover:border-violet-400 transition-all"
                  >
                    <RefreshCw size={14} />
                    <span className="text-xs font-black uppercase tracking-wider">
                      {hasPyqBank ? 'New PYQ Questions' : 'Regenerate Questions'}
                    </span>
                  </button>
                </div>
              )}

              {/* Answer writing — typed only */}
              {selectedExamQ !== null && !examFeedback && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                      examQuestions[selectedExamQ].marks === 1 ? 'bg-green-100 text-green-700' :
                      examQuestions[selectedExamQ].marks === 3 ? 'bg-amber-100 text-amber-700' :
                      'bg-rose-100 text-rose-700'
                    }`}>
                      {examQuestions[selectedExamQ].marks} Mark{examQuestions[selectedExamQ].marks > 1 ? 's' : ''}
                    </span>
                    <button onClick={resetExam} className="text-[10px] text-on-surface-variant hover:text-on-surface font-bold">
                      ← Back
                    </button>
                  </div>
                  <p className="text-sm font-bold text-on-surface leading-relaxed">{examQuestions[selectedExamQ].question}</p>

                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Write your answer</p>
                  <textarea
                    value={examAnswer}
                    onChange={e => setExamAnswer(e.target.value)}
                    placeholder="Type your exam answer here. Lumina will check your keywords, accuracy, and marks."
                    className="w-full h-36 p-3 border-2 border-surface-container-high rounded-xl text-xs text-on-surface leading-relaxed resize-none focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all font-medium placeholder:text-on-surface-variant/40"
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-on-surface-variant font-mono">
                      {examAnswer.trim() ? examAnswer.trim().split(/\s+/).length : 0} words
                    </p>
                    <button
                      onClick={handleExamSubmit}
                      disabled={!examAnswer.trim() || examSubmitting}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {examSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      {examSubmitting ? 'Evaluating…' : 'Submit'}
                    </button>
                  </div>

                  {/* General error (evaluation) */}
                  {examError && (
                    <div className="flex items-center gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-lg">
                      <AlertTriangle size={12} className="text-rose-500 shrink-0" />
                      <p className="text-[10px] text-rose-700 font-medium flex-1">{examError}</p>
                      <button onClick={handleExamSubmit} className="text-[10px] text-rose-600 font-bold underline shrink-0">Retry</button>
                    </div>
                  )}
                </div>
              )}

              {/* Compact score preview — full feedback opens in modal */}
              {examFeedback && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200">
                    <div className="text-center">
                      <p className="text-3xl font-black text-violet-700">{examFeedback.marksScored}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-violet-400">/ {examFeedback.totalMarks}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-on-surface mb-1">
                        {examFeedback.marksScored === examFeedback.totalMarks ? 'Perfect score!' :
                         examFeedback.marksScored >= examFeedback.totalMarks * 0.6 ? 'Good attempt!' :
                         'Needs more work.'}
                      </p>
                      <div className="w-full h-2 bg-violet-100 rounded-full mt-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            examFeedback.marksScored === examFeedback.totalMarks ? 'bg-green-500' :
                            examFeedback.marksScored >= examFeedback.totalMarks * 0.6 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${(examFeedback.marksScored / examFeedback.totalMarks) * 100}%` }}
                        />
                      </div>
                      {examFeedback.missingKeywords?.length > 0 && (
                        <p className="text-[10px] text-rose-500 font-medium mt-1.5">
                          {examFeedback.missingKeywords.length} keyword{examFeedback.missingKeywords.length > 1 ? 's' : ''} missing
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => { setShowFeedbackModal(true); setFeedbackTab('overview'); }}
                    className="w-full py-3 rounded-xl bg-violet-600 text-white font-black text-xs uppercase tracking-widest hover:bg-violet-700 transition-all flex items-center justify-center gap-2 shadow-md"
                  >
                    <Eye size={14} /> Open Full Feedback
                  </button>

                  <button
                    onClick={resetExam}
                    className="w-full py-2.5 rounded-xl border-2 border-violet-200 text-violet-700 font-black text-[10px] uppercase tracking-widest hover:bg-violet-50 transition-all"
                  >
                    Try Another Question
                  </button>
                  <button
                    onClick={regenerateQuestions}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-violet-500 text-[10px] font-bold uppercase tracking-wider hover:text-violet-700 transition-all"
                  >
                    <RefreshCw size={11} />
                    {hasPyqBank ? 'New PYQ Set' : 'New Questions'}
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* ─── Key Vocabulary — below Exam Answer Practice ─────── */}
          {vocab.length > 0 && (
            <div ref={vocabRef} className="mt-4 bg-white border border-surface-container-high rounded-2xl overflow-hidden card-shadow">
              <div className="px-4 py-3 bg-sky-600 flex items-center gap-2">
                <Type size={16} className="text-white" />
                <h3 className="text-xs sm:text-sm font-black text-white">Key Vocabulary</h3>
                <span className="ml-auto px-2 py-0.5 bg-sky-500 text-white rounded-md text-[9px] font-black">{vocab.length} terms</span>
              </div>
              <div className="p-3 sm:p-4">
                <VocabCarousel vocab={vocab} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Tips and Suggestions + External References (side by side) ── */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 card-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 text-white rounded-lg">
                <Sparkles size={14} />
              </div>
              <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest">Tips and Suggestions</h4>
            </div>
            <Lightbulb size={16} className="text-amber-500" />
          </div>
          <ul className="space-y-2">
            {rwData.tips?.length > 0 ? rwData.tips.map((tip: string, i: number) => (
              <li key={i} className="flex gap-2 items-start p-2.5 bg-white rounded-lg border border-indigo-100 text-xs font-medium text-on-surface-variant leading-relaxed">
                <div className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-[10px]">{i + 1}</div>
                {tip}
              </li>
            )) : <li className="text-[10px] text-on-surface-variant italic">No study tips yet.</li>}
          </ul>
        </div>
        <div className="bg-surface-container-low border border-surface-container rounded-lg p-5">
          <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3">External References</h4>
          <div className="space-y-2.5">
            {rwData.externalReferences?.length > 0 ? rwData.externalReferences.map((ref: string, i: number) => (
              <a key={i} href={ref} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between bg-white p-3 rounded border border-surface-container hover:border-teal-500 transition-all group shadow-sm">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-on-surface">Reference {i + 1}</span>
                  <span className="text-[10px] text-on-surface-variant truncate max-w-[200px]">{ref}</span>
                </div>
                <ExternalLink size={14} className="text-on-surface-variant group-hover:text-teal-600" />
              </a>
            )) : (
              <p className="text-[10px] text-on-surface-variant italic">No external references.</p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Feedback Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showFeedbackModal && examFeedback && selectedExamQ !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setShowFeedbackModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Modal header */}
              <div className="px-6 py-4 bg-violet-600 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-2xl font-black text-white">{examFeedback.marksScored}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-violet-200">/ {examFeedback.totalMarks}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">Exam Feedback</h3>
                    <p className="text-[10px] text-violet-200 font-medium">
                      {examFeedback.marksScored === examFeedback.totalMarks ? 'Perfect score!' :
                       examFeedback.marksScored >= examFeedback.totalMarks * 0.6 ? 'Good attempt — review the feedback below.' :
                       'Review the feedback below to improve.'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowFeedbackModal(false)} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  <X size={20} />
                </button>
              </div>

              {/* Tabs */}
              <div className="px-6 py-2 border-b border-surface-container-high flex gap-1 bg-surface-container-low shrink-0 overflow-x-auto">
                {([
                  { id: 'overview' as const, label: 'Overview', icon: Target },
                  { id: 'keywords' as const, label: 'Missing Keywords', icon: AlertTriangle },
                  { id: 'model' as const, label: 'Model Answer', icon: BookOpen },
                  { id: 'improve' as const, label: 'Improve', icon: Zap },
                ]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setFeedbackTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                      feedbackTab === tab.id
                        ? 'bg-violet-100 text-violet-700 shadow-sm'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                    }`}
                  >
                    <tab.icon size={12} />
                    {tab.label}
                    {tab.id === 'keywords' && examFeedback.missingKeywords?.length > 0 && (
                      <span className="px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded text-[9px] font-black">{examFeedback.missingKeywords.length}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* ── Overview ─────────────────────────────────────── */}
                {feedbackTab === 'overview' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-on-surface">Score</p>
                        <p className="text-sm font-black text-violet-700">{examFeedback.marksScored} / {examFeedback.totalMarks}</p>
                      </div>
                      <div className="w-full h-2.5 bg-violet-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${examFeedback.marksScored === examFeedback.totalMarks ? 'bg-green-500' : examFeedback.marksScored >= examFeedback.totalMarks * 0.6 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${(examFeedback.marksScored / examFeedback.totalMarks) * 100}%` }} />
                      </div>
                    </div>
                    <div className="p-3 bg-surface-container-low rounded-lg border border-surface-container">
                      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1">Question ({examQuestions[selectedExamQ].marks} marks)</p>
                      <p className="text-xs text-on-surface font-medium leading-relaxed">{examQuestions[selectedExamQ].question}</p>
                    </div>
                    {examFeedback.strengths?.length > 0 && (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                        <p className="text-[10px] font-black uppercase tracking-widest text-green-600 mb-2">Strengths</p>
                        <ul className="space-y-1.5">
                          {examFeedback.strengths.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-green-800 font-medium leading-relaxed">
                              <CheckCircle size={12} className="shrink-0 mt-0.5 text-green-500" />{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {examFeedback.improvements?.length > 0 && (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-2">Areas to Improve</p>
                        <ul className="space-y-1.5">
                          {examFeedback.improvements.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-amber-800 font-medium leading-relaxed">
                              <Lightbulb size={12} className="shrink-0 mt-0.5 text-amber-500" />{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {examFeedback.examTip && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1.5">Exam Tip</p>
                        <p className="text-xs text-blue-800 font-medium leading-relaxed">{examFeedback.examTip}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Missing Keywords ─────────────────────────────── */}
                {feedbackTab === 'keywords' && (
                  <div className="space-y-4">
                    {examFeedback.missingKeywords?.length > 0 ? (
                      <>
                        <p className="text-xs text-on-surface-variant font-medium">These keywords were expected but not found in your answer. Including them improves your marks.</p>
                        <div className="flex flex-wrap gap-2">
                          {examFeedback.missingKeywords.map((kw, i) => (
                            <span key={i} className="px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg text-sm font-bold border border-rose-200">{kw}</span>
                          ))}
                        </div>
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1.5">Exam Tip</p>
                          <p className="text-xs text-blue-800 font-medium leading-relaxed">
                            CBSE examiners look for specific keywords. For a {examQuestions[selectedExamQ].marks}-mark question, try to include at least {examQuestions[selectedExamQ].marks} key technical terms.
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <CheckCircle size={32} className="text-green-500 mx-auto mb-2" />
                        <p className="text-sm font-bold text-green-700">All keywords covered!</p>
                        <p className="text-xs text-on-surface-variant mt-1">Your answer included all the expected terms.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Model Answer ─────────────────────────────────── */}
                {feedbackTab === 'model' && (
                  <div className="space-y-4">
                    {examFeedback.modelAnswer ? (() => {
                      const cleaned = cleanModelAnswer(examFeedback.modelAnswer);
                      const { short, isTruncated } = truncateModelAnswer(cleaned, examQuestions[selectedExamQ].marks);
                      return (
                        <>
                          <div className="p-4 bg-violet-50 border border-violet-200 rounded-xl">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[10px] font-black uppercase tracking-widest text-violet-500">Ideal Answer ({examQuestions[selectedExamQ].marks} marks)</p>
                              {isTruncated && (
                                <button onClick={() => setShowFullModelAnswer(!showFullModelAnswer)} className="flex items-center gap-1 text-[10px] text-violet-600 font-bold hover:text-violet-800 transition-all">
                                  {showFullModelAnswer ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  {showFullModelAnswer ? 'Show less' : 'Show longer answer'}
                                </button>
                              )}
                            </div>
                            <FormattedText text={showFullModelAnswer || !isTruncated ? cleaned : short} />
                          </div>
                          <div className="p-3 bg-surface-container-low rounded-lg border border-surface-container">
                            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">CBSE Answer Structure</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {(isEnglish
                                ? (examQuestions[selectedExamQ].marks === 1
                                  ? ['Key Term / Theme']
                                  : examQuestions[selectedExamQ].marks <= 3
                                    ? ['Context / Reference', 'Explanation', 'Textual Evidence']
                                    : ['Introduction', 'Theme / Character', 'Textual Evidence', 'Literary Device', 'Conclusion'])
                                : isHindi
                                  ? (examQuestions[selectedExamQ].marks === 1
                                    ? ['शब्दार्थ / परिभाषा']
                                    : examQuestions[selectedExamQ].marks <= 3
                                      ? ['संदर्भ', 'व्याख्या', 'पाठ से प्रमाण']
                                      : ['भूमिका', 'विषय / पात्र', 'पाठ से प्रमाण', 'भाषिक विशेषता', 'निष्कर्ष'])
                                : (examQuestions[selectedExamQ].marks === 1
                                  ? ['Definition']
                                  : examQuestions[selectedExamQ].marks === 3
                                    ? ['Definition', 'Explanation', 'Example']
                                    : ['Definition', 'Explanation', 'Example', 'Diagram Note', 'Conclusion'])
                              ).map(s => (
                                <span key={s} className="px-2 py-1 bg-violet-100 text-violet-700 rounded-md text-[10px] font-bold">{s}</span>
                              ))}
                            </div>
                          </div>
                        </>
                      );
                    })() : (
                      <p className="text-xs text-on-surface-variant italic text-center py-8">No model answer available.</p>
                    )}
                  </div>
                )}

                {/* ── Improve ──────────────────────────────────────── */}
                {feedbackTab === 'improve' && (
                  <div className="space-y-4">
                    {examFeedback.improvements?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-on-surface mb-2">What to work on:</p>
                        {examFeedback.improvements.map((s, i) => (
                          <div key={i} className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                            <span className="shrink-0 w-5 h-5 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-[10px] font-black mt-0.5">{i + 1}</span>
                            <p className="text-xs text-amber-800 font-medium leading-relaxed">{s}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      {openFlashcards && (
                        <button onClick={() => { setShowFeedbackModal(false); openFlashcards(topicTitle, kit?.id); }} className="flex items-center justify-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-all">
                          <Sparkles size={14} /> Review Flashcards
                        </button>
                      )}
                      <button onClick={() => { setShowFeedbackModal(false); resetExam(); }} className="flex items-center justify-center gap-2 p-3 bg-violet-50 border border-violet-200 rounded-xl text-violet-700 text-xs font-bold hover:bg-violet-100 transition-all">
                        <Edit3 size={14} /> Practice Similar Q
                      </button>
                    </div>
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1.5">Exam Tip</p>
                      <p className="text-xs text-blue-800 font-medium leading-relaxed">
                        For {examQuestions[selectedExamQ].marks}-mark questions, CBSE expects{' '}
                        {examQuestions[selectedExamQ].marks === 1 ? 'a clear one-line definition with the key term.'
                         : examQuestions[selectedExamQ].marks === 3 ? '3 distinct points: definition, explanation, and one example.'
                         : 'an introduction, 4-5 key points with examples, a diagram reference, and a conclusion.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal footer */}
              <div className="px-6 py-3 border-t border-surface-container-high bg-surface-container-low flex items-center justify-between shrink-0">
                <button onClick={() => { setShowFeedbackModal(false); resetExam(); }} className="text-xs text-on-surface-variant font-bold hover:text-on-surface transition-all">
                  Try Another Question
                </button>
                <button onClick={() => setShowFeedbackModal(false)} className="px-4 py-2 bg-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-violet-700 transition-all">
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
