/** The doors a shard answers (shard beta, `src/shard/route.js`; contract docs/sre/hop-dong-cua-shard.md). */
export const SHARD_ROUTES = [
  {
    method: 'POST',
    path: '/_shard/adopt',
    summary: 'Take a person the master hands to this shard',
    description:
      'Answered only on a shard (`TRACY_DEPLOYMENT_ROLE=shard`; 404 `NOT_A_SHARD` elsewhere). Signed by the master with the shard channel secret: `x-shard-timestamp`, `x-shard-nonce` (32 hex) and `x-shard-signature` over the timestamp, nonce, method, path (no query) and the sha256 of the body; otherwise 403 `SIGNATURE_INVALID` with `why` `clock`, `replay` or `signature`. The master makes the nonce and sends only `nonceHash`. Makes the person’s mirror account here when it is missing — no code is mailed — and answers a one-time handoff ticket (a string, valid sixty seconds) stored with that nonce hash and `next`. The same `idempotencyKey` again answers a new ticket for the same account; another key for the same address is 409 `MIRROR_CONFLICT`. A body off this shape is 400 `BAD_BODY`. A shard that takes no new person (catalogue not read yet, or at its site cap) answers 503 `SHARD_FULL`, for a person it does not hold yet only.',
    audience: ['fleet'],
    auth: 'signature',
    internal: true,
    body: {
      type: 'object',
      required: ['email', 'source', 'idempotencyKey', 'nonceHash'],
      properties: {
        email: { type: 'string' },
        displayName: { type: 'string', description: 'omitted when the person has none' },
        locale: { type: 'string', description: 'omitted when the person has none' },
        source: { type: 'string', enum: ['master'] },
        idempotencyKey: { type: 'string', description: 'the account id at the master' },
        nonceHash: {
          type: 'string',
          description: 'sha256 hex of the nonce the master puts in `tracy_handoff`'
        },
        next: { type: 'string', description: 'a path of this shard to land on; `/new/` when absent' }
      }
    },
    answers: '`{accountId, handoff: "<ticket>", expiresAt}`'
  },
  {
    method: 'GET',
    path: '/handoff',
    summary: 'Land on a shard from the master with a one-time ticket',
    description:
      'Answered only on a shard. The browser arrives from the master with `t` (the ticket `POST /_shard/adopt` answered) and the `tracy_handoff` nonce cookie the master set beside its redirect. Only `t` is read; a `next` in the query is ignored. The ticket is spent on first use; it opens only when it was issued in the last sixty seconds and the sha256 of the nonce cookie equals the hash the master sent at adopt. Then the shard’s own session cookie (`tracy_sess_<shard>`) is set (the shard never sets the master’s pointer cookie) and the browser goes to the `next` stored with the ticket (`/new/` by default). Anything else — no ticket, a wrong or missing nonce, more than one `tracy_handoff` cookie, a used or late ticket — is a 302 to the master’s `/login` with `next` set to this shard plus the page the ticket stored (`/new/` when no such ticket is found), never back to `/handoff`, and sets no session. The nonce cookie is cleared either way. Answered with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; the ticket is never logged.',
    audience: ['customer'],
    auth: 'token',
    internal: true,
    params: { query: { t: 'the one-time handoff ticket' } },
    answers: '302 to the ticket’s `next` with the session cookie, or to the master’s `/login`'
  },
  {
    method: 'GET',
    path: '/_shard/status',
    summary: 'Report what the shard heartbeat sends to the master',
    description:
      'Answered only on a shard, to its own heartbeat timer (W3): signed with the shard channel secret over the timestamp, nonce, method `GET`, the path and the sha256 of the empty body (403 `SIGNATURE_INVALID` with `why` otherwise). Answers the number of customer sites (demos left out), when the template catalogue was last read (`releases_read_at`, null before the first read), the newest database migration applied (`migration_head`: the last applied file name in JavaScript string order, the order migrations run in), and whether the shard takes new people (`accepting`: the catalogue was read and the local site cap, when set, is not reached).',
    audience: ['fleet'],
    auth: 'signature',
    internal: true,
    answers: '`{sites, releases_read_at, migration_head, accepting}`'
  }
]
