/**
 * The build chat's host half (TracyHQ/tracy#609): the tool `tracy_build` and the guard on the build session's
 * questions (`build-tool.mjs`). The browser half (`src/client/`) draws the cards.
 *
 * 🔒 REGISTERED ONLY WHERE THE PRESET MOUNTS IT. The bundles load this package for every session (the client half
 * must be there for the cards), and the `site-builder` preset mounts it again inside the build agent's own scope with
 * `config.tool: true` (`scripts/gen-presets.ts`). Only that mount registers anything: the tool lives in the agent's
 * scope, so no other session is ever sent its description, and the bundle row never registers the same name a second
 * time. A load without `tool: true` is inert on the host.
 *
 * It acts as the person who typed: the session's latest prompter (`latestPrompter`, the gate's stamp on the message),
 * vouched for by the gate's signer (`tracyAssertion`). Both are read with `ctx.get`, not injected: a composition
 * without them still loads, and the tool then answers `stopped` rather than calling as nobody.
 */
import { BUILD_DESCRIPTION, BUILD_PARAMETERS, createBuildTool } from './build-tool.mjs'
// The site tools' rule for who typed, held equal to it by `test/prompter.test.mjs`.
import { latestPrompter } from './prompter.mjs'

export const name = 'tracy-build-chat'
export const inject = ['tools']

interface Execution {
  name: string
  arguments?: unknown
  agent?: { session?: { id?: string } }
}

interface HostContext {
  tools: {
    register: (tool: Record<string, unknown>) => () => void
    guard: (check: (execution: Readonly<Execution>) => string | undefined) => () => void
  }
  effect: (run: () => () => void, label?: string) => void
  get?: (name: string) => unknown
}

interface Config {
  /** True only on the `site-builder` preset's mount: registers the tool and its guard in that agent's scope. */
  tool?: boolean
  /** Where tracy-web answers; a test names its own. Otherwise `MCP_TRACY_API_ORIGIN`, then `MCP_TRACY_ORIGIN`. */
  origin?: string
  /** A test's fetch. */
  fetch?: typeof fetch
}

type SessionsService = { get?: (id: string) => { snapshotEvents?: () => readonly unknown[] } | undefined }
type AssertionService = { mint?: (email: string) => string | null }

/** The address tracy-web answers at from this host: the internal one when the host names it. */
function originOf(config: Config): string | null {
  const value =
    config.origin ?? (process.env.MCP_TRACY_API_ORIGIN?.trim() || process.env.MCP_TRACY_ORIGIN?.trim() || '')
  return value === '' ? null : value.replace(/\/+$/, '')
}

export function apply(ctx: HostContext, config: Config = {}): void {
  if (config.tool !== true) return
  const eventsOf = (sessionId: string): readonly unknown[] =>
    (ctx.get?.('sessions') as SessionsService | undefined)?.get?.(sessionId)?.snapshotEvents?.() ?? []
  const build = createBuildTool({
    http: config.fetch ?? fetch,
    origin: () => originOf(config),
    eventsOf,
    actorFor: (sessionId: string) => {
      const who = latestPrompter(eventsOf(sessionId) as never)
      const mint = (ctx.get?.('tracyAssertion') as AssertionService | undefined)?.mint
      return who !== null && typeof mint === 'function' ? mint(who.email) : null
    }
  })
  const tool = {
    name: 'tracy_build',
    description: BUILD_DESCRIPTION,
    parameters: BUILD_PARAMETERS,
    output: {
      schema: {},
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }]
    },
    execute: (args: unknown, exec: unknown) => build.execute(args, exec)
  }
  ctx.effect(() => ctx.tools.register(tool), 'tracy-build-chat: tracy_build')
  ctx.effect(() => ctx.tools.guard(build.guard), 'tracy-build-chat: build questions guard')
}
