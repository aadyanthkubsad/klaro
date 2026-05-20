/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Library, Eye, Mic, Zap, Edit3, BarChart3, AlertCircle, Search, Target, BookOpen, CheckCircle, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LibraryItem, UserStats, QuizAttempt, MasteryEntry } from '../../types';
import { TopBar } from '../common/TopBar';
import { getQuizHistory, getMastery, onLearningChange, getRevisionStatus, RevisionStatus, deduplicateQuizHistory, deleteQuizAttempt } from '../../services/learningService';
import { CLASS10_SYLLABUS, SUBJECTS, ChapterItem, ChapterSubject, searchSyllabus } from '../../data/class10Syllabus';
import { getActiveVersion } from '../../data/syllabusVersions';

interface LibraryViewProps {
  library: LibraryItem[];
  stats?: UserStats;
  setView: (v: string) => void;
  navigateToKit: (id: string, style: string) => void;
  navigateToMistakes?: (topic: string) => void;
  viewWrongAnswers?: (attemptId: string) => void;
  goToScoreAnalysis?: () => void;
  /** Opens the mode picker for a predefined Class 10 chapter. */
  onPickChapter?: (chapter: ChapterItem) => void;
  /** Calls the cleanup-library API and refreshes the library state. */
  onRemoveDuplicates?: () => Promise<void>;
  /** Calls the delete-item API for a saved/analysis item and refreshes state. */
  onDeleteLibraryItem?: (id: string) => Promise<void>;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function statusPillStyle(s: RevisionStatus) {
  if (s === 'overdue')   return 'bg-rose-100 text-rose-800';
  if (s === 'due-today') return 'bg-amber-100 text-amber-800';
  if (s === 'upcoming')  return 'bg-primary/10 text-primary';
  return 'bg-surface-container text-on-surface-variant';
}
function statusPillLabel(s: RevisionStatus) {
  if (s === 'overdue')   return 'Overdue';
  if (s === 'due-today') return 'Revise today';
  if (s === 'upcoming')  return 'This week';
  return 'Later';
}

export const LibraryView = ({ library, stats, setView, navigateToKit, navigateToMistakes, viewWrongAnswers, goToScoreAnalysis, onPickChapter, onRemoveDuplicates, onDeleteLibraryItem }: LibraryViewProps) => {
  // Four sections — Chapters is the default landing tab; Saved shows explicitly
  // bookmarked learning sessions; Analysis and Tests have their own branches.
  const [librarySection, setLibrarySection] = useState<'chapters' | 'saved' | 'analysis' | 'tests'>('chapters');
  const [savedSearch, setSavedSearch] = useState('');
  const [deduping, setDeduping] = useState(false);

  // ── Delete-item feature ──────────────────────────────────────────────────────
  type DeleteTarget = { id: string; title: string; section: 'saved' | 'analysis' | 'tests' };
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasLongPress = useRef(false);

  const startLongPress = useCallback((target: DeleteTarget) => {
    wasLongPress.current = false;
    lpTimer.current = setTimeout(() => {
      wasLongPress.current = true;
      setDeleteConfirm(target);
    }, 600);
  }, []);

  const endLongPress = useCallback(() => {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; }
  }, []);

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    if (deleteConfirm.section === 'tests') {
      deleteQuizAttempt(deleteConfirm.id);
      setQuizAttempts(getQuizHistory());
    } else {
      await onDeleteLibraryItem?.(deleteConfirm.id);
    }
    setDeleteConfirm(null);
    setDeleting(false);
  };

  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [mastery, setMastery] = useState<MasteryEntry[]>([]);
  const [chapterSearch, setChapterSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<ChapterSubject | 'All'>('All');

  useEffect(() => {
    const refresh = () => {
      setQuizAttempts(getQuizHistory());
      setMastery(getMastery());
    };
    refresh();
    return onLearningChange(refresh);
  }, []);

  // Strip legacy "Audio: " / "Visual: " / "Read/Write: " prefixes used by older saves.
  const stripModePrefix = (t: string) =>
    t.replace(/^\s*(audio|visual|read\/write|readwrite|read|write)\s*[:\-–]\s*/i, '').trim();

  // Group saved revision kits by chapter title (after stripping legacy prefixes).
  const savedByTitle = useMemo(() => {
    const byTitle = new Map<string, LibraryItem[]>();
    library.filter(it => it.type !== 'analysis').forEach(it => {
      const key = stripModePrefix(it.title).toLowerCase();
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key)!.push(it);
    });
    return byTitle;
  }, [library]);

  const masteryByTopic = useMemo(
    () => new Map(mastery.map(m => [m.topic.trim().toLowerCase(), m])),
    [mastery],
  );

  // Count duplicate (stripped-title, type) pairs across non-analysis items.
  const savedDuplicateCount = useMemo(() => {
    const seen = new Map<string, number>();
    library.filter(it => it.type !== 'analysis').forEach(it => {
      const key = `${stripModePrefix(it.title).toLowerCase()}::${it.type}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    });
    let extras = 0;
    seen.forEach(n => { if (n > 1) extras += n - 1; });
    return extras;
  }, [library]);

  const analysisDuplicateCount = useMemo(() => {
    const seen = new Map<string, number>();
    library.filter(it => it.type === 'analysis').forEach(it => {
      const key = it.title.trim().toLowerCase();
      seen.set(key, (seen.get(key) ?? 0) + 1);
    });
    let extras = 0;
    seen.forEach(n => { if (n > 1) extras += n - 1; });
    return extras;
  }, [library]);

  const testsDuplicateCount = useMemo(() => {
    const seen = new Set<string>();
    let extras = 0;
    quizAttempts.forEach(a => {
      const day = a.date ? a.date.slice(0, 10) : '';
      const key = `${a.topic.trim().toLowerCase()}::${day}`;
      if (seen.has(key)) extras++;
      else seen.add(key);
    });
    return extras;
  }, [quizAttempts]);

  const handleRemoveDuplicates = async () => {
    if (!onRemoveDuplicates) return;
    setDeduping(true);
    try { await onRemoveDuplicates(); } finally { setDeduping(false); }
  };

  const handleRemoveDuplicateTests = () => {
    const removed = deduplicateQuizHistory();
    if (removed > 0) setQuizAttempts(getQuizHistory());
  };

  /**
   * Build the full chapter list shown in the Library:
   *   1. Every predefined Class 10 syllabus chapter (filtered by subject + search).
   *   2. Plus any saved kit that doesn't match a predefined chapter (custom topics).
   * Each card surfaces mastery + last-studied / next-revision when available.
   */
  const chapterCards = useMemo(() => {
    const syllabus = searchSyllabus(chapterSearch, subjectFilter);
    const usedSavedKeys = new Set<string>();

    const fromSyllabus = syllabus.map(c => {
      const key = c.chapterTitle.toLowerCase();
      const savedItems = savedByTitle.get(key) || [];
      if (savedItems.length) usedSavedKeys.add(key);
      const primary = savedItems
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      return {
        kind: 'syllabus' as const,
        chapter: c,
        title: c.chapterTitle,
        savedItems,
        primaryId: primary?.id,
        lastDate: primary?.date,
        mastery: masteryByTopic.get(key),
      };
    });

    // Custom saved chapters that are NOT in the predefined syllabus (e.g. user
    // generated a kit from a photo or a freeform topic).
    const customCards = subjectFilter === 'All' || subjectFilter === undefined
      ? Array.from(savedByTitle.entries())
          .filter(([key]) => !usedSavedKeys.has(key))
          .filter(([key, items]) => {
            if (!chapterSearch.trim()) return true;
            const q = chapterSearch.trim().toLowerCase();
            const title = stripModePrefix(items[0].title);
            return title.toLowerCase().includes(q) || (items[0].contentSnippet || '').toLowerCase().includes(q);
          })
          .map(([key, items]) => {
            const primary = items
              .slice()
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            const title = stripModePrefix(primary.title);
            const customChapter: ChapterItem = {
              id: `custom:${key}`,
              classLevel: 'Class 10',
              board: 'CBSE',
              academicYear: '2025-26',
              subject: 'Science',
              chapterTitle: title,
              tags: ['custom'],
              availableModes: ['visual', 'readwrite', 'audio', 'practice'],
              syllabusStatus: 'needs-review',
              source: { sourceName: 'User-generated', sourceType: 'Manual', academicYear: '2025-26', verified: false, lastChecked: new Date().toISOString().split('T')[0] },
            };
            return {
              kind: 'custom' as const,
              chapter: customChapter,
              title,
              savedItems: items,
              primaryId: primary.id,
              lastDate: primary.date,
              mastery: masteryByTopic.get(key),
            };
          })
      : [];

    return [...fromSyllabus, ...customCards];
  }, [savedByTitle, masteryByTopic, chapterSearch, subjectFilter]);

  // O(M) index built once; avoids O(N×M) per-card filter inside the quizScores loop
  const mistakesByTopic = useMemo(() => {
    const map = new Map<string, number>();
    stats?.mistakes?.forEach(m => {
      map.set(m.topic, (map.get(m.topic) ?? 0) + 1);
    });
    return map;
  }, [stats?.mistakes]);

  // Analysis tab renders saved remediation kits only. Chapters & Tests have their own branches.
  const filteredLibrary = library.filter(item => item.type === 'analysis');

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <TopBar title="Your Knowledge Library" subtitle="All your saved learning paths and synthesis notes." library={library} />
      
      <div className="flex border-b border-surface-container-high mb-8 overflow-x-auto">
        <button
          onClick={() => setLibrarySection('chapters')}
          className={`flex-1 py-4 font-bold text-sm tracking-widest uppercase transition-colors border-b-2 ${
            librarySection === 'chapters' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-on-surface'
          }`}
        >
          Chapters
        </button>
        <button
          onClick={() => setLibrarySection('saved')}
          className={`flex-1 py-4 font-bold text-sm tracking-widest uppercase transition-colors border-b-2 ${
            librarySection === 'saved' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-on-surface'
          }`}
        >
          Saved
        </button>
        <button
          onClick={() => setLibrarySection('analysis')}
          className={`flex-1 py-4 font-bold text-sm tracking-widest uppercase transition-colors border-b-2 ${
            librarySection === 'analysis' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-on-surface'
          }`}
        >
          Analysis
        </button>
        <button
          onClick={() => setLibrarySection('tests')}
          className={`flex-1 py-4 font-bold text-sm tracking-widest uppercase transition-colors border-b-2 ${
            librarySection === 'tests' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-on-surface'
          }`}
        >
          Tests
        </button>
      </div>

      {librarySection === 'chapters' ? (
        <div className="space-y-6 pb-20">
          {/* Search */}
          <div className="relative max-w-xl">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              value={chapterSearch}
              onChange={e => setChapterSearch(e.target.value)}
              placeholder="Search by chapter, subject, book, or tag"
              className="w-full bg-white border border-surface-container-high rounded-2xl pl-11 pr-4 py-3 text-sm font-medium focus:outline-none focus:border-primary"
            />
          </div>

          {/* Subject filter pills */}
          <div className="flex flex-wrap gap-2">
            {(['All', ...SUBJECTS] as const).map(s => {
              const active = subjectFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setSubjectFilter(s as any)}
                  className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${
                    active
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-white border border-surface-container text-on-surface-variant hover:border-primary/30'
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>

          {chapterCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[32px] border border-surface-container border-dashed text-center">
              <BookOpen size={36} className="text-on-surface-variant/40 mb-4" />
              <h3 className="text-lg font-bold mb-1">No chapters match that search</h3>
              <p className="text-sm text-on-surface-variant font-medium max-w-xs">
                Try a different keyword or clear the subject filter to see the full Class 10 CBSE syllabus.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {chapterCards.map(c => {
                const rs = c.mastery ? getRevisionStatus(c.mastery.nextRevisionDate) : 'far';
                const saved = c.savedItems.length > 0;
                return (
                  <button
                    key={c.chapter.id}
                    onClick={() => onPickChapter?.(c.chapter)}
                    className="bg-white border border-surface-container rounded-[24px] p-6 shadow-sm flex flex-col text-left hover:-translate-y-1 hover:shadow-md hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant mb-1 truncate">
                          {c.kind === 'syllabus'
                            ? `${c.chapter.subject}${c.chapter.book ? ' · ' + c.chapter.book : ''}`
                            : 'Your saved kit'}
                        </p>
                        <h3 className="text-lg font-bold text-on-surface leading-snug line-clamp-2">{c.title}</h3>
                      </div>
                      {c.mastery ? (
                        <span className={`shrink-0 px-2 py-0.5 rounded-full font-black uppercase tracking-widest text-[9px] ${
                          c.mastery.status === 'Mastered'  ? 'bg-emerald-200 text-emerald-900' :
                          c.mastery.status === 'Strong'    ? 'bg-emerald-100 text-emerald-800' :
                          c.mastery.status === 'Improving' ? 'bg-amber-100 text-amber-800' :
                          c.mastery.status === 'Weak'      ? 'bg-rose-100 text-rose-800' :
                                                             'bg-surface-container text-on-surface-variant'
                        }`}>
                          {c.mastery.status}
                        </span>
                      ) : saved ? (
                        <span className="shrink-0 px-2 py-0.5 rounded-full font-black uppercase tracking-widest text-[9px] bg-primary/10 text-primary">
                          Saved
                        </span>
                      ) : (
                        <span className="shrink-0 px-2 py-0.5 rounded-full font-black uppercase tracking-widest text-[9px] bg-surface-container text-on-surface-variant">
                          Tap to generate
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">
                      <span>{c.chapter.classLevel} · {c.chapter.board} · {c.chapter.academicYear}</span>
                      {c.chapter.syllabusStatus === 'verified' ? (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[8px]">
                          <CheckCircle size={8} /> Verified
                        </span>
                      ) : c.chapter.syllabusStatus === 'needs-review' ? (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[8px]">
                          <AlertCircle size={8} /> Needs review
                        </span>
                      ) : null}
                    </div>
                    {c.kind === 'syllabus' && c.chapter.source && (
                      <p className="text-[9px] text-on-surface-variant/60 font-medium -mt-2 mb-3">
                        Last checked: {new Date(c.chapter.source.lastChecked).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}

                    {(c.mastery || c.lastDate) && (
                      <div className="grid grid-cols-2 gap-3 text-[11px] mb-3">
                        <div>
                          <p className="font-black uppercase tracking-widest text-[9px] text-on-surface-variant mb-0.5">Last studied</p>
                          <p className="font-bold text-on-surface">{fmtDate(c.mastery?.lastAttemptDate || c.lastDate)}</p>
                        </div>
                        <div>
                          <p className="font-black uppercase tracking-widest text-[9px] text-on-surface-variant mb-0.5">Next revision</p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-on-surface">{fmtDate(c.mastery?.nextRevisionDate)}</span>
                            {c.mastery && (
                              <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${statusPillStyle(rs)}`}>
                                {statusPillLabel(rs)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {c.mastery && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-[10px] font-bold text-on-surface-variant mb-1">
                          <span>Mastery</span>
                          <span>{c.mastery.masteryScore}% · risk: {c.mastery.forgettingRisk}</span>
                        </div>
                        <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${c.mastery.masteryScore >= 75 ? 'bg-emerald-500' : c.mastery.masteryScore >= 55 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${c.mastery.masteryScore}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-auto pt-3 border-t border-surface-container-low">
                      {c.chapter.availableModes.includes('visual')    && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50  text-amber-700 text-[10px] font-black uppercase tracking-widest"><Eye size={10} /> Visual</span>}
                      {c.chapter.availableModes.includes('readwrite') && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-teal-50   text-teal-700  text-[10px] font-black uppercase tracking-widest"><Edit3 size={10} /> Read/Write</span>}
                      {c.chapter.availableModes.includes('audio')     && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest"><Mic size={10} /> Audio</span>}
                      {c.chapter.availableModes.includes('practice')  && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest"><Target size={10} /> Practice</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : librarySection === 'saved' ? (() => {
        const savedItems = library.filter(it => it.type !== 'analysis');
        const q = savedSearch.trim().toLowerCase();
        const filtered = q
          ? savedItems.filter(it =>
              stripModePrefix(it.title).toLowerCase().includes(q) ||
              (it.contentSnippet || '').toLowerCase().includes(q) ||
              (it.tags || []).some(t => t.toLowerCase().includes(q))
            )
          : savedItems;

        const modeLabel = (type: string) => {
          if (type === 'aural') return 'Audio';
          if (type === 'readwrite') return 'Read/Write';
          if (type === 'revision-kit') return 'Revision Kit';
          if (type === 'visual') return 'Visual';
          return type;
        };
        const modeBadgeStyle = (type: string) => {
          if (type === 'visual')       return 'bg-amber-100 text-amber-700';
          if (type === 'aural')        return 'bg-indigo-100 text-indigo-700';
          if (type === 'readwrite')    return 'bg-teal-100 text-teal-700';
          if (type === 'revision-kit') return 'bg-primary/10 text-primary';
          return 'bg-surface-container text-on-surface-variant';
        };
        const ModeIcon = ({ type }: { type: string }) => {
          if (type === 'visual')    return <Eye size={11} />;
          if (type === 'aural')     return <Mic size={11} />;
          if (type === 'readwrite') return <Edit3 size={11} />;
          return <Zap size={11} />;
        };

        return (
          <div className="space-y-6 pb-20">
            {savedDuplicateCount > 0 && onRemoveDuplicates && (
              <div className="flex items-center justify-between gap-4 px-5 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
                <div className="flex items-center gap-2.5 text-amber-800 text-sm font-bold">
                  <AlertCircle size={16} className="shrink-0 text-amber-500" />
                  {savedDuplicateCount} duplicate session{savedDuplicateCount > 1 ? 's' : ''} detected — keeping only the most recent per topic &amp; mode.
                </div>
                <button
                  onClick={handleRemoveDuplicates}
                  disabled={deduping}
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  {deduping ? 'Cleaning…' : 'Remove Duplicates'}
                </button>
              </div>
            )}
            {/* Search */}
            <div className="relative max-w-xl">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                value={savedSearch}
                onChange={e => setSavedSearch(e.target.value)}
                placeholder="Search saved topics by name or mode"
                className="w-full bg-white border border-surface-container-high rounded-2xl pl-11 pr-4 py-3 text-sm font-medium focus:outline-none focus:border-primary"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[32px] border border-surface-container border-dashed text-center">
                <BookOpen size={36} className="text-on-surface-variant/40 mb-4" />
                {savedItems.length === 0 ? (
                  <>
                    <h3 className="text-lg font-bold mb-1">No saved sessions yet</h3>
                    <p className="text-sm text-on-surface-variant font-medium max-w-xs">
                      Open any chapter, choose a learning mode, then tap the save icon to bookmark it here for quick revision.
                    </p>
                    <button onClick={() => setLibrarySection('chapters')} className="mt-6 px-8 py-3 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-md hover:scale-105 transition-all">
                      Browse Chapters
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-bold mb-1">No results for "{savedSearch}"</h3>
                    <p className="text-sm text-on-surface-variant font-medium max-w-xs">Try a different keyword.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {filtered.map(item => (
                  <div
                    key={item.id}
                    onClick={() => { if (wasLongPress.current) { wasLongPress.current = false; return; } navigateToKit(item.id, item.type); }}
                    onPointerDown={() => startLongPress({ id: item.id, title: stripModePrefix(item.title), section: 'saved' })}
                    onPointerUp={endLongPress}
                    onPointerLeave={endLongPress}
                    onPointerCancel={endLongPress}
                    onContextMenu={e => e.preventDefault()}
                    className="bg-white border border-surface-container rounded-[24px] p-6 shadow-sm flex flex-col cursor-pointer hover:-translate-y-1 hover:shadow-md hover:border-primary/30 transition-all group select-none"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shrink-0 ${modeBadgeStyle(item.type)}`}>
                        <ModeIcon type={item.type} />
                        {modeLabel(item.type)}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-bold text-on-surface-variant/60 uppercase">{item.date}</span>
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteConfirm({ id: item.id, title: stripModePrefix(item.title), section: 'saved' }); }}
                          onPointerDown={e => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-50 text-on-surface-variant/40 hover:text-rose-600 transition-all"
                          title="Remove this session"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-on-surface leading-snug line-clamp-2 mb-2 group-hover:text-primary transition-colors">
                      {stripModePrefix(item.title)}
                    </h3>

                    {item.contentSnippet && (
                      <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2 mb-4 font-medium">
                        {item.contentSnippet}
                      </p>
                    )}

                    {item.tags && item.tags.filter(t => !t.startsWith('lang:') && !t.startsWith('chapter:')).length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {item.tags.filter(t => !t.startsWith('lang:') && !t.startsWith('chapter:')).slice(0, 3).map(t => (
                          <span key={t} className="px-2 py-0.5 bg-surface-container-low text-[9px] rounded font-bold text-on-surface-variant uppercase">{t}</span>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto pt-3 border-t border-surface-container-low space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                        <span>Progress</span>
                        <span className="text-on-surface">{item.progress}%</span>
                      </div>
                      <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${item.progress >= 75 ? 'bg-emerald-500' : item.progress >= 40 ? 'bg-amber-500' : 'bg-primary'}`}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); navigateToKit(item.id, item.type); }}
                        className="w-full py-2.5 bg-surface-container hover:bg-primary hover:text-white transition-all rounded-xl text-[11px] font-black uppercase tracking-widest mt-1"
                      >
                        Resume Learning
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })() : librarySection === 'tests' ? (
        quizAttempts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-[40px] border border-surface-container border-dashed">
            <div className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-6">
              <Zap size={40} />
            </div>
            <h3 className="text-xl font-bold mb-2">No tests yet</h3>
            <p className="text-on-surface-variant font-medium text-center max-w-xs">Complete a hub quiz to save your scores and review wrong answers here.</p>
            <button onClick={() => setView('dashboard')} className="mt-8 px-10 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg hover:scale-105 transition-all">
              Start a Test
            </button>
          </div>
        ) : (
          <div className="space-y-6 pb-20">
            {testsDuplicateCount > 0 && (
              <div className="flex items-center justify-between gap-4 px-5 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
                <div className="flex items-center gap-2.5 text-amber-800 text-sm font-bold">
                  <AlertCircle size={16} className="shrink-0 text-amber-500" />
                  {testsDuplicateCount} duplicate test{testsDuplicateCount > 1 ? 's' : ''} detected — keeping the highest-scoring attempt per topic per day.
                </div>
                <button
                  onClick={handleRemoveDuplicateTests}
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all"
                >
                  <Trash2 size={12} /> Remove Duplicates
                </button>
              </div>
            )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quizAttempts.map((attempt) => {
              const passed = attempt.percentage >= 70;
              return (
                <div
                  key={attempt.id}
                  onPointerDown={() => startLongPress({ id: attempt.id, title: attempt.topic, section: 'tests' })}
                  onPointerUp={endLongPress}
                  onPointerLeave={endLongPress}
                  onPointerCancel={endLongPress}
                  onContextMenu={e => e.preventDefault()}
                  className="bg-white border border-surface-container-high p-7 rounded-[32px] card-shadow flex flex-col group select-none"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {passed ? 'Passed' : 'Needs Review'}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-on-surface-variant opacity-60 uppercase">
                        {new Date(attempt.date).toLocaleDateString()}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirm({ id: attempt.id, title: attempt.topic, section: 'tests' }); }}
                        onPointerDown={e => e.stopPropagation()}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-50 text-on-surface-variant/40 hover:text-rose-600 transition-all"
                        title="Remove this test"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <h4 className="text-lg font-bold text-on-surface mb-2 line-clamp-2">{attempt.topic}</h4>
                  <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-5">
                    {attempt.modeUsed.replace('-', ' ')} · {attempt.totalQuestions} questions
                  </p>

                  <div className="grid grid-cols-3 gap-2 mb-5">
                    <div className="bg-surface-container-low rounded-xl p-3 text-center">
                      <div className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Score</div>
                      <div className="text-base font-black text-on-surface mt-1">{attempt.score}/{attempt.totalQuestions}</div>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-3 text-center">
                      <div className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Percent</div>
                      <div className={`text-base font-black mt-1 ${passed ? 'text-emerald-600' : 'text-rose-600'}`}>{attempt.percentage}%</div>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-3 text-center">
                      <div className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Mistakes</div>
                      <div className="text-base font-black text-on-surface mt-1">{attempt.wrongCount}</div>
                    </div>
                  </div>

                  <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden mb-5">
                    <div className={`h-full ${passed ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${attempt.percentage}%` }} />
                  </div>

                  <div className="mt-auto grid grid-cols-2 gap-2">
                    <button
                      onClick={() => viewWrongAnswers?.(attempt.id)}
                      disabled={attempt.wrongCount === 0}
                      className="flex items-center justify-center gap-1.5 py-2.5 bg-rose-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <AlertCircle size={12} /> Wrong Answers
                    </button>
                    <button
                      onClick={() => goToScoreAnalysis?.()}
                      className="flex items-center justify-center gap-1.5 py-2.5 bg-primary text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:brightness-110 transition-all"
                    >
                      <BarChart3 size={12} /> Score Analysis
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )
      ) : (
        <div className="space-y-6 pb-20">
          {analysisDuplicateCount > 0 && onRemoveDuplicates && (
            <div className="flex items-center justify-between gap-4 px-5 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
              <div className="flex items-center gap-2.5 text-amber-800 text-sm font-bold">
                <AlertCircle size={16} className="shrink-0 text-amber-500" />
                {analysisDuplicateCount} duplicate analysis item{analysisDuplicateCount > 1 ? 's' : ''} detected.
              </div>
              <button
                onClick={handleRemoveDuplicates}
                disabled={deduping}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50"
              >
                <Trash2 size={12} />
                {deduping ? 'Cleaning…' : 'Remove Duplicates'}
              </button>
            </div>
          )}
          {filteredLibrary.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-[40px] border border-surface-container border-dashed">
            <div className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-6">
              <Library size={40} />
            </div>
            <h3 className="text-xl font-bold mb-2">No analysis items yet</h3>
            <p className="text-on-surface-variant font-medium text-center max-w-xs">Generate a Weak Topics analysis from Analytics to save it here.</p>
            <button onClick={() => setView('camera')} className="mt-8 px-10 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg hover:scale-105 transition-all">
              Start Learning
            </button>
          </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLibrary.map((item) => (
            <div
              key={item.id}
              onClick={() => { if (wasLongPress.current) { wasLongPress.current = false; return; } navigateToKit(item.id, item.type); }}
              onPointerDown={() => startLongPress({ id: item.id, title: item.title, section: 'analysis' })}
              onPointerUp={endLongPress}
              onPointerLeave={endLongPress}
              onPointerCancel={endLongPress}
              onContextMenu={e => e.preventDefault()}
              className="bg-white border border-surface-container-high p-8 rounded-[32px] card-shadow flex flex-col justify-between transition-all hover:-translate-y-2 cursor-pointer group select-none"
            >
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${
                    item.type === 'readwrite' ? 'bg-teal-100 text-teal-700' :
                    item.type === 'visual' ? 'bg-amber-100 text-amber-700' :
                    item.type === 'aural' ? 'bg-indigo-100 text-indigo-700' :
                    item.type === 'analysis' ? 'bg-primary/10 text-primary' :
                    'bg-rose-100 text-rose-700'
                  }`}>
                    {item.type === 'analysis' ? 'Remediation' : item.type === 'aural' ? 'Audio' : item.type === 'readwrite' ? 'Read/Write' : 'Visual'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-on-surface-variant opacity-60 uppercase">{item.date}</span>
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteConfirm({ id: item.id, title: item.title, section: 'analysis' }); }}
                      onPointerDown={e => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-50 text-on-surface-variant/40 hover:text-rose-600 transition-all"
                      title="Remove this analysis"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <h4 className="text-xl font-bold text-on-surface mb-3 group-hover:text-primary transition-colors">{item.title}</h4>
                <div className="text-xs text-on-surface-variant leading-relaxed line-clamp-3 mb-6 font-medium">
                  {item.type === 'analysis' && <div dangerouslySetInnerHTML={{ __html: item.contentSnippet }} />}
                  {item.type !== 'analysis' && item.contentSnippet}
                </div>
                {item.type === 'analysis' && item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.tags.map(t => <span key={t} className="px-2 py-0.5 bg-surface-container-low text-[9px] rounded-sm font-bold text-on-surface-variant uppercase">{t}</span>)}
                  </div>
                )}
              </div>
              {item.type !== 'analysis' ? (
                <div className="space-y-4 flex-grow flex flex-col justify-end mt-6">
                  <div className="w-full bg-surface-container h-1 rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${item.progress}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                    <span>Progress</span>
                    <span className="text-on-surface">{item.progress}%</span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); navigateToKit(item.id, item.type); }} 
                    className="w-full py-3 bg-surface-container hover:bg-primary hover:text-white transition-all rounded-xl text-xs font-bold uppercase tracking-widest mt-4"
                  >
                    Resume Learning
                  </button>
                </div>
              ) : (
                <div className="space-y-4 flex-grow flex flex-col justify-end mt-6">
                  <button 
                    onClick={(e) => { e.stopPropagation(); navigateToKit(item.id, item.type); }} 
                    className="w-full py-3 bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all rounded-xl text-xs font-bold uppercase tracking-widest mt-4 flex items-center justify-center gap-2"
                  >
                    Open Remediation
                  </button>
                </div>
              )}
            </div>
          ))}
          </div>
          )}
        </div>
      )}

      {/* ── Delete confirmation modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => !deleting && setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              className="bg-white rounded-[28px] p-7 w-full max-w-sm shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Icon */}
              <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center mb-5">
                <Trash2 size={22} className="text-rose-600" />
              </div>

              {/* Header */}
              <h3 className="text-xl font-black text-on-surface mb-1">
                {deleteConfirm.section === 'tests' ? 'Remove this test result?' : 'Remove this learning session?'}
              </h3>
              <p className="text-sm font-bold text-on-surface mb-1 line-clamp-2">
                "{deleteConfirm.title}"
              </p>
              <p className="text-sm text-on-surface-variant font-medium leading-relaxed mb-7">
                {deleteConfirm.section === 'tests'
                  ? 'This test result will be permanently removed from your Tests history. Your other scores and streak are not affected.'
                  : 'This learning session will be permanently removed from your library. The content can be re-generated any time from the Chapters tab.'}
              </p>

              {/* Actions */}
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all disabled:opacity-50"
                >
                  {deleting ? 'Removing…' : 'Yes, Remove It'}
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleting}
                  className="w-full py-3 text-on-surface-variant font-bold text-sm hover:bg-surface-container-low rounded-2xl transition-all disabled:opacity-50"
                >
                  Cancel, Keep It
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
