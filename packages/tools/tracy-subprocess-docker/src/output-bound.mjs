/**
 * WHAT THE AGENT READS OF A LONG `bash` OUTPUT (09/10/2026, harness profile candidate 8).
 *
 * 🔒 WHY. Every tool result is re-sent on every later step of the conversation, so one long output is
 * paid for once per step that follows it. dsh gives `bash` no cap of its own: its executor keeps a
 * 64,000-byte tail, and dsh-base's `spill-policy` cuts any tool result past 12,500 tokens (about
 * 50,000 characters). That one cap cannot come down for `bash` alone — it is the same for every tool,
 * and Tracy's site answers are budgeted under it (`INSPECT_BUDGET_CHARS`, 30,000 in tracy-site-tools).
 * Measured over 2,255 `bash` calls in 1,980 bench sessions (24/09–05/10/2026): p50 730 characters,
 * p90 4,014, p99 15,742, max 49,931 (the spill); 48 outputs carried lines over 2,000 characters —
 * minified CSS and HTML, one-line JSON-LD, Joomla `params` blobs — and those lines alone were 16% of
 * all `bash` characters. The agent grepped them for one selector and used none of the rest.
 *
 * WHAT CHANGES, and only for the model's copy of a top-level `bash` result:
 * - a line over {@link BASH_LINE_MAX_CHARS} keeps its start and says how long it was (the same
 *   per-line cut dsh's own `read` and `grep` make by default);
 * - an output still over {@link BASH_OUTPUT_MAX_CHARS} keeps its head and its tail by whole lines and
 *   says how many lines it left out of the middle;
 * - the exit, signal, timeout and sandbox markers stay the last lines (`parseExitStatus` anchors there);
 * - one line before them names the full output, saved through dsh's spill store
 *   (`ctx.spillStore.saveText`, the same session folder dsh's own spill notices point at, which the
 *   path fence lets that session's `read` and `grep` open — `readsOwnSpill` in `route.mjs`), and says
 *   how to print only the part of a long line it needs.
 * Simulated on those calls: 55 of 2,255 outputs change (2.4%), 702k of their 4.07M characters go
 * (17%), 18% of what `bash` results cost once carried by the later steps; every output at p97 or below
 * is untouched.
 *
 * 🔒 NO SAVE, NO CUT. When the store is missing or the save fails, the output goes through as it came
 * (dsh's spill-policy still bounds it at its own cap): a cut whose rest cannot be read again would be
 * information the agent lost without being told where it went.
 *
 * Pure except {@link boundBashResult}, which takes the store as an argument.
 */

/** The longest line of a `bash` output the model is shown whole, in characters (dsh's `read`/`grep` default). */
export const BASH_LINE_MAX_CHARS = 2000

/** The longest `bash` output the model is shown whole, in characters (`tool-web.fetchMaxOutputChars` too). */
export const BASH_OUTPUT_MAX_CHARS = 12_000

/** The share of {@link BASH_OUTPUT_MAX_CHARS} kept from the head; the rest is the tail. */
const HEAD_SHARE = 2 / 3

/**
 * A status marker dsh's bash renderer puts after the output: `[exit code: 1]`, `[killed by signal: …]`,
 * `[timed out after …ms]`, `[stopped: …]`, `[sandbox: …]` (`tool-bash/src/render.ts`).
 */
const MARKER = /^\[(?:exit code: |killed by signal: |timed out after |stopped: |sandbox: )[^\n]*\]$/

/**
 * One line cut to `max` characters, never inside a surrogate pair, with its length said.
 * @param {string} line
 * @param {number} max
 * @returns {string}
 */
function cutLine(line, max) {
  const code = line.charCodeAt(max - 1)
  const end = code >= 0xd800 && code <= 0xdbff ? max - 1 : max
  return `${line.slice(0, end)} … [line cut: ${line.length} characters]`
}

/**
 * @typedef {{
 *   body: string,
 *   markers: string[],
 *   cutLines: number,
 *   omittedLines: number,
 *   omittedChars: number
 * }} Bounded
 */

/**
 * The model's copy of one `bash` output, bounded; `null` when it is within both caps as it is.
 * @param {string} text - the rendered result (`renderResult` in dsh's tool-bash).
 * @param {{ lineMax?: number, totalMax?: number }} [caps]
 * @returns {Bounded | null}
 */
export function boundBashOutput(text, caps = {}) {
  const lineMax = caps.lineMax ?? BASH_LINE_MAX_CHARS
  const totalMax = caps.totalMax ?? BASH_OUTPUT_MAX_CHARS
  if (typeof text !== 'string' || text.length <= lineMax) return null
  const lines = text.split('\n')
  /** @type {string[]} */
  const markers = []
  while (lines.length > 1 && MARKER.test(/** @type {string} */ (lines.at(-1))))
    markers.unshift(/** @type {string} */ (lines.pop()))
  let cutLines = 0
  const shown = lines.map((line) => {
    if (line.length <= lineMax) return line
    cutLines += 1
    return cutLine(line, lineMax)
  })
  let omittedLines = 0
  let omittedChars = 0
  let body = shown.join('\n')
  if (body.length > totalMax) {
    const headBudget = Math.floor(totalMax * HEAD_SHARE)
    const tailBudget = totalMax - headBudget
    let head = 0
    let used = 0
    while (head < shown.length && used + shown[head].length + 1 <= headBudget)
      used += shown[head++].length + 1
    let tail = shown.length
    used = 0
    while (tail > head && used + shown[tail - 1].length + 1 <= tailBudget) used += shown[--tail].length + 1
    omittedLines = tail - head
    if (omittedLines > 0) {
      omittedChars = lines.slice(head, tail).reduce((sum, line) => sum + line.length + 1, 0)
      body = [
        ...shown.slice(0, head),
        `[… ${omittedLines} lines (${omittedChars} characters) left out here …]`,
        ...shown.slice(tail)
      ].join('\n')
    }
  }
  if (cutLines === 0 && omittedLines === 0) return null
  return { body, markers, cutLines, omittedLines, omittedChars }
}

/**
 * The line that tells the agent what was cut and where the whole output is.
 * @param {Bounded} bounded
 * @param {{ locator: string, retrievalHint: string }} ref - the saved output (`SpillRef`).
 * @returns {string}
 */
export function boundNotice(bounded, ref) {
  /** @type {string[]} */
  const what = []
  if (bounded.cutLines > 0)
    what.push(
      `${bounded.cutLines} ${bounded.cutLines === 1 ? 'line' : 'lines'} over ${BASH_LINE_MAX_CHARS} characters cut`
    )
  if (bounded.omittedLines > 0) what.push(`${bounded.omittedLines} lines left out of the middle`)
  return (
    `(Output shortened: ${what.join(', ')}. Full output stored at: ${ref.locator}. ${ref.retrievalHint} ` +
    "To see one part of a long line, print only that part, e.g. grep -o '.{0,200}WORD.{0,200}' FILE.)"
  )
}

/**
 * The text the model reads: the bounded output, the notice, then the status markers last.
 * @param {Bounded} bounded
 * @param {{ locator: string, retrievalHint: string }} ref
 * @returns {string}
 */
export function renderBounded(bounded, ref) {
  return [bounded.body.replace(/\n+$/, ''), '', boundNotice(bounded, ref), ...bounded.markers].join('\n')
}

/**
 * @typedef {{ type: string, text?: string }} Block
 * @typedef {{ kind: 'accept', content?: Block[], value?: unknown, additionalContexts?: unknown[] } | { kind: string }} Decision
 * @typedef {{ saveText: (input: {
 *   owner: { sessionId: string },
 *   source: { kind: 'tool', toolName: string, callId: string, label: string },
 *   suggestedName: string,
 *   content: string
 * }) => Promise<{ locator: string, retrievalHint: string }> }} SpillStore
 */

/**
 * A `tools/post-execute` decision with a long `bash` output bounded, or the decision as it came.
 *
 * Only a top-level `bash` call accepted as content (no replacement `value`, which a program reads
 * whole) and made of text alone; anything else, and any output within both caps, passes untouched.
 * @param {{
 *   exec: { name?: string, callId?: string, parent?: unknown, agent?: { session?: { id?: string, header?: { id?: string } } } },
 *   result: { content?: Block[] } | undefined,
 *   decision: Decision,
 *   spillStore: SpillStore | undefined,
 *   warn?: (message: string) => void
 * }} input
 * @returns {Promise<Decision>}
 */
export async function boundBashResult({ exec, result, decision, spillStore, warn = () => {} }) {
  if (exec?.name !== 'bash' || exec.parent !== undefined) return decision
  if (decision?.kind !== 'accept' || Object.hasOwn(decision, 'value')) return decision
  const content = /** @type {{ content?: Block[] }} */ (decision).content ?? result?.content
  if (!Array.isArray(content) || content.length === 0 || !content.every((b) => b?.type === 'text'))
    return decision
  const text = content.map((b) => b.text ?? '').join('')
  const bounded = boundBashOutput(text)
  if (bounded === null) return decision
  const sessionId = exec.agent?.session?.header?.id ?? exec.agent?.session?.id
  if (spillStore === undefined || typeof sessionId !== 'string' || typeof exec.callId !== 'string') {
    warn(
      'subprocess-docker: a long bash output was left whole: no spill store or no session to save it under'
    )
    return decision
  }
  try {
    const ref = await spillStore.saveText({
      owner: { sessionId },
      source: { kind: 'tool', toolName: 'bash', callId: exec.callId, label: 'result' },
      suggestedName: 'bash.txt',
      content: text
    })
    return { ...decision, content: [{ type: 'text', text: renderBounded(bounded, ref) }] }
  } catch (error) {
    warn(`subprocess-docker: a long bash output was left whole: saving it failed (${String(error)})`)
    return decision
  }
}
