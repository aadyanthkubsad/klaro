/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Timer, Check, Download, Sparkles, Code, BookOpen, Calendar, ChevronRight, Inbox, Activity, Brain, AlertCircle, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { LibraryItem, UserStats, MasteryEntry } from '../../types';
import { getMastery, getRevisionStatus, onLearningChange, RevisionStatus } from '../../services/learningService';

interface ProgressViewProps {
  setView: (v: string) => void;
  stats: UserStats;
  library: LibraryItem[];
}

// Match Analytics for consistency
function statusPillStyle(s: RevisionStatus): string {
  if (s === 'overdue')   return 'bg-rose-100 text-rose-800';
  if (s === 'due-today') return 'bg-amber-100 text-amber-800';
  if (s === 'upcoming')  return 'bg-primary/10 text-primary';
  return 'bg-surface-container text-on-surface-variant';
}
function statusPillLabel(s: RevisionStatus): string {
  if (s === 'overdue')   return 'Overdue';
  if (s === 'due-today') return 'Due today';
  if (s === 'upcoming')  return 'Upcoming';
  return 'Later';
}
function statusOrder(s: RevisionStatus): number {
  // Overdue first, then due-today, upcoming, then far
  return s === 'overdue' ? 0 : s === 'due-today' ? 1 : s === 'upcoming' ? 2 : 3;
}
function fmtDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const ProgressView = ({ setView, stats, library }: ProgressViewProps) => {
  // Spaced revision: read mastery map + subscribe to changes
  const [mastery, setMastery] = useState<MasteryEntry[]>(() => getMastery());
  useEffect(() => {
    const refresh = () => setMastery(getMastery());
    refresh();
    return onLearningChange(refresh);
  }, []);

  // Sort by revision urgency
  const revisionSchedule = [...mastery].sort((a, b) => {
    const sa = getRevisionStatus(a.nextRevisionDate);
    const sb = getRevisionStatus(b.nextRevisionDate);
    if (statusOrder(sa) !== statusOrder(sb)) return statusOrder(sa) - statusOrder(sb);
    return a.nextRevisionDate.localeCompare(b.nextRevisionDate);
  });
  const weakTopicsList = mastery.filter(m => m.status === 'Weak' || m.status === 'Improving');


  // Derive activity from library dates if possible, otherwise placeholder
  const learningActivity = [
    { day: 'Mon', hours: 0 },
    { day: 'Tue', hours: 0 },
    { day: 'Wed', hours: 0 },
    { day: 'Thu', hours: 0 },
    { day: 'Fri', hours: 0 },
    { day: 'Sat', hours: 0 },
    { day: 'Sun', hours: 0 },
  ];

  // Calculate VARK Mastery based on library items
  const totalItems = library.length || 1;
  const getCount = (type: string) => library.filter(item => item.type === type).length;
  
  const varkMastery = [
    { label: 'VISUAL', score: Math.round((getCount('visual') / totalItems) * 100), color: 'text-orange-500', desc: 'Charts, diagrams, layouts' },
    { label: 'AURAL', score: Math.round((getCount('aural') / totalItems) * 100), color: 'text-blue-600', desc: 'Lectures, discussions, podcasts' },
    { label: 'READ/WRITE', score: Math.round((getCount('readwrite') / totalItems) * 100), color: 'text-purple-600', desc: 'Textbooks, notes, lists' },
  ];

  // Incorporate both library progress items and quizScores from stats
  const savedTestScores = [...(stats.quizScores || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  const recentTests = savedTestScores.slice(0, 5).map(item => ({
    name: item.quizTitle,
    date: new Date(item.date).toLocaleDateString(),
    difficulty: 'Medium',
    score: Math.round((item.score / item.total) * 100) || 0,
    status: (item.score / item.total) >= 0.7 ? 'Passed' : 'Needs Review',
    icon: <Sparkles size={18} className="text-white" />,
    iconBg: 'bg-primary'
  }));

  // Append library items if we don't have enough quiz scores
  if (recentTests.length < 5) {
    const libItems = library.filter(item => item.progress > 0).map(item => ({
      name: item.title,
      date: item.date,
      difficulty: 'Medium',
      score: item.progress,
      status: item.progress >= 70 ? 'Passed' : 'Needs Review',
      icon: <Sparkles size={18} className="text-white" />,
      iconBg: 'bg-primary'
    }));
    recentTests.push(...libItems.slice(0, 5 - recentTests.length));
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10 pb-20 max-w-6xl mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-4xl font-black text-on-surface tracking-tight">Your Progress</h1>
        <p className="text-on-surface-variant font-medium">Visualizing your journey toward mastery.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Learning Activity Chart */}
        <div className="lg:col-span-8 bg-white border border-surface-container rounded-3xl p-8 shadow-sm">
          <div className="flex justify-between items-center mb-12">
            <h3 className="text-xl font-bold text-on-surface">Learning Activity</h3>
            <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black rounded-full uppercase tracking-wider">Historical View</span>
          </div>
          {library.length > 0 ? (
            <div className="flex items-end justify-between h-48 gap-2">
              {learningActivity.map((d) => (
                <div key={d.day} className="flex flex-col items-center flex-1 gap-4">
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: `${d.hours > 0 ? (d.hours / 10) * 100 : 5}%` }}
                    className={`w-full rounded-lg ${d.hours > 0 ? 'bg-primary shadow-lg shadow-primary/20' : 'bg-surface-container-low'}`}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase">{d.day}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-on-surface-variant gap-3 bg-surface-container-lowest rounded-2xl border border-dashed border-surface-container">
              <Activity size={32} className="opacity-20" />
              <p className="text-xs font-bold uppercase tracking-widest opacity-40">No activity recorded yet</p>
            </div>
          )}
        </div>

        {/* Highlight Stats */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="flex-1 bg-primary rounded-3xl p-8 text-white relative overflow-hidden shadow-lg">
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="flex items-center gap-2 text-xs font-bold opacity-90">
                <Timer size={16} /> Current Streak
              </div>
              <div>
                <div className="text-5xl font-black mb-2">{stats.streak} Days</div>
                <div className="inline-block px-2 py-1 bg-white/20 rounded-md text-[10px] font-black uppercase tracking-wider">
                  Keep it up!
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 bg-emerald-400 rounded-3xl p-8 text-on-surface relative overflow-hidden shadow-lg">
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="flex items-center gap-2 text-xs font-bold opacity-80">
                <Check size={16} className="text-emerald-900" /> Total XP Gained
              </div>
              <div>
                <div className="text-5xl font-black mb-2 text-emerald-950">{stats.xp}</div>
                <div className="inline-block px-2 py-1 bg-emerald-900/10 rounded-md text-[10px] font-black uppercase tracking-wider text-emerald-900">
                  Level {stats.level} Explorer
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* VARK Mastery Breakdown */}
      <div className="bg-white border border-surface-container rounded-3xl p-10 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
          <div>
            <h3 className="text-2xl font-bold text-on-surface">VARK Mastery Breakdown</h3>
            <p className="text-sm text-on-surface-variant font-medium mt-1">Cognitive distribution based on your saved revision kits.</p>
          </div>
          {library.length > 0 && (
            <button className="flex items-center gap-2 text-primary font-bold text-sm hover:underline">
              Download Report <Download size={16} />
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {varkMastery.map((m) => (
            <div key={m.label} className="border border-surface-container rounded-2xl p-6 text-center flex flex-col items-center">
              <div className="relative w-28 h-28 mb-6 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="56" cy="56" r="48" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-surface-container" />
                  <motion.circle 
                    cx="56" cy="56" r="48" stroke="currentColor" strokeWidth="8" fill="transparent"
                    strokeDasharray={301.5}
                    initial={{ strokeDashoffset: 301.5 }}
                    animate={{ strokeDashoffset: 301.5 - (301.5 * (library.length > 0 ? m.score : 0) / 100) }}
                    transition={{ duration: 1.5 }}
                    className={m.color}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-black text-on-surface">{library.length > 0 ? m.score : 0}%</span>
                </div>
              </div>
              <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${m.color}`}>{m.label}</h4>
              <p className="text-[10px] font-bold text-on-surface-variant leading-tight">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Spaced Revision Schedule — based on Ebbinghaus forgetting curve */}
      <div className="space-y-4">
        <div className="flex justify-between items-end flex-wrap gap-3">
          <div>
            <h3 className="text-2xl font-bold text-on-surface">Spaced Revision Schedule</h3>
            <p className="text-sm text-on-surface-variant font-medium mt-1">Next dates to revise each topic, based on your last quiz score.</p>
          </div>
          <button onClick={() => setView('todo')} className="text-sm font-bold text-primary hover:underline">View Daily Tasks →</button>
        </div>

        {/* Tiny forgetting-curve explainer */}
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-amber-100 rounded-2xl p-5 flex items-start gap-4">
          <div className="p-2 bg-white rounded-lg text-amber-700 shrink-0">
            <Brain size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900 mb-1">The Ebbinghaus Forgetting Curve</p>
            <p className="text-xs text-amber-800 leading-relaxed">
              Research shows we forget about <span className="font-bold">70% of new information within 24 hours</span> and
              up to <span className="font-bold">90% within a month</span> without review. Klaro schedules your revisions at
              <span className="font-bold"> Day 1, Day 3, Day 7, Day 14, Day 30</span> to flatten the curve and lock concepts in long-term memory.
            </p>
          </div>
        </div>

        {revisionSchedule.length === 0 ? (
          <div className="bg-white border border-dashed border-surface-container rounded-[32px] p-12 text-center">
            <Clock size={32} className="text-on-surface-variant/40 mx-auto mb-3" />
            <h4 className="text-lg font-bold text-on-surface mb-1">No revision schedule yet</h4>
            <p className="text-sm text-on-surface-variant font-medium mb-6 max-w-sm mx-auto">
              Take a quiz on any topic — Klaro will plan revisions at Day 1, 3, 7, 14, and 30.
            </p>
            <button
              onClick={() => setView('dashboard')}
              className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-xs uppercase tracking-widest"
            >
              Start a Quiz
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {revisionSchedule.map(m => {
              const rs = getRevisionStatus(m.nextRevisionDate);
              return (
                <div key={m.topic} className="bg-white border border-surface-container rounded-2xl p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
                    <h4 className="font-bold text-on-surface text-base leading-snug pr-2 line-clamp-2">{m.topic}</h4>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`shrink-0 px-2 py-0.5 rounded-full font-black uppercase tracking-widest text-[9px] ${
                        m.status === 'Mastered' ? 'bg-emerald-200 text-emerald-900' :
                        m.status === 'Strong'   ? 'bg-emerald-100 text-emerald-800' :
                        m.status === 'Improving'? 'bg-amber-100 text-amber-800' :
                        m.status === 'Weak'     ? 'bg-rose-100 text-rose-800' :
                                                  'bg-surface-container text-on-surface-variant'
                      }`}>
                        {m.status}
                      </span>
                      {m.forgettingRisk && (
                        <span className={`shrink-0 px-2 py-0.5 rounded-full font-black uppercase tracking-widest text-[9px] ${
                          m.forgettingRisk === 'High'   ? 'bg-rose-100 text-rose-800' :
                          m.forgettingRisk === 'Medium' ? 'bg-amber-100 text-amber-800' :
                                                          'bg-emerald-100 text-emerald-800'
                        }`}>
                          Risk: {m.forgettingRisk}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-on-surface-variant">Mastery</span>
                    <span className="text-sm font-black text-on-surface">{m.masteryScore}%</span>
                  </div>
                  <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden mb-4">
                    <div
                      className={`h-full ${m.masteryScore >= 75 ? 'bg-emerald-500' : m.masteryScore >= 55 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      style={{ width: `${m.masteryScore}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <p className="font-black uppercase tracking-widest text-[9px] text-on-surface-variant mb-0.5">Last revised</p>
                      <p className="font-bold text-on-surface">{fmtDate(m.lastAttemptDate)}</p>
                    </div>
                    <div>
                      <p className="font-black uppercase tracking-widest text-[9px] text-on-surface-variant mb-0.5">Next revision</p>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-on-surface">{fmtDate(m.nextRevisionDate)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${statusPillStyle(rs)}`}>
                      {statusPillLabel(rs)}
                    </span>
                    <button
                      onClick={() => setView('todo')}
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      Plan revision <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Weak topics quick-glance */}
        {weakTopicsList.length > 0 && (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-5">
            <h4 className="text-sm font-bold text-rose-900 mb-3 flex items-center gap-2">
              <AlertCircle size={16} /> Weak topics to revisit
            </h4>
            <div className="flex flex-wrap gap-2">
              {weakTopicsList.map(m => (
                <span key={m.topic} className="px-3 py-1 bg-white border border-rose-200 text-rose-800 rounded-full text-xs font-bold">
                  {m.topic} · {m.masteryScore}%
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent Activity / Tests */}
      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <h3 className="text-2xl font-bold text-on-surface">Recent Mastery Items</h3>
          <button onClick={() => setView('library')} className="text-sm font-bold text-primary hover:underline">View All Items</button>
        </div>

        <div className="space-y-4">
          {recentTests.length > 0 ? (
            recentTests.map((test, i) => (
              <div key={i} className={`bg-white border rounded-3xl p-6 flex items-center gap-6 shadow-sm group hover:border-primary transition-colors border-surface-container`}>
                <div className={`w-14 h-14 rounded-2xl ${test.iconBg} flex items-center justify-center shrink-0 shadow-md`}>
                  {test.icon}
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-black text-on-surface mb-1">{test.name}</h4>
                  <div className="flex items-center gap-4 text-xs font-bold text-on-surface-variant">
                    <span className="flex items-center gap-1.5"><Calendar size={14} /> {test.date}</span>
                    <span className="flex items-center gap-1.5 uppercase tracking-widest text-[9px] px-2 py-0.5 bg-surface-container rounded-full">Assessment</span>
                  </div>
                </div>
                <div className="text-right flex items-center gap-8">
                  <div className="flex flex-col items-end">
                    <span className="text-3xl font-black text-on-surface">{test.score}%</span>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                      test.status === 'Passed' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {test.status}
                    </span>
                  </div>
                  <button 
                    onClick={() => setView('library')}
                    className="flex items-center gap-2 text-on-surface font-black text-xs uppercase tracking-widest hover:text-primary transition-colors"
                  >
                    Details <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white border border-dashed border-surface-container rounded-[40px] p-20 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center text-on-surface-variant mb-6">
                <Inbox size={32} />
              </div>
              <h4 className="text-xl font-bold text-on-surface mb-2">No Mastery Data Yet</h4>
              <p className="text-on-surface-variant max-w-sm mb-8 font-medium">Start by scanning your notes or choosing a topic to generate your first revision kit.</p>
              <button 
                onClick={() => setView('camera')}
                className="px-8 py-3 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all"
              >
                Scan Now
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
