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
              'export const IconCloseOutlineRegular = () => null; export const IconEditOutlineRegular = () => null',
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
    assert.equal(html.includes(`>${viTable['plan.source.social']}<`), false)
    assert.equal(html.includes(`>${lib.en['plan.source.social']}<`), false)
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

test('character references read as characters, and a decoded tag stays text', () => {
  const p = plan()
  p.rows[0].label = 'Coach&rsquo;s session &lt;b&gt;'
  const html = draw({ plan: p })
  assert.match(html, /Coach’s session &lt;b&gt;/, 'React escapes the decoded text: it is never markup')
  assert.doesNotMatch(html, /&amp;rsquo;|&amp;lt;/)
})
