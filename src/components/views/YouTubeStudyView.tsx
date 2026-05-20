/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * YouTubeStudyView — "Studied from YouTube? Test yourself here."
 *
 * Lets a student paste a YouTube video title (and optionally a transcript or
 * their own notes) and instantly get a 5-question retrieval quiz grounded in
 * that content. The quiz lands in AIQuizView, where it follows the standard
 * loop: persists to quizHistory, saves wrong answers to the Mistakes Notebook,
 * and generates spaced-revision tasks via recordCompletedQuiz().
 *
 * No YouTube API integration — we only use what the student types in.
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Youtube, Sparkles, FileText, AlertTriangle, RefreshCw } from 'lucide-react';
import { aiService, QuizData } from '../../services/aiService';

interface YouTubeStudyViewProps {
  setView: (v: string) => void;
  onQuizReady: (quiz: QuizData) => void;
}

type Phase = 'idle' | 'loading' | 'error';

export const YouTubeStudyView = ({ setView, onQuizReady }: YouTubeStudyViewProps) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const canSubmit = title.trim().length >= 3 && phase !== 'loading';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setPhase('loading');
    setErrorMsg('');
    try {
      const data = await aiService.generateYouTubeStudy({
        title: title.trim(),
        transcript: transcript.trim() || undefined,
      });
      onQuizReady({ title: data.topic, questions: data.questions });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not generate a quiz from this video. Please try again.');
      setPhase('error');
    }
  };

  if (phase === 'loading') {
    return (
      <div className="max-w-2xl mx-auto py-32 flex flex-col items-center gap-6">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-on-surface-variant font-bold uppercase tracking-widest text-sm animate-pulse">
          Building your YouTube recall quiz…
        </p>
        <p className="text-xs text-on-surface-variant/60">This usually takes 5–10 seconds</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto pb-20 space-y-6"
    >
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-50 text-rose-600">
          <Youtube size={26} />
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-on-surface">
          Studied from YouTube? Test yourself here.
        </h1>
        <p className="text-on-surface-variant font-medium max-w-lg mx-auto">
          Paste the video title (and the transcript or your notes, if you have them). Klaro generates a 5-question quiz so you know what actually stuck.
        </p>
      </div>

      <div className="bg-white border border-surface-container rounded-[24px] p-6 space-y-5 shadow-sm">
        <div>
          <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant block mb-2">
            Video title or topic
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Photosynthesis Crash Course – Khan Academy"
            className="w-full bg-surface-container-lowest border border-surface-container rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant block mb-2">
            Transcript or notes <span className="font-medium text-on-surface-variant/60 normal-case tracking-normal">(optional, but improves quality)</span>
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste the video transcript or your handwritten notes here. The more context Klaro has, the more accurate the recall quiz."
            rows={7}
            className="w-full bg-surface-container-lowest border border-surface-container rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary resize-none"
          />
          <p className="text-[11px] text-on-surface-variant mt-2">
            Tip: you can grab a transcript from the "..." menu under most YouTube videos.
          </p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-4 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-md hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Sparkles size={16} /> Generate 5-Question Recall Quiz
        </button>

        {phase === 'error' && (
          <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl">
            <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-rose-900">{errorMsg}</p>
              <button
                onClick={handleSubmit}
                className="mt-2 text-xs font-bold text-rose-700 hover:underline flex items-center gap-1"
              >
                <RefreshCw size={12} /> Try again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* What happens next */}
      <div className="bg-surface-container-low rounded-[24px] p-5">
        <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <FileText size={12} /> What you'll get
        </p>
        <ul className="space-y-2 text-sm text-on-surface">
          <li className="flex gap-2"><span className="text-primary font-black">1.</span> 5 quick MCQs grounded in your video</li>
          <li className="flex gap-2"><span className="text-primary font-black">2.</span> Mistakes saved to your Mistakes Notebook</li>
          <li className="flex gap-2"><span className="text-primary font-black">3.</span> Weak-topic tags + spaced revision tasks created automatically</li>
          <li className="flex gap-2"><span className="text-primary font-black">4.</span> Topic mastery + next-revision date updated</li>
        </ul>
      </div>

      <button
        onClick={() => setView('dashboard')}
        className="w-full py-3 text-on-surface-variant font-bold text-sm hover:bg-surface-container-low rounded-xl"
      >
        Back to Dashboard
      </button>
    </motion.div>
  );
};

export default YouTubeStudyView;
