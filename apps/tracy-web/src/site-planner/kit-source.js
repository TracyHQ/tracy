// The template kits the site planner bench can read (ADR 0041, #301), and the kit as the planner sees it: one part at
// a time through the read_kit_part tool, never the whole 2 MB file in one message. The kits are the template-kit.json
// files beside the contract profiles the image ships (lib/contracts.js, lib/template-kit/reader.js).
//
// Part ids: "contents" (what the kit holds and every id below), "site" (the site-wide parts, each large one replaced
// by the id that reads it), "site.<key>" (one site-wide part in full), any other top-level list or object small enough
// to read whole ("pageGroups", "pages", "templateGaps", ...), a page group id, a page id and a block id. A part is
// answered as compact JSON, unchanged from the kit. Kit images are not served yet (#302): open_kit_image says so.
import { defaultContracts } from '../lib/contracts.js'
import { kitOfContract } from '../lib/template-kit/reader.js'

export const KIT_TOOL_NAMES = Object.freeze({ readPart: 'read_kit_part', openImage: 'open_kit_image' })

/** A top-level part larger than this is read by its entries' ids instead (today only "blocks", about 900 kB). */
const PART_LIMIT = 120_000
/** Inside "site", a part larger than this is named, not inlined (brand colours and fixed texts on JA Boxing). */
const SITE_INLINE_LIMIT = 20_000

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

/** One readable kit by its ref (the contract id, e.g. "ja-boxing/j6/1.0.10"), or null. */
export function openKit(ref, { index = defaultContracts() } = {}) {
  if (typeof ref !== 'string' || ref === '') return null
  for (const contract of index.values()) {
    if (contract.id !== ref) continue
    const kit = kitOfContract(contract)
    return kit.state === 'read' ? { ref, doc: kit.doc } : null
  }
  return null
}

/** The kit's parts by id, and `read(id)`: the part as compact JSON, or an error result as JSON. */
export function kitParts(doc) {
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
    pages: list(doc.pages).map((p) => ({ id: p.id, group: p.group, path: p.path, inMainMenu: p.inMainMenu })),
    blocks: list(doc.blocks).map((b) => ({ id: b.id, role: b.role, shared: b.shared })),
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

  return {
    contents,
    has: (id) => byId.has(id),
    read(id) {
      if (byId.has(id)) return JSON.stringify(byId.get(id))
      if (tooLarge.includes(id))
        return JSON.stringify({
          error: 'PART_TOO_LARGE',
          id,
          detail: `"${id}" is too large to read whole: read each entry by its own id (each block id is listed in "contents").`
        })
      return JSON.stringify({ error: 'UNKNOWN_PART', id, validIds })
    }
  }
}

function list(value) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry.id === 'string') : []
}

/** The two tools the planner works with, in the shape runAgent takes. */
export function kitTools(doc) {
  const parts = kitParts(doc)
  const imageIds = new Set(list(doc.images).map((image) => image.id))
  const idParameter = (description) => ({
    type: 'object',
    properties: { id: { type: 'string', description } },
    required: ['id'],
    additionalProperties: false
  })
  const badId = (tool) =>
    JSON.stringify({ error: 'INVALID_ARGUMENTS', tool, detail: 'id must be a non-empty string' })
  return [
    {
      name: KIT_TOOL_NAMES.readPart,
      description:
        'Read one part of the template kit by its id, as JSON. Start with "contents", which lists every id.',
      parameters: idParameter(
        'A part id: "contents", "site", "site.<key>", "pageGroups", "pages", a page group id, a page id or a block id.'
      ),
      run: ({ id }) => (typeof id === 'string' && id !== '' ? parts.read(id) : badId(KIT_TOOL_NAMES.readPart))
    },
    {
      name: KIT_TOOL_NAMES.openImage,
      description: 'Open one kit image by its id (the ids a page or a block lists under images).',
      parameters: idParameter('An image id, such as "header-1440".'),
      run: ({ id }) =>
        typeof id === 'string' && id !== ''
          ? JSON.stringify({
              error: 'IMAGES_NOT_AVAILABLE',
              id,
              known: imageIds.has(id),
              detail: 'Kit images are not available on this bench yet. Continue from the kit text.'
            })
          : badId(KIT_TOOL_NAMES.openImage)
    }
  ]
}

/**
 * The first user message of a run: how to use the two tools (the approved prompt names neither), then the brief.
 * @param {{ kit: { ref: string, doc: any }, brief: object }} input
 */
export function firstUserMessage({ kit, brief }) {
  const { readPart, openImage } = KIT_TOOL_NAMES
  const template = kit.doc.template ? ` (template ${kit.doc.template.name} ${kit.doc.template.version})` : ''
  return [
    `Input 2, the template kit, is ${kit.ref}${template}. It is not in this message: read it part by part with your two tools.`,
    '',
    `- ${readPart}(id) answers one part of the kit as JSON. Start with ${readPart}("contents"): it lists what the kit holds and every part id. Then read the parts as your work reaches them, one id per call: "site" (the site-wide parts; a large one is named there by its own id, such as "site.fixedTexts"), "pageGroups", "pages", a page group id, a page id or a block id.`,
    `- ${openImage}(id) opens one kit image by its id. Where your instructions say "the image tool", they mean ${openImage}.`,
    '',
    'Input 1, the brief, is this JSON:',
    '',
    JSON.stringify(brief, null, 2)
  ].join('\n')
}
