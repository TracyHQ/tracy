// The refusals of the memory site's doors (ticket #597), each a rule measured on a real blank site or stated by the
// plugin's own reference, so a plan or a step that breaks one fails its test. Sources:
// docs/references/ai-quickstart-contract.md ("The blank site contract", "hides"), scripts/ai-quickstart/door-proof.mjs
// and door-limits.mjs (#584), and the plugin's refusal codes (apps/tracy-web/src/api-reference/errors.js).
//
//   content.contract   REVISION_REQUIRED / REVISION_STALE    an apply names the revision its inspect read
//                      SLOT_UNKNOWN                         a slot of a removed record, or no slot at all
//                      SLOT_NOT_CONTENT                     `<` or `>`; a straight double quote in a slot that opens empty
//                      HTML_SLOT_MISSING                    an empty string at a text node
//                      SLOT_EMPTY_STATE                     filling a slot whose sample is empty without `opensEmpty`,
//                                                           or emptying a slot whose sample is not empty
//                      SLOT_TOO_LONG                        over the slot's limit
//                      MARKERS_PRINTED_AS_WORDS             content map markers at an HTML slot (memory only: the real
//                                                           site stores them and prints them as words)
//                      SLOT_NOT_REMOVABLE                   a `removes` slot that is no node of an HTML value
//                      MODULE_TITLE_REQUIRED                a module whose title the blank site emptied, written
//                                                           without its title in the same apply
//   content.update     MODULE_TITLE_REQUIRED                a new module with no title
//                      TITLE_REQUIRED                       a new article or category with no title, a contact with
//                                                           no name (Joomla's own table check; not measured in #584,
//                                                           the plugin's answer code is not stated)
//                      NOT_FOUND                            a record, or the module of an assignment, that does not exist
//   every write        APPLY_ID_REQUIRED                    no apply id
import { isTextNode } from './draft-write-codec.mjs'

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
export function checkContract({ expectedRevision, changes, removes }, { slots, revision, modules }) {
  if (expectedRevision === undefined || expectedRevision === null)
    refuse('REVISION_REQUIRED', 'an apply names the revision its inspect read')
  if (expectedRevision !== revision) refuse('REVISION_STALE', `read ${expectedRevision}, now ${revision}`)
  for (const [key, value] of Object.entries(changes)) {
    const slot = slots.get(key)
    if (!slot) refuse('SLOT_UNKNOWN', key)
    const text = String(value)
    if (/[<>]/.test(text)) refuse('SLOT_NOT_CONTENT', `${key} holds a tag`)
    if (slot.opensEmpty && text.includes('"')) refuse('SLOT_NOT_CONTENT', `${key} holds a straight quote`)
    if (text === '' && isTextNode(slot)) refuse('HTML_SLOT_MISSING', key)
    if (blank(slot.sample) && !slot.opensEmpty && !blank(text))
      refuse('SLOT_EMPTY_STATE', `${key}: Content cannot activate an empty slot`)
    if (!blank(slot.sample) && blank(text))
      refuse('SLOT_EMPTY_STATE', `${key}: Content cannot remove an occupied slot`)
    if (slot.maxCharacters && text.length > slot.maxCharacters) refuse('SLOT_TOO_LONG', key)
    if (slot.xpath && /\(\(\/?[a-z]/i.test(text)) refuse('MARKERS_PRINTED_AS_WORDS', key)
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

const NAMED = { article: 'title', category: 'title', contact: 'name', module: 'title' }

/** Refuse a record write the site refuses. */
export function checkUpdate({ kind, id, fields }, records) {
  if (kind === 'moduleAssignment') {
    if (!records.module.has(Number(id))) refuse('NOT_FOUND', `module ${id}`)
    return
  }
  if (!records[kind]) refuse('KIND_UNKNOWN', kind)
  if (Number(id) !== 0) {
    if (!records[kind].has(Number(id))) refuse('NOT_FOUND', `${kind} ${id}`)
    return
  }
  const named = NAMED[kind]
  if (named && blank(fields?.[named]))
    refuse(kind === 'module' ? 'MODULE_TITLE_REQUIRED' : 'TITLE_REQUIRED', `a new ${kind} has no ${named}`)
}
