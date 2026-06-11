/**
 * Unified syllabus metadata — Class 10, 11, 12 (CBSE).
 *
 * METADATA ONLY: No content is pre-generated. Revision-kit content is
 * generated on demand via /api/generate-kit when the student picks a chapter.
 *
 * Class 9 is intentionally excluded because CBSE is actively changing the
 * Class 9 syllabus/structure, and including it now may produce wrong or
 * outdated content.
 *
 * Sources:
 * - CBSE Academic Curriculum 2025-26 (https://cbseacademic.nic.in/)
 * - NCERT textbook table of contents
 *
 * TODO: Refresh against CBSE Curriculum 2026-27 when published.
 */

import { ChapterItem, ChapterSubject, ChapterMode, SyllabusSource } from './class10Syllabus';

// Re-export core types so consumers only import from one place
export type { ChapterItem, ChapterSubject, ChapterMode, SyllabusSource };

// ─── Class / Stream types ───────────────────────────────────────────────────

export type ClassLevel = 'Class 10' | 'Class 11' | 'Class 12';
export type Stream = 'Science' | 'Commerce';

/** Subjects available per class+stream. */
export const SUBJECTS_BY_CLASS: Record<string, string[]> = {
  'Class 10': ['Science', 'Mathematics', 'Social Science', 'English', 'Hindi'],
  'Class 11:Science': ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English'],
  'Class 11:Commerce': ['Accountancy', 'Business Studies', 'Economics', 'Mathematics', 'English'],
  'Class 12:Science': ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English'],
  'Class 12:Commerce': ['Accountancy', 'Business Studies', 'Economics', 'Mathematics', 'English'],
};

export function getSubjectsForClass(classLevel: ClassLevel, stream?: Stream): string[] {
  if (classLevel === 'Class 10') return SUBJECTS_BY_CLASS['Class 10'];
  const key = `${classLevel}:${stream || 'Science'}`;
  return SUBJECTS_BY_CLASS[key] || [];
}

// SyllabusChapter is the same as ChapterItem now that ChapterItem supports all class levels.
export type SyllabusChapter = ChapterItem;

// ─── Helper ─────────────────────────────────────────────────────────────────

const ALL_MODES: ChapterMode[] = ['visual', 'readwrite', 'audio', 'practice'];

function makeId(classLevel: string, subject: string, title: string, book?: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const cl = classLevel.replace(/\s+/g, '').toLowerCase();
  const parts = [cl, slug(subject)];
  if (book) parts.push(slug(book));
  parts.push(slug(title));
  return parts.join(':');
}

const SRC_2025: SyllabusSource = {
  sourceName: 'CBSE Academic Curriculum 2025-26',
  sourceType: 'CBSE Curriculum PDF',
  academicYear: '2025-26',
  url: 'https://cbseacademic.nic.in/',
  verified: true,
  lastChecked: '2026-05-29',
};

const SRC_NCERT: SyllabusSource = {
  sourceName: 'NCERT Textbook TOC',
  sourceType: 'NCERT Textbook',
  academicYear: '2025-26',
  verified: true,
  lastChecked: '2026-05-29',
};

function ch(
  classLevel: ClassLevel,
  subject: string,
  title: string,
  opts: { book?: string; num?: number; tags?: string[]; stream?: Stream; status?: 'verified' | 'needs-review'; source?: SyllabusSource } = {},
): SyllabusChapter {
  return {
    id: makeId(classLevel, subject, title, opts.book),
    classLevel,
    board: 'CBSE',
    academicYear: '2025-26',
    subject: subject as ChapterSubject,
    book: opts.book,
    chapterTitle: title,
    chapterNumber: opts.num,
    tags: opts.tags || [],
    availableModes: ALL_MODES,
    syllabusStatus: opts.status || 'verified',
    source: opts.source || SRC_NCERT,
    stream: opts.stream,
  } as SyllabusChapter;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASS 11 — SCIENCE
// ═══════════════════════════════════════════════════════════════════════════

const C11_PHYSICS: SyllabusChapter[] = [
  ch('Class 11', 'Physics', 'Units and Measurement', { num: 1, tags: ['units', 'measurement', 'dimensions'], stream: 'Science' }),
  ch('Class 11', 'Physics', 'Motion in a Straight Line', { num: 2, tags: ['kinematics', 'velocity', 'acceleration'], stream: 'Science' }),
  ch('Class 11', 'Physics', 'Motion in a Plane', { num: 3, tags: ['projectile', 'vectors'], stream: 'Science' }),
  ch('Class 11', 'Physics', 'Laws of Motion', { num: 4, tags: ['newton', 'force', 'friction'], stream: 'Science' }),
  ch('Class 11', 'Physics', 'Work, Energy and Power', { num: 5, tags: ['work', 'energy', 'power', 'conservation'], stream: 'Science' }),
  ch('Class 11', 'Physics', 'System of Particles and Rotational Motion', { num: 6, tags: ['rotation', 'torque', 'moment-of-inertia'], stream: 'Science' }),
  ch('Class 11', 'Physics', 'Gravitation', { num: 7, tags: ['gravity', 'kepler', 'orbital'], stream: 'Science' }),
  ch('Class 11', 'Physics', 'Mechanical Properties of Solids', { num: 8, tags: ['elasticity', 'stress', 'strain'], stream: 'Science' }),
  ch('Class 11', 'Physics', 'Mechanical Properties of Fluids', { num: 9, tags: ['viscosity', 'surface-tension', 'bernoulli'], stream: 'Science' }),
  ch('Class 11', 'Physics', 'Thermal Properties of Matter', { num: 10, tags: ['heat', 'conduction', 'radiation'], stream: 'Science' }),
  ch('Class 11', 'Physics', 'Thermodynamics', { num: 11, tags: ['laws-of-thermodynamics', 'entropy', 'heat-engine'], stream: 'Science' }),
  ch('Class 11', 'Physics', 'Kinetic Theory', { num: 12, tags: ['kinetic-theory', 'gas-laws', 'ideal-gas'], stream: 'Science' }),
  ch('Class 11', 'Physics', 'Oscillations', { num: 13, tags: ['shm', 'pendulum', 'oscillation'], stream: 'Science' }),
  ch('Class 11', 'Physics', 'Waves', { num: 14, tags: ['waves', 'sound', 'standing-waves'], stream: 'Science' }),
];

const C11_CHEMISTRY: SyllabusChapter[] = [
  ch('Class 11', 'Chemistry', 'Some Basic Concepts of Chemistry', { num: 1, tags: ['mole', 'stoichiometry', 'atomic-mass'], stream: 'Science' }),
  ch('Class 11', 'Chemistry', 'Structure of Atom', { num: 2, tags: ['atomic-structure', 'quantum', 'orbitals'], stream: 'Science' }),
  ch('Class 11', 'Chemistry', 'Classification of Elements and Periodicity in Properties', { num: 3, tags: ['periodic-table', 'periodic-trends'], stream: 'Science' }),
  ch('Class 11', 'Chemistry', 'Chemical Bonding and Molecular Structure', { num: 4, tags: ['bonding', 'vsepr', 'hybridization'], stream: 'Science' }),
  ch('Class 11', 'Chemistry', 'Thermodynamics', { num: 5, tags: ['enthalpy', 'gibbs-energy', 'hess-law'], stream: 'Science' }),
  ch('Class 11', 'Chemistry', 'Equilibrium', { num: 6, tags: ['chemical-equilibrium', 'le-chatelier', 'ionic-equilibrium'], stream: 'Science' }),
  ch('Class 11', 'Chemistry', 'Redox Reactions', { num: 7, tags: ['oxidation', 'reduction', 'balancing'], stream: 'Science' }),
  ch('Class 11', 'Chemistry', 'Organic Chemistry: Some Basic Principles and Techniques', { num: 8, tags: ['organic', 'iupac', 'isomerism'], stream: 'Science' }),
  ch('Class 11', 'Chemistry', 'Hydrocarbons', { num: 9, tags: ['alkanes', 'alkenes', 'alkynes', 'aromatic'], stream: 'Science' }),
];

const C11_MATHS: SyllabusChapter[] = [
  ch('Class 11', 'Mathematics', 'Sets', { num: 1, tags: ['sets', 'venn-diagram', 'subsets'], stream: 'Science' }),
  ch('Class 11', 'Mathematics', 'Relations and Functions', { num: 2, tags: ['relations', 'functions', 'domain-range'], stream: 'Science' }),
  ch('Class 11', 'Mathematics', 'Trigonometric Functions', { num: 3, tags: ['trigonometry', 'identities', 'graphs'], stream: 'Science' }),
  ch('Class 11', 'Mathematics', 'Complex Numbers and Quadratic Equations', { num: 4, tags: ['complex-numbers', 'quadratic'], stream: 'Science' }),
  ch('Class 11', 'Mathematics', 'Linear Inequalities', { num: 5, tags: ['inequalities', 'graphical-solution'], stream: 'Science' }),
  ch('Class 11', 'Mathematics', 'Permutations and Combinations', { num: 6, tags: ['permutations', 'combinations', 'factorial'], stream: 'Science' }),
  ch('Class 11', 'Mathematics', 'Binomial Theorem', { num: 7, tags: ['binomial', 'expansion', 'pascal-triangle'], stream: 'Science' }),
  ch('Class 11', 'Mathematics', 'Sequences and Series', { num: 8, tags: ['ap', 'gp', 'sum-of-series'], stream: 'Science' }),
  ch('Class 11', 'Mathematics', 'Straight Lines', { num: 9, tags: ['coordinate-geometry', 'slope', 'intercept'], stream: 'Science' }),
  ch('Class 11', 'Mathematics', 'Conic Sections', { num: 10, tags: ['circle', 'parabola', 'ellipse', 'hyperbola'], stream: 'Science' }),
  ch('Class 11', 'Mathematics', 'Introduction to Three Dimensional Geometry', { num: 11, tags: ['3d-geometry', 'distance-formula'], stream: 'Science' }),
  ch('Class 11', 'Mathematics', 'Limits and Derivatives', { num: 12, tags: ['limits', 'derivatives', 'calculus'], stream: 'Science' }),
  ch('Class 11', 'Mathematics', 'Statistics', { num: 13, tags: ['mean', 'variance', 'standard-deviation'], stream: 'Science' }),
  ch('Class 11', 'Mathematics', 'Probability', { num: 14, tags: ['probability', 'events', 'random-experiment'], stream: 'Science' }),
];

const C11_BIOLOGY: SyllabusChapter[] = [
  ch('Class 11', 'Biology', 'The Living World', { num: 1, tags: ['biodiversity', 'taxonomy', 'classification'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Biological Classification', { num: 2, tags: ['kingdoms', 'monera', 'protista', 'fungi'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Plant Kingdom', { num: 3, tags: ['algae', 'bryophytes', 'pteridophytes', 'gymnosperms', 'angiosperms'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Animal Kingdom', { num: 4, tags: ['phyla', 'classification', 'vertebrates', 'invertebrates'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Morphology of Flowering Plants', { num: 5, tags: ['root', 'stem', 'leaf', 'flower', 'fruit'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Anatomy of Flowering Plants', { num: 6, tags: ['tissues', 'meristematic', 'vascular-bundle'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Cell: The Unit of Life', { num: 7, tags: ['cell-structure', 'organelles', 'prokaryotic', 'eukaryotic'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Biomolecules', { num: 8, tags: ['proteins', 'carbohydrates', 'lipids', 'enzymes'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Cell Cycle and Cell Division', { num: 9, tags: ['mitosis', 'meiosis', 'cell-cycle'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Photosynthesis in Higher Plants', { num: 10, tags: ['photosynthesis', 'calvin-cycle', 'light-reactions'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Respiration in Plants', { num: 11, tags: ['glycolysis', 'krebs-cycle', 'fermentation'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Plant Growth and Development', { num: 12, tags: ['auxin', 'gibberellin', 'photoperiodism'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Breathing and Exchange of Gases', { num: 13, tags: ['respiration', 'lungs', 'oxygen-transport'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Body Fluids and Circulation', { num: 14, tags: ['blood', 'heart', 'circulation'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Excretory Products and their Elimination', { num: 15, tags: ['kidney', 'nephron', 'urine-formation'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Locomotion and Movement', { num: 16, tags: ['muscle', 'skeleton', 'joints'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Neural Control and Coordination', { num: 17, tags: ['nervous-system', 'brain', 'reflex-arc'], stream: 'Science' }),
  ch('Class 11', 'Biology', 'Chemical Coordination and Integration', { num: 18, tags: ['hormones', 'endocrine', 'pituitary'], stream: 'Science' }),
];

// ═══════════════════════════════════════════════════════════════════════════
// CLASS 11 — COMMERCE
// ═══════════════════════════════════════════════════════════════════════════

const C11_ACCOUNTANCY: SyllabusChapter[] = [
  ch('Class 11', 'Accountancy', 'Introduction to Accounting', { num: 1, tags: ['accounting', 'objectives', 'qualitative-characteristics'], stream: 'Commerce' }),
  ch('Class 11', 'Accountancy', 'Theory Base of Accounting', { num: 2, tags: ['gaap', 'accounting-concepts', 'conventions'], stream: 'Commerce' }),
  ch('Class 11', 'Accountancy', 'Recording of Transactions – I', { num: 3, tags: ['journal', 'ledger', 'debit-credit'], stream: 'Commerce' }),
  ch('Class 11', 'Accountancy', 'Recording of Transactions – II', { num: 4, tags: ['cash-book', 'subsidiary-books'], stream: 'Commerce' }),
  ch('Class 11', 'Accountancy', 'Bank Reconciliation Statement', { num: 5, tags: ['brs', 'bank-balance', 'reconciliation'], stream: 'Commerce' }),
  ch('Class 11', 'Accountancy', 'Trial Balance and Rectification of Errors', { num: 6, tags: ['trial-balance', 'errors', 'suspense-account'], stream: 'Commerce' }),
  ch('Class 11', 'Accountancy', 'Depreciation, Provisions and Reserves', { num: 7, tags: ['depreciation', 'provisions', 'reserves'], stream: 'Commerce' }),
  ch('Class 11', 'Accountancy', 'Bill of Exchange', { num: 8, tags: ['bill-of-exchange', 'promissory-note', 'dishonour'], stream: 'Commerce' }),
  ch('Class 11', 'Accountancy', 'Financial Statements – I', { num: 9, tags: ['trading-account', 'profit-loss', 'balance-sheet'], stream: 'Commerce' }),
  ch('Class 11', 'Accountancy', 'Financial Statements – II', { num: 10, tags: ['adjustments', 'closing-entries'], stream: 'Commerce' }),
];

const C11_BUSINESS: SyllabusChapter[] = [
  ch('Class 11', 'Business Studies', 'Nature and Purpose of Business', { num: 1, tags: ['business', 'commerce', 'industry'], stream: 'Commerce' }),
  ch('Class 11', 'Business Studies', 'Forms of Business Organisation', { num: 2, tags: ['sole-proprietorship', 'partnership', 'company'], stream: 'Commerce' }),
  ch('Class 11', 'Business Studies', 'Private, Public and Global Enterprises', { num: 3, tags: ['public-sector', 'private-sector', 'mnc'], stream: 'Commerce' }),
  ch('Class 11', 'Business Studies', 'Business Services', { num: 4, tags: ['banking', 'insurance', 'communication'], stream: 'Commerce' }),
  ch('Class 11', 'Business Studies', 'Emerging Modes of Business', { num: 5, tags: ['e-business', 'outsourcing', 'bpo'], stream: 'Commerce' }),
  ch('Class 11', 'Business Studies', 'Social Responsibility of Business and Business Ethics', { num: 6, tags: ['csr', 'ethics', 'environment'], stream: 'Commerce' }),
  ch('Class 11', 'Business Studies', 'Formation of a Company', { num: 7, tags: ['memorandum', 'articles', 'prospectus'], stream: 'Commerce' }),
  ch('Class 11', 'Business Studies', 'Sources of Business Finance', { num: 8, tags: ['equity', 'debt', 'retained-earnings'], stream: 'Commerce' }),
  ch('Class 11', 'Business Studies', 'Small Business', { num: 9, tags: ['msme', 'cottage-industry', 'entrepreneurship'], stream: 'Commerce' }),
  ch('Class 11', 'Business Studies', 'Internal Trade', { num: 10, tags: ['wholesale', 'retail', 'department-store'], stream: 'Commerce' }),
  ch('Class 11', 'Business Studies', 'International Business', { num: 11, tags: ['international-trade', 'export', 'import', 'wto'], stream: 'Commerce' }),
];

const C11_ECONOMICS: SyllabusChapter[] = [
  ch('Class 11', 'Economics', 'Introduction to Microeconomics', { num: 1, tags: ['scarcity', 'opportunity-cost', 'economic-problem'], stream: 'Commerce' }),
  ch('Class 11', 'Economics', 'Collection of Data', { num: 2, tags: ['statistics', 'data-collection', 'census', 'sampling'], stream: 'Commerce' }),
  ch('Class 11', 'Economics', 'Organisation of Data', { num: 3, tags: ['classification', 'frequency-distribution'], stream: 'Commerce' }),
  ch('Class 11', 'Economics', 'Presentation of Data', { num: 4, tags: ['tables', 'diagrams', 'graphs'], stream: 'Commerce' }),
  ch('Class 11', 'Economics', 'Measures of Central Tendency', { num: 5, tags: ['mean', 'median', 'mode'], stream: 'Commerce' }),
  ch('Class 11', 'Economics', 'Measures of Dispersion', { num: 6, tags: ['range', 'standard-deviation', 'variance'], stream: 'Commerce' }),
  ch('Class 11', 'Economics', 'Correlation', { num: 7, tags: ['correlation', 'scatter-diagram'], stream: 'Commerce' }),
  ch('Class 11', 'Economics', 'Index Numbers', { num: 8, tags: ['index-numbers', 'price-index', 'cpi'], stream: 'Commerce' }),
  ch('Class 11', 'Economics', 'Consumer Equilibrium and Demand', { num: 9, tags: ['demand', 'utility', 'indifference-curve'], stream: 'Commerce' }),
  ch('Class 11', 'Economics', 'Elasticity of Demand', { num: 10, tags: ['elasticity', 'price-elasticity'], stream: 'Commerce' }),
  ch('Class 11', 'Economics', 'Theory of Supply', { num: 11, tags: ['supply', 'determinants', 'law-of-supply'], stream: 'Commerce' }),
  ch('Class 11', 'Economics', 'Market Equilibrium', { num: 12, tags: ['equilibrium', 'demand-supply', 'price-determination'], stream: 'Commerce' }),
];

// ═══════════════════════════════════════════════════════════════════════════
// CLASS 12 — SCIENCE
// ═══════════════════════════════════════════════════════════════════════════

const C12_PHYSICS: SyllabusChapter[] = [
  ch('Class 12', 'Physics', 'Electric Charges and Fields', { num: 1, tags: ['coulomb', 'electric-field', 'gauss-law'], stream: 'Science' }),
  ch('Class 12', 'Physics', 'Electrostatic Potential and Capacitance', { num: 2, tags: ['potential', 'capacitor', 'dielectric'], stream: 'Science' }),
  ch('Class 12', 'Physics', 'Current Electricity', { num: 3, tags: ['ohm-law', 'resistance', 'kirchhoff'], stream: 'Science' }),
  ch('Class 12', 'Physics', 'Moving Charges and Magnetism', { num: 4, tags: ['biot-savart', 'ampere-law', 'lorentz-force'], stream: 'Science' }),
  ch('Class 12', 'Physics', 'Magnetism and Matter', { num: 5, tags: ['magnetism', 'diamagnetic', 'paramagnetic'], stream: 'Science' }),
  ch('Class 12', 'Physics', 'Electromagnetic Induction', { num: 6, tags: ['faraday', 'lenz-law', 'emf'], stream: 'Science' }),
  ch('Class 12', 'Physics', 'Alternating Current', { num: 7, tags: ['ac', 'transformer', 'lcr-circuit'], stream: 'Science' }),
  ch('Class 12', 'Physics', 'Electromagnetic Waves', { num: 8, tags: ['em-waves', 'spectrum', 'maxwell'], stream: 'Science' }),
  ch('Class 12', 'Physics', 'Ray Optics and Optical Instruments', { num: 9, tags: ['reflection', 'refraction', 'lens', 'microscope'], stream: 'Science' }),
  ch('Class 12', 'Physics', 'Wave Optics', { num: 10, tags: ['interference', 'diffraction', 'polarisation'], stream: 'Science' }),
  ch('Class 12', 'Physics', 'Dual Nature of Radiation and Matter', { num: 11, tags: ['photoelectric', 'de-broglie', 'photon'], stream: 'Science' }),
  ch('Class 12', 'Physics', 'Atoms', { num: 12, tags: ['bohr-model', 'hydrogen-spectrum', 'energy-levels'], stream: 'Science' }),
  ch('Class 12', 'Physics', 'Nuclei', { num: 13, tags: ['nuclear-physics', 'radioactivity', 'fission', 'fusion'], stream: 'Science' }),
  ch('Class 12', 'Physics', 'Semiconductor Electronics', { num: 14, tags: ['diode', 'transistor', 'logic-gates'], stream: 'Science' }),
];

const C12_CHEMISTRY: SyllabusChapter[] = [
  ch('Class 12', 'Chemistry', 'Solutions', { num: 1, tags: ['solutions', 'colligative-properties', 'raoult-law'], stream: 'Science' }),
  ch('Class 12', 'Chemistry', 'Electrochemistry', { num: 2, tags: ['electrochemistry', 'nernst', 'conductance'], stream: 'Science' }),
  ch('Class 12', 'Chemistry', 'Chemical Kinetics', { num: 3, tags: ['rate-of-reaction', 'order', 'arrhenius'], stream: 'Science' }),
  ch('Class 12', 'Chemistry', 'd and f Block Elements', { num: 4, tags: ['transition-metals', 'lanthanoids', 'actinoids'], stream: 'Science' }),
  ch('Class 12', 'Chemistry', 'Coordination Compounds', { num: 5, tags: ['coordination', 'ligands', 'isomerism'], stream: 'Science' }),
  ch('Class 12', 'Chemistry', 'Haloalkanes and Haloarenes', { num: 6, tags: ['haloalkanes', 'haloarenes', 'sn1', 'sn2'], stream: 'Science' }),
  ch('Class 12', 'Chemistry', 'Alcohols, Phenols and Ethers', { num: 7, tags: ['alcohols', 'phenols', 'ethers'], stream: 'Science' }),
  ch('Class 12', 'Chemistry', 'Aldehydes, Ketones and Carboxylic Acids', { num: 8, tags: ['aldehydes', 'ketones', 'carboxylic-acids'], stream: 'Science' }),
  ch('Class 12', 'Chemistry', 'Amines', { num: 9, tags: ['amines', 'diazonium-salts'], stream: 'Science' }),
  ch('Class 12', 'Chemistry', 'Biomolecules', { num: 10, tags: ['carbohydrates', 'proteins', 'nucleic-acids', 'vitamins'], stream: 'Science' }),
];

const C12_MATHS: SyllabusChapter[] = [
  ch('Class 12', 'Mathematics', 'Relations and Functions', { num: 1, tags: ['relations', 'functions', 'inverse'], stream: 'Science' }),
  ch('Class 12', 'Mathematics', 'Inverse Trigonometric Functions', { num: 2, tags: ['inverse-trig', 'domain', 'range'], stream: 'Science' }),
  ch('Class 12', 'Mathematics', 'Matrices', { num: 3, tags: ['matrices', 'operations', 'transpose'], stream: 'Science' }),
  ch('Class 12', 'Mathematics', 'Determinants', { num: 4, tags: ['determinants', 'cramer-rule', 'adjoint'], stream: 'Science' }),
  ch('Class 12', 'Mathematics', 'Continuity and Differentiability', { num: 5, tags: ['continuity', 'differentiability', 'chain-rule'], stream: 'Science' }),
  ch('Class 12', 'Mathematics', 'Application of Derivatives', { num: 6, tags: ['maxima', 'minima', 'rate-of-change', 'tangent'], stream: 'Science' }),
  ch('Class 12', 'Mathematics', 'Integrals', { num: 7, tags: ['integration', 'definite', 'indefinite'], stream: 'Science' }),
  ch('Class 12', 'Mathematics', 'Application of Integrals', { num: 8, tags: ['area-under-curve', 'bounded-region'], stream: 'Science' }),
  ch('Class 12', 'Mathematics', 'Differential Equations', { num: 9, tags: ['differential-equations', 'order', 'degree'], stream: 'Science' }),
  ch('Class 12', 'Mathematics', 'Vector Algebra', { num: 10, tags: ['vectors', 'dot-product', 'cross-product'], stream: 'Science' }),
  ch('Class 12', 'Mathematics', 'Three Dimensional Geometry', { num: 11, tags: ['3d-geometry', 'direction-cosines', 'planes'], stream: 'Science' }),
  ch('Class 12', 'Mathematics', 'Linear Programming', { num: 12, tags: ['linear-programming', 'optimization', 'constraints'], stream: 'Science' }),
  ch('Class 12', 'Mathematics', 'Probability', { num: 13, tags: ['conditional-probability', 'bayes-theorem', 'distribution'], stream: 'Science' }),
];

const C12_BIOLOGY: SyllabusChapter[] = [
  ch('Class 12', 'Biology', 'Reproduction in Organisms', { num: 1, tags: ['asexual', 'sexual', 'reproduction'], stream: 'Science' }),
  ch('Class 12', 'Biology', 'Sexual Reproduction in Flowering Plants', { num: 2, tags: ['pollination', 'fertilisation', 'embryo'], stream: 'Science' }),
  ch('Class 12', 'Biology', 'Human Reproduction', { num: 3, tags: ['reproductive-system', 'gametogenesis', 'pregnancy'], stream: 'Science' }),
  ch('Class 12', 'Biology', 'Reproductive Health', { num: 4, tags: ['contraception', 'reproductive-health', 'art'], stream: 'Science' }),
  ch('Class 12', 'Biology', 'Principles of Inheritance and Variation', { num: 5, tags: ['mendel', 'genetics', 'linkage', 'sex-linked'], stream: 'Science' }),
  ch('Class 12', 'Biology', 'Molecular Basis of Inheritance', { num: 6, tags: ['dna', 'rna', 'replication', 'transcription', 'translation'], stream: 'Science' }),
  ch('Class 12', 'Biology', 'Evolution', { num: 7, tags: ['evolution', 'natural-selection', 'darwin', 'speciation'], stream: 'Science' }),
  ch('Class 12', 'Biology', 'Human Health and Disease', { num: 8, tags: ['immunity', 'diseases', 'pathogens'], stream: 'Science' }),
  ch('Class 12', 'Biology', 'Strategies for Enhancement in Food Production', { num: 9, tags: ['animal-husbandry', 'plant-breeding', 'biofortification'], stream: 'Science' }),
  ch('Class 12', 'Biology', 'Microbes in Human Welfare', { num: 10, tags: ['microbes', 'fermentation', 'biogas', 'antibiotics'], stream: 'Science' }),
  ch('Class 12', 'Biology', 'Biotechnology: Principles and Processes', { num: 11, tags: ['recombinant-dna', 'pcr', 'gene-cloning'], stream: 'Science' }),
  ch('Class 12', 'Biology', 'Biotechnology and its Applications', { num: 12, tags: ['gmo', 'gene-therapy', 'bioethics'], stream: 'Science' }),
  ch('Class 12', 'Biology', 'Organisms and Populations', { num: 13, tags: ['ecology', 'population', 'interactions'], stream: 'Science' }),
  ch('Class 12', 'Biology', 'Ecosystem', { num: 14, tags: ['ecosystem', 'food-chain', 'energy-flow', 'nutrient-cycling'], stream: 'Science' }),
  ch('Class 12', 'Biology', 'Biodiversity and Conservation', { num: 15, tags: ['biodiversity', 'hotspots', 'conservation'], stream: 'Science' }),
];

// ═══════════════════════════════════════════════════════════════════════════
// CLASS 12 — COMMERCE
// ═══════════════════════════════════════════════════════════════════════════

const C12_ACCOUNTANCY: SyllabusChapter[] = [
  ch('Class 12', 'Accountancy', 'Accounting for Not-for-Profit Organisation', { num: 1, tags: ['npo', 'receipts-payments', 'income-expenditure'], stream: 'Commerce' }),
  ch('Class 12', 'Accountancy', 'Accounting for Partnership: Basic Concepts', { num: 2, tags: ['partnership', 'profit-sharing', 'capital-accounts'], stream: 'Commerce' }),
  ch('Class 12', 'Accountancy', 'Reconstitution of a Partnership Firm – Admission of a Partner', { num: 3, tags: ['admission', 'goodwill', 'revaluation'], stream: 'Commerce' }),
  ch('Class 12', 'Accountancy', 'Reconstitution of a Partnership Firm – Retirement/Death of a Partner', { num: 4, tags: ['retirement', 'death', 'joint-life-policy'], stream: 'Commerce' }),
  ch('Class 12', 'Accountancy', 'Dissolution of Partnership Firm', { num: 5, tags: ['dissolution', 'realisation', 'insolvency'], stream: 'Commerce' }),
  ch('Class 12', 'Accountancy', 'Accounting for Share Capital', { num: 6, tags: ['shares', 'issue', 'forfeiture', 'reissue'], stream: 'Commerce' }),
  ch('Class 12', 'Accountancy', 'Issue and Redemption of Debentures', { num: 7, tags: ['debentures', 'issue', 'redemption', 'sinking-fund'], stream: 'Commerce' }),
  ch('Class 12', 'Accountancy', 'Financial Statements of a Company', { num: 8, tags: ['balance-sheet', 'statement-of-pnl', 'schedule-iii'], stream: 'Commerce' }),
  ch('Class 12', 'Accountancy', 'Analysis of Financial Statements', { num: 9, tags: ['ratio-analysis', 'comparative', 'common-size'], stream: 'Commerce' }),
  ch('Class 12', 'Accountancy', 'Cash Flow Statement', { num: 10, tags: ['cash-flow', 'operating', 'investing', 'financing'], stream: 'Commerce' }),
];

const C12_BUSINESS: SyllabusChapter[] = [
  ch('Class 12', 'Business Studies', 'Nature and Significance of Management', { num: 1, tags: ['management', 'levels', 'functions'], stream: 'Commerce' }),
  ch('Class 12', 'Business Studies', 'Principles of Management', { num: 2, tags: ['fayol', 'taylor', 'scientific-management'], stream: 'Commerce' }),
  ch('Class 12', 'Business Studies', 'Business Environment', { num: 3, tags: ['liberalisation', 'privatisation', 'globalisation'], stream: 'Commerce' }),
  ch('Class 12', 'Business Studies', 'Planning', { num: 4, tags: ['planning', 'objectives', 'strategy', 'policy'], stream: 'Commerce' }),
  ch('Class 12', 'Business Studies', 'Organising', { num: 5, tags: ['organising', 'delegation', 'decentralisation'], stream: 'Commerce' }),
  ch('Class 12', 'Business Studies', 'Staffing', { num: 6, tags: ['staffing', 'recruitment', 'selection', 'training'], stream: 'Commerce' }),
  ch('Class 12', 'Business Studies', 'Directing', { num: 7, tags: ['directing', 'motivation', 'leadership', 'communication'], stream: 'Commerce' }),
  ch('Class 12', 'Business Studies', 'Controlling', { num: 8, tags: ['controlling', 'budgetary-control', 'management-audit'], stream: 'Commerce' }),
  ch('Class 12', 'Business Studies', 'Financial Management', { num: 9, tags: ['financial-management', 'capital-structure', 'dividend'], stream: 'Commerce' }),
  ch('Class 12', 'Business Studies', 'Financial Markets', { num: 10, tags: ['stock-exchange', 'money-market', 'sebi'], stream: 'Commerce' }),
  ch('Class 12', 'Business Studies', 'Marketing Management', { num: 11, tags: ['marketing', '4ps', 'branding', 'packaging'], stream: 'Commerce' }),
  ch('Class 12', 'Business Studies', 'Consumer Protection', { num: 12, tags: ['consumer-rights', 'consumer-protection-act', 'redressal'], stream: 'Commerce' }),
];

const C12_ECONOMICS: SyllabusChapter[] = [
  ch('Class 12', 'Economics', 'Introduction to Macroeconomics', { num: 1, tags: ['macroeconomics', 'circular-flow', 'national-income'], stream: 'Commerce' }),
  ch('Class 12', 'Economics', 'National Income Accounting', { num: 2, tags: ['gdp', 'gnp', 'ndp', 'nnp'], stream: 'Commerce' }),
  ch('Class 12', 'Economics', 'Money and Banking', { num: 3, tags: ['money', 'commercial-bank', 'central-bank', 'credit-creation'], stream: 'Commerce' }),
  ch('Class 12', 'Economics', 'Determination of Income and Employment', { num: 4, tags: ['aggregate-demand', 'multiplier', 'equilibrium-output'], stream: 'Commerce' }),
  ch('Class 12', 'Economics', 'Government Budget and the Economy', { num: 5, tags: ['budget', 'fiscal-policy', 'deficit'], stream: 'Commerce' }),
  ch('Class 12', 'Economics', 'Open Economy Macroeconomics', { num: 6, tags: ['bop', 'exchange-rate', 'foreign-exchange'], stream: 'Commerce' }),
  ch('Class 12', 'Economics', 'Indian Economy on the Eve of Independence', { num: 7, tags: ['pre-independence', 'colonial-economy'], stream: 'Commerce' }),
  ch('Class 12', 'Economics', 'Indian Economy 1950-1990', { num: 8, tags: ['five-year-plans', 'mixed-economy', 'green-revolution'], stream: 'Commerce' }),
  ch('Class 12', 'Economics', 'Liberalisation, Privatisation and Globalisation', { num: 9, tags: ['lpg', '1991-reforms', 'wto'], stream: 'Commerce' }),
  ch('Class 12', 'Economics', 'Human Capital Formation in India', { num: 10, tags: ['education', 'health', 'human-capital'], stream: 'Commerce' }),
  ch('Class 12', 'Economics', 'Rural Development', { num: 11, tags: ['rural', 'agriculture', 'credit', 'marketing'], stream: 'Commerce' }),
  ch('Class 12', 'Economics', 'Employment: Growth, Informalisation and Other Issues', { num: 12, tags: ['employment', 'informal-sector', 'unemployment'], stream: 'Commerce' }),
  ch('Class 12', 'Economics', 'Environment and Sustainable Development', { num: 13, tags: ['environment', 'sustainable-development', 'pollution'], stream: 'Commerce' }),
];

// ─── English (shared across streams for 11 & 12) ───────────────────────────

const C11_ENGLISH: SyllabusChapter[] = [
  ch('Class 11', 'English', 'The Portrait of a Lady', { num: 1, book: 'Hornbill (Prose)', tags: ['khushwant-singh', 'prose', 'grandmother'], stream: 'Science' }),
  ch('Class 11', 'English', 'A Photograph', { num: 1, book: 'Hornbill (Poetry)', tags: ['shirley-toulson', 'poetry', 'memory'], stream: 'Science' }),
  ch('Class 11', 'English', 'We\'re Not Afraid to Die...if We Can All Be Together', { num: 2, book: 'Hornbill (Prose)', tags: ['gordon-cook', 'adventure', 'sea'], stream: 'Science' }),
  ch('Class 11', 'English', 'Discovering Tut: the Saga Continues', { num: 3, book: 'Hornbill (Prose)', tags: ['tutankhamun', 'archaeology', 'egypt'], stream: 'Science' }),
  ch('Class 11', 'English', 'Landscape of the Soul', { num: 4, book: 'Hornbill (Prose)', tags: ['art', 'chinese-painting', 'european-painting'], stream: 'Science' }),
  ch('Class 11', 'English', 'Silk Road', { num: 5, book: 'Hornbill (Prose)', tags: ['travel', 'tibet', 'nick-middleton'], stream: 'Science' }),
];

const C12_ENGLISH: SyllabusChapter[] = [
  ch('Class 12', 'English', 'The Last Lesson', { num: 1, book: 'Flamingo (Prose)', tags: ['alphonse-daudet', 'french', 'language'], stream: 'Science' }),
  ch('Class 12', 'English', 'Lost Spring', { num: 2, book: 'Flamingo (Prose)', tags: ['anees-jung', 'child-labour', 'poverty'], stream: 'Science' }),
  ch('Class 12', 'English', 'Deep Water', { num: 3, book: 'Flamingo (Prose)', tags: ['william-douglas', 'fear', 'swimming'], stream: 'Science' }),
  ch('Class 12', 'English', 'The Rattrap', { num: 4, book: 'Flamingo (Prose)', tags: ['selma-lagerlof', 'redemption', 'christmas'], stream: 'Science' }),
  ch('Class 12', 'English', 'Indigo', { num: 5, book: 'Flamingo (Prose)', tags: ['louis-fischer', 'gandhi', 'champaran'], stream: 'Science' }),
  ch('Class 12', 'English', 'My Mother at Sixty-six', { num: 1, book: 'Flamingo (Poetry)', tags: ['kamala-das', 'poetry', 'ageing'], stream: 'Science' }),
  ch('Class 12', 'English', 'Keeping Quiet', { num: 2, book: 'Flamingo (Poetry)', tags: ['pablo-neruda', 'poetry', 'peace'], stream: 'Science' }),
  ch('Class 12', 'English', 'A Thing of Beauty', { num: 3, book: 'Flamingo (Poetry)', tags: ['john-keats', 'poetry', 'beauty'], stream: 'Science' }),
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const SYLLABUS_11_SCIENCE: SyllabusChapter[] = [
  ...C11_PHYSICS, ...C11_CHEMISTRY, ...C11_MATHS, ...C11_BIOLOGY, ...C11_ENGLISH,
];
export const SYLLABUS_11_COMMERCE: SyllabusChapter[] = [
  ...C11_ACCOUNTANCY, ...C11_BUSINESS, ...C11_ECONOMICS,
  // Commerce Maths uses same chapters as Science Maths for Class 11
  ...C11_MATHS.map(c => ({ ...c, stream: 'Commerce' as Stream })),
  ...C11_ENGLISH.map(c => ({ ...c, stream: 'Commerce' as Stream })),
];
export const SYLLABUS_12_SCIENCE: SyllabusChapter[] = [
  ...C12_PHYSICS, ...C12_CHEMISTRY, ...C12_MATHS, ...C12_BIOLOGY, ...C12_ENGLISH,
];
export const SYLLABUS_12_COMMERCE: SyllabusChapter[] = [
  ...C12_ACCOUNTANCY, ...C12_BUSINESS, ...C12_ECONOMICS,
  ...C12_MATHS.map(c => ({ ...c, stream: 'Commerce' as Stream })),
  ...C12_ENGLISH.map(c => ({ ...c, stream: 'Commerce' as Stream })),
];

/** Get all chapters for a given class + stream. */
export function getSyllabusFor(classLevel: ClassLevel, stream?: Stream): SyllabusChapter[] {
  if (classLevel === 'Class 10') return []; // Class 10 uses the existing class10Syllabus.ts
  if (classLevel === 'Class 11') return stream === 'Commerce' ? SYLLABUS_11_COMMERCE : SYLLABUS_11_SCIENCE;
  if (classLevel === 'Class 12') return stream === 'Commerce' ? SYLLABUS_12_COMMERCE : SYLLABUS_12_SCIENCE;
  return [];
}

/** Search chapters across a specific class + stream. */
export function searchSyllabusAll(
  classLevel: ClassLevel,
  stream: Stream | undefined,
  query: string,
  subject?: string,
): SyllabusChapter[] {
  const chapters = getSyllabusFor(classLevel, stream);
  const q = query.trim().toLowerCase();
  return chapters.filter(c => {
    if (subject && subject !== 'All' && c.subject !== subject) return false;
    if (!q) return true;
    const haystack = [c.chapterTitle, c.subject, c.book || '', ...c.tags].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}
