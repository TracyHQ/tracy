// Step 9b (#448): the words of each comment turn the repair pass sends to Tracy's site agent, tested at the message
// builder (repair-locate.js `pageItems`, repair-items.js `pageTurn`, with the popover's own turn builder): one comment item
// per slot, each naming its exact slot (the alt slot for an alt fault), its record and a selector when the page shows the
// element, an instruction written for its kind, and a slot and record still given when content.locate fails. Sites,
// pages and words are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCommentTurn } from '../src/lib/comment-turn.js'
import { kitAltSlots } from '../src/write-step/repair-pass/repair-alt-slots.js'
import { faultsToSend } from '../src/write-step/repair-pass/repair-faults.js'
import { pageTurn } from '../src/write-step/repair-pass/repair-items.js'
import { pageItems } from '../src/write-step/repair-pass/repair-locate.js'

const GALLERY = `<html><body><div id="Mod21" class="t4-module"><div class="gallery">
  <figure><img src="/images/a.jpg" alt="Two runners on a beach"></figure>
  <figure><img src="/images/b.jpg" alt="A cyclist on a hill"></figure>
</div></div>
<main><article class="item-page"><div class="body"><p>Our studio</p>
  <img src="/images/c.jpg" alt="A rower on a lake"></div>
  <ul class="kit"><li><span class="icon"><img src="/images/share.svg" alt=""></span><h4>BACKPACK</h4></li></ul>
  <p>Open everyday at nine</p></article></main></body></html>`

const altFault = (slot, measured, seen) => ({
  source: 'site-check',
  group: 'alt-matches-picture',
  kind: 'wrong-alt',
  page: '/',
  slot,
  block: null,
  width: null,
  measured,
  seen
})

/** A pass with a served page and a content.locate answering by `locate(params)` (refused when it returns null). */
function passOf(locate = () => null, altSlots = null) {
  const located = []
  const pass = {
    altSlots,
    urlOf: (page) => `https://site.example${page}`,
    pageHtml: async () => GALLERY,
    clock: { within: async (fn) => ({ value: await fn() }), workLeft: () => 60_000 },
    agent: {
      locate: async (params) => {
        located.push(params)
        return locate(params) ?? { ok: false, code: 'LOCATE_BAD_QUERY' }
      }
    }
  }
  return { pass, located }
}

const turnOf = (items) =>
  pageTurn(
    buildCommentTurn,
    items,
    items.map((_, i) => i + 1)
  )

test('two faults on two slots of one block are two comment items, neither folded into the other', async () => {
  const { pass } = passOf()
  const faults = [
    altFault('block-21.1', 'Two runners on a beach', 'A swimmer diving into a pool'),
    altFault('block-21.3', 'A cyclist on a hill', 'A boxer at a heavy bag')
  ]
  const items = await pageItems(pass, '/', faults)
  assert.equal(items.length, 2)
  assert.notEqual(items[0].element.selector, items[1].element.selector, 'the builder groups one selector')
  const turn = turnOf(items)
  assert.doesNotMatch(turn, /also-n=/)
  assert.match(turn, /n="1"[^>]*>[\s\S]*block-21\.1[\s\S]*n="2"[^>]*>[\s\S]*block-21\.3/)
})

test('an article picture alt names the alt slot and its record, with a selector read from the page', async () => {
  const { pass, located } = passOf()
  const [item] = await pageItems(pass, '/', [
    altFault('article-7.3', 'A rower on a lake', 'A climber on a wall')
  ])
  assert.ok(item.element.selector, 'the page shows the picture, so the item points at it')
  assert.deepEqual(located[0].image, { src: '/images/c.jpg', alt: 'A rower on a lake' })
  assert.match(item.text, /alt of slot article-7\.3/)
  assert.match(item.text, /article 7\b/)
  const turn = turnOf([item])
  assert.match(turn, /- field "article-7\.3 alt"/)
  assert.match(turn, /- record "article 7" \(article #7\)/)
})

/** An invented kit: a gallery list whose rows pair a picture with its alt in a slot of its own, as stored fields say. */
const GALLERY_KIT = {
  blocks: [
    {
      id: 'block-21',
      lists: [
        {
          id: 'block-21.gallery',
          rowSlots: [
            { id: 'block-21.1', role: 'business.gallery_image', type: 'image' },
            { id: 'block-21.7', role: 'editorial.paragraph', type: 'text', sample: '' }
          ],
          rows: [
            {
              index: 0,
              slots: [
                { id: 'block-21.1', role: 'business.gallery_image', type: 'image' },
                { id: 'block-21.7', role: 'editorial.paragraph', type: 'text', sample: '' }
              ]
            },
            {
              index: 1,
              slots: [
                { id: 'block-21.3', role: 'business.gallery_image', type: 'image' },
                { id: 'block-21.8', role: 'editorial.paragraph', type: 'text', sample: '' }
              ]
            }
          ]
        }
      ]
    }
  ],
  storedFields: [
    { slot: 'block-21.1', field: 'params.gallery.g[gallery][img].0', type: 'image' },
    { slot: 'block-21.7', field: 'params.gallery.g[gallery][alt].0', type: 'text' },
    { slot: 'block-21.3', field: 'params.gallery.g[gallery][img].1', type: 'image' },
    { slot: 'block-21.8', field: 'params.gallery.g[gallery][alt].1', type: 'text' }
  ]
}

test('a gallery alt the kit keeps in a slot of its own names that slot, beside its picture slot', async () => {
  assert.deepEqual(
    [...kitAltSlots(GALLERY_KIT)],
    [
      ['block-21.1', 'block-21.7'],
      ['block-21.3', 'block-21.8']
    ]
  )
  const { pass } = passOf(undefined, kitAltSlots(GALLERY_KIT))
  const [item] = await pageItems(pass, '/', [altFault('block-21.3', 'A cyclist on a hill', 'A boxer')])
  assert.match(item.text, /Where: slot block-21\.8, the alt of the picture in slot block-21\.3/)
  assert.doesNotMatch(item.text, /the alt of slot block-21\.3/)
  assert.match(item.text, /module 21/)
  assert.deepEqual(
    item.locate.levels.map((l) => [l.kind, l.label]),
    [
      ['field', 'block-21.8'],
      ['record', 'module 21']
    ]
  )
})

test('a kit with no alt slot beside a picture leaves the alt of the picture slot named', async () => {
  const kit = { blocks: [{ id: 'block-21', slots: [{ id: 'block-21.1', type: 'image' }] }], storedFields: [] }
  assert.equal(kitAltSlots(kit).size, 0)
  assert.equal(kitAltSlots(null).size, 0)
  const { pass } = passOf(undefined, kitAltSlots(kit))
  const [item] = await pageItems(pass, '/', [altFault('block-21.1', 'Two runners on a beach', 'A swimmer')])
  assert.match(item.text, /the alt of slot block-21\.1/)
})

test('when content.locate fails the item still carries its slot and record, unchecked', async () => {
  const { pass } = passOf()
  const [item] = await pageItems(pass, '/', [altFault('block-21.1', 'Two runners on a beach', 'A swimmer')])
  assert.equal(item.locateFrom, 'fault')
  assert.match(item.locateProblem, /LOCATE_BAD_QUERY/)
  assert.equal(item.locate.status, 'unchecked')
  assert.deepEqual(
    item.locate.levels.map((l) => [l.kind, l.label]),
    [
      ['field', 'block-21.1 alt'],
      ['record', 'module 21']
    ]
  )
  assert.match(turnOf([item]), /- record "module 21" \(module #21\)/)
})

test('a resolved content.locate answer is kept, and the words still name the exact slot and record', async () => {
  const answer = {
    status: 'resolved',
    levels: [{ kind: 'block', id: 'b-1', label: 'Gallery', writable: true }]
  }
  const { pass } = passOf(() => answer)
  const [item] = await pageItems(pass, '/', [altFault('block-21.3', 'A cyclist on a hill', 'A boxer')])
  assert.deepEqual(item.locate, answer)
  assert.match(item.text, /alt of slot block-21\.3/)
  assert.match(item.text, /module 21/)
})

test('a wrong alt says what the picture shows and what the alt reads now, and asks for an alt describing it', async () => {
  const { pass } = passOf()
  const [item] = await pageItems(pass, '/', [
    altFault('block-21.1', 'Two runners on a beach', 'A swimmer diving')
  ])
  assert.match(item.text, /write an alt text that describes the picture shown/i)
  assert.match(item.text, /shows: A swimmer diving/)
  assert.match(item.text, /now reads "Two runners on a beach"/)
  assert.ok(!item.text.includes('\n'), 'one paragraph')
})

test('a wrong icon the finder names is sent as an icon to choose from the library, pointing at its item', async () => {
  const { pages } = faultsToSend({
    firstCheck: null,
    found: [
      {
        page: '/',
        viewport: 'desktop',
        tile: 0,
        kind: 'other',
        slot: null,
        block: null,
        seen: 'The "BACKPACK" item shows a share icon instead of a backpack.'
      }
    ]
  })
  const [fault] = pages[0].faults
  assert.equal(fault.kind, 'wrong-icon')
  const { pass, located } = passOf()
  const [item] = await pageItems(pass, '/', [fault])
  assert.match(item.text, /choose an icon from Tracy's icon library/)
  assert.match(item.text, /tracy_site media\.icon \{query\}/, 'names the tool that lists the icons')
  assert.match(item.text, /\{slot, icon\}/, 'and the call that puts one in')
  assert.match(item.text, /"BACKPACK"/)
  assert.doesNotMatch(item.text, /fix what the note describes/)
  assert.equal(located[0].text, 'BACKPACK', 'located by the words it quotes, never an empty query')
  assert.ok(item.element.selector, 'the page shows the item')
})

test('glued words are quoted and the instruction is to put the space back', async () => {
  const { pass } = passOf()
  const fault = {
    source: 'site-check',
    group: 'glued-words',
    kind: 'glued-words',
    page: '/',
    slot: 'article-7.1',
    block: null,
    width: null,
    measured: 'everyday',
    seen: null
  }
  const [item] = await pageItems(pass, '/', [fault])
  assert.match(item.text, /put the space back/i)
  assert.match(item.text, /"everyday"/)
  assert.match(item.text, /slot article-7\.1/)
  assert.doesNotMatch(item.text, /alt of slot/)
})

test('a fault with nothing to look up is not sent to content.locate as an empty query', async () => {
  const { pass, located } = passOf()
  const fault = {
    source: 'finder',
    group: null,
    kind: 'empty-block',
    page: '/',
    slot: null,
    block: null,
    width: 1440,
    measured: null,
    seen: 'A wide blank column sits beside the contact details.'
  }
  const [item] = await pageItems(pass, '/', [fault])
  assert.equal(located.length, 0)
  assert.match(item.locateProblem, /nothing to look up/)
})
