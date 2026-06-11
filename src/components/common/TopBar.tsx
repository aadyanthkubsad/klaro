/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, Library, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LibraryItem } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

interface TopBarProps {
  title: string;
  subtitle?: string;
  library?: LibraryItem[];
}

function readProfileTag(): string {
  try {
    const raw = localStorage.getItem('lumina:user-profile');
    if (raw) {
      const p = JSON.parse(raw);
      return `${p.classLevel || 'Class 10'} · ${p.learningTrack || 'CBSE'}`;
    }
  } catch { /* ignore */ }
  return 'Class 10 · CBSE';
}

export const TopBar = ({ title, subtitle, library = [] }: TopBarProps) => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [profileTag, setProfileTag] = useState('Class 10 · CBSE');

  useEffect(() => {
    setProfileTag(readProfileTag());
  }, []);

  const results = query.trim() === '' 
    ? [] 
    : library.filter(item => 
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.contentSnippet.toLowerCase().includes(query.toLowerCase()) ||
        item.tags?.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 5);

  return (
    <header className="flex flex-col md:flex-row justify-between items-center w-full h-auto md:h-[72px] bg-white border-b border-surface-container-high px-6 md:px-10 mb-10 py-4 md:py-0 gap-4">
      <div className="flex flex-col">
        <h2 className="text-xl font-bold tracking-tight text-on-surface">{title}</h2>
        {subtitle && <p className="text-on-surface-variant text-xs font-medium">{subtitle}</p>}
      </div>

      {/* Global Search Bar */}
      <div className="relative flex-1 max-w-md mx-4 group">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" size={18} />
          <input
            type="text"
            aria-label={title === 'Settings' ? 'Search settings' : 'Search library, topics, or tags'}
            placeholder={title === 'Settings' ? 'Search settings...' : 'Search library, topics, or tags...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            className="w-full bg-surface-container-low border border-surface-container rounded-2xl py-2.5 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-all"
          />
        </div>

        {/* Search Results Dropdown */}
        <AnimatePresence>
          {isFocused && query.trim() !== '' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute top-full left-0 right-0 mt-2 bg-white border border-surface-container rounded-2xl shadow-xl overflow-hidden z-50 p-2"
            >
              <div className="px-3 py-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-surface-container mb-2">
                Search Results ({results.length})
              </div>
              {results.length > 0 ? (
                <div className="space-y-1">
                  {results.map(item => (
                    <button key={item.id} className="w-full text-left p-3 hover:bg-surface-container-low rounded-xl transition-all group flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        item.type === 'visual' ? 'bg-amber-100 text-amber-700' :
                        item.type === 'readwrite' ? 'bg-teal-100 text-teal-700' :
                        item.type === 'aural' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        <Library size={14} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors truncate">{item.title}</div>
                        <div className="text-[10px] text-on-surface-variant truncate opacity-60 uppercase">{item.type} • {item.date}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                   <p className="text-sm text-on-surface-variant font-medium">No results found for "{query}"</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-6">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
          <Zap size={14} className="text-amber-500 fill-amber-500" />
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Streak</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block">
            <div className="text-sm font-semibold text-on-surface leading-tight">{user?.displayName || 'Learner'}</div>
            <div className="text-[11px] text-on-surface-variant font-medium">{profileTag}</div>
          </div>
          <div className="h-9 w-9 rounded-full overflow-hidden border-2 border-white shadow-sm ring-1 ring-slate-200 bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-black text-primary">{(user?.displayName || 'L')[0].toUpperCase()}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
