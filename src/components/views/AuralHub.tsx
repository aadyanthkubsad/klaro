/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Library, ClipboardCheck, RotateCcw, Download, Sparkles, Book, Mic, SkipBack, SkipForward, Pause, Play, Volume2, ListMusic, Lightbulb, CheckCircle, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { AIGuide } from '../common/AIGuide';
import { EnglishGlossPanel } from '../common/EnglishGlossPanel';
import { speak, stopSpeaking } from '../../lib/tts';
import { exportKitToPDF, setLastLearningMode } from '../../lib/pdfExport';
import { UserStats } from '../../types';

interface AuralHubProps {
  setView: (v: string) => void;
  onSave: (item: any) => void;
  kit?: any;
  stats: UserStats;
  saveMistake: (mistake: { question: string, userAnswer: string, correction: string, mode: 'visual' | 'aural' | 'readwrite', topic: string }) => void;
  openFlashcards?: (topic: string, sourceKitId?: string) => void;
}

export const AuralHub = ({ setView, onSave, kit, stats, saveMistake, openFlashcards }: AuralHubProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<'audiobook' | 'podcast' | 'story'>('audiobook');
  const [volume, setVolume] = useState(70);
  const [speed, setSpeed] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0); 
  const [progress, setProgress] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [showQuizResults, setShowQuizResults] = useState(false);

  const data = kit || {
    summary: { text: "No content generated yet. Please scan a document or enter text to begin.", executiveSummary: "", keyPoints: [], keyVocabulary: [] },
    quiz: { title: "Topic Overview", questions: [] },
    flashcards: { cards: [] },
    aural: { audioScript: "No audio script available.", lectureNotes: "" },
    readWrite: { tips: [], synthesisPrompt: "" }
  };

  const auralData = data.aural || { audioScript: "", lectureNotes: "" };
  const quiz = Array.isArray(data.quiz) ? data.quiz : (data.quiz?.questions || []);

  const handleQuizSubmit = () => {
    let repeatedMistake = false;
    quiz.forEach((q: any, idx: number) => {
      const selected = quizAnswers[idx + 1];
      const correctVal = q.answer || q.correct;
      const isCorrect = selected === correctVal || selected?.startsWith(`${correctVal})`);
      
      if (!isCorrect && selected) {
        if (stats.mistakes.find(m => m.question === q.question)) {
          repeatedMistake = true;
        } else {
          saveMistake({ question: q.question, userAnswer: selected || 'Not answered', correction: `Correct Answer: ${correctVal}. ${q.explanation || ''}`, mode: 'aural', topic: data.quiz?.title || data.title || 'Topic' });
        }
      }
    });

    if (repeatedMistake) {
      alert("You're making mistakes on topics you've missed before! Focus on this topic.");
    }
    setShowQuizResults(true);
  };

  // Pro promise: remember the last learning hub the student used.
  React.useEffect(() => { setLastLearningMode('aural'); }, []);

  // Sync progress when mode or currentIndex changes
  React.useEffect(() => {
    setProgress(0);
    if (isPlaying) {
      stopSpeaking();
      setIsPlaying(false);
    }
  }, [mode, currentIndex]);

  // Handle speech synthesis state and parameters
  React.useEffect(() => {
    if (isPlaying) {
      const sumText = typeof data.summary === 'string' ? data.summary : (data.summary?.text || "");
      const textToSpeak = auralData.audioScript || sumText;
      const startOffset = Math.floor((progress / 100) * textToSpeak.length);
      
      speak(
        textToSpeak,
        () => {
          setIsPlaying(false);
          setProgress(0);
        },
        (p) => setProgress(p),
        speed,
        volume / 100,
        startOffset
      );
    } else {
      stopSpeaking();
    }
  }, [isPlaying, speed, volume, auralData.audioScript]);

  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (seconds: number) => {
    const sumText = typeof data.summary === 'string' ? data.summary : (data.summary?.text || "");
    const textToSpeak = auralData.audioScript || sumText;
    // Estimate characters per second (approx 15 chars per second)
    const charsPerSecond = 15;
    const charOffset = seconds * charsPerSecond * speed;
    const currentAbsoluteIndex = (progress / 100) * textToSpeak.length;
    const nextAbsoluteIndex = Math.max(0, Math.min(textToSpeak.length, currentAbsoluteIndex + charOffset));
    const nextPercent = (nextAbsoluteIndex / textToSpeak.length) * 100;
    
    setProgress(nextPercent);
    
    if (isPlaying) {
      // The useEffect will handle the restart with the new offset
      const sumText2 = typeof data.summary === 'string' ? data.summary : (data.summary?.text || "");
      const textToSpeak = auralData.audioScript || sumText2;
      const absoluteIndex = (nextPercent / 100) * textToSpeak.length;
      // We don't call speak() here, let the progress update naturally
      // Wait, if we are playing, the useEffect doesn't depend on progress.
      // So we DO need to force a restart if we're seeking while playing.
      speak(
        textToSpeak, 
        () => {
          setIsPlaying(false);
          setProgress(0);
        }, 
        (p) => setProgress(p),
        speed, 
        volume / 100,
        Math.floor(absoluteIndex)
      );
    }
  };

  // Helper to format percentage as pseudo-time for UI aesthetics if exact duration is unknown
  const formatProgressTime = (percent: number) => {
    // Highly estimated duration: 3 seconds per 100 characters approx
    const sumText3 = typeof data.summary === 'string' ? data.summary : (data.summary?.text || "");
    const totalChars = (auralData.audioScript || sumText3).length;
    const estimatedTotalSeconds = (totalChars / 15) / speed; // rough estimate
    const currentSeconds = Math.floor((percent / 100) * estimatedTotalSeconds);
    const m = Math.floor(currentSeconds / 60);
    const s = currentSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatRemainingTime = (percent: number) => {
    const sumText4 = typeof data.summary === 'string' ? data.summary : (data.summary?.text || "");
    const totalChars = (auralData.audioScript || sumText4).length;
    const estimatedTotalSeconds = (totalChars / 15) / speed; 
    const remainingSeconds = Math.max(0, Math.floor(((100 - percent) / 100) * estimatedTotalSeconds));
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    return `-${m}:${s.toString().padStart(2, '0')}`;
  };

  const chapters = mode === 'story' ? [
    { time: '00:00', title: 'Act I: The Silent Forest' },
    { time: '05:15', title: 'Act II: The Spark of Wonder' },
  ] : mode === 'audiobook' ? [
    { time: '00:00', title: data.quiz?.title || data.title || 'Introduction' },
    { time: '04:20', title: 'Key Analysis' },
  ] : [
    { time: '00:00', title: `The ${data.quiz?.title || data.title || 'Topic'} Podcast` },
    { time: '08:00', title: 'AI Synthesis' },
  ];

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % chapters.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + chapters.length) % chapters.length);
  };

  const speedOptions = [1, 1.25, 1.5, 2];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      <div className="space-y-5">
        <div>
          <span className="inline-block px-3 py-1 rounded bg-indigo-100 text-[10px] font-bold mb-3 uppercase tracking-widest text-indigo-600 border border-indigo-200">Aural Hub</span>
          <h2 className="text-3xl font-bold tracking-tight text-on-surface">{data.quiz?.title || data.title || 'Auditory Session'}: {mode === 'story' ? 'A Narrative Journey' : 'Conceptual Briefing'}</h2>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button
              onClick={() => { setMode('audiobook'); setCurrentIndex(0); }}
              className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${mode === 'audiobook' ? 'bg-navy-dark text-white' : 'bg-surface-container-high text-on-surface-variant'}`}
            >
              Audiobook
            </button>
            <button
              onClick={() => { setMode('story'); setCurrentIndex(0); }}
              className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${mode === 'story' ? 'bg-indigo-600 text-white shadow-md' : 'bg-surface-container-high text-on-surface-variant'}`}
            >
              Story Mode
            </button>
            <button
              onClick={() => { setMode('podcast'); setCurrentIndex(0); }}
              className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${mode === 'podcast' ? 'bg-navy-dark text-white' : 'bg-surface-container-high text-on-surface-variant'}`}
            >
              Podcast
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <button
            onClick={() => onSave({ title: data.quiz?.title || data.title || data.topic || 'Untitled Topic', type: 'aural', contentSnippet: (typeof data.summary === 'string' ? data.summary : (data.summary?.text || '')).substring(0, 120) })}
            className="h-11 flex items-center justify-center gap-2 bg-indigo-100 text-indigo-700 px-4 rounded-lg shadow-sm hover:bg-indigo-200 transition-all font-bold text-sm"
          >
            <Library size={16} />
            Save to Library
          </button>
          <button
            onClick={() => setView('practice')}
            className="h-11 flex items-center justify-center gap-2 bg-navy-dark text-white px-4 rounded-lg shadow-sm hover:bg-indigo-600 transition-all font-bold text-sm"
          >
            <ClipboardCheck size={16} />
            Take Hub Quiz
          </button>
          <button
            onClick={() => openFlashcards?.(kit?.title || kit?.topic || 'Topic', kit?.id)}
            className="h-11 flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 rounded-lg shadow-sm hover:brightness-110 transition-all font-bold text-xs leading-tight text-center"
          >
            <Sparkles size={16} className="shrink-0" />
            <span>Audio Key Term Flashcards</span>
          </button>
          <button
            onClick={() => setView('dashboard')}
            className="h-11 flex items-center justify-center gap-2 bg-white border border-surface-container-high text-on-surface px-4 rounded-lg shadow-sm hover:bg-surface-container-low transition-all font-bold text-sm"
          >
            <RotateCcw size={16} />
            Reset
          </button>
          <button
            onClick={() => exportKitToPDF(kit, 'aural')}
            className="h-11 flex items-center justify-center gap-2 bg-primary text-white px-4 rounded-lg shadow-md hover:opacity-90 active:scale-95 transition-all font-bold text-sm"
          >
            <Download size={16} />
            Download PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-white border border-surface-container-high rounded-lg overflow-hidden card-shadow flex flex-col md:flex-row">
            <div className={`w-full md:w-72 aspect-square md:aspect-auto relative flex-shrink-0 ${mode === 'story' ? 'bg-indigo-950' : 'bg-navy-dark'}`}>
              <img 
                src={mode === 'story' 
                  ? "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b"
                  : mode === 'audiobook' 
                    ? "https://images.unsplash.com/photo-1544947950-fa07a98d237f" 
                    : "https://images.unsplash.com/photo-1478737270239-2fccd27ee8fb"
                } 
                alt="Cover" 
                className="w-full h-full object-cover opacity-60"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className={`w-24 h-24 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center ${mode === 'story' ? 'ring-4 ring-indigo-500/30' : ''}`}>
                  {mode === 'story' ? <Sparkles size={48} className="text-white" /> : mode === 'audiobook' ? <Book size={48} className="text-white" /> : <Mic size={48} className="text-white" />}
                </div>
              </div>
            </div>

            <div className="flex-grow p-10 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-indigo-600 uppercase tracking-[0.2em]">Now {mode === 'story' ? 'Journeying' : 'Playing'}</p>
                  <p className="text-[10px] font-mono text-on-surface-variant">{mode === 'story' ? 'Spatial Audio :: Atmosphere V2' : '48kbps :: AI Synthetic HD'}</p>
                </div>
                <h3 className="text-2xl font-bold text-on-surface mb-1 leading-tight">
                  {chapters[currentIndex].title}
                </h3>
                <p className="text-on-surface-variant font-medium text-sm italic"> 
                  {mode === 'story' ? 'Narrative Performance by KLARO' : 'Narrated by KLARO AI'}
                </p>
              </div>

              <div className="mt-8 space-y-8">
                <div className="flex items-end justify-center gap-1 h-12">
                  {[...Array(30)].map((_, i) => (
                    <motion.div 
                      key={i}
                      animate={{ height: isPlaying ? [10, Math.random() * (mode === 'story' ? 50 : 40) + 10, 10] : 10 }}
                      transition={{ repeat: Infinity, duration: 0.5 + Math.random(), ease: 'easeInOut' }}
                      className={`w-1 rounded-full ${isPlaying ? (mode === 'story' ? 'bg-indigo-600' : 'bg-primary') : 'bg-surface-container-high'}`}
                    />
                  ))}
                </div>

                <div className="space-y-2">
                  <div 
                    className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden cursor-pointer group relative"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
                      const sumTextL = typeof data.summary === 'string' ? data.summary : (data.summary?.text || "");
                      const textToSpeak = auralData.audioScript || sumTextL;
                      const absoluteIndex = (percent / 100) * textToSpeak.length;
                      
                      setProgress(percent);
                      if (isPlaying) {
                        speak(
                          textToSpeak, 
                          () => { setIsPlaying(false); setProgress(0); }, 
                          (p) => setProgress(p),
                          speed, volume / 100, Math.floor(absoluteIndex)
                        );
                      }
                    }}
                  >
                    <motion.div 
                      className={`h-full ${mode === 'story' ? 'bg-indigo-600' : 'bg-primary'} relative`}
                      animate={{ width: `${progress}%` }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.2 }}
                    >
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-primary rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.div>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-on-surface-variant tracking-wider">
                    <span>{formatProgressTime(progress)}</span>
                    <span>{formatRemainingTime(progress)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-6">
                  <button 
                    onClick={handlePrev}
                    className="p-2 text-on-surface-variant hover:text-primary transition-all active:scale-95"
                    title="Previous Chapter"
                  >
                    <SkipBack size={20} />
                  </button>
                  
                  <button 
                    onClick={() => handleSeek(-15)}
                    className="p-2 text-on-surface-variant hover:text-primary transition-all active:scale-90 flex flex-col items-center gap-1"
                    title="Back 15 seconds"
                  >
                    <RotateCcw size={24} />
                    <span className="text-[8px] font-black">15s</span>
                  </button>

                  <button 
                    onClick={togglePlayback}
                    className={`w-20 h-20 rounded-full ${mode === 'story' ? 'bg-indigo-600' : 'bg-primary'} text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all outline-none focus:ring-4 focus:ring-primary/20`}
                  >
                    {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                  </button>

                  <button 
                    onClick={() => handleSeek(15)}
                    className="p-2 text-on-surface-variant hover:text-primary transition-all active:scale-90 flex flex-col items-center gap-1"
                    title="Forward 15 seconds"
                  >
                    <div className="relative">
                      <RotateCcw size={24} className="transform scale-x-[-1]" />
                    </div>
                    <span className="text-[8px] font-black">15s</span>
                  </button>

                  <button 
                    onClick={handleNext}
                    className="p-2 text-on-surface-variant hover:text-primary transition-all active:scale-95"
                    title="Next Chapter"
                  >
                    <SkipForward size={20} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-6 mt-12 pt-6 border-t border-surface-container">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 w-1/2">
                    <Volume2 size={18} className="text-on-surface-variant shrink-0" />
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={volume}
                      onChange={(e) => setVolume(Number(e.target.value))}
                      className={`w-full h-1 bg-surface-container rounded-lg appearance-none cursor-pointer ${mode === 'story' ? 'accent-indigo-600' : 'accent-primary'}`}
                    />
                    <span className="text-[10px] font-mono text-on-surface-variant w-8">{volume}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase mr-2 tracking-widest">Speed</span>
                    <div className="flex bg-surface-container rounded p-0.5">
                      {speedOptions.map(opt => (
                        <button 
                          key={opt}
                          onClick={() => setSpeed(opt)}
                          className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${speed === opt ? (mode === 'story' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-primary text-white shadow-sm') : 'text-on-surface-variant hover:bg-white/50'}`}
                        >
                          {speed === opt ? 'x' : ''}{opt}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Lecture Notes & Key Vocabulary ── */}
          <div className="bg-white border border-surface-container-high rounded-2xl p-8 card-shadow">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-surface-container">
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                <Book size={18} />
              </div>
              <h3 className="text-xl font-black text-on-surface">Lecture Notes &amp; Key Vocabulary</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Lecture Notes */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-4 flex items-center gap-2">
                  <Lightbulb size={14} className="text-indigo-500" /> Notes
                </h4>
                {Array.isArray(auralData.lectureNotes) && auralData.lectureNotes.length > 0 ? (
                  <ul className="space-y-4">
                    {auralData.lectureNotes.map((note: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-3 text-base md:text-lg text-on-surface leading-relaxed font-medium">
                        <span className="mt-2.5 w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                        {note}
                      </li>
                    ))}
                  </ul>
                ) : typeof auralData.lectureNotes === 'string' && auralData.lectureNotes ? (
                  <p className="text-base md:text-lg text-on-surface leading-relaxed font-medium whitespace-pre-wrap">{auralData.lectureNotes}</p>
                ) : Array.isArray(data.summary?.keyPoints) && data.summary.keyPoints.length > 0 ? (
                  <ul className="space-y-4">
                    {data.summary.keyPoints.map((pt: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-3 text-base md:text-lg text-on-surface leading-relaxed font-medium">
                        <span className="mt-2.5 w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                        {pt}
                      </li>
                    ))}
                  </ul>
                ) : typeof data.summary?.text === 'string' && data.summary.text ? (
                  <p className="text-base md:text-lg text-on-surface leading-relaxed font-medium whitespace-pre-wrap">{data.summary.text}</p>
                ) : (
                  <p className="text-sm text-on-surface-variant italic">No lecture notes available yet for this topic.</p>
                )}
              </div>

              {/* Key Vocabulary */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-4 flex items-center gap-2">
                  <Sparkles size={14} className="text-indigo-500" /> Key Vocabulary
                </h4>
                {Array.isArray(data.summary?.keyVocabulary) && data.summary.keyVocabulary.length > 0 ? (
                  <ul className="space-y-4">
                    {data.summary.keyVocabulary.map((item: any, idx: number) => (
                      <li key={idx} className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                        <p className="text-base font-black text-indigo-800 mb-1">
                          {typeof item === 'string' ? item : (item.term || item.word)}
                        </p>
                        {typeof item !== 'string' && item.definition && (
                          <p className="text-sm text-on-surface leading-relaxed font-medium">{item.definition}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : Array.isArray(data.summary?.keyPoints) && data.summary.keyPoints.length > 0 ? (
                  <ul className="space-y-3 text-sm text-on-surface leading-relaxed font-medium list-disc pl-5">
                    {data.summary.keyPoints.map((p: string, idx: number) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-on-surface-variant italic">No key vocabulary available yet. Generate a topic to see definitions here.</p>
                )}
              </div>
            </div>
            <EnglishGlossPanel kit={data} />
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <AIGuide topic={data.quiz?.title || data.title || "Auditory Guide"} customTips={data.readWrite?.tips} />

          <div className="bg-white border border-surface-container-high rounded-lg p-8 card-shadow h-full flex flex-col">
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-surface-container">
              <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                {mode === 'story' ? 'Act Progression' : mode === 'audiobook' ? 'Chapters' : 'Show Notes'}
              </h4>
              <ListMusic size={16} className="text-navy-muted" />
            </div>

            <div className="space-y-2 flex-grow overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
              {chapters.map((item, i) => (
                <button 
                  key={i} 
                  onClick={() => setCurrentIndex(i)}
                  className={`w-full flex items-center gap-4 p-4 rounded-md transition-all text-left group ${currentIndex === i ? 'bg-primary/5 border border-primary/20' : 'hover:bg-surface-container-low border border-transparent'}`}
                >
                  <div className={`text-[10px] font-mono font-bold ${currentIndex === i ? 'text-primary' : 'text-on-surface-variant'}`}>{item.time}</div>
                  <div className={`text-sm font-bold flex-grow ${currentIndex === i ? 'text-on-surface' : 'text-on-surface-variant opacity-80'}`}>{item.title}</div>
                  {currentIndex === i && <div className={`w-1.5 h-1.5 rounded-full ${mode === 'story' ? 'bg-indigo-600' : 'bg-primary'} animate-pulse`} />}
                </button>
              ))}
            </div>

            {mode === 'story' && (
              <div className="mt-8 p-6 rounded-lg border bg-indigo-50 border-indigo-100/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-white rounded shadow-sm text-indigo-600">
                    <Sparkles size={16} />
                  </div>
                  <p className="text-xs font-bold text-on-surface">Narrative Wisdom</p>
                </div>
                <p className="text-[11px] text-on-surface-variant leading-relaxed font-medium">
                  {auralData.audioScript ? `${auralData.audioScript.substring(0, 150)}…` : "Preparing your narrative synthesis…"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
