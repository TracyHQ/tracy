/**
 * Fill the slots of a WordPress quickstart contract from the customer's inputs, through the door.
 *
 * The Joomla contract is bound and written by the Claude Cowork plugin (`content.contract`). The
 * WordPress plugin has no such door, so this module is the writer: it reads the contract the
 * seeder ships (`dist/data/quickstart-contracts/<id>/content-map.json`), turns the inputs a Build
 * collected into one value per slot, and writes each value into the WordPress object the slot names
 * — an option (`blogname`), or one block inside a synced pattern, a page or a template part, located by its
 * `metadata.name` or by its position (`wordpress-block-address.mjs`).
 *
 * 🔒 A SLOT WITH NO INPUT IS LEFT AS THE QUICKSTART SHIPPED IT. Nothing here invents a phone number
 * or a call to action; "not written" is reported, and the site keeps its own words.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { byPosition, writeAt } from './wordpress-block-address.mjs'

/**
 * @typedef {{ key: string, entity: string, target: { option?: string, themeMod?: string, block?: string, blockType?: string, occurrence?: number, attr?: string, field?: string, link?: number }, type: string, maxCharacters: number, input: string }} Slot
 * @typedef {{ key: string, kind: string, identity: Record<string, string> }} Entity
 * @typedef {{ entities: Entity[], slots: Slot[] }} ContentMap
 */

/** Read the three files of a shipped contract. @param {string} dataDir @param {string} id */
export function loadContract(dataDir, id) {
  if (!/^[a-z0-9-]+\/wp\d+\/\d+\.\d+\.\d+$/.test(id)) throw new Error(`not a WordPress contract id: ${id}`)
  const dir = path.join(dataDir, 'quickstart-contracts', id)
  if (!existsSync(path.join(dir, 'manifest.json')))
    throw new Error(`contract ${id} is not shipped with this seeder`)
  const read = (name) => JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
  const optional = (name) => (existsSync(path.join(dir, name)) ? read(name) : null)
  return {
    manifest: read('manifest.json'),
    contentMap: read('content-map.json'),
    presentationLock: read('presentation-lock.json'),
    // Since 1.1.0 (wave A): which post holds each page in every shipped language, and which demo
    // rows a bound site may hide. Older profiles ship neither; the seeder then writes the source only.
    editions: optional('editions.json'),
    demoTrim: optional('demo-trim-map.json')
  }
}

/**
 * The first sentence of a paragraph, and within a budget its first clause: cut at the last
 * `,;:–—` before the budget, else at a word boundary. @param {string} text @param {number} max
 */
function firstClause(text, max) {
  const one = text.replace(/\s+/g, ' ').trim()
  const end = one.search(/[.!?](\s|$)/)
  const sentence = (end === -1 ? one : one.slice(0, end)).trim()
  if (sentence.length <= max) return sentence
  const head = sentence.slice(0, max)
  const clause = head.search(/[,;:–—][^,;:–—]*$/)
  const space = head.lastIndexOf(' ')
  const cut = clause > 20 ? head.slice(0, clause) : space > 20 ? head.slice(0, space) : head
  return cut.replace(/[\s,;:–—]+$/, '')
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE = /(?:\+?\d[\d\s().-]{6,}\d)/

/**
 * The customer's answers as the contract's input names. Only what was actually said: a contact
 * line "hello@x.y · +84 90 000 0000 · 12 Nguyen Hue, Saigon" yields an email, a phone and an
 * address; a line with an email alone yields one input.
 * @param {{ name?: string, about?: string, contact?: string }} site
 * @returns {Record<string, string>}
 */
export function inputsFromSite(site) {
  /** @type {Record<string, string>} */
  const out = {}
  const name = typeof site.name === 'string' ? site.name.trim() : ''
  const about = typeof site.about === 'string' ? site.about.trim() : ''
  const contact = typeof site.contact === 'string' ? site.contact.trim() : ''
  if (name) {
    out.name = name
    out['hero.heading'] = name
  }
  if (about) {
    // The customer answered "about", never a slogan. A profile whose tagline slot names this
    // input (tracy-base: input road only, one language) gets the first clause, slogan-length; a
    // multilingual profile names no input for it, so the model writes a tagline per edition.
    // Handing 160 characters of the answer to the slot put a whole Vietnamese sentence under
    // `<title>` on the ENGLISH edition (measured 25/09/2026, `wpbghcqkm`).
    out.tagline = firstClause(about, 70)
    out['hero.paragraph'] = about
  }
  if (contact) {
    const email = EMAIL.exec(contact)?.[0]
    if (email) out['contact.email'] = email
    const rest = contact.replace(EMAIL, ' ')
    const phone = PHONE.exec(rest)?.[0]?.trim()
    if (phone) out['contact.phone'] = phone
    const address = rest
      .replace(PHONE, ' ')
      .split(/[·|,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3)
      .join(', ')
    if (address) out['contact.address'] = address
  }
  return out
}

/**
 * One value per slot that has an input, clamped to the slot's budget; the rest reported as skipped.
 * @param {ContentMap} contentMap
 * @param {Record<string, string>} inputs
 */
export function planContractWrites(contentMap, inputs) {
  const entities = new Map(contentMap.entities.map((e) => [e.key, e]))
  const writes = []
  const skipped = []
  for (const slot of contentMap.slots) {
    const entity = entities.get(slot.entity)
    if (!entity) {
      skipped.push({ slot: slot.key, reason: `unknown entity ${slot.entity}` })
      continue
    }
    const raw = inputs[slot.input]
    if (typeof raw !== 'string' || raw.trim() === '') {
      skipped.push({ slot: slot.key, reason: 'no input; the quickstart keeps its own words' })
      continue
    }
    if (slot.type === 'image' || slot.target.themeMod) {
      skipped.push({ slot: slot.key, reason: 'the seat door has no theme-mod write; not written' })
      continue
    }
    let value = raw.trim()
    if (slot.maxCharacters > 0 && value.length > slot.maxCharacters)
      value = `${value.slice(0, slot.maxCharacters - 1).trimEnd()}…`
    writes.push({ slot: slot.key, entity, target: slot.target, value })
  }
  return { writes, skipped }
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Set one attribute of the block named `name` inside block markup, and return the new markup.
 *
 * `content`/`text` replace the text of the block's element (`<h1>…</h1>`, `<p>…</p>`, a button's
 * `<a>…</a>`); `url` rewrites the anchor's `href` and the block's own `url` attribute when it has
 * one. Located by `"name":"<name>"` in the opening comment (a slot found by position goes through
 * `writeSlotValue`), and the block's
 * own comments are kept, so the editor still recognises it.
 *
 * `src` puts a picture into a `core/image` block: the img `src`, the block's `"id"` and the
 * `wp-image-N` class, each rewritten in place (so writing the demo picture back returns the bytes
 * the archive shipped — the skeleton relies on that). The same algorithm as the Claude Cowork plugin's
 * `QuickstartContract::setBlockValue`.
 * @param {string} markup @param {string} name @param {string} attr @param {string} value
 * @param {number} [imageId] the picture's attachment id, required for `src`
 */
export function setBlockValue(markup, name, attr, value, imageId) {
  const open = new RegExp(
    `<!-- wp:([a-z0-9-]+/)?([a-z0-9-]+) (\\{[^\\n]*"name":"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^\\n]*\\}) -->`
  )
  const found = open.exec(markup)
  if (!found) throw new Error(`block ${name} is not in this pattern`)
  const block = found[2]
  const start = found.index + found[0].length
  const closeTag = `<!-- /wp:${found[1] ?? ''}${block} -->`
  const end = markup.indexOf(closeTag, start)
  if (end === -1) throw new Error(`block ${name} has no closing comment`)
  let inner = markup.slice(start, end)
  let opening = found[0]
  if (attr === 'content' || attr === 'text') {
    const text = escapeHtml(value)
    const replaced =
      block === 'button'
        ? inner.replace(/(<a\b[^>]*>)[\s\S]*?(<\/a>)/, `$1${text}$2`)
        : inner.replace(/^(\s*<([a-z0-9]+)\b[^>]*>)[\s\S]*?(<\/\2>\s*)$/, `$1${text}$3`)
    if (replaced === inner && !inner.includes(text))
      throw new Error(`block ${name} has no text element to write`)
    inner = replaced
  } else if (attr === 'url') {
    const href = escapeHtml(value)
    inner = inner.replace(/(<a\b[^>]*\bhref=")[^"]*(")/, `$1${href}$2`)
    if (!inner.includes(`href="${href}"`)) throw new Error(`block ${name} has no link to write`)
    const attrs = JSON.parse(found[3])
    if ('url' in attrs) {
      attrs.url = value
      opening = `<!-- wp:${found[1] ?? ''}${block} ${JSON.stringify(attrs)} -->`
    }
  } else if (attr === 'src') {
    if (!/<img\b[^>]*\bsrc="[^"]*"/.test(inner)) throw new Error(`block ${name} has no picture to write`)
    if (!Number.isInteger(imageId)) throw new Error(`block ${name} needs the attachment id of its picture`)
    const src = escapeHtml(`/${value.replace(/^\/+/, '')}`)
    inner = inner.replace(/(<img\b[^>]*\bsrc=")[^"]*(")/, (_, a, b) => `${a}${src}${b}`)
    inner = inner.replace(/\bwp-image-\d+\b/, `wp-image-${imageId}`)
    const attrs = JSON.parse(found[3])
    if (Number.isInteger(attrs.id)) {
      const was = `"id":${attrs.id}`
      const at = found[3].lastIndexOf(was)
      if (at !== -1) {
        const rewritten = `${found[3].slice(0, at)}"id":${imageId}${found[3].slice(at + was.length)}`
        opening = opening.replace(found[3], () => rewritten)
      }
    }
  } else throw new Error(`unsupported block attribute ${attr}`)
  return `${markup.slice(0, found.index)}${opening}${inner}${markup.slice(end)}`
}

/**
 * Write one slot's value wherever its target names it: a block by its name (`setBlockValue`, unchanged) or by its position
 * (`blockType` + `occurrence`, `wordpress-block-address.mjs`), so a value written reads back equal.
 * @param {string} markup
 * @param {{ block?: string, blockType?: string, occurrence?: number, attr?: string, field?: string, link?: number }} target
 * @param {string} value
 * @param {number} [imageId] the picture's attachment id, required for `src`
 */
export function writeSlotValue(markup, target, value, imageId) {
  return writeAt(markup, target, value, setBlockValue, imageId)
}

/**
 * Write the planned values through the door. Options one by one; a pattern's blocks together, from
 * one read to one write, so a pattern with three slots is one revision on the site.
 * @param {{ ops: { setOption: (name: string, value: string) => Promise<void>, find: (type: string, slug: string) => Promise<number | null>, readContent: (id: number) => Promise<string | null>, setContent: (id: number, content: string) => Promise<void> }, writes: ReturnType<typeof planContractWrites>['writes'], log?: (s: string) => void }} deps
 */
export async function applyWordPressContract({ ops, writes, log = () => {} }) {
  const written = []
  const skipped = []
  /** @type {Map<string, { entity: Entity, writes: typeof writes }>} */
  const patterns = new Map()
  for (const w of writes) {
    if (w.target.option) {
      await ops.setOption(w.target.option, w.value)
      written.push({ slot: w.slot, option: w.target.option })
      continue
    }
    if (w.target.block || byPosition(w.target)) {
      const group = patterns.get(w.entity.key) ?? { entity: w.entity, writes: [] }
      group.writes.push(w)
      patterns.set(w.entity.key, group)
      continue
    }
    skipped.push({ slot: w.slot, reason: 'no writer for this target' })
  }
  for (const { entity, writes: group } of patterns.values()) {
    const slug = entity.identity.slug
    // A template part (the header, the footer) is read and written by its slug, as the plugin's contract does.
    const part = entity.kind === 'templatePart'
    // An entity re-addressed by `editionContentMap` carries the post id of its edition; the slug
    // lookup (`content.list {name}`) cannot tell the 41 Polylang copies of `home` apart.
    const id = part
      ? slug
      : Number.isInteger(entity.identity.id)
        ? entity.identity.id
        : await ops.find(entity.identity.postType ?? 'wp_block', slug)
    if (id === null) {
      for (const w of group) skipped.push({ slot: w.slot, reason: `pattern ${slug} is not on the site` })
      continue
    }
    if (part && (!ops.readPart || !ops.setPart)) {
      for (const w of group)
        skipped.push({ slot: w.slot, reason: `the door has no template part write for ${slug}` })
      continue
    }
    const current = part ? await ops.readPart(slug) : await ops.readContent(id)
    if (typeof current !== 'string') {
      for (const w of group)
        skipped.push({ slot: w.slot, reason: `the door did not return the content of ${slug}` })
      continue
    }
    let next = current
    const done = []
    for (const w of group) {
      try {
        next = writeSlotValue(next, w.target, w.value)
        done.push(w)
      } catch (error) {
        skipped.push({ slot: w.slot, reason: error instanceof Error ? error.message : String(error) })
      }
    }
    if (next !== current) {
      if (part) await ops.setPart(slug, next)
      else await ops.setContent(id, next)
      for (const w of done) written.push({ slot: w.slot, pattern: slug, block: w.target.block })
      log(`contract: ${done.length} slot(s) written into ${slug}`)
    }
  }
  return { written, skipped }
}
