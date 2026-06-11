/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, BookOpen, Headphones, Eye, PenTool, Brain, Target, BarChart3, CheckCircle, Sparkles, Crown, Zap, FileText, Users, Shield, ChevronRight, RotateCcw, Star } from 'lucide-react';
import { BhuvionaWordmark } from '../common/BhuvionaLogo';

interface LandingPageProps {
  setView: (v: string) => void;
}

export const LandingPage = ({ setView }: LandingPageProps) => {
  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
            className="absolute -top-40 -right-40 w-[600px] h-[600px] border border-white/10 rounded-full" />
          <motion.div animate={{ rotate: -360 }} transition={{ duration: 140, repeat: Infinity, ease: 'linear' }}
            className="absolute -bottom-20 -left-20 w-[400px] h-[400px] border border-white/10 rounded-[80px]" />
        </div>

        <nav className="relative z-10 max-w-6xl mx-auto flex items-center justify-between px-6 py-5">
          <BhuvionaWordmark variant="light" size="md" showTagline />
          <div className="flex items-center gap-4">
            <button onClick={() => setView('auth')} className="text-sm font-bold text-slate-300 hover:text-white transition-colors">Sign In</button>
            <button onClick={() => setView('auth')} className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl text-sm font-bold transition-all">
              Get Started
            </button>
          </div>
        </nav>

        <div className="relative z-10 max-w-4xl mx-auto text-center px-6 pt-16 pb-24">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
            <span className="inline-block px-4 py-1.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-black uppercase tracking-[0.2em] mb-6 border border-indigo-500/30">
              AI-Powered Revision Coach
            </span>
            <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-[1.05]">
              Your Personal AI<br /><span className="text-indigo-400">Revision Coach</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Turn chapters, notes, quizzes, and YouTube learning into a complete revision system.
              Study smarter for CBSE, JEE, and NEET.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={() => setView('auth')}
                className="px-8 py-4 bg-indigo-500 hover:bg-indigo-400 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-3">
                Start Learning <ArrowRight size={18} />
              </button>
              <a href="#pricing"
                className="px-8 py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                View Plans
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── PROBLEM ───────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">The Problem with Revision</h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto mb-12">
              Students study from textbooks, YouTube, notes, tuition, and sample papers — but they often don't know:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left max-w-2xl mx-auto">
              {[
                'What they are actually weak in',
                'When to revise before they forget',
                'How to fix repeated mistakes',
                'How to test themselves properly',
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                  <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-rose-600 font-black text-sm">{i + 1}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-700">{item}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── SOLUTION ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">Lumina Fixes This</h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto mb-14">
              One app for learning, testing, reviewing mistakes, tracking weak topics, and revising with spaced repetition.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: BookOpen, title: 'Learn by Mode', desc: 'Visual, Audio, Read/Write — pick the style that works for you.' },
              { icon: Target, title: 'Test Yourself', desc: 'AI-generated quizzes, flashcards, and exam answer practice.' },
              { icon: Brain, title: 'Fix Mistakes', desc: 'Mistakes Notebook tracks every wrong answer and weak topic.' },
              { icon: BarChart3, title: 'Track Mastery', desc: 'Knowledge map, score analysis, and BKT-style mastery estimates.' },
              { icon: RotateCcw, title: 'Spaced Revision', desc: 'Forgetting curve scheduler brings topics back before you forget.' },
              { icon: FileText, title: 'Exam Ready', desc: 'CBSE sample papers, chapter tests, and written answer feedback.' },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-3xl p-7 border border-slate-200 shadow-sm text-left hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mb-5">
                  <item.icon size={22} className="text-indigo-600" />
                </div>
                <h4 className="text-lg font-bold mb-2">{item.title}</h4>
                <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LEARNING MODES ────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">Four Ways to Learn</h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto">Every chapter is available in the mode that suits your brain best.</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { icon: Eye,        title: 'Visual Mode',     desc: 'Mind maps, flowcharts, concept maps, and visual summary cards. See the big picture at a glance.', tag: 'See it',   iconBg: 'bg-amber-100',  iconText: 'text-amber-600',  tagBg: 'bg-amber-100',  tagText: 'text-amber-700'  },
              { icon: Headphones, title: 'Audio Mode',      desc: 'AI narration in Hindi, Hinglish, or English. Choose voice styles — teacher, storyteller, or friend.', tag: 'Hear it', iconBg: 'bg-indigo-100', iconText: 'text-indigo-600', tagBg: 'bg-indigo-100', tagText: 'text-indigo-700' },
              { icon: PenTool,    title: 'Read/Write Mode', desc: 'Cornell notes, Smart notes, Outline notes, Table notes. Structured text you can study and export.', tag: 'Write it', iconBg: 'bg-teal-100',   iconText: 'text-teal-600',   tagBg: 'bg-teal-100',   tagText: 'text-teal-700'   },
              { icon: Target,     title: 'Practice Mode',   desc: 'MCQ quizzes, flashcards, weak-topic retests, exam answer practice with AI feedback.', tag: 'Test it',  iconBg: 'bg-rose-100',   iconText: 'text-rose-600',   tagBg: 'bg-rose-100',   tagText: 'text-rose-700'   },
            ].map((mode, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-5 bg-white rounded-3xl p-7 border border-slate-200 shadow-sm">
                <div className={`w-14 h-14 rounded-2xl ${mode.iconBg} flex items-center justify-center shrink-0`}>
                  <mode.icon size={24} className={mode.iconText} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-lg font-bold">{mode.title}</h4>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${mode.tagBg} ${mode.tagText}`}>{mode.tag}</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{mode.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LEARNING LOOP ─────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">The Lumina Learning Loop</h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto mb-14">
              A structured revision cycle that builds mastery over time — not just notes.
            </p>
          </motion.div>
          <div className="flex flex-wrap justify-center gap-3 md:gap-4">
            {[
              { step: '1', label: 'Choose Chapter' },
              { step: '2', label: 'Learn' },
              { step: '3', label: 'Quiz' },
              { step: '4', label: 'Mistakes' },
              { step: '5', label: 'Weak Topics' },
              { step: '6', label: 'Daily Tasks' },
              { step: '7', label: 'Retest' },
              { step: '8', label: 'Mastery' },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-center gap-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
                  i === 7 ? 'bg-emerald-500 text-white' : 'bg-indigo-100 text-indigo-700'
                }`}>{item.step}</div>
                <span className="text-sm font-bold text-slate-700">{item.label}</span>
                {i < 7 && <ChevronRight size={16} className="text-slate-300 hidden md:block" />}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ANALYTICS ─────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">Smart Analytics</h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto">Know exactly where you stand — not just your score, but your understanding.</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Knowledge Map', desc: 'Topic-by-topic mastery visualization across your entire syllabus.' },
              { title: 'Weak Topics', desc: 'Auto-detected from quiz mistakes. Targeted retests to fill gaps.' },
              { title: 'Score Analysis', desc: 'Detailed breakdown of quiz performance, trends, and patterns.' },
              { title: 'Mastery Estimate', desc: 'BKT-style probability model that estimates true understanding.' },
              { title: 'Forgetting Curve', desc: 'Revision scheduler that brings topics back before you forget.' },
              { title: 'Activity Log', desc: 'Full history of learning sessions, streaks, and XP progress.' },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                <h4 className="font-bold mb-2">{item.title}</h4>
                <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTS & PAPERS ────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">Exam Preparation</h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto mb-12">
              CBSE sample papers, chapter-wise tests, mock tests, and AI-evaluated exam answers — all in one place.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
            {[
              { icon: FileText, label: 'CBSE Sample Papers', desc: 'Official papers with marking schemes' },
              { icon: Target, label: 'Chapter Tests', desc: 'AI-generated tests per chapter' },
              { icon: Brain, label: 'Weak Topic Retests', desc: 'Focused quizzes on mistake patterns' },
              { icon: PenTool, label: 'Written Answer Practice', desc: 'AI feedback on long-answer responses' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-4 bg-slate-50 rounded-2xl p-5 border border-slate-200 text-left">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                  <item.icon size={18} className="text-indigo-600" />
                </div>
                <div>
                  <h4 className="font-bold text-sm mb-0.5">{item.label}</h4>
                  <p className="text-xs text-slate-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-6 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">Simple Pricing</h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto mb-14">Start free. Upgrade when you need more power.</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Free */}
            <div className="bg-white rounded-3xl p-7 border border-slate-200 shadow-sm text-left">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={18} className="text-slate-500" />
                <h4 className="font-black text-lg">Free</h4>
              </div>
              <p className="text-3xl font-black mb-1">₹0</p>
              <p className="text-xs text-slate-500 mb-6">Forever free</p>
              <ul className="space-y-3 mb-8">
                {['3 revision kits/day', '3 quizzes/day', 'Basic flashcards', '10 library saves', 'Mistakes notebook'].map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                    <CheckCircle size={14} className="text-emerald-500 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button onClick={() => setView('auth')}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all">
                Get Started
              </button>
            </div>

            {/* Plus */}
            <div className="bg-white rounded-3xl p-7 border-2 border-indigo-500 shadow-lg text-left relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full">
                Popular
              </div>
              <div className="flex items-center gap-2 mb-4">
                <Zap size={18} className="text-indigo-600" />
                <h4 className="font-black text-lg">Student Plus</h4>
              </div>
              <p className="text-3xl font-black mb-1">₹249<span className="text-base font-bold text-slate-500">/mo</span></p>
              <p className="text-xs text-slate-500 mb-6">or ₹1,799/year</p>
              <ul className="space-y-3 mb-8">
                {['20 revision kits/day', 'Unlimited quizzes', 'PDF exports', 'Weak-topic retests', '5 YouTube Recall/month', 'Priority AI queue'].map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                    <CheckCircle size={14} className="text-indigo-500 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button onClick={() => setView('auth')}
                className="w-full py-3 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl font-bold text-sm transition-all">
                Upgrade to Plus
              </button>
            </div>

            {/* Pro */}
            <div className="bg-white rounded-3xl p-7 border border-slate-200 shadow-sm text-left">
              <div className="flex items-center gap-2 mb-4">
                <Crown size={18} className="text-amber-600" />
                <h4 className="font-black text-lg">Exam Pro</h4>
              </div>
              <p className="text-3xl font-black mb-1">₹499<span className="text-base font-bold text-slate-500">/mo</span></p>
              <p className="text-xs text-slate-500 mb-6">or ₹3,499/year</p>
              <ul className="space-y-3 mb-8">
                {['50 revision kits/day', 'Monthly revision planner', 'Written answer feedback', 'Mastery tracking', 'Advanced analytics', 'Audio generation'].map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                    <CheckCircle size={14} className="text-amber-500 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button onClick={() => setView('auth')}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition-all">
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOR PARENTS ───────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">For Parents</h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto">
              Lumina helps students study with structure, not just generate notes.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Shield, title: 'Safe & Focused', desc: 'No social features, no distractions. Pure academic content aligned to CBSE/NCERT.' },
              { icon: BarChart3, title: 'Visible Progress', desc: 'Track exactly which topics your child has mastered and where they need more work.' },
              { icon: Users, title: 'Self-Driven', desc: 'Daily tasks, streaks, and XP make revision feel like progress — not punishment.' },
            ].map((item, i) => (
              <div key={i} className="bg-slate-50 rounded-3xl p-7 border border-slate-200 text-center">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-4">
                  <item.icon size={22} className="text-indigo-600" />
                </div>
                <h4 className="font-bold mb-2">{item.title}</h4>
                <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white text-center">
        <div className="max-w-3xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <Star size={32} className="text-amber-400 mx-auto mb-6" />
            <h2 className="text-3xl md:text-5xl font-black mb-6 tracking-tight leading-tight">
              Start your revision journey<br />with Lumina.
            </h2>
            <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto">
              Join students across India who are building real mastery — one chapter at a time.
            </p>
            <button onClick={() => setView('auth')}
              className="px-10 py-5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/25 inline-flex items-center gap-3">
              Get Started Free <ArrowRight size={18} />
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="py-10 px-6 bg-[#0B1120] text-slate-500 text-center">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <BhuvionaWordmark variant="light" size="sm" showTagline />
          <p className="text-xs">Secure payments via Razorpay. Built for CBSE students.</p>
          <p className="text-xs">&copy; 2026 Bhuviona Technologies Pvt Ltd. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};
