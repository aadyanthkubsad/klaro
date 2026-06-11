/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MonthlyPlannerView — Exam Pro feature.
 *
 * Draws a month-grid calendar with revision events (blue) and test/exam
 * events (red with icon). Right-side panel lists upcoming deadlines, the
 * next test, and recommended revision focus topics.
 *
 * Data comes from the real learning loop via getPlannerEvents() — daily
 * tasks (Ebbinghaus-scheduled), mastery.nextRevisionDate (forgetting curve),
 * and user-added exam dates. No fake/demo data is rendered.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeft, ChevronRight, Trophy, FileText, AlertCircle, Sparkles,
  CalendarDays, BookOpen, Target,
} from 'lucide-react';
import { PlannerEvent } from '../../types';
import {
  getPlannerEvents, onLearningChange, getMastery, getMistakes,
} from '../../services/learningService';

interface MonthlyPlannerViewProps {
  setView: (v: string) => void;
  openFlashcards?: (topic: string, sourceKitId?: string) => void;
  openMistakesForTopic?: (topic: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatShort(dateISO: string): string {
  const d = new Date(dateISO);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isTestLike(e: PlannerEvent): boolean {
  return e.type === 'test' || e.type === 'deadline';
}

export const MonthlyPlannerView = ({
  setView, openFlashcards, openMistakesForTopic,
}: MonthlyPlannerViewProps) => {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [events, setEvents] = useState<PlannerEvent[]>([]);
  const [recommendedFocus, setRecommendedFocus] = useState<string[]>([]);

  useEffect(() => {
    const refresh = () => {
      setEvents(getPlannerEvents());
      // Recommended focus = weakest mastered topics + most-missed mistake topics
      const mastery = getMastery();
      const weakest = [...mastery]
        .filter(m => m.status === 'Weak' || m.status === 'Improving')
        .sort((a, b) => a.masteryScore - b.masteryScore)
        .slice(0, 3)
        .map(m => m.topic);
      if (weakest.length < 3) {
        const counts = new Map<string, number>();
        getMistakes().forEach(m => {
          const t = m.topicTag || m.topic;
          counts.set(t, (counts.get(t) || 0) + 1);
        });
        const extras = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([t]) => t)
          .filter(t => !weakest.includes(t))
          .slice(0, 3 - weakest.length);
        weakest.push(...extras);
      }
      setRecommendedFocus(weakest);
    };
    refresh();
    return onLearningChange(refresh);
  }, []);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, PlannerEvent[]>();
    events.forEach(e => {
      const k = e.date;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    });
    return map;
  }, [events]);

  // Build calendar grid for the visible month (Sun→Sat)
  const monthName = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const firstWeekday = cursor.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: { day: number | null; dateISO?: string }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(cursor.getFullYear(), cursor.getMonth(), d);
    cells.push({ day: d, dateISO: fmtDate(dt) });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null });

  const todayISO = fmtDate(new Date());

  const goPrev = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  const goNext = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1));

  // Right-panel derived data
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcomingDeadlines = useMemo(() => {
    return events
      .filter(e => e.type === 'deadline' && new Date(e.date) >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [events]);

  const nextTest = useMemo(() => {
    return events
      .filter(e => e.type === 'test' && new Date(e.date) >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
  }, [events]);

  const handleEventClick = (e: PlannerEvent) => {
    if (e.type === 'test' || e.type === 'deadline') {
      setView('practice');
      return;
    }
    // Revision event — open flashcards if we have a source, else mistakes for the topic
    if (e.topic && openFlashcards) {
      openFlashcards(e.topic, e.sourceKitId);
    } else if (e.topic && openMistakesForTopic) {
      openMistakesForTopic(e.topic);
    } else {
      setView('todo');
    }
  };

  const hasAnyData = events.length > 0 || recommendedFocus.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="px-6 md:px-10 pb-20"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <CalendarDays size={22} />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-on-surface">
              Monthly Study Planner
            </h2>
            <p className="text-xs text-on-surface-variant font-medium">
              Spaced revision, weak-topic retests and exam dates — all in one calendar.
            </p>
          </div>
        </div>
        <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
          <Sparkles size={12} /> Exam Pro
        </span>
      </div>

      {!hasAnyData ? (
        <div className="bg-white border border-dashed border-surface-container rounded-[32px] p-16 text-center max-w-3xl mx-auto">
          <CalendarDays size={36} className="text-on-surface-variant/40 mx-auto mb-4" />
          <h3 className="text-xl font-black text-on-surface mb-2">No monthly plan yet</h3>
          <p className="text-on-surface-variant font-medium mb-6 max-w-md mx-auto">
            Complete quizzes or add exam dates to generate your planner. We will
            schedule revisions automatically using the Ebbinghaus forgetting curve.
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setView('dashboard')}
              className="px-6 py-3 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest"
            >
              Start a Quiz
            </button>
            <button
              onClick={() => setView('todo')}
              className="px-6 py-3 border border-surface-container text-on-surface rounded-xl font-bold text-xs"
            >
              Open Daily Tasks
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Calendar card */}
          <div className="bg-white border border-surface-container rounded-2xl overflow-hidden">
            {/* Month nav */}
            <div className="flex items-center justify-between px-5 py-4 bg-primary/5 border-b border-surface-container">
              <button
                onClick={goPrev}
                aria-label="Previous month"
                className="w-9 h-9 rounded-full bg-white border border-surface-container flex items-center justify-center hover:border-primary/40"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="font-black text-lg text-on-surface tracking-tight">
                {monthName}
              </div>
              <button
                onClick={goNext}
                aria-label="Next month"
                className="w-9 h-9 rounded-full bg-white border border-surface-container flex items-center justify-center hover:border-primary/40"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 bg-primary/5 border-b border-surface-container text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              {WEEKDAYS.map(w => (
                <div key={w} className="px-2 py-2 text-left">{w}</div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7">
              {cells.map((c, i) => {
                if (c.day === null) {
                  return <div key={i} className="min-h-[96px] border-r border-b border-surface-container/60 bg-surface-container-lowest" />;
                }
                const dayEvents = c.dateISO ? (eventsByDay.get(c.dateISO) || []) : [];
                const isToday = c.dateISO === todayISO;
                const isLastCol = (i % 7) === 6;
                return (
                  <div
                    key={i}
                    className={`min-h-[96px] p-1.5 ${isLastCol ? '' : 'border-r'} border-b border-surface-container/60 flex flex-col gap-1 ${
                      isToday ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className={`text-[11px] font-bold ${
                      isToday ? 'text-primary' : 'text-on-surface-variant'
                    }`}>
                      {c.day}
                    </div>
                    <div className="flex flex-col gap-1">
                      {dayEvents.slice(0, 3).map(e => {
                        const test = isTestLike(e);
                        return (
                          <button
                            key={e.id}
                            onClick={() => handleEventClick(e)}
                            title={`${e.title}${e.subject ? ' — ' + e.subject : ''}`}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold truncate text-left ${
                              test
                                ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                                : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                            }`}
                          >
                            {test && <Trophy size={10} className="shrink-0" />}
                            <span className="truncate">{e.title}</span>
                          </button>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <span className="text-[9px] font-bold text-on-surface-variant px-1">
                          +{dayEvents.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 px-5 py-3 border-t border-surface-container bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Blue: Revision
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Red with icon: Test / Exam
              </span>
            </div>
          </div>

          {/* Right side panel */}
          <aside className="space-y-4">
            {/* Upcoming Deadlines */}
            <div className="bg-white border border-surface-container rounded-2xl p-5">
              <h3 className="text-sm font-black text-on-surface mb-3 flex items-center gap-2">
                <AlertCircle size={16} className="text-primary" /> Upcoming Deadlines
              </h3>
              {upcomingDeadlines.length === 0 ? (
                <p className="text-xs text-on-surface-variant font-medium">
                  No deadlines yet — add a project or assignment date to see it here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {upcomingDeadlines.map(d => (
                    <li
                      key={d.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 text-blue-800 text-xs font-bold"
                    >
                      <FileText size={12} className="shrink-0" />
                      <span className="truncate">{formatShort(d.date)}: {d.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Next Test */}
            <div className="bg-white border border-surface-container rounded-2xl p-5">
              <h3 className="text-sm font-black text-on-surface mb-3 flex items-center gap-2">
                <Trophy size={16} className="text-rose-500" /> Next Test
              </h3>
              {!nextTest ? (
                <p className="text-xs text-on-surface-variant font-medium">
                  No tests scheduled. Add an exam date to start the countdown.
                </p>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-100 text-rose-800 text-xs font-bold">
                  <Trophy size={12} className="shrink-0" />
                  <span className="truncate">{formatShort(nextTest.date)}: {nextTest.title}</span>
                </div>
              )}
            </div>

            {/* Recommended Revision Focus */}
            <div className="bg-white border border-surface-container rounded-2xl p-5">
              <h3 className="text-sm font-black text-on-surface mb-3 flex items-center gap-2">
                <Target size={16} className="text-emerald-600" /> Recommended Revision Focus
              </h3>
              {recommendedFocus.length === 0 ? (
                <p className="text-xs text-on-surface-variant font-medium">
                  Complete a few quizzes — we will surface your weakest topics here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {recommendedFocus.map(t => (
                    <li key={t}>
                      <button
                        onClick={() => openMistakesForTopic ? openMistakesForTopic(t) : setView('mistakes')}
                        className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold"
                      >
                        <BookOpen size={12} className="shrink-0" />
                        <span className="truncate">{t}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-[10px] text-on-surface-variant/60 text-center px-2">
              Revisions scheduled using the Ebbinghaus curve (Day 1 / 3 / 7 / 14 / 30).
            </p>
          </aside>
        </div>
      )}
    </motion.div>
  );
};
