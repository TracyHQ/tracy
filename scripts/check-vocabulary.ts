/**
 * Vocabulary gate: the words `docs/references/vocabulary.md` §4 "Do NOT use" has retired.
 *
 * WHY A MACHINE, NOT A READER. Exactly the failure that document records: two invented i18n
 * namespaces (`workbench`, `frame`) entered the repo and lived a full day, then spread into the README,
 * CLAUDE.md, two ADRs and a folder name, until the product owner read their own docs and could not tell
 * what they were about. Nobody coins a word with bad intent — they just needed a name and no rule made
 * them stop and ask. A reviewer does not catch this kind of mistake, because a coined word still reads
 * smoothly. `CLAUDE.md` says it plainly: give it to a regex, not to a reader.
 *
 * 🔒 DELIBERATELY NARROW SCOPE: **code, not prose.** Only `.ts/.tsx/.js/.jsx/.mjs/.css`,
 * and every comment line is skipped.
 *
 * (That scope is the BANNED tier's. The COINED tier and the closed package list further down read
 * prose too, for a reason written there.)
 *
 * The first version also scanned `.md` and comments and found 47 violations — almost all of them
 * MENTIONED the word rather than USED it: a README discussing the vocabulary table itself, comments
 * explaining why a word was retired, and a third-party package name (`dsh-github-workbench`). A gate
 * that fires at the discussion of itself gets exceptions added first, and enough of them make it meaningless.
 *
 * The real risk the document records is NAMING: a namespace, a group, a page folder, a display
 * label. Those live in code, not prose. Prose in a private repo is caught by reading; a
 * `group: 'Workbench'` slipping into a registry is not.
 *
 * HOW IT MATCHES: by WORD BOUNDARY, not substring. `Frame` is banned; `iframe`,
 * `requestAnimationFrame`, `frameBorder` are not — they are browser APIs, not words someone coined.
 * Flagging an API by mistake is the fastest way to get exceptions added until the gate means nothing.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'
import { COINED as COINED_WORDS } from './lib/coined-words.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Scanned folders: where TCH writes its own code. */
const SCAN_DIRS = ['apps', 'packages', 'scripts'] as const

/**
 * Folders skipped inside the scanned area.
 *
 * `lib` and `dist` are build output — they embed other people's code (Tailwind, React), so a
 * match there says nothing about the words TCH chose.
 */
const SKIP = new Set(['node_modules', 'lib', 'dist', '.git', 'coverage'])

/** Extensions that carry IDENTIFIERS and DISPLAY STRINGS — see the scope note at the top. */
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css']

/**
 * A comment line, recognised by its leading characters.
 *
 * Approximate, on purpose: a full parser for six extensions is far more machinery than what it
 * protects. What slips through is a trailing comment (`const x = 1 // Workbench`) — rare, and
 * harmless for the reason given at the top.
 * @param text - one raw line.
 * @returns True when the line is a comment.
 */
function isComment(text: string): boolean {
  const trimmed = text.trimStart()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

/** A retired word, with its replacement so the message says what to do. */
interface Banned {
  /** The banned word, matched on word boundaries, case-insensitive. */
  readonly word: string
  /** The pointer printed right under the violation. */
  readonly instead: string
}

/**
 * §4 "Do NOT use" of `docs/references/vocabulary.md`.
 *
 * Add a word here and add it to the doc too — a gate and a doc that disagree are a sure way for
 * people to trust the wrong one.
 */
const BANNED: readonly Banned[] = [
  { word: 'Workbench', instead: 'the working screen on one site (keys under `site.*`)' },
  { word: 'Creator mode', instead: 'Permission mode' },
  { word: 'Session log', instead: 'History / Session information' },
  { word: 'Workspace Write', instead: 'the toolset name in §Permissions' },
  { word: 'Agent preset', instead: 'Provider presets' },
  // The plural is its own row because a row is matched between word boundaries: "Agent presets", the
  // form a nav label takes, passed the row above until #807.
  { word: 'Agent presets', instead: 'Provider presets' },
  // Changed 07/09/2026 (ADR 0014). The two-word phrase, not bare `direction`: that word belongs to the
  // platform (`flex-direction`, `direction: rtl`) and `.css` is in EXTENSIONS — same reason as "Frame" below.
  { word: 'Design direction', instead: 'Design template' },
  { word: 'Design directions', instead: 'Design templates' }
]

/* 🔒 "Frame" IS BANNED IN THE DOC BUT DELIBERATELY NOT IN THE TABLE ABOVE.
   ("Frame" on this line is a mention, not a use.)

   It collides head-on with existing platform terms, not a word someone coined:
   `requestAnimationFrame`, `HTMLIFrameElement`, CDP frames, and the `[class*="frame"]` that
   `@tracy/dsh-chat-input` uses to match dsh's OWN CLASS — a third-party identifier that must stay
   verbatim. Measured 30/08: switched on, 3 of 9 hits were of that kind, and no writable rule tells
   "app-shell Frame" from "browser frame" without listing every API.

   A gate that is noisy exactly where it most needs to be right is a gate people learn to silence. So
   this rule stays with the reader: `docs/references/vocabulary.md` still bans it, and its enforcement
   note says plainly that this word has NO machine guard. Naming a gap beats pretending it is closed.

   The other words have no such problem: the multi-word phrases almost cannot match by accident, and
   "Workbench" is a pure coinage. */

/** One match. */
interface Violation {
  readonly file: string
  readonly line: number
  readonly word: string
  readonly instead: string
  readonly text: string
}

/**
 * Compiles a banned word into a word-boundary regex.
 *
 * `\b` on both ends is what separates `Frame` from `iframe` and `requestAnimationFrame`: in
 * `requestAnimationFrame` the `Frame` follows `n`, a word character, so there is no boundary there.
 * @param word - the banned word.
 * @returns A regex matching exactly that word, case-insensitive, over the whole line.
 */
function wordPattern(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'giu')
}

const PATTERNS = BANNED.map((entry) => ({ ...entry, pattern: wordPattern(entry.word) }))

/**
 * Walks the tree and collects every file to scan.
 * @param dir - starting folder.
 * @param out - where results are collected.
 */
function walk(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full)
  }
}

const files: string[] = []
for (const dir of SCAN_DIRS) walk(join(ROOT, dir), files)

// The gate does not scan itself: the BANNED table has to spell out the very words it bans, so every
// row would be a violation. Excluded here, not with `vocabulary-allow` scattered six times.
const SELF = join(ROOT, 'scripts', 'check-vocabulary.ts')

// The Welcome popup's animated scenes (`apps/tracy-web/src/welcome/route.js`): a static demo copied
// as it is from the approved prototype, whose words are pictures of the app (a fake `fernway.tracy.ai`,
// the design system library's own names such as "André Cândido"), not strings Tracy shows as its own.
// Exactly that folder; the popup's real copy is `packages/ui/tracy-onboard/src/client/strings.ts`.
const WELCOME_SCENES = join(ROOT, 'apps', 'tracy-web', 'src', 'welcome', 'scenes')

const violations: Violation[] = []
for (const file of files) {
  if (file === SELF) continue
  if (file.startsWith(`${WELCOME_SCENES}/`)) continue
  const rel = relative(ROOT, file)
  const lines = readFileSync(file, 'utf8').split('\n')
  for (const [index, text] of lines.entries()) {
    // Comments MENTION a word, they do not name things with it — see the scope note.
    if (isComment(text)) continue
    // Last-resort escape for a code line that must carry the word (e.g. matching a third-party
    // identifier). Rare; needing it often means the rule is wrong, not the code.
    if (text.includes('vocabulary-allow')) continue
    for (const entry of PATTERNS) {
      entry.pattern.lastIndex = 0
      if (!entry.pattern.test(text)) continue
      violations.push({
        file: rel,
        line: index + 1,
        word: entry.word,
        instead: entry.instead,
        text: text.trim().slice(0, 100)
      })
    }
  }
}

/*
 * Second tier: names coined for something that already had a name. Unlike BANNED above, the
 * risk here is not a label but a way of thinking — an agent reads the coined word in code and
 * repeats it everywhere (vocabulary.md §5: "receiver" came back three times after being banned).
 * So this tier also reads comments and the docs agents read, and matches the word inside
 * identifiers (`receiverFloor`), because a new identifier is exactly how the word spreads.
 * A line that must keep the word (reading a key already in published data, a third-party name)
 * carries `vocabulary-allow`, which doubles as the "legacy, do not copy" label for the reader.
 */
const COINED: readonly Banned[] = COINED_WORDS

/** Tracked files the coined tier reads: code with its comments, plus docs agents act on. */
const COINED_PATHS = [
  // The change journal is printed at every session start (`pnpm journal`): an agent reads it before
  // any rule, so a coined word there comes straight back.
  'changes',
  'tasks/nhat-ky',
  'apps',
  'packages',
  'scripts',
  'docs',
  '.agents/skills',
  'CLAUDE.md',
  'CONTEXT.md',
  'DESIGN.md'
]

/** ADRs are decision records and must be able to quote the word they retire. */
const COINED_EXCLUDED = [
  'docs/adr/',
  'docs/references/vocabulary.md',
  'scripts/check-vocabulary.ts',
  'scripts/lib/coined-words.mjs',
  // Becomes the root SYSTEM.md in the public export, and the root SYSTEM.md is outside COINED_SCOPE.
  'scripts/opensource/overlay/SYSTEM.md'
]

/**
 * Files git would commit: `.agents/skills/` also holds gitignored machine-local skills that are not
 * the repo's, while a new file not yet added must still be read.
 * @returns repo-relative paths the coined tier scans.
 */
function coinedFiles(): string[] {
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...COINED_PATHS],
    {
      cwd: ROOT,
      encoding: 'utf8',
      // The tracked tree's path list already passes the 1 MiB default buffer; give it room to grow.
      maxBuffer: 64 * 1024 * 1024
    }
  )
  return listed
    .split('\0')
    .filter(Boolean)
    .filter((file) => [...EXTENSIONS, '.md'].some((ext) => file.endsWith(ext)))
    .filter((file) => !file.split('/').some((part) => SKIP.has(part)))
    .filter((file) => !COINED_EXCLUDED.some((excluded) => file.startsWith(excluded)))
}

const coinedPatterns = COINED.map((entry) => ({
  ...entry,
  pattern: new RegExp(entry.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu')
}))

const coinedFileList = coinedFiles()
for (const rel of coinedFileList) {
  let lines: string[]
  try {
    lines = readFileSync(join(ROOT, rel), 'utf8').split('\n')
  } catch {
    continue
  }
  for (const [index, text] of lines.entries()) {
    if (text.includes('vocabulary-allow')) continue
    for (const entry of coinedPatterns) {
      if (!entry.pattern.test(text)) continue
      violations.push({
        file: rel,
        line: index + 1,
        word: entry.word,
        instead: entry.instead,
        text: text.trim().slice(0, 100)
      })
    }
  }
}

/*
 * Third check: package names are a closed list. A package is where a concept gets a name that
 * every import, bundle id and doc then repeats, so a new one must be added to vocabulary.md §9
 * first — the list is the place a reviewer sees the new word before it spreads.
 */
const VOCABULARY_DOC = join(ROOT, 'docs', 'references', 'vocabulary.md')
const PACKAGE_LIST_HEADING = '## 9.'

/**
 * Reads the fenced block under §9 of vocabulary.md.
 * @returns declared package names, or null when the section or its block is missing.
 */
function declaredPackages(): Set<string> | null {
  const doc = readFileSync(VOCABULARY_DOC, 'utf8')
  const start = doc.indexOf(`\n${PACKAGE_LIST_HEADING}`)
  if (start === -1) return null
  const fence = doc.slice(start).match(/```text\n([\s\S]*?)```/)
  if (!fence) return null
  return new Set(
    fence[1]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  )
}

const packageErrors: string[] = []
const declared = declaredPackages()
if (declared === null) {
  packageErrors.push(
    `docs/references/vocabulary.md has no "${PACKAGE_LIST_HEADING}" section with a \`\`\`text block of package names.`
  )
} else {
  const manifests = execFileSync(
    'git',
    ['ls-files', '-z', '--', 'apps/*/package.json', 'packages/*/*/package.json'],
    { cwd: ROOT, encoding: 'utf8' }
  )
    .split('\0')
    .filter((file) => /^(apps\/[^/]+|packages\/[^/]+\/[^/]+)\/package\.json$/.test(file))
  const actual = new Map<string, string>()
  for (const manifest of manifests) {
    const name = (JSON.parse(readFileSync(join(ROOT, manifest), 'utf8')) as { name?: string }).name
    if (name) actual.set(name, manifest)
  }
  for (const [name, manifest] of actual) {
    if (!declared.has(name)) {
      packageErrors.push(
        `${manifest}  package "${name}" is not in vocabulary.md §9. Add it there in the same change, through a PR, or reuse an existing package.`
      )
    }
  }
  for (const name of declared) {
    if (!actual.has(name)) {
      packageErrors.push(`vocabulary.md §9 lists "${name}", which no package carries any more — remove it.`)
    }
  }
}

if (packageErrors.length > 0) {
  process.stderr.write(`Vocabulary gate: package names\n\n`)
  for (const error of packageErrors) process.stderr.write(`  ${error}\n`)
  process.stderr.write('\n')
}

if (violations.length > 0) {
  process.stderr.write(`Vocabulary gate: ${violations.length} violation(s)\n\n`)
  for (const v of violations) {
    process.stderr.write(`  ${v.file}:${v.line}  "${v.word}" — use ${v.instead}\n`)
    process.stderr.write(`    ${v.text}\n`)
  }
  process.stderr.write('\n  Full table: docs/references/vocabulary.md §4 "Do NOT use".\n')
  process.stderr.write(
    '  If the word sits in a note EXPLAINING this rule itself, add' +
      ' `vocabulary-allow` at the end of the line.\n' +
      '  A line that reads a key already in published data carries `vocabulary-allow` too;' +
      ' new code uses the new name.\n'
  )
}

if (violations.length > 0 || packageErrors.length > 0) process.exit(1)

process.stdout.write(
  `Vocabulary gate: ${files.length} files, ${BANNED.length} retired words, clean. ` +
    `Coined words: ${coinedFileList.length} files, clean. Packages: ${declared?.size} declared, all match.\n`
)
