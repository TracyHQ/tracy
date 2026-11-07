// Shared: contract-mapping.js reads it for a WordPress kit, so it lives in lib/ (module-graph.test.mjs).
// Exports a site-copy/1 file (ADR 0042) as the mapping the WordPress content contract door accepts (#463): the
// Claude Cowork plugin's `content.contract {operation:'apply', changes}`, as the seeder sends it
// (packages/cms/tracy-seeder/src/wordpress-contract-door.mjs). A change is keyed by the content map slot key; the door
// finds the slot's block by its `metadata.name` (`target: { block, attr }`, or an `option`) and writes one text node,
// so a value is plain text: no content map codes, no tags, no line breaks, and no Joomla emphasis markup (a WordPress
// slot stores no `jatools-config` and no HTML value the emphasis stage could fill: emphasis-markup.js `storageOf` reads
// every one as `unknown`). `targets` names where each change lands, for the reader of the export.
//
// A copy slot the door cannot take is a problem, never a change: a key the content map does not hold, or a slot that
// is not text (an image, a url). The main menu labels are not content map slots: they ride in `extras.mainMenu`, for
// step 9. Pure: no I/O, nothing is written anywhere.
import { readCopy } from '../site-copy-view.js'
import { visibleText } from './emphasis-markup.js'

/**
 * @param {{ copy: object, contract: string, revision: string, brief?: object, contentMap?: object | null,
 *   menuSlots?: Set<string> }} input `menuSlots`: the main menu label slots, which go to step 9 and not to the door
 * @returns {{ mapping: object, problems: object[] }}
 */
export function wordpressContractMapping({
  copy,
  contract,
  revision,
  brief,
  contentMap,
  menuSlots = new Set()
}) {
  const { view, problems } = readCopy(copy)
  const slots = new Map((contentMap?.slots ?? []).map((s) => [s?.key, s]))
  const facts = new Map((brief?.facts ?? []).map((f) => [f.id, f.value]))
  const changes = {}
  const targets = {}
  const evidence = {}
  for (const s of view.slots) {
    if (menuSlots.has(s.slot)) continue
    const slot = slots.get(s.slot)
    if (!slot) {
      problems.push({
        where: s.slot,
        detail: 'no slot of the WordPress content map has this key: not written'
      })
      continue
    }
    if (slot.type !== 'text') {
      problems.push({
        where: s.slot,
        detail: `a ${slot.type} slot: the writer's words are not written into it`
      })
      continue
    }
    // Paragraphs and bullets of one slot are one text node on WordPress: their words, a space between.
    const value = visibleText(s.items.join(' '))
    const max = Number(slot.maxCharacters ?? 0)
    if (max > 0 && value.length > max)
      problems.push({ where: s.slot, detail: `${value.length} characters, over the slot's ${max}` })
    changes[s.slot] = value
    targets[s.slot] = {
      entity: slot.entity,
      ...slot.target,
      type: slot.type,
      maxCharacters: slot.maxCharacters
    }
    if (s.factIds.length) {
      const cited = s.factIds.map((id) => (facts.has(id) ? `${id}: ${facts.get(id)}` : id))
      evidence[s.slot] = `Brief facts: ${cited.join('; ')}`
    }
  }
  return {
    mapping: {
      platform: 'wordpress',
      contract,
      revision,
      changes,
      targets,
      evidence,
      pending: [],
      emptyLinks: []
    },
    problems
  }
}
