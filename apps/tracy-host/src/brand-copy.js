/**
 * A brand follows the viewer to the site they create from it (ADR 0023, "Addendum 30/09").
 *
 * WHY HERE. The brand engine extracts a brand into the folder of the site the viewer is in
 * (`<site A>/Brand/<host>/`); a site created from that brand is built in ITS OWN folder, where the
 * Build's `style`, `copy` and `seed` stages look for `Brand/<host>/tokens.css` — and found nothing
 * (measured 30/09 on the stand `dsgnm`, site `dfbrandwp1`). No dsh door can carry it across: a seat
 * is granted exactly one folder, so a request made in A can read A only and one made in B can write
 * B only. This process holds the whole sites root, so it copies — but it decides nothing: tracy-web
 * names the source only after checking that the viewer holds a seat on it, and the copy runs after
 * the provision succeeded, before the first Build can start (a Build starts on the job's `done`).
 *
 * WHAT IS COPIED: regular files and directories under `Brand/<host>/`, nothing else. A symbolic
 * link is never followed (it could point anywhere on the host), and sizes are capped. What was
 * copied lands owned like the new site's folder, so the brand engine can extract into it again.
 */
import { chown, copyFile, lstat, mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

import { SAFE_LABEL } from './provision.js'

/** The brand engine's directory name shape (`SAFE_HOST` of `tracy-design-inspiration`'s gallery). */
const SAFE_HOST =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

export const BRAND_COPY_LIMITS = Object.freeze({ files: 2000, bytes: 64 * 1024 * 1024, depth: 6 })

/**
 * The brand source a provision names: `null` when it names none, `undefined` when what it names is
 * not a safe label and brand host (the door refuses that), or `{label, host}`.
 * @param {unknown} raw the body's `brandFrom`
 * @param {string} label the site being provisioned
 * @returns {{ label: string, host: string } | null | undefined}
 */
export function brandFromOf(raw, label) {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const { label: from, host } = /** @type {Record<string, unknown>} */ (raw)
  if (typeof from !== 'string' || !SAFE_LABEL.test(from) || from === label) return undefined
  if (typeof host !== 'string' || !SAFE_HOST.test(host) || /^[0-9.]+$/.test(host)) return undefined
  return { label: from, host }
}

/**
 * Copy `<sitesRoot>/<from>/Brand/<host>/` to `<sitesRoot>/<to>/Brand/<host>/`.
 * @param {{ sitesRoot: string, from: string, to: string, host: string }} input already validated
 * @returns {Promise<{ copied: number, reason?: string }>}
 */
export async function copyBrand({ sitesRoot, from, to, host }) {
  const source = path.join(sitesRoot, from, 'Brand', host)
  const sourceStat = await lstat(source).catch(() => null)
  if (!sourceStat?.isDirectory()) return { copied: 0, reason: `Brand/${host} is not in ${from}` }
  const tokens = await lstat(path.join(source, 'tokens.css')).catch(() => null)
  if (!tokens?.isFile()) return { copied: 0, reason: `Brand/${host} of ${from} has no tokens.css` }
  const siteDir = path.join(sitesRoot, to)
  const owner = await stat(siteDir).catch(() => null)
  const target = path.join(siteDir, 'Brand', host)
  let copied = 0
  let bytes = 0
  const own = async (p) => {
    if (owner) await chown(p, owner.uid, owner.gid).catch(() => {})
  }
  const visit = async (rel, level) => {
    if (level > BRAND_COPY_LIMITS.depth) return
    const dir = path.join(target, rel)
    await mkdir(dir, { recursive: true })
    await own(dir)
    const entries = await readdir(path.join(source, rel), { withFileTypes: true })
    for (const entry of entries) {
      const child = path.join(rel, entry.name)
      // `Dirent` never follows a link: a symbolic link is neither a file nor a directory here.
      if (entry.isDirectory()) await visit(child, level + 1)
      else if (entry.isFile()) {
        const size = (await lstat(path.join(source, child))).size
        if (copied >= BRAND_COPY_LIMITS.files || bytes + size > BRAND_COPY_LIMITS.bytes) continue
        await copyFile(path.join(source, child), path.join(target, child))
        await own(path.join(target, child))
        copied += 1
        bytes += size
      }
    }
  }
  const brandDir = path.join(siteDir, 'Brand')
  await mkdir(brandDir, { recursive: true })
  await own(brandDir)
  await visit('', 0)
  return { copied }
}
