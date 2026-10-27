/**
 * The sweep never takes off a block a contract slot writes into (TCH #1013, defect "fresh site drifted").
 *
 * Measured 08/10/2026 on dev, `tamq-7q-tbwp5` and `tamq-7q-tbwp6` (Tracy Base WP 1.1.2, a brief with no mailbox): the four
 * lines of the Contact page's "Contact information" section had no honest replacement, so the sweep cut the whole section.
 * Those four blocks are what the contract's `contact.contact-information.*` slots name; once they are gone the Claude Cowork
 * plugin's inspect reads "Slot …: block … is not in this pattern" as a PROBLEM, and every `content.contract apply` of the
 * site is refused with PRESENTATION_DRIFT — the customer's guided text edits on every page, not only on Contact.
 *
 * The fixture is the Contact page of the released archive (`tracy-base-wp7-database-1.1.2.sql.gz`, post 116), byte for
 * byte: its skeleton hashes to the one the presentation lock pins, which the first test proves.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { seeder } from '../src/lib/seeder.js'
import {
  editBlocks,
  pruneBody,
  slotBlocksByPage,
  sweepWordPress,
  writtenLines
} from '../src/sites/brief-engines/wp-residue.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONTACT = readFileSync(path.join(HERE, 'fixtures', 'tracy-base-wp7-1.1.2-contact.html'), 'utf8')
const contract = contractFor(defaultContracts(), 'tracy-base/wp7', '1.1.2')
const contentMap = JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))
const lock = JSON.parse(readFileSync(path.join(contract.dir, 'presentation-lock.json'), 'utf8'))
const contactSlots = contentMap.slots.filter((/** @type {any} */ s) => s.entity === 'page-contact')

/** The page's skeleton as the plugin hashes it: every text slot masked, the rest byte for byte. */
async function skeletonOf(/** @type {string} */ markup) {
  const { setBlockValue } = await seeder('apply-wordpress-contract')
  let masked = markup
  for (const slot of contactSlots) masked = setBlockValue(masked, slot.target.block, 'content', '{{slot}}')
  return createHash('sha256').update(masked).digest('hex')
}

/** The blocks of the contact slots still on the page: the plugin finds a slot by the first block of its name. */
const slotBlocksLeft = (/** @type {string} */ markup) =>
  contactSlots
    .filter((/** @type {any} */ s) => markup.includes(`"name":"${s.target.block}"`))
    .map((s) => s.key)

/** The four contact lines, each with no honest replacement: what a brief with no mailbox leaves. */
const dropsAll = contactSlots.map((/** @type {any} */ s) => ({
  slug: 'contact',
  block: s.target.block,
  nth: 1,
  sample: s.sample
}))

test('the fixture is the released Contact page: its skeleton is the one the presentation lock pins', async () => {
  assert.equal(await skeletonOf(CONTACT), lock.entities['page-contact'].skeleton)
})

test("the contract's slot blocks are known per page, by the page's slug", () => {
  const keep = slotBlocksByPage(contentMap)
  assert.deepEqual(
    [...(keep.get('contact') ?? [])].sort(),
    contactSlots.map((/** @type {any} */ s) => s.target.block).sort()
  )
  assert.equal(keep.has('privacy-policy'), false, 'a page no slot names keeps nothing')
})

test("a section of slot blocks the words never reached is not cut: it is the customer's to write, through the contract", () => {
  const keep = slotBlocksByPage(contentMap).get('contact')
  const out = pruneBody(CONTACT, { written: writtenLines([]), keep })
  assert.deepEqual(
    slotBlocksLeft(out.markup),
    contactSlots.map((/** @type {any} */ s) => s.key)
  )
  assert.deepEqual(out.cut, [])
  // Without the contract's names, the same section is cut, as before: the rule is unchanged for blocks no slot names.
  assert.equal(pruneBody(CONTACT, { written: writtenLines([]) }).cut.length, 1)
})

test('a static section beside the slot blocks still goes; only what a slot names stays', () => {
  const demo =
    '<!-- wp:group {"className":"demo"} -->\n<div class="wp-block-group demo">\n' +
    '<!-- wp:paragraph -->\n<p>Founded in 2004 near Moscow.</p>\n<!-- /wp:paragraph -->\n' +
    '<!-- wp:paragraph -->\n<p>ISO 9001:2015 certified.</p>\n<!-- /wp:paragraph -->\n</div>\n<!-- /wp:group -->'
  const page = `${CONTACT}\n\n${demo}`
  const out = pruneBody(page, {
    written: writtenLines([]),
    keep: slotBlocksByPage(contentMap).get('contact')
  })
  assert.equal(out.markup.includes('Founded in 2004'), false)
  assert.equal(slotBlocksLeft(out.markup).length, contactSlots.length)
})

test('a slot block with no honest line loses its words and stays; a second block of the same name, which no slot names, goes', () => {
  const keep = new Set(['contact-information.email'])
  const extra =
    '<!-- wp:paragraph {"metadata":{"name":"contact-information.email"}} -->\n<p>hello@tracy-base.example</p>\n<!-- /wp:paragraph -->\n'
  const twice = CONTACT.replace('<!-- wp:heading {} -->', `${extra}<!-- wp:heading {} -->`)
  const out = editBlocks(
    twice,
    [],
    [
      { block: 'contact-information.email', nth: 1, sample: 'hello@tracy-base.example' },
      { block: 'contact-information.email', nth: 2, sample: 'hello@tracy-base.example' }
    ],
    keep
  )
  assert.deepEqual([out.dropped, out.kept, out.held], [2, 0, 0])
  assert.equal(out.markup, CONTACT.replace('mb-4">hello@tracy-base.example</p>', 'mb-4"></p>'))
})

test('a button slot with no honest line keeps its words: an empty link is not a way to take them off', () => {
  const button =
    '<!-- wp:button {"metadata":{"name":"cta.btn"}} -->\n<div class="wp-block-button"><a class="wp-block-button__link" href="/x/">Call Northgate</a></div>\n<!-- /wp:button -->'
  const page = `<!-- wp:buttons -->\n<div class="wp-block-buttons">${button}</div>\n<!-- /wp:buttons -->\n\n${CONTACT}`
  const out = editBlocks(
    page,
    [],
    [{ block: 'cta.btn', nth: 1, sample: 'Call Northgate' }],
    new Set(['cta.btn'])
  )
  assert.deepEqual([out.dropped, out.held], [0, 1])
  assert.equal(out.markup, page)
})

/** A door holding one page, the way the plugin answers the sweep. */
function door(/** @type {string} */ content) {
  const page = { id: 116, slug: 'contact', title: 'Contact', status: 'publish', content }
  /** @type {Array<any>} */
  const writes = []
  const call = async (/** @type {string} */ action, /** @type {any} */ params) => {
    if (action === 'content.update') {
      writes.push(params)
      if (params.fields?.post_content !== undefined) page.content = params.fields.post_content
      return { ok: true }
    }
    if (action === 'content.list') {
      const rows = params.post_type === 'page' && params.offset === 0 ? [page] : []
      return { ok: true, items: rows.map((r) => ({ ...r })) }
    }
    if (action === 'content.get') return { ok: false, error: 'not_found', message: 'not found' }
    return { ok: false, error: 'unsupported' }
  }
  return { page, writes, call }
}

const sweepInput = (/** @type {any} */ call, /** @type {Record<string, unknown>} */ extra = {}) => ({
  call,
  applyId: 'residue-test',
  written: writtenLines([]),
  entitySlugs: new Set(['contact']),
  judged: { hide: new Set(), relabel: new Map() },
  slotBlocks: slotBlocksByPage(contentMap),
  ...extra
})

test('a brief with no mailbox: the sweep leaves the Contact page exactly as the lock pins it, every slot still writable', async () => {
  const site = door(CONTACT)
  await sweepWordPress(sweepInput(site.call, { drops: dropsAll, contact: { email: '', phone: '' } }))
  assert.deepEqual(
    slotBlocksLeft(site.page.content),
    contactSlots.map((/** @type {any} */ s) => s.key)
  )
  assert.equal(await skeletonOf(site.page.content), lock.entities['page-contact'].skeleton)
})

test('the demo mailbox alone with no honest line: it leaves the page, its slot stays, and the page is still the one the lock pins', async () => {
  const site = door(CONTACT)
  const email = dropsAll.filter((d) => d.block === 'contact-information.email')
  await sweepWordPress(sweepInput(site.call, { drops: email, contact: { email: '', phone: '' } }))
  assert.equal(site.page.content.includes('hello@tracy-base.example'), false)
  assert.deepEqual(
    slotBlocksLeft(site.page.content),
    contactSlots.map((/** @type {any} */ s) => s.key)
  )
  assert.equal(await skeletonOf(site.page.content), lock.entities['page-contact'].skeleton)
})

// 🔒 Nothing typed keeps the demo's contact links (Akemi, 11/10/2026): the contact step no longer takes a link off with its block.
test('with no mailbox typed, the email line that links to the demo mailbox stays as the template has it, every slot still writable', async () => {
  const linked = CONTACT.replace(
    '<p class="acm-contact-information__email font-display text-xl mb-4">hello@tracy-base.example</p>',
    '<p class="acm-contact-information__email font-display text-xl mb-4"><a href="mailto:hello@tracy-base.example">hello@tracy-base.example</a></p>'
  )
  const site = door(linked)
  const out = await sweepWordPress(
    sweepInput(site.call, { written: writtenLines(['Thông tin liên hệ']), contact: { email: '', phone: '' } })
  )
  assert.deepEqual(
    slotBlocksLeft(site.page.content),
    contactSlots.map((/** @type {any} */ s) => s.key)
  )
  assert.ok(
    site.page.content.includes('<a href="mailto:hello@tracy-base.example">hello@tracy-base.example</a>')
  )
  assert.equal(
    out.notes.some((n) => /mailbox and phone/.test(n)),
    false,
    JSON.stringify(out.notes)
  )
})
