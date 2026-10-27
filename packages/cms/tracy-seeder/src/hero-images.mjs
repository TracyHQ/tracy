/**
 * The hero picture of a sealed Joomla quickstart, drawn for the customer instead of kept from the
 * vendor's demo.
 *
 * 🔒 WHY ONLY THE HERO, AND NEVER A LOGO. Image slots are left out of the text plan on purpose: the
 * Claude Cowork plugin accepts only a path that already exists in the site's media library, and a model asked
 * to replace one invented a path and lost a 19-minute seed (22/09/2026, tracy-business). A picture
 * therefore has to be DRAWN, UPLOADED, and only then named in a slot. The hero is the one a visitor
 * sees first and costs one call (gemini-3.1-flash-lite-image, $0.034, measured 23/09/2026 — cheaper
 * in fact than the model that is cheaper per token, which spends five times the tokens). A logo is
 * never drawn: it is a fact about somebody else's brand, and a drawn one is an invented client.
 *
 * 🔒 THE PATH A SEALED SITE ACCEPTS. `media.upload` on a bound site takes only
 * `images/tracy-content/<sha256 of the bytes>.<png|jpg|webp>`, on an apply id that is not a
 * contract receipt (Engine::handle, claude-cowork). The content hash is the name, so the same
 * picture uploaded twice is the same file.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { languageScope, languageWanted } from './locales.mjs'
import { chat } from './model.mjs'
import { entityLanguages, isDerived } from './plan-joomla-contract.mjs'

const HERO = /\bhero\b/i
/** A section of the home page, as the contract labels it (`[Tracy Business] Home - Why … / image`). */
const HOME = /\bHome\s*-/i
const LOGO = /\blogos?\b/i
/** A map shows a place, and a drawn place is an invented one. */
const MAP = /\bmaps?\b/i
const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export { cutToAspect, imageSize } from './image-bytes.mjs'
import { cutToAspect, imageSize } from './image-bytes.mjs'

/**
 * The photographs of the home page — the hero and every other section's picture — in the editions
 * the customer chose. Never a logo and never a map. Measured 25/09/2026 on `j-56xke6`: with only the
 * hero drawn, a florist's "Why" section still showed the demo's construction crew in hard hats.
 */
export function heroSlots({ state, site, dataDir }) {
  const langOf = entityLanguages(dataDir, state.contract)
  const scope = languageScope(site)
  return (state.slots ?? []).filter(
    (slot) =>
      slot.type === 'image' &&
      // A translated copy takes its picture from its source (the Claude Cowork plugin carries it); a seed never
      // writes one — measured 25/09/2026 on `j-56xke6`, re-seeded after es-ES and zh-CN were added.
      !isDerived(slot) &&
      (HERO.test(slot.label ?? '') || HOME.test(slot.label ?? '')) &&
      !LOGO.test(slot.label ?? '') &&
      !MAP.test(slot.label ?? '') &&
      (langOf === null || languageWanted(langOf.get(slot.entity), scope))
  )
}

/** What the picture is of: the customer's own business, never the demo's, and never words or marks. */
export function heroPrompt(site) {
  const facts = [site?.name, site?.about, site?.sector].filter((v) => typeof v === 'string' && v.trim())
  return [
    'A wide 16:9 hero photograph for the home page of this business:',
    facts.join(' — '),
    'Photorealistic, natural light, the business at work or its product in use.',
    'No text, no letters, no logos, no watermarks, no brand names.'
  ].join('\n')
}

/** A home-page section's picture: the business's people and work up close, never words or marks. */
export function sectionPrompt(site) {
  const facts = [site?.name, site?.about, site?.sector].filter((v) => typeof v === 'string' && v.trim())
  return [
    'A photograph for a section of the home page of this business, beside a few lines on why customers choose it:',
    facts.join(' — '),
    'Photorealistic, natural light, its people at work or its craft up close — not the same scene as a wide shop front.',
    'No text, no letters, no logos, no watermarks, no brand names.'
  ].join('\n')
}

/** Which picture a slot asks for: the hero's wide establishing shot, or a section's closer one. */
const promptFor = (slot, site) => (HERO.test(slot.label ?? '') ? heroPrompt(site) : sectionPrompt(site))

/**
 * Draw (or reuse) one picture per distinct demo hero, upload it, and answer the slot values to write.
 *
 * @param {{ state: any, site: any, dataDir?: string, door: { url: string, key: string, imageModel: string } | null,
 *   cacheDir: string, apply: (call: any) => Promise<any>, siteKey: string, log?: (s: string) => void,
 *   chat?: typeof chat, fetch?: typeof fetch }} args
 * @returns {Promise<Record<string, string>>} slot key → media path
 */
export async function drawHeroes({
  state,
  site,
  dataDir,
  door,
  cacheDir,
  apply,
  siteKey,
  webroot = null,
  log = () => {},
  chat: ask = chat,
  fetch
}) {
  const slots = heroSlots({ state, site, dataDir })
  if (!slots.length) return {}
  if (!door?.imageModel) {
    log(`hero: no picture model is configured; ${slots.length} hero slot(s) keep the demo picture`)
    return {}
  }
  const out = {}
  // One picture per demo file and prompt: the archive may show the same picture in several slots.
  const groups = new Map()
  for (const slot of slots) {
    const k = JSON.stringify([slot.sample, promptFor(slot, site)])
    groups.set(k, [...(groups.get(k) ?? []), slot])
  }
  for (const group of groups.values()) {
    const sample = group[0].sample
    const prompt = promptFor(group[0], site)
    // 🔒 NO SHAPE, NO PICTURE. The Claude Cowork plugin refuses a picture of another shape, and one refused value
    // fails the whole seed; without the demo to measure there is no way to know, so nothing is drawn.
    const demo =
      webroot && existsSync(path.join(webroot, sample))
        ? imageSize(readFileSync(path.join(webroot, sample)))
        : null
    if (!demo) {
      log(`hero: the shape of ${sample} could not be read from the site; it stays`)
      continue
    }
    const aspect = demo[0] / demo[1]
    const id = createHash('sha256')
      .update(JSON.stringify({ prompt, sample, model: door.imageModel }))
      .digest('hex')
      .slice(0, 24)
    const record = path.join(cacheDir, `hero-${id}.json`)
    let picture = existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')) : null
    if (picture && !existsSync(path.join(cacheDir, picture.file))) picture = null
    if (!picture) {
      const answer = await ask(
        door,
        { model: door.imageModel, images: true, messages: [{ role: 'user', content: prompt }] },
        fetch
      )
      const image = answer.images?.[0]
      const ext = image ? EXT[image.mime] : undefined
      if (!image || !ext) {
        log(`hero: ${door.imageModel} answered no usable picture; ${sample} stays`)
        continue
      }
      const hash = createHash('sha256').update(image.bytes).digest('hex')
      mkdirSync(cacheDir, { recursive: true })
      writeFileSync(path.join(cacheDir, `${hash}.${ext}`), image.bytes)
      picture = { file: `${hash}.${ext}`, path: `images/tracy-content/${hash}.${ext}` }
      writeFileSync(record, JSON.stringify(picture))
    } else log(`hero: reusing the picture drawn for ${sample}`)
    // Every picture, drawn now or cached by an earlier run, is held to the demo's shape here — a run
    // that cached a picture before cutting existed (j-ee6vsk, 23/09/2026) is cut, not paid for twice.
    let bytes = readFileSync(path.join(cacheDir, picture.file))
    const size = imageSize(bytes)
    if (!size || Math.abs(size[0] / size[1] - aspect) > 0.01) {
      if (!size || !picture.file.endsWith('.jpg')) {
        log(`hero: the picture for ${sample} is not of its shape and cannot be cut here; it stays`)
        continue
      }
      bytes = cutToAspect(bytes, aspect)
      const hash = createHash('sha256').update(bytes).digest('hex')
      writeFileSync(path.join(cacheDir, `${hash}.jpg`), bytes)
      picture = { file: `${hash}.jpg`, path: `images/tracy-content/${hash}.jpg` }
      writeFileSync(record, JSON.stringify(picture))
    }
    if (group.every((slot) => slot.current === picture.path)) continue
    const uploaded = await apply({
      siteKey,
      action: 'media.upload',
      params: {
        apply_id: `media-hero-${picture.file.slice(0, 16)}`,
        path: picture.path,
        content_b64: bytes.toString('base64')
      }
    })
    if (!uploaded?.ok) {
      log(
        `hero: the site refused the picture (${uploaded?.code ?? uploaded?.error ?? 'no answer'}); ${sample} stays`
      )
      continue
    }
    for (const slot of group) out[slot.key] = picture.path
  }
  return out
}
