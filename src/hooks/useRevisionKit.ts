import { useState, useCallback } from 'react';
import { aiService } from '../services/aiService';
import { ExamMode, PlanType, PaywallConfig } from '../types';
import { ChapterItem, ChapterMode } from '../data/class10Syllabus';
import { LibraryItem } from '../types';
import {
  canGenerateKitToday,
  incrementKitsUsedToday,
  getLimitsFor,
} from '../services/billingService';
import { logActivity } from '../services/activityService';
import type { RevisionKit } from '../types/kit';

interface UseRevisionKitOptions {
  planType: PlanType;
  examMode: ExamMode;
  library: LibraryItem[];
  setView: (v: string) => void;
  showToast: (msg: string, type: 'success' | 'warning' | 'error' | 'info') => void;
  setPaywallOpen: (cfg: PaywallConfig) => void;
  fetchLibrary: (opts?: { silent?: boolean }) => Promise<void>;
}

const paywallBenefits = {
  free: ['20 revision kits per day', 'Flashcards within fair use', 'PDF downloads', 'Weak-topic retests', '5 YouTube Recall kits/month'],
  plus: ['50 revision kits per day', 'Monthly revision planner', 'Written answer feedback', 'Mastery tracking', 'Priority AI queue'],
};

function buildDailyLimitPaywall(planType: PlanType, limit: number): PaywallConfig {
  return {
    title: 'Daily Limit Reached',
    description: `You have used all ${limit} revision kits for today. Upgrade to generate more kits.`,
    ctaLabel: planType === 'free' ? 'Upgrade to Plus — ₹249/mo' : 'Upgrade to Exam Pro — ₹499/mo',
    requiredPlan: planType === 'free' ? 'plus' : 'pro',
    secondaryLabel: 'Come back tomorrow',
    benefits: planType === 'free' ? paywallBenefits.free : paywallBenefits.plus,
  };
}

export function useRevisionKit({
  planType,
  examMode,
  library,
  setView,
  showToast,
  setPaywallOpen,
  fetchLibrary,
}: UseRevisionKitOptions) {
  const [kit, setKit] = useState<RevisionKit | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateKit = useCallback(async (topic: string, classLevel?: string) => {
    const gate = canGenerateKitToday(planType);
    if (!gate.allowed) {
      setPaywallOpen(buildDailyLimitPaywall(planType, gate.limit));
      return;
    }
    try {
      setIsGenerating(true);
      const kitData = await aiService.generateRevisionKit({ topic, classLevel: classLevel || 'Class 10', examMode });
      incrementKitsUsedToday();
      logActivity({ type: 'revision-kit', chapterTitle: topic, xpEarned: 20 });
      setKit(kitData as RevisionKit);
      setView('selection');
    } catch (err: any) {
      showToast(err?.message || 'Generation failed. Please try again.', 'error');
    } finally {
      setIsGenerating(false);
    }
  }, [planType, examMode, setView, showToast, setPaywallOpen]);

  // ── Chapter flow ─────────────────────────────────────────────────────────────

  const [chapterPicker, setChapterPicker] = useState<ChapterItem | null>(null);
  const [chapterGenerating, setChapterGenerating] = useState(false);
  const [chapterGenError, setChapterGenError] = useState<string | null>(null);
  const lastChapterPick = { current: null as { chapter: ChapterItem; mode: ChapterMode; language?: 'hi' | 'en'; regenerate?: boolean } | null };

  const stripModePrefix = (t: string) =>
    t.replace(/^\s*(audio|visual|read\/write|readwrite|read|write)\s*[:\-–]\s*/i, '').trim();

  const findExistingChapterKit = useCallback((chapterTitle: string, language?: 'hi' | 'en') => {
    const t = chapterTitle.trim().toLowerCase();
    return library.find(it => {
      if (it.type === 'analysis') return false;
      const tags = it.tags || [];
      const hasChapterTag = tags.includes(`chapter:${chapterTitle}`);
      const titleMatches = stripModePrefix(it.title).toLowerCase() === t;
      if (!hasChapterTag && !titleMatches) return false;
      if (language) {
        const want = `lang:${language}`;
        const langTag = tags.find(x => x.startsWith('lang:'));
        if (langTag) return langTag === want;
        return language === 'en';
      }
      return true;
    });
  }, [library]);

  const routeForMode = (mode: ChapterMode): string => {
    const map: Record<ChapterMode, string> = { visual: 'visual', audio: 'aural', readwrite: 'readwrite', practice: 'practice' };
    return map[mode] ?? 'practice';
  };

  const doGenerate = async (chapter: ChapterItem, mode: ChapterMode, language: 'hi' | 'en') => {
    return aiService.generateRevisionKit({
      topic: chapter.chapterTitle,
      chapterTitle: chapter.chapterTitle,
      subject: chapter.subject,
      classLevel: chapter.classLevel,
      examMode,
      board: chapter.board,
      mode,
      language,
      chapterId: chapter.id,
      academicYear: chapter.academicYear,
      stream: (chapter as any).stream,
    });
  };

  const openChapterMode = useCallback(async (
    chapter: ChapterItem,
    mode: ChapterMode,
    opts?: { regenerate?: boolean; language?: 'hi' | 'en' },
    onNavigate?: (kitData: RevisionKit, target: string) => void,
  ) => {
    const language: 'hi' | 'en' = opts?.language ?? (chapter.subject === 'Hindi' ? 'hi' : 'en');
    lastChapterPick.current = { chapter, mode, language, regenerate: opts?.regenerate };
    setChapterGenError(null);
    const target = routeForMode(mode);

    if (!opts?.regenerate) {
      const existing = findExistingChapterKit(chapter.chapterTitle, language);
      if (existing) {
        setChapterPicker(null);
        onNavigate?.(existing as any, target);
        return;
      }
    }

    const gate = canGenerateKitToday(planType);
    if (!gate.allowed) {
      setChapterPicker(null);
      setPaywallOpen(buildDailyLimitPaywall(planType, gate.limit));
      return;
    }

    const tryGenerate = async () => {
      const kitData = await doGenerate(chapter, mode, language);
      incrementKitsUsedToday();
      fetchLibrary({ silent: true }).catch(() => {});
      setChapterPicker(null);
      setKit(kitData as RevisionKit);
      onNavigate?.(kitData as RevisionKit, target);
    };

    try {
      setChapterGenerating(true);
      await tryGenerate();
    } catch (err: any) {
      const msg: string = err?.message || '';
      const isTransient = /too long|timed out|timeout|busy|503/i.test(msg);
      if (isTransient && !opts?.regenerate) {
        try {
          await tryGenerate();
          return;
        } catch (retryErr: any) {
          setChapterGenError(retryErr?.message || 'Generation failed after retry. Please try again.');
          return;
        }
      }
      setChapterGenError(msg || 'Generation failed. Please try again.');
    } finally {
      setChapterGenerating(false);
    }
  }, [planType, examMode, findExistingChapterKit, setPaywallOpen, fetchLibrary]);

  const retryChapterGeneration = useCallback((
    onNavigate?: (kitData: RevisionKit, target: string) => void,
  ) => {
    const last = lastChapterPick.current;
    if (!last) return;
    openChapterMode(last.chapter, last.mode, { regenerate: last.regenerate, language: last.language }, onNavigate);
  }, [openChapterMode]);

  return {
    kit,
    setKit,
    isGenerating,
    generateKit,
    // chapter flow
    chapterPicker,
    setChapterPicker,
    chapterGenerating,
    chapterGenError,
    setChapterGenError,
    findExistingChapterKit,
    openChapterMode,
    retryChapterGeneration,
  };
}
