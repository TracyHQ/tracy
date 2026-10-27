/**
 * Which quickstart a Build presses for, given the platform and the design that was picked.
 *
 * Two roads, one answer:
 *
 *   joomla     every design is a Joomla template on the ONE base archive, so the quickstart is
 *              whatever the fleet's design plan resolved (`plan.baseQuickstart`) — never chosen here.
 *   wordpress  a design that IS an archive — Tracy Base, whose theme, pages and patterns ship in the
 *              quickstart — is named in `TEMPLATES` below; every other inspiration is the released
 *              `tracy` theme with one of the 152 looks (`theme.style`), and has no quickstart.
 *
 * ⚠ `TEMPLATES` is a list BESIDE the design catalog, not in it. The catalog the form validates
 * against is generated from `vendor/tracy/od-design-system` (152 systems, `library-ids.mjs`) and
 * cannot carry an entry that is not a design system. So a template id is accepted by `check` through
 * `templateIds()` and by the form through `quickstartFor()`; the design-inspiration tab does not yet
 * offer it — a template has to be named to the Build by whoever opens the tab (`meta.id`).
 */

/** @type {Readonly<Record<string, { platform: string, quickstart: string, name: string }>>} */
export const TEMPLATES = Object.freeze({
  'tracy-base': Object.freeze({ platform: 'wordpress', quickstart: 'tracy-base/wp7', name: 'Tracy Base' }),
  'tracy-business': Object.freeze({
    platform: 'wordpress',
    quickstart: 'tracy-business/wp7',
    name: 'Tracy Business'
  })
})

/** The template ids a Build on `platform` may be asked for. @param {string} platform */
export function templateIds(platform) {
  return new Set(Object.keys(TEMPLATES).filter((id) => TEMPLATES[id].platform === platform))
}

/**
 * The quickstart the create call carries, or null for a build that restores none.
 * @param {string} platform
 * @param {string} id the picked design or template id
 * @param {{ baseQuickstart?: string } | null | undefined} [plan] the fleet's design plan (Joomla only)
 * @returns {string | null}
 */
export function quickstartFor(platform, id, plan) {
  if (platform === 'joomla') return typeof plan?.baseQuickstart === 'string' ? plan.baseQuickstart : null
  const template = Object.hasOwn(TEMPLATES, id) ? TEMPLATES[id] : null
  return template && template.platform === platform ? template.quickstart : null
}
