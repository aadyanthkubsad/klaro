/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Local syllabus chunks — retrieval-ready metadata for grounding AI
 * generation in verified syllabus data.
 *
 * IMPORTANT: This file stores only syllabus metadata, topic names,
 * learning outcomes, and exam-style guidance. Do NOT add copyrighted
 * full textbook content.
 *
 * Verify against latest official CBSE curriculum before production release.
 */

export type SyllabusChunk = {
  id: string;
  chapterId: string;
  subject: string;
  academicYear: string;
  chunkType:
    | 'learning-outcome'
    | 'topic-list'
    | 'deleted-topic'
    | 'exam-pattern'
    | 'sample-question'
    | 'marking-scheme';
  text: string;
  sourceName: string;
  sourceUrl?: string;
};

export const SYLLABUS_CHUNKS: SyllabusChunk[] = [
  // ── Chemical Reactions and Equations ──────────────────────────────────────
  {
    id: 'chunk-chem-react-topics',
    chapterId: 'c10:science:ncert-science:chemical-reactions-and-equations',
    subject: 'Science',
    academicYear: '2025-26',
    chunkType: 'topic-list',
    text: 'Topics: Chemical equation, Balanced chemical equation, implications of a balanced chemical equation, types of chemical reactions — combination, decomposition, displacement, double displacement, precipitation, endothermic exothermic reactions, oxidation and reduction.',
    sourceName: 'CBSE Secondary Curriculum 2025-26',
  },
  {
    id: 'chunk-chem-react-outcomes',
    chapterId: 'c10:science:ncert-science:chemical-reactions-and-equations',
    subject: 'Science',
    academicYear: '2025-26',
    chunkType: 'learning-outcome',
    text: 'Learning outcomes: Students should be able to write and balance chemical equations, identify types of chemical reactions from given equations, differentiate between exothermic and endothermic reactions, explain oxidation and reduction with examples, and relate everyday phenomena (rusting, rancidity) to chemical reactions.',
    sourceName: 'CBSE Secondary Curriculum 2025-26',
  },
  {
    id: 'chunk-chem-react-exam',
    chapterId: 'c10:science:ncert-science:chemical-reactions-and-equations',
    subject: 'Science',
    academicYear: '2025-26',
    chunkType: 'exam-pattern',
    text: 'Exam pattern: This chapter typically carries 3-5 marks in CBSE board exams. Frequently asked: balancing equations (1-2 marks), identifying reaction type from a given equation (1 mark), short-answer on corrosion/rancidity (2-3 marks). Activity-based questions on decomposition of ferrous sulphate or lead nitrate are common.',
    sourceName: 'CBSE Sample Paper 2025-26',
  },

  // ── Life Processes ───────────────────────────────────────────────────────
  {
    id: 'chunk-life-proc-topics',
    chapterId: 'c10:science:ncert-science:life-processes',
    subject: 'Science',
    academicYear: '2025-26',
    chunkType: 'topic-list',
    text: 'Topics: Life processes — nutrition (autotrophic, heterotrophic), respiration (aerobic, anaerobic), transportation in plants and animals (xylem, phloem, heart, blood, blood vessels), excretion in plants and animals (kidneys, nephron, dialysis).',
    sourceName: 'CBSE Secondary Curriculum 2025-26',
  },
  {
    id: 'chunk-life-proc-outcomes',
    chapterId: 'c10:science:ncert-science:life-processes',
    subject: 'Science',
    academicYear: '2025-26',
    chunkType: 'learning-outcome',
    text: 'Learning outcomes: Students should be able to explain photosynthesis with chemical equation, differentiate between aerobic and anaerobic respiration, draw and label the human heart and explain double circulation, describe the structure and function of nephron, and explain transpiration and translocation in plants.',
    sourceName: 'CBSE Secondary Curriculum 2025-26',
  },

  // ── Real Numbers ─────────────────────────────────────────────────────────
  {
    id: 'chunk-real-num-topics',
    chapterId: 'c10:mathematics:ncert-mathematics:real-numbers',
    subject: 'Mathematics',
    academicYear: '2025-26',
    chunkType: 'topic-list',
    text: "Topics: Fundamental Theorem of Arithmetic — statement after reviewing work done earlier and after illustrating and motivating through examples, proofs of irrationality of √2, √3, √5. Decimal representation of rational numbers in terms of terminating/non-terminating recurring decimals.",
    sourceName: 'CBSE Secondary Curriculum 2025-26',
  },
  {
    id: 'chunk-real-num-outcomes',
    chapterId: 'c10:mathematics:ncert-mathematics:real-numbers',
    subject: 'Mathematics',
    academicYear: '2025-26',
    chunkType: 'learning-outcome',
    text: "Learning outcomes: Students should be able to apply Euclid's division algorithm to find HCF, use the Fundamental Theorem of Arithmetic for finding HCF and LCM, prove irrationality of numbers like √2 and √3, and determine whether a given rational number has a terminating or non-terminating repeating decimal expansion.",
    sourceName: 'CBSE Secondary Curriculum 2025-26',
  },

  // ── Nationalism in India ─────────────────────────────────────────────────
  {
    id: 'chunk-nationalism-topics',
    chapterId: 'c10:social-science:india-and-the-contemporary-world-ii-history:nationalism-in-india',
    subject: 'Social Science',
    academicYear: '2025-26',
    chunkType: 'topic-list',
    text: 'Topics: First World War, Khilafat and Non-Cooperation, differing strands within the movement, towards Civil Disobedience, sense of collective belonging. Key events: Jallianwala Bagh, Rowlatt Act, Salt March, Gandhi-Irwin Pact, Round Table Conferences.',
    sourceName: 'CBSE Secondary Curriculum 2025-26',
  },
  {
    id: 'chunk-nationalism-outcomes',
    chapterId: 'c10:social-science:india-and-the-contemporary-world-ii-history:nationalism-in-india',
    subject: 'Social Science',
    academicYear: '2025-26',
    chunkType: 'learning-outcome',
    text: 'Learning outcomes: Students should be able to explain the growth of nationalism in India, analyse the role of Mahatma Gandhi in the national movement, describe Non-Cooperation and Civil Disobedience movements with causes and outcomes, explain the participation of different social groups, and understand how symbols and icons helped create a sense of collective belonging.',
    sourceName: 'CBSE Secondary Curriculum 2025-26',
  },
];
