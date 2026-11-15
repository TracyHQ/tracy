// The plan review bar (#609, `src/client/ReviewBar.tsx`): its words come from the plugin's own translated strings,
// never from the request the model passed on, and its answer is a fixed value that names the plan revision under
// review, so an approval never depends on a displayed word. Rendered with `react-dom/server` (resolved from
// `@tracy/core`, which declares it). Every value here is invented.
//
//   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/review-bar.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const corePkg = path.resolve(root, '..', '..', 'core', 'tracy-core')
let out
let lib
before(async () => {
  const esbuild = require('esbuild')
  out = mkdtempSync(path.join(tmpdir(), 'review-bar-'))
  const outfile = path.join(out, 'review-bar.cjs')
  await esbuild.build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { ReviewBar, reviewAnswerOf } from './ReviewBar'
        export { reviewAnswerOf }
        export { english, en } from './strings'
        export const bar = (props) => renderToStaticMarkup(createElement(ReviewBar, props))`,
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
        name: 'button-only',
        setup(b) {
          b.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({
            path: 'button',
            namespace: 'stub'
          }))
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents:
              "import { createElement } from 'react'; export const Button = ({ children, variant, className, ...rest }) => createElement('button', rest, children)",
            loader: 'js',
            resolveDir: path.join(root, 'src', 'client')
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

const PLAN = {
  id: 'plan-larkfen',
  revision: 3,
  facts: [{ id: 'f1', kind: 'business.name', label: 'Business name', value: 'Larkfen Rowing Club' }],
  items: [{ id: 's1', kind: 'service', label: 'Lessons' }],
  pages: [{ id: 'home', name: 'Home', blocks: [] }],
  look: { template: { name: 'JA Rowing' }, logo: { kind: 'text' } },
  pictures: { own: { frames: 0, from: [] }, generated: { frames: 0 } }
}
const drafts = {
  read: () => ({ plan: PLAN }),
  subscribe: () => () => {},
  load: async () => {},
  put: () => {}
}
/** The request as a model that translated it would pass it on. */
const pending = (id = 'plan-review:plan-larkfen:3') => ({
  sessionId: 'session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e',
  key: 'k',
  questions: [{ id, question: 'Model words?', options: [{ label: 'Model yes' }, { label: 'Model no' }] }],
  answer: async () => {},
  dismiss: async () => {},
  snapshot: () => ({ channel: 'waterfall' })
})
const marked = (key, vars = {}) => `<${key}${Object.keys(vars).length ? ` ${JSON.stringify(vars)}` : ''}>`

test('the bar draws its question, summary and buttons from its own translated strings', () => {
  const html = lib.bar({ matched: pending(), drafts, t: marked })
  for (const key of ['review.question', 'review.approve', 'review.change', 'review.summary'])
    assert.ok(html.includes(`&lt;${key}`), `${key} is drawn from the string table`)
  for (const said of ['Model words?', 'Model yes', 'Model no'])
    assert.equal(html.includes(said), false, `the model's "${said}" is never shown`)
})

test('the English table holds every word of the bar', () => {
  const html = lib.bar({ matched: pending(), drafts, t: lib.english })
  assert.match(html, /Approve this plan\?/)
  assert.match(html, />Approve</)
  assert.match(html, />Change the plan</)
  assert.match(html, /Larkfen Rowing Club: 1 page, 1 service/)
})

test('the answer is a fixed value for the reviewed revision, whatever the language on the buttons', () => {
  const [q] = pending().questions
  assert.deepEqual(lib.reviewAnswerOf(q, 'approve'), {
    answers: [{ id: 'plan-review:plan-larkfen:3', selected: ['Approve'] }]
  })
  assert.deepEqual(lib.reviewAnswerOf(q, 'change'), {
    answers: [{ id: 'plan-review:plan-larkfen:3', selected: ['Change the plan'] }]
  })
})
