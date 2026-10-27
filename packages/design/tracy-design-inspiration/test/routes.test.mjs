/**
 * The copy doors over real HTTP (spec §4h): the host half is given a fake cordis context — a route
 * registry on a Node server, a model that answers from a script — and a temp library of one inspiration
 * plus a site file. What is pinned: the chip decides the slot map and the prompt, a take lands
 * selected with its prompt and model, deletion and selection persist, and a failing model is a
 * status the dialog can show, not a crash.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { apply, inject } from '../lib/index.js'

const FIXTURE_SLOTS = [
  { id: 'h1.1', role: 'headline', words: 6, chars: 40, text: 'Design that ships' },
  { id: 'p.1', role: 'paragraph', words: 12, chars: 80, text: 'A paragraph of the author.' },
  { id: 'a.3', role: 'button', words: 1, chars: 5, text: 'Docs', inNav: true }
]

let root
let siteDir
let server
let base
let tool
let libraryTool
let proposeTool
/** The Tracy this lane belongs to: its design-systems switch and its published templates. */
// `hidden`: the operator's switches that are off (`GET /api/ui`). The chat route is on here unless a
// test closes it: the tools' own behaviour is what most tests measure.
const tracy = { shown: true, down: false, templates: [], hidden: [] }
let tracyServer
/** What the fake model answers next, and what it was asked. */
const model = { answer: '', answers: null, fail: false, rejectOff: false, effort: undefined, asked: [] }

function jsonStream(chunks) {
  return (async function* () {
    for (const c of chunks) yield c
  })()
}

before(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'tracy-design-routes-'))
  const lib = path.join(root, 'lib')
  mkdirSync(path.join(lib, 'systems', 'acme'), { recursive: true })
  writeFileSync(
    path.join(lib, 'design-catalog.json'),
    JSON.stringify({ systems: [{ id: 'acme', name: 'Acme', category: 'Test' }] })
  )
  writeFileSync(path.join(lib, 'slots.json'), JSON.stringify({ systems: { acme: { slots: FIXTURE_SLOTS } } }))
  writeFileSync(path.join(lib, 'systems', 'acme', 'tokens.css'), ':root{--accent:#ff0000;--bg:#ffffff}')
  siteDir = path.join(root, 'site')
  mkdirSync(path.join(siteDir, 'docs', 'agents'), { recursive: true })
  writeFileSync(
    path.join(siteDir, 'docs', 'agents', 'design-preview.json'),
    JSON.stringify({
      lang: 'vi',
      site: { name: 'Lucas', headline: 'Learn WordPress', sub: 'Courses', nav: ['Home', 'Pricing'] },
      pages: [
        { path: '/', type: 'home', label: 'Home' },
        { path: '/pricing/', type: 'pricing', label: 'Pricing', data: { plans: ['Solo', 'Team'] } }
      ]
    })
  )

  tracyServer = http.createServer((req, res) => {
    if (tracy.down) {
      res.writeHead(503)
      return res.end()
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    if (req.url === '/api/design-systems') return res.end(JSON.stringify({ shown: tracy.shown }))
    if (req.url === '/api/ui') return res.end(JSON.stringify({ hidden: tracy.hidden }))
    res.end(JSON.stringify({ templates: tracy.templates }))
  })
  await new Promise((r) => tracyServer.listen(0, '127.0.0.1', r))

  let handler = null
  const ctx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        handler = route
        return () => undefined
      }
    },
    tools: {
      register: (t) => {
        if (t.name === 'tracy_design_copy') tool = t
        if (t.name === 'tracy_design_library') libraryTool = t
        if (t.name === 'tracy_design_propose') proposeTool = t
        return () => undefined
      }
    },
    llm: {
      stream: (options) => {
        model.asked.push(options)
        if (model.rejectOff && options.reasoningEffort === 'off') {
          return jsonStream([
            {
              type: 'finish',
              reason: {
                kind: 'error',
                failure: {
                  message: 'DeepSeek does not support reasoning effort "off"',
                  code: 'UNSUPPORTED_REASONING_EFFORT'
                }
              }
            }
          ])
        }
        if (model.fail) {
          return jsonStream([
            { type: 'finish', reason: { kind: 'error', failure: { message: 'quota', code: 'quota' } } }
          ])
        }
        const answer = model.answers && model.answers.length > 0 ? model.answers.shift() : model.answer
        const half = Math.floor(answer.length / 2)
        return jsonStream([
          { type: 'text-delta', index: 0, text: answer.slice(0, half) },
          { type: 'text-delta', index: 0, text: answer.slice(half) },
          { type: 'usage', usage: { inputTokens: 321, outputTokens: 45 } },
          { type: 'finish', reason: { kind: 'stop' } }
        ])
      }
    },
    agentDefaultModel: {
      currentSelection: () => ({
        provider: 'deepseek',
        model: 'deepseek-chat',
        ...(model.effort === undefined ? {} : { reasoningEffort: model.effort })
      })
    }
  }
  apply(ctx, {
    siteDir,
    catalog: path.join(lib, 'design-catalog.json'),
    libraryUrl: false,
    tracyOrigin: `http://127.0.0.1:${tracyServer.address().port}`
  })
  assert.ok(handler, 'a route was registered')
  assert.ok(tool, 'the copy tool was registered')
  assert.ok(libraryTool, 'the library tool was registered')
  server = http.createServer((req, res) => handler.handler(req, res))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}/api/tracy-design-inspiration`
})

after(() => {
  server?.close()
  tracyServer?.close()
  rmSync(root, { recursive: true, force: true })
})

async function call(method, url, body) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  return { status: res.status, body: await res.json() }
}

const copyFile = () =>
  JSON.parse(readFileSync(path.join(siteDir, 'docs', 'agents', 'design-copy', 'acme.json'), 'utf8'))

/** POST a take and poll its job the way the dialog does; returns the job's final state (or the POST's refusal). */
async function take(chip, body) {
  const posted = await call('POST', `/copy/acme/pages/${chip}/versions`, body)
  if (posted.status !== 202) return posted
  assert.match(posted.body.job, /^v-/)
  for (let i = 0; i < 100; i++) {
    const j = await call('GET', `/copy/acme/jobs/${posted.body.job}`)
    if (j.body.state !== 'working') return j
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('job never settled')
}

test('inject names the four services the host reads', () => {
  assert.deepEqual(inject, ['webServer', 'tools', 'llm', 'agentDefaultModel'])
})

test('GET copy/<id>: an empty v2 file with the default prompts before anything is written', async () => {
  const r = await call('GET', '/copy/acme')
  assert.equal(r.status, 200)
  assert.equal(r.body.schemaVersion, 'tracy-design-copy/v2')
  assert.deepEqual(r.body.pages, {})
  assert.match(r.body.defaultPrompts.form, /contact page/)
  assert.equal((await call('GET', '/copy/nope')).status, 404)
})

test('POST …/pages/form/versions → 202 job; the job lands the take: artifact slots, default prompt, stored and selected', async () => {
  // The form's slots are measured on the engine-built product: take the headline's id and ceiling from it.
  const formSlots = (await call('GET', '/systems/acme/artifact-slots/form')).body.slots
  const H = formSlots
    .filter((s) => !s.inNav && !['paragraph', 'quote'].includes(s.role) && s.words >= 3)
    .sort((a, b) => b.words - a.words)[0]
  const max = Math.max(1, Math.ceil(H.words * 1.25))
  const over = Array.from({ length: max + 3 }, (_, i) => `w${i}`).join(' ')
  model.answer = JSON.stringify({
    title: 'Warm and short',
    nextPrompt: 'Now try it colder.',
    slots: { [H.id]: over, 'h1.9': 'not a slot' }
  })
  // The headline is over its ceiling: the host asks once more for that slot alone, and the short answer wins.
  model.answers = [model.answer, JSON.stringify({ slots: { [H.id]: 'Ask us anything' } })]
  const before = model.asked.length
  const r = await take('form', {})
  assert.equal(model.asked.length - before, 2, 'first the page, then the over-long slots alone')
  assert.match(model.asked.at(-1).messages[0].content[0].text, /^Some of your texts are over the maximum/)
  assert.match(
    model.asked.at(-1).messages[0].content[0].text,
    new RegExp(`- ${H.id.replace('.', '\\.')} \\[${H.role}, max ${max} words, you wrote ${max + 3}\\]`)
  )
  assert.equal(r.body.version.slots[H.id], 'Ask us anything')
  assert.equal(r.body.version.trimmed, undefined, 'nothing left over after the second ask')
  assert.deepEqual(r.body.version.usage, { inputTokens: 642, outputTokens: 90 }, 'both calls counted')
  assert.equal(r.body.state, 'done', JSON.stringify(r.body))
  const v = r.body.version
  assert.equal(v.kind, 'llm')
  assert.equal(v.title, 'Warm and short')
  assert.equal(v.model, 'deepseek/deepseek-chat')
  assert.match(v.prompt, /^A contact page/, 'no prompt given: the kind’s default was sent')
  assert.equal(r.body.nextPrompt, 'Now try it colder.')
  const asked = model.asked.at(-2)
  assert.equal(asked.provider, 'deepseek')
  assert.equal(asked.reasoningEffort, 'off', 'copy is asked for without a chain of thought')
  assert.equal(asked.maxTokens, 16_000)
  assert.equal(asked.messages[0].role, 'user')
  assert.match(asked.messages[0].content[0].text, /^Page kind: form/m)
  assert.match(asked.messages[0].content[0].text, /Language of the site: vi/)
  assert.match(asked.system, /ONE JSON object/)
  const file = copyFile()
  assert.equal(file.pages.form.selected, v.id)
  assert.equal(file.pages.form.nextPrompt, 'Now try it colder.')
  assert.equal(file.pages.form.versions.length, 1)
  const got = await call('GET', '/copy/acme')
  assert.equal(got.body.pages.form.versions[0].id, v.id)
})

test('POST with a prompt on a real page: fixture slots, the page’s kind and data in the ask, the given prompt kept', async () => {
  model.answer = JSON.stringify({ title: 'Cheaper', nextPrompt: 'n2', slots: { 'h1.1': 'Plans from $9' } })
  const r = await take('~pricing~', { prompt: 'Cheaper sounding.' })
  assert.equal(r.body.state, 'done', JSON.stringify(r.body))
  assert.equal(r.body.version.prompt, 'Cheaper sounding.')
  const text = model.asked.at(-1).messages[0].content[0].text
  assert.match(text, /^Page kind: pricing \(the site's page at \/pricing\/\)/m)
  assert.match(text, /- h1\.1 \[headline, max 8 words\]: "Design that ships"/)
  assert.match(text, /"Team"/)
  assert.doesNotMatch(text, /a\.3/)
  assert.ok(copyFile().pages['/pricing/'])
})

test('POST: the second take on a chip sees the selected take as the current text', async () => {
  model.answer = JSON.stringify({ title: 'Third', slots: { 'h1.1': 'Third headline' } })
  const r = await take('~pricing~', {})
  assert.equal(r.body.state, 'done')
  const text = model.asked.at(-1).messages[0].content[0].text
  assert.match(text, /- h1\.1 \[headline, max 8 words\]: "Plans from \$9"/)
  assert.equal(r.body.version.prompt, 'n2', 'no prompt given: the model’s own next prompt was sent')
  assert.equal(r.body.nextPrompt, null)
  assert.equal(copyFile().pages['/pricing/'].nextPrompt, null, 'the model gave none: nothing to prefill')
})

test('a new build brief excludes the workspace facts and previously selected copy', async (t) => {
  const file = path.join(siteDir, 'docs', 'agents', 'design-copy', 'acme.json')
  const previous = readFileSync(file)
  t.after(() => writeFileSync(file, previous))
  const slots = (await call('GET', '/systems/acme/artifact-slots/form')).body.slots
  const slot = slots.find((s) => !s.inNav && s.words >= 2)
  model.answer = JSON.stringify({ title: 'Fresh business', slots: { [slot.id]: 'Hello' } })
  const r = await take('form', { prompt: 'Fresh business only.', freshBrief: true })
  assert.equal(r.body.state, 'done')
  const asked = model.asked.at(-1)
  const text = asked.messages[0].content[0].text
  assert.doesNotMatch(asked.system, /Invent freely/)
  assert.match(asked.system, /Use only facts supplied/)
  assert.doesNotMatch(text, /Facts about the site \(JSON\)|Ask us anything/)
  assert.match(text, /Fresh business only/)
})

test('POST: an unknown chip, a bad prompt, a failing model, an unusable answer — each a status, never a crash', async () => {
  assert.deepEqual(await call('POST', '/copy/acme/pages/kit/versions', {}), {
    status: 404,
    body: { code: 'NO_SUCH_CHIP' }
  })
  assert.deepEqual((await call('POST', '/copy/acme/pages/~missing~/versions', {})).status, 404)
  assert.equal(
    (await call('POST', '/copy/acme/pages/form/versions', { prompt: 'x'.repeat(2000) })).body.code,
    'BAD_PROMPT'
  )
  model.fail = true
  const failed = await take('form', {})
  assert.equal(failed.body.state, 'failed')
  assert.deepEqual([failed.body.code, failed.body.message], ['MODEL_FAILED', 'quota'])
  model.fail = false
  model.answer = 'I would rather not.'
  const unusable = await take('form', {})
  assert.equal(unusable.body.state, 'failed')
  assert.equal(unusable.body.code, 'MODEL_ANSWER_UNUSABLE')
  assert.equal((await call('GET', '/copy/acme/jobs/v-ghost')).status, 404)
  assert.equal(copyFile().pages.form.versions.length, 1, 'nothing was stored for the failures')
})

test('POST: an adapter that refuses effort "off" is asked once more without it', async () => {
  model.rejectOff = true
  model.answer = JSON.stringify({
    title: 'Plain',
    nextPrompt: 'Now try it colder.',
    slots: { [(await call('GET', '/systems/acme/artifact-slots/form')).body.slots[0].id]: 'Say hello' }
  })
  const before = model.asked.length
  const r = await take('form', {})
  model.rejectOff = false
  assert.equal(r.body.state, 'done', JSON.stringify(r.body))
  assert.equal(model.asked.length - before, 2)
  assert.equal(model.asked.at(-2).reasoningEffort, 'off')
  assert.equal(model.asked.at(-1).reasoningEffort, undefined)
  assert.equal(r.body.version.title, 'Plain')
  const vid = r.body.version.id
  assert.equal((await call('DELETE', `/copy/acme/pages/form/versions/${vid}`)).status, 200)
})

test('POST: a lane whose own effort is "high" still gets copy asked for with "off"', async () => {
  // Measured on a dev lane 09/09 (deepseek-v4-flash-vision-exp, lane effort `high`): the lane's effort
  // forwarded to the copy call spent all 16k tokens on thinking and answered with 0 characters.
  model.effort = 'high'
  model.answer = JSON.stringify({
    title: 'Plain',
    nextPrompt: 'Now try it colder.',
    slots: { [(await call('GET', '/systems/acme/artifact-slots/form')).body.slots[0].id]: 'Say hello' }
  })
  const before = model.asked.length
  const r = await take('form', {})
  model.effort = undefined
  assert.equal(r.body.state, 'done', JSON.stringify(r.body))
  assert.equal(model.asked.length - before, 1)
  assert.equal(model.asked.at(-1).reasoningEffort, 'off', "the lane's effort is for its chat, not for copy")
  assert.equal((await call('DELETE', `/copy/acme/pages/form/versions/${r.body.version.id}`)).status, 200)
})

test('PUT …/selected and DELETE …/versions/<vid>: persisted; the deleted selection falls back', async () => {
  const vid = copyFile().pages.form.versions[0].id
  assert.equal((await call('PUT', '/copy/acme/pages/form/selected', { selected: 'default' })).status, 200)
  assert.equal(copyFile().pages.form.selected, 'default')
  assert.equal((await call('PUT', '/copy/acme/pages/form/selected', { selected: 'v-ghost' })).status, 404)
  assert.equal(
    (await call('PUT', '/copy/acme/pages/poster/selected', { selected: 'yours' })).status,
    200,
    'a chip with no take yet still remembers'
  )
  assert.equal((await call('PUT', '/copy/acme/pages/form/selected', { selected: vid })).status, 200)
  assert.equal((await call('DELETE', `/copy/acme/pages/form/versions/${vid}`)).status, 200)
  assert.deepEqual(copyFile().pages.form, { versions: [], selected: null, nextPrompt: 'Now try it colder.' })
  assert.equal((await call('DELETE', `/copy/acme/pages/form/versions/${vid}`)).status, 404)
})

test('tool write: a rewritten version on a chip, titled by the agent; form shows it', async () => {
  const w = await tool.execute({
    action: 'write',
    id: 'acme',
    chip: 'form',
    lang: 'vi',
    title: 'Agent take',
    // One word: the built form's headline slot is the brand name alone, and its ceiling is two words.
    slots: {
      [(await call('GET', '/systems/acme/artifact-slots/form')).body.slots.find((s) => s.role === 'headline')
        ?.id ?? 'p.0']: 'Hello'
    }
  })
  assert.equal(w.ok, true, JSON.stringify(w))
  assert.equal(w.version.title, 'Agent take')
  const file = copyFile()
  assert.equal(file.pages.form.versions[0].kind, 'rewritten')
  assert.equal(file.pages.form.selected, w.version.id)
  assert.equal(file.lang, 'vi')
  const form = await tool.execute({ action: 'form', id: 'acme', chip: 'form' })
  assert.equal(form.ok, true)
  assert.deepEqual(form.layout, { artifact: 'form' })
  assert.equal(form.written.versions[0].title, 'Agent take')
  const home = await tool.execute({ action: 'form', id: 'acme' })
  assert.deepEqual(home.layout, { fixture: 'components.html', kind: 'home' })
  assert.deepEqual(
    home.slots.map((s) => s.id),
    ['h1.1', 'p.1']
  )
  const bad = await tool.execute({ action: 'write', id: 'acme', chip: 'kit', slots: { 'h1.1': 'x' } })
  assert.equal(bad.ok, false)
  assert.match(bad.error, /No such chip: kit\. The chips of this site are "\/", "\/pricing\/", "landing"/)
  assert.match(bad.error, /PREVIEW version only/)
  const slashless = await tool.execute({ action: 'form', id: 'acme', chip: '/pricing' })
  assert.equal(slashless.ok, true, 'the site file spells it /pricing/; the agent may not')
  assert.equal(slashless.chip, '/pricing/')
})

test("GET systems/<id>/system/artifacts/<kind>.html: a library inspiration gets the engine-built product, not upstream's card; its slot map is measured on it", async () => {
  const res = await fetch(`${base}/systems/acme/system/artifacts/poster.html`)
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.ok(html.length > 8000, `${html.length} chars`)
  assert.match(html, /Acme/)
  const deck = await (await fetch(`${base}/systems/acme/system/artifacts/deck.html`)).text()
  assert.match(deck, /slide/i)
  assert.notEqual(deck.slice(0, 2000), html.slice(0, 2000), 'a deck is not a poster')
  const slots = await call('GET', '/systems/acme/artifact-slots/poster')
  assert.equal(slots.status, 200)
  assert.ok(slots.body.slots.length > 0)
  assert.ok(
    slots.body.slots.some((s) => /Acme/.test(s.text)),
    'measured on the built poster, not the shared template map'
  )
  assert.equal((await fetch(`${base}/systems/acme/system/artifacts/brochure.html`)).status, 404)
})

test('the agent reads the host library without shell paths and cannot traverse it', async () => {
  const catalog = await libraryTool.execute({})
  assert.equal(catalog.ok, true)
  assert.deepEqual(
    catalog.systems.map((s) => s.id),
    ['acme']
  )
  const system = await libraryTool.execute({ id: 'acme' })
  assert.equal(system.ok, true)
  assert.match(system.tokens, /--accent:#ff0000/)
  assert.equal(system.design, null)
  assert.equal((await libraryTool.execute({ id: '../site' })).ok, false)
})

/**
 * ONE DSH, MANY SITES (ADR 0014). This `apply()` pins no `siteDir`: the doors must take the site
 * folder from the header the gate stamps (`x-dsh-allowed-folders`, `@tracy/core/site-dir`) — the
 * same rule `tracy-brand-engine` writes by, or the card it wrote is a card this tab cannot find.
 */
test('the brand doors read the seat folder named by the gate header, and see nothing without it', async () => {
  const seatDir = mkdtempSync(path.join(tmpdir(), 'tracy-design-seat-'))
  const brandDir = path.join(seatDir, 'Brand', 'seat.example')
  mkdirSync(brandDir, { recursive: true })
  writeFileSync(
    path.join(brandDir, 'manifest.json'),
    JSON.stringify({
      id: 'brand:seat.example',
      name: 'Seat Co',
      kind: 'reference',
      category: 'Reference',
      source: { extractedAt: '2026-09-14T00:00:00.000Z' }
    })
  )
  writeFileSync(path.join(brandDir, 'tokens.css'), ':root{--accent:#7a1f1f}')
  let handler = null
  const ctx = {
    effect: (fn) => fn(),
    webServer: { register: (route) => ((handler = route), () => undefined) },
    tools: { register: () => () => undefined },
    llm: { generate: () => jsonStream([]) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }) }
  }
  apply(ctx, { catalog: path.join(root, 'lib', 'design-catalog.json'), libraryUrl: false })
  const server2 = http.createServer((req, res) => handler.handler(req, res))
  await new Promise((r) => server2.listen(0, '127.0.0.1', r))
  const base2 = `http://127.0.0.1:${server2.address().port}/api/tracy-design-inspiration`
  const stamped = { 'x-dsh-allowed-folders': JSON.stringify([seatDir]) }
  try {
    const catalog = await (await fetch(`${base2}/catalog`, { headers: stamped })).json()
    assert.equal(catalog.systems[0]?.id, 'brand:seat.example', "the seat's own brand leads its catalog")
    const tokens = await fetch(`${base2}/systems/brand%3Aseat.example/tokens.css`, { headers: stamped })
    assert.equal(tokens.status, 200)
    assert.equal(await tokens.text(), ':root{--accent:#7a1f1f}')

    const bare = await (await fetch(`${base2}/catalog`)).json()
    assert.equal(
      bare.systems.some((s) => s.id === 'brand:seat.example'),
      false,
      "no header, not this seat's card"
    )
    assert.equal((await fetch(`${base2}/systems/brand%3Aseat.example/tokens.css`)).status, 404)
    // A header that is not a JSON array of absolute paths is ignored, never obeyed.
    const bad = await fetch(`${base2}/systems/brand%3Aseat.example/tokens.css`, {
      headers: { 'x-dsh-allowed-folders': JSON.stringify(['../elsewhere']) }
    })
    assert.equal(bad.status, 404)
  } finally {
    server2.close()
    rmSync(seatDir, { recursive: true, force: true })
  }
})

/**
 * WHAT A LANE SEES, BY WHAT TRACY ANSWERS (16/09; the switch, 24/09).
 *
 * The Design inspiration card lives in exactly one place — `tracy_design_inspiration.json` on the
 * release, served to every surface through `GET /api/templates`. There is no second copy in the
 * image, on purpose: Publish and Unpublish from the operations screen are one press, and a copy in
 * the image would keep drawing a card a press had already taken down.
 *
 * Whether the 152 design systems are offered beside those cards is Tracy's switch
 * (`GET /api/design-systems`), off by default. Off drops the library by KIND — a template card
 * keeps its place whatever its id. A switch the lane cannot read is off, so a lane that cannot
 * reach Tracy sees neither template cards nor design systems: nobody can create a site from a card
 * while Tracy is unreachable either — the create door is Tracy's too.
 */
test('the lane offers its design systems only when Tracy says so, and a silent Tracy says no', async () => {
  const imageDir = mkdtempSync(path.join(tmpdir(), 'tracy-design-image-'))
  // A catalogue of the old shape, card block and all: even THIS draws no card any more.
  writeFileSync(
    path.join(imageDir, 'quickstarts.json'),
    JSON.stringify({
      'tracy-business/j6': {
        platform: 'joomla',
        version: '1.0.0',
        template: { id: 'tracy-business', label: 'Tracy Business' },
        card: { provider: 'JoomlArt', category: 'Professional & Corporate', image: 'home.png' }
      }
    })
  )
  // A fake Tracy: one published card, and the switch as this test sets it.
  const tracy = { shown: false }
  const tracyServer = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    if (req.url === '/api/design-systems') return res.end(JSON.stringify({ shown: tracy.shown }))
    res.end(
      JSON.stringify({
        templates: [
          {
            id: 'ja-kinetic',
            label: 'JA Kinetic',
            card: { provider: 'JoomlArt', category: 'Professional & Corporate', image: 'home.png' },
            platforms: [{ platform: 'joomla', tag: 'ja-kinetic/j6', version: '1.0.0' }]
          }
        ]
      })
    )
  })
  await new Promise((r) => tracyServer.listen(0, '127.0.0.1', r))
  const lane = async (tracyOrigin, query = '') => {
    let handler = null
    const ctx = {
      effect: (fn) => fn(),
      webServer: { register: (route) => ((handler = route), () => undefined) },
      tools: { register: () => () => undefined },
      llm: { generate: () => jsonStream([]) },
      agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }) }
    }
    apply(ctx, {
      siteDir,
      catalog: path.join(root, 'lib', 'design-catalog.json'),
      libraryUrl: false,
      tracyOrigin,
      quickstarts: path.join(imageDir, 'quickstarts.json')
    })
    const server2 = http.createServer((req, res) => handler.handler(req, res))
    await new Promise((r) => server2.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${server2.address().port}/api/tracy-design-inspiration/catalog${query}`
    try {
      const catalog = await (await fetch(url)).json()
      return {
        systems: catalog.systems.filter((s) => s.template === undefined).map((s) => s.id),
        templates: catalog.systems.filter((s) => s.template !== undefined).map((s) => s.id)
      }
    } finally {
      server2.close()
    }
  }
  const reachable = `http://127.0.0.1:${tracyServer.address().port}`
  try {
    const off = await lane(reachable)
    assert.deepEqual(off.templates, ['ja-kinetic'], 'the published card stays when the switch is off')
    assert.ok(!off.systems.includes('acme'), 'no design system while the switch is off')
    // The Design system panel's read (11/10/2026): its library is what Tracy's apply door can put
    // on the site, which the gallery's switch never governed — with the switch off (production's
    // state) the panel listed nothing and nothing could be applied.
    const panel = await lane(reachable, '?systems=all')
    assert.ok(
      panel.systems.includes('acme'),
      "the panel's library holds the systems while the gallery's switch is off"
    )
    assert.deepEqual(panel.templates, ['ja-kinetic'], 'the templates ride along; the panel filters them out')

    tracy.shown = true
    const on = await lane(reachable)
    assert.deepEqual(on.templates, ['ja-kinetic'])
    assert.ok(on.systems.includes('acme'), 'the design systems return with the switch')

    // Nothing listens there: the door throws, which is exactly "Tracy cannot be reached".
    const silent = await lane('http://127.0.0.1:1')
    assert.deepEqual(silent.templates, [], 'no template card is drawn from the image')
    assert.ok(!silent.systems.includes('acme'), 'a switch that cannot be read is off')
  } finally {
    tracyServer.close()
    rmSync(imageDir, { recursive: true, force: true })
  }
})

/**
 * THE CHAT WITH THE SWITCH OFF. The three tools stop offering the library and hand the agent the
 * templates published right now — read from Tracy at call time, so nothing names a template — while
 * `brand:<host>` proposes, previews and copies as before. A switch that cannot be read is off.
 */
test('switch off: the chat tools refuse a design system and point to the published templates; brand:<host> still works', async (t) => {
  const brandDir = path.join(siteDir, 'Brand', 'own.example')
  mkdirSync(brandDir, { recursive: true })
  writeFileSync(
    path.join(brandDir, 'manifest.json'),
    JSON.stringify({ id: 'brand:own.example', name: 'Own Co', kind: 'own', category: 'Your brand' })
  )
  writeFileSync(path.join(brandDir, 'slots.json'), JSON.stringify({ slots: FIXTURE_SLOTS }))
  tracy.templates = [
    {
      id: 'north-star',
      label: 'North Star',
      card: { category: 'Business', blurb: 'A studio site.' },
      platforms: [{ platform: 'joomla', tag: 'north-star/j6', version: '1.0.0' }]
    }
  ]
  t.after(() => {
    Object.assign(tracy, { shown: true, down: false, templates: [] })
    rmSync(path.join(siteDir, 'Brand'), { recursive: true, force: true })
  })
  const refusals = async () => [
    await libraryTool.execute({}),
    await libraryTool.execute({ id: 'acme' }),
    await proposeTool.execute({ picks: [{ id: 'acme', why: 'x' }] }),
    await proposeTool.execute({ picks: [{ id: 'north-star', why: 'x' }] }),
    await tool.execute({ action: 'form', id: 'acme' })
  ]

  tracy.shown = false
  for (const r of await refusals()) {
    assert.equal(r.ok, false)
    assert.equal(r.code, 'DESIGN_SYSTEMS_OFF')
    assert.deepEqual(r.templates, [
      {
        id: 'north-star',
        name: 'North Star',
        category: 'Business',
        platforms: ['joomla'],
        blurb: 'A studio site.'
      }
    ])
  }
  const brand = await proposeTool.execute({ picks: [{ id: 'brand:own.example', why: 'yours' }] })
  assert.equal(brand.ok, true)
  assert.deepEqual(
    brand.picks.map((p) => p.id),
    ['brand:own.example']
  )
  const form = await tool.execute({ action: 'form', id: 'brand:own.example' })
  assert.equal(form.ok, true)
  assert.deepEqual(
    form.slots.map((s) => s.id),
    ['h1.1', 'p.1']
  )
  const write = await tool.execute({
    action: 'write',
    id: 'brand:own.example',
    lang: 'vi',
    slots: { 'h1.1': 'Thiết kế của bạn' }
  })
  assert.equal(write.ok, true)

  // An Unpublish reaches the chat on the next call, with no edit and no release.
  tracy.templates = []
  assert.deepEqual((await libraryTool.execute({})).templates, [])

  tracy.down = true
  for (const r of await refusals()) {
    assert.equal(r.code, 'DESIGN_SYSTEMS_OFF', 'a switch that cannot be read is off')
    assert.equal(r.templates, null, 'no list when Tracy cannot be asked')
  }
  // A Tracy that cannot be asked cannot say the chat route is on either: a brand is not proposed
  // (`chat-design-system`, 11/10/2026). The copy tool still writes its preview.
  const silentBrand = await proposeTool.execute({ picks: [{ id: 'brand:own.example' }] })
  assert.equal(silentBrand.code, 'CHAT_DESIGN_SYSTEM_OFF')

  tracy.down = false
  tracy.shown = true
  assert.deepEqual(
    (await libraryTool.execute({})).systems.map((s) => s.id),
    ['acme']
  )
  assert.equal((await libraryTool.execute({ id: 'acme' })).ok, true)
  assert.equal((await proposeTool.execute({ picks: [{ id: 'acme' }, { id: 'brand:own.example' }] })).ok, true)
  assert.equal((await tool.execute({ action: 'form', id: 'acme' })).ok, true)
  const template = await proposeTool.execute({ picks: [{ id: 'north-star' }] })
  assert.equal(template.ok, false, 'a template is not a design system to propose, switch or no switch')
  assert.equal(template.code, undefined)
})

/**
 * A BRAND'S CREATE BUTTONS FOLLOW THE QUICKSTARTS TRACY PUBLISHES (29/09/2026). The catalog
 * door stamps a brand row with the CMSes where a published quickstart can wear it — a catalogue
 * look on a CMS whose build makes a brand into a style — and with none when nothing can.
 */
test('catalog: a brand row names WordPress only while a catalogue-styled WordPress quickstart is published', async (t) => {
  const brandDir = path.join(siteDir, 'Brand', 'own.example')
  mkdirSync(brandDir, { recursive: true })
  writeFileSync(
    path.join(brandDir, 'manifest.json'),
    JSON.stringify({ id: 'brand:own.example', name: 'Own Co', kind: 'own', category: 'Your brand' })
  )
  t.after(() => {
    Object.assign(tracy, { shown: true, down: false, templates: [] })
    rmSync(path.join(siteDir, 'Brand'), { recursive: true, force: true })
  })
  const brandRow = async () =>
    (await call('GET', '/catalog')).body.systems.find((s) => s.id === 'brand:own.example')

  tracy.templates = [
    {
      id: 'tracy-base',
      label: 'Tracy Base',
      card: { category: 'Business' },
      platforms: [
        { platform: 'joomla', tag: 'tracy-base/j6', version: '1.0.0' },
        { platform: 'wordpress', tag: 'tracy-base/wp7', version: '1.1.0' }
      ],
      design: { id: 'acme', source: 'catalog' }
    }
  ]
  assert.deepEqual((await brandRow()).platforms, ['wordpress'])

  // A look of its own is not a theme that wears styles: nothing to wear a brand on.
  tracy.templates = [{ ...tracy.templates[0], design: { id: 'tracy-base', source: 'quickstart' } }]
  assert.deepEqual((await brandRow()).platforms, [])

  // Tracy cannot be asked: no quickstart is known, so no button lights.
  tracy.down = true
  assert.deepEqual((await brandRow()).platforms, [])
})

/**
 * THE CHAT ROUTE TO A DESIGN SYSTEM, OFF (11/10/2026: the Design system button in the site browser
 * toolbar is the only way in; `chat-design-system`, off by default). The agent proposes nothing for the
 * site and the dialog's pick is not recorded — both start the redesign of the running site in the chat —
 * while the library stays readable and the copy tool keeps writing PREVIEW versions.
 */
test('chat route off: no proposal, no recorded pick; the library and preview copy stay', async (t) => {
  t.after(() => {
    tracy.hidden = []
  })
  const sitePath = path.join(siteDir, 'docs', 'agents', 'design-preview.json')
  const before = readFileSync(sitePath, 'utf8')
  tracy.hidden = ['chat-design-system']

  const proposed = await proposeTool.execute({ picks: [{ id: 'acme', why: 'bold' }] })
  assert.equal(proposed.ok, false)
  assert.equal(proposed.code, 'CHAT_DESIGN_SYSTEM_OFF')
  assert.match(proposed.error, /Design system row on the site's start screen/)
  const chose = await call('POST', '/choose', { id: 'acme' })
  assert.equal(chose.status, 403)
  assert.equal(chose.body.code, 'CHAT_DESIGN_SYSTEM_OFF')
  assert.equal(readFileSync(sitePath, 'utf8'), before, 'no picks, no chosen written into the site file')

  assert.equal((await libraryTool.execute({ id: 'acme' })).ok, true, 'reading the library is not applying')
  assert.equal(
    (await tool.execute({ action: 'form', id: 'acme' })).ok,
    true,
    'a preview version is not applying'
  )

  // One press on /ops brings the route back, with no release.
  tracy.hidden = []
  assert.equal((await proposeTool.execute({ picks: [{ id: 'acme', why: 'bold' }] })).ok, true)
  assert.equal((await call('POST', '/choose', { id: 'acme' })).status, 200)
})
