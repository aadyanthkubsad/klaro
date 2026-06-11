/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Syllabus version registry — tracks which academic-year syllabus is
 * active for each board/class combination. Used by Library UI to show
 * "CBSE Class 10 · 2025-26" and "Last checked: date".
 *
 * Verify against latest official CBSE curriculum before production release.
 */

export interface SyllabusVersion {
  board: string;
  classLevel: string;
  academicYear: string;
  subjects: string[];
  sourceName: string;
  sourceUrl?: string;
  lastChecked: string;
  status: 'active' | 'archived' | 'draft';
}

export const SYLLABUS_VERSIONS: SyllabusVersion[] = [
  {
    board: 'CBSE',
    classLevel: 'Class 10',
    academicYear: '2025-26',
    subjects: ['Science', 'Mathematics', 'Social Science', 'English', 'Hindi'],
    sourceName: 'CBSE Secondary Curriculum 2025-26',
    lastChecked: '2026-05-20',
    status: 'active',
  },
];

export function getActiveVersion(
  board: string,
  classLevel: string,
): SyllabusVersion | undefined {
  return SYLLABUS_VERSIONS.find(
    v => v.board === board && v.classLevel === classLevel && v.status === 'active',
  );
}
