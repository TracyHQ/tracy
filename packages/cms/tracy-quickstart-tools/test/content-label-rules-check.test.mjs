// The static label rules check: rules R2 to R9 on a contract's content map, with no crawl, so a regroup of the slots
// that breaks a blocking rule (R4, one group per item of an indexed repeat) is seen in seconds, before an hour long
// measure. Invented travel company map only.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('../content-coverage/label-rules-check.mjs', import.meta.url))

const lineOf = (tour, k, group) => ({
  key: `article-9.tour-include.${k}`,
  type: 'text',
  sample: ['Two nights by the fjord', 'Guided glacier walk', 'Daily breakfast'][k],
  role: group.kind === 'claim' ? 'package.feature_item' : 'offering.description',
  jsonPath: ['attribs', 'tour_include', k],
  group
})

function contractWith(lines) {
  const dir = mkdtempSync(path.join(tmpdir(), 'label-rules-check-'))
  const map = {
    roleVocabularyVersion: 'place-content-roles/3',
    slotFitVersion: 'slot-fit/1',
    slots: [
      {
        key: 'article-9.title',
        type: 'text',
        sample: 'Fjord Lights Week',
        role: 'offering.name',
        group: { id: 'article-9.offering', item: 0, kind: 'service' }
      },
      ...lines
    ]
  }
  writeFileSync(path.join(dir, 'content-map.json'), JSON.stringify(map))
  return dir
}

const run = (dir) => spawnSync(process.execPath, [CLI, '--contract', dir], { encoding: 'utf8' })

test('indexed include lines sharing the offering group fail R4 with its code, before any measure', () => {
  const shared = { id: 'article-9.offering', item: 0, kind: 'service' }
  const r = run(contractWith([0, 1, 2].map((k) => lineOf('article-9', k, shared))))
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.stdout, /label-rule-R4 3 /)
})

test('one claim group per line (the JA Kinetic shape) passes', () => {
  const r = run(
    contractWith(
      [0, 1, 2].map((k) =>
        lineOf('article-9', k, { id: `article-9.tour-include.${k}`, item: k, kind: 'claim' })
      )
    )
  )
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /label rules: 0 failing/)
})
