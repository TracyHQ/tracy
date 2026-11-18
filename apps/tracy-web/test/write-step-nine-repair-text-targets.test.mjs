// Reproduce repeated BXR footer measurements without business assets, providers or a running site.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { judgeWordsOverPicture } from '../src/site-check/theme-reads.js'
import { faultsToSend } from '../src/write-step/repair-pass/repair-faults.js'
import { pageItems } from '../src/write-step/repair-pass/repair-locate.js'
import { checkOf, fakeAgent, stepNine } from './_write-step-nine-repair.mjs'

const TEXT = 'contact@example.test'
const html = `<body><footer id="Mod5" data-tracy-src="module:5">${[1, 2, 3].map(() => `<p><a href="mailto:${TEXT}">${TEXT}</a></p>`).join('')}</footer></body>`
const target = (n = 1) => ({
  path: `#Mod5 > p:nth-of-type(${n}) > a:nth-of-type(1)`,
  tag: 'a',
  text: TEXT,
  marks: ['module:5'],
  complete: true
})
const reads = (targets = [target()]) =>
  [1440, 390].map((width) => ({
    path: '/privacy',
    width,
    look: {
      sides: Object.fromEntries(
        ['light', 'dark'].map((side) => [
          side,
          {
            over: targets.map((t) => ({
              key: '#Mod5|footer>p>a',
              selector: 'a',
              text: TEXT,
              target: t,
              fg: [244, 65, 65],
              fgOff: [244, 65, 65],
              large: false,
              underSrc: '/images/tracy-content/footer.jpg',
              under: { p15: 0.2, p50: 0.2, p85: 0.2 }
            }))
          }
        ])
      )
    }
  }))
const check = (targets) =>
  checkOf(judgeWordsOverPicture(reads(targets)).failures.map((f) => ({ ...f, group: 'words-over-picture' })))
const passOf = (source = html) => {
  const located = []
  return {
    located,
    urlOf: (path) => `https://fixture.example.test${path}`,
    pageHtml: async () => source,
    clock: { workLeft: () => 60_000, within: async (fn) => ({ value: await fn() }) },
    agent: {
      locate: async (params) => {
        located.push(params)
        return { status: 'resolved', levels: [] }
      }
    }
  }
}

test('four width and theme observations of one proven element become one repair retaining all observations', () => {
  const firstCheck = check([target()])
  assert.equal(firstCheck.groups[0].failures.length, 4)
  assert.deepEqual(firstCheck.groups[0].failures[0].target, target())
  const { pages } = faultsToSend({ firstCheck })
  assert.equal(pages[0].faults.length, 1)
  assert.equal(pages[0].faults[0].observations.length, 4)
  assert.deepEqual(
    new Set(pages[0].faults[0].observations.map((o) => `${o.width}/${o.side}`)),
    new Set(['1440/light', '1440/dark', '390/light', '390/dark'])
  )
})

test('three identical emails with one coarse key remain three independently verified DOM targets', async () => {
  const { pages } = faultsToSend({ firstCheck: check([target(1), target(2), target(3)]) })
  assert.equal(pages[0].faults.length, 3)
  const pass = passOf()
  const items = await pageItems(pass, '/privacy', pages[0].faults)
  assert.deepEqual(
    items.map((i) => i.element.selector),
    [target(1).path, target(2).path, target(3).path]
  )
  assert.ok(items.every((i) => !i.repairBlocked && i.element.text === TEXT))
  assert.deepEqual(
    pass.located.map((q) => q.text),
    [TEXT, TEXT, TEXT]
  )
  assert.ok(pass.located.every((q) => q.marks[0] === 'module:5'))
})

test('duplicate IDs cannot turn an ambiguous measured path into a chosen email', async () => {
  const t = { ...target(), path: '#email' }
  const source = `<body><a id="email">${TEXT}</a><a id="email">${TEXT}</a></body>`
  const { pages } = faultsToSend({ firstCheck: check([t]) })
  const pass = passOf(source)
  const [item] = await pageItems(pass, '/privacy', pages[0].faults)
  assert.match(item.repairBlocked, /target/)
  assert.equal(pass.located.length, 0)
})

test('fresh text or ownership changes leave measured text unresolved without a content lookup', async () => {
  const { pages } = faultsToSend({ firstCheck: check([target()]) })
  for (const source of [
    html.replaceAll(TEXT, 'changed@example.test'),
    html.replace('module:5', 'module:9')
  ]) {
    const pass = passOf(source)
    const [item] = await pageItems(pass, '/privacy', pages[0].faults)
    assert.match(item.repairBlocked, /target/)
    assert.equal(pass.located.length, 0)
  }
})

test('unchanged nested inline text resolves using browser textContent while real text changes stay blocked', async () => {
  const { pages } = faultsToSend({ firstCheck: check([target()]) })
  const source = html.replaceAll(`>${TEXT}</a>`, '><span>contact</span>@example.test</a>')
  const pass = passOf(source)
  const [item] = await pageItems(pass, '/privacy', pages[0].faults)
  assert.equal(item.repairBlocked, undefined)
  assert.equal(item.element.text, TEXT)
  assert.equal(item.element.selector, target().path)
  assert.equal(pass.located.length, 1)

  const changedPass = passOf(source.replaceAll('<span>contact</span>', '<span>changed</span>'))
  const [changed] = await pageItems(changedPass, '/privacy', pages[0].faults)
  assert.match(changed.repairBlocked, /target/)
  assert.equal(changedPass.located.length, 0)
})

test('an unproven legacy diagnostic never becomes a body comment or a guessed occurrence', async () => {
  const firstCheck = check([target()])
  for (const f of firstCheck.groups[0].failures) delete f.target
  const agent = fakeAgent()
  const { result } = await stepNine({
    checks: [firstCheck, firstCheck],
    agent,
    input: { pageHtml: async () => html }
  })
  assert.equal(agent.sent.requests.length, 0)
  assert.equal(agent.sent.prompts.length, 0)
  assert.ok(result.repair.notSent.some((n) => n.reason === 'target-unresolved'))
})

test('one verified repair comment carries all measurements and forbids guessed occurrence indices or consent bypass', async () => {
  const agent = fakeAgent({ locate: () => ({ status: 'resolved', levels: [] }) })
  await stepNine({ checks: [check([target()]), checkOf([])], agent, input: { pageHtml: async () => html } })
  assert.equal(agent.sent.requests.length, 1)
  assert.equal(agent.sent.requests[0].items.length, 1)
  assert.equal(agent.sent.requests[0].items[0].element.selector, target().path)
  assert.equal(agent.sent.requests[0].items[0].element.text, TEXT)
  const text = agent.sent.prompts[0].text
  for (const observation of ['1440px/light', '1440px/dark', '390px/light', '390px/dark'])
    assert.ok(text.includes(observation))
  assert.ok(text.includes(target().path), 'the delivered turn names the exact fresh DOM selector')
  assert.match(text, /page\.look style\.selector and look\.set target\.selector/)
  assert.match(text, /Never derive a target nth value from a finding or comment number/)
  assert.match(text, /CONFIRM_FIRST/)
  assert.match(text, /do not ask its question, retry with confirm:true, or bypass the refusal/)
  assert.doesNotMatch(text, /body \/\*/)
})

test('oversized or incomplete target metadata remains unresolved without a guessed repair', async () => {
  for (const t of [
    { ...target(), path: '#' + 'a'.repeat(181) },
    { ...target(), text: 'x'.repeat(301) },
    { ...target(), marks: ['x'.repeat(241)] },
    { ...target(), marks: Array.from({ length: 13 }, (_, i) => `module:${i}`) },
    { ...target(), complete: false }
  ]) {
    const agent = fakeAgent()
    const first = check([t])
    const { result } = await stepNine({
      checks: [first, first],
      agent,
      input: { pageHtml: async () => html }
    })
    assert.equal(agent.sent.requests.length, 0)
    assert.equal(agent.sent.located.length, 0)
    assert.ok(result.repair.notSent.some((n) => n.reason === 'target-unresolved'))
  }
})
