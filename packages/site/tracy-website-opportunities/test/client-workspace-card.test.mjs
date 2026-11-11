/**
 * The Workspace card rows (#537): each row carries one muted description line under its title, with the full text in
 * a title attribute so a narrow column can truncate it.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-workspace-card.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { en as STRINGS } from '../src/client/strings.ts'

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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-workspace-card-'))
  const outfile = path.join(outDir, 'card.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { WorkspaceCard } from './workspace-card.tsx'
        export { effectiveOf, stepperView } from './stepper-model.ts'
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

const t = (key, params = {}) =>
  (STRINGS[key] ?? key).replace(/\{(\w+)\}/g, (_, n) => String(params[n] ?? `{${n}}`))

const DESCRIPTIONS = {
  sources: 'Where Tracy read about your business.',
  profile: 'What Tracy found, for you to check and approve.',
  brief: 'The words your site will use, for you to approve.',
  demo: 'The site Tracy builds from the approved brief.'
}

/** A finished place (research, facts and brief approved, site built) and one that has not started. */
function render(started) {
  const stepInput = started
    ? {
        research: { state: 'done', researchedAt: '2026-11-10T08:00:00Z', done: true },
        researchJob: { state: 'completed' },
        briefJob: null,
        brief: { id: 'b-1', n: 1, createdAt: '2026-11-10T10:00:00Z' },
        demo: 'ready',
        demoAt: '2026-11-11T09:00:00Z',
        approval: {
          profile: 'approved',
          profileApprovedAt: '2026-11-10T09:00:00Z',
          brief: 'approved',
          briefApprovedAt: '2026-11-10T11:00:00Z'
        }
      }
    : {
        research: { state: 'not_started', researchedAt: null, done: false },
        researchJob: { state: 'completed' },
        briefJob: null,
        brief: null,
        demo: 'none',
        demoAt: null,
        approval: { profile: 'none', brief: 'none' }
      }
  const effective = lib.effectiveOf(stepInput)
  const el = lib.createElement(lib.WorkspaceCard, {
    t,
    opportunityId: started ? 'o-1' : 'o-2',
    onSection: () => {},
    bodies: { sources: null, profile: null, brief: null, demo: null },
    input: {
      stepper: lib.stepperView(stepInput),
      researchDone: stepInput.research.done,
      researchMoving: false,
      researchedAt: stepInput.research.researchedAt,
      sources: started ? ['collected', 'collected', 'collected'] : ['waiting'],
      fields: 4,
      brief: effective.brief == null ? null : { n: 1 },
      briefEmpty: null,
      demo: effective.demo,
      demoHost: started ? 'tennis-padel-coach.example.test' : null,
      locale: 'en-US'
    }
  })
  return lib.renderToStaticMarkup(el)
}

for (const [name, started] of [
  ['a finished place', true],
  ['a place that has not started', false]
]) {
  test(`${name}: every row renders its description under the title`, () => {
    const html = render(started)
    for (const [id, text] of Object.entries(DESCRIPTIONS)) {
      assert.match(html, new RegExp(`<span class="tracy-wo-ws-desc" title="${text}">${text}</span>`), id)
    }
    assert.equal((html.match(/tracy-wo-ws-desc/g) ?? []).length, 4)
    // The description sits inside the title column, after the name.
    assert.match(
      html,
      /tracy-wo-ws-main"><span class="tracy-wo-ws-name">[^]*?<\/span><span class="tracy-wo-ws-desc"/
    )
  })
}

test('the descriptions use no dash and do not mention steps', () => {
  for (const text of Object.values(DESCRIPTIONS)) {
    assert.equal(
      text.includes(String.fromCharCode(0x2013)) || text.includes(String.fromCharCode(0x2014)),
      false
    )
    assert.doesNotMatch(text, /\bstep\b/i)
  }
})
