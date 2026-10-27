/**
 * The --write step of the role scan: every auto finding replaced in its file, with the template's
 * own value kept as the fallback. Every replacement is computed by ONE scan of the files as they are
 * (never from an earlier replacement of the same run), so a second run finds nothing to change.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Rewrite every auto finding in place. Replacements of one file go end to start so offsets hold;
 * two findings that overlap (never expected) leave the later one out.
 * @returns {{ files: string[], replaced: number }}
 */
export function applyAutoConverts(root, scan) {
  const byFile = new Map()
  for (const f of scan.findings)
    if (f.class === 'auto') byFile.set(f.file, [...(byFile.get(f.file) ?? []), f])
  let replaced = 0
  const written = []
  for (const [file, list] of byFile) {
    const path = join(root, file)
    let text = readFileSync(path, 'utf8')
    let floor = Infinity
    for (const f of [...list].sort((a, b) => b.start - a.start)) {
      if (f.end > floor) continue
      text = text.slice(0, f.start) + f.replacement + text.slice(f.end)
      floor = f.start
      replaced++
    }
    writeFileSync(path, text)
    written.push(file)
  }
  return { files: written, replaced }
}
