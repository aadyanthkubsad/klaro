import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Home, Library, BarChart, PieChart, Target, AlertCircle,
  MessageSquare, Settings, Sparkles, User, CheckSquare, LogOut, X,
} from 'lucide-react';
import { BhuvionaLogoMark } from '../common/BhuvionaLogo';
import { AuthUser } from '../../contexts/AuthContext';

const NAV_ITEMS = [
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

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  currentView: string;
  setView: (v: string) => void;
  user?: AuthUser | null;
  onLogout?: () => void;
}

export const MobileDrawer = ({
  open, onClose, currentView, setView, user, onLogout,
}: MobileDrawerProps) => {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const navigate = (id: string) => { setView(id); onClose(); };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <motion.nav
            initial={{ x: -256 }}
            animate={{ x: 0 }}
            exit={{ x: -256 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="absolute left-0 top-0 h-full w-64 bg-navy-dark border-r border-navy-hover flex flex-col py-6"
            aria-label="Navigation drawer"
          >
            {/* Header */}
            <div className="px-6 mb-6 pb-6 border-b border-navy-hover flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BhuvionaLogoMark size={32} />
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-sm font-black text-white tracking-tight leading-none">Lumina Learn</h2>
                  <a
                    href="https://www.bhuviona.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] font-bold uppercase tracking-widest leading-none hover:underline"
                    style={{ color: '#00BCD4' }}
                  >
                    by Bhuviona Technologies
                  </a>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-navy-muted hover:text-white hover:bg-navy-hover transition-colors"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* Nav items */}
            <div className="flex flex-col gap-1 px-3 flex-1 overflow-y-auto">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                const active = currentView === id;
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => navigate(id)}
                    className={`flex items-center gap-4 px-8 py-3 rounded transition-all duration-200 ${
                      active
                        ? 'bg-navy-hover text-white font-semibold border-r-4 border-primary'
                        : 'text-navy-muted hover:text-white hover:bg-navy-hover'
                    }`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon size={18} className={active ? 'opacity-100' : 'opacity-60'} />
                    <span className="text-sm">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* User profile */}
            <div className="px-6 pt-4 border-t border-navy-hover mt-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30">
                  <User size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white leading-none truncate">{user?.displayName ?? 'Learner'}</p>
                  {user?.email && (
                    <p className="text-[10px] text-navy-muted mt-0.5 truncate">{user.email}</p>
                  )}
                </div>
              </div>
              {user && onLogout && (
                <button
                  type="button"
                  onClick={() => { onLogout(); onClose(); }}
                  className="mt-3 flex items-center gap-3 px-2 py-2 rounded w-full text-navy-muted hover:text-white hover:bg-navy-hover transition-colors"
                >
                  <LogOut size={16} className="opacity-60" />
                  <span className="text-sm">Sign Out</span>
                </button>
              )}
            </div>
          </motion.nav>
        </div>
      )}
    </AnimatePresence>
  );
};
