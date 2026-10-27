/**
 * The seed plan written into a Joomla working copy: `php php/seed-joomla.php <webroot>` with the
 * plan on stdin. That script boots Joomla and writes with its Table API (no seat cookie, no HTTP);
 * this side only shapes the plan for it — the pages wanted, the cover images as data URIs — and
 * reads its answer.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** @typedef {(cmd: string, args: string[], stdin?: string) => Promise<{ code: number, stdout: string, stderr: string }>} Run */

export const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../php/seed-joomla.php')

/**
 * @param {{ plan: any, run: Run, webroot?: string, pages?: string[], images?: Map<string, { mime: string, bytes: Buffer }>, script?: string, author?: string }} o
 */
export async function applyJoomla({
  plan,
  run,
  webroot = '.webroot',
  pages = ['all'],
  images = new Map(),
  script = SCRIPT,
  author = ''
}) {
  const payload = {
    ...plan,
    pages_wanted: pages,
    author,
    images: Object.fromEntries(
      [...images].map(([slug, im]) => [slug, `data:${im.mime};base64,${im.bytes.toString('base64')}`])
    )
  }
  const r = await run('php', [script, webroot], JSON.stringify(payload))
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split('\n')[0] || 'seed-joomla.php failed')
  const line = r.stdout.trim().split('\n').pop() ?? ''
  try {
    return JSON.parse(line)
  } catch {
    throw new Error(`seed-joomla.php answered without JSON: ${line.slice(0, 200)}`)
  }
}
