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

// ── WordPress: a block template name, validated against the theme's templates (#457) ─────────────────────────────────

import { mkdirSync } from 'node:fs'

import { HIDDEN_KIT_FIELDS_CHECK } from '../../../../apps/tracy-web/src/lib/template-readiness/hidden-kit-fields.js'
import { themeTemplatesOf } from '../template-kit/lib/legal-layout.mjs'

const wpKit = () => ({
  contract: 'quay/wp7/1.0.0',
  template: { name: 'wp-quay' },
  site: {}
})
const TEMPLATES = ['page', 'page-plain', 'single']

test('WordPress: a block template of the theme is accepted, bare or with its theme; anything else is refused', () => {
  for (const layout of ['page-plain', 'wp-quay//page-plain']) {
    const kit = wpKit()
    assert.deepEqual(declareLegalLayout(kit, { layout, why: WHY, templates: TEMPLATES }), {
      error: null,
      changed: true
    })
    assert.equal(kit.site.createdPageLayouts.legal.articleLayout, layout)
  }
  const refused = (layout, templates = TEMPLATES) =>
    declareLegalLayout(wpKit(), { layout, why: WHY, templates }).error
  assert.match(refused('page-booking'), /not a template of wp-quay/)
  assert.match(refused('other-theme//page'), /wp-quay/)
  assert.match(refused('quay:plain'), /block template/)
  assert.match(refused('page;x'), /block template/)
  assert.match(refused('page', null), /--webroot/)
  // --none needs no template list, and Joomla keeps <template>:<file> whatever the list says.
  assert.equal(declareLegalLayout(wpKit(), { none: true, why: WHY }).error, null)
  assert.match(
    declareLegalLayout({ contract: 'quay/j6/1.0.0', site: {} }, { layout: 'page', why: WHY }).error,
    /<template>:<file>/
  )
  assert.equal(
    declareLegalLayout({ contract: 'quay/j6/1.0.0', site: {} }, { layout: 'quay:plain', why: WHY }).error,
    null
  )
})

test('WordPress: the templates of a theme are the .html files of its templates folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-legal-wp-'))
  try {
    const folder = join(dir, 'wp-content', 'themes', 'wp-quay', 'templates')
    mkdirSync(folder, { recursive: true })
    for (const f of ['page.html', 'page-plain.html', 'notes.txt']) writeFileSync(join(folder, f), '')
    assert.deepEqual(themeTemplatesOf(dir, 'wp-quay'), ['page', 'page-plain'])
    assert.equal(themeTemplatesOf(dir, 'wp-missing'), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('WordPress round trip: the command writes a template name and the hidden fields check accepts that field', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-legal-wp-'))
  try {
    mkdirSync(join(dir, 'wp-content', 'themes', 'wp-quay', 'templates'), { recursive: true })
    writeFileSync(join(dir, 'wp-content', 'themes', 'wp-quay', 'templates', 'page-plain.html'), '')
    const file = join(dir, 'template-kit.json')
    writeFileSync(file, `${JSON.stringify(wpKit(), null, 2)}\n`)
    const run = (layout) =>
      spawnSync(
        process.execPath,
        [CLI, 'legal-layout', '--kit', file, '--layout', layout, '--why', WHY, '--webroot', dir],
        { encoding: 'utf8' }
      )
    assert.equal(run('page-gone').status, 1)
    assert.equal(run('wp-quay//page-plain').status, 0)
    const kit = JSON.parse(readFileSync(file, 'utf8'))
    const fields = HIDDEN_KIT_FIELDS_CHECK.judge(
      { platform: 'wordpress' },
      { templateKit: { state: 'read', doc: kit } },
      {}
    )
    assert.ok(!fields.params.fields.includes('createdPageLayouts.legal'))
    assert.ok(fields.params.declared.includes('createdPageLayouts.legal'))
    assert.deepEqual(fields.params.problems, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
