/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Library, Eye, Mic, Zap, Edit3, BarChart3, AlertCircle, Search, Target, BookOpen, CheckCircle, Trash2, X, FileText, Upload, Type, ExternalLink, ClipboardList, Sparkles, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LibraryItem, UserStats, QuizAttempt, MasteryEntry, WrittenAnswerAttempt, PaperSource, PaperSubject, PaperYear, PaperType, getLibraryTabForItem } from '../../types';
import { TopBar } from '../common/TopBar';
import { getQuizHistory, getMastery, onLearningChange, getRevisionStatus, RevisionStatus, deduplicateQuizHistory, deleteQuizAttempt, getWrittenAnswers, deleteWrittenAnswer } from '../../services/learningService';
import { CLASS10_SYLLABUS, SUBJECTS, ChapterItem, ChapterSubject, searchSyllabus } from '../../data/class10Syllabus';
import { ClassLevel, Stream, getSubjectsForClass, searchSyllabusAll, SyllabusChapter } from '../../data/syllabus';
import { getActiveVersion } from '../../data/syllabusVersions';
import { PAPER_CATALOGUE, PAPER_SUBJECTS, PAPER_YEARS, PAPER_TYPES, filterPapers } from '../../data/previousYearPapers';

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
  /** Generates an AI practice test matching the pattern of a previous year paper. */
  onGeneratePracticeFromPattern?: (paper: PaperSource) => void;
  /** Saves a paper reference to the user's library. */
  onSavePaperToLibrary?: (paper: PaperSource) => void;
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

export const LibraryView = ({ library, stats, setView, navigateToKit, navigateToMistakes, viewWrongAnswers, goToScoreAnalysis, onPickChapter, onRemoveDuplicates, onDeleteLibraryItem, onGeneratePracticeFromPattern, onSavePaperToLibrary }: LibraryViewProps) => {
  // Four sections — Chapters is the default landing tab; Saved shows explicitly
  // bookmarked learning sessions; Analysis and Tests have their own branches.
  const [librarySection, setLibrarySection] = useState<'chapters' | 'saved' | 'tests' | 'analysis'>('chapters');
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
  const [writtenAnswers, setWrittenAnswers] = useState<WrittenAnswerAttempt[]>([]);
  const [chapterSearch, setChapterSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<ChapterSubject | 'All'>('All');
  const [classLevel, setClassLevel] = useState<ClassLevel>('Class 10');
  const [stream, setStream] = useState<Stream>('Science');

  // ── Previous Year Papers filter state ───────────────────────────────────────
  const [paperSubjectFilter, setPaperSubjectFilter] = useState<PaperSubject | 'All'>('All');
  const [paperYearFilter, setPaperYearFilter] = useState<PaperYear | 'All'>('All');
  const [paperTypeFilter, setPaperTypeFilter] = useState<PaperType | 'All'>('All');
  const [savedPaperIds, setSavedPaperIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('lumina-saved-papers') || '[]')); } catch { return new Set(); }
  });

  const filteredPapers = useMemo(
    () => filterPapers(PAPER_CATALOGUE, { subject: paperSubjectFilter, year: paperYearFilter, type: paperTypeFilter }),
    [paperSubjectFilter, paperYearFilter, paperTypeFilter],
  );

  const handleSavePaper = useCallback((paper: PaperSource) => {
    setSavedPaperIds(prev => {
      const next = new Set(prev);
      if (next.has(paper.id)) next.delete(paper.id); else next.add(paper.id);
      localStorage.setItem('lumina-saved-papers', JSON.stringify([...next]));
      return next;
    });
    onSavePaperToLibrary?.(paper);
  }, [onSavePaperToLibrary]);

  // ── Fallback modal (shown when direct PDF is unverified or missing) ──────
  const [fallbackPaper, setFallbackPaper] = useState<PaperSource | null>(null);
  const [fallbackContext, setFallbackContext] = useState<'pdf' | 'marking-scheme'>('pdf');

  const openPaperLink = useCallback((paper: PaperSource, linkType: 'pdf' | 'marking-scheme') => {
    if (linkType === 'pdf') {
      if (paper.directPdfUrl && paper.pdfStatus === 'verified') {
        window.open(paper.directPdfUrl, '_blank', 'noopener,noreferrer');
      } else {
        setFallbackContext('pdf');
        setFallbackPaper(paper);
      }
    } else {
      if (paper.markingSchemeUrl && paper.markingSchemeStatus === 'verified') {
        window.open(paper.markingSchemeUrl, '_blank', 'noopener,noreferrer');
      } else {
        setFallbackContext('marking-scheme');
        setFallbackPaper(paper);
      }
    }
  }, []);

  useEffect(() => {
    const refresh = () => {
      setQuizAttempts(getQuizHistory());
      setMastery(getMastery());
      setWrittenAnswers(getWrittenAnswers());
    };
    refresh();
    return onLearningChange(refresh);
  }, []);

  // Strip legacy "Audio: " / "Visual: " / "Read/Write: " prefixes used by older saves.
  const stripModePrefix = (t: string) =>
    t.replace(/^\s*(audio|visual|read\/write|readwrite|read|write)\s*[:\-–]\s*/i, '').trim();

  /**
   * Compute a meaningful progress % for a saved library item.
   * - 30%: Kit content exists (it was saved → it exists)
   * - 20%: Has multiple learning modes saved for this chapter
   * - 25%: Quiz taken for this topic
   * - 25%: Mastery score (mapped from 0-100 → 0-25)
   */
  const computeProgress = (item: LibraryItem): number => {
    const titleKey = stripModePrefix(item.title).toLowerCase();
    let progress = 30; // Base: content was generated & saved

    // +20 if multiple modes saved for this chapter
    const siblings = library.filter(it =>
      getLibraryTabForItem(it.type) === 'saved' &&
      stripModePrefix(it.title).toLowerCase() === titleKey
    );
    if (siblings.length > 1) progress += 20;

    // +25 if a quiz was taken for this topic
    const hasQuiz = quizAttempts.some(q =>
      (q.topic || '').toLowerCase().includes(titleKey) ||
      titleKey.includes((q.topic || '').toLowerCase()) ||
      (q.chapterTitle || '').toLowerCase() === titleKey
    );
    if (hasQuiz) progress += 25;

    // +25 based on mastery score
    const m = mastery.find(me =>
      me.topic.trim().toLowerCase() === titleKey ||
      titleKey.includes(me.topic.trim().toLowerCase())
    );
    if (m) {
      progress += Math.round((m.masteryScore / 100) * 25);
    }

    return Math.min(progress, 100);
  };

  // Group saved revision kits by chapter title (after stripping legacy prefixes).
  const savedByTitle = useMemo(() => {
    const byTitle = new Map<string, LibraryItem[]>();
    library.filter(it => getLibraryTabForItem(it.type) === 'saved').forEach(it => {
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

  // Count duplicate (stripped-title, type) pairs across saved items.
  const savedDuplicateCount = useMemo(() => {
    const seen = new Map<string, number>();
    library.filter(it => getLibraryTabForItem(it.type) === 'saved').forEach(it => {
      const key = `${stripModePrefix(it.title).toLowerCase()}::${it.type}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    });
    let extras = 0;
    seen.forEach(n => { if (n > 1) extras += n - 1; });
    return extras;
  }, [library]);

  const analysisDuplicateCount = useMemo(() => {
    const seen = new Map<string, number>();
    library.filter(it => getLibraryTabForItem(it.type) === 'analysis').forEach(it => {
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
  // Get subjects for current class/stream selection
  const currentSubjects = useMemo(
    () => getSubjectsForClass(classLevel, classLevel !== 'Class 10' ? stream : undefined),
    [classLevel, stream],
  );

  // Reset subject filter when class/stream changes
  useEffect(() => { setSubjectFilter('All'); }, [classLevel, stream]);

  const chapterCards = useMemo(() => {
    let syllabus: ChapterItem[];
    if (classLevel === 'Class 10') {
      syllabus = searchSyllabus(chapterSearch, subjectFilter as ChapterSubject | 'All');
    } else {
      syllabus = searchSyllabusAll(classLevel, stream, chapterSearch, subjectFilter === 'All' ? undefined : subjectFilter) as unknown as ChapterItem[];
    }
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
  }, [savedByTitle, masteryByTopic, chapterSearch, subjectFilter, classLevel, stream]);

  // O(M) index built once; avoids O(N×M) per-card filter inside the quizScores loop
  const mistakesByTopic = useMemo(() => {
    const map = new Map<string, number>();
    stats?.mistakes?.forEach(m => {
      map.set(m.topic, (map.get(m.topic) ?? 0) + 1);
    });
    return map;
  }, [stats?.mistakes]);

  // Analysis tab renders only analysis-type items (score analysis, weak topics, etc.).
  const filteredLibrary = library.filter(item => getLibraryTabForItem(item.type) === 'analysis');

  // Saved library items that were saved as papers (appear in Tests tab alongside quiz attempts).
  const savedPaperItems = useMemo(
    () => library.filter(item => getLibraryTabForItem(item.type) === 'tests'),
    [library],
  );

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
          onClick={() => setLibrarySection('tests')}
          className={`flex-1 py-4 font-bold text-sm tracking-widest uppercase transition-colors border-b-2 ${
            librarySection === 'tests' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-on-surface'
          }`}
        >
          Tests
        </button>
        <button
          onClick={() => setLibrarySection('analysis')}
          className={`flex-1 py-4 font-bold text-sm tracking-widest uppercase transition-colors border-b-2 ${
            librarySection === 'analysis' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-on-surface'
          }`}
        >
          Analysis
        </button>
      </div>

      {librarySection === 'chapters' ? (
        <div className="space-y-6 pb-20">
          {/* Class Level selector */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Class:</span>
            {(['Class 10', 'Class 11', 'Class 12'] as ClassLevel[]).map(cl => (
              <button
                key={cl}
                onClick={() => setClassLevel(cl)}
                className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
                  classLevel === cl
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-white border border-surface-container text-on-surface-variant hover:border-primary/30'
                }`}
              >
                {cl}
              </button>
            ))}

            {/* Stream selector — only for Class 11 & 12 */}
            {classLevel !== 'Class 10' && (
              <>
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-2">Stream:</span>
                {(['Science', 'Commerce'] as Stream[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setStream(s)}
                    className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
                      stream === s
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-white border border-surface-container text-on-surface-variant hover:border-indigo-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Search */}
          <div className="relative max-w-xl">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              value={chapterSearch}
              onChange={e => setChapterSearch(e.target.value)}
              placeholder="Search chapters, subjects, or topics..."
              className="w-full bg-white border border-surface-container-high rounded-2xl pl-11 pr-4 py-3 text-sm font-medium focus:outline-none focus:border-primary"
            />
          </div>

          {/* Subject filter pills */}
          <div className="flex flex-wrap gap-2">
            {(['All', ...currentSubjects] as const).map(s => {
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
                Try a different keyword or clear the subject filter to see the full {classLevel} CBSE syllabus.
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
        const savedItems = library.filter(it => getLibraryTabForItem(it.type) === 'saved');
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
        /** Subject-based accent color for left border & progress bar */
        const subjectAccent = (tags?: string[]) => {
          if (!tags) return { border: 'border-l-primary', bar: 'bg-primary', bg: 'bg-primary/5', tagBg: 'bg-primary/10 text-primary' };
          const sub = tags.find(t => ['science','physics','chemistry','biology','mathematics','maths','english','hindi','social science','accountancy','business studies','economics','history','geography','political science'].includes(t.toLowerCase()));
          const s = (sub || '').toLowerCase();
          if (['physics','science'].includes(s))            return { border: 'border-l-blue-500',    bar: 'bg-blue-500',    bg: 'bg-blue-50',    tagBg: 'bg-blue-100 text-blue-700' };
          if (s === 'chemistry')                            return { border: 'border-l-emerald-500', bar: 'bg-emerald-500', bg: 'bg-emerald-50', tagBg: 'bg-emerald-100 text-emerald-700' };
          if (s === 'biology')                              return { border: 'border-l-green-500',   bar: 'bg-green-500',   bg: 'bg-green-50',   tagBg: 'bg-green-100 text-green-700' };
          if (['mathematics','maths'].includes(s))          return { border: 'border-l-violet-500',  bar: 'bg-violet-500',  bg: 'bg-violet-50',  tagBg: 'bg-violet-100 text-violet-700' };
          if (s === 'english')                              return { border: 'border-l-rose-500',    bar: 'bg-rose-500',    bg: 'bg-rose-50',    tagBg: 'bg-rose-100 text-rose-700' };
          if (s === 'hindi')                                return { border: 'border-l-orange-500',  bar: 'bg-orange-500',  bg: 'bg-orange-50',  tagBg: 'bg-orange-100 text-orange-700' };
          if (['social science','history','geography','political science'].includes(s)) return { border: 'border-l-amber-500', bar: 'bg-amber-500', bg: 'bg-amber-50', tagBg: 'bg-amber-100 text-amber-700' };
          if (['accountancy','business studies','economics'].includes(s)) return { border: 'border-l-cyan-500', bar: 'bg-cyan-500', bg: 'bg-cyan-50', tagBg: 'bg-cyan-100 text-cyan-700' };
          return { border: 'border-l-primary', bar: 'bg-primary', bg: 'bg-primary/5', tagBg: 'bg-primary/10 text-primary' };
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
                {filtered.map(item => {
                  const accent = subjectAccent(item.tags);
                  const progress = computeProgress(item);
                  const visibleTags = (item.tags || []).filter(t => !t.startsWith('lang:') && !t.startsWith('chapter:') && !(t === 'JEE' && (item.tags || []).includes('Class 10')));
                  return (
                    <div
                      key={item.id}
                      onClick={() => { if (wasLongPress.current) { wasLongPress.current = false; return; } navigateToKit(item.id, item.type); }}
                      onPointerDown={() => startLongPress({ id: item.id, title: stripModePrefix(item.title), section: 'saved' })}
                      onPointerUp={endLongPress}
                      onPointerLeave={endLongPress}
                      onPointerCancel={endLongPress}
                      onContextMenu={e => e.preventDefault()}
                      className={`${accent.bg} border border-surface-container border-l-4 ${accent.border} rounded-2xl p-6 shadow-sm flex flex-col cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all group select-none`}
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
                        <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2 mb-3 font-medium">
                          {item.contentSnippet}
                        </p>
                      )}

                      {visibleTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {visibleTags.slice(0, 3).map(t => (
                            <span key={t} className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${accent.tagBg}`}>{t}</span>
                          ))}
                        </div>
                      )}

                      <div className="mt-auto pt-3 border-t border-black/5 space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                          <span>Progress</span>
                          <span className={`${progress >= 75 ? 'text-emerald-600' : progress >= 40 ? 'text-amber-600' : 'text-on-surface'} font-black`}>{progress}%</span>
                        </div>
                        <div className="w-full bg-black/5 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${progress >= 75 ? 'bg-emerald-500' : progress >= 40 ? 'bg-amber-500' : accent.bar}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); navigateToKit(item.id, item.type); }}
                          className={`w-full py-2.5 ${accent.bar} text-white hover:brightness-110 transition-all rounded-xl text-[11px] font-black uppercase tracking-widest mt-1`}
                        >
                          Resume Learning
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })() : librarySection === 'tests' ? (
          <div className="space-y-6 pb-20">
          {quizAttempts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-[32px] border border-surface-container border-dashed">
              <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
                <Zap size={32} />
              </div>
              <h3 className="text-lg font-bold mb-1">No tests yet</h3>
              <p className="text-on-surface-variant font-medium text-center max-w-xs text-sm">Complete a hub quiz to save your scores and review wrong answers here.</p>
              <button onClick={() => setView('dashboard')} className="mt-6 px-8 py-3 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-md hover:scale-105 transition-all">
                Start a Test
              </button>
            </div>
          ) : (
          <div className="space-y-6">
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
          )}

          {/* ── Previous Year Papers ──────────────────────────────────────── */}
          <div className="mt-10 pt-8 border-t border-surface-container-high">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
                <ClipboardList size={20} className="text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-on-surface">Previous Year Papers</h3>
                <p className="text-xs text-on-surface-variant font-medium">Official CBSE papers — opens cbse.gov.in directly</p>
              </div>
            </div>

            {/* Filter pills */}
            <div className="space-y-3 mb-6">
              {/* Subject */}
              <div className="flex flex-wrap gap-2">
                {(['All', ...PAPER_SUBJECTS] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setPaperSubjectFilter(s as PaperSubject | 'All')}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                      paperSubjectFilter === s
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white border border-surface-container text-on-surface-variant hover:border-blue-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {/* Year + Type */}
              <div className="flex flex-wrap gap-2">
                {(['All', ...PAPER_YEARS] as const).map(y => (
                  <button
                    key={y}
                    onClick={() => setPaperYearFilter(y as PaperYear | 'All')}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                      paperYearFilter === y
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white border border-surface-container text-on-surface-variant hover:border-blue-300'
                    }`}
                  >
                    {y}
                  </button>
                ))}
                <span className="w-px h-6 bg-surface-container-high self-center mx-1" />
                {PAPER_TYPES.map(pt => (
                  <button
                    key={pt.value}
                    onClick={() => setPaperTypeFilter(paperTypeFilter === pt.value ? 'All' : pt.value)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                      paperTypeFilter === pt.value
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white border border-surface-container text-on-surface-variant hover:border-blue-300'
                    }`}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredPapers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-[32px] border border-surface-container border-dashed text-center">
                <ClipboardList size={32} className="text-on-surface-variant/40 mb-3" />
                <h4 className="text-base font-bold mb-1">No papers match these filters</h4>
                <p className="text-sm text-on-surface-variant font-medium max-w-xs">Try changing the subject, year, or paper type.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {filteredPapers.map(paper => {
                  const isSaved = savedPaperIds.has(paper.id);
                  const typeColor = paper.type === 'previous-year' ? 'bg-blue-100 text-blue-700'
                    : paper.type === 'sample-paper' ? 'bg-violet-100 text-violet-700'
                    : 'bg-emerald-100 text-emerald-700';
                  const hasPdf = !!paper.directPdfUrl;
                  const pdfVerified = paper.pdfStatus === 'verified';
                  const msVerified = paper.markingSchemeStatus === 'verified';
                  return (
                    <div
                      key={paper.id}
                      className="bg-white border border-surface-container rounded-[24px] p-6 shadow-sm flex flex-col hover:shadow-md hover:border-blue-200 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${typeColor}`}>
                          {paper.type.replace('-', ' ')}
                        </span>
                        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                          {pdfVerified && msVerified ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase tracking-widest">
                              <CheckCircle size={8} /> Verified
                            </span>
                          ) : (
                            <>
                              {pdfVerified ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase tracking-widest">
                                  <CheckCircle size={8} /> PDF
                                </span>
                              ) : hasPdf ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[8px] font-black uppercase tracking-widest">
                                  <AlertCircle size={8} /> PDF needs review
                                </span>
                              ) : null}
                              {msVerified ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase tracking-widest">
                                  <CheckCircle size={8} /> MS
                                </span>
                              ) : paper.markingSchemeUrl && !msVerified ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[8px] font-black uppercase tracking-widest">
                                  <AlertCircle size={8} /> MS needs review
                                </span>
                              ) : null}
                              {!hasPdf && !paper.markingSchemeUrl && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[8px] font-black uppercase tracking-widest">
                                  <ExternalLink size={8} /> Official page
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-on-surface-variant/60 uppercase mb-1">
                        {paper.setLabel && <span>{paper.setLabel} · </span>}
                        <span>{paper.year}</span>
                      </div>

                      <h4 className="text-base font-bold text-on-surface leading-snug mb-1">{paper.subject}</h4>
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-4">
                        {paper.classLevel} · {paper.board} · Source: {paper.sourceName}
                      </p>

                      <div className="mt-auto pt-4 border-t border-surface-container-low space-y-2">
                        {/* Row 1: Open Paper + Marking Scheme */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => hasPdf ? openPaperLink(paper, 'pdf') : window.open(paper.officialIndexUrl, '_blank', 'noopener,noreferrer')}
                            className="flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all"
                          >
                            <ExternalLink size={11} /> {hasPdf ? 'Open Paper' : 'Official Page'}
                          </button>
                          {paper.markingSchemeUrl ? (
                            <button
                              onClick={() => openPaperLink(paper, 'marking-scheme')}
                              className="flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all"
                            >
                              <ClipboardList size={11} /> Marking Scheme
                            </button>
                          ) : (
                            <button disabled className="flex items-center justify-center gap-1.5 py-2.5 bg-surface-container text-on-surface-variant/50 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-not-allowed">
                              <ClipboardList size={11} /> No Scheme
                            </button>
                          )}
                        </div>
                        {/* Row 2: Practice Test + Save */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => onGeneratePracticeFromPattern?.(paper)}
                            className="flex items-center justify-center gap-1.5 py-2.5 bg-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all"
                          >
                            <Sparkles size={11} /> Practice Test
                          </button>
                          <button
                            onClick={() => handleSavePaper(paper)}
                            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                              isSaved
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                            }`}
                          >
                            <Bookmark size={11} className={isSaved ? 'fill-amber-500' : ''} /> {isSaved ? 'Saved' : 'Save'}
                          </button>
                        </div>
                        {/* Row 3: Official CBSE Page link (always show for papers with direct PDFs) */}
                        {hasPdf && (
                          <a
                            href={paper.officialIndexUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1.5 py-2 text-blue-600 hover:text-blue-800 text-[9px] font-bold uppercase tracking-widest transition-colors"
                          >
                            <ExternalLink size={9} /> Open Official CBSE Page
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Written Answer Attempts ────────────────────────────────────── */}
          {writtenAnswers.length > 0 && (
            <div className="mt-10 pt-8 border-t border-surface-container-high">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 flex items-center justify-center">
                  <FileText size={20} className="text-teal-600" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-on-surface">Written Answer Practice</h3>
                  <p className="text-xs text-on-surface-variant font-medium">Your exam-style written answer attempts</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {writtenAnswers.map(attempt => {
                  const pct = attempt.totalMarks > 0 ? Math.round((attempt.marksScored / attempt.totalMarks) * 100) : 0;
                  const passed = pct >= 60;
                  return (
                    <div
                      key={attempt.id}
                      className="bg-white border border-surface-container-high p-6 rounded-[28px] card-shadow flex flex-col group"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {attempt.marksScored}/{attempt.totalMarks}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            attempt.answerMode === 'uploaded' ? 'bg-indigo-100 text-indigo-600' : 'bg-teal-100 text-teal-600'
                          }`}>
                            {attempt.answerMode === 'uploaded' ? 'Uploaded' : 'Typed'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-on-surface-variant opacity-60 uppercase">
                            {new Date(attempt.date).toLocaleDateString()}
                          </span>
                          <button
                            onClick={() => { deleteWrittenAnswer(attempt.id); setWrittenAnswers(getWrittenAnswers()); }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-50 text-on-surface-variant/40 hover:text-rose-600 transition-all"
                            title="Remove this answer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant mb-1">{attempt.topic} · {attempt.subject}</p>
                      <p className="text-sm font-bold text-on-surface mb-3 leading-snug line-clamp-2">{attempt.question}</p>

                      <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden mb-3">
                        <div className={`h-full ${passed ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
                      </div>

                      {(attempt.missingKeywords?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {attempt.missingKeywords!.slice(0, 3).map((kw, i) => (
                            <span key={i} className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded text-[9px] font-bold">{kw}</span>
                          ))}
                          {attempt.missingKeywords!.length > 3 && (
                            <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded text-[9px] font-bold">+{attempt.missingKeywords!.length - 3}</span>
                          )}
                        </div>
                      )}

                      {attempt.examTip && (
                        <p className="text-[10px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-2 mb-3 font-medium leading-relaxed line-clamp-2">{attempt.examTip}</p>
                      )}

                      <div className="mt-auto pt-3 border-t border-surface-container-low">
                        <p className="text-[10px] text-on-surface-variant font-medium leading-relaxed line-clamp-2 mb-2">{(attempt.studentAnswer || '').substring(0, 120)}{(attempt.studentAnswer || '').length > 120 ? '…' : ''}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </div>
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
                    getLibraryTabForItem(item.type) === 'analysis' ? 'bg-primary/10 text-primary' :
                    'bg-rose-100 text-rose-700'
                  }`}>
                    {item.type === 'score-analysis' ? 'Score Analysis' :
                     item.type === 'weak-topic-analysis' ? 'Weak Topics' :
                     item.type === 'mastery-report' ? 'Mastery Report' :
                     item.type === 'mistake-analysis' ? 'Mistake Analysis' :
                     getLibraryTabForItem(item.type) === 'analysis' ? 'Remediation' :
                     item.type === 'aural' ? 'Audio' : item.type === 'readwrite' ? 'Read/Write' : 'Visual'}
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
                  {getLibraryTabForItem(item.type) === 'analysis' && <div dangerouslySetInnerHTML={{ __html: item.contentSnippet }} />}
                  {getLibraryTabForItem(item.type) !== 'analysis' && item.contentSnippet}
                </div>
                {getLibraryTabForItem(item.type) === 'analysis' && item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.tags.filter(t => !t.startsWith('lang:') && !t.startsWith('chapter:') && !(t === 'JEE' && item.tags.includes('Class 10'))).map(t => <span key={t} className="px-2 py-0.5 bg-surface-container-low text-[9px] rounded-sm font-bold text-on-surface-variant uppercase">{t}</span>)}
                  </div>
                )}
              </div>
              {getLibraryTabForItem(item.type) !== 'analysis' ? (
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

      {/* ── Paper link fallback modal ──────────────────────────────────── */}
      <AnimatePresence>
        {fallbackPaper && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setFallbackPaper(null)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              className="bg-white rounded-[28px] p-7 w-full max-w-sm shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-5">
                <AlertCircle size={22} className="text-amber-600" />
              </div>

              <h3 className="text-xl font-black text-on-surface mb-1">
                {fallbackContext === 'pdf' ? 'PDF link needs review' : 'Marking scheme link needs review'}
              </h3>
              <p className="text-sm text-on-surface-variant font-medium leading-relaxed mb-2">
                {fallbackContext === 'pdf'
                  ? 'The direct PDF link needs review. Open the official CBSE page where the paper is listed.'
                  : 'The direct marking scheme link needs review. Open the official CBSE page where the marking scheme is listed.'}
              </p>
              <p className="text-xs text-on-surface-variant/70 font-medium mb-6">
                {fallbackPaper.subject} · {fallbackPaper.year} · {fallbackPaper.type.replace('-', ' ')}
              </p>

              <div className="flex flex-col gap-2.5">
                <a
                  href={fallbackPaper.officialIndexUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all text-center"
                >
                  Open Official CBSE Page
                </a>
                <button
                  onClick={() => {
                    console.warn(`[Lumina] Broken link reported: ${fallbackContext} — ${fallbackPaper.subject} ${fallbackPaper.year} (${fallbackPaper.type})`);
                    setFallbackPaper(null);
                  }}
                  className="w-full py-3 text-amber-700 font-bold text-sm hover:bg-amber-50 rounded-2xl transition-all"
                >
                  Report Broken Link
                </button>
                <button
                  onClick={() => setFallbackPaper(null)}
                  className="w-full py-3 text-on-surface-variant font-bold text-sm hover:bg-surface-container-low rounded-2xl transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
