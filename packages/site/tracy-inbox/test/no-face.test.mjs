// Inbox rows draw only the category tile, no person face (Akemi 04/10/2026: back to the approved
// option I; the Face from feat/faces-everywhere stays on every other surface).
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = mkdtempSync(path.join(tmpdir(), 'inbox-rows-'))
after(() => rmSync(out, { recursive: true, force: true }))

async function render() {
  const entry = path.join(out, 'entry.tsx')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(
    entry,
    `import { renderToStaticMarkup } from 'react-dom/server'
import { SectionRow } from ${JSON.stringify(path.join(here, '../src/client/section-rows.tsx'))}
import { buildSections } from ${JSON.stringify(path.join(here, '../src/client/sections.ts'))}
const LEE = { id: 'a1', email: 'lee@lab3.example', name: 'Lee', face: { initial: 'L', color: '#4f46e5', avatarUrl: null } }
const row = (kind, data = {}, extra = {}) => ({ id: kind, kind, siteKey: 'kinetic.vn', actor: LEE, data, settledAt: null, createdAt: '2026-10-04T10:00:00Z', readAt: null, ...extra })
const t = (key) => key
export function markup() {
  const sections = buildSections([row('team.join_request'), row('comment.mention', { quote: 'hi', commentId: 'c', page: '/' }), row('team.joined', { role: 'editor' })])
  return sections.flatMap((s) => s.items.map((item) => renderToStaticMarkup(SectionRow({ section: s.id, item, t, when: 'now', onPress: () => {}, onAnswer: async () => true, siteHref: null }))))
}`
  )
  await build({
    entryPoints: [entry],
    outfile: path.join(here, '..', '.no-face-entry.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    absWorkingDir: path.join(here, '..'),
    nodePaths: [path.join(here, '../node_modules')],
    // React and its server renderer load from node_modules as they are; only the row code is bundled.
    external: ['react', 'react-dom', 'react-dom/*', 'react/*'],
    // CommonJS deps (lucide, @tracy/ui) call require(): give the ESM bundle a real one.
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);"
    },
    logLevel: 'silent'
  })
  const built = path.join(here, '..', '.no-face-entry.mjs')
  try {
    return (await import(pathToFileURL(built).href)).markup()
  } finally {
    rmSync(built, { force: true })
  }
}

test('every Inbox row shape draws its category tile and no person face', async () => {
  const rows = await render()
  assert.equal(rows.length, 3, 'a card, a comment and a team row')
  for (const html of rows) {
    assert.match(html, /tracy-inbox-solid/, 'the category tile')
    assert.doesNotMatch(html, /data-tracy-face|tracy-inbox-face/, 'no person face')
  }
})
