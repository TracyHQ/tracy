/**
 * C7 guard (tasks/todo-account-menu.md): a person's avatar letter and colour are the SERVER's
 * (`personFace`, apps/tracy-web/src/lib/person-face.js, sent as `face` by /api/team, the comment
 * doors and /auth/me). Client code that derives them itself — initials from an email, a hash of a
 * name into a palette — draws the same person differently on two surfaces, which is the bug the
 * account-menu line removed. This test scans client code and fails on such a derivation.
 *
 * Scanned: packages/** /src/client/**, packages/core/tracy-core/src/**, packages/web/tracy-harness/
 * src/**, vendor/tracy/dsh-better-sidebar/src/client/**. Skipped: built output (lib/, dist/),
 * tests, stories, and packages/dev/tracy-design (throwaway mockups).
 *
 * NOT scanned: vendor/tracy/dsh-passwords/src/client/ (the whole fork is outside SCANNED; SKIPPED
 * repeats it so a wider glob cannot pull it in). Its chat.tsx `avatarColor` and card.tsx
 * `.dshpw-avatar` draw gateway accounts (`seatUsername`, a hash of email + site), not Tracy
 * accounts, and no customer surface shows them: the card lives in the `dsh-passwords` Settings
 * section that tracy-settings hides (HIDDEN_SECTIONS), and the chat bubble is off by default
 * (src/tracy/chat-entry.ts) with its only switch inside that hidden card. Checked 09/10/2026, see
 * the recorded-debt notes in tasks/todo-account-menu.md. If Tracy ever opens that chat to customers, the
 * server sends `face` and this exclusion goes.
 *
 * Detection is deliberately narrow (comments are stripped first):
 *   - helper: a function / const named like a face helper (`initialsOf`, `fallbackInitial`,
 *     `letterOf`, `avatarColor`, `chipNameColour`, `nameColour`…);
 *   - first-char: the first one or two characters taken from something named like a person
 *     (email, name, username, author, address…) — `.charAt(0)`, `.slice(0, 2)`, `[0].toUpperCase()`,
 *     `Array.from(name)[0]`, `const [first] = email`;
 *   - jsx-letter: a first character rendered straight into JSX (`{x.charAt(0)}`), whatever x is;
 *   - palette: a colour list indexed by a modulo (`COLOURS[hash % COLOURS.length]`), or a hue
 *     computed from a hash.
 * An allowed hit needs an ALLOWED entry with its reason; an entry that no longer matches anything
 * fails too, so the list cannot rot.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))

const SCANNED = [
  'packages/**/src/client/**',
  'packages/core/tracy-core/src/**',
  'packages/web/tracy-harness/src/**',
  'vendor/tracy/dsh-better-sidebar/src/client/**'
]
const CODE = /\.(?:[cm]?[jt]sx?)$/
const SKIPPED =
  /(?:^|\/)(?:lib|dist|test|tests|__tests__|node_modules)\/|\.(?:test|spec|stories)\.[^/]+$|^packages\/dev\/tracy-design\/|^vendor\/tracy\/dsh-passwords\//

/**
 * Hits that are allowed, by file and rule, each with why it is not a person's face derived on the
 * client. `match` must occur in the hit's line.
 */
const ALLOWED = [
  {
    file: 'packages/core/tracy-core/src/team/address-face.mjs',
    rule: 'first-char',
    match: 'address',
    reason: 'the ONE client letter: an address no account backs, on neutral grey (no colour guessed)'
  },
  {
    file: 'vendor/tracy/dsh-better-sidebar/src/client/face.tsx',
    rule: 'helper',
    match: 'fallbackInitial',
    reason: "fork mirror of the server's letter rule, used only when the server sent no face"
  },
  {
    file: 'packages/ui/tracy-model-plan/src/client/vendor-marks.tsx',
    rule: 'first-char',
    match: 'Array.from(name.trim())[0]',
    reason: "a vendor's logo letter (Claude, ChatGPT…), not a person"
  },
  {
    file: 'packages/ui/tracy-onboard/src/client/AccountStep.tsx',
    rule: 'first-char',
    match: 'name.charAt(0)',
    reason: "the first-run screen's letter for a vendor with no mark (Orca's AgentLetterIcon), not a person"
  },
  {
    file: 'packages/ui/tracy-onboard/src/client/AccountStep.tsx',
    rule: 'jsx-letter',
    match: 'name.charAt(0)',
    reason: 'the same vendor letter, seen by the JSX rule'
  },
  {
    file: 'packages/ui/tracy-model-plan/src/client/AccountsPane.tsx',
    rule: 'first-char',
    match: 'Array.from(name.trim())[0]',
    reason:
      'Settings › AI accounts draws the same vendor letter as the first-run screen (shared cards, #1198), not a person'
  },
  {
    file: 'packages/ui/tracy-model-plan/src/client/vendor-marks.tsx',
    rule: 'jsx-letter',
    match: 'Array.from(name.trim())[0]',
    reason: "a vendor's logo letter (Claude, ChatGPT…), not a person"
  },
  {
    file: 'packages/core/tracy-core/src/site-tabs/ActivityEventRow.tsx',
    rule: 'jsx-letter',
    match: 'by.cms.charAt(0)',
    reason: "a CMS's logo letter (WordPress, Joomla…), not a person"
  }
]

// ── detector ──────────────────────────────────────────────────────────────────────────────────

/** Comments blanked out (newlines kept, so line numbers hold). Strings are left alone. */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\'"`\w])\/\/.*$/gm, (_, lead) => lead)
}

/** A name that holds a person: the last segment of an identifier chain. */
const PERSON = String.raw`(?:e?mail|emailAddress|address|name|displayName|display_name|fullName|firstName|lastName|username|userName|login|author|person|user|who|handle)`
/** `email`, `seat.email`, `me?.name`, optionally trimmed or lower-cased first. */
const PERSON_REF = String.raw`\b(?:[\w$]+(?:\?\.|\.))*${PERSON}\b(?:\s*(?:\?\.|\.)\s*(?:trim|toLowerCase|toUpperCase|normalize)\(\))?`
/** Names of a helper that makes a face: `initialsOf`, `fallbackInitial`, `letterOf`, `avatarColor`… */
const HELPER = String.raw`(?:initials?(?:Of|For|From)?|[a-z][\w$]*Initials?(?:Of|For|From)?|letterOf[\w$]*|(?:avatar|name|chipName|email|user)Colou?r[\w$]*)`
const UPPER = String.raw`\s*(?:\?\.|\.)\s*(?:toUpperCase|toLocaleUpperCase)\(`

const RULES = [
  {
    rule: 'helper',
    re: new RegExp(
      String.raw`\b(?:function\s*\*?\s*${HELPER}\s*[(<]|(?:const|let|var)\s+${HELPER}\s*(?::[^=]*)?=\s*(?:async\s*)?(?:function\b|\(|[\w$]+\s*=>))`
    )
  },
  {
    rule: 'first-char',
    re: new RegExp(
      [
        String.raw`${PERSON_REF}\s*(?:\?\.|\.)\s*(?:charAt|at|codePointAt)\(\s*0\s*\)`,
        String.raw`${PERSON_REF}\s*(?:\?\.|\.)\s*(?:slice|substring|substr)\(\s*0\s*,\s*[12]\s*\)`,
        String.raw`${PERSON_REF}\s*(?:\?\.)?\[\s*0\s*\](?:\s*(?:\?\.)?\[\s*0\s*\]|${UPPER})`,
        String.raw`(?:Array\.from\(|\[\s*\.\.\.)\s*${PERSON_REF}[^)\]]*[)\]]\s*(?:\?\.)?\[\s*0\s*\]`,
        String.raw`\b(?:const|let|var)\s*\[\s*[\w$]+\s*(?:=\s*[^\],]*)?\]\s*=\s*[^;\n]*${PERSON_REF}`
      ].join('|')
    )
  },
  {
    rule: 'jsx-letter',
    tsxOnly: true,
    re: new RegExp(
      String.raw`(?:\.charAt\(\s*0\s*\)|\.slice\(\s*0\s*,\s*[12]\s*\)|(?:Array\.from\((?:[^()]|\([^()]*\))*\)|\[\s*\.\.\.[^\]]*\])\s*(?:\?\.)?\[\s*0\s*\])(?:${UPPER}\))?\s*[}:]`
    )
  },
  {
    rule: 'palette',
    re: /\b\w*(?:COLOU?RS|PALETTE|[Pp]alette|Colou?rs)\w*\s*\[[^\]\n]*%|\bhsla?\(\s*\$\{[^}]*(?:hash|%)/
  }
]

/**
 * Every hit in one file's source.
 * @returns {{ file: string, line: number, rule: string, text: string }[]}
 */
export function findPersonFaceDerivations(file, source) {
  const hits = []
  const lines = stripComments(source).split('\n')
  lines.forEach((text, i) => {
    for (const { rule, re, tsxOnly } of RULES) {
      if (tsxOnly && !/\.[jt]sx$/.test(file)) continue
      if (re.test(text)) hits.push({ file, line: i + 1, rule, text: text.trim() })
    }
  })
  return hits
}

function scannedFiles() {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...SCANNED.map((g) => `:(glob)${g}`)], {
    cwd: ROOT,
    encoding: 'utf8'
  })
  return out.split('\0').filter((f) => f && CODE.test(f) && !SKIPPED.test(f))
}

const isAllowed = (hit) =>
  ALLOWED.some((a) => a.file === hit.file && a.rule === hit.rule && hit.text.includes(a.match))

// ── the detector on known shapes ─────────────────────────────────────────────────────────────

test('catches the shapes the account-menu line removed', () => {
  const caught = (src, file = 'x.tsx') => findPersonFaceDerivations(file, src).map((h) => h.rule)
  // packages/web/tracy-harness/src/App.tsx before 47f329b7bf
  assert.ok(
    caught(`function initialsOf(email: string): string {
  const [name = ''] = email.split('@')
  const letters = parts.length > 1 ? \`\${parts[0][0]}\${parts[1][0]}\` : name.slice(0, 2)
}`).includes('helper')
  )
  assert.deepEqual(caught('const letters = name.slice(0, 2)'), ['first-char'])
  assert.deepEqual(caught('const l = seat.email.charAt(0).toUpperCase()', 'x.ts'), ['first-char'])
  assert.deepEqual(caught('const l = me?.email?.[0]?.toUpperCase()', 'x.ts'), ['first-char'])
  assert.deepEqual(caught("const [first = '?'] = author.trim()", 'x.ts'), ['first-char'])
  assert.deepEqual(caught('<span>{email.slice(0, 1)}</span>'), ['first-char', 'jsx-letter'])
  // packages/ui/tracy-chat-input before a88276531b
  assert.deepEqual(caught('export function chipNameColour(name) {', 'x.mjs'), ['helper'])
  assert.deepEqual(caught('  return AUTHOR_COLOURS[hash % AUTHOR_COLOURS.length]', 'x.mjs'), ['palette'])
  assert.deepEqual(caught('const bg = `hsl(${hash % 360} 60% 50%)`', 'x.ts'), ['palette'])
  // vendor/tracy/dsh-passwords chat.tsx (out of scope, but the shape is caught)
  assert.ok(caught('function avatarColor(name: string): string {').includes('helper'))
})

test('leaves alone first characters that are not a person', () => {
  const quiet = (src, file = 'x.ts') => assert.deepEqual(findPersonFaceDerivations(file, src), [], src)
  quiet('return id.charAt(0).toUpperCase() + id.slice(1)')
  quiet("const ext = name.slice(dot + 1).replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase()")
  quiet('const first = users[0]')
  quiet('const xfo = probe.xFrameOptions?.trim().toUpperCase()')
  quiet('// the old initialsOf(email) took email.slice(0, 2)')
  quiet('/* AUTHOR_COLOURS[hash % AUTHOR_COLOURS.length] */')
  quiet('<Face face={me.face ?? NO_FACE} size={32} />', 'x.tsx')
})

// ── the repository ────────────────────────────────────────────────────────────────────────────

const HITS = scannedFiles().flatMap((file) =>
  findPersonFaceDerivations(file, readFileSync(path.join(ROOT, file), 'utf8'))
)

test('client code takes no person letter or colour itself — the server face is the only one', () => {
  const found = HITS.filter((h) => !isAllowed(h))
  assert.deepEqual(
    found.map((h) => `${h.file}:${h.line} [${h.rule}] ${h.text}`),
    [],
    'Draw a person with the server face (`face` from /api/team, /auth/me, comment doors) through ' +
      '`Face` of @tracy/core/team/face; an address with no account takes `addressFace`. A letter ' +
      'that is not a person (a vendor or CMS logo) goes into ALLOWED with its reason.'
  )
})

test('every allowed entry still matches a hit', () => {
  const stale = ALLOWED.filter(
    (a) => !HITS.some((h) => h.file === a.file && h.rule === a.rule && h.text.includes(a.match))
  )
  assert.deepEqual(stale, [], 'remove allowed entries whose code is gone')
})
