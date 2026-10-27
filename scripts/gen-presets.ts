#!/usr/bin/env tsx
/**
 * Generates Tracy's dsh presets and the harness screen's fixture FROM `config/mode-matrix.json`.
 *
 * WHY A MACHINE WRITES THIS, NOT A PERSON. A mode is three things in three places: a row in the
 * matrix, a preset dsh composes a session from, and a screen an operator reads. Typing all three
 * by hand is three copies of one truth, and a drifted copy SAYS NOTHING: dsh still boots, the
 * screen still draws, only the customer's agent carries a different toolset than the admin page
 * claims.
 *
 * ONE SOURCE, THREE GENERATED FILES (two of them byte-identical):
 *
 *   config/mode-matrix.json                                   <- people edit this (by PR)
 *     |-- packages/bundle/tracy-cowork/presets.patch.yml       <- dsh reads (profiles web, desktop)
 *     |-- packages/bundle/tracy-native/presets.patch.yml       <- dsh reads (profile native = fleet)
 *     `-- packages/web/tracy-harness/src/matrix.generated.ts   <- the harness screen reads
 *
 * 🔒 SINCE dsh 0.1.7-rc.2 A PRESET IS A ROW, NOT A FOLDER. Upstream `d1e22a7e24` retired
 * `@deepseek-ai/dsh-agent-presets` and its directory roots (`roots`, `includeShippedRoot`,
 * `includeUserRoot`): a preset is now a `@deepseek-ai/dsh-agent-preset` row whose `config` holds
 * `id`, display fields and the child plugin list (`config.plugins`), and
 * `@deepseek-ai/dsh-agent-preset-registry` only picks the default. Until then this script wrote
 * twelve `presets/<role>-<platform>/{preset.yml,agent.cordis.yml}` folders, which the image copied
 * to `/opt/tracy/presets`; that folder and that copy are gone. The row id is `preset-<id>` like
 * upstream's own four, and `config.id` is the SAME `<role>-<platform>` as before: sessions store
 * that id, and a restart resolves it against the current rows and REJECTS one it cannot find.
 *
 * WHY THE SAME FILE IN BOTH BUNDLES. A bundle patch path is joined onto its OWN package directory
 * (`app-boot/src/profile.ts` `bundlePatchPaths`), so `@tracy/dsh-native-bundle` cannot point at a
 * file of `@tracy/dsh-cowork-bundle`, and no profile loads both (a duplicate row id refuses to
 * boot). Two generated copies, compared byte for byte by `--check`, are one truth; a hand copy
 * would be two.
 *
 * PACKAGE NAMES ARE NOT IN THE MATRIX, on purpose: the matrix says *which row is on for whom*, and
 * *which package a row is* belongs to the composition. The script reads it back from dsh's four
 * shipped preset rows, the `web-app` bundle and Tracy's own bundle patch, so a package renamed
 * upstream turns this script RED instead of making it write the old name.
 *
 * Usage:
 *   pnpm exec tsx scripts/gen-presets.ts            regenerate
 *   pnpm exec tsx scripts/gen-presets.ts --check    compare only, write nothing (the gate)
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')

/** Every bundle that carries the twelve rows, and the file name each lists in `dsh.bundle.patch`. */
const BUNDLES = ['packages/bundle/tracy-cowork', 'packages/bundle/tracy-native']
const PRESETS_FILE = 'presets.patch.yml'
/** The folder layout dsh 0.1.6 read. Its presence now is drift: nothing loads it. */
const RETIRED_PRESETS_DIR = 'packages/bundle/tracy-cowork/presets'
const FIXTURE = 'packages/web/tracy-harness/src/matrix.generated.ts'
/**
 * Every preset's skills (`<role>-<platform>` → skill ids), for the dsh image to build one folder per
 * preset (`/opt/tracy/skill-sets/<role>-<platform>`, that preset's `customSkillDirs`).
 *
 * 🔒 ONE RULE: a skill whose row names platforms goes to the roles on those platforms whose column is on,
 * or to every role there when no column is on; any other goes to the roles whose column is on. The role
 * columns of a platform row were ignored until 09/10/2026, so `joomlart-t4-template` — a site BUILD skill
 * whose intake asks for an HTML folder or a URL — rode along in the Writer's and SEO/GEO's Joomla catalog;
 * it now names Designer and Developer. Every preset read the one `/opt/tracy/skills` (36 skills on
 * 27/09), so a Joomla T4 skill rode along in every EmDash conversation, a slide-deck skill in every
 * writer's, and `web-clone`'s Chinese description in all of them. The role columns of every installed
 * skill were settled on 27/09 (§3), keeping every choice the earlier draft had made; a skill the
 * image installs with no row is refused below, so none can ship read by nobody.
 */
const SKILL_SETS = 'packages/fleet/tracy-fleet-operation/dsh/skill-sets.json'

/** Every composition declares `id` next to `name`; read them all and take the FIRST declaration of each id. */
const COMPOSITIONS = [
  'vendor/tracy/deepseek-harness/packages/bundle/web-app/presets/standard.patch.yml',
  'vendor/tracy/deepseek-harness/packages/bundle/web-app/presets/ptc.patch.yml',
  'vendor/tracy/deepseek-harness/packages/bundle/web-app/presets/cordis.patch.yml',
  'vendor/tracy/deepseek-harness/packages/bundle/web-app/presets/minimal.patch.yml',
  'vendor/tracy/deepseek-harness/packages/bundle/web-app/cordis.patch.yml',
  'packages/bundle/tracy-cowork/cordis.patch.yml'
]

interface Row {
  id: string
  group?: string
  tools?: string[]
  description?: string
  roles: Record<string, boolean>
  platforms: Record<string, boolean>
  note?: string
}
interface Matrix {
  roles: { id: string; label: string; hint: string }[]
  platforms: { id: string; label: string }[]
  identity?: string
  personas: Record<string, string>
  overlays: Record<string, { persona: string; prompts: { path: string; kind: string; note?: string }[] }>
  tools: Row[]
  skills: Row[]
}

const matrix: Matrix = JSON.parse(readFileSync(join(repo, 'config/mode-matrix.json'), 'utf8'))
const roles = matrix.roles
const platforms = matrix.platforms

/**
 * `id → cordis package name`, read back from the compositions themselves.
 *
 * READ LINE BY LINE, NOT WITH A BRIDGING REGEX. The first version used a regex jumping from `id:` to
 * `name:` across lines, and it missed exactly four rows — rows declaring `name` WITHOUT quotes
 * (`name: cordis:group`) or sitting after a long `config` block. That miss was silent: the table still
 * built, just a few entries short, and the script would generate presets missing tools with nobody
 * noticing. A line loop leaves no room to miss.
 */
function toolPackages(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const file of COMPOSITIONS) {
    const path = join(repo, file)
    // 🔒 A missing composition is RED, not skipped. Skipping is how dsh 0.1.7-rc.2 would have
    // passed unnoticed: the four `agent.cordis.yml` files this list named until then vanished
    // upstream, and a silent `continue` leaves only the ids the remaining files happen to declare.
    if (!existsSync(path)) {
      console.error(`✋ Composition not found: ${file}`)
      console.error('   dsh moved or renamed it; point COMPOSITIONS at where the rows live now.')
      process.exit(1)
    }
    let id: string | null = null
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const idHit = line.match(/^\s*-?\s*id:\s*([\w.-]+)\s*$/)
      if (idHit) {
        id = idHit[1]
        continue
      }
      const nameHit = line.match(/^\s*name:\s*'?([^'\n]+?)'?\s*$/)
      if (nameHit && id && !map[id]) map[id] = nameHit[1]
    }
  }
  return map
}

const PACKAGES = toolPackages()

/**
 * A row's package, tolerating TWO COMPOSITIONS GIVING ONE PLUGIN TWO IDS.
 *
 * Measured: the matrix follows `web-app`, where that row is `tool-str-replace-editor` — but there it is
 * only DISABLED (`disabled: true`), with no `name`. The name is declared by the `minimal` preset, under
 * the id `str-replace-editor`, without the prefix. Dropping the prefix and retrying is enough, limited to
 * `tool-` exactly so a mistyped id cannot silently match another row's package.
 */
function packageFor(id: string): string | undefined {
  return PACKAGES[id] ?? (id.startsWith('tool-') ? PACKAGES[id.slice('tool-'.length)] : undefined)
}

const missing = matrix.tools.map((t) => t.id).filter((id) => !packageFor(id))
if (missing.length > 0) {
  console.error(`✋ No composition declares a package for: ${missing.join(', ')}`)
  console.error('   The matrix says the row exists, but no cordis file says which package it is.')
  process.exit(1)
}

const rowsFor = (rows: Row[], role: string, platform: string) =>
  rows.filter((r) => r.roles[role] || r.platforms[platform] === true)

/**
 * A multi-line string as a YAML block, indented to the right level.
 *
 * 🔒 BLANK LINES MUST BE TRULY BLANK. The first version indented empty lines too, so between two
 * paragraphs sat a line of six spaces — in a block scalar a line indented DEEPER than the base is kept
 * verbatim, which changes how YAML folds paragraphs. The preset still parsed, the persona still had text,
 * only its shape differed from what was written; and nothing along the way said so.
 */
function block(text: string, indent: string) {
  return text
    .trim()
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `${indent}${line}`))
    .join('\n')
}

/**
 * `@deepseek-ai/dsh-plan-mode`'s required `section` field, copied verbatim from dsh's own
 * shipped `standard` preset (`bundle/web-app/presets/standard.patch.yml`) — not written here, since it's
 * dsh's system-prompt text for its own plugin, not Tracy's persona.
 */
const PLAN_MODE_SECTION = `
You are in plan mode. Stay in plan mode until exit_plan_mode succeeds or the user switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.

Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.

The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.

Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.

Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.

When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.
`

/**
 * Rows that publish a PROCESS-GLOBAL service must sit inside a `cordis:group` realm with that
 * service `isolate`d, or dsh refuses the whole preset: `row(s) published process-global
 * service(s) [compaction, planMode]; a preset service must sit behind an \`isolate\` realm`.
 * Realm ids, member rows and isolate keys copied from dsh's own shipped `standard` preset.
 * 🔒 THREE MEMBERS, NOT ONE — fixed 17/09. This realm carried `compaction-basic` alone while still
 * isolating `toolResultPruner`, and dsh's own shipped `standard` preset says why that is wrong in as
 * many words: "compaction-basic reads toolResultPrune through ctx.get, so the pruner must share this
 * realm rather than sit outside it" (`preset/agent-presets/presets/standard/agent.cordis.yml`, dsh
 * 0.1.6; the realm is unchanged in `bundle/web-app/presets/standard.patch.yml` since 0.1.7-rc.2).
 * `compaction-basic` does exactly that at `compaction/compaction-basic/src/index.ts:278`, and guards
 * on `prune !== undefined` — so with nothing publishing the service, tool results were NEVER pruned
 * on any Tracy preset, and an isolate key nothing publishes really was inert. The package was in the
 * workspace the whole time. `command-compact` is the third member of the same reference realm.
 */
const REALMS: Record<string, { members: string[]; isolate: string[] }> = {
  planning: { members: ['plan-mode'], isolate: ['planMode'] },
  compaction: {
    members: ['compaction-basic', 'command-compact', 'tool-result-pruner'],
    isolate: ['compaction', 'toolResultPruner']
  },
  delegation: {
    members: ['tool-subagent-control', 'tool-subagent', 'tool-subagent-fork'],
    isolate: ['workflowEngine']
  }
}
const REALM_OF: Record<string, string> = Object.fromEntries(
  Object.entries(REALMS).flatMap(([realm, { members }]) => members.map((m) => [m, realm]))
)

/**
 * One `@deepseek-ai/dsh-agent-preset` row: identity and display fields in `config`, the child
 * plugins in `config.plugins`, returned as the lines of one entry in the file's `insert:` list.
 *
 * `config.name`/`description` are what `preset.yml` used to carry, word for word. `order: 1` is
 * kept for all twelve, as before: `tracy-mode-picker` draws its own fixed grid and dsh's roster
 * UI (`ui-agent-preset`) stands down in both bundles, so no screen sorts by it.
 */
function presetRow(role: (typeof roles)[number], platform: (typeof platforms)[number]) {
  const rolePersona = (matrix.personas[role.id] ?? '').trim()
  const platformPersona = (matrix.overlays[platform.id]?.persona ?? '').trim()
  // The role persona comes first, the platform one after: the second adds WHERE the work happens, so
  // it qualifies the first rather than replacing it.
  // Tracy's identity opens every preset: a preset's `dsh-persona` shadows the deployment persona
  // (`system-prompt.personaPrefix` in the bundle), so a sentence left only there never reaches a
  // session that runs a preset — measured on the stand 28/09/2026.
  const identity = (matrix.identity ?? '').trim()
  const persona = [identity, rolePersona, platformPersona].filter(Boolean).join('\n\n')

  /**
   * One row's YAML, at list-item base indent `b` (column 10 in `plugins:`, four more inside a realm).
   *
   * dsh marks several config fields REQUIRED with no default — omitting `config` entirely (as
   * every row here did until 03/09) doesn't fall back to anything, it throws `loader entries
   * failed to apply` the moment a session actually tries to run. Values copied verbatim from
   * dsh's own shipped `standard` preset, the one composition guaranteed to already work.
   */
  const rowLines = (row: Row, b: string): string[] => {
    const out = [`${b}- id: ${row.id}`, `${b}  name: '${packageFor(row.id)}'`]
    const cfg = (...kv: string[]) => out.push(`${b}  config:`, ...kv.map((l) => `${b}    ${l}`))
    // `prefix`, not `text` — dsh 0.1.5 split the persona into a prefix and a suffix
    // (0.1.3-alpha.2), made `prefix` required and dropped `text`. A preset still carrying
    // `text` mounts nowhere: `agent-presets: preset "..." failed to mount: $.prefix missing
    // required value`, thrown when a session is CREATED, long after the profile booted green.
    // The suffix stays unset on purpose: it is new surface (dsh's own presets put the working
    // directory there), and this migration keeps the prompt these presets already produced.
    if (row.id === 'persona' && persona) {
      out.push(`${b}  config:`, `${b}    prefix: >-`, block(persona, `${b}      `))
    }
    // This preset's own skills (`SKILL_SETS`, built in the image from `skillSetsJson`).
    if (row.id === 'skill-filesystem')
      cfg('customSkillDirs:', `  - /opt/tracy/skill-sets/${role.id}-${platform.id}`)
    /**
     * A catalog line is a summary for CHOOSING a skill, and dsh re-sends the whole catalog on every
     * step: at dsh's default of 500 characters a line, the Designer's catalog was 6,695–7,506
     * characters of every step-1 prompt, and 55 bench runs (flow D, 05/10/2026) loaded a skill 5
     * times. 200 keeps every Tracy skill whole — they put "Use when …" first, and
     * `scripts/test/skill-catalog.test.mjs` holds each under it — and a vendor skill its first
     * sentence or two; dsh marks a cut line with "...", and the `skill` tool loads the whole skill.
     */
    if (row.id === 'tool-skill') cfg('catalogDescriptionMaxLength: 200')
    if (row.id === 'agent-instructions') cfg('maxBytes: 65536')
    /**
     * 🔒 FILE TOOL CAPS FROM THE MEASURED TAIL, NOT FROM A GUESS (09/10/2026, harness profile candidate 8).
     *
     * Every tool result is re-sent on every later step, and dsh-base's `spill-policy` (12,500 tokens,
     * about 50,000 characters, for every tool) cuts only the very end of the tail: Tracy's own site
     * answers are budgeted under it (`INSPECT_BUDGET_CHARS` 30,000), so lowering it would cut those.
     * These per-tool knobs cut where the waste is, measured over 1,980 bench sessions (24/09–05/10):
     * - `grep` showed up to 250 matches of up to 2,000 bytes each. p95 of matches shown was 105; the
     *   long previews are minified CSS/JSON lines whose start says nothing. 100 matches and 1,000
     *   bytes a preview cut 55 of 434 calls (13%) and 21% of all grep characters (27% once carried
     *   by the later steps). A match past 100 goes to dsh's own spill file, and the answer says
     *   "Found 100 of N matches" with the file and how to read it; a cut preview ends
     *   "(line truncated)" and keeps its line number for `read`.
     * - `read` keeps dsh's own caps: 2,000 characters a line, 2,000 lines, 50 KB. 🔒 NOT 1,000 A LINE
     *   (tried in #1026, reverted in its review): `read` cannot page inside a line, and Writer and
     *   SEO/GEO have no shell to reach the rest, so characters 1,000–2,000 of a long template line
     *   (block markup with its attribute JSON, an inline SVG, a one-line class list) went out of reach.
     *   An `edit` on such a line fails safely, but a whole-file `write` rebuilt from the cut read would
     *   corrupt the file — for 1.7% of read characters. The reads over 16 KB were whole template
     *   files the agent edits, so the window stays too.
     * `bash` has no per-tool knob in dsh; `@tracy/dsh-subprocess-docker` bounds it (`src/output-bound.mjs`).
     */
    if (row.id === 'tool-fs-search')
      cfg('sampleOverCapGlobResults: false', 'grepMaxMatches: 100', 'grepMaxLineBytes: 1000')
    /**
     * 🔒 THE SINGLE BIGGEST TOOL RESULT MEASURED, AND dsh's DEFAULT IS 200,000 CHARACTERS.
     *
     * A tool result is not paid for once: every later step of the turn reads the whole history
     * again, so one fetch costs its size times the steps that follow it. Measured 17/09 over four
     * decoded sessions: 8 `web_fetch` calls returned 118,725 characters — 34% of ALL tool-result
     * content across 212 calls — and in one session six of them amortised to 805,237 tokens, 30% of
     * that session's entire bill. One call returned 33,690 characters.
     *
     * 12,000 leaves a documentation page's worth of prose (~3,000 tokens) and cuts the tail that was
     * doing the damage. dsh appends its own truncation notice, so the agent is told it was cut and
     * can fetch a narrower URL rather than silently reasoning from half a page.
     */
    if (row.id === 'tool-web') cfg('fetchMaxOutputChars: 12000')
    if (row.id === 'plan-mode') {
      out.push(`${b}  config:`, `${b}    section: |`, block(PLAN_MODE_SECTION, `${b}      `))
    }
    if (row.id === 'tool-todo') cfg('allowParallelInProgress: true')
    // Values from dsh's own `standard` preset. A tool result over the threshold keeps its head and
    // its tail and loses the middle — but ONLY under compaction pressure (≥ 0.8 × 1M = 800k tokens
    // on deepseek-flash): the pruner never trims old results step by step. It never fired in r2
    // (25/09/2026, largest prompt 197,470 tokens). Capping a result as it ARRIVES is Tracy's job
    // (per-action budgets, plan D26), not this row's; never lower the threshold to force it (D27).
    if (row.id === 'tool-result-pruner') cfg('thresholdChars: 8192', 'headChars: 4096', 'tailChars: 1024')
    if (row.id === 'tool-subagent') {
      cfg(
        'provider: spawn',
        'toolName: subagent',
        'modelSelectionSettings: true',
        'backgroundMode: continuable'
      )
    }
    if (row.id === 'tool-subagent-fork')
      cfg('provider: fork', 'toolName: subagent_fork', 'backgroundMode: continuable')
    return out
  }

  // Entry indent inside `insert:` (4) + `config:` (4) + `plugins:` list (2) = column 10.
  const top = ' '.repeat(10)
  const lines = [
    `    - id: preset-${role.id}-${platform.id}`,
    "      name: '@deepseek-ai/dsh-agent-preset'",
    '      config:',
    `        id: ${role.id}-${platform.id}`,
    `        name: ${role.label} for ${platform.label}`,
    `        description: ${role.hint}`,
    '        order: 1',
    '        plugins:'
  ]
  // A realm opens at its first member's position in matrix order and takes every later member;
  // an unwrapped member throws `row(s) published process-global service(s)` at load.
  const opened = new Set<string>()
  const rows = rowsFor(matrix.tools, role.id, platform.id)
  for (const row of rows) {
    const realm = REALM_OF[row.id]
    if (realm === undefined) {
      lines.push(...rowLines(row, top))
      continue
    }
    if (opened.has(realm)) continue
    opened.add(realm)
    const { isolate } = REALMS[realm]
    lines.push(
      `${top}- id: ${realm}`,
      `${top}  name: cordis:group`,
      `${top}  group: true`,
      `${top}  isolate:`
    )
    for (const key of isolate) lines.push(`${top}    ${key}: true`)
    lines.push(`${top}  config:`)
    for (const member of rows)
      if (REALM_OF[member.id] === realm) lines.push(...rowLines(member, `${top}    `))
  }
  return lines
}

/**
 * The whole patch file: one `insert:` holding the twelve rows, in matrix order (roles, then
 * platforms). It carries NO `!!js` tag and must not grow one: `check-image-profile` reads the
 * native copy as data, and a code tag there would run at parse time unreviewed.
 */
function presetsPatchYml() {
  const lines = [
    '# Generated by scripts/gen-presets.ts from config/mode-matrix.json. Do not edit by hand:',
    '# edit the matrix and re-run, or the two drift with nothing to notice.',
    '#',
    '# Twelve `@deepseek-ai/dsh-agent-preset` rows, one per <role>-<platform>. `config.id` is the',
    '# preset identity a session stores; a restart resolves it against these rows and refuses an id',
    '# none of them declares, so an id is renamed by migrating sessions first, never here alone.',
    "# `agent-preset-registry` (in this bundle's `cordis.patch.yml`) names the default; the four",
    '# presets dsh ships stand down there too. The same file sits in @tracy/dsh-cowork-bundle and',
    '# @tracy/dsh-native-bundle, byte for byte (`gen-presets.ts --check`).',
    '- insert:'
  ]
  let first = true
  for (const role of roles) {
    for (const platform of platforms) {
      if (!first) lines.push('')
      first = false
      lines.push(...presetRow(role, platform))
    }
  }
  return `${lines.join('\n')}\n`
}

/**
 * Drops every internal note before copying into `packages/`.
 *
 * 🔒 The matrix's `note` fields are written for the people deciding, not for customers, and may be in
 * Vietnamese. `packages/` is the opposite: `check-language` forbids Vietnamese in strings there, since it
 * is a surface outsiders can read. Copying straight across would carry a Vietnamese sentence into a
 * screen's bundle — the gate catches it, but only AFTER someone has built.
 *
 * `description` stays: it is the English description taken from the `SKILL.md` itself, not our prose.
 */
function stripNotes<T extends { note?: string }>(rows: T[]) {
  return rows.map(({ note: _note, ...rest }) => rest)
}

function fixtureTs() {
  const json = JSON.stringify(
    {
      roles,
      platforms: platforms.map((p) => ({
        ...p,
        letter: p.label[0]
      })),
      // A persona is Tracy's prose and goes straight into the system prompt — it MUST be copied, and it
      // must already be English in the matrix. Overlays take only the file path, dropping `note`.
      personas: Object.fromEntries(Object.entries(matrix.personas).filter(([key]) => !key.startsWith('$'))),
      overlays: Object.fromEntries(
        Object.entries(matrix.overlays)
          .filter(([key]) => !key.startsWith('$'))
          .map(([id, o]) => [
            id,
            { persona: o.persona, prompts: o.prompts.map(({ path, kind }) => ({ path, kind })) }
          ])
      ),
      toolRows: stripNotes(matrix.tools),
      skillRows: stripNotes(matrix.skills),
      packages: Object.fromEntries(matrix.tools.map((t) => [t.id, packageFor(t.id)]))
    },
    null,
    2
  )
  return `// GENERATED by scripts/gen-presets.ts — do not edit by hand.
//
// The harness screen reads this file instead of \`config/mode-matrix.json\` directly, because a package
// may not import outside its own tree (RULE #1). Gate \`check-presets\` keeps the two in sync.

export const generated = ${json} as const
`
}

/**
 * Whether a skill row reaches one preset, by `SKILL_SETS`'s rule. The harness screen's `resolve`
 * (`packages/web/tracy-harness/src/matrix.ts`) applies the same rule to the rows it shows.
 */
function skillReaches(row: Row, role: string, platform: string): boolean {
  if (!platforms.some((p) => row.platforms?.[p.id] === true)) return row.roles?.[role] === true
  if (row.platforms?.[platform] !== true) return false
  return !roles.some((r) => row.roles?.[r.id] === true) || row.roles?.[role] === true
}

/** `SKILL_SETS`: each preset's skills, by the rule above. */
function skillSetsJson() {
  const sets: Record<string, string[]> = {}
  for (const role of roles)
    for (const platform of platforms)
      sets[`${role.id}-${platform.id}`] = matrix.skills
        .filter((row) => skillReaches(row, role.id, platform.id))
        .map((row) => row.id)
  const $comment =
    "GENERATED by scripts/gen-presets.ts from config/mode-matrix.json — do not edit. The dsh image links each preset's skills from /opt/tracy/skills into /opt/tracy/skill-sets/<role>-<platform>, which that preset reads."
  return `${JSON.stringify({ $comment, presets: sets }, null, 2)}\n`
}

/**
 * The skills the dsh image installs into `/opt/tracy/skills`, from the same four sources as its
 * Dockerfile and `dev-skills.mjs`: OpenDesign's `tracy-enabled.txt` (from `skills/` or
 * `design-templates/`), Matt Pocock's `matt-enabled.txt` (four group folders), Tracy's own
 * `tracy-design-skill/skills`, and `joomlart-t4-template` (linked in by the Dockerfile).
 */
function installedSkills(): string[] {
  const listed = (file: string) =>
    readFileSync(join(repo, file), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
  const od = listed('vendor/tracy/od-skill/tracy-enabled.txt').filter((name) =>
    ['skills', 'design-templates'].some((dir) => existsSync(join(repo, 'vendor/tracy/od-skill', dir, name)))
  )
  const matt = listed('packages/design/tracy-design-skill/matt-enabled.txt').filter((name) =>
    ['engineering', 'productivity', 'misc', 'in-progress'].some((group) =>
      existsSync(join(repo, 'vendor/tracy/mattpocock-skills/skills', group, name))
    )
  )
  const tracy = readdirSync(join(repo, 'packages/design/tracy-design-skill/skills'))
  return [...new Set([...od, ...matt, ...tracy, 'joomlart-t4-template'])].sort()
}

// ── generate, or compare ─────────────────────────────────────────────────────────────────────

const wanted = new Map<string, string>()
const presets = presetsPatchYml()
for (const bundle of BUNDLES) wanted.set(`${bundle}/${PRESETS_FILE}`, presets)
wanted.set(FIXTURE, fixtureTs())
wanted.set(SKILL_SETS, skillSetsJson())

const problems: string[] = []
// 🔒 A skill the image installs with no row would ship read by no preset, and nothing would say so.
const rowIds = new Set(matrix.skills.map((row) => row.id))
for (const name of installedSkills())
  if (!rowIds.has(name))
    problems.push(
      `skill ${name} is installed in the image but has no row in config/mode-matrix.json: decide its roles`
    )
for (const [file, body] of wanted) {
  const path = join(repo, file)
  if (check) {
    if (!existsSync(path)) problems.push(`missing: ${file}`)
    else if (readFileSync(path, 'utf8') !== body) problems.push(`drifted from the matrix: ${file}`)
    continue
  }
  writeFileSync(path, body)
}

/**
 * 🔒 A GENERATED FILE NO BUNDLE LISTS IS NOT LOADED, AND NOTHING SAYS SO. dsh applies only the
 * files a bundle names in `dsh.bundle.patch`; drop the entry and the twelve rows vanish while this
 * gate, comparing file contents, would stay green. The session then dies on `preset ... not found`
 * at creation, long after boot. `files` is checked too: the image copies the package directory
 * whole, but a packed tarball keeps only what `files` names.
 */
for (const bundle of BUNDLES) {
  const manifestPath = join(repo, bundle, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    files?: unknown
    dsh?: { bundle?: { patch?: unknown } }
  }
  const declared = manifest.dsh?.bundle?.patch
  const patches = typeof declared === 'string' ? [declared] : Array.isArray(declared) ? declared : []
  if (!patches.includes(`./${PRESETS_FILE}`))
    problems.push(`${bundle}/package.json: dsh.bundle.patch does not list ./${PRESETS_FILE}`)
  if (!Array.isArray(manifest.files) || !manifest.files.includes(PRESETS_FILE))
    problems.push(`${bundle}/package.json: files does not list ${PRESETS_FILE}`)
}

// The retired folder layout is drift too: nothing reads it since dsh 0.1.7-rc.2, yet a reader
// would take it for the presets that run.
const retired = join(repo, RETIRED_PRESETS_DIR)
if (existsSync(retired)) {
  if (check) problems.push(`retired, nothing loads it since dsh 0.1.7-rc.2: ${RETIRED_PRESETS_DIR}`)
  else rmSync(retired, { recursive: true })
}

if (check) {
  if (problems.length > 0) {
    console.error(`Preset gate: ${problems.length} problem(s)\n`)
    for (const p of problems) console.error(`  ${p}`)
    console.error('\n  Run `pnpm exec tsx scripts/gen-presets.ts` and commit what it writes.')
    process.exit(1)
  }
  console.log(`Preset gate: ${wanted.size} files match the matrix.`)
} else {
  if (problems.length > 0) {
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log(`Wrote ${wanted.size} files for ${roles.length}×${platforms.length} modes.`)
}
