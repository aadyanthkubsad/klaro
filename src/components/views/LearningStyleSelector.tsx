/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Eye, Headphones, FileText } from 'lucide-react';
import { LibraryItem } from '../../types';

interface LearningStyleSelectorProps {
  setView: (v: string) => void;
  kit?: any;
  onSave?: (item: Partial<LibraryItem>) => void;
}

export const LearningStyleSelector = ({ setView, kit, onSave }: LearningStyleSelectorProps) => {
  const topic = kit?.quiz?.title || 'this information';

  const handleSave = () => {
    if (onSave && kit) {
      onSave({
        title: kit.quiz?.title || 'Unknown Topic',
        type: 'readwrite',
        contentSnippet: kit.summary?.substring(0, 100) || 'No summary available.'
      });
    }
  };

  const styles = [
    { id: 'visual', label: 'See the Story', category: 'Visual', desc: 'Infographics & Mind Maps generated from your text.', icon: Eye, color: 'border-l-amber-500 bg-amber-50', iconColor: 'text-amber-600', iconBg: 'bg-amber-100' },
    { id: 'auditory', label: 'Hear the Knowledge', category: 'Auditory', desc: 'AI Podcasts & narrated summaries for on-the-go learning.', icon: Headphones, color: 'border-l-indigo-500 bg-indigo-50', iconColor: 'text-indigo-600', iconBg: 'bg-indigo-100' },
    { id: 'readwrite', label: 'Write & Synthesize', category: 'Read/Write', desc: 'Structured outlines, summaries, and critical writing prompts.', icon: FileText, color: 'border-l-teal-500 bg-teal-50', iconColor: 'text-teal-600', iconBg: 'bg-teal-100' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-[80vh] flex flex-col items-center justify-center py-10"
    >
      <div className="absolute inset-0 z-0 opacity-10 blur-xl pointer-events-none">
        <div className="w-full h-full flex items-center justify-center p-20 bg-white">
          <h2 className="text-[10rem] font-bold text-outline transform -rotate-12 opacity-10">{topic}</h2>
        </div>
      </div>

      <div className="relative z-10 text-center mb-16 max-w-2xl">
        <h2 className="text-[40px] font-bold mb-4 tracking-tight leading-tight">Your Adaptive Kit is Ready</h2>
        <p className="text-lg text-on-surface-variant font-medium">Topic: <span className="text-primary font-bold">{topic}</span></p>
      </div>

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        {styles.map((style) => {
          const Icon = style.icon;
          return (
            <button 
              key={style.id}
              onClick={() => {
                if (style.id === 'visual') setView('visual');
                else if (style.id === 'auditory') setView('aural');
                else if (style.id === 'readwrite') setView('readwrite');
                else setView('dashboard');
              }}
              className={`p-8 rounded-2xl border border-white/50 shadow-sm flex flex-col items-start text-left transition-all duration-300 hover:-translate-y-2 hover:shadow-xl group border-l-4 ${style.color}`}
            >
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-colors ${style.iconBg} ${style.iconColor}`}>
                <Icon size={32} />
              </div>
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${style.iconColor}`}>{style.category}</span>
                <h3 className="text-xl font-bold mt-1 group-hover:text-primary transition-colors">{style.label}</h3>
                <p className="text-sm text-on-surface-variant mt-4 leading-relaxed">{style.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="relative z-10 mt-16 flex gap-6">
        <button 
          onClick={() => setView('camera')}
          className="px-10 py-3 rounded-full border border-outline text-outline font-bold hover:bg-surface-container transition-all"
        >
          Retake Photo
        </button>
        <button 
          onClick={handleSave}
          className="px-10 py-3 rounded-full border border-primary text-primary font-bold hover:bg-primary/10 transition-all"
        >
          Save to Library
        </button>
        <button 
          onClick={() => setView('dashboard')}
          className="px-10 py-3 rounded-full bg-primary text-on-primary font-bold shadow-lg hover:shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
        >
          Personalized Mix
        </button>
      </div>
    </motion.div>
  );
};
