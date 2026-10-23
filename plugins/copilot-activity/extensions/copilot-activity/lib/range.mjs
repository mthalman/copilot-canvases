// Time-period helper shared by the canvas server and the agent actions.
// Resolves a flexible period descriptor into a concrete half-open
// [from, to) ISO-8601 window:
//   - an explicit { from, to } pair is passed through (days preserved if given)
//   - otherwise a look-back window of `days` ending "now" is computed
//   - days === 0 means "all time" (from a fixed epoch-ish floor)
//   - days defaults to 30 when omitted
export function computeRange({ from, to, days } = {}) {
    if (from && to) return { from, to, days: days ?? null };
    const now = new Date();
    const d = typeof days === "number" ? days : 30;
    const start =
        d === 0 ? new Date("2000-01-01T00:00:00.000Z") : new Date(now.getTime() - d * 86400000);
    return { from: start.toISOString(), to: now.toISOString(), days: d };
}
