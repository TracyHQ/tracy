/**
 * Offline reclassify: the module boxes the label judge needs are saved beside the evidence with a fingerprint of the
 * inputs they depend on, and a later run reuses them only when that fingerprint matches. Anything else (changed dump,
 * changed webroot, other page list, an older run that saved no fingerprint) reads the pages in the browser again.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  inputFingerprint,
  MODULE_BOXES_FILE,
  readModuleBoxes
} from '../content-coverage/lib/verify/module-boxes-saved.mjs'

const SITE = 'https://harbour-kites.example/'
const BOXES = {
  containers: [{ x: 10, y: 400, w: 600, h: 300 }],
  'module-7': { x: 0, y: 100, w: 1440, h: 240 }
}

/** A browser that answers every page with BOXES and counts how many pages it opened. */
function countingChromium() {
  const seen = { opened: 0 }
  const page = () => ({
    goto: async () => {
      seen.opened++
    },
    waitForLoadState: async () => {},
    evaluate: async () => structuredClone(BOXES),
    close: async () => {}
  })
  return {
    seen,
    chromium: { launch: async () => ({ close: async () => {} }) },
    openContext: async () => ({ newPage: async () => page(), close: async () => {} })
  }
}

/** A browser that must not be used: the offline path never launches one. */
const noBrowser = {
  chromium: {
    launch: async () => {
      throw new Error('the browser was opened')
    }
  },
  openContext: async () => {
    throw new Error('the browser was opened')
  }
}

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'module-boxes-saved-'))
  const dump = join(dir, 'database.sql')
  writeFileSync(dump, "INSERT INTO `kite_modules` VALUES (7,'Harbour Kites hero');\n")
  const webroot = join(dir, 'webroot')
  mkdirSync(join(webroot, 'templates', 'kites', 'css'), { recursive: true })
  writeFileSync(join(webroot, 'templates', 'kites', 'css', 'template.css'), '.hero { padding: 40px }\n')
  const out = join(dir, 'out')
  mkdirSync(out)
  const findings = {
    pages: [
      { n: 1, url: `${SITE}index.php` },
      { n: 2, url: `${SITE}lessons` }
    ]
  }
  return { dir, dump, webroot, out, findings, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

const quiet = () => {}

test('a second run with the same inputs reuses the saved boxes without opening a browser', async () => {
  const f = fixture()
  try {
    const fingerprint = inputFingerprint({
      site: SITE,
      dbDump: f.dump,
      webroot: f.webroot,
      pages: f.findings.pages
    })
    const live = countingChromium()
    const first = await readModuleBoxes({
      ...live,
      findings: f.findings,
      outDir: f.out,
      fingerprint,
      log: quiet
    })
    assert.equal(first.source, 'browser')
    assert.equal(live.seen.opened, 4) // 2 pages x desktop + phone
    assert.ok(JSON.parse(readFileSync(join(f.out, MODULE_BOXES_FILE), 'utf8')).fingerprint)

    const again = inputFingerprint({
      site: SITE,
      dbDump: f.dump,
      webroot: f.webroot,
      pages: f.findings.pages
    })
    const lines = []
    const second = await readModuleBoxes({
      ...noBrowser,
      findings: f.findings,
      outDir: f.out,
      fingerprint: again,
      log: (l) => lines.push(l)
    })
    assert.equal(second.source, 'saved')
    assert.deepEqual(second.boxes, first.boxes)
    assert.deepEqual(second.failures, [])
    assert.match(lines.join('\n'), /reusing saved module boxes/)
    assert.deepEqual(second.boxes[2].desktop, BOXES)
  } finally {
    f.cleanup()
  }
})

for (const [what, change] of [
  [
    'the database dump changed',
    (f) => writeFileSync(f.dump, "INSERT INTO `kite_modules` VALUES (7,'Other');\n")
  ],
  [
    'a webroot file changed',
    (f) => writeFileSync(join(f.webroot, 'templates', 'kites', 'css', 'template.css'), '.hero{padding:8px}\n')
  ],
  ['the page list changed', (f) => f.findings.pages.push({ n: 3, url: `${SITE}contact` })]
])
  test(`${what}: the boxes are read in the browser again, with a log line saying why`, async () => {
    const f = fixture()
    try {
      const fp = () =>
        inputFingerprint({ site: SITE, dbDump: f.dump, webroot: f.webroot, pages: f.findings.pages })
      await readModuleBoxes({
        ...countingChromium(),
        findings: f.findings,
        outDir: f.out,
        fingerprint: fp(),
        log: quiet
      })
      change(f)
      const live = countingChromium()
      const lines = []
      const r = await readModuleBoxes({
        ...live,
        findings: f.findings,
        outDir: f.out,
        fingerprint: fp(),
        log: (l) => lines.push(l)
      })
      assert.equal(r.source, 'browser')
      assert.ok(live.seen.opened > 0)
      assert.match(lines.join('\n'), /fingerprint does not match/)
    } finally {
      f.cleanup()
    }
  })

test('an older run that saved no module boxes, or saved them without a fingerprint, falls back to the browser', async () => {
  const f = fixture()
  try {
    const fingerprint = inputFingerprint({
      site: SITE,
      dbDump: f.dump,
      webroot: f.webroot,
      pages: f.findings.pages
    })
    const lines = []
    const log = (l) => lines.push(l)
    const none = await readModuleBoxes({
      ...countingChromium(),
      findings: f.findings,
      outDir: f.out,
      fingerprint,
      log
    })
    assert.equal(none.source, 'browser')
    assert.match(lines.join('\n'), /no saved module boxes/)

    writeFileSync(join(f.out, MODULE_BOXES_FILE), JSON.stringify({ boxes: { 1: { desktop: BOXES } } }))
    lines.length = 0
    const old = await readModuleBoxes({
      ...countingChromium(),
      findings: f.findings,
      outDir: f.out,
      fingerprint,
      log
    })
    assert.equal(old.source, 'browser')
    assert.match(lines.join('\n'), /no fingerprint/)
  } finally {
    f.cleanup()
  }
})

test('without a dump or a webroot the site cannot be proved unchanged: never reused unless trusted explicitly', async () => {
  const f = fixture()
  try {
    const fingerprint = inputFingerprint({
      site: SITE,
      dbDump: null,
      webroot: f.webroot,
      pages: f.findings.pages
    })
    await readModuleBoxes({
      ...countingChromium(),
      findings: f.findings,
      outDir: f.out,
      fingerprint,
      log: quiet
    })
    const lines = []
    const r = await readModuleBoxes({
      ...countingChromium(),
      findings: f.findings,
      outDir: f.out,
      fingerprint,
      log: (l) => lines.push(l)
    })
    assert.equal(r.source, 'browser')
    assert.match(lines.join('\n'), /no database dump/)

    const trusted = await readModuleBoxes({
      ...noBrowser,
      findings: f.findings,
      outDir: f.out,
      fingerprint,
      trust: true,
      log: (l) => lines.push(l)
    })
    assert.equal(trusted.source, 'saved')
    assert.match(lines.join('\n'), /TRUSTED/)
  } finally {
    f.cleanup()
  }
})

test('a saved run with failed pages is not reused: a page that did not open is read again', async () => {
  const f = fixture()
  try {
    const fingerprint = inputFingerprint({
      site: SITE,
      dbDump: f.dump,
      webroot: f.webroot,
      pages: f.findings.pages
    })
    writeFileSync(
      join(f.out, MODULE_BOXES_FILE),
      JSON.stringify({
        format: 'module-boxes/1',
        fingerprint,
        boxes: {},
        failures: [{ url: `${SITE}lessons`, viewport: 'phone', error: 'net::ERR_CONNECTION_REFUSED' }]
      })
    )
    const lines = []
    const r = await readModuleBoxes({
      ...countingChromium(),
      findings: f.findings,
      outDir: f.out,
      fingerprint,
      log: (l) => lines.push(l)
    })
    assert.equal(r.source, 'browser')
    assert.match(lines.join('\n'), /failed pages/)
  } finally {
    f.cleanup()
  }
})
