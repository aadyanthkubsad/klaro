# Mobile Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile bottom tab bar and slide-in drawer so users on phones can navigate the app, while leaving the desktop sidebar completely unchanged.

**Architecture:** Three new components (MobileTopBar, MobileBottomBar, MobileDrawer) are rendered only on mobile (`md:hidden`). A single `drawerOpen` boolean in App.tsx controls the drawer. The desktop Sidebar is not modified.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, motion/react (already installed), lucide-react (already installed)

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/components/layout/MobileTopBar.tsx` | Mobile-only top bar: hamburger button + current page title |
| Create | `src/components/layout/MobileBottomBar.tsx` | Fixed bottom tab bar: 5 quick-access items |
| Create | `src/components/layout/MobileDrawer.tsx` | Slide-in overlay drawer with all 10 nav items |
| Modify | `src/App.tsx` | Add `drawerOpen` state, render 3 new components, add `pb-16` to main |

---

### Task 1: MobileTopBar

**Files:**
- Create: `src/components/layout/MobileTopBar.tsx`

The top bar is `flex md:hidden`, fixed to the top, shows a hamburger on the left and the current page title in the centre. It sits at `z-40` (below drawer's `z-50`).

- [ ] **Step 1: Create the file**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/MobileTopBar.tsx
git commit -m "feat: add MobileTopBar with hamburger for mobile nav"
```

---

### Task 2: MobileBottomBar

**Files:**
- Create: `src/components/layout/MobileBottomBar.tsx`

Fixed bottom bar with 5 items. "More" opens the drawer via `onMoreTap`. Active item uses primary blue; inactive items use muted white.

- [ ] **Step 1: Create the file**

```tsx
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
    className="flex md:hidden items-center justify-around fixed bottom-0 left-0 right-0 z-40 bg-navy-dark border-t border-navy-hover px-2 pb-safe"
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
          {active && <span className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/MobileBottomBar.tsx
git commit -m "feat: add MobileBottomBar with 5-item tab strip"
```

---

### Task 3: MobileDrawer

**Files:**
- Create: `src/components/layout/MobileDrawer.tsx`

Full-height overlay drawer. Panel slides in from the left (`x: -256 → 0`). Backdrop fades in behind it. Tapping the backdrop or any nav item closes the drawer. Escape key also closes it. Contains all 10 nav items matching the desktop sidebar, the Bhuviona logo header, and a user profile + sign-out at the bottom.

- [ ] **Step 1: Create the file**

```tsx
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
                onClick={onClose}
                className="p-1 rounded-lg text-navy-muted hover:text-white hover:bg-navy-hover transition-colors"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* Nav items */}
            <div className="flex flex-col gap-1 px-3 flex-1">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                const active = currentView === id;
                return (
                  <button
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/MobileDrawer.tsx
git commit -m "feat: add MobileDrawer slide-in nav overlay"
```

---

### Task 4: Wire into App.tsx

**Files:**
- Modify: `src/App.tsx`

Four changes:
1. Import the three new components
2. Add `drawerOpen` state
3. Render MobileTopBar, MobileBottomBar, MobileDrawer (only outside landing/auth)
4. Add `pt-14 md:pt-0` to `<main>` (for MobileTopBar height) and `pb-16 md:pb-0` (for MobileBottomBar height)

- [ ] **Step 1: Add imports** — after the existing `Sidebar` import on line 14:

```tsx
import { MobileTopBar } from './components/layout/MobileTopBar';
import { MobileBottomBar } from './components/layout/MobileBottomBar';
import { MobileDrawer } from './components/layout/MobileDrawer';
```

- [ ] **Step 2: Add drawerOpen state** — inside the App component, near the other `useState` calls (around line 100):

```tsx
const [drawerOpen, setDrawerOpen] = useState(false);
```

- [ ] **Step 3: Update the return JSX**

Find this block (around line 433):
```tsx
return (
  <div className="min-h-screen flex bg-surface-container-lowest">
    {view !== 'landing' && view !== 'auth' && <Sidebar currentView={view} setView={setView} stats={userStats} user={user} onLogout={() => { logout(); setView('landing'); }} />}
    
    <main className={`flex-1 ${view === 'landing' || view === 'auth' ? '' : 'md:ml-64'} overflow-x-hidden transition-all duration-500`}>
```

Replace with:
```tsx
const isApp = view !== 'landing' && view !== 'auth';

return (
  <div className="min-h-screen flex bg-surface-container-lowest">
    {isApp && <Sidebar currentView={view} setView={setView} stats={userStats} user={user} onLogout={() => { logout(); setView('landing'); }} />}
    {isApp && (
      <MobileTopBar currentView={view} onMenuOpen={() => setDrawerOpen(true)} />
    )}
    {isApp && (
      <MobileBottomBar
        currentView={view}
        setView={setView}
        onMoreTap={() => setDrawerOpen(true)}
      />
    )}
    {isApp && (
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentView={view}
        setView={setView}
        user={user}
        onLogout={() => { logout(); setView('landing'); }}
      />
    )}

    <main className={`flex-1 ${isApp ? 'md:ml-64 pt-14 md:pt-0 pb-16 md:pb-0' : ''} overflow-x-hidden transition-all duration-500`}>
```

- [ ] **Step 4: Verify TypeScript compiles with no errors**

```bash
cd C:\Prashanth\Work\Bhuviona\klaro-Learn
npm run lint
```

Expected: no errors. If type errors appear, check that `AuthUser` import path in `MobileDrawer.tsx` matches the existing import in `Sidebar.tsx` (`../../contexts/AuthContext`).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire mobile nav components into App"
```

---

### Task 5: Push and deploy

- [ ] **Step 1: Push to GitHub**

```bash
git push origin HEAD:main
```

- [ ] **Step 2: Verify on mobile**

Open the Railway URL on a phone (or use Chrome DevTools → toggle device toolbar → pick iPhone 12 Pro). Confirm:
- Top bar appears with hamburger and page title
- Bottom bar shows Home · Tasks · Library · AI · More
- Tapping any bottom bar item navigates correctly and active item highlights
- Tapping hamburger or "More" opens the drawer
- Tapping a drawer item navigates and closes the drawer
- Tapping the backdrop closes the drawer
- Desktop (≥768px): top bar, bottom bar, and drawer are all hidden; sidebar shows as normal

---

## Self-review

**Spec coverage check:**
- ✅ Bottom tab bar (Home, Tasks, Library, Lumina AI, More) — Task 2
- ✅ Hamburger in top bar — Task 1
- ✅ "More" opens drawer — Task 2 + Task 4
- ✅ Hamburger opens drawer — Task 1 + Task 4
- ✅ Full drawer with all 10 items — Task 3
- ✅ Slide animation with backdrop — Task 3
- ✅ Backdrop tap closes drawer — Task 3
- ✅ Escape key closes drawer — Task 3
- ✅ Nav item tap closes drawer — Task 3
- ✅ Desktop sidebar unchanged — confirmed (no modifications to Sidebar.tsx)
- ✅ Content not obscured by bars — `pt-14 md:pt-0 pb-16 md:pb-0` in Task 4

**Placeholder scan:** No TBDs, all code blocks complete.

**Type consistency:** `AuthUser` used in MobileDrawer matches the type exported from `../../contexts/AuthContext` (same path as Sidebar.tsx uses). `onLogout` prop is `() => void` throughout.
