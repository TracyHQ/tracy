/**
 * Design token gate: every `--dsw-*` Tracy code references must ACTUALLY exist in dsh.
 *
 * WHY A MACHINE, AND WHY THE EYE CANNOT SEE IT. The right way to write a token includes a fallback:
 * `var(--dsw-alias-brand-primary, #5b8def)`. That fallback keeps the UI intact when dsh changes — but it
 * also **hides a misspelled name**. With a wrong token name the browser quietly uses the fallback, the
 * screen looks normal, and that colour **stays put when the user switches light/dark or turns on a skin**.
 * No error, no warning, and reviewing by eye never finds it.
 *
 * MEASURED, NOT ASSUMED: on 2026-08-30 this gate (freshly written) immediately caught two spots in
 * `@tracy/dsh-chat-input` — `--dsw-alias-semantic-danger` and `--dsw-alias-semantic-warning`, two names
 * that do not exist. The real names are `state-error-primary` and `state-warn-primary`. They had been
 * there since the plugin was born, behind two very plausible red and orange fallbacks.
 *
 * THE SOURCE OF TRUTH is the installed `@deepseek-ai/dsh-client-ui-theme` — not a hand-copied list. A dsh
 * upgrade that drops a token turns the gate red right at the upgrade, not weeks later when someone happens
 * to switch theme.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

/** What is scanned: Tracy's own code. `node_modules` and generated bundles do not count. */
const SCAN_ROOTS = ['packages']
const SCAN_EXT = new Set(['.ts', '.tsx', '.css', '.js', '.mjs'])
const SKIP_DIR = new Set(['node_modules', 'lib', 'dist', '.git'])

const TOKEN = /--dsw-[a-z0-9-]+/g

/**
 * Every token dsh actually defines, read from the installed theme package.
 *
 * 🔒 Do NOT use `SKIP_DIR` here. That list skips `lib/` because for Tracy code `lib/` is a generated
 * bundle; but dsh's theme package ships EVERYTHING in `lib/`, so reusing it makes this function return
 * almost nothing — and with an empty token set every reference "does not exist", turning the gate into
 * a false-alarm machine. Tripped on exactly that once while writing it, 2026-08-30.
 */
function dshTokens(): Set<string> {
  const pkg = require.resolve('@deepseek-ai/dsh-client-ui-theme/package.json')
  const root = dirname(pkg)
  const found = new Set<string>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      for (const m of readFileSync(full, 'utf8').matchAll(TOKEN)) found.add(m[0])
    }
  }
  walk(root)
  if (found.size < 50) {
    console.error(
      `check-dsh-tokens: read only ${found.size} tokens from the theme package — the scan probably missed.\n` +
        `  An empty token set makes every reference "wrong", so stop here instead of reporting nonsense.`
    )
    process.exit(2)
  }
  return found
}

interface Use {
  readonly file: string
  readonly line: number
  readonly token: string
}

const uses: Use[] = []
const walkSource = (dir: string): void => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIR.has(entry)) walkSource(full)
      continue
    }
    if (!SCAN_EXT.has(extname(entry))) continue
    const lines = readFileSync(full, 'utf8').split('\n')
    lines.forEach((text, index) => {
      for (const m of text.matchAll(TOKEN)) {
        uses.push({ file: relative(ROOT, full), line: index + 1, token: m[0] })
      }
    })
  }
}
for (const root of SCAN_ROOTS) walkSource(join(ROOT, root))

const known = dshTokens()
const bad = uses.filter((u) => !known.has(u.token))

if (bad.length > 0) {
  console.error(`dsh token gate: ${bad.length} reference(s) to tokens that do not exist\n`)
  for (const u of bad) console.error(`  ${u.file}:${u.line}  ${u.token}`)
  console.error(
    `\n  dsh provides ${known.size} tokens. The fallback in \`var(…, #hex)\` hides a wrong name —\n` +
      `  the colour still shows but does NOT follow theme and skin. Look up the right name in\n` +
      `  \`node_modules/@deepseek-ai/dsh-client-ui-theme\`.`
  )
  process.exit(1)
}

/**
 * The second half of the same trap: the PLUGIN'S OWN variables that nobody declared.
 *
 * ⚠ MEASURED 01/09, caught by a person's eye, not by any gate. `tracy-add-site` used
 * `var(--tas-on-accent)` for the primary button's text colour; that variable **was never declared**. CSS
 * has no "undefined variable is an error" — a `var()` that does not resolve leaves the property unset,
 * so the button text took the inherited colour and **vanished on the blue background**. The button was
 * still there, still clickable, just unreadable. `DESIGN.md` §1.2 names this: a new token goes into
 * `tokens.css` IN THE SAME change; a `var(--tv-glass)` that does not exist resolves to NOTHING.
 *
 * The check is narrow and local: within ONE package, every `var(--<prefix>-…)` used must be declared
 * (`--<prefix>-…:`) somewhere in that same package. No cross-package lookup — the prefix belongs to the
 * package, and a variable crossing packages is a different matter to state, not for this gate to guess.
 */
const OWN_TOKEN = /var\(\s*(--(?:tas|tv|tui)-[a-z0-9-]+)/g
const OWN_DECL = /(--(?:tas|tv|tui)-[a-z0-9-]+)\s*:/g

const ownUses = new Map<string, Use[]>()
const ownDecls = new Map<string, Set<string>>()

const walkOwn = (pkgDir: string, dir: string): void => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIR.has(entry)) walkOwn(pkgDir, full)
      continue
    }
    if (!SCAN_EXT.has(extname(entry))) continue
    const lines = readFileSync(full, 'utf8').split('\n')
    lines.forEach((text, index) => {
      for (const m of text.matchAll(OWN_TOKEN)) {
        const list = ownUses.get(pkgDir) ?? []
        list.push({ file: relative(ROOT, full), line: index + 1, token: m[1] })
        ownUses.set(pkgDir, list)
      }
      for (const m of text.matchAll(OWN_DECL)) {
        const set = ownDecls.get(pkgDir) ?? new Set<string>()
        set.add(m[1])
        ownDecls.set(pkgDir, set)
      }
    })
  }
}

for (const root of SCAN_ROOTS) {
  const base = join(ROOT, root)
  for (const group of readdirSync(base)) {
    const groupDir = join(base, group)
    if (!statSync(groupDir).isDirectory() || SKIP_DIR.has(group)) continue
    for (const pkg of readdirSync(groupDir)) {
      const pkgDir = join(groupDir, pkg)
      if (!statSync(pkgDir).isDirectory() || SKIP_DIR.has(pkg)) continue
      walkOwn(pkgDir, pkgDir)
    }
  }
}

const orphans: Use[] = []
for (const [pkgDir, list] of ownUses) {
  const declared = ownDecls.get(pkgDir) ?? new Set<string>()
  for (const use of list) if (!declared.has(use.token)) orphans.push(use)
}

if (orphans.length > 0) {
  console.error(`Token gate: ${orphans.length} of the plugin's own variable(s) USED but never DECLARED\n`)
  for (const u of orphans) console.error(`  ${u.file}:${u.line}  ${u.token}`)
  console.error(
    `\n  A \`var()\` that does not resolve leaves the property unset — text colour vanishes,\n` +
      `  backgrounds turn transparent, and there is NO error. Declare the variable in the same package, or use an existing one.`
  )
  process.exit(1)
}

const distinct = new Set(uses.map((u) => u.token)).size
const ownCount = [...ownUses.values()].reduce((sum, list) => sum + list.length, 0)
console.log(
  `dsh token gate: ${uses.length} references, ${distinct} tokens, all exist. ` +
    `Plugin variables: ${ownCount} references, all declared.`
)
