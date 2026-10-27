#!/usr/bin/env node
/**
 * The Viewer's bar (ADR 0028, `src/client/ViewerBar.tsx`) above the chat box on the start screen AND
 * through the session: the same bar in both places, one record of an ask the door accepted, and a
 * dock occupant of its own so the bar stays once the conversation runs.
 *
 *   node --test packages/ui/tracy-chat-input/test/viewer-bar.test.mjs
 *
 * The component is bundled with esbuild and rendered with `react-dom/server`, resolved from
 * `@tracy/core`, which declares it (as in `deploy-hold.test.mjs`).
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createAskedSites } from '../src/client/seat-role.mjs'
import { en } from '../src/client/strings.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
const t = (key) => en[key] ?? key

let outDir
let render
before(async () => {
  const esbuild = require('esbuild')
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-viewer-bar-'))
  const outfile = path.join(outDir, 'render.cjs')
  await esbuild.build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { ViewerBar } from './ViewerBar'
        export const bar = (props) => renderToStaticMarkup(createElement(ViewerBar, props))`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    // CommonJS: react-dom/server requires Node built-ins, which an ESM bundle cannot `require`.
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    nodePaths: [path.join(corePkg, 'node_modules')],
    outfile,
    logLevel: 'silent'
  })
  render = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

test('the bar reads the same in both places, and names where it is drawn', () => {
  const asked = createAskedSites()
  const start = render.bar({ siteKey: 'a.test', t, asked, place: 'start' })
  const session = render.bar({ siteKey: 'a.test', t, asked, place: 'session' })
  assert.match(start, /data-viewer-bar-place="start"/)
  assert.match(session, /data-viewer-bar-place="session"/)
  assert.equal(
    start.replace('data-viewer-bar-place="start"', ''),
    session.replace('data-viewer-bar-place="session"', ''),
    'same look'
  )
  for (const html of [start, session]) {
    assert.match(html, /data-viewer-bar="idle"/)
    assert.ok(html.includes(en['viewer.bar']))
    assert.ok(html.includes(en['viewer.ask']), 'the Ask for edit access button')
  }
})

test('an ask the start screen sent still reads as sent in the session bar, for that site only', () => {
  const asked = createAskedSites()
  asked.mark('a.test')
  const session = render.bar({ siteKey: 'a.test', t, asked, place: 'session' })
  assert.match(session, /data-viewer-bar="sent"/)
  assert.ok(session.includes(en['viewer.ask.sent']))
  assert.ok(!session.includes('<button'), 'no second ask')
  const other = render.bar({ siteKey: 'b.test', t, asked, place: 'session' })
  assert.match(other, /data-viewer-bar="idle"/)
})

test('the session bar is its own dock occupant, after the start block and the hold notice', () => {
  const source = readFileSync(path.join(pkgRoot, 'src', 'client', 'index.tsx'), 'utf8')
  const orderOf = (id) => {
    const m = source.match(new RegExp(`id: '${id}', order: (\\d+)`))
    assert.ok(m, `no dock occupant ${id}`)
    return Number(m[1])
  }
  assert.ok(orderOf('tracy-viewer') > orderOf('tracy-held'), 'nearest the chat box')
  assert.ok(orderOf('tracy-viewer') > orderOf('tracy-start'))
  // The session occupant draws SeatBar (the bar while a Viewer, the promoted line after, #1036).
  assert.match(
    source,
    /<SeatBar siteKey=\{siteKey\} t=\{t\} asked=\{asked\} seatRole=\{seatRole\} notice=\{promoted\} input=\{input\} \/>/
  )
  assert.match(source, /<ViewerBar\s+siteKey=\{siteKey\}\s+t=\{t\}\s+asked=\{asked\}\s+place="start"/)
  const seatBar = readFileSync(path.join(pkgRoot, 'src', 'client', 'SeatBar.tsx'), 'utf8')
  assert.match(seatBar, /<ViewerBar\s+siteKey=\{siteKey\}\s+t=\{t\}\s+asked=\{asked\}\s+place="session"/)
})
