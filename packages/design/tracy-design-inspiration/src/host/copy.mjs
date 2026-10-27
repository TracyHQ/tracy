/**
 * The copy file of one inspiration, version 2 (spec §4h decision 5): `docs/agents/design-copy/<id>.json`
 * holds, PER CHIP of the dialog (a real page's path, or an artifact kind such as `form`), the content
 * versions written for it — by the agent in step 2 (`kind: 'rewritten'`) or by the model the dialog
 * calls from the host (`kind: 'llm'`) — plus which version the customer last chose and the prompt the
 * next "More version" opens with. The two built-in versions (the site's own words cut to fit, the
 * author's text) are never stored: the client draws them from the fixture and the site file.
 *
 * Pure: no filesystem, no model. `test/copy.test.mjs` pins every rule, and `index.ts` only carries
 * the answers to disk and to the model.
 */

import { ARTIFACT_TYPES, PAGE_TYPES, measure, slotLimits, validCopy } from './gallery.mjs'
import { DEFAULT_PROMPTS } from './prompts.mjs'

export { DEFAULT_PROMPTS }

export const COPY_SCHEMA = 'tracy-design-copy/v2'
const COPY_SCHEMA_V1 = 'tracy-design-copy/v1'

/** Version titles the built-in slots use; the agent's version keeps this one unless it names its take. */
export const REWRITTEN_TITLE = 'Rewritten'

/**
 * @typedef {{ id: string, role: string, words: number, chars: number, text: string, inNav?: boolean }} Slot
 * @typedef {{ id: string, title: string, kind: 'rewritten' | 'llm', prompt: string | null, slots: Record<string, string>, at: string, model: string | null, trimmed?: string[], usage?: { inputTokens: number, outputTokens: number } }} Version
 * @typedef {{ versions: Version[], selected: string | null, nextPrompt: string | null }} ChipCopy
 * @typedef {{ schemaVersion: string, system: string, writtenAt: string, lang: string, brief: { goal: string, voice: string } | null, pages: Record<string, ChipCopy> }} CopyFile
 */

/** A chip drawn on the brand's own landing artifact (§4h decision 8): `<siteKey>_landing`. */
const BRAND_LANDING = /^[a-z0-9][a-z0-9.-]*_landing$/i

/**
 * What a chip is drawn on, and so which slot map its text must fit: an artifact of the inspiration, or
 * the inspiration's fixture with the page's kind. Unknown chips are refused — a version stored under a
 * chip no one draws is invisible, which is worse than an error.
 *
 * @param {string} chip - a real page's path (`/`, `/about/`), an artifact kind, or `<siteKey>_landing`.
 * @param {{ path?: unknown, type?: unknown }[]} sitePages - `pages` of `design-preview.json`.
 * @returns {{ artifact: string, kind: string } | { fixture: true, kind: string } | null}
 */
export function chipLayout(chip, sitePages) {
  if (typeof chip !== 'string' || chip === '') return null
  if (ARTIFACT_TYPES.includes(chip)) return { artifact: chip, kind: chip }
  if (BRAND_LANDING.test(chip)) return { artifact: 'landing', kind: 'landing' }
  if (!chip.startsWith('/')) return null
  // `/pricing` and `/pricing/` are the same page: an agent typed the first on lucaswp (06/09), got
  // "no such chip", and went on to edit the live template instead.
  const page = sitePages.find((p) => typeof p.path === 'string' && samePath(p.path, chip))
  if (!page) return null
  const kind = typeof page.type === 'string' && PAGE_TYPES.includes(page.type) ? page.type : 'home'
  return { fixture: true, kind }
}

/** @param {string} a @param {string} b */
function samePath(a, b) {
  const norm = (/** @type {string} */ p) => (p.length > 1 ? p.replace(/\/+$/, '') : p)
  return norm(a) === norm(b)
}

/** The chip key a page path stores under: the site file's own spelling of it. @param {string} chip @param {{ path?: unknown }[]} sitePages */
export function canonicalChip(chip, sitePages) {
  if (!chip.startsWith('/')) return chip
  const page = sitePages.find((p) => typeof p.path === 'string' && samePath(p.path, chip))
  return page ? /** @type {string} */ (page.path) : chip
}

/** @param {string} kind */
export function promptFor(kind) {
  return DEFAULT_PROMPTS[/** @type {keyof typeof DEFAULT_PROMPTS} */ (kind)] ?? DEFAULT_PROMPTS.home
}

/** An empty file for an inspiration that has no copy yet. @param {string} id @param {string} [lang] */
export function emptyCopy(id, lang = 'en') {
  return /** @type {CopyFile} */ ({
    schemaVersion: COPY_SCHEMA,
    system: id,
    writtenAt: '',
    lang,
    brief: null,
    pages: {}
  })
}

/** @param {unknown} v @returns {v is Record<string, string>} */
function isSlotMap(v) {
  return (
    !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((t) => typeof t === 'string')
  )
}

/**
 * Read a copy file of either schema into the v2 shape, or `null` when it is not a copy file of this
 * inspiration. A v1 file (one slot map for the whole inspiration, plus generated pages) becomes: its
 * inspiration copy → a `rewritten` version on the home chip `/`; each generated page → a `rewritten`
 * version titled by its label on the chip it was drawn on (its artifact kind, or `/` for a fixture
 * page). Nothing the agent wrote is lost; it just gains an address.
 *
 * @param {unknown} parsed
 * @param {string} id
 * @returns {CopyFile | null}
 */
export function normalizeCopy(parsed, id) {
  const p = /** @type {Record<string, unknown> | null} */ (
    parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  )
  if (!p || p.system !== id) return null
  const lang = typeof p.lang === 'string' ? p.lang : 'en'
  const brief =
    p.brief && typeof p.brief === 'object'
      ? {
          goal: String(/** @type {any} */ (p.brief).goal ?? ''),
          voice: String(/** @type {any} */ (p.brief).voice ?? '')
        }
      : null
  const writtenAt = typeof p.writtenAt === 'string' ? p.writtenAt : ''
  const file = { ...emptyCopy(id, lang), writtenAt, brief }
  if (p.schemaVersion === COPY_SCHEMA) {
    const pages = /** @type {Record<string, unknown>} */ (
      p.pages && typeof p.pages === 'object' && !Array.isArray(p.pages) ? p.pages : {}
    )
    for (const [chip, raw] of Object.entries(pages)) {
      const c = /** @type {Record<string, unknown> | null} */ (raw && typeof raw === 'object' ? raw : null)
      if (!c) continue
      const versions = (Array.isArray(c.versions) ? c.versions : []).filter(isVersion)
      const selected = typeof c.selected === 'string' ? c.selected : null
      file.pages[chip] = {
        versions,
        selected:
          selected !== null &&
          (BUILTIN_VERSIONS.includes(selected) || versions.some((v) => v.id === selected))
            ? selected
            : null,
        nextPrompt: typeof c.nextPrompt === 'string' && c.nextPrompt.trim() !== '' ? c.nextPrompt : null
      }
    }
    return file
  }
  if (p.schemaVersion !== COPY_SCHEMA_V1) return null
  const at = writtenAt || new Date(0).toISOString()
  if (isSlotMap(p.slots) && Object.keys(p.slots).length > 0) {
    chipOf(file, '/').versions.push({
      id: 'v1-direction',
      title: REWRITTEN_TITLE,
      kind: 'rewritten',
      prompt: brief ? briefText(brief) : null,
      slots: p.slots,
      at,
      model: null
    })
  }
  for (const raw of Array.isArray(p.pages) ? p.pages : []) {
    const g = /** @type {Record<string, unknown> | null} */ (raw && typeof raw === 'object' ? raw : null)
    if (!g || !isSlotMap(g.slots) || typeof g.type !== 'string') continue
    const chip = ARTIFACT_TYPES.includes(g.type) ? g.type : '/'
    const gb = g.brief && typeof g.brief === 'object' ? /** @type {any} */ (g.brief) : null
    chipOf(file, chip).versions.push({
      id: typeof g.id === 'string' && g.id !== '' ? `v1-${g.id}` : `v1-${chipOf(file, chip).versions.length}`,
      title: typeof g.label === 'string' && g.label.trim() !== '' ? g.label.trim() : REWRITTEN_TITLE,
      kind: 'rewritten',
      prompt: gb ? briefText({ goal: String(gb.goal ?? ''), voice: String(gb.voice ?? '') }) : null,
      slots: g.slots,
      at,
      model: null
    })
  }
  return file
}

/** @param {{ goal: string, voice: string }} b */
function briefText(b) {
  return [b.goal, b.voice].filter((s) => s.trim() !== '').join(' — ') || null
}

/** @param {unknown} v @returns {v is Version} */
function isVersion(v) {
  const x = /** @type {Record<string, unknown> | null} */ (v && typeof v === 'object' ? v : null)
  return (
    !!x &&
    typeof x.id === 'string' &&
    x.id !== '' &&
    typeof x.title === 'string' &&
    (x.kind === 'rewritten' || x.kind === 'llm') &&
    isSlotMap(x.slots)
  )
}

/**
 * The chip's record, created on first use.
 * @param {CopyFile} file
 * @param {string} chip
 */
export function chipOf(file, chip) {
  file.pages[chip] ??= { versions: [], selected: null, nextPrompt: null }
  return file.pages[chip]
}

/** A version id that sorts by time and cannot collide within a process. */
export function versionId() {
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Put a version on a chip: appended, selected (§4h decision 3), the file's clock advanced.
 * @param {CopyFile} file
 * @param {string} chip
 * @param {Version} version
 * @param {string | null} [nextPrompt]
 */
export function addVersion(file, chip, version, nextPrompt = undefined) {
  const c = chipOf(file, chip)
  c.versions = [...c.versions.filter((v) => v.id !== version.id), version]
  c.selected = version.id
  if (nextPrompt !== undefined) c.nextPrompt = nextPrompt
  file.writtenAt = version.at
  return c
}

/**
 * Forget a version. When it was the selected one the chip falls back to its built-ins (the client
 * shows the site's own words). `false` when the chip or version is unknown.
 * @param {CopyFile} file
 * @param {string} chip
 * @param {string} vid
 */
export function removeVersion(file, chip, vid) {
  const c = file.pages[chip]
  if (!c) return false
  const before = c.versions.length
  c.versions = c.versions.filter((v) => v.id !== vid)
  if (c.versions.length === before) return false
  if (c.selected === vid) c.selected = null
  file.writtenAt = new Date().toISOString()
  return true
}

/** The built-in versions a `selected` may name besides a stored version id. */
export const BUILTIN_VERSIONS = Object.freeze(['yours', 'default'])

/**
 * Remember the customer's choice on a chip: a stored version id, or one of the built-ins.
 * @param {CopyFile} file
 * @param {string} chip
 * @param {unknown} selected
 * @returns {boolean}
 */
export function selectVersion(file, chip, selected) {
  if (typeof selected !== 'string') return false
  const c = chipOf(file, chip)
  if (!BUILTIN_VERSIONS.includes(selected) && !c.versions.some((v) => v.id === selected)) return false
  c.selected = selected
  return true
}

/** What the customer may ask for, trimmed to what a model call should carry. */
const MAX_PROMPT = 1200

/**
 * Validate the body of `POST copy/<id>/pages/<chip>/versions`: an optional prompt, else the chip's
 * next prompt, else the kind's default.
 * @param {unknown} body
 * @param {ChipCopy | undefined} chip
 * @param {string} kind
 * @returns {{ ok: true, prompt: string } | { ok: false, error: string }}
 */
export function promptOf(body, chip, kind) {
  const b = /** @type {Record<string, unknown> | null} */ (body && typeof body === 'object' ? body : null)
  const given = typeof b?.prompt === 'string' ? b.prompt.trim() : ''
  if (given.length > MAX_PROMPT) return { ok: false, error: `prompt is over ${MAX_PROMPT} characters` }
  return { ok: true, prompt: given !== '' ? given : (chip?.nextPrompt ?? promptFor(kind)) }
}

const SYSTEM_PROMPT = [
  'You write website copy that must fit a fixed layout. You are given the kind of page, facts about the site,',
  'the current text of every slot, and for each slot a maximum length in words or characters.',
  'Reply with ONE JSON object and nothing else, no prose, no code fence:',
  '{"title": "...", "nextPrompt": "...", "slots": {"<slot id>": "<text>", ...}}',
  '- title: two to four words naming this take, in the language of the site (e.g. "Bolder claims").',
  '- nextPrompt: two or three sentences, in the language of the site, suggesting a DIFFERENT take for the next',
  '  version of this same page. Speak as the customer would ask; never mention slots, ids, JSON or lengths;',
  '  do not repeat the direction you just took.',
  '- slots: one text per slot id, in the language of the site, NEVER over the maximum. Keep the role of each',
  '  slot (a button stays a button, a number stays a number). Invent freely from the facts of the site —',
  '  numbers, names, quotes, claims; the only hard rule is length. A slot you leave out keeps its current text.'
].join('\n')

/** How much of the site file the model sees, in characters of JSON. */
const MAX_FACTS = 6000

/**
 * The two halves of the model call for one take (§4h decision 6): the fixed part Tracy owns (page
 * kind, slots and their limits, the site's facts, the current text) and the customer's ask. A
 * customer prompt about something else still yields this page with these slots.
 *
 * @param {{ kind: string, chip: string, prompt: string, slots: Slot[], current: Record<string, string>, site: Record<string, unknown> | null, lang: string, factsOnly?: boolean }} o
 * @returns {{ system: string, user: string }}
 */
export function buildCopyPrompt(o) {
  const lines = []
  lines.push(
    `Page kind: ${o.kind}${o.chip.startsWith('/') ? ` (the site's page at ${o.chip})` : ' (a sample product of the design template)'}.`
  )
  lines.push(`Language of the site: ${o.lang}.`)
  const facts = siteFacts(o.site, o.chip)
  if (facts !== null) {
    lines.push('', 'Facts about the site (JSON):', facts)
  }
  lines.push('', 'Slots, with the maximum each allows and its current text:')
  for (const s of o.slots) {
    if (s.inNav) continue
    const lim = slotLimits(s)
    const current = o.current[s.id] ?? s.text
    lines.push(`- ${s.id} [${s.role}, max ${lim.max} ${lim.unit}]: ${JSON.stringify(current)}`)
  }
  lines.push('', 'What the customer asked for this take:', o.prompt)
  const system = o.factsOnly
    ? SYSTEM_PROMPT.replace(
        'Invent freely from the facts of the site —\n  numbers, names, quotes, claims; the only hard rule is length. A slot you leave out keeps its current text.',
        'Use only facts supplied in the customer brief. Existing slot text is sample layout content, not facts.\n' +
          'Rewrite every slot. Do not invent or retain sample names, reviews, ratings, prices, statistics, opening hours, addresses or email.\n' +
          'The latest brief replaces all earlier facts. Keep only contact details explicitly supplied in this brief.\n' +
          'For unsupported proof or numeric slots use a neutral label without a factual claim; never fabricate a customer quote.'
      )
    : SYSTEM_PROMPT
  return { system, user: lines.join('\n') }
}

/**
 * The site file trimmed to what the model can use: the site block, the page list, and the data of the
 * page the chip names. Capped so a long site never blows the prompt.
 * @param {Record<string, unknown> | null} site
 * @param {string} chip
 */
function siteFacts(site, chip) {
  if (!site) return null
  const pages = Array.isArray(site.pages) ? /** @type {Record<string, unknown>[]} */ (site.pages) : []
  const page = pages.find((p) => p.path === chip) ?? null
  const out = {
    site: site.site ?? null,
    pages: pages.map((p) => ({ path: p.path, type: p.type, label: p.label })),
    page: page ? { path: page.path, type: page.type, label: page.label, data: page.data ?? null } : null
  }
  let json = JSON.stringify(out, null, 1)
  if (json.length > MAX_FACTS) json = `${json.slice(0, MAX_FACTS)}\n…(cut)`
  return json
}

/**
 * Cut a text to a slot's ceiling at a word boundary — the model went over, and a page that overflows
 * is worse than one that ends a word early.
 * @param {string} text
 * @param {Slot} slot
 */
export function clampToSlot(text, slot) {
  const lim = slotLimits(slot)
  const clean = text.trim().replace(/\s+/g, ' ')
  if (measure(clean, lim.unit) <= lim.max) return clean
  const words = clean.split(' ')
  if (lim.unit === 'words') return words.slice(0, lim.max).join(' ')
  let out = ''
  for (const w of words) {
    const next = out === '' ? w : `${out} ${w}`
    if (next.length > lim.max) break
    out = next
  }
  return out === '' ? clean.slice(0, lim.max) : out
}

const MAX_TITLE = 40
const MAX_NEXT = 600

/**
 * The second, short ask when the first answer went over on some slots (measured on lucaswp 06/09: a
 * headline cut to "One desk for every" reads like a broken sentence). Only those slots, with what the
 * model wrote and the ceiling each has; the answer is read by `parseModelCopy` again and what is still
 * over is cut — the cut is the last resort, not the rule.
 * @param {Record<string, string>} over - slot id → the over-long text.
 * @param {Slot[]} slots
 * @param {string} lang
 * @returns {{ system: string, user: string }}
 */
export function buildShortenPrompt(over, slots, lang) {
  const known = new Map(slots.map((s) => [s.id, s]))
  const lines = [
    `Some of your texts are over the maximum their slot allows. Rewrite ONLY these, in ${lang}, keeping the meaning and the voice, each within its maximum. Reply with ONE JSON object and nothing else: {"slots": {"<slot id>": "<text>", ...}}.`,
    ''
  ]
  for (const [id, text] of Object.entries(over)) {
    const slot = known.get(id)
    if (!slot) continue
    const lim = slotLimits(slot)
    lines.push(
      `- ${id} [${slot.role}, max ${lim.max} ${lim.unit}, you wrote ${measure(text, lim.unit)}]: ${JSON.stringify(text)}`
    )
  }
  return { system: SYSTEM_PROMPT, user: lines.join('\n') }
}

/**
 * Read the model's answer: the first JSON object in it (models wrap in fences or add a sentence),
 * a title, a next prompt, and one text per known slot — over-long texts cut to the ceiling and named
 * in `trimmed`, unknown ids dropped, empty texts dropped.
 *
 * @param {string} text - everything the model streamed.
 * @param {Slot[]} slots - the chip's slot map.
 * @returns {{ ok: true, title: string, nextPrompt: string | null, slots: Record<string, string>, trimmed: string[], over: Record<string, string> } | { ok: false, error: string }}
 */
export function parseModelCopy(text, slots) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return { ok: false, error: 'The model answered without a JSON object.' }
  /** @type {Record<string, unknown>} */
  let obj
  try {
    obj = JSON.parse(text.slice(start, end + 1))
  } catch {
    return {
      ok: false,
      error: 'The model answered with JSON that does not parse (it may have run out of room).'
    }
  }
  const raw = obj.slots
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, error: 'The model answered without slots.' }
  const known = new Map(slots.map((s) => [s.id, s]))
  /** @type {Record<string, string>} */
  const out = {}
  /** @type {string[]} */
  const trimmed = []
  /** @type {Record<string, string>} */
  const over = {}
  for (const [id, value] of Object.entries(/** @type {Record<string, unknown>} */ (raw))) {
    const slot = known.get(id)
    if (!slot || typeof value !== 'string' || value.trim() === '') continue
    const clean = value.trim().replace(/\s+/g, ' ')
    const clamped = clampToSlot(clean, slot)
    if (clamped !== clean) {
      trimmed.push(id)
      over[id] = clean
    }
    out[id] = clamped
  }
  if (Object.keys(out).length === 0)
    return { ok: false, error: 'The model wrote nothing for the slots of this page.' }
  const title =
    typeof obj.title === 'string' && obj.title.trim() !== ''
      ? obj.title.trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE)
      : 'New take'
  const nextPrompt =
    typeof obj.nextPrompt === 'string' && obj.nextPrompt.trim() !== ''
      ? obj.nextPrompt.trim().replace(/\s+/g, ' ').slice(0, MAX_NEXT)
      : null
  return { ok: true, title, nextPrompt, slots: out, trimmed, over }
}

/**
 * The agent's `tracy_design_copy write` (§4h decision 4, stage 3): its slots become a `rewritten`
 * version on a chip, titled as the agent names it. Length rule as before (`validCopy`), refusals by name.
 * @param {unknown} args
 * @param {Slot[]} slots
 * @returns {{ ok: true, version: Version, lang: string, brief: { goal: string, voice: string } | null, warnings: string[] } | { ok: false, error: string, offending?: unknown[] }}
 */
export function agentVersion(args, slots) {
  const v = validCopy(args, slots)
  if (!v.ok) return v
  const a = /** @type {Record<string, unknown>} */ (args)
  const title =
    typeof a.title === 'string' && a.title.trim() !== ''
      ? a.title.trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE)
      : REWRITTEN_TITLE
  return {
    ok: true,
    version: {
      id: versionId(),
      title,
      kind: 'rewritten',
      prompt: v.brief ? briefText(v.brief) : null,
      slots: v.slots,
      at: new Date().toISOString(),
      model: null
    },
    lang: v.lang,
    brief: v.brief,
    warnings: v.warnings
  }
}
