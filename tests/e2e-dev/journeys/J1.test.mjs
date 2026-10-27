// J1 — sign-in by emailed code. The suite owns no mailbox (plan §5 Q1), so the half that reads
// the code and posts it to `/verify` cannot be judged: the journey always ends BLOCKED.
//
// What it still measures, once per run (the cap is 5 codes per address per hour, 30 per IP):
//   - `POST /login` for a run address on `example.test` answers `{ ok: true }` and nothing more —
//     never a code in the answer (`localCode` exists only on a local preview deployment);
//   - the request was not refused by the rate limit;
//   - which branch answered, read back from the database: a code row written (`otp_code`) or the
//     beta gate's queued request (`beta_login_job`), since both answer the same `{ ok: true }`.

import { test } from 'node:test'
import { Client } from '../lib/api.mjs'
import { devExec } from '../lib/dev.mjs'
import { runEmail } from '../lib/env.mjs'
import { Blocked, check, journey, runContext } from '../lib/journey.mjs'
import { noteAccount } from '../lib/run-site.mjs'

test('J1 sign-in by emailed code', async (t) => {
  const { runId, manifest } = runContext()
  await journey(t, { id: 'J1' }, async ({ details }) => {
    const email = runEmail(runId, 'otp')
    // `/login` writes no account row (only `/verify` does), but the code row it may write is the
    // run's; the manifest names the address so the report lists it (a fixed account is no run's).
    noteAccount(manifest, email, { only: 'sign-in code request' })

    const anon = new Client({ name: 'stranger' })
    const res = await anon.post('/login', { email })
    details.login = {
      status: res.status,
      ms: res.ms,
      keys: res.json ? Object.keys(res.json).sort() : null,
      code: res.json?.code ?? null
    }
    check(res.status !== 429, `POST /login was rate limited (${res.json?.code ?? res.status})`)
    check(
      res.status === 200,
      `POST /login answered ${res.status} ${res.json?.code ?? res.text.slice(0, 120)}`
    )
    check(res.json?.ok === true, `POST /login answered ${JSON.stringify(res.json)}, expected { ok: true }`)
    check(!('localCode' in (res.json ?? {})), 'POST /login handed the sign-in code back in its answer')

    // Which branch answered. Read-only, filtered by the run's own address.
    const rows = await devExec.psqlReadOnly(
      runId,
      `select (select count(*) from otp_code where email = :'email'),
              (select count(*) from beta_login_job where email = :'email')`,
      { email }
    )
    const [codes, queued] = (rows[0] ?? []).map(Number)
    details.branch = { otpCodeRows: codes, betaQueueRows: queued }
    // Not a verdict: the beta gate's queue deletes its row once the mail is handed over, so "no row
    // of either kind" is what a drained beta request looks like too.
    const branch =
      codes === 1
        ? 'a code row was written'
        : queued === 1
          ? 'the beta gate queued the request'
          : 'no code row (the beta gate answers the same and drains its queue row)'

    throw new Blocked(
      `no test mailbox (plan §5 Q1): the code sent to ${email} cannot be read, so /verify is not exercised` +
        ` (door answered ok; ${branch})`,
      'mailbox'
    )
  })
})
