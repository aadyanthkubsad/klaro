/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sparkles, Volume2, VolumeX } from 'lucide-react';
import { speak, stopSpeaking } from '../../lib/tts';

interface AIGuideProps {
  topic: string;
  customTips?: string[];
}

export const AIGuide = ({ topic, customTips }: AIGuideProps) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const defaultTips = [
    "Focus on the relationships between key concepts rather than isolated facts.",
    "Try to explain this concept to someone else to solidify your understanding.",
    "Look for real-world applications of this theory to make it more memorable."
  ];

  const tips = customTips && customTips.length > 0 ? customTips : defaultTips;

  const handleListen = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    } else {
      const fullText = `Tips and Suggestions for ${topic}. ${tips.join('. ')}`;
      speak(fullText, () => setIsSpeaking(false));
      setIsSpeaking(true);
    }
  };

  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 text-white rounded-lg">
            <Sparkles size={16} />
          </div>
          <h4 className="font-bold text-indigo-900">Tips and Suggestions</h4>
        </div>
        <button
          onClick={handleListen}
          className={`p-2 rounded-full transition-all ${isSpeaking ? 'bg-indigo-600 text-white shadow-md' : 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100'}`}
          title={isSpeaking ? "Stop Listening" : "Listen to Tips"}
        >
          {isSpeaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>
      <ul className="space-y-3">
        {tips.map((tip, i) => (
          <li key={i} className="flex gap-3 items-start text-sm text-indigo-800/80 font-medium leading-relaxed">
            <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1.5 shrink-0" />
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
};
