import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { INSPECT_BUDGET_CHARS, narrowInspect } from '../src/host/site.mjs'

/** @param {string} name */
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

const slot = (key, type, label, extra = {}) => ({
  key,
  entity: key.includes('::')
    ? key.split('::')[0] + '::' + key.split('::')[1].split('.')[0]
    : key.split('.')[0],
  column: type === 'image' ? 'params' : 'content',
  type,
  label,
  sample: type === 'image' ? 'images/demo/a.png' : 'Demo words',
  current: type === 'image' ? 'images/demo/a.png' : 'Customer words',
  maxCharacters: 255,
  ...extra
})
const answer = {
  ok: true,
  contract: 'tracy-business/j6/1.1.0',
  revision: 'r1',
  languages: ['vi-VN'],
  job: null,
  slots: [
    slot('module-441.0', 'text', '[Tracy Business] Home - Hero (en) / title'),
    slot('module-441.8', 'image', '[Tracy Business] Home - Hero (en) / image'),
    slot('module-444.5', 'image', '[Tracy Business] Home - Why (en) / image'),
    slot('vi-VN::module-441.8', 'image', '[Tracy Business] Home - Hero (en) / image'),
    slot('module-853.5', 'image', '[Tracy Business] Careers - Life on our sites (en) / photo')
  ],
  pages: [
    {
      entity: 'menuItem-599',
      route: 'home',
      assignedModules: [{ entity: 'module-441' }, { entity: 'module-444' }]
    },
    { entity: 'menuItem-610', route: 'careers', assignedModules: [{ entity: 'module-853' }] }
  ]
}

// 🔒 THE INSPECT OF A BIG CONTRACT DOES NOT FIT A CONTEXT. Business answers 2.1 MB (3622 slots); dsh
// spilled it to a file the fence refused, and the agent spent five minutes guessing module ids
// (j-ee6vsk, 23/09/2026). A filter answers only what was asked; a source slot is enough to write, since
// a picture reaches every language on its own (Claude Cowork plugin 0.16.16) and words go through the language job.
test('a filter answers only the slots asked for, source slots only, in a small shape', () => {
  const images = narrowInspect(answer, { operation: 'inspect', slots: 'image' })
  assert.deepEqual(
    images.slots.map((s) => s.key),
    ['module-441.8', 'module-444.5', 'module-853.5']
  )
  assert.deepEqual(Object.keys(images.slots[0]).sort(), ['current', 'key', 'label', 'sample', 'type'])
  assert.equal(images.revision, 'r1')
  const home = narrowInspect(answer, { operation: 'inspect', page: 'home', slots: 'image' })
  assert.deepEqual(
    home.slots.map((s) => s.key),
    ['module-441.8', 'module-444.5']
  )
  const hero = narrowInspect(answer, { operation: 'inspect', entity: 'module-441' })
  assert.deepEqual(
    hero.slots.map((s) => s.key),
    ['module-441.0', 'module-441.8']
  )
  assert.equal(hero.slots[0].sample, undefined, 'a text slot does not carry its demo words')
})

test('an unfiltered inspect of a big contract answers an index and how to narrow it', () => {
  const big = {
    ...answer,
    slots: Array.from({ length: 4000 }, (_, i) => slot(`module-${1000 + i}.0`, 'text', `Label ${i} / title`))
  }
  const index = narrowInspect(big, { operation: 'inspect' }, 50_000)
  assert.equal(index.slots, undefined)
  assert.equal(index.slotCount, 4000)
  assert.deepEqual(index.byType, { text: 4000 })
  assert.match(index.next, /slots:"image"/)
  assert.ok(JSON.stringify(index).length < 50_000)
  // A small contract is answered whole, as before.
  assert.equal(narrowInspect(answer, { operation: 'inspect' }, 50_000), answer)
})

test('anything that is not an inspect passes untouched', () => {
  const apply = { ok: true, ids: [1] }
  assert.equal(narrowInspect(apply, { operation: 'apply' }), apply)
  const refused = { ok: false, error: 'contract_failed' }
  assert.equal(narrowInspect(refused, { operation: 'inspect', slots: 'image' }), refused)
})

test('a narrowed slot says when the contract wants evidence for it', () => {
  const withEvidence = {
    ...answer,
    slots: [slot('module-841.1', 'image', 'Leadership / photo', { requiresEvidence: true })]
  }
  const picked = narrowInspect(withEvidence, { operation: 'inspect', slots: 'image' })
  assert.equal(picked.slots[0].requiresEvidence, true)
  assert.equal(
    narrowInspect(answer, { operation: 'inspect', slots: 'image' }).slots[0].requiresEvidence,
    undefined
  )
})

// ── P3 (25/09/2026): limits shown, Tracy's own `match`, and the inspect budget (INSPECT_BUDGET_CHARS) ─

test('a picked text slot says its limit and whether it is empty (the two rules an apply is refused by most)', () => {
  const withEmpty = {
    ...answer,
    slots: [
      slot('module-441.0', 'text', 'Hero / title', { maxCharacters: 80 }),
      slot('module-441.2', 'text', 'Hero / note', { sample: '', maxCharacters: 120 }),
      slot('module-441.8', 'image', 'Hero / image')
    ]
  }
  const picked = narrowInspect(withEmpty, { operation: 'inspect', entity: 'module-441' })
  assert.equal(picked.slots[0].max, 80)
  assert.equal(picked.slots[0].empty, undefined)
  assert.equal(picked.slots[1].empty, true)
  // A picture keeps its demo sample and gains neither: its rule is the file, not a length.
  assert.deepEqual(Object.keys(picked.slots[2]).sort(), ['current', 'key', 'label', 'sample', 'type'])
})

test('match finds the slot holding the words — on its own, or with the other filters', () => {
  const found = narrowInspect(answer, { operation: 'inspect', match: 'CUSTOMER words' })
  assert.deepEqual(
    found.slots.map((s) => s.key),
    ['module-441.0']
  )
  assert.deepEqual(narrowInspect(answer, { operation: 'inspect', match: 'nowhere' }).slots, [])
  assert.deepEqual(
    narrowInspect(answer, { operation: 'inspect', page: 'careers', match: 'customer' }).slots,
    []
  )
})

test('🔒 the call the site context prescribes is answered whole: {page:"home", slots:"text"} (13,853 chars, lean)', () => {
  const home = fixture('contract/home.json').answer
  const got = narrowInspect(home, { operation: 'inspect', page: 'home', slots: 'text' })
  assert.equal(got.truncated, undefined)
  // J2 (updated deliberately, 26/09): 164 slots before, less the 404 page's 20 words slots.
  assert.equal(got.slots.length, 144)
  // 22,151 chars on r2 before each slot said its `max`; 23,712 since; 15,180 once J2 made it lean
  // (every `max` kept: the "Content too long" refusal points at it, review 26/09).
  // The budget keeps real headroom, so a site whose words run longer than the demo's is not cut.
  const size = JSON.stringify(got).length
  assert.equal(size, 15_180)
  assert.ok(size <= 0.9 * INSPECT_BUDGET_CHARS, `${size} leaves under 10 % headroom`)
})

// 🔒 AND ON 1.2.0, WHERE THE SITE IDENTITY BLOCK RIDES THAT CALL. A narrowed words inspect lists the
// block whole at its head, so the prescribed call on a 1.2.0 site is the answer above plus 13 slots:
// 25,301 chars, 90.4 % of the 28,000 budget it had — past the 10 % headroom kept above, on the
// contract the stand runs. The block is read from the contract profile itself, so a 1.2.x that
// grows it moves this number instead of hiding behind a hand-typed copy.
test('🔒 the prescribed call on a 1.2.0 site, Site identity at its head, is answered whole with 10 % headroom', () => {
  const home = fixture('contract/home.json').answer
  const map = JSON.parse(
    readFileSync(
      new URL(
        '../../../cms/tracy-joomla-quickstart/contracts/tracy-business/j6/1.2.0/content-map.json',
        import.meta.url
      ),
      'utf8'
    )
  )
  // A freshly built site: each slot's current words are its demo sample.
  const identity = map.slots
    .filter((s) => s.siteIdentity === true)
    .map((s) => ({
      key: s.key,
      entity: s.entity,
      type: s.type,
      label: s.label,
      current: s.sample,
      sample: s.sample,
      maxCharacters: s.maxCharacters,
      requiresEvidence: s.requiresEvidence,
      siteIdentity: true
    }))
  assert.equal(identity.length, 13)
  const got = narrowInspect(
    { ...home, contract: 'tracy-business/j6/1.2.0', slots: [...home.slots, ...identity] },
    { operation: 'inspect', page: 'home', slots: 'text' }
  )
  assert.equal(got.truncated, undefined)
  assert.deepEqual(
    got.slots.slice(0, 13).map((s) => s.key),
    identity.map((s) => s.key)
  )
  // J2 (updated deliberately, 26/09): 164 + 13 before, less the 404 page's 20; 25,301 chars before.
  assert.equal(got.slots.length, 144 + 13)
  // J2 keeps the Site identity block intact: whole labels, type and max on each of its slots.
  for (const s of got.slots.slice(0, 13)) {
    assert.match(s.label, /^\[Tracy\] Site identity \/ /)
    assert.ok(s.type && Number.isInteger(s.max), JSON.stringify(s))
  }
  const size = JSON.stringify(got).length
  assert.equal(size, 16_769)
  assert.ok(size <= 0.9 * INSPECT_BUDGET_CHARS, `${size} leaves under 10 % headroom`)
})

test('🔒 J2: a words inspect without match is lean — every slot and language kept, labels grouped, 404 blocks named', () => {
  const home = fixture('contract/home.json').answer
  const call = { operation: 'inspect', page: 'home', slots: 'text' }
  const got = narrowInspect(home, call)
  // Every words slot the page holds is still there, in both languages; only the 404 page's are out.
  const onHome = new Set(home.pages.flatMap((p) => [p.entity, ...p.assignedModules.map((m) => m.entity)]))
  const errorPage = new Set(
    home.pages.flatMap((p) =>
      p.assignedModules.filter((m) => m.position === 'error-page').map((m) => m.entity)
    )
  )
  assert.deepEqual([...errorPage].sort(), ['module-816', 'module-830'])
  const expected = home.slots
    .filter(
      (s) => !s.key.includes('::') && s.type === 'text' && onHome.has(s.entity) && !errorPage.has(s.entity)
    )
    .map((s) => s.key)
  assert.deepEqual(
    got.slots.map((s) => s.key),
    expected
  )
  assert.ok(
    got.slots.some((s) => s.key.startsWith('module-428.')) &&
      got.slots.some((s) => s.key.startsWith('module-448.'))
  )
  assert.deepEqual(got.normalized, [
    '404-page blocks left out: module-816, module-830; entity:"<block>" reads one'
  ])
  // Labels: the block's name once, then each slot's own tail; the first slot of a block whole.
  const byKey = new Map(home.slots.map((s) => [s.key, s]))
  let above = null
  for (const s of got.slots) {
    const src = byKey.get(s.key)
    const sameBlock = above !== null && above.entity === src.entity
    if (!sameBlock) assert.equal(s.label, src.label, s.key)
    else if (s.label !== src.label) {
      const tail = src.label.includes(' / ') ? src.label.slice(src.label.lastIndexOf(' / ') + 3) : ''
      assert.equal(s.label, tail === '' ? '…' : `…/ ${tail}`, s.key)
    }
    // No type (all text, as asked) — never undefined; `max`, `empty` (the two rules an apply is
    // refused by) and `requiresEvidence` stay.
    assert.deepEqual(Object.keys(s).slice(0, 3), ['key', 'label', 'current'], s.key)
    assert.ok(
      Object.keys(s).every((k) =>
        ['key', 'label', 'current', 'max', 'empty', 'requiresEvidence'].includes(k)
      ),
      s.key
    )
    assert.equal(s.requiresEvidence, src.requiresEvidence ? true : undefined, s.key)
    assert.equal(s.empty, src.sample === '' ? true : undefined, s.key)
    above = src
  }
  const hero = got.slots.filter((s) => s.key.startsWith('module-441.'))
  assert.equal(hero[0].label, '[Tracy Business] Home - Hero (en) / eyebrow')
  assert.equal(hero[1].label, '…/ title')
  // 23,712 chars before J2: at least 35 % less, every `max` kept.
  assert.ok(JSON.stringify(got).length <= 0.65 * 23_712, String(JSON.stringify(got).length))
  // 🔒 Every words slot still says its `max` in a lean answer: the "Content too long" refusal sends
  // the model to it (review of perf/harness-flows, 26/09).
  assert.equal(got.slots.find((s) => s.key === 'module-428.1').max, 68)
  // match and entity answer a few slots, as before: type, max and whole labels.
  const matched = narrowInspect(home, { ...call, match: 'Hotline' })
  assert.deepEqual(matched.slots[0], {
    key: 'module-428.1',
    type: 'text',
    label: '[Tracy Business] Topbar - Contacts (en)',
    current: 'Hotline: 8 800 550-67-90',
    max: 68
  })
  const block = narrowInspect(home, { operation: 'inspect', entity: 'module-816', slots: 'text' })
  assert.equal(
    block.slots.length,
    home.slots.filter((s) => s.entity === 'module-816' && s.type === 'text').length
  )
  assert.ok(
    block.slots.every((s) => s.type === 'text' && Number.isInteger(s.max) && !s.label.startsWith('…'))
  )
  // An offset page starts with a whole label, never "…".
  const paged = narrowInspect(home, { ...call, offset: 1 })
  assert.equal(paged.slots[0].key, expected[1])
  assert.equal(paged.slots[0].label, byKey.get(expected[1]).label)
})

test('past the budget a narrowed answer is cut at a slot, with match and offset as the way on', () => {
  const home = fixture('contract/home.json').answer
  const big = {
    ...home,
    slots: [1, 2, 3].flatMap((n) =>
      home.slots.map((s) => ({ ...s, key: `${s.key}-copy${n}`, entity: s.entity }))
    )
  }
  const first = narrowInspect(big, { operation: 'inspect', page: 'home' })
  assert.ok(JSON.stringify(first).length <= INSPECT_BUDGET_CHARS)
  assert.ok(first.truncated.shown > 0 && first.truncated.shown < first.truncated.total)
  assert.match(first.next, /match:/)
  assert.match(first.next, new RegExp(`offset:${first.truncated.shown}\\b`))
  // The next page starts where the first one stopped, and every slot is reached once.
  const second = narrowInspect(big, { operation: 'inspect', page: 'home', offset: first.truncated.shown })
  assert.equal(second.offset, first.truncated.shown)
  const seen = [...first.slots, ...second.slots].map((s) => s.key)
  assert.equal(new Set(seen).size, seen.length, 'no slot is answered twice')
  assert.match(second.next ?? '', new RegExp(`^Slots ${first.truncated.shown + 1}–`))
})

test('the index form (no filter) is not capped, and its pages map is whole', () => {
  const home = fixture('contract/home.json').answer
  const index = narrowInspect(home, { operation: 'inspect' }, 1_000)
  assert.equal(index.truncated, undefined)
  assert.equal(index.pages.length, home.pages.length)
})

test('🔒 a bare inspect is the index once over the budget — with the DEFAULT limit, as the tool calls it', () => {
  // Before: the default was 60,000, so this 226-slot answer came back whole — 56,377 chars, 60,380
  // bytes, past dsh's 50,000-byte spill whose file the model could not use (grep 0 of 34 on r2).
  const home = fixture('contract/home.json').answer
  assert.ok(JSON.stringify(home).length > INSPECT_BUDGET_CHARS)
  const index = narrowInspect(home, { operation: 'inspect' })
  assert.equal(index.slots, undefined, 'the index, not the slot list')
  assert.equal(index.slotCount, home.slots.filter((s) => !String(s.key).includes('::')).length)
  assert.match(index.next, /page:"home"/)
  assert.equal(index.pages.length, home.pages.length, 'pages is never cut')
  assert.ok(JSON.stringify(index).length <= INSPECT_BUDGET_CHARS, String(JSON.stringify(index).length))
  // A contract under the budget is still answered whole, as it always was.
  assert.equal(narrowInspect(answer, { operation: 'inspect' }), answer)
})

// 🔒 1.2.0's `[Tracy] Site identity` block is on no page's assignedModules (stand 25/09: page:"home"
// 220 slots, page:"contact" 210, module-4369 in neither), yet its values are on every page as tokens.
// PR1 bench C20: every page-filtered inspect hid it, the model said the phone "has no door", FAIL.
// Its slots as tracy-business/j6 1.2.0's content-map.json declares them (keys, labels, types).
const identityAnswer = {
  ...answer,
  contract: 'tracy-business/j6/1.2.0',
  languages: [],
  slots: [
    slot('module-428.1', 'text', '[Tracy Business] Topbar - Contacts (en)', {
      current: 'Hotline: {contact.phone}'
    }),
    slot('module-428.2', 'text', '[Tracy Business] Topbar - Contacts (en)', {
      current: 'Email: {contact.email}'
    }),
    ...answer.slots,
    slot('module-4369.4', 'text', '[Tracy] Site identity / email', {
      current: 'sales@northgate-ind.ru',
      sample: 'sales@northgate-ind.ru'
    }),
    slot('module-4369.5', 'text', '[Tracy] Site identity / phone', {
      current: '8 800 550-67-90',
      sample: '8 800 550-67-90'
    }),
    slot('module-4369.8', 'url', '[Tracy] Site identity / facebook', {
      current: '',
      sample: '',
      maxCharacters: 2048
    })
  ],
  pages: [
    {
      entity: 'menuItem-599',
      route: 'home',
      assignedModules: [{ entity: 'module-428' }, { entity: 'module-441' }, { entity: 'module-444' }]
    },
    { entity: 'menuItem-604', route: 'contact', assignedModules: [{ entity: 'module-428' }] },
    { entity: 'menuItem-610', route: 'careers', assignedModules: [{ entity: 'module-853' }] }
  ]
}
const keys = (r) => r.slots.map((s) => s.key)
const IDENTITY = ['module-4369.4', 'module-4369.5', 'module-4369.8']

test('🔒 a narrowed text inspect lists the Site identity block whole, whatever page or match say', () => {
  // The verifier's case: the customer names the hotline by its printed label. `match` hits the topbar
  // module holding "Hotline: {contact.phone}"; the slot that holds the number says "8 800 550-67-90"
  // under "…/ phone" — it is listed anyway, so the one prescribed inspect shows the slot to write.
  const hotline = narrowInspect(identityAnswer, { operation: 'inspect', page: '/', match: 'Hotline' })
  assert.ok(keys(hotline).includes('module-4369.5'), JSON.stringify(keys(hotline)))
  assert.deepEqual(keys(hotline), [...IDENTITY, 'module-428.1'])
  assert.deepEqual(hotline.normalized, ['page "/" read as "home"'])
  // The call the site context prescribes (`slots:"text"`) carries the social-link url slots too: the
  // context names them as identity slots, and a text-only answer would hide every one of them.
  assert.deepEqual(
    keys(narrowInspect(identityAnswer, { operation: 'inspect', page: '/', slots: 'text', match: 'Hotline' })),
    [...IDENTITY, 'module-428.1']
  )
  // By the printed label with no page, by the token, and on a page whose own slots match nothing.
  assert.deepEqual(
    keys(narrowInspect(identityAnswer, { operation: 'inspect', slots: 'text', match: 'Email' })),
    [...IDENTITY, 'module-428.2']
  )
  assert.deepEqual(keys(narrowInspect(identityAnswer, { operation: 'inspect', match: '{contact.phone}' })), [
    ...IDENTITY,
    'module-428.1'
  ])
  assert.deepEqual(
    keys(
      narrowInspect(identityAnswer, {
        operation: 'inspect',
        page: 'careers',
        slots: 'text',
        match: 'nowhere'
      })
    ),
    IDENTITY
  )
  // A page filter alone, and its value or field name as match: each slot listed once, at the head.
  assert.deepEqual(
    keys(narrowInspect(identityAnswer, { operation: 'inspect', page: 'contact', slots: 'text' })),
    [...IDENTITY, 'module-428.1', 'module-428.2']
  )
  assert.deepEqual(
    keys(narrowInspect(identityAnswer, { operation: 'inspect', page: 'home', match: '550-67-90' })),
    IDENTITY
  )
  assert.deepEqual(
    keys(
      narrowInspect(identityAnswer, { operation: 'inspect', page: 'home', slots: 'text', match: 'phone' })
    ),
    [...IDENTITY, 'module-428.1']
  )
})

test('🔒 the Site identity block stays out where the call named its blocks, or asked for pictures', () => {
  assert.deepEqual(keys(narrowInspect(identityAnswer, { operation: 'inspect', entity: 'module-441' })), [
    'module-441.0',
    'module-441.8'
  ])
  // Named, it is answered as any block is.
  assert.deepEqual(
    keys(narrowInspect(identityAnswer, { operation: 'inspect', entity: 'module-4369', page: 'home' })),
    IDENTITY
  )
  assert.deepEqual(
    keys(narrowInspect(identityAnswer, { operation: 'inspect', page: 'home', slots: 'image' })),
    ['module-441.8', 'module-444.5']
  )
  // A contract without the block (1.1.0) answers exactly as before.
  assert.deepEqual(keys(narrowInspect(answer, { operation: 'inspect', match: 'nowhere' })), [])
})

test('🔒 the siteIdentity mark of the contract names the block even under another label', () => {
  const marked = {
    ...identityAnswer,
    slots: identityAnswer.slots.map((s) =>
      s.entity === 'module-4369' ? { ...s, label: `Identity / ${s.key}`, siteIdentity: true } : s
    )
  }
  assert.deepEqual(keys(narrowInspect(marked, { operation: 'inspect', page: '/', match: 'Hotline' })), [
    ...IDENTITY,
    'module-428.1'
  ])
})

test('🔒 past the budget the Site identity block is on the first page, and on no later one', () => {
  const home = fixture('contract/home.json').answer
  const big = {
    ...home,
    slots: [
      ...[1, 2, 3].flatMap((n) =>
        home.slots.map((s) => ({ ...s, key: `${s.key}-copy${n}`, entity: s.entity }))
      ),
      ...identityAnswer.slots.filter((s) => s.entity === 'module-4369')
    ]
  }
  const first = narrowInspect(big, { operation: 'inspect', page: 'home', slots: 'text' })
  assert.ok(first.truncated.shown < first.truncated.total, 'the answer is cut')
  assert.deepEqual(keys(first).slice(0, 3), IDENTITY)
  const second = narrowInspect(big, {
    operation: 'inspect',
    page: 'home',
    slots: 'text',
    offset: first.truncated.shown
  })
  assert.ok(!keys(second).some((k) => k.startsWith('module-4369.')), 'no slot is answered twice')
})

test('🔒 a page given as the path page.text takes reads as its route, and says so', () => {
  for (const page of ['/', '/en/', '/en', 'Home', 'HOME'])
    assert.deepEqual(
      narrowInspect(identityAnswer, { operation: 'inspect', page, slots: 'text' }),
      {
        ...narrowInspect(identityAnswer, { operation: 'inspect', page: 'home', slots: 'text' }),
        normalized: [`page "${page}" read as "home"`]
      },
      page
    )
  assert.deepEqual(
    keys(narrowInspect(identityAnswer, { operation: 'inspect', page: '/en/contact', slots: 'text' })),
    [...IDENTITY, 'module-428.1', 'module-428.2']
  )
})

test('🔒 a page the contract does not have is an answer naming the routes, never a silent empty list', () => {
  const r = narrowInspect(identityAnswer, { operation: 'inspect', page: '/news/disclosure/x', slots: 'text' })
  assert.deepEqual(r.slots, [])
  assert.match(
    r.next,
    /No page "\/news\/disclosure\/x" in this contract\. page is a route: home, contact, careers/
  )
  assert.match(r.next, /leave page out and pass match/)
  // one known and one unknown: the known page is answered, the unknown one named
  const mixed = narrowInspect(identityAnswer, {
    operation: 'inspect',
    page: ['home', 'nope'],
    slots: 'image'
  })
  assert.deepEqual(keys(mixed), ['module-441.8', 'module-444.5'])
  assert.match(mixed.next, /No page "nope"/)
})

// ── A bound WordPress site (#337) ────────────────────────────────────────────────────────────────

/**
 * The shape a bound WordPress site's inspect answers (claude-cowork `wordpress/cowork/lib/
 * QuickstartContract.php` `inspect()`, Claude Cowork plugin 0.13.2; `Engine.php` `inspectAnswer` drops `rows`):
 * `slots` a MAP of key → current words, pages as `page-<route>` entities, options as `option-*`. The
 * slot keys, entities and demo words are `tracy-business/wp7` 1.2.0's own `content-map.json`.
 */
function wordpressInspect() {
  const map = JSON.parse(
    readFileSync(
      new URL(
        '../../../cms/tracy-wordpress-quickstart/contracts/tracy-business/wp7/1.2.0/content-map.json',
        import.meta.url
      ),
      'utf8'
    )
  )
  return {
    ok: true,
    bound: true,
    contract: 'tracy-business/wp7/1.2.0',
    revision: 'r-wp',
    ids: {},
    entities: map.entities.map((/** @type {any} */ e, /** @type {number} */ i) => ({
      key: e.key,
      kind: e.kind,
      id: e.kind === 'option' ? null : 100 + i,
      language: e.kind === 'option' ? null : 'en-us',
      status: e.kind === 'option' ? null : 'publish'
    })),
    slots: Object.fromEntries(map.slots.map((/** @type {any} */ s) => [s.key, s.sample])),
    // What the Claude Cowork plugin answers since image slots (0.14.0-rc.4): each picture slot and its demo.
    imageSlots: Object.fromEntries(
      map.slots
        .filter((/** @type {any} */ s) => s.type === 'image')
        .map((/** @type {any} */ s) => [s.key, s.sample])
    ),
    demoTrim: null,
    sourceLanguage: null,
    multilingual: { retired: ['de'], live: ['en', 'vi'], applyId: 'mlang-build-x' },
    siteLanguage: null,
    problems: []
  }
}

test('🔒 a bound WordPress inspect is narrowed by page and match, its site-wide slots at the head', () => {
  const wp = wordpressInspect()
  // Unfiltered and within the budget: the Claude Cowork plugin's own answer, as it came.
  assert.equal(narrowInspect(wp, { operation: 'inspect' }), wp)
  const home = /** @type {any} */ (narrowInspect(wp, { operation: 'inspect', page: '/' }))
  assert.deepEqual(home.normalized, ['page "/" read as "home"'])
  const keys = home.slots.map((/** @type {any} */ s) => s.key)
  // The options the contract maps print on every page: they ride with every narrowed words inspect.
  const siteWide = keys.filter(
    (/** @type {string} */ k) => k.startsWith('site.') || k.startsWith('identity.')
  )
  assert.ok(siteWide.includes('site.name') && siteWide.includes('identity.contact.phone'))
  assert.deepEqual(keys.slice(0, siteWide.length), siteWide, 'the site-wide slots come first')
  assert.ok(keys.includes('home.hero.heading'))
  assert.ok(
    keys.every((/** @type {string} */ k) => !k.startsWith('about.')),
    'only the page asked for'
  )
  // Each slot says its key and its words, and nothing the answer does not carry.
  const heading = home.slots.find((/** @type {any} */ s) => s.key === 'home.hero.heading')
  // Compared as the object itself, not after a JSON round-trip: dsh refuses a tool answer holding
  // an `undefined` ("value is not lossless JSON"), and a round-trip in the test hid exactly that.
  assert.deepEqual(heading, {
    key: 'home.hero.heading',
    current: 'Building the groundwork for next-generation plants'
  })
  for (const params of [{ page: 'home' }, { page: 'home', slots: 'text' }, { match: 'groundwork' }]) {
    const answer = narrowInspect(wp, { operation: 'inspect', ...params })
    assert.deepEqual(JSON.parse(JSON.stringify(answer)), answer, `lossless: ${JSON.stringify(params)}`)
  }
  assert.equal(home.revision, 'r-wp', 'the revision an apply needs stays')
  // match finds the words wherever they are; a site-wide slot is also found by its key.
  const hit = /** @type {any} */ (narrowInspect(wp, { operation: 'inspect', match: 'groundwork' }))
  assert.ok(hit.slots.some((/** @type {any} */ s) => s.key === 'home.hero.heading'))
  const phone = /** @type {any} */ (
    narrowInspect(wp, { operation: 'inspect', entity: 'site', match: 'phone' })
  )
  assert.deepEqual(
    phone.slots.map((/** @type {any} */ s) => s.key),
    ['identity.contact.phone']
  )
  // A language prefix in the path is read off, as on Joomla.
  const about = /** @type {any} */ (narrowInspect(wp, { operation: 'inspect', page: '/vi/about/' }))
  assert.ok(about.slots.some((/** @type {any} */ s) => s.key.startsWith('about.')))
  // The picture slots the Claude Cowork plugin names come back typed, each with the demo it replaces — the
  // shape media.draw draws to; the words filter leaves them out.
  const pictures = /** @type {any} */ (
    narrowInspect(wp, { operation: 'inspect', page: 'home', slots: 'image' })
  ).slots
  assert.deepEqual(pictures[0], {
    key: 'home.hero.img',
    type: 'image',
    current: 'wp-content/uploads/2026/09/hero-ru.png',
    sample: 'wp-content/uploads/2026/09/hero-ru.png'
  })
  assert.ok(pictures.every((/** @type {any} */ s) => s.type === 'image'))
  const words = /** @type {any} */ (narrowInspect(wp, { operation: 'inspect', page: 'home', slots: 'text' }))
    .slots
  assert.ok(words.every((/** @type {any} */ s) => s.type === undefined))
  // A Claude Cowork plugin older than image slots names none, so none is offered.
  const { imageSlots: _gone, ...older } = wp
  assert.deepEqual(
    /** @type {any} */ (narrowInspect(older, { operation: 'inspect', slots: 'image' })).slots,
    []
  )
  // A page it does not have names its routes, never an empty list.
  const none = /** @type {any} */ (narrowInspect(wp, { operation: 'inspect', page: 'pricing' }))
  assert.match(none.next, /page is a route: home, about, services/)
  assert.match(none.next, /or its entity, e\.g\. page-home/)
})

test('🔒 a bound WordPress inspect over the budget is an index of its pages, with the WordPress way to narrow it', () => {
  const index = /** @type {any} */ (narrowInspect(wordpressInspect(), { operation: 'inspect' }, 1000))
  assert.equal(index.slots, undefined)
  assert.ok(index.slotCount > 200)
  assert.ok(index.pages.includes('home (page-home)'))
  assert.match(index.next, /\{operation:"inspect", page:"home"\}/)
  assert.doesNotMatch(index.next, /slots:"image"|module-444|picture reaches/)
})

// ── An imported copy's derived contract (01/10/2026) ──────────────────────────────────────────────────

/**
 * What a derived inspect answers (claude-cowork `QuickstartContract::inspectDerived`): the WordPress plugin a
 * key → current map plus `slotDetails`, the Joomla one a `slots` list; no pages, no Site identity, no labels.
 * @param {'wordpress' | 'joomla'} platform
 */
function derivedInspect(platform) {
  const details = [
    {
      key: 'post-12.post_content.0bfa07e1cb',
      entity: 'post-12',
      column: 'post_content',
      type: 'text',
      maxCharacters: 40,
      current: 'Where should I go next?'
    },
    {
      key: 'post-12.post_title.da39a3ee5e',
      entity: 'post-12',
      column: 'post_title',
      type: 'text',
      maxCharacters: 40,
      current: 'Help'
    },
    {
      key: 'postmeta-88._elementor_data.1a2b3c4d5e',
      entity: 'postmeta-88',
      column: 'meta_value',
      type: 'image',
      maxCharacters: 2048,
      current: 'wp-content/uploads/hero.jpg'
    },
    {
      key: 'option-7.option_value.9f8e7d6c5b',
      entity: 'option-7',
      column: 'option_value',
      type: 'text',
      maxCharacters: 60,
      current: 'Call us: 0123 456 789'
    }
  ]
  return platform === 'wordpress'
    ? {
        ok: true,
        contract: 'derived/shop-example-com-1a2b3c4d',
        mode: 'derived',
        slots: Object.fromEntries(details.map((d) => [d.key, d.current])),
        slotDetails: details,
        entities: [{ key: 'post-12', kind: 'post', id: 12 }],
        imageSlots: []
      }
    : {
        ok: true,
        slots: details.map((d) => ({ ...d, entity: d.entity.replace('post-', 'article-') })),
        pages: []
      }
}

for (const platform of /** @type {const} */ (['wordpress', 'joomla'])) {
  test(`🔒 a derived ${platform} inspect is read as its own slots, never as a quickstart's Site identity`, () => {
    const narrowed = /** @type {any} */ (
      narrowInspect(derivedInspect(platform), { operation: 'inspect', match: 'call us' })
    )
    assert.deepEqual(
      narrowed.slots.map((/** @type {any} */ s) => s.key),
      ['option-7.option_value.9f8e7d6c5b']
    )
    assert.ok(
      narrowed.slots.every((/** @type {any} */ s) => s.siteIdentity === undefined),
      'no slot is Site identity'
    )
    assert.equal(narrowed.slots[0].current, 'Call us: 0123 456 789')
    // A picture call answers the picture slot alone.
    const pictures = /** @type {any} */ (
      narrowInspect(derivedInspect(platform), { operation: 'inspect', slots: 'image' })
    )
    assert.deepEqual(
      pictures.slots.map((/** @type {any} */ s) => s.key),
      ['postmeta-88._elementor_data.1a2b3c4d5e']
    )
    // Over the budget: an index whose next names the reads that work on a derived map, no page or quickstart key.
    const index = /** @type {any} */ (narrowInspect(derivedInspect(platform), { operation: 'inspect' }, 100))
    assert.equal(index.slots, undefined)
    assert.equal(index.slotCount, 4)
    assert.match(index.next, /Read the page with content\.read: its fields carry each slotKey/)
    assert.match(index.next, /\{operation:"inspect", match:"<words>"\}/)
    assert.doesNotMatch(index.next, /page:"home"|module-444|picture reaches every language/)
  })
}

// Review of 02/10/2026: a derived WordPress inspect carries its whole entity list and id map beside the slots. On the
// real imported copy (tracy.ai: 6,726 entities, 7,425 slots, 2.5 MB) those two alone are 668,000 chars, so the cap's
// share left for slots was nothing: every `match` or `entity` call answered `slots: []` and "Slots 1–0 of 111", and
// the unfiltered index was itself bigger than dsh's spill. The tests above use four slots and could not see it.
/** @param {number} entities @param {number} slots */
function bigWordpressDerived(entities, slots) {
  const kinds = ['post', 'postmeta', 'option', 'term', 'menuItem']
  const list = Array.from({ length: entities }, (_, e) => ({
    key: `${kinds[e % 5]}-${100 + e}`,
    kind: kinds[e % 5],
    id: 100 + e,
    language: null,
    status: e % 5 === 0 ? 'publish' : null
  }))
  const details = Array.from({ length: slots }, (_, s) => {
    const entity = list[s % entities]
    const image = s % 40 === 0
    return {
      key: `${entity.key}.${entity.kind === 'post' ? 'post_content' : 'option_value'}.${((s * 2654435761) >>> 0).toString(16).padStart(8, '0')}${(s % 256).toString(16).padStart(2, '0')}`,
      entity: entity.key,
      column: 'post_content',
      type: image ? 'image' : 'text',
      maxCharacters: 60,
      current: image ? `wp-content/uploads/pic-${s}.jpg` : `Some words on the page ${s}`
    }
  })
  return {
    ok: true,
    bound: true,
    contract: 'derived/acme-site',
    revision: 'r'.repeat(64),
    mode: 'derived',
    calibrated: true,
    ids: Object.fromEntries(list.map((e) => [e.key, e.id])),
    entities: list,
    slots: Object.fromEntries(details.map((d) => [d.key, d.current])),
    slotDetails: details,
    imageSlots: [],
    problems: [],
    missing: [],
    unreadable: []
  }
}

test('🔒 a derived WordPress inspect at the size of a real imported copy still answers slots, within the budget', () => {
  const real = bigWordpressDerived(6726, 7425)
  const index = /** @type {any} */ (narrowInspect(real, { operation: 'inspect' }))
  assert.equal(index.slotCount, 7425)
  assert.ok(
    JSON.stringify(index).length <= INSPECT_BUDGET_CHARS,
    `index is ${JSON.stringify(index).length} chars`
  )
  for (const params of [
    { operation: 'inspect', match: 'page 1234' },
    { operation: 'inspect', entity: 'post-100' },
    { operation: 'inspect', slots: 'image' }
  ]) {
    const narrowed = /** @type {any} */ (narrowInspect(real, params))
    assert.ok(narrowed.slots.length > 0, `${JSON.stringify(params)} answered no slot: ${narrowed.next}`)
    assert.ok(JSON.stringify(narrowed).length <= INSPECT_BUDGET_CHARS + 1000, JSON.stringify(params))
  }
})

test('a derived inspect answer round-trips as lossless JSON: no picture slot carries an undefined sample', () => {
  const narrowed = narrowInspect(bigWordpressDerived(50, 400), { operation: 'inspect', slots: 'image' })
  assert.deepEqual(
    narrowed,
    JSON.parse(JSON.stringify(narrowed)),
    'dsh refuses a result that changes under a JSON round-trip'
  )
  // A picture slot says its yardstick for `media.draw {slot}`: a derived map has no demo, so it is the picture the slot holds.
  const first = /** @type {any} */ (narrowed).slots[0]
  assert.equal(first.type, 'image')
  assert.equal(first.sample, first.current)
})

test('a page asked of a derived map is answered with the reads that work, not an empty route list', () => {
  const narrowed = /** @type {any} */ (
    narrowInspect(bigWordpressDerived(50, 400), { operation: 'inspect', page: 'home' })
  )
  assert.deepEqual(narrowed.slots, [])
  assert.doesNotMatch(narrowed.next, /route: ,|route:  |menuItem-599/)
  assert.match(narrowed.next, /match|entity/)
})
