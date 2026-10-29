import {
  invalidMenuLabel,
  isPrimaryMenuPage,
  mainMenuItems,
  mainMenuTargets,
  menuPath
} from 'website-opportunities/domain/main-menu.mjs'
import { jsonObjectIn } from './shared.js'

const SYSTEM =
  "Name the main menu of a business website from its kept pages and page roles. Use the business's own words from " +
  'the brief in the requested language. Name an offerings index using the words this business uses for its offerings. ' +
  'A team page names its people. A booking page names booking. Never invent offerings or people. Never use a generic ' +
  'action such as Learn more, Read more or Details as a menu label. Contact names only a contact page. Every item needs ' +
  'a nonempty short label within maxCharacters; siblings in the same menu and parent must have distinct labels. ' +
  'Do not change paths or placement. Return JSON only: {"labels":{"<key>":"<label>"}} for every given item.'

const fail = (code, detail) => Object.assign(new Error(`${code}: ${detail}`), { code })

/**
 * The last menu write, after all copy pins and cleanup, followed by native readback. Every CMS supplies only its main
 * menu placements. Plain demo builds have no site plan and never enter this stage. Failures stop the build clearly.
 * @param {{sitePlan: any, read: Function, write?: Function, model: any, locale?: string, signal?: AbortSignal}} input
 */
export async function writeMainMenu({ sitePlan, read, write, model, locale = 'en', signal }) {
  if (!sitePlan) return null
  if (!(sitePlan.pages ?? []).some((p) => p.decision === 'keep')) return { items: [] }
  const inventory = await read()
  const items = mainMenuItems(sitePlan, inventory)
  const targets = mainMenuTargets(sitePlan, inventory)
  // The header may be shorter: only a primary page (home, offerings index, contact or booking, about) must have a place.
  const missing = targets.filter((p) => isPrimaryMenuPage(p) && !items.some((i) => i.pageId === p.id))
  if (missing.length) throw fail('MAIN_MENU_MISSING_PAGE', missing.map((p) => p.id).join(', '))
  if (!items.length) return { items: [] }
  if (!model?.chat) throw fail('MAIN_MENU_MODEL_UNAVAILABLE', 'page-role labels require a text model')
  const business = {
    name: sitePlan.brand?.name?.value ?? '',
    description: sitePlan.brand?.description?.value ?? ''
  }
  const messages = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: JSON.stringify({
        business,
        locale,
        items: items.map(({ key, path, role, parent, menu, maxCharacters }) => ({
          key,
          path,
          role,
          parent,
          menu,
          maxCharacters: maxCharacters ?? 60
        }))
      })
    }
  ]
  const result = jsonObjectIn(await model.chat({ messages, maxTokens: 2000, temperature: 0, signal }))
  // 🔒 ONE PAGE, ONE NAME (#189 round 9, C6): every entry of one page carries the label of its first entry (a parent
  // "About" and its child "About Us" both opened one page), so the header, the footer and the breadcrumbs agree.
  /** @type {Map<string, string>} */
  const firstOf = new Map()
  for (const item of items) if (!firstOf.has(item.pageId)) firstOf.set(item.pageId, item.key)
  const siblings = new Set()
  const values = items.map((item) => {
    const label = String(result?.labels?.[firstOf.get(item.pageId) ?? item.key] ?? '').trim()
    const invalid = invalidMenuLabel(label, item.role, item.maxCharacters ?? 60)
    const sibling = `${item.menu ?? ''}\u0000${item.parent ?? ''}\u0000${label.toLocaleLowerCase(locale)}`
    if (invalid || siblings.has(sibling))
      throw fail('MAIN_MENU_INVALID', `${item.key}: ${invalid ?? 'duplicate-label'}`)
    siblings.add(sibling)
    return { ...item, label }
  })
  await write(values)
  const after = await read()
  const refused = values.filter(
    (item) =>
      !after.some(
        (a) => a.key === item.key && a.label === item.label && menuPath(a.path) === menuPath(item.path)
      )
  )
  if (refused.length) throw fail('MAIN_MENU_READBACK', refused.map((i) => i.key).join(', '))
  return { items: values }
}
