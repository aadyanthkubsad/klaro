/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CBSE Class 10 Previous Year & Sample Paper metadata.
 *
 * Each entry links to an OFFICIAL CBSE page — no pirated PDFs.
 * Cards open the CBSE website in a new tab so students can download
 * directly from the source.
 *
 * Correct URL patterns (verified 2026-05-31 from official CBSE index pages):
 *   Sample papers:  https://cbseacademic.nic.in/web_material/SQP/ClassX_YYYY_YY/Subject-SQP.pdf
 *   Marking schemes: https://cbseacademic.nic.in/web_material/SQP/ClassX_YYYY_YY/Subject-MS.pdf
 *   Index pages:    https://cbseacademic.nic.in/sqp_classx_YYYY-YY.html
 *   PYQ portal:     https://cbse.gov.in/cbse-previous-year-question-papers
 *   MS portal:      https://cbse.gov.in/cbse-marking-scheme
 *
 * Verified subject slugs (consistent across 2022-23, 2023-24, 2024-25):
 *   Science          → Science
 *   Maths Standard   → MathsStandard
 *   Maths Basic      → MathsBasic
 *   Social Science   → SocialScience
 *   English          → EnglishL
 *   Hindi A          → HindiCourseA
 *   Hindi B          → HindiCourseB
 *
 * IMPORTANT: Do NOT use the old broken pattern:
 *   https://cbseacademic.nic.in/SQP/CLASSX/YYYY-YY/...  (returns 404)
 */

import { PaperSource, PaperSubject, PaperYear, PaperType } from '../types';

// ─── Official CBSE portal pages (always-valid fallbacks) ───────────────────

const CBSE_PYQ_PAGE = 'https://cbse.gov.in/cbse-previous-year-question-papers';
const CBSE_MS_PAGE = 'https://cbse.gov.in/cbse-marking-scheme';

function sqpIndex(year: string): string {
  const [start, end] = year.split('-');
  return `https://cbseacademic.nic.in/sqp_classx_${start}-${end}.html`;
}

function sqpPdf(yearFolder: string, subjectSlug: string): string {
  return `https://cbseacademic.nic.in/web_material/SQP/ClassX_${yearFolder}/${subjectSlug}-SQP.pdf`;
}

function msPdf(yearFolder: string, subjectSlug: string): string {
  return `https://cbseacademic.nic.in/web_material/SQP/ClassX_${yearFolder}/${subjectSlug}-MS.pdf`;
}

// ─── Helper to create IDs deterministically ─────────────────────────────────

function paperId(subject: string, year: string, type: string, set?: string): string {
  const slug = `${subject}-${year}-${type}${set ? `-${set}` : ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  return `paper-${slug}`;
}

// Verified subject slug mapping (confirmed from official CBSE index pages 2022-25)
const SUBJECT_SLUGS: Record<string, string> = {
  'Science': 'Science',
  'Maths Standard': 'MathsStandard',
  'Maths Basic': 'MathsBasic',
  'Social Science': 'SocialScience',
  'English': 'EnglishL',
  'Hindi A': 'HindiCourseA',
  'Hindi B': 'HindiCourseB',
};

const TODAY = '2026-05-31';

// ─── Helper to build a verified sample paper entry ─────────────────────────

function verifiedSamplePaper(
  subject: PaperSubject,
  year: PaperYear,
  yearDash: string,
  yearFolder: string,
  setLabel: string,
): PaperSource {
  const slug = SUBJECT_SLUGS[subject];
  return {
    id: paperId(subject, year, 'sample-paper'),
    subject,
    year,
    classLevel: 'Class 10',
    board: 'CBSE',
    type: 'sample-paper',
    sourceName: 'CBSE',
    directPdfUrl: sqpPdf(yearFolder, slug),
    markingSchemeUrl: msPdf(yearFolder, slug),
    officialIndexUrl: sqpIndex(yearDash),
    verified: true,
    pdfStatus: 'verified',
    markingSchemeStatus: 'verified',
    lastChecked: TODAY,
    setLabel,
  };
}

// ─── Paper catalogue ────────────────────────────────────────────────────────

const CORE_SUBJECTS: PaperSubject[] = [
  'Science', 'Maths Standard', 'Maths Basic', 'Social Science',
  'English', 'Hindi A', 'Hindi B',
];

export const PAPER_CATALOGUE: PaperSource[] = [
  // ══════════════════════════════════════════════════════════════════════════
  //  SAMPLE PAPERS 2024-25 (Class X)  — ALL VERIFIED
  //  Index: https://cbseacademic.nic.in/sqp_classx_2024-25.html
  //  PDF pattern: /web_material/SQP/ClassX_2024_25/{Subject}-SQP.pdf
  // ══════════════════════════════════════════════════════════════════════════
  ...CORE_SUBJECTS.map(s => verifiedSamplePaper(s, '2025', '2024-25', '2024_25', '2024-25')),

  // ══════════════════════════════════════════════════════════════════════════
  //  SAMPLE PAPERS 2023-24 (Class X)  — ALL VERIFIED
  //  Index: https://cbseacademic.nic.in/sqp_classx_2023-24.html
  // ══════════════════════════════════════════════════════════════════════════
  ...CORE_SUBJECTS.map(s => verifiedSamplePaper(s, '2024', '2023-24', '2023_24', '2023-24')),

  // ══════════════════════════════════════════════════════════════════════════
  //  SAMPLE PAPERS 2022-23 (Class X)  — ALL VERIFIED
  //  Index: https://cbseacademic.nic.in/sqp_classx_2022-23.html
  // ══════════════════════════════════════════════════════════════════════════
  ...CORE_SUBJECTS.map(s => verifiedSamplePaper(s, '2023', '2022-23', '2022_23', '2022-23')),

  // ══════════════════════════════════════════════════════════════════════════
  //  PREVIOUS YEAR PAPERS 2020–2024
  //  These link to the CBSE PYQ portal page — individual PDFs are listed there.
  //  Direct PDF links are NOT verified because CBSE reorganises them frequently.
  // ══════════════════════════════════════════════════════════════════════════

  // 2024
  ...(['Science', 'Maths Standard', 'Maths Basic', 'Social Science', 'English', 'Hindi A', 'Hindi B'] as PaperSubject[]).map(subject => ({
    id: paperId(subject, '2024', 'previous-year'),
    subject,
    year: '2024' as PaperYear,
    classLevel: 'Class 10' as const,
    board: 'CBSE' as const,
    type: 'previous-year' as PaperType,
    sourceName: 'CBSE' as const,
    officialIndexUrl: CBSE_PYQ_PAGE,
    verified: false,
    pdfStatus: 'missing' as const,
    markingSchemeStatus: 'missing' as const,
    lastChecked: TODAY,
    setLabel: 'Set 1',
  })),

  // 2023
  ...(['Science', 'Maths Standard', 'Maths Basic', 'Social Science', 'English', 'Hindi A'] as PaperSubject[]).map(subject => ({
    id: paperId(subject, '2023', 'previous-year'),
    subject,
    year: '2023' as PaperYear,
    classLevel: 'Class 10' as const,
    board: 'CBSE' as const,
    type: 'previous-year' as PaperType,
    sourceName: 'CBSE' as const,
    officialIndexUrl: CBSE_PYQ_PAGE,
    verified: false,
    pdfStatus: 'missing' as const,
    markingSchemeStatus: 'missing' as const,
    lastChecked: TODAY,
    setLabel: 'Set 1',
  })),

  // 2022 (Term 2)
  ...(['Science', 'Maths Standard', 'Maths Basic', 'Social Science', 'English'] as PaperSubject[]).map(subject => ({
    id: paperId(subject, '2022', 'previous-year'),
    subject,
    year: '2022' as PaperYear,
    classLevel: 'Class 10' as const,
    board: 'CBSE' as const,
    type: 'previous-year' as PaperType,
    sourceName: 'CBSE' as const,
    officialIndexUrl: CBSE_PYQ_PAGE,
    verified: false,
    pdfStatus: 'missing' as const,
    markingSchemeStatus: 'missing' as const,
    lastChecked: TODAY,
    setLabel: 'Term 2',
  })),

  // 2021 (Term 1)
  ...(['Science', 'Maths Standard', 'Social Science'] as PaperSubject[]).map(subject => ({
    id: paperId(subject, '2021', 'previous-year'),
    subject,
    year: '2021' as PaperYear,
    classLevel: 'Class 10' as const,
    board: 'CBSE' as const,
    type: 'previous-year' as PaperType,
    sourceName: 'CBSE' as const,
    officialIndexUrl: CBSE_PYQ_PAGE,
    verified: false,
    pdfStatus: 'missing' as const,
    markingSchemeStatus: 'missing' as const,
    lastChecked: TODAY,
    setLabel: 'Term 1',
  })),

  // 2020
  ...(['Science', 'Maths Standard', 'Social Science', 'English'] as PaperSubject[]).map(subject => ({
    id: paperId(subject, '2020', 'previous-year'),
    subject,
    year: '2020' as PaperYear,
    classLevel: 'Class 10' as const,
    board: 'CBSE' as const,
    type: 'previous-year' as PaperType,
    sourceName: 'CBSE' as const,
    officialIndexUrl: CBSE_PYQ_PAGE,
    verified: false,
    pdfStatus: 'missing' as const,
    markingSchemeStatus: 'missing' as const,
    lastChecked: TODAY,
  })),

  // ══════════════════════════════════════════════════════════════════════════
  //  MARKING SCHEMES 2024
  //  These link to the CBSE marking scheme portal.
  // ══════════════════════════════════════════════════════════════════════════
  ...(['Science', 'Maths Standard', 'Maths Basic', 'Social Science', 'English', 'Hindi A', 'Hindi B'] as PaperSubject[]).map(subject => ({
    id: paperId(subject, '2024', 'marking-scheme'),
    subject,
    year: '2024' as PaperYear,
    classLevel: 'Class 10' as const,
    board: 'CBSE' as const,
    type: 'marking-scheme' as PaperType,
    sourceName: 'CBSE' as const,
    officialIndexUrl: CBSE_MS_PAGE,
    verified: false,
    pdfStatus: 'missing' as const,
    markingSchemeStatus: 'missing' as const,
    lastChecked: TODAY,
  })),
];

// ─── filter constants ───────────────────────────────────────────────────────

export const PAPER_SUBJECTS: PaperSubject[] = [
  'Science', 'Maths Standard', 'Maths Basic', 'Social Science',
  'English', 'Hindi A', 'Hindi B',
];

export const PAPER_YEARS: PaperYear[] = ['2025', '2024', '2023', '2022', '2021', '2020'];

export const PAPER_TYPES: { value: PaperType; label: string }[] = [
  { value: 'previous-year', label: 'Previous Year Paper' },
  { value: 'sample-paper', label: 'Sample Paper' },
  { value: 'marking-scheme', label: 'Marking Scheme' },
];

// ─── filter helper ──────────────────────────────────────────────────────────

export function filterPapers(
  papers: PaperSource[],
  filters: {
    subject?: PaperSubject | 'All';
    year?: PaperYear | 'All';
    type?: PaperType | 'All';
  },
): PaperSource[] {
  return papers.filter(p => {
    if (filters.subject && filters.subject !== 'All' && p.subject !== filters.subject) return false;
    if (filters.year && filters.year !== 'All' && p.year !== filters.year) return false;
    if (filters.type && filters.type !== 'All' && p.type !== filters.type) return false;
    return true;
  });
}
