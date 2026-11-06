// Template kit `site.createdPageLayouts.legal` (card AN): the article layout a page the write step creates for a legal page prints
// through, declared by a person when packaging (`cli.mjs legal-layout`). A made-up kit; every layout and reason is invented.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { legalLayoutOf } from '../../../../apps/tracy-web/src/write-step/content-page-route.js'
import { declareLegalLayout } from '../template-kit/lib/legal-layout.mjs'

const CLI = fileURLToPath(new URL('../template-kit/cli.mjs', import.meta.url))
const WHY = 'the invented template prints its plain article with no booking bar'

test('a legal layout is a template layout name with its reason, and --none says the plain default is right', () => {
  const kit = { site: {} }
  assert.deepEqual(declareLegalLayout(kit, { layout: 'quay:plain', why: WHY }), {
    error: null,
    changed: true
  })
  assert.equal(legalLayoutOf(kit), 'quay:plain')
  assert.deepEqual(declareLegalLayout(kit, { layout: 'quay:plain', why: WHY }), {
    error: null,
    changed: false
  })
  for (const bad of ['', 'plain', 'quay:', 'quay:plain;x', '../x:y'])
    assert.ok(declareLegalLayout({ site: {} }, { layout: bad, why: WHY }).error, bad)
  assert.match(declareLegalLayout({ site: {} }, { layout: 'quay:plain' }).error, /--why/)
  assert.deepEqual(declareLegalLayout(kit, { none: true, why: WHY }), { error: null, changed: true })
  assert.equal(legalLayoutOf(kit), null)
  assert.deepEqual(kit.site.createdPageLayouts.legal, { articleLayout: null, why: WHY })
})

test('the command writes the kit in its own indentation and leaves every other field as it was', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-legal-'))
  try {
    const file = join(dir, 'template-kit.json')
    writeFileSync(
      file,
      `${JSON.stringify({ contract: 'demo/j6/1.0.0', site: { head: { x: 1 } } }, null, 2)}\n`
    )
    const run = spawnSync(
      process.execPath,
      [CLI, 'legal-layout', '--kit', file, '--layout', 'quay:plain', '--why', WHY],
      {
        encoding: 'utf8'
      }
    )
    assert.equal(run.status, 0, run.stderr)
    const kit = JSON.parse(readFileSync(file, 'utf8'))
    assert.deepEqual(kit.site, {
      head: { x: 1 },
      createdPageLayouts: { legal: { articleLayout: 'quay:plain', why: WHY } }
    })
    assert.equal(
      spawnSync(process.execPath, [CLI, 'legal-layout', '--kit', file], { encoding: 'utf8' }).status,
      2
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
