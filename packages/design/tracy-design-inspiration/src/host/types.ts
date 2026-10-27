/**
 * The minimal shape of what dsh hands the host half — declared here, NOT imported from
 * `@deepseek-ai/dsh-*`. Same reason as `tracy-site-tabs/src/host/types.ts`: those packages are
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

export interface HostContext {
  webServer: { register: (route: WebRoute) => () => void }
  /** dsh's tool registry: a plain definition object — name · description · parameters · output · execute. */
  tools: { register: (tool: Record<string, unknown>) => () => void }
  /** dsh's model runtime (`@deepseek-ai/dsh-llm`): the raw stream, text deltas and a terminal finish. */
  llm: { stream: (options: GenerateOptions) => AsyncIterable<StreamChunk> }
  /** The lane's default model (`@deepseek-ai/dsh-agent-default-model`): what the customer's agent runs on. */
  agentDefaultModel: { currentSelection: () => { provider: string; model: string; reasoningEffort?: string } }
  effect: (setup: () => () => void, label?: string) => void
}

/** What a bundle may set on this plugin's row. Everything has a default that fits a lane. */
export interface Config {
  /**
   * The public page the 152 systems are read from (`data/manifest.json`, `data/catalog.json`,
   * `systems/<id>/…`). Default: `https://cowork.tracy.ai/design-inspiration`; `false` = the image
   * copy only. Local dev points it at the page's dev server.
   */
  libraryUrl?: string | false
  /** Where the page's files are kept on disk, by commit. Default: `$DSH_HOME/design-library`. */
  libraryCache?: string
  /** The image's catalog file — the road back. Default: `/opt/tracy/design-catalog.json`, then `$DSH_HOME/design-catalog.json`. */
  catalog?: string
  /** Where Tracy answers `GET /api/templates`. Default: the origin of `libraryUrl`. */
  tracyOrigin?: string
  /** The image's quickstart catalogue — the road back when Tracy cannot be asked. Default: `/opt/tracy/quickstarts.json`, then `$DSH_HOME/quickstarts.json`. */
  quickstarts?: string
  /** The site folder holding `docs/agents/design-preview.json`. Default: where dsh stands. */
  siteDir?: string
}

/** The subset of dsh-llm's `GenerateOptions` this plugin sends: one user message, no tools. */
export interface GenerateOptions {
  provider: string
  model: string
  reasoningEffort?: string
  system?: string
  messages: {
    id: string
    role: 'user'
    content: { type: 'text'; text: string }[]
    source: { kind: 'user' }
  }[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

/** The chunks this plugin reads from dsh-llm's stream; every other kind is passed over. */
export type StreamChunk =
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'usage'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'finish'; reason: { kind: string; failure?: { message: string; code: string } } }
  | { type: 'block-end'; index: number; block: { type: string; text?: string } }
  | { type: 'block-start' | 'reasoning-delta' | 'tool-call-delta'; [k: string]: unknown }
