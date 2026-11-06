// Fixtures for the hide stage through the write step's entry point (ADR 0044, decisions 2 and 4). `hideDoor` answers the
// plugin's three hide orders on the fake site of `_write-step-run.mjs`, including its refusal of a write with no apply id.
// Everything is invented: the demo-gym kit and plan, and a made-up language constant.
import { copy, KIT, plan, runStep } from './_write-step-run.mjs'

export const stale = { ok: false, error: 'contract_failed', message: 'Content changed; inspect again' }

/**
 * @param {{ notModules?: string[], busyOnce?: boolean, refusedConstants?: Record<string, string>,
 *   languageStrings?: string[], overrides?: Record<string, string> }} [script] `languageStrings`: constants the contract
 *   also names as a row, so writing one moves the revision.
 */
export function hideDoor(script = {}) {
  let busy = script.busyOnce === true
  return (call, { records, revision }) => {
    const { operation } = call.params
    const isBlocks = call.action === 'content.contract' && operation === 'blocks.unpublish'
    const isSource = call.action === 'template.languageOverrides'
    if (!isBlocks && !isSource) return null
    if (!call.params.apply_id) return { ok: false, error: 'bad_params', message: 'apply_id required' }
    if (busy) {
      busy = false
      return { ok: false, error: 'writer_busy', message: 'Another write is running' }
    }
    if (isSource) {
      if (operation !== 'setSource') return { ok: false, error: 'bad_params', message: 'Unknown operation' }
      const refused = []
      for (const [key, value] of Object.entries(call.params.strings)) {
        const reason = script.refusedConstants?.[key]
        if (reason) refused.push({ key, reason })
        else {
          script.overrides[key] = value
          if (script.languageStrings?.includes(key)) revision.now = `${revision.now}+words`
        }
      }
      return { ok: true, refused }
    }
    if (!String(call.params.apply_id).startsWith('contract-') || !call.params.request_id)
      return { ok: false, error: 'contract_failed', message: 'apply_id must start with contract-' }
    if (call.params.expected_revision !== revision.now) return stale
    const unknown = call.params.blocks.filter((key) => script.notModules?.includes(key))
    if (unknown.length)
      return {
        ok: false,
        error: 'contract_failed',
        message: 'Not a module of this contract',
        errors: unknown.map((key) => ({
          code: 'BLOCK_UNKNOWN',
          message: `Not a module of this contract: ${key}`,
          field: { slotKey: key }
        }))
      }
    for (const key of call.params.blocks) {
      const [kind, id] = key.split('-')
      records.set(key, { ...records.get(key), kind, id: Number(id), published: 0 })
    }
    revision.now = `${revision.now}+blocks`
    return { ok: true, unpublished: call.params.blocks, already: [], afterRevision: revision.now }
  }
}

/** The kit with block-4 as a module the plan drops, and pages for the plan's own page ids. */
export function hideKit() {
  const kit = KIT()
  const block = (id) => kit.doc.blocks.find((b) => b.id === id)
  block('block-4').source = { entity: 'module-4' }
  block('block-2').source = { entity: 'module-2' }
  kit.doc.pages = [
    { id: 'page-home', path: '/', blocks: { 1440: ['block-1', 'block-2', 'block-3', 'block-4', 'block-6'] } },
    { id: 'page-about', path: '/about-us', blocks: { 1440: ['block-1', 'block-5', 'block-6'] } },
    { id: 'page-old', path: '/about-us/old', blocks: { 1440: ['block-1', 'block-6'] } }
  ]
  return kit
}

/** The entry point on the fake site with the hide door, on the invented kit and files. */
export function runHide({ files = {}, kit = hideKit(), door = {}, site = {}, deps = {} } = {}) {
  const overrides = {}
  return runStep(
    { plan: plan(), copy: copy(), ...files },
    {
      hideDoor: hideDoor({ overrides, ...door }),
      ...site
    },
    { kit, ...deps }
  ).then((run) => ({ ...run, overrides }))
}

/** One fixed sentence on block-2, as the kit lists it: `blocks[].fixedText` carries the id a plan names. */
export function withFixedText(kit, entry) {
  kit.doc.blocks.find((b) => b.id === 'block-2').fixedText = [entry]
  return kit
}

export const fixedSentence = (constant = 'TPL_MADE_UP_SENTENCE', over = {}) => ({
  id: 'block-2.fixed-made-up',
  text: 'A made up sentence',
  canHide: true,
  source: { file: 'language/en-GB/made-up.ini', constant, constants: [constant] },
  hiddenBy: { setting: 'cms language override', constant, value: '' },
  ...over
})

/** Writes a report's hidden list onto a plan: `slots` become hiddenSlots of the first kept block of the home page. */
export function planHiding(slots) {
  const p = plan()
  p.pages[0].blocks[0].hiddenSlots = [
    ...p.pages[0].blocks[0].hiddenSlots,
    ...slots.map((slot) => ({ slot, why: 'not in the brief' }))
  ]
  return p
}
