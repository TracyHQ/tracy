import { randomUUID } from 'node:crypto'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'

export const realBase = '/api/ops/invitations/real'
export const realOrigin = 'http://tracy.test'
export async function realOps({ pool, keys, root, enabled = true, production = false, origin = realOrigin }) {
  const config = readConfig({
    TRACY_ORIGIN: production ? 'https://cowork.tracy.ai' : origin,
    SITE_DOMAIN: 'tracy.test',
    SESSION_SECRET: 's'.repeat(32),
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://host',
    HOST_local_DSH_ORIGIN: 'http://dsh',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k',
    TRACY_ENVIRONMENT: production ? 'production' : 'local',
    ...(enabled ? { INVITATIONS_REAL_KEY_DIR: root } : {}),
    INVITATIONS_SANDBOX_ENABLED: production ? '0' : '1'
  })
  const outbound = []
  const refuse = async () => {
    outbound.push('attempt')
    throw new Error('Real review must not call a transport')
  }
  const app = buildApp({
    config,
    pool,
    invitationsRealKeys: keys,
    mail: { send: refuse },
    fetchImpl: refuse,
    sites: dbSitesResolver(pool, config)
  })
  const workspace = (
    await pool.query("insert into workspace(display_name,kind) values($1,'tracy_admin') returning id", [
      `Synthetic real Ops ${randomUUID()}`
    ])
  ).rows[0].id
  const sessions = {},
    ids = {}
  for (const role of ['owner', 'admin', 'developer']) {
    const email = `${role}-${workspace}@example.test`
    const id = (await pool.query('insert into account(email) values($1) returning id', [email])).rows[0].id
    await pool.query(
      'insert into seat_workspace(workspace_id,account_id,role,granted_by,accepted_at) values($1,$2,$3,$2,clock_timestamp())',
      [workspace, id, role]
    )
    sessions[role] = `tracy_sess=${await mintSession(email, config.sessionSecret)}`
    ids[role] = id
  }
  sessions.outsider = `tracy_sess=${await mintSession('outsider@example.test', config.sessionSecret)}`
  function request(
    path = '',
    { role = 'owner', method = 'GET', body, bytes, metadata, origin = config.origin, headers = {} } = {}
  ) {
    const h = { ...(sessions[role] ? { cookie: sessions[role] } : {}), ...headers }
    if (method !== 'GET' && origin !== null) h.origin = origin
    if (body !== undefined) h['content-type'] = 'application/json'
    if (bytes !== undefined) h['content-type'] ??= 'application/octet-stream'
    if (metadata !== undefined) h['x-invitations-input'] = JSON.stringify(metadata)
    return app.fetch(
      new Request(`${config.origin}${realBase}${path}`, {
        method,
        headers: h,
        ...(body !== undefined ? { body: JSON.stringify(body) } : bytes !== undefined ? { body: bytes } : {})
      })
    )
  }
  return { app, request, ids, sessions, outbound, config }
}
