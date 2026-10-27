// The newest WordPress contract of every release names only entity kinds the Claude Cowork plugin can find
// (QuickstartContract::findBySlug: option, templatePart, page and post, a post of any type by `postType`). Tracy Base wp7
// 1.1.2 named `themeMod` and `syncedPattern`, which no plugin release has ever read: the bind came back empty, and on
// dev (tamq-7q-tbwp3, tbwp4, 08/10/2026) only the brand step landed — the name, the About text, the language and the
// page drop never did, while the build said done.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'contracts')
const KINDS = new Set(['option', 'templatePart', 'page', 'post'])

const byVersion = (a, b) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

/** The newest version of each `<design>/wp<major>`, as `<design>/wp<major>/<version>`. */
function newest() {
  const out = []
  for (const design of readdirSync(ROOT))
    for (const major of readdirSync(path.join(ROOT, design)).filter((d) => /^wp\d+$/.test(d))) {
      const versions = readdirSync(path.join(ROOT, design, major)).filter((v) =>
        existsSync(path.join(ROOT, design, major, v, 'content-map.json'))
      )
      versions.sort(byVersion)
      if (versions.length > 0) out.push(`${design}/${major}/${versions.at(-1)}`)
    }
  return out
}

test('the newest contract of every WordPress release names only entity kinds the plugin can find', () => {
  const ids = newest()
  // The newest version is read off the folder, not pinned: a pinned id goes stale with every new cut. A floor still
  // proves the walk sees the cuts that motivated this test (Tracy Base wp7 1.1.3 dropped themeMod/syncedPattern).
  const base = ids.find((id) => id.startsWith('tracy-base/wp7/'))
  assert.ok(base, 'Tracy Base wp7 is checked')
  assert.ok(byVersion(base.split('/').at(-1), '1.1.3') >= 0, `${base} is at least 1.1.3`)
  const all = readdirSync(path.join(ROOT, 'tracy-base', 'wp7')).filter((v) =>
    existsSync(path.join(ROOT, 'tracy-base', 'wp7', v, 'content-map.json'))
  )
  assert.ok(
    all.every((v) => byVersion(v, base.split('/').at(-1)) <= 0),
    `${base} is the newest of ${all.join(', ')}`
  )
  const bad = []
  for (const id of ids) {
    const map = JSON.parse(readFileSync(path.join(ROOT, id, 'content-map.json'), 'utf8'))
    for (const entity of map.entities ?? [])
      if (!KINDS.has(entity.kind)) bad.push(`${id}: ${entity.key} is a ${entity.kind}`)
  }
  assert.deepEqual(bad, [])
})
