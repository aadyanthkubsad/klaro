/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Timer, BookOpen, ChevronRight, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { TopBar } from '../common/TopBar';
import { LibraryItem } from '../../types';

interface TestsViewProps {
  setView: (v: string) => void;
  library: LibraryItem[];
  kit?: any;
  setAIQuiz?: (quiz: any) => void;
}

export const TestsView = ({ setView, library, kit, setAIQuiz }: TestsViewProps) => {
  const [activeTab, setActiveTab] = useState<'available' | 'mock' | 'custom'>('available');

  const tests = library.map((item, index) => ({
    id: item.id || index,
    title: `${item.title} Assessment`,
    subject: item.type.toUpperCase(),
    duration: '20 mins',
    questions: 10,
    difficulty: item.progress > 80 ? 'Hard' : item.progress > 40 ? 'Medium' : 'Easy',
    isLibrary: true,
  }));

  if (kit && kit.quiz) {
    tests.unshift({
      id: 'current-kit',
      title: `${kit.quiz.title} Assessment`,
      subject: 'CURRENT TOPIC',
      duration: '10 mins',
      questions: kit.quiz.questions?.length || 5,
      difficulty: 'Medium',
      isLibrary: false,
    });
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
      <TopBar title="Assessment Hub" subtitle="Challenge yourself and measure your learning outcomes." />

      <div className="flex gap-4 p-2 bg-surface-container-low rounded-2xl w-fit border border-surface-container">
        {['available', 'custom'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-primary text-white shadow-lg' : 'text-on-surface-variant hover:bg-white/50'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tests.length > 0 ? (
          tests.map(test => (
            <div key={test.id} className="bg-white border border-surface-container rounded-3xl p-6 hover:shadow-xl transition-all group border-b-4 border-b-primary/10 hover:border-b-primary h-full flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                  test.difficulty === 'Pro' ? 'bg-rose-100 text-rose-700' : 
                  test.difficulty === 'Hard' ? 'bg-amber-100 text-amber-700' :
                  'bg-teal-100 text-teal-700'
                }`}>
                  {test.difficulty}
                </div>
                <Timer size={16} className="text-on-surface-variant opacity-40" />
              </div>
              <h4 className="text-lg font-black text-on-surface mb-2 group-hover:text-primary transition-colors">{test.title}</h4>
              <p className="text-xs text-on-surface-variant font-bold mb-6 flex items-center gap-2">
                <BookOpen size={12} /> {test.subject} • {test.questions} Questions
              </p>
              <div className="mt-auto pt-6 border-t border-surface-container-low flex items-center justify-between">
                <div className="text-on-surface-variant text-[10px] font-bold">
                  <span className="text-on-surface font-black block text-sm">{test.duration}</span>
                  Time Limit
                </div>
                <button 
                  onClick={async () => {
                    if (!test.isLibrary && kit && setAIQuiz) {
                      // Normalise: kit.quiz can be an array OR {title, questions}
                      const rawQuiz = kit.quiz;
                      const quizObj = Array.isArray(rawQuiz)
                        ? { title: kit.title || 'Assessment', questions: rawQuiz }
                        : (rawQuiz?.questions ? rawQuiz : { title: kit.title || 'Assessment', questions: [] });
                      setAIQuiz(quizObj);
                      setView('ai-quiz');
                    } else if (test.isLibrary && setAIQuiz) {
                      try {
                        const response = await fetch(`/api/get-kit/${test.id}`);
                        const data = await response.json();
                        if (data.success && data.data.quiz) {
                          const rawQuiz = data.data.quiz;
                          const quizObj = Array.isArray(rawQuiz)
                            ? { title: data.data.title || 'Assessment', questions: rawQuiz }
                            : (rawQuiz?.questions ? rawQuiz : { title: data.data.title || 'Assessment', questions: [] });
                          setAIQuiz(quizObj);
                          setView('ai-quiz');
                        } else {
                          alert('Failed to load this assessment.');
                        }
                      } catch (err) {
                        alert('Network error while loading assessment.');
                      }
                    } else {
                      setView('quiz');
                    }
                  }} 
                  className="bg-navy-dark hover:bg-primary text-white p-4 rounded-2xl transition-all shadow-md group-hover:translate-x-1"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="md:col-span-2 lg:col-span-3 py-20 flex flex-col items-center justify-center bg-white border border-dashed border-surface-container rounded-[40px] text-center">
             <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center text-on-surface-variant mb-6">
                <BookOpen size={32} />
              </div>
              <h4 className="text-xl font-bold text-on-surface mb-2">No Assessments Ready</h4>
              <p className="text-on-surface-variant max-w-sm font-medium mb-8">Generate a revision kit first. Our AI will automatically prepare a custom assessment based on your content.</p>
              <button 
                onClick={() => setView('camera')}
                className="px-8 py-3 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg"
              >
                Start Learning
              </button>
          </div>
        )}

        {tests.length > 0 && (
          <div className="bg-primary/5 border-2 border-dashed border-primary/20 rounded-3xl p-8 flex flex-col items-center justify-center text-center gap-4 group hover:border-primary/40 transition-all cursor-pointer">
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-primary shadow-lg group-hover:scale-110 transition-transform">
              <Zap size={32} />
            </div>
            <div>
              <h4 className="text-lg font-black text-primary">Custom AI Quiz</h4>
              <p className="text-xs text-on-surface-variant font-medium mt-1">Challenge yourself with a deep-dive test.</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
