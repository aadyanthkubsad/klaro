/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * TodoView — daily revision tasks grouped by chapter.
 * Redesigned with summary cards, tabs, chapter groups, and smart suggestions.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2, Circle, Clock, Trash2, Calendar, Zap,
  BookOpen, RotateCcw, Sparkles, Inbox, AlertCircle, Lock, ChevronRight, ChevronDown,
  Crown, Youtube, Target, BarChart, Flame, Info, Search, Brain,
} from 'lucide-react';
import { DailyTask, TaskActionType, PlanType } from '../../types';
import {
  getDailyTasks, setTaskStatus, deleteTask, onLearningChange,
  getRevisionStatus, RevisionStatus,
  getTaskStats, getTasksByChapter,
  computeScoreAnalysis, getMastery, getQuizHistory,
} from '../../services/learningService';
import {
  getStreak, getTotalXP,
} from '../../services/activityService';

// ─── helpers ──────────────────────────────────────────────────────────────

function urgencyPill(s: RevisionStatus): { cls: string; label: string } {
  if (s === 'overdue')   return { cls: 'bg-rose-100 text-rose-700 border-rose-200', label: 'Overdue' };
  if (s === 'due-today') return { cls: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Due Today' };
  if (s === 'upcoming')  return { cls: 'bg-blue-50 text-blue-700 border-blue-200', label: 'This Week' };
  return { cls: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Later' };
}

const ACTION_META: Record<TaskActionType, { label: string; icon: any; color: string }> = {
  revision:         { label: 'Start Revision',     icon: BookOpen,    color: 'bg-primary text-white' },
  retest:           { label: 'Retest',             icon: Zap,         color: 'bg-amber-600 text-white' },
  'mistake-review': { label: 'Review Mistakes',    icon: AlertCircle, color: 'bg-rose-600 text-white' },
  flashcards:       { label: 'Flashcards',         icon: Sparkles,    color: 'bg-indigo-600 text-white' },
  'youtube-quiz':   { label: 'YouTube Quiz',       icon: Youtube,     color: 'bg-rose-500 text-white' },
};

function planMeetsRequirement(current: PlanType, required?: PlanType): boolean {
  if (!required || required === 'free') return true;
  if (required === 'plus') return current === 'plus' || current === 'pro';
  if (required === 'pro')  return current === 'pro';
  return true;
}

type TabId = 'today' | 'this-week' | 'completed' | 'all';

// ─── props ────────────────────────────────────────────────────────────────

interface TodoViewProps {
  setView: (v: string) => void;
  library?: any;
  openFlashcards?: (topic: string, sourceKitId?: string) => void;
  openMistakesForTopic?: (topic: string) => void;
  openMonthlyPlanner?: () => void;
  isPremium?: boolean;
  planType?: PlanType;
  showPaywall?: (config: { title: string; description: string; ctaLabel: string; requiredPlan: 'plus' | 'pro'; benefits?: string[] }) => void;
}

// ─── component ────────────────────────────────────────────────────────────

export const TodoView = ({ setView, openFlashcards, openMistakesForTopic, openMonthlyPlanner, isPremium, planType = 'free', showPaywall }: TodoViewProps) => {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [tab, setTab] = useState<TabId>('today');
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    const refresh = () => setTasks(getDailyTasks());
    refresh();
    return onLearningChange(refresh);
  }, []);

  // ── derived data ────────────────────────────────────────────────────
  const stats = useMemo(() => getTaskStats(), [tasks]);
  const streakInfo = useMemo(() => getStreak(), [tasks]);
  const streak = streakInfo.current;
  const totalXP = useMemo(() => getTotalXP(), [tasks]);
  const scoreAnalysis = useMemo(() => computeScoreAnalysis(), [tasks]);
  const mastery = useMemo(() => getMastery(), [tasks]);
  const quizHistory = useMemo(() => getQuizHistory(), [tasks]);

  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    let result = tasks;
    if (tab === 'today') result = result.filter(t => t.status === 'pending' && t.dueDate.slice(0, 10) <= today);
    else if (tab === 'this-week') result = result.filter(t => t.status === 'pending' && t.dueDate.slice(0, 10) <= weekEnd);
    else if (tab === 'completed') result = result.filter(t => t.status === 'completed');
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t => t.title.toLowerCase().includes(q) || t.topic.toLowerCase().includes(q) || (t.chapter || '').toLowerCase().includes(q));
    }
    return result.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [tasks, tab, search, today, weekEnd]);

  const chapterGroups = useMemo(() => getTasksByChapter(filtered), [filtered]);

  const toggleChapter = (ch: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  };

  // Auto-expand first group
  useEffect(() => {
    const keys = Array.from(chapterGroups.keys());
    if (keys.length > 0 && expandedChapters.size === 0) {
      setExpandedChapters(new Set([keys[0]]));
    }
  }, [chapterGroups]);

  const handleAction = (task: DailyTask) => {
    if (!planMeetsRequirement(planType, task.planRequired) && showPaywall) {
      const isPro = task.planRequired === 'pro';
      showPaywall({
        title: isPro ? 'Unlock advanced mastery tracking' : 'Unlock spaced revision reminders',
        description: isPro
          ? 'Lumina can estimate what you know, what you are forgetting, and when to revise next.'
          : 'Lumina plans your revisions at Day 3, 7, 14, and 30 to flatten the forgetting curve.',
        ctaLabel: isPro ? 'Upgrade to Pro' : 'Upgrade to Plus',
        requiredPlan: isPro ? 'pro' : 'plus',
        benefits: isPro
          ? ['Bayesian mastery tracking', 'Monthly revision planner', 'Mastery map', 'Personalized study roadmap']
          : ['Day 3 / 7 / 14 / 30 revision reminders', 'Unlimited flashcards', 'YouTube companion quick quiz', 'Mistake slideshow'],
      });
      return;
    }
    switch (task.actionType) {
      case 'retest': setView('practice'); break;
      case 'mistake-review':
        if (openMistakesForTopic) openMistakesForTopic(task.topic); else setView('mistakes');
        break;
      case 'flashcards':
        if (openFlashcards) openFlashcards(task.topic, task.sourceKitId); else setView('library');
        break;
      case 'youtube-quiz': setView('youtube-study'); break;
      case 'revision': default:
        if (task.modeUsed && ['aural', 'visual', 'readwrite'].includes(task.modeUsed)) setView(task.modeUsed);
        else setView('library');
        break;
    }
  };

  // ── smart suggestions ───────────────────────────────────────────────
  const suggestions = useMemo(() => {
    const tips: { icon: any; title: string; desc: string; action: string; onClick: () => void }[] = [];
    const weakTopics = scoreAnalysis?.weakTopics || [];
    if (weakTopics.length > 0) {
      tips.push({
        icon: Target, title: `Focus on ${weakTopics[0].topic}`,
        desc: `You missed questions in this topic. Review now to improve accuracy.`,
        action: 'Review Now', onClick: () => { if (openMistakesForTopic) openMistakesForTopic(weakTopics[0].topic); else setView('mistakes'); },
      });
    }
    if (stats.todayCount > 3) {
      tips.push({
        icon: Clock, title: 'Short on time?',
        desc: 'Try a 10-min quiz on your weak topics.',
        action: 'Take Quick Quiz', onClick: () => setView('practice'),
      });
    }
    if (streak > 0) {
      tips.push({
        icon: Flame, title: 'Keep your streak alive!',
        desc: `Complete ${Math.max(1, Math.min(3, stats.todayCount))} more task${stats.todayCount > 1 ? 's' : ''} today to keep your ${streak}-day streak.`,
        action: 'Continue', onClick: () => {},
      });
    }
    if (tips.length === 0) {
      tips.push({
        icon: Sparkles, title: 'Start studying!',
        desc: 'Pick a chapter from the Library to generate your first revision tasks.',
        action: 'Go to Library', onClick: () => setView('library'),
      });
    }
    return tips.slice(0, 3);
  }, [scoreAnalysis, stats, streak]);

  // ── revision memory stats ───────────────────────────────────────────
  const revisionMemory = useMemo(() => {
    const topicsStudied = new Set(quizHistory.map(q => q.topic)).size;
    const avgAccuracy = quizHistory.length > 0 ? Math.round(quizHistory.reduce((s, q) => s + q.percentage, 0) / quizHistory.length) : 0;
    const weakCount = mastery.filter(m => m.forgettingRisk === 'High').length;
    return { quizzesTaken: quizHistory.length, topicsStudied, weakTopics: weakCount, avgAccuracy };
  }, [quizHistory, mastery]);

  // ─── render ─────────────────────────────────────────────────────────

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-20">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-on-surface tracking-tight">Daily Tasks</h2>
          <p className="text-sm text-on-surface-variant font-medium mt-0.5">
            Your revision plan <span className="underline decoration-primary/40 underline-offset-2 font-bold">stays saved</span> and updates as you learn.
          </p>
        </div>
        <div className="relative w-full md:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search topics, tasks..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-surface-container-high rounded-xl bg-white focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
          />
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { icon: CheckCircle2, label: "Today's Tasks", value: stats.todayCount, color: 'text-primary', bg: 'bg-primary/10' },
          { icon: Calendar, label: 'Upcoming', value: stats.upcomingCount, color: 'text-blue-600', bg: 'bg-blue-50' },
          { icon: Target, label: 'Completed', value: stats.completedCount, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { icon: Flame, label: 'Streak', value: `${streak} day${streak !== 1 ? 's' : ''}`, color: 'text-amber-600', bg: 'bg-amber-50' },
          { icon: Zap, label: 'XP Earned', value: totalXP, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white border border-surface-container-high rounded-2xl p-4 card-shadow">
              <div className={`w-8 h-8 ${card.bg} rounded-lg flex items-center justify-center mb-2`}>
                <Icon size={16} className={card.color} />
              </div>
              <p className="text-2xl font-black text-on-surface">{card.value}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{card.label}</p>
            </div>
          );
        })}
      </div>

      {/* ── Info + Planner row ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
          <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-900">Saved from your latest learning sessions</p>
            <p className="text-xs text-blue-700 mt-0.5">Tasks remain saved even after refresh. New learnings are added automatically.</p>
          </div>
        </div>
        <button
          onClick={() => openMonthlyPlanner?.()}
          className="flex items-center gap-3 p-4 bg-gradient-to-r from-amber-50 to-white border border-amber-200 rounded-2xl hover:shadow-md transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            {isPremium ? <Calendar size={18} /> : <Lock size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-on-surface">Monthly Revision Planner</p>
            <p className="text-[10px] text-on-surface-variant font-medium">Plan your month, stay consistent, ace your exams.</p>
          </div>
          <span className="text-xs font-black text-amber-700 group-hover:translate-x-0.5 transition-transform">Open Planner &rarr;</span>
        </button>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-surface-container">
        {([
          { id: 'today', label: 'Today', count: stats.todayCount },
          { id: 'this-week', label: 'This Week', count: stats.todayCount + stats.upcomingCount },
          { id: 'completed', label: 'Completed', count: stats.completedCount },
          { id: 'all', label: 'All Tasks' },
        ] as { id: TabId; label: string; count?: number }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-bold transition-all border-b-2 -mb-[1px] ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-primary/10' : 'bg-surface-container'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Main grid: tasks + sidebar ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── Left: task groups ─────────────────────────────── */}
        <div className="lg:col-span-8 space-y-4">
          {filtered.length === 0 ? (
            <div className="bg-white border border-dashed border-surface-container rounded-2xl p-12 text-center">
              <Inbox size={32} className="text-on-surface-variant/30 mx-auto mb-3" />
              <h3 className="text-lg font-black text-on-surface mb-1">
                {tab === 'completed' ? 'No completed tasks yet' : 'No tasks here'}
              </h3>
              <p className="text-sm text-on-surface-variant font-medium mb-4 max-w-sm mx-auto">
                {tab === 'completed'
                  ? 'Complete tasks from the Today tab to see them here.'
                  : 'Complete a hub quiz and Lumina will create a revision plan based on what you missed.'}
              </p>
              {tab !== 'completed' && (
                <button onClick={() => setView('dashboard')} className="px-6 py-2.5 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest">
                  Start Learning
                </button>
              )}
            </div>
          ) : (
            Array.from(chapterGroups.entries()).map(([chapter, chapterTasks]) => {
              const isExpanded = expandedChapters.has(chapter);
              const completed = chapterTasks.filter(t => t.status === 'completed').length;
              const total = chapterTasks.length;
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
              const totalMinutes = chapterTasks.filter(t => t.status === 'pending').reduce((s, t) => s + t.estimatedMinutes, 0);
              const hasOverdue = chapterTasks.some(t => t.status === 'pending' && t.dueDate.slice(0, 10) < today);

              return (
                <div key={chapter} className={`bg-white border rounded-2xl card-shadow overflow-hidden ${hasOverdue ? 'border-rose-200' : 'border-surface-container-high'}`}>
                  {/* Group header */}
                  <button
                    onClick={() => toggleChapter(chapter)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface-container-lowest/50 transition-colors"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${hasOverdue ? 'bg-rose-50 text-rose-600' : 'bg-primary/10 text-primary'}`}>
                      <BookOpen size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-black text-on-surface truncate">{chapter}</h3>
                        <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full shrink-0">
                          {total} task{total !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden max-w-[120px]">
                          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-on-surface-variant">{pct}%</span>
                        {totalMinutes > 0 && (
                          <span className="text-[10px] font-bold text-on-surface-variant flex items-center gap-1">
                            <Clock size={10} /> ~{totalMinutes} min
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronDown size={18} className={`text-on-surface-variant shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Task rows */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-surface-container">
                          {chapterTasks.map(task => {
                            const meta = ACTION_META[task.actionType];
                            const ActionIcon = meta.icon;
                            const rs = getRevisionStatus(task.dueDate);
                            const pill = urgencyPill(rs);
                            const locked = !planMeetsRequirement(planType, task.planRequired);

                            return (
                              <div
                                key={task.id}
                                className={`flex items-center gap-3 px-4 py-3 border-b border-surface-container last:border-b-0 transition-all ${
                                  task.status === 'completed' ? 'opacity-50 bg-surface-container-lowest/30' : rs === 'overdue' ? 'bg-rose-50/30' : 'hover:bg-surface-container-lowest/50'
                                }`}
                              >
                                <button
                                  onClick={() => setTaskStatus(task.id, task.status === 'completed' ? 'pending' : 'completed')}
                                  className="shrink-0"
                                >
                                  {task.status === 'completed'
                                    ? <CheckCircle2 size={20} className="text-emerald-500" />
                                    : <Circle size={20} className="text-surface-container-high" />
                                  }
                                </button>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className={`text-sm font-bold ${task.status === 'completed' ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                                      {task.title}
                                    </p>
                                    {task.status !== 'completed' && (
                                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${pill.cls}`}>
                                        {pill.label}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-on-surface-variant font-medium mt-0.5 truncate">{task.reason}</p>
                                </div>

                                <span className="text-[10px] font-bold text-on-surface-variant flex items-center gap-1 shrink-0">
                                  <Clock size={10} /> {task.estimatedMinutes}m
                                </span>

                                {task.status !== 'completed' && (
                                  locked ? (
                                    <button
                                      onClick={() => handleAction(task)}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200 transition-all shrink-0"
                                    >
                                      <Lock size={10} /> {task.planRequired === 'pro' ? 'Pro' : 'Plus'}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleAction(task)}
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all shrink-0 ${meta.color}`}
                                    >
                                      <ActionIcon size={10} /> {meta.label}
                                    </button>
                                  )
                                )}

                                <button
                                  onClick={() => deleteTask(task.id)}
                                  className="text-gray-300 hover:text-rose-500 p-1 rounded transition-colors shrink-0"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

        {/* ── Right sidebar ────────────────────────────────── */}
        <div className="lg:col-span-4 space-y-5 hidden lg:block">
          {/* Smart Suggestions */}
          <div className="bg-white border border-surface-container-high rounded-2xl p-5 card-shadow">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={16} className="text-amber-500" />
              <h4 className="text-sm font-black text-on-surface">Smart Suggestions</h4>
            </div>
            <div className="space-y-3">
              {suggestions.map((tip, i) => {
                const TipIcon = tip.icon;
                return (
                  <div key={i} className="p-3 bg-surface-container-lowest rounded-xl border border-surface-container">
                    <div className="flex items-start gap-2.5">
                      <TipIcon size={16} className="text-primary shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-on-surface">{tip.title}</p>
                        <p className="text-[10px] text-on-surface-variant mt-0.5 leading-relaxed">{tip.desc}</p>
                        {tip.action !== 'Continue' && (
                          <button
                            onClick={tip.onClick}
                            className="mt-2 px-3 py-1 text-[10px] font-black text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
                          >
                            {tip.action}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Revision Memory */}
          <div className="bg-white border border-surface-container-high rounded-2xl p-5 card-shadow">
            <div className="flex items-center gap-2 mb-4">
              <Brain size={16} className="text-indigo-600" />
              <h4 className="text-sm font-black text-on-surface">Revision Memory</h4>
              <span className="text-[9px] font-bold text-on-surface-variant ml-auto">From your activity</span>
            </div>
            <div className="space-y-3">
              {[
                { icon: BarChart, label: 'Quizzes Taken', value: revisionMemory.quizzesTaken, color: 'text-blue-600' },
                { icon: BookOpen, label: 'Topics Studied', value: revisionMemory.topicsStudied, color: 'text-indigo-600' },
                { icon: AlertCircle, label: 'Weak Topics', value: revisionMemory.weakTopics, color: 'text-rose-500' },
                { icon: Target, label: 'Avg. Accuracy', value: `${revisionMemory.avgAccuracy}%`, color: 'text-emerald-600' },
              ].map(stat => {
                const StatIcon = stat.icon;
                return (
                  <div key={stat.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatIcon size={14} className={stat.color} />
                      <span className="text-xs font-medium text-on-surface-variant">{stat.label}</span>
                    </div>
                    <span className="text-sm font-black text-on-surface">{stat.value}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Motivational */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
            <div className="flex items-start gap-2">
              <Flame size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-900">Consistency is your superpower.</p>
                <p className="text-[10px] text-amber-700 mt-0.5">A little every day leads to big results.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default TodoView;
