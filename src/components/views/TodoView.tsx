/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * TodoView — daily revision tasks generated from quiz performance.
 * Tasks come from learningService and are grouped by due date.
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2, Circle, Clock, Trash2, Calendar, Zap,
  BookOpen, RotateCcw, Sparkles, Inbox, AlertCircle, Lock, ChevronRight, Crown, Youtube,
} from 'lucide-react';
import { TopBar } from '../common/TopBar';
import { DailyTask, TaskActionType, PlanType } from '../../types';
import {
  getDailyTasks, setTaskStatus, deleteTask, onLearningChange,
  getRevisionStatus, RevisionStatus,
} from '../../services/learningService';

function urgencyPillStyle(s: RevisionStatus): string {
  if (s === 'overdue')   return 'bg-rose-100 text-rose-800 border-rose-200';
  if (s === 'due-today') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-primary/10 text-primary border-primary/20';
}
function urgencyPillLabel(s: RevisionStatus): string {
  if (s === 'overdue')   return 'Overdue';
  if (s === 'due-today') return 'Due today';
  if (s === 'upcoming')  return 'This week';
  return 'Later';
}

// `Youtube` icon imported below in the lucide-react block
const ACTION_META: Record<TaskActionType, { label: string; icon: any; color: string }> = {
  revision:        { label: 'Start Revision',     icon: BookOpen,    color: 'bg-primary text-white' },
  retest:          { label: 'Retest',             icon: Zap,         color: 'bg-amber-600 text-white' },
  'mistake-review':{ label: 'Review Mistakes',    icon: AlertCircle, color: 'bg-rose-600 text-white' },
  flashcards:      { label: 'Open Flashcards',    icon: Sparkles,    color: 'bg-indigo-600 text-white' },
  'youtube-quiz':  { label: 'YouTube Recall Quiz',icon: Youtube,     color: 'bg-rose-500 text-white' },
};

function groupByDate(tasks: DailyTask[]): { date: string; items: DailyTask[] }[] {
  const map = new Map<string, DailyTask[]>();
  tasks.forEach(t => {
    if (!map.has(t.dueDate)) map.set(t.dueDate, []);
    map.get(t.dueDate)!.push(t);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }));
}

function relativeLabel(dateISO: string): string {
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(dateISO); due.setHours(0,0,0,0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 0)   return `${Math.abs(diffDays)}d ago`;
  return `In ${diffDays} days`;
}

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

function planMeetsRequirement(current: PlanType, required?: PlanType): boolean {
  if (!required || required === 'free') return true;
  if (required === 'plus') return current === 'plus' || current === 'pro';
  if (required === 'pro')  return current === 'pro';
  return true;
}

export const TodoView = ({ setView, openFlashcards, openMistakesForTopic, openMonthlyPlanner, isPremium, planType = 'free', showPaywall }: TodoViewProps) => {
  const [tasks, setTasks] = useState<DailyTask[]>([]);

  useEffect(() => {
    const refresh = () => setTasks(getDailyTasks());
    refresh();
    return onLearningChange(refresh);
  }, []);

  const handleAction = (task: DailyTask) => {
    // Plan gate — Plus/Pro tasks pop the paywall for Free users.
    if (!planMeetsRequirement(planType, task.planRequired) && showPaywall) {
      const isPro = task.planRequired === 'pro';
      showPaywall({
        title: isPro ? 'Unlock advanced mastery tracking' : 'Unlock spaced revision reminders',
        description: isPro
          ? 'Klaro can estimate what you know, what you are forgetting, and when to revise next.'
          : 'Klaro plans your revisions at Day 3, 7, 14, and 30 to flatten the forgetting curve.',
        ctaLabel: isPro ? 'Upgrade to Pro' : 'Upgrade to Plus',
        requiredPlan: isPro ? 'pro' : 'plus',
        benefits: isPro
          ? ['Bayesian mastery tracking', 'Monthly revision planner', 'Mastery map', 'Personalized study roadmap']
          : ['Day 3 / 7 / 14 / 30 revision reminders', 'Unlimited flashcards', 'YouTube companion quick quiz', 'Mistake slideshow'],
      });
      return;
    }
    switch (task.actionType) {
      case 'retest':
        setView('practice');
        break;
      case 'mistake-review':
        if (openMistakesForTopic) openMistakesForTopic(task.topic);
        else setView('mistakes');
        break;
      case 'flashcards':
        if (openFlashcards) openFlashcards(task.topic, task.sourceKitId);
        else setView('library');
        break;
      case 'youtube-quiz':
        setView('youtube-study');
        break;
      case 'revision':
      default:
        if (task.modeUsed && ['aural', 'visual', 'readwrite'].includes(task.modeUsed)) {
          setView(task.modeUsed);
        } else {
          setView('library');
        }
        break;
    }
  };

  const grouped = groupByDate(tasks);

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8 max-w-4xl mx-auto pb-20">
      <TopBar title="Daily Tasks" subtitle="Personalized revision plan, generated from your quiz performance." />

      {/* Monthly Planner Pro — locked for free users, opens directly for premium */}
      <button
        onClick={() => openMonthlyPlanner?.()}
        className="w-full text-left bg-gradient-to-br from-amber-50 via-white to-indigo-50 border border-amber-200 rounded-[24px] p-6 hover:shadow-md transition-all group flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          {isPremium ? <Calendar size={22} /> : <Lock size={22} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base font-black text-on-surface">Monthly Revision Planner</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-widest">
              {isPremium ? 'Unlocked' : 'Pro'}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
            {isPremium
              ? 'Open your spaced revision calendar and monthly weak-topic roadmap.'
              : 'Unlock monthly calendar, spaced repetition schedule, and exam countdown plan.'}
          </p>
        </div>
        <ChevronRight size={20} className="text-on-surface-variant group-hover:text-primary shrink-0" />
      </button>

      {tasks.length === 0 ? (
        <div className="bg-white border border-dashed border-surface-container rounded-[32px] p-16 text-center">
          <Inbox size={36} className="text-on-surface-variant/40 mx-auto mb-4" />
          <h3 className="text-xl font-black text-on-surface mb-2">No tasks yet</h3>
          <p className="text-on-surface-variant font-medium mb-6 max-w-sm mx-auto">
            Complete a hub quiz and we'll create a day-by-day revision plan based on what you missed.
          </p>
          <button
            onClick={() => setView('dashboard')}
            className="px-8 py-3 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest"
          >
            Start Learning
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ date, items }) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-lg">
                  <Calendar size={14} />
                  <span className="text-[11px] font-black uppercase tracking-widest">{relativeLabel(date)}</span>
                </div>
                <span className="text-xs font-bold text-on-surface-variant">
                  {new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className="space-y-3">
                {items.map(task => {
                  const meta = ACTION_META[task.actionType];
                  const ActionIcon = meta.icon;
                  const rs = getRevisionStatus(task.dueDate);
                  return (
                    <div
                      key={task.id}
                      className={`flex flex-col md:flex-row items-start md:items-center gap-4 p-5 rounded-2xl border transition-all ${
                        task.status === 'completed'
                          ? 'bg-surface-container-low border-surface-container opacity-60'
                          : 'bg-white border-surface-container hover:border-primary/30 shadow-sm'
                      }`}
                    >
                      <button
                        onClick={() => setTaskStatus(task.id, task.status === 'completed' ? 'pending' : 'completed')}
                        className="shrink-0"
                        aria-label="Toggle task"
                      >
                        {task.status === 'completed'
                          ? <CheckCircle2 className="text-teal-500" size={26} />
                          : <Circle className="text-surface-container-high" size={26} />
                        }
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className={`font-bold ${task.status === 'completed' ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                            {task.title}
                          </p>
                          {task.status !== 'completed' && (
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${urgencyPillStyle(rs)}`}>
                              {urgencyPillLabel(rs)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-on-surface-variant font-medium">
                          <span className="font-bold">Topic:</span> {task.topic} · {task.reason}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-xs font-bold text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-lg">
                        <Clock size={12} /> {task.estimatedMinutes} min
                      </div>

                      {task.status !== 'completed' && (() => {
                        const locked = !planMeetsRequirement(planType, task.planRequired);
                        if (locked) {
                          const isPro = task.planRequired === 'pro';
                          return (
                            <button
                              onClick={() => handleAction(task)}
                              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
                                isPro
                                  ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                  : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                              }`}
                              title={isPro ? 'Exam Pro feature' : 'Student Plus feature'}
                            >
                              {isPro ? <Crown size={14} /> : <Lock size={14} />}
                              {isPro ? 'Pro' : 'Plus'}
                            </button>
                          );
                        }
                        return (
                          <button
                            onClick={() => handleAction(task)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:brightness-110 transition-all ${meta.color}`}
                          >
                            <ActionIcon size={14} /> {meta.label}
                          </button>
                        );
                      })()}

                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-rose-400 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-lg transition-colors"
                        aria-label="Delete task"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default TodoView;
