/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Retrieval function for syllabus chunks. Used by the backend before
 * calling Gemini to ground generation in verified syllabus data.
 *
 * Pure function over the local SYLLABUS_CHUNKS array — no external calls.
 */

import { SYLLABUS_CHUNKS, SyllabusChunk } from './syllabusChunks.js';
import { CLASS10_SYLLABUS } from './class10Syllabus.js';

export interface RetrievalParams {
  chapterId?: string;
  chapterTitle?: string;
  subject?: string;
  tags?: string[];
  academicYear?: string;
}

export interface RetrievalResult {
  chunks: SyllabusChunk[];
  sourcesUsed: string[];
  academicYear: string;
  syllabusStatus: 'verified' | 'needs-review' | 'no-data';
}

export function retrieveChunks(params: RetrievalParams): RetrievalResult {
  const { chapterId, chapterTitle, subject, tags, academicYear } = params;
  const year = academicYear || '2025-26';

  let matched: SyllabusChunk[] = [];

  // Priority 1: exact chapterId match
  if (chapterId) {
    matched = SYLLABUS_CHUNKS.filter(
      c => c.chapterId === chapterId && c.academicYear === year,
    );
  }

  // Priority 2: fuzzy chapterTitle match (if no id match)
  if (matched.length === 0 && chapterTitle) {
    const needle = chapterTitle.trim().toLowerCase();
    // Try to find the canonical chapterId from the syllabus
    const syllabusEntry = CLASS10_SYLLABUS.find(
      s => s.chapterTitle.toLowerCase() === needle,
    );
    if (syllabusEntry) {
      matched = SYLLABUS_CHUNKS.filter(
        c => c.chapterId === syllabusEntry.id && c.academicYear === year,
      );
    }
    // Fallback: partial title match against chunk text
    if (matched.length === 0) {
      matched = SYLLABUS_CHUNKS.filter(
        c =>
          c.academicYear === year &&
          c.text.toLowerCase().includes(needle),
      );
    }
  }

  // Priority 3: subject + tag overlap — only when no specific chapter was requested.
  // When chapterId or chapterTitle is provided, an empty match means we have no
  // chunks for that chapter; don't pollute with unrelated subject-level chunks.
  if (matched.length === 0 && subject && !chapterId && !chapterTitle) {
    const subjectChunks = SYLLABUS_CHUNKS.filter(
      c => c.subject === subject && c.academicYear === year,
    );
    if (tags && tags.length > 0) {
      const tagSet = new Set(tags.map(t => t.toLowerCase()));
      matched = subjectChunks.filter(c =>
        c.text
          .toLowerCase()
          .split(/\s+/)
          .some(word => tagSet.has(word)),
      );
    }
    if (matched.length === 0) {
      matched = subjectChunks;
    }
  }

  // Deduplicate by id
  const seen = new Set<string>();
  const unique = matched.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  const sourcesUsed = [...new Set(unique.map(c => c.sourceName))];

  // Determine syllabus status from the chapter metadata
  let syllabusStatus: RetrievalResult['syllabusStatus'] = 'no-data';
  if (unique.length > 0) {
    const resolvedId = chapterId || (chapterTitle
      ? CLASS10_SYLLABUS.find(s => s.chapterTitle.toLowerCase() === chapterTitle.trim().toLowerCase())?.id
      : undefined);
    if (resolvedId) {
      const entry = CLASS10_SYLLABUS.find(s => s.id === resolvedId);
      syllabusStatus = entry?.syllabusStatus === 'verified' ? 'verified' : 'needs-review';
    } else {
      syllabusStatus = 'verified';
    }
  }

  return {
    chunks: unique,
    sourcesUsed,
    academicYear: year,
    syllabusStatus,
  };
}
