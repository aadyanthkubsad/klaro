/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Library, RotateCcw, Share2, Network, Grid3X3, Lightbulb, ChevronRight, Zap, CheckCircle, XCircle, Sparkles, Lock, Box, ClipboardCheck, Download } from 'lucide-react';
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

export const VisualHub = ({ setView, onSave, kit, stats, saveMistake, openFlashcards, openPremium3D, isPro }: VisualHubProps) => {
  const [activeStep, setActiveStep] = useState(1);
  const [workflowStages, setWorkflowStages] = useState<any[]>([]);
  const [selectedHotspot, setSelectedHotspot] = useState<any>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [showQuizResults, setShowQuizResults] = useState(false);

  const data = kit || {
    summary: { text: "No content generated yet.", keyPoints: [] },
    quiz: { title: "Visual & Interactive Hub", questions: [] },
    visual: { graphicDescription: "", conceptMap: [] },
  };
  
  const quiz = Array.isArray(data.quiz) ? data.quiz : (data.quiz?.questions || []);

  const handleQuizSubmit = () => {
    let repeatedMistake = false;
    quiz.forEach((q: any, idx: number) => {
      const selected = quizAnswers[idx + 1];
      const correctVal = q.answer || q.correct;
      const isCorrect = selected === correctVal || selected?.startsWith(`${correctVal})`);
      
      if (!isCorrect && selected) {
        if (stats.mistakes.find(m => m.question === q.question)) {
          repeatedMistake = true;
        } else {
          saveMistake({ question: q.question, userAnswer: selected || 'Not answered', correction: `Correct Answer: ${correctVal}. ${q.explanation || ''}`, mode: 'visual', topic: topicTitle });
        }
      }
    });

    if (repeatedMistake) {
      alert("You're making mistakes on topics you've missed before! Focus on this topic.");
    }
    setShowQuizResults(true);
  };

  const visualData = data.visual || { graphicDescription: "", conceptMap: [] };
  const topicTitle = data.quiz?.title || data.title || 'the topic';

  // Interactive Logic
  const hotspots = [
    { label: 'Core Component', description: 'The central piece of this system.', x: '35%', y: '40%' },
    { label: 'Energy Flow', description: 'How power or data moves through the system.', x: '65%', y: '30%' },
    { label: 'System Barrier', description: 'The outer edge defining scope.', x: '50%', y: '70%' },
  ];
  
  const workflow = React.useMemo(() => [
    { id: 1, title: 'Observe', desc: `Analyze foundational elements of ${topicTitle}.` },
    { id: 2, title: 'Interact', desc: 'Click items to reveal deeper insights.' },
    { id: 3, title: 'Synthesize', desc: 'Connect components to understand functionality.' },
  ], [topicTitle]);

  React.useEffect(() => {
    setWorkflowStages(workflow);
  }, [workflow]);

  // Pro promise: remember the last learning hub the student used.
  React.useEffect(() => { setLastLearningMode('visual'); }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="space-y-5">
        <div>
          <span className="px-3 py-1 rounded bg-amber-100 text-[10px] font-bold uppercase tracking-widest text-amber-600 border border-amber-200">Visual & Interactive Mapping</span>
          <h2 className="text-3xl font-bold tracking-tight text-on-surface mt-2">{topicTitle} Lab</h2>
          {openPremium3D && (
            <button
              onClick={openPremium3D}
              className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                isPro
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:brightness-110'
                  : 'bg-gradient-to-r from-amber-100 to-indigo-100 text-amber-900 border border-amber-300 hover:brightness-95'
              }`}
              title={isPro ? 'Open premium 3D models' : 'Premium 3D Models — Exam Pro feature'}
            >
              {isPro ? <Box size={14} /> : <Lock size={14} />}
              {isPro ? 'Premium 3D Models' : 'Premium 3D Models — Pro'}
            </button>
          )}
        </div>
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
            <span>Audio Key Term Flashcards</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-20">
        <div className="lg:col-span-8 flex flex-col gap-8">
           <div className="bg-white border-2 border-surface-container-high rounded-3xl p-12 min-h-[400px] flex flex-col items-center justify-center text-center">
              <h3 className="text-2xl font-black mb-12 text-on-surface">Concept Mind Map</h3>
              <div className="relative w-full flex flex-wrap items-center justify-center gap-6">
                 {/* Central Topic */}
                 <div className="z-20 bg-amber-500 text-white font-black p-4 rounded-full shadow-xl w-32 h-32 flex items-center justify-center text-center border-4 border-white text-xs leading-tight break-words">
                    {topicTitle}
                 </div>

                 {/* Nodes */}
                 {visualData.conceptMap?.slice(0, 6).map((item: any, i: number) => (
                    <div key={i} className="relative z-10 flex flex-col items-center gap-2 w-48">
                         <div className="p-4 bg-white rounded-2xl border-2 border-amber-200 shadow-md w-full text-left hover:border-amber-400 transition-colors">
                            <span className="text-[10px] font-black text-amber-600 uppercase mb-1 block">{item.node}</span>
                            <p className="text-xs text-on-surface-variant">{item.reason}</p>
                         </div>
                    </div>
                 ))}
              </div>
           </div>

           <EnglishGlossPanel kit={data} />

           {stats.level >= 2 ? (
             <div className="relative aspect-video bg-navy-dark rounded-3xl overflow-hidden border-4 border-surface-container shadow-2xl flex items-center justify-center">
               <div className="absolute inset-0 bg-navy-dark/40" />
               <div className="relative w-full h-full p-12">
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#f43f5e_1px,_transparent_1px)] [background-size:24px_24px]" />
                  {hotspots.map((spot: any, i: number) => (
                   <motion.button
                     key={i}
                     initial={{ scale: 0, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     onClick={() => setSelectedHotspot(spot)}
                     className="absolute z-20 group flex flex-col items-center gap-2"
                     style={{ 
                       top: typeof spot.y === 'number' ? `${spot.y}%` : spot.y, 
                       left: typeof spot.x === 'number' ? `${spot.x}%` : spot.x 
                     }}
                   >
                     <div className="w-16 h-16 bg-white/10 rounded-full border-2 border-white/30 flex items-center justify-center group-hover:bg-rose-500/50 transition-colors backdrop-blur-sm">
                       <span className="text-white font-black">{i + 1}</span>
                     </div>
                     <span className="text-white text-[10px] font-bold uppercase tracking-widest bg-black/50 px-2 py-1 rounded">{spot.label}</span>
                   </motion.button>
                  ))}
               </div>
             </div>
           ) : (
             <div className="aspect-video bg-surface-container rounded-3xl flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-surface-container-high">
               <Zap size={48} className="text-amber-500 mb-4" />
               <h4 className="text-lg font-bold">Premium Interactive Lab</h4>
               <p className="text-sm text-on-surface-variant mt-2 max-w-sm">Upgrade to Premium to unlock interactive 3D-like hotspots and immersive lab simulations!</p>
             </div>
           )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <AIGuide topic={topicTitle} />
          {stats.level >= 2 ? (
            <div className="bg-white border border-surface-container rounded-[32px] p-8 card-shadow">
              <h4 className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-6">Interactive Workflow</h4>
              <div className="space-y-4">
                {workflowStages.map((step: any, index: number) => (
                  <div 
                    key={step.id} 
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", index.toString()); }}
                    onDrop={(e) => {
                      const dragIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
                      const result = Array.from(workflowStages);
                      const [removed] = result.splice(dragIndex, 1);
                      result.splice(index, 0, removed);
                      setWorkflowStages(result);
                      (e.target as HTMLElement).classList.remove('border-rose-300');
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement).classList.add('border-rose-300');
                    }}
                    onDragLeave={(e) => (e.currentTarget as HTMLElement).classList.remove('border-rose-300')}
                    className={`p-4 rounded-xl border-2 transition-all cursor-move ${activeStep === step.id ? 'border-primary bg-primary/5' : 'border-surface-container'}`} 
                    onClick={() => setActiveStep(step.id)}
                  >
                     <h5 className="text-sm font-bold">{step.title}</h5>
                     <p className="text-xs text-on-surface-variant mt-1">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
             <div className="bg-white border border-surface-container rounded-[32px] p-8 card-shadow flex flex-col items-center justify-center text-center">
                <Zap size={32} className="text-amber-500 mb-4" />
                <h4 className="font-bold text-sm">Interactive Workflow Locked</h4>
                <p className="text-xs text-on-surface-variant mt-2">Unlock progress tracking and drag-and-drop labs with Premium.</p>
             </div>
          )}
        </div>
      </div>

      {/* Quiz Section */}
      <div className="bg-white border border-surface-container-high rounded-xl p-8 card-shadow mt-12 text-center">
        <h3 className="text-xl font-bold text-on-surface mb-2">Ready to test your knowledge?</h3>
        <p className="text-on-surface-variant font-medium mb-6">You've completed the visual learning section. Take a quiz to test your understanding.</p>
        <button 
          onClick={() => setView('tests')} 
          className="px-8 py-4 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-primary/90 transition-all hover:-translate-y-1"
        >
          Take a Test
        </button>
      </div>

      <AnimatePresence>
        {selectedHotspot && (
          <motion.div 
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="fixed right-0 top-0 bottom-0 w-80 bg-white/95 backdrop-blur-xl p-8 z-50 shadow-xl border-l border-white/20"
          >
            <button onClick={() => setSelectedHotspot(null)} className="absolute top-6 right-6 p-2 hover:bg-surface-container rounded-full text-on-surface-variant"><RotateCcw size={16} /></button>
            <h4 className="text-xl font-black text-on-surface mb-4">{selectedHotspot.label}</h4>
            <p className="text-sm text-on-surface-variant leading-relaxed">{selectedHotspot.description}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
