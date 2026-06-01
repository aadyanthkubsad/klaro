/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { UserCircle, Palette, Bell, Shield, ChevronRight, Camera, Edit3, CheckCircle, ChevronDown, Video, ListMusic, Sparkles, Crown, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { TopBar } from '../common/TopBar';
import { PlanType, PlanLimits, UsageCounters } from '../../types';
import { AuthUser } from '../../contexts/AuthContext';

interface SettingsViewProps {
  planType?: PlanType;
  changePlan?: (p: PlanType) => void;
  kitsUsedToday?: number;
  dailyLimit?: number;
  setView?: (v: string) => void;
  usageCounters?: UsageCounters;
  planLimits?: PlanLimits;
  user?: AuthUser | null;
}

export const SettingsView = ({ planType = 'free', changePlan, kitsUsedToday = 0, dailyLimit = 3, setView, usageCounters, planLimits, user }: SettingsViewProps) => {
  const [activeSection, setActiveSection] = useState('account');
  const [darkMode, setDarkMode] = useState(false);
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [autoplay, setAutoplay] = useState(true);

  const sections = [
    { id: 'account', label: 'Account', icon: UserCircle },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'privacy', label: 'Privacy', icon: Shield },
  ];

  const colors = [
    { name: 'Blue', value: '#2563eb' },
    { name: 'Green', value: '#059669' },
    { name: 'Purple', value: '#7c3aed' },
    { name: 'Red', value: '#dc2626' },
    { name: 'Orange', value: '#ea580c' },
    { name: 'Lavender', value: '#9333ea' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <TopBar title="Settings" subtitle="Manage your account preferences and customize your learning experience." />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white border border-surface-container rounded-3xl overflow-hidden p-3 card-shadow">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all group ${
                  activeSection === section.id 
                    ? 'bg-primary text-white shadow-md' 
                    : 'hover:bg-surface-container-low text-on-surface-variant'
                }`}
              >
                <div className="flex items-center gap-4">
                  <section.icon size={20} className={activeSection === section.id ? 'text-white' : 'group-hover:text-primary'} />
                  <span className="text-sm font-bold">{section.label}</span>
                </div>
                <ChevronRight size={16} className={activeSection === section.id ? 'text-white/70' : 'text-on-surface-variant/30'} />
              </button>
            ))}
          </div>
        </div>

        {/* Setting Content Panels */}
        <div className="lg:col-span-9 space-y-6">
          {/* Current Plan + DEV toggle — visible on every section */}
          <div className="bg-white border border-surface-container rounded-[32px] p-6 card-shadow">
            <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  Your plan
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    planType === 'pro'  ? 'bg-amber-100 text-amber-800' :
                    planType === 'plus' ? 'bg-indigo-100 text-indigo-800' :
                                          'bg-surface-container text-on-surface-variant'
                  }`}>
                    {planType === 'pro' && <Crown size={11} />}
                    {planType === 'plus' && <Zap size={11} />}
                    {planType === 'free' && <Sparkles size={11} />}
                    {planType === 'pro' ? 'Exam Pro' : planType === 'plus' ? 'Student Plus' : 'Free'}
                  </span>
                </h3>
                <p className="text-xs text-on-surface-variant font-medium mt-1">
                  {planType === 'pro'
                    ? 'Exam Pro — ₹499/mo. 50 kits/day, monthly planner, mastery tracking, written answer feedback.'
                    : planType === 'plus'
                    ? 'Plus — ₹249/mo. 20 kits/day, PDF downloads, weak-topic retests, 5 YouTube Recall/month.'
                    : `Free plan: ${kitsUsedToday}/${dailyLimit} kits used today.`}
                </p>
              </div>
              <button
                onClick={() => setView?.('offers')}
                className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:brightness-110"
              >
                See plans
              </button>
            </div>

            {/* DEV plan toggle — no real billing yet */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-3">
                DEV: switch plan for testing
              </p>
              <div className="flex gap-2">
                {(['free', 'plus', 'pro'] as PlanType[]).map(p => (
                  <button
                    key={p}
                    onClick={() => changePlan?.(p)}
                    className={`flex-1 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                      planType === p
                        ? 'bg-amber-600 text-white'
                        : 'bg-white text-amber-800 border border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    {p === 'pro' ? 'Exam Pro' : p === 'plus' ? 'Plus' : 'Free'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-amber-700 mt-2">
                Payment integration coming soon. This toggle previews paid features locally.
              </p>
            </div>
          </div>

          {/* Usage counters card */}
          {usageCounters && planLimits && (
            <div className="bg-white border border-surface-container rounded-[32px] p-6 card-shadow">
              <h3 className="text-lg font-bold mb-4">Usage today</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Kits', used: usageCounters.kitsGeneratedToday, limit: planLimits.dailyKitsLimit },
                  { label: 'Quizzes', used: usageCounters.quizzesTakenToday, limit: planLimits.dailyQuizLimit },
                  { label: 'YouTube Recall', used: usageCounters.youtubeRecallUsedThisMonth, limit: planLimits.monthlyYoutubeRecallLimit, period: '/month' },
                  { label: 'PDFs', used: usageCounters.pdfDownloadsToday, limit: planLimits.dailyPdfDownloadsLimit },
                  { label: 'Written answers', used: usageCounters.writtenAnswersEvaluatedToday, limit: planLimits.dailyWrittenAnswersLimit },
                  { label: 'Flashcard sets', used: usageCounters.flashcardSetsGeneratedToday, limit: planLimits.dailyFlashcardSetsLimit },
                ].map(item => {
                  const pct = item.limit > 0 ? Math.min((item.used / item.limit) * 100, 100) : 0;
                  return (
                    <div key={item.label} className="bg-surface-container-low rounded-xl p-3 border border-surface-container">
                      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{item.label}</p>
                      <p className="text-lg font-black text-on-surface mt-1">
                        {item.limit === 0 ? <span className="text-sm text-gray-400">N/A</span> : <>{item.used}<span className="text-sm text-on-surface-variant">/{item.limit}</span></>}
                      </p>
                      {item.limit > 0 && (
                        <div className="w-full h-1 bg-surface-container rounded-full mt-1.5">
                          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeSection === 'account' && (
            <div className="bg-white border border-surface-container rounded-[32px] p-8 card-shadow">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  Account Information
                </h3>
                <button className="flex items-center gap-2 text-primary font-bold text-sm">
                  <Edit3 size={16} />
                  Edit
                </button>
              </div>
              
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-3xl overflow-hidden border-4 border-white shadow-xl bg-primary/10 flex items-center justify-center">
                    <span className="text-3xl font-black text-primary">{(user?.displayName || 'L')[0].toUpperCase()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 flex-1">
                  <div>
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Full Name</label>
                    <p className="font-bold text-on-surface">{user?.displayName || 'Guest Learner'}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Email Address</label>
                    <p className="font-bold text-on-surface">{user?.email || 'Not signed in'}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Learning Track</label>
                    <div className="inline-flex px-3 py-1 bg-primary/10 text-primary rounded-lg font-bold text-[11px] uppercase tracking-wider mt-1">CBSE Class 10</div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Membership</label>
                    <p className="font-bold text-on-surface">{planType === 'pro' ? 'Exam Pro' : planType === 'plus' ? 'Student Plus' : 'Free Plan'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className="bg-white border border-surface-container rounded-[32px] p-8 card-shadow">
              <h3 className="text-xl font-bold mb-8">Appearance</h3>
              
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-on-surface">Dark Mode</h4>
                    <p className="text-xs text-on-surface-variant font-medium">Switch between light and dark themes</p>
                  </div>
                  <button 
                    onClick={() => setDarkMode(!darkMode)}
                    className={`w-12 h-6 rounded-full transition-all relative ${darkMode ? 'bg-primary' : 'bg-surface-container-high'}`}
                  >
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${darkMode ? 'translate-x-6' : ''}`} />
                  </button>
                </div>

                <div>
                  <h4 className="font-bold text-on-surface mb-2">Primary Brand Color</h4>
                  <p className="text-xs text-on-surface-variant mb-6 font-medium">Customize the interface accent colors</p>
                  <div className="flex flex-wrap gap-4">
                    {colors.map((c) => (
                      <button
                        key={c.name}
                        onClick={() => setPrimaryColor(c.value)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${primaryColor === c.value ? 'ring-4 ring-primary/20 scale-110 shadow-lg' : 'hover:scale-105'}`}
                        style={{ backgroundColor: c.value }}
                      >
                        {primaryColor === c.value && <CheckCircle size={18} className="text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-on-surface mb-2">Typography Style</h4>
                  <p className="text-xs text-on-surface-variant mb-4 font-medium">Choose the font for your reading experience</p>
                  <div className="relative max-w-xs">
                    <select className="w-full bg-surface-container-low border border-surface-container rounded-xl px-5 py-3 text-sm font-bold appearance-none cursor-pointer focus:ring-2 focus:ring-primary/20 outline-none">
                      <option>Lexend (Default)</option>
                      <option>Inter</option>
                      <option>Montserrat</option>
                      <option>System Default</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" size={16} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Learning Preferences (Mocked as part of Settings for now) */}
          <div className="bg-white border border-surface-container rounded-[32px] p-8 card-shadow">
            <h3 className="text-xl font-bold mb-8">Learning Preferences</h3>
            
            <div className="space-y-6">
              {[
                { id: 'autoplay', label: 'Auto-play Videos', desc: 'Begin videos automatically when opening a lesson', icon: Video, active: autoplay, setter: setAutoplay },
                { id: 'captions', label: 'Default Captions', desc: 'Show subtitles for all video content', icon: ListMusic, active: false, setter: () => {} },
              ].map((pref) => (
                <div key={pref.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 rounded-2xl bg-primary/5 text-primary flex items-center justify-center shrink-0">
                      <pref.icon size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-on-surface">{pref.label}</h4>
                      <p className="text-xs text-on-surface-variant font-medium">{pref.desc}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => pref.setter(!pref.active)}
                    className={`w-12 h-6 rounded-full transition-all relative ${pref.active ? 'bg-primary' : 'bg-surface-container-high'}`}
                  >
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${pref.active ? 'translate-x-6' : ''}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
