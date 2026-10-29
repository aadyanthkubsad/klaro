/**
 * Formats the mixed date strings stored across the app — ISO timestamps,
 * "dd/mm/yyyy" (library items), "mm/dd/yyyy" (older stats) and labels like
 * "Just now" — as a short readable date. Never returns "Invalid Date".
 */
export function formatShortDate(value?: string | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  if (!value) return '—';
  const s = String(value).trim();
  let d = new Date(s);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    // dd/mm/yyyy unless the first part can't be a day-of-month pairing (then mm/dd)
    d = a > 12 ? new Date(y, b - 1, a) : b > 12 ? new Date(y, a - 1, b) : new Date(y, b - 1, a);
  }
  if (isNaN(d.getTime())) return /^[a-z ]+$/i.test(s) ? s : '—'; // e.g. "Just now"
  return d.toLocaleDateString(undefined, opts);
}
