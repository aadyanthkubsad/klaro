/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Timer, Brain, Eye, Headphones, FileText, Gamepad, Zap, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { QuizConfig, UserStats } from '../../types';

export const VARK_QUESTIONS = [
  {
    id: 1,
    question: "You are helping someone who wants to go to your airport or railway station. You would:",
    options: [
      { text: "Tell them the directions.", type: 'A' },
      { text: "Write down the directions.", type: 'R' },
      { text: "Draw or give them a map.", type: 'V' }
    ]
  },
  {
    id: 2,
    question: "You are about to buy a new digital camera or mobile phone. Other than price, what would most influence your decision?",
    options: [
      { text: "Reading the details about its features.", type: 'R' },
      { text: "The design and look of it.", type: 'V' },
      { text: "Asking the salesperson about it.", type: 'A' }
    ]
  },
  {
    id: 3,
    question: "You want to learn a new program, skill or game on a computer. You would:",
    options: [
      { text: "Follow the diagrams in a book that came with it.", type: 'V' },
      { text: "Talk with people who know the program.", type: 'A' },
      { text: "Read the written instructions that came with the program.", type: 'R' }
    ]
  },
  {
    id: 4,
    question: "You have a problem with your heart. You would prefer that the doctor:",
    options: [
      { text: "Gave you a pamphlet or something to read about it.", type: 'R' },
      { text: "Described what was wrong.", type: 'A' },
      { text: "Showed you a diagram of what was wrong.", type: 'V' }
    ]
  },
  {
    id: 5,
    question: "A website has a video showing how to make a special graph. There is a person speaking, some lists and words describing what to do and some diagrams. You would learn most from:",
    options: [
      { text: "Seeing the diagrams.", type: 'V' },
      { text: "Listening.", type: 'A' },
      { text: "Reading the words.", type: 'R' }
    ]
  },
  {
    id: 6,
    question: "You are going to buy a non-fiction book. You would:",
    options: [
      { text: "Look at the pictures and charts.", type: 'V' },
      { text: "Read the index and parts of the text.", type: 'R' },
      { text: "Ask a friend for their opinion.", type: 'A' }
    ]
  },
  {
    id: 7,
    question: "You prefer a presenter or a teacher who uses:",
    options: [
      { text: "Question and answer, talk, group discussion, or guest speakers.", type: 'A' },
      { text: "Handouts, books, or readings.", type: 'R' },
      { text: "Diagrams, charts or graphs.", type: 'V' }
    ]
  },
  {
    id: 8,
    question: "You have to make an important speech at a special occasion. You would:",
    options: [
      { text: "Make notes or write out the speech in full.", type: 'R' },
      { text: "Write out the main points and rehearse them over and over.", type: 'A' },
      { text: "Use diagrams or pictures to help you explain things.", type: 'V' }
    ]
  }
];

export const ResultView = ({ scores, setView }: { scores: { V: number, A: number, R: number, K?: number }, setView: (v: string) => void }) => {
  const total = scores.V + scores.A + scores.R;
  const percentages = {
    V: Math.round((scores.V / total) * 100) || 0,
    A: Math.round((scores.A / total) * 100) || 0,
    R: Math.round((scores.R / total) * 100) || 0
  };

  const dominant = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b)[0];
  const dominantName = dominant === 'V' ? 'Visual' : dominant === 'A' ? 'Aural' : 'Read/Write';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto py-12"
    >
      <div className="text-center mb-16">
        <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-4">Assessment Complete</span>
        <h2 className="text-4xl font-black text-on-surface tracking-tight">Your Learning Profile</h2>
        <p className="text-on-surface-variant mt-4 font-medium max-w-xl mx-auto italic">
          Based on your choices, you thrive best with <span className="text-primary font-bold">{dominantName}</span> learning methods.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-6 mb-16">
        {[
          { type: 'Visual', val: percentages.V, color: 'bg-amber-500', icon: Eye },
          { type: 'Aural', val: percentages.A, color: 'bg-indigo-500', icon: Headphones },
          { type: 'Read/Write', val: percentages.R, color: 'bg-teal-500', icon: FileText },
        ].map((item, i) => (
          <div key={i} className="bg-white border border-surface-container-high p-8 rounded-2xl card-shadow flex flex-col items-center text-center">
            <div className={`w-12 h-12 rounded-xl ${item.color} text-white flex items-center justify-center mb-6`}>
              <item.icon size={24} />
            </div>
            <h4 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-2">{item.type}</h4>
            <p className="text-4xl font-black text-on-surface">{item.val}%</p>
            <div className="w-full h-1.5 bg-surface-container mt-6 rounded-full overflow-hidden">
              <div className={`h-full ${item.color}`} style={{ width: `${item.val}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-navy-dark rounded-3xl p-12 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5">
           <Zap size={240} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
              <Sparkles size={24} className="text-primary" />
            </div>
            <h3 className="text-2xl font-bold">Personalized Strategy: {dominantName}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
              <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-4">Study Techniques</p>
              <ul className="space-y-4">
                {[
                  "Convert notes into flowcharts or mind maps.",
                  "Use color-coding to highlight relationships between concepts.",
                  "Visualize complex systems as 3D spatial models.",
                  "Replace lengthy text descriptions with symbols or icons."
                ].map((tip, idx) => (
                  <li key={idx} className="flex gap-3 items-start">
                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    <span className="text-sm font-medium leading-relaxed">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col justify-between">
              <div className="p-8 bg-white/5 rounded-2xl border border-white/10">
                <p className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mb-2">Next Step</p>
                <h4 className="text-lg font-bold mb-4">Unlock your Personalized Study Dashboard</h4>
                <p className="text-sm text-white/50 leading-relaxed">We've generated a 4-week study plan tailored to your exam goals (CBSE/JEE/SAT).</p>
              </div>
              <button 
                onClick={() => setView('dashboard')}
                className="mt-8 w-full bg-primary text-white py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:brightness-110 active:scale-95 transition-all shadow-lg"
              >
                Go to My Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

interface QuizViewProps {
  setView: (v: string) => void;
  stats: UserStats;
  saveMistake: (mistake: { question: string, correction: string, mode: 'visual' | 'aural' | 'readwrite' }) => void;
}

export const QuizView = ({ setView, stats, saveMistake }: QuizViewProps) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [scores, setScores] = useState({ V: 0, A: 0, R: 0, K: 0 });
  const [isFinished, setIsFinished] = useState(false);

  const handleAnswer = (type: string) => {
    setScores(prev => ({ ...prev, [type]: prev[type as keyof typeof prev] + 1 }));
    if (currentIdx < VARK_QUESTIONS.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      setIsFinished(true);
    }
  };

  const progress = ((currentIdx + 1) / VARK_QUESTIONS.length) * 100;

  if (isFinished) {
    return <ResultView scores={scores} setView={setView} />;
  }

  const currentQuestion = VARK_QUESTIONS[currentIdx];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-7xl mx-auto py-10"
    >
      <div className="mb-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-6">
          <div>
            <span className="inline-block px-4 py-1 bg-tertiary-container/10 text-tertiary-container rounded-full text-xs font-bold mb-4 border border-tertiary-container/20">MODULE: COGNITIVE PSYCHOLOGY</span>
            <h2 className="text-4xl font-bold tracking-tight">VARK Learning Assessment</h2>
            <p className="text-lg text-on-surface-variant font-medium mt-2">Section: Discovery Phase</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary tracking-tighter">Question {currentIdx + 1}<span className="text-on-surface-variant/30"> / {VARK_QUESTIONS.length}</span></p>
          </div>
        </div>
        <div className="h-4 w-full bg-surface-container rounded-full overflow-hidden flex gap-0.5">
           <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            className="h-full bg-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-surface-container-lowest card-shadow p-10 rounded-[32px] border border-outline-variant/30">
            <h3 className="text-3xl font-bold text-on-surface mb-12 leading-[1.3]">
              {currentQuestion.question}
            </h3>
            <div className="space-y-4">
              {currentQuestion.options.map((opt, i) => (
                <button 
                  key={i}
                  onClick={() => handleAnswer(opt.type)}
                  className="w-full flex items-center gap-6 p-6 border-2 rounded-2xl text-left transition-all group bg-surface-container-lowest border-outline-variant hover:border-primary hover:bg-primary/5 active:scale-[0.98]"
                >
                  <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-lg border-outline-variant text-outline group-hover:border-primary group-hover:text-primary">
                    {String.fromCharCode(65 + i)}
                  </div>
                  <p className="text-lg flex-grow text-on-surface-variant group-hover:text-on-surface transition-colors">
                    {opt.text}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="bg-white card-shadow p-8 rounded-[32px] border border-outline-variant/30">
            <h4 className="text-xs font-bold text-outline mb-6 uppercase tracking-widest">Time Spent</h4>
            <div className="flex items-center gap-4">
              <Timer className="text-tertiary" size={40} />
              <p className="text-4xl font-bold">01:12</p>
            </div>
          </div>

          <div className="bg-white card-shadow rounded-[32px] border border-outline-variant/30 overflow-hidden">
            <div className="h-40 bg-primary/10 flex items-center justify-center">
              <Brain size={64} className="text-primary" />
            </div>
            <div className="p-8">
              <h4 className="text-xs font-bold text-outline mb-2 uppercase tracking-widest">Current Assessment</h4>
              <p className="text-lg font-bold mb-6">Psychometric learning profile evaluation.</p>
              <div className="flex flex-wrap gap-2">
                {['PSYCHOLOGY', 'ADAPTIVITY'].map(tag => (
                  <span key={tag} className="px-4 py-1.5 bg-primary-container/10 text-primary-container rounded-full text-[10px] font-bold">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
