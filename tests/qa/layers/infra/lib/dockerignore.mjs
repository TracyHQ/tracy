// Docker's .dockerignore semantics, enough to decide whether a COPY source reaches the build
// context: patterns are relative to the context root, `!` re-includes, the LAST matching pattern
// wins, a pattern that matches a parent directory excludes everything beneath it.
import { existsSync } from 'node:fs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

function toRegex(pattern) {
  let out = ''
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        i += 1
        if (pattern[i + 1] === '/') {
          i += 1
          out += '(?:.*/)?'
        } else out += '.*'
      } else out += '[^/]*'
    } else if (ch === '?') out += '[^/]'
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`)
}

export function loadDockerignore(file) {
  if (!existsSync(file)) return []
  return readTextSync(file)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const negated = l.startsWith('!')
      const raw = (negated ? l.slice(1) : l).replace(/^\/+/, '').replace(/\/+$/, '')
      return { negated, regex: toRegex(raw), raw }
    })
}

/** Whether context-relative `rel` (no leading ./ or /) is excluded from the context. */
export function isIgnored(patterns, rel) {
  const parts = rel.split('/').filter(Boolean)
  let ignored = false
  for (const { negated, regex } of patterns) {
    let hit = false
    for (let n = 1; n <= parts.length; n += 1) {
      if (regex.test(parts.slice(0, n).join('/'))) {
        hit = true
        break
      }
    }
    if (hit) ignored = !negated
  }
  return ignored
}
