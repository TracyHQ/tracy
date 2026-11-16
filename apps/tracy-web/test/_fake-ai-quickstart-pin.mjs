// Test-only helper (#598): a temporary folder of AI quickstart kits with a fake pin each, read by the real pin reader
// (`resolvePinnedAiQuickstart`). The shipped `pins.json` stays empty until a kit passes the release gate, so a test that
// needs a pinned template copies a kit here, gives it a site, a check record and a pin, and never writes the real file.
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  PINS_FILE,
  PINS_SCHEMA,
  kitFilesSha256Of,
  pinKeyOf
} from 'website-opportunities/domain/ai-quickstart-pin.mjs'
import { readAiQuickstartPins } from '../src/lib/ai-quickstart-pins.js'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * Copy each kit folder under a new root as `<slug>/<cms>/<version>/`, pin it, and read it back.
 * @param {Array<{slug: string, cms?: string, version: string, from: string, manifest?: object}>} kits `from`: the
 *   folder to copy; `manifest`: fields laid over its `kit-manifest.json`
 * @returns {{root: string, pins: Record<string, object>, read: ReturnType<typeof readAiQuickstartPins>,
 *   cleanup: () => void}}
 */
export function fakePinnedKits(kits) {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-aiq-pin-'))
  const pins = {}
  for (const { slug, cms = 'j6', version, from, manifest = {} } of kits) {
    const dir = path.join(root, slug, cms, version)
    mkdirSync(dir, { recursive: true })
    cpSync(from, dir, { recursive: true })
    const file = path.join(dir, 'kit-manifest.json')
    const base = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
    const site = { platform: 'joomla', design: slug, quickstart: `quickstart/${slug}/${cms}` }
    writeFileSync(file, JSON.stringify({ site, ...base, ...manifest }))
    mkdirSync(path.join(dir, 'check-record'), { recursive: true })
    const record = JSON.stringify({ fake: `${slug} ${version}` })
    writeFileSync(path.join(dir, 'check-record', 'record.json'), record)
    pins[pinKeyOf(slug, cms)] = {
      version,
      kitFilesSha256: kitFilesSha256Of(dir),
      recordSha256: sha(record),
      blankSite: { file: `${slug}-blank-site.zip`, bytes: 1, sha256: 'b'.repeat(64) },
      manifest: { file: `${slug}-manifest.json`, bytes: 1, sha256: 'c'.repeat(64) },
      release: { repo: 'Example-Org/example-products', tag: `quickstart/${slug}/${cms}` }
    }
  }
  writeFileSync(path.join(root, PINS_FILE), JSON.stringify({ schema: PINS_SCHEMA, pins }))
  return {
    root,
    pins,
    read: readAiQuickstartPins({ root }),
    cleanup: () => rmSync(root, { recursive: true, force: true })
  }
}
