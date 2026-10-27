/**
 * The chat-turn record of a site (`site_turn`, `site_outside` — `046-site-turn.sql`): who typed
 * what to Tracy, when that turn opened and closed, which moment it left, and the Git commits made
 * outside any turn. Written by the doors in `route.js` (`POST /turn`, `POST /moment`, the reads);
 * read by the Site changes tab (`activity.js`, P1).
 *
 * Plan `tasks/todo-site-changes.md` §5–§6. What this file guarantees:
 *   - one row per turn id, whatever retries or steers arrive (`openTurn` is insert-or-merge);
 *   - a turn is closed only on its own site, and a retried close never wipes the moment it recorded;
 *   - two conversations' turns open on one site at once are BOTH flagged `concurrent` (a declared
 *     limit: their files share a working tree);
 *   - an `open` row older than {@link STALE_AFTER_MS} reads `stale`: its dsh died before the turn
 *     stopped, and nobody will close it;
 *   - `unsealed_start` says the turn's moments may hold files changed before it began: set when its
 *     opening seal did not end in time, taken off again only by a late seal that proves the start.
 */

/** A chat turn's id: `<dsh session id>:<turn number>` (P0 `turn-id.md`). Same shape `webroot-git.sh` checks. */
export const TURN_ID_SHAPE = /^[A-Za-z0-9_-]{1,128}:[0-9]{1,9}$/

/** An `open` turn older than this is `stale`: the open mark on the host stops holding seals back too. */
export const STALE_AFTER_MS = 30 * 60_000

/**
 * A whole-site build's turn (`wo-demo-<action>` sessions, `client-demo.js`) runs as long as its build may — two hours —
 * and is stale only past that: at thirty minutes it was marked stale mid-build and every later write of the build was
 * refused AGENT_DEMO_TURN_NOT_BOUND (local stand 24/10/2026).
 */
export const BUILD_STALE_AFTER_MS = 2 * 60 * 60_000

/** The SQL that says an `open` row is stale, given `$cut` (now − 30 min) and `$buildCut` (now − 2 h) as its params. */
export const staleWhere = (cut, buildCut) =>
  `opened_at < ${cut} and (session_id not like 'wo-demo-%' or opened_at < ${buildCut})`

/** A Git moment's title: one commit subject line, read in lists. */
export const MOMENT_TITLE_MAX = 200
/**
 * A turn's title as stored (`site_turn.title` is `text`): the whole prompt, so the opened row reads
 * what the person typed. The cap only keeps a pasted page out of a list row's record.
 */
export const TURN_TITLE_MAX = 4000

/**
 * `text` on one line, at most `max` characters: cut at the last space that fits and ended with "…"
 * when it had to be cut; a single word longer than `max` is cut inside it, still with "…".
 * @param {unknown} text
 * @param {number} max
 * @returns {string}
 */
export function titleWithin(text, max) {
  const line = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  if (line.length <= max) return line
  const room = line.slice(0, max)
  const space = room.lastIndexOf(' ')
  const kept = (space > 0 ? room.slice(0, space) : room.slice(0, max - 1)).replace(/[\s,.;:]+$/, '')
  return `${kept}…`
}

/**
 * Whether a stored turn title is the person's whole request (`site_turn.request_state`, 048):
 * `truncated` when {@link titleWithin} had to cut `raw` at `max`, else `full`. Whitespace runs
 * folded to one space do not count as a cut (the words are all there).
 * @param {unknown} raw what the person sent
 * @param {number} max
 * @returns {'full' | 'truncated'}
 */
export function requestStateFor(raw, max) {
  const line = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
  return line.length > max ? 'truncated' : 'full'
}

/**
 * The request state of a turn whose door did not say: from what reached `openTurn`.
 *   - several comments in one turn: the title is the host's summary "<first comment> +N" (P0 §3),
 *     not the words of every comment → `truncated`;
 *   - a title not ending in "…": {@link titleWithin} ends every cut with "…", so nothing was cut →
 *     `full`;
 *   - a title ending in "…": a cut, or the person's own "…" — not provable → null (unknown).
 * @param {{ title: string, commentNs?: number[] | null }} turn
 * @returns {'full' | 'truncated' | null}
 */
export function inferRequestState(turn) {
  if (Array.isArray(turn.commentNs) && turn.commentNs.length > 1) return 'truncated'
  return typeof turn.title === 'string' && !turn.title.endsWith('…') ? 'full' : null
}

/**
 * The session and the turn number a turn id names, or null when it is not one.
 * @param {unknown} turnId
 * @returns {{ sessionId: string, turn: number } | null}
 */
export function parseTurnId(turnId) {
  if (typeof turnId !== 'string' || !TURN_ID_SHAPE.test(turnId)) return null
  const at = turnId.lastIndexOf(':')
  return { sessionId: turnId.slice(0, at), turn: Number(turnId.slice(at + 1)) }
}

/**
 * Open a turn, or merge into the one already open under that id (a retry, or a second message the
 * person typed while it ran — `steered`). `created` says which: only a NEW turn seals the site.
 *
 * @param {import('pg').Pool} pool
 * `request_state` (048) is written once, by the opening call: `requestState` when the door knows
 * whether it cut the words ({@link requestStateFor}), else what {@link inferRequestState} can prove.
 * A merge (steer, retry) leaves it as the first call wrote it.
 *
 * @param {{ turnId: string, siteKey: string, actor: string, title: string, source: 'panel' | 'comment',
 *   promptMessageId?: string | null, rpcId?: string | null, commentNs?: number[] | null,
 *   steered?: boolean, requestState?: 'full' | 'truncated' | null }} turn
 * @returns {Promise<{ created: boolean, row: Record<string, unknown> }>}
 */
export async function openTurn(pool, turn) {
  const parsed = parseTurnId(turn.turnId)
  if (parsed === null) throw new Error(`not a turn id: ${turn.turnId}`)
  const { rows } = await pool.query(
    `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, source, prompt_message_id, rpc_id, steered,
                            comment_ns, request_state)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (turn_id) do update
        set steered = site_turn.steered or excluded.steered,
            comment_ns = coalesce(site_turn.comment_ns, excluded.comment_ns),
            -- A step steered into a turn its host already closed (a check's notice, a todo reminder, sent at
            -- turn-stopping) runs the turn on: it is open again until the turn stops again and closes it.
            state = case when excluded.steered and site_turn.state = 'closed' then 'open' else site_turn.state end
      where site_turn.site_key = excluded.site_key
     returning *, (xmax = 0) as created`,
    [
      turn.turnId,
      turn.siteKey,
      parsed.sessionId,
      parsed.turn,
      turn.actor,
      turn.title,
      turn.source,
      turn.promptMessageId ?? null,
      turn.rpcId ?? null,
      turn.steered === true,
      Array.isArray(turn.commentNs) && turn.commentNs.length ? turn.commentNs : null,
      turn.requestState === 'full' || turn.requestState === 'truncated'
        ? Array.isArray(turn.commentNs) && turn.commentNs.length > 1
          ? 'truncated'
          : turn.requestState
        : inferRequestState(turn)
    ]
  )
  // A turn id already taken on ANOTHER site: the `where` above matched nothing, so nothing was
  // returned. A dsh never sends that (a session stands in one site folder); refuse to mix them.
  if (rows.length === 0) throw new Error(`turn ${turn.turnId} belongs to another site`)
  const { created, ...row } = rows[0]
  return { created: created === true, row }
}

/**
 * Mark every `open` turn of a site older than {@link STALE_AFTER_MS} as `stale`.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {Date} [now]
 * @returns {Promise<number>} how many turned stale
 */
export async function markStale(pool, siteKey, now = new Date()) {
  const { rowCount } = await pool.query(
    `update site_turn set state = 'stale'
      where site_key = $1 and state = 'open' and ${staleWhere('$2', '$3')}`,
    [siteKey, new Date(now.getTime() - STALE_AFTER_MS), new Date(now.getTime() - BUILD_STALE_AFTER_MS)]
  )
  return rowCount ?? 0
}

/**
 * Flag `turnId` and every other conversation's turn still open on the same site as `concurrent`.
 * @param {import('pg').Pool} pool
 * @param {string} turnId
 * @returns {Promise<boolean>} whether another conversation's turn was open
 */
export async function flagConcurrent(pool, turnId) {
  const { rows } = await pool.query(
    `with me as (select site_key, session_id from site_turn where turn_id = $1),
          others as (
            update site_turn t set concurrent = true
              from me
             where t.site_key = me.site_key and t.session_id <> me.session_id and t.state = 'open'
            returning t.turn_id)
     update site_turn set concurrent = true
      where turn_id = $1 and exists (select 1 from others)
     returning turn_id`,
    [turnId]
  )
  return rows.length > 0
}

/** One turn's row, or null. */
export async function turnOf(pool, turnId) {
  const { rows } = await pool.query('select * from site_turn where turn_id = $1', [turnId])
  return rows[0] ?? null
}

/** The seal at the start of the turn did not run: what was dirty before it may sit in its moment. */
export async function markUnsealedStart(pool, turnId) {
  await pool.query('update site_turn set unsealed_start = true where turn_id = $1', [turnId])
}

/**
 * The seal at the start of the turn ended late but still proves where the turn began
 * (`door-follow-up.js` `sealProvesStart`): the mark comes off.
 * @returns {Promise<boolean>} whether a mark was taken off
 */
export async function clearUnsealedStart(pool, turnId) {
  const { rowCount } = await pool.query(
    'update site_turn set unsealed_start = false where turn_id = $1 and unsealed_start',
    [turnId]
  )
  return (rowCount ?? 0) > 0
}

/** The most of Tracy's answer a turn keeps (`site_turn.reply`, 050): characters, then UTF-8 bytes. */
export const REPLY_MAX = 2000
export const REPLY_MAX_BYTES = 4000
/**
 * How a turn may end, as dsh writes `turn/end` (`@deepseek-ai/dsh-session` `TurnEndReasonMap`) and the
 * host sends it on `/moment` (`endReason`, 054). {@link FAILED_END_REASONS}: the turn did not finish its
 * work — a comment sent into it does not count as sent (ADR 0025).
 */
export const END_REASONS = new Set(['completed', 'max-tokens', 'error', 'aborted', 'blocked', 'interrupted'])
export const FAILED_END_REASONS = Object.freeze(['error', 'aborted', 'blocked', 'interrupted'])

/** How the answer reached the door: whole, cut, or cut short by a cancelled turn. */
export const REPLY_STATES = new Set(['full', 'truncated', 'interrupted'])

/**
 * Tracy's answer as a turn keeps it — whatever the sender already did to it (plan
 * `tasks/todo-open-conversation.md` §C: the door does not trust the host's cut). Line breaks stay
 * (an answer has paragraphs); runs of blank lines fold to one, spaces and tabs to one space,
 * control characters go. Past {@link REPLY_MAX} characters it is cut at the last space that fits
 * and marked "…"; then, should multi-byte text still pass {@link REPLY_MAX_BYTES}, cut further by
 * whole characters.
 * @param {unknown} text
 * @returns {{ text: string, cut: boolean } | null} null when nothing readable is left
 */
export function replyWithin(text) {
  if (typeof text !== 'string') return null
  // Control characters out (tab, line feed and carriage return stay for the folding below).
  const printable = [...text]
    .filter((ch) => {
      const code = ch.charCodeAt(0)
      return !((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127)
    })
    .join('')
  const clean = printable
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (clean === '') return null
  let out = clean
  let cut = false
  if ([...out].length > REPLY_MAX) {
    const room = [...out].slice(0, REPLY_MAX).join('')
    const space = room.search(/\s\S*$/)
    out = `${(space > 0 ? room.slice(0, space) : [...room].slice(0, REPLY_MAX - 1).join('')).replace(/[\s,.;:]+$/, '')}…`
    cut = true
  }
  while (Buffer.byteLength(out, 'utf8') > REPLY_MAX_BYTES) {
    out = `${[...out.replace(/…$/, '')].slice(0, -1).join('')}…`
    cut = true
  }
  return { text: out, cut }
}

/**
 * Close a turn on its own site with the moment its stop recorded. A retried close (the answer to
 * the first was lost) finds nothing dirty: it keeps the moment already recorded rather than writing
 * `null` over it. A turn that stopped twice (another plugin steered it on) adds its second moment's
 * files and moves `head_sha` to the newer commit.
 *
 * `reply` (050): Tracy's answer, already through {@link replyWithin}; a close without one (an older
 * dsh, a retry that lost it) keeps the one recorded — like the moment.
 *
 * `endReason` (054, ADR 0025): how the turn ended — the `turn/end` reason kind the host read
 * ({@link END_REASONS}); a close without one keeps the one recorded.
 *
 * `filedAt` (063, ledger L31): when this close's host job was filed. A close may now be written after
 * a later one — its job outlived the door's wait and the follow-up sweep heard of it afterwards
 * (`door-follow-up.js`) — so the head, the answer and the end reason are written only by a close whose
 * job was filed no earlier than the one that last wrote them; an earlier one adds its files and
 * closes the row, nothing more. Without `filedAt` a close writes as it always did.
 *
 * `closedAt` (063): when the host ended the close's job, for a close heard late; without it, now. A
 * turn closed twice keeps the later of the two.
 *
 * `work` (114): what the turn took, as the host read it off the turn's events — steps, tool calls, and
 * the calls whose answer was a failure. Written like the answer: by the newest close, kept when absent.
 *
 * @param {import('pg').Pool | import('pg').PoolClient} pool
 * @param {{ turnId: string, siteKey: string, sha: string | null, files: number,
 *   reply?: { text: string, state: 'full' | 'truncated' | 'interrupted' } | null,
 *   endReason?: string | null, filedAt?: Date | null, closedAt?: Date | null,
 *   usage?: Record<string, number> | null,
 *   work?: { steps: number, calls: number, failedCalls: number } | null }} moment
 * @returns {Promise<Record<string, unknown> | null>} the row, or null when no such turn is on that site
 */
export async function closeTurn(
  pool,
  {
    turnId,
    siteKey,
    sha,
    files,
    reply = null,
    endReason = null,
    filedAt = null,
    closedAt = null,
    work = null,
    usage = null
  }
) {
  const newer = '($8::timestamptz is null or close_filed_at is null or $8::timestamptz >= close_filed_at)'
  const { rows } = await pool.query(
    `update site_turn
        set state = 'closed',
            closed_at = greatest(closed_at, coalesce($9::timestamptz, now())),
            head_sha = case when ${newer} then coalesce($3, head_sha) else head_sha end,
            files = files + $4,
            reply = case when ${newer} then coalesce($5, reply) else reply end,
            reply_state = case when ${newer} and $5::text is not null then $6 else reply_state end,
            end_reason = case when ${newer} then coalesce($7, end_reason) else end_reason end,
            steps = case when ${newer} then coalesce($10, steps) else steps end,
            calls = case when ${newer} then coalesce($11, calls) else calls end,
            failed_calls = case when ${newer} then coalesce($12, failed_calls) else failed_calls end,
            token_usage = case when $13::jsonb is not null and
              (token_usage is null or ($13::jsonb->>'lastSeq')::bigint >= (token_usage->>'lastSeq')::bigint)
              then $13::jsonb else token_usage end,
            close_filed_at = greatest(close_filed_at, $8::timestamptz)
      where turn_id = $1 and site_key = $2
     returning *`,
    [
      turnId,
      siteKey,
      sha,
      sha === null ? 0 : files,
      reply?.text ?? null,
      reply?.state ?? null,
      endReason,
      filedAt,
      closedAt,
      work?.steps ?? null,
      work?.calls ?? null,
      work?.failedCalls ?? null,
      usage === null ? null : JSON.stringify(usage)
    ]
  )
  return rows[0] ?? null
}

/** A visual check's verdict on a turn (`site_turn.visual`, 114); `skipped` carries why in `visual_note`. */
export const VISUAL_VERDICTS = new Set(['shown', 'not_shown', 'broken', 'cannot_tell', 'skipped'])
/** A skip reason as `visual-check.mjs` names it (`no-write`, `capture-TIMEOUT`, `judge-failed`…). */
export const VISUAL_NOTE = /^[a-z][a-zA-Z0-9_-]{0,47}$/

/**
 * Keep the visual check's verdict on one turn of this site. A turn checked twice (a steer ran one more
 * step, which closes without a second check) keeps the latest word.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {string} turnId
 * @param {{ visual: string, note: string | null }} said
 * @returns {Promise<boolean>} whether the turn is this site's
 */
export async function checkTurn(pool, siteKey, turnId, { visual, note }) {
  const { rowCount } = await pool.query(
    'update site_turn set visual = $3, visual_note = $4 where turn_id = $1 and site_key = $2',
    [turnId, siteKey, visual, note]
  )
  return rowCount === 1
}

const OUTSIDE_CAUSES = new Set(['seal', 'deploy', 'housekeeping'])
/** The most paths a seal keeps (`site_outside.paths`); a bigger seal keeps none and is never folded. */
const OUTSIDE_PATHS_MAX = 2000

/**
 * Keep outside commits the host reported (`webroot-git.sh`: a seal's `sealed`, the seal-outside op's
 * recent `outside` list) as `site_outside` rows — insert-or-skip by sha, so the same commit reported
 * by two ops is one row. Rows that do not look like a commit are dropped, not trusted.
 *
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {unknown[]} commits - `{sha, at?, files: string[] | number, cause?, deployTag?, parentAt?}`
 * @returns {Promise<number>} rows newly kept
 */
export async function recordOutside(pool, siteKey, commits) {
  let kept = 0
  for (const commit of Array.isArray(commits) ? commits : []) {
    const c = /** @type {Record<string, unknown>} */ (commit ?? {})
    if (typeof c.sha !== 'string' || !/^[0-9a-f]{40,64}$/.test(c.sha)) continue
    const cause = typeof c.cause === 'string' && OUTSIDE_CAUSES.has(c.cause) ? c.cause : 'seal'
    const files = Array.isArray(c.files) ? c.files.length : Number.isInteger(c.files) ? Number(c.files) : 0
    const at = typeof c.at === 'number' && Number.isFinite(c.at) ? new Date(c.at * 1000) : new Date()
    const tag = typeof c.deployTag === 'string' && c.deployTag.length <= 128 ? c.deployTag : null
    // E5.1c (062): which files a seal holds and when its window opened, so a CMS row that wrote them
    // all can stand for it (`notFoldedSeal`). Kept only whole: a list over the cap, or one with a
    // non-path in it, is not kept at all — a partial list would fold a seal on half the evidence.
    const paths =
      cause === 'seal' &&
      Array.isArray(c.files) &&
      c.files.length > 0 &&
      c.files.length <= OUTSIDE_PATHS_MAX &&
      c.files.every((f) => typeof f === 'string' && f !== '' && f.length <= 1024)
        ? /** @type {string[]} */ (c.files)
        : null
    const parentAt =
      paths && typeof c.parentAt === 'number' && Number.isFinite(c.parentAt)
        ? new Date(c.parentAt * 1000)
        : null
    const { rows } = await pool.query(
      `insert into site_outside (sha, site_key, at, files, cause, deploy_tag, paths, parent_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (site_key, sha) do update
         set paths = coalesce(site_outside.paths, excluded.paths),
             parent_at = coalesce(site_outside.parent_at, excluded.parent_at)
       returning (xmax = 0) as inserted`,
      [c.sha, siteKey, at, files, cause, cause === 'deploy' ? tag : null, paths, parentAt]
    )
    kept += rows[0]?.inserted === true ? 1 : 0
  }
  return kept
}

/** The ratings a turn's answer may carry: dsh's message feedback (`positive` / `negative`). */
export const RATINGS = new Set(['positive', 'negative'])
/** A category a rating is filed under, as dsh names them (`task-result`, `other`…). */
export const RATING_CATEGORY = /^[a-z][a-z-]{0,39}$/

/**
 * Keep (or, with `rating: null`, clear) a Good or Bad on the answer of one turn of this site (#1403 item 13,
 * migration 113). Only the judgement and its categories: the note a person may write never reaches here.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {string} turnId
 * @param {{ rating: 'positive' | 'negative' | null, categories: string[] }} said
 * @returns {Promise<boolean>} whether the turn is this site's
 */
export async function rateTurn(pool, siteKey, turnId, { rating, categories }) {
  const { rowCount } = await pool.query(
    `update site_turn
        set rating = $3,
            rating_categories = $4::jsonb,
            rated_at = case when $3::text is null then null else now() end
      where turn_id = $1 and site_key = $2`,
    [turnId, siteKey, rating, rating === null ? null : JSON.stringify(categories)]
  )
  return rowCount === 1
}
