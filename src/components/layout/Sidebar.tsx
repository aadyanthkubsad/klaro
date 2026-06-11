/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Home, Library, BarChart, PieChart, Target, AlertCircle, MessageSquare, Settings, Zap, User, CheckSquare, Sparkles, LogOut, ChevronUp, Trophy, Flame, Calendar, Star, X } from 'lucide-react';
import { BhuvionaLogoMark } from '../common/BhuvionaLogo';
import { motion, AnimatePresence } from 'motion/react';
import { UserStats } from '../../types';
import { AuthUser } from '../../contexts/AuthContext';
import { getStreak, getTotalXP, getActivitiesForDays, onActivityChange, StreakInfo, DayActivity } from '../../services/activityService';
import { getProfilePicture } from '../views/SettingsView';

// ── XP / Level config ──────────────────────────────────────────────────────────

const XP_PER_LEVEL = 200;

const LEVEL_TITLES: Record<number, string> = {
  1: 'Beginner',
  2: 'Learner',
  3: 'Scholar',
  4: 'Achiever',
  5: 'Expert',
  6: 'Master',
  7: 'Grandmaster',
};

const XP_RULES = [
  { action: 'Open a kit', xp: 20 },
  { action: 'Complete a quiz', xp: 30 },
  { action: 'Review mistakes', xp: 10 },
  { action: 'Use flashcards', xp: 15 },
  { action: 'Complete a daily task', xp: 10 },
  { action: 'Written answer practice', xp: 25 },
  { action: 'Weak-topic retest', xp: 30 },
];

function computeLevel(xp: number): number {
  return Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1);
}

function xpForNextLevel(xp: number): number {
  return computeLevel(xp) * XP_PER_LEVEL;
}

function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(level, 7)] || 'Legend';
}

// ── Component ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  currentView: string;
  setView: (v: string) => void;
  stats: UserStats;
  user?: AuthUser | null;
  onLogout?: () => void;
}

export const Sidebar = ({ currentView, setView, stats, user, onLogout }: SidebarProps) => {
  const [streak, setStreakState] = useState<StreakInfo>({ current: 0, longest: 0, lastActiveDate: '', isActiveToday: false });
  const [totalXP, setTotalXP] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [monthActivity, setMonthActivity] = useState<DayActivity[]>([]);
  const [profilePic, setProfilePic] = useState<string | null>(() => getProfilePicture());

  // Listen for profile picture changes from SettingsView
  useEffect(() => {
    const handler = () => setProfilePic(getProfilePicture());
    window.addEventListener('lumina:profile-pic-change', handler);
    return () => window.removeEventListener('lumina:profile-pic-change', handler);
  }, []);

  useEffect(() => {
    const refresh = () => {
      setStreakState(getStreak());
      setTotalXP(getTotalXP());
      setMonthActivity(getActivitiesForDays(30));
    };
    refresh();
    // Defer listener updates to avoid setState-during-render when another
    // component's effect dispatches lumina:activity-change synchronously.
    const deferredRefresh = () => { setTimeout(refresh, 0); };
    return onActivityChange(deferredRefresh);
  }, []);

  const level = computeLevel(totalXP);
  const nextLevelXP = xpForNextLevel(totalXP);
  const currentLevelXP = (level - 1) * XP_PER_LEVEL;
  const progressInLevel = totalXP - currentLevelXP;
  const xpNeeded = nextLevelXP - totalXP;

  const navItems = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'todo', label: 'Tasks', icon: CheckSquare },
    { id: 'library', label: 'Library', icon: Library },
    { id: 'analytics', label: 'Analytics', icon: BarChart },
    { id: 'progress', label: 'Progress', icon: PieChart },
    { id: 'practice', label: 'Practice', icon: Target },
    { id: 'mistakes', label: 'Mistakes', icon: AlertCircle },
    { id: 'doubt-solver', label: 'Lumina AI', icon: MessageSquare },
    { id: 'offers', label: 'Upgrade Plan', icon: Sparkles },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="fixed left-0 top-0 h-full flex-col py-6 bg-navy-dark w-64 border-r border-navy-hover z-50 hidden md:flex">
      <div className="px-6 mb-10 pb-6 border-b border-navy-hover">
        <div className="flex items-center gap-2.5">
          <BhuvionaLogoMark size={36} />
          <div className="flex flex-col gap-0.5">
            <h1 className="text-base font-black text-white tracking-tight leading-none">Lumina Learn</h1>
            <p className="text-[9px] font-bold uppercase tracking-widest leading-none" style={{ color: '#00BCD4' }}>by Bhuviona Technologies</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex items-center gap-4 px-8 py-3 rounded transition-all duration-200 ${
                isActive
                  ? 'bg-navy-hover text-white font-semibold border-r-4 border-primary'
                  : 'text-navy-muted hover:text-white hover:bg-navy-hover transition-colors'
              }`}
            >
              <Icon size={18} className={isActive ? "opacity-100" : "opacity-60"} />
              <span className="text-sm">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Streak / XP panel (clickable → expands) ── */}
      <div className="px-6 mb-8 mt-auto">
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="w-full text-left p-5 rounded-[24px] bg-navy-hover border border-white/5 space-y-4 hover:border-white/10 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-amber-400 fill-amber-400" />
              <span className="text-xs font-black text-white">{streak.current} Day Streak</span>
            </div>
            <div className="text-[9px] font-black text-primary px-2 py-0.5 bg-primary/20 rounded">LVL {level}</div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[9px] font-bold text-navy-muted uppercase tracking-wider">
              <span>XP Progress</span>
              <span className="text-white">{totalXP} / {nextLevelXP}</span>
            </div>
            <div className="h-1.5 bg-navy-dark rounded-full overflow-hidden border border-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(progressInLevel / XP_PER_LEVEL) * 100}%` }}
                className="h-full bg-primary shadow-[0_0_8px_rgba(37,99,235,0.4)]"
              />
            </div>
          </div>
          <div className="flex items-center justify-center gap-1 text-[9px] text-navy-muted font-bold">
            <ChevronUp size={10} className={`transition-transform ${expanded ? '' : 'rotate-180'}`} />
            {expanded ? 'Hide details' : 'Tap for details'}
          </div>
        </button>

        {/* ── Expandable details panel ── */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mt-2 p-4 rounded-[20px] bg-navy-hover border border-white/5 space-y-5">

                {/* Streak summary */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-navy-dark rounded-xl p-3 text-center">
                    <Flame size={14} className="text-orange-400 mx-auto mb-1" />
                    <p className="text-lg font-black text-white">{streak.current}</p>
                    <p className="text-[8px] font-bold text-navy-muted uppercase tracking-widest">Current</p>
                  </div>
                  <div className="bg-navy-dark rounded-xl p-3 text-center">
                    <Trophy size={14} className="text-amber-400 mx-auto mb-1" />
                    <p className="text-lg font-black text-white">{streak.longest}</p>
                    <p className="text-[8px] font-bold text-navy-muted uppercase tracking-widest">Best</p>
                  </div>
                </div>

                {/* Level & title */}
                <div className="bg-navy-dark rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black text-navy-muted uppercase tracking-widest">Level {level}</span>
                    <span className="text-[9px] font-black text-primary uppercase tracking-widest">{levelTitle(level)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-navy-muted font-bold">
                    <span>{xpNeeded} XP to next level</span>
                    <span className="text-white">{levelTitle(level + 1)}</span>
                  </div>
                </div>

                {/* XP breakdown */}
                <div>
                  <p className="text-[8px] font-black text-navy-muted uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Star size={10} /> How you earn XP
                  </p>
                  <div className="space-y-1">
                    {XP_RULES.map(r => (
                      <div key={r.action} className="flex items-center justify-between text-[10px]">
                        <span className="text-navy-muted font-medium">{r.action}</span>
                        <span className="text-emerald-400 font-black">+{r.xp}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Level milestones */}
                <div>
                  <p className="text-[8px] font-black text-navy-muted uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Trophy size={10} /> Milestones
                  </p>
                  <div className="space-y-1">
                    {Object.entries(LEVEL_TITLES).map(([lvl, title]) => {
                      const lvlNum = parseInt(lvl);
                      const reached = level >= lvlNum;
                      return (
                        <div key={lvl} className="flex items-center justify-between text-[10px]">
                          <span className={`font-medium ${reached ? 'text-white' : 'text-navy-muted'}`}>
                            {reached ? '✓' : '○'} LVL {lvl} — {title}
                          </span>
                          <span className="text-navy-muted font-bold">{(lvlNum - 1) * XP_PER_LEVEL} XP</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mini calendar heatmap (30 days) */}
                <div>
                  <p className="text-[8px] font-black text-navy-muted uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Calendar size={10} /> Active days this month
                  </p>
                  <div className="grid grid-cols-7 gap-1">
                    {monthActivity.map(d => {
                      const intensity = d.count === 0 ? 0 : d.count <= 2 ? 1 : d.count <= 5 ? 2 : 3;
                      const colors = [
                        'bg-navy-dark',
                        'bg-primary/30',
                        'bg-primary/60',
                        'bg-primary',
                      ];
                      return (
                        <div
                          key={d.date}
                          className={`w-full aspect-square rounded-sm ${colors[intensity]}`}
                          title={`${d.date}: ${d.count} actions, +${d.xp} XP`}
                        />
                      );
                    })}
                  </div>
                  <p className="text-[8px] text-navy-muted font-medium mt-1 text-center">
                    {monthActivity.filter(d => d.count > 0).length} active days out of 30
                  </p>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-8 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl overflow-hidden bg-primary/20 flex items-center justify-center border border-primary/30">
          {profilePic ? (
            <img src={profilePic} alt="" className="w-full h-full object-cover" />
          ) : (
            <User size={20} className="text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-white leading-none truncate">{user?.displayName || 'Learner'}</h4>
          <p className="text-[10px] font-bold text-navy-muted mt-1">{user ? user.email : `Level ${level} ${levelTitle(level)}`}</p>
        </div>
      </div>
      {user && onLogout && (
        <div className="px-3 mt-4">
          <button
            onClick={onLogout}
            className="flex items-center gap-4 px-8 py-3 rounded w-full text-navy-muted hover:text-white hover:bg-navy-hover transition-colors"
          >
            <LogOut size={18} className="opacity-60" />
            <span className="text-sm">Sign Out</span>
          </button>
        </div>
      )}
    </nav>
  );
};
