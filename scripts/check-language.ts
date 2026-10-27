/**
 * Language gate: surfaces outsiders can read must be in English.
 *
 * WHY A MACHINE CHECK. The rule has been written down for a long time (naming-conventions.md §4), but
 * reviewers cannot catch it: someone fluent in both languages does not *notice* a sentence in the wrong
 * language while skimming a diff. This is exactly a job for a regex, not a reader. Where it slipped
 * before was strings GENERATED at runtime (API responses, HTML rendered in a worker) — they do not sit
 * still in any UI file where an eye could review them.
 *
 * HOW IT SCANS. Pass one parses with TypeScript itself (already in devDependencies) and inspects only
 * three node kinds: string literals, template literals, JSX text. Comments are pass six's job. The first version of this script hand-wrote a state machine to
 * separate comments and got lost right away in the nested template literals of `fleet-bar/src/pages.js`
 * — a real parser is cheaper than a home-made one.
 *
 * CHECKS:
 *   1. Vietnamese diacritics in a string/JSX text → error (every scanned surface).
 *   2. A BANNED word from docs/references/vocabulary.md in a UI string/JSX text → error.
 *   3. (pass six) A code comment with a letter outside a-z → "write this comment in English".
 *   4. (pass seven) Vietnamese in a string, comment or Markdown line of a `vendor/` tree Tracy owns.
 *
 * THE LEDGER. Checks that arrived after the code they judge (comments, strings under `scripts/`, owned
 * `vendor/` trees)
 * start with a shrink-only ledger, `scripts/language-debt.json`: hits per file that predate the check.
 * A file may not go above its count, a new file may not appear, and a file that drops below its count
 * must be struck (`pnpm exec tsx scripts/check-language.ts --strike`) so the count cannot grow back.
 * Never add rows to make a change green; translate instead.
 *
 * DELIBERATE EXCEPTIONS — one reason each; do not loosen further until you can write the reason:
 *   - `*.test.*` and every `test/` folder: test NAMES are a developer surface, on par with comments. 616
 *     worker tests were named in Vietnamese as the standard at the time, and tests ship nowhere.
 *   - `*.generated.mjs`: multilingual translation tables exported from tracy-desk's i18n — the Vietnamese
 *     in them is correct data.
 *   - `apps/mockup/src/views.tsx`: catalogue of 33 views — internal notes for the team, not shipped UI.
 *   - The string 'Tiếng Việt' (allowlist matching the WHOLE string): a language's name written in itself
 *     is the UX convention of every language picker.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'

import { foreignComments, inCommentScope, ledgerVerdict, strikeLedger } from './lib/comment-language.ts'
import { OWNED_VENDOR_TREES, ownedVendorPath, vendorLanguageHits } from './lib/owned-vendor-trees.ts'
import { RULES_FILE, matchesRule } from './opensource/export.mjs'

const ROOT = resolve(import.meta.dirname, '..')

/**
 * Surfaces outsiders can read.
 *
 * `packages/` goes to the registry, into the image, then in front of customers. `workers/` ran on
 * Cloudflare and answered **straight to the customer's browser** — it joined this list on 2026-08-30,
 * in the same pass that moved six Workers over from `tracy-infra` (`ab2b53e`).
 *
 * 🔒 `workers/` IS NO LONGER IN THE LIST BECAUSE THAT TREE NO LONGER EXISTS (deleted 16/09/2026 — all of
 * its doors are answered by `apps/tracy-web`). The most dangerous place now is `apps/`, and it heads the list.
 * The paragraph below keeps the reasoning; read `apps/` for `workers/`: this repo's own docs name it:
 * "strings GENERATED at runtime are where it slips most easily, because they do not sit still in any UI
 * file where an eye could review them" — and that is exactly a `return json({ error: '…' })` in a Worker.
 * A gate scanning only `packages/` would be green while the API answers outsiders in Vietnamese.
 *
 * `vendor/` is not here: the trees Tracy owns there (`dsh-passwords` among them, which was here from
 * 2026-08-30) are read by pass seven, from the one list in `scripts/lib/owned-vendor-trees.ts`.
 *
 * `scripts/` joined on 26/10/2026, when the repository was opened: its gate messages and prose are now
 * read by outside contributors. Deliberate non-English data there (a regex that matches Vietnamese, a
 * sample customer sentence an e2e run types) carries `language-allow` on its line or the line above.
 */
const SCAN_DIRS = ['apps', 'packages', 'scripts']

/**
 * The UI area — where displayed text must follow the shared word list.
 *
 * Does NOT include `workers/`, and the difference is deliberate: the banned list in `vocabulary.md` is
 * about **words on screen** ("Creator mode" → "Permission mode"). Workers return JSON and HTML for
 * machines and people alike; the English rule applies to both, but the *pick the right word from the
 * list* rule only applies to UI. Only `fleet-bar/src/pages.js` builds a real sign-in page — if the word
 * list ever needs to reach it, add that path here, not all of `workers/`.
 */
const UI_DIRS = ['packages/']

const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'])
// `lib` is NOT here, although it once was: skipping every folder named `lib` wrongly exempted exactly
// where strings tend to live — `dashboard/src/lib/seat.ts` holds the sign-in error users SEE, and
// `packages/ui/src/lib/` is hand-written code too. What really needs skipping is the GENERATED bundle of
// dsh plugins, and it has its own path in `isExempt` below — more precise than a folder name.
// `storybook-static` is the Storybook build (`storybook build`) — it packs every story and every
// dependency into one minified bundle, so a Vietnamese word in `tasks/` or `vendor/` reappears there and
// the gate goes red over a file nobody wrote by hand. Same reason as `dist`.
//
// `cms` belongs to the same family, and joined the list on 08/09 after turning the gate red once:
// `packages/fleet/tracy-fleet-operation/dsh/cms/` is where `stage-cms-seeder.sh` puts BUILD OUTPUT
// before each `docker build` — two zip files plus `seed.mjs`, a 1.8 MB bundle. `.gitignore` excludes
// it, but this gate scans the DISK, not git, so on any machine that just ran staging `build:check`
// went red over a run of compressed characters in the bundle that looked like Vietnamese. CI runs
// staging BEFORE the build, so left as it was the failure would be permanent, not one machine's problem.
// `.turbo`: Turborepo's run logs of a local `turbo run` (gitignored, never authored, never shipped).
const SKIP_DIRS = new Set(['node_modules', 'dist', 'storybook-static', '.wrangler', '.turbo', 'test', 'cms'])

/**
 * WHERE a string counts as "text users read".
 *
 * 🔒 NARROW SCOPE ON PURPOSE, and the first version of this check learned it by being wrong: scanning
 * every string in `packages/` produced **55 findings, mostly technical URLs** —
 * `raw.githubusercontent.com` in a constant, `w3.org` in an SVG attribute, `tailwindcss.com`
 * in a bundle. A gate that fires 55 times for 1 real error is a gate people learn to ignore.
 *
 * Displayed text in this repo lives in exactly two places, by the chosen architecture: the separate
 * string tables (`src/client/strings.ts`) and translations (`packages/locale/…`). Plus `placeholder=` in
 * JSX — where the example `tiembanh.com` slipped through, because it was NOT in a string table.
 */
const isDisplayFile = (rel: string) =>
  rel.endsWith('/src/client/strings.ts') || /^packages\/locale\/[^/]+\/(?:vi|en)\//.test(rel)

/** A domain appearing in a displayed string. Rare TLDs are not caught — the ones people type are. */
const DOMAIN_IN_TEXT = /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:com|net|org|io|ai|dev|app|co|vn)\b/gi

/**
 * Domains allowed in text users read.
 *
 * Three groups, and they differ in their reason:
 *
 *   1. **RFC 2606** — domains that exist to be examples, owned by nobody.
 *   2. **Domains Tracy really refers to** — not examples, but the product's real addresses.
 *   3. **APPROVED English examples** — conventions already in the design bench. They are listed here
 *      explicitly rather than let through by a rule: adding a name to this list is a decision about
 *      product vocabulary, and it must look like one.
 *
 * `myshopify.com` is in group 3 but for its own reason: it is the REAL suffix of every Shopify store
 * (`<store>.myshopify.com`), so writing it differently teaches customers an address that does not exist.
 */
const ALLOWED_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'tracy.ai',
  'github.com',
  'claude.ai',
  'anthropic.com',
  'yoursite.com',
  'company.com',
  'mysite.com',
  'myshopify.com'
])

const isExempt = (rel: string) =>
  /\.test\.(?:ts|tsx|js|mjs)$/.test(rel) ||
  // Dictionaries: Vietnamese HERE is the point, not a leak. Their key sets are enforced by
  // check-dsh-locale, not this gate.
  /^packages\/locale\/[^/]+\/(?:vi|en)\//.test(rel) ||
  rel.startsWith('packages/i18n/src/locales/') ||
  rel.startsWith('packages/i18n/src/translate/') ||
  rel.endsWith('.generated.mjs') ||
  // The bundle of the DICTIONARY package — and ONLY the dictionary package. The Vietnamese build lives
  // there by design: its source is `vi/*.json`, and this very gate is why translations must be data, not code.
  //
  // ⚠ THIS EXEMPTION WAS ONCE WIDER THAN ITS REASON, and the cost was measured on 01/09: it read
  // `packages/*/*/lib/client.js`, i.e. exempted EVERY plugin bundle — so Vietnamese comments in
  // `src/` went straight into the bundle customers download, and no gate knew. Counted **27 lines** in
  // `tracy-add-site`, 2 in `tracy-chat-input`, 1 in `tracy-ui-gallery`. Caught by eye.
  //
  // Fixed at BOTH ends: the build turns on `minify` so comments no longer reach the bundle, and the
  // exemption shrinks to exactly the package with a reason. A gate exempting more than its reason is a gate switched off.
  /^packages\/locale\/[^/]+\/lib\/client\.js$/.test(rel) ||
  // A Worker's operator tools (`seed-workspace-mcp.mjs`, `send-preview.mjs`): typed by hand by the
  // team, NOT carried up by `wrangler deploy`. On par with `scripts/` at the repo root, and for the
  // same reason — strings there count as comments.
  //
  // 🔒 THE BOUNDARY IS `src/`, NOT THE WORKER NAME. `workers/<name>/src/` answers the customer's
  // browser and must be English; `workers/<name>/scripts/` does not. Widening this exemption to all of
  // `workers/` would drop the most dangerous place the gate was just widened to watch.
  // Measured 2026-08-30: exactly 16 strings land here, all 16 in the two tool files.
  /^workers\/[^/]+\/scripts\//.test(rel) ||
  // The Welcome popup's animated scenes (`apps/tracy-web/src/welcome/route.js`): a static demo copied
  // as it is from the approved prototype, whose words are pictures of the app (a fake `fernway.tracy.ai`,
  // the design system library's own names such as "André Cândido"), not strings Tracy shows as its own.
  // Exactly that folder; the popup's real copy is `packages/ui/tracy-onboard/src/client/strings.ts`.
  // The flagged letters there are French and Portuguese accents of those names, not Vietnamese.
  rel.startsWith('apps/tracy-web/src/welcome/scenes/')

/** Strings allowed to contain Vietnamese — matched as the WHOLE string, not partially. */
const ALLOWED_STRINGS = new Set(['Tiếng Việt', '🇻🇳 Tiếng Việt'])

const VIETNAMESE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/

/** Banned words + replacements. Copied from tracy-infra's vocabulary.md; TCH is self-contained so the
 * list lives here, not imported across repos. */
const BANNED_VOCABULARY: Array<[RegExp, string]> = [
  [/\bcreator mode\b/i, 'Permission mode'],
  [/\bsession log\b/i, 'History / Session information'],
  [/\bworkspace write\b/i, 'toolset permissions'],
  // Singular and plural: `\bagent preset\b` alone let "Agent presets" through, the form a nav label
  // takes (#807).
  [/\bagent presets?\b/i, 'Provider presets'],
  // Since 07/09/2026 (ADR 0014). The two-word phrase only: bare `direction` is platform vocabulary.
  [/\bdesign directions?\b/i, 'Design template']
]

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) out.push(full)
    }
  }
  for (const dir of SCAN_DIRS) walk(join(ROOT, dir))
  return out
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (file.endsWith('.ts')) return ts.ScriptKind.TS
  return ts.ScriptKind.JS
}

/** Every piece of text a user can see: strings, the text parts of templates, JSX text. */
function visibleTexts(source: ts.SourceFile): Array<{ text: string; pos: number }> {
  const out: Array<{ text: string; pos: number }> = []
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      out.push({ text: node.text, pos: node.getStart(source) })
    } else if (ts.isTemplateExpression(node)) {
      out.push({ text: node.head.text, pos: node.head.getStart(source) })
      for (const span of node.templateSpans) {
        out.push({ text: span.literal.text, pos: span.literal.getStart(source) })
      }
    } else if (ts.isJsxText(node)) {
      out.push({ text: node.text, pos: node.getStart(source) })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return out
}

const errors: string[] = []
let scanned = 0

/** Hits of the checks that have a ledger (comments; strings under `scripts/`), per file. */
const ledgered = new Map<string, string[]>()
const addLedgered = (rel: string, message: string): void => {
  ledgered.set(rel, [...(ledgered.get(rel) ?? []), message])
}

for (const file of sourceFiles()) {
  const rel = relative(ROOT, file)
  if (isExempt(rel)) continue
  scanned++

  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file)
  )
  const inUi = UI_DIRS.some((dir) => rel.startsWith(dir))
  const sourceLines = source.getFullText().split('\n')
  const displayFile = isDisplayFile(rel)

  for (const { text, pos } of visibleTexts(source)) {
    const { line } = source.getLineAndCharacterOfPosition(pos)
    const at = `${rel}:${line + 1}`
    // String tables and translations: every string is displayed text. Elsewhere, only `placeholder=` —
    // where the example `tiembanh.com` slipped through, because it was in no string table.
    const isDisplayText = displayFile || /placeholder\s*=/.test(sourceLines[line] ?? '')
    const shown = text.trim().replace(/\s+/g, ' ').slice(0, 70)

    const hit = text.match(VIETNAMESE)
    if (hit && !ALLOWED_STRINGS.has(text.trim()) && rel.startsWith('scripts/')) {
      const marked =
        /language-allow/.test(sourceLines[line] ?? '') || /language-allow/.test(sourceLines[line - 1] ?? '')
      if (!marked)
        addLedgered(
          rel,
          `${at}  Vietnamese in a string (character '${hit[0]}'): "${shown}"\n` +
            `    Gate messages and prose in scripts/ are read by contributors — write English.\n` +
            `    Deliberate data (a regex for Vietnamese, sample customer text): add \`language-allow\` on the line or the line above.`
        )
    } else if (hit && !ALLOWED_STRINGS.has(text.trim())) {
      errors.push(
        `${at}  Vietnamese in a string (character '${hit[0]}'): "${shown}"\n` +
          `    Strings and JSX text are a surface outsiders can read — write English\n` +
          `    Comments are not checked here — this gate only inspects strings and JSX text.\n` +
          `    Third-party data kept verbatim belongs in a data file, not embedded in code.`
      )
    }
    if (inUi) {
      /**
       * A domain in a displayed string must be a domain RESERVED FOR EXAMPLES.
       *
       * ⚠ MEASURED 01/09, caught by eye for the second time in one morning. The address field of the
       * import branch carried the example `tiembanh.com` — a VIETNAMESE name on an English surface. This
       * gate did not see it, because it looks for **accented characters**, and `tiembanh` has none. A
       * Vietnamese word written without diacritics passes every machine spelling check.
       *
       * So the rule here is NOT "do not write Vietnamese" — that rule exists and slipped. The rule is:
       * **a domain example must use a domain reserved for examples** (RFC 2606). It catches both
       * `tiembanh.com` and every other real name, and it catches them for the right reason: an example
       * pointing at a real domain is an example pointing at someone else's site.
       *
       * The allowlist is the domains Tracy really refers to, not examples.
       */
      for (const found of isDisplayText ? text.matchAll(DOMAIN_IN_TEXT) : []) {
        const domain = found[0].toLowerCase()
        if (ALLOWED_DOMAINS.has(domain) || domain.endsWith('.tracy.ai') || domain.endsWith('.example'))
          continue
        errors.push(
          `${at}  domain example "${found[0]}" in text users read.\n` +
            `    Use \`example.com\` (RFC 2606) — any other name is someone's real site, and a\n` +
            `    Vietnamese name without diacritics is never seen by the spelling gate.`
        )
      }
      for (const [banned, replacement] of BANNED_VOCABULARY) {
        const match = text.match(banned)
        if (match) {
          errors.push(
            `${at}  banned word "${match[0]}" — use "${replacement}".\n` +
              `    Shared word list: see BANNED_VOCABULARY in this file.`
          )
        }
      }
    }
  }
}

/**
 * Pass two: Tracy code INSTALLED INTO A CUSTOMER'S SITE — no Vietnamese line at all, comments included.
 *
 * WHY THE RULE DIFFERS FROM PASS ONE. Pass one deliberately leaves comments alone. Here it is the
 * opposite: the two plugins under `provision/access/` are installed into the **customer's** WordPress
 * and Joomla, so the customer's developers open and read them — comments are a surface outsiders read too.
 *
 * WHY NO PARSING. `check-language` inspects strings with the TypeScript parser, and it cannot read PHP.
 * The first version of this gate learned that lesson once: a hand-written state machine for separating
 * comments got lost right away in nested template literals, and the header above records the conclusion
 * "a real parser is cheaper than a home-made one". So comments are NOT separated here — the rule is
 * **no Vietnamese anywhere** in these files, a rule that needs no parser to enforce correctly.
 *
 * Measured when added (2026-08-30): all 6 PHP files clean. This gate keeps them clean.
 *
 * NARROW SCOPE ON PURPOSE. The rest of `provision/` is bash and python run on the fleet host, typed by
 * the team — 58 Vietnamese lines there were `echo`s of operator tools, on par with a Worker's operator
 * tools. Widening this rule to all of `provision/` would demand translating 58 lines nobody outside the
 * team reads, and turn a correct gate into an annoying one.
 */
const GUEST_INSTALLED = join(ROOT, 'packages/fleet/tracy-fleet-operation/scripts/provision/access')

const guestFiles: string[] = []
const walkGuest = (dir: string): void => {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walkGuest(full)
    else guestFiles.push(full)
  }
}
walkGuest(GUEST_INSTALLED)

/**
 * One line scan, several file sets, each carrying the sentence that names ITS reader.
 *
 * The rule is the same for all of them -- no Vietnamese anywhere, comments included -- but the
 * reason differs, and a gate that cannot say WHO reads the file it is refusing teaches nothing.
 */
function scanGuestLines(files: string[], why: string): void {
  for (const file of files) {
    const rel = relative(ROOT, file)
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        const found = VIETNAMESE.exec(line)
        if (found !== null) {
          errors.push(
            `${rel}:${String(index + 1)}  Vietnamese (character '${found[0]}') in a file installed into a CUSTOMER's site.\n` +
              `    ${why}`
          )
        }
      })
  }
}

scanGuestLines(
  guestFiles,
  'Comments here must be English too: developers on the customer side open and read this file.'
)

/**
 * PASS TWO-B -- the `AGENTS.md` that rides INTO a customer's site inside the theme or template.
 *
 * WHY IT IS THE SAME RULE AS THE PHP ABOVE. These files are not repository documentation. The
 * WordPress ones are built into the theme zip, and the Joomla one is listed in
 * `templateDetails.xml`, so the installer copies it into `templates/tracy/`. Each one opens with
 * the same sentence -- "a maintenance agent may receive only this webroot and this database" --
 * which is exactly what makes them a guest-facing surface: they are the ONLY description of the
 * site an agent gets when it arrives with no workspace, no spec-pack and no conversation.
 *
 * WHY NO OTHER PASS CATCHES THEM. Pass one parses with TypeScript and reads `.ts`/`.tsx`; Markdown
 * is not in `EXTENSIONS`, and under `docs/` and `tasks/` Vietnamese Markdown is the repository
 * standard. So the rule that `naming-conventions.md` states for guest-facing code -- no Vietnamese
 * at all -- had nobody holding it here. Measured 22/09/2026, when the last two of the six were
 * written: all seven clean, and the count in this gate's own summary did not move.
 *
 * WHY THE SOURCE IS SCANNED TOO. `overlays/<theme>/AGENTS.md` does not ship; it is what the
 * WordPress build generates `src/<theme>/AGENTS.md` FROM. Refusing only the generated copy would
 * name a file nobody edits, so both are read and the author is told about the one they typed.
 *
 * NARROW ON PURPOSE, like the pass above: the name `AGENTS.md` under `packages/cms`, nothing else.
 * The rest of those trees is theme source whose comments follow the ordinary repository rule.
 */
const GUEST_DOCS_ROOT = join(ROOT, 'packages/cms')
const GUEST_DOCS_NAME = 'AGENTS.md'
/**
 * How few of them means the walk itself broke rather than the tree shrinking.
 *
 * 🔒 A COLLECTOR THAT FINDS NOTHING PASSES, AND THAT IS THE FAILURE THIS FLOOR EXISTS FOR. Six
 * cells ship today (2 site kinds x 3 platforms) and the WordPress two are counted twice, source
 * and generated: seven files. Rename the directory, move the docs, or break the walk, and the
 * loop below runs zero times -- green, with a summary line reading `0 file`. The repository
 * refuses that shape everywhere else; this is the same refusal, one number wide. Adding a
 * platform raises this number in the same commit that adds its file.
 */
const GUEST_DOCS_FLOOR = 7

const guestDocs: string[] = []
const walkGuestDocs = (dir: string): void => {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walkGuestDocs(full)
    else if (entry === GUEST_DOCS_NAME) guestDocs.push(full)
  }
}
walkGuestDocs(GUEST_DOCS_ROOT)

if (guestDocs.length < GUEST_DOCS_FLOOR) {
  errors.push(
    `packages/cms  found only ${String(guestDocs.length)} ${GUEST_DOCS_NAME}, expected at least ${String(GUEST_DOCS_FLOOR)}.\n` +
      `    Either a theme/template lost its agent docs, or this scan broke.\n` +
      `    If a real platform was removed, lower GUEST_DOCS_FLOOR in the same commit; do not let the gate count 0 and report green.`
  )
}

scanGuestLines(
  guestDocs,
  'This file GOES INTO the customer site (theme zip · <files> of templateDetails.xml) and is the ONLY description of the site an agent receives — write it in English.'
)

/**
 * PASS THREE — workflow YAML under `.github/`, every line, comments included.
 *
 * WHY A THIRD PASS. `naming-conventions.md` §5.0 draws the language line by FILE TYPE, and `.yml`
 * is on the code side of it: comments too. Pass one cannot see it — it parses with TypeScript,
 * which does not read YAML — and nothing else in the repo opens `.github/`, which is exactly how
 * `changelog-check.yml` and `pr-description-check.yml` carried Vietnamese headers for six days
 * with every gate green (measured 2026-09-14 while reviewing all six workflows). Same shape as
 * the pass above and for the same reason: no parser, the rule is simply "no Vietnamese anywhere
 * in these files", which a line scan enforces exactly.
 *
 * Only `.github/` — a workflow is the one kind of code file no other gate reads. The rest of the
 * repository's YAML (`cordis.patch.yml`, `deploy/*.yml`) is not swept here on purpose: those files
 * carry Vietnamese comments today, §7 says old files are not translated retroactively, and a gate
 * that goes red on 40 files it did not ask anyone to change is a gate people learn to skip.
 */
const WORKFLOW_DIR = join(ROOT, '.github')

const workflowFiles: string[] = []
const walkWorkflows = (dir: string): void => {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walkWorkflows(full)
    else if (entry.endsWith('.yml') || entry.endsWith('.yaml')) workflowFiles.push(full)
  }
}
walkWorkflows(WORKFLOW_DIR)

for (const file of workflowFiles) {
  const rel = relative(ROOT, file)
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      const found = VIETNAMESE.exec(line)
      if (found !== null) {
        errors.push(
          `${rel}:${String(index + 1)}  Vietnamese (character '${found[0]}') in a CI workflow.\n` +
            `    A .yml file is a code file (naming-conventions.md §5.0): comments must be English too.`
        )
      }
    })
}

/**
 * PASS FOUR — the `==>` lines of fleet shell scripts, which are CUSTOMER TEXT.
 *
 * 🔒 THIS GATE SCANS A LINE SHAPE, NOT A FILE TYPE, AND THAT IS THE WHOLE DESIGN.
 * `apps/tracy-host/src/provision.js` turns every line starting `==>` into the job's `step`, and
 * that step is the sentence a customer reads on the Build screen while their site is built. So
 * those lines are product copy that happens to live in bash. Measured 20/09/2026: **13 of them
 * were in Vietnamese**, among them
 * the EmDash image step of quickstart tracy-business/emdash-0.x, shown to everyone.
 *
 * ⚠ WHY NOT SIMPLY ADD `.sh` TO `EXTENSIONS`. Measured the same day: 23 shell files under
 * `apps/`+`packages/` carry Vietnamese, and all but these lines are operator-only — comments and
 * progress notes nobody outside the team ever sees. A gate that turns 23 files red to fix 13 lines
 * is a gate somebody disables, and `naming-conventions.md` §5.0 does not ask for those 182 old
 * files to be translated backwards. So this pass is narrow ON PURPOSE: the harm was measured on
 * the `==>` lines, and the gate covers exactly them.
 */
/**
 * Every `==>` a script prints, wherever the `echo` sits on its line — after `&&` or `||`, inside a
 * group — and every `==>` line of a heredoc. Measured 23/09/2026: the first version matched only an
 * `echo` at the start of a line, reported this pass clean, and `provision/go-live.sh` still printed
 * four Vietnamese step lines (131, 157, 168, 179): three behind `&&`/`||`, one in a heredoc.
 */
const STEP_ECHO = /(?:^|[\s;&|({])(?:echo|printf)\s+["']?(==>[^"'\n]*)/g
const STEP_BARE = /^\s*(==>.*)$/
const shellFiles: string[] = []
function walkShell(dir: string): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walkShell(full)
    else if (entry.endsWith('.sh')) shellFiles.push(full)
  }
}
for (const dir of SCAN_DIRS) walkShell(join(ROOT, dir))

for (const file of shellFiles) {
  const rel = relative(ROOT, file)
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      const steps = [...line.matchAll(STEP_ECHO)].map((m) => m[1] ?? '')
      const bare = STEP_BARE.exec(line)
      if (bare !== null) steps.push(bare[1] ?? '')
      const found = steps.map((step) => VIETNAMESE.exec(step)).find((f) => f !== null) ?? null
      if (found !== null) {
        errors.push(
          `${rel}:${String(index + 1)}  Vietnamese (character '${found[0]}') in a \`==>\` line.\n` +
            `    A \`==>\` line is TEXT CUSTOMERS READ: apps/tracy-host/src/provision.js turns it into the job's\n` +
            `    \`step\` and the Build screen shows it verbatim. Write it in English.`
        )
      }
    })
}

/**
 * PASS FIVE — the API documentation site (`apps/tracy-docs`), every line of every file, comments
 * and Markdown included.
 *
 * WHY PASS ONE DOES NOT COVER IT. The site is Markdown/MDX under `src/content/docs/`, plus an Astro
 * config and a CSS file: pass one parses TypeScript and reads `.ts`/`.js` only, so the pages — the
 * one part of that tree an outsider actually reads — would go unscanned, and `check-origins` reads
 * the same extensions. The site is served at `api.tracy.ai/` to people outside Tracy
 * (tasks/todo-api-public.md S5: "English; the `language` gate scans `apps/tracy-docs/src`"), so the
 * rule is the guest-installed one: no Vietnamese anywhere, comments included, a line scan.
 *
 * Whole package, not only `src/`: `astro.config.mjs` carries the site title and description, and
 * `scripts/generate.mjs` carries the prose of the three generated pages. The generated pages
 * themselves (gitignored, present after a build) are scanned when present — they copy
 * `docs/references/api-changelog.md`'s body, which is where Vietnamese could slip in unnoticed.
 * `node_modules`, `dist` (Starlight's own bundles) and `.astro` (its cache) are not authored here;
 * `test/` is the developer surface pass one exempts everywhere (its own test spells out the
 * Vietnamese character class it checks the pages against, which is the one legitimate reason for
 * those characters in that tree).
 *
 * TRANSLATIONS ARE THE ONE PLACE VIETNAMESE IS THE POINT (S7, 29/09/2026). The site is published in
 * several languages; each one is a directory under `src/content/docs/` that carries `_sidebar.json`
 * (its language tag, its name in the switcher, its sidebar labels — `astro.config.mjs` discovers the
 * locales from exactly that file). Those directories are skipped, and only those: the English tree
 * at the root of `src/content/docs/` has no `_sidebar.json`, so it stays under the rule, as do the
 * config and the generator. Marking the exemption by the file that DEFINES a translation, rather
 * than by a list of directory names kept here, means a new language needs no gate edit and a stray
 * directory without that file is still scanned.
 *
 * PICTURES AND CLIPS ARE NOT TEXT (11/10/2026). The changelog's Highlights carry images and clips
 * from `public/changelog/<X.Y>/` (`scripts/media.mjs`); read as lines, their compressed bytes are
 * full of letters from the Vietnamese class, so they are skipped by extension. What a reader sees
 * of them in words — the alt text on the page, `media.json` — is a text file and stays scanned.
 */
const DOCS_SITE = join(ROOT, 'apps/tracy-docs')
const DOCS_SITE_SKIP = new Set(['node_modules', 'dist', '.astro', '.turbo', 'test'])
const DOCS_SITE_BINARY = new Set(['.webp', '.png', '.gif', '.jpg', '.jpeg', '.mp4', '.ico'])
const DOCS_TRANSLATION_MARKER = '_sidebar.json'

const docsSiteFiles: string[] = []
const walkDocsSite = (dir: string): void => {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (DOCS_SITE_SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (existsSync(join(full, DOCS_TRANSLATION_MARKER))) continue
      walkDocsSite(full)
    } else if (!DOCS_SITE_BINARY.has(entry.slice(entry.lastIndexOf('.')).toLowerCase()))
      docsSiteFiles.push(full)
  }
}
walkDocsSite(DOCS_SITE)

scanGuestLines(
  docsSiteFiles,
  'The API documentation site (apps/tracy-docs) is served at api.tracy.ai to people outside Tracy: every line — Markdown, comment, config — is English.'
)

/**
 * PASS SIX — code comments, every root that ships: comments must be in English.
 *
 * WHY. The repository is public: a comment is read by contributors who do not read Vietnamese, and
 * machines catch what a bilingual reviewer skims past. Rule and escape live in
 * `scripts/lib/comment-language.ts`: a letter outside a-z in a comment is a hit, except inside a
 * quoted span (`…`, "…", '…', «…») — quote third-party data or a translated string you explain.
 *
 * WHAT IT READS. Tracked and new (not ignored) files under `apps/`, `packages/`, `scripts/`,
 * `deploy/`, `.github/`, `tests/`, by file type (JS/TS through the TypeScript parser; shell, YAML,
 * Python, Docker, PHP, CSS, SQL, HTML/Astro through line scanners). Not `.md` (docs are another
 * rule), not `vendor/`, not translation data (`packages/locale/`, `i18n/`, `locales/`,
 * `interface-languages/`), not built bundles, not test fixtures. Git lists the files, so build
 * output on disk is never read.
 */
const COMMENT_ROOTS = ['apps', 'packages', 'scripts', 'deploy', '.github', 'tests']
const commentFiles = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...COMMENT_ROOTS],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
)
  .split('\0')
  .filter((rel) => rel !== '' && inCommentScope(rel))
let commentsScanned = 0
for (const rel of commentFiles) {
  let src: string
  try {
    src = readFileSync(join(ROOT, rel), 'utf8')
  } catch {
    continue // listed by git but deleted in the working tree
  }
  commentsScanned++
  for (const hit of foreignComments(rel, src)) {
    addLedgered(
      rel,
      `${rel}:${String(hit.line)}  comment with '${hit.letter}': ${hit.text.slice(0, 90)}\n` +
        `    Write this comment in English. Quoting data verbatim? Put it in \`backticks\` or "quotes".`
    )
  }
}

/**
 * PASS SEVEN — the `vendor/` trees Tracy owns: Vietnamese in strings, comments and Markdown.
 *
 * WHY. Until 27/10/2026 the gate skipped all of `vendor/` as other people's code, and Vietnamese prose
 * reached the public repository through the trees there that are ours: forks we edit, templates we
 * derived, skills we wrote. The list, one reason per tree and the paths left out (translations, built
 * bundles, upstream data), lives in `scripts/lib/owned-vendor-trees.ts`; third-party trees are not in it.
 * Hits that predate this pass sit in the ledger below, like comments.
 */
const vendorFiles = execFileSync(
  'git',
  [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    ...OWNED_VENDOR_TREES.map((tree) => tree.path)
  ],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
)
  .split('\0')
  .filter((rel) => rel !== '' && ownedVendorPath(rel) !== null)
let vendorScanned = 0
for (const rel of vendorFiles) {
  let src: string
  try {
    src = readFileSync(join(ROOT, rel), 'utf8')
  } catch {
    continue
  }
  vendorScanned++
  const strings = /\.(?:[cm]?[jt]s|[jt]sx)$/.test(rel)
    ? (() => {
        const source = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, scriptKind(rel))
        return visibleTexts(source).map(({ text, pos }) => ({
          text,
          line: source.getLineAndCharacterOfPosition(pos).line + 1
        }))
      })()
    : []
  for (const hit of vendorLanguageHits(rel, src, strings)) {
    addLedgered(
      rel,
      `${rel}:${String(hit.line)}  Vietnamese in a ${hit.kind} ('${hit.letter}'): ${hit.text.slice(0, 90)}\n` +
        `    This vendor tree is Tracy's (scripts/lib/owned-vendor-trees.ts) and ships publicly — write English.\n` +
        `    Quoting data verbatim? Put it in \`backticks\` or "quotes", or mark the line \`language-allow\`.`
    )
  }
}

/** The ledger: hits per file that predate the checks above. Shrink-only. */
const LEDGER = join(ROOT, 'scripts/language-debt.json')
const LEDGER_NOTE =
  'Comment and scripts/ string hits per file that predate check-language pass six (26/10/2026), and owned vendor/ hits that predate pass seven (27/10/2026). Shrink-only: `pnpm exec tsx scripts/check-language.ts --strike` lowers it; never add rows.'
const measured: Record<string, number> = {}
for (const [rel, hits] of ledgered) measured[rel] = hits.length
const writeLedger = (files: Record<string, number>): void =>
  writeFileSync(LEDGER, `${JSON.stringify({ $comment: LEDGER_NOTE, files }, null, 2)}\n`)

if (process.argv.includes('--init')) {
  if (existsSync(LEDGER)) {
    console.error('check-language: --init refuses to overwrite an existing ledger; use --strike.')
    process.exit(2)
  }
  writeLedger(strikeLedger(measured, measured))
  console.log(`check-language: ledger written with ${String(Object.keys(measured).length)} files.`)
}
const PUBLIC_TREE = join(ROOT, RULES_FILE)
const publicExclude: string[] = existsSync(PUBLIC_TREE)
  ? ((JSON.parse(readFileSync(PUBLIC_TREE, 'utf8')) as { exclude?: string[] }).exclude ?? [])
  : []
// A row for a file the public export leaves out cannot be measured there; it is not paid debt.
const leftOutOfThisTree = (rel: string): boolean =>
  !existsSync(join(ROOT, rel)) && publicExclude.some((rule) => matchesRule(rel, rule))
const ledgerFiles: Record<string, number> = Object.fromEntries(
  Object.entries(
    existsSync(LEDGER)
      ? (JSON.parse(readFileSync(LEDGER, 'utf8')) as { files: Record<string, number> }).files
      : {}
  ).filter(([rel]) => !leftOutOfThisTree(rel))
)
let ledgerNow = ledgerFiles
if (process.argv.includes('--strike')) {
  ledgerNow = strikeLedger(measured, ledgerFiles)
  writeLedger(ledgerNow)
}
const verdict = ledgerVerdict(measured, ledgerNow)
for (const row of verdict.over) {
  errors.push(
    `${row.file}: ${String(row.measured)} non-English comment/script-string hit(s), the ledger allows ${String(row.allowed)}:\n` +
      (ledgered.get(row.file) ?? []).map((message) => `    ${message.replaceAll('\n', '\n    ')}`).join('\n')
  )
}
for (const row of verdict.paid) {
  errors.push(
    `${row.file}: ${String(row.measured)} hit(s) left, the ledger still says ${String(row.allowed)} — well done; strike it:\n` +
      '    pnpm exec tsx scripts/check-language.ts --strike'
  )
}
const ledgerTotal = Object.values(ledgerNow).reduce((sum, n) => sum + n, 0)

if (errors.length > 0) {
  console.error(`Language gate: ${errors.length} violation(s)\n`)
  for (const error of errors) console.error('  ' + error + '\n')
  process.exit(1)
}

console.log(
  `Language gate: ${scanned} files + ${guestFiles.length} files installed into customer sites + ${guestDocs.length} AGENTS.md going to customer sites + ${workflowFiles.length} workflows + ${shellFiles.length} scripts (==> lines) + ${docsSiteFiles.length} API docs site files + ${commentsScanned} files' comments + ${vendorScanned} owned vendor files, clean (ledger: ${String(ledgerTotal)} older hits in ${String(Object.keys(ledgerNow).length)} files, scripts/language-debt.json).`
)
