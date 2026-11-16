// The refusals of the memory site's doors (ticket #597), each a rule measured on a real blank site or stated by the
// plugin's own reference, so a plan or a step that breaks one fails its test. Sources:
// docs/references/ai-quickstart-contract.md ("The blank site contract", "hides"), scripts/ai-quickstart/door-proof.mjs
// and door-limits.mjs (#584), and the plugin's refusal codes (apps/tracy-web/src/api-reference/errors.js).
//
//   content.contract   REVISION_REQUIRED / REVISION_STALE    an apply names the revision its inspect read
//                      SLOT_UNKNOWN                         a slot of a removed record, or no slot at all
//                      SLOT_NOT_CONTENT                     `<`, `>` or a C0 control but tab and line ends; a Joomla
//                                                           plugin code (`{loadposition x}`); a straight double quote
//                                                           in a slot that opens empty
//                      HTML_SLOT_MISSING                    an empty string at a text node
//                      SLOT_EMPTY_STATE                     filling a slot whose sample is empty without `opensEmpty`,
//                                                           or emptying a slot whose sample is not empty
//                      SLOT_TOO_LONG                        over the slot's limit, counted as the plugin counts
//                                                           it (`doorLength`: what a visitor reads, a raw column raw)
//                      MARKERS_PRINTED_AS_WORDS             content map markers at an HTML slot (memory only: the real
//                                                           site stores them and prints them as words)
//                      SLOT_NOT_REMOVABLE                   a `removes` slot that is no node of an HTML value
//                      MODULE_TITLE_REQUIRED                a module whose title the blank site emptied, written
//                                                           without its title in the same apply
//                      SLOT_IMAGE_INVALID / SLOT_IMAGE_OPAQUE  a picture not of the shape or ground an image slot
//                                                           declares (`write-order-memory-image.mjs`)
//   content.update     write_failed                         a new article, category or module with no title or a
//                                                           blank one, a new contact missing its name, params,
//                                                           metadata or metadesc column (an empty or blank name is
//                                                           written), a new menu item with no link or an empty one
//                                                           (`creating a menuItem needs link`), an assignment whose
//                                                           menuids is no JSON list
//                                                           (measured on plugin 0.24.85: no code of its own); an
//                                                           article write naming no column the door writes
//                                                           (`draft-write-door-columns.mjs`)
//                      bad_params                           an assignment with no menuids (measured)
//                      NOT_FOUND                            a record, or the module of an assignment, that does not exist
//   every write        APPLY_ID_REQUIRED                    no apply id
import { isTextNode } from './draft-write-codec.mjs'
import { doorLength } from './draft-write-length.mjs'
import { decodeEntities } from './draft-write-entities.mjs'
import { doorKept, DOOR_COLUMNS } from './draft-write-door-columns.mjs'
import { imageSlotRefusal } from './write-order-memory-image.mjs'

// oxlint-disable-next-line no-control-regex -- the bytes the plugin refuses in a slot
const MARKUP = /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/
/** A Joomla content plugin code, as the plugin reads one (its identity tokens aside: the memory site has none). */
const DIRECTIVE = /\{\/?[a-z][^{}]*\}/i
// oxlint-disable-next-line no-control-regex -- the control characters the site name loses
const CONTROL = /[\u0000-\u001f\u007f]/g

/**
 * `site.identity` stores the site name with `<` and `>` taken out and every character reference read (measured), and
 * without control characters (the real run read another site name back than a name with them was sent).
 */
export const storedIdentity = (key, value) =>
  key === 'sitename' ? decodeEntities(String(value).replace(/[<>]/g, '').replace(CONTROL, '')) : value

/**
 * The fields a record is stored with. Only the columns the door writes for its kind (`doorKept`: an article's
 * `created` and `created_by_alias` are dropped, measured). The alias: Joomla with unicode slugs off
 * (`OutputFilter::stringURLSafe`) folds what it is sent, accents off, lower case, every other character (a letter of
 * another script too, with no transliterator) a hyphen. An alias already in that form is kept as it is.
 */
export function storedFields(sent, kind = null) {
  const fields = kind ? doorKept(kind, sent) : sent
  if (typeof fields?.alias !== 'string' || fields.alias === '') return fields
  const alias = fields.alias
    .replace(/-/g, ' ')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/(\s|[^a-z0-9-])+/g, '-')
    .replace(/^-+|-+$/g, '')
  return { ...fields, alias }
}

export class DoorRefusal extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`)
    this.code = code
  }
}
const refuse = (code, message) => {
  throw new DoorRefusal(code, message)
}
const blank = (value) => String(value ?? '').trim() === ''

/** Refuse a contract apply the plugin refuses; nothing is written, the revision does not move. */
export function checkContract({ expectedRevision, changes, removes }, { slots, revision, modules, uploads }) {
  if (expectedRevision === undefined || expectedRevision === null)
    refuse('REVISION_REQUIRED', 'an apply names the revision its inspect read')
  if (expectedRevision !== revision) refuse('REVISION_STALE', `read ${expectedRevision}, now ${revision}`)
  for (const [key, value] of Object.entries(changes)) {
    const slot = slots.get(key)
    if (!slot) refuse('SLOT_UNKNOWN', key)
    const text = String(value)
    // The plugin's own two content rules (`QuickstartContract::checkValue`, seen on the real run of 0.24.85).
    if (MARKUP.test(text)) refuse('SLOT_NOT_CONTENT', `Markup and control characters are not content: ${key}`)
    if (DIRECTIVE.test(text)) refuse('SLOT_NOT_CONTENT', `Joomla plugin directives are not content: ${key}`)
    if (slot.opensEmpty && text.includes('"')) refuse('SLOT_NOT_CONTENT', `${key} holds a straight quote`)
    if (text === '' && isTextNode(slot)) refuse('HTML_SLOT_MISSING', key)
    if (blank(slot.sample) && !slot.opensEmpty && !blank(text))
      refuse('SLOT_EMPTY_STATE', `${key}: Content cannot activate an empty slot`)
    if (!blank(slot.sample) && blank(text))
      refuse('SLOT_EMPTY_STATE', `${key}: Content cannot remove an occupied slot`)
    if (slot.maxCharacters && doorLength(slot, text) > slot.maxCharacters) refuse('SLOT_TOO_LONG', key)
    if (slot.xpath && /\(\(\/?[a-z]/i.test(text)) refuse('MARKERS_PRINTED_AS_WORDS', key)
    const picture = imageSlotRefusal(slot, text, uploads)
    if (picture) refuse(picture.code, picture.message)
  }
  for (const key of removes) {
    if (!slots.has(key)) refuse('SLOT_UNKNOWN', key)
    if (!slots.get(key).xpath || isTextNode(slots.get(key)) || /@[\w-]+$/.test(slots.get(key).xpath))
      refuse('SLOT_NOT_REMOVABLE', `${key} is no element of an HTML value`)
  }
  const touched = new Set(
    Object.keys(changes)
      .map((k) => slots.get(k).entity)
      .filter((e) => e.startsWith('module-'))
  )
  for (const entity of touched) {
    const row = modules.get(Number(entity.slice(7)))
    const titleSlot = [...slots.values()].find((s) => s.entity === entity && s.column === 'title')
    if (row && blank(row.title) && !(titleSlot && titleSlot.key in changes))
      refuse('MODULE_TITLE_REQUIRED', `${entity}: Module must have a title`)
  }
}

const NAMED = {
  article: ['title', 'COM_CONTENT_WARNING_PROVIDE_VALID_NAME'],
  category: ['title', 'creating a category needs title'],
  module: ['title', 'Module must have a title.'],
  // An alias item with an empty link is refused too; `index.php?Itemid=` is written (measured, fact K3).
  menuItem: ['link', 'creating a menuItem needs link']
}
/** The columns a new contact has no default for, in the order Joomla names them. */
const CONTACT_COLUMNS = ['name', 'params', 'metadata', 'metadesc']

/** Refuse a record write the site refuses (measured on plugin 0.24.85: every refusal is `write_failed`). */
export function checkUpdate({ kind, id, fields }, records) {
  if (kind === 'moduleAssignment') {
    if (!records.module.has(Number(id))) refuse('NOT_FOUND', `module ${id}`)
    if (!fields || !('menuids' in fields)) refuse('bad_params', 'fields required')
    let menuids = null
    try {
      menuids = JSON.parse(fields.menuids)
    } catch {}
    if (!Array.isArray(menuids)) refuse('write_failed', 'menuids must be a JSON array')
    return
  }
  if (!records[kind]) refuse('KIND_UNKNOWN', kind)
  if (DOOR_COLUMNS[kind] && !Object.keys(fields ?? {}).some((c) => DOOR_COLUMNS[kind].includes(c)))
    refuse('write_failed', `no writable column for kind ${kind}`)
  if (Number(id) !== 0) {
    if (!records[kind].has(Number(id))) refuse('NOT_FOUND', `${kind} ${id}`)
    return
  }
  // A contact's name may be empty or a space: the site writes it (measured); only a missing column is refused.
  if (kind === 'contact')
    for (const column of CONTACT_COLUMNS)
      if (fields?.[column] === undefined)
        refuse('write_failed', `Field '${column}' doesn't have a default value`)
  if (NAMED[kind] && blank(fields?.[NAMED[kind][0]])) refuse('write_failed', NAMED[kind][1])
}
