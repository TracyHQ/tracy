// The look guard (ADR 0044, decision 10): a written site may change its accent, icons, pictures, words and logo, and nothing else,
// so a write that could touch anything else is refused before it is sent. Everything here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accentModule } from '../src/lib/brand-accent/accent-module.js'
import { headBlock, menuCssFor, withBlock } from '../src/write-step/brand-head-block.js'
import { lookGuard } from '../src/write-step/look-guard.js'
import { accentRoutesOf, cssFaults } from '../src/write-step/look-guard-css.js'
import { markupFaults } from '../src/write-step/look-guard-markup.js'
import { runStep } from './_write-step-run.mjs'

const kit = {
  site: {
    logoSpots: [
      { id: 'logo-1', setting: 'site_logo' },
      { id: 'logo-2', setting: null, frameId: 'block-1.2' }
    ],
    favicon: { mechanism: { setting: 'template site setting other_faviconFile' } },
    nameSlots: [{ kind: 'setting', setting: 'template site setting site_name (a file)' }],
    settingSlots: [
      { id: 'contact-4.mobile', writable: true, writeTo: { entity: 'contact-4', column: 'mobile' } },
      {
        id: 'block-9.map',
        writable: true,
        writeTo: { entity: 'module-9', column: 'content', whole: true, template: '{map <address>}' }
      },
      {
        id: 'site.back',
        writable: true,
        writeTo: { action: 'template.siteSettings', template: 'demo', key: 'body_bg_img' }
      }
    ]
  }
}
const contentMap = {
  slots: [
    { key: 'module-1.0', type: 'text', sample: 'Plain demo words' },
    { key: 'module-1.1', type: 'text', sample: '((ul class="list-star"))((li))One((/li))((/ul))' },
    { key: 'module-1.2', type: 'image', sample: 'images/demo/a.png' },
    { key: 'module-1.3', type: 'url', sample: '#' },
    { key: 'module-1.4', type: 'text', sample: 'From ((span))one((/span))' }
  ]
}

/** A guard over a door that answers with `answers(call)`, and what reached that door. */
function guarded(answers = () => ({ ok: true }), { owners } = {}) {
  const guard = lookGuard({ kit, contentMap })
  if (owners) guard.know({ owners })
  const sent = []
  const door = guard.door({
    apply: async (call) => {
      sent.push(call)
      return answers(call)
    }
  })
  const call = (action, params) => door.apply({ siteKey: 'demo', action, params })
  return { guard, sent, call }
}

/** Whether this one call passes the door, and what the guard found on it. */
async function verdict(action, params, { answers, reads = [], owners } = {}) {
  const { guard, sent, call } = guarded(answers, { owners })
  for (const [readAction, readParams] of reads) await call(readAction, readParams)
  const before = sent.length
  const answer = await call(action, params)
  return { passed: sent.length > before, answer, refused: guard.findings() }
}
const green = async (...args) => {
  const { passed, refused } = await verdict(...args)
  assert.deepEqual(refused, [])
  assert.equal(passed, true)
}
// A finding (ADR 0044, decision 26): a value is sent all the same and the finding is kept for the site check; only a call on a
// channel nobody listed is held back.
const red = async (args, { step, names }) => {
  const { passed, answer, refused } = await verdict(...args)
  assert.ok(refused.length, 'the finding is kept')
  const held = refused.some((f) => f.sent === false)
  assert.equal(passed, !held, held ? 'a channel nobody listed is not sent' : 'a value is sent all the same')
  if (held) {
    assert.equal(answer.ok, false)
    assert.equal(answer.error, 'look_guard')
  }
  const said = JSON.stringify(refused)
  assert.ok(said.includes(names), `${said} names ${names}`)
  if (step) assert.equal(refused[0].stepName, step)
  return refused
}

test('an action nobody listed is refused by name, naming the write step', async () => {
  await red(['template.fonts', { operation: 'set', fields: { heading: 'Serif' } }], {
    step: 'write',
    names: 'template.fonts'
  })
})

test('an operation or a parameter nobody listed is refused by name', async () => {
  await red(['content.contract', { operation: 'blocks.restyle', blocks: [] }], { names: 'blocks.restyle' })
  await red(['template.siteSettings', { operation: 'reset', template: 'demo' }], { names: 'reset' })
  await red(['content.contract', { operation: 'apply', changes: {}, replace_kept: { a: 'b' } }], {
    names: 'replace_kept'
  })
})

test('reads pass without a judgement', async () => {
  await green('info', {})
  await green('content.get', { kind: 'module', id: 3 })
  await green('content.list', { kind: 'menuItem', limit: 25 })
  await green('content.contract', { operation: 'inspect' })
  await green('template.siteSettings', { template: 'demo' })
  await green('template.siteSettings', { operation: 'read', template: 'demo' })
  await green('site.identity', { operation: 'read' })
})

test('a channel nobody listed is held back, and the writes after it still go out', async () => {
  const { guard, sent, call } = guarded()
  const held = await call('template.fonts', {})
  assert.equal(held.ok, false)
  assert.equal(sent.length, 0)
  const answer = await call('media.upload', { path: 'images/a.png', content_b64: 'eA==' })
  assert.equal(answer.ok, true)
  await call('info', {})
  assert.equal(sent.length, 2)
  assert.equal(guard.refused().length, 1, 'one fault, said once')
  assert.equal(guard.refused()[0].stepName, 'write')
  assert.equal(guard.refused()[0].sent, false)
})

test('a value with a finding is sent, and the finding is kept with its step', async () => {
  const { guard, sent, call } = guarded(undefined, {
    owners: new Map([['block-1.1', { owner: 'writer' }]])
  })
  const answer = await call('content.contract', { operation: 'apply', changes: { 'module-1.1': 'Coach' } })
  assert.equal(answer.ok, true)
  assert.equal(sent.length, 1)
  assert.deepEqual(guard.refused(), [], 'nothing held back')
  const [finding] = guard.findings()
  assert.equal(finding.what, 'module-1.1')
  assert.equal(finding.step, 6)
  assert.equal(finding.sent, true)
  assert.match(finding.reason, /list-star/)
})

test('a template setting is open only for what the kit names as a logo, a name, a favicon or a background', async () => {
  const set = (fields) => ['template.siteSettings', { operation: 'set', template: 'demo', fields }]
  await green(...set({ site_logo: 'images/brand/logo.png' }))
  await green(...set({ site_logo_small: 'images/brand/small.png' }))
  await green(...set({ other_faviconFile: 'images/brand/f.ico' }))
  await green(...set({ site_name: 'Invented Club' }))
  await green(...set({ body_bg_img: 'images/content/back.jpg' }))
  await green(...set({ other_shareImage: 'images/content/share.jpg' }))
  await red(set({ font_body: 'Serif' }), { step: 'write', names: 'font_body' })
  await red(set({ styles_borderRadius: '18px' }), { names: 'styles_borderRadius' })
  await red(set({ site_logo: 'url(/x.css)' }), { names: 'site_logo' })
  await red(set({ site_name: 'Invented <b style="font-size:40px">Club</b>' }), { names: 'site_name' })
  await red(
    [
      'template.siteSettings',
      { operation: 'set', template: 'demo', profiles: { default: { color_a: '#000' } } }
    ],
    { names: 'color_a' }
  )
})

test('an upload is a picture under images/, and no stylesheet or script can arrive as a file', async () => {
  const up = (path) => ['media.upload', { path, content_b64: 'eA==' }]
  await green(...up('images/tracy-content/abc.webp'))
  await green(...up('images/tracy-brand/f.ico'))
  await red(up('images/tracy-content/abc.css'), { step: 'write', names: 'abc.css' })
  await red(up('templates/demo/css/custom.png'), { names: 'templates/demo' })
  await red(up('images/../templates/x.png'), { names: 'templates/x.png' })
})

test('the site name is the only identity field', async () => {
  await green('site.identity', { operation: 'set', fields: { sitename: 'Invented Club' } })
  await red(['site.identity', { operation: 'set', fields: { template_style: '9' } }], {
    names: 'template_style'
  })
})

// ── CSS ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const SEED = '#d83a3a'
const SHEETS = [
  `:root{--demo-primary:${SEED};--demo-radius:6px}
   .btn{background-color:${SEED};color:#fff;border-radius:6px;font-weight:700}
   .card{border:2px solid ${SEED};box-shadow:0 4px 8px rgba(216,58,58,.25)}
   a{color:var(--demo-primary)}
   @media (min-width:600px){.hero{background:${SEED} url(/x.png) no-repeat}}
   @keyframes pulse{0%{outline-color:${SEED}}100%{outline-color:transparent}}`
]
const COLOURS = {
  accent: '#0e7f48',
  replaces: SEED,
  shifts: [{ side: 'dark', colour: 'accent', to: '#22aa66' }]
}
const built = () => accentModule({ sheets: SHEETS, colours: COLOURS, darkHook: ':has(> body.dark-active)' })
const routes = () => accentRoutesOf(SHEETS, SEED)
const styleOf = (html) => /<style[^>]*>([\s\S]*)<\/style>/.exec(html)[1]

/** A block of the shape that once rounded a template's buttons: about 50 KB of a whole design system. */
function designSystemBlock() {
  const rules = [':root{--ds-c-bg:#ffffff;--ds-radius:18px;--ds-font:"Invented Sans"}']
  for (let n = 0; rules.join('').length < 50_000; n++)
    rules.push(
      `.ds-${n},.btn{border-radius:18px;font-family:var(--ds-font);font-size:17px;font-weight:600;border-width:2px;padding:12px 28px;background-color:var(--ds-c-bg);color:#111}`
    )
  return `<style id="tracy-ds-slot">/* tracy-ds-slot: design-system-1 */\n${rules.join('\n')}</style>`
}

test('the module the accent builds from a template is green against the routes of that template', () => {
  const { html } = built()
  assert.deepEqual(cssFaults(styleOf(html), { routes: routes() }), [])
})

test('a design-system block of 50 KB is a finding naming the brand step and what it would change, and is sent all the same', async () => {
  const content = designSystemBlock()
  assert.ok(Buffer.byteLength(content) >= 50_000)
  const guard = lookGuard({ kit, contentMap })
  guard.know({ routes: routes() })
  const sent = []
  const door = guard.door({ apply: async (call) => (sent.push(call), { ok: true }) })
  const answer = await door.apply({
    siteKey: 'demo',
    action: 'content.update',
    params: { kind: 'module', id: 7, fields: { content } }
  })
  assert.equal(answer.ok, true)
  assert.equal(sent.length, 1, 'a finding does not hold the write back (decision 26)')
  const said = JSON.stringify(guard.findings())
  for (const prop of ['border-radius', 'font-family', 'font-size', 'font-weight', 'border-width'])
    assert.ok(said.includes(prop), `${prop} is named`)
  assert.equal(guard.findings()[0].stepName, 'brand')
})

test('each kind of declaration the rule forbids is red on its own', () => {
  const on = (css) => cssFaults(css, { routes: routes() })
  for (const [css, names] of [
    ['.btn{border-radius:18px}', 'border-radius'],
    ['.btn{font-family:Serif}', 'font-family'],
    ['.btn{font-size:20px}', 'font-size'],
    ['.card{border-width:4px}', 'border-width'],
    ['.btn{padding:0}', 'padding'],
    [':root{--demo-radius:18px}', '--demo-radius'],
    ['@media (min-width:9px){.btn{font-weight:400}}', 'font-weight']
  ]) {
    const faults = on(css)
    assert.equal(faults.length, 1, css)
    assert.ok(JSON.stringify(faults[0]).includes(names), css)
  }
})

test("a colour is red off the accent routes: the grounds stay the template's", () => {
  const on = (css) => cssFaults(css, { routes: routes() })
  assert.equal(on('body{background-color:#000}').length, 1)
  assert.equal(on('.other{color:var(--tracy-accent)}').length, 1)
  assert.equal(on('.btn{background-color:var(--tracy-accent)}').length, 0)
})

test('a shorthand on a route may change its colour and nothing else', () => {
  const on = (css) => cssFaults(css, { routes: routes() })
  assert.equal(on('.card{border:2px solid var(--tracy-accent)}').length, 0)
  assert.equal(on('.card{border:4px solid var(--tracy-accent)}').length, 1)
  assert.equal(
    on('.card{box-shadow:0 4px 8px color-mix(in srgb,var(--tracy-accent) 25%,transparent)}').length,
    0
  )
  assert.equal(on('.card{box-shadow:0 9px 8px var(--tracy-accent)}').length, 1)
  assert.equal(
    on('@media (min-width:600px){.hero{background:var(--tracy-accent) url(/x.png) no-repeat}}').length,
    0
  )
  assert.equal(
    on('@media (min-width:600px){.hero{background:var(--tracy-accent) url(/y.png) no-repeat}}').length,
    1
  )
})

test('what the rule reader would skip is red, not silence', () => {
  const on = (css) => cssFaults(css, { routes: routes() })
  assert.equal(on('@import url(/x.css);').length, 1)
  assert.equal(on('@font-face{font-family:X;src:url(/x.woff)}').length, 1)
  assert.equal(on('@keyframes other{0%{width:0}}').length, 1)
  assert.equal(
    on('@keyframes pulse{0%{outline-color:var(--tracy-accent)}100%{outline-color:transparent}}').length,
    0
  )
  assert.equal(on('@keyframes pulse{0%{outline-width:9px}}').length, 1)
  assert.equal(on('.btn{color:red').length, 1, 'a rule that never closes cannot be read')
})

test('the markup forms and the tones need no route: they name only the accent', () => {
  const on = (css) => cssFaults(css, { routes: null })
  assert.equal(on(':root{--tracy-accent:#0e7f48;--tracy-accent-text:#0e7f48}').length, 0)
  assert.equal(on('[fill="#d83a3a" i]{fill:var(--tracy-accent)}').length, 0)
  assert.equal(on('[style^="color:#d83a3a"]{color:var(--tracy-accent-text)!important}').length, 0)
  assert.equal(on('[fill="#d83a3a" i]{stroke-width:9}').length, 1)
  assert.equal(on(':root{--tracy-accent:18px}').length, 1)
  assert.equal(
    on('.btn{color:var(--tracy-accent)}').length,
    1,
    'with no routes known, no rule can be held to one'
  )
})

const headRead = ['content.get', { kind: 'module', id: 88 }]
const headAnswers = (content) => (call) =>
  call.action === 'content.get' ? { ok: true, item: { id: 88, content } } : { ok: true }
const headWrite = (content) => ['content.update', { kind: 'module', id: 88, fields: { content } }]

test('the head block is icons and the phone logo, with a stated exception for its one size declaration', async () => {
  const block = headBlock({ png32: 'images/b/32.png' }, menuCssFor({ light: 'images/b/small.png' }))
  const held = "<script>/* the template's */</script>"
  const options = { answers: headAnswers(held), reads: [headRead] }
  await green(...headWrite(withBlock(held, block)), options)
  const bigger = block.replace('height:auto', 'height:40px')
  await red([...headWrite(withBlock(held, bigger)), options], { step: 'brand', names: 'height' })
  const extra = block.replace('<style>', '<style>.btn{border-radius:18px}')
  await red([...headWrite(withBlock(held, extra)), options], { step: 'brand', names: 'border-radius' })
})

test('a style or a script added outside the head block is refused; one the template already held stays', async () => {
  const block = headBlock({ png32: 'images/b/32.png' })
  const held = '<style>.template-own{border-radius:2px}</style>'
  const options = { answers: headAnswers(held), reads: [headRead] }
  await green(...headWrite(withBlock(held, block)), options)
  await red([...headWrite(withBlock(`${held}<style>.b{font-size:9px}</style>`, block)), options], {
    names: 'font-size'
  })
  await red([...headWrite(withBlock(`${held}<script src="/x.js"></script>`, block)), options], {
    names: 'script'
  })
})

// ── Words ────────────────────────────────────────────────────────────────────────────────────────────────────────

const apply = (changes) => ['content.contract', { operation: 'apply', changes, evidence: {} }]

test('written words: a plain replacement is green, in either form of markup', () => {
  assert.deepEqual(markupFaults('New words', 'Plain demo words'), [])
  assert.deepEqual(markupFaults('((p))One((/p))\n((p))Two((/p))', 'Plain demo words'), [])
  assert.deepEqual(markupFaults('Now ((span))two((/span))', 'From ((span))one((/span))'), [])
  assert.deepEqual(
    markupFaults('Plain now', 'From ((span))one((/span))'),
    [],
    'an element with no class of its own'
  )
  assert.deepEqual(
    markupFaults(
      '((ul class="list-star"))((li))New((/li))((/ul))',
      '((ul class="list-star"))((li))One((/li))((/ul))'
    ),
    []
  )
  assert.deepEqual(markupFaults('((a href="/x"))Go((/a))', '((a href="#"))Go((/a))'), [])
})

test('written words: a new style, a changed class, a new element or attribute that sizes is red', () => {
  const red1 = (value, sample) => assert.equal(markupFaults(value, sample).length > 0, true, value)
  red1('New ((span style="font-size:40px"))words((/span))', 'Plain')
  red1('New <span style="color:red">words</span>', 'Plain')
  red1('((p class="lead"))New((/p))', 'Plain')
  red1('<p class="lead">New</p>', 'Plain')
  red1('((ul class="other"))((li))New((/li))((/ul))', '((ul class="list-star"))((li))One((/li))((/ul))')
  red1('((ul))((li))New((/li))((/ul))', '((ul class="list-star"))((li))One((/li))((/ul))')
  red1('((p))New((/p))', '((ul class="list-star"))((li))One((/li))((/ul))')
  red1('((h1))New((/h1))', 'Plain')
  red1('((style)).a{color:red}((/style))', 'Plain')
  red1('<img src="x.png" width="900">', 'Plain')
  red1('((a href="/x" id="big"))Go((/a))', '((a href="#"))Go((/a))')
})

test('a text slot names whose words it is: the copy, the plan or the brand', async () => {
  const change = { 'module-1.0': 'New ((span style="font-size:9px"))words((/span))' }
  const owners = (owner) => new Map([['block-1.0', { owner }]])
  await red([...apply(change), { owners: owners('writer') }], { step: 'copy', names: 'module-1.0' })
  await red([...apply(change), { owners: owners('plan-label') }], { step: 'planner', names: 'module-1.0' })
  await red([...apply(change), { owners: owners('brand') }], { step: 'brand', names: 'module-1.0' })
  await red(apply(change), { step: 'write', names: 'module-1.0' })
})

test('a picture slot holds a picture path and a link slot an address', async () => {
  await green(...apply({ 'module-1.2': 'images/content/new.webp' }))
  await green(...apply({ 'module-1.2': 'images/content/new.png#joomlaImage://x?width=1&height=1' }))
  await red(apply({ 'module-1.2': 'New words' }), { names: 'module-1.2' })
  await green(...apply({ 'module-1.3': 'index.php?Itemid=4' }))
  await red(apply({ 'module-1.3': '/x" style="font-size:9px' }), { names: 'module-1.3' })
})

test("taking things off is the plan's hide, by its stated exception", async () => {
  await green('content.contract', {
    operation: 'blocks.unpublish',
    apply_id: 'a',
    request_id: 'r',
    expected_revision: '1',
    blocks: ['module-1']
  })
  await green('content.contract', {
    operation: 'rows.remove',
    apply_id: 'a',
    request_id: 'r',
    expected_revision: '1',
    slots: ['module-1.0'],
    keep: []
  })
  await green('content.contract', {
    operation: 'apply',
    empty_slots: ['module-1.0'],
    empty_links: ['module-1.3']
  })
  await green('template.languageOverrides', {
    operation: 'setSource',
    template: 'demo',
    strings: { A_B: '' }
  })
  await red(
    [
      'template.languageOverrides',
      { operation: 'setSource', template: 'demo', strings: { A_B: '<b class="x">y</b>' } }
    ],
    { names: 'A_B' }
  )
})

// ── Rows ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const menuRead = ['content.list', { kind: 'menuItem', limit: 25, offset: 0, include_body: true }]
const row = (over = {}) => ({
  id: 5,
  published: 1,
  params: '{"menu_show":1,"pageclass_sfx":"dark"}',
  ...over
})
const menuAnswers = (rows) => (call) =>
  call.action === 'content.list' ? { ok: true, items: rows } : { ok: true }
const onMenu = (rows = [row()]) => ({ answers: menuAnswers(rows), reads: [menuRead] })
const updateItem = (id, fields) => ['content.update', { kind: 'menuItem', id, fields }]

test('a menu item takes its title, description, share picture, form switch, address and hide; its other settings stay', async () => {
  const held = JSON.parse(row().params)
  const params = (added) => ({ params: JSON.stringify({ ...held, ...added }) })
  await green(...updateItem(5, params({ page_title: 'New', 'menu-meta_description': 'New words' })), onMenu())
  await green(...updateItem(5, params({ og_img: 'images/x.png', show_email_form: '0' })), onMenu())
  await green(...updateItem(5, { published: 0 }), onMenu())
  await green(...updateItem(5, { link: 'index.php?Itemid=2' }), onMenu())
  await red([...updateItem(5, { params: JSON.stringify({ ...held, pageclass_sfx: 'light' }) }), onMenu()], {
    step: 'write',
    names: 'pageclass_sfx'
  })
  await red([...updateItem(5, params({ article_layout: 'boxed' })), onMenu()], { names: 'article_layout' })
  await red([...updateItem(5, params({ menu_image: 'x.png' })), onMenu()], { names: 'menu_image' })
  await red([...updateItem(5, { template_style_id: 9 }), onMenu()], { names: 'template_style_id' })
  await red([...updateItem(5, { published: 1 }), onMenu()], { names: 'published' })
})

const batch = (kind, fields) => [
  'content.batch',
  { apply_id: 'a', request_id: 'r', operations: [{ kind, id: 0, key: 'row', fields }] }
]
const pageItem = (params) => ({
  title: 'Invented',
  alias: 'invented',
  menutype: 'main',
  type: 'component',
  link: 'index.php?option=com_content&view=article&id=3',
  published: 1,
  language: '*',
  access: 1,
  note: 'tracy-page:legal:terms',
  params: JSON.stringify(params)
})

test('a created page is a stated exception: its rows carry the mark, and only what a page needs', async () => {
  await green(...batch('menuItem', pageItem({ show_author: '0', menu_show: 0, page_title: 'T' })))
  await green(
    ...batch('article', {
      title: 'T',
      alias: 't',
      introtext: '<p>Words &amp; words</p>',
      metadesc: 'D',
      state: 1,
      fulltext: '',
      catid: 4,
      featured: 0,
      language: '*',
      access: 1,
      attribs: '{"show_author":"0"}',
      note: 'tracy-page:legal:terms'
    })
  )
  await green(
    ...batch('category', { title: 'S', published: 1, language: '*', access: 1, note: 'tracy-page:category' })
  )
  await red(batch('menuItem', { ...pageItem({}), note: 'hand made' }), { names: 'note' })
  await red(batch('menuItem', { ...pageItem({}), template_style_id: 3 }), { names: 'template_style_id' })
  await red(batch('menuItem', pageItem({ pageclass_sfx: 'x' })), { names: 'pageclass_sfx' })
  await red(batch('article', { note: 'tracy-page:x', introtext: '<p class="lead">x</p>' }), { names: 'lead' })
  await red(batch('module', { note: 'tracy-page:x' }), { names: 'module' })
  await red(['content.batch', { operations: [{ kind: 'menuItem', id: 5, fields: pageItem({}) }] }], {
    names: 'menuItem 5'
  })
})

test("a created page may copy the layout of the template's article page, and only a value read from the template", async () => {
  const articleRead = ['content.get', { kind: 'article', id: 7 }]
  const answers = (call) =>
    call.action === 'content.get'
      ? { ok: true, item: { id: 7, attribs: '{"article_layout":"_:plain-page"}' } }
      : { ok: true }
  const options = { answers, reads: [articleRead] }
  await green(...batch('menuItem', pageItem({ article_layout: '_:plain-page' })), options)
  await red([...batch('menuItem', pageItem({ article_layout: '_:invented' })), options], {
    names: 'article_layout'
  })
  await red(batch('menuItem', pageItem({ article_layout: '_:plain-page' })), { names: 'article_layout' })
})

test('rows a run created stay open to the run; a template article takes only its page title, description and share picture', async () => {
  const { guard, sent, call } = guarded((c) =>
    c.action === 'content.batch'
      ? { ok: true, ids: { row: 31 } }
      : { ok: true, item: { id: 8, attribs: '{"a":1}' } }
  )
  await call(...batch('article', { note: 'tracy-page:x', introtext: '<p>x</p>' }))
  await call('content.update', { kind: 'article', id: 31, fields: { introtext: '<p>y</p>', state: 1 } })
  await call('content.get', { kind: 'article', id: 8 })
  await call('content.update', {
    kind: 'article',
    id: 8,
    fields: { metadesc: 'D', attribs: '{"a":1,"article_page_title":"T","og_img":"images/x.png"}' }
  })
  assert.deepEqual(guard.findings(), [])
  assert.equal(sent.filter((c) => c.action === 'content.update').length, 2)
  await call('content.update', { kind: 'article', id: 8, fields: { attribs: '{"a":1,"show_author":"0"}' } })
  assert.ok(JSON.stringify(guard.findings()).includes('show_author'))
})

test("a template article's words and category are not open to a row write", async () => {
  const options = {
    answers: () => ({ ok: true, item: { id: 8 } }),
    reads: [['content.get', { kind: 'article', id: 8 }]]
  }
  await red(['content.update', { kind: 'article', id: 8, fields: { introtext: '<p>x</p>' } }, options], {
    names: 'introtext'
  })
  await red(['content.update', { kind: 'article', id: 8, fields: { catid: 2 } }, options], { names: 'catid' })
})

test('a row field is open when the kit names it as a setting slot, with words and no markup', async () => {
  const update = (kind, id, fields) => ['content.update', { kind, id, fields }]
  await green(...update('contact', 4, { mobile: '555 0100' }))
  await green(...update('module', 9, { content: '{map Invented Street}' }))
  await red(update('contact', 4, { name: 'x' }), { names: 'name' })
  await red(update('contact', 3, { mobile: '555' }), { names: 'contact 3' })
  await red(update('contact', 4, { mobile: '<b class="x">555</b>' }), { names: 'mobile' })
  await red(update('category', 4, { title: 'x' }), { names: 'category 4' })
})

test('the accent module is the one row made outside a page, wearing nothing but its style, and it alone goes on every page', async () => {
  const { html } = built()
  const fields = {
    title: 'Brand',
    module: 'mod_custom',
    content: html,
    position: 'debug',
    ordering: 0,
    published: 1,
    showtitle: 0,
    access: 1,
    language: '*',
    params: JSON.stringify({
      prepare_content: '0',
      layout: '_:default',
      moduleclass_sfx: '',
      cache: '0',
      style: 'System-none'
    })
  }
  const run = () => {
    const guard = lookGuard({ kit, contentMap })
    guard.know({ routes: routes() })
    const sent = []
    const door = guard.door({
      apply: async (call) => (sent.push(call), call.params.id ? { ok: true } : { ok: true, id: 44 })
    })
    const call = (params) => door.apply({ siteKey: 'demo', action: 'content.update', params })
    return { guard, sent, call }
  }
  const good = run()
  await good.call({ kind: 'module', fields })
  await good.call({ kind: 'moduleAssignment', id: 44, fields: { menuids: '[0]' } })
  assert.deepEqual(good.guard.findings(), [])
  assert.equal(good.sent.length, 2)

  const classed = run()
  await classed.call({
    kind: 'module',
    fields: { ...fields, params: fields.params.replace('"moduleclass_sfx":""', '"moduleclass_sfx":"big"') }
  })
  assert.ok(JSON.stringify(classed.guard.findings()).includes('moduleclass_sfx'))

  const other = run()
  await other.call({ kind: 'moduleAssignment', id: 12, fields: { menuids: '[0]' } })
  assert.ok(JSON.stringify(other.guard.findings()).includes('moduleAssignment'))

  const words = run()
  await words.call({ kind: 'module', fields: { ...fields, content: `${html}<div class="x">y</div>` } })
  assert.equal(words.sent.length, 1, 'sent all the same (decision 26)')
  assert.ok(words.guard.findings().length, 'and the finding is kept')
})

test('the exceptions the guard allows each say why', () => {
  const { exceptions } = lookGuard({ kit, contentMap })
  for (const name of [
    'created-page-layout',
    'created-page-rows',
    'hide',
    'phone-logo-css',
    'body-background'
  ])
    assert.ok(String(exceptions[name] ?? '').length > 20, `${name} has a stated reason`)
})

test('no module or stage names a template: a kit with other names is judged the same', async () => {
  const guard = lookGuard({
    kit: { site: { logoSpots: [{ setting: 'brand_mark' }], settingSlots: [] } },
    contentMap: null
  })
  const door = guard.door({ apply: async () => ({ ok: true }) })
  await door.apply({
    siteKey: 'demo',
    action: 'template.siteSettings',
    params: { operation: 'set', template: 'any', fields: { brand_mark: 'images/a.png' } }
  })
  assert.deepEqual(guard.findings(), [])
  await door.apply({
    siteKey: 'demo',
    action: 'template.siteSettings',
    params: { operation: 'set', template: 'any', fields: { site_logo: 'images/a.png' } }
  })
  assert.ok(JSON.stringify(guard.findings()).includes('site_logo'))
})

// ── Through the run ──────────────────────────────────────────────────────────────────────────────────────────────

test('a run whose words change a class of the template writes them all the same and keeps the finding on the line, naming the copy', async () => {
  const contentMap = {
    slots: [{ key: 'module-5.1', type: 'text', sample: '((span class="lead"))Demo((/span))' }]
  }
  const { report, site } = await runStep({}, {}, { contentMap })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(report.cause, null)
  assert.equal(report.guard.findings.length, 1)
  const [finding] = report.guard.findings
  assert.equal(finding.step, 6)
  assert.equal(finding.stepName, 'copy')
  assert.equal(finding.sent, true)
  assert.match(`${finding.what}: ${finding.reason}`, /module-5\.1.*span\.lead/)
  assert.deepEqual(report.guard.refused, [])
  assert.equal(site.applies().length, 1, 'the write goes out')
  const line = report.slots.find((s) => s.key === 'module-5.1')
  assert.equal(line.status, 'written')
  assert.equal(line.guard[0].step, 6)
  assert.match(line.guard[0].reason, /span\.lead/)
})

test('a run that only replaces words goes through the guard untouched', async () => {
  const { report, site } = await runStep()
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.deepEqual(report.guard.refused, [])
  assert.equal(site.applies().length, 1)
})

test('a template that mixes its accent itself keeps the mix, and only its colour may change', () => {
  const own = accentRoutesOf(
    ['.dot::before{background-color:color-mix(in srgb,var(--dot-accent,#ab1234) 10%,transparent)}'],
    '#ab1234'
  )
  const rule = (share) =>
    `.dot::before{background-color:color-mix(in srgb,var(--dot-accent,var(--tracy-accent)) ${share}%,transparent)}`
  assert.deepEqual(cssFaults(rule(10), { routes: own }), [])
  assert.equal(cssFaults(rule(40), { routes: own }).length, 1)
})

// Card AB: a person card's cell holds only social icon links on the demo, and the brief has no social account for that person, so
// the plan writes their role there and the icons go. That is accepted; any other finding on such a cell, or a cell whose person
// does have an account, is still kept. People and accounts are invented.
test('words over a cell of social icons only, for a person with no social account in the brief, are no finding', async () => {
  const icons =
    '((div class="list-social"))((a href="#"))((i class="fab fa-facebook"))((/i))((/a))((a href="#"))((i class="fab fa-instagram"))((/i))((/a))((/div))'
  const map = {
    slots: [
      { key: 'module-7.12', type: 'text', sample: icons },
      { key: 'module-7.13', type: 'text', sample: icons }
    ]
  }
  const brief = {
    facts: [
      { id: 'f-ana', field: 'team', value: { name: 'Ana Ruiz', role: 'Coach' } },
      {
        id: 'f-ben',
        field: 'team',
        value: { name: 'Ben Olsen', role: 'Coach', instagram: 'https://instagram.com/ben.coach.example' }
      },
      { id: 'f-club', field: 'socials', value: [{ url: 'https://instagram.com/quay.club.example' }] }
    ]
  }
  const copy = {
    slots: [
      { slot: 'block-7.12', owner: 'writer', text: 'Coach', factIds: ['f-ana'] },
      { slot: 'block-7.13', owner: 'writer', text: 'Coach', factIds: ['f-ben'] }
    ]
  }
  const run = async (key, value) => {
    const guard = lookGuard({ kit, contentMap: map })
    guard.know({ copy, brief })
    guard.check({ action: 'content.contract', params: { operation: 'apply', changes: { [key]: value } } })
    return guard
  }
  const ana = await run('module-7.12', 'Coach')
  assert.deepEqual(ana.findings(), [])
  assert.equal(ana.allowed()[0]?.rule, 'social-icons-without-accounts')
  // Ben has an account: the icons going is still a finding.
  assert.ok((await run('module-7.13', 'Coach')).findings().some((f) => /list-social/.test(f.reason)))
  // Another fault on the same cell stays.
  assert.ok(
    (await run('module-7.12', '((span style="color:red"))Coach((/span))'))
      .findings()
      .some((f) => /inline style/.test(f.reason))
  )
})
