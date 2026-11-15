// A design picture a template file draws on every page (an icon its stylesheet holds inline) is kept by the kit with a
// `keptLiterals` entry that names the picture file (ticket #587 triage of run 4, g003). An invented bakery template: an
// inline arrow whose bytes are the template's arrow picture is exempt, naming the file; another inline picture of the
// template and a demo picture stay leaks. The kit validator takes the picture entry and refuses a pattern on it.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { kitDeclarationProblems } from '../../packages/wo/website-opportunities/domain/ai-quickstart-kit-declarations.mjs'
import { classify } from '../ai-quickstart/gate/classify.mjs'
import { keptKeysOf, keptPlacesOf } from '../ai-quickstart/gate/exemptions.mjs'
import { sourceResolver } from '../ai-quickstart/gate/sources.mjs'

const ARROW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><path d="M0 2h4"/></svg>'
const DOT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><circle r="2"/></svg>'
const sha = (s) => createHash('sha256').update(Buffer.from(s)).digest('hex')
const inline = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
const FILE = 'templates/bakery/images/icon/arrow.svg'
const mapping = {
  keptLiterals: [
    { file: FILE, values: [FILE], why: 'the link arrow the template stylesheet draws on every list' }
  ]
}
const resolve = sourceResolver(
  {
    names: [FILE, 'templates/bakery/images/icon/dot.svg', 'images/demo/cake.jpg'],
    files: new Map(),
    pictures: new Map([
      [sha(ARROW), FILE],
      [sha(DOT), 'templates/bakery/images/icon/dot.svg']
    ])
  },
  { site: 'http://bakery.example' }
)
const render = (value) => ({
  pageType: 'home',
  path: 'index.php',
  observations: [{ kind: 'image', value, place: { element: 'a::before' }, visible: true }]
})
const run = (value) =>
  classify({
    renders: [render(value)],
    origin: 'http://bakery.example',
    registry: [],
    writePlan: { ops: [] },
    uploaded: {},
    resolve,
    kept: keptKeysOf(mapping),
    keep: keptPlacesOf(mapping)
  })

test('g003: an inline picture that is the kept picture file is exempt, naming its file', () => {
  const r = run(inline(ARROW))
  assert.deepEqual(r.findings, [])
  assert.equal(r.exempt.length, 1)
  assert.match(r.exempt[0].why, /^kept_literal: templates\/bakery\/images\/icon\/arrow\.svg: the link arrow/)
})

test('g003: another template picture and a demo picture stay leaks', () => {
  assert.equal(run(inline(DOT)).findings.length, 1)
  assert.equal(run('http://bakery.example/images/demo/cake.jpg').findings.length, 1)
})

test('g003: the validator takes a picture entry and refuses one with a pattern or another file in values', () => {
  const problems = (entry) => {
    const out = []
    kitDeclarationProblems(
      { keptLiterals: [entry] },
      { report: (at, message) => out.push(at + ': ' + message) }
    )
    return out
  }
  assert.deepEqual(problems(mapping.keptLiterals[0]), [])
  assert.ok(problems({ file: FILE, pattern: '^a$', why: 'the arrow' }).length > 0)
  assert.deepEqual(
    problems({ file: FILE, values: [FILE, 'templates/bakery/images/icon/dot.svg'], why: 'two icons' }),
    []
  )
  assert.ok(problems({ file: FILE, values: ['images/demo/cake.jpg'], why: 'the arrow' }).length > 0)
  assert.ok(problems({ file: FILE, values: ['arrow'], why: 'the arrow' }).length > 0)
})
