// The plan card's words (#609, live run fixes): fact labels and source names come from the plugin's own string table
// by the plan's codes, so a Vietnamese card reads Vietnamese; a code the table does not know keeps the plan's text.
// Server lines are joined without a doubled full stop, an edit the agent made leaves its own note, Undo says why it
// cannot take back a change asked for in the chat, and character references read as characters, as text only.
// Rendered with `react-dom/server`; every business here is invented.
//
//   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/plan-card-words.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { STAGES, stageDocuments } from '../../../core/tracy-core/test/fixtures/build-chat/stages.mjs'

const require = createRequire(import.meta.url)
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const corePkg = path.resolve(root, '..', '..', 'core', 'tracy-core')
const viTable = JSON.parse(
  readFileSync(path.resolve(root, '../../locale/tracy-locale-vi/vi/tracy-build-chat.json'), 'utf8')
)
let out
let lib
before(async () => {
  const esbuild = require('esbuild')
  out = mkdtempSync(path.join(tmpdir(), 'plan-card-words-'))
  const outfile = path.join(out, 'plan-card.cjs')
  await esbuild.build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { PlanCard } from './PlanCard'
        export { english, en } from './strings'
        export { sentenceOf } from './plan-words'
        export const card = (props) => renderToStaticMarkup(createElement(PlanCard, props))`,
      resolveDir: path.join(root, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: root,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    nodePaths: [path.join(corePkg, 'node_modules')],
    plugins: [
      {
        name: 'icons-only',
        setup(b) {
          b.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({
            path: 'icons',
            namespace: 'stub'
          }))
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents:
              'export const IconCloseOutlineRegular = () => null; export const IconEditOutlineRegular = () => null; export const IconTrashOutlineRegular = () => null',
            loader: 'js'
          }))
        }
      }
    ],
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => out && rmSync(out, { recursive: true, force: true }))

const plan = () => stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan
/** A translator over the Vietnamese table, English for a key it lacks. */
const vi = (key, vars = {}) =>
  (viTable[key] ?? lib.en[key]).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))
const draw = (props) =>
  lib.card({ t: lib.english, onEdit: async () => ({}), onUndo: async () => ({}), ...props })
/** The markup as the text a reader sees, tags removed. */
const textOf = (html) => html.replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n')

test('fact labels and source names follow the interface language, by the plan codes', () => {
  const html = draw({ plan: plan(), t: vi })
  for (const english of ['Business name', 'Main button', 'Opening hours', 'Your answer', 'Website'])
    assert.doesNotMatch(textOf(html), new RegExp(`^${english}$`, 'm'), english)
  for (const key of [
    'plan.fact.business.name',
    'plan.fact.contact.cta_label',
    'plan.fact.contact.hours',
    'plan.source.answer',
    'plan.source.website'
  ])
    assert.ok(html.includes(`>${viTable[key]}<`), key)
  // The editor's name uses the same words.
  const phone = vi('plan.edit', { label: viTable['plan.fact.contact.phone'], value: '04 000 0000' })
  assert.ok(html.includes(`aria-label="${phone}"`), phone)
  // A block that holds facts reads them in the card's words too.
  const held = ['business.name', 'business.tagline', 'contact.cta_label'].map(
    (k) => viTable[`plan.fact.${k}`]
  )
  assert.ok(html.includes(held.join(', ')), held.join(', '))
})

test('a source the plan names more exactly than its kind keeps the plan text, in every language', () => {
  for (const t of [vi, lib.english]) {
    const html = draw({ plan: plan(), t })
    // The tagline came from the social profile's bio, the address from a Google Maps listing named "Google Maps".
    assert.ok(html.includes('>Instagram bio<'), 'the plan says which part of the social profile')
    assert.ok(html.includes('>Google Maps<'), 'the plan names the listing its own way')
    // Only beside a fact: the sources table names each kind of source by its generic word on purpose (#575).
    assert.equal(html.includes(`tv-bc-src">${viTable['plan.source.social']}<`), false)
    assert.equal(html.includes(`tv-bc-src">${lib.en['plan.source.social']}<`), false)
  }
  // A source the plan gives no name is said in the card's words.
  const p = plan()
  p.facts.find((f) => f.id === 'tagline').sources = [{ kind: 'social' }]
  assert.ok(draw({ plan: p, t: vi }).includes(`>${viTable['plan.source.social']}<`))
})

test('a fact label the plan made specific stays as written; the generic label is translated', () => {
  const p = plan()
  const button = p.facts.find((f) => f.id === 'button')
  button.label = 'Court booking button'
  const html = draw({ plan: p, t: vi })
  assert.ok(html.includes('>Court booking button<'), 'the specific label is kept')
  assert.equal(html.includes(`>${viTable['plan.fact.contact.cta_label']}<`), false)
  assert.ok(html.includes(`>${viTable['plan.fact.business.name']}<`), 'a generic label is still translated')
  // The block that holds the fact reads it the same way.
  const held = [
    viTable['plan.fact.business.name'],
    viTable['plan.fact.business.tagline'],
    'court booking button'
  ]
  assert.ok(html.includes(held.join(', ')), held.join(', '))
})

test('a code the table does not know keeps the plan text, never a made up word', () => {
  const p = plan()
  p.facts.push({
    id: 'licence',
    kind: 'business.licence_number',
    label: 'Licence number',
    value: 'LN-0042',
    sources: [{ kind: 'registry', name: 'Trade registry' }]
  })
  const html = draw({ plan: p, t: vi })
  assert.match(html, />Licence number</)
  assert.match(html, />Trade registry</)
})

test('a server line that ends with a full stop is never given a second one', () => {
  assert.equal(lib.sentenceOf('Rename the service.'), 'Rename the service.')
  assert.equal(lib.sentenceOf('Rename the service'), 'Rename the service.')
  assert.equal(lib.sentenceOf('Move the logo.', 2), 'Move the logo (2).')
  assert.equal(lib.sentenceOf('Why not?'), 'Why not?')
  const p = plan()
  p.leftOut = [{ what: 'Prices page.', kind: 'page', reason: 'No public prices found.' }]
  const html = draw({
    plan: p,
    revised: {
      changed: [],
      notDone: [{ what: 'You want your opening hours shown on the site.', why: 'Not in the plan.' }]
    }
  })
  assert.doesNotMatch(textOf(html), /\.\./)
  assert.match(html, /You want your opening hours shown on the site\./)
  assert.match(html, /Prices page\./)
})

test('an edit the agent made shows a note in the card words, with the value it set', () => {
  const html = draw({
    plan: plan(),
    t: vi,
    canUndo: true,
    revised: { changed: [], notDone: [], edits: [{ field: 'look.accent', value: '#0B1F3A' }] }
  })
  assert.ok(html.includes(viTable['plan.revised.changed']))
  const line = vi('plan.revised.edited', { label: viTable['plan.look.accent'], value: '#0B1F3A' })
  assert.ok(html.includes(line), line)
  // A field the card shows by no name gives no line, and alone no note.
  const none = draw({
    plan: plan(),
    revised: { changed: [], notDone: [], edits: [{ field: 'pages[home].blocks[x].data', value: 'y' }] }
  })
  assert.doesNotMatch(none, /What changed/)
})

test('Undo says why it cannot take back a change asked for in the chat', () => {
  const revised = { changed: ['The Gallery section is removed from the Coaches page.'], notDone: [] }
  const html = draw({ plan: plan(), revised, canUndo: false })
  const hint = html.match(/<p id="([^"]+)" class="tv-bc-note">([^<]+)<\/p>/)
  assert.ok(hint, 'the note carries the reason')
  assert.equal(hint[2], lib.en['plan.undo.chatChange'])
  assert.match(html, new RegExp(`aria-label="Undo last change" aria-describedby="${hint[1]}"`))
  // An edit the agent made can be undone: no such sentence.
  const edited = draw({
    plan: plan(),
    canUndo: true,
    revised: { changed: [], notDone: [], edits: [{ field: 'look.accent', value: '#0B1F3A' }] }
  })
  assert.doesNotMatch(edited, /Undo takes back/)
})

test('Undo takes back a change asked for in the chat when the draft offers it, and then says nothing about it', () => {
  const revised = { changed: ['The Gallery section is removed from the Coaches page.'], notDone: [] }
  const html = draw({ plan: plan(), revised, canUndo: true, lastEdit: null })
  const undo = html.match(/<button[^>]*aria-label="Undo last change"[^>]*>/)[0]
  assert.doesNotMatch(undo, /disabled/, 'Undo is offered without a card edit')
  assert.doesNotMatch(undo, /aria-describedby/)
  assert.doesNotMatch(html, /Undo takes back/)
  // Nothing to take back: still disabled.
  const none = draw({ plan: plan(), canUndo: false, lastEdit: null })
  assert.match(none.match(/<button[^>]*aria-label="Undo last change"[^>]*>/)[0], /disabled/)
})

/** A change request note whose lines carry the plan step's stable codes (#609 over #617). */
const codedNote = () => ({
  changed: [
    'Your answer is saved: Opening hours, Mon to Sat 06:30 to 21:30.',
    'The Coaches page is now called Our team.',
    'Racquet stringing stays off your site, as you asked.',
    'A line the model wrote.',
    'A line with a code this card does not know.',
    'The Gallery section of the Home page now shows Adult coaching, Junior sq...',
    'Something else happened to the plan.'
  ],
  notDone: [
    { what: 'Services', why: 'The plan already has this page.' },
    { what: 'Your request', why: 'Nothing on the plan could follow it, so the plan is unchanged.' },
    { what: 'A gallery', why: 'The model said so.' }
  ],
  codes: {
    changed: [
      'owner_value_saved',
      'page-renamed',
      'item_taken_off',
      null,
      'some_new_code',
      'block-data',
      'page-removed'
    ],
    notDone: ['page_already_on_plan', 'nothing_to_change', null]
  }
})

test('a coded line of a change request reads in the interface language, with its names as the plan has them', () => {
  const html = draw({ plan: plan(), t: vi, canUndo: true, revised: codedNote() })
  const text = textOf(html)
  const said = [
    vi('plan.revised.line.owner_value_saved', {
      label: viTable['plan.fact.contact.hours'],
      value: 'Mon to Sat 06:30 to 21:30'
    }),
    vi('plan.revised.line.page-renamed', { from: 'Coaches', to: 'Our team' }),
    vi('plan.revised.line.item_taken_off', { label: 'Racquet stringing' }),
    vi('plan.revised.notDone.page_already_on_plan.why'),
    vi('plan.revised.notDone.nothing_to_change.what'),
    vi('plan.revised.notDone.nothing_to_change.why')
  ]
  for (const line of said) {
    assert.notEqual(line, '')
    assert.ok(text.includes(line), line)
  }
  assert.ok(viTable['plan.revised.line.page-renamed'], 'the Vietnamese table has the line')
  assert.notEqual(viTable['plan.revised.line.page-renamed'], lib.en['plan.revised.line.page-renamed'])
  // No code, an unknown code, or a line its code's sentence does not fit: the server's English, as it came.
  for (const line of [
    'A line the model wrote.',
    'A line with a code this card does not know.',
    'The Gallery section of the Home page now shows Adult coaching, Junior sq...',
    'Something else happened to the plan.',
    'The model said so.'
  ])
    assert.ok(text.includes(line), line)
  assert.ok(text.includes('Services'), 'a name stays as the plan has it')
  assert.doesNotMatch(text, /owner_value_saved|page_already_on_plan|some_new_code/, 'no code is ever shown')
})

test('codes that do not run one to one beside their lines are not read: every line keeps the server text', () => {
  const changed = [
    'Your answer is saved: Opening hours, Mo-Sa 06:30-21:30.',
    'The Coaches page is now called Our team.'
  ]
  const notDone = [{ what: 'Services', why: 'The plan already has this page.' }]
  for (const codes of [
    // One code more than lines: a shifted reading would say the rename as a saved answer.
    {
      changed: ['owner_value_saved', 'page-renamed', 'page-renamed'],
      notDone: ['page_already_on_plan', 'x']
    },
    // One code fewer than lines.
    { changed: ['page-renamed'], notDone: [] }
  ]) {
    const text = textOf(draw({ plan: plan(), t: vi, canUndo: true, revised: { changed, notDone, codes } }))
    for (const line of changed) assert.ok(text.includes(line), line)
    assert.ok(text.includes('The plan already has this page.'))
    assert.equal(text.includes(viTable['plan.revised.notDone.page_already_on_plan.why']), false)
  }
})

test('in English a coded line reads exactly as the server wrote it', () => {
  const note = codedNote()
  const text = textOf(draw({ plan: plan(), canUndo: true, revised: note }))
  for (const line of note.changed) assert.ok(text.includes(line), line)
  for (const { what, why } of note.notDone) {
    assert.ok(text.includes(lib.sentenceOf(what)), what)
    assert.ok(text.includes(why), why)
  }
})

test('every coded sentence has its English in the table and is said in every language without dashes', () => {
  const keys = Object.keys(lib.en).filter(
    (k) => k.startsWith('plan.revised.line.') || k.startsWith('plan.revised.notDone.')
  )
  assert.ok(keys.length >= 20, `${keys.length} coded sentences`)
  const dashes = new RegExp(`[${String.fromCodePoint(0x2013, 0x2014)}]`)
  for (const key of keys) {
    assert.doesNotMatch(lib.en[key], dashes, key)
    assert.ok(viTable[key], `vi ${key}`)
    assert.doesNotMatch(viTable[key], dashes, `vi ${key}`)
    // The translation names the same parameters as the English.
    const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    assert.deepEqual(names(viTable[key]), names(lib.en[key]), key)
  }
})

test('character references read as characters, and a decoded tag stays text', () => {
  const p = plan()
  p.rows[0].label = 'Coach&rsquo;s session &lt;b&gt;'
  const html = draw({ plan: p })
  assert.match(html, /Coach’s session &lt;b&gt;/, 'React escapes the decoded text: it is never markup')
  assert.doesNotMatch(html, /&amp;rsquo;|&amp;lt;/)
})

test('a section that holds the same kind twice lists it once, with its count (run 6: "Social link, Social link")', () => {
  const p = plan()
  p.facts.push(
    {
      ...p.facts.find((f) => f.id === 'phone'),
      id: 'social-a',
      kind: 'contact.social_url',
      label: 'Social link'
    },
    {
      ...p.facts.find((f) => f.id === 'phone'),
      id: 'social-b',
      kind: 'contact.social_url',
      label: 'Social link'
    }
  )
  p.pages[0].blocks.find((b) => b.id === 'h4').data = ['phone', 'social-a', 'social-b']
  for (const [t, link] of [
    [lib.english, lib.en['plan.fact.contact.social_url'].toLowerCase()],
    [vi, viTable['plan.fact.contact.social_url']]
  ]) {
    const html = draw({ plan: p, t })
    assert.ok(html.includes(`, ${link} (2)<`), `${link} (2)`)
    assert.equal(html.includes(`${link}, ${link}`), false)
  }
})

test('a section kept from general knowledge of the trade says so; the section reason is not repeated (#575 C10)', () => {
  const p = plan()
  p.pages[0].blocks.splice(1, 0, {
    id: 'home-trade',
    type: 'text',
    block: 'what-to-bring',
    source: 'template',
    label: 'What to bring',
    data: [],
    reason: 'New players know what to bring to a first lesson.',
    basis: 'trade',
    factIds: [p.items[0].id]
  })
  for (const t of [vi, lib.english]) {
    const html = draw({ plan: p, t })
    assert.equal(html.split(`>${t('plan.trade')}<`).length, 2, 'one note, under the trade section only')
    assert.equal(html.includes('New players know what to bring to a first lesson.'), false)
  }
  assert.equal(draw({ plan: plan() }).includes(lib.en['plan.trade']), false)
  assert.notEqual(viTable['plan.trade'], undefined)
})
