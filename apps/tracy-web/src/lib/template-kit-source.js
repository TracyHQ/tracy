// The template kits the site planner bench can read (ADR 0041, #301), and the kit as the planner sees it: one part at
// a time through the read_kit_part tool, or (a model given no images, below) the whole planner view in the first
// message; never the whole 2 MB file. The kits are the template-kit.json
// files beside the contract profiles the image ships (lib/contracts.js, lib/template-kit/reader.js).
//
// Part ids: "contents" (what the kit holds and every id below), "site" (the site-wide parts, each large one replaced
// by the id that reads it), "site.<key>" (one site-wide part in full), any other top-level list or object small enough
// to read whole ("pageGroups", "pages", "templateGaps", ...), a page group id, a page id and a block id. A part is
// answered as compact JSON, without the measurement and evidence fields the approved prompt never uses
// (PLANNER_DROPPED_KIT_FIELDS) and with each page's and block's look as its text, which "contents" also lists beside
// every page and block id; the checker still reads the whole kit. read_kit_part takes one id or a list of ids.
// open_kit_image answers one kit image from the images made ready by kit-images.js (#302); without them it says
// images are not available. A part already sent in the run (in an earlier call's answer, or "contents" in the first
// message) is not sent again: read_kit_part answers where it was sent, and an answer made only of such repeats is
// flagged `repeated` so the agent loop can end the reading (agent-over-door.js writeStep).
//
// A run whose model is given no images (door.js) reads no part at all: its first message carries the whole planner
// view of the kit (preloadedFirstMessage) and the run has no tools. The kit block opens the message and is the same
// bytes for every run on the same kit version, so the provider's prefix cache can reuse it across briefs; the brief
// and the instruction to write come last.
import { defaultContracts } from './contracts.js'
import { kitOfContract } from './template-kit/reader.js'
import { compactForPlanner, lookTextOf } from './template-kit-planner-view.js'

export { compactForPlanner, lookTextOf, PLANNER_DROPPED_KIT_FIELDS } from './template-kit-planner-view.js'

export const KIT_TOOL_NAMES = Object.freeze({ readPart: 'read_kit_part', openImage: 'open_kit_image' })

/** A top-level part larger than this is read by its entries' ids instead (today only "blocks", about 900 kB). */
const PART_LIMIT = 120_000
/** Inside "site", a part larger than this is named, not inlined (brand colours and fixed texts on JA Boxing). */
const SITE_INLINE_LIMIT = 20_000

/** A read_kit_part call with several ids stops adding parts past this many characters; the rest are named. */
export const READ_MANY_LIMIT = 150_000

/**
 * What asks for the plan: the last line of a preloaded first message, and the write step's message once a run that
 * reads with tools has read enough (bench-worker.js).
 */
export const WRITE_PLAN_INSTRUCTION =
  'Write the complete plan now as one JSON object in a single ```json fenced block; no tool calls.'

/** Where a part was already sent: the answer to an earlier call (its turn number), or the first message (-1). */
export const IN_FIRST_MESSAGE = -1

const sizeOf = (value) => JSON.stringify(value ?? null).length
const isPart = (value) => value !== null && typeof value === 'object'

/**
 * Every kit the server can read: contracts whose template-kit.json reads cleanly, sorted by ref.
 * @param {{ index?: Map<string, { id: string, dir?: string, platform?: string }> }} [options]
 */
export function readableKits({ index = defaultContracts() } = {}) {
  const kits = []
  for (const [key, contract] of index) {
    const kit = kitOfContract(contract)
    if (kit.state !== 'read') continue
    const at = key.lastIndexOf('@')
    kits.push({
      ref: contract.id,
      release: key.slice(0, at),
      version: key.slice(at + 1),
      platform: contract.platform ?? '',
      template: { name: kit.doc.template?.name ?? null, version: kit.doc.template?.version ?? null },
      images: kit.doc.images.length,
      approved: Boolean(kit.doc.approval)
    })
  }
  return kits.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0))
}

/**
 * One readable kit by its ref (the contract id, e.g. "ja-boxing/j6/1.0.10"), with the release tag and version its
 * contract seals (where the kit's image zip is published), or null.
 */
export function openKit(ref, { index = defaultContracts() } = {}) {
  if (typeof ref !== 'string' || ref === '') return null
  for (const [key, contract] of index) {
    if (contract.id !== ref) continue
    const kit = kitOfContract(contract)
    const at = key.lastIndexOf('@')
    return kit.state === 'read'
      ? {
          ref,
          release: key.slice(0, at),
          version: key.slice(at + 1),
          platform: contract.platform ?? '',
          doc: kit.doc
        }
      : null
  }
  return null
}

/** The kit's parts by id, and `read(id)`: the part as compact JSON, or an error result as JSON. */
export function kitParts(kitDoc) {
  const doc = compactForPlanner(kitDoc)
  const site = isPart(doc.site) ? doc.site : {}
  const byId = new Map()
  const add = (id, value) => {
    if (typeof id === 'string' && id !== '' && !byId.has(id)) byId.set(id, value)
  }
  const tooLarge = []

  const siteView = {}
  for (const [key, value] of Object.entries(site)) {
    const size = sizeOf(value)
    siteView[key] =
      size > SITE_INLINE_LIMIT
        ? {
            part: `site.${key}`,
            ...(Array.isArray(value) ? { entries: value.length } : {}),
            characters: size
          }
        : value
  }
  const listed = [{ id: 'site', characters: sizeOf(siteView) }]
  for (const [key, value] of Object.entries(site))
    listed.push({ id: `site.${key}`, characters: sizeOf(value) })
  for (const [key, value] of Object.entries(doc)) {
    if (key === 'site' || !isPart(value)) continue
    if (sizeOf(value) > PART_LIMIT) tooLarge.push(key)
    else listed.push({ id: key, characters: sizeOf(value) })
  }

  const contents = {
    kit: doc.contract ?? null,
    format: doc.kit ?? null,
    template: doc.template ? { name: doc.template.name, version: doc.template.version } : null,
    quickstart: doc.quickstart ?? null,
    widths: doc.widths ?? null,
    mainMenuFrom: doc.mainMenuFrom ?? null,
    images: Array.isArray(doc.images) ? doc.images.length : 0,
    parts: listed,
    pageGroups: list(doc.pageGroups).map((g) => g.id),
    pages: list(doc.pages).map((p) => ({
      id: p.id,
      group: p.group,
      path: p.path,
      inMainMenu: p.inMainMenu,
      ...(p.look ? { look: p.look } : {})
    })),
    blocks: list(doc.blocks).map((b) => ({
      id: b.id,
      role: b.role,
      shared: b.shared,
      ...(b.look ? { look: b.look } : {})
    })),
    readWholeOnlyByEntryId: tooLarge
  }
  add('contents', contents)
  add('site', siteView)
  for (const [key, value] of Object.entries(site)) add(`site.${key}`, value)
  for (const { id } of listed) if (id !== 'site' && !id.startsWith('site.')) add(id, doc[id])
  for (const group of list(doc.pageGroups)) add(group.id, group)
  for (const page of list(doc.pages)) add(page.id, page)
  for (const block of list(doc.blocks)) add(block.id, block)

  const validIds = [
    '"contents": what the kit holds and every id below',
    '"site": the site-wide parts; a large one is named there by its own id',
    `"site.<key>": one site-wide part in full, keys: ${Object.keys(site).join(', ')}`,
    `a top-level part: ${listed
      .map((p) => p.id)
      .filter((id) => id !== 'site' && !id.startsWith('site.'))
      .join(', ')} (pageGroups, pages and the others listed in contents)`,
    'a page group id, such as "group-home"',
    'a page id, such as "page-home"',
    'a block id, such as "header"'
  ]

  // Where each part was first sent in this run (see sentFrom), and whether a read of it in this call is a repeat.
  const sentAt = new Map()
  const repeatOf = (id, call) => (sentAt.has(id) && sentAt.get(id) < call ? sentAt.get(id) : undefined)
  const alreadySent = (id, at) =>
    JSON.stringify({
      alreadySent: id,
      detail:
        at === IN_FIRST_MESSAGE
          ? `"${id}" was already sent in the first message of this conversation; read it there.`
          : `"${id}" was already sent in the answer to your call ${at} of this conversation; read it there.`
    })

  const whole = (id) => {
    if (byId.has(id)) return JSON.stringify(byId.get(id))
    if (tooLarge.includes(id))
      return JSON.stringify({
        error: 'PART_TOO_LARGE',
        id,
        detail: `"${id}" is too large to read whole: read each entry by its own id (each block id is listed in "contents").`
      })
    return JSON.stringify({ error: 'UNKNOWN_PART', id, validIds })
  }
  /**
   * One part as read in model call `call`: the part, or a short note when it was already sent before this call. A
   * part read in full is recorded as sent in this call (the same call may read it again in full: a resumed run runs
   * the last call's tools once more). Without `call` nothing is tracked.
   */
  const read = (id, call) => {
    if (call === undefined) return whole(id)
    const at = repeatOf(id, call)
    if (at !== undefined) return { text: alreadySent(id, at), repeated: true }
    if (byId.has(id) && !sentAt.has(id)) sentAt.set(id, call)
    return { text: whole(id), repeated: false }
  }
  return {
    contents,
    has: (id) => byId.has(id),
    read: (id) => whole(id),
    /** Record parts sent before any call, such as "contents" in the first message. */
    sentFrom(ids, at = IN_FIRST_MESSAGE) {
      for (const id of ids) if (byId.has(id) && !sentAt.has(id)) sentAt.set(id, at)
    },
    /** One part read in model call `call`: { text, repeated }. */
    readIn: (id, call) => read(id, call),
    /**
     * Several parts as one JSON object by id; past READ_MANY_LIMIT characters the rest are listed in notRead (and not
     * recorded as sent). With `call`: { text, repeated }, repeated when every id was already sent; without it the text.
     */
    readMany(ids, call) {
      const parts = []
      let size = 2
      const notRead = []
      let repeats = 0
      for (const id of ids) {
        if (notRead.length) {
          notRead.push(id)
          continue
        }
        const repeat = call === undefined ? undefined : repeatOf(id, call)
        const text = repeat !== undefined ? alreadySent(id, repeat) : whole(id)
        if (parts.length && size + text.length > READ_MANY_LIMIT) {
          notRead.push(id)
          continue
        }
        if (repeat !== undefined) repeats++
        else if (call !== undefined && byId.has(id) && !sentAt.has(id)) sentAt.set(id, call)
        parts.push(`${JSON.stringify(id)}:${text}`)
        size += text.length + id.length + 4
      }
      if (notRead.length)
        parts.push(
          `"notRead":${JSON.stringify(notRead)}`,
          `"detail":${JSON.stringify('These parts did not fit in this answer: read them in another call.')}`
        )
      const text = `{${parts.join(',')}}`
      return call === undefined ? text : { text, repeated: repeats > 0 && repeats === ids.length }
    }
  }
}

function list(value) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry.id === 'string') : []
}

/**
 * The two tools the planner works with, in the shape runAgent takes.
 * @param {any} doc the kit
 * @param {{ images?: { open: (id: string) => Promise<any> } | null, imageTool?: boolean, history?: object[],
 *   inFirstMessage?: string[] }} [options] the kit's
 *   images, made ready by kit-images.js `ensure`; without them open_kit_image answers that images are not available.
 *   `imageTool: false` (a model given no images, door.js) leaves open_kit_image out: only read_kit_part is offered.
 *   `history`: the run's saved turns; their read_kit_part calls are replayed (answers dropped), so a resumed run knows
 *   which parts it already sent. `inFirstMessage`: the part ids the first message carries ("contents").
 */
export function kitTools(doc, { images, imageTool = true, history = [], inFirstMessage = [] } = {}) {
  const parts = kitParts(doc)
  parts.sentFrom(inFirstMessage)
  const imageIds = new Set(list(doc.images).map((image) => image.id))
  const idParameter = (description) => ({
    type: 'object',
    properties: { id: { type: 'string', description } },
    required: ['id'],
    additionalProperties: false
  })
  const badId = (tool) =>
    JSON.stringify({ error: 'INVALID_ARGUMENTS', tool, detail: 'id must be a non-empty string' })
  const tools = [
    {
      name: KIT_TOOL_NAMES.readPart,
      description:
        'Read parts of the template kit as JSON: one by its id, or several in one call by ids. Start with "contents", which lists every id.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description:
              'One part id: "contents", "site", "site.<key>", "pageGroups", "pages", a page group id, a page id or a block id.'
          },
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Several part ids, read in one call and answered as one JSON object by id.'
          }
        },
        additionalProperties: false
      },
      // `call`: the model call that asked (runAgent's second argument); without it nothing is tracked.
      run: ({ id, ids }, { call } = {}) => {
        if (Array.isArray(ids) && ids.length && ids.every((i) => typeof i === 'string' && i !== ''))
          return parts.readMany(id ? [id, ...ids] : ids, call)
        if (ids === undefined && typeof id === 'string' && id !== '')
          return call === undefined ? parts.read(id) : parts.readIn(id, call)
        return JSON.stringify({
          error: 'INVALID_ARGUMENTS',
          tool: KIT_TOOL_NAMES.readPart,
          detail: 'give id (a non-empty string) or ids (a non-empty list of non-empty strings)'
        })
      }
    },
    {
      name: KIT_TOOL_NAMES.openImage,
      description: 'Open one kit image by its id (the ids a page or a block lists under images).',
      parameters: idParameter('An image id, such as "header-1440".'),
      run: ({ id }) =>
        typeof id !== 'string' || id === ''
          ? badId(KIT_TOOL_NAMES.openImage)
          : images
            ? images.open(id)
            : JSON.stringify({
                error: 'IMAGES_NOT_AVAILABLE',
                id,
                known: imageIds.has(id),
                detail: 'Kit images are not available on this bench yet. Continue from the kit text.'
              })
    }
  ]
  replayReads(tools[0], history)
  return imageTool ? tools : tools.slice(0, 1)
}

// Run every read_kit_part call of the saved answered turns again, in order, dropping the answers: the tool then holds
// where each part was first sent, as it did when those calls were made.
function replayReads(readPart, history) {
  for (const turn of history) {
    if (turn?.state !== 'answered') continue
    for (const c of turn.message?.tool_calls ?? []) {
      if (c?.function?.name !== readPart.name) continue
      let args
      try {
        args = c.function.arguments ? JSON.parse(c.function.arguments) : {}
      } catch {
        continue
      }
      if (args && typeof args === 'object' && !Array.isArray(args)) readPart.run(args, { call: turn.n })
    }
  }
}

/** The part ids the first message of a run that reads with tools carries (firstUserMessage). */
export const FIRST_MESSAGE_PARTS = Object.freeze(['contents'])

/**
 * The first user message of a run that reads the kit with tools: how to use the two tools (the approved prompt names
 * neither) and, when the kit has looks, where they are read, then the kit's "contents" (so the first call need not
 * read it), then the brief: the kit before the brief, as in a preloaded message. `imageTool: false` (a model given no
 * images, door.js): only the part tool is described, and the message says there are no images and the looks stand in.
 * @param {{ kit: { ref: string, doc: any }, brief: object, imageTool?: boolean }} input
 */
export function firstUserMessage({ kit, brief, imageTool = true }) {
  const { readPart, openImage } = KIT_TOOL_NAMES
  const template = kit.doc.template ? ` (template ${kit.doc.template.name} ${kit.doc.template.version})` : ''
  const hasLooks = [...list(kit.doc.pages), ...list(kit.doc.blocks)].some((item) => lookTextOf(item.look))
  return [
    `Input 2, the template kit, is ${kit.ref}${template}. Only its "contents" is in this message, below: read the rest part by part with your ${imageTool ? 'two tools' : 'tool'}.`,
    '',
    `- ${readPart} answers parts of the kit as JSON. "contents", below, lists what the kit holds and every part id. Read the parts as your work reaches them: "site" (the site-wide parts; a large one is named there by its own id, such as "site.fixedTexts"), "pageGroups", "pages", a page group id, a page id or a block id. Give it one id, or several as ids (a list) to read them in one call.`,
    `- A part is sent once per conversation: reading it again answers where it was already sent, and you read it there.`,
    ...(hasLooks
      ? [
          `- "contents" also gives the look of every page and block that has one, and a page or block part carries its own: plan from these looks.`
        ]
      : []),
    ...(imageTool
      ? [
          `- ${openImage}(id) opens one kit image by its id. Where your instructions say "the image tool", they mean ${openImage}. Open an image only where your instructions say a look cannot settle a decision.`,
          '- You may call the tools several times in the same turn: ask for every part and image you need next at once, rather than one per turn.'
        ]
      : [
          NO_IMAGES_LINE,
          `- You may call ${readPart} several times in the same turn: ask for every part you need next at once, rather than one per turn.`
        ]),
    '',
    'The kit\'s "contents":',
    '',
    JSON.stringify(kitParts(kit.doc).contents),
    '',
    'Input 1, the brief, is this JSON:',
    '',
    JSON.stringify(brief)
  ].join('\n')
}

const NO_IMAGES_LINE =
  '- Kit images are not available to you in this run, and there is no image tool. Where your instructions say to open an image, plan from the looks instead: every page and block has one.'

/**
 * The kit block that opens a preloaded first message: what the kit is, that it is all here and the run has no tools,
 * then the whole planner view of the kit as one compact JSON object. It depends on the kit alone (no run, brief or
 * time), so every run on the same kit version sends the same bytes and the provider's prefix cache can reuse them.
 * @param {{ ref: string, doc: any }} kit
 */
export function preloadedKitBlock(kit) {
  const template = kit.doc.template ? ` (template ${kit.doc.template.name} ${kit.doc.template.version})` : ''
  return [
    `Input 2, the template kit, is ${kit.ref}${template}. The whole kit is included below, as one JSON object: every part your instructions name is in it, each page's and block's look as its text. There are no tools in this run: nothing to read or open, everything you need is in this message.`,
    '',
    NO_IMAGES_LINE,
    '',
    'The template kit:',
    '',
    JSON.stringify(compactForPlanner(kit.doc))
  ].join('\n')
}

/**
 * The first user message of a run whose model is given no images: the kit block (preloadedKitBlock), then the brief,
 * then the instruction to write the plan. The run sends no tools, so the first answer must be the plan.
 * @param {{ kit: { ref: string, doc: any }, brief: object }} input
 */
export function preloadedFirstMessage({ kit, brief }) {
  return [
    preloadedKitBlock(kit),
    '',
    'Input 1, the brief, is this JSON:',
    '',
    JSON.stringify(brief),
    '',
    WRITE_PLAN_INSTRUCTION
  ].join('\n')
}
