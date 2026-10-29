import { readMenu, writeSteps } from './joomla-tidy.js'
import { writeMainMenu } from './main-menu.js'

/** Joomla T3 and T4 declare placement by menutype and parent_id. Never touch footer menu rows. */
export async function writeJoomlaMainMenu({ apply, siteKey, sitePlan, model, locale, signal, contentMap }) {
  const slots = new Map(
    (contentMap?.slots ?? [])
      .filter((s) => s.role === 'editorial.menu_label' && s.column === 'title')
      .map((s) => [s.entity, s])
  )
  return writeMainMenu({
    sitePlan,
    model,
    locale,
    signal,
    read: async () =>
      (await readMenu(apply, siteKey))
        .filter(
          (row) =>
            /(?:^|[-_])main(?:menu)?(?:[-_]|$)|^mainmenu$/i.test(row.menutype ?? '') &&
            Number(row.published) === 1
        )
        .map((row) => ({
          key: String(row.id),
          path: Number(row.home) === 1 ? '/' : `/${row.path}`,
          label: String(row.title ?? ''),
          parent: String(row.parent_id ?? ''),
          menu: row.menutype,
          maxCharacters:
            slots.get(`menuItem-${row.id}`)?.fit?.maxCharacters ??
            slots.get(`menuItem-${row.id}`)?.maxCharacters ??
            60
        })),
    write: async (items) => {
      const result = await writeSteps({
        apply,
        siteKey,
        applyId: `main-menu-${Date.now().toString(36)}`,
        steps: items.map((i) => ({ kind: 'menuItem', id: Number(i.key), fields: { title: i.label } }))
      })
      if (result.refused.length || result.skipped.length)
        throw new Error(`MAIN_MENU_WRITE_REFUSED: ${result.refused.map((r) => r.id).join(', ')}`)
    }
  })
}
