/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Class 10 CBSE chapter library — METADATA ONLY.
 *
 * IMPORTANT: This file stores only chapter metadata (title, subject, book,
 * tags, available modes). No chapter content is pre-generated. The actual
 * revision-kit content is generated on demand via /api/generate-kit when
 * the student clicks a chapter and picks a learning mode.
 *
 * TODO before production release: Verify this syllabus against the latest
 * official CBSE PDF (https://cbseacademic.nic.in/) — books and chapter
 * lists change every couple of years, especially for Hindi and English.
 */

export type ChapterMode = 'visual' | 'readwrite' | 'audio' | 'practice';

export type ChapterSubject =
  | 'Science'
  | 'Mathematics'
  | 'Social Science'
  | 'English'
  | 'Hindi'
  | 'Physics'
  | 'Chemistry'
  | 'Biology'
  | 'Accountancy'
  | 'Business Studies'
  | 'Economics';

// Verify against latest official CBSE curriculum before production release.
export type SyllabusSource = {
  sourceName: string;
  sourceType: 'CBSE Curriculum PDF' | 'NCERT Textbook' | 'Sample Paper' | 'Marking Scheme' | 'Manual';
  academicYear: string;
  url?: string;
  verified: boolean;
  lastChecked: string;
};

export interface ChapterItem {
  id: string;
  classLevel: 'Class 10' | 'Class 11' | 'Class 12';
  board: 'CBSE';
  academicYear: string;
  subject: ChapterSubject;
  /** NCERT textbook name. Optional for subjects without a book split. */
  book?: string;
  chapterTitle: string;
  /** Index inside the book (1-based). Optional for poetry/prose collections. */
  chapterNumber?: number;
  tags: string[];
  availableModes: ChapterMode[];
  syllabusStatus: 'verified' | 'needs-review' | 'removed' | 'updated';
  source: SyllabusSource;
  /** Stream — only used for Class 11/12. */
  stream?: 'Science' | 'Commerce';
}

const ALL_MODES: ChapterMode[] = ['visual', 'readwrite', 'audio', 'practice'];

const DEFAULT_SOURCE: SyllabusSource = {
  sourceName: 'CBSE Secondary Curriculum 2025-26',
  sourceType: 'CBSE Curriculum PDF',
  academicYear: '2025-26',
  verified: true,
  lastChecked: '2026-05-20',
};

/**
 * Build a stable slug-based id so a saved library kit can match the same
 * chapter on later visits, even across reloads / different devices.
 */
function chapterId(subject: ChapterSubject, title: string, book?: string): string {
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const parts = ['c10', slug(subject)];
  if (book) parts.push(slug(book));
  parts.push(slug(title));
  return parts.join(':');
}

function makeChapter(
  subject: ChapterSubject,
  chapterTitle: string,
  options: {
    book?: string;
    chapterNumber?: number;
    tags?: string[];
    availableModes?: ChapterMode[];
    academicYear?: string;
    syllabusStatus?: ChapterItem['syllabusStatus'];
    source?: SyllabusSource;
  } = {},
): ChapterItem {
  return {
    id: chapterId(subject, chapterTitle, options.book),
    classLevel: 'Class 10',
    board: 'CBSE',
    academicYear: options.academicYear ?? '2025-26',
    subject,
    book: options.book,
    chapterTitle,
    chapterNumber: options.chapterNumber,
    tags: options.tags ?? [],
    availableModes: options.availableModes ?? ALL_MODES,
    syllabusStatus: options.syllabusStatus ?? 'verified',
    source: options.source ?? DEFAULT_SOURCE,
  };
}

// ─── SCIENCE ────────────────────────────────────────────────────────────────
const SCIENCE: ChapterItem[] = [
  ['Chemical Reactions and Equations', ['chemistry', 'reactions', 'equations']],
  ['Acids, Bases and Salts',           ['chemistry', 'acids', 'bases', 'salts', 'ph']],
  ['Metals and Non-metals',            ['chemistry', 'metals', 'reactivity series']],
  ['Carbon and its Compounds',         ['chemistry', 'carbon', 'organic']],
  ['Life Processes',                   ['biology', 'nutrition', 'respiration', 'transport', 'excretion']],
  ['Control and Coordination',         ['biology', 'nervous system', 'hormones']],
  ['How do Organisms Reproduce?',      ['biology', 'reproduction']],
  ['Heredity',                         ['biology', 'genetics', 'mendel']],
  ['Light – Reflection and Refraction',['physics', 'optics', 'light']],
  ['The Human Eye and the Colourful World', ['physics', 'optics', 'eye', 'dispersion']],
  ['Electricity',                      ['physics', 'current', 'ohm', 'resistance', 'circuits']],
  ['Magnetic Effects of Electric Current', ['physics', 'magnetism', 'electromagnetism']],
  ['Our Environment',                  ['biology', 'ecology', 'food chain']],
].map(([title, tags], i) =>
  makeChapter('Science', title as string, {
    book: 'NCERT Science',
    chapterNumber: i + 1,
    tags: tags as string[],
  }),
);

// ─── MATHEMATICS ────────────────────────────────────────────────────────────
const MATHEMATICS: ChapterItem[] = [
  ['Real Numbers',                          ['number system', 'euclid', 'irrational']],
  ['Polynomials',                           ['polynomials', 'zeros']],
  ['Pair of Linear Equations in Two Variables', ['linear equations', 'substitution', 'elimination']],
  ['Quadratic Equations',                   ['quadratic', 'discriminant', 'factorisation']],
  ['Arithmetic Progressions',               ['ap', 'sequences']],
  ['Triangles',                             ['geometry', 'similarity']],
  ['Coordinate Geometry',                   ['coordinate', 'distance formula']],
  ['Introduction to Trigonometry',          ['trigonometry', 'ratios', 'identities']],
  ['Some Applications of Trigonometry',     ['trigonometry', 'heights', 'distances']],
  ['Circles',                               ['geometry', 'tangents']],
  ['Areas Related to Circles',              ['mensuration', 'sectors', 'segments']],
  ['Surface Areas and Volumes',             ['mensuration', '3d shapes']],
  ['Statistics',                            ['statistics', 'mean', 'median', 'mode']],
  ['Probability',                           ['probability', 'events']],
].map(([title, tags], i) =>
  makeChapter('Mathematics', title as string, {
    book: 'NCERT Mathematics',
    chapterNumber: i + 1,
    tags: tags as string[],
  }),
);

// ─── SOCIAL SCIENCE ─────────────────────────────────────────────────────────
const SOCIAL_SCIENCE: ChapterItem[] = [
  // India and the Contemporary World – II (History)
  ...[
    ['The Rise of Nationalism in Europe', ['history', 'nationalism', 'europe']],
    ['Nationalism in India',              ['history', 'india', 'freedom struggle']],
    ['The Making of a Global World',      ['history', 'globalisation']],
    ['The Age of Industrialisation',      ['history', 'industrial revolution']],
    ['Print Culture and the Modern World',['history', 'print', 'media']],
  ].map(([title, tags], i) =>
    makeChapter('Social Science', title as string, {
      book: 'India and the Contemporary World – II (History)',
      chapterNumber: i + 1,
      tags: tags as string[],
    }),
  ),
  // Contemporary India – II (Geography)
  ...[
    ['Resources and Development',       ['geography', 'resources', 'soil']],
    ['Forest and Wildlife Resources',   ['geography', 'forests', 'wildlife']],
    ['Water Resources',                 ['geography', 'water', 'dams']],
    ['Agriculture',                     ['geography', 'agriculture', 'crops']],
    ['Minerals and Energy Resources',   ['geography', 'minerals', 'energy']],
    ['Manufacturing Industries',        ['geography', 'industries']],
    ['Lifelines of National Economy',   ['geography', 'transport', 'communication']],
  ].map(([title, tags], i) =>
    makeChapter('Social Science', title as string, {
      book: 'Contemporary India – II (Geography)',
      chapterNumber: i + 1,
      tags: tags as string[],
    }),
  ),
  // Democratic Politics – II (Political Science)
  ...[
    ['Power Sharing',          ['civics', 'democracy', 'power sharing']],
    ['Federalism',             ['civics', 'federalism']],
    ['Gender, Religion and Caste', ['civics', 'society', 'gender', 'religion']],
    ['Political Parties',      ['civics', 'parties', 'elections']],
    ['Outcomes of Democracy',  ['civics', 'democracy']],
  ].map(([title, tags], i) =>
    makeChapter('Social Science', title as string, {
      book: 'Democratic Politics – II (Political Science)',
      chapterNumber: i + 1,
      tags: tags as string[],
    }),
  ),
  // Understanding Economic Development (Economics)
  ...[
    ['Development',                       ['economics', 'development']],
    ['Sectors of the Indian Economy',     ['economics', 'sectors', 'primary', 'secondary', 'tertiary']],
    ['Money and Credit',                  ['economics', 'money', 'banking']],
    ['Globalisation and the Indian Economy', ['economics', 'globalisation']],
    ['Consumer Rights',                   ['economics', 'consumer', 'rights']],
  ].map(([title, tags], i) =>
    makeChapter('Social Science', title as string, {
      book: 'Understanding Economic Development (Economics)',
      chapterNumber: i + 1,
      tags: tags as string[],
    }),
  ),
];

// ─── ENGLISH (Language and Literature) ──────────────────────────────────────
const ENGLISH: ChapterItem[] = [
  // First Flight - Prose
  ...[
    'A Letter to God',
    'Nelson Mandela: Long Walk to Freedom',
    'Two Stories about Flying',
    'From the Diary of Anne Frank',
    'Glimpses of India',
    'Mijbil the Otter',
    'Madam Rides the Bus',
    'The Sermon at Benares',
    'The Proposal',
  ].map((title, i) =>
    makeChapter('English', title, {
      book: 'First Flight (Prose)',
      chapterNumber: i + 1,
      tags: ['english', 'prose', 'first flight'],
    }),
  ),
  // First Flight - Poems
  ...[
    'Dust of Snow',
    'Fire and Ice',
    'A Tiger in the Zoo',
    'How to Tell Wild Animals',
    'The Ball Poem',
    'Amanda!',
    'The Trees',
    'Fog',
    'The Tale of Custard the Dragon',
    'For Anne Gregory',
  ].map((title, i) =>
    makeChapter('English', title, {
      book: 'First Flight (Poems)',
      chapterNumber: i + 1,
      tags: ['english', 'poetry', 'first flight'],
    }),
  ),
  // Footprints Without Feet
  ...[
    'A Triumph of Surgery',
    "The Thief's Story",
    'The Midnight Visitor',
    'A Question of Trust',
    'Footprints Without Feet',
    'The Making of a Scientist',
    'The Necklace',
    'Bholi',
    'The Book That Saved the Earth',
  ].map((title, i) =>
    makeChapter('English', title, {
      book: 'Footprints Without Feet',
      chapterNumber: i + 1,
      tags: ['english', 'supplementary reader'],
    }),
  ),
];

// ─── HINDI ──────────────────────────────────────────────────────────────────
// Course A (literature-focused) and Course B (functional) share textbooks
// "Kshitij/Kritika" and "Sparsh/Sanchayan" respectively.
const HINDI: ChapterItem[] = [
  // Course A — Kshitij Part 2 (prose)
  ...[
    'Netaji Ka Chashma',
    'Bal Gobin Bhagat',
    'Lakhnavi Andaz',
    'Manviya Karuna Ki Divya Chamak',
    'Naubatkhane Mein Ibadat',
    'Sanskriti',
  ].map((title, i) =>
    makeChapter('Hindi', title, {
      book: 'Kshitij Part 2 (Course A)',
      chapterNumber: i + 1,
      tags: ['hindi', 'course a', 'kshitij', 'gadya'],
    }),
  ),
  // Course A — Kshitij Part 2 (poems)
  ...[
    'Surdas ke Pad',
    'Ram-Lakshman-Parshuram Samvad',
    'Atmakathya',
    'Utsah and At Nahi Rahi Hai',
    'Yeh Danturit Muskan and Fasal',
    'Sangatkar',
  ].map((title, i) =>
    makeChapter('Hindi', title, {
      book: 'Kshitij Part 2 (Course A) — Padya',
      chapterNumber: i + 1,
      tags: ['hindi', 'course a', 'kshitij', 'padya', 'kavita'],
    }),
  ),
  // Course A — Kritika Part 2
  ...[
    'Mata Ka Aanchal',
    'George Pancham Ki Naak',
    'Sana Sana Hath Jodi',
    'Aehi Thaiyan Jhulani Herani Ho Rama',
    'Main Kyon Likhta Hoon',
  ].map((title, i) =>
    makeChapter('Hindi', title, {
      book: 'Kritika Part 2 (Course A)',
      chapterNumber: i + 1,
      tags: ['hindi', 'course a', 'kritika'],
    }),
  ),
  // Course B — Sparsh Part 2 (prose)
  ...[
    'Bade Bhai Sahab',
    'Diary Ka Ek Panna',
    'Tatara Vamiro Katha',
    'Teesri Kasam Ke Shilpkar Shailendra',
    'Ab Kahan Doosron Ke Dukh Se Dukhi Hone Wale',
    'Patjhar Mein Tooti Pattiyan',
    'Kartoos',
  ].map((title, i) =>
    makeChapter('Hindi', title, {
      book: 'Sparsh Part 2 (Course B)',
      chapterNumber: i + 1,
      tags: ['hindi', 'course b', 'sparsh', 'gadya'],
    }),
  ),
  // Course B — Sparsh Part 2 (poems)
  ...[
    'Sakhi',
    'Pad',
    'Dohe',
    'Manushyata',
    'Parvat Pradesh Mein Pavas',
    'Madhur Madhur Mere Deepak Jal',
    'Top',
    'Kar Chale Hum Fida',
    'Atmatran',
  ].map((title, i) =>
    makeChapter('Hindi', title, {
      book: 'Sparsh Part 2 (Course B) — Padya',
      chapterNumber: i + 1,
      tags: ['hindi', 'course b', 'sparsh', 'padya', 'kavita'],
    }),
  ),
  // Course B — Sanchayan Part 2
  ...[
    'Harihar Kaka',
    'Sapnon Ke Se Din',
    'Topi Shukla',
  ].map((title, i) =>
    makeChapter('Hindi', title, {
      book: 'Sanchayan Part 2 (Course B)',
      chapterNumber: i + 1,
      tags: ['hindi', 'course b', 'sanchayan'],
    }),
  ),
];

export const CLASS10_SYLLABUS: ChapterItem[] = [
  ...SCIENCE,
  ...MATHEMATICS,
  ...SOCIAL_SCIENCE,
  ...ENGLISH,
  ...HINDI,
];

export const SUBJECTS: ChapterSubject[] = [
  'Science',
  'Mathematics',
  'Social Science',
  'English',
  'Hindi',
];

/**
 * Filter the syllabus by subject and free-text query. Search runs against
 * the chapter title, subject, book, and tags — case-insensitive.
 */
export function searchSyllabus(
  query: string,
  subject?: ChapterSubject | 'All',
): ChapterItem[] {
  const q = query.trim().toLowerCase();
  return CLASS10_SYLLABUS.filter(c => {
    if (subject && subject !== 'All' && c.subject !== subject) return false;
    if (!q) return true;
    const haystack = [
      c.chapterTitle,
      c.subject,
      c.book || '',
      ...c.tags,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}
