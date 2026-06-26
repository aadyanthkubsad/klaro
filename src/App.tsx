/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { aiService } from './services/aiService';
import { useRevisionKit } from './hooks/useRevisionKit';
import { useFlashcards } from './hooks/useFlashcards';
import { usePaywall } from './hooks/usePaywall';
import type { RevisionKit } from './types/kit';
import { Sidebar } from './components/layout/Sidebar';
import { MobileTopBar } from './components/layout/MobileTopBar';
import { MobileBottomBar } from './components/layout/MobileBottomBar';
import { MobileDrawer } from './components/layout/MobileDrawer';
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
import { PracticeView, PracticeSnapshot } from './components/views/PracticeView';
import { LandingPage } from './components/views/LandingPage';
import { AuthView } from './components/views/AuthView';
import { useAuth } from './contexts/AuthContext';
import { LibraryItem, UserStats, ExamMode } from './types';
import { TodoView } from './components/views/TodoView';
import { TestReviewView } from './components/views/TestReviewView';
import { FlashcardsView } from './components/views/FlashcardsView';
import { MonthlyPlannerView } from './components/views/MonthlyPlannerView';
import { YouTubeStudyView } from './components/views/YouTubeStudyView';
import { ChapterModeSelector } from './components/views/ChapterModeSelector';
import { ChapterItem, ChapterMode } from './data/class10Syllabus';
import { FlashcardSet, PaywallConfig, PlanType, LearningMode, PaperSource } from './types';
import {
  getPlan, setPlan, onPlanChange,
  getKitsUsedToday,
  getUsageCounters,
} from './services/billingService';
import { logActivity, getLastStudiedChapter } from './services/activityService';

export default function App() {
  const { user, logout } = useAuth();
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
  // Auto-redirect authenticated users past landing/auth screens.
  React.useEffect(() => {
    if (user && (view === 'auth' || view === 'landing')) {
      skipHistoryRef.current = true;
      _setViewRaw('dashboard');
    }
  }, [user, view]);
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
  const [examMode, setExamMode] = useState<ExamMode>('CBSE');
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
  const [currentVarkifyKit, setCurrentVarkifyKit] = useState<RevisionKit | null>(null);
  const [currentAIQuiz, setCurrentAIQuiz] = useState<{ title: string; questions: unknown[] } | null>(null);
  const [currentAIQuizMode, setCurrentAIQuizMode] = useState<LearningMode>('revision-kit');
  const [currentPracticeMode, setCurrentPracticeMode] = useState<LearningMode>('revision-kit');
  const [practiceSnapshot, setPracticeSnapshot] = useState<PracticeSnapshot | null>(null);
  const [analyticsTab, setAnalyticsTab] = useState<'test_analysis' | 'weak_topics' | 'score_analysis'>('test_analysis');
  const [selectedQuizAttemptId, setSelectedQuizAttemptId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Billing
  const [planType, setPlanTypeState] = useState<PlanType>(() => getPlan());
  React.useEffect(() => onPlanChange(() => setPlanTypeState(getPlan())), []);
  const isPlus = planType === 'plus' || planType === 'pro';
  const isPro = planType === 'pro';
  const isPremium = isPlus;
  const changePlan = React.useCallback((next: PlanType) => { setPlan(next); setPlanTypeState(next); }, []);

  // Paywall hook
  const { paywallConfig: paywallOpen, openPaywall: setPaywallOpen, closePaywall, planLimits } = usePaywall(planType);

  // Non-blocking toast notifications (replaces disruptive alert() calls)
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'warning' | 'error' | 'info' }[]>([]);
  const toastId = React.useRef(0);
  const showToast = useCallback((message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    const id = ++toastId.current;
    setToasts(prev => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const fetchRealData = async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setIsLoading(true);
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
      if (!opts?.silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRealData();
  }, []);

  const saveToLibrary = async (item: Partial<LibraryItem>, customKit?: RevisionKit) => {
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
        logActivity({ type: 'library-save', chapterTitle: item.title as string, subject: item.tags?.[0], xpEarned: 5 });
        showToast(library.some(i => i.title === item.title) ? `Updated "${item.title}" in your Library!` : "Saved to your Library!", 'success');
      }
    } catch (error) {
      console.error('Error saving to library:', error);
      showToast('Failed to save to library', 'error');
    }
  };

  const saveMistake = async (mistake: { question: string, userAnswer: string, correction: string, mode: 'visual' | 'aural' | 'readwrite', topic: string }) => {
    try {
      const exists = userStats.mistakes.some(m => m.question === mistake.question);
      if (exists) {
        showToast("You've made this mistake before — focus on this topic!", 'warning');
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
        logActivity({ type: 'mistake-review', chapterTitle: mistake.topic, xpEarned: 10 });
        showToast("Added to mistakes notebook!", 'info');
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
      logActivity({
        type: 'quiz',
        chapterTitle: scoreData.topic,
        xpEarned: 30,
        meta: { score: scoreData.score, total: scoreData.total, percentage: Math.round((scoreData.score / scoreData.total) * 100) },
      });
    } catch (err) {
      console.error("Failed to save score", err);
    }
  };

  // ── Revision kit + chapter flow (extracted to hook) ─────────────────────────
  const {
    kit: currentRevisionKit,
    setKit: setCurrentRevisionKit,
    isGenerating: kitGenerating,
    generateKit,
    chapterPicker,
    setChapterPicker,
    chapterGenerating,
    chapterGenError,
    setChapterGenError,
    findExistingChapterKit,
    openChapterMode: _openChapterMode,
    retryChapterGeneration: _retryChapterGeneration,
    cancelChapterGeneration,
  } = useRevisionKit({
    planType,
    examMode,
    library,
    setView,
    showToast,
    setPaywallOpen,
    fetchLibrary: fetchRealData,
  });

  const openChapterMode = (chapter: ChapterItem, mode: ChapterMode, opts?: { regenerate?: boolean; language?: 'hi' | 'en' }) =>
    _openChapterMode(chapter, mode, opts, (kitData, target) => {
      setCurrentRevisionKit(kitData);
      if (target === 'practice') setCurrentPracticeMode(mode === 'audio' ? 'aural' : mode === 'visual' ? 'visual' : mode === 'readwrite' ? 'readwrite' : 'revision-kit');
      setView(target);
    });

  const retryChapterGeneration = () =>
    _retryChapterGeneration((kitData, target) => {
      setCurrentRevisionKit(kitData);
      setView(target);
    });

  const generateFocusedReview = async () => {
    try {
      setIsLoading(true);
      const quiz = await aiService.generateFocusedReview(userStats.weakTopics, userStats.mistakes);
      // Normalise: ensure questions array always exists
      const quizObj = Array.isArray(quiz)
        ? { title: 'Focused Review Quiz', questions: quiz }
        : (quiz?.questions ? quiz : { title: 'Focused Review Quiz', questions: [] });
      logActivity({ type: 'weak-topic-retest', xpEarned: 30, meta: { weakTopics: userStats.weakTopics } });
      setCurrentAIQuiz(quizObj);
      setView('ai-quiz');
    } catch (err) {
      console.error('Error generating focused review:', err);
      showToast('Failed to generate focused review. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const [currentAnalysis, setCurrentAnalysis] = useState<RevisionKit | null>(null);
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

  // ── Flashcards (extracted to hook) ───────────────────────────────────────────
  const {
    flashcardSet,
    setFlashcardSet,
    isLoading: flashcardsLoading,
    error: flashcardsError,
    openFlashcards,
    retry: retryFlashcards,
  } = useFlashcards({ currentKit: currentRevisionKit, setView });

  const openMonthlyPlanner = () => {
    if (planLimits.monthlyPlanner) {
      setView('monthly-planner');
    } else {
      setPaywallOpen({
        title: 'Unlock Monthly Revision Planner',
        description: 'Plan your revision for the whole month with spaced repetition, weak-topic retests, and exam-focused study goals.',
        ctaLabel: 'Upgrade to Exam Pro — ₹499/mo',
        requiredPlan: 'pro',
        secondaryLabel: 'Continue with Daily Tasks',
        onSecondary: () => setView('todo'),
        benefits: [
          'Month-long calendar planner',
          'Forgetting-curve calendar',
          'Subject-wise revision schedule',
          'Mastery tracking',
          'Monthly weak-topic roadmap',
        ],
      });
    }
  };

  // Reusable opener for the Premium 3D tile in Visual Hub.
  const openPremium3D = () => {
    if (planLimits.premium3D) {
      showToast('Premium 3D Models are unlocked on your plan. Interactive 3D viewer is launching in the next update.', 'info');
    } else {
      setPaywallOpen({
        title: 'Unlock Interactive 3D Models',
        description: 'Understand difficult science concepts like the human heart, atom structure, and photosynthesis using interactive visual models.',
        ctaLabel: 'Upgrade to Exam Pro — ₹499/mo',
        requiredPlan: 'pro',
        secondaryLabel: 'Use Free Mind Map',
        onSecondary: () => setView('visual'),
        benefits: [
          'Rotate, zoom and explore 3D models',
          'Cross-section views of biological systems',
          'Animated explainers (coming soon)',
          'Advanced analytics for visual learners',
        ],
      });
    }
  };

  const openMistakesForTopic = (topic: string) => {
    setMistakesTopicFilter(topic);
    setView('mistakes');
  };

  /** Map a LibraryItem type to a valid view name.
   *  Items saved as 'revision-kit' should open in the LearningStyleSelector
   *  so the user picks Visual / Read-Write / Aural. Other types open their
   *  dedicated hub. Unknown types fall back to 'selection'. */
  const kitTypeToView = (type: string): string => {
    const map: Record<string, string> = {
      visual: 'visual',
      aural: 'aural',
      readwrite: 'readwrite',
      'revision-kit': 'selection',
      analysis: 'analytics',
      'score-analysis': 'analytics',
      'weak-topic-analysis': 'analytics',
      'mastery-report': 'analytics',
      'mistake-analysis': 'analytics',
    };
    return map[type] || 'selection';
  };

  const navigateToKit = async (id: string, style: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/get-kit/${id}`);
      if (response.ok) {
        const result = await response.json();
        const resolvedView = kitTypeToView(style);

        if (resolvedView === 'analytics') {
          setCurrentAnalysis(result.data);
          setAnalyticsTab('weak_topics');
          setView('analytics');
        } else {
          setCurrentRevisionKit(result.data);
          setView(resolvedView);
        }

        logActivity({
          type: 'resume-learning',
          chapterTitle: result.data?.title || result.data?.chapterTitle,
          subject: result.data?.subject,
          xpEarned: 5,
          meta: { mode: resolvedView },
        });
        // Refresh library in background so "Last Studied" timestamp updates
        fetchRealData({ silent: true }).catch(() => { /* non-fatal */ });
      } else {
        showToast('Could not load this content. It may have expired or been deleted during a server restart.', 'error');
      }
    } catch (err) {
      console.error('Error navigating to kit:', err);
      showToast('Network error while trying to load the content.', 'error');
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

  const isApp = view !== 'landing' && view !== 'auth';

  return (
    <div className="min-h-screen flex bg-surface-container-lowest">
      {isApp && <Sidebar currentView={view} setView={setView} stats={userStats} user={user} onLogout={() => { logout(); setView('landing'); }} />}
      {isApp && <MobileTopBar currentView={view} onMenuOpen={() => setDrawerOpen(true)} />}
      {isApp && <MobileBottomBar currentView={view} setView={setView} onMoreTap={() => setDrawerOpen(true)} />}
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
        {/* Global Back pill — appears on every secondary view, navigates the real history stack */}
        {view !== 'landing' && view !== 'auth' && view !== 'dashboard' && (
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
          {view === 'auth' && <AuthView onSkip={() => setView('dashboard')} />}
          {view === 'dashboard' && <Dashboard setView={setView} generateKit={generateKit} navigateToKit={navigateToKit} library={library} stats={userStats} examMode={examMode} setExamMode={setExamMode} />}
          {view === 'library' && <LibraryView library={library} stats={userStats} setView={setView} navigateToKit={navigateToKit} navigateToMistakes={(topic) => { setMistakesTopicFilter(topic); setView('mistakes'); }} viewWrongAnswers={viewWrongAnswers} goToScoreAnalysis={goToScoreAnalysis} onPickChapter={(c) => { setChapterGenError(null); setChapterPicker(c); }} onRemoveDuplicates={async () => { const res = await fetch('/api/cleanup-library', { method: 'POST' }); const json = await res.json(); if (json.success) { setLibrary(json.data.library); setUserStats(json.data.stats); } }} onDeleteLibraryItem={async (id) => { setLibrary(prev => prev.filter(it => it.id !== id)); try { const res = await fetch('/api/delete-library-item', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); if (res.ok) { const json = await res.json(); if (json.success) { setLibrary(json.data.library); setUserStats(json.data.stats); } } } catch { /* server sync — item is already removed from local state */ } }} onGeneratePracticeFromPattern={async (paper: PaperSource) => { try { setIsLoading(true); const quiz = await aiService.generatePracticeFromPattern({ subject: paper.subject, year: paper.year, paperType: paper.type }); setCurrentAIQuiz(quiz); setCurrentAIQuizMode('revision-kit'); setView('ai-quiz'); } catch (e: any) { showToast(e?.message || 'Practice test generation failed.', 'error'); } finally { setIsLoading(false); } }} onSavePaperToLibrary={(paper: PaperSource) => { const typeMap: Record<string, string> = { 'sample-paper': 'sample-paper', 'previous-year': 'previous-year-paper', 'marking-scheme': 'marking-scheme' }; saveToLibrary({ title: `${paper.subject} ${paper.year} ${paper.type.replace('-', ' ')}`, type: (typeMap[paper.type] || 'sample-paper') as any, contentSnippet: `CBSE ${paper.classLevel} — Official ${paper.type.replace('-', ' ')} (${paper.year}). Source: ${paper.sourceName}`, tags: [paper.subject, paper.year, paper.type], }); }} />}
          {view === 'analytics' && <AnalyticsView library={library} activeTab={analyticsTab} setActiveTab={setAnalyticsTab} stats={userStats} onSave={saveToLibrary} setView={setView} kit={currentAnalysis} currentTopic={currentRevisionKit?.topic || currentRevisionKit?.chapterTitle || getLastStudiedChapter()?.chapterTitle} />}
          {view === 'progress' && <ProgressView setView={setView} stats={userStats} library={library} />}
          {view === 'tests' && <TestsView setView={setView} library={library} kit={currentRevisionKit} setAIQuiz={setCurrentAIQuiz} />}
          {view === 'practice' && <PracticeView setView={setView} kit={currentRevisionKit} stats={userStats} saveMistake={saveMistake} saveQuizScore={saveQuizScore} generateFocusedReview={generateFocusedReview} viewWrongAnswers={viewWrongAnswers} goToScoreAnalysis={goToScoreAnalysis} modeUsed={currentPracticeMode} savedResults={practiceSnapshot} onResultsChange={setPracticeSnapshot} />}
          {view === 'todo' && <TodoView setView={setView} library={library} openFlashcards={openFlashcards} openMistakesForTopic={openMistakesForTopic} openMonthlyPlanner={openMonthlyPlanner} isPremium={planLimits.monthlyPlanner} planType={planType} showPaywall={(cfg) => setPaywallOpen(cfg)} />}
          {view === 'flashcards' && <FlashcardsView set={flashcardSet} isLoading={flashcardsLoading} error={flashcardsError} setView={setView} onRetry={retryFlashcards} />}
          {view === 'monthly-planner' && planLimits.monthlyPlanner && <MonthlyPlannerView setView={setView} openFlashcards={openFlashcards} openMistakesForTopic={openMistakesForTopic} />}
          {view === 'settings' && <SettingsView planType={planType} changePlan={changePlan} kitsUsedToday={getKitsUsedToday()} dailyLimit={planLimits.dailyKitsLimit} setView={setView} usageCounters={getUsageCounters()} planLimits={planLimits} user={user} />}
          {view === 'selection' && <LearningStyleSelector setView={setView} kit={currentRevisionKit} onSave={saveToLibrary} />}
          {view === 'camera' && <CameraScan setView={setView} setRevisionKit={setCurrentRevisionKit} />}
          {view === 'visual' && <VisualHub setView={setView} onSave={saveToLibrary} kit={currentRevisionKit} stats={userStats} saveMistake={saveMistake} openFlashcards={openFlashcards} openPremium3D={openPremium3D} isPro={planLimits.premium3D} />}
          {view === 'revision-engine' && <RevisionEngineView setView={setView} kit={currentVarkifyKit} saveMistake={saveMistake} saveQuizScore={saveQuizScore} stats={userStats} generateFocusedReview={generateFocusedReview} />}
          {view === 'readwrite' && <ReadWriteHub setView={setView} onSave={saveToLibrary} kit={currentRevisionKit} stats={userStats} planType={planType} saveMistake={saveMistake} openFlashcards={openFlashcards} onPaywall={setPaywallOpen} />}
          {view === 'aural' && <AuralHub setView={setView} onSave={saveToLibrary} kit={currentRevisionKit} stats={userStats} planType={planType} saveMistake={saveMistake} openFlashcards={openFlashcards} onPaywall={setPaywallOpen} />}
          {view === 'quiz' && <QuizView setView={setView} stats={userStats} saveMistake={saveMistake} />}
          {view === 'ai-quiz' && <AIQuizView setView={setView} saveMistake={saveMistake} saveQuizScore={saveQuizScore} quiz={currentAIQuiz} viewWrongAnswers={viewWrongAnswers} goToScoreAnalysis={goToScoreAnalysis} generateFocusedReview={generateFocusedReview} modeUsed={currentAIQuizMode} />}
          {view === 'youtube-study' && <YouTubeStudyView setView={setView} onQuizReady={(quiz) => { setCurrentAIQuiz(quiz); setCurrentAIQuizMode('youtube'); setView('ai-quiz'); }} onSaveToLibrary={saveToLibrary} openFlashcards={openFlashcards} isPro={planLimits.youtubeRecall} showPaywall={setPaywallOpen} onGenerateNotes={async (topic, noteStyle) => { try { setIsLoading(true); const notes = await aiService.generateStudyNotes({ chapterTitle: topic, subject: 'General', noteStyle, classLevel: 'Class 10', examMode: 'CBSE' }); setCurrentRevisionKit(notes); setView('readwrite'); } catch (e: any) { showToast(e?.message || 'Failed to generate notes.', 'error'); } finally { setIsLoading(false); } }} />}
          {view === 'mistakes' && <MistakesNotebook stats={userStats} generateFocusedReview={generateFocusedReview} goToAnalyticsWeakTopics={goToAnalyticsWeakTopics} initialTopicFilter={mistakesTopicFilter} onClearFilter={() => setMistakesTopicFilter(null)} />}
          {view === 'doubt-solver' && <DoubtSolver />}
          {view === 'offers' && <OffersView setView={setView} planType={planType} changePlan={changePlan} />}
          {view === 'test-review' && <TestReviewView attemptId={selectedQuizAttemptId} setView={setView} generateFocusedReview={generateFocusedReview} />}

          {!['dashboard', 'selection', 'camera', 'visual', 'quiz', 'ai-quiz', 'landing', 'auth', 'readwrite', 'aural', 'analytics', 'library', 'progress', 'tests', 'practice', 'settings', 'mistakes', 'doubt-solver', 'todo', 'revision-engine', 'offers', 'test-review', 'flashcards', 'monthly-planner', 'youtube-study'].includes(view) && (
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
        onClose={() => cancelChapterGeneration()}
        onRetry={retryChapterGeneration}
      />

      {/* Paywall modal — driven entirely by the PaywallConfig the caller passes */}
      {paywallOpen && (() => {
        const cfg = paywallOpen;
        const tierBadge = cfg.requiredPlan === 'pro' ? '✨ Exam Pro feature' : '⚡ Student Plus feature';
        const tierColor = cfg.requiredPlan === 'pro' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800';
        const closeAndDo = (fn?: () => void) => { closePaywall(); fn?.(); };
        return (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => closePaywall()}
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
                {cfg.secondaryLabel && (
                  <button
                    onClick={() => closeAndDo(cfg.onSecondary)}
                    className="w-full py-2.5 text-on-surface-variant font-bold text-xs hover:bg-surface-container-low rounded-xl"
                  >
                    {cfg.secondaryLabel}
                  </button>
                )}
                <button
                  onClick={() => closePaywall()}
                  className="w-full py-2 text-on-surface-variant/60 text-[11px] hover:bg-surface-container-low rounded-xl"
                >
                  Not now
                </button>
              </div>
              <p className="mt-5 text-[10px] text-on-surface-variant/60 text-center">
                Secure payments via Razorpay &mdash; a <a href="https://www.bhuviona.com/" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: '#00BCD4' }}>Bhuviona Technologies</a> product.
              </p>
            </div>
          </div>
        );
      })()}

      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 80, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold max-w-sm ${
                t.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                t.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                t.type === 'error'   ? 'bg-red-50 border-red-200 text-red-800' :
                                       'bg-indigo-50 border-indigo-200 text-indigo-800'
              }`}
            >
              {t.type === 'success' && <CheckCircle2 size={16} className="shrink-0" />}
              {t.type === 'warning' && <AlertTriangle size={16} className="shrink-0" />}
              {t.type === 'error' && <AlertTriangle size={16} className="shrink-0" />}
              {t.type === 'info' && <Info size={16} className="shrink-0" />}
              <span className="leading-snug">{t.message}</span>
              <button
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                className="ml-auto shrink-0 opacity-50 hover:opacity-100"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
