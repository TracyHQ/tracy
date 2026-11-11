/**
 * The Site content brief checklist as drawn (#537, option E): a rail of five steps with Approve at its foot, one
 * step's items in the pane with their source, Edit and On the site switch, a "Left off" line under an item the site
 * leaves out, and the locked view of an approved brief. Bundles the real component with React 18.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-brief-checklist.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const store = path.join(repo, 'node_modules', '.pnpm')
const require = createRequire(import.meta.url)

function fromStore(prefix, name) {
  const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith(prefix)) : undefined
  const dir = hit && path.join(store, hit, 'node_modules', name)
  if (!dir || !existsSync(dir)) throw new Error(`${prefix}* is not in ${store}; run pnpm install`)
  return dir
}

let outDir = ''
let lib
before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-brief-checklist-'))
  const outfile = path.join(outDir, 'brief-checklist.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { BriefChecklist } from './brief-checklist.tsx'
        export { hoursDays } from './brief-checklist-item.tsx'
        export { briefSteps, briefReview, markStep } from './brief-steps-model.ts'
        export { en } from './strings.ts'
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    alias: {
      react: fromStore('react@18.3.1', 'react'),
      'react-dom': fromStore('react-dom@18.2.0_react@18.3.1', 'react-dom')
    },
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const t = (key, params = {}) => {
  const text = lib.en[key]
  if (text === undefined) throw new Error(`missing string ${key}`)
  return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
}
const row = (id, field, extra = {}) => ({
  id,
  field,
  label: extra.label ?? id,
  value: `${id} words`,
  source: 'From Google',
  onSite: true,
  ownerChoice: false,
  notes: [],
  ...extra
})
// A made-up bakery.
const rows = [
  row('f_name', 'name', { label: 'Name', value: 'Crumb and Co' }),
  row('f_hours', 'hours', {
    label: 'Opening hours',
    value: 'Monday: 7 AM to 3 PM; Tuesday: Closed',
    onSite: false,
    noteKeys: ['facts.reason.implausible-all-week-hours']
  }),
  row('website', 'website', { label: 'Website', readOnly: true, value: 'No website', onSite: false }),
  row('f_s1', 'services', { label: 'Services', value: 'Sourdough classes' })
]
const approval = { kind: 'brief', approvedLine: null, pending: true, onApprove: async () => null }
const draw = ({ marks = {}, locked = false } = {}) => {
  const steps = lib.briefSteps(rows)
  return lib.renderToStaticMarkup(
    lib.createElement(lib.BriefChecklist, {
      t,
      steps,
      review: lib.briefReview(steps, typeof marks === 'function' ? marks(steps) : marks, locked),
      locked,
      approval,
      media: null,
      siteName: lib.createElement('div', { className: 'site-name-item' }, 'site name'),
      editDoor: (r) =>
        r.readOnly ? null : { value: r.value, multiline: false, maxLength: 200, save: async () => true },
      onMark: () => {},
      onToggle: async () => null
    })
  )
}
const count = (html, re) => (html.match(re) ?? []).length

test('the rail lists the five steps and Approve waits until every step is reviewed', () => {
  const html = draw()
  assert.match(html, />Check each section</)
  for (const title of [
    'Business, contact and hours',
    'Services',
    'Story, messages, audience',
    'Team and guest reviews',
    'Social, photos, brand'
  ])
    assert.match(html, new RegExp(`>${title}<`))
  assert.match(html, />0 of 5 sections reviewed</)
  assert.match(html, /title="Mark all 5 sections reviewed to approve\."/)
  assert.match(html, /<button[^>]*disabled=""[^>]*>Approve and continue<\/button>/)
  // The first step is open: its title, its chip, Edit section and the footer.
  assert.match(html, /aria-current="step"/)
  // Site name and Name are on the site; the hours and the website are not.
  assert.match(html, />2 of 4 on the site</)
  assert.match(html, />Edit section</)
  assert.match(html, />Section 1 of 5</)
  assert.match(html, />Mark reviewed, next section</)
  assert.doesNotMatch(html, />Previous</)
})

test('each item has its source, Edit and switch; an item left off says why; a read-only one has neither', () => {
  const html = draw()
  assert.match(html, />site name</)
  assert.match(html, />Crumb and Co</)
  assert.match(html, />From Google</)
  assert.match(html, />Left off: open 24 hours every day is unlikely for this kind of business\.</)
  assert.doesNotMatch(html, /Not on the site:/)
  // Name and hours: Edit and a switch; the website: neither.
  assert.equal(count(html, />Edit</g), 2)
  assert.equal(count(html, /role="switch"/g), 2)
  // Hours as a seven day grid.
  assert.match(html, /class="tracy-wo-brief-days"/)
  assert.match(html, /<b title="Monday">Mon<\/b>7 AM to 3 PM/)
})

test('all steps reviewed: every step shows its check and Approve can be pressed', () => {
  const html = draw({ marks: (steps) => steps.reduce((m, s) => lib.markStep(m, s), {}) })
  assert.match(html, />5 of 5 sections reviewed</)
  assert.equal(count(html, /data-done="true"/g), 5)
  assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>Approve and continue/)
})

test('an approved brief is locked: no Edit, no switch, no Mark reviewed, no Approve, and a line says how to change it', () => {
  const html = draw({ locked: true })
  assert.match(
    html,
    />This site content brief is approved and can no longer be changed\. To change it, add this business again as a new card\.</
  )
  assert.equal(count(html, /data-done="true"/g), 5)
  assert.equal(count(html, /role="switch"/g), 0)
  assert.doesNotMatch(html, />Edit</)
  assert.doesNotMatch(html, />Edit section</)
  assert.doesNotMatch(html, /Mark reviewed/)
  assert.doesNotMatch(html, /Approve and continue/)
  assert.match(html, />Next section</)
})

test('hours read as days only when every part names its day', () => {
  assert.deepEqual(lib.hoursDays('Monday: Closed; Tuesday: 9 AM to 5 PM'), [
    { day: 'Monday', text: 'Closed' },
    { day: 'Tuesday', text: '9 AM to 5 PM' }
  ])
  assert.equal(lib.hoursDays('Open every day'), null)
})
