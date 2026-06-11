/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const speak = (text: string, onEnd?: () => void, onProgress?: (progress: number) => void, rate: number = 1, volume: number = 0.7, startOffset: number = 0) => {
  // Cancel any existing speech
  window.speechSynthesis.cancel();

  if (!text) return;

  const textToSpeak = text.substring(startOffset);
  if (!textToSpeak) {
    if (onEnd) onEnd();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  utterance.rate = rate;
  utterance.volume = volume;
  
  if (onEnd) {
    utterance.onend = onEnd;
  }

  if (onProgress) {
    utterance.onboundary = (event) => {
      if (event.name === 'word' || event.name === 'sentence') {
        const absoluteIndex = startOffset + event.charIndex;
        const progress = (absoluteIndex / text.length) * 100;
        onProgress(Math.min(progress, 100));
      }
    };
  }

  window.speechSynthesis.speak(utterance);
};

export const stopSpeaking = () => {
  window.speechSynthesis.cancel();
};
