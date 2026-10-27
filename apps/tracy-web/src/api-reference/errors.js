/**
 * EVERY REFUSAL THE APPLY DOOR CAN ANSWER, for the public API reference (`/docs/api`).
 *
 * Three families, one table:
 *   door     codes the relay itself answers before or around the call (`NOT_SIGNED_IN`,
 *            `TOOLSET_NOT_GRANTED`, `COMPONENT_NOT_REGISTERED`…), read from `sites/route.js`
 *   content  `content.read` refusals (`CONTENT_*`, the statuses of `CONTENT_ERROR_STATUS`)
 *   plugin   what a Claude Cowork plugin answers inside a 200 (`{ok:false, error}`, contract
 *            `errors[].code` such as `SLOT_LOCKED_BY_USER`), passed through verbatim
 *
 * A test keeps the `door` and `content` families equal to the codes the route actually returns.
 *
 * Shape of one entry:
 *   code     the exact code string
 *   family   'door' | 'content' | 'plugin'
 *   status   HTTP status the relay answers with (plugin codes: the status of the wrapping answer)
 *   meaning  one sentence: what happened
 *   next     one sentence: what the caller should do next
 */

/** @type {Array<{code: string, family: 'door' | 'content' | 'plugin', status: number, meaning: string, next: string}>} */
export const ERROR_DOCS = [
  {
    code: 'AGENT_DEMO_NOT_GRANTED',
    family: 'door',
    status: 403,
    meaning: 'The frozen demo capability is not assigned to this account, site and chat session.',
    next: 'Open the chat of the assigned demo; never change the site or session to access another bundle.'
  },
  {
    code: 'AGENT_DEMO_PLAN_REQUIRED',
    family: 'door',
    status: 409,
    meaning: 'The assigned demo has no durable editorial plan for its frozen research and live structure.',
    next: 'Read the bundle and live structure, then save a valid plan before changing content.'
  },
  // ── door: answered by the relay itself, before or around the call to the site ──────────────────
  {
    code: 'CONVERSATION_SITE_UNKNOWN',
    family: 'door',
    status: 404,
    meaning: 'The x-tracy-workspace-label header names a site that Tracy does not know.',
    next: 'Check the label you sent, and do not act on any other site in its place.'
  },
  {
    code: 'SITE_OUTSIDE_CONVERSATION',
    family: 'door',
    status: 403,
    meaning:
      'The site in the path is not the site named by the x-tracy-workspace-label header; the answer names both (siteKey, conversationSite).',
    next: 'Send the call from the workspace of the site you want to change; there is no way to reach another site from this one.'
  },
  {
    code: 'NOT_SIGNED_IN',
    family: 'door',
    status: 401,
    meaning:
      'The request carried neither a valid session nor a valid signed actor assertion, so nobody is acting.',
    next: 'Sign in again (or refresh the session) and send the same request once more.'
  },
  {
    code: 'SEAT_NOT_AUTHORIZED',
    family: 'door',
    status: 403,
    meaning:
      'The signed-in person holds no accepted seat on this site — or, on the api host, the key names another site or its minter’s seat is gone.',
    next: 'Ask an owner or editor of the site to invite you; do not reach the site another way.'
  },
  {
    code: 'KEY_INVALID',
    family: 'door',
    status: 401,
    meaning: 'On the api host: the `Authorization: Bearer trk_…` key is malformed or not one Tracy knows.',
    next: 'Send the key exactly as the mint answer gave it. `GET /api/me/keys` on the cowork host lists only each live key’s id and `hint` (`trk_<id>.…`), never the secret: it tells whether the id is one of yours, not whether the secret is right. A secret that was lost or does not match cannot be read back — mint a new key (`POST /api/me/keys`, signed in there) and send the call again.'
  },
  {
    code: 'KEY_REVOKED',
    family: 'door',
    status: 401,
    meaning: 'On the api host: the key was revoked. Revocation is permanent.',
    next: 'Mint a new key; a revoked one never comes back.'
  },
  {
    code: 'KEY_EXPIRED',
    family: 'door',
    status: 401,
    meaning: 'On the api host: the key is past its `expiresAt`.',
    next: 'Mint a new key, with a later or no expiry.'
  },
  {
    code: 'API_KEYS_NOT_CONFIGURED',
    family: 'door',
    status: 503,
    meaning:
      'This deployment has no `API_KEY_PEPPER`, so seat keys are off and no key can be minted or verified.',
    next: 'Ask the operator of this Tracy deployment to enable API keys; nothing on the caller’s side fixes this.'
  },
  {
    code: 'RATE_LIMITED',
    family: 'door',
    status: 429,
    meaning:
      'The key has used its hourly quota on this site — 600 changing calls or 6000 reads per fixed hour, classified by what the action does, not by HTTP method. `Retry-After` (seconds) says when the next hour opens.',
    next: 'Wait `Retry-After` seconds, then send the call again; do not retry sooner.'
  },
  // ── door, `/v1` only: refusals the REST layer (`api/route.js`) makes before calling the door.
  // Not answered by the Apply door itself, so `refusalNext` (the agent's translator) has no case
  // for them: the agent never calls `/v1`.
  {
    code: 'APPLY_ID_REQUIRED',
    family: 'door',
    status: 400,
    meaning: '`DELETE /v1/…/records/{kind}/{id}` was sent without a `Tracy-Apply-Id` header.',
    next: 'Send `Tracy-Apply-Id: <your receipt id>`; `POST /v1/…/applies/{id}/revert` brings the record back under it.'
  },
  {
    code: 'IF_MATCH_NOT_SUPPORTED',
    family: 'door',
    status: 400,
    meaning:
      '`If-Match` was sent where no revision can be checked: a records `DELETE`, a contract operation other than `apply`, or a records `PATCH` on a site that answers no `body_revision` for that record (Joomla, a kind without a body, or a WordPress plugin older than 0.17.0, which would write anyway). Nothing was written.',
    next: 'Drop the header, or send it where it is checked: `POST /v1/…/contract/apply` (`"<contentId>:<revision>"` tags), or a records `PATCH` of a WordPress post, template part or template on plugin 0.17.0+ (`"<body_revision>"`).'
  },
  {
    code: 'IDEMPOTENCY_KEY_NOT_SUPPORTED',
    family: 'door',
    status: 400,
    meaning:
      '`Idempotency-Key` was sent to a `/v1` records write; the plugin keeps no `request_id` for records.',
    next: 'Drop the header and use one `Tracy-Apply-Id` per change; `Idempotency-Key` works on `POST /v1/…/contract/{operation}`.'
  },
  {
    code: 'INVALID_REQUEST',
    family: 'door',
    status: 400,
    meaning: 'The body is not a JSON object with a non-empty string `action`.',
    next: 'Send `{ "action": "<action>", "params": { … } }` as described in this reference.'
  },
  {
    code: 'INVALID_MEDIA',
    family: 'door',
    status: 400,
    meaning:
      'A `media.upload` on an EmDash site named no file, a file name with a path in it, or content that is not base64 (`field` says which).',
    next: 'Send `{ "path": "<file name>", "content_b64": "<base64 bytes>" }` for one picture at a time.'
  },
  {
    code: 'ACTION_NOT_ALLOWED',
    family: 'door',
    status: 400,
    meaning: 'The action is not one this door carries.',
    next: 'Use one of the actions listed in this reference.'
  },
  {
    code: 'LOCATE_BAD_QUERY',
    family: 'door',
    status: 400,
    meaning: 'The `content.locate` parameters are malformed; `error.message` names the field.',
    next: 'Fix the field the message names (url, text or image, marks) and send the call once more.'
  },
  {
    code: 'TOOLSET_NOT_GRANTED',
    family: 'door',
    status: 403,
    meaning:
      'The role of your seat on this site does not grant the toolset this action needs; the answer names `toolset` and `role`.',
    next: 'Ask an owner of the site for the Editor role (a Viewer holds no toolset); the Editor role holds `content`, `code` and `site`.'
  },
  {
    code: 'CONTRACT_OPERATION_PROVISION_ONLY',
    family: 'door',
    status: 403,
    meaning:
      '`content.contract {operation: "derive"}` builds an imported site’s contract; import provisioning runs it, and no seat may, the owner included.',
    next: 'Change the words through the slots the site already has: `content.read` or `content.locate` names them, `content.contract apply` writes them.'
  },
  {
    code: 'ACTION_AGENT_ONLY',
    family: 'door',
    status: 403,
    meaning:
      '`content.renderedWords` is sent by Tracy’s agent alone, inside `content.replace`, after it found the words in no stored record; a browser session or a seat key may not send it.',
    next: 'Change the words with `content.replace` in a conversation with Tracy’s agent; words a record holds go through `content.update` or `content.contract`.'
  },
  {
    code: 'CONTRACT_SLOT_NOT_CONTENT',
    family: 'door',
    status: 403,
    meaning:
      'Your role may change only the words, pictures and links of the site, and this `content.contract` call touches other slots, listed in `slots`.',
    next: 'Apply again without the listed slots, or ask for a role with the code toolset to change them.'
  },
  {
    code: 'SITE_BUSY',
    family: 'door',
    status: 409,
    meaning:
      "Another conversation is changing this site right now, so nothing was written; the answer names the holder and, when known, `freeInSeconds`. A newer conversation of the same account is not refused: it takes the site over from that account's earlier one.",
    next: 'Wait until the other conversation stops writing (at least `freeInSeconds`), then send the call again; do not retry in a tight loop.'
  },
  {
    code: 'SITE_PROVISIONING',
    family: 'door',
    status: 409,
    meaning: 'The site is still being built, so its content door is not connected yet.',
    next: 'Try again once the build has finished.'
  },
  {
    code: 'COMPONENT_NOT_REGISTERED',
    family: 'door',
    status: 409,
    meaning:
      'The site has no connected Claude Cowork plugin, so Tracy cannot read or write its CMS data; `custodyDetail` may say why.',
    next: 'Connect the site (install and pair the Claude Cowork plugin) before calling this door again.'
  },
  {
    code: 'COMPONENT_NOT_ON_FLEET_COPY',
    family: 'door',
    status: 409,
    meaning:
      'This site was imported, and Tracy could not verify its hosted copy, so it refuses rather than write to your live site; `copyReason` says why (`timeout`, `unreachable`, `unauthorized`, `not_json`, `refused`, `platform_mismatch`, `no_registered_component`, `no_copy_address`) and `transient` whether waiting can change it.',
    next: 'When `transient` is true the copy is still warming up: send the same call again in a moment. Otherwise contact support to have the hosted copy verified.'
  },
  {
    code: 'APPLY_TARGET_NOT_ALLOWED',
    family: 'door',
    status: 400,
    meaning: 'The body names a `target`, but this door writes only to the site itself and to no copy of it.',
    next: 'Drop `target` from the body and send the call again.'
  },
  {
    code: 'COMPONENT_UNREACHABLE',
    family: 'door',
    status: 502,
    meaning: 'The Claude Cowork plugin on the site did not answer, so the call may or may not have run.',
    next: 'Retry once; if it still does not answer, check that the site is up before changing anything another way.'
  },
  {
    code: 'COMPONENT_BAD_RESPONSE',
    family: 'door',
    status: 502,
    meaning:
      'The Claude Cowork plugin answered with something that is not JSON (its HTTP status is in `status`), so nothing is known to have happened.',
    next: 'Read the site to see whether the change landed before any retry.'
  },
  {
    code: 'COMPONENT_UNAUTHORIZED',
    family: 'door',
    status: 409,
    meaning: 'The Claude Cowork plugin on the site no longer accepts the token Tracy holds for it.',
    next: 'Reconnect the site (pair the plugin again); re-entering any other credential will not help.'
  },
  {
    code: 'LIST_SEARCH_UNSUPPORTED',
    family: 'door',
    status: 501,
    meaning:
      'A `content.list` call carried a `search` key and the Claude Cowork plugin on the site answered without reading it (a plugin older than Joomla 0.20.0 or WordPress 0.16.0), so the relay refuses the answer and returns no rows, rather than hand back the whole list as if it were filtered.',
    next: 'Leave `search` out and list with `offset` and `limit`, which every kind takes. `content.read` lists pages, articles and shared records only.'
  },

  // ── content: refusals of content.read ───────────────────────────────────────────────────────
  {
    code: 'CONTENT_BAD_QUERY',
    family: 'content',
    status: 400,
    meaning:
      'The `content.read` query is malformed; `error.message` names the field (type, limit, locale, id, cursor or describe).',
    next: 'Fix the one field the message names and send the query again.'
  },
  {
    code: 'CONTENT_UNAUTHENTICATED',
    family: 'content',
    status: 401,
    meaning: 'The site reader did not accept the credentials the relay sent for this seat or site.',
    next: 'Sign in again or reconnect the site, then repeat the read.'
  },
  {
    code: 'CONTENT_FORBIDDEN',
    family: 'content',
    status: 403,
    meaning:
      'The site reader refused this read for the current seat — or, on `content.locate`, refused the relay’s own read (the same for every seat: the site’s relay trust is broken, e.g. its digest file has the wrong owner).',
    next: 'Sign in again or reconnect the site, then repeat the read; do not read the content another way.'
  },
  {
    code: 'CONTENT_NOT_FOUND',
    family: 'content',
    status: 404,
    meaning: 'The requested content id does not exist or is outside what this seat may read.',
    next: 'List the content again and use an id from that listing.'
  },
  {
    code: 'CONTENT_SNAPSHOT_EXPIRED',
    family: 'content',
    status: 409,
    meaning:
      'The version given in `changedSince` (or the cursor) is not held for this seat any more: it is too old, from another seat, or from before a restart.',
    next: 'Read `{ "view": "pages" }` again without a cursor and use the new `version`.'
  },
  {
    code: 'CONTENT_FIELD_TOO_LARGE',
    family: 'content',
    status: 413,
    meaning: 'A field of the requested content is larger than the reader will return in one answer.',
    next: 'Read without that field (use `fields` to leave it out), and do not expect a truncated value.'
  },
  {
    code: 'CONTENT_ADAPTER_UNSUPPORTED',
    family: 'content',
    status: 501,
    meaning:
      'This site, or the version of its Claude Cowork plugin, does not support Content API v1. `content.locate` does not refuse with it: it answers 200 `status: "unavailable"` with this code and a `next`.',
    next: 'Stop calling `content.read` and `content.locate` on this site; update the plugin, or use `page.text` and `content.replace`.'
  },
  {
    code: 'CONTENT_SOURCE_UNAVAILABLE',
    family: 'content',
    status: 503,
    meaning:
      'The site reader could not reach its content source, or another read on the same site was running.',
    next: 'Wait a moment and retry once; if it persists, the Claude Cowork plugin could not read the site: report it with the request id.'
  },

  // ── plugin: `{ok:false, error, message}` from the Claude Cowork plugin, relayed in a 200 ──────
  {
    code: 'unauthorized',
    family: 'plugin',
    status: 409,
    meaning:
      'The plugin rejected the token Tracy sent; the relay never passes this through and answers `COMPONENT_UNAUTHORIZED` (409) instead.',
    next: 'Reconnect the site (pair the plugin again).'
  },
  {
    code: 'bad_action',
    family: 'plugin',
    status: 200,
    meaning:
      'The plugin installed on the site does not know this action, usually because it is an older release.',
    next: 'Use an action this site supports, or update the plugin to the release this reference names for the action.'
  },
  {
    code: 'bad_params',
    family: 'plugin',
    status: 200,
    meaning:
      'The parameters are missing or wrongly shaped; `message` names the field and often gives an example.',
    next: 'Fix the field the message names and send one corrected call.'
  },
  {
    code: 'unavailable',
    family: 'plugin',
    status: 200,
    meaning: 'The plugin on this site lacks a part this action needs; `message` names it.',
    next: 'Do not retry; install or repair the plugin part the message names.'
  },
  {
    code: 'unsupported',
    family: 'plugin',
    status: 200,
    meaning:
      'This site cannot do what was asked (for example, its quickstart has no multilingual profile); `message` says why.',
    next: 'Do not retry the same call; choose another way the message leaves open, or leave the change out.'
  },
  {
    code: 'conflict',
    family: 'plugin',
    status: 200,
    meaning:
      'The site changed since it was read, or a language job or demo trim already holds it; nothing was written and `message` says which.',
    next: 'Read the site again and send one call with what it holds now, or finish or revert the job the message names first.'
  },
  {
    code: 'revision_stale',
    family: 'plugin',
    status: 200,
    meaning:
      'A WordPress `content.update` carried `expected_body_revision`, and the body of that record changed since it was read; nothing was written. The answer carries the current `body_revision` (WordPress plugin 0.17.0+).',
    next: 'Read the record again with `content.get`, make the change on the body it holds now, and send the `body_revision` that read answers.'
  },
  {
    code: 'locked',
    family: 'plugin',
    status: 200,
    meaning:
      'A record this write would change is open in the CMS editor; the answer also carries `code: SLOT_LOCKED_BY_USER` and `lockedBy`.',
    next: 'Have the person named in `lockedBy` save and close the record, then send the same call again.'
  },
  {
    code: 'writer_busy',
    family: 'plugin',
    status: 200,
    meaning:
      'Another write was running on the site; when `message` is "another writer is changing this site" nothing was written, otherwise the write may have partly run.',
    next: 'Wait a few seconds and read the site before sending the same call once more.'
  },
  {
    code: 'contract_failed',
    family: 'plugin',
    status: 200,
    meaning:
      'The quickstart contract refused this `content.contract` call; `errors[]` gives a code, slot and rule for each problem.',
    next: 'Read `errors[]` and act on each code as described in this table.'
  },
  {
    code: 'contract_unavailable',
    family: 'plugin',
    status: 200,
    meaning: 'The contract store of the plugin could not be read, so no contract operation can run.',
    next: 'Repair the plugin installation on the site before calling `content.contract` again.'
  },
  {
    code: 'contract_unbound',
    family: 'plugin',
    status: 200,
    meaning: 'The site is still under construction and has no bound contract profile yet.',
    next: 'Bind the site to its contract profile first, then apply content.'
  },
  {
    code: 'not_found',
    family: 'plugin',
    status: 200,
    meaning: 'The record, table or file the call names does not exist on the site; `message` names it.',
    next: 'List or read the site again and use a name or id that exists.'
  },
  {
    code: 'too_large',
    family: 'plugin',
    status: 200,
    meaning: 'The file or media is larger than the plugin will carry inline in one answer.',
    next: 'Use the path the message names for large files instead of the inline one.'
  },
  {
    code: 'refused',
    family: 'plugin',
    status: 200,
    meaning:
      'The plugin refuses this change by rule (for example a core table, a core extension, or switching itself off); `message` says which.',
    next: 'Do not retry; leave that change out.'
  },
  {
    code: 'fatal',
    family: 'plugin',
    status: 200,
    meaning:
      'PHP stopped with a fatal error while the WordPress plugin handled the call; `message` gives the error, file and line, and the call may have partly run.',
    next: 'Read the site to see what changed, and report the error before any retry.'
  },
  {
    code: '<verb>_failed',
    family: 'plugin',
    status: 200,
    meaning:
      'The operation named by the verb (write, read, list, dump, install, rename, revert, batch, upload, restore and others) failed on the site; `message` says why.',
    next: 'Read the site to see its current state, then retry once; if it fails again, stop and report the message.'
  },

  // ── plugin: contract `errors[].code`, inside a `contract_failed` (or `conflict`, `writer_busy`) answer ──
  {
    code: 'SLOT_TOO_LONG',
    family: 'plugin',
    status: 200,
    meaning: 'The text for a slot is longer than it holds; the entry gives `limit` and `actual`.',
    next: 'Shorten the text to at most `limit` characters and apply again.'
  },
  {
    code: 'SLOT_EVIDENCE_REQUIRED',
    family: 'plugin',
    status: 200,
    meaning: 'This slot needs to know where its value comes from, and no `evidence` was given for it.',
    next: 'Apply again with `evidence: { "<slotKey>": "<source of the value>" }`, stating plainly when the value is invented.'
  },
  {
    code: 'SLOT_NOT_CONTENT',
    family: 'plugin',
    status: 200,
    meaning:
      'The value contains markup, control characters or template directives, and the slot takes plain words only.',
    next: 'Send the words alone, without tags or `{…}` directives, and apply again.'
  },
  {
    code: 'SLOT_LINK_UNSUPPORTED',
    family: 'plugin',
    status: 200,
    meaning: 'The link is not of a form the slot accepts.',
    next: 'Use https://…, mailto:…, tel:+digits, /path or #anchor and apply again.'
  },
  {
    code: 'SLOT_IMAGE_INVALID',
    family: 'plugin',
    status: 200,
    meaning:
      'The picture for an image slot is not in the site media library, or not in the shape the slot needs.',
    next: 'Upload or draw a picture in the slot shape first (`media.draw` with the slot key), then apply the path it returns.'
  },
  {
    code: 'SLOT_UNWRITABLE',
    family: 'plugin',
    status: 200,
    meaning:
      'A slot of an imported site’s derived contract cannot be rewritten where its value is stored now (the stored value changed shape, or no longer holds it).',
    next: 'Read the content again and apply to the slot key it now gives those words; if none does, that part cannot change through the contract.'
  },
  {
    code: 'REVISION_STALE',
    family: 'plugin',
    status: 200,
    meaning:
      'The content changed since it was read; the entry gives the `current` revision. On `/v1` a contract apply’s `errors[]` entry is a `409`; a records `PATCH` whose `If-Match` no longer names the record (any field changed) is a `412`, and its answer carries the record’s current `ETag`.',
    next: 'Read the content again, check the change still fits, and apply with the new revision.'
  },
  {
    code: 'REVISION_REQUIRED',
    family: 'plugin',
    status: 200,
    meaning: 'The apply did not say which revision of the content it is based on.',
    next: 'Read the content first, then apply with the revision that read returned.'
  },
  {
    code: 'WRITER_BUSY',
    family: 'plugin',
    status: 200,
    meaning: 'Another write was running on the site, so this apply was not made.',
    next: 'Wait a few seconds and send the same apply once more.'
  },
  {
    code: 'CONFLICT',
    family: 'plugin',
    status: 200,
    meaning:
      'The contract receipts do not allow this change (for example, later content exists on top of the one being reverted).',
    next: 'Wait or revert the later change first, then send the same apply once more.'
  },
  {
    code: 'SLOT_LOCKED_BY_USER',
    family: 'plugin',
    status: 200,
    meaning: 'The record this slot lives in is open in the CMS editor; `lockedBy` names who has it open.',
    next: 'Have that person save and close the record, then apply again; there is no way to write over it.'
  },
  {
    code: 'SLOT_UNKNOWN',
    family: 'plugin',
    status: 200,
    meaning: 'The slot key is not a slot of this site (or of that language copy).',
    next: 'Use only slot keys that `content.read` or a contract inspect returns.'
  },
  {
    code: 'SLOT_EMPTY_STATE',
    family: 'plugin',
    status: 200,
    meaning: 'The change would empty a slot the design keeps filled, or fill a slot the design keeps empty.',
    next: 'Keep the slot as the design has it; showing or hiding that part needs a layout change, not a content apply.'
  },
  {
    code: 'SLOT_EDITION_MISSING',
    family: 'plugin',
    status: 200,
    meaning: 'That language copy of the page has no such slot, so it cannot change there.',
    next: 'Leave that language out of the apply.'
  },
  {
    code: 'CHANGES_INVALID',
    family: 'plugin',
    status: 200,
    meaning:
      'The `changes` object cannot be taken as sent (for example empty, too many entries, or non-text values).',
    next: 'Do not resend the same changes; rebuild them as the entry message describes.'
  },
  {
    code: 'CONTRACT_FAILED',
    family: 'plugin',
    status: 200,
    meaning:
      'The contract refused this apply for a reason with no more specific code; the entry `message` says why.',
    next: 'Read the message and leave out or change what it names; nothing was written.'
  },
  {
    code: 'PRESENTATION_DRIFT',
    family: 'plugin',
    status: 200,
    meaning:
      'The layout of the site differs from its quickstart design; usually a warning (`severity: warning`) beside a normal answer, but older plugin releases refuse a contract inspect with it.',
    next: 'No action is needed for a warning; when it comes as a refusal, update the plugin or restore the layout before applying content.'
  }
]
