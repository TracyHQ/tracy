/**
 * `media.draw` — a picture the agent draws for the site, uploaded into its media library.
 *
 * WHY THE AGENT NEEDS IT. A sealed quickstart takes a picture only as a path that already exists in
 * `images/`, and until 23/09/2026 the only drawn one was the seed's hero: an agent asked for "a photo
 * of our shop in the header" had nowhere to put a picture it could not make. The seed's drawing,
 * cutting and uploading is shared (`tracy-seeder/src/picture.mjs`), so both land the same way.
 *
 * 🔒 NO CONTENT FILTER HERE (Lee, 23/09/2026: "the tool need not refuse to draw anything — what if
 * the customer wants it drawn?"). The prompt goes to the picture model as the agent wrote it.
 *
 * 🔒 THE UPLOAD IS THE PERSON'S, THROUGH THE SITE DOOR. The lane never writes the webroot: the bytes
 * go through `media.upload` on the seat book, as the viewer, on a `media-draw-…` apply id — the same
 * road `tracy_site media.upload` takes, so a seat without the media toolset is refused by name, and
 * a sealed site accepts the `<folder>/<sha256>` name the picture is given — `images/tracy-content`
 * on Joomla, `wp-content/uploads/tracy-content` on WordPress (each Claude Cowork plugin's own rule).
 *
 * 🔒 THE ANSWER CARRIES NO MONEY AND NO MODEL NAME (29/09/2026). It used to hand the agent `costUsd`
 * and `model`, and the tool text said "say what it cost", so replies read "Model
 * `google/gemini-3.1-flash-lite-image`, image cost $0.0336" — to a customer who is not a developer,
 * with no Tracy price to compare it to, and naming the underlying model the identity rule forbids
 * naming. Nothing else reads those two fields — apps/, ops and telemetry have no `costUsd`, and the
 * hero seed draws through its own call (`hero-images.mjs`) — so they are dropped from the answer and
 * the seeder's `drawPicture` is untouched (it still returns them, and its own test pins that). A
 * failure is worded the same way: the picture model is "the picture model", never its name.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { imageSize } from '../../../../cms/tracy-seeder/src/image-bytes.mjs'

const PICTURE = /\.(?:png|jpe?g|webp)$/i

/**
 * Where a drawn picture lands, by platform: the one folder each Claude Cowork plugin accepts an upload into
 * on a sealed site (Joomla `Engine.php` and WordPress `CONTRACT_MEDIA_PATH`).
 * @param {string | null | undefined} platform
 */
export function pictureFolder(platform) {
  // EmDash keeps pictures in its media store, not the webroot: the folder is only the file's name.
  if (platform === 'emdash') return 'tracy-content'
  return platform === 'wordpress' ? 'wp-content/uploads/tracy-content' : 'images/tracy-content'
}

/**
 * Where an EmDash picture goes once it is in the media library — drawn (`media.draw`) or the
 * customer's own (`media.upload`, `upload.mjs`): one sentence, so the two roads never drift apart.
 * An EmDash image field holds the media item's ID (measured 26/09: `hero_image: "<ulid>"` served the
 * picture); the url is what the page shows and what a person can open.
 * @param {string | null} id @param {string | null} url @param {string} fallback - what to name when
 *   the site answered neither.
 */
export function emdashPlacedNext(id, url, fallback) {
  return (
    `The picture is in the media library${id ? ` as media ${id}` : ''}${url ? ` (${url})` : ''}. Put it where it belongs: ` +
    `tracy_emdash content_update {collection, id, _rev, data:{"<image field>":"${id ?? url ?? fallback}"}, status:"published"} on the entry that shows it — one write per language that has its own picture.`
  )
}

/**
 * 🔒 WHICH PICTURE OF A JOOMLA ARTICLE (02/10/2026). Every Joomla article keeps two: `image_intro`, the card
 * in lists, blogs and on a home page, and `image_fulltext`, the picture on its own page. Nothing said so, and
 * on an imported copy "use this picture for the tour" cost ~10 shell calls reading rendered HTML and template
 * files to tell the two apart (and once ended on the one the customer did not see). Said where the picture
 * lands, only on Joomla, and only when no slot takes it.
 */
export const JOOMLA_ARTICLE_PICTURES =
  ' An article keeps two pictures in its images field: content.update {kind:"article", id, fields:{images:{patch:{image_intro:"<path>"}}}} is the card in lists and on the home page, image_fulltext the picture on its own page; "the picture of the article" is both.'

/**
 * 🔒 WHERE A WORDPRESS THEME'S OWN PICTURE LIVES (02/10/2026). A logo or a banner the theme prints is not in a
 * page's body: it is in a template part (the header, the footer) or in the pattern a page inserts. Nothing said
 * so, and on an imported block-theme copy "use this picture as the logo" took 33 tool calls (readings of the
 * rendered page, the theme's files and a second part) before the right write. Said where the picture lands, on
 * an open or imported WordPress site (a quickstart site puts it in a slot), and only for a block theme: a
 * classic theme keeps its logo in the theme's settings, which this sentence does not claim.
 */
export const WORDPRESS_THEME_PICTURES =
  ' On a block theme, a picture the theme prints (a logo, a banner) sits in a template part: content.get {kind:"templatePart", key:"header"|"footer"} shows its markup, and content.update writes it back with the new path.'

/** A contract image slot key: Joomla keys one `module-441.8`, WordPress `<page>.<block>` (`home.hero.img`). */
const SLOT_KEY = /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+$/

/** One part of an EmDash address: a collection, an entry's id or slug, a field (a dotted path into a list). */
const ADDRESS_PART = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,80}$/

/**
 * @typedef {{ collection: string, id: string, field: string, locale?: string }} Replaces
 *   The entry field whose picture a new one replaces (EmDash): what a pick's `emdash:<collection>:<id>:<slug>
 *   field:<field>` mark names, and what `content_update` writes into.
 */

/**
 * The address a draw replaces, if it gave one.
 * @param {unknown} value
 * @returns {{ ok: true, replaces: Replaces | null } | { ok: false, error: string }}
 */
function planReplaces(value) {
  if (value === undefined || value === null || value === '') return { ok: true, replaces: null }
  const r =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)
      : {}
  const part = (/** @type {unknown} */ v) =>
    typeof v === 'string' && ADDRESS_PART.test(v.trim()) ? v.trim() : null
  const collection = part(r.collection)
  const id = part(r.id)
  const field = part(r.field)
  if (collection === null || id === null || field === null)
    return {
      ok: false,
      error:
        'replaces is {collection, id, field}: the entry field whose picture the new one replaces (a pick names them in its emdash: marks)'
    }
  const locale = part(r.locale)
  return { ok: true, replaces: { collection, id, field, ...(locale !== null ? { locale } : {}) } }
}

/** The plain refusal of a slot key that is not one, with the way to the real ones. */
const BAD_SLOT =
  'slot must be a contract image slot key such as module-441.8 or home.hero.img: content.contract {operation:"inspect", slots:"image", page} lists them'

/**
 * The parameters of one draw: the prompt, and the shape — a contract image slot (`slot`: the shape comes
 * with it), the entry field it replaces (`replaces`, EmDash: the door measures the stored picture), a
 * picture already on the site (`like`), or `aspect` ("16:10", or 1.6).
 *
 * 🔒 A SLOT FIXES THE SHAPE, SO A `like` OR AN `aspect` BESIDE IT IS REDUNDANT, NOT WRONG. It used to be
 * refused ("give the shape as one of …, not several"): the model that read "a slot takes the shape of
 * its demo" and still sent the aspect it had worked out was refused nine times in one round (bench v7,
 * 29/09/2026, 8 of 20 picture runs), each refusal a step, and most then dropped the slot — the one
 * road a bound WordPress site accepts. The slot wins and the answer says what was ignored, in
 * `normalized`, the way every other corrected call is said. The same for `replaces` over `like`.
 * `like` beside `aspect`, with neither address, stays refused: which of the two is meant is not said.
 * @param {Record<string, unknown>} params
 * @returns {{ ok: false, error: string } | { ok: true, prompt: string, like: string | null, aspect: number | null, slot: string | null, replaces: Replaces | null, notes?: string[] }}
 */
export function planDraw(params) {
  /** @type {Record<string, unknown>} */
  const p = params && typeof params === 'object' ? params : {}
  const prompt = typeof p.prompt === 'string' ? p.prompt.trim() : ''
  if (prompt === '') return { ok: false, error: 'prompt required: what the picture shows, in words' }
  if (prompt.length > 4000) return { ok: false, error: 'prompt too long: at most 4000 characters' }
  const slot = typeof p.slot === 'string' && p.slot.trim() !== '' ? p.slot.trim() : null
  if (slot !== null && !SLOT_KEY.test(slot)) return { ok: false, error: BAD_SLOT }
  const hasLike = typeof p.like === 'string' && p.like.trim() !== ''
  const hasAspect = p.aspect !== undefined && p.aspect !== null && p.aspect !== ''
  const address = planReplaces(p.replaces)
  if (!address.ok) return address
  const { replaces } = address
  if (slot !== null) {
    const notes = [
      ...(hasLike ? ['like ignored: the slot fixes the shape'] : []),
      ...(hasAspect ? ['aspect ignored: the slot fixes the shape'] : []),
      ...(replaces !== null ? ['replaces ignored: the slot fixes the shape'] : [])
    ]
    return {
      ok: true,
      prompt,
      like: null,
      aspect: null,
      slot,
      replaces: null,
      ...(notes.length > 0 ? { notes } : {})
    }
  }
  const like = !hasLike || replaces !== null ? null : String(p.like).trim().replace(/^\/+/, '')
  if (like !== null && (like.split('/').includes('..') || !PICTURE.test(like)))
    return {
      ok: false,
      error:
        'like must be the path of a picture on this site, e.g. images/hero.jpg or wp-content/uploads/2026/09/hero.png'
    }
  let aspect = null
  if (hasAspect) {
    const m = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(String(p.aspect).trim())
    aspect = m ? Number(m[1]) / Number(m[2]) : Number(p.aspect)
    if (!Number.isFinite(aspect) || aspect < 0.2 || aspect > 5)
      return { ok: false, error: 'aspect must be width:height, e.g. "16:10", or a ratio such as 1.6' }
  }
  if (like !== null && aspect !== null)
    return {
      ok: false,
      error:
        'give the shape as one of slot (a contract image slot), like (a picture on the site) or aspect, not several'
    }
  return {
    ok: true,
    prompt,
    like,
    aspect,
    slot: null,
    replaces,
    ...(hasLike && replaces !== null ? { notes: ['like ignored: replaces fixes the shape'] } : {})
  }
}

/**
 * A failure of the draw as the agent reads it, with the picture model's own name taken out: the
 * seeder words it "<model> answered no picture", and what the agent reads it may say to the customer,
 * to whom no underlying model is ever named.
 * @param {unknown} error @param {string} model
 * @returns {string}
 */
function unnamed(error, model) {
  const said = typeof error === 'string' && error !== '' ? error : 'the picture model answered nothing'
  return model ? said.split(model).join('the picture model') : said
}

/**
 * How many image slots a refusal lists: every slot of a bound WordPress site fits, and a bigger contract
 * gets the rest through `content.contract inspect`, which the same answer names.
 */
const SLOTS_LISTED = 40

/**
 * The image slots of a contract as the lines the agent chooses from: `<key> <block>: <picture file>` —
 * the block's name (Joomla's label without the quickstart's `[…]` and its `/ image` tail; WordPress
 * names none) and the file the slot shows now, which is what a customer's "the hero", or the picture a
 * pick points at, is matched against.
 * @param {readonly { key: string, label?: string, current?: string }[]} slots
 * @returns {{ slots: string[], moreSlots?: number }}
 */
export function slotChoices(slots) {
  const lines = slots.slice(0, SLOTS_LISTED).map(({ key, label, current }) => {
    // A lean inspect prints a block's later slots as `…/ logo`: no name to show, the key says the rest.
    const block =
      typeof label === 'string' && !label.startsWith('…')
        ? label.replace(/^\[[^\]]*\]\s*/, '').replace(/\s\/\s[^/]*$/, '')
        : ''
    const file = typeof current === 'string' ? (current.split('/').pop() ?? '') : ''
    return `${key}${block !== '' ? ` ${block}` : ''}${file !== '' ? `: ${file}` : ''}`
  })
  return { slots: lines, ...(slots.length > SLOTS_LISTED ? { moreSlots: slots.length - SLOTS_LISTED } : {}) }
}

/**
 * A picture asked for with no slot on a site that takes pictures into slots only, or into a slot that is
 * not one — answered with the slots the agent can choose from, so the next call is the right one and no
 * inspect stands between. The list is the slots of the entity the wrong key names (`module-999.1` →
 * `module-999`, `home.hero.image` → `home`) when it has any: a mistyped key is usually a right block.
 * Without a list (an older Claude Cowork plugin names no image slot, or the inspect failed) the old
 * sentence stays, and says where the keys are.
 * @param {{ code: 'SLOT_REQUIRED' | 'SLOT_NOT_FOUND', slot: string | null,
 *   imageSlots?: (entity: string | null) => Promise<{ key: string, label?: string, current?: string }[]> }} input
 */
async function slotRefusal({ code, slot, imageSlots }) {
  /** @type {{ key: string, label?: string, current?: string }[]} */
  let found = []
  if (imageSlots) {
    try {
      if (slot !== null) found = await imageSlots(slot.split('.')[0])
      if (found.length === 0) found = await imageSlots(null)
    } catch {
      found = []
    }
  }
  if (found.length === 0)
    return {
      ok: false,
      code,
      error:
        slot === null
          ? 'On this quickstart site a picture goes into an image slot: media.draw {prompt, slot:"<image slot key>"}. content.read names the slot of a picture (field.slotKey), or content.contract {operation:"inspect", slots:"image"} lists them.'
          : `${slot} is not an image slot of this site's contract; list them with content.contract {operation:"inspect", slots:"image"}`
    }
  return {
    ok: false,
    code,
    error:
      slot === null
        ? 'On this quickstart site a picture goes into an image slot: media.draw {prompt, slot:"<image slot key>"}.'
        : `${slot} is not an image slot of this site.`,
    ...slotChoices(found),
    next:
      slot === null
        ? 'Take the slot the picture replaces from slots and call media.draw again with it: the shape comes with the slot, so no aspect or like.'
        : 'Call media.draw again with one of slots: the shape comes with the slot. None fits: content.contract {operation:"inspect", slots:"image", page:"<route>"}.'
  }
}

/**
 * What the agent is told after every picture it drew, on every CMS, once per draw: not in the tool text
 * every step pays for.
 *
 * 🔒 THREE MEASURED WASTES (bench v7, 29/09/2026), each a clause. A WordPress developer run drew four
 * pictures, then wrote a Python script that painted one in their place and uploaded it — 20 calls, and
 * the apply refused its shape; a Joomla run applied a drawn picture, looked at it, and undid it; and
 * replies described pictures nobody had looked at ("two cranes"), because the receipt carries a size and
 * no content. SCOPED TO THE DRAW: a picture the customer asks for that a script really makes (a QR code, a
 * chart) is not this. And looking at a picture it drew is NOT forbidden: the stand's picture model is a
 * double that answers an unrelated fixture, so the agent that checks is right to, and a real model will
 * mostly need no second look.
 */
export const DRAWN_RULES =
  'Never paint a picture by script or bash in its place, and never undo one unasked. Say only what the receipt or a look at it showed.'

/**
 * Draw, cut, upload. Every dependency comes in, so the whole road is testable without a model.
 * @param {{ params: Record<string, unknown>, webroot: string | null, door: { imageModel: string } | null,
 *   platform?: string | null, slotOnly?: boolean,
 *   resolveSlot?: (key: string) => Promise<{ sample: string, current?: string } | null>,
 *   imageSlots?: (entity: string | null) => Promise<{ key: string, label?: string, current?: string }[]>,
 *   measure?: (replaces: Replaces) => Promise<{ ok: true, width: number, height: number } | { ok: false, code: string, error: string, next?: string }>,
 *   draw: (args: { door: any, prompt: string, aspect: number | null, folder: string }) => Promise<any>,
 *   upload: (params: { apply_id: string, path: string, content_b64: string }) => Promise<any> }} args
 */
export async function mediaDraw({
  params,
  webroot,
  platform = null,
  slotOnly = false,
  door,
  draw,
  upload,
  resolveSlot,
  imageSlots,
  measure
}) {
  const plan = planDraw(params)
  if (!plan.ok) return { ok: false, code: 'BAD_PARAMS', error: plan.error }
  /** What the call was corrected by, said in the answer (`normalized`). */
  const notes = [...(plan.notes ?? [])]
  /** @param {Record<string, unknown>} answer */
  const said = (answer) => (notes.length > 0 ? { ...answer, normalized: notes } : answer)
  let aspect = plan.aspect
  /**
   * 🔒 EmDash (26/09/2026): no contract slots, and no webroot path to measure a `like` against — its
   * pictures live in the media store and reach the page as a url in an entry field. Rounds 3–5
   * refused every "redraw the hero" on EmDash for want of this road. The upload goes through
   * `tracy_emdash media_upload` (the caller's `upload`), and the answer names the id to write.
   *
   * 🔒 THE SHAPE IS MEASURED BY THE DOOR, NOT TYPED BY THE MODEL (30/09/2026). `aspect` alone was the
   * model's reading of a picture it had not read: three EmDash picks drew at "16/10" before the entry
   * was read, at "5/4" (1000×880 rounded), and at "4/3" (the CSS frame page.look shows) — three wrong
   * pages, where the stored picture is 1000×880 and `content_get` says so. `replaces` names the entry
   * field, which the pick's own `emdash:` mark carries, and the door reads the stored size itself.
   */
  if (platform === 'emdash') {
    if (plan.slot !== null)
      return {
        ok: false,
        code: 'NO_SLOTS_ON_EMDASH',
        error:
          'EmDash has no contract slots: media.draw {prompt, replaces:{collection, id, field}} draws to the shape of the picture in that entry field, then tracy_emdash content_update puts the id it returns into it.'
      }
    if (plan.like !== null)
      return {
        ok: false,
        code: 'LIKE_NOT_ON_EMDASH',
        error:
          'On EmDash like names a webroot path and pictures live in the media store: give replaces:{collection, id, field} (the entry field whose picture it replaces), or aspect:"<w>:<h>".'
      }
    if (plan.replaces !== null && measure) {
      const shape = await measure(plan.replaces)
      if (shape.ok) {
        if (plan.aspect !== null) notes.push('aspect ignored: replaces fixes the shape')
        aspect = shape.width / shape.height
      } else if (plan.aspect === null) {
        return {
          ok: false,
          code: shape.code,
          error: shape.error,
          ...(shape.next ? { next: shape.next } : {})
        }
      } else {
        // The model gave the shape too: a picture in that shape beats a refusal it would only meet again.
        notes.push('replaces not measured: aspect used')
      }
    } else if (plan.aspect === null) {
      return {
        ok: false,
        code: 'ASPECT_REQUIRED',
        error:
          'On EmDash a draw needs replaces:{collection, id, field} (the picture it replaces: the door measures it) or, for a new picture, aspect:"<w>:<h>" — its stored width:height, never a nearby stock ratio or the CSS frame.'
      }
    }
  } else if (plan.replaces !== null) {
    return {
      ok: false,
      code: 'REPLACES_ONLY_ON_EMDASH',
      error:
        'replaces is for EmDash sites: here the shape is a contract image slot (slot) or a picture on the site (like).'
    }
  }
  // A bound WordPress site takes a picture into an image slot and nowhere else; refused here,
  // before the picture model is paid, rather than after the upload by the apply.
  if (slotOnly && plan.slot === null) return slotRefusal({ code: 'SLOT_REQUIRED', slot: null, imageSlots })
  if (!door?.imageModel)
    return {
      ok: false,
      code: 'NO_PICTURE_MODEL',
      error:
        'No picture model is set up on this host. Tell the customer pictures cannot be drawn on this site yet; the Tracy team can switch that on.'
    }
  let like = plan.like
  // A slot is measured against its DEMO picture — the Claude Cowork plugin's own yardstick — never its current one.
  if (plan.slot !== null) {
    const found = resolveSlot ? await resolveSlot(plan.slot) : null
    if (!found?.sample) return slotRefusal({ code: 'SLOT_NOT_FOUND', slot: plan.slot, imageSlots })
    like = found.sample
  }
  if (like !== null) {
    const file = webroot ? path.join(webroot, like) : null
    const size = file && existsSync(file) ? imageSize(readFileSync(file)) : null
    if (!size)
      return {
        ok: false,
        code: 'LIKE_NOT_FOUND',
        error: `${like} is not a picture this site holds; name the current value of the slot, or give aspect instead`
      }
    aspect = size[0] / size[1]
  }
  const picture = await draw({ door, prompt: plan.prompt, aspect, folder: pictureFolder(platform) })
  if (!picture?.ok)
    return {
      ok: false,
      code: 'NOT_DRAWN',
      error: unnamed(picture?.error, door.imageModel),
      next: 'Tell the customer the picture could not be drawn; paint none by script or bash in its place.'
    }
  const uploaded = await upload({
    apply_id: `media-draw-${picture.path.split('/').pop().slice(0, 16)}`,
    path: picture.path,
    content_b64: picture.bytes.toString('base64')
  })
  if (!uploaded?.ok)
    return { ...(uploaded && typeof uploaded === 'object' ? uploaded : {}), ok: false, drawn: picture.path }
  if (platform === 'emdash') {
    const url = typeof uploaded.url === 'string' ? uploaded.url : null
    const id = typeof uploaded.id === 'string' ? uploaded.id : null
    // 🔒 NO `path`: it was the staging name (`tracy-content/<sha>.jpg`), which no file tool can open —
    // v7 EmDash Designer read_image'd it, was refused, and hunted the disk with find/ls/cp for six steps.
    // The picture is in the library: `media.scan {id}` copies it where read_image opens it.
    return said({
      ok: true,
      url,
      id,
      width: picture.width,
      height: picture.height,
      next: `${emdashPlacedNext(id, url, picture.path)}${id ? ` To look at it: media.scan {id:"${id}"}.` : ''} ${DRAWN_RULES}`
    })
  }
  return said({
    ok: true,
    path: picture.path,
    width: picture.width,
    height: picture.height,
    // 🔒 NO "with the revision of your last inspect" (adversarial review of round 7, PD-3): a model that has
    // read the page is not to inspect it again — the apply's own description says Tracy sends the
    // revisions it read, and an inspect costs 12–20 s on Joomla. The upload receipt (`upload.mjs`
    // `placedNext`) lost the phrase for the same reason; this one had kept it.
    next:
      `The picture is in the media library as ${picture.path}. Put it where it belongs: on a quickstart with a contract, ` +
      `content.contract {operation:"apply", changes:{"${plan.slot ?? '<image slot key>'}":"${picture.path}"}} — Tracy adds the revision; ` +
      `one apply can carry every picture you drew, and each reaches every language by itself; elsewhere, the content.update of the record that shows it.${!plan.slot && platform === 'joomla' ? JOOMLA_ARTICLE_PICTURES : !plan.slot && platform === 'wordpress' ? WORDPRESS_THEME_PICTURES : ''} ${DRAWN_RULES}`
  })
}
