// Regression for the step 9 trace: selector-only frames and image paths became body comments;
// native locate levels widened checks to every page, and an unrelated failure caused a resend.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { faultsToSend, stillThere } from '../src/write-step/repair-pass/repair-faults.js'
import { pagesChanged, recordPagesOf } from '../src/write-step/repair-pass/repair-judge.js'
import { servedElementOf, servedPage } from '../src/write-step/repair-pass/repair-served-element.js'
import { checkOf, failure, fakeAgent, stepNine } from './_write-step-nine-repair.mjs'

const html = `<body><div id="Mod5" data-tracy-src="module:5">
<div class="item item-1"><div class="gallery-statics bg-dark"></div></div>
<img src="/images/demo/intro.jpg#joomlaImage://local-images/demo/intro.jpg" alt="A boxing class">
</div></body>`

test('a demo picture is located by its image path, not by words in the page', () => {
  const { pages } = faultsToSend({
    firstCheck: checkOf([failure('demo-pictures', '/', null, 'images/demo/intro.jpg')])
  })
  const element = servedElementOf(servedPage(html), pages[0].faults[0])
  assert.equal(element?.tag, 'img')
  assert.equal(element?.image?.alt, 'A boxing class')
  assert.deepEqual(element?.marks, ['module:5'])
})

test('an empty frame keeps the measured selector and the actual served element', () => {
  const selector = 'div.item.item-1 > div.gallery-statics.bg-dark'
  const { pages } = faultsToSend({ firstCheck: checkOf([failure('empty-frames', '/', null, selector)]) })
  const fault = pages[0].faults[0]
  assert.equal(fault.selector, selector)
  const element = servedElementOf(servedPage(html), fault)
  assert.equal(element?.tag, 'div')
  assert.deepEqual(element?.marks, ['module:5'])
  assert.match(element?.path ?? '', /div:nth-of-type\(1\)/)
})

test('resolved native record levels scope a content-only write to every page that displays it', () => {
  const ledger = {
    records: new Map([
      [
        'request-1',
        {
          page: '/',
          faults: [],
          items: [
            {
              page: '/',
              locate: {
                levels: [{ kind: 'record', id: 'opaque-content-id', native: { kind: 'article', id: 15 } }]
              }
            },
            {
              page: '/lessons',
              locate: { levels: [{ kind: 'record', native: { kind: 'article', id: 15 } }] }
            }
          ]
        }
      ]
    ])
  }
  assert.deepEqual(
    pagesChanged(
      { changes: [{ target: { kind: 'article', id: '15' }, via: 'apply' }] },
      recordPagesOf(ledger)
    ),
    ['/', '/lessons']
  )
  assert.equal(pagesChanged({ changes: [{ via: 'files' }] }, recordPagesOf(ledger)), '*')
})

test('another slotless demo finding does not resend text that was already repaired', () => {
  const first = checkOf([failure('demo-words', '/', null, 'Old boxing description')])
  const [fault] = faultsToSend({ firstCheck: first }).pages[0].faults
  const later = checkOf([failure('demo-words', '/', null, 'Different demo telephone')])
  assert.deepEqual(stillThere([fault], later), [])
  assert.equal(stillThere([fault], first).length, 1)
})

test('a heading count that improved but still fails remains eligible for its second round', () => {
  const [fault] = faultsToSend({ firstCheck: checkOf([failure('main-heading', '/', null, 3)]) }).pages[0]
    .faults
  assert.equal(stillThere([fault], checkOf([failure('main-heading', '/', null, 2)])).length, 1)
})

test('step 9 sends image and frame findings with usable locate queries and distinct element selectors', async () => {
  const agent = fakeAgent({
    locate: () => ({ status: 'resolved', levels: [{ kind: 'record', native: { kind: 'module', id: 5 } }] })
  })
  const { result } = await stepNine({
    checks: [
      checkOf([
        failure('demo-pictures', '/', null, 'images/demo/intro.jpg'),
        failure('empty-frames', '/', null, 'div.item.item-1 > div.gallery-statics.bg-dark')
      ]),
      checkOf([])
    ],
    agent,
    input: { pageHtml: async () => html }
  })
  assert.equal(result.report.status, 'done')
  assert.equal(agent.sent.located.length, 2)
  assert.deepEqual(agent.sent.located[0].image, {
    src: '/images/demo/intro.jpg#joomlaImage://local-images/demo/intro.jpg',
    alt: 'A boxing class'
  })
  for (const query of agent.sent.located) {
    assert.deepEqual(query.marks, ['module:5'])
    assert.equal(query.text, undefined)
  }
  const items = agent.sent.requests.flatMap((r) => r.items)
  assert.equal(new Set(items.map((i) => i.element.selector)).size, 2)
  assert.ok(items.every((i) => i.locateFrom === 'content.locate'))
  assert.ok(items.every((i) => i.element.selector.startsWith('#Mod5 ')))
})

test('step 9 does not spend a second turn on an already repaired slotless finding', async () => {
  const agent = fakeAgent()
  await stepNine({
    checks: [
      checkOf([failure('demo-words', '/', null, 'Old boxing description')]),
      checkOf([failure('demo-words', '/', null, 'Different demo telephone')])
    ],
    agent
  })
  assert.equal(agent.sent.prompts.length, 1)
})

test('an unstamped empty frame keeps its exact selector without inventing native provenance', async () => {
  const agent = fakeAgent({ locate: () => ({ status: 'resolved', levels: [] }) })
  await stepNine({
    checks: [
      checkOf([failure('empty-frames', '/', null, 'div.item.item-1 > div.gallery-statics.bg-dark')]),
      checkOf([])
    ],
    agent,
    input: { pageHtml: async () => html.replace(' data-tracy-src="module:5"', '') }
  })
  const [item] = agent.sent.requests.flatMap((r) => r.items)
  assert.match(item.element.selector, /^#Mod5 > /)
  assert.equal(item.element.tag, 'div')
  assert.deepEqual(item.element.marks, [])
  assert.equal(agent.sent.located.length, 0)
  assert.equal(item.locateFrom, 'fault')
  assert.match(item.locateProblem, /nothing to look up/)
})

test('queued pages do not open repair sessions after a shared repair clears their faults', async () => {
  const agent = fakeAgent({ behave: () => ({ changes: [{ target: { kind: 'menuItem', id: 101 } }] }) })
  const { result } = await stepNine({
    checks: [
      checkOf([
        failure('dead-links', '/', null, 'A kept page does not answer (404)'),
        failure('dead-links', '/login', null, 'A kept page does not answer (500)'),
        failure('dead-links', '/registration', null, 'A kept page does not answer (500)')
      ]),
      checkOf([])
    ],
    agent,
    input: { limits: { turnsAtOnce: 1 } }
  })
  assert.equal(result.siteCheck.status, 'green')
  assert.equal(agent.sent.opened, 1)
  assert.equal(agent.sent.prompts.length, 1)
})

test('a scoped repair check preserves queued faults on pages it did not measure', async () => {
  const agent = fakeAgent()
  await stepNine({
    checks: [
      checkOf([
        failure('dead-links', '/', 'module-2.1', '/missing-home'),
        failure('dead-links', '/login', 'module-3.1', '/missing-login'),
        failure('dead-links', '/registration', 'module-4.1', '/missing-registration')
      ]),
      checkOf([])
    ],
    agent,
    input: { limits: { turnsAtOnce: 1 } }
  })
  assert.equal(agent.sent.opened, 3)
  assert.deepEqual(
    agent.sent.prompts.map((p) => p.page),
    ['/', '/login', '/registration']
  )
})

test('a deeply nested demo image reaches the comment builder with a complete asset selector', async () => {
  const nested = `<body><div id="off-canvas-left-push">${'<div>'.repeat(18)}<img src="/images/joomlart/logo/item-1.png#joomlaImage://local-images/joomlart/logo/item-1.png?width=175&height=56" alt="Urban Boxer">${'</div>'.repeat(18)}</div></body>`
  const agent = fakeAgent({ locate: () => ({ status: 'candidates', levels: [] }) })
  await stepNine({
    checks: [checkOf([failure('demo-pictures', '/', null, 'images/joomlart/logo/item-1.png')]), checkOf([])],
    agent,
    input: { pageHtml: async () => nested }
  })
  const [item] = agent.sent.requests.flatMap((r) => r.items)
  assert.equal(item.element.selector, '#off-canvas-left-push img[src^="/images/joomlart/logo/item-1.png"]')
  assert.ok(
    agent.sent.prompts.every((p) =>
      [...p.text.matchAll(/selector="([^"]*)"/g)].every((m) => !m[1].includes('…'))
    )
  )
})

test('a demo picture in an inline background retains its element and image provenance', () => {
  const background =
    '<body><div id="Mod165" data-tracy-src="module:165"><div class="acm-cta" style="background-image: url(/images/joomlart/others/bg-cta.jpg#joomlaImage://local-images/joomlart/others/bg-cta.jpg?width=2000&amp;height=1000)"></div></div></body>'
  const { pages } = faultsToSend({
    firstCheck: checkOf([failure('demo-pictures', '/', null, 'images/joomlart/others/bg-cta.jpg')])
  })
  const element = servedElementOf(servedPage(background), pages[0].faults[0])
  assert.equal(element?.tag, 'div')
  assert.equal(element?.selector, '#Mod165 div[style*="/images/joomlart/others/bg-cta.jpg"]')
  assert.deepEqual(element?.marks, ['module:165'])
  assert.match(element?.image?.src ?? '', /^\/images\/joomlart\/others\/bg-cta\.jpg#/)
  assert.equal(element?.path, '#Mod165 div[style*="/images/joomlart/others/bg-cta.jpg"]')
})
