import {
  invalidMenuLabel,
  isPrimaryMenuPage,
  mainMenuItems,
  mainMenuTargets,
  menuPath
} from 'website-opportunities/domain/main-menu.mjs'
import { ruleText } from 'website-opportunities/domain/build-rules.mjs'
import { inSiteSpelling } from 'website-opportunities/domain/site-style-sheet.mjs'
import { jsonObjectIn } from './shared.js'

const SYSTEM =
  "Name the main menu of a business website from its kept pages and page roles. Use the business's own words from " +
  'the brief in the requested language. Name an offerings index using the words this business uses for its offerings. ' +
  'A team page names its people. A booking page names booking. Never invent offerings or people. ' +
  // The menu label rule is the site build rules registry's one wording (`build-rules.mjs`, rule 6).
  `${ruleText('menu-label-is-page-name')} Every item needs ` +
  'a nonempty short label within maxCharacters; siblings in the same menu and parent must have distinct labels. ' +
  'Do not change paths or placement. Return JSON only: {"labels":{"<key>":"<label>"}} for every given item.'

const fail = (code, detail) => Object.assign(new Error(`${code}: ${detail}`), { code })

/**
 * The last menu write, after all copy pins and cleanup, followed by native readback. Every CMS supplies only its main
 * menu placements. Plain demo builds have no site plan and never enter this stage. A label that fails takes its page title (recorded in `fallbacks`); a page with no valid title is a blocker `finding`.
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
  /** Items whose model label failed and took the page's own title, and items no valid name exists for (blockers). */
  const fallbacks = []
  const findings = []
  const pageTitle = (/** @type {any} */ item) => {
    const page = (sitePlan.pages ?? []).find((/** @type {any} */ p) => p.id === item.pageId)
    const title = String(page?.title ?? page?.label ?? '').trim()
    return title ? String(inSiteSpelling(title, sitePlan?.styleSheet, { keep: [business.name] })) : ''
  }
  const values = []
  for (const item of items) {
    let label = String(result?.labels?.[firstOf.get(item.pageId) ?? item.key] ?? '').trim()
    const keyOf = (/** @type {string} */ l) =>
      `${item.menu ?? ''}\u0000${item.parent ?? ''}\u0000${l.toLocaleLowerCase(locale)}`
    let invalid = invalidMenuLabel(label, item.role, item.maxCharacters ?? 60)
    if (invalid || siblings.has(keyOf(label))) {
      // 🔒 THE FALLBACK OF A MENU LABEL IS THE PAGE TITLE (registry rule `menu-label-is-page-name`), never a generic action
      // and never a build stop: one bad label of the model names its page by its own title.
      const title = pageTitle(item)
      const why = invalid ?? 'duplicate-label'
      invalid = invalidMenuLabel(title, item.role, item.maxCharacters ?? 60)
      if (invalid || siblings.has(keyOf(title))) {
        findings.push({
          kind: 'main-menu',
          severity: 'blocker',
          key: item.key,
          pageId: item.pageId,
          reason: invalid ?? 'duplicate-label'
        })
        continue
      }
      fallbacks.push({ key: item.key, pageId: item.pageId, was: label, reason: why, label: title })
      label = title
    }
    siblings.add(keyOf(label))
    values.push({ ...item, label })
  }
  if (!values.length) return { items: values, fallbacks, findings }
  await write(values)
  const after = await read()
  const refused = values.filter(
    (item) =>
      !after.some(
        (a) => a.key === item.key && a.label === item.label && menuPath(a.path) === menuPath(item.path)
      )
  )
  if (refused.length) throw fail('MAIN_MENU_READBACK', refused.map((i) => i.key).join(', '))
  return { items: values, fallbacks, findings }
}
