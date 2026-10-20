/**
 * MathText — renders an AI-generated formula string as readable, textbook-style math:
 * Greek letters, real subscripts/superscripts, Σ / ∫ / √ and stacked fractions.
 * Parsing lives in utils/mathFormat.ts; this file only maps nodes to JSX.
 */

import React from 'react';
import { formatMath, MathNode } from '../../utils/mathFormat';

const MATH_FONT = "'Cambria Math', 'STIX Two Math', 'Latin Modern Math', 'Times New Roman', serif";

function renderNodes(nodes: MathNode[], keyPrefix = ''): React.ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`;
    if (typeof n === 'string') return <React.Fragment key={key}>{n}</React.Fragment>;
    switch (n.t) {
      case 'sub':
        return <sub key={key} className="text-[0.7em] leading-none">{renderNodes(n.c, key + '-')}</sub>;
      case 'sup':
        return <sup key={key} className="text-[0.7em] leading-none">{renderNodes(n.c, key + '-')}</sup>;
      case 'grp':
        return <React.Fragment key={key}>{n.open}{renderNodes(n.c, key + '-')}{n.close}</React.Fragment>;
      case 'sqrt':
        return (
          <span key={key} className="inline-flex items-stretch whitespace-nowrap">
            <span className="self-end">√</span>
            <span className="border-t border-current pt-px px-0.5">{renderNodes(n.c, key + '-')}</span>
          </span>
        );
      case 'frac':
        return (
          <span key={key} className="inline-flex flex-col items-center align-middle mx-0.5 text-[0.9em] leading-tight">
            <span className="px-1">{renderNodes(n.n, key + 'n-')}</span>
            <span className="px-1 border-t border-current w-full text-center">{renderNodes(n.d, key + 'd-')}</span>
          </span>
        );
    }
  });
}

export const MathText: React.FC<{
  text: string;
  /** 'formula' converts sum/integral/cross/`*`; 'prose' only Greek letters, scripts and fractions. */
  mode?: 'formula' | 'prose';
  className?: string;
}> = ({ text, mode = 'formula', className }) => {
  const nodes = React.useMemo(() => formatMath(text || '', mode), [text, mode]);
  return (
    <span className={className} style={mode === 'formula' ? { fontFamily: MATH_FONT } : undefined}>
      {renderNodes(nodes)}
    </span>
  );
};
