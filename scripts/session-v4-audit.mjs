#!/usr/bin/env node
/**
 * Session V4 audit: which stored dsh sessions dsh 0.1.7 will open, and which ones carry the retired
 * `source.kind: 'plugin'`.
 *
 * WHY THIS EXISTS. dsh 0.1.7 (`dsh-v0.1.7-rc.2`) moves sessions from format V3 to V4, and the move
 * is one-way: a write open publishes `session.v4.jsonl.zstd` beside the V3 file, and dsh 0.1.6
 * cannot read V4. Tracy wrote `{kind:'plugin', plugin:…}` sources on every Build and every site
 * notice, and native V4 refuses that kind (`session-format-v3-to-v4` `src/message-sources.ts:9`).
 * Before the image changes, the number that decides the merge is: how many real sessions carry
 * that kind, and would the rc.2 restore accept each session. This script answers both, reading a
 * COPY of a sessions directory; it never writes into what it reads.
 *
 *   node scripts/session-v4-audit.mjs [--catalog <module>] [--json] <sessions-dir>...
 *
 * THE VERDICT, TWO WAYS.
 * - With the rc.2 format catalog importable (`@deepseek-ai/dsh-session-format-catalog`, by default
 *   the submodule's built `lib/index.js`; `--catalog` names another module), each session is
 *   restored exactly the way persistence restores a historical generation on open:
 *   `createSessionFormatCatalogWithChildren(facts).createRestore(header, {recovery:'recoverable',
 *   validation:'transformed'})` (`session-persistence-jsonl` `src/index.ts:655-656`), then once more
 *   with `validation:'current'` (installed Session validation, `session-format-catalog`
 *   `src/generated.ts`). ⚠ Child facts are passed as `[]`: persistence collects each parent's
 *   subagent children first (`src/index.ts:630-635`), which can only append catalog entries or
 *   refuse on conflicting facts — a parent whose children disagree with it is not caught here.
 * - Without it, a PREDICATE COPIED from the tag is used and the report says so ("predicate"). It
 *   covers exactly the rules cited in {@link predicateVerdict}, not the whole restore (event
 *   vocabulary, lifecycle relationships, catalog facts): re-run with the catalog once the
 *   submodule is built before trusting an ACCEPT from it.
 *
 * WHAT HAPPENS TO A V3 `plugin` SOURCE. It is NOT refused: the V3→V4 edge renames
 * `{kind:'plugin', plugin:X}` to `{kind:'plugin:X'}` (a few first-party names map elsewhere) and
 * keeps every other field (`src/sources.ts:39-90`). Only a session already in V4 that carries
 * `kind:'plugin'` is refused, on read and on write (`src/codec.ts:51,68`). So the count of V3
 * `plugin` messages says how much history will read back under a new name, not how much is lost.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The submodule's built catalog: what `--catalog` defaults to. */
export const DEFAULT_CATALOG = join(
  REPO,
  'vendor/tracy/deepseek-harness/packages/session/session-format-catalog/lib/index.js'
)

const ZSTD_MAGIC = 0xfd2fb528

/**
 * Complete Zstandard frames of a session file, located without decompressing them.
 *
 * A dsh session file is a CONCATENATION of independent frames — one for the header, one per append
 * batch — and Node's one-shot `zstdDecompressSync` returns only the first frame's content. Copied
 * from dsh `dsh-v0.1.7-rc.2` `packages/session/session-persistence-jsonl/src/zstd.ts:47-104`
 * (`scanZstdFrames`), minus the `maxFrames` option. A torn final frame is reported, not decoded:
 * persistence repairs it the same way (recovery `recoverable`).
 * @param {Buffer} buffer
 * @returns {{ frames: { start: number, end: number }[], tornStart?: number }}
 */
export function scanZstdFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) return { frames, tornStart: start }
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC)
      throw new Error(`corrupt Zstandard session file: invalid frame magic at byte ${offset}`)
    offset += 4
    if (offset === buffer.length) return { frames, tornStart: start }
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 0x18) !== 0)
      throw new Error(`corrupt Zstandard session file: reserved frame-header bit at byte ${offset - 1}`)
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start }
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 0x03)
        throw new Error(`corrupt Zstandard session file: reserved block type at byte ${offset - 3}`)
      const payloadBytes = blockType === 0x01 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start }
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start }
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return { frames }
}

/**
 * The parsed rows of one session file: its physical header and every body row, in file order.
 * @param {string} file - `session.vN.jsonl.zstd` or `session.vN.jsonl`.
 * @returns {{ header: Record<string, any>, rows: any[], torn: boolean }}
 */
export function readSessionFile(file) {
  const bytes = readFileSync(file)
  let text
  let torn = false
  if (file.endsWith('.zstd')) {
    const scan = scanZstdFrames(bytes)
    torn = scan.tornStart !== undefined
    text = scan.frames
      .map(({ start, end }) => zstdDecompressSync(bytes.subarray(start, end)).toString('utf8'))
      .join('')
  } else text = bytes.toString('utf8')
  const lines = text.split('\n')
  // A raw log's last line may be torn too: only whole lines are rows.
  if (!text.endsWith('\n')) {
    torn = torn || lines[lines.length - 1] !== ''
    lines.pop()
  }
  const rows = []
  for (const line of lines) {
    if (line === '') continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      torn = true
      break
    }
  }
  const [header, ...body] = rows
  if (!header || typeof header !== 'object') throw new Error(`no header in ${file}`)
  return { header, rows: body, torn }
}

const GENERATION = /^session\.v(\d+)\.jsonl(\.zstd)?$/

/**
 * Every session directory under `root`, with the generation dsh would open: the HIGHEST
 * `session.vN.jsonl[.zstd]` in it (`session-persistence-jsonl` README "Reading the logs", :82).
 * @param {string} root
 * @returns {{ dir: string, file: string, version: number }[]}
 */
export function sessionFiles(root) {
  /** @type {{ dir: string, file: string, version: number }[]} */
  const out = []
  const walk = (dir) => {
    let best = null
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else {
        const m = GENERATION.exec(entry.name)
        if (m && (best === null || Number(m[1]) > best.version))
          best = { dir, file: path, version: Number(m[1]) }
      }
    }
    if (best) out.push(best)
  }
  walk(root)
  return out.sort((a, b) => a.file.localeCompare(b.file))
}

/**
 * The messages one row carries, at exactly the positions dsh's source walker visits: `user/message`
 * data; `system|developer|assistant/message` and `tool/result` `data.message`; the members of
 * `agent/inbox/spliced.inserted` and `session/title-llm-request.messages`
 * (`session-format-v3-to-v4` `src/sources.ts:12-36`). Nothing else is searched.
 * @param {any} row
 * @returns {any[]}
 */
export function messagesOf(row) {
  const data = row?.data
  if (!data || typeof data !== 'object') return []
  if (row.type === 'user/message') return [data]
  if (['developer/message', 'system/message', 'assistant/message', 'tool/result'].includes(row.type))
    return data.message && typeof data.message === 'object' ? [data.message] : []
  const key =
    row.type === 'agent/inbox/spliced'
      ? 'inserted'
      : row.type === 'session/title-llm-request'
        ? 'messages'
        : null
  if (key === null || !Array.isArray(data[key])) return []
  return data[key].filter((m) => m && typeof m === 'object')
}

/**
 * How many messages a session holds, and how many of them carry `source.kind: 'plugin'`, per plugin.
 * @param {any[]} rows
 * @returns {{ messages: number, plugin: number, byPlugin: Record<string, number> }}
 */
export function countSources(rows) {
  let messages = 0
  let plugin = 0
  /** @type {Record<string, number>} */
  const byPlugin = {}
  for (const row of rows)
    for (const message of messagesOf(row)) {
      messages += 1
      if (message.source?.kind !== 'plugin') continue
      plugin += 1
      const name = typeof message.source.plugin === 'string' ? message.source.plugin : '(no plugin name)'
      byPlugin[name] = (byPlugin[name] ?? 0) + 1
    }
  return { messages, plugin, byPlugin }
}

/**
 * The refusal rules of `dsh-v0.1.7-rc.2` this script can apply WITHOUT the catalog — copied, each
 * cited to its line in `packages/session/session-format-v3-to-v4/src/`:
 * - native V4 (header `version: 4`): a message source whose kind is `plugin` → refused
 *   (`message-sources.ts:9,29-41`, run by the codec on every row, `codec.ts:62-75`); a `tool/result`
 *   that still holds a `tool-result` block → refused (`tool-role.ts:103-105`);
 * - V3: a `plugin` source without a string `plugin` → refused (`sources.ts:79-84`); a source with no
 *   nonempty string kind → refused (`sources.ts:102-103`); a user-role `tool/result` must hold
 *   exactly one `tool-result` block naming its `source.callId`, with array content, a boolean or
 *   absent `isError`, and no nested result (`tool-role.ts:17-59`);
 * - V0–V2: not judged ('unknown').
 * An ACCEPT here means only "none of these rules refuse it".
 * @param {Record<string, any>} header
 * @param {any[]} rows
 * @returns {{ verdict: 'accept' | 'refuse' | 'unknown', reason?: string }}
 */
export function predicateVerdict(header, rows) {
  const version = header.version
  if (version !== 3 && version !== 4)
    return { verdict: 'unknown', reason: `format v${version} not judged without the catalog` }
  for (const row of rows) {
    for (const message of messagesOf(row)) {
      const source = message.source
      const kind = source && typeof source === 'object' ? source.kind : undefined
      if (typeof kind !== 'string' || kind.length === 0)
        return { verdict: 'refuse', reason: `seq ${row.seq}: message source requires a nonempty kind` }
      if (kind !== 'plugin') continue
      if (version === 4)
        return {
          verdict: 'refuse',
          reason: `seq ${row.seq}: format v4 message requires a producer-owned source kind`
        }
      if (typeof source.plugin !== 'string')
        return {
          verdict: 'refuse',
          reason: `seq ${row.seq}: plugin source is not canonical: plugin requires a string`
        }
    }
    if (row?.type !== 'tool/result') continue
    const message = row.data?.message
    const isWrapper = (block) => block && typeof block === 'object' && block.type === 'tool-result'
    if (version === 4) {
      if (Array.isArray(message?.content) && message.content.some(isWrapper))
        return {
          verdict: 'refuse',
          reason: `seq ${row.seq}: tool/result content must not contain a released tool-result wrapper`
        }
      continue
    }
    if (message?.role !== 'user') continue
    const callId = message.source?.callId
    const content = message.content
    const wrapper = Array.isArray(content) && content.length === 1 ? content[0] : undefined
    if (
      typeof message.id !== 'string' ||
      message.id.length === 0 ||
      message.source?.kind !== 'tool' ||
      typeof callId !== 'string' ||
      callId.length === 0 ||
      !isWrapper(wrapper) ||
      wrapper.toolCallId !== callId
    )
      return {
        verdict: 'refuse',
        reason: `seq ${row.seq}: tool/result requires exactly one tool-result wrapper matching its tool source`
      }
    if (wrapper.isError !== undefined && typeof wrapper.isError !== 'boolean')
      return { verdict: 'refuse', reason: `seq ${row.seq}: tool-result isError must be boolean` }
    if (!Array.isArray(wrapper.content))
      return { verdict: 'refuse', reason: `seq ${row.seq}: tool-result content must be an array` }
    if (wrapper.content.some(isWrapper))
      return { verdict: 'refuse', reason: `seq ${row.seq}: nested tool-result unsupported` }
  }
  return { verdict: 'accept' }
}

/**
 * The rc.2 catalog module, or null when it cannot be imported (the submodule not built yet).
 * @param {string | undefined} spec - a module specifier or a file path; default {@link DEFAULT_CATALOG}.
 * @returns {Promise<{ module: any, from: string } | { module: null, from: string, error: string }>}
 */
export async function loadCatalog(spec) {
  const from = spec ?? DEFAULT_CATALOG
  const target = from.startsWith('.') || from.startsWith('/') ? pathToFileURL(resolve(from)).href : from
  try {
    if ((from.startsWith('.') || from.startsWith('/')) && !existsSync(resolve(from)))
      throw new Error(`${from} does not exist`)
    const module = await import(target)
    if (typeof module.createSessionFormatCatalogWithChildren !== 'function')
      throw new Error('no createSessionFormatCatalogWithChildren export')
    return { module, from }
  } catch (error) {
    return { module: null, from, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Restore one session through the rc.2 catalog, the way persistence opens a historical generation.
 * @param {any} catalogModule
 * @param {Record<string, any>} header
 * @param {any[]} rows
 * @param {'transformed' | 'current'} validation
 * @returns {{ verdict: 'accept' | 'refuse', reason?: string, events?: number }}
 */
export function catalogVerdict(catalogModule, header, rows, validation) {
  try {
    const restore = catalogModule
      .createSessionFormatCatalogWithChildren([])
      .createRestore(structuredClone(header), { recovery: 'recoverable', validation })
    for (const row of rows) restore.decodeRow(structuredClone(row))
    const artifact = restore.finish()
    return { verdict: 'accept', events: artifact.events.length }
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    return { verdict: 'refuse', reason: reason.length > 300 ? `${reason.slice(0, 299)}…` : reason }
  }
}

/**
 * Audit every session under the given roots.
 * @param {string[]} roots
 * @param {{ catalog?: string }} [options]
 */
export async function auditDirectories(roots, options = {}) {
  const loaded = await loadCatalog(options.catalog)
  const sessions = []
  for (const root of roots)
    for (const { file, version } of sessionFiles(root)) {
      /** @type {Record<string, any>} */
      const entry = { root, file, version }
      try {
        const { header, rows, torn } = readSessionFile(file)
        entry.id = header.id
        entry.preset = header.agentPreset ?? null
        entry.torn = torn
        Object.assign(entry, countSources(rows))
        if (loaded.module) {
          entry.transformed = catalogVerdict(loaded.module, header, rows, 'transformed')
          entry.current = catalogVerdict(loaded.module, header, rows, 'current')
        } else entry.predicate = predicateVerdict(header, rows)
      } catch (error) {
        entry.id = basename(dirname(file))
        entry.readError = error instanceof Error ? error.message : String(error)
      }
      sessions.push(entry)
    }
  return {
    catalog: loaded.module ? { from: loaded.from } : { from: loaded.from, error: loaded.error },
    sessions,
    totals: totalsOf(sessions)
  }
}

/** Sums over sessions: the numbers that go to the merge decision. */
function totalsOf(sessions) {
  /** @type {Record<string, { messages: number, sessions: number }>} */
  const byPlugin = {}
  const verdicts = { transformed: {}, current: {}, predicate: {} }
  let withPlugin = 0
  let messages = 0
  let pluginMessages = 0
  let readErrors = 0
  for (const s of sessions) {
    if (s.readError) {
      readErrors += 1
      continue
    }
    messages += s.messages
    pluginMessages += s.plugin
    if (s.plugin > 0) withPlugin += 1
    for (const [name, n] of Object.entries(s.byPlugin)) {
      byPlugin[name] ??= { messages: 0, sessions: 0 }
      byPlugin[name].messages += n
      byPlugin[name].sessions += 1
    }
    for (const key of ['transformed', 'current', 'predicate'])
      if (s[key]) verdicts[key][s[key].verdict] = (verdicts[key][s[key].verdict] ?? 0) + 1
  }
  return { sessions: sessions.length, readErrors, messages, pluginMessages, withPlugin, byPlugin, verdicts }
}

/** The report as text: one line per session, then the totals and every refusal's reason. */
export function formatReport(result) {
  const out = []
  const judged = result.catalog.error ? 'predicate' : 'transformed'
  out.push(
    result.catalog.error
      ? `verdict: PREDICATE copied from dsh-v0.1.7-rc.2 (catalog not importable from ${result.catalog.from}: ${result.catalog.error}) — re-verify once the submodule is built`
      : `verdict: rc.2 catalog restore (${result.catalog.from}), recovery 'recoverable'; columns transformed / current`
  )
  out.push(['id', 'v', 'preset', 'msgs', 'plugin', 'verdict', 'plugins'].join('\t'))
  for (const s of result.sessions) {
    if (s.readError) {
      out.push([s.id, s.version, '-', '-', '-', 'READ-ERROR', s.readError].join('\t'))
      continue
    }
    const verdict = s.transformed ? `${s.transformed.verdict}/${s.current.verdict}` : s.predicate.verdict
    const plugins = Object.entries(s.byPlugin)
      .map(([n, c]) => `${n}=${c}`)
      .join(', ')
    out.push(
      [
        s.id,
        s.version,
        s.preset ?? '-',
        s.messages,
        s.plugin,
        verdict + (s.torn ? ' (torn tail)' : ''),
        plugins
      ].join('\t')
    )
  }
  const t = result.totals
  out.push('')
  out.push(`sessions: ${t.sessions} (read errors: ${t.readErrors}) · messages: ${t.messages}`)
  out.push(`sessions with source.kind 'plugin': ${t.withPlugin} · such messages: ${t.pluginMessages}`)
  for (const [name, v] of Object.entries(t.byPlugin).sort((a, b) => b[1].messages - a[1].messages))
    out.push(`  ${name}: ${v.messages} messages in ${v.sessions} sessions`)
  for (const key of result.catalog.error ? ['predicate'] : ['transformed', 'current'])
    out.push(
      `${key}: ${
        Object.entries(t.verdicts[key])
          .map(([k, n]) => `${k} ${n}`)
          .join(' · ') || '-'
      }`
    )
  const refusals = result.sessions.filter(
    (s) => (s[judged] ?? s.predicate)?.verdict === 'refuse' || s.current?.verdict === 'refuse'
  )
  if (refusals.length > 0) {
    out.push('refused:')
    for (const s of refusals) {
      const reason =
        s.transformed?.verdict === 'refuse'
          ? s.transformed.reason
          : s.current?.verdict === 'refuse'
            ? `(current) ${s.current.reason}`
            : s.predicate?.reason
      out.push(`  ${s.id} [${s.preset ?? '-'}] ${reason}`)
    }
  }
  return out.join('\n')
}

async function main(argv) {
  const roots = []
  let catalog
  let json = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--catalog') catalog = argv[++i]
    else if (argv[i] === '--json') json = true
    else roots.push(argv[i])
  }
  if (roots.length === 0) {
    console.error('usage: node scripts/session-v4-audit.mjs [--catalog <module>] [--json] <sessions-dir>...')
    return 2
  }
  for (const root of roots)
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      console.error(`not a directory: ${root}`)
      return 2
    }
  const result = await auditDirectories(roots, { catalog })
  console.log(json ? JSON.stringify(result, null, 2) : formatReport(result))
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await main(process.argv.slice(2))
