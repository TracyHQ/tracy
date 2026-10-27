#!/usr/bin/env node
/**
 * Public-leak gate. Making a repository public exposes every commit it ever had, so this runs on every file and on
 * every pushed commit, from the first one: Vietnamese text, internal names and hosts, people's names, private or
 * server IP addresses, and secrets.
 *
 *   node scripts/check-public.mjs                      tracked + untracked-not-ignored files of this package
 *   node scripts/check-public.mjs --root <dir>         the same for another git checkout
 *   node scripts/check-public.mjs --history <range>    every added line and commit message in a git range
 *   node scripts/check-public.mjs --dir <dir>          a plain folder, e.g. an unpacked `npm pack`
 *   --allow <file>                                     allowlist (default: <root>/scripts/check-public.allow)
 *
 * Allowlist lines: `<path glob> | <rule or *> | <exact match or *> | <reason>`. A reason is required; in a full tree
 * scan an entry that matches nothing is stale and fails the run. Exit 1 on any finding.
 *
 * Literals the rules look for are assembled from fragments so this file does not flag itself.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const w = (...parts) => parts.join('')

// Letters only Vietnamese uses: a-breve, d-stroke, o-horn, u-horn and the tone-marked block U+1EA0-U+1EF9. Accents
// shared with French, Spanish or German (`é, à, ñ, ü`) are left alone so third-party names in other languages pass.
const VIETNAMESE = new RegExp(
  '[\\u0102\\u0103\\u0110\\u0111\\u01A0\\u01A1\\u01AF\\u01B0\\u1EA0-\\u1EF9]',
  'g'
)

const PEOPLE = [
  'Le' + 'e',
  'Bri' + 'an',
  'Da' + 'vid',
  'Ha' + 'no',
  'Ak' + 'emi',
  'Lu' + 'cas',
  'Vin' + 'cent'
]
const HANDLES = ['davidd' + '-lgtm', 'akemi' + '0x', 'obfine' + 'tune', 'lee' + 'knows[a-z]*']
const HOSTS = ['mac' + 'studio', 'mac' + 'mini', 'i' + 'mac']
const J_ALIASES = [
  'general-demo',
  'newsletter',
  'download',
  'general',
  'static',
  'shape5',
  'ja-demo',
  'misc',
  'ecosys'
]

/** @type {{ rule: string, re: RegExp, keep?: (m: RegExpExecArray) => boolean, message: string }[]} */
const RULES = [
  { rule: 'vietnamese', re: VIETNAMESE, message: 'Vietnamese text; public surfaces are English' },
  { rule: 'internal-name', re: new RegExp(w('joom', 'lart'), 'gi'), message: 'internal company name' },
  {
    rule: 'internal-name',
    re: new RegExp(w('\\btracy\\.', 'test\\b|\\b(?:[a-z0-9-]+\\.)*tracy\\.', 'site\\b'), 'gi'),
    message: 'internal Tracy domain (only tracy.ai is public)'
  },
  {
    rule: 'internal-name',
    re: new RegExp(w('\\btracy', 'hq/tch(?![\\w-])'), 'gi'),
    message: 'private repository'
  },
  {
    rule: 'internal-name',
    re: new RegExp(w('(?<![\\w./-])ta', 'sks/[\\w.-]+'), 'g'),
    message: 'internal tasks/ path'
  },
  {
    rule: 'internal-name',
    re: new RegExp(w('/Us', 'ers/[A-Za-z][\\w.-]*'), 'g'),
    message: 'a machine home path'
  },
  {
    rule: 'internal-host',
    re: new RegExp(`\\b(?:${HOSTS.join('|')})(?:-wifi)?\\b`, 'gi'),
    message: 'internal host alias'
  },
  {
    rule: 'internal-host',
    re: new RegExp(
      `\\bj-(?:${J_ALIASES.join('|')})\\b|\\bcon${'tabo'}\\d\\b|\\btracy-${'fleet'}-\\d+\\b`,
      'g'
    ),
    message: 'internal server alias'
  },
  { rule: 'person', re: new RegExp(`\\b(?:${PEOPLE.join('|')})\\b`, 'g'), message: 'a team member name' },
  { rule: 'person', re: new RegExp(`\\b(?:${HANDLES.join('|')})\\b`, 'gi'), message: 'a team member handle' },
  {
    rule: 'secret',
    re: new RegExp(
      [
        '\\b(?:AK' + 'IA|AS' + 'IA)[0-9A-Z]{16}\\b',
        '\\bgh[pousr]' + '_[A-Za-z0-9]{36,}',
        '\\bgithub' + '_pat_[A-Za-z0-9_]{50,}',
        '\\bAI' + 'za[0-9A-Za-z_-]{35}',
        '\\b[rs]k' + '_live_[0-9A-Za-z]{16,}',
        '\\bxox[abprs]' + '-[0-9A-Za-z-]{10,}',
        '\\bsk-' + 'ant-[0-9A-Za-z_-]{20,}',
        '\\bsk-(?:proj-)?' + '[A-Za-z0-9_-]{32,}',
        '-----BEGIN (?:[A-Z]+ )*PRIV' + 'ATE KEY-----'
      ].join('|'),
      'g'
    ),
    message: 'a credential shape'
  },
  {
    rule: 'high-entropy',
    re: /(?<![A-Za-z0-9_+=-])[A-Za-z0-9_+-]{24,}={0,2}(?![A-Za-z0-9_+=-])/g,
    keep: (m) => looksRandom(m[0]),
    message: 'a high-entropy string that looks like a key'
  },
  {
    rule: 'ip',
    re: /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?!\d|\.\d)/g,
    message: ''
  }
]

const SECRET_FILE =
  /(?:^|\/)(?:\.env(?:\.(?!example$|sample$|template$)[\w.-]+)?|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:pem|p12|pfx|key))$/

/** Shannon entropy in bits per character. */
function entropy(s) {
  const counts = new Map()
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1)
  let h = 0
  for (const n of counts.values()) h -= (n / s.length) * Math.log2(n / s.length)
  return h
}

// Public identifiers that third-party pages print: Facebook post ids, YouTube channel ids, TikTok user ids, Google place ids.
const PUBLIC_ID = /^(?:pfbid0[\w]+|U[CU][\w-]{22}|MS4wLjABAAAA[\w-]+|ChIJ[\w-]{20,})$/

/** Mixed case, a digit, and close to uniform over its alphabet: shapes of generated keys, not words or hex hashes. */
function looksRandom(s) {
  if (!/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/\d/.test(s)) return false
  if (PUBLIC_ID.test(s)) return false
  return entropy(s) >= 4.3
}

/** @returns {'private-ip' | 'public-ip' | null} */
function ipKind(ip) {
  const [a, b, c] = ip.split('.').map(Number)
  if (ip.endsWith('.0.0')) return null // a network or a version number (Chrome/141.0.0.0), not a host
  if (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
    return 'private-ip'
  if (a === 0 || a === 127 || a >= 224 || (a === 169 && b === 254)) return null
  if ((a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19))) return null // special-purpose blocks
  if (ip === '93.184.216.34') return null // example.com
  if (
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  )
    return null // documentation ranges
  if (['1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4', '9.9.9.9'].includes(ip)) return null // public resolvers
  return 'public-ip'
}

const REDACT = new Set(['secret', 'high-entropy'])

// npm writes a Subresource Integrity hash of every package it locks; that is a checksum, not a credential.
const LOCK_INTEGRITY = /^\s*"integrity": "sha(?:1|256|384|512)-[A-Za-z0-9+/]+={0,2}",?\s*$/

/**
 * Scan one file's text.
 * @param {string} path - path relative to the scanned root, with forward slashes.
 * @param {string} text - the file's contents.
 * @returns {{ path: string, line: number | null, rule: string, match: string, message: string }[]}
 */
export function scanText(path, text, line0 = 1) {
  const findings = []
  if (SECRET_FILE.test(path))
    findings.push({ path, line: 0, rule: 'secret-file', match: path, message: 'a secret file is tracked' })
  const lines = text.split('\n')
  lines.forEach((lineText, i) => {
    for (const { rule, re, keep, message } of RULES) {
      re.lastIndex = 0
      for (let m = re.exec(lineText); m; m = re.exec(lineText)) {
        if (keep && !keep(m)) continue
        if (rule === 'high-entropy' && LOCK_INTEGRITY.test(lineText)) continue
        if (rule === 'ip') {
          const kind = ipKind(m[0])
          if (kind)
            findings.push({
              path,
              line: line0 + i,
              rule: kind,
              match: m[0],
              message: `${kind === 'private-ip' ? 'a private' : 'a server'} IP address`
            })
          continue
        }
        findings.push({ path, line: line0 + i, rule, match: m[0], message })
      }
    }
  })
  return findings
}

// --- allowlist ---------------------------------------------------------------------------------

function globToRegExp(glob) {
  const body = glob
    .split('**')
    .map((part) =>
      part
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
    )
    .join('.*')
  return new RegExp(`^${body}$`)
}

/** @returns {{ entries: object[], errors: string[] }} */
export function readAllow(file) {
  const entries = []
  const errors = []
  if (!file || !existsSync(file)) return { entries, errors }
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((raw, i) => {
      const text = raw.trim()
      if (!text || text.startsWith('#')) return
      const parts = text.split(' | ').map((p) => p.trim())
      const [path, rule, match, reason] = parts
      if (parts.length !== 4 || !path || !rule || !match || !reason) {
        errors.push(
          `${file}:${i + 1} allowlist entry needs "<path> | <rule> | <match> | <reason>" with a reason`
        )
        return
      }
      entries.push({ line: i + 1, path, rule, match, reason, re: globToRegExp(path), used: 0 })
    })
  return { entries, errors }
}

function allowed(entries, f) {
  const hit = entries.find(
    (e) =>
      e.re.test(f.path) && (e.rule === '*' || e.rule === f.rule) && (e.match === '*' || e.match === f.match)
  )
  if (hit) hit.used += 1
  return Boolean(hit)
}

// --- sources -----------------------------------------------------------------------------------

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 30 })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`)
  return r.stdout
}

function readTextFile(abs) {
  const buf = readFileSync(abs)
  if (buf.subarray(0, 8000).includes(0)) return null // binary
  return buf.toString('utf8')
}

const ALLOW_PATH = 'scripts/check-public.allow'

/** The allowlist quotes what it allows; its match column is not scanned, its paths and reasons are. */
function maskAllow(text) {
  return text
    .split('\n')
    .map((line) => {
      const parts = line.split(' | ')
      return line.trim().startsWith('#') || parts.length !== 4
        ? line
        : [parts[0], parts[1], '*', parts[3]].join(' | ')
    })
    .join('\n')
}

/** Scan one file read from disk. */
function scanFile(name, abs) {
  const text = readTextFile(abs) ?? ''
  return scanText(name, name === ALLOW_PATH ? maskAllow(text) : text)
}

function scanTree(root) {
  const names = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'])
    .split('\0')
    .filter(Boolean)
  return [...new Set(names)].flatMap((name) => {
    const abs = join(root, name)
    if (!existsSync(abs) || !statSync(abs).isFile()) return []
    return scanFile(name, abs)
  })
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const abs = join(dir, d.name)
    if (d.isDirectory()) return d.name === 'node_modules' || d.name === '.git' ? [] : walk(abs)
    return d.isFile() ? [abs] : []
  })
}

function scanDir(dir) {
  return walk(dir).flatMap((abs) => {
    return scanFile(relative(dir, abs).split(sep).join('/'), abs)
  })
}

function scanHistory(root, range) {
  const shas = git(root, ['rev-list', '--reverse', range, '--', '.']).split('\n').filter(Boolean)
  const findings = []
  for (const sha of shas) {
    const short = sha.slice(0, 10)
    const message = git(root, ['log', '-1', '--format=%B', sha])
    for (const f of scanText(`${short} commit message`, message)) findings.push({ ...f, line: null })
    const patch = git(root, [
      'diff-tree',
      '-p',
      '-U0',
      '--no-color',
      '--no-renames',
      '--relative',
      '--root',
      '-m',
      '--first-parent',
      '-r',
      sha,
      '--',
      '.'
    ])
    let file = null
    let next = 0
    for (const line of patch.split('\n')) {
      if (line.startsWith('+++ ')) {
        file = line === '+++ /dev/null' ? null : line.slice(6)
        if (file) findings.push(...scanText(file, '').map((f) => ({ ...f, path: `${short}:${f.path}` })))
        continue
      }
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
      if (hunk) {
        next = Number(hunk[1])
        continue
      }
      if (file && line.startsWith('+')) {
        const added = file === ALLOW_PATH ? maskAllow(line.slice(1)) : line.slice(1)
        for (const f of scanText(file, added, next))
          if (f.rule !== 'secret-file') findings.push({ ...f, sha: short })
        next += 1
      }
    }
  }
  return findings
}

// --- cli ---------------------------------------------------------------------------------------

function option(argv, name) {
  const at = argv.indexOf(name)
  return at !== -1 && at + 1 < argv.length ? argv[at + 1] : null
}

function format(f) {
  const where = f.line === null ? f.path : `${f.sha ? `${f.sha}:` : ''}${f.path}:${f.line}`
  const shown = REDACT.has(f.rule) ? `${f.match.slice(0, 4)}…` : f.match
  return `${where} ${f.rule}: ${JSON.stringify(shown)} (${f.message})`
}

export function main(argv = process.argv.slice(2)) {
  const dir = option(argv, '--dir')
  const root = resolve(option(argv, '--root') ?? PACKAGE_ROOT)
  const range = option(argv, '--history')
  const allowFile =
    option(argv, '--allow') ?? join(dir ? PACKAGE_ROOT : root, 'scripts', 'check-public.allow')
  const { entries, errors } = readAllow(allowFile)

  const all = dir ? scanDir(resolve(dir)) : range ? scanHistory(root, range) : scanTree(root)
  // History paths carry a commit prefix only for added secret files; match allow globs on the file path itself.
  const findings = all.filter((f) => !allowed(entries, { ...f, path: f.path.replace(/^[0-9a-f]{10}:/, '') }))

  for (const f of findings) process.stdout.write(`${format(f)}\n`)
  if (!dir && !range) {
    for (const e of entries.filter((x) => x.used === 0))
      errors.push(
        `${relative(process.cwd(), allowFile) || allowFile}:${e.line} stale allowlist entry matches nothing: ${e.path} | ${e.rule} | ${e.match}`
      )
  }
  for (const e of errors) process.stdout.write(`${e}\n`)

  const what = dir
    ? `folder ${dir}`
    : range
      ? `history ${range}`
      : `tree ${relative(process.cwd(), root) || '.'}`
  if (findings.length || errors.length) {
    process.stdout.write(
      `check-public: ${findings.length} finding(s), ${errors.length} allowlist error(s) in ${what}\n`
    )
    return 1
  }
  process.stdout.write(`check-public: clean (${what})\n`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
