/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CBSE chapter-level marks weightage and audio duration targets.
 *
 * Sources (all for academic year 2025-26):
 *   - CBSE Secondary Curriculum: cbseacademic.nic.in
 *   - CBSE Class X Marking Scheme: cbse.gov.in
 *   - CBSE Class XI/XII Marking Scheme: cbse.gov.in
 *   - CollegeDekho, Vedantu, Embibe, PW aggregated data
 *
 * The data here drives the audio narration length: heavier chapters
 * (more board marks, more content) get longer narrations (up to 15 min),
 * lighter chapters get shorter ones (minimum 5 min).
 *
 * Speaking rate assumption: ~130 words per minute for clear TTS narration.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ContentDepth = 'light' | 'moderate' | 'heavy' | 'very-heavy';

export interface ChapterAudioTarget {
  /** Approximate marks this chapter carries in the board exam. */
  estimatedMarks: number;
  /** How conceptually dense the chapter is. */
  contentDepth: ContentDepth;
  /** Target narration duration in minutes. */
  targetMinutes: number;
  /** Target word count for the Gemini script. */
  targetWords: number;
}

// ─── Duration calculation ───────────────────────────────────────────────────

const WORDS_PER_MINUTE = 130; // TTS speaking rate

function target(marks: number, depth: ContentDepth): ChapterAudioTarget {
  // Base minutes from marks (1 mark ≈ 1 minute of explanation)
  let baseMins = Math.max(5, Math.round(marks * 1.2));

  // Depth multiplier
  const depthMultiplier: Record<ContentDepth, number> = {
    'light': 0.8,
    'moderate': 1.0,
    'heavy': 1.2,
    'very-heavy': 1.4,
  };

  let mins = Math.round(baseMins * depthMultiplier[depth]);

  // Clamp to 5-15 minute range
  mins = Math.max(5, Math.min(15, mins));

  return {
    estimatedMarks: marks,
    contentDepth: depth,
    targetMinutes: mins,
    targetWords: mins * WORDS_PER_MINUTE,
  };
}

// ─── Class 10 Science (Theory: 80 marks) ────────────────────────────────────
// Unit I: Chemical Substances – Nature and Behaviour: 25 marks (4 chapters)
// Unit II: World of Living: 25 marks (4 chapters)
// Unit III: Natural Phenomena: 12 marks (2 chapters)
// Unit IV: Effects of Current: 13 marks (2 chapters)
// Unit V: Natural Resources: 5 marks (1 chapter)

const CLASS10_SCIENCE: Record<string, ChapterAudioTarget> = {
  'chemical reactions and equations':     target(7, 'heavy'),
  'acids, bases and salts':               target(7, 'heavy'),
  'metals and non-metals':                target(6, 'heavy'),
  'carbon and its compounds':             target(7, 'very-heavy'),  // Very content-dense: homologous series, functional groups, reactions
  'life processes':                        target(10, 'very-heavy'), // Highest marks in biology, covers nutrition/respiration/transport/excretion
  'control and coordination':              target(5, 'heavy'),
  'how do organisms reproduce?':           target(5, 'heavy'),
  'heredity':                              target(5, 'moderate'),
  'light – reflection and refraction':     target(8, 'very-heavy'), // Numericals-heavy, mirror/lens formulas
  'the human eye and the colourful world': target(4, 'moderate'),
  'electricity':                           target(8, 'very-heavy'), // Most numericals, Ohm's law, circuits, power
  'magnetic effects of electric current':  target(5, 'heavy'),
  'our environment':                       target(5, 'light'),
};

// ─── Class 10 Mathematics (Theory: 80 marks) ────────────────────────────────
// Unit 1: Number Systems: 5 marks
// Unit 2: Algebra: 21 marks (4 chapters)
// Unit 3: Coordinate Geometry: 6 marks
// Unit 4: Trigonometry: 12 marks (2 chapters)
// Unit 5: Geometry: 15 marks (2 chapters)
// Unit 6: Mensuration: 10 marks (2 chapters)
// Unit 7: Statistics & Probability: 11 marks (2 chapters)

const CLASS10_MATHS: Record<string, ChapterAudioTarget> = {
  'real numbers':                               target(5, 'moderate'),
  'polynomials':                                target(4, 'moderate'),
  'pair of linear equations in two variables':   target(7, 'heavy'),    // Multiple methods, word problems
  'quadratic equations':                         target(6, 'heavy'),    // Discriminant, factorisation, formula
  'arithmetic progressions':                     target(5, 'heavy'),    // nth term, sum formulas, word problems
  'triangles':                                   target(8, 'heavy'),    // Similarity theorems, proofs
  'coordinate geometry':                         target(6, 'moderate'),
  'introduction to trigonometry':                target(7, 'heavy'),    // Ratios, identities, proofs
  'some applications of trigonometry':           target(5, 'heavy'),    // Heights and distances
  'circles':                                     target(7, 'heavy'),    // Tangent theorems, proofs
  'areas related to circles':                    target(5, 'moderate'),
  'surface areas and volumes':                   target(5, 'heavy'),    // Combination of solids
  'statistics':                                  target(6, 'moderate'),
  'probability':                                 target(5, 'moderate'),
};

// ─── Class 10 Social Science (Theory: 80 marks) ─────────────────────────────
// History: 20 marks (5 chapters)
// Geography: 20 marks (7 chapters)
// Political Science: 20 marks (5 chapters)
// Economics: 20 marks (5 chapters)

const CLASS10_SOCIAL: Record<string, ChapterAudioTarget> = {
  // History
  'the rise of nationalism in europe':     target(5, 'heavy'),
  'nationalism in india':                   target(6, 'very-heavy'),  // Longest and most important history chapter
  'the making of a global world':           target(4, 'moderate'),
  'the age of industrialisation':           target(4, 'moderate'),
  'print culture and the modern world':     target(3, 'moderate'),
  // Geography
  'resources and development':              target(4, 'moderate'),
  'forest and wildlife resources':          target(3, 'light'),
  'water resources':                        target(3, 'moderate'),
  'agriculture':                            target(4, 'heavy'),
  'minerals and energy resources':          target(3, 'moderate'),
  'manufacturing industries':               target(3, 'moderate'),
  'lifelines of national economy':          target(3, 'moderate'),
  // Political Science
  'power sharing':                          target(4, 'moderate'),
  'federalism':                             target(5, 'heavy'),
  'gender, religion and caste':             target(4, 'moderate'),
  'political parties':                      target(4, 'heavy'),
  'outcomes of democracy':                  target(4, 'moderate'),
  // Economics
  'development':                            target(4, 'moderate'),
  'sectors of the indian economy':          target(5, 'heavy'),
  'money and credit':                       target(4, 'heavy'),
  'globalisation and the indian economy':   target(4, 'moderate'),
  'consumer rights':                        target(3, 'moderate'),
};

// ─── Class 10 English ────────────────────────────────────────────────────────
// Not marks-weighted per chapter in the same way; use moderate defaults
const CLASS10_ENGLISH: Record<string, ChapterAudioTarget> = {};
// Will fall through to default

// ─── Class 10 Hindi ──────────────────────────────────────────────────────────
const CLASS10_HINDI: Record<string, ChapterAudioTarget> = {};
// Will fall through to default

// ─── Class 11 Physics (Theory: 70 marks) ────────────────────────────────────
// Units I-III (Physical World, Kinematics, Laws of Motion): 23 marks
// Units IV-VI (Work/Energy, Rotational Motion, Gravitation): 17 marks
// Units VII-IX (Properties of Matter, Thermodynamics, Kinetic Theory): 20 marks
// Unit X (Oscillations and Waves): 10 marks

const CLASS11_PHYSICS: Record<string, ChapterAudioTarget> = {
  'units and measurements':                    target(4, 'moderate'),
  'motion in a straight line':                 target(6, 'heavy'),     // Graphs, equations of motion
  'motion in a plane':                         target(7, 'very-heavy'), // Projectile, circular motion, vectors
  'laws of motion':                            target(8, 'very-heavy'), // Newton's laws, friction, numericals
  'work, energy and power':                    target(7, 'heavy'),
  'system of particles and rotational motion': target(8, 'very-heavy'), // Moment of inertia, angular momentum
  'gravitation':                               target(6, 'heavy'),
  'mechanical properties of solids':           target(5, 'moderate'),
  'mechanical properties of fluids':           target(6, 'heavy'),     // Bernoulli, viscosity
  'thermal properties of matter':              target(5, 'moderate'),
  'thermodynamics':                            target(7, 'very-heavy'), // Laws, Carnot cycle
  'kinetic theory':                            target(5, 'heavy'),
  'oscillations':                              target(5, 'heavy'),     // SHM, numericals
  'waves':                                     target(5, 'heavy'),
};

// ─── Class 11 Chemistry (Theory: 70 marks) ──────────────────────────────────

const CLASS11_CHEMISTRY: Record<string, ChapterAudioTarget> = {
  'some basic concepts of chemistry':     target(7, 'heavy'),     // Mole concept
  'structure of atom':                    target(9, 'very-heavy'), // Quantum numbers, orbitals
  'classification of elements and periodicity in properties': target(6, 'moderate'),
  'chemical bonding and molecular structure': target(7, 'very-heavy'), // VSEPR, MO theory
  'chemical thermodynamics':              target(9, 'very-heavy'), // Hess's law, enthalpy
  'equilibrium':                          target(7, 'very-heavy'), // Ionic, pH, buffer
  'redox reactions':                      target(4, 'moderate'),
  'organic chemistry – some basic principles and techniques': target(11, 'very-heavy'), // Highest marks
  'hydrocarbons':                         target(10, 'very-heavy'),
};

// ─── Class 11 Biology (Theory: 70 marks) ────────────────────────────────────

const CLASS11_BIOLOGY: Record<string, ChapterAudioTarget> = {
  'the living world':                       target(4, 'moderate'),
  'biological classification':              target(5, 'heavy'),
  'plant kingdom':                          target(5, 'heavy'),
  'animal kingdom':                         target(6, 'very-heavy'), // Huge chapter, all phyla
  'morphology of flowering plants':         target(5, 'heavy'),
  'anatomy of flowering plants':            target(5, 'heavy'),
  'structural organisation in animals':     target(4, 'moderate'),
  'cell: the unit of life':                 target(6, 'very-heavy'),
  'biomolecules':                           target(5, 'heavy'),
  'cell cycle and cell division':           target(5, 'heavy'),
  'photosynthesis in higher plants':        target(5, 'heavy'),
  'respiration in plants':                  target(4, 'moderate'),
  'plant growth and development':           target(4, 'moderate'),
  'breathing and exchange of gases':        target(5, 'heavy'),
  'body fluids and circulation':            target(5, 'heavy'),
  'excretory products and their elimination': target(5, 'heavy'),
  'locomotion and movement':                target(4, 'moderate'),
  'neural control and coordination':        target(6, 'very-heavy'),
};

// ─── Class 11 Mathematics (Theory: 80 marks) ────────────────────────────────
// Sets & Functions: 23 marks, Algebra: 25 marks, Coordinate Geometry: 12 marks
// Calculus: 8 marks, Statistics & Probability: 12 marks

const CLASS11_MATHS: Record<string, ChapterAudioTarget> = {
  'sets':                                   target(5, 'moderate'),
  'relations and functions':                target(6, 'heavy'),
  'trigonometric functions':                target(8, 'very-heavy'), // Huge chapter, identities
  'complex numbers and quadratic equations': target(5, 'heavy'),
  'linear inequalities':                    target(4, 'moderate'),
  'permutations and combinations':          target(6, 'heavy'),
  'binomial theorem':                       target(5, 'heavy'),
  'sequences and series':                   target(7, 'very-heavy'), // AP, GP, sum formulas
  'straight lines':                         target(5, 'heavy'),
  'conic sections':                         target(7, 'very-heavy'), // Parabola, ellipse, hyperbola
  'introduction to three dimensional geometry': target(3, 'moderate'),
  'limits and derivatives':                 target(8, 'very-heavy'), // Foundation for calculus
  'statistics':                             target(5, 'moderate'),
  'probability':                            target(5, 'moderate'),
};

// ─── Class 11 Accountancy (Theory: 80 marks) ────────────────────────────────
// Theoretical Framework: 12 marks, Accounting Process: 44 marks
// Financial Statements: 24 marks

const CLASS11_ACCOUNTANCY: Record<string, ChapterAudioTarget> = {
  'introduction to accounting':             target(4, 'moderate'),
  'theory base of accounting':              target(5, 'heavy'),
  'recording of transactions – i':          target(8, 'very-heavy'), // Journal entries
  'recording of transactions – ii':         target(7, 'very-heavy'), // Cash book, ledger
  'bank reconciliation statement':          target(5, 'heavy'),
  'trial balance and rectification of errors': target(6, 'heavy'),
  'depreciation, provisions and reserves':  target(6, 'heavy'),
  'bills of exchange':                      target(5, 'moderate'),
  'financial statements – i':               target(7, 'very-heavy'),
  'financial statements – ii':              target(7, 'very-heavy'),
};

// ─── Class 11 Business Studies (Theory: 80 marks) ───────────────────────────
// Part A: Foundations of Business: 40 marks, Part B: Finance and Trade: 40 marks

const CLASS11_BUSINESS: Record<string, ChapterAudioTarget> = {
  'nature and purpose of business':         target(5, 'moderate'),
  'forms of business organisations':        target(7, 'very-heavy'), // Sole prop, partnership, company
  'private, public and global enterprises': target(5, 'moderate'),
  'business services':                      target(5, 'moderate'),
  'emerging modes of business':             target(5, 'moderate'),
  'social responsibilities of business and business ethics': target(4, 'moderate'),
  'sources of business finance':            target(7, 'heavy'),
  'small business':                         target(4, 'moderate'),
  'internal trade':                         target(5, 'moderate'),
  'international business':                 target(5, 'heavy'),
  'international trade':                    target(5, 'heavy'),
};

// ─── Class 11 Economics (Theory: 80 marks) ──────────────────────────────────
// Part A: Statistics for Economics: 40 marks
// Part B: Introductory Microeconomics: 40 marks

const CLASS11_ECONOMICS: Record<string, ChapterAudioTarget> = {
  'introduction':                           target(4, 'moderate'),
  'collection of data':                     target(5, 'moderate'),
  'organisation of data':                   target(5, 'moderate'),
  'presentation of data':                   target(5, 'moderate'),
  'measures of central tendency':           target(7, 'heavy'),
  'measures of dispersion':                 target(6, 'heavy'),
  'correlation':                            target(5, 'heavy'),
  'introduction to microeconomics':         target(4, 'moderate'),
  'theory of consumer behaviour':           target(7, 'very-heavy'), // Utility, indifference curves
  'production and costs':                   target(6, 'heavy'),
  'theory of the firm under perfect competition': target(6, 'heavy'),
  'market equilibrium':                     target(5, 'heavy'),
};

// ─── Class 12 Physics (Theory: 70 marks) ────────────────────────────────────
// Electrostatics: 16, Magnetic Effects + EMI + AC: 17,
// EM Waves + Optics: 18, Dual Nature + Atoms + Nuclei: 12, Electronic Devices: 7

const CLASS12_PHYSICS: Record<string, ChapterAudioTarget> = {
  'electric charges and fields':            target(6, 'heavy'),
  'electrostatic potential and capacitance': target(7, 'very-heavy'), // Numericals
  'current electricity':                    target(8, 'very-heavy'), // Kirchhoff, Wheatstone, potentiometer
  'moving charges and magnetism':           target(6, 'heavy'),
  'magnetism and matter':                   target(4, 'moderate'),
  'electromagnetic induction':              target(7, 'very-heavy'), // Faraday, Lenz, AC generator
  'alternating current':                    target(6, 'heavy'),      // LCR circuits, transformers
  'electromagnetic waves':                  target(3, 'light'),
  'ray optics and optical instruments':     target(8, 'very-heavy'), // Huge — lenses, prism, microscope
  'wave optics':                            target(6, 'heavy'),      // Interference, diffraction
  'dual nature of radiation and matter':    target(5, 'heavy'),      // Photoelectric effect
  'atoms':                                  target(4, 'moderate'),
  'nuclei':                                 target(4, 'heavy'),      // Binding energy, radioactivity
  'semiconductor electronics':              target(7, 'heavy'),      // Diodes, transistors, logic gates
};

// ─── Class 12 Chemistry (Theory: 70 marks) ──────────────────────────────────

const CLASS12_CHEMISTRY: Record<string, ChapterAudioTarget> = {
  'the solid state':                        target(5, 'heavy'),
  'solutions':                              target(7, 'very-heavy'), // Raoult, colligative, numericals
  'electrochemistry':                       target(9, 'very-heavy'), // Nernst, conductance, batteries
  'chemical kinetics':                      target(7, 'very-heavy'), // Rate laws, Arrhenius
  'surface chemistry':                      target(4, 'moderate'),
  'general principles and processes of isolation of elements': target(3, 'moderate'),
  'the p-block elements':                   target(7, 'very-heavy'), // Group 15-18
  'the d- and f-block elements':            target(7, 'heavy'),
  'coordination compounds':                 target(7, 'very-heavy'), // IUPAC, isomerism, CFT
  'haloalkanes and haloarenes':             target(6, 'heavy'),
  'alcohols, phenols and ethers':           target(6, 'heavy'),
  'aldehydes, ketones and carboxylic acids': target(8, 'very-heavy'), // Named reactions
  'amines':                                 target(6, 'heavy'),
  'biomolecules':                           target(4, 'moderate'),
  // 'polymers' and 'chemistry in everyday life' deleted from CBSE 2025-26
};

// ─── Class 12 Biology (Theory: 70 marks) ────────────────────────────────────
// Reproduction: 16, Genetics: 20, Human Welfare: 12, Biotech: 12, Ecology: 10

const CLASS12_BIOLOGY: Record<string, ChapterAudioTarget> = {
  'reproduction in organisms':              target(4, 'moderate'),
  'sexual reproduction in flowering plants': target(6, 'heavy'),
  'human reproduction':                     target(7, 'very-heavy'),
  'reproductive health':                    target(4, 'moderate'),
  'principles of inheritance and variation': target(10, 'very-heavy'), // Genetics — highest marks
  'molecular basis of inheritance':         target(8, 'very-heavy'),  // DNA, replication, transcription
  'evolution':                              target(4, 'moderate'),
  'human health and disease':               target(6, 'heavy'),
  'strategies for enhancement in food production': target(3, 'moderate'),
  'microbes in human welfare':              target(4, 'moderate'),
  'biotechnology: principles and processes': target(6, 'very-heavy'),
  'biotechnology and its applications':     target(5, 'heavy'),
  'organisms and populations':              target(5, 'heavy'),
  'ecosystem':                              target(5, 'heavy'),
  'biodiversity and conservation':          target(4, 'moderate'),
};

// ─── Class 12 Mathematics (Theory: 80 marks) ────────────────────────────────
// Relations/Functions: 8, Algebra: 10, Calculus: 35(!),
// Vectors/3D: 14, Linear Programming: 5, Probability: 8

const CLASS12_MATHS: Record<string, ChapterAudioTarget> = {
  'relations and functions':                target(5, 'heavy'),
  'inverse trigonometric functions':        target(4, 'heavy'),
  'matrices':                               target(5, 'heavy'),
  'determinants':                           target(6, 'very-heavy'), // Cramer's rule, adjoint, inverse
  'continuity and differentiability':       target(8, 'very-heavy'), // Critical for calculus
  'application of derivatives':             target(8, 'very-heavy'), // Maxima/minima, rate of change
  'integrals':                              target(10, 'very-heavy'),// Highest — all integration methods
  'application of integrals':               target(5, 'heavy'),      // Area under curves
  'differential equations':                 target(7, 'very-heavy'),
  'vector algebra':                         target(5, 'heavy'),
  'three dimensional geometry':             target(7, 'heavy'),
  'linear programming':                     target(5, 'moderate'),
  'probability':                            target(8, 'very-heavy'), // Bayes' theorem, distributions
};

// ─── Class 12 Accountancy (Theory: 80 marks) ────────────────────────────────
// Partnership: 36, Companies: 24, Financial Analysis: 12, Cash Flow: 8

const CLASS12_ACCOUNTANCY: Record<string, ChapterAudioTarget> = {
  'accounting for partnership firms – fundamentals': target(10, 'very-heavy'),
  'goodwill: nature and valuation':         target(5, 'heavy'),
  'change in profit sharing ratio':         target(6, 'heavy'),
  'admission of a partner':                 target(8, 'very-heavy'),
  'retirement and death of a partner':      target(7, 'very-heavy'),
  'dissolution of partnership firm':        target(5, 'heavy'),
  'accounting for share capital':           target(8, 'very-heavy'),
  'issue and redemption of debentures':     target(7, 'very-heavy'),
  'financial statements of a company':      target(6, 'heavy'),
  'analysis of financial statements':       target(6, 'heavy'),
  'accounting ratios':                      target(6, 'heavy'),
  'cash flow statement':                    target(8, 'very-heavy'),
};

// ─── Class 12 Business Studies (Theory: 80 marks) ───────────────────────────

const CLASS12_BUSINESS: Record<string, ChapterAudioTarget> = {
  'nature and significance of management':  target(5, 'moderate'),
  'principles of management':               target(6, 'heavy'),
  'business environment':                   target(4, 'moderate'),
  'planning':                               target(5, 'moderate'),
  'organising':                             target(6, 'heavy'),
  'staffing':                               target(6, 'heavy'),
  'directing':                              target(7, 'heavy'),
  'controlling':                            target(5, 'moderate'),
  'financial management':                   target(8, 'very-heavy'), // Capital structure, leverage
  'financial markets':                      target(7, 'heavy'),
  'marketing management':                   target(7, 'heavy'),
  'consumer protection':                    target(4, 'moderate'),
};

// ─── Class 12 Economics (Theory: 80 marks) ──────────────────────────────────
// Part A: Macro (40), Part B: Indian Economy (40)

const CLASS12_ECONOMICS: Record<string, ChapterAudioTarget> = {
  'national income and related aggregates': target(10, 'very-heavy'),
  'money and banking':                      target(6, 'heavy'),
  'determination of income and employment': target(12, 'very-heavy'), // AD-AS, multiplier
  'government budget and the economy':      target(6, 'heavy'),
  'balance of payments':                    target(6, 'heavy'),
  'development experience (1947-90) and economic reforms since 1991': target(8, 'heavy'),
  'current challenges facing indian economy': target(10, 'very-heavy'), // Poverty, employment, infrastructure
  'development experience of india – a comparison with neighbours': target(5, 'moderate'),
};


// ─── Master Lookup ──────────────────────────────────────────────────────────

type SubjectMap = Record<string, Record<string, ChapterAudioTarget>>;

const WEIGHTAGE_MAP: Record<string, SubjectMap> = {
  'class 10': {
    'science': CLASS10_SCIENCE,
    'mathematics': CLASS10_MATHS,
    'social science': CLASS10_SOCIAL,
    'english': CLASS10_ENGLISH,
    'hindi': CLASS10_HINDI,
  },
  'class 11': {
    'physics': CLASS11_PHYSICS,
    'chemistry': CLASS11_CHEMISTRY,
    'biology': CLASS11_BIOLOGY,
    'mathematics': CLASS11_MATHS,
    'accountancy': CLASS11_ACCOUNTANCY,
    'business studies': CLASS11_BUSINESS,
    'economics': CLASS11_ECONOMICS,
  },
  'class 12': {
    'physics': CLASS12_PHYSICS,
    'chemistry': CLASS12_CHEMISTRY,
    'biology': CLASS12_BIOLOGY,
    'mathematics': CLASS12_MATHS,
    'accountancy': CLASS12_ACCOUNTANCY,
    'business studies': CLASS12_BUSINESS,
    'economics': CLASS12_ECONOMICS,
  },
};

// ─── Default targets when chapter not found ─────────────────────────────────

const DEFAULTS: Record<string, ChapterAudioTarget> = {
  'science':          target(6, 'heavy'),
  'mathematics':      target(6, 'heavy'),
  'physics':          target(6, 'heavy'),
  'chemistry':        target(6, 'heavy'),
  'biology':          target(5, 'heavy'),
  'social science':   target(4, 'moderate'),
  'english':          target(5, 'moderate'),
  'hindi':            target(5, 'moderate'),
  'accountancy':      target(6, 'heavy'),
  'business studies': target(5, 'moderate'),
  'economics':        target(6, 'heavy'),
  '_fallback':        target(5, 'moderate'),
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Look up the audio duration target for a specific chapter.
 *
 * @param classLevel  e.g. "Class 10", "Class 11", "Class 12"
 * @param subject     e.g. "Science", "Physics", "Accountancy"
 * @param chapter     The chapter title (fuzzy-matched)
 * @returns Target minutes and word count for the narration script.
 */
export function getChapterAudioTarget(
  classLevel: string,
  subject: string,
  chapter: string,
): ChapterAudioTarget {
  const cls = classLevel.toLowerCase().trim();
  const sub = subject.toLowerCase().trim();
  const ch  = chapter.toLowerCase().trim();

  // Try exact match first
  const classMap = WEIGHTAGE_MAP[cls];
  if (classMap) {
    const subjectMap = classMap[sub];
    if (subjectMap) {
      // Exact match
      if (subjectMap[ch]) return subjectMap[ch];

      // Fuzzy: check if chapter title contains or is contained by a key
      for (const [key, val] of Object.entries(subjectMap)) {
        if (ch.includes(key) || key.includes(ch)) return val;
      }

      // Try matching first few significant words
      const chWords = ch.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
      for (const [key, val] of Object.entries(subjectMap)) {
        const keyWords = key.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
        const overlap = chWords.filter(w => keyWords.includes(w)).length;
        if (overlap >= 2) return val;
      }
    }
  }

  // Subject-level default
  return DEFAULTS[sub] || DEFAULTS._fallback;
}

/**
 * Get a human-readable summary for logging.
 */
export function describeTarget(t: ChapterAudioTarget): string {
  return `${t.targetMinutes} min (~${t.targetWords} words), marks≈${t.estimatedMarks}, depth=${t.contentDepth}`;
}
