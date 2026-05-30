/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Sparkles, Library, Brain } from 'lucide-react';

interface LandingPageProps {
  setView: (v: string) => void;
}

export const LandingPage = ({ setView }: LandingPageProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-navy-dark text-white flex flex-col items-center justify-center relative overflow-hidden"
    >
      {/* Abstract Background Shapes */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 100, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-1/4 -right-1/4 w-[800px] h-[800px] border border-white/10 rounded-[100px]"
        />
        <motion.div 
          animate={{ rotate: -360 }}
          transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
          className="absolute -bottom-1/4 -left-1/4 w-[600px] h-[600px] border border-white/10 rounded-full"
        />
      </div>

      <div className="relative z-10 text-center max-w-4xl px-10">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <span className="inline-block px-4 py-1.5 rounded-full bg-primary/20 text-primary text-xs font-black uppercase tracking-[0.3em] mb-8 border border-primary/30">
            Welcome to Nexuz VARK
          </span>
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.9]">
            Optimize How You <span className="text-primary">Think.</span>
          </h1>
          <p className="text-xl md:text-2xl font-medium text-navy-muted mb-12 max-w-2xl mx-auto leading-relaxed">
            The world's first AI-native adaptive education engine. Discover your unique learning DNA and master any subject faster.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <button 
              onClick={() => setView('quiz')}
              className="px-10 py-5 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-[1.05] active:scale-95 transition-all shadow-2xl flex items-center gap-3"
            >
              Start VARK Assessment
              <ArrowRight size={20} />
            </button>
            <button 
              onClick={() => setView('dashboard')}
              className="px-10 py-5 bg-white/5 border border-white/10 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-white/10 transition-all"
            >
              Explore Dashboard
            </button>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-12 text-left"
        >
          {[
            { title: 'AI Adaptive', desc: 'Real-time transformation of any technical content into your optimal style.', icon: Sparkles },
            { title: 'Geometric Rhythm', desc: 'Proprietary visual mapping techniques for complex physics and math.', icon: Library },
            { title: 'Exam Precision', desc: 'Tailored study strategies for CBSE, JEE, and SAT aspirants.', icon: Brain }
          ].map((feature, i) => (
            <div key={i} className="group">
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6 group-hover:bg-primary transition-colors">
                 <feature.icon size={24} />
              </div>
              <h4 className="text-lg font-bold mb-3">{feature.title}</h4>
              <p className="text-sm text-navy-muted leading-relaxed font-medium">{feature.desc}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
};
