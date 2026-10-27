/** An owned local Invitations stand; never opens the normal local/dev database. */
import { randomBytes } from 'node:crypto'
import { serve } from '@hono/node-server'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { createPool, migrate } from '../src/db/index.js'
import { pgIdentityStore } from '../src/identity/store.js'
import { consoleTransport } from '../src/mail/transport.js'

// Fixed loopback stand owned by this feature, with public dummy credentials.
const pool = createPool('postgres://sandbox:sandbox@127.0.0.1:51830/postgres')
await migrate(pool)
const owner = (
  await pool.query(
    "insert into account(email) values('sandbox-owner@invitations.test') on conflict(email) do update set email=excluded.email returning id"
  )
).rows[0].id
let workspace = (await pool.query("select id from workspace where kind='tracy_admin' limit 1")).rows[0]?.id
if (!workspace)
  workspace = (
    await pool.query(
      "insert into workspace(display_name,kind) values('Invitations local sandbox','tracy_admin') returning id"
    )
  ).rows[0].id
await pool.query(
  "insert into seat_workspace(workspace_id,account_id,role,granted_by,accepted_at) values($1,$2,'owner',$2,now()) on conflict(workspace_id,account_id) do nothing",
  [workspace, owner]
)
const config = readConfig({
  TRACY_ORIGIN: 'http://localhost:51810',
  SITE_DOMAIN: 'localhost',
  TRACY_ENVIRONMENT: 'local',
  INVITATIONS_SANDBOX_ENABLED: '1',
  LOCAL_LOGIN_PREVIEW: '1',
  MAIL: 'console',
  SESSION_SECRET: randomBytes(32).toString('hex'),
  HOSTS: 'sandbox',
  HOST_sandbox_ORIGIN: 'http://127.0.0.1:51820',
  HOST_sandbox_DSH_ORIGIN: 'http://127.0.0.1:51800',
  HOST_sandbox_SECRET: randomBytes(32).toString('hex'),
  SEAT_sandbox_SECRET: randomBytes(32).toString('hex')
})
const app = buildApp({
  config,
  pool,
  identity: pgIdentityStore(pool),
  mail: consoleTransport(() => {}, { localPreview: true }),
  opsStaticDir: new URL('../../../packages/web/tracy-harness/dist/', import.meta.url).pathname
})
const server = serve({ fetch: app.fetch, port: 51810, hostname: '127.0.0.1' }, () =>
  console.log(
    'Invitations sandbox: http://localhost:51810/ops/invitations\nSign in as sandbox-owner@invitations.test; the local login page displays the one-time code.'
  )
)
async function stop() {
  await app.betaLogin?.stop()
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
  process.exit(0)
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
