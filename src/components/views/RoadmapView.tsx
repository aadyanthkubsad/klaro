/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CheckCircle2, Milestone, Rocket } from 'lucide-react';
import { motion } from 'motion/react';

export const RoadmapView = () => {
  const ranking = [
    { feature: 'Revision Kit', user: 10, retention: 9, complexity: 5, roi: 'Critical' },
    { feature: 'Quiz Generator', user: 10, retention: 8, complexity: 6, roi: 'Critical' },
    { feature: 'Weak Topic Tracker', user: 9, retention: 10, complexity: 6, roi: 'Critical' },
    { feature: 'Lumina AI', user: 9, retention: 9, complexity: 7, roi: 'High' },
    { feature: 'Mistakes Notebook', user: 8, retention: 10, complexity: 4, roi: 'High' },
    { feature: 'Audio Summary', user: 7, retention: 6, complexity: 6, roi: 'Medium' },
  ];

  const roadmap = [
    { 
      tier: 'Tier 1 — Build First (Highest ROI)', 
      impact: 'Very High', 
      difficulty: 'Medium',
      features: [
        { name: 'One-Click Revision Kit', status: 'completed', desc: 'Scan → Summary + Flashcards + Quiz' },
        { name: 'Quiz Generator', status: 'completed', desc: 'CBSE/JEE/SAT style MCQs' },
        { name: 'Weak Topic Tracker', status: 'completed', desc: 'Tracks mistakes & suggests revision' },
        { name: 'Saved History / Library', status: 'completed', desc: 'Users revisit old chapters' },
        { name: 'Mobile-First UI', status: 'completed', desc: 'Fast clean phone experience' }
      ]
    },
    { 
      tier: 'Tier 2 — Build Next', 
      impact: 'High', 
      difficulty: 'Medium-Hard',
      features: [
        { name: 'OCR Chapter Scanner', status: 'completed', desc: 'Photo → usable text' },
        { name: 'Daily 5-Minute Revision', status: 'completed', desc: 'Habit loop' },
        { name: 'Flashcard Spaced Repetition', status: 'in-progress', desc: 'Repeat weak cards intelligently' },
        { name: 'Mistakes Notebook', status: 'completed', desc: 'Wrong answers stored' },
        { name: 'Exam Selector', status: 'completed', desc: 'CBSE / JEE / SAT mode' }
      ]
    },
    { 
      tier: 'Tier 3 — Strong Enhancers', 
      impact: 'Medium', 
      difficulty: 'Medium',
      features: [
        { name: 'Mind Map Generator', status: 'completed', desc: 'Visual Hub experience' },
        { name: 'Audio Summary Mode', status: 'completed', desc: 'Aural Hub experience' },
        { name: 'Streaks / XP', status: 'completed', desc: 'Retention booster' },
        { name: 'Share Results', status: 'completed', desc: 'Referral growth' },
        { name: 'Doubt Solver Chat', status: 'completed', desc: 'Lumina AI' }
      ]
    }
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto space-y-12 pb-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-4xl font-black text-on-surface tracking-tight">Feature ROI & Roadmap</h2>
        <p className="text-on-surface-variant font-medium">Strategic prioritization based on User Value, Retention, and Build Complexity.</p>
      </div>

      {/* ROI Ranking Table */}
      <div className="bg-white border border-surface-container rounded-[40px] overflow-hidden shadow-sm">
        <div className="p-8 border-b border-surface-container bg-surface-container-lowest">
          <h3 className="text-xl font-black text-on-surface">Strategic Priority Ranking</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low/50 text-[10px] font-black uppercase tracking-widest text-on-surface-variant border-b border-surface-container">
                <th className="px-8 py-4">Feature Name</th>
                <th className="px-6 py-4">User Value</th>
                <th className="px-6 py-4">Retention</th>
                <th className="px-6 py-4">Build Complexity</th>
                <th className="px-8 py-4 text-right">ROI Rank</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {ranking.map((row, i) => (
                <tr key={i} className="hover:bg-primary/[0.02] transition-colors group">
                  <td className="px-8 py-4 font-bold text-sm text-on-surface">{row.feature}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      {[...Array(10)].map((_, j) => (
                        <div key={j} className={`w-1.5 h-3 rounded-full ${j < row.user ? 'bg-primary' : 'bg-surface-container'}`} />
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      {[...Array(10)].map((_, j) => (
                        <div key={j} className={`w-1.5 h-3 rounded-full ${j < row.retention ? 'bg-teal-500' : 'bg-surface-container'}`} />
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden max-w-[80px]">
                      <div className="h-full bg-amber-500 transition-all group-hover:bg-amber-600" style={{ width: `${(row.complexity / 10) * 100}%` }} />
                    </div>
                  </td>
                  <td className="px-8 py-4 text-right">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                      row.roi === 'Critical' ? 'bg-rose-100 text-rose-600' : 
                      row.roi === 'High' ? 'bg-primary/10 text-primary' : 
                      'bg-surface-container text-on-surface-variant'
                    }`}>
                      {row.roi}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-navy-dark p-8 rounded-[32px] text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary opacity-20 -mr-16 -mt-16 rounded-full" />
          <h4 className="text-xs font-black uppercase tracking-widest text-primary mb-4">Month 1 Focus</h4>
          <p className="text-lg font-bold">Revision Kit, Quiz Gen, Mobile UI, Library</p>
          <div className="mt-6 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-teal-400" />
            <span className="text-[10px] font-bold uppercase">100% Complete</span>
          </div>
        </div>
        <div className="bg-white border-2 border-primary/20 p-8 rounded-[32px] shadow-sm relative overflow-hidden">
          <h4 className="text-xs font-black uppercase tracking-widest text-primary mb-4">Month 2 Focus</h4>
          <p className="text-lg font-bold text-on-surface">Weak Tracker, OCR, Mistakes Notebook</p>
          <div className="mt-6 flex items-center gap-2 text-on-surface-variant">
            <Milestone size={16} className="text-primary" />
            <span className="text-[10px] font-bold uppercase">Current Focus</span>
          </div>
        </div>
        <div className="bg-white border border-surface-container p-8 rounded-[32px] shadow-sm opacity-50">
          <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-4">Month 3 Focus</h4>
          <p className="text-lg font-bold text-on-surface">Daily Revision, Spaced Repetition, Referrals</p>
          <div className="mt-6 flex items-center gap-2 text-on-surface-variant">
            <Rocket size={16} />
            <span className="text-[10px] font-bold uppercase">Upcoming</span>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {roadmap.map((tier, idx) => (
          <div key={idx} className="bg-white border border-surface-container rounded-[40px] p-10 shadow-sm">
            <div className="flex justify-between items-start mb-8 border-b border-surface-container pb-6">
              <div>
                <h3 className="text-2xl font-black text-on-surface mb-2">{tier.tier}</h3>
                <div className="flex gap-4">
                  <span className="text-[10px] font-black uppercase text-primary bg-primary/10 px-3 py-1 rounded">ROI: {tier.impact}</span>
                  <span className="text-[10px] font-black uppercase text-on-surface-variant bg-surface-container px-3 py-1 rounded">Difficulty: {tier.difficulty}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tier.features.map((feat, fIdx) => (
                <div key={fIdx} className={`p-6 rounded-3xl border transition-all ${
                  feat.status === 'completed' ? 'bg-teal-50/50 border-teal-100' : 
                  feat.status === 'in-progress' ? 'bg-primary/5 border-primary/20 ring-1 ring-primary/10' : 
                  'bg-surface-container-lowest border-surface-container'
                }`}>
                  <div className="flex justify-between items-start mb-4">
                    <h5 className="font-black text-sm text-on-surface">{feat.name}</h5>
                    {feat.status === 'completed' ? <CheckCircle2 size={16} className="text-teal-600" /> : feat.status === 'in-progress' ? <Milestone size={16} className="text-primary animate-pulse" /> : <Rocket size={16} className="text-on-surface-variant opacity-20" />}
                  </div>
                  <p className="text-xs font-medium text-on-surface-variant leading-relaxed">{feat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
