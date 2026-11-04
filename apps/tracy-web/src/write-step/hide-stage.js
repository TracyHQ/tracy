// The hide stage (ADR 0044, decisions 2 and 4). A slot the plan hides leaves the page, never by CSS. Page frame first: the
// items of dropped pages, the fixed sentences, the dropped blocks. The hidden slots themselves go with the one contract call
// (contract-write.js), so this stage only hands over their list. The main menu items the plan hides stay the page settings
// stage's, which keeps them from being unpublished twice; an item a kept page depends on is taken out of its list here and
// reported. A slot whose row or element can go leaves the stored field with it (`rows.remove`), so its box goes too; that cannot
// be undone on the site. An older plugin silently ignores `empty_slots`, so `info.hide_ops` is read first and every hide line it
// cannot take is failed instead of pretended. Whatever is refused is failed in the plugin's words and the rest goes. What the
// last report says is off the site already is not ordered off it again, and its line reads as it did.
import { hideLines } from './hide-lines.js'
import { hideOrders } from './hide-plan.js'
import { dropPages, emptyConstants, hideOpsOf, removeRows, unpublishBlocks } from './hide-writes.js'
import { NO_LAST } from './no-last-report.js'
import { answerWords } from './settings-door.js'

const MAX_SLOTS = 1500

/** The extras the page settings stage works from: without the menu items left published, and what became of those. */
function settingsPart(extras, menu) {
  const held = new Map()
  for (const entry of menu.values())
    if (entry.refused) held.set(entry.item, { status: 'failed', reason: entry.refused })
  if (!extras?.mainMenu) return { held, settingsExtras: extras }
  const hide = extras.mainMenu.hide?.filter((h) => !held.has(h.item))
  return { held, settingsExtras: { ...extras, mainMenu: { ...extras.mainMenu, hide } } }
}

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, plan: object, owners: Map<string, object>,
 *   extras: object, reading: object, changes: Record<string, string>, contract: string,
 *   sleep: (ms: number) => Promise<void>, last?: object }} input
 * @returns {Promise<{ stop?: object, reading?: object, emptySlots?: string[], settingsExtras?: object, held?: Map<string, object>,
 *   results?: (done: { emptied: Iterable<string>, refused: Map<string, object>, settled: Map<string, object> }) =>
 *   { hides: Map<string, object>, lines: object[] } }>} `settingsExtras`: the extras without the menu items left published;
 *   `held`: what happened to those, by line slot; `results`: the report's view once the later stages have run
 */
export async function runHideStage(input) {
  const { door, siteKey, kit, plan, owners, extras, changes, contract, sleep, last = NO_LAST } = input
  const asksToHide = [...owners.values()].some((c) => c.kind === 'hide')
  const ops = asksToHide ? await hideOpsOf(door, siteKey) : { problem: null, rowsRemove: false }
  const cannotHide = ops.problem
  const order = hideOrders({
    plan,
    kit,
    owners,
    extras,
    reading: input.reading,
    changes,
    cannotHide,
    rowsRemove: ops.rowsRemove,
    last
  })
  const total = Object.keys(changes).length + order.emptySlots.length
  if (total > MAX_SLOTS)
    return {
      stop: {
        code: 'TOO_MANY_SLOTS',
        reason: `${Object.keys(changes).length} slots to write and ${order.emptySlots.length} to empty; one contract call takes ${MAX_SLOTS}.`
      }
    }
  const pages = new Map()
  const gonePage = ({ page }) => last.hidden(page.id)
  for (const entry of order.pages.filter(gonePage)) {
    const { status, reason, ordered, readFrom } = last.line(entry.page.id)
    pages.set(entry.page.id, { status, reason, ordered, readFrom })
  }
  const toDrop = order.pages.filter((entry) => !gonePage(entry))
  let wrote = await dropPages({ door, siteKey, pages: toDrop, results: pages })
  let words = { refusedAll: null, refused: new Map() }
  if (Object.keys(order.strings).length) {
    const template = kit?.template?.name
    words = await emptyConstants({ door, siteKey, strings: order.strings, template, sleep })
    wrote = wrote || !words.refusedAll
  }

  // A menu item, a constant the contract names as a row and a block each can move the revision the next call must name.
  const fresh = async () => {
    const answer = await door.apply({ siteKey, action: 'content.contract', params: { operation: 'inspect' } })
    if (!answer?.ok) throw new Error(answerWords(answer))
    return answer
  }
  let reading = input.reading
  const gone = [...order.blocks].filter(([block]) => last.hidden(block)).map(([, module]) => module)
  let blocks = new Map(gone.map((module) => [module, true]))
  let removed = new Map()
  const modules = cannotHide ? [] : [...order.blocks.values()].filter((module) => !gone.includes(module))
  try {
    if (modules.length) {
      if (wrote) reading = await fresh()
      const { revision } = reading
      const unpublished = await unpublishBlocks({ door, siteKey, modules, revision, contract, sleep })
      blocks = new Map([...blocks, ...unpublished.done])
      wrote = wrote || unpublished.wrote
    }
    if (order.removeSlots.length) {
      if (wrote) reading = await fresh()
      const taken = await removeRows({
        door,
        siteKey,
        slots: order.removeSlots,
        keep: order.keepSlots,
        revision: reading.revision,
        contract,
        sleep
      })
      removed = taken.done
      wrote = taken.wrote
    }
    if (wrote) reading = await fresh()
  } catch (error) {
    return { stop: { code: 'INSPECT_REFUSED', reason: String(error?.message ?? error) } }
  }
  return {
    reading,
    emptySlots: order.emptySlots,
    ...settingsPart(extras, order.menu),
    results: (done) => hideLines({ order, words, blocks, pages, cannotHide, removed, ...done })
  }
}
