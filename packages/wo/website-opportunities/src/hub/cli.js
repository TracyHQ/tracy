#!/usr/bin/env node
/**
 * Operating a self-hosted hub from the command line (`DATABASE_URL=postgres://... node src/hub/cli.js ...`):
 *
 *   token issue|rotate|revoke   --principal <wo_principal id>   a hub token; issue and rotate print it once on stdout
 *   account block|unblock       --account <hub account id>      a blocked account's token stops working
 *   contribution withdraw       --id <contribution id>          its observations stop counting; snapshots showing them are revoked
 *   place revoke                --place <place id> --reason <text>   take a place off the hub
 *   place suppress              --place <place id> --reason <text>   the business asked to be removed: never comes back
 *   media revoke                --media <media id> --reason <text>   one picture off the hub
 *
 * Exit 0 on success, 1 when refused (no such row, a token already exists), 2 on bad usage.
 */
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createHubContributions } from './contributions.js'
import { createHubQuota } from './quota.js'
import { revokeMedia, revokePlace, suppressBusiness } from './revocations.js'
import { createHubTokens } from './tokens.js'

const USAGE = `usage: node src/hub/cli.js
  token issue|rotate|revoke --principal <id>
  account block|unblock --account <id>
  contribution withdraw --id <id>
  place revoke|suppress --place <id> --reason <text>
  media revoke --media <id> --reason <text>`
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTOR = 'hub-cli'

/** What each command needs: verbs, the id option, whether `--reason` is required. */
const COMMANDS = {
  token: { verbs: ['issue', 'rotate', 'revoke'], id: '--principal' },
  account: { verbs: ['block', 'unblock'], id: '--account' },
  contribution: { verbs: ['withdraw'], id: '--id' },
  place: { verbs: ['revoke', 'suppress'], id: '--place', reason: true },
  media: { verbs: ['revoke'], id: '--media', reason: true }
}

const optionOf = (args, name) => {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : undefined
}

class Refused extends Error {}

async function runCommand(pool, noun, verb, id, reason) {
  if (noun === 'token') {
    const tokens = createHubTokens({ pool })
    if (verb === 'revoke') return { note: (await tokens.revoke(id)) ? 'token revoked' : 'no active token' }
    return { out: (await tokens[verb](id)).token }
  }
  if (noun === 'account') {
    const { rowCount } = await pool.query('update wo_hub_account set state = $2 where id = $1', [
      id,
      verb === 'block' ? 'blocked' : 'active'
    ])
    if (!rowCount) throw new Refused('no such hub account')
    return { note: `account ${verb === 'block' ? 'blocked' : 'active'}` }
  }
  if (noun === 'contribution') {
    const owner = (await pool.query('select account_id from wo_hub_contribution where id = $1', [id])).rows[0]
    if (!owner) throw new Refused('no such contribution')
    const contributions = createHubContributions({ pool, quota: createHubQuota({ pool }) })
    const receipt = await contributions.withdraw(owner.account_id, id)
    return { note: `contribution ${receipt.status}` }
  }
  if (noun === 'place') {
    const known = await pool.query('select 1 from wo_place where id = $1', [id])
    if (!known.rowCount) throw new Refused('no such place')
    const act = verb === 'suppress' ? suppressBusiness : revokePlace
    const done = await act(pool, { placeId: id, reason, actor: ACTOR })
    return {
      note: done.already ? 'already done' : verb === 'suppress' ? 'business removed' : 'place revoked'
    }
  }
  const done = await revokeMedia(pool, { mediaId: id, reason })
  if (!done.revoked) throw new Refused('no such picture, or already revoked')
  return { note: 'picture revoked' }
}

/** @returns {Promise<number>} the exit code */
export async function main(argv, { env = process.env, out = process.stdout, err = process.stderr } = {}) {
  const [noun, verb, ...rest] = argv
  const spec = COMMANDS[noun]
  const id = spec ? optionOf(rest, spec.id) : undefined
  const reason = optionOf(rest, '--reason')
  if (!spec || !spec.verbs.includes(verb) || !id || !UUID_RE.test(id) || (spec.reason && !reason?.trim())) {
    err.write(`${USAGE}\n`)
    return 2
  }
  if (!env.DATABASE_URL) {
    err.write('DATABASE_URL is required\n')
    return 2
  }
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 })
  try {
    const result = await runCommand(pool, noun, verb, id, reason?.trim())
    if (result.out) out.write(`${result.out}\n`)
    if (result.note) err.write(`${result.note}\n`)
    return 0
  } catch (error) {
    // 23503: the principal named does not exist.
    const message =
      error instanceof Refused ? error.message : error?.code === '23503' ? 'no such principal' : error.message
    err.write(`${message}\n`)
    return 1
  } finally {
    await pool.end()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((code) => process.exit(code))
}
