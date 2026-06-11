/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * EnglishGlossPanel — secondary English support for Hindi chapter kits.
 *
 * Only renders when the kit was generated for the Hindi syllabus
 * (`kit.language === 'hi'`) and Gemini returned an `englishGloss` block.
 * Hindi is always the primary teaching language; this panel is collapsed
 * by default so the Hindi content keeps visual priority.
 */

import React, { useState } from 'react';
import { Languages, ChevronDown } from 'lucide-react';

interface EnglishGloss {
  summary?: string;
  keyPoints?: string[];
  vocabulary?: { term: string; english: string }[];
}

interface EnglishGlossPanelProps {
  kit?: any;
}

function getGloss(kit: any): EnglishGloss | null {
  if (!kit) return null;
  if (kit.language !== 'hi' && (kit.subject || '').toLowerCase() !== 'hindi') return null;
  const g = kit.englishGloss;
  if (!g) return null;
  const hasContent =
    g.summary ||
    (Array.isArray(g.keyPoints) && g.keyPoints.length) ||
    (Array.isArray(g.vocabulary) && g.vocabulary.length);
  return hasContent ? g : null;
}

export const EnglishGlossPanel = ({ kit }: EnglishGlossPanelProps) => {
  const [open, setOpen] = useState(false);
  const gloss = getGloss(kit);
  if (!gloss) return null;

  return (
    <div className="mt-4 border border-surface-container rounded-2xl bg-surface-container-lowest overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-surface-container-low transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Languages size={16} />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-black text-on-surface">English Translation</span>
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
              Secondary · Hindi remains primary
            </span>
          </span>
        </span>
        <ChevronDown
          size={18}
          className={`text-on-surface-variant transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-4 text-sm leading-relaxed text-on-surface-variant">
          {gloss.summary && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70 mb-1">
                Summary
              </p>
              <p className="text-on-surface font-medium">{gloss.summary}</p>
            </div>
          )}

          {Array.isArray(gloss.keyPoints) && gloss.keyPoints.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70 mb-1">
                Key Points
              </p>
              <ul className="space-y-1.5">
                {gloss.keyPoints.map((p, i) => (
                  <li key={i} className="flex gap-2 text-on-surface">
                    <span className="mt-2 w-1 h-1 rounded-full bg-primary shrink-0" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(gloss.vocabulary) && gloss.vocabulary.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70 mb-1">
                Vocabulary
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {gloss.vocabulary.map((v, i) => (
                  <li key={i} className="p-3 rounded-lg bg-white border border-surface-container">
                    <p className="text-sm font-bold text-on-surface">{v.term}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{v.english}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
