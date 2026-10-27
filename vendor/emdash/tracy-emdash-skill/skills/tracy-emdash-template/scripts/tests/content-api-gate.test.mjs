// tools/content-api-gate.mjs refuses a package Tracy could not read or whose pages name no source,
// and passes one that has everything. Every refusal below is a package that would ship green.
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { contentApiProblems } from '../tools/content-api-gate.mjs'

const FLAG = 'TRACY_CONTENT_API_SCALARS'
const DOCKERFILE = `FROM node:24 AS build
ARG ${FLAG}=1
ENV ${FLAG}=$${FLAG}
RUN pnpm build

FROM node:24
ARG ${FLAG}=1
ENV ${FLAG}=$${FLAG}
LABEL io.tracy.content-api.scalars="$${FLAG}"
`
const CONFIG = `import { contentApi } from './tools/content-api/integration.mjs'
export default { integrations: [...(process.env.${FLAG} === '1' ? [contentApi({ root: new URL('./', import.meta.url) })] : [])] }
`

/** A package with everything the gate asks for; `edit` changes one file of it. */
function pkg(t, edit = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'content-api-gate-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const files = {
    'tools/content-api/integration.mjs': 'export function contentApi() {}\n',
    'seed/content-api-map.json': JSON.stringify({
      version: 1,
      scope: 'entry-scalars',
      collections: { site: { type: 'shared', urlPattern: null }, home: { type: 'page', urlPattern: '/' } },
      chrome: { collection: 'site', slug: 'site' }
    }),
    'seed/site-model.json': JSON.stringify({ types: [{ name: 'site' }, { name: 'home' }] }),
    'src/lib/stamps.ts': 'export const PICK_HEADER = "x-tracy-preview"\n',
    'src/components/site/PageOwner.astro': '---\n---\n',
    'src/middleware.ts': 'keepPickPrivate(context.request, pathname, res.headers)\n',
    'astro.config.mjs': CONFIG,
    Dockerfile: DOCKERFILE,
    ...edit
  }
  for (const [rel, text] of Object.entries(files)) {
    if (text === null) continue
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    writeFileSync(path.join(dir, rel), text)
  }
  return dir
}

test('a package with the reader, its switch on, the stamps and a full map passes', (t) => {
  assert.deepEqual(contentApiProblems(pkg(t)), [])
})

test('a missing piece is named', (t) => {
  const [problem] = contentApiProblems(
    pkg(t, { 'src/lib/stamps.ts': null, 'seed/content-api-map.json': null })
  )
  assert.match(problem, /src\/lib\/stamps\.ts/)
  assert.match(problem, /seed\/content-api-map\.json/)
})

test('an image the fleet builds with the reader off is refused', (t) => {
  const off = contentApiProblems(pkg(t, { Dockerfile: DOCKERFILE.replaceAll(`${FLAG}=1`, `${FLAG}=0`) }))
  assert.ok(
    off.some((p) => /default to 1/.test(p)),
    off.join('\n')
  )
  const argOnly = contentApiProblems(pkg(t, { Dockerfile: DOCKERFILE.replace(/^ENV .*$/gm, '') }))
  assert.ok(
    argOnly.some((p) => /ENV/.test(p)),
    argOnly.join('\n')
  )
  const none = contentApiProblems(pkg(t, { Dockerfile: 'FROM node:24\nRUN pnpm build\n' }))
  assert.ok(
    none.some((p) => /declares no ARG/.test(p)),
    none.join('\n')
  )
})

test('a config without the integration, or without the switch, is refused', (t) => {
  assert.ok(
    contentApiProblems(pkg(t, { 'astro.config.mjs': 'export default {}\n' })).some((p) =>
      /contentApi/.test(p)
    )
  )
  const always = CONFIG.replace(`process.env.${FLAG} === '1'`, 'true')
  assert.ok(contentApiProblems(pkg(t, { 'astro.config.mjs': always })).some((p) => new RegExp(FLAG).test(p)))
})

test('a middleware that lets a stamped page into a shared cache is refused', (t) => {
  assert.ok(
    contentApiProblems(pkg(t, { 'src/middleware.ts': 'export {}\n' })).some((p) => /keepPickPrivate/.test(p))
  )
})

test('a collection of the model with no Content API type is refused', (t) => {
  const model = JSON.stringify({ types: [{ name: 'site' }, { name: 'home' }, { name: 'posts' }] })
  const problems = contentApiProblems(pkg(t, { 'seed/site-model.json': model }))
  assert.ok(
    problems.some((p) => /maps no posts/.test(p)),
    problems.join('\n')
  )
})

test('this template passes the gate', (t) => {
  // The kit's own run (scripts/test-kit.mjs) builds a throwaway template that has no site; the
  // synthetic packages above are what it measures there.
  if (process.env.KIT_TEST_TEMPLATE) return t.skip('the kit fixture is not a template with a site')
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  assert.deepEqual(contentApiProblems(root), [])
})

// The scaffold as it is copied (the kit's scripts/src, or this template's src) passes unchanged.
test('the kit scaffold copied into a package keeps passing', (t) => {
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
  const dir = pkg(t)
  cpSync(src, path.join(dir, 'src'), { recursive: true })
  writeFileSync(
    path.join(dir, 'src/middleware.ts'),
    'keepPickPrivate(context.request, pathname, res.headers)\n'
  )
  assert.deepEqual(contentApiProblems(dir), [])
})
