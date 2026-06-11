import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, List, Target, Brain, AlertTriangle, Key, Maximize2, Zap, RotateCcw } from 'lucide-react';

export const RevisionEngineView = ({ setView, kit, saveMistake, saveQuizScore, stats, generateFocusedReview }: any) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'flashcards' | 'mcq' | 'short'>('summary');
  const [mcqAnswers, setMcqAnswers] = useState<Record<number, string>>({});
  const [isQuizSubmitted, setIsQuizSubmitted] = useState(false);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedWeakTopics, setSelectedWeakTopics] = useState<string[]>([]);

  if (!kit) {
    return (
      <div className="flex flex-col items-center justify-center p-20 min-h-[50vh]">
        <AlertTriangle size={64} className="text-red-500 mb-6" />
        <h2 className="text-2xl font-bold mb-2">Engine Initialization Failed</h2>
        <p className="text-on-surface-variant font-medium">Could not load the revision kit. Please go back and try again.</p>
        <button onClick={() => setView('dashboard')} className="mt-8 px-8 py-4 bg-primary text-white rounded-xl font-bold">Return to Dashboard</button>
      </div>
    );
  }

  const handleMcqSelect = (idx: number, ans: string) => {
    if (isQuizSubmitted) return;
    setMcqAnswers({ ...mcqAnswers, [idx]: ans });
  };

  const submitQuiz = () => {
    setIsQuizSubmitted(true);
    let newWeakTopics = new Set<string>();
    let correctCount = 0;
    
    kit.mcqs.forEach((q: any, idx: number) => {
      const selected = mcqAnswers[idx];
      const correctVal = q.answer;
      const isCorrect = selected === correctVal || selected?.startsWith(correctVal) || correctVal?.startsWith(selected);
      
      if (!isCorrect && selected) {
        saveMistake({
          question: q.question,
          userAnswer: selected || 'Not answered',
          correction: `Correct Answer: ${correctVal}. ${q.explanation}`,
          mode: 'readwrite',
          topic: q.topicTag || kit.topic
        });
        if (q.topicTag) newWeakTopics.add(q.topicTag);
      } else if (isCorrect) {
        correctCount++;
      }
    });

    if (saveQuizScore) {
       saveQuizScore({
           quizTitle: kit.topic + " Core Revision",
           score: correctCount,
           total: kit.mcqs.length,
           topic: kit.topic,
           date: new Date().toISOString()
       });
    }
    
    setSelectedWeakTopics(Array.from(newWeakTopics));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-end border-b border-surface-container pb-6">
        <div>
          <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full mb-3">{kit.class}</span>
          <h1 className="text-4xl font-black text-on-surface">{kit.topic}</h1>
        </div>
        <button onClick={() => setView('dashboard')} className="px-6 py-2 border-2 border-surface-container rounded-xl text-xs font-bold uppercase hover:bg-surface-container transition-all">Exit Core</button>
      </div>

      <div className="flex gap-4 border-b border-surface-container pb-4 overflow-x-auto">
        {[
          { id: 'summary', name: 'Knowledge Base', icon: BookOpen },
          { id: 'flashcards', name: 'Flashcards', icon: Brain },
          { id: 'mcq', name: 'CBSE MCQs', icon: Target },
          { id: 'short', name: 'Short Ans', icon: List }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm whitespace-nowrap transition-all ${
              activeTab === tab.id ? 'bg-primary text-white shadow-lg' : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
            }`}
          >
            <tab.icon size={16} />
            {tab.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          
          {activeTab === 'summary' && (
            <div className="space-y-8">
              <div className="bg-white p-8 rounded-[32px] border border-surface-container shadow-sm">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-3"><BookOpen className="text-primary"/> Simple Summary</h3>
                <p className="text-on-surface-variant font-medium leading-relaxed">{kit.summary}</p>
              </div>

              <div className="bg-indigo-50/50 p-8 rounded-[32px] border border-indigo-100">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-3 text-indigo-900"><List className="text-indigo-500"/> Key Points</h3>
                <ul className="space-y-3">
                  {(kit.keyPoints || []).map((kp: string, i: number) => (
                    <li key={i} className="flex gap-3 text-indigo-800 font-medium"><div className="w-2 h-2 mt-2 rounded-full bg-indigo-400 shrink-0"/>{kp}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-teal-50/50 p-8 rounded-[32px] border border-teal-100">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-3 text-teal-900"><Key className="text-teal-500"/> Important Definitions</h3>
                <div className="space-y-4">
                  {(kit.definitions || []).map((def: any, i: number) => (
                    <div key={i} className="bg-white p-4 rounded-2xl border border-teal-100/50 shadow-sm">
                      <span className="font-black text-teal-800 tracking-wide">{def.term}:</span>
                      <span className="ml-2 text-teal-900/80 font-medium">{def.definition}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900 p-8 rounded-[32px] text-white shadow-xl relative overflow-hidden">
                <div className="absolute -right-10 -top-10 opacity-10"><Maximize2 size={200} /></div>
                <h3 className="text-xl font-bold mb-6 flex items-center gap-3 relative z-10">Mind Map Structure</h3>
                <div className="space-y-4 relative z-10 flex flex-wrap gap-4">
                  {(kit.mindMap || []).map((node: any, i: number) => (
                    <div key={i} className="bg-white/10 p-4 rounded-2xl border border-white/20 flex flex-col hover:bg-white/20 transition-all">
                      <span className="font-bold">{node.node}</span>
                      <div className="flex items-center gap-2 mt-2 text-white/50 text-xs font-bold uppercase">
                        <span>→ {node.label} →</span>
                        <span className="text-white/90">{node.relatesTo}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'flashcards' && (kit.flashcards?.length > 0 ? (
            <div className="flex flex-col items-center py-10">
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                style={{ perspective: '1000px' }}
                className="w-full max-w-lg aspect-[4/3] cursor-pointer"
              >
                <div
                  className="w-full h-full relative transition-all duration-500"
                  style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : '' }}
                >
                  <div className="absolute inset-0 bg-white border-2 border-surface-container rounded-[40px] shadow-xl flex flex-col items-center justify-center p-12 text-center" style={{ backfaceVisibility: 'hidden' }}>
                    <span className="absolute top-8 text-xs font-bold text-outline uppercase tracking-widest">Question {flashcardIndex + 1} of {kit.flashcards.length}</span>
                    <h3 className="text-2xl font-black text-on-surface leading-snug">{kit.flashcards[flashcardIndex]?.front}</h3>
                    <div className="absolute bottom-8 flex gap-2 items-center text-primary text-xs font-bold uppercase"><RotateCcw size={14}/> Tap to flip</div>
                  </div>
                  <div className="absolute inset-0 bg-primary border-2 border-primary-dark rounded-[40px] shadow-xl flex flex-col items-center justify-center p-12 text-center text-white" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                    <h3 className="text-2xl font-bold leading-relaxed">{kit.flashcards[flashcardIndex]?.back}</h3>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => { setFlashcardIndex(Math.max(0, flashcardIndex - 1)); setIsFlipped(false); }}
                  disabled={flashcardIndex === 0}
                  className="px-6 py-3 bg-surface-container rounded-xl font-bold disabled:opacity-50"
                >Prev</button>
                <button
                  onClick={() => { setFlashcardIndex(Math.min(kit.flashcards.length - 1, flashcardIndex + 1)); setIsFlipped(false); }}
                  disabled={flashcardIndex === kit.flashcards.length - 1}
                  className="px-6 py-3 bg-primary text-white rounded-xl font-bold disabled:opacity-50"
                >Next</button>
              </div>
            </div>
          ) : (
            <p className="text-center py-10 text-on-surface-variant">No flashcards available for this kit.</p>
          ))}

          {activeTab === 'mcq' && (
            <div className="space-y-12">
              {(kit.mcqs || []).map((q: any, i: number) => {
                const selected = mcqAnswers[i];
                const isCorrect = selected === q.answer || selected?.startsWith(q.answer) || q.answer?.startsWith(selected);
                
                return (
                  <div key={i} className="bg-white p-8 rounded-[32px] border border-surface-container shadow-sm">
                    <div className="flex justify-between items-start mb-6">
                      <h3 className="text-xl font-bold leading-relaxed">{i + 1}. {q.question}</h3>
                      <span className="px-3 py-1 bg-surface-container-lowest border border-surface-container rounded-full text-[10px] font-bold text-on-surface-variant uppercase whitespace-nowrap ml-4">{q.topicTag}</span>
                    </div>
                    <div className="space-y-3">
                      {q.options.map((opt: string, j: number) => {
                        let btnClass = "bg-surface-container-lowest border-outline-variant hover:border-primary text-on-surface-variant";
                        if (isQuizSubmitted) {
                          if (opt === q.answer || opt.startsWith(q.answer) || q.answer.startsWith(opt)) btnClass = "bg-green-50 border-green-500 text-green-900";
                          else if (selected === opt) btnClass = "bg-red-50 border-red-500 text-red-900";
                          else btnClass = "opacity-50 border-outline-variant";
                        } else if (selected === opt) {
                          btnClass = "bg-primary/5 border-primary text-primary";
                        }
                        
                        return (
                          <button 
                            key={j}
                            onClick={() => handleMcqSelect(i, opt)}
                            className={`w-full text-left p-4 border-2 rounded-2xl transition-all font-medium ${btnClass}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {isQuizSubmitted && (
                      <div className={`mt-6 p-6 rounded-2xl ${isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                        <div className="font-bold mb-2 flex items-center gap-2">
                          {isCorrect ? <span className="text-green-700">Correct!</span> : <span className="text-red-700">Incorrect</span>}
                        </div>
                        <p className={isCorrect ? 'text-green-900/80 font-medium' : 'text-red-900/80 font-medium'}>{q.explanation}</p>
                      </div>
                    )}
                  </div>
                );
              })}

              {!isQuizSubmitted ? (
                <button 
                  onClick={submitQuiz}
                  disabled={Object.keys(mcqAnswers).length < kit.mcqs.length}
                  className="w-full py-5 bg-primary text-white rounded-2xl font-black text-lg shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100"
                >
                  Submit Assessment & Score
                </button>
              ) : (
                <div className="bg-navy-dark text-white p-8 rounded-[32px] text-center shadow-2xl">
                  <h3 className="text-2xl font-black mb-4">Assessment Analyzed</h3>
                  {selectedWeakTopics.length > 0 ? (
                    <div>
                      <p className="text-rose-300 font-bold mb-6">We identified weak areas. Your mistakes were logged.</p>
                      <button 
                        onClick={() => {
                          // The user requested to generate 5 new questions ONLY from weak topics
                          stats.weakTopics = [...new Set([...stats.weakTopics, ...selectedWeakTopics])];
                          generateFocusedReview(); 
                        }}
                        className="px-8 py-4 bg-primary rounded-xl font-bold text-white shadow-lg shadow-primary/30 hover:brightness-110 flex items-center justify-center gap-3 mx-auto"
                      >
                        <Zap size={20} />
                        Retest Weak Topics
                      </button>
                    </div>
                  ) : (
                    <p className="text-green-400 font-bold">Perfect score! No weak topics detected.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'short' && (
            <div className="space-y-8">
              {(kit.shortQuestions || []).map((q: any, i: number) => (
                <div key={i} className="bg-white p-8 rounded-[32px] border border-surface-container shadow-sm">
                  <h3 className="text-xl font-bold mb-6">{q.question}</h3>
                  <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30">
                    <p className="text-xs font-bold text-primary uppercase tracking-widest mb-3">Ideal Answer</p>
                    <p className="text-on-surface font-medium leading-relaxed">{q.idealAnswer}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
        
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-rose-50/50 p-6 rounded-[32px] border border-rose-100">
            <h4 className="font-black text-rose-900 flex items-center gap-2 mb-4"><AlertTriangle size={18} /> Common Traps</h4>
            <ul className="space-y-3">
              {(kit.commonMistakes || []).map((m: string, i: number) => (
                <li key={i} className="text-rose-800 text-sm font-medium flex gap-2"><div className="mt-1 w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0"/>{m}</li>
              ))}
            </ul>
          </div>
          
          <div className="bg-surface-container-lowest p-6 rounded-[32px] border border-surface-container">
            <h4 className="font-bold text-on-surface mb-4">Focus Areas</h4>
            <div className="flex flex-wrap gap-2">
              {(kit.weakTopicTags || []).map((tag: string, i: number) => (
                <span key={i} className="px-3 py-1.5 bg-surface-container rounded-lg text-xs font-bold text-on-surface-variant uppercase tracking-wide">{tag}</span>
              ))}
            </div>
          </div>
          
          {kit.retestQuestions && kit.retestQuestions.length > 0 && (
             <div className="bg-indigo-50/50 p-6 rounded-[32px] border border-indigo-100">
               <h4 className="font-black text-indigo-900 flex items-center gap-2 mb-4"><RotateCcw size={18} /> Retest Bank</h4>
               <p className="text-indigo-800 text-sm font-medium mb-4">You have {kit.retestQuestions.length} reserve questions stored for later review.</p>
             </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
