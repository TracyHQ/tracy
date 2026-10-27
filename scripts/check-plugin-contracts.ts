/**
 * Gate: wiring rules between files of dsh plugins that no compiler, no import and no runtime joins.
 *
 * WHY THIS IS A GATE AND NOT UNIT TESTS. Every check below reads a file of the repo as DATA and
 * concludes "the repo is wired correctly": one plugin's source against another tree's route, a
 * client string against a translation file, a slot registration against a catalogue that lives in
 * a submodule. That is not a claim about what code DOES, so it does not belong in a plugin's unit
 * tier (where it was: `identity` x3, `words` x4, `seat-only-tab` x2, `viewing-session-door`,
 * `slot-registration`, `anchored-menus`, `build-message`, `no-handoff-page`, `palette`,
 * `tokens-link`). In a unit tier such a test is a change detector: it fails on a harmless edit,
 * and the run that finds it red is the one that had no reason to open that file.
 *
 * WHAT `check-plugin-identity` ALREADY COVERS AND THIS DOES NOT REPEAT: package `name` = cordis row
 * name = `__ModuleLoader__` id, and that `dsh.client.inject` names real packages. This gate adds
 * what that one cannot see:
 *
 *   - seat-only tabs: `tracy:add-site` and `tracy:my-sites` register through `seatOnlyTab`, never
 *     straight through the side card (a guest would meet a tab that ends in a 403);
 *   - the viewing-session door: the HTTP method the plugin sends is the one `tracy-web` registers
 *     (a POST against a GET door answers 302, no token, every "Open live site" opens signed out);
 *   - the three Build plugins: the cordis row id = the host name, the client's inject list, tab,
 *     tool and stages, every stage named in all three `words/*.json` and in the client strings,
 *     the retry label spelled the same in `words/` and in the client (English and Vietnamese),
 *     `words` listed in `files`, and for EmDash the default questionnaire;
 *   - the Build sentence: the id in parentheses that the agent answers `ask` with, in the client
 *     string, the Vietnamese catalogue and the tool description;
 *   - the Build client puts nothing over the page and stores no handoff;
 *   - every `slots.register` into a dsh slot carries the option that slot's KIND demands (a throw
 *     at register time blanks the whole client);
 *   - no anchored `@tracy/ui` popup in a plugin client (React 18 drops the `ref`);
 *   - the generated dsh palette holds only literals, both modes for every alias, and no accent;
 *   - dsh's tooltip bubble stays dark in both modes while dsh prints its label in static white;
 *   - the dark overlay of a design fixture reaches the `.page` wrapper;
 *   - every vendored token preview page still has the `../tokens.css` link `inlineTokens` inlines.
 *
 * It runs like any other gate: cwd is the repo root, a non-zero exit is a failure.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** A single problem found. */
export interface Problem {
  /** Repo-relative file the problem lives in. */
  readonly file: string
  /** What is wrong. */
  readonly message: string
}

const problem = (file: string, message: string): Problem => ({ file, message })

/** The same text with block and line comments blanked, so a rule cannot be met by a sentence about it. */
export const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

// ── seat-only tabs ────────────────────────────────────────────────────────────────────────────

/** The plugins whose tab a stranger must never meet, and the tab id each declares. */
export const SEAT_ONLY_TABS = [
  { dir: 'packages/site/tracy-add-site', tabId: 'tracy:add-site' },
  { dir: 'packages/site/tracy-my-sites', tabId: 'tracy:my-sites' },
  { dir: 'packages/site/tracy-inbox', tabId: 'tracy:inbox' }
] as const

/**
 * A seat-only plugin registers its tab through `seatOnlyTab`.
 * @param file - label for messages.
 * @param source - the plugin's `src/client/index.tsx`.
 * @param tabId - the tab id the plugin must declare.
 */
export function checkSeatOnlyTab(file: string, source: string, tabId: string): Problem[] {
  const code = withoutComments(source)
  const out: Problem[] = []
  if (!code.includes(`const TAB_ID = '${tabId}'`)) out.push(problem(file, `TAB_ID is no longer '${tabId}'`))
  // Other names may share the import (`readViewer`, `mayHoldSeatOnlyTab`): what counts is that this one is there.
  if (!/import \{[^}]*\bseatOnlyTab\b[^}]*\} from '@tracy\/core\/seat'/.test(code))
    out.push(problem(file, "does not import seatOnlyTab from '@tracy/core/seat'"))
  if (!/seatOnlyTab\(\s*ctx\.betterSidebar,\s*TAB_ID,/.test(code))
    out.push(problem(file, 'does not register its tab through seatOnlyTab(ctx.betterSidebar, TAB_ID, ...)'))
  if (code.includes('betterSidebar.registerTab('))
    out.push(
      problem(file, 'calls betterSidebar.registerTab straight from the plugin: a guest would see this tab')
    )
  return out
}

// ── viewing-session door ──────────────────────────────────────────────────────────────────────

/**
 * The plugin calls the viewing-session door with the method `tracy-web` registers.
 * @param pluginFile - label of the plugin host file.
 * @param plugin - `tracy-add-site/src/host/index.ts`.
 * @param web - `apps/tracy-web/src/sites/route.js`.
 */
export function checkViewingSessionDoor(pluginFile: string, plugin: string, web: string): Problem[] {
  const served = /app\.(get|post|put)\(\s*'\/api\/sites\/:key\/viewing-session'/.exec(web)
  if (!served) return [problem(pluginFile, 'tracy-web no longer registers the viewing-session door')]
  const call = /\/viewing-session`,\s*\{\s*method:\s*'([A-Z]+)'/.exec(plugin)
  if (!call) return [problem(pluginFile, 'the plugin no longer calls the viewing-session door')]
  const wanted = (served[1] ?? '').toUpperCase()
  return call[1] === wanted
    ? []
    : [
        problem(
          pluginFile,
          `the plugin sends ${call[1]} but tracy-web registers ${wanted} for the viewing-session door`
        )
      ]
}

// ── the three Build plugins ───────────────────────────────────────────────────────────────────

/** What differs between the Build plugins; everything else is the same rule. */
export interface BuildSpec {
  readonly id: 'joomla' | 'wordpress' | 'emdash'
  /**
   * The `stages: [...]` literal the client passes: the host's own `STAGES`, in its order. The tab
   * counts and fills by this list's length while the job it reads carries the host's stages, so a
   * shorter list here reads "6 of 6" while the last stage still runs (#811 F-S4-001).
   */
  readonly clientStages: readonly string[]
  /** Stages `words/*.json` and the client strings must name (a superset of the client's list). */
  readonly wordStages: readonly string[]
  /** Stage names of another plugin that `words/*.json` must NOT carry (a label would be a promise). */
  readonly foreignStages: readonly string[]
}

const ALL_STAGE_NAMES = ['theme', 'template', 'style', 'copy', 'seed', 'language', 'plugin', 'personalize']

export const BUILD_SPECS: readonly BuildSpec[] = [
  {
    id: 'joomla',
    clientStages: ['check', 'template', 'style', 'copy', 'seed', 'language', 'shot'],
    wordStages: ['check', 'template', 'style', 'copy', 'seed', 'language', 'shot'],
    foreignStages: []
  },
  {
    id: 'wordpress',
    clientStages: ['check', 'theme', 'style', 'copy', 'seed', 'shot'],
    wordStages: ['check', 'theme', 'style', 'copy', 'seed', 'shot'],
    foreignStages: []
  },
  {
    id: 'emdash',
    clientStages: ['check', 'personalize', 'shot'],
    wordStages: ['check', 'personalize', 'shot'],
    // For EmDash the archive is the site: a label for a stage it does not run would be a promise.
    foreignStages: ALL_STAGE_NAMES.filter((name) => name !== 'personalize')
  }
]

/** What every Build client asks dsh to inject: the shared half reads exactly these. */
export const BUILD_CLIENT_INJECT = [
  'betterSidebar',
  'locale',
  'slots',
  'uiConversation',
  'sessions',
  'remote',
  'remote.agentPresets',
  'workspaces'
]

/**
 * The default EmDash questionnaire: the same seven questions as every CMS since 07/10/2026 (#1013, D11),
 * each read by a stage (the brand step for logo/favicon, the template tool for the rest), then `business`,
 * read only by Build from my business (`site.business`, #1640).
 */
export const EMDASH_QUESTION_IDS = [
  'name',
  'logo',
  'favicon',
  'about',
  'pages',
  'languages',
  'tone',
  'business'
]

/** The files of one Build plugin this gate reads. */
export interface BuildFiles {
  readonly packageJson: string
  readonly cordisPatch: string
  readonly hostIndex: string
  readonly client: string
  readonly strings: string
  readonly coreStrings: string
  readonly words: Readonly<Record<'en' | 'vi' | 'zh', string>>
  readonly viCatalogue: string
  readonly questions: string
}

const stringLiteral = (source: string, key: string): string | undefined => {
  const found = new RegExp(`'${key.replace(/\./g, '\\.')}':\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(source)
  return found?.[1]?.replace(/\\'/g, "'")
}

/**
 * One Build plugin's cross-file wiring.
 * @param spec - which plugin, and how its stages differ.
 * @param files - the plugin's files as text.
 */
export function checkBuildPlugin(spec: BuildSpec, files: BuildFiles): Problem[] {
  const at = (rel: string) => `packages/site/tracy-site-build-${spec.id}/${rel}`
  const out: Problem[] = []

  // 1. package name, host name and cordis row id agree.
  const manifest = JSON.parse(files.packageJson) as { name?: string; files?: string[] }
  const hostName = /export const name = '([^']+)'/.exec(files.hostIndex)?.[1]
  if (manifest.name !== `@tracy/dsh-site-build-${spec.id}`)
    out.push(
      problem(at('package.json'), `name is ${manifest.name}, expected @tracy/dsh-site-build-${spec.id}`)
    )
  if (hostName !== `tracy-site-build-${spec.id}`)
    out.push(
      problem(at('src/host/index.ts'), `host name is ${hostName}, expected tracy-site-build-${spec.id}`)
    )
  const rows =
    (load(files.cordisPatch) as Array<{ insert?: Array<{ id?: string; name?: string }> }> | null) ?? []
  const row = rows.flatMap((entry) => entry.insert ?? [])[0]
  if (row?.id !== hostName || row?.name !== manifest.name)
    out.push(
      problem(
        at('cordis.patch.yml'),
        `row is {id: ${row?.id}, name: ${row?.name}}, expected {id: ${hostName}, name: ${manifest.name}}`
      )
    )

  // 2. package.json `files` carries the words: the image copies the folder as declared.
  if (!(manifest.files ?? []).includes('words'))
    out.push(
      problem(at('package.json'), 'files does not list "words": a packed copy would arrive without them')
    )

  // 3. the client declares exactly what the shared half reads, and names its own tab, tool and stages.
  const declared = /export const inject = \[([^\]]*)\]/.exec(files.client)?.[1] ?? ''
  const injected = [...declared.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
  if (JSON.stringify(injected) !== JSON.stringify([...BUILD_CLIENT_INJECT].sort()))
    out.push(problem(at('src/client/index.tsx'), `client inject is [${injected.join(', ')}]`))
  if (!files.client.includes(`tab: 'tracy:build:${spec.id}'`))
    out.push(problem(at('src/client/index.tsx'), `tab is not 'tracy:build:${spec.id}'`))
  if (!files.client.includes(`tool: 'tracy_site_build_${spec.id}'`))
    out.push(problem(at('src/client/index.tsx'), `tool is not 'tracy_site_build_${spec.id}'`))
  const stagesLiteral = /stages: \[([^\]]*)\]/.exec(files.client)?.[1] ?? ''
  const clientStages = [...stagesLiteral.matchAll(/'([^']+)'/g)].map((m) => m[1])
  if (clientStages.join(',') !== spec.clientStages.join(','))
    out.push(problem(at('src/client/index.tsx'), `stages are [${clientStages.join(', ')}]`))

  // 4. every stage is named in every language and in the client strings; no stage of another plugin.
  for (const lang of ['en', 'vi', 'zh'] as const) {
    const words = JSON.parse(files.words[lang]) as { stages?: Record<string, unknown>; retry?: unknown }
    for (const name of spec.wordStages)
      if (typeof words.stages?.[name] !== 'string')
        out.push(problem(at(`words/${lang}.json`), `stages.${name} is not a string`))
    for (const foreign of spec.foreignStages)
      if (words.stages?.[foreign] !== undefined)
        out.push(problem(at(`words/${lang}.json`), `names a stage this plugin does not run: ${foreign}`))
  }
  for (const name of spec.wordStages)
    for (const half of ['run', 'done']) {
      const key = `'stage.${name}.${half}'`
      if (!files.strings.includes(key) && !files.coreStrings.includes(key))
        out.push(
          problem(at('src/client/strings.ts'), `${key} is in neither this plugin's strings nor core's`)
        )
    }

  // 5. the retry label reads the same on both sides, in English and in Vietnamese.
  const retry =
    stringLiteral(files.strings, 'building.retry') ?? stringLiteral(files.coreStrings, 'building.retry')
  const enWords = JSON.parse(files.words.en) as { retry?: string }
  const viWords = JSON.parse(files.words.vi) as { retry?: string }
  const viCatalogue = JSON.parse(files.viCatalogue) as Record<string, string>
  if (retry === undefined) out.push(problem(at('src/client/strings.ts'), "no 'building.retry' string"))
  else if (enWords.retry !== retry)
    out.push(
      problem(
        at('words/en.json'),
        `retry is ${JSON.stringify(enWords.retry)}, the client says ${JSON.stringify(retry)}`
      )
    )
  if (viWords.retry !== viCatalogue['building.retry'])
    out.push(
      problem(
        at('words/vi.json'),
        `retry is ${JSON.stringify(viWords.retry)}, the vi catalogue says ${JSON.stringify(viCatalogue['building.retry'])}`
      )
    )

  // 6. EmDash: the questionnaire is data beside the bundle and asks only what a stage reads.
  if (spec.id === 'emdash') {
    if (/questions\.json/.test(files.client))
      out.push(
        problem(at('src/client/index.tsx'), 'inlines questions.json: the host serves the questionnaire')
      )
    const ids = (JSON.parse(files.questions) as { questions: Array<{ id: string }> }).questions.map(
      (q) => q.id
    )
    if (ids.join(',') !== EMDASH_QUESTION_IDS.join(','))
      out.push(
        problem(
          at('questions.json'),
          `asks [${ids.join(', ')}], expected [${EMDASH_QUESTION_IDS.join(', ')}]`
        )
      )
  }
  return out
}

// ── the Build sentence ────────────────────────────────────────────────────────────────────────

/**
 * The Build press speaks to the agent in one sentence carrying the inspiration id, and the tool
 * description tells the agent where to find it.
 * @param strings - design-inspiration `src/client/strings.ts`.
 * @param viCatalogue - the vi catalogue JSON of that plugin.
 * @param hostTs - `tracy-site-build-core/src/host/host.ts`.
 */
export function checkBuildSentence(strings: string, viCatalogue: string, hostTs: string): Problem[] {
  const file = 'packages/design/tracy-design-inspiration/src/client/strings.ts'
  const out: Problem[] = []
  const en = /'msg\.buildWith':\s*'([^']*)'/.exec(strings)?.[1]
  if (en === undefined) out.push(problem(file, "'msg.buildWith' is missing"))
  else if (!/"\{name\}" \(\{id\}\) with \{platform\}/.test(en))
    out.push(problem(file, `msg.buildWith no longer carries the id: ${en}`))
  const vi = (JSON.parse(viCatalogue) as Record<string, string>)['msg.buildWith'] ?? ''
  if (!/"\{name\}" \(\{id\}\)/.test(vi))
    out.push(
      problem(
        'packages/locale/tracy-locale-vi/vi/tracy-design-inspiration.json',
        `msg.buildWith no longer carries the id: ${vi}`
      )
    )
  // The description is one sentence written as concatenated literals; join them before reading it.
  const tool = hostTs.replace(/' \+\s*'/g, '')
  if (!/Build "<name>" \(<id>\) with \$\{spec\.platformName\} on this site\./.test(tool))
    out.push(
      problem(
        'packages/site/tracy-site-build-core/src/host/host.ts',
        'the tool description no longer names the "<name>" (<id>) shape'
      )
    )
  return out
}

// ── the Build client takes the customer nowhere ───────────────────────────────────────────────

/**
 * A build never takes the customer to a second page: no handoff, no overlay, no handoff words.
 * @param client - each file of `tracy-site-build-core/src/client` (name and text).
 */
export function checkNoHandoff(client: ReadonlyArray<{ name: string; text: string }>): Problem[] {
  const out: Problem[] = []
  const dir = 'packages/site/tracy-site-build-core/src/client'
  for (const { name, text } of client) {
    const code = withoutComments(text)
    if (name === 'construction-handoff.tsx' || name === 'construction-session.ts')
      out.push(problem(`${dir}/${name}`, 'the handoff module is back'))
    if (/\.(tsx?|mjs)$/.test(name)) {
      if (code.includes('tracy-site-build:construction'))
        out.push(problem(`${dir}/${name}`, 'writes a handoff again'))
      if (/location\.assign\(\s*`\/\$\{/.test(code))
        out.push(
          problem(
            `${dir}/${name}`,
            "navigates to another site's page; the build belongs where the customer is"
          )
        )
      if (code.includes("'shell.overlay'"))
        out.push(problem(`${dir}/${name}`, 'registers a full-screen overlay'))
    }
    if (name === 'strings.ts') {
      if (text.includes("'handoff."))
        out.push(problem(`${dir}/${name}`, 'still ships the handoff dictionary'))
      if (text.includes("'form.notAttached'"))
        out.push(problem(`${dir}/${name}`, 'still ships the handoff refusal'))
    }
  }
  return out
}

// ── dsh slot registrations ────────────────────────────────────────────────────────────────────

/** The option a registration into a slot of this kind must carry, or null when it needs none. */
const REQUIRED_BY_KIND: Readonly<Record<string, string | null>> = {
  list: 'id',
  keyed: 'key',
  chain: 'select',
  single: null
}

/** Every slot dsh declares, as name to kind. Read from dsh's own catalogue, never restated. */
export function slotKinds(catalog: string): Map<string, string> {
  const kinds = new Map<string, string>()
  for (const m of catalog.matchAll(/key:\s*'([^']+)',\s*\n\s*kind:\s*'([a-z]+)'/g))
    kinds.set(m[1] as string, m[2] as string)
  return kinds
}

/** The object literal starting at `from`, read by BALANCING braces (a fixed window fails open). */
const objectAt = (src: string, from: number): string => {
  let depth = 0
  for (let i = from; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(from + 1, i)
  }
  return ''
}

/** Every `slots.register({ name: ... })` call, as file, slot and the options text without comments. */
export function registrations(
  sources: ReadonlyArray<{ file: string; text: string }>
): Array<{ file: string; slot: string; options: string }> {
  const found: Array<{ file: string; slot: string; options: string }> = []
  for (const { file, text } of sources)
    for (const m of text.matchAll(/slots\.register\(\s*\{/g)) {
      const options = withoutComments(objectAt(text, (m.index ?? 0) + m[0].length - 1))
      const name = /name:\s*'([^']+)'/.exec(options)
      if (name) found.push({ file, slot: name[1] as string, options })
    }
  return found
}

/**
 * The child slots a Tracy registration declares itself, as name to kind: the `children` table of
 * a `slots.register` (`@tracy/dsh-sidebar` re-declares dsh's five and adds `sidebar.nav`). Such a
 * slot is as declared as one of dsh's, only by a different owner, and its kind is read the same way.
 * A name dsh's catalogue already holds keeps dsh's kind.
 * @param found - every registration, from {@link registrations}.
 */
export function declaredChildSlots(found: ReadonlyArray<{ options: string }>): Map<string, string> {
  const kinds = new Map<string, string>()
  for (const { options } of found) {
    const at = /children:\s*\{/.exec(options)
    if (!at) continue
    const table = objectAt(options, at.index + at[0].length - 1)
    for (const m of table.matchAll(/'([^']+)':\s*\{\s*kind:\s*'([a-z]+)'/g))
      kinds.set(m[1] as string, m[2] as string)
  }
  return kinds
}

/**
 * Every slot Tracy registers into is declared, by dsh or by a Tracy registration's own `children`
 * table, has at least one registration per file that fits the kind declared now, and no two list
 * registrations claim one id. A floor, not a proof: a spec built somewhere else is not matched.
 */
export function checkSlotRegistrations(
  catalog: string,
  sources: ReadonlyArray<{ file: string; text: string }>
): Problem[] {
  const kinds = slotKinds(catalog)
  if (kinds.size <= 20)
    return [
      problem(
        'slot-catalog.ts',
        `the slot catalogue looks empty (${kinds.size} slots): did the submodule land?`
      )
    ]
  const out: Problem[] = []
  const found = registrations(sources)
  for (const [name, kind] of declaredChildSlots(found)) if (!kinds.has(name)) kinds.set(name, kind)
  for (const { file, slot } of found)
    if (!kinds.has(slot))
      out.push(problem(file, `registers into "${slot}", which neither dsh nor a Tracy registration declares`))

  // Per FILE x SLOT: a plugin running against two dsh branches writes both registrations.
  const satisfied = new Set<string>()
  const seen = new Map<string, Problem>()
  for (const { file, slot, options } of found) {
    const required = REQUIRED_BY_KIND[kinds.get(slot) ?? '']
    if (!required) continue
    const key = `${file}::${slot}`
    seen.set(key, problem(file, `${kinds.get(slot)} slot "${slot}" has no registration carrying ${required}`))
    if (new RegExp(`(^|[\\s{,])${required}\\s*[:,}]`).test(options)) satisfied.add(key)
  }
  for (const [key, p] of seen) if (!satisfied.has(key)) out.push(p)

  // The id picks the cell: a reused id REPLACES the earlier entry.
  const ids = new Map<string, string>()
  for (const { file, slot, options } of found) {
    if (kinds.get(slot) !== 'list') continue
    const id = /(?:^|[\s{,])id:\s*'([^']+)'/.exec(options)
    if (!id) continue
    const key = `${slot}#${id[1]}`
    if (ids.has(key)) out.push(problem(file, `and ${ids.get(key)} both register "${key}"`))
    else ids.set(key, file)
  }
  return out
}

// ── anchored popups ───────────────────────────────────────────────────────────────────────────

const ANCHORED =
  /^(DropdownMenu|Popover|Tooltip|HoverCard|Select|Combobox|ContextMenu|Menubar|NavigationMenu)/

/**
 * Files that already imported anchored popups while their plugin was a `vendor/` subtree, outside this
 * gate (moved into `packages/` 24/10/2026, ADR 0036). Named file by file so new code still trips; fix
 * each one and drop its line.
 */
const ANCHORED_POPUP_DEBT = new Set([
  'packages/site/tracy-website-opportunities/src/client/find-advanced.tsx',
  'packages/site/tracy-website-opportunities/src/client/place-box.tsx',
  'packages/site/tracy-website-opportunities/src/client/send-demo.tsx'
])

/**
 * No anchored base UI popup from `@tracy/ui` in a plugin client: dsh's page runs React 18, which
 * drops the `ref` base UI passes to `render={<Button/>}`, and the popup opens unanchored at the
 * page corner. Use `Popover` from `@tracy/core/site-tabs`.
 */
export function checkAnchoredPopups(sources: ReadonlyArray<{ file: string; text: string }>): Problem[] {
  const out: Problem[] = []
  for (const { file, text } of sources)
    for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@tracy\/ui'/g))
      for (const raw of (m[1] as string).split(',')) {
        const name = (
          raw
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)[0] ?? ''
        ).trim()
        if (name && ANCHORED.test(name))
          out.push(problem(file, `imports ${name} from @tracy/ui: use Popover from @tracy/core/site-tabs`))
      }
  return out
}

// ── the generated dsh palette ─────────────────────────────────────────────────────────────────

/** Every alias carries both modes, every value is a literal (a `var()` on both sides is a cycle). */
export function checkPalette(
  palette: Readonly<Record<string, { light?: unknown; dark?: unknown }>>
): Problem[] {
  const file = 'packages/ui/tracy-ui/src/{tokens,dsh-bridge}.css'
  const out: Problem[] = []
  const names = Object.keys(palette)
  if (names.length < 18)
    out.push(problem(file, `expected at least the 18 bridged aliases, got ${names.length}`))
  for (const [name, modes] of Object.entries(palette)) {
    if (!/^--dsw-(alias|specific)-/.test(name)) out.push(problem(file, `${name} is not a dsh token`))
    for (const mode of ['light', 'dark'] as const) {
      const value = modes[mode]
      if (typeof value !== 'string') out.push(problem(file, `${name} has no ${mode} value`))
      else if (value.includes('var(')) out.push(problem(file, `${name}.${mode} is a var(): ${value}`))
    }
  }
  // The accent is the user's choice, computed at runtime: the bridge must not feed it a fixed value.
  for (const accent of ['--dsw-alias-brand-primary', '--dsw-alias-button-primary-fill'])
    if (palette[accent] !== undefined)
      out.push(problem(file, `${accent} is in the generated palette: the accent is the user's`))
  return out
}

/**
 * dsh's Tooltip paints `color: var(--dsw-static-neutral-bluish-00)` (white in both themes) on
 * `--dsw-alias-tooltip-bg`. Bridged to Tracy's `--popover` (white in light) the bubble was a blank
 * white box: every dsh tooltip on a Tracy surface, e.g. a comment pin's hover (29/09/2026).
 * Not bridged is fine: dsh's own dark bubble stays.
 * @param tooltipCss - dsh `ui-primitives/src/Tooltip.module.css`.
 */
export function checkTooltipBubble(
  palette: Readonly<Record<string, { light?: unknown; dark?: unknown }>>,
  tooltipCss: string
): Problem[] {
  const out: Problem[] = []
  if (!/color:\s*var\(--dsw-static-neutral-bluish-00\)/.test(tooltipCss))
    out.push(problem(TOOLTIP_CSS, 'dsh changed its tooltip label colour; revisit checkTooltipBubble'))
  const bubble = palette['--dsw-alias-tooltip-bg']
  if (bubble === undefined) return out
  for (const mode of ['light', 'dark'] as const) {
    const value = String(bubble[mode] ?? '')
    const lightness = Number(/^oklch\(\s*([\d.]+)/.exec(value)?.[1] ?? Number.NaN)
    if (!(lightness < 0.5))
      out.push(
        problem(
          'packages/ui/tracy-ui/src/{tokens,dsh-bridge}.css',
          `--dsw-alias-tooltip-bg.${mode} is ${value}: white label on a light bubble`
        )
      )
  }
  return out
}

const TOOLTIP_CSS = 'vendor/tracy/deepseek-harness/packages/client/ui-primitives/src/Tooltip.module.css'

// ── the dark overlay ──────────────────────────────────────────────────────────────────────────

/**
 * The dark block must reach the `.page` wrapper: 84 of 152 vendored fixtures paint their paper with a
 * literal gradient on `.page`, so overriding only the tokens draws light type on a light page.
 * `fixture.ts` cannot be imported by node (its type import has no extension), so the constant is read as text.
 * @param fixtureTs - design-inspiration `src/client/fixture.ts`.
 */
export function checkDarkOverrides(fixtureTs: string): Problem[] {
  const file = 'packages/design/tracy-design-inspiration/src/client/fixture.ts'
  const block = /export const DARK_OVERRIDES =([\s\S]*?)\n\n/.exec(fixtureTs)?.[1]
  if (block === undefined) return [problem(file, 'DARK_OVERRIDES is missing')]
  const out: Problem[] = []
  if (!/body,\.page\{background:var\(--bg,var\(--od-page-bg\)\)\}/.test(block))
    out.push(problem(file, 'DARK_OVERRIDES no longer paints .page with the dark canvas'))
  if (!block.includes('color-scheme:dark'))
    out.push(problem(file, 'DARK_OVERRIDES no longer sets color-scheme:dark'))
  return out
}

// ── vendored token previews ───────────────────────────────────────────────────────────────────

/**
 * A `srcDoc` cannot follow a relative `<link>`: every token preview must lose its `../tokens.css`
 * link when `inlineTokens` runs, or it draws with Times and no colour.
 * @param pages - each preview page (repo-relative file and html).
 * @param inline - `inlineTokens` from the design-inspiration client.
 */
export function checkTokenPreviews(
  pages: ReadonlyArray<{ file: string; html: string }>,
  inline: (html: string, tokens: string) => string
): Problem[] {
  const out: Problem[] = []
  if (pages.length === 0)
    out.push(problem('vendor/tracy/od-design-system/systems', 'no token preview page found'))
  for (const { file, html } of pages) {
    const inlined = inline(html, ':root{--x:1}')
    if (!inlined.includes('data-tracy-tokens') || /href=["']\.\.\/tokens\.css/.test(inlined))
      out.push(problem(file, 'the ../tokens.css link is not inlined: the dialog would draw it unstyled'))
  }
  return out
}

// ── reading the repo ──────────────────────────────────────────────────────────────────────────

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

/** Every source file under `dir` (repo-relative) that a slot registration may live in. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(join(ROOT, dir))) return out
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === 'node_modules' || entry === 'lib' || entry === 'dist') continue
    const rel = `${dir}/${entry}`
    if (statSync(join(ROOT, rel)).isDirectory()) sourceFiles(rel, out)
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(rel)
  }
  return out
}

/** Trees whose slot registrations are Tracy's to get right: `packages/`, plus the forks it keeps. */
const SLOT_TREES = ['packages', 'vendor/tracy/dsh-better-sidebar/src']
const SLOT_CATALOG =
  'vendor/tracy/deepseek-harness/packages/extensions/cordis-client-runner/src/client/slot-catalog.ts'

/** Plugin client trees where an anchored popup would break (everything but the libraries and the bench). */
function pluginClientFiles(): string[] {
  const skip = new Set(['ui/tracy-ui', 'dev/tracy-design'])
  const out: string[] = []
  for (const group of readdirSync(join(ROOT, 'packages'))) {
    if (!statSync(join(ROOT, 'packages', group)).isDirectory()) continue
    for (const name of readdirSync(join(ROOT, 'packages', group))) {
      if (skip.has(`${group}/${name}`)) continue
      const client = `packages/${group}/${name}/src/client`
      if (!existsSync(join(ROOT, client))) continue
      out.push(...sourceFiles(client).filter((f) => /\.tsx?$/.test(f)))
    }
  }
  return out
}

async function main(): Promise<void> {
  const problems: Problem[] = []
  const text = (file: string) => ({ file, text: read(file) })

  for (const { dir, tabId } of SEAT_ONLY_TABS)
    problems.push(
      ...checkSeatOnlyTab(`${dir}/src/client/index.tsx`, read(`${dir}/src/client/index.tsx`), tabId)
    )

  problems.push(
    ...checkViewingSessionDoor(
      'packages/site/tracy-add-site/src/host/index.ts',
      read('packages/site/tracy-add-site/src/host/index.ts'),
      read('apps/tracy-web/src/sites/route.js')
    )
  )

  const coreStrings = read('packages/site/tracy-site-build-core/src/client/strings.ts')
  for (const spec of BUILD_SPECS) {
    const dir = `packages/site/tracy-site-build-${spec.id}`
    problems.push(
      ...checkBuildPlugin(spec, {
        packageJson: read(`${dir}/package.json`),
        cordisPatch: read(`${dir}/cordis.patch.yml`),
        hostIndex: read(`${dir}/src/host/index.ts`),
        client: read(`${dir}/src/client/index.tsx`),
        strings: read(`${dir}/src/client/strings.ts`),
        coreStrings,
        words: {
          en: read(`${dir}/words/en.json`),
          vi: read(`${dir}/words/vi.json`),
          zh: read(`${dir}/words/zh.json`)
        },
        viCatalogue: read(`packages/locale/tracy-locale-vi/vi/tracy-site-build-${spec.id}.json`),
        questions: spec.id === 'emdash' ? read(`${dir}/questions.json`) : ''
      })
    )
  }

  problems.push(
    ...checkBuildSentence(
      read('packages/design/tracy-design-inspiration/src/client/strings.ts'),
      read('packages/locale/tracy-locale-vi/vi/tracy-design-inspiration.json'),
      read('packages/site/tracy-site-build-core/src/host/host.ts')
    )
  )

  const coreClient = 'packages/site/tracy-site-build-core/src/client'
  problems.push(
    ...checkNoHandoff(
      // Recursive: the client holds folders too (`ask-form/`), and reading a folder as a file throws.
      sourceFiles(coreClient).map((rel) => ({ name: rel.slice(coreClient.length + 1), text: read(rel) }))
    )
  )

  if (!existsSync(join(ROOT, SLOT_CATALOG))) {
    problems.push(problem(SLOT_CATALOG, 'missing: the deepseek-harness submodule is not initialised'))
  } else {
    problems.push(
      ...checkSlotRegistrations(read(SLOT_CATALOG), SLOT_TREES.flatMap((tree) => sourceFiles(tree)).map(text))
    )
  }

  problems.push(
    ...checkAnchoredPopups(
      pluginClientFiles()
        .filter((file) => !ANCHORED_POPUP_DEBT.has(file))
        .map(text)
    )
  )
  problems.push(...checkDarkOverrides(read('packages/design/tracy-design-inspiration/src/client/fixture.ts')))

  const { generatePalette } = await import(join(ROOT, 'packages/brand/tracy-brand/scripts/palette.mjs'))
  const palette = generatePalette(
    read('packages/ui/tracy-ui/src/tokens.css'),
    read('packages/ui/tracy-ui/src/dsh-bridge.css')
  )
  problems.push(...checkPalette(palette))
  if (!existsSync(join(ROOT, TOOLTIP_CSS)))
    problems.push(problem(TOOLTIP_CSS, 'missing: the deepseek-harness submodule is not initialised'))
  else problems.push(...checkTooltipBubble(palette, read(TOOLTIP_CSS)))

  const { inlineTokens } = await import(
    join(ROOT, 'packages/design/tracy-design-inspiration/src/client/tokens-link.mjs')
  )
  const systems = 'vendor/tracy/od-design-system/systems'
  const previews: Array<{ file: string; html: string }> = []
  if (existsSync(join(ROOT, systems)))
    for (const system of readdirSync(join(ROOT, systems)))
      for (const page of ['colors', 'typography', 'spacing']) {
        const file = `${systems}/${system}/preview/${page}.html`
        if (existsSync(join(ROOT, file))) previews.push({ file, html: read(file) })
      }
  problems.push(...checkTokenPreviews(previews, inlineTokens))

  if (problems.length > 0) {
    for (const p of problems)
      process.stderr.write(`check-plugin-contracts: ${relative(ROOT, join(ROOT, p.file))}: ${p.message}\n`)
    process.exit(1)
  }
  process.stdout.write('check-plugin-contracts: every cross-file contract holds\n')
}

// Guarded so the checkers can be imported by a test without running `main()` against the repo.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`check-plugin-contracts: ${String(error)}\n`)
    process.exit(1)
  })
}
