/**
 * The minimal shape of what dsh hands the host half — declared here, NOT imported from
 * `@deepseek-ai/dsh-*` (same reason as `tracy-site-tabs/src/host/types.ts`: those are the host's own
 * services, present at run time; declaring them as dependencies pulls a second copy onto the
 * customer's disk, and `@deepseek-ai/dsh-tools` in particular cannot even be installed into a
 * workspace plugin — see `tracy-design-inspiration/src/host/index.ts`).
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

export interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void
}

/**
 * What a tool's `execute(args, exec)` may read off `exec`: the agent's session, and the model route
 * this call runs on. The route is read the way `read_image` reads it — the request header of the
 * epoch in flight first, then the options the session was created with — so `page.look` can tell
 * whether `read_image` would accept the picture it just saved.
 */
export interface ToolRun {
  agent?: {
    session?: {
      id?: string
      header?: { cwd?: string }
      requestHeader?: () => { config?: { provider?: string; model?: string } } | undefined
      /** The log's length and a reader of one event: what `customerWords` (site-notes.mjs) walks. */
      seq?: number
      eventAt?: (seq: number) => unknown
    }
    options?: { provider?: string; model?: string }
  }
  /**
   * The caller's cancellation for this call: dsh's tool registry requires one on every execution
   * (`ToolExecutionInput.signal`), aborted when the customer presses Stop. Optional here for test doubles.
   */
  signal?: AbortSignal
}

export interface HostContext {
  webServer: { register: (route: WebRoute) => () => void }
  /**
   * dsh's live agent registry: who is a root, who owns whom at run time — what puts a subagent's call
   * under its root's chat turn (`turn-header.mjs`). Optional in a test double.
   */
  agents?: {
    roots: () => { session: { id: string } }[]
    list: () => { session: { id: string } }[]
    isOwnedBy: (id: string, owner: { session: { id: string } }) => boolean
  }
  /** dsh's tool registry: a plain definition object — name · description · parameters · output · execute. */
  tools: {
    register: (tool: Record<string, unknown>) => () => void
    /**
     * The tools one scope (an agent) is sent — dsh's `schemas(scope)`, what the `agent/created`
     * listener fits the surface to. Optional: a test double may omit it, and then nothing is masked.
     */
    schemas?: (scope?: unknown) => readonly { name: string; description?: string }[]
  }
  effect: (setup: () => () => void, label?: string) => void
  /**
   * cordis events; `agent/pre-step` is the waterfall deciding what one agent step sends, and
   * `tools/pre-execute` the one deciding whether a tool call runs.
   */
  on: {
    (
      event: 'agent/pre-step',
      listener: (input: PreStepInput, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>,
      /** cordis: `true` puts the listener FIRST in the waterfall, outside every other one. */
      prepend?: boolean
    ): void
    (
      event: 'tools/pre-execute',
      listener: (exec: PreToolExecution, next: () => Promise<PreToolDecision>) => Promise<PreToolDecision>
    ): void
    (
      event: 'tools/post-execute',
      listener: (
        exec: PostToolExecution,
        result: PostToolResult,
        next: () => Promise<PostToolDecision>
      ) => Promise<PostToolDecision>
    ): void
    /**
     * Serial and awaited: the turn is about to close (its last step answered, nothing in its inbox). A
     * listener that steers (`agent.steer`) makes it run one more step; a listener that throws ends the
     * turn in `error` (dsh `agent-loop/src/agent.ts`).
     */
    (
      event: 'agent/turn-stopping',
      listener: (payload: {
        agent?: {
          session?: { id?: string; header?: { cwd?: unknown }; snapshotEvents?: () => readonly unknown[] }
          steer?: (message: unknown) => void
        }
        turn: number
        signal?: AbortSignal
      }) => Promise<void> | void
    ): void
    /** A session's agent started (`running`) or stopped a turn. */
    (event: 'agent/status', listener: (payload: { agent?: StatusAgent; status: string }) => void): void
    /**
     * Waterfall: a question put to the customer (`ask_user_question`), pending until the chain
     * settles. `prepend` places the listener outside every answerer (dsh `user-questions/request`).
     */
    (
      event: 'user-questions/request',
      listener: (
        request: { agent?: unknown } | null | undefined,
        next: () => Promise<unknown>
      ) => Promise<unknown>,
      prepend: true
    ): void
    /** Bail: `true` keeps an ordinary follow-up in the saved queue without starting a turn (dsh tracy.4). */
    (event: 'api-session/prompt-hold', listener: (sessionId: string) => true | undefined): void
    /**
     * An agent was made for a session, after its preset's standing mount and before its first step
     * (serial and awaited). The ONLY moment its tools, their descriptions and its system sections may
     * be decided (cache rule CS1 of `perf/harness-text-edits`); afterwards a tool may only be ADDED,
     * by lifting a deferral this moment made (`deferred-tools.mjs`), never removed or re-described.
     */
    (event: 'agent/created', listener: (input: AgentCreatedInput) => void | Promise<void>): void
    /** A message was put into an agent's inbox, before the step that claims it is assembled (emit). */
    (
      event: 'agent/inbox/inserted',
      listener: (payload: { agent?: { session?: { id?: string } }; message?: unknown }) => void
    ): void
    /** An agent left the registry; its own scope, restrictions included, goes with it (emit). */
    (event: 'agent/disposed', listener: (payload: { agent?: { session?: { id?: string } } }) => void): void
    /** A tool call's final outcome, frozen (dsh `tools/result`, emit; listener failures are contained). */
    (event: 'tools/result', listener: (exec: ToolResultExecution, result: ToolResultOutcome) => void): void
  }
  /**
   * Optional services, read rather than injected: a lane may or may not carry them, and a missing
   * one has to be a fallback rather than a plugin that never activates. `sessions` is dsh's own
   * store, `tracyAssertion` is the password gate's signer (`dsh-passwords/src/plugin.ts`).
   */
  get?: (name: string) => unknown
  /**
   * cordis's scoped activation: run `callback` with a context carrying `names` once all of them are
   * up (`session-title.mjs` registers the title provider this way). Optional only for test doubles;
   * every real cordis context has it.
   */
  inject?: (names: string[], callback: (ctx: any) => void) => unknown
}

/** The agent an `agent/status` event is about, as much of it as this plugin reads. */
export interface StatusAgent {
  id?: string
  session?: { id?: string; header?: { cwd?: string } }
}

/** dsh's session store, as much of it as this plugin reads. */
export interface SessionsService {
  get?: (id: string) => { snapshotEvents?: () => readonly unknown[] } | undefined
}

/** The password gate's signer: "I am asking on behalf of this address", good for sixty seconds. */
export interface AssertionService {
  mint?: (email: string) => string | null
}

/** What a bundle may set on this plugin's row. Everything has a default that fits a lane. */
export interface Config {
  /** The webroot `media.scan` walks. Default: `.webroot` under where dsh stands, else that directory. */
  webroot?: string
  emdash?: {
    /** The `io.tracy.cms` label of a site's container image, '' when unknown. */
    cms?: (container: string) => Promise<string>
  }
  /**
   * The docker-exec transport (#154): `page.text`'s probe and DOM dump, `page.look`'s screenshot,
   * and `tracy_emdash`'s MCP call all run INSIDE the resolved site's own web container against
   * loopback, never as a direct socket from dsh. A test injects a fake so a helper's transport can
   * be asserted, and its refusals driven, without docker. `argv` is the docker sub-argv (from
   * `exec`); the default runner prepends the daemon named by `TRACY_DOCKER_HOST`.
   */
  exec?: (input: {
    argv: readonly string[]
    stdin?: string
    timeoutMs: number
    maxBuffer: number
  }) => Promise<{
    code: number | null
    stdout: string
    stderr: string
    timedOut: boolean
    spawnError?: string
  }>

  /**
   * dsh's own browser, for `tracy_design_check` on a site whose container has none (every Joomla
   * site). Absent: `/usr/local/bin/tracy-chrome` (the dsh image's), else `OD_BROWSER_EXECUTABLE_PATH`;
   * null: none. A test sets it with {@link Config.hostBrowser}.
   */
  hostChrome?: string | null
  /**
   * The runner for that browser (`hostBrowserExec`, exec.mjs): dsh's node, pinned to one site's
   * container. A test injects a fake, as it does `exec`.
   */
  hostBrowser?: (input: {
    chrome: string
    target: { url: string; origin: string; container: string; via: string }
  }) => Promise<{
    code: number | null
    stdout: string
    stderr: string
    timedOut: boolean
    spawnError?: string
  }>
  /**
   * Where this site's doors answer — `https://cowork.tracy.ai`, or the dev proxy's own address.
   *
   * Declared rather than learned, because a viewer's origin is a fact about a browser tab and not
   * about the lane: a tab opened on the password gate taught this plugin an address with no
   * `/api/sites`, and the next build read that gate's plain-text 401 as a broken reply (09/09).
   * Absent falls back to `MCP_TRACY_ORIGIN`; neither set → no relay at all (`NO_VIEWER`), never a
   * viewer's hello host, which a caller off the fleet proxy writes (`relayPlan`).
   */
  origin?: string
  /**
   * The domain this deployment serves its sites under (`tracy.site` on dev, `tracy.ai` in production):
   * a site is public at `https://<label>.<siteDomain>`. `page.text` / `page.look` accept a site's
   * redirect to exactly that origin as the site itself and ask for the page again as it, over the
   * container's loopback. Absent falls back to `TRACY_SITE_DOMAIN`; with neither, such a redirect
   * stays `REDIRECTED_OFF_SITE`. Never read from the site's folder, which the site can rewrite.
   */
  siteDomain?: string
  /**
   * The deployment's own public origin, when its sites are served on a scheme or port that is not
   * plain `https` (the local stand: `http://tracy.test:51710`). Only its scheme and port are read;
   * the host is `siteDomain`'s. Absent falls back to `TRACY_DEPLOYMENT_ORIGIN`; malformed is ignored
   * with one boot warning (`page.mjs` `publicOriginFor`). Leave it empty on a fleet host.
   */
  deploymentOrigin?: string
  /**
   * The HTTP client the Apply-door relay calls — `fetch` unless a test injects its own, so a relay's
   * headers, body and refusals can be asserted without a server.
   */
  fetch?: typeof fetch
  /**
   * How the tool waits between two sends (the `writer_busy` retry, the EmDash read retry) — a real
   * timer unless a test injects one that returns at once.
   */
  sleep?: (ms: number) => Promise<unknown>
  /**
   * The clock the today notice reads (`todayNotice`, site-context.mjs) — the host's own unless a test
   * injects one, so the day a step says is a fact the test fixes rather than a race with midnight.
   */
  now?: () => Date
  /**
   * Which model `page.look` asks to describe a screenshot when the session's own model does not
   * accept images: `provider/model`, or a model id on the session's own provider.
   *
   * Absent — the normal case — the provider's own catalog decides: the first model it lists that
   * declares image input (`deepseek-v4-flash-vision-exp` today). Named here, a deployment can move
   * to another model without a release, and an id the catalog does not list is still accepted,
   * because catalog membership is advisory in dsh.
   */
  lookModel?: string
  /**
   * Whether a message may be given a picture of the page its customer has open (`view.mjs`). On unless
   * this is `false`: the door then keeps nothing and no step is given a picture. Set it in the profile
   * row of a host that must not send a customer's page to the model.
   */
  viewContext?: boolean
  /**
   * Whether a turn that wrote the site is looked at before it closes (`visual-check.mjs`): the page the
   * customer had open, drawn again and compared with the picture from before the turn. On unless this
   * is `false`; `'shadow'` compares and logs but never sends the agent a notice. Needs `viewContext`:
   * without the picture from before there is nothing to compare.
   */
  visualCheck?: boolean | 'shadow'
  /**
   * The longest one turn's writes are held for their "before" pictures (`check-pages.mjs`
   * `BEFORE_HOLD_MS`, 5 s unless this says otherwise). A test's knob: a profile has no reason to set it.
   */
  visualCheckHoldMs?: number
}

/** What `agent/pre-step` hands a listener, as much as this plugin reads. */
export interface PreStepInput {
  /** The inbox messages this step claimed — a customer's new message arrives here, `source.kind: 'user'`. */
  messages?: readonly unknown[]
  /** The turn this step belongs to: dsh numbers them per session, and the number survives a restart. */
  turn?: number
  agent?: {
    session?: {
      id?: string
      header?: { cwd?: string; agentPreset?: string }
      seq?: number
      eventAt?: (seq: number) => unknown
      surface?: { nodes?: Iterable<number> }
    }
  }
}

/** dsh's decision for one step: refuse it, or enter it with these user-role messages. */
export type PreStepDecision = { kind: 'reject' } | { kind: 'enter'; messages: unknown[] }

/** What `tools/pre-execute` hands a listener, as much as this plugin reads: the call's name and parsed arguments. */
export interface PreToolExecution {
  name: string
  arguments: unknown
  /** dsh's id of this one call, the same in `tools/post-execute`. */
  callId?: string
  agent?: { session?: { id?: string; header?: { cwd?: string } } }
}

/** dsh's decision for one tool call: run it, refuse it, or run it once a person approves. */
export type PreToolDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason?: string }

/** What `tools/post-execute` hands a listener: the call that ran (same `callId` as its pre-execute). */
export type PostToolExecution = PreToolExecution

/** The dispatch outcome `tools/post-execute` may enrich, as much as this plugin reads. */
export interface PostToolResult {
  isError: boolean
  content?: readonly { type: string; text?: string }[]
}

/** dsh's post-dispatch decision: keep (optionally replacing the content or the value), or block. */
export type PostToolDecision =
  | { kind: 'accept'; content?: { type: string; text?: string }[]; value?: unknown }
  | { kind: 'block'; feedback: { type: string; text?: string }[] }

/** What `agent/created` hands a listener, as much as this plugin reads. */
export interface AgentCreatedInput {
  agent?: {
    session?: {
      id?: string
      header?: { cwd?: string; agentPreset?: string }
      /** The request header the session last logged: the tools a resumed conversation was already sent. */
      requestHeader?: () => { tools?: readonly { name: string }[] } | undefined
    }
    /** The agent's own scope: a registration here shadows the global one of the same name for this agent only. */
    ctx?: {
      tools?: {
        restrict: (filter: { deny: string[] }) => () => void
        register: (tool: Record<string, unknown>) => () => void
      }
      systemPrompt?: {
        section: (section: { name: string; order: number; text: string }) => () => void
        getSectionOrder: (name: string) => number
      }
    }
  }
  /** Why the agent was made: a new session, a resumed one after a restart, a clear, a compaction. */
  source?: string
}

/** The call `tools/result` is about, as much as this plugin reads. */
export interface ToolResultExecution {
  name: string
  arguments?: unknown
  agent?: { session?: { id?: string; header?: { cwd?: string } } }
}

/** The outcome `tools/result` reports, as much as this plugin reads. */
export interface ToolResultOutcome {
  isError: boolean
  /** The tool's own value (dsh keeps it for listeners, not in durable events). */
  value?: unknown
  content?: readonly { type?: string; text?: string }[]
}
