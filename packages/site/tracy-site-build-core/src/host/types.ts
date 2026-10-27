/**
 * The minimal shape of what dsh hands the host half — declared here, NOT imported from
 * `@deepseek-ai/dsh-*`. Same reason as `tracy-brand-engine/src/host/types.ts`: those packages are
 * the host's own services, present at run time because dsh loads them; adding them to this
 * plugin's `dependencies` pulls a second copy onto the customer's disk, and `check-self-contained`
 * reads `package.json`, not intent.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

export interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void
}

/** One session of the harness, as much of it as the standing plan needs. */
export interface SessionLike {
  id: string
  header?: { cwd?: string }
  append: (type: string, data: unknown) => unknown
  /** The session's own log. Read to tell what language the customer is speaking (`words.mjs`). */
  snapshotEvents?: () => readonly unknown[]
}

/** One agent, as much of it as a one-line report needs. */
export interface AgentLike {
  /** Queue model-facing context for the agent's next step, without waking it. */
  inject: (message: unknown) => void
  /** Queue a separate follow-up turn without interrupting the current turn. */
  followup?: (message: unknown) => void
}

export interface HostContext {
  webServer: { register: (route: WebRoute) => () => void }
  /** dsh's tool registry: a plain definition object — name · description · parameters · output · execute. */
  tools: { register: (tool: Record<string, unknown>) => () => void }
  effect: (setup: () => () => void, label?: string) => void
  /**
   * Read a service WITHOUT declaring it in `inject`, the way `dsh-user-questions` reads `agents`.
   *
   * `sessions`, `agents` and `logger` are read this way on purpose: they carry the standing plan
   * (`todos.mjs`), which is worth nothing in a composition that has no sessions — and an `inject`
   * entry there would take the Build tab down with it rather than losing a task list. cordis
   * throws on an undeclared PROPERTY read; `get` is a method and answers undefined.
   */
  get: (key: string) => OptionalService | undefined
}

/**
 * As much of `sessions`, `agents` and `logger` as the standing plan touches — every member
 * optional, because one `get` answers all three and a composition may carry none of them.
 */
export interface OptionalService {
  /** `sessions`: every open session. */
  list?: () => SessionLike[]
  /** `agents`: the agent owning a session id. */
  get?: (key: string) => AgentLike | undefined
  /** `logger`: where a refused append goes. */
  warn?: (line: string) => void
  /**
   * `userQuestions`: put a question to the person and wait for their answer. The client renders it
   * in place of the composer, so it is the one surface a customer cannot scroll past.
   */
  ask?: (request: {
    questions: readonly {
      id: string
      question: string
      detail?: string
      header?: string
      options?: readonly { label: string; description?: string }[]
    }[]
    agent?: unknown
    signal?: AbortSignal
  }) => Promise<{ answers?: { id?: string; selected?: string[]; custom?: string }[] }>
}

/** What a command run on the lane answers with. */
export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

/** A stage function, as `build.mjs` runs it — that module owns the shape. */
export type StageFn = import('./build.mjs').StageFn

/** What a CMS's `makeStages` is handed — everything shared, bound to one build. */
export interface StageDeps {
  /** The build's folder: where design-preview.json, the copy and the job live. */
  root: string
  /** The catalog's inspiration ids. */
  ids: Set<string>
  /** The catalog's display names by id, for the site's design record (`docs/agents/design.json`). */
  names?: Map<string, string>
  /** Sends the site's design record to tracy-web, which owns it (ADR 0023, "Addendum 29/09"). */
  putDesign?: (siteKey: string, record: Record<string, unknown>) => Promise<unknown>
  /** Where a line nobody else would say goes: dsh's logger, else the console. */
  warn?: (line: string) => void
  /** Runs a command on THIS machine (the seeder, the browser), in `root`. */
  run: (cmd: string, args: string[]) => Promise<RunResult>
  /** One take through design-inspiration's copy door. */
  copyHome: (req: {
    id: string
    prompt: string
    lang?: string
    chip?: string
  }) => Promise<{ ok: true; version: { id: string; title: string } } | { ok: false; message: string }>
  /** The seeder command the image ships for this platform, or null. */
  seeder: { command: string; args: string[] } | null
  /** The browser that takes the picture, or null. */
  chrome: string | null
  /** One call on the site through the seat door, in the name of the person who pressed. */
  apply: (call: { siteKey: string; action: string; params?: Record<string, unknown> }) => Promise<unknown>
  /** How a stage waits between two tries of a transient call. A test hands in one that does not. */
  wait?: (ms: number) => Promise<void>
  /** Where the seeder reaches this lane's site-tools door. */
  doorOrigin: string
  /** An HTTP client a stage may use to ask a site whether it answers. A test hands in its own. */
  get?: typeof fetch
  /**
   * The environment a stage reads its lending from: the docker socket it reaches a site's own
   * container through, and the model keys it passes on (EmDash's `personalize`). A test hands in
   * a table of its own rather than the process's.
   */
  env?: Record<string, string | undefined>
}

/**
 * What makes a Build plugin the WordPress one or the Joomla one. Everything else is shared
 * (`host.ts`, `client.tsx`), and bundled into each plugin from this library.
 */
export interface CmsSpec {
  /** Capability commands implemented by this CMS's fixed recipe. */
  requests?: Record<
    string,
    {
      recipe: string
      /** Rerun a stage of the build with the answers changed (`reviseBuild`). */
      change?: (
        input: Record<string, unknown>,
        job: import('./build.mjs').Job
      ) => { answers: Record<string, unknown>; stage: string; inspiration?: string }
      /**
       * Do the thing now and answer, without touching the build's stages or its answers — for
       * operations on the site's container (restart, rebuild) that are not a rewrite of the
       * site's content. `reviseBuild` merges a request's answers into the job for good, so an
       * operation that is not an answer must not travel that road.
       */
      perform?: (
        input: Record<string, unknown>,
        job: import('./build.mjs').Job,
        deps: {
          /** The site folder the operation acts on (`docs/agents/design.json` lives there). */
          root: string
          run: (cmd: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>
          env: Record<string, string | undefined>
          onLine: (line: string) => void
          /** Sends the site's design record to tracy-web after an operation changed the look (ADR 0023). */
          putDesign?: (siteKey: string, record: Record<string, unknown>) => Promise<unknown>
          warn?: (line: string) => void
        }
      ) => Promise<{
        ok: boolean
        detail: string
        /** A refusal code the agent can act on (`refusalNext` in site-tools), e.g. `NOT_SIGNED_IN`. */
        code?: string
        /** A document the operation read (`site.inspect`), handed to the agent as it is. */
        result?: unknown
        /**
         * What the operation found that the agent must fix before it replies — `site.rebuild` on a site
         * wearing a design-system slot: each class written since the last build that pins a value the
         * slot owns (`slot-pins.mjs` in the EmDash build).
         */
        findings?: unknown[]
        /** The agent's next step, when the operation's own differs from the default. */
        next?: string
      }>
      /**
       * One sentence the agent reads before calling this operation.
       *
       * It exists because the tool description is where an agent decides what to PROMISE. A
       * capability that quietly covers less than its name suggests, or that only works for some
       * inputs, has to say so here — the alternative is an agent telling a customer their site
       * will be in Chinese and finding out at the end that it cannot be.
       */
      hint?: string
      /** Locales this operation accepts, when it is limited to a reviewed set. */
      locales?: string[]
    }
  >
  /** Optional capability catalog; providers need registered executors before they can run. */
  capabilities?: import('./capabilities.mjs').Catalog
  /** The cordis plugin name — the row in `cordis.patch.yml` (LAW #2). */
  name: string
  /** `wordpress` | `joomla`: what `start` accepts and `check` compares the site against. */
  platform: string
  /** How the agent and the customer read it: "WordPress". */
  platformName: string
  /** The stage names, in order. Distinct, and each one a key of the plugin's `words/<lang>.json`. */
  stages: readonly string[]
  /** The agent's tool: `tracy_site_build_wordpress`. The routes answer at `/api/<name>`. */
  tool: string
  /** The stages, bound to one build. */
  makeStages: (deps: StageDeps) => Record<string, StageFn>
  /**
   * The package root holding `words/` — set by the plugin from its own `import.meta.url` when
   * the bundle's own resolution would not land there. Normally undefined: `words.mjs` walks up
   * from the bundle it runs in, which IS the plugin.
   */
  wordsRoot?: string
  /**
   * What the Build workspace's Admin view offers for this CMS: the settings a comment may be
   * about, each named by the key the apply door writes (`content.update {kind:'option', key}` on
   * WordPress). Only settings the adapter can act on belong here — a row the agent cannot reach
   * is a promise the UI makes on its behalf.
   */
  workspace?: {
    settings?: readonly { id: string; label: string; field: string }[]
  }
}

/** What a bundle may set on this plugin's row. Everything has a default that fits a lane. */
export interface Config {
  /** The folder a build keeps `docs/agents/` in when no session says otherwise. Default: where dsh stands. */
  siteDir?: string
  /** Where the image keeps the theme zips. Default: `/opt/tracy/cms`. */
  cmsDir?: string
  /** The image's design catalog (inspiration ids) — the road back when the library cache is empty. Default: `/opt/tracy/design-catalog.json`. */
  catalog?: string
  /** The design-inspiration host's library cache. Default: `$DSH_HOME/design-library`. */
  libraryCache?: string
  /** The Tracy this dsh belongs to, asked for its design-system switch. Default: `MCP_TRACY_ORIGIN`. */
  tracyOrigin?: string
  /**
   * Test injection: how the lane's commands run, which browser takes the picture, where dsh's own
   * routes answer over loopback. A bundle never sets these.
   */
  run?: (cmd: string, args: string[]) => Promise<RunResult>
  chrome?: string | null
  loopback?: string
}
