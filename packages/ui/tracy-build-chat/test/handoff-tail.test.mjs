// The site chat's carried plan (#611, `src/client/tails.tsx`): under the earlier conversation the plan card and the
// site update card read the signed in viewer's build draft, so they show only when that draft's build is the build
// of the site this chat belongs to (the hand off block names it). A teammate who built a site of their own never
// sees, edits or updates that plan from another site's chat. Rendered with `react-dom/server` (resolved from
// `@tracy/core`, which declares it). Every value here is invented.
//
//   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/handoff-tail.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const corePkg = path.resolve(root, '..', '..', 'core', 'tracy-core')
const clientDir = path.join(root, 'src/client')
/** Every name the client imports from dsh's primitives, each a component that draws nothing. */
const primitiveNames = new Set(
  readdirSync(clientDir).flatMap((f) =>
    [
      ...readFileSync(path.join(clientDir, f), 'utf8').matchAll(
        /import \{([^}]*)\} from '@deepseek-ai\/dsh-client-ui-primitives'/g
      )
    ].flatMap((m) =>
      m[1]
        .split(',')
        .map((n) => n.trim().replace(/^type\s+/, ''))
        .filter(Boolean)
    )
  )
)
let out
let lib
before(async () => {
  const esbuild = require('esbuild')
  out = mkdtempSync(path.join(tmpdir(), 'handoff-tail-'))
  const outfile = path.join(out, 'handoff-tail.cjs')
  await esbuild.build({
    stdin: {
      contents: `
        import { renderToStaticMarkup } from 'react-dom/server'
        import { makeTails } from './tails'
        export { english, inLanguage } from './strings'
        export const handoffOf = (deps, props) => {
          const element = makeTails(deps).handoff(props)
          return element === null ? null : renderToStaticMarkup(element)
        }`,
      resolveDir: clientDir,
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
        name: 'stub-primitives',
        setup(b) {
          b.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({
            path: 'primitives',
            namespace: 'stub'
          }))
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: `const C = () => null; export { ${[...primitiveNames].map((n) => `C as ${n}`).join(', ')} }`,
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

const SITE_CHAT = 'session-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
/** The plan of the viewer's own build: a different site than the one whose chat is open. */
const VIEWER_PLAN = {
  id: 'plan-wrenmoor',
  revision: 2,
  facts: [{ id: 'f1', kind: 'business.name', label: 'Business name', value: 'Wrenmoor Pottery' }],
  items: [],
  pages: [{ id: 'home', name: 'Home', blocks: [] }],
  look: { template: { name: 'JA Craft' }, logo: { kind: 'text' } },
  pictures: { own: { frames: 0, from: [] }, generated: { frames: 0 } }
}
const depsFor = (siteKey) => ({
  drafts: {
    read: () => ({ plan: VIEWER_PLAN }),
    subscribe: () => () => {},
    load: async () => {},
    put: () => {}
  },
  reviews: { has: () => false, subscribe: () => () => {}, show: () => () => {} },
  runs: { read: () => null, subscribe: () => () => {} },
  sites: {
    read: () => ({
      build: { id: 'build-1', plan: { id: VIEWER_PLAN.id, revision: 2 }, state: 'done', siteKey },
      run: null,
      say: null
    }),
    subscribe: () => () => {},
    load: async () => {},
    ask: async () => true
  },
  t: () => lib.english
})
/** The site chat's first turn: the hand off block names the site this chat belongs to. */
const carried = (siteKey) => ({
  sessionId: SITE_CHAT,
  seq: 4,
  turn: {
    turn: 0,
    data: {
      get: () => ({
        turn: 0,
        conversation: [{ role: 'user', text: 'Please build my site.' }],
        plan: null,
        site: siteKey === null ? null : { siteKey }
      })
    }
  }
})

test("another site's chat never shows the viewer's own plan card", () => {
  const html = lib.handoffOf(depsFor('wrenmoor.example'), carried('larkfen.example'))
  assert.match(html, /Please build my site\./, 'the earlier conversation still shows')
  assert.equal(html.includes('Wrenmoor Pottery'), false, "the viewer's own plan is not drawn here")
})

test("the site's own chat shows the plan it was built from", () => {
  const html = lib.handoffOf(depsFor('larkfen.example'), carried('larkfen.example'))
  assert.match(html, /Wrenmoor Pottery site plan/)
})

test('a hand off block that names no site shows no plan card', () => {
  const html = lib.handoffOf(depsFor('larkfen.example'), carried(null))
  assert.equal(html.includes('site plan'), false)
})

test('the plan card names the site language in the language its translator speaks, not in English', () => {
  const deps = depsFor('larkfen.example')
  const plan = { ...VIEWER_PLAN, language: 'fr' }
  deps.drafts.read = () => ({ plan })
  // English words, but a translator that says it speaks German: the language name follows the translator.
  deps.t = () => lib.inLanguage((key, vars) => lib.english(key, vars), 'de')
  const html = lib.handoffOf(deps, carried('larkfen.example'))
  assert.match(html, /Französisch/)
  assert.equal(html.includes('French'), false)
})
