/**
 * WHICH INSPIRATION A BUILD TAB IS ABOUT — one answer, for everything that asks.
 *
 * 🔒 THE HEADER KNEW AND THE FETCH DID NOT. `BuildTab` decided this twice with two different
 * expressions: the header read `current?.inspiration ?? meta.id ?? ask?.inspiration ?? carried?.id`
 * and the questions fetch read `meta.id ?? ask?.inspiration`. A tab whose inspiration came from the
 * JOB or from the sign-in CARRY therefore drew "Design inspiration tracy-business" over a fetch
 * that never fired — `askedFor` was null and the effect returned before asking.
 *
 * What the customer sees then is the worst shape that file has. `questions` stays null and
 * `questionsFailed` stays false, so the panel takes the branch that draws the header and THREE GREY
 * BARS: no spinner, no sentence, no Retry, and nothing that ever ends it. Measured 22/09/2026 on
 * dev, on all three platforms at once — three sites started from the `tracy-business` card, three
 * panels showing a card with nothing under it.
 *
 * ⚠ ORDER IS THE WHOLE CONTENT OF THIS FUNCTION, so it is stated rather than implied. The JOB wins
 * because a tab following a build that already names an inspiration must not be talked out of it by
 * a stale carry. `meta` comes next: it is what opened this tab. `ask` is the agent's own question,
 * and the CARRY is last — it is the only thing that survives the reload a sign-in ends with, and so
 * the only source left when a customer picks a design, signs in, and lands back here.
 *
 * Plain JavaScript so `node --test` runs it with no build step, like `whose-job.mjs` beside it.
 */

/** @param {unknown} value @returns {string | null} a non-empty id, or null. */
const id = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

/**
 * @param {{
 *   job?: { inspiration?: unknown } | null,
 *   meta?: { id?: unknown } | null,
 *   ask?: { inspiration?: unknown } | null,
 *   carry?: { id?: unknown } | null
 * }} sources
 * @returns {string | null} the inspiration this tab is about, or null when nothing names one.
 */
export function inspirationOf({ job, meta, ask, carry } = {}) {
  return id(job?.inspiration) ?? id(meta?.id) ?? id(ask?.inspiration) ?? id(carry?.id) ?? null
}
