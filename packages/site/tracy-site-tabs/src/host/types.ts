/**
 * The minimal shape of what dsh hands the host half — declared here, NOT imported from
 * `@deepseek-ai/dsh-*`. Same reason as `tracy-add-site/src/host/types.ts`: those packages are the
 * host's own services, present at run time because dsh loads them; adding them to this plugin's
 * `dependencies` pulls a second copy onto the customer's disk, and `check-self-contained` reads
 * `package.json`, not intent. If dsh changes shape, this file changes with it — a known price.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

export type WebRouteKind = 'exact' | 'prefix'

export interface WebRoute {
  kind: WebRouteKind
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void
}

/** One entry of a session's log; only `user/message` is read here, for its text. */
export interface SessionEvent {
  type: string
  data?: unknown
}

/** What `agent/pre-step` hands its listeners: the turn, and the messages the step claimed. */
export interface PreStepInput {
  turn: number
  step: number
  messages?: readonly unknown[]
}

/** The waterfall's answer: reject the step, or let it in (with the messages that enter it). */
export interface PreStepDecision {
  kind: string
  messages?: readonly unknown[]
}

export interface AgentLike {
  ctx: {
    on: {
      (event: 'agent/status', handler: (payload: { status: string }) => void): () => void
      (
        event: 'agent/pre-step',
        handler: (input: PreStepInput, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>
      ): () => void
      /**
       * Waterfall before a tool call runs: `next()` lets the later listeners and the call go on.
       * `signal` is the call's own cancellation; a gate that waits must observe it.
       */
      (
        event: 'tools/pre-execute',
        handler: (
          exec: { name?: string; arguments?: unknown; signal?: AbortSignal },
          next: () => Promise<{ kind: string }>
        ) => Promise<{ kind: string }>
      ): () => void
      /** Serial: dsh waits for every listener before the next turn may start. */
      (event: 'agent/turn-stopping', handler: (payload: { turn: number }) => Promise<void>): () => void
    }
  }
  session: {
    /** The conversation this agent runs — the same id the page names its side card scope by. */
    id: string
    snapshotEvents: () => readonly SessionEvent[]
    /** Written by dsh when the session starts: the folder it stands in, never chosen by the model. */
    header?: { cwd?: string }
  }
}

export interface HostContext {
  webServer: { register: (route: WebRoute) => () => void }
  agents: { roots: () => AgentLike[] }
  on: {
    (event: 'agent/created', handler: (payload: { agent: AgentLike }) => void): () => void
    /** Every event of a conversation dsh has open: the ratings are read off it (`rating.mjs`). */
    (event: 'session/event', handler: (session: RatedSession, event: SessionEventLike) => void): () => void
    /** A rating written to a conversation dsh had not loaded: its log as committed, the rating last. */
    (
      event: 'feedback/committed',
      handler: (inspection: {
        meta?: { id?: unknown; cwd?: unknown }
        events?: readonly SessionEventLike[]
      }) => void
    ): () => void
  }
  effect: (setup: () => () => void, label?: string) => void
  /**
   * An OPTIONAL service, read rather than injected: a dsh without it must still load this plugin.
   * `tracyAssertion` is the password gate's signer (`dsh-passwords/src/plugin.ts`).
   */
  get?: (name: string) => unknown
}

/** The password gate's signer: "I am asking on behalf of this address", good for sixty seconds. */
export interface AssertionService {
  mint?: (email: string) => string | null
}

/** One event of a dsh session, as far as the ratings read it. */
export interface SessionEventLike {
  type?: string
  data?: unknown
}

/** A conversation dsh has open, as far as the ratings read it. */
export interface RatedSession {
  id?: unknown
  header?: { cwd?: unknown }
  snapshotEvents?: () => readonly SessionEventLike[]
}
