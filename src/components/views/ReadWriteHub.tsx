/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ReadWriteHub — compact exam-revision workspace.
 *
 * Layout (top → bottom):
 *   1. Header — title + consistent action buttons (matching Visual/Audio)
 *   2. Grid  Main (col-7)                        | Sidebar (col-5)
 *            └─ Study Workspace (StudyNotesPanel) | Exam Answer Practice
 *   3. Key Vocabulary (full width)
 *   4. Tips and Suggestions + External References (side by side)
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  Library, ClipboardCheck, RotateCcw, Download, Sparkles, FileText,
  Lightbulb, Edit3, Type, ExternalLink,
  Send, CheckCircle, AlertTriangle, Loader2,
  X, Eye, ChevronDown, ChevronUp, BookOpen, Target, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { exportKitToPDF, setLastLearningMode } from '../../lib/pdfExport';
import { StudyNotesPanel } from './StudyNotesPanel';
import { aiService } from '../../services/aiService';

import { UserStats, GeneratedNotes, PlanType, ExamAnswerFeedback } from '../../types';
import { recordWrittenAnswer } from '../../services/learningService';

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

// ─── Component ───────────────────────────────────────────────────────────────

export const ReadWriteHub = ({
  setView, onSave, kit, stats, planType = 'free',
  saveMistake, openFlashcards, onPaywall,
}: ReadWriteHubProps) => {

  // ── Data extraction ──────────────────────────────────────────────────────
  const data = kit || {
    summary: { text: '', executiveSummary: '', keyPoints: [], keyVocabulary: [] },
    quiz: { title: 'Topic Mastery', questions: [] },
    flashcards: { cards: [] },
    readWrite: { externalReferences: [], tips: [], synthesisPrompt: '' },
  };

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

  // ── Exam questions derived from kit data ─────────────────────────────────
  const examQuestions = useMemo(() => {
    const defs = vocab;
    const oneMarkQ = defs.length > 0
      ? `Define "${defs[0].word || defs[0].term}".`
      : `State one key fact about ${topicTitle}.`;

    const threeMarkQ = keyPoints.length > 1
      ? `Explain the following with an example: "${keyPoints[1]}"`
      : `Describe three key features of ${topicTitle}.`;

    const fiveMarkQ = rwData.synthesisPrompt
      || `Explain ${topicTitle} in detail. Include definitions, key concepts, and real-world applications.`;

    return [
      { marks: 1, question: oneMarkQ },
      { marks: 3, question: threeMarkQ },
      { marks: 5, question: fiveMarkQ },
    ];
  }, [vocab, keyPoints, topicTitle, rwData.synthesisPrompt]);

  // ── State ────────────────────────────────────────────────────────────────
  const [selectedExamQ, setSelectedExamQ] = useState<number | null>(null);
  const [examAnswer, setExamAnswer] = useState('');
  const [examSubmitting, setExamSubmitting] = useState(false);
  const [examFeedback, setExamFeedback] = useState<ExamAnswerFeedback | null>(null);
  const [examError, setExamError] = useState<string | null>(null);
  const [showAllVocab, setShowAllVocab] = useState(false);
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
        classLevel: 'Class 10',
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
          <p className="text-on-surface-variant mt-1 text-sm font-medium">Exam revision workspace · CBSE Class 10</p>
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
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">Choose a question</p>
                  {examQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => { setSelectedExamQ(i); setExamAnswer(''); setExamFeedback(null); }}
                      className="w-full text-left p-3 rounded-xl border-2 border-surface-container-high hover:border-violet-400 hover:shadow-md transition-all group"
                    >
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase mb-1.5 ${
                        q.marks === 1 ? 'bg-green-100 text-green-700' :
                        q.marks === 3 ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {q.marks} Mark{q.marks > 1 ? 's' : ''}
                      </span>
                      <p className="text-xs text-on-surface font-semibold group-hover:text-violet-700 transition-colors leading-relaxed">{q.question}</p>
                    </button>
                  ))}
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
                    placeholder="Type your exam answer here. Klaro will check your keywords, accuracy, and marks."
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
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Key Vocabulary (full width below two-column area) ────────── */}
      <div ref={vocabRef} className="scroll-mt-20 mt-6 bg-white border border-surface-container-high rounded-2xl overflow-hidden card-shadow">
        <div className="px-5 py-3.5 bg-sky-600 flex items-center gap-3">
          <Type size={18} className="text-white" />
          <h3 className="text-sm font-black text-white">Key Vocabulary</h3>
          {vocab.length > 0 && (
            <span className="ml-auto px-2 py-0.5 bg-sky-500 text-white rounded-md text-[10px] font-black">{vocab.length} terms</span>
          )}
        </div>
        <div className="p-4">
          {vocab.length > 0 ? (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(showAllVocab ? vocab : vocab.slice(0, 6)).map((v: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg border border-sky-100 bg-sky-50/30">
                    <p className="text-sm font-black text-sky-700">{v.word || v.term}</p>
                    <p className="text-xs text-on-surface leading-relaxed mt-0.5">{v.definition || v.def || v.meaning}</p>
                    <p className="text-[10px] text-sky-500 mt-1 font-medium">
                      {v.examUse || v.usage || 'Often asked as a 1-mark "Define" question.'}
                    </p>
                  </div>
                ))}
              </div>
              {vocab.length > 6 && !showAllVocab && (
                <button onClick={() => setShowAllVocab(true)} className="mt-3 w-full py-2 rounded-lg border border-sky-200 text-sky-700 text-xs font-bold hover:bg-sky-50 transition-all">
                  Show {vocab.length - 6} more terms
                </button>
              )}
              {showAllVocab && vocab.length > 6 && (
                <button onClick={() => setShowAllVocab(false)} className="mt-3 w-full py-2 rounded-lg border border-sky-200 text-sky-700 text-xs font-bold hover:bg-sky-50 transition-all">
                  Show less
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-on-surface-variant italic text-center py-4">No vocabulary terms available.</p>
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
                              {(examQuestions[selectedExamQ].marks === 1
                                ? ['Definition']
                                : examQuestions[selectedExamQ].marks === 3
                                  ? ['Definition', 'Explanation', 'Example']
                                  : ['Definition', 'Explanation', 'Example', 'Diagram Note', 'Conclusion']
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
