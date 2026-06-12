import React from 'react';
import { Home, CheckSquare, Library, MessageSquare, MoreHorizontal } from 'lucide-react';

interface MobileBottomBarProps {
  currentView: string;
  setView: (v: string) => void;
  onMoreTap: () => void;
}

const TABS = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'todo', label: 'Tasks', icon: CheckSquare },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'doubt-solver', label: 'AI', icon: MessageSquare },
];

export const MobileBottomBar = ({ currentView, setView, onMoreTap }: MobileBottomBarProps) => (
  <nav
    className="flex md:hidden items-center justify-around fixed bottom-0 left-0 right-0 z-40 bg-navy-dark border-t border-navy-hover px-2"
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    aria-label="Mobile navigation"
  >
    {TABS.map(({ id, label, icon: Icon }) => {
      const active = currentView === id;
      return (
        <button
          key={id}
          onClick={() => setView(id)}
          className="flex flex-col items-center gap-0.5 py-2.5 px-3 min-w-[56px]"
          aria-current={active ? 'page' : undefined}
        >
          <Icon
            size={22}
            className={active ? 'text-primary' : 'text-navy-muted'}
          />
          <span className={`text-[10px] font-bold tracking-wide ${active ? 'text-primary' : 'text-navy-muted'}`}>
            {label}
          </span>
          <span className={`w-1 h-1 rounded-full mt-0.5 ${active ? 'bg-primary' : 'bg-transparent'}`} />
        </button>
      );
    })}
    <button
      onClick={onMoreTap}
      className="flex flex-col items-center gap-0.5 py-2.5 px-3 min-w-[56px]"
      aria-label="More navigation options"
    >
      <MoreHorizontal size={22} className="text-navy-muted" />
      <span className="text-[10px] font-bold tracking-wide text-navy-muted">More</span>
    </button>
  </nav>
);
