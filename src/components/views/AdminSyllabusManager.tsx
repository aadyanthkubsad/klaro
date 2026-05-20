/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AdminSyllabusManager — placeholder for future syllabus admin tooling.
 * Not wired into routing or sidebar yet.
 */

import React from 'react';
import { FileText, Upload, GitCompare, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export const AdminSyllabusManager = () => {
  const features = [
    { icon: Upload, label: 'Upload latest CBSE curriculum PDF', status: 'planned' },
    { icon: FileText, label: 'Extract text and chapter metadata', status: 'planned' },
    { icon: GitCompare, label: 'Compare old vs new syllabus', status: 'planned' },
    { icon: CheckCircle, label: 'Show added chapters', status: 'planned' },
    { icon: XCircle, label: 'Show removed chapters', status: 'planned' },
    { icon: AlertTriangle, label: 'Show changed topics', status: 'planned' },
    { icon: CheckCircle, label: 'Mark syllabus as verified', status: 'planned' },
  ];

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <div className="text-center mb-10">
        <span className="inline-block px-4 py-1.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest mb-4">
          Coming Soon
        </span>
        <h2 className="text-3xl font-black text-on-surface tracking-tight">
          Syllabus Update Manager
        </h2>
        <p className="text-on-surface-variant font-medium mt-2 max-w-md mx-auto">
          Upload CBSE PDFs, compare old vs new syllabus, and mark chapters as verified — all from one place.
        </p>
      </div>

      <div className="bg-white border border-surface-container rounded-[24px] p-8 shadow-sm">
        <div className="space-y-4">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={i}
                className="flex items-center gap-4 p-4 rounded-xl bg-surface-container-low opacity-50 cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant">
                  <Icon size={20} />
                </div>
                <span className="font-bold text-sm text-on-surface">{f.label}</span>
                <span className="ml-auto px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-[9px] font-black uppercase tracking-widest">
                  {f.status}
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-on-surface-variant font-medium text-center mt-6">
          This feature will allow administrators to keep the syllabus data
          up-to-date without code changes. For now, syllabus metadata is
          managed in <code className="text-primary">src/data/class10Syllabus.ts</code>.
        </p>
      </div>
    </div>
  );
};
