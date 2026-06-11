/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Share2, ScanText, AlertCircle, BarChart, Youtube } from 'lucide-react';
import { motion } from 'motion/react';
import { LibraryItem, UserStats, ExamMode } from '../../types';

interface DashboardProps {
  setView: (v: string) => void;
  generateKit: (topic: string, classLevel?: string) => void;
  navigateToKit: (id: string, style: string) => void;
  library: LibraryItem[];
  stats: UserStats;
  examMode: ExamMode;
  setExamMode: (m: ExamMode) => void;
}

export const Dashboard = ({ setView, generateKit, navigateToKit, library, stats, examMode, setExamMode }: DashboardProps) => {
  const lastTopic = library.length > 0 ? library[0].title : null;

  const coachAdvice: Record<ExamMode, string> = {
    'JEE': lastTopic ? `Ready to dive back into ${lastTopic}? For JEE, practice those high-yield numericals first!` : "Focus on your core concepts today. Practice high-yield problems to sharpen your problem-solving skills.",
    'CBSE': lastTopic ? `Keep reviewing ${lastTopic}. Labeling the diagrams manually will help with your long-form answers.` : "Consistency is key. Review your diagrams and summary sheets to ensure strong conceptual retention.",
    'SAT': lastTopic ? `Great work on ${lastTopic}! Practice summarizing these concepts to improve your reading pace.` : "Your reading speed matters! Use the 'Read/Write' hub to practice summarizing complex passages efficiently.",
    'NEET': lastTopic ? `Biology is about precision. Review ${lastTopic} with the Visual Hub for better anatomical accuracy.` : "Diagrams are crucial for NEET. Use the Visual Hub to test your anatomy and physiology visualization.",
    'General': lastTopic ? `Consistency is power. You've spent time on ${lastTopic}, keep building that momentum!` : "Keep a steady pace. Today is a great day to review your 'Mistakes Notebook' for high-impact growth."
  };

  const displayItems = library.slice(0, 4);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-10 max-w-6xl mx-auto"
    >
      <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
        <div>
          <h2 className="text-4xl font-black text-on-surface tracking-tight">Welcome back</h2>
          <p className="text-on-surface-variant font-medium mt-1">Ready to optimize your learning today?</p>
        </div>
        <div className="flex items-center gap-3 bg-white border border-surface-container rounded-2xl p-2 shadow-sm">
          {['JEE', 'CBSE', 'SAT', 'NEET'].map(m => (
            <button 
              key={m}
              onClick={() => setExamMode(m as ExamMode)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                examMode === m ? 'bg-primary text-white shadow-lg' : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {m}
            </button>
          ))}
          <div className="w-[1px] h-6 bg-surface-container mx-2" />
          <button 
            onClick={() => alert('Referral Link Copied! Share with friends to earn XP + Rank boost.')}
            className="flex items-center gap-2 px-4 py-2 text-indigo-600 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 rounded-xl transition-all border border-transparent hover:border-indigo-100"
          >
            <Share2 size={14} />
            Share Progress
          </button>
        </div>
      </div>
      
      {/* Hero: One-Click Revision Kit (Tier 1 ROI) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 relative overflow-hidden rounded-[40px] bg-navy-dark p-12 text-white shadow-2xl border border-navy-hover group">
          <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-700">
            <ScanText size={300} className="text-primary translate-x-1/4 -translate-y-1/4" />
          </div>
          <div className="relative z-10 max-w-lg">
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary/20 text-[10px] font-black mb-8 uppercase tracking-[0.3em] text-primary border border-primary/30">Intelligence Core</span>
            <h3 className="text-5xl font-black mb-6 leading-[0.9] tracking-tighter">One-Click Revision Kit</h3>
            <p className="text-xl mb-10 opacity-70 leading-relaxed font-medium">
              Enter a topic or scan a page to instantly get a <span className="text-primary font-bold">Summary</span>, <span className="text-primary font-bold">Flashcards</span>, and a <span className="text-primary font-bold">Quiz</span>.
            </p>

            <div className="flex flex-col gap-4">
              <button
                onClick={() => setView('camera')}
                className="w-full py-5 bg-primary rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-primary-dark transition-all"
              >
                Generate Revision Core
              </button>

              <div className="flex flex-row gap-4 mt-2">
                <button
                  onClick={() => setView('mistakes')}
                  className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-white/10 backdrop-blur-md border border-white/10 text-white rounded-2xl font-black hover:bg-white/20 transition-all text-xs uppercase tracking-widest"
                >
                  <AlertCircle size={18} />
                  Mistakes Notebook
                </button>
                <button
                  onClick={() => setView('youtube-study')}
                  className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-rose-500/20 backdrop-blur-md border border-rose-300/30 text-white rounded-2xl font-black hover:bg-rose-500/30 transition-all text-xs uppercase tracking-widest"
                  title="Studied from YouTube? Test yourself here."
                >
                  <Youtube size={18} />
                  YouTube Recall
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-surface-container rounded-[40px] p-10 flex flex-col justify-between shadow-sm border-b-4 border-b-primary">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                <AlertCircle size={24} />
              </div>
              <h4 className="text-xl font-black tracking-tight">AI Study Coach</h4>
            </div>
            <p className="text-sm font-medium text-on-surface-variant leading-relaxed italic">
              "{coachAdvice[examMode]}"
            </p>
          </div>
          <button 
            onClick={() => setView('doubt-solver')}
            className="w-full py-4 bg-surface-container text-on-surface font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-primary hover:text-white transition-all mt-8"
          >
            Ask Lumina AI
          </button>
        </div>
      </section>

      {/* Grid of Learning Hubs */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { id: 'visual', label: 'Visual Hub', desc: 'Mind Maps & Diagrams', icon: BarChart, color: 'border-b-amber-500 hover:bg-amber-50' },
          { id: 'aural', label: 'Aural Hub', desc: 'Podcasts & Audiobooks', icon: Share2, color: 'border-b-indigo-500 hover:bg-indigo-50' },
          { id: 'readwrite', label: 'Read/Write Hub', desc: 'Summaries & Analysis', icon: ScanText, color: 'border-b-teal-500 hover:bg-teal-50' },
        ].map((item) => (
          <button 
            key={item.id}
            onClick={() => setView(item.id)}
            className={`p-8 rounded-[32px] border text-left hover:scale-[1.04] transition-all group ${item.color} shadow-sm bg-white border-surface-container`}
          >
            <div className={`w-12 h-12 rounded-2xl mb-6 flex items-center justify-center bg-white shadow-md group-hover:scale-110 transition-transform`}>
              <item.icon size={24} />
            </div>
            <h4 className="text-xl font-black tracking-tight mb-2">{item.label}</h4>
            <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">{item.desc}</p>
          </button>
        ))}
      </section>

      {/* Lower Dashboard */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-10">
        <div className="col-span-12 lg:col-span-12 bg-white border border-surface-container-high p-8 rounded-[32px] card-shadow">
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-surface-container">
            <h4 className="text-lg font-bold text-on-surface">Recent Learning Paths</h4>
            <span 
              onClick={() => setView('library')}
              className="text-xs font-bold text-primary cursor-pointer hover:underline uppercase tracking-widest"
            >
              View Full Library
            </span>
          </div>
          
          <div className="space-y-4">
            {displayItems.length > 0 ? (
              displayItems.map((path: any, i: number) => (
                <div key={i} onClick={() => navigateToKit(path.id, path.type)} className="flex items-center justify-between p-4 hover:bg-surface-container-low rounded-2xl transition-colors border border-transparent hover:border-surface-container cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${
                      path.type === 'visual' ? 'bg-amber-100 text-amber-700' :
                      path.type === 'readwrite' ? 'bg-teal-100 text-teal-700' :
                      path.type === 'aural' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-rose-100 text-rose-700'
                    }`}>
                      {path.type[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-on-surface group-hover:text-primary transition-colors">{path.title}</div>
                      <div className="text-[11px] text-on-surface-variant font-medium">{path.type} • {path.date}</div>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                    path.progress === 100 ? 'bg-teal-100 text-teal-700' : 'bg-primary/10 text-primary'
                  }`}>
                    {path.progress === 100 ? 'Completed' : `${path.progress}%`}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-20 flex flex-col items-center justify-center text-center px-6 border-2 border-dashed border-surface-container rounded-2xl bg-surface-container-lowest/50">
                <ScanText size={48} className="text-on-surface-variant/30 mb-4" />
                <h5 className="font-bold text-on-surface text-xl">Your Library is Hungry</h5>
                <p className="text-sm text-on-surface-variant mt-2 max-w-sm font-medium">
                  Scan 3D diagrams, paste tricky equations, or upload a research paper to build your custom learning universe.
                </p>
                <button 
                  onClick={() => setView('camera')}
                  className="mt-8 px-10 py-3 bg-primary text-white text-xs font-black uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-xl shadow-primary/20"
                >
                  Start Scanning
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </motion.div>
  );
};
