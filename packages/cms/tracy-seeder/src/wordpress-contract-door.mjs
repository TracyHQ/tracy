/**
 * The WordPress content-contract door, as the seeder uses it: inspect a bound site, hide its demo
 * posts, write slot values through one revision, and read an edition's own words so a second
 * language can be planned in that language.
 *
 * WHY A SEPARATE ROAD. Since Tracy Cowork for WordPress 0.12.0 a site built from a sealed
 * quickstart is BOUND: `content.update` answers `content_only` (the refusal code of Claude Cowork plugins released
 * before ADR 0022, which made the quickstart's design a recommendation), and the only write is
 * `content.contract {operation:'apply'}` with the revision the site was inspected at, one apply id
 * per revision and a request id that makes a retry a replay (Codex review #5: "bind will block the
 * seeder itself" — this file is the seeder's side of that bind). A site whose plugin has no such
 * door, or that was never bound, keeps the old road (`content.update`), so a site provisioned before
 * the pin is still built.
 *
 * Editions (wave D): the archive ships one Polylang copy of every page per language, and
 * `editions.json` names the post id of each copy. A slot addressed as `<edition>::<slot>` is written
 * into that copy. The source edition (`en`) is always written; every language the customer chose is
 * written into its own edition (D.2), planned in THAT language with the edition's own demo words as
 * samples — the off-language check needs letters of the target language to compare against, and the
 * English samples of the content map would flag every Vietnamese value as foreign.
 */
import { createHash } from 'node:crypto'
import { setBlockValue } from './apply-wordpress-contract.mjs'
import { byPosition, readSlotValue } from './wordpress-block-address.mjs'
import { doorOps } from './site-ops.mjs'
import { isNoValue, plainText } from './plain-text.mjs'

const NO_DOOR = /unknown action|bad_action|bad_params|ACTION_NOT_ALLOWED|unsupported/i

/**
 * The plugin's answer on a site without Polylang (`unavailable`, "this site has no translation plugin, …"): the site
 * has one language, so there is no other edition to hide, relabel or put in front. Not a failure.
 */
const oneLanguage = (/** @type {any} */ a) =>
  a.error === 'unavailable' && /no translation plugin/i.test(String(a.message ?? ''))

/** The door's own sentence for a refusal — never a paraphrase the customer would hunt for. */
export function doorWords(answer, fallback) {
  const a = answer && typeof answer === 'object' ? answer : {}
  const words = [a.message, a.error, a.code].find((w) => typeof w === 'string' && w !== '')
  return String(words ?? fallback)
}

/**
 * Ask the site whether it is bound. `supported:false` when the Claude Cowork plugin has no contract door at
 * all (0.11.0 and before); `bound:false` when the door exists and the site is not bound.
 * @returns {Promise<{supported: boolean, bound: boolean, state: any, words?: string}>}
 */
export async function inspectWordPressContract(apply, siteKey) {
  const answer = await apply({ siteKey, action: 'content.contract', params: { operation: 'inspect' } })
  const a = answer && typeof answer === 'object' ? answer : {}
  if (a.ok === false) {
    const words = doorWords(a, 'content.contract was refused')
    if (NO_DOOR.test(words) || NO_DOOR.test(String(a.error ?? '')) || NO_DOOR.test(String(a.code ?? '')))
      return { supported: false, bound: false, state: null, words }
    if (/contract_unbound/i.test(String(a.error ?? a.code ?? '')))
      return { supported: true, bound: false, state: null, words }
    throw new Error(words)
  }
  return { supported: true, bound: a.bound === true, state: a }
}

/**
 * Hide the demo posts a bound site's profile lists (`demoTrim.apply`, at most 300 rows a call,
 * so it loops). A Claude Cowork plugin without the operation answers `none`; a finished trim answers with
 * `alreadyTrimmed`.
 */
export async function trimWordPressDemo({ apply, siteKey, log = () => {} }) {
  const requestId = 'seed'
  let last = null
  for (let i = 0; i < 20; i++) {
    const answer = await apply({
      siteKey,
      action: 'content.contract',
      params: { operation: 'demoTrim.apply', apply_id: 'dtrim-seed', request_id: requestId }
    })
    const a = answer && typeof answer === 'object' ? answer : {}
    if (a.ok === false) {
      const words = doorWords(a, 'demoTrim.apply was refused')
      if (NO_DOOR.test(words) || NO_DOOR.test(String(a.error ?? ''))) return { status: 'none', words }
      throw new Error(words)
    }
    last = a
    if (a.status === 'completed' || a.status === 'complete') {
      log(
        `demo trim: ${a.alreadyTrimmed ? 'already hidden' : `${a.hidden ?? '?'} demo post(s) hidden`}${a.skipped ? `, ${a.skipped} customer-edited row(s) left` : ''}`
      )
      return {
        status: 'completed',
        hidden: a.hidden ?? 0,
        skipped: a.skipped ?? 0,
        alreadyTrimmed: !!a.alreadyTrimmed
      }
    }
  }
  throw new Error(`demo trim did not finish in 20 calls (last status ${last?.status ?? '?'})`)
}

/** `de-de` → the edition slug `de`; `en-us` → the source; null when the archive ships no such edition. */
export function editionFor(editions, tag) {
  if (!editions?.locales) return null
  const t = String(tag ?? '').toLowerCase()
  if (!t) return null
  const exact = Object.entries(editions.locales).find(([, l]) => l.tag === t)
  if (exact) return exact[0]
  const primary = t.split('-')[0]
  const bySlug = editions.locales[primary] ? primary : null
  if (bySlug) return bySlug
  const byPrimary = Object.entries(editions.locales).find(([, l]) => l.tag.split('-')[0] === primary)
  return byPrimary ? byPrimary[0] : null
}

/**
 * The editions a build writes: the source first, then every chosen language the archive ships,
 * each once. Languages the archive does not ship are reported, never silently dropped.
 * @param {object} editions
 * @param {string[]} languages BCP-47 tags as the form spelled them
 */
export function chosenEditions(editions, languages) {
  const source = editions?.source?.language ?? 'en'
  const out = [{ slug: source, tag: editions?.source?.tag ?? 'en-us', source: true }]
  const unknown = []
  for (const tag of languages ?? []) {
    const slug = editionFor(editions, tag)
    if (!slug) {
      unknown.push(tag)
      continue
    }
    if (out.some((e) => e.slug === slug)) continue
    out.push({ slug, tag: editions.locales[slug].tag, source: false })
  }
  return { editions: out, unknown }
}

/** The text a named block holds — the inverse of `setBlockValue` for `content`/`text`, the href for `url`. */
export function getBlockValue(markup, name, attr = 'content') {
  const open = new RegExp(
    `<!-- wp:([a-z0-9-]+/)?([a-z0-9-]+) (\\{[^\\n]*"name":"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^\\n]*\\}) -->`
  )
  const found = open.exec(markup)
  if (!found) return null
  const block = found[2]
  const start = found.index + found[0].length
  const end = markup.indexOf(`<!-- /wp:${found[1] ?? ''}${block} -->`, start)
  if (end === -1) return null
  const inner = markup.slice(start, end)
  if (attr === 'url') return /href="([^"]*)"/.exec(inner)?.[1] ?? null
  const text =
    block === 'button'
      ? /<a\b[^>]*>([\s\S]*?)<\/a>/.exec(inner)?.[1]
      : /^\s*<[a-z0-9]+\b[^>]*>([\s\S]*?)<\/[a-z0-9]+>\s*$/.exec(inner)?.[1]
  if (typeof text !== 'string') return null
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

/**
 * The options Polylang serves through its per-language string translations rather than the
 * option row — the same list as the Claude Cowork plugin's `QuickstartContract::TRANSLATED_OPTIONS`.
 */
export const TRANSLATED_OPTIONS = ['blogname', 'blogdescription']

/** @param {{kind?: string, identity?: {name?: string}}} entity */
export function isTranslatedOption(entity) {
  return entity?.kind === 'option' && TRANSLATED_OPTIONS.includes(String(entity.identity?.name ?? ''))
}

/**
 * The content map as one edition sees it: every page entity re-addressed to the edition's copy,
 * its language the edition's tag, and each slot's sample the words that copy holds today. Slots
 * whose block the copy lacks are listed in `missing` (the `ru` edition lacks 15) and left out.
 * @param {(id: number) => Promise<string|null>} readContent
 */
export async function editionContentMap(contentMap, editions, slug, readContent) {
  const edition = editions.locales[slug]
  const source = editions.source.language
  // The source pass plans the map as shipped: options included, English samples.
  if (slug === source) return { contentMap, missing: [] }
  const entities = []
  const slots = []
  const missing = []
  const contents = new Map()
  for (const entity of contentMap.entities) {
    if (entity.kind === 'option') {
      // Options are site-wide: written once, from the source pass — except the two Polylang
      // serves per language (site title, tagline): each edition plans its own words for those,
      // written as `<edition>::<slot>` (Claude Cowork plugin 0.13.6+). Without this, `/vi/` kept the
      // archive's "Northgate" while `/` showed the Vietnamese tagline (measured 25/09/2026).
      if (isTranslatedOption(entity))
        entities.push({ ...entity, identity: { ...entity.identity, language: edition.tag } })
      continue
    }
    const id = edition.ids[entity.key]
    if (!id) {
      missing.push(`${entity.key}:*`)
      continue
    }
    const content = slug === source ? null : await readContent(id)
    if (slug !== source && typeof content !== 'string') {
      missing.push(`${entity.key}:unreadable`)
      continue
    }
    contents.set(entity.key, content)
    entities.push({ ...entity, identity: { ...entity.identity, language: edition.tag, id } })
  }
  const known = new Set(entities.map((e) => e.key))
  for (const slot of contentMap.slots) {
    if (!known.has(slot.entity)) continue
    if (slug === source) {
      slots.push(slot)
      continue
    }
    if (slot.target?.option) {
      // A field of an option has no edition; the option's own value does (site.name, site.tagline).
      if (slot.target.field === undefined) slots.push(slot)
      continue
    }
    // A block found by position (`wordpress-block-address.mjs`) is read in the edition's copy the same way.
    const located = byPosition(slot.target) || (slot.target?.block && slot.target.field !== undefined)
    const sample = located
      ? readSlotValue(contents.get(slot.entity), slot.target)
      : slot.target?.block
        ? getBlockValue(contents.get(slot.entity), slot.target.block, slot.target.attr ?? 'content')
        : slot.sample
    if ((slot.target?.block || located) && sample === null) {
      missing.push(
        `${slot.entity}:${slot.target.block ?? `${slot.target.blockType}.${slot.target.occurrence}`}`
      )
      continue
    }
    slots.push({ ...slot, sample: sample ?? slot.sample })
  }
  return { contentMap: { ...contentMap, entities, slots }, missing }
}

/**
 * Write every planned value through ONE content revision of a bound site. Options and blocks
 * alike are scalar changes keyed by slot (`<edition>::<slot>` for a copy); the Claude Cowork plugin does the
 * block surgery with the same `setBlockValue` the seeder used to do, and records the receipt.
 * @param {{ apply: any, siteKey: string, state: any, writes: Array<{slot: string, value: string, locale?: string}>, source: string, log?: (s: string) => void }} input
 */
export async function applyWordPressThroughContract({
  apply,
  siteKey,
  state,
  writes,
  source,
  slots = new Map(),
  log = () => {}
}) {
  const changes = {}
  const skipped = []
  for (const w of writes) {
    const key = w.locale && w.locale !== source ? `${w.locale}::${w.slot}` : w.slot
    const slot = slots.get(w.slot)
    const clean = contractValue(w.value, slot)
    if (clean === null) {
      skipped.push({ slot: key, reason: 'empty after removing markup and control characters' })
      continue
    }
    changes[key] = clean
  }
  let keys = Object.keys(changes)
  if (!keys.length) return { written: [], skipped, receipt: null, unchanged: true }
  if (keys.length > 1500) throw new Error('Review at most 1500 scalar slots in one content revision')
  // The Claude Cowork plugin refuses a whole apply for ONE bad value and names the slot; rather than lose the
  // other hundreds, the named slot is set aside and the apply is sent again — at most three times,
  // so a Claude Cowork plugin that names nothing usable still ends in its own sentence.
  let a = {}
  let applyId = ''
  let requestId = ''
  for (let round = 0; round < 4; round++) {
    requestId = createHash('sha256')
      .update(JSON.stringify({ siteKey, contract: state.contract, revision: state.revision, changes }))
      .digest('hex')
    applyId = `contract-${requestId.slice(0, 48)}`
    const answer = await apply({
      siteKey,
      action: 'content.contract',
      params: {
        operation: 'apply',
        expected_revision: state.revision,
        apply_id: applyId,
        request_id: requestId,
        changes: { ...changes }
      }
    })
    a = answer && typeof answer === 'object' ? answer : {}
    if (a.ok !== false) break
    const words = doorWords(a, 'content.contract apply was refused')
    const named = keys.find((k) => words.includes(k))
    if (!named || round === 3) throw new Error(words)
    delete changes[named]
    keys = Object.keys(changes)
    skipped.push({ slot: named, reason: words })
    log(`contract: ${named} set aside — ${words}`)
    if (!keys.length) return { written: [], skipped, receipt: null, unchanged: true }
  }
  const written = keys.map((k) => ({ slot: k }))
  log(
    `contract ${state.contract}: ${written.length} slot(s) written in revision ${String(a.afterRevision ?? a.revision ?? '?').slice(0, 12)} (apply ${applyId.slice(0, 24)}…)`
  )
  return {
    written,
    skipped,
    receipt: {
      applyId,
      requestId,
      revision: state.revision,
      afterRevision: a.afterRevision ?? a.revision ?? null,
      unchanged: a.unchanged === true
    },
    unchanged: a.unchanged === true
  }
}

/**
 * What the contract accepts as content: no markup, no control characters, within the slot's
 * budget. A model answer with a line break or an angle bracket would otherwise refuse the whole
 * revision; the sentence is kept, the characters the contract forbids are not.
 */
export function contractValue(value, slot) {
  // The word "null" is a model saying nothing, and an entity is the character it stands for: the Claude Cowork plugin
  // escapes what it is given, so "&amp;" sent as text showed as "&amp;" on the page (tamq-7q-bizwp4, 08/10/2026).
  if (isNoValue(value)) return null
  let v = plainText(String(value ?? ''))
    .replace(/[<>]/g, '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the contract refuses control characters; this is the strip
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  const max = Number(slot?.maxCharacters ?? 0)
  if (max > 0 && v.length > max) v = `${v.slice(0, max - 1).trimEnd()}…`
  return v === '' ? null : v
}

/**
 * Hide every shipped edition the customer did not choose (`multilingual.retire`, plugin 0.13.0+):
 * the Claude Cowork plugin drafts the pages, posts and menus of the other editions and drops them from the
 * switcher and hreflang. One apply id for the whole pass (`mlang-…`), repeated until `completed`.
 * A Claude Cowork plugin without the operation leaves the site as shipped and says so; a site with one language (no
 * translation plugin) has nothing to hide and answers `single`.
 * @param {{ apply: any, siteKey: string, keep: string[], log?: (s: string) => void }} input
 */
export async function retireWordPressOthers({ apply, siteKey, keep, onRecord = null, log = () => {} }) {
  // A site whose editions are already retired holds ONE receipt; the door refuses a second
  // (`Editions are already retired under mlang-…`). A rebuild that adds a language (`language.add`,
  // measured 25/09/2026 on `wpbgisvlr`: seed failed) reuses that receipt: under the same apply id an
  // edition kept again comes back and the rest stay retired, without a restore in between.
  const applyId =
    typeof onRecord === 'string' && onRecord.startsWith('mlang-')
      ? onRecord
      : `mlang-build-${Date.now().toString(36)}`
  if (applyId === onRecord) log(`languages: reusing the retire receipt ${applyId}`)
  let last = null
  for (let i = 0; i < 100; i++) {
    const answer = await apply({
      siteKey,
      action: 'content.contract',
      params: { operation: 'multilingual.retire', keep, apply_id: applyId, request_id: `${applyId}-${i}` }
    })
    const a = answer && typeof answer === 'object' ? answer : {}
    if (a.ok === false) {
      const words = doorWords(a, 'multilingual.retire was refused')
      if (oneLanguage(a)) return { status: 'single', words }
      if (
        NO_DOOR.test(words) ||
        NO_DOOR.test(String(a.error ?? '')) ||
        /unknown (multilingual|contract) operation/i.test(words)
      )
        return { status: 'none', words }
      throw new Error(words)
    }
    last = a
    if (a.status === 'completed' || a.status === 'complete') {
      log(`languages: ${(a.retired ?? []).length} edition(s) hidden, live: ${(a.live ?? keep).join(', ')}`)
      return { status: 'completed', retired: a.retired ?? [], live: a.live ?? keep, applyId }
    }
  }
  throw new Error(
    `hiding the other languages did not finish in 100 calls (last status ${last?.status ?? '?'})`
  )
}

const ENGLISH_VARIANTS = new Set(['en-us', 'en-gb', 'en-au', 'en-ca', 'en-nz'])

/**
 * Call the source edition by the English variant the customer chose (`sourceLanguage.set`, a
 * relabel of `en_US` to `en_GB`…), or say it is a no-op. Only a variant of English is a relabel;
 * anything else is another edition and is handled by the passes above.
 * @param {{ apply: any, siteKey: string, languages: string[], log?: (s: string) => void }} input
 */
export async function relabelWordPressSource({ apply, siteKey, languages, log = () => {} }) {
  const variant = (languages ?? [])
    .map((l) => String(l).toLowerCase())
    .find((l) => ENGLISH_VARIANTS.has(l) && l !== 'en-us')
  if (!variant) return { status: 'none', locale: 'en_US' }
  const locale = `en_${variant.split('-')[1].toUpperCase()}`
  const applyId = `srclang-build-${Date.now().toString(36)}`
  const answer = await apply({
    siteKey,
    action: 'content.contract',
    params: { operation: 'sourceLanguage.set', locale, apply_id: applyId, request_id: applyId }
  })
  const a = answer && typeof answer === 'object' ? answer : {}
  if (a.ok === false) {
    const words = doorWords(a, 'sourceLanguage.set was refused')
    if (oneLanguage(a)) return { status: 'single', locale: 'en_US', words }
    if (NO_DOOR.test(words) || NO_DOOR.test(String(a.error ?? '')))
      return { status: 'none', locale: 'en_US', words }
    throw new Error(words)
  }
  log(a.alreadySet ? `source language: already ${locale}` : `source language: relabelled to ${locale}`)
  return { status: a.alreadySet ? 'already' : 'set', locale, applyId }
}

/**
 * Make the customer's first chosen language the site's default (`siteLanguage.set`, plugin
 * 0.13.1+): `/` then serves that edition and `<html lang>` says it, the way a `vi` Joomla site does.
 * A no-op when the first chosen language is the source; an older Claude Cowork plugin says so.
 * @param {{ apply: any, siteKey: string, language: string, source: string, log?: (s: string) => void }} input
 */
export async function setWordPressSiteLanguage({ apply, siteKey, language, source, log = () => {} }) {
  if (!language || language === source) return { status: 'none', language: source }
  const applyId = `slang-build-${Date.now().toString(36)}`
  const answer = await apply({
    siteKey,
    action: 'content.contract',
    params: { operation: 'siteLanguage.set', language, apply_id: applyId, request_id: applyId }
  })
  const a = answer && typeof answer === 'object' ? answer : {}
  if (a.ok === false) {
    const words = doorWords(a, 'siteLanguage.set was refused')
    if (oneLanguage(a)) return { status: 'single', language: source, words }
    if (
      NO_DOOR.test(words) ||
      NO_DOOR.test(String(a.error ?? '')) ||
      /unknown (siteLanguage|contract) operation/i.test(words)
    )
      return { status: 'none', language: source, words }
    throw new Error(words)
  }
  log(
    a.alreadySet
      ? `site language: already ${a.language ?? language}`
      : `site language: ${a.language ?? language} is the default now (was ${a.from ?? source})`
  )
  return { status: a.alreadySet ? 'already' : 'set', language: a.language ?? language, applyId }
}

/**
 * Make WordPress itself speak the one language a site is written in (TCH #1013, T13): its core translation installed
 * (`language.install`, plugin 0.11.0+, through `doorOps().installLocale`) and the option `WPLANG` set, so `<html lang>`,
 * dates and WordPress's own words follow on a site without Polylang. On a Polylang site the source language's own locale
 * still decides the front end; only an English variant can be respelled there (`relabelWordPressSource`).
 *
 * Nothing here fails a build: a plugin older than the action, a translation WordPress will not fetch or a refused option
 * is a warning, said in the door's own words, and WPLANG is still set when only the download failed.
 * @param {{ apply: any, siteKey: string, language: string, applyId: string }} input - `language` as the questionnaire
 *   spells it (`vi-vn`, `en-gb`)
 * 🔒 WHAT FOLLOWS THE LANGUAGE IS SAID (plugin after 0.18.7, round g60): `language.install` answers `follow` — the Contact
 * Form 7 forms whose locale it set, the date and time formats it gave the site, and what it could not change — and the
 * caller puts the formats and the failures in the build report. An older plugin answers no `follow`: null.
 * @returns {Promise<{ status: 'set' | 'partial' | 'none', locale: string | null, warnings: string[], follow?: Record<string, unknown> | null }>}
 */
export async function setWordPressLocale({ apply, siteKey, language, applyId }) {
  /** @type {string[]} */
  const warnings = []
  let locale
  try {
    // Loaded here, not at the top: the catalogue is one step of a brief, and a catalogue that cannot
    // be read (#1019: the image did not carry it) must cost this step only, never the whole door.
    const { wpLocaleFor } = await import('./wordpress-language-catalog.mjs')
    locale = wpLocaleFor(language)
  } catch (error) {
    warnings.push(
      `WordPress could not be told to speak ${language}: ${error instanceof Error ? error.message : error}`
    )
    return { status: 'none', locale: null, warnings }
  }
  const ops = doorOps({ apply, siteKey, applyId })
  /** @type {Record<string, unknown> | null} */
  let follow = null
  // Installed BEFORE WPLANG: the plugin reads the language's own date and time formats from the installed translation.
  if (locale !== 'en_US')
    try {
      const installed = /** @type {any} */ (await ops.installLocale(locale))
      if (installed?.follow && typeof installed.follow === 'object') follow = installed.follow
    } catch (error) {
      warnings.push(
        `the ${locale} translation of WordPress was not installed: ${error instanceof Error ? error.message : error}`
      )
    }
  const answer = await apply({
    siteKey,
    action: 'content.update',
    params: { apply_id: applyId, kind: 'option', id: 0, key: 'WPLANG', fields: { value: locale } }
  })
  if (answer && typeof answer === 'object' && answer.ok === false) {
    warnings.push(
      `the site language could not be set to ${locale}: ${doorWords(answer, 'WPLANG was refused')}`
    )
    return { status: 'none', locale, warnings, follow }
  }
  // 🔒 POLYLANG DOES NOT READ WPLANG ON THE FRONT END. It prints the source edition's own locale, so a Tracy Business
  // site written in Vietnamese said <html lang="en-US"> (bizwp3, 08/10/2026). The Claude Cowork plugin (0.18.3+,
  // `SourceLocaleHooks`) makes the source edition speak this option; a site without Polylang, or an older plugin,
  // ignores it. Under the same apply id, so the undo takes it back with WPLANG.
  const source = await apply({
    siteKey,
    action: 'content.update',
    params: {
      apply_id: applyId,
      kind: 'option',
      id: 0,
      key: 'tracy_source_locale',
      fields: { value: locale }
    }
  })
  if (source && typeof source === 'object' && source.ok === false)
    warnings.push(
      `the source edition could not be told it is written in ${locale}: ${doorWords(source, 'tracy_source_locale was refused')}`
    )
  return { status: warnings.length > 0 ? 'partial' : 'set', locale, warnings, follow }
}

export { setBlockValue }
