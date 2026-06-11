import { useState, useCallback } from 'react';
import { aiService } from '../services/aiService';
import { FlashcardSet, Flashcard } from '../types';
import type { RevisionKit } from '../types/kit';

interface UseFlashcardsOptions {
  currentKit: RevisionKit | null;
  setView: (v: string) => void;
}

export function useFlashcards({ currentKit, setView }: UseFlashcardsOptions) {
  const [flashcardSet, setFlashcardSet] = useState<FlashcardSet | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<{ topic: string; sourceKitId?: string } | null>(null);

  const normaliseCards = (raw: any[]): Flashcard[] =>
    raw.map(c => ({ front: c.front, back: c.back, topicTag: c.topicTag, difficulty: c.difficulty }));

  const openFlashcards = useCallback(async (
    topic: string,
    sourceKitId?: string,
    preloadedCards?: Flashcard[],
  ) => {
    setView('flashcards');
    setError(null);
    setLastRequest({ topic, sourceKitId });

    if (Array.isArray(preloadedCards) && preloadedCards.length > 0) {
      setFlashcardSet({ topic, cards: normaliseCards(preloadedCards), sourceKitId });
      return;
    }

    // Try current kit
    const kitCards = currentKit?.flashcards?.cards ?? (Array.isArray(currentKit?.flashcards) ? currentKit.flashcards : null);
    if (Array.isArray(kitCards) && kitCards.length > 0 &&
        (!topic || currentKit?.title === topic || currentKit?.topic === topic || !currentKit?.title)) {
      setFlashcardSet({
        topic: currentKit?.title ?? currentKit?.topic ?? topic,
        cards: normaliseCards(kitCards),
        sourceKitId: currentKit?.id ?? sourceKitId,
      });
      return;
    }

    // Try fetching from library kit
    if (sourceKitId) {
      try {
        const res = await fetch(`/api/get-kit/${sourceKitId}`);
        if (res.ok) {
          const json = await res.json();
          const cards = json?.data?.flashcards?.cards ?? json?.data?.flashcards;
          if (Array.isArray(cards) && cards.length > 0) {
            setFlashcardSet({ topic: json.data.title ?? topic, cards, sourceKitId });
            return;
          }
        }
      } catch { /* fall through to generate */ }
    }

    // Generate fresh
    setFlashcardSet(null);
    setIsLoading(true);
    try {
      const data = await aiService.generateFlashcards({
        topic,
        classLevel: currentKit?.classLevel ?? 'Class 10',
        examMode: 'CBSE',
      });
      setFlashcardSet({ topic: data.topic, cards: data.flashcards, sourceKitId });
    } catch (e: any) {
      setError(e?.message ?? 'Failed to generate flashcards. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [currentKit, setView]);

  const retry = useCallback(() => {
    if (!lastRequest) return;
    openFlashcards(lastRequest.topic, lastRequest.sourceKitId);
  }, [lastRequest, openFlashcards]);

  return { flashcardSet, setFlashcardSet, isLoading, error, openFlashcards, retry };
}
