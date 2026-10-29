// mathFormat — turns the plain-ASCII notation the AI often emits for formulas
// (e.g. "R_cm = (sum(m_i * r_i)) / (sum(m_i))", "omega^2 = omega_0^2 + 2*alpha*theta")
// into a small node tree that the <MathText> component renders as textbook-style
// math: Greek letters, real subscripts/superscripts, Σ / ∫ / √ and stacked fractions.
//
// Pure functions only (no React) so it can be sanity-checked from Node.

export type MathNode =
  | string
  | { t: 'sub'; c: MathNode[] }
  | { t: 'sup'; c: MathNode[] }
  | { t: 'frac'; n: MathNode[]; d: MathNode[] }
  | { t: 'sqrt'; c: MathNode[] }
  | { t: 'grp'; open: string; close: string; c: MathNode[] };

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  theta: 'θ', kappa: 'κ', lambda: 'λ', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω', rho: 'ρ',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Sigma: 'Σ', Phi: 'Φ', Omega: 'Ω',
};
// Short names that are also ordinary English/symbol fragments — only converted inside formulas.
const GREEK_SHORT: Record<string, string> = { mu: 'μ', pi: 'π', eta: 'η', nu: 'ν', xi: 'ξ', chi: 'χ', psi: 'ψ' };

/**
 * Text-level rewrites applied before parsing.
 * `formula` mode is aggressive (sum/integral/cross product/`*`);
 * `prose` mode (notes, names) only converts Greek words and hats.
 */
export function normalizeMath(raw: string, mode: 'formula' | 'prose' = 'formula'): string {
  if (!raw) return '';
  let s = String(raw);

  // LaTeX-ish leftovers: \omega → omega, \frac{a}{b} → (a)/(b), braces → parens
  s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  s = s.replace(/\\(?:left|right)/g, '');
  s = s.replace(/\\cdot/g, '*').replace(/\\times/g, ' x ');
  s = s.replace(/\\([A-Za-z]+)/g, '$1');

  // Unit-vector hats: n-hat / n_hat / hat(n) → n̂
  s = s.replace(/\bhat\(([A-Za-z])\)/g, '$1̂');
  s = s.replace(/\b([A-Za-z])[-_]hat\b/g, '$1̂');

  const greek = mode === 'formula' ? { ...GREEK, ...GREEK_SHORT } : GREEK;
  // Greek names, also when glued to a subscript/superscript ("omega_0", "theta^2")
  s = s.replace(/[A-Za-z]+/g, (w) => greek[w] ?? w);

  // Cross product between single-letter vectors, safe even in prose: "a x b", "j x i"
  s = s.replace(/\b([A-Za-z]̂?)\s+x\s+(?=[A-Za-z]\b|\()/g, '$1 × ');

  if (mode === 'formula') {
    // Calculus: d(theta)/dt → dθ/dt, d^2(theta) → d^2θ
    s = s.replace(/\b(d(?:\^\d)?)\(([\p{L}][\p{L}\p{N}_]*)\)/gu, '$1$2');
    // sum(x) → Σx, integral(x) → ∫x, sqrt(x) → √(x)
    s = s.replace(/\b(?:sum|Sum)\s*\(([^()]*)\)/g, 'Σ $1');
    s = s.replace(/\b(?:Sum|SUM)\b\s*/g, 'Σ');
    s = s.replace(/\bintegral\s*\(([^()]*)\)/gi, '∫ $1');
    s = s.replace(/\bintegral\b\s*/gi, '∫ ');
    s = s.replace(/\bsqrt\s*\(/g, '√(');
    // Cross product written as a spaced "x" between operands: "a x b", "r x F"
    s = s.replace(/([\p{L}\p{N})̂])\s+x\s+(?=[\p{L}\p{N}(])/gu, '$1 × ');
    // Explicit multiplication: "m_i * r_i" → "m_i r_i" (thin space keeps symbols apart)
    s = s.replace(/\s*\*\s*/g, ' ');
    // Comparison operators
    s = s.replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=/g, '≠').replace(/<</g, '≪').replace(/>>/g, '≫');
    s = s.replace(/->/g, '→');
  }
  return s;
}

/** Parse normalized text into nodes: groups, sub/superscripts and fractions. */
export function parseMath(s: string): MathNode[] {
  let i = 0;
  const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

  const parseSeq = (close?: string): MathNode[] => {
    const out: MathNode[] = [];
    let buf = '';
    const flush = () => { if (buf) { out.push(buf); buf = ''; } };
    while (i < s.length) {
      const ch = s[i];
      if (close && ch === close) { i++; flush(); return out; }
      if (ch in PAIRS) {
        const isRoot = ch === '(' && buf.endsWith('√');
        if (isRoot) buf = buf.slice(0, -1);
        flush(); i++;
        const c = parseSeq(PAIRS[ch]);
        out.push(isRoot ? { t: 'sqrt', c } : { t: 'grp', open: ch, close: PAIRS[ch], c });
        continue;
      }
      if ((ch === '_' || ch === '^') && i + 1 < s.length) {
        const script = readScript(ch);
        if (script) { flush(); out.push({ t: ch === '_' ? 'sub' : 'sup', c: script }); continue; }
      }
      if (ch === '/') { flush(); out.push('/'); i++; continue; }
      buf += ch; i++;
    }
    flush();
    return out;
  };

  // Reads the operand after _ or ^ : a {…}/(…) group, or a short token.
  const readScript = (kind: string): MathNode[] | null => {
    const next = s[i + 1];
    if (next === '{' || (next === '(' && kind === '^')) {
      i += 2;
      return parseSeq(next === '{' ? '}' : ')');
    }
    const rest = s.slice(i + 1);
    const m = kind === '^'
      ? rest.match(/^-?(?:\d+(?:\.\d+)?|[\p{L}])/u)          // ^2, ^-11, ^n
      : rest.match(/^[\p{L}\p{N}]+/u);                       // _cm, _0, _ext
    if (!m) return null;
    i += 1 + m[0].length;
    return [m[0].replace(/^-/, '−')];
  };

  return foldFractions(parseSeq());
}

const isSimpleFracSide = (n: MathNode) => typeof n === 'string' && /^\s*[\p{L}\p{N}.]+\s*$/u.test(n);

/** "(a) / (b)" → stacked fraction; "(1/2)" → small fraction. Recurses into children. */
function foldFractions(nodes: MathNode[]): MathNode[] {
  const rec = (n: MathNode): MathNode => {
    if (typeof n === 'string') return n;
    if (n.t === 'frac') return { ...n, n: foldFractions(n.n), d: foldFractions(n.d) };
    return { ...n, c: foldFractions(n.c) } as MathNode;
  };
  const list = nodes.map(rec);
  const out: MathNode[] = [];
  for (let k = 0; k < list.length; k++) {
    const cur = list[k];
    // (num) / (den), allowing whitespace-only strings around the slash
    if (typeof cur !== 'string' && cur.t === 'grp' && cur.open === '(') {
      let j = k + 1;
      if (typeof list[j] === 'string' && !(list[j] as string).trim()) j++;
      if (list[j] === '/') {
        let m = j + 1;
        if (typeof list[m] === 'string' && !(list[m] as string).trim()) m++;
        const den = list[m];
        if (den && typeof den !== 'string' && den.t === 'grp' && den.open === '(') {
          out.push({ t: 'frac', n: cur.c, d: den.c });
          k = m;
          continue;
        }
      }
      // (1/2), (1/M), (2/5)
      if (cur.c.length === 3 && cur.c[1] === '/' && isSimpleFracSide(cur.c[0]) && isSimpleFracSide(cur.c[2])) {
        out.push({ t: 'frac', n: [(cur.c[0] as string).trim()], d: [(cur.c[2] as string).trim()] });
        continue;
      }
    }
    out.push(cur);
  }
  return out;
}

export function formatMath(raw: string, mode: 'formula' | 'prose' = 'formula'): MathNode[] {
  return parseMath(normalizeMath(raw, mode));
}

/** Plain-string rendering (Unicode sub/superscripts where possible) — used for tests and PDF/text export. */
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '−': '⁻', '-': '⁻', '+': '⁺', n: 'ⁿ' };
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', i: 'ᵢ', j: 'ⱼ', e: 'ₑ', o: 'ₒ', x: 'ₓ', n: 'ₙ', m: 'ₘ', k: 'ₖ', t: 'ₜ', h: 'ₕ', p: 'ₚ', s: 'ₛ', r: 'ᵣ', a: 'ₐ', l: 'ₗ' };
export function mathToPlain(nodes: MathNode[]): string {
  return nodes.map((n) => {
    if (typeof n === 'string') return n;
    if (n.t === 'grp') return n.open + mathToPlain(n.c) + n.close;
    if (n.t === 'sqrt') return `√(${mathToPlain(n.c)})`;
    if (n.t === 'frac') {
      const wrap = (x: MathNode[]) => { const p = mathToPlain(x); return /^[\p{L}\p{N}.]+$/u.test(p) ? p : `(${p})`; };
      return `${wrap(n.n)}/${wrap(n.d)}`;
    }
    const map = n.t === 'sup' ? SUP : SUB;
    const p = mathToPlain(n.c);
    const conv = [...p].map((ch) => map[ch]);
    return conv.every(Boolean) ? conv.join('') : (n.t === 'sup' ? `^${p}` : `_${p}`);
  }).join('');
}

/** Science / maths subjects get math formatting. Handles labels like "Science (Chemistry)". */
export function isMathSubject(subject?: string): boolean {
  const s = (subject || '').toLowerCase();
  if (/social|political|computer|home science/.test(s)) return false;
  return /physics|chemistry|science|math/.test(s);
}
