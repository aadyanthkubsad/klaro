/**
 * PracticeView — Full quiz engine backed by /api/generate-quiz
 * Flow: idle → loading → taking → results
 * Questions come from the current kit or are fetched via aiService.generateQuiz.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2, XCircle, RotateCcw, Zap, Target,
  BookOpen, AlertTriangle, ArrowRight, RefreshCw, Trophy, Brain,
  BarChart2, BarChart, PieChart, Sparkles, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { UserStats, LearningMode } from '../../types';
import { aiService, QuizQuestion } from '../../services/aiService';
import { recordCompletedQuiz } from '../../services/learningService';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AnswerRecord {
  q: QuizQuestion;
  selected: string;
  correct: boolean;
}

function fullAnswerText(q: QuizQuestion): string {
  const letter = q.answer.trim().charAt(0).toUpperCase();
  const match = q.options.find(o => o.trim().charAt(0).toUpperCase() === letter);
  return match || q.answer;
}

type Phase = 'idle' | 'loading' | 'error' | 'taking' | 'results';

export interface PracticeSnapshot {
  allAnswers: AnswerRecord[];
  questions: QuizQuestion[];
  topic: string;
  lastAttemptId: string | null;
}

interface PracticeViewProps {
  setView: (v: string) => void;
  kit?: any;
  stats: UserStats;
  saveMistake: (m: {
    question: string;
    userAnswer: string;
    correction: string;
    mode: 'visual' | 'aural' | 'readwrite';
    topic: string;
  }) => void;
  saveQuizScore?: (s: {
    quizTitle: string;
    score: number;
    total: number;
    topic: string;
    date: string;
  }) => void;
  generateFocusedReview: () => void;
  viewWrongAnswers?: (attemptId: string) => void;
  goToScoreAnalysis?: () => void;
  modeUsed?: LearningMode;
  savedResults?: PracticeSnapshot | null;
  onResultsChange?: (r: PracticeSnapshot | null) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Pull questions from whichever shape the kit uses */
function extractKitQuestions(kit: any): QuizQuestion[] {
  if (!kit) return [];
  // Shape A: kit.quiz is an array (flat format from some server versions)
  if (Array.isArray(kit.quiz) && kit.quiz.length > 0) return kit.quiz;
  // Shape B: kit.quiz.questions
  if (kit.quiz?.questions?.length > 0) return kit.quiz.questions;
  // Shape C: VarkifyRevisionKit — kit.mcqs
  if (Array.isArray(kit.mcqs) && kit.mcqs.length > 0) return kit.mcqs;
  return [];
}

function getKitTopic(kit: any): string {
  return kit?.title || kit?.topic || kit?.quiz?.title || 'Practice Quiz';
}

/** Robust answer matching: letter-only ("A") vs full text ("A) Option") */
function isCorrect(selected: string, answer: string): boolean {
  if (!selected || !answer) return false;
  const s = selected.trim();
  const a = answer.trim();
  if (s === a) return true;
  if (a.length === 1) return s.startsWith(`${a})`) || s.startsWith(`${a}.`);
  if (s.length > 2)   return s.includes(a) || a.includes(s);
  return false;
}

const DIFFICULTY_COLOR: Record<string, string> = {
  easy:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  hard:   'bg-red-100 text-red-700 border-red-200',
};

// ─── Component ─────────────────────────────────────────────────────────────────

export const PracticeView = ({
  setView, kit, stats, saveMistake, saveQuizScore, generateFocusedReview,
  viewWrongAnswers, goToScoreAnalysis, modeUsed, savedResults, onResultsChange,
}: PracticeViewProps) => {

  const [phase, setPhase]               = useState<Phase>('idle');
  const [questions, setQuestions]       = useState<QuizQuestion[]>([]);
  const [topic, setTopic]               = useState('');
  const [currentIdx, setCurrentIdx]     = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answered, setAnswered]         = useState(false);
  const [allAnswers, setAllAnswers]     = useState<AnswerRecord[]>([]);
  const [errorMsg, setErrorMsg]         = useState('');
  const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
  const [mistakeSlide, setMistakeSlide] = useState(0);

  const MIN_QUESTIONS = 25;
  const restoredRef = React.useRef(false);

  // Restore saved results on remount (e.g. navigating back from Review Mistakes)
  useEffect(() => {
    if (savedResults && !restoredRef.current) {
      restoredRef.current = true;
      setAllAnswers(savedResults.allAnswers);
      setQuestions(savedResults.questions);
      setTopic(savedResults.topic);
      setLastAttemptId(savedResults.lastAttemptId);
      setMistakeSlide(0);
      setPhase('results');
    }
  }, []);

  // Auto-start when kit has enough questions; otherwise fetch a full set from API
  useEffect(() => {
    if (!kit || restoredRef.current) return;
    const qs = extractKitQuestions(kit);
    const t  = getKitTopic(kit);
    setTopic(t);
    if (qs.length >= MIN_QUESTIONS) {
      startQuiz(qs, t);
    } else if (kit) {
      fetchAndStart();
    }
  }, [kit]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function startQuiz(qs: QuizQuestion[], t: string = topic) {
    restoredRef.current = false;
    onResultsChange?.(null);
    setQuestions(qs);
    setTopic(t);
    setCurrentIdx(0);
    setSelectedAnswer(null);
    setAnswered(false);
    setAllAnswers([]);
    setMistakeSlide(0);
    setPhase('taking');
  }

  async function fetchAndStart() {
    setPhase('loading');
    setErrorMsg('');
    try {
      const topicName = getKitTopic(kit) || 'General Knowledge';
      // Build a sourceText snippet from the kit's summary (helps contextualise questions)
      const sourceText = typeof kit?.summary === 'string'
        ? kit.summary
        : (kit?.summary?.text || kit?.summary?.executiveSummary || '');

      const result = await aiService.generateQuiz({
        topic:      topicName,
        classLevel: kit?.classLevel || 'Class 10',
        examMode:   'CBSE',
        sourceText,
        weakTopics: stats.weakTopics || [],
        count:      25,
        subject:    kit?.subject || kit?.detectedSubject || '',
      });

      if (!result.questions?.length) throw new Error('No questions returned. Please try again.');
      startQuiz(result.questions, result.topic || topicName);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate quiz. Please try again.');
      setPhase('error');
    }
  }

  function handleSelect(opt: string) {
    if (answered) return;
    setSelectedAnswer(opt);
    setAnswered(true);

    const q = questions[currentIdx];
    const correct = isCorrect(opt, q.answer);

    if (!correct) {
      saveMistake({
        question:   q.question,
        userAnswer: opt,
        correction: `Correct: ${q.answer}. ${q.explanation}`,
        mode:       'readwrite',
        topic:      q.topicTag || topic,
      });
    }

    setTimeout(() => {
      const record: AnswerRecord = { q, selected: opt, correct };
      const next = [...allAnswers, record];

      if (currentIdx < questions.length - 1) {
        setAllAnswers(next);
        setCurrentIdx(i => i + 1);
        setSelectedAnswer(null);
        setAnswered(false);
      } else {
        setAllAnswers(next);
        const score = next.filter(a => a.correct).length;
        saveQuizScore?.({
          quizTitle: `${topic} Quiz`,
          score,
          total: questions.length,
          topic,
          date: new Date().toISOString(),
        });
        // Persist full attempt into the learning loop (quizHistory, mistakeNotebook,
        // masteryMap, dailyTasks all updated atomically inside recordCompletedQuiz).
        let attemptId: string | null = null;
        try {
          const attempt = recordCompletedQuiz({
            topic,
            chapterId: kit?.chapterId || kit?.id,
            chapterTitle: kit?.chapterTitle || kit?.title || topic,
            subject: kit?.subject,
            modeUsed: modeUsed || 'revision-kit',
            sourceKitId: kit?.id,
            answers: next.map(rec => ({
              question: rec.q.question,
              options: rec.q.options || [],
              selectedAnswer: rec.selected,
              correctAnswer: rec.q.answer,
              isCorrect: rec.correct,
              explanation: rec.q.explanation || '',
              topicTag: rec.q.topicTag || topic,
              cognitiveLevel: (rec.q as any).cognitiveLevel,
              difficulty: rec.q.difficulty,
            })),
          });
          attemptId = attempt.id;
          setLastAttemptId(attemptId);
        } catch (e) {
          console.error('Failed to record quiz attempt', e);
        }
        onResultsChange?.({ allAnswers: next, questions, topic, lastAttemptId: attemptId });
        setPhase('results');
      }
    }, 1700);
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const score       = allAnswers.filter(a => a.correct).length;
  const total       = allAnswers.length;
  const wrongAnswers= allAnswers.filter(a => !a.correct);
  const pct         = total > 0 ? Math.round((score / total) * 100) : 0;

  // ── IDLE ─────────────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto py-24 flex flex-col items-center text-center gap-6"
      >
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Target size={40} className="text-primary" />
        </div>
        <h2 className="text-4xl font-black tracking-tight">Practice Hub</h2>
        <p className="text-on-surface-variant font-medium max-w-sm leading-relaxed">
          {kit
            ? 'No quiz questions found in your current kit. Generate a fresh quiz now.'
            : 'Complete a learning mode first — Visual, Aural, or Read/Write — then come back to test yourself.'}
        </p>
        {kit ? (
          <button
            onClick={fetchAndStart}
            className="px-10 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl hover:scale-105 transition-all flex items-center gap-3"
          >
            <Zap size={18} /> Generate Quiz
          </button>
        ) : (
          <button
            onClick={() => setView('dashboard')}
            className="px-10 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl hover:scale-105 transition-all"
          >
            Go to Dashboard
          </button>
        )}
      </motion.div>
    );
  }

  // ── LOADING ───────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="max-w-2xl mx-auto py-32 flex flex-col items-center gap-6">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-on-surface-variant font-bold uppercase tracking-widest text-sm animate-pulse">
          Generating quiz questions…
        </p>
        <p className="text-xs text-on-surface-variant/60">This usually takes 5–10 seconds</p>
      </div>
    );
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="max-w-2xl mx-auto py-24 flex flex-col items-center text-center gap-6"
      >
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle size={40} className="text-red-500" />
        </div>
        <h2 className="text-2xl font-black">Quiz Generation Failed</h2>
        <p className="text-red-600 font-medium max-w-sm">{errorMsg}</p>
        <div className="flex gap-4">
          <button
            onClick={fetchAndStart}
            className="px-8 py-3 bg-primary text-white rounded-xl font-bold flex items-center gap-2 hover:brightness-110"
          >
            <RefreshCw size={16} /> Try Again
          </button>
          <button
            onClick={() => setView('dashboard')}
            className="px-8 py-3 border border-surface-container rounded-xl font-bold text-on-surface-variant hover:bg-surface-container"
          >
            Back to Dashboard
          </button>
        </div>
      </motion.div>
    );
  }

  // ── RESULTS ───────────────────────────────────────────────────────────────────
  if (phase === 'results') {
    const grade =
      pct === 100 ? { label: 'Perfect!',  color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' } :
      pct >= 80   ? { label: 'Great job!', color: 'text-primary',     bg: 'bg-primary/5 border-primary/20' } :
      pct >= 60   ? { label: 'Keep going!',color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' } :
                    { label: 'Needs work', color: 'text-red-600',      bg: 'bg-red-50 border-red-200' };

    // Difficulty breakdown
    const diffBreakdown = ['easy', 'medium', 'hard'].map(d => ({
      d,
      total:   allAnswers.filter(a => a.q.difficulty === d).length,
      correct: allAnswers.filter(a => a.q.difficulty === d && a.correct).length,
    })).filter(x => x.total > 0);

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto space-y-8 pb-20"
      >
        {/* Score Banner */}
        <div className={`rounded-[32px] border-2 p-10 text-center ${grade.bg}`}>
          <Trophy size={48} className={`${grade.color} mx-auto mb-4`} />
          <h2 className={`text-5xl font-black mb-2 ${grade.color}`}>{score}/{total}</h2>
          <p className={`text-2xl font-bold mb-1 ${grade.color}`}>{grade.label}</p>
          <p className="text-on-surface-variant font-medium">{pct}% correct on "{topic}"</p>
          <p className="text-on-surface-variant font-medium mt-2 text-sm">
            {wrongAnswers.length > 0
              ? `${wrongAnswers.length} mistake${wrongAnswers.length > 1 ? 's' : ''} saved to your notebook.`
              : 'Excellent. No weak areas detected.'}
          </p>
        </div>

        {/* Decision buttons — conditional on whether mistakes were made */}
        {wrongAnswers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => (goToScoreAnalysis ? goToScoreAnalysis() : setView('analytics'))}
              className="flex flex-col items-center gap-3 p-6 bg-primary text-white rounded-2xl font-bold hover:brightness-110 transition-all shadow-lg"
            >
              <BarChart size={28} />
              <span className="text-sm uppercase tracking-widest">Analyze Weak Points</span>
              <span className="text-xs font-medium opacity-80">See your score analysis</span>
            </button>
            <button
              onClick={() => (lastAttemptId && viewWrongAnswers ? viewWrongAnswers(lastAttemptId) : setView('mistakes'))}
              className="flex flex-col items-center gap-3 p-6 bg-rose-600 text-white rounded-2xl font-bold hover:brightness-110 transition-all shadow-lg"
            >
              <BookOpen size={28} />
              <span className="text-sm uppercase tracking-widest">Review Mistakes</span>
              <span className="text-xs font-medium opacity-80">Slideshow of wrong answers</span>
            </button>
            <button
              onClick={generateFocusedReview}
              className="flex flex-col items-center gap-3 p-6 bg-navy-dark text-white rounded-2xl font-bold hover:brightness-110 transition-all shadow-lg"
            >
              <Zap size={28} />
              <span className="text-sm uppercase tracking-widest">Retest Weak Areas</span>
              <span className="text-xs font-medium opacity-80">Focused practice quiz</span>
            </button>
          </div>
        ) : (
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-[32px] p-8 text-center">
            <Sparkles size={32} className="text-emerald-600 mx-auto mb-3" />
            <h3 className="text-2xl font-black text-emerald-800 mb-2">Excellent. No weak areas detected.</h3>
            <p className="text-emerald-700 font-medium mb-6">
              Your progress has been logged. Check Progress to see how you're improving over time.
            </p>
            <button
              onClick={() => setView('progress')}
              className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg hover:brightness-110 transition-all"
            >
              <PieChart size={18} /> View Progress
            </button>
          </div>
        )}

        {/* Difficulty breakdown */}
        {diffBreakdown.length > 0 && (
          <div className="bg-white border border-surface-container rounded-[24px] p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 size={16} className="text-primary" />
              <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Difficulty Breakdown
              </h4>
            </div>
            <div className="flex gap-4 flex-wrap">
              {diffBreakdown.map(({ d, total: t, correct: c }) => (
                <div key={d} className={`flex-1 min-w-[100px] rounded-2xl border px-4 py-3 text-center ${DIFFICULTY_COLOR[d]}`}>
                  <p className="text-xs font-black uppercase tracking-widest mb-1">{d}</p>
                  <p className="text-2xl font-black">{c}/{t}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Check Answers — carousel */}
        {allAnswers.length > 0 && (() => {
          const rec = allAnswers[mistakeSlide];
          const tag = rec.q.topicTag || topic;
          const isCorrect = rec.correct;
          return (
            <div className={`border-2 rounded-[32px] p-8 ${isCorrect ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  {isCorrect
                    ? <CheckCircle2 size={18} className="text-emerald-600" />
                    : <XCircle size={18} className="text-rose-600" />}
                  <h3 className="text-xs font-black uppercase tracking-widest text-on-surface">
                    Check Answers
                  </h3>
                </div>
                <span className="text-xs font-black text-on-surface-variant">
                  {mistakeSlide + 1} / {allAnswers.length}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMistakeSlide(i => Math.max(0, i - 1))}
                  disabled={mistakeSlide === 0}
                  className={`shrink-0 w-10 h-10 rounded-full bg-white border flex items-center justify-center disabled:opacity-30 transition-colors ${isCorrect ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-100' : 'border-rose-200 text-rose-600 hover:bg-rose-100'}`}
                >
                  <ChevronLeft size={20} />
                </button>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={mistakeSlide}
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.2 }}
                    className={`flex-1 bg-white rounded-2xl border p-6 ${isCorrect ? 'border-emerald-100' : 'border-rose-100'}`}
                  >
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                          {tag}
                        </span>
                        {rec.q.difficulty && (
                          <span className="px-3 py-1 bg-surface-container-low text-on-surface-variant rounded-full text-[10px] font-black uppercase tracking-widest">
                            {rec.q.difficulty}
                          </span>
                        )}
                      </div>
                      {!isCorrect && (
                        <button
                          onClick={() => setView('todo')}
                          className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-primary/20"
                        >
                          Revise this topic
                        </button>
                      )}
                    </div>

                    <p className="font-bold text-on-surface mb-4">{mistakeSlide + 1}. {rec.q.question}</p>

                    {isCorrect ? (
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 mb-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 block mb-1">Your answer (Correct)</span>
                        <span className="text-sm font-bold text-emerald-900">{fullAnswerText(rec.q)}</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                          <span className="text-[10px] font-black uppercase tracking-widest text-rose-500 block mb-1">Your answer</span>
                          <span className="text-sm font-bold text-rose-900">{rec.selected}</span>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 block mb-1">Correct answer</span>
                          <span className="text-sm font-bold text-emerald-900">{fullAnswerText(rec.q)}</span>
                        </div>
                      </div>
                    )}

                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 block mb-1">Explanation</span>
                      <p className="text-sm text-amber-900 leading-relaxed">{rec.q.explanation}</p>
                    </div>
                  </motion.div>
                </AnimatePresence>

                <button
                  onClick={() => setMistakeSlide(i => Math.min(allAnswers.length - 1, i + 1))}
                  disabled={mistakeSlide === allAnswers.length - 1}
                  className={`shrink-0 w-10 h-10 rounded-full bg-white border flex items-center justify-center disabled:opacity-30 transition-colors ${isCorrect ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-100' : 'border-rose-200 text-rose-600 hover:bg-rose-100'}`}
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* Dot indicators */}
              <div className="flex items-center justify-center gap-2 mt-5">
                {allAnswers.map((a, i) => (
                  <button
                    key={i}
                    onClick={() => setMistakeSlide(i)}
                    className={`h-2 rounded-full transition-all ${i === mistakeSlide ? 'w-5' : 'w-2'} ${a.correct ? 'bg-emerald-500' : 'bg-rose-500'} ${i === mistakeSlide ? '' : 'opacity-40'}`}
                  />
                ))}
              </div>
            </div>
          );
        })()}

        {/* Bottom actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => startQuiz(questions)}
            className="flex items-center justify-center gap-2 py-3 border-2 border-primary text-primary rounded-xl font-bold hover:bg-primary/5 transition-all text-sm"
          >
            <RotateCcw size={16} /> Try Again
          </button>
          <button
            onClick={fetchAndStart}
            className="flex items-center justify-center gap-2 py-3 bg-surface-container text-on-surface rounded-xl font-bold hover:bg-surface-container-high transition-all text-sm"
          >
            <RefreshCw size={16} /> New Quiz
          </button>
          <button
            onClick={() => setView('mistakes')}
            className="flex items-center justify-center gap-2 py-3 bg-surface-container text-on-surface rounded-xl font-bold hover:bg-surface-container-high transition-all text-sm"
          >
            <BookOpen size={16} /> Mistakes
          </button>
          <button
            onClick={() => setView('dashboard')}
            className="flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl font-bold hover:brightness-110 transition-all text-sm"
          >
            Dashboard <ArrowRight size={16} />
          </button>
        </div>
      </motion.div>
    );
  }

  // ── TAKING — one question at a time ──────────────────────────────────────────
  const q        = questions[currentIdx];
  const progress = ((currentIdx + 1) / questions.length) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto space-y-8 pb-20"
    >
      {/* Header + progress */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-primary" />
            <span className="text-xs font-black uppercase tracking-widest text-primary">
              Practice · {topic}
            </span>
          </div>
          <span className="text-xs font-bold text-on-surface-variant">
            {currentIdx + 1} / {questions.length}
          </span>
        </div>
        <div className="h-2 bg-surface-container rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
          />
        </div>
      </div>

      {/* Question card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIdx}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.22 }}
          className="bg-white rounded-[32px] border border-surface-container shadow-sm p-8"
        >
          {/* Tags */}
          <div className="flex gap-2 flex-wrap mb-4">
            {q.topicTag && (
              <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full">
                {q.topicTag}
              </span>
            )}
            {q.difficulty && (
              <span className={`px-3 py-1 border text-[10px] font-black uppercase tracking-widest rounded-full ${DIFFICULTY_COLOR[q.difficulty]}`}>
                {q.difficulty}
              </span>
            )}
          </div>

          <h2 className="text-xl font-bold text-on-surface leading-relaxed mb-8">
            {q.question}
          </h2>

          <div className="space-y-3">
            {q.options.map((opt, i) => {
              const optCorrect = isCorrect(opt, q.answer);
              const isSelected = selectedAnswer === opt;
              let cls = 'w-full text-left p-5 rounded-2xl border-2 transition-all font-medium text-on-surface cursor-pointer';
              if (!answered) {
                cls += ' bg-surface-container-lowest border-outline-variant hover:border-primary hover:bg-primary/5';
              } else if (optCorrect) {
                cls += ' bg-emerald-50 border-emerald-500 text-emerald-900';
              } else if (isSelected && !optCorrect) {
                cls += ' bg-red-50 border-red-500 text-red-900';
              } else {
                cls += ' opacity-40 border-outline-variant cursor-not-allowed';
              }

              return (
                <button key={i} onClick={() => handleSelect(opt)} disabled={answered} className={cls}>
                  <span className="flex items-center gap-3">
                    {answered && optCorrect  && <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />}
                    {answered && isSelected && !optCorrect && <XCircle size={18} className="text-red-500 shrink-0" />}
                    {opt}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Explanation */}
          <AnimatePresence>
            {answered && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.28 }}
                className="mt-6 p-5 bg-primary/5 border border-primary/20 rounded-2xl"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Brain size={16} className="text-primary" />
                  <span className="text-xs font-black text-primary uppercase tracking-widest">Explanation</span>
                </div>
                <p className="text-on-surface-variant leading-relaxed text-sm">{q.explanation}</p>
                <p className="text-[11px] text-on-surface-variant/50 mt-3 font-medium">Next question in a moment…</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};
