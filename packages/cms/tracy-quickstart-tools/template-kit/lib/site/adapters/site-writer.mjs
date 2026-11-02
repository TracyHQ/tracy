// The one write path of the site part: a file under an allowed folder of the web root (a language override), set for
// a measurement and put back right after. Given the same `--files-command` / `--webroot` as the read path. Any path
// outside the allowed folders is refused before a command runs.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'

const split = (s) =>
  String(s ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

/** Whether a web-root path may be written: inside one of `allowed` (folders, no `..`). */
export function writable(rel, allowed) {
  const n = normalize(String(rel ?? ''))
  return !n.startsWith('..') && !n.startsWith('/') && allowed.some((dir) => n.startsWith(`${dir}/`))
}

/**
 * @param {{filesCommand?: string, webroot?: string, allowed?: string[]}} o
 * @returns {{writeFile: (rel: string, text: string) => void, removeFile: (rel: string) => void} | null}
 */
export function siteWriter({ filesCommand, webroot, allowed = ['language/overrides'] }) {
  if (!webroot) return null
  const prefix = filesCommand ? split(filesCommand) : null
  const guard = (rel) => {
    if (!writable(rel, allowed))
      throw new Error(`refused to write ${rel}: only ${allowed.join(', ')} may change`)
  }
  const run = (script, args) =>
    execFileSync(prefix[0], [...prefix.slice(1), 'sh', '-c', script, 'sh', ...args], {
      stdio: ['ignore', 'ignore', 'pipe']
    })
  return {
    writeFile(rel, text) {
      guard(rel)
      if (!prefix) {
        mkdirSync(dirname(join(webroot, rel)), { recursive: true })
        writeFileSync(join(webroot, rel), text)
      } else run('printf %s "$1" > "$2"', [text, `${webroot}/${rel}`])
    },
    removeFile(rel) {
      guard(rel)
      if (!prefix) rmSync(join(webroot, rel), { force: true })
      else run('rm -f "$1"', [`${webroot}/${rel}`])
    }
  }
}
