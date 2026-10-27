/**
 * Check the `file:line` pointers of a layer README's "Known limitations" section against the code they name.
 * Every pointer is written `path:line` followed by the symbol it points at in backticks and parentheses,
 * and the line (or one of the next two, for a multi-line signature) must declare or use that symbol, so a
 * pointer that survives a refactor while pointing at something else is reported.
 */
import { join } from 'node:path'
import { readTextSync } from '../lib/bounded-reader.mjs'

const POINTER = /`([\w./-]+\.(?:mjs|js|ts|json)):(\d+)`(?: \(`([\w.]+)`\))?/g

/**
 * @param {string} readme - README text.
 * @param {string} baseDir - directory a bare file name (`common.mjs`) is read against.
 * @param {string} repo - repository root a path with a directory is read against.
 * @param {(path: string) => string} [read] - reads a file as text.
 * @returns {{count: number, problems: string[]}} number of pointers found and what is wrong with them.
 */
export function readmePointerProblems(readme, baseDir, repo, read = readTextSync) {
  const at = readme.indexOf('## Known limitations')
  const problems = []
  if (at < 0) return { count: 0, problems: ['no "## Known limitations" section'] }
  let count = 0
  for (const m of readme.slice(at).matchAll(POINTER)) {
    count++
    const [, file, line, symbol] = m
    const where = `${file}:${line}`
    if (symbol === undefined) {
      problems.push(`${where} names no symbol`)
      continue
    }
    let lines
    try {
      lines = read(join(file.includes('/') ? repo : baseDir, file)).split('\n')
    } catch (e) {
      problems.push(`${where} cannot be read: ${e.message}`)
      continue
    }
    const n = Number(line)
    if (n < 1 || n > lines.length) {
      problems.push(`${where} is outside the file (${lines.length} lines)`)
      continue
    }
    const word = new RegExp(`(?<![\\w$])${symbol.replaceAll('.', '\\.')}(?![\\w$])`)
    if (!lines.slice(n - 1, n + 2).some((l) => word.test(l)))
      problems.push(`${where} does not point at ${symbol}: "${lines[n - 1].trim().slice(0, 60)}"`)
  }
  return { count, problems }
}
