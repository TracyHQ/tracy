// A page whose renderer dies must fail the step at once, and Chrome must not run on a container's 64 MB /dev/shm
// (05/11/2026: JA Restaurant EmDash's home page crashed its renderer 0.1 s after the document committed, there
// being 22 MB of shared memory left; every later call went unanswered and flow.mjs sat on the page for minutes,
// saying nothing).
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const REAL = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const dir = mkdtempSync(join(tmpdir(), 'ds-cdp-crash-'))
const argsFile = join(dir, 'args')
// a stand-in for Chrome that records how it was started
const fake = join(dir, 'chrome.sh')
writeFileSync(
  fake,
  `#!/bin/sh
echo "$@" >> "${argsFile}"
exec "${REAL}" "$@"
`
)
chmodSync(fake, 0o755)
process.env.CHROME = fake
const { browser } = await import('../scripts/cdp.mjs')

test.after(() => rmSync(dir, { recursive: true, force: true }))

test('Chrome keeps its shared memory out of /dev/shm', {
  skip: !existsSync(REAL) && 'no Chrome'
}, async () => {
  const b = await browser(9791)
  try {
    assert.match(readFileSync(argsFile, 'utf8'), /--disable-dev-shm-usage/)
  } finally {
    await b.close()
  }
})

test('a page that crashed fails the open with that said, not after minutes', {
  skip: !existsSync(REAL) && 'no Chrome',
  timeout: 60000
}, async () => {
  const b = await browser(9791)
  try {
    const t = Date.now()
    await assert.rejects(b.open('chrome://crash', 1440), /page crashed/)
    assert.ok(Date.now() - t < 30000)
    // and the next call on the dead page says it too, at once
    await assert.rejects(b.evaluate('1'), /page crashed/)
  } finally {
    await b.close()
  }
})
