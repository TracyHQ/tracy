/**
 * The JA Diner WP7 release fixture: the WordPress reference of the template readiness verdict (spec #452), the role
 * JA Boxing plays for Joomla. Shared by every WordPress verdict test (#453 template kit, #455 slot fit, #456 demo
 * baseline and measures, #457 hidden kit fields and content map lists).
 *
 * Two ways in, both going through the verdict as Road to live does:
 *
 *   dinerWp7()                     the release as the quickstart list pins it (`quickstart/ja-diner/wp7`), judged on
 *                                  the committed contract folder `packages/cms/tracy-wordpress-quickstart/contracts/
 *                                  ja-diner/wp7/<version>/` and everything beside it (content map, template kit...)
 *   dinerWp7({ edit })             a deliberately broken copy: the contract folder is copied to a temporary folder,
 *                                  `edit({ dir, readJson, writeJson, remove })` changes the copy (never the repository),
 *                                  and the verdict reads the copy. Call `done()` to remove it.
 *
 * Both return `{ release, world, dir, done }`: hand `release` and `world` to `readinessVerdict` (or `roadOf`). `world`
 * carries `server: false` (no live demo, no preview door), like the command line. The broken copy is the only way a
 * test changes what the verdict reads, so a gate that passes the reference and fails a copy is judged on real files.
 *
 * Helpers for an edit: `readJson(file)` and `writeJson(file, doc)` read and write a file of the copy by its name
 * (`'template-kit.json'`), `remove(file)` deletes one. Example, a kit captured for another quickstart version:
 *
 *   const { release, world, done } = dinerWp7({
 *     edit: ({ readJson, writeJson }) => {
 *       const kit = readJson('template-kit.json')
 *       kit.quickstart.version = '0.0.1'
 *       writeJson('template-kit.json', kit)
 *     }
 *   })
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { defaultContracts, readContracts } from '../src/lib/contracts.js'
import { latestPin, releaseOfPin } from '../src/lib/template-readiness/pinned-release.js'

export const DINER_WP7_TAG = 'quickstart/ja-diner/wp7'

/** The contract folder of the pinned version, as the contract index finds it. */
function contractDirOf(contracts, pin) {
  for (const c of contracts.values()) if (c.id === `ja-diner/wp7/${pin.version}`) return c.dir
  throw new Error(`no contract ja-diner/wp7/${pin.version} in the repository`)
}

/**
 * @param {{ edit?: (o: { dir: string, readJson: (f: string) => any, writeJson: (f: string, doc: any) => void, remove: (f: string) => void }) => void, world?: Record<string, unknown> }} [o]
 * @returns {{ release: any, world: any, dir: string, done: () => void }}
 */
export function dinerWp7({ edit, world = {} } = {}) {
  const pin = latestPin(DINER_WP7_TAG)
  if (!pin) throw new Error(`the quickstart list pins no ${DINER_WP7_TAG}`)
  const repo = defaultContracts()
  const source = contractDirOf(repo, pin)
  if (!edit) {
    const release = releaseOfPin(pin, repo)
    return { release, world: { contracts: repo, server: false, ...world }, dir: source, done: () => {} }
  }
  // A copy holds only this contract: the index reads every manifest under the root, so nothing else answers for it.
  const root = mkdtempSync(path.join(tmpdir(), 'ja-diner-wp7-'))
  const dir = path.join(root, `ja-diner-wp7-${pin.version}`)
  cpSync(source, dir, { recursive: true })
  const at = (f) => path.join(dir, f)
  edit({
    dir,
    readJson: (f) => JSON.parse(readFileSync(at(f), 'utf8')),
    writeJson: (f, doc) => writeFileSync(at(f), `${JSON.stringify(doc, null, 2)}\n`),
    remove: (f) => rmSync(at(f), { force: true })
  })
  const contracts = readContracts([root])
  const release = releaseOfPin(pin, contracts)
  return {
    release,
    world: { contracts, server: false, ...world },
    dir,
    done: () => rmSync(root, { recursive: true, force: true })
  }
}
