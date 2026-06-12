import React from 'react';
import { Menu } from 'lucide-react';
import { BhuvionaLogoMark } from '../common/BhuvionaLogo';

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Home',
  todo: 'Tasks',
  library: 'Library',
  analytics: 'Analytics',
  progress: 'Progress',
  practice: 'Practice',
  mistakes: 'Mistakes',
  'doubt-solver': 'Lumina AI',
  offers: 'Upgrade Plan',
  settings: 'Settings',
};

interface MobileTopBarProps {
  currentView: string;
  onMenuOpen: () => void;
}

export const MobileTopBar = ({ currentView, onMenuOpen }: MobileTopBarProps) => (
  <header className="flex md:hidden items-center justify-between px-4 py-3 bg-navy-dark border-b border-navy-hover fixed top-0 left-0 right-0 z-40">
    <button
      onClick={onMenuOpen}
      aria-label="Open navigation menu"
      className="p-1.5 rounded-lg text-navy-muted hover:text-white hover:bg-navy-hover transition-colors"
    >
      <Menu size={22} />
    </button>
    <div className="flex items-center gap-2">
      <BhuvionaLogoMark size={28} />
      <span className="text-sm font-black text-white tracking-tight">
        {VIEW_TITLES[currentView] ?? 'Lumina Learn'}
      </span>
    </div>
    <div className="w-8" />
  </header>
);
