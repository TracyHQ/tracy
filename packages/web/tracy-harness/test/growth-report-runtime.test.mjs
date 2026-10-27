import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../src/beta/', import.meta.url)
test('growth product code never depends on a saved local report', async () => {
  const files = (await readdir(root)).filter((file) => /\.(tsx?|css)$/.test(file))
  const server = new URL('../../../../../apps/tracy-web/src/', root)
  const serverFiles = [
    'ops/beta.js',
    'ops/app-statistic.js',
    'ops/usage.js',
    ...(await readdir(new URL('lib/', server)))
      .filter((file) => /^(ops-(signal|usage|stuck)|app-statistic).*\.js$/.test(file))
      .map((file) => `lib/${file}`)
  ]
  const forbidden =
    /(?:saved|captured) (?:report|totals|production data)|REPORT_DATA_[A-Z_]+|snapshot-only|snapshotAt|snapshot captured|report (?:was )?captured/i
  for (const file of files) {
    assert.doesNotMatch(await readFile(new URL(file, root), 'utf8'), forbidden, file)
  }
  for (const file of serverFiles) {
    assert.doesNotMatch(await readFile(new URL(file, server), 'utf8'), forbidden, file)
  }
})
