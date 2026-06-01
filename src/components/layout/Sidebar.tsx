/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Home, Library, BarChart, PieChart, Target, AlertCircle, MessageSquare, Settings, Zap, User, CheckSquare, Sparkles, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
import { UserStats } from '../../types';
import { AuthUser } from '../../contexts/AuthContext';

interface SidebarProps {
  currentView: string;
  setView: (v: string) => void;
  stats: UserStats;
  user?: AuthUser | null;
  onLogout?: () => void;
}

export const Sidebar = ({ currentView, setView, stats, user, onLogout }: SidebarProps) => {
  const navItems = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'todo', label: 'Tasks', icon: CheckSquare },
    { id: 'library', label: 'Library', icon: Library },
    { id: 'analytics', label: 'Analytics', icon: BarChart },
    { id: 'progress', label: 'Progress', icon: PieChart },
    { id: 'practice', label: 'Practice', icon: Target },
    { id: 'mistakes', label: 'Mistakes', icon: AlertCircle },
    { id: 'doubt-solver', label: 'Klaro AI', icon: MessageSquare },
    { id: 'offers', label: 'Upgrade Plan', icon: Sparkles },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="fixed left-0 top-0 h-full flex-col py-6 bg-navy-dark w-64 border-r border-navy-hover z-50 hidden md:flex">
      <div className="px-8 mb-10 pb-6 border-b border-navy-hover">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-black text-white tracking-tight">Klaro Learn</h1>
          <p className="text-[10px] text-navy-muted font-bold uppercase tracking-widest">Mastery Hub</p>
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

      <div className="px-6 mb-8 mt-auto">
        <div className="p-5 rounded-[24px] bg-navy-hover border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-amber-400 fill-amber-400" />
              <span className="text-xs font-black text-white">{stats.streak} Day Streak</span>
            </div>
            <div className="text-[9px] font-black text-primary px-2 py-0.5 bg-primary/20 rounded">LVL {stats.level}</div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[9px] font-bold text-navy-muted uppercase tracking-wider">
              <span>XP Progress</span>
              <span className="text-white">{stats.xp} / 3000</span>
            </div>
            <div className="h-1.5 bg-navy-dark rounded-full overflow-hidden border border-white/5">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${(stats.xp / 3000) * 100}%` }}
                className="h-full bg-primary shadow-[0_0_8px_rgba(37,99,235,0.4)]"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30">
          <User size={20} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-white leading-none truncate">{user?.displayName || 'Learner'}</h4>
          <p className="text-[10px] font-bold text-navy-muted mt-1">{user ? user.email : `Level ${stats.level} Scholar`}</p>
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
