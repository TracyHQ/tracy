/**
 * `ActorFace` — the face on a Changes / Backup / Activity row. A person drawn with the face the
 * server sent (`personFace`: the same letter and colour the Team tab shows); without one, their
 * letter on the neutral grey, never a colour guessed in the browser.
 *
 * The component is bundled by esbuild and rendered to static markup; nothing here runs a browser.
 *
 *   node --test packages/core/tracy-core/test/actor-face.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'actor-face-'))
  const outfile = path.join(outDir, 'actor-face.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { ActorFace } from './site-tabs/pieces'
        export { addressFace } from './team/face'
      `,
      resolveDir: path.join(here, '..', 'src'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const draw = (by) => lib.renderToStaticMarkup(lib.createElement(lib.ActorFace, { by }))
/** The face's own span: its background and the letter inside it. */
const faceOf = (html) => {
  const m = /<span[^>]*data-tracy-face=""[^>]*style="([^"]*)"[^>]*>([^<]*)<\/span>/.exec(html)
  assert.ok(m, 'a face is drawn')
  return { style: m[1], letter: m[2] }
}

test('a person with a face from the server wears its colour and letter', () => {
  const face = faceOf(
    draw({
      kind: 'person',
      name: 'mai',
      email: 'mai@example.test',
      face: { initial: 'M', color: '#db2777', avatarUrl: null }
    })
  )
  assert.match(face.style, /background:#db2777/)
  assert.equal(face.letter, 'M')
})

test('a person with no face (null or absent) is their letter on the neutral grey', () => {
  for (const extra of [{ face: null }, {}]) {
    const face = faceOf(draw({ kind: 'person', name: 'sam', email: 'sam@example.test', ...extra }))
    assert.match(face.style, /background:var\(--muted-foreground, #94a3b8\)/)
    assert.equal(face.letter, 'S')
  }
})

test('a face with a photo draws the photo', () => {
  const html = draw({
    kind: 'person',
    name: 'Mai',
    email: 'mai@example.test',
    face: { initial: 'M', color: '#db2777', avatarUrl: 'https://example.test/mai.png' }
  })
  assert.match(html, /<img src="https:\/\/example\.test\/mai\.png"/)
})

test('a face whose photo is Tracy’s own picture address draws it as is, same origin', () => {
  // `personFace` hands out `/auth/avatar/:accountId?v=…` for a provider picture (09/10/2026).
  const avatarUrl = '/auth/avatar/0b1c2d3e-0000-4000-8000-000000000001?v=1a2b3c4d'
  const html = draw({
    kind: 'person',
    name: 'Mai',
    email: 'mai@example.test',
    face: { initial: 'M', color: '#db2777', avatarUrl }
  })
  assert.ok(html.includes(`<img src="${avatarUrl}"`), html)
})

test('a person no account backs wears addressFace of their address, the one client-side face', () => {
  for (const by of [
    { kind: 'person', name: '', email: 'zoe@example.test', face: null },
    { kind: 'person', name: '', email: '', face: null }
  ]) {
    const want = lib.addressFace(by.email)
    const face = faceOf(draw(by))
    assert.equal(face.letter, want.initial)
    assert.ok(face.style.includes(`background:${want.color}`), face.style)
  }
})
