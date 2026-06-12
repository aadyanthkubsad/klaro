# Mobile navigation — design spec

**Date:** 2026-06-12
**Status:** Approved

## Problem

The desktop sidebar (`hidden md:flex`) is invisible on mobile. Users on phones have no way to navigate between views.

## Solution

Add a bottom tab bar + slide-in drawer for mobile. Desktop sidebar is unchanged.

## Components

### MobileBottomBar (new — `src/components/layout/MobileBottomBar.tsx`)

- Fixed to the bottom of the viewport, `flex md:hidden`, full width
- 5 items: Home · Tasks · Library · Lumina AI · More
- Active item highlighted with primary blue icon + label, indicator dot below
- "More" tap → sets `drawerOpen = true`
- Background: `bg-navy-dark`, top border `border-navy-hover`
- Z-index above content, below drawer

### MobileDrawer (new — `src/components/layout/MobileDrawer.tsx`)

- Full-height overlay drawer, `md:hidden`
- Dark semi-transparent backdrop covers the right portion; tap closes
- Drawer panel slides in from left (width: 256px = w-64), same navy-dark background as desktop sidebar
- Animated with `motion/react`: `x: -256 → 0`, backdrop `opacity: 0 → 1`, duration 0.25s
- Content: Bhuviona logo + "Lumina Learn" header, all 10 nav items (same as desktop sidebar), streak/XP panel, user profile + sign out at bottom
- Tapping a nav item → navigates + closes drawer
- Tapping backdrop → closes drawer
- Escape key → closes drawer
- Uses `AnimatePresence` so exit animation plays before unmount

### TopBar (modified — `src/components/layout/TopBar.tsx`)

- Hamburger icon (`Menu` from lucide-react) added on the far left, visible only on mobile (`md:hidden`)
- Tap → calls `onMenuOpen()` prop (sets `drawerOpen = true` in App)
- Prop: `onMenuOpen?: () => void`

### App.tsx (modified)

- New state: `const [drawerOpen, setDrawerOpen] = useState(false)`
- Pass `onMenuOpen={() => setDrawerOpen(true)}` to TopBar
- Pass `open={drawerOpen}`, `onClose={() => setDrawerOpen(false)}`, `currentView`, `setView`, `user`, `onLogout` to MobileDrawer
- Pass `currentView`, `setView`, `onMoreTap={() => setDrawerOpen(true)}` to MobileBottomBar
- Render MobileDrawer and MobileBottomBar only when not on `landing` or `auth` views

### Main content area (App.tsx)

- Add `pb-16 md:pb-0` to the `<main>` element so content is not obscured by the bottom bar on mobile

## Bottom bar item mapping

| Label | View id | Icon |
|---|---|---|
| Home | dashboard | Home |
| Tasks | todo | CheckSquare |
| Library | library | Library |
| Lumina AI | doubt-solver | MessageSquare |
| More | — (opens drawer) | MoreHorizontal |

## Behaviour notes

- Drawer is rendered in a React portal at the `<body>` level to avoid stacking context issues
- The existing Sidebar component is not modified
- No changes to desktop layout (md: breakpoint and above)
- `drawerOpen` state lives in App so both TopBar and MobileBottomBar can trigger it

## Out of scope

- Swipe gesture to open/close drawer (can be added later)
- Persisting last-open drawer state across page loads
