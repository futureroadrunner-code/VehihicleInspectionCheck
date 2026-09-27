// All dates are local calendar days as YYYY-MM-DD strings, so a check done at
// 11pm never slides into the next day the way UTC conversion would.

export function toISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Monday of the week containing `iso` (Sunday belongs to the prior week). */
export function mondayOf(iso: string): string {
  const d = fromISODate(iso);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return toISODate(d);
}

/** Mon–Fri of the week starting at `monday`. */
export function workweek(monday: string): string[] {
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

export function isWeekday(iso: string): boolean {
  const dow = fromISODate(iso).getDay();
  return dow >= 1 && dow <= 5;
}

export function isFriday(iso: string): boolean {
  return fromISODate(iso).getDay() === 5;
}

export function format(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return fromISODate(iso).toLocaleDateString("en-US", opts);
}
