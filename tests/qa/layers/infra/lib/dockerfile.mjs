// A small Dockerfile reader for the infra layer: stages, COPY/ADD (flags, sources, destination),
// USER, RUN. It reports what it could not resolve instead of guessing.
import path from 'node:path'
import { readRegular } from './harness.mjs'

const ALIASES = new Map([
  ['root', '0'],
  ['www-data', '33']
])

/** Join continuation lines and drop comments/blank lines; returns [{line, text}]. */
export function logicalLines(source) {
  const out = []
  let buffer = ''
  let start = 0
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]
    if (buffer === '' && /^\s*(#.*)?$/.test(raw)) continue
    if (buffer !== '' && /^\s*#/.test(raw)) continue
    if (buffer === '') start = i + 1
    const stripped = raw.replace(/\s+$/, '')
    if (stripped.endsWith('\\')) {
      buffer += `${stripped.slice(0, -1)} `
      continue
    }
    buffer += stripped
    out.push({ line: start, text: buffer.trim() })
    buffer = ''
  }
  if (buffer !== '') out.push({ line: start, text: buffer.trim() })
  return out
}

function splitWords(text) {
  const words = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (const m of text.matchAll(re)) words.push(m[1] ?? m[2] ?? m[3])
  return words
}

export function parseDockerfile(source) {
  const stages = []
  const unresolved = []
  let current = null
  for (const { line, text } of logicalLines(source)) {
    const space = text.search(/\s/)
    const op = (space < 0 ? text : text.slice(0, space)).toUpperCase()
    const rest = space < 0 ? '' : text.slice(space + 1).trim()
    if (op === 'FROM') {
      const words = splitWords(rest.replace(/^--platform=\S+\s+/i, ''))
      const asAt = words.findIndex((w) => w.toUpperCase() === 'AS')
      current = {
        name: asAt >= 0 ? words[asAt + 1] : null,
        from: words[0],
        line,
        instructions: [],
        workdir: '/'
      }
      stages.push(current)
      continue
    }
    if (!current) {
      if (op !== 'ARG') unresolved.push({ line, why: `${op} before the first FROM` })
      continue
    }
    if (op === 'COPY' || op === 'ADD') {
      const flags = {}
      let words = splitWords(rest)
      if (rest.startsWith('[')) {
        unresolved.push({ line, why: `${op} in JSON form is not parsed` })
        continue
      }
      while (words[0]?.startsWith('--')) {
        const [k, ...v] = words.shift().slice(2).split('=')
        flags[k] = v.join('=')
      }
      if (rest.includes('<<')) {
        unresolved.push({ line, why: `${op} with a heredoc is not parsed` })
        continue
      }
      const dest = words.pop()
      const resolved = dest?.startsWith('/') ? dest : path.posix.join(current.workdir, dest ?? '')
      current.instructions.push({ op, line, flags, sources: words, dest, resolved })
      continue
    }
    if (op === 'USER') {
      current.instructions.push({ op, line, user: rest.split(':')[0] })
      continue
    }
    if (op === 'RUN') {
      current.instructions.push({ op, line, run: rest })
      continue
    }
    if (op === 'WORKDIR') {
      current.workdir = rest.startsWith('/') ? rest : path.posix.join(current.workdir, rest)
      current.instructions.push({ op, line, dir: rest })
    }
  }
  return { stages, unresolved }
}

export const readDockerfile = (file) => parseDockerfile(readRegular(file))

/** Any `chmod` in `run` that gives read to others: a symbolic mode with +r/=r or an octal mode whose last digit is >= 4. */
function chmodGrantsRead(run) {
  for (const m of run.matchAll(/\bchmod\s+((?:-[A-Za-z-]+\s+)*)(\S+)/g)) {
    const mode = m[2]
    if (/^[0-7]{3,4}$/.test(mode)) {
      if (Number(mode.slice(-1)) >= 4) return true
    } else if (grantsOtherRead(mode)) return true
  }
  return false
}

const uid = (user) => ALIASES.get(user) ?? user
/** `+x` alone does not add read: only a mode that grants read to others counts. */
const grantsOtherRead = (text) =>
  /(^|[\s,=])(a|o|go|ugo)?[+=][rwx]*r|(^|[\s,])a\+rX/.test(text) && !/^[+]x$/.test(text.trim())

/**
 * The effective runtime user of a stage: last USER, else the user of a local base stage. A chain that
 * ends at an external image with no USER yields `null`: the image's own USER is not in this file and
 * is not guessed (an image that is local can be probed, see the docker case).
 */
export function runtimeUser(stage, stages, seen = new Set()) {
  const users = stage.instructions.filter((i) => i.op === 'USER')
  if (users.length > 0) return users.at(-1).user
  const base = stages.find((s) => s.name && s.name === stage.from)
  if (base && !seen.has(base)) return runtimeUser(base, stages, seen.add(base))
  return null
}

/**
 * For a stage whose runtime user is not root: classify every COPY/ADD. Context-sourced copies
 * keep the source file's mode bits, so under a restrictive umask they are readable only through
 * a `--chown` to the runtime user, a `--chmod` granting other-read, or a later RUN that
 * chowns/chmods the destination (or a parent of it).
 */
export function analyzeStagePermissions(stage, stages) {
  const user = runtimeUser(stage, stages)
  const rows = []
  const copies = stage.instructions.filter((i) => i.op === 'COPY' || i.op === 'ADD')
  for (const copy of copies) {
    const sourceKind = copy.flags.from
      ? stages.some((s) => s.name === copy.flags.from) || /^\d+$/.test(copy.flags.from)
        ? 'stage'
        : 'image'
      : 'context'
    const row = {
      line: copy.line,
      dest: copy.resolved,
      source: sourceKind,
      runtimeUser: user,
      status: null,
      via: null
    }
    rows.push(row)
    if (user === null) {
      row.status = 'unknown'
      row.via = `the runtime USER comes from the external base image ${stage.from}, which this file does not state`
      continue
    }
    if (user === 'root' || uid(user) === '0') {
      row.status = 'covered'
      row.via = 'root-runtime'
      continue
    }
    if (copy.flags.chown !== undefined) {
      const owner = copy.flags.chown.split(':')[0]
      if (uid(owner) === uid(user)) {
        row.status = 'covered'
        row.via = '--chown to the runtime user'
      } else {
        row.status = 'open'
        row.via = `--chown to ${owner}, not the runtime user ${user}`
      }
      if (row.status === 'covered') continue
    }
    if (copy.flags.chmod !== undefined) {
      const mode = copy.flags.chmod
      const octal = /^[0-7]{3,4}$/.test(mode) ? Number(mode.slice(-1)) : null
      // BuildKit applies --chmod to directories too: read WITHOUT execute (4, 6) would remove traverse.
      if (
        (octal !== null && (octal === 5 || octal === 7)) ||
        /(^|[,=\s])[ao]?[+=][rwx]*r[rwx]*[xX]/.test(mode)
      ) {
        row.status = 'covered'
        row.via = '--chmod grants other read and traverse'
        continue
      }
    }
    const index = stage.instructions.indexOf(copy)
    const later = stage.instructions.slice(index + 1).filter((i) => i.op === 'RUN')
    const dest = copy.resolved.replace(/\/+$/, '')
    const fix = later.find((r) => {
      if (!/\b(chown|chmod)\b/.test(r.run)) return false
      const recursive =
        /\b(chown|chmod)\s+(-[a-zA-Z]*R|--recursive)/.test(r.run) ||
        /\bfind\b[^;&|]*-exec\s+(chown|chmod)/.test(r.run)
      const paths = r.run
        .split(/[\s"';&|]+/)
        .filter((t) => t.startsWith('/'))
        .map((t) => t.replace(/\/+$/, ''))
      const names = paths.some((p) => (recursive ? dest === p || dest.startsWith(`${p}/`) : dest === p))
      const ownsUser = r.run.includes(user) || r.run.includes(String(uid(user)))
      const chmodReads = /\bchmod\b/.test(r.run) && chmodGrantsRead(r.run)
      return names && (ownsUser || chmodReads)
    })
    if (fix) {
      // A RUN string is not proof: it may not run, may not reach every parent directory, may fail.
      row.status = 'unproven'
      row.via = `RUN at line ${fix.line} names this destination; its execution and the traverse permission of every parent directory are not proven here`
      continue
    }
    if (sourceKind === 'stage') {
      row.status = 'open'
      row.via = 'copied from another stage: its modes are not traced here'
      continue
    }
    row.status = 'open'
    row.via ??= 'no --chown/--chmod and no later RUN names this destination'
  }
  return { runtimeUser: user, rows }
}

/** Denominator id of one context-sourced COPY source of a Dockerfile (stable: no line numbers). */
export function dockerInputItemId(dockerfile, source) {
  return `dockerfile-input:${dockerfile}::${source.replace(/^\.\//, '')}`
}
