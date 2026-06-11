/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ClipboardCheck, BookOpen, Share2, FileDown, FileText, Trophy, Check, AlertCircle, Activity, ChevronRight, Timer, Lightbulb, Brain, RefreshCw, Library, Target, TrendingUp, Award, BarChart2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TopBar } from '../common/TopBar';
import { LibraryItem, UserStats } from '../../types';
import { aiService, QuizData } from '../../services/aiService';
import { computeScoreAnalysis, onLearningChange, getMastery, getQuizHistory, getRevisionStatus, RevisionStatus, computeCognitiveBreakdown, computeRetrievalStats, CognitiveBreakdown, RetrievalStats } from '../../services/learningService';

// ─── revision-status pill helper ─────────────────────────────────────────────
function statusPillStyle(s: RevisionStatus): string {
  if (s === 'overdue')   return 'bg-rose-100 text-rose-800';
  if (s === 'due-today') return 'bg-amber-100 text-amber-800';
  if (s === 'upcoming')  return 'bg-primary/10 text-primary';
  return 'bg-surface-container text-on-surface-variant';
}
function statusPillLabel(s: RevisionStatus): string {
  if (s === 'overdue')   return 'Overdue';
  if (s === 'due-today') return 'Due today';
  if (s === 'upcoming')  return 'Upcoming';
  return 'Later';
}
function riskPillStyle(r?: string) {
  if (r === 'High')   return 'bg-rose-100 text-rose-800';
  if (r === 'Medium') return 'bg-amber-100 text-amber-800';
  return 'bg-emerald-100 text-emerald-800';
}
function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

interface AnalyticsViewProps {
  library: LibraryItem[];
  activeTab?: 'test_analysis' | 'weak_topics' | 'score_analysis';
  setActiveTab?: (tab: 'test_analysis' | 'weak_topics' | 'score_analysis') => void;
  stats?: UserStats;
  onSave?: (item: Partial<LibraryItem>, kitData?: any) => void;
  setView?: (view: string) => void;
  kit?: any;
  currentTopic?: string;
}

export const AnalyticsView = ({ library, activeTab: externalActiveTab, setActiveTab: setExternalActiveTab, stats, onSave, setView, kit, currentTopic }: AnalyticsViewProps) => {
  const [internalActiveTab, setInternalActiveTab] = useState<'test_analysis' | 'weak_topics' | 'score_analysis'>('test_analysis');
  
  const activeTab = externalActiveTab || internalActiveTab;
  const setActiveTab = setExternalActiveTab || setInternalActiveTab;

  const [quizHistory, setQuizHistory] = useState(() => getQuizHistory());
  // When a specific currentTopic is provided, only show quiz data for THAT topic.
  // Don't fall back to quizHistory[0] (a different chapter) — that confuses users.
  const latestAttempt = (() => {
    if (!currentTopic) return quizHistory[0] || null;
    const topicMatch = quizHistory.find(q => q.topic === currentTopic || q.chapterTitle === currentTopic);
    return topicMatch || null;
  })();

  const [weakTopicsData, setWeakTopicsData] = useState<{ notes: string, tips: string, keywords: string[], quiz: QuizData } | null>(null);
  const [weakTopicsForTopic, setWeakTopicsForTopic] = useState<string | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [savedAnalysisId, setSavedAnalysisId] = useState<string | null>(null);

  useEffect(() => {
    if (kit && !currentTopic) {
      setWeakTopicsData(kit);
    }
  }, [kit, currentTopic]);

  useEffect(() => {
    if (weakTopicsForTopic !== currentTopic) {
      setWeakTopicsData(null);
      setWeakTopicsForTopic(currentTopic);
    }
  }, [currentTopic, weakTopicsForTopic]);

  // Detect subject from kit or latest quiz attempt
  const detectedSubject = kit?.subject || kit?.detectedSubject || latestAttempt?.subject || '';

  const generateWeakTopicsData = async () => {
    if (!stats) return;
    try {
      setIsGenerating(true);
      const scopeTopic = currentTopic || latestAttempt?.topic || null;
      const scopedMistakes = scopeTopic
        ? stats.mistakes.filter(m => m.topic === scopeTopic)
        : stats.mistakes;
      const scopedWeakTopics = scopeTopic
        ? stats.weakTopics.filter(t => scopedMistakes.some(m => m.topic === t || m.topic === scopeTopic))
        : stats.weakTopics;
      const topicsToSend = scopedWeakTopics.length > 0 ? scopedWeakTopics : (scopeTopic ? [scopeTopic] : stats.weakTopics);
      const mistakesToSend = scopedMistakes.length > 0 ? scopedMistakes : [];
      const data = await aiService.generateWeakTopicAnalysis(topicsToSend, mistakesToSend, detectedSubject, scopeTopic || undefined);
      setWeakTopicsData(data);
      setWeakTopicsForTopic(currentTopic);
      setSavedAnalysisId(null);
    } catch (e) {
      console.error(e);
      alert('Failed to generate weak topics analysis. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'weak_topics' && !weakTopicsData && stats && (stats.weakTopics.length > 0 || currentTopic)) {
      generateWeakTopicsData();
    }
  }, [activeTab, stats, weakTopicsData]);

  const handleSaveAnalysis = () => {
    if (!onSave || !weakTopicsData) return;

    const idToSave = savedAnalysisId || crypto.randomUUID();
    if (!savedAnalysisId) {
      setSavedAnalysisId(idToSave);
    }

    // Use the current chapter name for a descriptive title
    const chapterName = currentTopic || latestAttempt?.chapterTitle || latestAttempt?.topic || '';
    const topicTitle = chapterName
      ? `Conceptual Synthesis — ${chapterName}`
      : stats?.weakTopics?.[0]
        ? `Conceptual Synthesis — ${stats.weakTopics[0]}`
        : 'Weak Topics Analysis';

    onSave({
      id: idToSave,
      title: topicTitle,
      type: 'weak-topic-analysis',
      date: new Date().toLocaleDateString('en-GB'),
      progress: 0,
      contentSnippet: weakTopicsData.notes.substring(0, 100),
      tags: [...(weakTopicsData.keywords || []), ...(chapterName ? [`chapter:${chapterName}`] : [])],
    }, weakTopicsData);
    alert('Analysis saved to library!');
  };

  const latestScores = stats?.quizScores || [];
  const averageScore = latestScores.length > 0
    ? Math.round(latestScores.reduce((acc, curr) => acc + (curr.score / curr.total), 0) / latestScores.length * 100)
    : 0;

  // Score analysis backed by real quizHistory (learningService)
  const [analysis, setAnalysis] = useState(() => computeScoreAnalysis());
  const [mastery, setMastery] = useState(() => getMastery());
  const [cognitive, setCognitive] = useState<CognitiveBreakdown>(() => computeCognitiveBreakdown());
  const [retrieval, setRetrieval] = useState<RetrievalStats>(() => computeRetrievalStats());
  useEffect(() => {
    const refresh = () => {
      setAnalysis(computeScoreAnalysis());
      setMastery(getMastery());
      setQuizHistory(getQuizHistory());
      setCognitive(computeCognitiveBreakdown());
      setRetrieval(computeRetrievalStats());
    };
    refresh();
    return onLearningChange(refresh);
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <TopBar title="Performance Analytics" subtitle="Optimize your learning path with data-driven insights." library={library} />

      <div className="flex flex-wrap gap-4 mb-8 bg-surface-container-low p-2 rounded-2xl w-fit">
        {[
          { id: 'test_analysis', label: 'Knowledge Map', icon: ClipboardCheck },
          { id: 'weak_topics', label: 'Weak Topics', icon: AlertCircle },
          { id: 'score_analysis', label: 'Score Analysis', icon: Check },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.id 
                ? 'bg-white text-primary shadow-md' 
                : 'text-on-surface-variant hover:bg-white/50'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'score_analysis' ? (
          <motion.div
            key="score_analysis_content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pb-20"
          >
            {!analysis ? (
              <div className="bg-white border border-dashed border-surface-container rounded-[40px] p-16 text-center">
                <Activity size={40} className="text-on-surface-variant/40 mx-auto mb-6" />
                <h3 className="text-2xl font-black text-on-surface mb-2">No score analysis yet</h3>
                <p className="text-on-surface-variant font-medium max-w-md mx-auto mb-8">
                  Complete a quiz to see your progress.
                </p>
                <button
                  onClick={() => setView?.('dashboard')}
                  className="px-8 py-3 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest"
                >
                  Start a Quiz
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 space-y-6">
                  {/* KPI row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-2xl border border-surface-container shadow-sm">
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2">
                        <Target size={12} /> Latest
                      </div>
                      <p className="text-3xl font-black text-on-surface">{analysis.latestScore}%</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-surface-container shadow-sm">
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2">
                        <TrendingUp size={12} /> Average
                      </div>
                      <p className="text-3xl font-black text-on-surface">{analysis.averageScore}%</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-surface-container shadow-sm">
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2">
                        <Award size={12} /> Best
                      </div>
                      <p className="text-3xl font-black text-emerald-600">{analysis.bestScore}%</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-surface-container shadow-sm">
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2">
                        <ClipboardCheck size={12} /> Attempts
                      </div>
                      <p className="text-3xl font-black text-on-surface">{analysis.totalAttempts}</p>
                    </div>
                  </div>

                  {/* Topic-wise scores */}
                  <div className="bg-white p-6 rounded-[24px] border border-surface-container shadow-sm">
                    <h3 className="text-lg font-bold text-on-surface mb-5">Topic-wise scores</h3>
                    <div className="space-y-3">
                      {analysis.topicScores.map(t => (
                        <div key={t.topic}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-bold text-on-surface">{t.topic}</span>
                            <span className="text-xs font-bold text-on-surface-variant">
                              {t.avg}% · {t.attempts} attempt{t.attempts === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${t.avg >= 75 ? 'bg-emerald-500' : t.avg >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${t.avg}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cognitive Level Breakdown */}
                  {cognitive.recall.total + cognitive.understand.total + cognitive.apply.total + cognitive.analyze.total > 0 && (
                    <div className="bg-white p-6 rounded-[24px] border border-surface-container shadow-sm">
                      <h3 className="text-lg font-bold text-on-surface mb-5 flex items-center gap-2">
                        <Brain size={18} className="text-primary" /> Cognitive Level Breakdown
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {([
                          { key: 'recall' as const, label: 'Recall', color: 'emerald' },
                          { key: 'understand' as const, label: 'Understand', color: 'blue' },
                          { key: 'apply' as const, label: 'Apply', color: 'amber' },
                          { key: 'analyze' as const, label: 'Analyze', color: 'purple' },
                        ] as const).map(({ key, label, color }) => {
                          const d = cognitive[key];
                          return (
                            <div key={key} className={`p-4 rounded-2xl border bg-${color}-50 border-${color}-100`}>
                              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1">{label}</p>
                              <p className="text-2xl font-black text-on-surface">{d.accuracy}%</p>
                              <p className="text-[10px] text-on-surface-variant font-medium">{d.correct}/{d.total} correct</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Retrieval Practice Stats */}
                  {retrieval.totalAttempts > 0 && (
                    <div className="bg-white p-6 rounded-[24px] border border-surface-container shadow-sm">
                      <h3 className="text-lg font-bold text-on-surface mb-5 flex items-center gap-2">
                        <Activity size={18} className="text-primary" /> Retrieval Practice
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="p-3 bg-surface-container-low rounded-xl text-center">
                          <p className="text-xl font-black text-on-surface">{retrieval.streakDays}</p>
                          <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Day streak</p>
                        </div>
                        <div className="p-3 bg-surface-container-low rounded-xl text-center">
                          <p className="text-xl font-black text-on-surface">{retrieval.totalQuestions}</p>
                          <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Questions</p>
                        </div>
                        <div className="p-3 bg-surface-container-low rounded-xl text-center">
                          <p className="text-xl font-black text-on-surface">{retrieval.topicsCovered}</p>
                          <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Topics</p>
                        </div>
                        <div className="p-3 bg-surface-container-low rounded-xl text-center">
                          <p className="text-xl font-black text-on-surface">{retrieval.averageAccuracy}%</p>
                          <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Accuracy</p>
                        </div>
                      </div>
                      {retrieval.improvingTopics.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Improving:</span>
                          {retrieval.improvingTopics.map(t => (
                            <span key={t} className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">{t}</span>
                          ))}
                        </div>
                      )}
                      {retrieval.decliningTopics.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          <span className="text-[9px] font-black text-rose-700 uppercase tracking-widest">Needs attention:</span>
                          {retrieval.decliningTopics.map(t => (
                            <span key={t} className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full text-[10px] font-bold">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recent quiz history */}
                  <div className="bg-white p-6 rounded-[24px] border border-surface-container shadow-sm">
                    <h3 className="text-lg font-bold text-on-surface mb-5">Recent quiz history</h3>
                    <div className="space-y-3">
                      {analysis.recentHistory.map(h => (
                        <div key={h.id} className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl">
                          <div>
                            <p className="font-bold text-on-surface text-sm">{h.topic}</p>
                            <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                              {new Date(h.date).toLocaleDateString()} · {h.modeUsed.replace('-', ' ')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-on-surface-variant">{h.score}/{h.totalQuestions}</p>
                            <p className={`text-base font-black ${h.percentage >= 70 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {h.percentage}%
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                  {/* Estimated mastery */}
                  <div className="bg-emerald-50 p-6 rounded-[24px] border border-emerald-100">
                    <h3 className="text-base font-bold mb-4 text-emerald-900 flex items-center gap-2">
                      <Trophy size={18} /> Estimated mastery
                    </h3>
                    <div className="text-center mb-3">
                      <p className="text-5xl font-black text-emerald-700">{analysis.masteryPercentage}%</p>
                      <p className="text-[10px] font-bold text-emerald-800/60 uppercase tracking-widest mt-2">
                        Across {mastery.length || 1} topic{(mastery.length || 1) === 1 ? '' : 's'}
                      </p>
                    </div>
                    {mastery.length > 0 && (
                      <ul className="mt-4 space-y-3">
                        {mastery.slice(0, 5).map(m => {
                          const rs = getRevisionStatus(m.nextRevisionDate);
                          return (
                            <li key={m.topic} className="p-3 bg-white border border-emerald-100 rounded-xl">
                              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                                <span className="font-bold text-emerald-900 text-sm truncate pr-2">{m.topic}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className={`shrink-0 px-2 py-0.5 rounded-full font-black uppercase tracking-widest text-[9px] ${
                                    m.status === 'Mastered' ? 'bg-emerald-200 text-emerald-900' :
                                    m.status === 'Strong'   ? 'bg-emerald-100 text-emerald-800' :
                                    m.status === 'Improving'? 'bg-amber-100 text-amber-800' :
                                    m.status === 'Weak'     ? 'bg-rose-100 text-rose-800' :
                                                              'bg-surface-container text-on-surface-variant'
                                  }`}>
                                    {m.status}
                                  </span>
                                  {m.forgettingRisk && (
                                    <span className={`shrink-0 px-2 py-0.5 rounded-full font-black uppercase tracking-widest text-[9px] ${riskPillStyle(m.forgettingRisk)}`}>
                                      Risk: {m.forgettingRisk}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-[10px] font-medium text-on-surface-variant">
                                <div>
                                  <p className="font-black uppercase tracking-widest text-[9px] mb-0.5">Last revised</p>
                                  <p className="text-on-surface">{formatDate(m.lastAttemptDate)}</p>
                                </div>
                                <div>
                                  <p className="font-black uppercase tracking-widest text-[9px] mb-0.5">Next revision</p>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-on-surface">{formatDate(m.nextRevisionDate)}</span>
                                    <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${statusPillStyle(rs)}`}>
                                      {statusPillLabel(rs)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {analysis.weakTopics.length > 0 && (
                    <div className="bg-rose-50 p-6 rounded-[24px] border border-rose-100">
                      <h3 className="text-base font-bold mb-3 text-rose-900 flex items-center gap-2">
                        <AlertCircle size={18} /> Weak topics
                      </h3>
                      <ul className="space-y-2">
                        {analysis.weakTopics.slice(0, 4).map(t => (
                          <li key={t.topic} className="flex items-center justify-between text-sm">
                            <span className="font-medium text-rose-900 truncate pr-2">{t.topic}</span>
                            <span className="text-xs font-black text-rose-700">{t.avg}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysis.strongTopics.length > 0 && (
                    <div className="bg-primary/5 p-6 rounded-[24px] border border-primary/20">
                      <h3 className="text-base font-bold mb-3 text-primary flex items-center gap-2">
                        <Check size={18} /> Strong topics
                      </h3>
                      <ul className="space-y-2">
                        {analysis.strongTopics.slice(0, 4).map(t => (
                          <li key={t.topic} className="flex items-center justify-between text-sm">
                            <span className="font-medium text-on-surface truncate pr-2">{t.topic}</span>
                            <span className="text-xs font-black text-primary">{t.avg}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="bg-amber-50 p-6 rounded-[24px] border border-amber-100">
                    <h3 className="text-base font-bold mb-3 text-amber-900 flex items-center gap-2">
                      <Lightbulb size={18} /> Suggested next action
                    </h3>
                    <p className="text-sm text-amber-900 font-medium leading-relaxed mb-4">
                      {analysis.suggestedAction}
                    </p>
                    <button
                      onClick={() => setView?.('todo')}
                      className="w-full py-3 bg-amber-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all"
                    >
                      View Today's Tasks
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        ) : activeTab === 'weak_topics' ? (
          <motion.div
            key="weak_topics_content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-10 pb-20"
          >
            <div className="flex flex-col lg:flex-row justify-between items-start gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-widest">
                  <AlertCircle size={14} /> Weak Topics Analysis
                </div>
                <h2 className="text-4xl font-black text-on-surface tracking-tight">Remediation Center</h2>
                <p className="text-on-surface-variant font-medium max-w-2xl leading-relaxed">
                  Deep analysis of your systematic errors and conceptual gaps.
                </p>
              </div>
              <div className="flex items-center gap-4">
                {weakTopicsData && !isGenerating && (
                  <button
                    onClick={generateWeakTopicsData}
                    className="px-6 py-3 bg-surface-container-low hover:bg-surface-container rounded-2xl font-bold text-sm tracking-tight transition-all flex items-center gap-2"
                  >
                    <RefreshCw size={18} /> Regenerate Analysis
                  </button>
                )}
                <button
                  onClick={() => setView?.('library')}
                  className="px-6 py-3 bg-primary text-white hover:opacity-90 rounded-2xl font-bold text-sm tracking-tight transition-all flex items-center gap-2"
                >
                  <Library size={18} /> Go to Library
                </button>
              </div>
            </div>

            {isGenerating ? (
              <div className="flex flex-col items-center justify-center p-20 bg-white border border-dashed border-surface-container rounded-[40px] text-center">
                <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mb-6">
                  <Brain size={40} className="animate-pulse" />
                </div>
                <h3 className="text-2xl font-black text-on-surface mb-2">Analyzing Mistakes...</h3>
                <p className="text-on-surface-variant max-w-sm mb-8 font-medium">Synthesizing notes and generating a remediation quiz for your weakest topics.</p>
              </div>
            ) : weakTopicsData ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 space-y-8">
                  <div className="bg-white border border-surface-container rounded-[40px] p-10 shadow-sm relative overflow-hidden">
                    <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
                      <h3 className="text-2xl font-black text-on-surface flex items-center gap-3">
                        <BookOpen className="text-primary" /> Conceptual Synthesis
                      </h3>
                      <button 
                        onClick={handleSaveAnalysis}
                        className="px-4 py-2 bg-primary/10 text-primary font-bold rounded-xl text-sm flex items-center gap-2 hover:bg-primary/20 transition-colors"
                      >
                        <FileDown size={16} /> Save to Library
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-6">
                      {weakTopicsData.keywords?.map((kw, i) => (
                        <span key={i} className="px-3 py-1 bg-surface-container-low text-on-surface-variant rounded-lg text-xs font-bold border border-surface-container">
                          {kw}
                        </span>
                      ))}
                    </div>

                    <div className="prose prose-sm max-w-none text-on-surface-variant leading-relaxed space-y-4">
                      <div dangerouslySetInnerHTML={{ __html: weakTopicsData.notes
                        .replace(/\*\*(.+?)\*\*/g, '<strong class="text-on-surface">$1</strong>')
                        .replace(/\n\s*[•\-*]\s+/g, '</p><p class="pl-4 py-1">• ')
                        .replace(/^[•\-*]\s+/, '<p class="pl-4 py-1">• ')
                        .replace(/\n{2,}/g, '</p><p class="mt-3">')
                        .replace(/\n/g, '</p><p class="mt-1">')
                        .replace(/^(?!<p)/, '<p>')
                        .replace(/(?<!<\/p>)$/, '</p>')
                      }} />
                    </div>
                  </div>
                  
                  <div className="bg-white border border-surface-container rounded-[40px] p-10 shadow-sm relative overflow-hidden">
                    <h3 className="text-2xl font-black text-on-surface mb-6 flex items-center gap-3">
                      <ClipboardCheck className="text-primary" /> Remediation Quiz
                    </h3>
                    <div className="space-y-8">
                      {weakTopicsData.quiz.questions.map((q, i) => (
                        <div key={i} className="p-6 bg-surface-container-lowest border border-surface-container rounded-2xl">
                          <p className="font-bold mb-4">{i + 1}. {q.question}</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                            {q.options.map((opt, j) => (
                              <div key={j} className="p-3 bg-white border border-surface-container rounded-xl text-sm font-medium">{opt}</div>
                            ))}
                          </div>
                          <div className="p-4 bg-teal-50 border border-teal-100 rounded-xl text-sm text-teal-900">
                            <strong>Answer: {q.answer}</strong><br/>
                            <span className="text-teal-800/80">{q.explanation}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-8">
                  <div className="bg-amber-100 border border-amber-200 rounded-[40px] p-8 text-amber-900 shadow-sm">
                    <h3 className="text-xl font-black mb-6 flex items-center gap-3">
                      <Lightbulb size={24} className="text-amber-600" /> Actionable Tips
                    </h3>
                    <div className="prose prose-sm prose-amber max-w-none text-amber-900 font-medium whitespace-pre-wrap leading-relaxed">
                      {weakTopicsData.tips}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-20 bg-white border border-dashed border-surface-container rounded-[40px] text-center relative">
                <div className="w-20 h-20 bg-surface-container-low rounded-3xl flex items-center justify-center text-on-surface-variant mb-6">
                  <Check size={40} />
                </div>
                <h3 className="text-2xl font-black text-on-surface mb-2">You have no weak topics!</h3>
                <p className="text-on-surface-variant max-w-sm mb-8 font-medium">Keep practicing and any conceptual gaps will appear here.</p>
              </div>
            )}
          </motion.div>
        ) : latestAttempt ? (
          <motion.div
            key="analysis_content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-10 pb-20"
          >
            {/* Header — scoped to currentTopic when available */}
            <div className="flex flex-col lg:flex-row justify-between items-start gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-widest">
                  <BookOpen size={14} /> {latestAttempt.subject || 'Science'} · {new Date(latestAttempt.date).toLocaleDateString()}
                </div>
                <h2 className="text-4xl font-black text-on-surface tracking-tight">{currentTopic || latestAttempt.chapterTitle || latestAttempt.topic}</h2>
                <p className="text-on-surface-variant font-medium max-w-2xl leading-relaxed">
                  {quizHistory.some(q => q.topic === (currentTopic || latestAttempt.topic))
                    ? 'Knowledge map based on your quiz attempts for this chapter.'
                    : `No quiz data yet for "${currentTopic}". Take a quiz on this chapter to see its analytics.`}
                </p>
              </div>
            </div>

            {/* Knowledge Map — mastery per topic from quiz data */}
            {(() => {
              const chapterMastery = mastery.find(m => m.topic === latestAttempt.topic);
              const chapterAttempts = quizHistory.filter(q => q.topic === latestAttempt.topic);
              const totalCorrect = chapterAttempts.reduce((s, q) => s + q.correctCount, 0);
              const totalQs = chapterAttempts.reduce((s, q) => s + q.totalQuestions, 0);
              const overallAccuracy = totalQs > 0 ? Math.round((totalCorrect / totalQs) * 100) : 0;

              // BKT mastery with Ebbinghaus decay already applied by getMastery()
              const masteryScore = chapterMastery?.masteryScore ?? Math.round(overallAccuracy * 0.8);

              // Cognitive-level breakdown from actual quiz answers
              const chapterCognitive = computeCognitiveBreakdown(latestAttempt.topic);

              // Retention = BKT P(L,t) with Ebbinghaus decay (already in masteryScore)
              const retentionScore = masteryScore;

              // Radar axes — each sourced from real data via Bloom's taxonomy tags:
              //   Recall = accuracy on 'recall'-tagged questions (Bloom's L1)
              //   Understanding = accuracy on 'understand'-tagged questions (Bloom's L2)
              //   Application = accuracy on 'apply'-tagged questions (Bloom's L3)
              //   Logic = accuracy on 'analyze'-tagged questions (Bloom's L4)
              //   Retention = BKT P(L,t) with Ebbinghaus decay
              //   Exam Readiness = weighted composite of all axes
              // Quiz questions are tagged with cognitiveLevel by the AI during generation.
              // Falls back to difficulty-based inference for legacy questions without tags.
              const recallAcc = chapterCognitive.recall.total > 0 ? chapterCognitive.recall.accuracy : overallAccuracy;
              const understandAcc = chapterCognitive.understand.total > 0 ? chapterCognitive.understand.accuracy : overallAccuracy;
              const applyAcc = chapterCognitive.apply.total > 0 ? chapterCognitive.apply.accuracy : Math.max(0, overallAccuracy - 10);
              const analyzeAcc = chapterCognitive.analyze.total > 0 ? chapterCognitive.analyze.accuracy : Math.max(0, overallAccuracy - 15);
              const examReadiness = Math.round(
                recallAcc * 0.15 + understandAcc * 0.2 + applyAcc * 0.2 +
                analyzeAcc * 0.15 + retentionScore * 0.15 + overallAccuracy * 0.15
              );

              const dims = [
                { label: 'Recall', value: Math.min(100, recallAcc) },
                { label: 'Understanding', value: Math.min(100, understandAcc) },
                { label: 'Application', value: Math.min(100, applyAcc) },
                { label: 'Logic', value: Math.min(100, analyzeAcc) },
                { label: 'Retention', value: Math.min(100, retentionScore) },
                { label: 'Exam Readiness', value: Math.min(100, examReadiness) },
              ];
              const cx = 128, cy = 128, maxR = 110;
              const angles = dims.map((_, i) => (Math.PI * 2 * i) / dims.length - Math.PI / 2);
              const points = dims.map((d, i) => {
                const r = (d.value / 100) * maxR;
                return `${cx + r * Math.cos(angles[i])},${cy + r * Math.sin(angles[i])}`;
              }).join(' ');

              return (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-8 bg-white border border-surface-container rounded-[40px] p-10 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start mb-10">
                      <h3 className="text-2xl font-black text-on-surface">Knowledge Retentivity</h3>
                      <div className="text-right">
                        <div className="text-4xl font-black text-primary">{masteryScore}%</div>
                        <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Mastery Score</div>
                      </div>
                    </div>

                    <div className="relative h-80 flex items-center justify-center">
                      <svg viewBox="0 0 256 256" className="w-64 h-64 overflow-visible">
                        {[1, 0.75, 0.5, 0.25].map(scale => (
                          <polygon key={scale} points={angles.map(a => `${cx + maxR * scale * Math.cos(a)},${cy + maxR * scale * Math.sin(a)}`).join(' ')} fill="none" stroke="#e5e7eb" strokeWidth="1" />
                        ))}
                        {angles.map((a, i) => (
                          <line key={i} x1={cx} y1={cy} x2={cx + maxR * Math.cos(a)} y2={cy + maxR * Math.sin(a)} stroke="#e5e7eb" strokeWidth="1" />
                        ))}
                        <motion.polygon initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} points={points} fill="rgba(0, 88, 190, 0.15)" stroke="#0058be" strokeWidth="2.5" />
                        {dims.map((d, i) => {
                          const r = (d.value / 100) * maxR;
                          return <circle key={i} cx={cx + r * Math.cos(angles[i])} cy={cy + r * Math.sin(angles[i])} r="4" fill="#0058be" />;
                        })}
                      </svg>
                      {dims.map((d, i) => {
                        const labelR = maxR + 24;
                        const lx = cx + labelR * Math.cos(angles[i]);
                        const ly = cy + labelR * Math.sin(angles[i]);
                        return (
                          <div key={d.label} className="absolute font-black text-[10px] uppercase text-on-surface-variant" style={{
                            left: `${(lx / 256) * 100}%`, top: `${(ly / 256) * 100}%`,
                            transform: 'translate(-50%, -50%)',
                          }}>
                            {d.label} <span className="text-primary">{d.value}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="lg:col-span-4 space-y-6">
                    <div className="bg-primary rounded-[24px] p-6 text-white relative overflow-hidden">
                      <h3 className="text-base font-black mb-4 flex items-center gap-2"><Trophy size={18} /> Quick Stats</h3>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-white/10 rounded-xl p-3 text-center">
                          <p className="text-2xl font-black">{chapterAttempts.length}</p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-white/70">Attempts</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-3 text-center">
                          <p className="text-2xl font-black">{overallAccuracy}%</p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-white/70">Accuracy</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-3 text-center">
                          <p className="text-2xl font-black">{chapterMastery?.status || 'New'}</p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-white/70">Status</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-3 text-center">
                          <p className="text-2xl font-black">{chapterMastery?.forgettingRisk || '—'}</p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-white/70">Forget Risk</p>
                        </div>
                      </div>
                    </div>

                    {latestAttempt.weakTopics.length > 0 && (
                      <div className="bg-rose-50 p-6 rounded-[24px] border border-rose-100">
                        <h3 className="text-sm font-black mb-3 text-rose-900 flex items-center gap-2"><AlertCircle size={16} /> Weak in this chapter</h3>
                        <ul className="space-y-2">
                          {latestAttempt.weakTopics.map(t => (
                            <li key={t} className="text-sm font-medium text-rose-800 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />{t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="bg-amber-50 p-6 rounded-[24px] border border-amber-100">
                      <h3 className="text-sm font-black mb-3 text-amber-900 flex items-center gap-2"><Lightbulb size={16} /> Next Action</h3>
                      <p className="text-sm text-amber-900 font-medium leading-relaxed mb-3">
                        {latestAttempt.percentage >= 75
                          ? 'Great job! Revise weak sub-topics and attempt a retest in a few days.'
                          : latestAttempt.percentage >= 50
                          ? 'Review your mistakes and focus on weak topics before retesting.'
                          : 'Start by re-reading the chapter notes, then review each mistake carefully.'}
                      </p>
                      <button onClick={() => setView?.('todo')} className="w-full py-2.5 bg-amber-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all">
                        View Tasks
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        ) : currentTopic ? (
          /* Topic is known (from recent kit or activity log) but no quiz data exists yet */
          <motion.div
            key="no_quiz_for_topic"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-10 pb-20"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-widest">
                <BookOpen size={14} /> Recently studied
              </div>
              <h2 className="text-4xl font-black text-on-surface tracking-tight">{currentTopic}</h2>
            </div>
            <div className="flex flex-col items-center justify-center p-20 bg-white border border-dashed border-surface-container rounded-[40px] text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mb-6">
                <Target size={40} />
              </div>
              <h3 className="text-2xl font-black text-on-surface mb-2">No quiz data yet</h3>
              <p className="text-on-surface-variant max-w-sm mb-8 font-medium">
                Take a quiz on <span className="font-bold text-on-surface">"{currentTopic}"</span> to see your Knowledge Map, mastery score, and weak topics for this chapter.
              </p>
              <button
                onClick={() => setView?.('practice')}
                className="px-8 py-3 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest"
              >
                Take a Quiz
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty_analysis"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center p-20 bg-white border border-dashed border-surface-container rounded-[40px] text-center"
          >
            <div className="w-20 h-20 bg-surface-container-low rounded-3xl flex items-center justify-center text-primary mb-6">
              <Activity size={40} />
            </div>
            <h3 className="text-2xl font-black text-on-surface mb-2">Awaiting Intelligence</h3>
            <p className="text-on-surface-variant max-w-sm mb-8 font-medium">Generate a revision kit and take a quiz to unlock your Knowledge Map and performance analytics.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
