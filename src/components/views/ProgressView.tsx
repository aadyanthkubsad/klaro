/**
 * ProgressView — Redesigned student progress dashboard.
 *
 * Shows real activity data, streaks, XP, mastery breakdown,
 * spaced revision schedule, and weekly reports.
 */

import React, { useEffect, useState } from 'react';
import {
  Timer, Check, Sparkles, BookOpen, Calendar, ChevronRight, Inbox,
  Activity, Brain, AlertCircle, Clock, FileText, TrendingUp, Target,
  Award, BarChart2, Zap, RefreshCw, Flame, Star, PieChart, ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LibraryItem, UserStats, MasteryEntry } from '../../types';
import {
  getMastery, getRevisionStatus, onLearningChange, RevisionStatus,
  computeWrittenAnswerAnalytics, WrittenAnswerAnalytics, getQuizHistory,
} from '../../services/learningService';
import {
  getActivitiesForDays, getStreak, getTotalXP, getActivityCounts, getActivities,
  generateWeeklyReport, onActivityChange, StreakInfo, DayActivity, WeeklyReport,
} from '../../services/activityService';

interface ProgressViewProps {
  setView: (v: string) => void;
  stats: UserStats;
  library: LibraryItem[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  return s === 'overdue' ? 0 : s === 'due-today' ? 1 : s === 'upcoming' ? 2 : 3;
}
function fmtDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ─── Component ──────────────────────────────────────────────────────────────

export const ProgressView = ({ setView, stats, library }: ProgressViewProps) => {
  // ── State ──────────────────────────────────────────────────────────────
  const [mastery, setMastery] = useState<MasteryEntry[]>(() => getMastery());
  const [writtenAnalytics, setWrittenAnalytics] = useState<WrittenAnswerAnalytics>(() => computeWrittenAnswerAnalytics());
  const [streak, setStreakState] = useState<StreakInfo>(() => getStreak());
  const [weekActivity, setWeekActivity] = useState<DayActivity[]>(() => getActivitiesForDays(7));
  const [totalXP, setTotalXP] = useState(() => getTotalXP());
  const [activityCounts, setActivityCounts] = useState(() => getActivityCounts());
  const [showReport, setShowReport] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);

  // Subscribe to changes
  useEffect(() => {
    const refresh = () => {
      setMastery(getMastery());
      setWrittenAnalytics(computeWrittenAnswerAnalytics());
      setStreakState(getStreak());
      setWeekActivity(getActivitiesForDays(7));
      setTotalXP(getTotalXP());
      setActivityCounts(getActivityCounts());
    };
    refresh();
    const unsub1 = onLearningChange(refresh);
    const unsub2 = onActivityChange(refresh);
    return () => { unsub1(); unsub2(); };
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────
  const quizHistory = getQuizHistory();
  const quizzesCompleted = quizHistory.length;
  const avgScore = quizzesCompleted > 0
    ? Math.round(quizHistory.reduce((s, q) => s + q.percentage, 0) / quizzesCompleted)
    : 0;
  const topicsMastered = mastery.filter(m => m.status === 'Mastered' || m.status === 'Strong').length;
  const pendingRevisions = mastery.filter(m => {
    const rs = getRevisionStatus(m.nextRevisionDate);
    return rs === 'overdue' || rs === 'due-today';
  }).length;
  const mistakesCount = stats.mistakes?.length || 0;
  const kitsGenerated = (activityCounts['revision-kit'] || 0) + library.filter(l => l.type !== 'analysis').length;
  const maxDayActivity = Math.max(...weekActivity.map(d => d.count), 1);

  // Revision schedule
  const revisionSchedule = [...mastery].sort((a, b) => {
    const sa = getRevisionStatus(a.nextRevisionDate);
    const sb = getRevisionStatus(b.nextRevisionDate);
    if (statusOrder(sa) !== statusOrder(sb)) return statusOrder(sa) - statusOrder(sb);
    return a.nextRevisionDate.localeCompare(b.nextRevisionDate);
  });
  const weakTopicsList = mastery.filter(m => m.status === 'Weak' || m.status === 'Improving');

  // VARK mastery from actual mode usage across quizzes, library items, and activity log.
  // Normalise mode names: 'aural' and 'audio' both map to 'aural', 'revision-kit' is
  // excluded from VARK (it predates mode selection).
  const normMode = (m: string): string | null => {
    if (m === 'visual') return 'visual';
    if (m === 'aural' || m === 'audio') return 'aural';
    if (m === 'readwrite' || m === 'read-write') return 'readwrite';
    return null;
  };
  const varkCounts = { visual: 0, aural: 0, readwrite: 0 };
  for (const q of quizHistory) {
    const k = normMode(q.modeUsed);
    if (k) varkCounts[k as keyof typeof varkCounts]++;
  }
  for (const l of library) {
    const k = normMode(l.type);
    if (k) varkCounts[k as keyof typeof varkCounts]++;
  }
  // Also count activity log entries that recorded a mode (resume-learning, etc.)
  for (const a of getActivities()) {
    const m = a.meta?.mode;
    if (m) {
      const k = normMode(m);
      if (k) varkCounts[k as keyof typeof varkCounts]++;
    }
  }
  const totalModeActivity = varkCounts.visual + varkCounts.aural + varkCounts.readwrite;
  console.log('[VARK Debug] counts:', varkCounts, 'total:', totalModeActivity, 'quizModes:', quizHistory.map(q => q.modeUsed), 'libTypes:', library.map(l => l.type));

  const varkMastery = [
    {
      label: 'Visual',
      score: totalModeActivity > 0 ? Math.round((varkCounts.visual / totalModeActivity) * 100) : 0,
      color: 'text-orange-500',
      bg: 'bg-orange-50 border-orange-200',
    },
    {
      label: 'Aural',
      score: totalModeActivity > 0 ? Math.round((varkCounts.aural / totalModeActivity) * 100) : 0,
      color: 'text-blue-600',
      bg: 'bg-blue-50 border-blue-200',
    },
    {
      label: 'Read/Write',
      score: totalModeActivity > 0 ? Math.round((varkCounts.readwrite / totalModeActivity) * 100) : 0,
      color: 'text-purple-600',
      bg: 'bg-purple-50 border-purple-200',
    },
  ];
  const hasVarkData = totalModeActivity > 0;

  // ── Report generation ──────────────────────────────────────────────────
  const handleGenerateReport = () => {
    setWeeklyReport(generateWeeklyReport());
    setShowReport(true);
  };

  // ── Derived: weekly totals for summary row ─────────────────────────────
  const weekTotalActions = weekActivity.reduce((s, d) => s + d.count, 0);
  const weekTotalXP = weekActivity.reduce((s, d) => s + d.xp, 0);
  const maxDayXP = Math.max(...weekActivity.map(d => d.xp), 1);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 pb-20 max-w-6xl mx-auto px-4 md:px-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-on-surface tracking-tight">Progress Overview</h1>
          <p className="text-on-surface-variant font-medium mt-1">Your complete learning journey at a glance.</p>
        </div>
        <button
          onClick={handleGenerateReport}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:brightness-110 transition-all shadow-md"
        >
          <BarChart2 size={16} /> Generate Weekly Report
        </button>
      </div>

      {/* ─── Hero: Streak & XP (top) ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-orange-500 to-rose-500 rounded-3xl p-8 text-white relative overflow-hidden shadow-lg">
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/5 rounded-full" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/5 rounded-full" />
          <div className="relative z-10 flex flex-col h-full justify-between min-h-[140px]">
            <div className="flex items-center gap-2 text-xs font-bold opacity-90">
              <Flame size={16} /> Current Streak
            </div>
            <div>
              <div className="text-5xl font-black mb-1">{streak.current} {streak.current === 1 ? 'Day' : 'Days'}</div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-block px-3 py-1 bg-white/20 rounded-md text-[10px] font-black uppercase tracking-wider">
                  {streak.current > 0 ? (streak.isActiveToday ? 'Active today!' : 'Study today to keep it!') : 'Start your streak!'}
                </span>
                {streak.longest > streak.current && (
                  <span className="text-[10px] font-bold opacity-80">
                    Best: {streak.longest} days
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-400 to-teal-500 rounded-3xl p-8 text-white relative overflow-hidden shadow-lg">
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/5 rounded-full" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/5 rounded-full" />
          <div className="relative z-10 flex flex-col h-full justify-between min-h-[140px]">
            <div className="flex items-center gap-2 text-xs font-bold opacity-90">
              <Star size={16} /> Total XP Earned
            </div>
            <div>
              <div className="text-5xl font-black mb-1">{totalXP}</div>
              <div className="inline-block px-3 py-1 bg-white/20 rounded-md text-[10px] font-black uppercase tracking-wider">
                Level {Math.max(1, Math.floor(totalXP / 100) + 1)} Explorer
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Learning Activity Chart (enhanced) ────────────────────────── */}
      <div className="bg-white border border-surface-container rounded-3xl p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h3 className="text-xl font-bold text-on-surface">Learning Activity</h3>
            <p className="text-xs text-on-surface-variant font-medium mt-1">Last 7 days</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-primary inline-block" /> Actions
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-400 inline-block" /> XP Earned
            </span>
          </div>
        </div>

        {weekActivity.some(d => d.count > 0) ? (
          <div className="space-y-6">
            {/* Dual bar chart: actions + XP side by side */}
            <div className="flex items-end justify-between gap-2 sm:gap-4" style={{ height: 180 }}>
              {weekActivity.map((d) => {
                const actionH = d.count > 0 ? Math.max(12, (d.count / maxDayActivity) * 100) : 0;
                const xpH = d.xp > 0 ? Math.max(12, (d.xp / maxDayXP) * 100) : 0;
                const isToday = d.dayLabel.toLowerCase() === new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
                return (
                  <div key={d.date} className="flex flex-col items-center flex-1 h-full justify-end gap-0.5">
                    {/* Value labels */}
                    {(d.count > 0 || d.xp > 0) && (
                      <div className="flex items-center gap-1 mb-1">
                        {d.count > 0 && <span className="text-[9px] font-black text-primary">{d.count}</span>}
                        {d.count > 0 && d.xp > 0 && <span className="text-[8px] text-on-surface-variant">/</span>}
                        {d.xp > 0 && <span className="text-[9px] font-black text-emerald-600">+{d.xp}</span>}
                      </div>
                    )}
                    {/* Bars container */}
                    <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: '100%' }}>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${actionH}%` }}
                        className="w-[45%] max-w-[20px] rounded-t-md bg-primary"
                        style={{ minHeight: d.count > 0 ? 12 : 0 }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.05 }}
                      />
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${xpH}%` }}
                        className="w-[45%] max-w-[20px] rounded-t-md bg-emerald-400"
                        style={{ minHeight: d.xp > 0 ? 12 : 0 }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
                      />
                    </div>
                    {/* Day label */}
                    <span className={`text-[10px] font-bold uppercase mt-2 ${isToday ? 'text-primary' : 'text-on-surface-variant'}`}>
                      {d.dayLabel}
                    </span>
                    {isToday && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  </div>
                );
              })}
            </div>
            {/* Weekly summary row */}
            <div className="flex items-center justify-center gap-6 pt-4 border-t border-surface-container">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-primary" />
                <span className="text-xs font-bold text-on-surface-variant">This week:</span>
                <span className="text-sm font-black text-on-surface">{weekTotalActions} actions</span>
              </div>
              <div className="w-px h-4 bg-surface-container" />
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-emerald-500" />
                <span className="text-sm font-black text-emerald-700">+{weekTotalXP} XP</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-44 text-on-surface-variant gap-3 bg-surface-container-lowest rounded-2xl border border-dashed border-surface-container">
            <Activity size={32} className="opacity-20" />
            <p className="text-sm font-medium opacity-60 text-center max-w-sm">
              No activity yet. Generate a kit or take a quiz to start tracking progress.
            </p>
          </div>
        )}
      </div>

      {/* ─── VARK Mastery (enhanced – horizontal bars) ─────────────────── */}
      <div className="bg-white border border-surface-container rounded-3xl p-8 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h3 className="text-xl font-bold text-on-surface">VARK Mastery Breakdown</h3>
            <p className="text-sm text-on-surface-variant font-medium mt-1">
              How much you use each learning style — based on your kits and quizzes.
            </p>
          </div>
        </div>

        {hasVarkData ? (
          <div className="space-y-5">
            {varkMastery.map((m) => {
              const barColors: Record<string, { bar: string; bg: string; text: string; icon: React.ReactNode }> = {
                Visual: { bar: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', icon: <Sparkles size={16} className="text-orange-500" /> },
                Aural: { bar: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', icon: <Activity size={16} className="text-blue-500" /> },
                'Read/Write': { bar: 'bg-purple-500', bg: 'bg-purple-50', text: 'text-purple-700', icon: <FileText size={16} className="text-purple-500" /> },
              };
              const c = barColors[m.label] || barColors.Visual;
              return (
                <div key={m.label} className={`rounded-2xl p-5 border ${m.bg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      {c.icon}
                      <span className={`text-sm font-bold ${c.text}`}>{m.label}</span>
                    </div>
                    <span className={`text-lg font-black ${c.text}`}>{m.score}%</span>
                  </div>
                  <div className="w-full h-3 bg-white/80 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${m.score}%` }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                      className={`h-full rounded-full ${c.bar}`}
                      style={{ minWidth: m.score > 0 ? 8 : 0 }}
                    />
                  </div>
                  <p className="text-[10px] font-medium text-on-surface-variant mt-2">
                    {m.label === 'Visual' && 'Diagrams, flowcharts, and visual revision kits'}
                    {m.label === 'Aural' && 'Audio lessons and listening-based study'}
                    {m.label === 'Read/Write' && 'Notes, summaries, and written practice'}
                  </p>
                </div>
              );
            })}
            {/* Tip */}
            <div className="flex items-start gap-3 bg-gradient-to-r from-primary/5 to-violet-50 rounded-xl p-4 border border-primary/10">
              <Brain size={16} className="text-primary shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-on-surface-variant leading-relaxed">
                <span className="font-bold text-on-surface">Tip:</span> Balanced VARK usage helps you learn more effectively. Try modes you haven't used much!
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-on-surface-variant gap-2">
            <PieChart size={32} className="opacity-20" />
            <p className="text-sm font-medium opacity-60">Not enough data yet. Use different learning modes to see your breakdown.</p>
          </div>
        )}
      </div>

      {/* ─── Stat Cards (6 remaining — no Streak/XP) ───────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Quizzes Done', value: `${quizzesCompleted}`, unit: '', icon: <Target size={20} />, color: 'bg-blue-50 border-blue-200 text-blue-700', iconColor: 'text-blue-500' },
          { label: 'Average Score', value: quizzesCompleted > 0 ? `${avgScore}%` : '—', unit: '', icon: <TrendingUp size={20} />, color: 'bg-violet-50 border-violet-200 text-violet-700', iconColor: 'text-violet-500' },
          { label: 'Kits Generated', value: `${kitsGenerated}`, unit: '', icon: <BookOpen size={20} />, color: 'bg-indigo-50 border-indigo-200 text-indigo-700', iconColor: 'text-indigo-500' },
          { label: 'Mistakes Logged', value: `${mistakesCount}`, unit: '', icon: <AlertCircle size={20} />, color: 'bg-rose-50 border-rose-200 text-rose-700', iconColor: 'text-rose-500' },
          { label: 'Topics Mastered', value: `${topicsMastered}`, unit: '', icon: <Award size={20} />, color: 'bg-amber-50 border-amber-200 text-amber-700', iconColor: 'text-amber-500' },
          { label: 'Pending Revisions', value: `${pendingRevisions}`, unit: '', icon: <RefreshCw size={20} />, color: 'bg-cyan-50 border-cyan-200 text-cyan-700', iconColor: 'text-cyan-500' },
        ].map(card => (
          <div key={card.label} className={`border rounded-2xl p-5 ${card.color}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-black uppercase tracking-widest opacity-70">{card.label}</span>
              <span className={card.iconColor}>{card.icon}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black">{card.value}</span>
              {card.unit && <span className="text-xs font-bold opacity-60">{card.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Written Answer Stats ───────────────────────────────────────── */}
      {writtenAnalytics.totalAttempts > 0 && (
        <div className="bg-white border border-surface-container rounded-3xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-on-surface flex items-center gap-2">
                <FileText size={20} className="text-violet-600" /> Written Answer Practice
              </h3>
              <p className="text-sm text-on-surface-variant font-medium mt-1">Exam answer performance over time</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-violet-500 mb-1">Attempts</p>
              <p className="text-2xl font-black text-violet-700">{writtenAnalytics.totalAttempts}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-1">Avg Score</p>
              <p className="text-2xl font-black text-emerald-700">{writtenAnalytics.averageScore}%</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center col-span-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 mb-1">Score Trend</p>
              {writtenAnalytics.scoreOverTime.length >= 2 ? (() => {
                const scores = writtenAnalytics.scoreOverTime;
                const recent = scores.slice(-3);
                const earlier = scores.slice(0, Math.max(1, scores.length - 3));
                const recentAvg = Math.round(recent.reduce((s, x) => s + x.score, 0) / recent.length);
                const earlierAvg = Math.round(earlier.reduce((s, x) => s + x.score, 0) / earlier.length);
                const diff = recentAvg - earlierAvg;
                return (
                  <div className="flex items-center justify-center gap-2">
                    <TrendingUp size={18} className={diff >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
                    <p className={`text-lg font-black ${diff >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {diff >= 0 ? '+' : ''}{diff}%
                    </p>
                    <p className="text-[10px] text-blue-600 font-medium">vs earlier</p>
                  </div>
                );
              })() : (
                <p className="text-sm text-blue-600 font-bold">Need more data</p>
              )}
            </div>
          </div>

          {writtenAnalytics.commonMissingKeywords.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">Commonly Missing Keywords</p>
              <div className="flex flex-wrap gap-2">
                {writtenAnalytics.commonMissingKeywords.slice(0, 8).map((kw, i) => (
                  <span key={i} className="px-3 py-1 bg-rose-50 border border-rose-200 text-rose-700 rounded-full text-xs font-bold">
                    {kw.keyword} ({kw.count}x)
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Spaced Revision Schedule ───────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex justify-between items-end flex-wrap gap-3">
          <div>
            <h3 className="text-2xl font-bold text-on-surface">Spaced Revision Schedule</h3>
            <p className="text-sm text-on-surface-variant font-medium mt-1">Based on Ebbinghaus forgetting curve + your quiz scores.</p>
          </div>
          <button onClick={() => setView('todo')} className="text-sm font-bold text-primary hover:underline">View Daily Tasks &rarr;</button>
        </div>

        {/* Explainer */}
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-amber-100 rounded-2xl p-5 flex items-start gap-4">
          <div className="p-2 bg-white rounded-lg text-amber-700 shrink-0">
            <Brain size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900 mb-1">The Ebbinghaus Forgetting Curve</p>
            <p className="text-xs text-amber-800 leading-relaxed">
              Research shows we forget about <span className="font-bold">70% of new information within 24 hours</span>.
              Lumina schedules your revisions at <span className="font-bold">Day 1, 3, 7, 14, 30</span> to lock concepts in long-term memory.
            </p>
          </div>
        </div>

        {revisionSchedule.length === 0 ? (
          <div className="bg-white border border-dashed border-surface-container rounded-[32px] p-12 text-center">
            <Clock size={32} className="text-on-surface-variant/40 mx-auto mb-3" />
            <h4 className="text-lg font-bold text-on-surface mb-1">No revision schedule yet</h4>
            <p className="text-sm text-on-surface-variant font-medium mb-6 max-w-sm mx-auto">
              Take a quiz on any topic and Lumina will plan your revisions.
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
                      <p className="font-bold text-on-surface">{fmtDate(m.nextRevisionDate)}</p>
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

        {/* Weak topics */}
        {weakTopicsList.length > 0 && (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-5">
            <h4 className="text-sm font-bold text-rose-900 mb-3 flex items-center gap-2">
              <AlertCircle size={16} /> Weak topics to revisit
            </h4>
            <div className="flex flex-wrap gap-2">
              {weakTopicsList.map(m => (
                <span key={m.topic} className="px-3 py-1 bg-white border border-rose-200 text-rose-800 rounded-full text-xs font-bold">
                  {m.topic} &middot; {m.masteryScore}%
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Recent Quiz Scores ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <h3 className="text-2xl font-bold text-on-surface">Recent Quiz Scores</h3>
          <button onClick={() => setView('library')} className="text-sm font-bold text-primary hover:underline">View All &rarr;</button>
        </div>

        {quizHistory.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quizHistory.slice(0, 6).map((q) => {
              const passed = q.percentage >= 70;
              return (
                <div key={q.id} className="bg-white border border-surface-container rounded-2xl p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-bold text-on-surface text-sm leading-snug line-clamp-2 pr-2">{q.topic}</h4>
                    <span className={`shrink-0 text-2xl font-black ${passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {q.percentage}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-bold text-on-surface-variant">
                    <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(q.date).toLocaleDateString()}</span>
                    <span>{q.score}/{q.totalQuestions} correct</span>
                  </div>
                  <div className="w-full bg-surface-container h-1 rounded-full overflow-hidden mt-3">
                    <div className={`h-full ${passed ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${q.percentage}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-dashed border-surface-container rounded-[32px] p-12 flex flex-col items-center text-center">
            <Inbox size={32} className="text-on-surface-variant/30 mb-3" />
            <h4 className="text-lg font-bold text-on-surface mb-1">No Quiz Data Yet</h4>
            <p className="text-on-surface-variant font-medium text-sm max-w-sm mb-6">Start a quiz to see your scores and track improvement over time.</p>
            <button
              onClick={() => setView('dashboard')}
              className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-xs uppercase tracking-widest"
            >
              Take a Quiz
            </button>
          </div>
        )}
      </div>

      {/* ─── Weekly Report Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {showReport && weeklyReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setShowReport(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                  <BarChart2 size={20} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-on-surface">Weekly Learning Report</h3>
                  <p className="text-xs text-on-surface-variant font-medium">
                    {fmtDate(weeklyReport.weekStart)} &ndash; {fmtDate(weeklyReport.weekEnd)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 mb-1">Total Actions</p>
                  <p className="text-2xl font-black text-blue-700">{weeklyReport.totalActions}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-1">XP Gained</p>
                  <p className="text-2xl font-black text-emerald-700">+{weeklyReport.xpGained}</p>
                </div>
                <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-violet-500 mb-1">Quizzes</p>
                  <p className="text-2xl font-black text-violet-700">{weeklyReport.quizzesCompleted}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-1">Avg Score</p>
                  <p className="text-2xl font-black text-amber-700">{weeklyReport.averageQuizScore > 0 ? `${weeklyReport.averageQuizScore}%` : '—'}</p>
                </div>
              </div>

              {(weeklyReport.strongestChapter || weeklyReport.weakestChapter) && (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {weeklyReport.strongestChapter && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-1">Strongest</p>
                      <p className="text-sm font-bold text-emerald-800 line-clamp-2">{weeklyReport.strongestChapter}</p>
                    </div>
                  )}
                  {weeklyReport.weakestChapter && (
                    <div className="bg-rose-50 border border-rose-100 rounded-xl p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 mb-1">Weakest</p>
                      <p className="text-sm font-bold text-rose-800 line-clamp-2">{weeklyReport.weakestChapter}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="mb-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">Recommendations</p>
                <ul className="space-y-2">
                  {weeklyReport.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-on-surface font-medium">
                      <ArrowRight size={14} className="text-primary shrink-0 mt-0.5" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => setShowReport(false)}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:brightness-110"
              >
                Close Report
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
