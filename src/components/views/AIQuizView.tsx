import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2, Brain, Trophy, Sparkles, BarChart, BookOpen, Zap, PieChart, RotateCcw, ArrowRight,
} from 'lucide-react';
import { QuizData } from '../../services/aiService';
import { recordCompletedQuiz } from '../../services/learningService';
import { LearningMode } from '../../types';

interface AIQuizViewProps {
  quiz: QuizData | null;
  setView: (v: string) => void;
  saveMistake: (mistake: { question: string, userAnswer: string, correction: string, mode: 'visual' | 'aural' | 'readwrite', topic: string }) => void;
  saveQuizScore?: (score: { quizTitle: string, score: number, total: number, topic: string, date: string }) => void;
  viewWrongAnswers?: (attemptId: string) => void;
  goToScoreAnalysis?: () => void;
  generateFocusedReview?: () => void;
  /** Tag the recorded attempt — important for YouTube companion quizzes. */
  modeUsed?: LearningMode;
}

import { CognitiveLevel } from '../../types';

interface AnswerRec {
  question: string;
  options?: string[];
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
  topicTag: string;
  cognitiveLevel?: CognitiveLevel;
  difficulty?: string;
}

function isAnswerCorrect(option: string, answer: string): boolean {
  if (!option || !answer) return false;
  const s = option.trim();
  const a = answer.trim();
  if (s === a) return true;
  if (a.length === 1) {
    return s.startsWith(`${a})`) || s.startsWith(`${a}.`) || s.startsWith(`${a} `);
  }
  return s.includes(a) || a.includes(s);
}

export const AIQuizView = ({
  quiz, setView, saveMistake, saveQuizScore, viewWrongAnswers, goToScoreAnalysis, generateFocusedReview,
  modeUsed = 'revision-kit',
}: AIQuizViewProps) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [records, setRecords] = useState<AnswerRec[]>([]);
  const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);

  if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">
        <h2 className="text-2xl font-bold">No Quiz Active</h2>
        <p className="text-on-surface-variant text-sm">Generate a focused review from the Mistakes Notebook to start.</p>
        <button className="mt-2 px-6 py-2 bg-primary text-white rounded-xl font-bold" onClick={() => setView('dashboard')}>Go Back</button>
      </div>
    );
  }

  const topic = quiz.title || 'Focused Review';
  const question = quiz.questions[currentIdx];

  if (!question) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <h2 className="text-2xl font-bold">Loading question…</h2>
      </div>
    );
  }

  const handleSelect = (option: string) => {
    if (selectedAnswer) return;
    setSelectedAnswer(option);

    const correct = isAnswerCorrect(option, question.answer);

    if (!correct) {
      saveMistake({
        question: question.question,
        userAnswer: option,
        correction: `Correct Answer: ${question.answer}. ${question.explanation || ''}`,
        mode: 'readwrite',
        topic,
      });
    }

    const rec: AnswerRec & { options?: string[] } = {
      question: question.question,
      options: question.options || [],
      selectedAnswer: option,
      correctAnswer: question.answer,
      isCorrect: correct,
      explanation: question.explanation || '',
      topicTag: (question as any).topicTag || topic,
      cognitiveLevel: (question as any).cognitiveLevel as CognitiveLevel | undefined,
      difficulty: (question as any).difficulty,
    };
    const next = [...records, rec];

    setTimeout(() => {
      if (currentIdx < quiz.questions.length - 1) {
        setRecords(next);
        setCurrentIdx(currentIdx + 1);
        setSelectedAnswer(null);
      } else {
        setRecords(next);
        const finalScore = next.filter(r => r.isCorrect).length;
        if (saveQuizScore) {
          saveQuizScore({
            quizTitle: topic,
            score: finalScore,
            total: quiz.questions.length,
            topic,
            date: new Date().toISOString(),
          });
        }
        try {
          const attempt = recordCompletedQuiz({
            topic,
            modeUsed,
            answers: next,
          });
          setLastAttemptId(attempt.id);
        } catch (e) {
          console.error('Failed to record AI quiz attempt', e);
        }
        setIsFinished(true);
      }
    }, 2200);
  };

  if (isFinished) {
    const score = records.filter(r => r.isCorrect).length;
    const total = records.length;
    const pct = total ? Math.round((score / total) * 100) : 0;
    const wrongCount = total - score;
    const hasWeakTopics = wrongCount > 0;
    const grade =
      pct === 100 ? { label: 'Perfect!',   color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' } :
      pct >= 80   ? { label: 'Great job!', color: 'text-primary',     bg: 'bg-primary/5 border-primary/20' } :
      pct >= 60   ? { label: 'Keep going!',color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' } :
                    { label: 'Needs work', color: 'text-red-600',     bg: 'bg-red-50 border-red-200' };

    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto space-y-8 pb-20">
        <div className={`rounded-[32px] border-2 p-10 text-center ${grade.bg}`}>
          <Trophy size={48} className={`mx-auto mb-4 ${grade.color}`} />
          <h2 className={`text-5xl font-black mb-2 ${grade.color}`}>{score}/{total}</h2>
          <p className={`text-2xl font-bold mb-1 ${grade.color}`}>{grade.label}</p>
          <p className="text-on-surface-variant font-medium">{pct}% correct on "{topic}"</p>
          <p className="text-on-surface-variant font-medium mt-2 text-sm">
            {hasWeakTopics
              ? `${wrongCount} mistake${wrongCount > 1 ? 's' : ''} saved to your notebook.`
              : 'Excellent. No weak areas detected.'}
          </p>
        </div>

        {hasWeakTopics ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => goToScoreAnalysis ? goToScoreAnalysis() : setView('analytics')}
              className="flex flex-col items-center gap-3 p-6 bg-primary text-white rounded-2xl font-bold hover:brightness-110 transition-all shadow-lg"
            >
              <BarChart size={28} />
              <span className="text-sm uppercase tracking-widest">Analyze Weak Points</span>
            </button>
            <button
              onClick={() => lastAttemptId && viewWrongAnswers ? viewWrongAnswers(lastAttemptId) : setView('mistakes')}
              className="flex flex-col items-center gap-3 p-6 bg-rose-600 text-white rounded-2xl font-bold hover:brightness-110 transition-all shadow-lg"
            >
              <BookOpen size={28} />
              <span className="text-sm uppercase tracking-widest">Review Mistakes</span>
            </button>
            <button
              onClick={() => generateFocusedReview ? generateFocusedReview() : setView('practice')}
              className="flex flex-col items-center gap-3 p-6 bg-navy-dark text-white rounded-2xl font-bold hover:brightness-110 transition-all shadow-lg"
            >
              <Zap size={28} />
              <span className="text-sm uppercase tracking-widest">Retest Weak Areas</span>
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
              className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg"
            >
              <PieChart size={18} /> View Progress
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2 justify-center">
          <button
            onClick={() => {
              setIsFinished(false);
              setCurrentIdx(0);
              setSelectedAnswer(null);
              setRecords([]);
              setLastAttemptId(null);
            }}
            className="flex items-center gap-2 px-6 py-2.5 border border-surface-container text-on-surface-variant rounded-xl font-bold text-sm"
          >
            <RotateCcw size={14} /> Try Again
          </button>
          <button
            onClick={() => setView('dashboard')}
            className="flex items-center gap-2 px-6 py-2.5 border border-surface-container text-on-surface-variant rounded-xl font-bold text-sm"
          >
            Back to Dashboard <ArrowRight size={14} />
          </button>
        </div>
      </motion.div>
    );
  }

  const progress = ((currentIdx + 1) / (quiz.questions.length || 1)) * 100;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-2">{quiz.title}</h1>
        <p className="text-on-surface-variant font-medium">Question {currentIdx + 1} of {quiz.questions.length}</p>
        <div className="h-2 bg-surface-container mt-4 rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-surface-container shadow-sm mb-8">
        <h2 className="text-2xl font-bold mb-8 leading-relaxed">{question.question}</h2>
        <div className="space-y-4">
          {question.options.map((opt, i) => {
            const val = question.answer;
            const isCorrect = isAnswerCorrect(opt, val);
            const isSelected = selectedAnswer === opt;

            let btnClass = 'bg-surface-container-lowest border-outline-variant hover:border-primary';
            if (selectedAnswer) {
              if (isCorrect) btnClass = 'bg-green-50 border-green-500 text-green-800';
              else if (isSelected) btnClass = 'bg-red-50 border-red-500 text-red-800';
              else btnClass = 'opacity-50 border-outline-variant';
            }

            return (
              <button
                key={i}
                onClick={() => handleSelect(opt)}
                disabled={selectedAnswer !== null}
                className={`w-full text-left p-6 rounded-2xl border-2 transition-all ${btnClass}`}
              >
                {opt}
              </button>
            );
          })}
        </div>

        <AnimatePresence>
          {selectedAnswer && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-8 p-6 bg-primary/5 rounded-2xl border border-primary/20"
            >
              <h4 className="font-bold text-primary mb-2 flex items-center gap-2">
                <Brain size={20} /> Explanation
              </h4>
              <p className="text-on-surface-variant leading-relaxed text-sm">{question.explanation}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
