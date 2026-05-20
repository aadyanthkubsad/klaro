/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
// Removing genai import to prevent frontend key usage
import { aiService } from './services/aiService';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './components/views/Dashboard';
import { LibraryView } from './components/views/LibraryView';
import { AnalyticsView } from './components/views/AnalyticsView';
import { ProgressView } from './components/views/ProgressView';
import { TestsView } from './components/views/TestsView';
import { SettingsView } from './components/views/SettingsView';
import { LearningStyleSelector } from './components/views/LearningStyleSelector';
import { CameraScan } from './components/views/CameraScan';
import { VisualHub } from './components/views/VisualHub';
import { RevisionEngineView } from './components/views/RevisionEngineView';
import { ReadWriteHub } from './components/views/ReadWriteHub';
import { AuralHub } from './components/views/AuralHub';
import { QuizView } from './components/views/QuizView';
import { MistakesNotebook } from './components/views/MistakesNotebook';
import { AIQuizView } from './components/views/AIQuizView';
import { DoubtSolver } from './components/views/DoubtSolver';
import { OffersView } from './components/views/OffersView';
import { PracticeView } from './components/views/PracticeView';
import { LandingPage } from './components/views/LandingPage';
import { LibraryItem, UserStats, ExamMode } from './types';
import { updateLibraryItems } from './services/libraryService';
import { TodoView } from './components/views/TodoView';
import { TestReviewView } from './components/views/TestReviewView';
import { FlashcardsView } from './components/views/FlashcardsView';
import { MonthlyPlannerView } from './components/views/MonthlyPlannerView';
import { YouTubeStudyView } from './components/views/YouTubeStudyView';
import { ChapterModeSelector } from './components/views/ChapterModeSelector';
import { ChapterItem, ChapterMode } from './data/class10Syllabus';
import { FlashcardSet, PaywallConfig, PlanType, LearningMode } from './types';
import {
  getPlan, setPlan, onPlanChange, getLimitsFor,
  canGenerateKitToday, incrementKitsUsedToday, getKitsUsedToday,
  DEV_FORCE_PRO,
} from './services/billingService';

export default function App() {
  console.log('App rendering');
  const [view, _setViewRaw] = useState('landing');
  // Navigation history — every setView() call pushes the *previous* view so
  // the global Back pill always returns the user to where they came from.
  const [viewHistory, setViewHistory] = useState<string[]>([]);
  // Track current view via a ref so the setView callback stays stable and
  // we never push the previous view from inside a state-updater closure
  // (React strict-mode would double-invoke that and corrupt the stack).
  const viewRef = React.useRef(view);
  React.useEffect(() => { viewRef.current = view; }, [view]);
  const skipHistoryRef = React.useRef(false);
  const setView = React.useCallback((next: string) => {
    if (!skipHistoryRef.current && viewRef.current && viewRef.current !== next) {
      setViewHistory(h => [...h, viewRef.current]);
    }
    skipHistoryRef.current = false;
    _setViewRaw(next);
  }, []);
  const goBack = React.useCallback(() => {
    setViewHistory(h => {
      if (h.length === 0) {
        skipHistoryRef.current = true;
        _setViewRaw('dashboard');
        return h;
      }
      const last = h[h.length - 1];
      skipHistoryRef.current = true;
      _setViewRaw(last);
      return h.slice(0, -1);
    });
  }, []);
  const [examMode, setExamMode] = useState<ExamMode>('JEE');
  const [userStats, setUserStats] = useState<UserStats>({
    streak: 0,
    xp: 0,
    level: 1,
    weakTopics: [],
    strengths: [],
    quizScores: [],
    mistakes: []
  });
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [currentRevisionKit, setCurrentRevisionKit] = useState<any>(null);
  const [currentVarkifyKit, setCurrentVarkifyKit] = useState<any>(null);
  const [currentAIQuiz, setCurrentAIQuiz] = useState<any>(null);
  // Track which source spawned the current AI quiz so it gets the right modeUsed tag.
  const [currentAIQuizMode, setCurrentAIQuizMode] = useState<LearningMode>('revision-kit');
  const [analyticsTab, setAnalyticsTab] = useState<'test_analysis' | 'weak_topics' | 'score_analysis'>('test_analysis');
  const [selectedQuizAttemptId, setSelectedQuizAttemptId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Flashcards (shared player)
  const [flashcardSet, setFlashcardSet] = useState<FlashcardSet | null>(null);
  const [flashcardsLoading, setFlashcardsLoading] = useState(false);
  const [flashcardsError, setFlashcardsError] = useState<string | null>(null);
  const [lastFlashcardRequest, setLastFlashcardRequest] = useState<{ topic: string; sourceKitId?: string } | null>(null);

  // Billing — planType drives all premium gating. No real payment gateway yet.
  const [planType, setPlanTypeState] = useState<PlanType>(() => getPlan());
  React.useEffect(() => onPlanChange(() => setPlanTypeState(getPlan())), []);
  const isPlus = planType === 'plus' || planType === 'pro';
  const isPro = planType === 'pro';
  const isPremium = isPlus; // legacy alias for views still reading it
  const planLimits = getLimitsFor(planType);
  const changePlan = React.useCallback((next: PlanType) => {
    setPlan(next);
    setPlanTypeState(next);
  }, []);

  // Paywall modal — accepts a structured config so each trigger can supply
  // its own copy, required plan, and secondary action.
  const [paywallOpen, setPaywallOpen] = useState<PaywallConfig | null>(null);

  const fetchRealData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/dashboard-data');
      if (!response.ok) throw new Error('Failed to fetch data');
      const result = await response.json();
      if (result.success) {
        setLibrary(result.data.library);
        setUserStats(result.data.stats);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRealData();
  }, []);

  const saveToLibrary = async (item: Partial<LibraryItem>, customKit?: any) => {
    try {
      const response = await fetch('/api/save-to-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item, kit: customKit || currentRevisionKit })
      });
      
      const result = await response.json();
      if (result.success) {
        setLibrary(result.data.library);
        setUserStats(result.data.stats);
        alert(library.some(i => i.title === item.title) ? `Updated "${item.title}" in your Library!` : "Saved to your Library!");
      }
    } catch (error) {
      console.error('Error saving to library:', error);
      alert('Failed to save to library');
    }
  };

  const saveMistake = async (mistake: { question: string, userAnswer: string, correction: string, mode: 'visual' | 'aural' | 'readwrite', topic: string }) => {
    try {
      const exists = userStats.mistakes.some(m => m.question === mistake.question);
      if (exists) {
        alert("Wait, you've made this mistake before! Focus on this topic.");
        return;
      }
      
      const newMistakes = [...userStats.mistakes, { ...mistake, date: new Date().toLocaleDateString() }];
      
      const topicCounts: Record<string, number> = {};
      newMistakes.forEach(m => {
        topicCounts[m.topic] = (topicCounts[m.topic] || 0) + 1;
      });
      
      const weakTopics = Object.keys(topicCounts).filter(topic => topicCounts[topic] >= 1);
      
      const response = await fetch('/api/update-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mistakes: newMistakes, weakTopics })
      });
      
      if (response.ok) {
        const result = await response.json();
        setUserStats(result.data);
        alert("Added to mistakes notebook!");
      }
    } catch (err) {
      console.error("Failed to save mistake", err);
    }
  };

  const saveQuizScore = async (scoreData: { quizTitle: string; score: number; total: number; topic: string; date: string }) => {
    try {
      const newScores = [...(userStats.quizScores || []), scoreData];
      const response = await fetch('/api/update-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizScores: newScores })
      });
      
      if (response.ok) {
        const result = await response.json();
        setUserStats(result.data);
      }
    } catch (err) {
      console.error("Failed to save score", err);
    }
  };

  /**
   * Generate a comprehensive revision kit for a topic.
   * Plan-gated: free users get 3/day, Plus 20/day, Pro unlimited.
   * AI work happens server-side via aiService → /api/generate-kit.
   */
  const generateKit = async (topic: string, classLevel?: string) => {
    const gate = canGenerateKitToday(planType);
    if (!gate.allowed) {
      setPaywallOpen({
        title: 'Daily Limit Reached',
        description: 'You have used your free revision kits for today. Upgrade to continue learning without limits.',
        ctaLabel: 'Upgrade to Plus',
        requiredPlan: 'plus',
        secondaryLabel: 'Come back tomorrow',
        benefits: [
          '20 revision kits per day',
          'Unlimited flashcards',
          'PDF export of revision notes',
          'Audio summaries',
          'Mistake slideshow review',
        ],
      });
      return;
    }
    try {
      setIsLoading(true);
      const kitData = await aiService.generateRevisionKit({
        topic,
        classLevel: classLevel || 'Class 10',
        examMode,
      });
      incrementKitsUsedToday();
      setCurrentRevisionKit(kitData);
      setView('selection');
    } catch (err: any) {
      console.error('Error generating kit:', err);
      alert(err?.message || 'Generation failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateFocusedReview = async () => {
    try {
      setIsLoading(true);
      const quiz = await aiService.generateFocusedReview(userStats.weakTopics, userStats.mistakes);
      // Normalise: ensure questions array always exists
      const quizObj = Array.isArray(quiz)
        ? { title: 'Focused Review Quiz', questions: quiz }
        : (quiz?.questions ? quiz : { title: 'Focused Review Quiz', questions: [] });
      setCurrentAIQuiz(quizObj);
      setView('ai-quiz');
    } catch (err) {
      console.error('Error generating focused review:', err);
      alert('Failed to generate focused review. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const [currentAnalysis, setCurrentAnalysis] = useState<any>(null);
  const [mistakesTopicFilter, setMistakesTopicFilter] = useState<string | null>(null);

  const goToAnalyticsWeakTopics = () => {
    setCurrentAnalysis(null);
    setAnalyticsTab('weak_topics');
    setView('analytics');
  };

  const goToScoreAnalysis = () => {
    setCurrentAnalysis(null);
    setAnalyticsTab('score_analysis');
    setView('analytics');
  };

  const viewWrongAnswers = (attemptId: string) => {
    setSelectedQuizAttemptId(attemptId);
    setView('test-review');
  };

  /**
   * Resolve flashcards for a topic — used by every "Open Flashcards" button.
   * Priority:
   *   1. currentRevisionKit.flashcards if topic matches
   *   2. library kit by id (fetch /api/get-kit/<id>) if sourceKitId given
   *   3. /api/generate-flashcards as fallback
   */
  const openFlashcards = async (topic: string, sourceKitId?: string) => {
    setView('flashcards');
    setFlashcardsError(null);
    setLastFlashcardRequest({ topic, sourceKitId });

    // Try the current kit first
    const cur = currentRevisionKit;
    const kitCards = cur?.flashcards?.cards || cur?.flashcards;
    if (
      Array.isArray(kitCards) &&
      kitCards.length > 0 &&
      (!topic || cur?.title === topic || cur?.topic === topic || !cur?.title)
    ) {
      setFlashcardSet({
        topic: cur?.title || cur?.topic || topic,
        cards: kitCards.map((c: any) => ({
          front: c.front,
          back: c.back,
          topicTag: c.topicTag,
          difficulty: c.difficulty,
        })),
        sourceKitId: cur?.id || sourceKitId,
      });
      return;
    }

    // Try fetching a library kit
    if (sourceKitId) {
      try {
        const res = await fetch(`/api/get-kit/${sourceKitId}`);
        if (res.ok) {
          const json = await res.json();
          const cards = json?.data?.flashcards?.cards || json?.data?.flashcards;
          if (Array.isArray(cards) && cards.length > 0) {
            setFlashcardSet({
              topic: json.data.title || topic,
              cards,
              sourceKitId,
            });
            return;
          }
        }
      } catch { /* fall through */ }
    }

    // Last resort: generate fresh ones
    setFlashcardSet(null);
    setFlashcardsLoading(true);
    try {
      const data = await aiService.generateFlashcards({
        topic,
        classLevel: 'Class 10',
        examMode: 'CBSE',
      });
      setFlashcardSet({ topic: data.topic, cards: data.flashcards, sourceKitId });
    } catch (e: any) {
      setFlashcardsError(e?.message || 'Failed to generate flashcards. Please try again.');
    } finally {
      setFlashcardsLoading(false);
    }
  };

  const retryFlashcards = () => {
    if (!lastFlashcardRequest) return;
    openFlashcards(lastFlashcardRequest.topic, lastFlashcardRequest.sourceKitId);
  };

  const openMonthlyPlanner = () => {
    if (planLimits.monthlyPlanner) {
      setView('monthly-planner');
    } else {
      setPaywallOpen({
        title: 'Unlock Monthly Revision Planner',
        description: 'Plan your revision for the whole month with spaced repetition, weak-topic retests, and exam-focused study goals.',
        ctaLabel: 'Upgrade to Exam Pro',
        requiredPlan: 'pro',
        secondaryLabel: 'Continue with Daily Tasks',
        onSecondary: () => setView('todo'),
        benefits: [
          'Month-long calendar planner',
          'Ebbinghaus spaced repetition',
          'Subject-wise revision schedule',
          'Exam countdown plan',
          'Monthly weak-topic roadmap',
        ],
      });
    }
  };

  // Reusable opener for the Premium 3D tile in Visual Hub.
  const openPremium3D = () => {
    if (planLimits.premium3D) {
      // The actual 3D feature is not built yet; show a clear "coming soon" alert.
      alert('Premium 3D Models are unlocked on your plan. Interactive 3D viewer is launching in the next update.');
    } else {
      setPaywallOpen({
        title: 'Unlock Interactive 3D Models',
        description: 'Understand difficult science concepts like the human heart, atom structure, and photosynthesis using interactive visual models.',
        ctaLabel: 'Upgrade to Exam Pro',
        requiredPlan: 'pro',
        secondaryLabel: 'Use Free Mind Map',
        onSecondary: () => setView('visual'),
        benefits: [
          'Rotate, zoom and explore 3D models',
          'Cross-section views of biological systems',
          'Animated explainers (coming soon)',
          'Mastery analytics that target visuals',
        ],
      });
    }
  };

  const openMistakesForTopic = (topic: string) => {
    setMistakesTopicFilter(topic);
    setView('mistakes');
  };

  // ── Predefined chapter library (Class 10 CBSE) ────────────────────────────
  // Workflow: student picks a chapter from Library → ChapterModeSelector opens
  // → student picks Visual / Read-Write / Audio / Practice Quiz → we reuse a
  // saved kit if one exists for that chapter, else call /api/generate-kit.
  const [chapterPicker, setChapterPicker] = useState<ChapterItem | null>(null);
  const [chapterGenerating, setChapterGenerating] = useState(false);
  const [chapterGenError, setChapterGenError] = useState<string | null>(null);
  const lastChapterPick = React.useRef<{
    chapter: ChapterItem;
    mode: ChapterMode;
    language?: 'hi' | 'en';
    regenerate?: boolean;
  } | null>(null);

  const stripModePrefix = (t: string) =>
    t.replace(/^\s*(audio|visual|read\/write|readwrite|read|write)\s*[:\-–]\s*/i, '').trim();

  /**
   * Find a cached library kit for this chapter. When `language` is supplied
   * (Hindi/English picker flow), match by the chapter+lang tags the server
   * writes; otherwise fall back to stripped-title matching for legacy items.
   */
  const findExistingChapterKit = (
    chapterTitle: string,
    language?: 'hi' | 'en',
  ) => {
    const t = chapterTitle.trim().toLowerCase();
    return library.find(it => {
      if (it.type === 'analysis') return false;
      const tags = it.tags || [];
      const chapterTag = `chapter:${chapterTitle}`;
      const hasChapterTag = tags.includes(chapterTag);
      const titleMatches = stripModePrefix(it.title).toLowerCase() === t;
      if (!hasChapterTag && !titleMatches) return false;
      if (language) {
        const want = `lang:${language}`;
        const langTag = tags.find(x => x.startsWith('lang:'));
        if (langTag) return langTag === want;
        // Legacy items (no language tag) are assumed English.
        return language === 'en';
      }
      return true;
    });
  };

  const routeForChapterMode = (mode: ChapterMode): string => {
    if (mode === 'visual') return 'visual';
    if (mode === 'audio') return 'aural';
    if (mode === 'readwrite') return 'readwrite';
    return 'practice'; // practice quiz
  };

  const openChapterMode = async (
    chapter: ChapterItem,
    mode: ChapterMode,
    opts?: { regenerate?: boolean; language?: 'hi' | 'en' },
  ) => {
    // Default language: Hindi chapters → 'hi', everything else → 'en'.
    const resolvedLanguage: 'hi' | 'en' =
      opts?.language ?? (chapter.subject === 'Hindi' ? 'hi' : 'en');
    lastChapterPick.current = {
      chapter,
      mode,
      language: resolvedLanguage,
      regenerate: opts?.regenerate,
    };
    setChapterGenError(null);
    const target = routeForChapterMode(mode);

    // 1. Reuse an existing saved kit unless the student asked to regenerate.
    if (!opts?.regenerate) {
      const existing = findExistingChapterKit(chapter.chapterTitle, resolvedLanguage);
      if (existing) {
        setChapterPicker(null);
        // navigateToKit handles fetching and setting currentRevisionKit
        await navigateToKit(existing.id, target);
        return;
      }
    }

    // 2. Plan-gate (same gate as the dashboard "generate kit" button)
    const gate = canGenerateKitToday(planType);
    if (!gate.allowed) {
      setChapterPicker(null);
      setPaywallOpen({
        title: 'Daily Limit Reached',
        description: 'You have used your free revision kits for today. Upgrade to continue learning without limits.',
        ctaLabel: 'Upgrade to Plus',
        requiredPlan: 'plus',
        secondaryLabel: 'Come back tomorrow',
        benefits: [
          '20 revision kits per day',
          'Unlimited flashcards',
          'PDF export of revision notes',
          'Audio summaries',
          'Mistake slideshow review',
        ],
      });
      return;
    }

    // 3. Fresh generation via /api/generate-kit
    try {
      setChapterGenerating(true);
      const kitData = await aiService.generateRevisionKit({
        topic: chapter.chapterTitle,
        chapterTitle: chapter.chapterTitle,
        subject: chapter.subject,
        classLevel: chapter.classLevel,
        examMode: examMode,
        board: chapter.board,
        mode,
        language: resolvedLanguage,
        chapterId: chapter.id,
        academicYear: chapter.academicYear,
      });
      incrementKitsUsedToday();
      setCurrentRevisionKit(kitData);
      // Refresh library so the new kit shows up next time without a regen.
      fetchRealData().catch(() => { /* non-fatal */ });
      setChapterPicker(null);
      setView(target);
    } catch (err: any) {
      console.error('Chapter kit generation failed:', err);
      setChapterGenError(err?.message || 'Generation failed. Please try again.');
    } finally {
      setChapterGenerating(false);
    }
  };

  const retryChapterGeneration = () => {
    const last = lastChapterPick.current;
    if (!last) return;
    openChapterMode(last.chapter, last.mode, {
      regenerate: last.regenerate,
      language: last.language,
    });
  };

  const navigateToKit = async (id: string, style: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/get-kit/${id}`);
      if (response.ok) {
        const result = await response.json();
        if (style === 'analysis') {
          setCurrentAnalysis(result.data);
          setAnalyticsTab('weak_topics');
          setView('analytics');
        } else {
          setCurrentRevisionKit(result.data);
          setView(style);
        }
      } else {
        alert('Could not load this content. It may have expired or been deleted during a server restart.');
      }
    } catch (err) {
      console.error('Error navigating to kit:', err);
      alert('Network error while trying to load the content.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-500 font-medium animate-pulse">Syncing your learning universe...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-surface-container-lowest">
      {view !== 'landing' && <Sidebar currentView={view} setView={setView} stats={userStats} />}
      
      <main className={`flex-1 ${view === 'landing' ? '' : 'md:ml-64'} overflow-x-hidden transition-all duration-500`}>
        {/* Global Back pill — appears on every secondary view, navigates the real history stack */}
        {view !== 'landing' && view !== 'dashboard' && (
          <div className="sticky top-0 z-30 px-6 md:px-10 pt-6 pb-2 bg-surface-container-lowest/80 backdrop-blur-sm">
            <button
              onClick={goBack}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-surface-container shadow-sm rounded-full text-sm font-bold text-on-surface hover:bg-surface-container-low hover:border-primary/30 transition-all"
              aria-label="Go back to previous page"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          </div>
        )}
        <AnimatePresence mode="wait">
          {view === 'landing' && <LandingPage setView={setView} />}
          {view === 'dashboard' && <Dashboard setView={setView} generateKit={generateKit} navigateToKit={navigateToKit} library={library} stats={userStats} examMode={examMode} setExamMode={setExamMode} />}
          {view === 'library' && <LibraryView library={library} stats={userStats} setView={setView} navigateToKit={navigateToKit} navigateToMistakes={(topic) => { setMistakesTopicFilter(topic); setView('mistakes'); }} viewWrongAnswers={viewWrongAnswers} goToScoreAnalysis={goToScoreAnalysis} onPickChapter={(c) => { setChapterGenError(null); setChapterPicker(c); }} onRemoveDuplicates={async () => { const res = await fetch('/api/cleanup-library', { method: 'POST' }); const json = await res.json(); if (json.success) { setLibrary(json.data.library); setUserStats(json.data.stats); } }} onDeleteLibraryItem={async (id) => { setLibrary(prev => prev.filter(it => it.id !== id)); try { const res = await fetch('/api/delete-library-item', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); if (res.ok) { const json = await res.json(); if (json.success) { setLibrary(json.data.library); setUserStats(json.data.stats); } } } catch { /* server sync — item is already removed from local state */ } }} />}
          {view === 'analytics' && <AnalyticsView library={library} activeTab={analyticsTab} setActiveTab={setAnalyticsTab} stats={userStats} onSave={saveToLibrary} setView={setView} kit={currentAnalysis} />}
          {view === 'progress' && <ProgressView setView={setView} stats={userStats} library={library} />}
          {view === 'tests' && <TestsView setView={setView} library={library} kit={currentRevisionKit} setAIQuiz={setCurrentAIQuiz} />}
          {view === 'practice' && <PracticeView setView={setView} kit={currentRevisionKit} stats={userStats} saveMistake={saveMistake} saveQuizScore={saveQuizScore} generateFocusedReview={generateFocusedReview} viewWrongAnswers={viewWrongAnswers} goToScoreAnalysis={goToScoreAnalysis} modeUsed="revision-kit" />}
          {view === 'todo' && <TodoView setView={setView} library={library} openFlashcards={openFlashcards} openMistakesForTopic={openMistakesForTopic} openMonthlyPlanner={openMonthlyPlanner} isPremium={isPro} planType={planType} showPaywall={(cfg) => setPaywallOpen(cfg)} />}
          {view === 'flashcards' && <FlashcardsView set={flashcardSet} isLoading={flashcardsLoading} error={flashcardsError} setView={setView} onRetry={retryFlashcards} />}
          {view === 'monthly-planner' && isPro && <MonthlyPlannerView setView={setView} openFlashcards={openFlashcards} openMistakesForTopic={openMistakesForTopic} />}
          {view === 'settings' && <SettingsView planType={planType} changePlan={changePlan} kitsUsedToday={getKitsUsedToday()} dailyLimit={planLimits.dailyKitsLimit} setView={setView} />}
          {view === 'selection' && <LearningStyleSelector setView={setView} kit={currentRevisionKit} onSave={saveToLibrary} />}
          {view === 'camera' && <CameraScan setView={setView} setRevisionKit={setCurrentRevisionKit} />}
          {view === 'visual' && <VisualHub setView={setView} onSave={saveToLibrary} kit={currentRevisionKit} stats={userStats} saveMistake={saveMistake} openFlashcards={openFlashcards} openPremium3D={openPremium3D} isPro={isPro} />}
          {view === 'revision-engine' && <RevisionEngineView setView={setView} kit={currentVarkifyKit} saveMistake={saveMistake} saveQuizScore={saveQuizScore} stats={userStats} generateFocusedReview={generateFocusedReview} />}
          {view === 'readwrite' && <ReadWriteHub setView={setView} onSave={saveToLibrary} kit={currentRevisionKit} stats={userStats} planType={planType} saveMistake={saveMistake} openFlashcards={openFlashcards} onPaywall={setPaywallOpen} />}
          {view === 'aural' && <AuralHub setView={setView} onSave={saveToLibrary} kit={currentRevisionKit} stats={userStats} saveMistake={saveMistake} openFlashcards={openFlashcards} />}
          {view === 'quiz' && <QuizView setView={setView} stats={userStats} saveMistake={saveMistake} />}
          {view === 'ai-quiz' && <AIQuizView setView={setView} saveMistake={saveMistake} saveQuizScore={saveQuizScore} quiz={currentAIQuiz} viewWrongAnswers={viewWrongAnswers} goToScoreAnalysis={goToScoreAnalysis} generateFocusedReview={generateFocusedReview} modeUsed={currentAIQuizMode} />}
          {view === 'youtube-study' && <YouTubeStudyView setView={setView} onQuizReady={(quiz) => { setCurrentAIQuiz(quiz); setCurrentAIQuizMode('youtube'); setView('ai-quiz'); }} />}
          {view === 'mistakes' && <MistakesNotebook stats={userStats} generateFocusedReview={generateFocusedReview} goToAnalyticsWeakTopics={goToAnalyticsWeakTopics} initialTopicFilter={mistakesTopicFilter} onClearFilter={() => setMistakesTopicFilter(null)} />}
          {view === 'doubt-solver' && <DoubtSolver />}
          {view === 'offers' && <OffersView setView={setView} planType={planType} changePlan={changePlan} />}
          {view === 'test-review' && <TestReviewView attemptId={selectedQuizAttemptId} setView={setView} generateFocusedReview={generateFocusedReview} />}

          {!['dashboard', 'selection', 'camera', 'visual', 'quiz', 'ai-quiz', 'landing', 'readwrite', 'aural', 'analytics', 'library', 'progress', 'tests', 'practice', 'settings', 'mistakes', 'doubt-solver', 'todo', 'revision-engine', 'offers', 'test-review', 'flashcards', 'monthly-planner', 'youtube-study'].includes(view) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center min-h-[70vh]">
              <h2 className="text-4xl font-bold text-gray-300">Under Construction</h2>
              <button 
                onClick={() => setView('dashboard')}
                className="mt-6 text-primary font-bold hover:underline"
              >
                Back to Home
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Chapter mode picker — opens when a Library chapter card is clicked. */}
      <ChapterModeSelector
        chapter={chapterPicker}
        hasExistingKit={!!(chapterPicker && findExistingChapterKit(
          chapterPicker.chapterTitle,
          chapterPicker.subject === 'Hindi' ? 'hi' : 'en',
        ))}
        isGenerating={chapterGenerating}
        generationError={chapterGenError}
        onPickMode={(mode, opts) => chapterPicker && openChapterMode(chapterPicker, mode, opts)}
        onClose={() => { if (!chapterGenerating) { setChapterPicker(null); setChapterGenError(null); } }}
        onRetry={retryChapterGeneration}
      />

      {/* DEV badge — visible reminder that Exam Pro is force-enabled for testing.
          Toggle DEV_FORCE_PRO in billingService.ts to remove. */}
      {DEV_FORCE_PRO && view !== 'landing' && (
        <div className="fixed bottom-4 right-4 z-[80] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 shadow-md text-[10px] font-black uppercase tracking-widest pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Exam Pro Demo Active
        </div>
      )}

      {/* Paywall modal — driven entirely by the PaywallConfig the caller passes */}
      {paywallOpen && (() => {
        const cfg = paywallOpen;
        const tierBadge = cfg.requiredPlan === 'pro' ? '✨ Exam Pro feature' : '⚡ Student Plus feature';
        const tierColor = cfg.requiredPlan === 'pro' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800';
        const closeAndDo = (fn?: () => void) => { setPaywallOpen(null); fn?.(); };
        return (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setPaywallOpen(null)}
          >
            <div
              className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 ${tierColor}`}>
                {tierBadge}
              </div>
              <h3 className="text-2xl font-black text-on-surface mb-2">{cfg.title}</h3>
              <p className="text-on-surface-variant font-medium mb-6 leading-relaxed">
                {cfg.description}
              </p>
              {cfg.benefits && cfg.benefits.length > 0 && (
                <ul className="space-y-2 text-sm text-on-surface mb-6">
                  {cfg.benefits.map((b, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.requiredPlan === 'pro' ? 'bg-amber-500' : 'bg-indigo-500'}`} />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => closeAndDo(() => setView('offers'))}
                  className="w-full py-3 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-xs hover:brightness-110"
                >
                  {cfg.ctaLabel}
                </button>
                <button
                  onClick={() => { changePlan(cfg.requiredPlan); setPaywallOpen(null); }}
                  className="w-full py-2.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl font-bold text-xs hover:bg-amber-100"
                >
                  DEV: Unlock {cfg.requiredPlan === 'pro' ? 'Exam Pro' : 'Plus'} for testing
                </button>
                {cfg.secondaryLabel && (
                  <button
                    onClick={() => closeAndDo(cfg.onSecondary)}
                    className="w-full py-2.5 text-on-surface-variant font-bold text-xs hover:bg-surface-container-low rounded-xl"
                  >
                    {cfg.secondaryLabel}
                  </button>
                )}
                <button
                  onClick={() => setPaywallOpen(null)}
                  className="w-full py-2 text-on-surface-variant/60 text-[11px] hover:bg-surface-container-low rounded-xl"
                >
                  Not now
                </button>
              </div>
              <p className="mt-5 text-[10px] text-on-surface-variant/60 text-center">
                Payment integration coming soon. For now, use the DEV button to preview Pro.
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
