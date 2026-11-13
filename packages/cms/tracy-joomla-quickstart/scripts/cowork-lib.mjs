/**
 * The `lib` folder of the Claude Cowork plugin release a quickstart pins (`apps/tracy-web/src/quickstarts.json`), for
 * tools that run the plugin's own PHP functions on stored values (the AI quickstart tests and `door-proof.mjs`, #584).
 *
 * Downloaded once into the temp folder, its sha256 checked against the pin. `TRACY_COWORK_LIB` names an unpacked
 * `lib` folder instead. Returns `{lib, version}` or `{skip: reason}`; on CI a failure throws.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

/** @param {string} release a key of quickstarts.json, for example `quickstart/ja-boxing/j6` */
export async function coworkLib(release = 'quickstart/ja-boxing/j6') {
  const pin = JSON.parse(readFileSync(path.join(ROOT, 'apps/tracy-web/src/quickstarts.json'), 'utf8'))[
    release
  ]?.cowork
  if (process.env.TRACY_COWORK_LIB) return { lib: process.env.TRACY_COWORK_LIB, version: pin?.version }
  if (!pin) return { skip: `quickstarts.json pins no Claude Cowork plugin for ${release}` }
  const dir = path.join(tmpdir(), `tracy-cowork-${pin.sha256.slice(0, 16)}`)
  const lib = path.join(dir, 'administrator/lib')
  if (existsSync(path.join(lib, 'QuickstartContract.php'))) return { lib, version: pin.version }
  try {
    const response = await fetch(pin.url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    const sha = createHash('sha256').update(bytes).digest('hex')
    if (sha !== pin.sha256) throw new Error(`${pin.file} has sha256 ${sha}, the pin says ${pin.sha256}`)
    const work = `${dir}.part-${process.pid}`
    rmSync(work, { recursive: true, force: true })
    mkdirSync(work, { recursive: true })
    writeFileSync(path.join(work, pin.file), bytes)
    execFileSync('unzip', ['-q', '-o', pin.file, 'packages/com_claudecowork.zip'], { cwd: work })
    execFileSync('unzip', ['-q', '-o', 'packages/com_claudecowork.zip', 'administrator/lib/*'], { cwd: work })
    if (!existsSync(dir)) renameSync(work, dir)
    else rmSync(work, { recursive: true, force: true })
    return { lib, version: pin.version }
  } catch (error) {
    const reason = `the pinned Claude Cowork plugin ${pin.version} cannot be fetched: ${error.message}`
    if (process.env.CI) throw new Error(reason)
    return { skip: reason }
  }
}
