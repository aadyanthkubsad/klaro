/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * pdfExport — shared text-based PDF generator for all learning-mode hubs.
 *
 * We deliberately do NOT use html2canvas. html2canvas + jsPDF can silently
 * fail on tainted canvases (cross-origin Unsplash images, web-fonts that
 * never finish loading, oversized layouts) which is exactly what was
 * happening in the old Read/Write export. This builder writes structured
 * text directly into the PDF, so it always produces a downloadable file
 * regardless of what's on screen.
 *
 * The "mode of learning" is recorded in the PDF header (visible to the
 * student) and in the filename, fulfilling the Pro-tier promise that the
 * exported notes remember which hub they came from.
 */

import { jsPDF } from 'jspdf';

export type LearningHub = 'visual' | 'readwrite' | 'aural';

const HUB_LABEL: Record<LearningHub, string> = {
  visual:    'Visual Hub',
  readwrite: 'Read / Write Hub',
  aural:     'Aural Hub',
};

const STORAGE_KEY = 'lumina:lastLearningMode';

/** Pro promise: remember the last hub the student used so navigation can resume there. */
export function setLastLearningMode(mode: LearningHub) {
  try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
}

export function getLastLearningMode(): LearningHub | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'visual' || v === 'readwrite' || v === 'aural') return v;
  } catch { /* ignore */ }
  return null;
}

interface AddLineOpts {
  size?: number;
  bold?: boolean;
  gap?: number;
  color?: [number, number, number];
}

/**
 * Build a clean, multi-page PDF from a kit object.
 * Works for all three hubs — they share the same kit shape; the mode
 * label only affects header text and filename.
 */
export function exportKitToPDF(kit: any, mode: LearningHub): boolean {
  if (!kit) {
    alert('No study content to export yet. Generate a revision kit first.');
    return false;
  }

  const title: string =
    kit.title || kit.quiz?.title || kit.topic || 'Lumina Study Notes';
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const addLine = (text: string, opts: AddLineOpts = {}) => {
    const { size = 11, bold = false, gap = 4, color = [33, 33, 33] } = opts;
    if (!text) return;
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
    const lines = pdf.splitTextToSize(String(text), maxWidth);
    lines.forEach((ln: string) => {
      if (y + size > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(ln, margin, y);
      y += size + gap;
    });
  };

  const sectionHeading = (text: string) => {
    y += 6;
    addLine(text, { size: 14, bold: true, gap: 8, color: [79, 70, 229] });
  };

  // Header
  addLine('KLARO LEARN', { size: 9, bold: true, color: [79, 70, 229], gap: 2 });
  addLine(title, { size: 22, bold: true, gap: 6 });
  addLine(
    `${HUB_LABEL[mode]} · Exported ${new Date().toLocaleDateString()}`,
    { size: 9, gap: 18, color: [120, 120, 120] },
  );

  // Executive Summary
  const summary =
    typeof kit.summary === 'string'
      ? kit.summary
      : kit.summary?.executiveSummary || kit.summary?.text || '';
  if (summary) {
    sectionHeading('Executive Summary');
    addLine(summary, { size: 11, gap: 14 });
  }

  // Key Points
  const keyPoints: string[] =
    (typeof kit.summary === 'object' && kit.summary?.keyPoints) ||
    kit.keyPoints ||
    [];
  if (Array.isArray(keyPoints) && keyPoints.length) {
    sectionHeading('Key Points');
    keyPoints.forEach(p => addLine(`•  ${p}`, { size: 11, gap: 4 }));
    y += 10;
  }

  // Key Vocabulary
  const vocab: any[] =
    (typeof kit.summary === 'object' && kit.summary?.keyVocabulary) ||
    kit.definitions ||
    [];
  if (Array.isArray(vocab) && vocab.length) {
    sectionHeading('Key Vocabulary');
    vocab.forEach(v => {
      const term = typeof v === 'string' ? v : v.term || v.word;
      const def = typeof v === 'string' ? '' : v.definition || v.def || v.meaning || '';
      if (!term) return;
      addLine(term, { size: 11, bold: true, gap: 2 });
      if (def) addLine(def, { size: 10, gap: 6, color: [80, 80, 80] });
    });
    y += 10;
  }

  // Aural-specific: lecture notes
  if (mode === 'aural' && kit.aural) {
    const notes = kit.aural.lectureNotes;
    if (notes) {
      sectionHeading('Lecture Notes');
      if (Array.isArray(notes)) {
        notes.forEach((n: string) => addLine(`•  ${n}`, { size: 11, gap: 4 }));
      } else {
        addLine(String(notes), { size: 11, gap: 4 });
      }
      y += 10;
    }
    if (kit.aural.audioScript) {
      sectionHeading('Audio Script');
      addLine(kit.aural.audioScript, { size: 11, gap: 4 });
      y += 10;
    }
  }

  // Visual-specific: concept map
  if (mode === 'visual' && Array.isArray(kit.visual?.conceptMap) && kit.visual.conceptMap.length) {
    sectionHeading('Concept Map');
    kit.visual.conceptMap.forEach((c: any) => {
      if (!c) return;
      addLine(c.node || c.label || 'Concept', { size: 11, bold: true, gap: 2 });
      if (c.reason || c.description) {
        addLine(c.reason || c.description, { size: 10, gap: 6, color: [80, 80, 80] });
      }
    });
    y += 10;
  }

  // ReadWrite-specific: synthesis prompt + external refs
  if (mode === 'readwrite' && kit.readWrite) {
    if (kit.readWrite.synthesisPrompt) {
      sectionHeading('Synthesis Prompt');
      addLine(kit.readWrite.synthesisPrompt, { size: 11, gap: 10 });
    }
    if (Array.isArray(kit.readWrite.externalReferences) && kit.readWrite.externalReferences.length) {
      sectionHeading('External References');
      kit.readWrite.externalReferences.forEach((r: string, i: number) =>
        addLine(`${i + 1}. ${r}`, { size: 10, gap: 4, color: [80, 80, 80] }),
      );
      y += 10;
    }
  }

  // English gloss (secondary English support for Hindi chapter kits)
  const gloss = kit.englishGloss;
  const isHindiKit = kit.language === 'hi' || (kit.subject || '').toString().toLowerCase() === 'hindi';
  if (isHindiKit && gloss && (gloss.summary || gloss.keyPoints?.length || gloss.vocabulary?.length)) {
    sectionHeading('English Translation (Secondary)');
    if (gloss.summary) addLine(gloss.summary, { size: 11, gap: 8 });
    if (Array.isArray(gloss.keyPoints) && gloss.keyPoints.length) {
      addLine('Key Points (English):', { size: 11, bold: true, gap: 4 });
      gloss.keyPoints.forEach((p: string) => addLine(`•  ${p}`, { size: 10, gap: 3, color: [80, 80, 80] }));
      y += 6;
    }
    if (Array.isArray(gloss.vocabulary) && gloss.vocabulary.length) {
      addLine('Vocabulary (Hindi → English):', { size: 11, bold: true, gap: 4 });
      gloss.vocabulary.forEach((v: any) => {
        if (!v) return;
        addLine(`${v.term || ''} — ${v.english || ''}`, { size: 10, gap: 3, color: [80, 80, 80] });
      });
      y += 10;
    }
  }

  // Flashcards (shared across all hubs)
  const cards: any[] = Array.isArray(kit.flashcards)
    ? kit.flashcards
    : kit.flashcards?.cards || [];
  if (cards.length) {
    sectionHeading('Flashcards');
    cards.forEach((c: any, i: number) => {
      if (!c) return;
      addLine(`Q${i + 1}.  ${c.front || ''}`, { size: 11, bold: true, gap: 2 });
      addLine(`Ans:  ${c.back || ''}`, { size: 10, gap: 8, color: [80, 80, 80] });
    });
  }

  // Footer note on the final page
  y = pageHeight - margin / 2;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(150, 150, 150);
  pdf.text(
    `Lumina Learn — your saved learning mode: ${HUB_LABEL[mode]}`,
    margin,
    y,
  );

  const safe = title.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'lumina_notes';
  pdf.save(`Lumina_${safe}_${mode}.pdf`);
  return true;
}
