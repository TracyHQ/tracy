/**
 * A fresh start of the build chat (migration 223): the account's build conversation moves to the next generation, so
 * `/new/build` opens a new, empty conversation with a new draft. The session ID stays derived on the server from the
 * account and the generation (`workspace/build-chat-session.js`); the browser never names it.
 *
 * Two ways in, one transaction each, holding the account's draft row:
 * - asked (`startOver`): the owner asked to start over, through the confirm page or the build agent's tool;
 * - stopped (`freshIfStopped`): `/new/build` found the account's build stopped for good (`stoppedForGood`).
 *
 * 🔒 A BUILT SITE KEEPS ITS DRAFT. The rebuild of a site (#612), its chat move (#611) and its pictures still read the
 * account's draft row after the build, so a draft whose build made a site is never removed here (`SITE_BUILT`): a
 * second site of the same account is a later ticket. A draft whose approved build has not ended is never removed
 * either (`BUILD_RUNNING`), nor one a step still works on (`ENGINE_BUSY`).
 *
 * 🔒 NOTHING OF THE OLD DRAFT REACHES THE NEW ONE. The row goes (its research, answers, plan and fault), its picture
 * rows go with it by cascade, and their stored objects are deleted before the answer. The old conversation stays in
 * dsh; its tool calls are refused from then on (`caller.js`: its session is no longer the account's build session).
 */
import { en } from '../lib/i18n/strings.js'
import { principalOf } from '../lib/wo-principal.js'
import { SAY } from './engine-state.js'

/**
 * What the owner reads about a start over, in English: the `startOver.*` words of tracy-web's pages
 * (`lib/i18n/strings.js`), translated there for the confirm page. Plain English, no dashes.
 */
export const START_OVER_SAY = Object.freeze({
  confirm: en['startOver.confirm'],
  done: en['startOver.done'],
  SITE_BUILT: en['startOver.SITE_BUILT'],
  BUILD_RUNNING: en['startOver.BUILD_RUNNING'],
  ENGINE_BUSY: en['startOver.ENGINE_BUSY'],
  NO_DRAFT: en['startOver.NO_DRAFT']
})

/**
 * Whether the draft's build stopped for good: a stop the owner cannot continue from in this conversation. Either
 * - the create door refused the approved build and made no site (`build.refusal`, no `build.site`): the chat says the
 *   stop as a statement and offers nothing to do (`build-route.js`, "A FAULT IS A STATEMENT"); or
 * - the latest engine step stopped on a team fault with its one re-run spent: `state: 'stopped'`, no `rerun`, and no
 *   reason the owner can act on (`engine.js stoppedOf`: a cancel, a refused change, a stale plan, a missing site name,
 *   a brand look not read, and the request for a link all carry a reason or ask the owner for something).
 * A draft whose build made a site is never stopped for good: that site lives on the draft.
 */
export function stoppedForGood(row) {
  if (!row || row.build?.site) return false
  if (row.build) return Boolean(row.build.refusal)
  const engine = row.engine
  if (engine?.state !== 'stopped' || engine.rerun) return false
  if (engine.reason) return false
  // A research that asks the owner about the business (`SAY.links`) or for its name (`SAY.name`) has no reason but
  // waits for the owner's answer (`engine.js`, `research_empty`).
  return engine.say !== SAY.links && engine.say !== SAY.name
}

/** Why the owner may not start this draft over, or null when they may. */
export function startOverRefusal(row) {
  if (!row) return null
  const build = row.build
  if (build && !build.endedAt && !build.refusal) return 'BUILD_RUNNING'
  if (build?.site) return 'SITE_BUILT'
  if (row.engine?.state === 'running') return 'ENGINE_BUSY'
  return null
}

/** The account's build generation: 0 when it never started over. */
export async function readGeneration(pool, accountId) {
  if (!accountId) return 0
  const { rows } = await pool.query('select generation from build_chat_generation where account_id = $1', [
    accountId
  ])
  return rows[0]?.generation ?? 0
}

/**
 * Move the account to its next generation and remove its draft, in one transaction. `only`: `asked` (refused by
 * `startOverRefusal`; an account with no draft still moves on, to an empty conversation) or `stopped` (only a draft
 * that `stoppedForGood`; anything else is `NOT_STOPPED` and changes nothing).
 * @returns {Promise<{generation: number, removed: boolean} | {error: string}>}
 */
export async function moveToNextGeneration(pool, accountId, { only, objects = null, log = console }) {
  const client = await pool.connect()
  let keys = []
  let answer
  try {
    await client.query('begin')
    const row = (
      await client.query('select * from build_draft where account_id = $1 for update', [accountId])
    ).rows[0]
    const refusal = only === 'stopped' ? (stoppedForGood(row) ? null : 'NOT_STOPPED') : startOverRefusal(row)
    if (refusal) {
      await client.query('rollback')
      return { error: refusal }
    }
    if (row) {
      keys = (
        await client.query('select object_key from build_draft_picture where account_id = $1', [accountId])
      ).rows.map((r) => r.object_key)
      await client.query('delete from build_draft where id = $1', [row.id])
      // The draft's fault was the team's only record of what stopped it: it is logged before it goes.
      if (row.fault)
        log.warn?.('[build-chat] fresh start removed a draft with fault', JSON.stringify(row.fault))
    }
    const moved = await client.query(
      `insert into build_chat_generation (account_id, generation) values ($1, 1)
         on conflict (account_id) do update set generation = build_chat_generation.generation + 1, updated_at = now()
       returning generation`,
      [accountId]
    )
    await client.query('commit')
    answer = { generation: moved.rows[0].generation, removed: Boolean(row) }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
  // Before the answer, so a research of the new conversation never meets an object of the old one.
  for (const key of keys) await objects?.delete?.(key).catch(() => false)
  return answer
}

/**
 * What `app.js` hands the doors: everything by the signed-in address, the account read on the server.
 * `settle(accountId)` stops a step whose process ended (`engine.js read`), so a step that is gone never refuses.
 */
export function freshStart({ pool, objects = null, settle = async () => {}, log = console }) {
  const accountOf = (email) => principalOf(pool, email)
  return {
    async generationOf(email) {
      return readGeneration(pool, await accountOf(email))
    },
    /** `/new/build`: a build stopped for good gives way to a new conversation. Answers whether it moved. */
    async freshIfStopped(email) {
      const accountId = await accountOf(email)
      if (!accountId) return false
      await settle(accountId).catch(() => null)
      const moved = await moveToNextGeneration(pool, accountId, { only: 'stopped', objects, log })
      return !moved.error
    },
    /**
     * The owner's start over. Answers `{generation}`, or `{error, say}` with the sentence for the owner. An address with
     * no account has no draft and no conversation that read one: `NO_DRAFT`.
     */
    async startOver(email) {
      const accountId = await accountOf(email)
      if (!accountId) return { error: 'NO_DRAFT' }
      await settle(accountId).catch(() => null)
      const moved = await moveToNextGeneration(pool, accountId, { only: 'asked', objects, log })
      return moved.error
        ? { ...moved, say: START_OVER_SAY[moved.error] ?? START_OVER_SAY.ENGINE_BUSY }
        : moved
    },
    confirmSay: START_OVER_SAY.confirm,
    says: START_OVER_SAY
  }
}
