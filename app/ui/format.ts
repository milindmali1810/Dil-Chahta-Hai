// Small pure formatters that client components can import too.
// (lib/server/data.ts has the same IST maths but imports `server-only`.)

/** India has no daylight saving, so a fixed +05:30 offset is exact. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * Rupees with Indian digit grouping: 12000 → "₹12,000", 100000 → "₹1,00,000".
 * Done by hand so the output never depends on the runtime's locale data.
 */
export function formatInr(amount: number): string {
  const digits = String(Math.round(amount));
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return rest ? `₹${rest.replace(/\B(?=(\d{2})+$)/g, ",")},${last3}` : `₹${last3}`;
}

/** e.g. "9:42 PM", in IST regardless of the machine's timezone. */
export function formatTimeIst(date: Date | string): string {
  const ms = (typeof date === "string" ? new Date(date) : date).getTime();
  // Shift into IST, then read the UTC fields, so the machine timezone can't matter.
  const d = new Date(ms + IST_OFFSET_MS);
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h12}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
}
