/**
 * Where a moment goes and whose name it carries on the host's one dsh (ADR 0014) — kept apart from
 * `index.ts` so a test can hold it.
 *
 * A lane knows its site (`MCP_TRACY_SITE_KEY`) and borrows the cookie of the viewer who opened it.
 * The host's dsh has neither: its site key is empty on purpose (`dsh/host-dsh-init.sh`), and a
 * cookie seen by a process that serves every site belongs to whoever opened a page last. So the
 * site comes from the folder the idle session stands in, and the name from the person who typed the
 * turn, vouched for by the password gate's assertion — the same two answers `tracy_site` acts on.
 * Without them nothing was recorded, and the agent's edits were later sealed as "outside Tracy".
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

// The path fence's own reading of "which site does this session stand in" — reused, not restated.
import { resolveSitesRoot, siteOf } from '../../../../tools/tracy-subprocess-docker/src/route.mjs'
// Who typed the turn, read off the session's events exactly as `tracy_site` reads it.
import { latestPrompter, personWords } from '../../../../tools/tracy-site-tools/src/host/prompter.mjs'
// The one grammar of a Browser-tab comment turn (contract H5 of plan "comment multi-pin").
import { parseCommentTurn } from '../../../../ui/tracy-chat-input/src/client/comment-turn.mjs'

/**
 * A turn title's length cap, in characters: the whole prompt, as `site_turn.title` (text) keeps it.
 * Tracy cuts the Git commit subject to 200 itself, between words with "…" (`route.js` `/moment`);
 * a hard cut here at 200 left the opened row and the commit ending mid-word (dev round 02/10).
 */
const MAX_TITLE = 4000

/**
 * The title of the moment: the last thing the PERSON typed — not an injected context, not a goal
 * round — squeezed to one line. Returns the event's position too, so one turn is recorded once.
 *
 * Read through `personWords`, the one reading of "the customer's own words": a Browser-tab comment
 * carries a fenced `tracy-element` block and Tracy's hint line after the request, and neither is a
 * note for the History tab (dev acceptance 28/09: the moment showed the whole block). Several
 * comments sent in one turn are titled by the first comment's words and how many more follow
 * (`Change the heading +2`), not by a numbered list squeezed onto one line.
 * @param {readonly { type?: string, data?: unknown }[]} events - the session's events, oldest first.
 * @returns {{ title: string, index: number } | null}
 */
export function momentTitle(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (event?.type !== 'user/message') continue
    const data = /** @type {{ source?: { kind?: string }, content?: unknown } | undefined} */ (event.data)
    const source = data?.source?.kind
    if (source !== undefined && source !== 'user' && source !== 'human') continue
    const title = contentTitle(data?.content)
    if (title === '') continue
    return { title, index: i }
  }
  return null
}

/**
 * One message's content as a moment title: the person's words (`personWords`), several comments as
 * the first one's words and ` +N`, squeezed to one line and capped. Empty when nothing is left.
 * @param {unknown} content
 * @returns {string}
 */
export function contentTitle(content) {
  return contentRequest(content).title
}

/**
 * {@link contentTitle} plus whether the cap cut it. Only this side knows: what reaches tracy-web is
 * already within its own 4000-character cap, so the turn door would read a cut title as `full`
 * (QA-A11, 03/10: 4114 characters typed, stored 3995 ending in "…", `request.state` `full`).
 * @param {unknown} content
 * @returns {{ title: string, cut: boolean }}
 */
export function contentRequest(content) {
  // A block not on lines of its own is said in the chat chip's words, never left as markup (03/10).
  const line = titleOf(withoutRevertBlock(personWords(content, { mentions: 'label' })), content)
    .replace(/\s+/g, ' ')
    .trim()
  if (line.length <= MAX_TITLE) return { title: line, cut: false }
  const room = line.slice(0, MAX_TITLE)
  const space = room.lastIndexOf(' ')
  return {
    title: `${(space > 0 ? room.slice(0, space) : room.slice(0, MAX_TITLE - 1)).replace(/[\s,.;:]+$/, '')}…`,
    cut: true
  }
}

/**
 * "Ask Tracy to revert" sends the person's sentence and a fenced `tracy-revert` block of Tracy's
 * record (`@tracy/core` `revert-prompt.ts`): the chat shows the block as a chip, and Site changes
 * shows the sentence as the turn's request — never the block. Only the block goes; the sentence
 * stays whole.
 */
const REVERT_BLOCK = /(^|\n)```tracy-revert\n[\s\S]*?\n```(?=\n|$)/g

/** @param {string} words */
function withoutRevertBlock(words) {
  if (!words.includes('```tracy-revert\n')) return words
  return words
    .replace(REVERT_BLOCK, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * A turn's title before squeezing: the person's words, or for several comments the first one's
 * words and ` +N` for the others.
 * @param {string} words - `personWords` of the message.
 * @param {unknown} content - the message content, read as one text for the comment grammar.
 * @returns {string}
 */
function titleOf(words, content) {
  // Read by the grammar, never by the words' shape: since S16 (30/09) no comment is a numbered line.
  if (!words.includes('\n')) return words
  const text = Array.isArray(content)
    ? content.map((part) => (part && typeof part.text === 'string' ? part.text : '')).join('\n')
    : content
  const items = parseCommentTurn(text)?.items ?? []
  if (items.length < 2 || items[0].text.trim() === '') return words
  return `${items[0].text} +${items.length - 1}`
}

/**
 * The site key a site folder records in `.tracy/site.json`, or null when there is none to read.
 * @param {string} folder - `<sitesRoot>/<label>`.
 * @returns {Promise<string | null>}
 */
export async function recordedSiteKey(folder) {
  try {
    const record = JSON.parse(await readFile(path.join(folder, '.tracy', 'site.json'), 'utf8'))
    const key = record !== null && typeof record === 'object' ? record.siteKey : null
    return typeof key === 'string' && key.trim() !== '' ? key.trim() : null
  } catch {
    return null
  }
}

/**
 * The moment request for one idle session on the host dsh, or why there is none.
 *
 * A session outside every site folder (onboarding, a person's own scratch) has no moment to record,
 * and says so with a null reason rather than a log line per turn. A folder with no readable
 * `site.json` still records: the moment door resolves `_conversation` from the label header.
 *
 * @param {object} input
 * @param {unknown} input.cwd - the session's `header.cwd`, written by dsh, never by the model.
 * @param {readonly unknown[] | undefined} input.events - the session's events, oldest first.
 * @param {string | null} input.origin - `MCP_TRACY_ORIGIN`: where the moment door answers.
 * @param {{ mint?: (email: string) => string | null } | undefined} input.signer - the gate's `tracyAssertion`.
 * @param {Record<string, string | undefined>} [input.env] - where `TRACY_SITES_ROOT` is read.
 * @returns {Promise<{ ok: true, url: string, headers: Record<string, string> } | { ok: false, reason: string | null }>}
 */
export async function hostMomentRequest({ cwd, events, origin, signer, env = process.env }) {
  const who = latestPrompter(/** @type {any} */ (events))
  return hostDoorRequest({ door: 'moment', cwd, email: who?.email ?? null, origin, signer, env })
}

/**
 * A call to one of the site's doors on tracy-web (`moment`, `turn`, `moment/wait`) from the host dsh,
 * signed as `email` and naming the site folder `cwd` stands in — the reading {@link hostMomentRequest}
 * has always made, for any door. Same refusals, same order.
 * @param {object} input
 * @param {'moment' | 'turn' | 'turn/undone' | 'moment/wait' | 'turn/rating'} input.door
 * @param {unknown} input.cwd
 * @param {string | null} input.email - the person who typed; null refuses by name.
 * @param {string | null} input.origin
 * @param {{ mint?: (email: string) => string | null } | undefined} input.signer
 * @param {Record<string, string | undefined>} [input.env]
 * @returns {Promise<{ ok: true, url: string, headers: Record<string, string> } | { ok: false, reason: string | null }>}
 */
export async function hostDoorRequest({ door, cwd, email, origin, signer, env = process.env }) {
  let sitesRoot
  let label
  try {
    sitesRoot = resolveSitesRoot(undefined, env)
    label = siteOf(String(cwd ?? ''), sitesRoot).label
  } catch {
    return { ok: false, reason: null }
  }
  if (!origin) return { ok: false, reason: 'no MCP_TRACY_ORIGIN on this dsh' }
  if (!email) return { ok: false, reason: 'nobody with an email address typed this turn' }
  const siteKey = (await recordedSiteKey(path.join(sitesRoot, label))) ?? '_conversation'
  // Signed last, right before the call: an assertion lives sixty seconds and cannot be revoked.
  const assertion = typeof signer?.mint === 'function' ? signer.mint(email) : null
  if (!assertion) return { ok: false, reason: 'the password gate cannot sign for the person who typed' }
  return {
    ok: true,
    url: `${origin.replace(/\/+$/, '')}/api/sites/${encodeURIComponent(siteKey)}/${door}`,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-tracy-actor': assertion,
      'x-tracy-workspace-label': label
    }
  }
}
