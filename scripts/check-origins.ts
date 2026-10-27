/**
 * Gate: a Tracy-domain address written into an app's `src/` or a plugin's `src/` must go through
 * `config.js` / `tracyConfig()` / a plugin's own bundle `Config` — never a bare literal.
 *
 * WHY. A hardcoded `https://cowork.tracy.ai` is right on production and wrong everywhere else, and
 * the failure is silent: a dev surface, a local stand or a customer's own domain quietly talks to
 * production instead of itself. Task 11 measured nine of those in two days, each one a different
 * shape of the same mistake. Every plugin and every app now has a real door to read the
 * deployment's own address from, so a literal is never a declarable exception here — it is always
 * a miss that should have gone through the door.
 *
 * ⚠ THE `workers/` HALF IS GONE (16/09/2026, with the tree). It had the opposite shape — an
 * explicit `ALLOWED` list, one entry per literal, each carrying its reason — precisely because
 * Worker code had no config door to route an address through. Nothing in `apps/` or `packages/`
 * needs that, and `git log -- scripts/check-origins.ts` holds the list if anyone needs to read what
 * the Workers were allowed to hardcode.
 *
 * WHAT COUNTS AS A HIT: a `https://…tracy.ai…` (or a bare `…tracy.ai` host) written as a string
 * literal in shipped code. Five structural exemptions are recognised, and they are shapes rather
 * than a list of blessed lines: a Storybook fixture, a GitHub reference, a bot identifier string, a
 * `placeholder=` example, and a documented default.
 *
 * ⚠ WHAT IT CANNOT SEE, SAID OUT LOUD SO NOBODY TRUSTS IT FURTHER THAN IT GOES. It reads STRING
 * LITERALS. Two of those nine bugs were not literals at all: `siteTeamUrl()` and the `/invite/`
 * route both called an already-parameterised helper and simply did not pass the origin, so the
 * production default applied. Nothing here would have flagged either. A green run means "no
 * hostname is written down", not "every surface points at its own deployment".
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The one literal this gate is looking for. See the header for why `cowork.|hooks.|seats.` are not here too. */
const PATTERN = /tracy\.ai|TracyHQ/

/** Package trees the brief's measurement covered. `apps/tracy-web`, then every `packages/<category>/<name>`. */
const TOP_DIRS = ['apps', 'packages']

/**
 * Excluded WHOLE trees, by name. `dev/tracy-design` is the visual bench (mode A, `DESIGN.md` §0):
 * every fixture in it is deliberately unreal.
 */
const EXCLUDED_PACKAGES = new Set(['dev/tracy-design'])

const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'])

/** `apps/<name>/src` and `packages/<category>/<name>/src` — never a package's `lib/`, `test/`, or `dist/`. */
function srcDirs(): string[] {
  const dirs: string[] = []
  for (const top of TOP_DIRS) {
    for (const entry of readdirSync(join(ROOT, top))) {
      const full = join(ROOT, top, entry)
      if (!statSync(full).isDirectory()) continue
      const direct = join(full, 'src')
      if (existsDir(direct)) {
        dirs.push(direct)
        continue
      }
      for (const sub of readdirSync(full)) {
        const rel = `${entry}/${sub}`
        if (EXCLUDED_PACKAGES.has(rel)) continue
        const src = join(full, sub, 'src')
        if (existsDir(src)) dirs.push(src)
      }
    }
  }
  return dirs
}

function existsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'storybook-static'])

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    const dot = entry.lastIndexOf('.')
    if (dot !== -1 && EXTENSIONS.has(entry.slice(dot))) out.push(full)
  }
}

function isTestFile(rel: string): boolean {
  return /\.test\.(?:ts|tsx|js|mjs)$/.test(rel) || rel.split('/').includes('test')
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (file.endsWith('.ts')) return ts.ScriptKind.TS
  return ts.ScriptKind.JS
}

interface Finding {
  file: string
  line: number
  value: string
}

interface LiteralNode {
  text: string
  pos: number
  node: ts.Node
}

/** Every string literal and template-literal segment — comments are never visited, by construction. */
function literals(source: ts.SourceFile): LiteralNode[] {
  const out: LiteralNode[] = []
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      out.push({ text: node.text, pos: node.getStart(source), node })
    } else if (ts.isTemplateExpression(node)) {
      out.push({ text: node.head.text, pos: node.head.getStart(source), node })
      for (const span of node.templateSpans) {
        out.push({ text: span.literal.text, pos: span.literal.getStart(source), node: span.literal })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return out
}

/** Header/const-name identity strings a bot's User-Agent carries — shown to a third party's server, not ours. */
const IDENTITY_HEADER_NAMES = new Set(['user-agent', 'http-referer', 'x-title'])
const IDENTITY_CONST_NAMES = new Set(['USER_AGENT', 'UA'])

/**
 * True only when the literal is DIRECTLY the value of a matching declaration or property — the
 * literal's own parent, nothing climbed past it. (Fix round 1: the first version climbed EVERY
 * ancestor and returned as soon as any one of them matched a name, which meant an unrelated field
 * merely nested somewhere inside a `const UA = {...}` escaped detection by riding along on the
 * object's own name — `const UA = { 'user-agent': x, other: 'https://tracy.ai/real-bug' }` would
 * have exempted `other` too. Checking only the immediate parent closes that: the property that
 * actually IS a header/const value is exempt, and nothing beside it is.)
 */
function isIdentityString(node: ts.Node): boolean {
  const parent = node.parent
  if (parent === undefined) return false
  if (ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isIdentifier(parent.name)) {
    return IDENTITY_CONST_NAMES.has(parent.name.text)
  }
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    const key = parent.name
    const keyText = ts.isStringLiteral(key) || ts.isIdentifier(key) ? key.text : null
    return keyText !== null && IDENTITY_HEADER_NAMES.has(keyText.toLowerCase())
  }
  return false
}

/**
 * True when `expr` (a literal, or the object literal one property below it) IS — directly, or
 * through exactly one `Object.freeze(...)` wrapper — the initializer of a top-level `const
 * DEFAULT_…` / `const FALLBACK` declaration. Bounded to that one shape on purpose: it does NOT
 * walk arbitrarily far up, so a value nested two levels deep (or behind any other wrapper) does
 * not match.
 */
function isDefaultDeclarationValue(expr: ts.Node): boolean {
  let value: ts.Node = expr
  const parent = value.parent
  if (
    parent !== undefined &&
    ts.isCallExpression(parent) &&
    parent.arguments[0] === value &&
    ts.isPropertyAccessExpression(parent.expression) &&
    parent.expression.getText() === 'Object.freeze'
  ) {
    value = parent
  }
  const decl = value.parent
  return (
    decl !== undefined &&
    ts.isVariableDeclaration(decl) &&
    decl.initializer === value &&
    ts.isIdentifier(decl.name) &&
    (decl.name.text.startsWith('DEFAULT_') || decl.name.text === 'FALLBACK')
  )
}

/**
 * True when the literal sits in one of THREE syntactic shapes of "the value when nobody
 * configured one" — a function/method parameter's own default (`zone = 'tracy.ai'`, the shape
 * `fork-url.mjs` and `import.ts` take Task 11's `zone` argument in), the right side of a `??`
 * fallback (`config.zone ?? 'tracy.ai'`, the shape `tracy-site-tools`'s `apply()` reads its
 * bundle config with), or `const DEFAULT_…`/`const FALLBACK`'s own value, or ONE property directly
 * inside it (`@tracy/core/config`'s own `FALLBACK`, `tracy-design-inspiration`'s
 * `DEFAULT_LIBRARY_URL`). All three are the same fact as `config.js`'s own `badgeUrl`/`hostOrg`:
 * a default that is true today and has a real, working way to be overridden — not a bug.
 *
 * Fix round 1: the first version walked EVERY ancestor looking for a `DEFAULT_…`/`FALLBACK` name
 * and stopped at the first match, so a literal nested at ANY depth inside such an object —
 * `const FALLBACK = Object.freeze({ hostOrg: 'TracyHQ', nested: { real: 'https://…real-bug' } })`
 * — escaped via `nested.real` riding along on `FALLBACK`'s own name. `isDefaultDeclarationValue`
 * only accepts the const's own value or ONE property directly inside it; `nested.real` is TWO
 * properties deep and no longer matches.
 */
function isDefaultValue(node: ts.Node): boolean {
  const parent = node.parent
  if (parent !== undefined && ts.isParameter(parent) && parent.initializer === node) return true
  if (
    parent !== undefined &&
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
    parent.right === node
  ) {
    return true
  }
  if (isDefaultDeclarationValue(node)) return true
  if (parent !== undefined && ts.isPropertyAssignment(parent) && parent.initializer === node) {
    const objectLiteral = parent.parent
    if (objectLiteral !== undefined && ts.isObjectLiteralExpression(objectLiteral)) {
      return isDefaultDeclarationValue(objectLiteral)
    }
  }
  return false
}

/** Walks up from a literal to see whether it is a `property: "sourceUrl"` value. */
function isSourceUrlProperty(node: ts.Node): boolean {
  let current: ts.Node | undefined = node
  while (current) {
    if (ts.isPropertyAssignment(current)) {
      const key = current.name
      const keyText = ts.isStringLiteral(key) || ts.isIdentifier(key) ? key.text : null
      return keyText === 'sourceUrl'
    }
    current = current.parent
  }
  return false
}

/** Walks up from a literal to see whether it is a JSX `placeholder=` attribute value. */
function isPlaceholderAttribute(node: ts.Node): boolean {
  const parent = node.parent
  return (
    parent !== undefined &&
    ts.isJsxAttribute(parent) &&
    ts.isIdentifier(parent.name) &&
    parent.name.text === 'placeholder'
  )
}

/**
 * GitHub is a public, third-party, deployment-invariant source-control address — see header.
 * Anchored to the START of the literal (fix round 1: a bare `includes()` over the whole literal
 * would exempt a real Tracy address that merely CONTAINS a `github.com/` substring somewhere
 * inside it — a query string, a redirect target — which is not this exemption's shape at all;
 * every real occurrence in this tree is itself a full `https://github.com/…` or
 * `https://raw.githubusercontent.com/…` URL, never a URL with one embedded inside it).
 */
function isGithubReference(text: string): boolean {
  return text.startsWith('https://github.com/') || text.startsWith('https://raw.githubusercontent.com/')
}

/** The bare marketing homepage — same "one address everywhere" fact `config.js` gives `badgeUrl`. */
function isMarketingHomepage(text: string): boolean {
  return text === 'https://tracy.ai'
}

function isExempt(text: string, node: ts.Node): boolean {
  return (
    isGithubReference(text) ||
    isMarketingHomepage(text) ||
    isIdentityString(node) ||
    isDefaultValue(node) ||
    isSourceUrlProperty(node) ||
    isPlaceholderAttribute(node)
  )
}

/**
 * The ONE file allowed to spell a Tracy address out — by its exact path, not merely a file named
 * `config.js` anywhere (fix round 1: `basename(rel) === 'config.js'` gave a free pass to any FUTURE
 * file sharing that name anywhere under `apps/` or `packages/`, not just this one).
 */
const APP_CONFIG_PATH = 'apps/tracy-web/src/config.js'

/**
 * The Welcome popup's animated scenes (`apps/tracy-web/src/welcome/route.js`): a static demo copied
 * as it is from the approved prototype, whose words are pictures of the app (a fake `fernway.tracy.ai`,
 * the design system library's own names such as "André Cândido"), not strings Tracy shows as its own.
 * Exactly that folder; the popup's real copy is `packages/ui/tracy-onboard/src/client/strings.ts`.
 */
const WELCOME_SCENES = 'apps/tracy-web/src/welcome/scenes/'

/** Exported for `scripts/test/check-origins.test.ts`: the pure decision, away from the filesystem. */
export function findingsIn(text: string, file: string, kind: ts.ScriptKind = ts.ScriptKind.TS): Finding[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const found: Finding[] = []
  for (const lit of literals(source)) {
    if (!PATTERN.test(lit.text)) continue
    if (isExempt(lit.text, lit.node)) continue
    const { line } = source.getLineAndCharacterOfPosition(lit.pos)
    found.push({ file, line: line + 1, value: lit.text })
  }
  return found
}

/**
 * The apps/packages scan: every literal in every non-exempt file, under the five structural
 * exemptions above — see the header for why there is no per-literal declared list here.
 */
function appAndPluginFindings(): Finding[] {
  const files: string[] = []
  for (const dir of srcDirs()) walk(dir, files)

  const problems: Finding[] = []
  for (const file of files) {
    const rel = relative(ROOT, file)
    if (rel === APP_CONFIG_PATH) continue
    if (rel.startsWith(WELCOME_SCENES)) continue
    if (rel.endsWith('.example')) continue
    if (isTestFile(rel)) continue
    if (rel.endsWith('.stories.tsx')) continue
    problems.push(...findingsIn(readFileSync(file, 'utf8'), rel, scriptKind(file)))
  }
  return problems
}

/**
 * ⚠ THE `workers/` HALF OF THIS GATE WENT WITH THE TREE (16/09/2026). It was the ORIGINAL shape —
 * a declared `ALLOWED` list, one entry per literal, each with a reason — and it existed because
 * `workers/` had no config door of its own to route an address through. `apps/` and `packages/` do
 * (`config.js`, `tracyConfig()`), so the scan that remains needs no per-literal exception list.
 *
 * ⚠ WHAT THIS GATE STILL CANNOT SEE, SAID OUT LOUD SO NOBODY TRUSTS IT FURTHER THAN IT GOES. It
 * reads STRING LITERALS. Two of the nine origin bugs found in the original sweep were not literals
 * at all: `siteTeamUrl()` and the `/invite/` route both called an already-parameterised helper and
 * simply did not pass the origin, so the production DEFAULT applied. Nothing here would have
 * flagged either. A green run means "no undeclared hostname is written down", not "every surface
 * points at its own deployment".
 */

function main(): void {
  const appProblems = appAndPluginFindings()

  for (const p of appProblems) {
    process.stderr.write(
      `check-origins: ${p.file}:${p.line}: a Tracy-domain literal is not exempt: ${JSON.stringify(p.value)}\n` +
        '  A plugin client reads it from `tracyConfig()` (`@tracy/core/config`); apps/tracy-web reads it\n' +
        "  from `config.js`. If it genuinely belongs in code, read this file's header for the five\n" +
        '  exemption shapes — none of them is a place to add a per-literal declared exception.\n'
    )
  }
  if (appProblems.length > 0) process.exit(1)

  process.stdout.write(
    'check-origins: apps/ and packages/ are clean — no Tracy address pinned outside config.\n'
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
