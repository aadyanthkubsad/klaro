/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CBSE Syllabus Verification — checks chapter names against
 * the official CBSE Academic Curriculum 2025-26.
 *
 * Reference: https://cbseacademic.nic.in/
 * Last verified: 2026-05-31
 */

export interface VerificationResult {
  chapter: string;
  subject: string;
  classLevel: string;
  found: boolean;
  officialName?: string;
  source: string;
  checkedAt: string;
}

/**
 * Known CBSE Class 10 curriculum chapters (2025-26).
 * Manually verified against CBSE Academic and NCERT textbook TOCs.
 */
const CBSE_CLASS10_CURRICULUM: Record<string, string[]> = {
  'Science': [
    'Chemical Reactions and Equations',
    'Acids, Bases and Salts',
    'Metals and Non-metals',
    'Carbon and its Compounds',
    'Life Processes',
    'Control and Coordination',
    'How do Organisms Reproduce?',
    'Heredity',
    'Light – Reflection and Refraction',
    'The Human Eye and the Colourful World',
    'Electricity',
    'Magnetic Effects of Electric Current',
    'Our Environment',
  ],
  'Mathematics': [
    'Real Numbers',
    'Polynomials',
    'Pair of Linear Equations in Two Variables',
    'Quadratic Equations',
    'Arithmetic Progressions',
    'Triangles',
    'Coordinate Geometry',
    'Introduction to Trigonometry',
    'Some Applications of Trigonometry',
    'Circles',
    'Areas Related to Circles',
    'Surface Areas and Volumes',
    'Statistics',
    'Probability',
  ],
  'Social Science': [
    'The Rise of Nationalism in Europe',
    'Nationalism in India',
    'The Making of a Global World',
    'The Age of Industrialisation',
    'Print Culture and the Modern World',
    'Resources and Development',
    'Forest and Wildlife Resources',
    'Water Resources',
    'Agriculture',
    'Minerals and Energy Resources',
    'Manufacturing Industries',
    'Life Lines of National Economy',
    'Power Sharing',
    'Federalism',
    'Gender, Religion and Caste',
    'Political Parties',
    'Outcomes of Democracy',
    'Development',
    'Sectors of the Indian Economy',
    'Money and Credit',
    'Globalisation and the Indian Economy',
    'Consumer Rights',
  ],
  'English': [
    'A Letter to God',
    'Nelson Mandela: Long Walk to Freedom',
    'Two Stories about Flying',
    'From the Diary of Anne Frank',
    'Glimpses of India',
    'Mijbil the Otter',
    'Madam Rides the Bus',
    'The Sermon at Benares',
    'The Proposal',
    // First Flight poems
    'Dust of Snow',
    'Fire and Ice',
    'A Tiger in the Zoo',
    'How to Tell Wild Animals',
    'The Ball Poem',
    'Amanda!',
    'Animals',
    'The Trees',
    'Fog',
    'The Tale of Custard the Dragon',
    'For Anne Gregory',
    // Footprints without Feet
    'A Triumph of Surgery',
    'The Thief\'s Story',
    'The Midnight Visitor',
    'A Question of Trust',
    'Footprints without Feet',
    'The Making of a Scientist',
    'The Necklace',
    'The Hack Driver',
    'Bholi',
    'The Book That Saved the Earth',
  ],
  'Hindi': [
    // Kshitij (क्षितिज)
    'सूरदास के पद',
    'राम-लक्ष्मण-परशुराम संवाद',
    'सवैया और कवित्त',
    'आत्मकथ्य',
    'उत्साह और अट नहीं रही',
    'यह दंतुरहित मुस्कान और फसल',
    'छाया मत छूना',
    'कन्यादान',
    'संगतकार',
    // Kritika (कृतिका)
    'माता का अँचल',
    'जॉर्ज पंचम की नाक',
    'साना-साना हाथ जोड़ि',
    'एही ठैयाँ झुलनी हेरानी हो रामा!',
    'मैं क्यों लिखता हूँ?',
  ],
};

/**
 * Verify a single chapter name against the official CBSE curriculum.
 * Uses exact match first, then fuzzy (substring) match.
 */
export function verifyChapter(chapter: string, subject: string, classLevel: string = 'Class 10'): VerificationResult {
  const curriculum = CBSE_CLASS10_CURRICULUM[subject] || [];
  const normalized = chapter.trim().toLowerCase();

  // Exact match (case-insensitive)
  const exactMatch = curriculum.find(c => c.toLowerCase() === normalized);

  // Fuzzy match — substring in either direction
  const fuzzyMatch = !exactMatch
    ? curriculum.find(c =>
        c.toLowerCase().includes(normalized) || normalized.includes(c.toLowerCase())
      )
    : null;

  return {
    chapter,
    subject,
    classLevel,
    found: !!exactMatch || !!fuzzyMatch,
    officialName: exactMatch || fuzzyMatch || undefined,
    source: 'CBSE Academic Curriculum 2025-26',
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Verify multiple chapters at once.
 */
export function verifyAllChapters(
  chapters: Array<{ title: string; subject: string }>,
  classLevel: string = 'Class 10'
): VerificationResult[] {
  return chapters.map(c => verifyChapter(c.title, c.subject, classLevel));
}

/**
 * Get the full official curriculum for a subject.
 */
export function getOfficialCurriculum(subject: string): string[] {
  return CBSE_CLASS10_CURRICULUM[subject] || [];
}

/**
 * List all subjects with known curriculum data.
 */
export function getVerifiedSubjects(): string[] {
  return Object.keys(CBSE_CLASS10_CURRICULUM);
}
