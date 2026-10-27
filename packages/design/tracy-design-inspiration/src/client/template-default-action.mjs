/**
 * What the Template default card's preview popup offers where every other popup offers Try on your site (Akemi,
 * 14/10/2026). Since 15/10/2026 the way back is a press of its own: the apply door with `id: template-default`
 * takes the worn system off (the host keeps it as an apply, so the try's bar offers Undo back to that system). It
 * no longer leans on undoing the last apply, which left no way back after two applies, or after the newest was
 * undone. So:
 *
 * - nothing worn: the site already wears the template's own look; a quiet, disabled "Your site uses this look";
 * - worn: "Back to template default", on for a seat that may write, on every template (a locked one included:
 *   the lock closes a NEW system, never the way back);
 * - off while a try is up (its bar holds the Undo, no reason: the bar says it) or for a Viewer seat (`ds.viewer`).
 *
 * Pure, so `node --test` runs it without a build.
 */

/**
 * @typedef {{ key: string, params?: Record<string, string> }} Words
 */

/**
 * @param {{ read: { worn: unknown, canApply: boolean } | null, trial: unknown }} at
 * @returns {{ label: Words, enabled: boolean, reason: Words | null }}
 */
export function templateDefaultActionOf({ read, trial }) {
  if (!read || !read.worn) return { label: { key: 'ds.default.inUse' }, enabled: false, reason: null }
  const label = { key: 'ds.worn.back' }
  if (!read.canApply) return { label, enabled: false, reason: { key: 'ds.viewer' } }
  if (trial) return { label, enabled: false, reason: null }
  return { label, enabled: true, reason: null }
}
