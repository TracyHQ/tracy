/**
 * Append-only JSONL journals for the daily QA run. Every line is fsync'd before the call returns.
 * Every outside effect (Docker, GitHub, git push, a spawn) is preceded by an `intent` line and
 * followed by a `result` line; an intent without a result is "unknown" and must be checked against
 * its source of truth before being redone.
 *
 * Exports:
 *   appendLine(path: string, obj: object): void
 *   readLines(path: string): { lines: object[], torn: number }   // torn = unparsable lines skipped
 *   openJournal(path: string): {
 *     path: string,
 *     intent(key: string, data?: object): string,     // returns the intent id
 *     result(id: string, data?: object): void,
 *     append(t: string, data?: object): void,         // any other line type (e.g. 'orphan')
 *     lines(): object[],
 *     unknown(): object[],                            // intents without a result, oldest first
 *     resultOf(id: string): object | null,
 *   }
 *
 * Line shape: { t: 'intent' | 'result' | <other>, id?, key?, at: ISO string, ...data }.
 */
import { randomBytes } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  writeSync
} from 'node:fs'
import { dirname } from 'node:path'

/** Append one JSON line and fsync it. A torn previous line gets its own newline first. */
export function appendLine(path, obj) {
  mkdirSync(dirname(path), { recursive: true })
  const fd = openSync(path, 'a+')
  try {
    let prefix = ''
    const size = fstatSync(fd).size
    if (size > 0) {
      const last = Buffer.alloc(1)
      readSync(fd, last, 0, 1, size - 1)
      if (last[0] !== 0x0a) prefix = '\n'
    }
    writeSync(fd, `${prefix}${JSON.stringify(obj)}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

/** Read every parsable line. A line that does not parse (a writer died mid-line) is counted, not thrown. */
export function readLines(path) {
  if (!existsSync(path)) return { lines: [], torn: 0 }
  const lines = []
  let torn = 0
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (!raw.trim()) continue
    try {
      lines.push(JSON.parse(raw))
    } catch {
      torn++
    }
  }
  return { lines, torn }
}

export function openJournal(path) {
  const lines = () => readLines(path).lines
  return {
    path,
    intent(key, data = {}) {
      const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
      appendLine(path, { ...data, t: 'intent', id, key, at: new Date().toISOString() })
      return id
    },
    result(id, data = {}) {
      appendLine(path, { ...data, t: 'result', id, at: new Date().toISOString() })
    },
    append(t, data = {}) {
      appendLine(path, { ...data, t, at: new Date().toISOString() })
    },
    lines,
    unknown() {
      const all = lines()
      const done = new Set(all.filter((l) => l.t === 'result').map((l) => l.id))
      return all.filter((l) => l.t === 'intent' && !done.has(l.id))
    },
    resultOf(id) {
      return (
        lines()
          .filter((l) => l.t === 'result' && l.id === id)
          .at(-1) ?? null
      )
    }
  }
}
