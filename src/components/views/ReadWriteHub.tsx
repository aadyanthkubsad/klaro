/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ReadWriteHub — compact exam-revision workspace.
 *
 * Layout (top → bottom):
 *   1. Header — title + compact action buttons
 *   2. Sticky Jump Bar — Notes · Vocabulary · Exam Practice · Flashcards · Quiz
 *   3. Grid  Main (col-8)                        | Sidebar (col-4)
 *            └─ Study Workspace (StudyNotesPanel) | Exam Answer Practice
 *                                                 | Key Vocabulary (cards)
 *                                                 | Study Tips
 *                                                 | External References
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  Library, ClipboardCheck, RotateCcw, Download, Sparkles, FileText,
  Lightbulb, Edit3, Type, ExternalLink,
  Send, CheckCircle, AlertTriangle, Loader2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { exportKitToPDF, setLastLearningMode } from '../../lib/pdfExport';
import { StudyNotesPanel } from './StudyNotesPanel';
import { aiService } from '../../services/aiService';

import { UserStats, GeneratedNotes, PlanType } from '../../types';

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

// ─── Exam Answer Feedback type ───────────────────────────────────────────────

interface ExamFeedback {
  marksScored: number;
  totalMarks: number;
  missingKeywords: string[];
  strengths: string[];
  improvements: string[];
  modelAnswer: string;
}

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
  const [examFeedback, setExamFeedback] = useState<ExamFeedback | null>(null);
  const [examError, setExamError] = useState<string | null>(null);

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

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleExamSubmit = async () => {
    if (selectedExamQ === null || !examAnswer.trim()) return;
    const q = examQuestions[selectedExamQ];
    setExamSubmitting(true);
    setExamError(null);
    setExamFeedback(null);
    try {
      const fb = await aiService.evaluateExamAnswer({
        question: q.question,
        studentAnswer: examAnswer,
        totalMarks: q.marks,
        subject,
        chapterTitle: topicTitle,
      });
      setExamFeedback(fb);
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
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-20">

      {/* ─── Header ───────────────────────────────────────────────────── */}
      <div className="mb-5">
        <span className="inline-block px-3 py-1 rounded bg-teal-100 text-[10px] font-bold mb-3 uppercase tracking-widest text-teal-600 border border-teal-200">
          Read / Write Mode
        </span>
        <h2 className="text-3xl font-black tracking-tight text-on-surface">{topicTitle}</h2>
        <p className="text-on-surface-variant mt-1 text-sm font-medium">Exam revision workspace · CBSE Class 10</p>
      </div>

      {/* ─── Sticky Jump Bar ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 -mx-4 px-4 py-2.5 bg-white/95 backdrop-blur border-b border-surface-container-high mb-6 flex flex-wrap items-center gap-2">
        <button onClick={() => scrollTo(notesRef)} className="px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-xs font-black uppercase tracking-wider hover:bg-teal-100 transition-all border border-teal-200">
          <FileText size={12} className="inline mr-1 -mt-0.5" />Notes
        </button>
        <button onClick={() => scrollTo(vocabRef)} className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 text-xs font-black uppercase tracking-wider hover:bg-sky-100 transition-all border border-sky-200">
          <Type size={12} className="inline mr-1 -mt-0.5" />Vocabulary
        </button>
        <button onClick={() => scrollTo(examRef)} className="px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-black uppercase tracking-wider hover:bg-violet-100 transition-all border border-violet-200">
          <Edit3 size={12} className="inline mr-1 -mt-0.5" />Exam Practice
        </button>
        <button onClick={() => openFlashcards?.(topicTitle, data.id)} className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-black uppercase tracking-wider hover:bg-indigo-100 transition-all border border-indigo-200">
          <Sparkles size={12} className="inline mr-1 -mt-0.5" />Flashcards
        </button>
        <button onClick={() => setView('practice')} className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-black uppercase tracking-wider hover:bg-rose-100 transition-all border border-rose-200">
          <ClipboardCheck size={12} className="inline mr-1 -mt-0.5" />Quiz
        </button>

        {/* Right-aligned actions */}
        <div className="ml-auto flex gap-2">
          <button onClick={() => onSave({ title: topicTitle, type: 'readwrite', contentSnippet: summaryText.substring(0, 120) })} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-all" title="Save to Library">
            <Library size={16} />
          </button>
          <button onClick={exportToPDF} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-all" title="Download PDF">
            <Download size={16} />
          </button>
          <button onClick={() => setView('dashboard')} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-all" title="Reset">
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* ─── Grid: Main + Sidebar ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ─── Main Content (Study Workspace only) ─────────────────── */}
        <div className="lg:col-span-8">
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

        {/* ─── Sidebar ────────────────────────────────────────────── */}
        <div className="lg:col-span-4 space-y-6">

          {/* ── Exam Answer Practice ──────────────────────────────── */}
          <div ref={examRef} className="scroll-mt-20 bg-white border border-surface-container-high rounded-2xl overflow-hidden card-shadow">
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

              {/* Answer writing */}
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
                  <textarea
                    value={examAnswer}
                    onChange={e => setExamAnswer(e.target.value)}
                    placeholder="Write your answer here…"
                    className="w-full h-32 p-3 border-2 border-surface-container-high rounded-xl text-xs text-on-surface leading-relaxed resize-none focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all font-medium placeholder:text-on-surface-variant/40"
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-on-surface-variant font-mono">
                      {examAnswer.trim() ? examAnswer.trim().split(/\s+/).length : 0} words
                    </p>
                    <button
                      onClick={handleExamSubmit}
                      disabled={!examAnswer.trim() || examSubmitting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {examSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      {examSubmitting ? 'Evaluating…' : 'Submit'}
                    </button>
                  </div>
                  {examError && (
                    <div className="flex items-center gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-lg">
                      <AlertTriangle size={12} className="text-rose-500 shrink-0" />
                      <p className="text-[10px] text-rose-700 font-medium flex-1">{examError}</p>
                      <button onClick={handleExamSubmit} className="text-[10px] text-rose-600 font-bold underline shrink-0">Retry</button>
                    </div>
                  )}
                </div>
              )}

              {/* Feedback card */}
              {examFeedback && (
                <div className="space-y-4">
                  {/* Score */}
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200">
                    <div className="text-center">
                      <p className="text-2xl font-black text-violet-700">{examFeedback.marksScored}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-violet-400">/ {examFeedback.totalMarks}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-on-surface">
                        {examFeedback.marksScored === examFeedback.totalMarks ? 'Perfect score!' :
                         examFeedback.marksScored >= examFeedback.totalMarks * 0.6 ? 'Good attempt!' :
                         'Needs more work.'}
                      </p>
                      <div className="w-full h-1.5 bg-violet-100 rounded-full mt-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            examFeedback.marksScored === examFeedback.totalMarks ? 'bg-green-500' :
                            examFeedback.marksScored >= examFeedback.totalMarks * 0.6 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${(examFeedback.marksScored / examFeedback.totalMarks) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Missing Keywords */}
                  {examFeedback.missingKeywords?.length > 0 && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                      <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-1.5">Missing Keywords</p>
                      <div className="flex flex-wrap gap-1.5">
                        {examFeedback.missingKeywords.map((kw, i) => (
                          <span key={i} className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md text-[10px] font-bold border border-rose-200">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strengths */}
                  {examFeedback.strengths?.length > 0 && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
                      <p className="text-[10px] font-black uppercase tracking-widest text-green-600 mb-1.5">Strengths</p>
                      <ul className="space-y-1">
                        {examFeedback.strengths.map((s, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[11px] text-green-800 font-medium">
                            <CheckCircle size={11} className="shrink-0 mt-0.5 text-green-500" />{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Improvements */}
                  {examFeedback.improvements?.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1.5">Improvements</p>
                      <ul className="space-y-1">
                        {examFeedback.improvements.map((s, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-800 font-medium">
                            <Lightbulb size={11} className="shrink-0 mt-0.5 text-amber-500" />{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Model Answer */}
                  {examFeedback.modelAnswer && (
                    <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl">
                      <p className="text-[10px] font-black uppercase tracking-widest text-violet-500 mb-1.5">Model Answer</p>
                      <p className="text-xs text-on-surface leading-relaxed font-medium">{examFeedback.modelAnswer}</p>
                    </div>
                  )}

                  {/* Try again */}
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

          {/* ── Key Vocabulary (big cards) ────────────────────────── */}
          <div ref={vocabRef} className="scroll-mt-20 bg-white border border-surface-container-high rounded-2xl overflow-hidden card-shadow">
            <div className="px-5 py-3.5 bg-sky-600 flex items-center gap-3">
              <Type size={18} className="text-white" />
              <h3 className="text-sm font-black text-white">Key Vocabulary</h3>
            </div>
            <div className="p-4">
              {vocab.length > 0 ? (
                <div className="space-y-3">
                  {vocab.map((v: any, i: number) => (
                    <div key={i} className="p-4 rounded-xl border border-sky-100 bg-sky-50/30">
                      <p className="text-base font-black text-sky-700 mb-1">{v.word || v.term}</p>
                      <p className="text-sm text-on-surface leading-relaxed mb-2">{v.definition || v.def || v.meaning}</p>
                      <div className="flex items-start gap-1.5 pt-2 border-t border-sky-100">
                        <span className="shrink-0 px-1.5 py-0.5 bg-sky-100 text-sky-600 rounded text-[9px] font-black uppercase mt-0.5">Exam</span>
                        <p className="text-xs text-sky-600/80 leading-relaxed">
                          {v.examUse || v.usage || `Often asked as a 1-mark "Define" question in CBSE exams.`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant italic text-center py-4">No vocabulary terms available.</p>
              )}
            </div>
          </div>

          {/* ── Study Tips ────────────────────────────────────────── */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 card-shadow">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-black text-on-surface-variant uppercase tracking-widest">Study Tips</h4>
              <Lightbulb size={16} className="text-amber-500" />
            </div>
            <ul className="space-y-2">
              {rwData.tips?.length > 0 ? rwData.tips.map((tip: string, i: number) => (
                <li key={i} className="flex gap-2 items-start p-2.5 bg-white rounded-lg border border-amber-100 text-xs font-medium text-on-surface-variant leading-relaxed">
                  <div className="shrink-0 w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-black text-[10px]">{i + 1}</div>
                  {tip}
                </li>
              )) : <li className="text-[10px] text-on-surface-variant italic">No study tips yet.</li>}
            </ul>
          </div>

          {/* ── External References ───────────────────────────────── */}
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
      </div>
    </motion.div>
  );
};
