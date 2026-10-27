/**
 * The kit sample pages of a Joomla template (TCH #1013, K3, task 12): the newsletter, email, form, slide and style guide pages
 * under a "Marketing Kit" or "Resources" heading (Tracy Business `/marketing-kit/…`), and a typography or style guide page
 * under any heading (JA Essence `/typography`). They show what the template can draw,
 * not the customer's business, so they keep the template's content; only their words follow the site's language.
 *
 * Found in the release's own capture (`presentation-lock.json` menu entries and `content-map.json` pages), the same way the
 * readiness rules tell them (`site-pages/page-rule.js`): an entry labelled as a kit sample under a heading that names the kit,
 * the heading itself, the article each one opens, and the modules shown on kit pages only.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { translateLines } from './translate-lines.js'

/** A kit sample page: its label, under a heading that names the kit. */
const KIT_LABEL = /^(newsletter|e-?mail|form|slides?|style ?guide)\b/i
const KIT_HEADING = /\b(resources?|kit)\b/i
/**
 * A page that shows the template's type styles is a kit sample under any heading (JA Essence "Pages › J!Pages › Typography",
 * measured 10/10/2026: rewritten into a bakery's words because its heading names no kit). Its heading is not the kit.
 *
 * 🔒 SO ARE THE PAGES THAT SHOW THE TEMPLATE'S OFFLINE AND ERROR SCREENS (TCH #1013, K3). Measured 10/10/2026 on dev
 * g58-ess-j-full (JA Essence j6 1.0.4): "Offline Pages" was rewritten to name the bakery and "Error Page" into a sentence
 * that means nothing; both describe the template's own screens, so they keep its words, translated. Found by the entry's
 * title or alias, and by an article's own (`offline-pages`, `error-page`, `404`).
 */
const KIT_ALONE =
  /^(typography|style ?guide|offline(?: pages?)?|error(?: pages?)?|404(?: pages?)?|page not found)$/i
/** The words of a title or an alias, compared as a label: `offline-pages` reads as "offline pages". */
const kitAlone = (/** @type {unknown} */ text) =>
  KIT_ALONE.test(
    String(text ?? '')
      .trim()
      .replace(/[-_]+/g, ' ')
  )
/** How many lines one translation of the kit asks at a time: one that fails costs these, never the whole kit. */
const KIT_BATCH = 30

/** @type {Map<string, Set<string>>} a release's kit, read once: a release never changes */
const kitByDir = new Map()

/**
 * The entities (`menuItem-607`, `article-562`, `module-674`) of a release's kit sample pages; empty when it has none or its
 * capture cannot be read.
 * @param {string} dir - the release's contract directory
 * @returns {Set<string>}
 */
export function kitEntities(dir) {
  const known = kitByDir.get(dir)
  if (known) return known
  /** @type {Set<string>} */
  const kit = new Set()
  try {
    const { entities = {} } = JSON.parse(readFileSync(path.join(dir, 'presentation-lock.json'), 'utf8'))
    const { pages = [] } = JSON.parse(readFileSync(path.join(dir, 'content-map.json'), 'utf8'))
    /** @type {Set<number>} */
    const ids = new Set()
    for (const [key, row] of Object.entries(entities)) {
      if (!key.startsWith('menuItem-')) continue
      const parent = entities[`menuItem-${row?.parent_id}`]
      const label = String(row?.title ?? '').trim()
      if (KIT_LABEL.test(label) && KIT_HEADING.test(String(parent?.title ?? ''))) {
        ids.add(Number(key.slice('menuItem-'.length)))
        ids.add(Number(row.parent_id))
      } else if (kitAlone(label) || kitAlone(row?.alias)) ids.add(Number(key.slice('menuItem-'.length)))
    }
    // An article that is itself such a page is one wherever it is listed, a menu entry or not.
    for (const [key, row] of Object.entries(entities))
      if (/^article-\d+$/.test(key) && (kitAlone(row?.title) || kitAlone(row?.alias))) kit.add(key)
    for (const id of ids) kit.add(`menuItem-${id}`)
    for (const page of pages) {
      if (!ids.has(Number(String(page?.entity ?? '').slice('menuItem-'.length)))) continue
      const opened = /[?&]view=article(?:&|$)/.test(page.link ?? '') && /[?&]id=(\d+)/.exec(page.link)
      if (opened) kit.add(`article-${opened[1]}`)
      for (const module of page.assignedModules ?? [])
        if (
          module?.assignmentMode === 'include' &&
          Array.isArray(module.menuIds) &&
          module.menuIds.length > 0 &&
          module.menuIds.every((/** @type {number} */ id) => ids.has(Number(id)))
        )
          kit.add(module.entity)
    }
  } catch {
    // A release without a readable capture has no kit Tracy can tell: its pages are planned like any other.
  }
  kitByDir.set(dir, kit)
  return kit
}

/** Whether a slot's sample holds words to translate: letters, and not a file or a path. */
export const translatable = (/** @type {unknown} */ sample) => {
  const text = String(sample ?? '').trim()
  return /\p{L}/u.test(text) && !/^(?:images|media)\//.test(text) && !/^#[0-9a-f]{3,8}$/i.test(text)
}

/**
 * The kit's words in the site's language (K3): every text slot of the kit translated from the template's own words, the
 * template's shipped translations first, the rest asked of the model while the site installs. Nothing when the site is in the
 * template's language or no model is set. Never rejects: a line no answer could be used for keeps the template's words, said.
 * @param {object} input
 * @param {Array<{ key: string, type: string, sample?: string, maxCharacters: number }>} input.slots - the kit's text slots, the source edition's
 * @param {string} input.locale - the language the site is written in
 * @param {string} input.source - the template's own language
 * @param {{ chat: Function } | null} input.model
 * @param {Map<string, string>} input.shipped - what the template ships translated, by cache key
 * @param {AbortSignal} [input.signal]
 * @param {(note: string) => void} input.note
 * @param {string} [input.what] - what the lines are, for the note (`the kit sample pages`)
 * @returns {Promise<Record<string, string>>} slot key → its words in `locale`
 */
export async function translateKit({
  slots,
  locale,
  source,
  model,
  shipped,
  signal,
  note,
  what = 'the kit sample pages'
}) {
  const words = slots.filter((slot) => slot.type === 'text' && translatable(slot.sample))
  if (locale === source || words.length === 0) return {}
  if (!model) {
    note(`no text model is set, so ${what} keep the template’s language`)
    return {}
  }
  // 🔒 ONE BATCH THAT FAILS COSTS NOTHING (TCH #1013, K3, LANG-2). A translation is all or nothing (`warmTranslations` throws on
  // the first batch it cannot read), so the 160 lines of JA Essence's Typography page were one throw away from staying English
  // whole (dev g58-ess-j-full, 10/10/2026); batched, the first batch of 30 still stayed English on g59 the same day. A batch
  // whose answer cannot be used is asked again, split down to single lines, then asked line by line (`translate-lines.js`).
  return translateLines({ lines: words, locale, shipped, model, signal, note, what, batch: KIT_BATCH })
}
