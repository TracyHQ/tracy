// The re-run on a new template version (ticket #588): every patch an AI quickstart records is judged against the new
// version's files as applies, already applied upstream, or no longer applies; a kit with no patch says so. On an
// invented template ("example-meadow") and invented patches, through the pure judge and through the command.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { PATCHES_FILE, PATCHES_SCHEMA, patchStatus, readPatches } from '../ai-quickstart/template-patches.mjs'

const RERUN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ai-quickstart/rerun.mjs')
const CSS = 'templates/example_meadow/css/template.css'
const PATCHES = [
  {
    id: 'body-background',
    file: CSS,
    find: 'body { background: #fafafa; }',
    replace: 'body { background: var(--bg); }',
    why: 'design'
  },
  {
    id: 'footer-year',
    file: CSS,
    find: '.footer { color: #111; }',
    replace: '.footer { color: var(--fg); }',
    why: 'design'
  },
  {
    id: 'old-label',
    file: CSS,
    find: '.label { font: 12px; }',
    replace: '.label { font: 1rem; }',
    why: 'design'
  },
  { id: 'gone-file', file: 'templates/example_meadow/js/old.js', find: 'a', replace: 'b', why: 'gone' }
]
// Version 2 of the invented template: the first patch still applies, the second is fixed upstream, the third's text
// changed, the fourth's file was removed.
const V2 = 'body { background: #fafafa; }\n.footer { color: var(--fg); }\n.label { font: 14px; }\n'

function setup(patches = PATCHES) {
  const root = mkdtempSync(path.join(tmpdir(), 'template-patches-'))
  const kit = path.join(root, 'kit', 'example-meadow', 'j6', '1.0.0')
  mkdirSync(kit, { recursive: true })
  if (patches)
    writeFileSync(path.join(kit, PATCHES_FILE), JSON.stringify({ schema: PATCHES_SCHEMA, patches }))
  const release = path.join(root, 'release-2.0.0')
  mkdirSync(path.join(release, path.dirname(CSS)), { recursive: true })
  writeFileSync(path.join(release, CSS), V2)
  return { root, kit, release }
}

test('each patch is judged applies, already applied upstream, or no longer applies', () => {
  const t = setup()
  const read = (rel) => {
    try {
      return readFileSync(path.join(t.release, rel), 'utf8')
    } catch {
      return null
    }
  }
  const { patches, problems } = readPatches(t.kit)
  assert.deepEqual(problems, [])
  assert.deepEqual(
    patches.map((p) => [p.id, patchStatus(p, read).status, patchStatus(p, read).reason.split(' ')[0]]),
    [
      ['body-background', 'applies', 'the'],
      ['footer-year', 'already_applied', 'the'],
      ['old-label', 'no_longer_applies', 'text_changed'],
      ['gone-file', 'no_longer_applies', 'file_missing']
    ]
  )
  const twice = { ...PATCHES[0] }
  assert.equal(patchStatus(twice, () => V2 + V2).reason, 'text_ambiguous')
  rmSync(t.root, { recursive: true, force: true })
})

test('the command reports every patch and fails while one no longer applies', () => {
  const t = setup()
  const out = path.join(t.root, 'out')
  const run = spawnSync(process.execPath, [RERUN, t.kit, '--template', t.release, '--out', out], {
    encoding: 'utf8'
  })
  assert.equal(run.status, 1)
  assert.match(run.stdout, /production step: not_run/)
  assert.match(run.stdout, /patch body-background .*: applies/)
  assert.match(run.stdout, /patch footer-year .*: already_applied/)
  const report = JSON.parse(readFileSync(path.join(out, 'rerun-report.json'), 'utf8'))
  assert.deepEqual(
    report.patches.map((p) => p.status),
    ['applies', 'already_applied', 'no_longer_applies', 'no_longer_applies']
  )
  rmSync(t.root, { recursive: true, force: true })
})

test('a kit that records no patch says so plainly', () => {
  const t = setup(null)
  const out = path.join(t.root, 'out')
  const stdout = execFileSync(process.execPath, [RERUN, t.kit, '--template', t.release, '--out', out], {
    encoding: 'utf8'
  })
  assert.match(stdout, /recorded template patches: none, so there is nothing to re-apply/)
  assert.deepEqual(JSON.parse(readFileSync(path.join(out, 'rerun-report.json'), 'utf8')).patches, [])
  rmSync(t.root, { recursive: true, force: true })
})
