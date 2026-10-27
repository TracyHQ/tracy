// A Chrome that stalls at launch is killed and another started (21/10/2026: on a machine shared with other
// batches four launches at once stayed silent past 30 s, a fresh one seconds later answered in 2 s, and the one
// stalled launch failed the whole preview step of a release measure).
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const REAL = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const dir = mkdtempSync(join(tmpdir(), 'ds-cdp-restart-'))
const count = join(dir, 'launches')
// a stand-in for Chrome: the launches listed in `stall` (1-based) hang without answering; the others are Chrome
const fake = join(dir, 'chrome.sh')
writeFileSync(
  fake,
  `#!/bin/sh
n=$(( $(cat "${count}" 2>/dev/null || echo 0) + 1 )); echo $n > "${count}"
case " $(cat "${join(dir, 'stall')}") " in *" $n "*) exec sleep 120 ;; esac
exec "${REAL}" "$@"
`
)
chmodSync(fake, 0o755)
process.env.CHROME = fake
const { browser } = await import('../scripts/cdp.mjs')

const runs = (/** @type {string} */ stall) => {
  writeFileSync(join(dir, 'stall'), stall)
  rmSync(count, { force: true })
}
const launches = () => Number(readFileSync(count, 'utf8'))

test.after(() => rmSync(dir, { recursive: true, force: true }))

test('a stalled launch is killed and the next Chrome is used', {
  skip: !existsSync(REAL) && 'no Chrome'
}, async () => {
  runs('1')
  // the real Chrome behind the stalled one may itself be slow on a loaded machine: more starts, and any launch after the first is fine
  const b = await browser(9790, { wait: 3000, starts: 5 })
  try {
    assert.ok(launches() >= 2)
    assert.equal(typeof b.close, 'function')
  } finally {
    await b.close()
  }
})

test('every launch stalled: it says so after the last one', async () => {
  runs('1 2 3')
  await assert.rejects(browser(9790, { wait: 500, starts: 3 }), /Chrome did not start/)
  assert.equal(launches(), 3)
})
