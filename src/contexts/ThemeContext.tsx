import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type BrandColor = 'blue' | 'teal' | 'purple' | 'red' | 'orange' | 'violet';
export type FontChoice = 'lexend' | 'inter' | 'poppins' | 'system';

interface ThemeState {
  darkMode: boolean;
  brandColor: BrandColor;
  font: FontChoice;
}

interface ThemeContextType extends ThemeState {
  setDarkMode: (v: boolean) => void;
  setBrandColor: (v: BrandColor) => void;
  setFont: (v: FontChoice) => void;
}

const BRAND_COLORS: Record<BrandColor, { primary: string; container: string }> = {
  blue:   { primary: '#6366F1', container: '#4F46E5' },
  teal:   { primary: '#14B8A6', container: '#0D9488' },
  purple: { primary: '#8B5CF6', container: '#7C3AED' },
  red:    { primary: '#EF4444', container: '#DC2626' },
  orange: { primary: '#F97316', container: '#EA580C' },
  violet: { primary: '#A78BFA', container: '#8B5CF6' },
};

const FONT_FAMILIES: Record<FontChoice, string> = {
  lexend:  '"Lexend", ui-sans-serif, system-ui, sans-serif',
  inter:   '"Inter", ui-sans-serif, system-ui, sans-serif',
  poppins: '"Poppins", ui-sans-serif, system-ui, sans-serif',
  system:  'ui-sans-serif, system-ui, -apple-system, sans-serif',
};

const LS_KEY = 'lumina:theme';
const STYLE_ID = 'lumina-theme-overrides';

function loadFromStorage(): ThemeState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaults();
}

function defaults(): ThemeState {
  return { darkMode: false, brandColor: 'blue', font: 'lexend' };
}

function buildCSS(state: ThemeState): string {
  const colors = BRAND_COLORS[state.brandColor] || BRAND_COLORS.blue;
  const fontFamily = FONT_FAMILIES[state.font] || FONT_FAMILIES.lexend;

  const surface = state.darkMode
    ? {
        surface: '#0F172A',
        surfaceDim: '#1E293B',
        surfaceBright: '#1E293B',
        containerLowest: '#0B1120',
        containerLow: '#0F172A',
        container: '#1E293B',
        containerHigh: '#334155',
        containerHighest: '#1E293B',
        onSurface: '#F1F5F9',
        onSurfaceVariant: '#94A3B8',
      }
    : {
        surface: '#F8FAFC',
        surfaceDim: '#F1F5F9',
        surfaceBright: '#FFFFFF',
        containerLowest: '#FFFFFF',
        containerLow: '#F8FAFC',
        container: '#F1F5F9',
        containerHigh: '#E2E8F0',
        containerHighest: '#F1F5F9',
        onSurface: '#0F172A',
        onSurfaceVariant: '#64748B',
      };

  return `
:root {
  --color-primary: ${colors.primary} !important;
  --color-primary-container: ${colors.container} !important;
  --font-sans: ${fontFamily} !important;
  --color-surface: ${surface.surface} !important;
  --color-surface-dim: ${surface.surfaceDim} !important;
  --color-surface-bright: ${surface.surfaceBright} !important;
  --color-surface-container-lowest: ${surface.containerLowest} !important;
  --color-surface-container-low: ${surface.containerLow} !important;
  --color-surface-container: ${surface.container} !important;
  --color-surface-container-high: ${surface.containerHigh} !important;
  --color-surface-container-highest: ${surface.containerHighest} !important;
  --color-on-surface: ${surface.onSurface} !important;
  --color-on-surface-variant: ${surface.onSurfaceVariant} !important;
}
body {
  background-color: ${surface.surface} !important;
  color: ${surface.onSurface} !important;
  font-family: ${fontFamily} !important;
}
.bg-surface { background-color: ${surface.surface} !important; }
.bg-surface-container-lowest { background-color: ${surface.containerLowest} !important; }
.bg-surface-container-low { background-color: ${surface.containerLow} !important; }
.bg-surface-container { background-color: ${surface.container} !important; }
.text-on-surface { color: ${surface.onSurface} !important; }
.text-on-surface-variant { color: ${surface.onSurfaceVariant} !important; }
.bg-primary { background-color: ${colors.primary} !important; }
.text-primary { color: ${colors.primary} !important; }
.border-primary { border-color: ${colors.primary} !important; }
.ring-primary\\/20 { --tw-ring-color: ${colors.primary}33 !important; }
.focus\\:ring-primary\\/20:focus { --tw-ring-color: ${colors.primary}33 !important; }
.focus\\:border-primary:focus { border-color: ${colors.primary} !important; }
`;
}

function applyToDOM(state: ThemeState) {
  document.documentElement.classList.toggle('dark', state.darkMode);

  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = buildCSS(state);
}

const ThemeContext = createContext<ThemeContextType>(null!);
export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ThemeState>(loadFromStorage);

  useEffect(() => {
    applyToDOM(state);
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);

  useEffect(() => { applyToDOM(state); }, []);

  const setDarkMode = useCallback((v: boolean) => setState(s => ({ ...s, darkMode: v })), []);
  const setBrandColor = useCallback((v: BrandColor) => setState(s => ({ ...s, brandColor: v })), []);
  const setFont = useCallback((v: FontChoice) => setState(s => ({ ...s, font: v })), []);

  return (
    <ThemeContext.Provider value={{ ...state, setDarkMode, setBrandColor, setFont }}>
      {children}
    </ThemeContext.Provider>
  );
};
