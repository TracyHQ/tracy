/** Route docs — see ./index.js for the entry shape. Filled from the source file named on each entry. */

/** One collected contact fact in a create brief (`readBriefFacts` in src/lib/site-brief.js). */
const BRIEF_FACT = {
  type: 'object',
  required: ['value', 'source'],
  properties: {
    value: { type: 'string', description: 'The detail as it should show on the site' },
    source: {
      type: 'string',
      description: 'Where it came from: a letter, then up to 63 letters, digits or `._:-`'
    },
    fetchedAt: { type: 'string', format: 'date-time', description: 'When it was collected' }
  }
}

/** @type {import('./index.js').RouteDoc[]} */
export const SITES_ROUTES = [
  {
    method: 'GET',
    path: '/api/sites/import-address',
    summary: 'Check whether an existing site address is already in Tracy',
    description:
      'Read-only import preflight for a signed-in person. Normalizes the address and reports whether it is available, is already accessible through an accepted seat of the caller, or belongs to another account. Does not reserve an address or create a site, account or seat, and never returns owner identity. Responses are not cached. Invalid addresses answer 400 INVALID_REQUEST; no session answers 401 NOT_SIGNED_IN.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { query: { siteKey: 'Existing site address to check (required)' } },
    answers:
      '`{ownership: "available" | "mine" | "other", joinPath?}`. For another account, a safe `joinPath` names the existing site label when available. TAKEN refusals from site creation also include this path when the local site is known.'
  },
  {
    method: 'POST',
    path: '/api/sites/:key/import-result',
    summary: 'Report an import worker terminal result',
    description:
      'A current seat reports a structured result with run_id, state, seconds and optional step, reason code, platform (`joomla` or `wordpress`, named on the stuck alert) and sign_in (`password`, `code` or `saved`: how the run got the plugin code, kept even when there is no diagnostic). Deduplicated by run_id; unavailable analytics returns 503 so the private worker outbox retries. User credential errors are acknowledged without a system failure alert.',
    audience: ['dsh'],
    auth: 'session',
    internal: true
  },

  // src/opportunities-build/own-site.js
  {
    method: 'GET',
    path: '/api/sites/from-business/find',
    summary: 'Find a business by name and city for Build from my business',
    description:
      'Google Places by name and city, every trade (not only food and drink), each candidate with its `trade`. One billable search a call, 30 an hour per account. 404 FEATURE_OFF while the `site-from-business` switch is off; 503 CREDENTIAL_MISSING without a Google key.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { query: { q: 'Business name and city, 2–200 characters' } },
    answers: '`{candidates}`; 400 INVALID_SEARCH; 429 RATE_LIMITED'
  },
  // src/opportunities-build/own-site.js
  {
    method: 'POST',
    path: '/api/sites/from-business',
    summary: 'Start Build from my business',
    description:
      "Saves the customer's own business (a candidate the find answered, or up to 5 pasted links of it: its Google Maps or share link, website, social pages, listing pages) as a private opportunity marked ownSite and starts its shared research. The links are read exactly as `POST /api/website-opportunities` reads them: every link persists with its per-link read status, failure reason and photo, review and contact counts; the same `links` report in the answer, 409 GOOGLE_LINK_AMBIGUOUS with `candidates` (send the same body again with the picked one as `place`), 422 NO_USABLE_LINKS. Idempotent per requestId. Not listed among Website Opportunities, never gets a demo retention clock.",
    audience: ['customer'],
    auth: 'session',
    internal: true,
    body: {
      type: 'object',
      required: ['requestId'],
      properties: {
        requestId: { type: 'string', description: '8–100 of letters, digits, ".", "_", ":" or "-"' },
        place: {
          type: 'object',
          description: 'A candidate exactly as the find answered it, or the one picked from a 409 answer'
        },
        links: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Links of the business: Google Maps or share link, website, social pages, listing pages'
        },
        name: { type: 'string', description: 'Words typed beside the links, matched against Google places' },
        url: { type: 'string', description: 'One link: the same as `links: [url]`' },
        label: { type: 'string', description: 'Optional site address label' }
      }
    },
    answers:
      '202 `{business:{id,name,trade,requestId,phase,job?}, links?}`; 400 INVALID_PLACE / INVALID_LINKS / INVALID_URL; 409 GOOGLE_LINK_AMBIGUOUS `{candidates, links}`; 422 NO_USABLE_LINKS `{links}`; 429 NEW_PLACES_LIMIT'
  },
  // src/opportunities-build/own-site.js
  {
    method: 'GET',
    path: '/api/sites/from-business/:id',
    summary: 'Where a Build from my business stands',
    description:
      'research while it runs; once it completed, choose with `recommended` (the template autoTemplate suggests for the trade) and `ranking` (how the template picker groups its cards for that trade: `recommended` and `generic` card ids, null when the trade is unknown); build once the person chose. `links` reports every pasted link with `readStatus`, `readReason`, `counts` and `primary`. `requiresLinkReview` asks the customer to fix the links or explicitly continue before viewing a suggestion when no link was read or the primary source failed. Nothing is built until POST …/:id/build.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'The business id from the start door' } },
    answers:
      '`{business:{phase: research|choose|build|failed, links?, requiresLinkReview?, job?, recommended?, ranking?, action?, code?}}`'
  },
  // src/opportunities-build/own-site.js
  {
    method: 'POST',
    path: '/api/sites/from-business/:id/build',
    summary: 'Build the customer’s own site on the template they chose',
    description:
      'Accepts exactly one agent-demo/1 client-send/1 action with ownSite and the chosen template (selection.suggested records Tracy’s suggestion and whether it was kept; ownSiteBuildsPerAccountPerDay). The browser then prepares and opens its chat like a demo chat. A second press answers the same action.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { id: 'The business id from the start door' } },
    body: {
      type: 'object',
      required: ['selection'],
      properties: {
        selection: {
          type: 'object',
          description: '{cms,design,quickstart} the person chose; {auto:true} lets Tracy pick (API only)'
        }
      }
    },
    answers: '202 `{business:{phase:"build", action}}`; 400 DEMO_TEMPLATE_REQUIRED; 409 RESEARCH_NOT_DONE'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/claim',
    summary: 'Claim a new site the moment Build is pressed',
    description:
      'Reserves a new site for the signed-in person, under a draft address unless a `label` is sent, and prepares its workspace folder. Idempotent per `buildId`: the same request answers the same site, a different payload under that id is refused with 409. A ready-made CMS instance is handed over when one is in stock.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    body: {
      type: 'object',
      required: ['buildId', 'platform'],
      properties: {
        buildId: { type: 'string', format: 'uuid', description: 'Idempotency key for this press' },
        platform: { type: 'string', enum: ['joomla', 'wordpress', 'emdash'] },
        label: { type: 'string', description: 'Optional address label; omitted means a draft address' },
        design: { type: 'string', description: 'Design or template id' },
        quickstart: { type: 'string', description: 'Quickstart release tag' },
        workflow: {
          type: 'string',
          enum: ['agent-demo/1'],
          description:
            'Provision-only WO builds: accepted only when the server-held account/build/revision/action and release match. Not a general bypass flag.'
        },
        expectedQuickstartRelease: {
          type: 'object',
          description:
            'Optional frozen release identity: version and files keyed by install part, each with file and sha256. A mismatch is 409 TEMPLATE_VERSION_CHANGED before any claim.'
        },
        press: {
          type: 'object',
          description: 'The build form press: id, answers, questionnaire, targetUrl, designPlan'
        }
      }
    },
    answers:
      '`{siteKey, label, buildId, workspacePath, next}` — `next` is the address that opens the site workspace'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/design-plan',
    summary: 'Preview what a design will build before creating a site',
    description:
      'Read-only: resolves which quickstart and workflow a design or template will actually be built with on a platform, so the form can show it before Build is pressed. Nothing is reserved. A brand (`brand:<host>`) on WordPress plans a fresh site wearing that brand, while a WordPress template can wear one. Refuses a template with no build for that platform, and other non-template designs outside Joomla.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      query: {
        platform: 'joomla (default), wordpress or emdash',
        design: 'Design, template or brand (`brand:<host>`) id; defaults to the default design'
      }
    },
    answers: '`{plan}` — requested and effective design, base quickstart, workflow, fallback'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/questions',
    summary: 'Get the questions a new site will be asked',
    description:
      'Read-only: returns the questionnaire the build will read for this CMS and design — the standard set of the CMS, fitted to the template the site starts from. The `logo` question carries `variants` (`["light","dark"]`, `["dark"]` or `["single"]`, the logos that template shows); the `pages` question offers the template’s own pages as `options` with `locked` naming the home page, or, when the template ships no page list, no options and `keepsAllPages: true` (every page is kept). The `logo` and `favicon` questions are left out while the `site-brand-uploads` switch is off. The served set is stored under its content hash so answers can later be read against it. `answersWritten` is false when no text model is assigned to write the answers into the site: a site created then is built with the template’s own text.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      query: {
        platform: 'joomla, wordpress or emdash (required)',
        lang: 'Language of the person filling the form (default en)',
        design: 'Design or template id',
        quickstart:
          'WordPress or EmDash: the quickstart release tag to ask about (EmDash: else its default base)'
      }
    },
    answers:
      'The resolved question set with its identity (`set.contentHash`), `languages: "one"`: every site is built in one language, and `answersWritten`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/brief/rewrite',
    summary: 'Rewrite a short description of a business',
    description:
      'Always answers with text for the box. A sentence that means something is said again in clearer words, at most 10 words longer than the original. An empty box, or text that means nothing, gets one plain sample sentence of about 10 words. `again: true` (the text is what the last rewrite wrote, unedited) keeps that text’s length, within 2 words. No answer is longer than 50 words or 300 characters. Claims nothing and stores nothing. Capped per person per hour; 503 `MODEL_NOT_CONFIGURED` when no model is set.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    body: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string', description: 'The text to rewrite, up to 600 characters; may be empty' },
        question: { type: 'string', description: 'The question the text answers, up to 200 characters' },
        again: { type: 'boolean', description: 'True when the text is what the last rewrite wrote, unedited' }
      }
    },
    answers:
      '`{text, words, sourceWords, mode}` where `mode` is `rewrite`, `sample` or `again`; 429 `RATE_LIMITED`, 502 `MODEL_FAILED` or `REWRITE_UNUSABLE`'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/questions/snapshot',
    summary: 'Get a served questionnaire by its content hash',
    description:
      'Returns the exact question set that was served under a content hash, as recorded by `GET /api/sites/questions`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { query: { hash: 'SHA-256 content hash, 64 lowercase hex characters' } },
    answers: '`{set: {id, revision, contentHash}, doc, servedAt}`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/provision',
    summary: 'Build an imported site from its uploaded archive',
    description:
      'Second step of importing an existing site: once the webroot (and optional database) archive is uploaded, asks the host to build the copy from signed download links. The copy is configured for its own Tracy address, not the source site’s. Requires a seat on the site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['platform', 'webrootKey'],
      properties: {
        platform: { type: 'string', enum: ['joomla', 'wordpress', 'emdash'] },
        webrootKey: {
          type: 'string',
          description: 'Storage key of the uploaded webroot archive, under this site'
        },
        dbKey: { type: 'string', description: 'Storage key of the uploaded database dump, under this site' }
      }
    },
    answers: '202 `{siteKey, jobId}` — poll the job with `GET /api/sites/:key/jobs/:id`'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/jobs/:id',
    summary: 'Poll a site build job and finish the handover',
    description:
      'Returns the host job’s state. When it is `done`, also completes the handover: sets the site address, connects the content plugin, creates or reuses the site’s GitHub repository and connects the site to the agent. Needs an owner or editor seat on the site, or an owner or editor seat on the workspace that owns it. With `inspect=1`, additionally requires the build creator account and returns a SELECT-only persisted snapshot before any polling or handover writes; no host is called.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: { key: 'Site key', id: 'Job id returned by the provision call' },
      query: { inspect: '1: read persisted own-creation status without host calls or handover writes' }
    },
    answers:
      'With inspect=1: schema widget-build-status/v1, state pending/running/done/failed/unavailable, completion with nullable brief/design states, safe persisted links only when done, freshness checkedAt/recordedAt. Creator mismatch 403; missing job/site 404. Without inspect: the job state; when done, plus `liveUrl`, `custody`, `repo` or `repoError`, `lane` or `laneError`, and for a site made with a brief `briefState` (`applied` or `failed`) with `briefError` saying what was not written. For a site created with a `designSystem`: `running` with the step `applying your design system` while it is put on, then `done` with `designSystem` `{id, name, state, reason?, applyId?}` — `state` `applied`, `skipped` (the template cannot wear a system; `reason` says why) or `failed` (the site did not come up, or the write did not land; `reason`)'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/agent',
    summary: 'Connect the site to the agent on its host',
    description:
      'Attaches the site to its host so the agent can work on it (safe to repeat, it also repairs a broken attachment), and connects the site’s content plugin if none is registered yet. Requires a seat on the site; a viewer seat starts the agent (read-only for a viewer) but never connects the content plugin. An imported site whose import never reached a build is refused with 409 `IMPORT_NOT_FINISHED` and `recovery`, the page that finishes it; the host is not asked.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers: 'The host’s answer, plus the content plugin pairing result when one was attempted'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/favicon',
    summary: 'Get the site icon',
    description:
      'Returns the icon URL the site itself declares, or null when it has none or cannot be read. Requires a seat on the site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers: '`{url}` — the icon URL, or null'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/viewing-session',
    summary: 'Mint a session token for an embedded site view',
    description:
      'Mints a fresh Tracy session token for the signed-in person, so an embedded view of the site opens already signed in. Called by the add-site plugin on the host, forwarding the person’s `tracy_sess` cookie. Requires a seat on the site.',
    audience: ['dsh'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key' } },
    answers: '`{token}`'
  },
  // src/sites/preview-ticket.js
  {
    method: 'POST',
    path: '/api/sites/:key/preview-ticket',
    summary: 'Get a ticket to comment on elements of a framed site',
    description:
      'Issues a short-lived ticket that turns on the comment picker inside the site preview. Only a person may ask (a request with `x-tracy-actor` is refused), their role must allow content edits, and `parentOrigin` must equal the request `Origin` and be an allowed origin. Answers 404 where the feature is off.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['parentOrigin'],
      properties: { parentOrigin: { type: 'string', description: 'Origin of the page that frames the site' } }
    },
    answers: '`{ticket, exp}` — `exp` in epoch seconds'
  },
  // src/sites/comments.js
  {
    method: 'GET',
    path: '/api/sites/:key/comments',
    summary: 'List the comments on a site',
    description:
      'Every live comment on the site, oldest number first, each with its author, what the caller may do to it (`can: {edit, delete}` — true on the caller’s own comments only) `sends` (each time someone sent it to Tracy through `POST /api/sites/:key/requests`: `{author, at}`, oldest first, the last 20) `sentToTracy` (`sends` is not empty; what “Send N” counts) and `attachments` (`[{id, name, size, type, url}]`, `url` being the seat-authed file door; empty on a deleted comment). With `since`, only rows changed at or after that time, deleted ones included (`deletedAt` set), so a poll learns of deletes. `siteChangedAt` at the root is the time of the last successful write the Apply door recorded on the site (null when none), for the page’s Refresh button; `attachments` at the root is `{enabled, maxBytes, maxFiles}` — whether files can be attached on this server, and within what; `limits` at the root is `{maxChars}` — the longest text a comment, reply or request may carry (4000, UTF-16 code units after trimming, as `maxlength` counts). A comment its author deleted while someone’s reply still stands under it stays in the full list as a tombstone: `deletedRoot: true`, `deletedAt` set, empty `text` and `attachments`, no rights, but its `locate`, `element`, status and sends kept — it is still the thread; a poll returns it with `deletedRoot: false` once its last reply goes. Any seat reads. Rows written before stage 6 keep the status a chat turn gave them; newer ones are `pending` (open) or `resolved`. A resolved comment names who resolved it in `resolvedBy`; when Tracy resolved it — a site write through the Apply door cited the request of its latest send, with nothing written in its thread since — `resolvedBy` is `{accountId: "", email: "", name: "Tracy", initial: "T", tracy: true}` and `resolvedByTracy` is true.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: {
      path: { key: 'Site key' },
      query: { since: 'Optional ISO time; answers only rows changed at or after it' }
    },
    answers:
      '`{comments, n_next, siteChangedAt, attachments, limits}` — `n_next` is the number the next comment or request will get (one sequence, no upper bound). Every person a comment names — `author`, `resolvedBy`, `sends[].author`, here and in every write’s answer — is `{accountId, email, name?, initial, color, avatarUrl}`: their face, the same one `GET /api/team` and `GET /auth/me` give that account (Tracy as a resolver keeps its own shape, above)'
  },
  // src/sites/comments.js
  {
    method: 'POST',
    path: '/api/sites/:key/comments',
    summary: 'Add a comment to a site page',
    description:
      'Creates an open comment (status `pending`); the server gives it the next number on the site (never reused, shared with requests). Any seat may create. There is no cap on open comments (stage 6: comments are between people). Refused with `COMMENT_RATE_LIMIT` (429, `limit`, `retryAfter` seconds, also the `retry-after` header) past 30 comments or replies by one person in a minute across every site, `COMMENT_TOO_LONG` (400, `field`, `maxChars`, `length`) when `text` is longer than `limits.maxChars`, and `COMMENT_NOT_FOUND` when `replyTo` names neither a live comment of this site nor a tombstone (a deleted comment a live reply stands under — replying under one is allowed). A reply to a resolved comment reopens it in the same write (back to the status it had when resolved), whoever wrote it, and the answer carries that parent as it now stands. `mentions` names the people picked in the box’s `@` picker; the row keeps only those holding a live seat on the site (others are dropped silently) and carries them back as `mentions`. After the write, each person kept gets a `comment.mention` notification; a reply also notifies the thread’s root author and everyone who wrote in the thread before (`comment.reply`, one email at once, later ones of the thread within 5 minutes grouped), except anyone it mentions and never the writer.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['url', 'text'],
      properties: {
        url: { type: 'string', description: 'Page the comment is on' },
        text: { type: 'string', description: 'What the person wrote' },
        element: {
          type: 'object',
          description: 'The picked element as the Browser tab sends it; null for the whole page'
        },
        locate: {
          type: 'object',
          description: 'How the tab finds the element again; null for the whole page'
        },
        replyTo: { type: 'string', format: 'uuid', description: 'Id of the comment this replies to' },
        mentions: {
          type: 'array',
          description:
            'Account ids of the people picked in the `@` picker (`GET /api/sites/:key/comments/people`); a typed `@name` nobody picked is plain text and is not listed. Ids without a live seat on the site are dropped; at most 50',
          items: { type: 'string', format: 'uuid' }
        },
        attachments: {
          type: 'array',
          description:
            'Ids from `POST /api/sites/:key/comments/attachments`, in display order; at most 20, each an upload of this site not on another comment',
          items: { type: 'string', format: 'uuid' }
        }
      }
    },
    answers: '201 `{comment, parent?}` — `parent` only for a reply'
  },
  // src/sites/comments.js
  {
    method: 'PATCH',
    path: '/api/sites/:key/comments/:id',
    summary: 'Change the text or files of your comment',
    description:
      'Author only. Changes the text, the attached files, or both: `attachments` replaces the whole list (`[]` removes every file; a file left out becomes a loose upload, swept after a day). A comment keeps no status since stage 6: `status`, `requestId`, `callId`, `question`, `answer` and `sentAt` are refused with `COMMENT_BAD_INPUT` naming the field; `text` longer than `limits.maxChars` with `COMMENT_TOO_LONG`. `mentions`, when sent, replaces the list of people the comment names (kept: live seats only); only the people it adds get a `comment.mention` notification. Left out, the list stays as it was.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key', id: 'Comment id' } },
    body: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        attachments: { type: 'array', items: { type: 'string', format: 'uuid' } },
        mentions: { type: 'array', items: { type: 'string', format: 'uuid' } }
      }
    },
    answers: '`{comment}`'
  },
  // src/sites/comments.js
  {
    method: 'POST',
    path: '/api/sites/:key/comments/:id/resolve',
    summary: 'Resolve a comment',
    description:
      'Marks the comment resolved and remembers its status. Any seat may resolve any comment, a tombstone’s thread included. Resolving twice is a no-op. The comment’s author gets a `comment.resolved` notification (not when they resolve it themselves).',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key', id: 'Comment id' } },
    answers: '`{comment}`'
  },
  // src/sites/comments.js
  {
    method: 'POST',
    path: '/api/sites/:key/comments/:id/reopen',
    summary: 'Reopen a resolved comment',
    description:
      'Puts back the status the comment had when it was resolved. Any seat may reopen (a tombstone’s thread too); a reply reopens a resolved comment too. The comment’s author gets a `comment.reopened` notification from this door (not when they reopen it themselves); a reply that reopens sends only its `comment.reply`.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key', id: 'Comment id' } },
    answers: '`{comment}`'
  },
  // src/sites/comments.js
  {
    method: 'GET',
    path: '/api/sites/:key/comments/sent',
    summary: 'Open comments already sent to Tracy, with nothing new since',
    description:
      'What “Ask Tracy to edit all” leaves unticked: each open comment (a thread’s first message) whose latest send to Tracy that counts has no reply or edit in its thread after it, with that send’s time (`at`). A send counts unless the chat turn it opened went stale (its server stopped mid-turn), was stopped mid-answer, or ended in a model error, a cancel or a block (`endReason` on `POST /api/sites/:key/moment`). A comment never sent, or written to since its latest send, is not listed. Any seat reads.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key' } },
    answers: '`{sent: [{id, at}]}` — by comment number'
  },
  // src/sites/comments.js
  {
    method: 'GET',
    path: '/api/sites/:key/comments/report',
    summary: 'What one chat turn sent from comments did',
    description:
      'The comments a chat turn was sent from, in send order, each `done` when a site write through the Apply door cited its request in that turn — which also resolves the comment as Tracy when that send was its latest and nothing was written in its thread since — else not confirmed (a write outside the Apply door, such as an EmDash site’s own tools or a look change by file, carries no proof). `text` is empty for a comment deleted since. A turn the server does not know, one typed in the chat, or one sent from no saved comment lists nothing. Refused with `COMMENT_BAD_INPUT` when `turn` is not a chat turn id. Any seat reads.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: {
      path: { key: 'Site key' },
      query: { turn: 'The chat turn, `<session id>:<turn number>`' }
    },
    answers: '`{turn, comments: [{id, text, done}]}`'
  },
  // src/sites/comments.js
  {
    method: 'GET',
    path: '/api/sites/:key/comments/reads',
    summary: 'Your read marks on the site’s comments',
    description:
      'The caller’s own marks, nobody else’s: for each thread they opened, what they saw there (`seenN`, the largest comment number of the other people’s messages in it when they last opened it), or `seenN: null` for one they marked unread. A thread with no mark was never opened. A thread is unread for them when someone else’s live message in it — the comment or a reply at any depth — has a larger number; the Comments tab decides that from the mark and the list.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key' } },
    answers: '`{reads: [{id, seenN}]}` — `seenN` a number, or null for “Mark as unread”'
  },
  // src/sites/comments.js
  {
    method: 'GET',
    path: '/api/sites/:key/comments/people',
    summary: 'The people a comment can mention',
    description:
      'The `@` picker’s roster: everyone holding a live seat on this site (accepted, not revoked, not declined), sorted by name — `accountId`, `email`, `name` (absent when the account has none), `initial`, `role`, and `you` on the caller’s own row. An invitation not yet accepted or a pending join request is not listed. Any seat reads; the same people the site’s Team tab already shows every seat.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key' } },
    answers: '`{people: [{accountId, email, name?, initial, role, you}]}`'
  },
  // src/sites/comments.js
  {
    method: 'POST',
    path: '/api/sites/:key/comments/:id/read',
    summary: 'Mark a comment read',
    description:
      'Files what the caller saw when they opened a thread: `seenN`, the largest comment number of the other people’s messages in it as their screen showed it — not the server’s time, so a reply written while this request was on its way stays unread. The mark sits on the thread’s first comment, whichever of its messages is named (`id` in the answer). It is never lowered (a second tab drawing an older moment) and never set past the thread’s largest number at that moment; the answer gives the mark kept. Then the caller’s unread Inbox rows about replies in that thread numbered up to the mark are read too; a row about a later reply stays unread, and an email still owed is sent as planned. Reading the Inbox never marks a thread. Any seat may mark any comment it can see, a tombstone’s thread included; the comment itself does not change, so no one else’s poll brings it back.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key', id: 'Comment id' } },
    body: {
      type: 'object',
      required: ['seenN'],
      properties: {
        seenN: {
          type: 'integer',
          description:
            'The largest comment number of the other people’s messages in the thread as shown, 0 or more (0 when it shows none)'
        }
      }
    },
    answers:
      '`{read: {id, seenN}}` — the mark kept; 400 `COMMENT_BAD_INPUT` (`field: "seenN"`) without a whole number of 0 or more'
  },
  // src/sites/comments.js
  {
    method: 'POST',
    path: '/api/sites/:key/comments/:id/unread',
    summary: 'Mark a comment unread',
    description:
      'Keeps the caller’s mark with no number (“Mark as unread”), on the thread’s first comment; it stays unread for them until they open it again. Nobody else’s marks change, and the Inbox does not.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key', id: 'Comment id' } },
    answers: '`{read: {id, seenN: null}}`'
  },
  // src/sites/comments.js
  {
    method: 'DELETE',
    path: '/api/sites/:key/comments/:id',
    summary: 'Delete your comment',
    description:
      'Author only. Soft delete: the comment leaves the list, and a poll with `since` sees it with `deletedAt` set. Its number is never given out again. When other replies still stand under it, it stays as a tombstone (`deletedRoot: true`: no words, no files, still the thread); a tombstone cannot be edited or deleted again (`COMMENT_NOT_FOUND`). Every notification about the comment stays in its readers’ Inbox marked `data.deleted: true` with its quote blanked, and an email about it not yet sent is not sent; the delete itself mails nobody.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key', id: 'Comment id' } },
    answers: '`{comment}` with `deletedAt` set'
  },
  // src/sites/comments.js
  {
    method: 'POST',
    path: '/api/sites/:key/comments/clear',
    summary: 'Clear several comments at once',
    description:
      'With `url`: soft-deletes every comment on that page — open or resolved, with their replies, whoever wrote them; other pages stay. With `threads` (the Comments tab’s Delete all): soft-deletes exactly those threads, on any page, open or resolved, with their replies, whoever wrote them. Every thread it can take goes: a tombstone (`deletedRoot`) goes with the replies still under it, and a thread already gone (deleted by someone else meanwhile, or not on this site) is skipped and listed in `gone` instead of refusing the rest. With `ids`: soft-deletes those comments, each of which must be the caller’s own — all or nothing, an id of someone else’s comment refuses the whole request. With `mine: true`: every comment the caller wrote on the site, never the replies under them. The body names exactly one of `url`, `threads`, `ids` and `mine`: a body that is not a JSON object, names none of them, or names more than one is refused with 400 `COMMENT_BAD_INPUT` and deletes nothing. A comment deleted by `ids` or `mine` while someone else’s reply stands under it becomes a tombstone (`deletedRoot`), as with DELETE. Notifications about every cleared comment are marked deleted, as with DELETE.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Page whose comments to delete, all of them' },
        threads: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          description: 'Threads to delete, whoever wrote them, replies included'
        },
        ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
        mine: { const: true, description: 'Delete every comment the caller wrote on this site' }
      }
    },
    answers:
      '`{cleared}` — the ids deleted; with `threads` also `{deleted, gone}` — the named threads it deleted, and the named ones that were already gone'
  },
  // src/sites/comments.js
  {
    method: 'POST',
    path: '/api/sites/:key/requests',
    summary: 'Record what is being sent to Tracy from a page',
    description:
      'Called by the Browser tab right before a “Send to Tracy” chat message goes. Writes one internal request per item — never a comment, shown nowhere — numbered from the sequence comments use, so the chat turn can cite the number in an Apply call’s `comment` and write for the sender within two hours. `commentId` marks the comment an item was sent from (it then reads `sentToTracy` and gains a `sends` entry, and its `updatedAt` moves so a poll with `since` brings it back); an item with a `commentId` may have empty `text`. Any seat may send any comment. Refused with `COMMENT_BAD_INPUT` naming the field, `COMMENT_TOO_LONG` when an item’s `text` is longer than `limits.maxChars`, and `COMMENT_NOT_FOUND` when a `commentId` names neither a live comment of this site nor a tombstone.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['sessionId', 'requestId', 'items'],
      properties: {
        sessionId: { type: 'string', description: 'The dsh chat session the message goes into' },
        requestId: { type: 'string', description: 'Id of the chat turn' },
        items: {
          type: 'array',
          description: 'One per chip in the message, 1 to 50',
          items: {
            type: 'object',
            required: ['url', 'text'],
            properties: {
              url: { type: 'string', description: 'Page the item is on' },
              element: {
                type: 'object',
                description: 'The picked element as the Browser tab sends it; null for the whole page'
              },
              text: { type: 'string', description: 'What the person typed' },
              commentId: {
                type: 'string',
                format: 'uuid',
                description: 'The comment or thread this was sent from, if any'
              }
            }
          }
        }
      }
    },
    answers: '201 `{requests}` — `[{id, n}]`, one per item in order'
  },
  // src/sites/comment-attachments.js
  {
    method: 'POST',
    path: '/api/sites/:key/comments/attachments',
    summary: 'Upload a file to attach to a comment',
    description:
      'Any seat. `multipart/form-data` with one file in the field `file`, at most 20 MiB; any type. The file is kept in the artifact store under a key the server chooses, and is attached by naming its id in `attachments` on `POST`/`PATCH /api/sites/:key/comments`; an upload nobody attaches within a day is removed. Refused with `ATTACHMENT_BAD_INPUT` (no file), `ATTACHMENT_TOO_LARGE` (413, checked on `content-length` before the body is read), `ATTACHMENT_STORE_UNAVAILABLE` (503, no artifact store configured — the comment list then reads `attachments.enabled: false`) and `ATTACHMENT_STORE_FAILED` (502).',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key' } },
    answers: '201 `{attachment}` — `{id, name, size, type, url}`'
  },
  // src/sites/brand-files.js
  {
    method: 'POST',
    path: '/api/sites/brand-files',
    summary: 'Upload a logo or favicon for a site about to be created',
    description:
      'Any signed-in account; no site needed yet (the Add site sheet uploads each picture the moment it is picked). `multipart/form-data` with a PNG in `file` and `role` one of `logo-light`, `logo-dark`, `logo`, `favicon`. The file is checked by its bytes: PNG only, at most 8 MiB, a logo’s longer side at least 500 px, a favicon square and at least 512 × 512. A refusal is 422 with `code` the first problem and `problems` all of them: `PNG_ONLY`, `PNG_UNREADABLE`, `TOO_LARGE`, `LOGO_TOO_SMALL`, `FAVICON_NOT_SQUARE`, `FAVICON_TOO_SMALL`. `BRAND_BAD_INPUT` (400) without a file or a known role; `BRAND_UPLOADS_OFF` (404) while the `site-brand-uploads` switch is off; `BRAND_STORE_UNAVAILABLE` (503) with no artifact store; `BRAND_STORE_FAILED` (502). Name the id in `brief.answers.logo` or `brief.answers.favicon` of `POST /api/sites`; an upload no create names within a day is removed.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    answers: '201 `{id, width, height}`'
  },
  // src/sites/comment-attachments.js
  {
    method: 'GET',
    path: '/api/sites/:key/comments/attachments/:id',
    summary: 'Open a file attached to a comment',
    description:
      "Any seat on the site; there is no public or pre-signed address. Answers the bytes with the stored `content-type`, `nosniff` and a sandboxing CSP. PNG, JPEG, GIF and WebP are served `inline` (thumbnails); every other type as an `attachment` download under its own name (`filename*=UTF-8''…`). Served only while the file is on a live comment: a file of another site, of a deleted comment, removed from its comment by `PATCH` (at once, though kept a day so it can be put back), never attached, or already swept is `ATTACHMENT_NOT_FOUND`. `cache-control: private, no-cache` with an `ETag`: every use asks again, and a copy still good answers 304 without the bytes.",
    audience: ['customer'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key', id: 'Attachment id' } },
    answers: 'The file'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/changed',
    summary: 'Record that a write outside the Apply door changed the site',
    description:
      'Called by the host after a write that never passes the Apply door landed: a `tracy_emdash` write or an EmDash `content.replace` (the EmDash site’s own MCP server), a look change (a stylesheet or `theme.json` written by a file tool) and `look.revert`. Stamps the site’s `siteChangedAt` (read on `GET /api/sites/:key/comments`) with a `site.changed` audit row naming `tool`. With `x-tracy-turn` (`<session id>:<turn number>` of the chat turn that made the write) the write is listed under that turn in the site changes, and an EmDash write in a turn sent from comments marks the caller’s own requests of that turn answered, as an Apply write citing them does. Acts as the signed person who typed (`x-tracy-actor`) or a session; `_conversation` with `x-tracy-workspace-label` names the conversation’s own site. Any live seat.',
    audience: ['dsh'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key, or `_conversation`' } },
    body: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'What wrote: the EmDash tool, the file tool, or look.revert' }
      }
    },
    answers: '`{changedAt}` — ISO time, the new `siteChangedAt`'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/changed',
    summary: 'When the site last changed',
    description:
      'Called by the host before each turn a person speaks in a conversation that has already read or written the site: the site’s `siteChangedAt` (the time of the last write the Apply door or `POST /api/sites/:key/changed` recorded), which the host compares with that conversation’s last site call to tell the agent the site changed since it last looked — unless `byThisConversation` says that last write was the conversation’s own (the `x-tracy-session` it sends is the session recorded with the write), since a write is stamped when it lands, after the call that made it. Read-only. Acts as the signed person who typed (`x-tracy-actor`) or a session; `_conversation` with `x-tracy-workspace-label` names the conversation’s own site. Any live seat.',
    audience: ['dsh'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key, or `_conversation`' } },
    answers:
      '`{changedAt, byThisConversation}` — ISO time of the last recorded write, or null when none; whether that write was made by the asking conversation'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/preview-key',
    summary: 'The preview key of a site held on its rebuilding page',
    description:
      'Called by the host before the site’s agent reads pages of a site a brief build keeps on its rebuilding page: the key the plugin accepts in `X-Tracy-Preview-Key` to serve the real site, sent only to the site’s own origin. `key` is null whenever the site is not locked with one. Never cached. Acts as the signed person who typed (`x-tracy-actor`) or a session, never an API key; `_conversation` with `x-tracy-workspace-label` names the conversation’s own site. Any live seat.',
    audience: ['dsh'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key, or `_conversation`' } },
    answers: '`{key}` — the preview key, or null when the site is not locked with one'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/build-check',
    summary: 'The site build rules checked on one page',
    description:
      'Called by the host when the site’s agent runs `tracy_build_check` after it changed a page: the same final checks a brief build ends with (every check the site build rules registry names, contact facts and the first screen included), read from the served site with the site’s last brief build as the plan, and answered for `path`: that page’s findings and the site-wide ones (menu, footer), blockers first, each with its rule, the rule’s guarantee and what to put instead. Read-only. Acts as the signed person who typed (`x-tracy-actor`) or a session; `_conversation` with `x-tracy-workspace-label` names the conversation’s own site. Any live seat.',
    audience: ['dsh'],
    auth: 'session',
    internal: true,
    params: {
      path: { key: 'Site key, or `_conversation`' },
      query: { path: 'The page, a site-relative address such as `/lessons/beginners` (default `/`)' }
    },
    answers:
      '`{version, path, pass, blockers, findings[], more, broken[], pages[]}` — each finding `{rule, blocks, kind, page, place, found, guarantee, instead}`'
  },
  // src/sites/guide.js
  {
    method: 'GET',
    path: '/api/sites/:key/guide',
    summary: 'How to use Tracy itself, with this site’s live state',
    description:
      'Called by the host when a customer asks the site’s agent how to do something in Tracy (connect their own domain, publish, restore a backup, export, invite people…): the articles of Tracy’s guide that answer `q` (the question in the customer’s words) or `topic` (an article id), each with its steps, the link that opens its screen on this site, who may do it for the asker’s role, and — for the domain and publish articles — the site’s live state read from the same snapshot the Publish tab draws from (the records still missing, what DNS last found, whether the site is live). An article whose switch the operator turned off (`/ops` › User Interface), or that does not cover the site’s platform, is not offered. `recheck=1` with the domain article makes the same lookup as the Check again button — Owner only, and only while the Connect domain switch is on; anyone else gets the stored state and the reason. Nothing matching answers an empty `articles` and the `topics` list. The TXT value is the Owner’s alone. Read-only apart from that lookup. Acts as the signed person who typed (`x-tracy-actor`) or a session; `_conversation` with `x-tracy-workspace-label` names the conversation’s own site. Any live seat.',
    audience: ['dsh'],
    auth: 'session-or-actor',
    internal: true,
    params: {
      path: { key: 'Site key, or `_conversation`' },
      query: {
        q: 'The customer’s question, up to 400 characters',
        topic: 'An article id from an earlier answer',
        recheck: '`1`: look up the domain’s DNS now (Owner)'
      }
    },
    answers:
      '`{articles: [{id, title, body, screen: {label, href}, roleNote?, state?: string[], recheck?}], topics, role}`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/lease/release',
    summary: 'Give back the write lease a finished conversation holds',
    description:
      'Called by the host when a conversation’s turn that wrote to the site has ended, so another conversation waiting on the write lease (`SITE_BUSY` on the Apply door) does not wait out the 90-second silence. Frees the lease only when the caller’s own session (`x-tracy-session`) holds it and the holder is the caller; anything else answers `released: false` and changes nothing. Acts as the signed person who typed (`x-tracy-actor`) or a session; `_conversation` with `x-tracy-workspace-label` names the conversation’s own site. Any live seat.',
    audience: ['dsh'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key, or `_conversation`' } },
    answers: '`{released}` — whether a hold was given back'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/lease/acquire',
    summary: 'Take the write lease before a write that does not pass the Apply door',
    description:
      'Called by the host before each EmDash write it sends straight to the site (an MCP tool call, a redirect change, a write run of the replace script), so two conversations on one EmDash site take turns as they do through the Apply door on WordPress and Joomla. Takes or renews the same lease the Apply door takes, under the caller’s session (`x-tracy-session`, required: 400 without) and turn (`x-tracy-turn`). Held by another conversation: 409 with the Apply door’s own `SITE_BUSY` body. Acts as the signed person who typed (`x-tracy-actor`) or a session; `_conversation` with `x-tracy-workspace-label` names the conversation’s own site. A seat that may not write: 403 `FORBIDDEN_WRITE`.',
    audience: ['dsh'],
    auth: 'session-or-actor',
    internal: true,
    params: { path: { key: 'Site key, or `_conversation`' } },
    answers: '`{ok, fresh}` — the lease is the caller’s; `fresh` when it was not already'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/turn/stopped',
    summary: 'Record what a stopped turn wrote',
    description:
      'Called by the host when the customer stopped a turn while its site writes were sent or on the wire, and again as each late answer arrives. Keeps, per write, only its action, its target (kind, id, slot, page), the road it took and its outcome (`sent`, `ok`, `refused`, `unknown`, `not-sent`), never its body. A late `sent` never overwrites an outcome already recorded. Same callers and checks as `POST /api/sites/:key/turn/check`.',
    audience: ['dsh'],
    auth: 'session-or-actor',
    internal: true,
    params: { path: { key: 'Site key, or `_conversation`' } },
    body: {
      type: 'object',
      required: ['turnId', 'writes'],
      properties: {
        turnId: { type: 'string', description: '`<session id>:<turn number>` of the stopped turn' },
        writes: { type: 'array', description: '1 to 50 writes: `{id, action, target, via, outcome}`' }
      }
    },
    answers: '`{ok}`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/turn/stopped/take',
    summary: 'Read, once, what earlier stopped turns of this conversation wrote',
    description:
      'Called by the host at the first step of a turn the customer speaks in: the writes recorded by `POST /api/sites/:key/turn/stopped` for earlier turns of the same root session, on the same site, by the same person, not yet told. They are marked told in the same statement, so each is told once; rows older than 7 days on the site are dropped. Same callers and checks as `POST /api/sites/:key/turn/check`.',
    audience: ['dsh'],
    auth: 'session-or-actor',
    internal: true,
    params: { path: { key: 'Site key, or `_conversation`' } },
    body: {
      type: 'object',
      required: ['turnId'],
      properties: { turnId: { type: 'string', description: 'The asking turn, `<session id>:<turn number>`' } }
    },
    answers: '`{writes}` — the untold writes with their action, target and outcome'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/site',
    summary: 'Remember the last site opened',
    description:
      'Records the site the person last opened in a cookie, used when a page has no other clue which site to show. Requires a seat on that site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    body: { type: 'object', required: ['siteKey'], properties: { siteKey: { type: 'string' } } },
    answers: '`{ok, siteKey, role}` and a site cookie'
  },
  // src/sites/address.js
  {
    method: 'GET',
    path: '/api/sites/:key/address/availability',
    summary: 'Check whether a new site address is free',
    description:
      'Checks a candidate address — a name under the Tracy site domain or a custom domain — and says whether it is free or already this site’s. A custom domain must be the bare name (no scheme, port or path; `DOMAIN_NOT_BARE`, `DOMAIN_TOO_LONG`) and a subdomain of a registrable domain: a registrable domain itself (`example.com`, `example.co.uk`, by the public suffix list) cannot carry the CNAME that connects it, and is refused with 400 `DOMAIN_APEX_UNSUPPORTED` naming the subdomain to use instead (`www.` of it); a public suffix, or a name under a suffix the list does not know, is `INVALID_SITE_KEY`. `kind` says which of the two the caller means, and the other is refused by name (`DOMAIN_IS_TRACY`, `ADDRESS_NOT_TRACY`). A site holds one custom domain at a time (`DOMAIN_LIMIT`). A reservation that lapsed holds nothing: its name reads available. While the operator has turned the `site-connect-domain` switch off, a custom domain is refused with 403 `OWN_DOMAIN_DISABLED` (503 `UI_SETTING_UNREADABLE` when the switch cannot be read). Owner only.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: { key: 'Site key or current address' },
      query: {
        name: 'Candidate address',
        kind: '`managed` or `custom` (optional): the kind the caller means'
      }
    },
    answers:
      '`{name, kind: "managed"|"custom", available}`, with `code: "NAME_TAKEN"` when held by another site; 409 `{code: "DOMAIN_LIMIT", max}` when the site already has a custom domain; 400 `{code: "DOMAIN_APEX_UNSUPPORTED", name, suggestion}` for a registrable domain itself; 403 `{code: "OWN_DOMAIN_DISABLED"}`; 503 `{code: "OWN_DOMAIN_UNAVAILABLE"}` for a custom domain on a server without Cloudflare for SaaS'
  },
  // src/sites/address.js
  {
    method: 'POST',
    path: '/api/sites/:key/address/verify',
    summary: 'Read DNS for a custom domain of the site, now',
    description:
      'Looks up the two DNS records of the domain — the TXT record `_tracy.<domain>` that proves ownership and the CNAME that points the domain at the site’s host — and records what each lookup returned, with its time. Nothing is inferred: a record reads `ok` only when it was found with the expected value, `wrong` with the values found, `missing` when it is not there (a flattened or proxied CNAME cannot be read and reads `missing`), and `unknown` with the reason when the lookup gave no usable answer. The call installs no route: the next publish hands the domain to the host, and carries it once the TXT record proves ownership — the CNAME reading is a diagnosis and no particular target is demanded. For a domain whose route the host has installed, the call also asks the real domain now, over HTTPS and public DNS: first `/__tracy/domain-probe`, which only this deployment can answer for this site and this connection attempt, then the site’s home page through the same name, requested as any visitor requests it (the request carries nothing that marks it; the proof is a signature the proxy adds, for a nonce written beforehand on the domain’s own record, over the status, the content type, the `Location` and a digest of every byte of the body it sent) and followed through redirects that stay on the domain. The answer is read to its end — within a deadline and a 5 MiB ceiling — and its bytes are hashed and checked against that signature. Only the route answer and a whole served page — status 200 with an HTML document — make the domain `connected`; anything else leaves it `pending` with the reason in `connection` (`DNS_NXDOMAIN`, `DNS_NO_ADDRESS`, `DNS_TIMEOUT`, `DNS_FAILED`, `ADDRESS_NOT_PUBLIC`, `TLS_INVALID`, `CONNECT_FAILED`, `TIMEOUT`, `REDIRECT`, `HTTP_STATUS`, `EMPTY`, `TOO_LARGE`, `WRONG_ANSWER`, `PAGE_NOT_SITE`, `SITE_NOT_ANSWERING`, `PAGE_REDIRECT`, `PAGE_EMPTY`, `PAGE_INCOMPLETE`, `PAGE_TOO_LARGE`), and it is asked again in the background. Two lookups of one domain that end in the other order than they began leave the later one on record, and the answer is what is on record. The first lookup that finds the TXT record right proves the reservation, and no later lookup takes that back. Refused with 409 `ADDRESS_CHANGE_BUSY` while a publish, a draft, a domain removal or a delete holds the site; with 404 `NAME_NOT_RESERVED` when the site holds no such domain; with 409 `RESERVATION_LAPSED` when its reservation lapsed (see `PUT /api/sites/:key/address`) — a lookup that ends after the deadline proves nothing either; with 400 `DOMAIN_APEX_UNSUPPORTED` for a registrable domain itself, and 400 `INVALID_SITE_KEY` for a name under a suffix the list does not know (a pending domain reserved before either was refused says so in `problem` and can only be removed); with 403 `OWN_DOMAIN_DISABLED` while the `site-connect-domain` switch is off; and with 400 `INVALID_REQUEST` for a body that carries any field but `name`. Owner only.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key or current address' } },
    body: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string', description: 'The reserved custom domain' } }
    },
    answers:
      '202 `{state: "pending", pending}` (or `{state: "connected", connected}`) — the domain with `checks`: one entry per record `{record: "ownership"|"routing"|"validation", type, name, expected, status: "ok"|"wrong"|"missing"|"unknown"|"unchecked", observed, error?, checkedAt}`; `readiness.ownership` and `readiness.routing` are true only for a record read `ok`, `readiness.tls` only when the real domain answered as this site; `connection: {status: "unchecked"|"waiting"|"ok"|"failed", error?, checkedAt?, route?}` — what the HTTPS request to the real domain found (`unchecked`: the host has not installed the route; `waiting`: installed and not answered yet, or a domain that is being served while the route of its current connection attempt is not installed yet — one published again, which reads `pending` until that attempt’s route is in and the domain answered it, whatever an earlier attempt proved; `route: "direct"` marks one connected before routes went through Tracy’s proxy and not handed over since); 404 `{code: "NAME_NOT_RESERVED"}`; 409 `{code: "RESERVATION_LAPSED"}`; 503 `{code: "OWN_DOMAIN_UNAVAILABLE"}` on a server without Cloudflare for SaaS. A reading that proves the domain registers its custom hostname at once; while the hostname or its certificate is not active, `connection` reads `failed` with that `reason` and the domain is not asked over HTTPS'
  },
  // src/sites/address.js
  {
    method: 'PUT',
    path: '/api/sites/:key/address',
    summary: 'Change the site address',
    description:
      'A name under the Tracy site domain is applied on the host, probed, and becomes the site’s address, rolled back if either step fails. A custom domain is reserved: the answer gives the two DNS records to create (`verification`, the TXT record; `routing`, the CNAME to the site’s host, when the host has one to name) and what the last lookup found for each (`checks`). The next publish that finds the TXT record right hands the domain to the host, which routes it through Tracy’s own proxy — never straight to the site. It is `connected` only after Tracy has itself requested the real domain over HTTPS and this site answered (`connection`, see `POST /api/sites/:key/address/verify`); until then it reads `pending` with the reason. Connecting never changes the address the CMS believes it has: the admin stays at the Tracy address. A reservation holds its name for 72 hours (`holdUntil`, on the server’s clock) unless its ownership is proven by then — a lookup that finds the TXT record, even one that ends after a later lookup that did not; saving the same name again does not extend it. Past that it lapses: the name is free for any site, the site that held it reads it in `addressChange.lapsed` (`GET /api/sites/:key/settings`) until it removes the notice or reserves again, and reserving it again gives a new token and a new 72 hours. A proven, connected or carried reservation never lapses. A registrable domain itself (`example.com`) is refused with 400 `DOMAIN_APEX_UNSUPPORTED`, naming the subdomain to use instead (`suggestion`). While the operator has turned the `site-connect-domain` switch off, reserving a custom domain — with or without `kind` — is refused with 403 `OWN_DOMAIN_DISABLED` (503 `UI_SETTING_UNREADABLE` when the switch cannot be read); a domain the site already has keeps working and can still be removed, and a name under the Tracy site domain is not affected. One change at a time per site, none while a publish, a draft, a domain removal or a delete holds it (`ADDRESS_CHANGE_BUSY`); one custom domain per site (`DOMAIN_LIMIT`). A body that carries any field but `name` and `kind`, or a `kind` that is not one of the two words (`null` included), is refused with 400 `INVALID_REQUEST`. Owner only. With Cloudflare for SaaS (#1037), the CNAME a custom domain is told to create points at `connect.<site domain>`; once the TXT record proves the domain, a custom hostname is registered for it in the site zone, and `hostname` `{ready, reason?}` says whether that hostname and its certificate are active (`reason`: `HOSTNAME_PREPARING`, `HOSTNAME_UNCONFIRMED`, `HOSTNAME_CONFLICT`, `HOSTNAME_PENDING`, `HOSTNAME_FAILED`, `CERT_PENDING`, `CERT_FAILED`, `HOSTNAME_UNREAD` — the last read of the hostname failed, and what was read before it is not believed until a read succeeds). Any DNS record the certificate’s validation asks for is listed in `checks` as `{record: "validation", type, name, expected, status: "unchecked"}`, every one of them, whole, exactly as returned. A published site connects a proven domain by itself; a domain is `connected` only while its hostname and certificate are active as last read successfully and the HTTPS probe of the real name passed: a hostname later reported not active, or that cannot be read, takes it back to `pending` with the reason, and its `connection` then reads `failed` with that reason rather than an earlier proof (it goes on being served while Cloudflare serves it).',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key or current address' } },
    body: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'The new address' },
        kind: {
          type: 'string',
          enum: ['managed', 'custom'],
          description:
            'Optional. `custom`: a domain of the customer’s own (a Tracy address is refused with `DOMAIN_IS_TRACY`). `managed`: a name under the Tracy site domain (`ADDRESS_NOT_TRACY` otherwise).'
        }
      }
    },
    answers:
      '`{state: "active", siteKey, displayName, siteUrl, workspaceUrl}`, or 202 `{state: "pending", pending}` for a custom domain (`{state: "connected", connected}` when it is already connected; `pending.holdUntil` until its ownership is proven); 400 `{code: "DOMAIN_APEX_UNSUPPORTED", name, suggestion}`; 403 `{code: "OWN_DOMAIN_DISABLED"}`; 503 `{code: "OWN_DOMAIN_UNAVAILABLE"}` for a custom domain on a server without Cloudflare for SaaS; 409 `{code: "NAME_TAKEN"}`; 409 `{code: "DOMAIN_RELEASING"}` while the custom hostname of an earlier reservation of the name is still being deleted; 502 `{code: "ADDRESS_APPLY_FAILED", reason?}` when the host refused the change and nothing was left changed (`reason` is the host’s code, e.g. `WP_ADDRESS_CONSTANT`: WordPress pins its address in wp-config.php in a shape that cannot be rewritten), `ADDRESS_PROBE_FAILED`, or `ADDRESS_ROLLBACK_FAILED` when the host could not confirm the site is back as it was'
  },
  // src/sites/address.js
  {
    method: 'DELETE',
    path: '/api/sites/:key/address/domain',
    summary: 'Remove a custom domain from the site',
    description:
      'A domain that was only reserved is removed at once (200). One the host may route — connected, or handed to a publish whose answer was never heard — is taken out of the host as an operation of the site (202): the same one-at-a-time rule as a publish (`PUBLISH_BUSY`), read from `GET /api/sites/:key/state` (`operation.op: "drop-domain"`). The domain stays the site’s until the host has said its rule is gone; a removal that failed reads `operation.state: "failed"` with `DOMAIN_STILL_ROUTED` and `retry: true`, and asking again takes the same operation up where it stopped. The site stays published at its Tracy address — and that is checked before anything is taken away: for every domain the host may route, the site is first asked at its Tracy address. If it does not serve the site’s page there — status 200 with an HTML document, reached directly or through redirects that stay on the Tracy address; an empty or partial answer, an error, and a redirect that never arrives are not that — nothing is removed and the answer is 502 `DOMAIN_REMOVE_FAILED` with the `step` that failed: `verify-address` (`reason`: `SITE_NOT_READY`, `ADDRESS_REDIRECTS_ELSEWHERE`, or none for an error or no answer), `restore-address` (a CMS found pointing at the domain could not be put back; `reason` is the host’s code), or `rollback-address` (`uncertain: true`, `changeId`: the restore failed and undoing it could not be confirmed). A host that could not be asked to remove the route answers its own status with `step: "remove-route"`. The name of a reservation that lapsed (`addressChange.lapsed`) removes its notice (200), whoever holds the name now. Any name the site holds can be removed, including a registrable domain reserved before those were refused, and while the `site-connect-domain` switch is off. A body that carries any field but `name` is refused with 400 `INVALID_REQUEST`. Owner only. Once the name is no longer the site’s, its custom hostname at Cloudflare for SaaS is deleted (at once for a reservation, by the background sweep after a removal through the host); a deletion that fails is kept and retried, and the name cannot be reserved again until it is done (`DOMAIN_RELEASING`).',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key or current address' } },
    body: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string', description: 'The custom domain to remove' } }
    },
    answers:
      '`{ok: true, removed}` for a reservation; 202 `{jobId, op: "drop-domain", state, publish, mayPublish, operation}` when the host is asked; 502 `{code: "DOMAIN_REMOVE_FAILED", step, reason?, uncertain?, changeId?}` when the Tracy address does not serve the site; 404 `{code: "NAME_NOT_RESERVED"}`'
  },
  // src/sites/design.js
  {
    method: 'GET',
    path: '/api/sites/:key/design',
    summary: 'Read the design system the site wears',
    description:
      'The design record tracy-web keeps for the site (ADR 0023): which design system it wears, where that came from, and the token values frozen when it was built or last restyled. Always 200 — `{design: null}` when nothing is recorded, because wearing none known is an answer, not an error. The site folder holds a copy the agent reads.',
    audience: ['dsh', 'customer'],
    auth: 'session-or-actor',
    internal: true,
    params: { path: { key: 'Site key' } },
    answers: '`{design: {id, name, source, platform, tokens, tokensFrom, updatedAt} | null}`'
  },
  // src/sites/design.js
  {
    method: 'PUT',
    path: '/api/sites/:key/design',
    summary: 'Record the design system the site wears (the build only)',
    description:
      'Called by the Build’s `check` stage through the lane, under the signed assertion of the person who pressed. A browser session or an API key is refused with `DESIGN_RECORD_BUILD_ONLY`: the record is the ruler of the adherence check and a public answer, so only the build writes it. `wrote_by` is set by the server. A malformed record answers `DESIGN_RECORD_INVALID` naming the field. The Apply door updates the same record when `theme.style` answers ok.',
    audience: ['dsh'],
    auth: 'actor',
    internal: true,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['source', 'platform'],
      properties: {
        id: { type: ['string', 'null'], description: 'A catalogue id, brand:<host>, or null' },
        source: { type: 'string', enum: ['catalog', 'brand', 'template', 'quickstart', 'none'] },
        name: { type: ['string', 'null'] },
        platform: { type: 'string' },
        tokens: { type: ['object', 'null'], description: 'CSS custom property → value, at most 120' },
        tokensFrom: { type: ['string', 'null'] },
        manifestDesign: { type: ['object', 'null'] }
      }
    },
    answers: 'the record as GET answers it'
  },
  // src/sites/settings.js
  {
    method: 'GET',
    path: '/api/sites/:key/settings',
    summary: 'Read the site’s main CMS settings',
    description:
      'Returns a safe, fixed selection of the live CMS configuration (version, title, language, theme or template, timezone and a few others, per CMS), the site and admin URLs, the caller’s role and the address change state (`addressChange`: the custom domain being connected, the connected ones, and `lapsed` — reservations that let their name go before their ownership was proven, by name and `lapsedAt` only). `state` is `unavailable` when the site cannot be read.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers: '`{siteKey, siteUrl, adminUrl, platform, role, state, values, addressChange, …}`'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/changes',
    summary: 'List the changes to the site files since the last backup',
    description:
      'Reads, on the host, what changed in the site’s files since the last backup: the saved moments and the changed files. Each moment names the chat turn it belongs to (`turn`), or null for one made outside a chat or before turns were recorded. Past 200 moments or 500 files the lists stop and `truncated` says which. While a chat turn is open on the site, the read does not save pending edits as made outside Tracy. Every moment and file names who made it (`by`): `{kind: "agent"}`, `{kind: "outside"}`, or a person `{kind: "person", name, email, face}`, where `face` — `{initial, color, avatarUrl}` — is the one the Team tab draws for the same Tracy account, or null when no Tracy account holds that address. Answers 202 `FLEET_JOB_PENDING` if the host takes longer than 45 seconds. Requires a seat on the site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers:
      '`{since, moments: [{sha, at, by: {kind: "person", name, email, face: {initial, color, avatarUrl} | null} | {kind: "agent" | "outside"}, kind, title, turn, files}], files: [{path, …, by}], truncated: {moments, files} | null}`'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/backups',
    summary: 'List the site’s backups',
    description:
      'Reads the site’s backups from the host, with the saved moments between them, newest first. Each backup row (`kind: "backup"`) carries `database` — `{state, engine, sha256, size, reason?}`, what it holds besides files: `full` (a database dump the host has and has checked; the only state “restore everything” accepts), `missing` (the point names a dump that is gone or does not match, `reason` `missing`, `mismatch` or `removed`), `none` (a point made before backups held a database), or `unknown-host` (the site’s host cannot tell yet). EmDash rows also carry `applicationAvailable`, which is true only when the point has its app snapshot; Download is offered only when that snapshot is present. A backup the host made by itself just before a “restore everything” carries `auto: "pre-restore"`. This read never returns a dump: an owner downloads a whole backup through `POST /api/sites/:key/backups/:version/export`. `may` says what the caller’s seat may ask for: `restoreFiles` (the `code` toolset), `restoreEverything` (the `site` toolset) and `export` (the `lifecycle` toolset, owners only, and only on a server that offers backup downloads). A row’s `by` that is a person (`{kind: "person", name, email}`, the one who pressed Create a backup or made the moment) carries `face` — `{initial, color, avatarUrl}`, the one the Team tab draws for the same Tracy account — or `face: null` when no Tracy account holds that address. Answers 202 `FLEET_JOB_PENDING` if the host takes longer than 45 seconds. Requires a seat on the site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers:
      '`{latest, rows: [… {kind: "backup", version, sha, title, notes, at, by: {kind: "person", name, email, face: {initial, color, avatarUrl} | null} | {kind: "agent" | "outside"}, files, database, applicationAvailable? (EmDash), auto?}], truncated, may: {restoreFiles, restoreEverything, export}}`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/backups/:version/export',
    summary: 'Prepare a backup for download',
    description:
      'Asks the site’s host to pack backup `version` into a zip. Optional `{includeLarge: true}` adds the greater-than-50-MB files archived by the matching fresh backup while it held the site lock; this option is for the one-click export. Without it, the package reflects the selected historical point. WordPress and Joomla packages contain `installer.php`, `README.md`, `index.html` and a `tracy-package-…` folder (denied to the web) holding `webroot.tar`, `db.sql.gz`, `tracy_setting.json`, `manifest.json`, `install-code.json` (the hash of the install code, never the code) and `SHA256SUMS`; EmDash contains `app.tar`, `db.sqlite.gz`, `uploads.tar.gz`, `tracy_setting.json`, `manifest.json`, `README.md` and `SHA256SUMS`. The manifest names the package scope. Packages are capped at 1 GiB. Answers 202 with `{exportId, state: "queued"}`. Only an owner may ask; editors and viewers get 403 `FORBIDDEN_EXPORT`. The server answers 404 `EXPORT_OFF` when the kill switch is off. The GET status route never issues a link; request a code by email and submit it to the code-gated download door.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key', version: 'The backup’s number, the N of “Backup N”' } },
    body: {
      type: 'object',
      required: [],
      properties: {
        includeLarge: {
          type: 'boolean',
          description: 'Include live files over 50 MB for a fresh one-click export'
        }
      }
    },
    answers: '`{exportId, state}` (202)'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/backups/:version/export/:exportId',
    summary: 'Read a backup export status',
    description:
      'Reads `state` (`queued`, `packing`, `uploading`, `ready`, `failed`, or `expired`), `bytes`, `sha256`, `expiresAt`, `downloaded`, and, for a WordPress or Joomla package that is ready or was downloaded, its `installCode`. A status read never issues a download URL. A ready package is retained for 24 hours. Request a fresh email code at `POST …/code` and submit it at `POST …/download`; only the latter returns a five-minute link. Owners only; this and both code doors return 404 `EXPORT_OFF` when the kill switch is off.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: { key: 'Site key', version: 'The backup’s number', exportId: 'From the request’s answer' }
    },
    answers: '`{exportId, version, state, bytes, sha256, expiresAt, downloaded, installCode?, error?}`'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/export/latest',
    summary: 'Read the latest backup export and its install code',
    description:
      'The newest export of the site that is ready or was downloaded, as `{export}` (null when there is none), in the same shape as the status read. A WordPress or Joomla package carries `installCode`: six digits its `installer.php` asks for before it installs the site with a database on another server. It is shown while the package is ready and, once downloaded, after it expires. Owners only, like the download; 404 `EXPORT_OFF` when the kill switch is off.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers:
      '`{export: {exportId, version, state, bytes, sha256, expiresAt, downloaded, installCode?} | null}`'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/sync',
    summary: 'Read the latest sync from the live site',
    description:
      'Whether the site can be synced from its live site, and its newest sync. `available` is true for an imported (`migrated`) Joomla or WordPress site; otherwise `why` is `not-imported` or `platform` and `sync` is null. While a sync runs, each read asks the host how far it got — `step` is `reading`, `merging` or `applying` — and renews the site’s write lease; the read that sees it end records the result. `sync` is null when the site was never synced; otherwise `state` is `running`, `applied`, `needs_resolution` (nothing applied: `held` lists the new live records the merge could not keep beside the copy’s) or `failed` (with `error`). `kept` lists the places both sites changed, where Tracy’s version stayed. `timing` says where its time went, so far while it runs: `steps` (`{at, step, stage}`, `at` in seconds from its start, `stage` the `step` it belongs to or null) and `read` (`{mode, seconds, parts}` of the live read), or null. `busy`, when `error` is `LIVE_BUSY`, says what kept changing on the live site while it was read — `parts` (`content`, `settings`, `users`, `comments`, `files`, `other`), `tables` (`{table, rows, names}`: how many rows moved and the names of those rows, an option’s or a meta row’s name, never a value), `files` (up to five paths) and `detail` — or null when the host did not say. Owners only (the `lifecycle` toolset); editors and viewers get 403 `FORBIDDEN_SYNC`. Not cached.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers:
      '`{available, why?, sync: {id, state, step, error, liveReadAt, startedAt, updatedAt, startedBy, conflicts, held, kept, summary, timing, busy} | null}`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/sync',
    summary: 'Sync the copy from the live site',
    description:
      'Starts a sync of an imported Joomla or WordPress site: the host reads the customer’s live site with the token Tracy holds for it, merges it with the copy (Tracy’s version wins only where both sites changed the same thing) and replaces the copy’s files and database with the merge, after a backup. Holds the site’s write lease until the sync ends. Optional `{allowHeld: true}`: a person saw the live records the last sync held and said to go on keeping the copy’s; the host then takes the held sync’s read of the live site, and its merge, when neither site moved since. Answers 202 with the new sync row, then read progress with `GET /api/sites/:key/sync`. Refusals: 409 `SYNC_NOT_IMPORTED`, `SYNC_UNSUPPORTED_PLATFORM`, `SYNC_RUNNING` (`syncId`), `SYNC_NO_LIVE_DOOR` (`why`) or `SYNC_SITE_BUSY` (`holder`); 502 `SYNC_COPY_TOKEN` or `SYNC_HOST_REFUSED` (`why`); 400 `INVALID_REQUEST` when `allowHeld` is not a boolean. Owners only; editors and viewers get 403 `FORBIDDEN_SYNC`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: [],
      properties: {
        allowHeld: {
          type: 'boolean',
          description: 'Go on keeping the copy’s records where the last sync held new live ones'
        }
      }
    },
    bodyOptional: true,
    answers:
      '202 `{sync: {id, state, step, error, liveReadAt, startedAt, updatedAt, startedBy, conflicts, held, kept, summary}}` — poll it with `GET /api/sites/:key/sync`'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/push',
    summary: 'Read the latest Sync to live',
    description:
      'Whether Tracy’s content changes on this imported site can be sent to its live site (Sync to live), and its newest push. `available` is true for an imported (`migrated`) Joomla or WordPress site whose live door Tracy holds; otherwise `why` is `not-imported`, `platform` or `not-connected` and both rows are null. `push` is the newest row: `state` is `running` (its `phase` — `preview`, `apply` or `undo` — under way; `step` is the stage the host reports, and each read renews the site’s write lease), `previewed` (its `preview` groups the changes: content records in `add`, `change` and `remove`; `files` (theme files and pictures the live site’s engine writes, each with its `size`); `settings` (site name and description, template style, theme mods, options); `php` (PHP files, each checked by a PHP lint for the live site’s PHP version, sent only with `confirm.php`); `unsupported` — named with a `reason`, not pushed —, and `liveChanged` — changed on both sites since the last sync, not pushed; with `limit`, `itemsTotal`, `unsupportedTotal`), `expired` (a preview older than 30 minutes), `held` (the Sync from live the preview runs first held records: decide there first), `pushed` (`result`: `pushed`, `conflicts` left because the live site changed them, `failed`, `skipped` — over the limit, removals not ticked, or depending on one that failed), `undone` (`undo`: `restored`, `conflicts`, `failed`) or `failed` (with `error`). Each change is `{id, kind, title, liveId?, fields?, size?}`: titles, field names and file sizes, never values or file contents. `lastPush` is the newest push that reached the live site when that is an older row than `push`, else null; `undoable` says whether the Undo door takes it. Owners only, in a browser session: editors, viewers, the agent and seat keys get 403 `FORBIDDEN_PUSH`. Not cached.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers:
      '`{available, why?, push: {id, state, phase, step, error, undoError, startedAt, updatedAt, startedBy, expiresAt, pushedAt, undoneAt, preview, deletes, result, undo, undoable, maxItems} | null, lastPush: … | null}`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/push/preview',
    summary: 'Preview a Sync to live',
    description:
      'Starts a preview of Sync to live on an imported Joomla or WordPress site: the host first syncs the copy from the live site (so the base is the live site as it is now), then lists the content changes the copy holds against it, grouped. Nothing is written to the live site. Holds the site’s write lease while it runs; the preview can be pushed for 30 minutes. Answers 202 with the new row, then read progress with `GET /api/sites/:key/push`. Refusals: 409 `PUSH_NOT_IMPORTED`, `PUSH_UNSUPPORTED_PLATFORM`, `PUSH_RUNNING` (`pushId`), `PUSH_SYNC_RUNNING` (`syncId`), `PUSH_NO_LIVE_DOOR` (`why`) or `PUSH_SITE_BUSY` (`holder`); 502 `PUSH_COPY_TOKEN` or `PUSH_HOST_REFUSED` (`why`). Owners only, in a browser session; anyone else gets 403 `FORBIDDEN_PUSH`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers:
      '202 `{push: {id, state, phase, step, error, undoError, startedAt, updatedAt, startedBy, expiresAt, pushedAt, undoneAt, preview, deletes, result, undo, undoable, maxItems}}` — poll it with `GET /api/sites/:key/push`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/push',
    summary: 'Sync a preview to the live site',
    description:
      'Pushes the newest preview: every `add`, `change`, `files` and `settings` change of it, its `remove` group only with `confirm.deletes: true` and its `php` group only with `confirm.php: true` (otherwise those are `skipped`). The host writes each change through the live site’s Claude Cowork engine only where the live site still holds what the preview’s base held, skips the others as `conflicts`, keeps what it overwrote for Undo, and syncs the copy from the live site again. At most `maxItems` (200) changes go in one push, in dependency order; the rest are `skipped` for the next one. Holds the site’s write lease while it runs. Answers 202 with the row (`phase: apply`), then read progress with `GET /api/sites/:key/push`. Refusals: 404 `PREVIEW_UNKNOWN`; 409 `PREVIEW_SUPERSEDED` (a newer row exists), `PREVIEW_NOT_READY` (`state`), `PREVIEW_EXPIRED`, `PUSH_NOTHING`, `PUSH_RUNNING`, `PUSH_SYNC_RUNNING`, `PUSH_NO_LIVE_DOOR` or `PUSH_SITE_BUSY`; 502 `PUSH_COPY_TOKEN` or `PUSH_HOST_REFUSED`; 400 `INVALID_REQUEST` for a body of the wrong shape. Owners only, in a browser session; anyone else gets 403 `FORBIDDEN_PUSH`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['previewId'],
      properties: {
        previewId: { type: 'string', description: 'The previewed row’s id' },
        confirm: {
          type: 'object',
          description:
            '`{deletes: boolean, php?: boolean}`: the Owner ticked the preview’s removals, and its PHP files'
        }
      }
    },
    answers:
      '202 `{push: {id, state, phase, step, error, undoError, startedAt, updatedAt, startedBy, expiresAt, pushedAt, undoneAt, preview, deletes, result, undo, undoable, maxItems}}` — poll it with `GET /api/sites/:key/push`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/push/:id/undo',
    summary: 'Undo a Sync to live',
    description:
      'Puts back on the live site what the newest push overwrote, only where the live site still holds what the push wrote; a place changed there since is listed in `undo.conflicts` and left as it is. Holds the site’s write lease while it runs. Answers 202 with the row (`phase: undo`); an undo that does not finish leaves the push as it was, with `undoError`. Refusals: 404 `PUSH_UNKNOWN`; 409 `PUSH_NOT_UNDOABLE` (`why`: `not-newest` or the row’s state), `PUSH_RUNNING`, `PUSH_SYNC_RUNNING`, `PUSH_NO_LIVE_DOOR` or `PUSH_SITE_BUSY`; 502 `PUSH_COPY_TOKEN` or `PUSH_HOST_REFUSED`. Owners only, in a browser session; anyone else gets 403 `FORBIDDEN_PUSH`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key', id: 'The push’s id' } },
    answers:
      '202 `{push: {id, state, phase, step, error, undoError, startedAt, updatedAt, startedBy, expiresAt, pushedAt, undoneAt, preview, deletes, result, undo, undoable, maxItems}}` — poll it with `GET /api/sites/:key/push`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/backups/:version/export/:exportId/code',
    summary: 'Email a fresh download code',
    description:
      'Sends a six-digit code to the signed-in owner’s email. The code expires after ten minutes and is required before a download link can be issued. The export must be ready and unexpired. Owner-only; mail rate limits apply.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key', version: 'Backup number', exportId: 'Export request id' } },
    answers: '`{challengeId, expiresAt}` (202)'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/backups/:version/export/:exportId/download',
    summary: 'Verify a code and issue a download link',
    description:
      'Consumes the owner’s fresh email code once and returns a five-minute signed download URL. The first link issued for a WordPress or Joomla package also emails its install code to the owner, once. Refusals are 401 `DOWNLOAD_CODE_EXPIRED` (the code is past its ten minutes), `DOWNLOAD_CODE_TOO_MANY_ATTEMPTS` (request a new code), or `DOWNLOAD_CODE_INVALID` (missing, wrong, or already used). The status GET does not issue links.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key', version: 'Backup number', exportId: 'Export request id' } },
    body: {
      type: 'object',
      required: ['challengeId', 'code'],
      properties: {
        challengeId: { type: 'string', format: 'uuid' },
        code: { type: 'string', minLength: 6, maxLength: 6 }
      }
    },
    answers: '`{url}`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/backup',
    summary: 'Create a backup of the site',
    description:
      'Records the current state of the site files as the next numbered backup, signed with the caller’s name or email, and logs it in the audit trail when this answer confirms it. Where the host keeps backups, the same job saves a copy of the site’s database beside the site; `database` says what the new backup holds (see `GET /api/sites/:key/backups`). Optional `includeLarge: true` also snapshots regular files over 50 MB while the site lock is held, for the one-click ZIP flow. One backup is made at a time: if the host has not finished it within two minutes, or a backup of the site is already being made, the answer is 202 `BACKUP_PENDING` and no second one is started. This answer includes `jobId` and `startedByRequest`: clients can wait for the job they started, or wait for another job to finish before starting their own. Requires an owner or editor seat; a viewer gets 403 `FORBIDDEN_WRITE`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', maxLength: 120, description: 'One line' },
        notes: { type: 'string', description: 'Backup notes, up to 64 KB' },
        includeLarge: {
          type: 'boolean',
          description: 'Snapshot files over 50 MB under the same site lock; used for the one-click ZIP export'
        }
      }
    },
    answers:
      '`{ok, version, title, sha, database}`; 202 `{code: "BACKUP_PENDING", jobId: string|null, startedByRequest: boolean}` while the backup is still being made; `jobId` is null only when the host call timed out before it returned an id. 502 `{code: "FLEET_JOB_FAILED", reason}` when the host refused or failed it'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/moment',
    summary: 'Save a moment in the site history',
    description:
      'Called by the host’s dsh when a chat turn stops: commits the current site files as a titled moment on behalf of the person who typed the turn (signed `x-tracy-actor` header, checked against a live seat). `x-tracy-workspace-label` must name this site. With `turnId` the commit carries that turn and closes it (see `POST /api/sites/:key/turn`); without it (an older dsh) the moment is saved as before. With `reply` it also keeps Tracy’s answer for that turn — the text the host took from the turn’s last assistant message (no tool output, no reasoning, code blocks as `[code]`) — cut again here to 2000 characters between words, and shown to every seat in Site changes; a close without `reply` keeps the one already recorded.',
    audience: ['dsh'],
    auth: 'session-or-actor',
    internal: true,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', description: 'Trimmed to one line, 200 characters' },
        turnId: {
          type: 'string',
          description: 'Optional; the chat turn this moment closes, `<session id>:<turn number>`'
        },
        reply: {
          type: 'string',
          description:
            'Optional, only with `turnId`; Tracy’s answer for the turn, at most 64 KiB as sent — stored cut to 2000 characters and 4000 bytes'
        },
        replyState: {
          type: 'string',
          enum: ['full', 'truncated', 'interrupted'],
          description:
            'Required with `reply`: `full`, `truncated` (the host cut it) or `interrupted` (the turn was cancelled mid-answer); stored as `truncated` whenever this door cuts it'
        },
        endReason: {
          type: 'string',
          enum: ['completed', 'max-tokens', 'error', 'aborted', 'blocked', 'interrupted'],
          description:
            'Optional, only with `turnId`: how the turn ended, as dsh’s `turn/end` names it. A comment sent into a turn that ended `error`, `aborted`, `blocked` or `interrupted` does not count as sent (`GET /api/sites/:key/comments/sent`). A close without it keeps the one recorded'
        },
        work: {
          type: 'object',
          description:
            'Optional, only with `turnId`: what the turn took, read off its own events — `{steps, calls, failedCalls}`, whole numbers up to 10000, `failedCalls` no more than `calls` (a call whose answer said `ok: false` or was an error). Kept with the turn for usage; a close without it keeps the one recorded'
        }
      }
    },
    answers:
      '`{ok, committed, files, head}`; 202 `FLEET_JOB_PENDING` when the host has not finished saving within about 10 seconds. Tracy keeps following that save: when it succeeds, the moment is recorded and the turn closed; when it fails because the site was busy, it is tried again (at most twice); when it fails for another reason, or never ends within a day, the turn stays open and later reads as not finished recording. Do not send it again; 400 `INVALID_TURN` for a malformed `turnId` · `INVALID_REPLY` for a `reply` without `turnId`, of another type or over 64 KiB, or with no valid `replyState` · `INVALID_END_REASON` for an `endReason` without `turnId` or not one of the kinds · `INVALID_WORK` for a `work` without `turnId` or not three whole counts'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/turn',
    summary: 'Open a chat turn on the site',
    description:
      'Called by the host’s dsh when a person’s message enters a chat turn, signed as that person (`x-tracy-actor`, checked against a live seat); `x-tracy-workspace-label` must name this site. Records who typed what and from where (chat panel or comment). For a new turn the host first saves any pending edits as made outside Tracy, so they never land in this turn’s moment, and marks the turn open so reading the site changes saves nothing until it stops. Calling again with the same `turnId` (a retry, or another message typed while the turn ran) saves nothing more. `unsealedStart` is true when that first save could not run or had not finished within about 12 seconds (what it saved is still listed when it finishes); `concurrent` when another conversation had a turn open on the site at the same time.',
    audience: ['dsh'],
    auth: 'session-or-actor',
    internal: true,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['turnId', 'title'],
      properties: {
        turnId: { type: 'string', description: '`<session id>:<turn number>`' },
        title: { type: 'string', description: 'What the person typed; trimmed to one line, 200 characters' },
        source: { type: 'string', enum: ['panel', 'comment'], description: 'Optional; default `panel`' },
        promptMessageId: { type: 'string', description: 'Optional; the chat message id' },
        rpcId: { type: 'string', description: 'Optional; the request id the message was sent with' },
        commentNs: {
          type: 'array',
          items: { type: 'integer' },
          description:
            'Optional; the comment numbers a turn sent from comments carries, so the Site changes list can link the comment. Anything but a short list of comment numbers is ignored'
        },
        steered: { type: 'boolean', description: 'Optional; true for a message typed while the turn ran' },
        waitsForMoments: {
          type: 'boolean',
          description:
            'Optional; true when the caller holds the turn’s first write until every moment named in `momentsPending` has ended (`POST /api/sites/:key/moment/wait`). Tracy then counts those moments as unable to hold this turn’s edits when it judges the turn’s start'
        }
      }
    },
    answers:
      '`{ok, turnId, concurrent, unsealedStart, undone, momentsPending}` — `momentsPending`: the earlier turns of the same conversation whose moment the host is still saving (their `POST /api/sites/:key/moment` answered 202); a write made before each has ended would be saved under that earlier turn; 400 `INVALID_TURN`/`INVALID_TITLE`; 409 `TURN_OF_ANOTHER_SITE`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/turn/undone',
    summary: 'Read the turns undone since the conversation’s last turn',
    description:
      'Called by the host’s dsh, signed as the person who typed (`x-tracy-actor`, checked against a live seat; `x-tracy-workspace-label` must name this site), when a conversation’s second or later turn starts. Answers the same `undone` list as `POST /api/sites/:key/turn` — the earlier turns of this conversation the person undid from the chat since its previous turn opened — at once: it opens no turn, saves nothing and runs nothing on the host, so the agent’s first step need not wait for the open’s save. Read-only.',
    audience: ['dsh'],
    auth: 'session-or-actor',
    internal: true,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['turnId'],
      properties: {
        turnId: { type: 'string', description: '`<session id>:<turn number>` of the turn starting' }
      }
    },
    answers:
      '`{ok, undone}` — `undone`: up to five `{turn, title, complete}`, newest first; empty on a first turn; 400 `INVALID_TURN`; 503 `UNDONE_UNREADABLE` when the list could not be read'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/turn/rating',
    summary: 'Keep a Good or Bad on the answer of one turn',
    description:
      'Called by the host’s dsh, signed as the person who typed that turn (`x-tracy-actor`, checked against a live seat; `x-tracy-workspace-label` must name this site), when the person rates Tracy’s answer in the chat. Kept beside the turn so answers can be measured with their turns: the rating and the categories it was filed under, never the note. `rating: null` takes a rating back.',
    audience: ['dsh'],
    auth: 'session-or-actor',
    internal: true,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['turnId', 'rating'],
      properties: {
        turnId: {
          type: 'string',
          description: '`<session id>:<turn number>` of the turn whose answer was rated'
        },
        rating: { type: 'string', description: '`positive`, `negative`, or null to take it back' },
        categories: { type: 'array', description: 'Up to ten category names, as dsh files them' }
      }
    },
    answers:
      '`{ok: true}`; 400 `INVALID_TURN`, `INVALID_RATING`, `INVALID_CATEGORIES`; 404 `TURN_UNKNOWN` when the turn is not this site’s'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/turn/check',
    summary: 'Keep the visual check’s verdict on one turn',
    description:
      'Called by the host’s dsh, signed as the person who typed that turn (`x-tracy-actor`, checked against a live seat; `x-tracy-workspace-label` must name this site), once its visual check of a turn has answered: the page drawn again after the turn and compared with the picture from before it. Kept beside the turn so usage can say how often a change was seen. A turn checked twice keeps the latest verdict.',
    audience: ['dsh'],
    auth: 'session-or-actor',
    internal: true,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['turnId', 'visual'],
      properties: {
        turnId: { type: 'string', description: '`<session id>:<turn number>` of the turn checked' },
        visual: {
          type: 'string',
          enum: ['shown', 'not_shown', 'broken', 'cannot_tell', 'skipped'],
          description: 'The verdict; `skipped` when no verdict was reached'
        },
        note: {
          type: 'string',
          description:
            'Optional: why a check was skipped, as a short code (`no-write`, `no-image-model`, `capture-TIMEOUT`…) — a lowercase letter, then up to 47 letters, digits, `_` or `-`'
        }
      }
    },
    answers:
      '`{ok: true}`; 400 `INVALID_TURN`, `INVALID_VISUAL`, `INVALID_NOTE`; 404 `TURN_UNKNOWN` when the turn is not this site’s'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/moment/wait',
    summary: 'Wait for an earlier turn’s moment to be saved',
    description:
      'Called by the host’s dsh, signed as the person who typed (`x-tracy-actor`, checked against a live seat; `x-tracy-workspace-label` must name this site), while it holds a turn’s first write behind an earlier turn whose moment the host is still saving (`momentsPending` of `POST /api/sites/:key/turn`). Waits up to about 10 seconds, asking the host itself, and answers `ended: true` as soon as no moment of that turn is being saved any more — the moment is then recorded and the turn closed. With `release: true` the caller says the write goes now without waiting further: if the moment is still being saved, Tracy records that, and should it save any files, both turns are marked so that an undo which would split them is refused.',
    audience: ['dsh'],
    auth: 'session-or-actor',
    internal: true,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['turnId'],
      properties: {
        turnId: { type: 'string', description: 'The earlier turn, `<session id>:<turn number>`' },
        release: {
          type: 'boolean',
          description: 'Optional; true when the caller stops waiting and lets the write go now'
        }
      }
    },
    answers:
      '`{ok, ended}`, with `released: true` when `release` let the write go before the moment was saved; 400 `INVALID_TURN`; 429 `RATE_LIMITED`'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/moments/:sha/files',
    summary: 'List the files one moment changed',
    description:
      'Returns the files a single moment in the site history touched, with their status and the lines added and removed, read on the host. The Site changes tab asks for it when a moment row opens. At most 500 files are listed; `truncated` is true when the moment touched more. A file the history no longer records (a CMS cache, such as compiled CSS, that an older moment still holds) carries `excluded: true`. Requires a seat on the site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key', sha: 'Moment id (commit hash), 7–64 hex characters' } },
    answers:
      '`{sha, files: [{path, status, additions, deletions, zone, excluded?}], truncated}`; 202 `FLEET_JOB_PENDING` while the host is still at it'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/moments/:sha/undo-scope',
    summary: 'Count the files an undo of one moment would revert',
    description:
      'Returns how many files an `undo` of this moment would revert, read on the host from the same list the undo itself walks: every file of that moment, including files the history no longer shows (a CMS cache) and past the 500 the files list stops at. `complete` is false when the host could only count the first 500; `truncatedList` is true when the files list of this moment is cut. Read-only: the undo checks for conflicts again when it runs. Requires a seat on the site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key', sha: 'Moment id (commit hash), 7–64 hex characters' } },
    answers:
      '`{files, complete, truncatedList}`; 202 `FLEET_JOB_PENDING` while the host is still at it; 400 `INVALID_SHA`'
  },
  // src/sites/cms-log.js
  {
    method: 'GET',
    path: '/api/sites/:key/cms-log',
    summary: 'List edits made in the CMS admin, outside Tracy',
    description:
      'Returns the edits people made in the site’s own CMS admin (WordPress, Joomla, EmDash), newest first: the CMS user, the resource, the operation and the time the CMS recorded. Read from the CMS’s own admin log, pulled every few minutes while someone works on the site; Tracy’s own writes are not listed. Never returns field values. `coverage.cmsLog` says whether the CMS is keeping that log, and `limits` what it does not record (EmDash: menus, settings and media). Requires a seat on the site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: { key: 'Site key' },
      query: { cursor: 'Optional; `nextCursor` of the previous page', limit: 'Optional; 1–100, default 30' }
    },
    answers:
      '`{items: [{kind: "outside-cms", id, at, cms, cmsActor: {name, id} | null, resource: {type, id, title}, op}], nextCursor, coverage: {cmsLog: {source, limits, enabled, reason, lastPulledAt, lastError} | null}}`'
  },
  // src/sites/cms-log.js
  {
    method: 'POST',
    path: '/api/sites/:key/cms-log/pull',
    summary: 'Read the CMS admin log now',
    description:
      'Reads the site’s CMS admin log on the host right away instead of waiting for the next scheduled read, and stores any new edits. Requires a seat on the site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers:
      '`{pulled, cursor, enabled}` (`reason` when the log is off); 502 `CMS_LOG_PULL_FAILED` when the host could not read it'
  },
  // src/sites/activity.js
  {
    method: 'GET',
    path: '/api/sites/:key/activity',
    summary: 'List the site’s changes, one row per chat turn',
    description:
      'The Site changes list, newest first: each chat turn that changed the site (who typed it, the words, the chat panel or a comment, the files changed and the content written in that turn), with changes made outside Tracy in between (files changed outside Tracy, including a Tracy deploy, and edits made in the CMS admin). A turn that changed nothing, and a turn still running, are not listed. Content writes name the action, the outcome and the field names they touched, never the values. `counts` are counted over the whole list, whatever the filter or page; `counts.chat` counts chat turns only, so an undo or reset made from the tab is in `all` but not in `chat`. `undo.reason` is `forbidden` on every row when the caller’s role may not change files. `coverage` says whether the site’s file history was read and whether it stopped at its cap, whether the site keeps a file history at all (`fileHistory`, false on EmDash), since when chat turns are recorded on this site, and whether the CMS admin log is kept and what it does not record (`cmsLog.limits`). With `version=2`, a chat or comment turn carries `conversation` — `{sessionId, turn, promptMessageId, mine}`, the chat it came from and whether the caller typed it — and every other event `conversation: null`; likewise `reply` — `{text, state}`, Tracy’s answer as the turn’s close kept it (`state` `full`, `truncated` or `interrupted`), null for a turn recorded before answers were kept and for every other event. Likewise `undone` — `{at, complete}` when the chat-turn undo (`POST /api/sites/{key}/turns/undo`) took the turn back (`complete` false when only part of it went back; such a turn offers no further undo), null when it never did and for every other event. A comment turn’s `comment` names its request (`n`, `url`), the comment it came from (`id`, null when none) and whether that comment was deleted since (`deleted` — `url` and `author` stay, as history). With `version=2` the answer also says when it was read (`readAt`, the server’s clock) where the caller’s Site changes watermark stood before this read (`seenBefore`, null until the badge was first asked for them — see `GET /api/sites/{key}/activity/unseen`), and the badge’s number for the caller at that moment (`unseenCount`, the same count that door answers; null while `seenBefore` is null), and every event says when Tracy recorded it (`recordedAt`: a turn when it closed, writes at their last one, a seal when the row was written, a CMS edit when the collector pulled it, an undo or restore when it finished; null for a Git moment no row records). Reading never moves the watermark: the client does, with `PUT /api/sites/{key}/activity/seen`, once it has drawn the list. Every person a row names (V1 `by`; with `version=2` every actor, executor, `reversal.undoneBy` and comment `author` of `type: "person"`) carries `face` — `{initial, color, avatarUrl}`, the one the Team tab draws for the same Tracy account — or `face: null` when no Tracy account holds that address (a Git identity from outside Tracy, a CMS account). Requires a seat on the site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: { key: 'Site key' },
      query: {
        cursor:
          'Optional; `nextCursor` of the previous page. A V2 cursor carries the version and the filter it was cut for, and is refused with the other one',
        limit: 'Optional; 1–100, default 30',
        filter:
          'Optional; `all` (default), `chat` or `outside`. With `version=2`: `all`, `people` (every Source except `automatic`: the changes people made, themselves or through Tracy) or one Source — `chat`, `comment`, `design-system`, `setup`, `api`, `cms-admin`, `automatic`, `deployment`, `site-changes`, `unknown`. `design-system` is a press in the site’s Design system tab (apply or undo) by the person themselves. `setup` is Tracy writing a new site’s words and pictures from the brief its person sent (one row per run). `api` is a write made with one of the person’s seat keys through `/v1`; a revert made there is a row of its own. `cms-admin` is a change the CMS’s own log records under a signed-in CMS account, whether made in its admin screen or through its API (the log does not say which); a CMS change with no account is `unknown`. `deployment` is Tracy updating its own parts of the site: a Tracy deploy, or Tracy’s Cowork package updating itself (files changed outside Tracy that are all the package’s own, one of its manifests among them; any other file in the same change keeps it `unknown`)',
        version:
          'Optional; `2` answers Site changes V2: one event per recorded change with its Source (how the change was made), who made or asked for it, and what it touched. Any other value, or none, answers the list above unchanged — a V2 client probes with `version=2&filter=all` and reads `schemaVersion` back, since an older server ignores this parameter'
      }
    },
    answers:
      '`{items: [{kind: "chat" | "unknown" | "legacy" | "outside-files" | "outside-cms", id, at, by?: {kind?: "person", name, email, face: {initial, color, avatarUrl} | null} | {kind: "agent"} | null, …, undo: {allowed, reason?}}], nextCursor, counts: {all, chat, outside}, coverage: {git, gitTruncated, since, fileHistory, cmsLog: {source, limits, enabled, reason, lastPulledAt, lastError} | null}}`; with `version=2` instead `{schemaVersion: 2, items: [{id, kind, origin: {source, …}, actor: {type, id?, name?, role, face?}, description, occurredAt | detectedAt, recordedAt, effects, request, reversal, undone, capabilities, evidence, conversation, reply}], nextCursor, readAt, seenBefore, unseenCount, counts: {all, …one per Source, complete, reasons}, coverage}`; 202 `FLEET_JOB_PENDING` while the host prepares the site’s history for the first time; 400 `INVALID_CURSOR` (with `reason` under `version=2`) · `INVALID_LIMIT` · `INVALID_FILTER`'
  },
  // src/sites/activity.js
  {
    method: 'GET',
    path: '/api/sites/:key/activity/unseen',
    summary: 'Count the site’s changes the caller has not looked at',
    description:
      'The number on the start screen’s Site changes card: how many events of the Site changes list were recorded after the caller last looked at the list and are not the caller’s own work through Tracy. Counted over the same events as `GET /api/sites/{key}/activity?version=2`, by the moment Tracy recorded each one (`recordedAt`), not by when it happened: a CMS edit the collector pulls minutes later and a change sealed after the caller looked still count. Counted: chat and comment turns by other seats, edits made under a CMS account (the caller’s own CMS account included — a CMS account is never matched to a Tracy seat), undo and restore pressed by other seats, changes whose origin is unknown, Tracy deploys of its own plugin, and automatic changes to the site’s SOFTWARE (a plugin, theme, core or Joomla extension part installed, updated or removed by cron or a self-update). Not counted: automatic content changes (posts a cron publishes, a catalogue sync, housekeeping) and the caller’s own turns and presses. Software rows of one CMS log and one account (or none) that follow each other within two seconds — one upgrade run, one extension install — count as one; content edits never group. The watermark is the caller’s, per site, kept on the server; the first ask for a site writes it at now and answers 0 — nobody is told they missed a site’s whole history. Reads Postgres only (never the site’s file history), so it is cheap to ask on every return to the start screen. When the site’s CMS admin log was last read more than a minute ago, the ask also starts a fresh read of it on the host without waiting for it — the next ask sees what that read stored — at most once a minute per site. Requires a seat on the site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers:
      '`{count, since, readAt, complete, pulling}` — `since` the watermark the count is measured from, `readAt` the server’s clock at this ask, `complete` false while the CMS admin log collector is in error (the count is then a floor), `pulling` true when this ask just started a fresh read of the CMS admin log (ask again in a few seconds to see what it stored)'
  },
  // src/sites/activity.js
  {
    method: 'PUT',
    path: '/api/sites/:key/activity/seen',
    summary: 'Mark the site’s changes seen up to a moment',
    description:
      'Moves the caller’s Site changes watermark forward to `readAt` — the `readAt` of a `GET /api/sites/{key}/activity?version=2` answer the client has drawn — so the badge of `GET /api/sites/{key}/activity/unseen` falls to 0 for what that list showed. Never moves it backwards (a second tab drawing an older page cannot make seen changes new again), and refuses a time ahead of the server’s clock by more than a minute. Only the caller’s own watermark; nothing on the site changes. Requires a seat on the site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['readAt'],
      properties: {
        readAt: {
          type: 'string',
          description: 'When the list was read (`readAt` of the V2 answer), ISO 8601'
        }
      }
    },
    answers:
      '`{seenAt}` — the watermark after; 400 `INVALID_READ_AT` for a time that cannot be read or is in the future'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/file-diff',
    summary: 'Show the diff of one site file',
    description:
      'Returns the diff of one file in the site since the last backup, read on the host. A configuration file that holds secrets (`wp-config.php`, `configuration.php`, `.env` and their copies) is named but its contents are never returned: the answer is `{path, blocked: true, reason}`. Requires a seat on the site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: { key: 'Site key' },
      query: {
        path: 'File path relative to the site root: no `..`, no wildcards, no leading `/` or `:`',
        sha: 'Optional; a moment id (7–64 hex). The diff of the file in that moment only, instead of since the last backup'
      }
    },
    answers:
      '`{path, diff, truncated, sha?}`; 400 `INVALID_SHA`; for a configuration file `{path, blocked: true, reason: "configuration-file"}`; 400 `INVALID_PATH`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/restore',
    summary: 'Restore the site files to an earlier point',
    description:
      'Rolls the site files back to a commit: `undo` reverts that change, `reset` returns the files to that point. Logged in the audit trail. Requires a seat whose role may change files on the site (the `code` toolset: owner and editor; never a viewer); any other seat gets 403 `FORBIDDEN_WRITE`. `undo` takes only a moment a chat turn made, and only while every file of it is still as that moment left it; otherwise nothing is written and the answer is 409 `NOT_UNDOABLE`, or 409 `CONFLICT` with the files that changed since. Every press is recorded as an operation: `status` is `succeeded` once the new commit is verified, `succeeded_noop` when the host had nothing to change, `failed` when it refused, and `unknown` when the answer was lost (for example a timeout) — the host may have finished, and the operation is settled later from the job. Send the same `idemKey` to retry a press: the answer is that operation as it stands, and the restore never runs twice. `everything` returns the files AND the database to backup `version` — everything saved on the site after that backup is deleted — so it asks more: the `site` toolset (owner and editor; else 403 `FORBIDDEN_WRITE`), `confirm` holding the word `restore`, any case (400 `CONFIRM_REQUIRED` · `CONFIRM_MISMATCH`), and a backup whose `database.state` is `full` (409 `{code: "BACKUP_NOT_FULL", version, database}`; 404 `BACKUP_UNKNOWN` for no such backup). The host saves a “before restore” backup first. Its operation succeeds only once the host has shown both the database it loaded and the restore commit; a refusal by the host is 409 `{code: "RESTORE_REFUSED", reason}`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['mode'],
      properties: {
        sha: {
          type: 'string',
          description: 'Required for `undo` and `reset`; commit hash, 7–64 hex characters'
        },
        mode: { type: 'string', enum: ['undo', 'reset', 'everything'] },
        version: {
          type: 'integer',
          minimum: 1,
          description: 'Required for `everything`: the backup to return to (its `version` in `/backups`)'
        },
        confirm: {
          type: 'string',
          description:
            'Required for `everything`: the word `restore` (any case), as the person typed it to confirm'
        },
        idemKey: {
          type: 'string',
          description:
            'Optional; 8–128 characters of letters, digits and `._:-`, made by the client for one press. A retry with the same key answers the same operation'
        }
      }
    },
    answers:
      '`{ok, files, head, operationId, status}` (`everything` adds `version`); 202 `{code: "OPERATION_PENDING" | "OPERATION_UNKNOWN", operationId, status}` for a retry or an `everything` press not settled yet; 400 `INVALID_IDEM_KEY` · `INVALID_VERSION` · `CONFIRM_REQUIRED` · `CONFIRM_MISMATCH`; 404 `BACKUP_UNKNOWN`; 409 `BACKUP_NOT_FULL` · `RESTORE_REFUSED`; 403 `{code: "FORBIDDEN_WRITE", toolset, role}`; 409 `{code: "CONFLICT", files, operationId, status}` or `{code: "NOT_UNDOABLE", operationId, status}`; 409 `IDEMPOTENCY_KEY_REUSED` when the key was used for another press; 502 `{code: "FLEET_JOB_FAILED", reason, operationId, status}`'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/press',
    summary: 'Resume a build form that was closed before the build started',
    description:
      'Hands back the build form answers the caller pressed for this site, only while that build has not started, so the form can resume without asking again. Requires a seat on the site.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers: '`{press, jobId, state}`, or `{press: null}`'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/applies',
    summary: 'List the changes one chat session made to the site',
    description:
      'Lists the Apply calls made in a chat session, so an interrupted chat can say what was already changed and offer to undo it. Owners and editors see every caller’s calls in that session, viewers only their own. Accepts a browser session or a signed `x-tracy-actor` header.',
    audience: ['customer', 'dsh'],
    auth: 'session-or-actor',
    internal: false,
    params: {
      path: { key: 'Site key' },
      query: { session: 'Chat session id (required)', since: 'Optional ISO time; only calls after it' }
    },
    answers: '`{applies, applyIds}` — `applyIds` are the successful changes, in the order applied'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/turns',
    summary: 'List the turns of one chat session and whether each can be undone',
    description:
      'Lists every turn of a chat session on this site, oldest first: the files its moments changed (with their zones) and the content it wrote through the Apply door, and whether it can be undone now. `undo.latest` marks the newest turn that still has changes on the site; an older turn can be undone only together with every newer one. A blocked turn names why (`reasons`, most important first): a turn open on the site, an EmDash site, a missing toolset, a restore, a content or file change made after it, a change that was not recorded, or a newer turn that is blocked. Owners and editors see every caller’s turns in that session, viewers only their own. Accepts a browser session or a signed `x-tracy-actor` header.',
    audience: ['customer', 'dsh'],
    auth: 'session-or-actor',
    internal: false,
    params: {
      path: { key: 'Site key' },
      query: { session: 'Chat session id (required)' }
    },
    answers:
      '`{cms, siteBusy, filesChecked, turns: [{turnId, turn, title, openedAt, closedAt, changed, files: {count, commits, zones}, content: [{applyId, action, target, at}], undo: {state, latest, reasons, needs}}], designSystem: {applyId, id, name, previous, at, by, undone, canUndo} | null}` — `designSystem` is the site’s newest design system apply (any chat, any caller), undone through `POST /api/sites/:key/design-system/undo`; 202 `FLEET_JOB_PENDING`; 400 `INVALID_REQUEST`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/turns/undo',
    summary: 'Undo a chat turn, or go back to before it',
    description:
      'Undoes the latest turn of a chat session (`scope: "turn"`), or every turn from the newest back to the named one (`scope: "from-here"`). Everything is checked again before anything is written; a blocked turn is refused with its reasons. Newest first: each turn’s files (one undo per moment, recorded like an undo on the Site changes tab), then its content (one `apply.revert` per change). Stops at the first step that did not succeed. `idemKey` makes a retried press answer the first one. Needs the `code` toolset when files are undone and `content` when content is; a viewer seat, which holds no toolset, gets 403 `FORBIDDEN_WRITE` before anything is read.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers:
      '`{ok, complete, turns: [{turnId, files: {status, code?, operationIds}, content: {reverted, failed, unsure}}]}`; 400 `INVALID_REQUEST`; 403 `FORBIDDEN_WRITE`; 404 `TURN_UNKNOWN`; 409 `BLOCKED` · `NOT_LATEST` · `NOTHING_TO_UNDO` · `SITE_BUSY` · `IDEMPOTENCY_KEY_REUSED`'
  },
  // src/sites/design-system.js
  {
    method: 'GET',
    path: '/api/sites/:key/design-system',
    summary: 'Read the design system the site wears, and whether one can be applied',
    description:
      'What the Design system tab shows: the design system the running site wears now, read from the site itself (`worn`: `{id, slotId, name}`, `id` null for a system that is not in the library, or `worn: null` for the template’s own look), the template it runs (`template`), the thumbnail of the template the site was built from (`templateImage`: the card picture the Templates list shows, or null), whether the preview offers Light and Dark (`modes`: the template’s design-system contract wears both sides of its light/dark switch) and whether that template can wear a system (`supported`, else `reason`: `TEMPLATE_HAS_NO_SLOT`, `TEMPLATE_NOT_READY`, `NO_TEMPLATE`, `PLATFORM_HAS_NO_SLOT`, `TEMPLATE_NEEDS_UPDATE` — the site runs an older release than the one its template’s design-system contract was measured on, with `version: {need, have}` — `TEMPLATE_VERSION_UNCHECKED` — the site runs a newer release than the last one confirmed to wear a system, with `version: {need: null, have, upTo}` — or `TEMPLATE_VERSION_UNKNOWN`), whether the caller may apply one (`canApply`; a viewer may not), the newest apply on the site (`last`, with `undone`), and the library ids the quality gate refuses (`refused`: never offered). The library is the Refero design systems that pass the quality gate (`GET /api/design-system/library`); a site still wearing a system that is no longer offered reads its name. Customers may wear a design system only on a template whose Design system check on /ops is ready for every release customers can build (no must-fix, no worth-fixing, nothing not measured; a release never checked is locked); for any other template a customer reads `supported: false`, `reason: TEMPLATE_NOT_READY` and `locked: true`, while `worn` and `last` still say what the site wears (nothing is taken off, and undo stays open); Tracy staff read the template as its contract says. A newly claimed fleet site with neither an attachment nor a provisioned address reads `supported: false`, `canApply: false`, `reason: SITE_NOT_READY` and null `worn`/`last`, without reading a container or the library; the panel opens its existing Build tab. A site imported into Tracy (not created from a Tracy template) cannot wear a design system, for staff too: it reads `supported: false`, `reason: SITE_IMPORTED`, `imported: true` and `locked: true`, with `worn: null` and the site not read. Any seat on the site may read it.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers:
      '`{platform, canApply, cannotApply?, refused, worn, template, templateImage, modes, supported, reason?, locked?, last: {applyId, id, name, previous, at, by, undone} | null}`; 404 `SITE_UNKNOWN`; 502 `DS_READ_FAILED`'
  },
  // src/sites/design-system.js
  {
    method: 'GET',
    path: '/api/design-system/library',
    summary: 'List the design systems the Design system panel and Add site offer',
    description:
      'Every design system the Design system tab and Add site offer: the Refero systems that pass the quality gate (`id` `refero:<uuid>`, with a screenshot address and the `theme` it was drawn in). OpenDesign systems are no longer offered (12/10/2026). Each row says whether the quality gate lets a site wear it (`ok`), which fonts the slot substitutes because the source names a family that is not on Google Fonts, and its palette (`colors`: the hex values of the system’s own accent, background, text, surface and muted colours, accent first, each once; empty when the system names none). Any signed-in seat may read it.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers:
      '`{systems: [{id, kind: "refero", name, description, group, theme, image, fonts: [{use, for}], colors: [hex], ok}]}`; 401 `NOT_SIGNED_IN`'
  },
  // src/sites/design-system.js
  {
    method: 'GET',
    path: '/api/design-system/library/refero/:uuid/screenshot.jpg',
    summary: 'Read the screenshot of a curated Refero design system',
    description:
      'The picture the library shows for one offered Refero system: a 480-px WebP thumbnail (`image/webp`; the address keeps its `.jpg` name so cards already drawn still load). Any other uuid answers 404.',
    audience: ['customer'],
    auth: 'none',
    internal: false,
    params: { path: { uuid: 'Refero system uuid' } },
    answers: 'image/webp; 404 `NOT_FOUND`'
  },
  // src/sites/design-system.js
  {
    method: 'GET',
    path: '/api/design-system/support',
    summary: 'Say whether a new site from a quickstart can wear a design system',
    description:
      'Whether a site built now from the newest release of quickstart `quickstart` on `platform` can wear a design system: its template has a ready slot contract and that release is one the contract was measured on. An unknown quickstart answers `supported: false` with `TEMPLATE_NOT_READY`. Customers may wear a design system only on a template whose Design system check on /ops is ready for every release customers can build (no must-fix, no worth-fixing, nothing not measured; a release never checked is locked); for any other template a customer is answered `supported: false`, `reason: TEMPLATE_NOT_READY`, `locked: true`; Tracy staff are answered as the contract says. Any signed-in seat may read it.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { query: { quickstart: 'Quickstart tag', platform: 'joomla, wordpress or emdash' } },
    answers: '`{supported, reason, need, have, locked?}`; 401 `NOT_SIGNED_IN`'
  },
  // src/sites/design-system-preview.js
  {
    method: 'GET',
    path: '/api/design-system/preview',
    summary: 'Preview a design system on a quickstart’s demo',
    description:
      "The home page of the live demo of quickstart `quickstart`, wearing design system `id` (a library id): the page as the demo serves it, with the bytes applying that system writes laid last in its head and a `<base href>` at the demo’s public address, as `text/html` (no script, no form; see below). Nothing is written to the demo, and only the demo the server knows for that quickstart is read. On WordPress, which prints a design system into its global styles instead of serving the file applying writes, the page’s global styles are the ones WordPress prints once that system is applied. The platform is the demo’s own, as the server recorded it when the demo was built: `platform` is only a hint, and a value that differs from the demo’s is ignored. Kept a few minutes per quickstart, demo deploy (release, its checksum and port), system and page. With `path` (a path of the same site, such as `/about` or `/index.php?option=com_content&Itemid=105`: it must start with one `/` and name no host, no scheme, no backslash, no `.`/`..` segment and no escaped slash, at most 512 characters) the door answers that page instead, wearing the same system: every link of a served page to the same site points back at this door with its own `path`, so the preview can be browsed page by page; a link to another host opens a new tab. Redirects are followed only within the same site. With `path`, every refusal is a small `text/html` page with the same status (the preview frame shows it); a page the site has not got is 404 with `reason` `PAGE_NOT_FOUND`, a file that is not a page or a link that leaves the site 409 `NOT_A_PAGE` or `LEAVES_SITE`, an invalid `path` 400 `INVALID_REQUEST` `reason` `PATH`. Answers carry `Content-Security-Policy: sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox; frame-ancestors 'self'`: no script, no form. A quickstart with no live demo, a demo whose platform is not recorded or whose release cannot wear a system, or a demo that does not answer are 409 `DS_PREVIEW_UNAVAILABLE` with `reason` `NO_DEMO`, `NO_SLOT` or `DEMO_UNREADABLE`. Customers may wear a design system only on a template whose Design system check on /ops is ready for every release customers can build (no must-fix, no worth-fixing, nothing not measured; a release never checked is locked); for any other template a customer is answered 403 `DS_TEMPLATE_LOCKED` and the demo is not read; Tracy staff get the page. Any signed-in seat may read it. Thirty previews a minute per signed-in account, this door and `GET /api/sites/{key}/design-system/preview` together, every request counted: past that, 429 `RATE_LIMITED` with `Retry-After` (seconds until the next minute). With `live=1` (what the Add site preview popup asks since 18/10/2026) the same checks run, nothing is read, and the answer is JSON `{live: true, src, mode, modes}`: `src` is the demo’s home page at its own address with a `tracy_ds_preview` ticket, signed by this server for the demo, this system and the contract it was judged on, valid one hour; framed, the demo’s address serves the real page, scripts running, with the same bytes laid in (see the site address door). `mode` is `light`, `dark` or null, the side the system opens on; `modes` is true when the template’s contract wears both sides of its light/dark switch. A demo on another host than this server’s (its address is served by that host, not by this server’s site proxy) is answered the static page instead, as without `live=1`.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      query: {
        quickstart: 'Quickstart tag',
        platform: 'Optional hint: joomla, wordpress or emdash; the demo’s own platform decides',
        id: 'Design system id from the library (`refero:<uuid>` or `od:<id>`)',
        path: 'Optional; a path of the demo (the home page when absent), asked by a link inside a served preview',
        live: 'Optional; `1` answers the live frame `{live, src, mode, modes}` instead of the page'
      }
    },
    answers:
      '`text/html`, or with `live=1` JSON `{live: true, src, mode, modes}`; 400 `INVALID_REQUEST`, `DS_UNKNOWN`, `DS_REFUSED`; 401 `NOT_SIGNED_IN`; 403 `DS_TEMPLATE_LOCKED`; 404 `DS_PREVIEW_UNAVAILABLE` `PAGE_NOT_FOUND` (with `path`); 409 `DS_PREVIEW_UNAVAILABLE` `{code, reason}`; 429 `RATE_LIMITED` with `Retry-After`; with `path`, every refusal is `text/html`'
  },
  // src/sites/design-system-preview-assets.js
  {
    method: 'GET',
    path: '/api/design-system/preview-asset',
    summary: 'Read one stylesheet or font of a quickstart’s demo for its preview',
    description:
      'One stylesheet or web font of the live demo of quickstart `quickstart`, served through Tracy’s own origin so the frame of `GET /api/design-system/preview` (an `srcdoc` frame, whose origin is Tracy’s) can load the demo’s fonts: a demo sends no `Access-Control-Allow-Origin`, and a font is a CORS fetch. The preview page points its own stylesheets at this door; inside a stylesheet it serves, every font of the demo points at this door too, and every other relative address (a picture, a cursor) is made absolute at the demo’s public address. Only the demo the server knows for that quickstart is read, on its web container: the request names a tag and a path, never a host. Only `.css`, `.woff2`, `.woff`, `.ttf`, `.otf` and `.eot`, at most 3 MB each; nothing is written. Redirects are not followed. Kept in memory ten minutes per demo deploy (release, its checksum and port) and path; answers carry `Cache-Control: private, max-age=600` and `X-Content-Type-Options: nosniff`, refusals `no-store`. Any signed-in seat may read it.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      query: {
        quickstart: 'Quickstart tag',
        path: 'A path of the demo naming a stylesheet or a font (same rules as the preview door’s `path`)'
      }
    },
    answers:
      'The file, as `text/css` or its font type; 400 `INVALID_REQUEST` (`reason` `NOT_AN_ASSET` for any other kind of file); 401 `NOT_SIGNED_IN`; 404 `NOT_FOUND` (no live demo, or the demo has not got the file); 502 `DEMO_UNREADABLE`, `TOO_LARGE`'
  },
  // src/sites/design-system-site-preview-assets.js
  {
    method: 'GET',
    path: '/api/sites/:key/design-system/preview-asset',
    summary: 'Read one stylesheet or font of the running site for its design system preview',
    description:
      'One stylesheet or web font of the running site, read on its own web container (never an address the request names) and served through Tracy’s own origin, so the frame of `GET /api/sites/{key}/design-system/preview` (an `srcdoc` frame, whose origin is Tracy’s) can load the site’s fonts: a site sends no `Access-Control-Allow-Origin`, and a font is a CORS fetch, so its icon fonts were refused and icons drew as empty squares. The preview points every stylesheet of the site itself here; a stylesheet answered here has its font addresses pointed here too and every other relative address made absolute at the site’s address. Only stylesheets and font files, at most 3 MB each. Kept up to a minute per site, release and path. Nothing is written. Any seat on the site may read it.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: { key: 'Site key' },
      query: {
        path: 'A path of the site naming a stylesheet or a font (same rules as the preview door’s `path`)'
      }
    },
    answers:
      'The file, as `text/css` or its font type; 400 `INVALID_REQUEST` (an invalid path, or any other kind of file); 401 `NOT_SIGNED_IN`; 404 `SITE_UNKNOWN`, `NOT_FOUND`, `DEMO_UNREADABLE` (the site has not got the file); 502 `DEMO_UNREADABLE`, `TOO_LARGE`'
  },
  // src/sites/design-system.js
  {
    method: 'GET',
    path: '/api/sites/:key/design-system/words',
    summary: 'Read the site’s own words for the design system previews',
    description:
      'The words the Design system panel draws its cards and preview in, read off the home page the running site serves now: its name, menu, the line above the first heading, the first heading, the paragraph that follows it (or the page’s description) and its first two calls to action — never a language picker, a light/dark switch or a menu control. Nothing is written or invented: a page that could not be read, or that says none of these, answers `{present: false}` and the panel shows each design system’s own sample text. A page that was read is kept two minutes per site. Any seat on the site may read it.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers:
      '`{present: true, source: "home", site: {name, nav, eyebrow, headline, sub, cta, cta2}}` (each word a string or null, `nav` a list) or `{present: false}`; 404 `SITE_UNKNOWN`'
  },
  // src/sites/design-system.js
  {
    method: 'GET',
    path: '/api/sites/:key/design-system/preview',
    summary: 'Preview a design system on the running site',
    description:
      "The home page the running site serves now, wearing design system `id` (a library id), for the preview popup of a Design system card: read on the site’s own web container (never an address the request names), the design system the site wears taken off, and the bytes applying `id` to this site would write laid last in its head (on WordPress, the global styles WordPress prints once `id` is applied), with a `<base href>` at the site’s address, as `text/html` (no script, no form; see below). Nothing is written to the site. `template` is the `template` that `GET /api/sites/{key}/design-system` answered: the template’s contract is judged from it as an apply judges it; without it the site is read once in its container. Kept up to a minute per site, release, newest apply, system and page; an apply or undo of the site forgets it at once. A platform with no design system slot and a template that cannot wear a system are 409 `DS_PREVIEW_UNAVAILABLE` with `reason` `PLATFORM` or `NO_SLOT`; a page that could not be read is 502 `DS_PREVIEW_FAILED`. With `path` (a path of the same site, such as `/about` or `/index.php?option=com_content&Itemid=105`: it must start with one `/` and name no host, no scheme, no backslash, no `.`/`..` segment and no escaped slash, at most 512 characters) the door answers that page instead, wearing the same system: every link of a served page to the same site points back at this door with its own `path`, so the preview can be browsed page by page; a link to another host opens a new tab. Redirects are followed only within the same site. With `path`, every refusal is a small `text/html` page with the same status (the preview frame shows it); a page the site has not got is 404 `DS_PREVIEW_FAILED` with `reason` `PAGE_NOT_FOUND`, a file that is not a page or a link that leaves the site 409 `NOT_A_PAGE` or `LEAVES_SITE`, an invalid `path` 400 `INVALID_REQUEST` `reason` `PATH`. Answers carry `Content-Security-Policy: sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox; frame-ancestors 'self'`: no script, no form. Any seat on the site may read it, a viewer too. Thirty previews a minute per signed-in account, this door and `GET /api/design-system/preview` together, every request counted: past that, 429 `RATE_LIMITED` with `Retry-After` (seconds until the next minute). With `live=1` (what the preview popup asks since 17/10/2026) the same checks run, nothing is read, and the answer is JSON `{live: true, src, mode}`: `src` is the site’s home page at its own address with a `tracy_ds_preview` ticket, signed by this server for this site, this system and the contract it was judged on, valid one hour; framed, the site address serves the real page, scripts running, with the same bytes laid in (see the site address door). `mode` is `light`, `dark` or null, the side the system opens on. A WordPress site that wears a system asked `template-default` with `live=1` is 409 `NO_BARE`.",
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: { key: 'Site key' },
      query: {
        id: 'Design system id from the library (`refero:<uuid>`), or `template-default` for the site’s page wearing no design system (the template’s own look; a WordPress site that wears one answers 409 `DS_PREVIEW_UNAVAILABLE` `NO_BARE`)',
        template: 'Optional; the `template` the design-system read answered',
        path: 'Optional; a path of the site (the home page when absent), asked by a link inside a served preview',
        live: 'Optional; `1` answers the live frame `{live, src, mode}` instead of the page'
      }
    },
    answers:
      '`text/html`, or with `live=1` JSON `{live: true, src, mode}`; 400 `INVALID_REQUEST`, `DS_UNKNOWN`, `DS_REFUSED`; 403 `DS_TEMPLATE_LOCKED` (a template customers may not wear a design system on; `template-default` still answers) · `DS_IMPORTED_SITE` (a site imported into Tracy, for staff too; `template-default` still answers); 404 `SITE_UNKNOWN`, or `DS_PREVIEW_FAILED` `PAGE_NOT_FOUND` (with `path`); 409 `DS_PREVIEW_UNAVAILABLE` `{code, reason}`; 429 `RATE_LIMITED` with `Retry-After`; 502 `DS_PREVIEW_FAILED` `{code, reason}`; with `path`, every refusal is `text/html`'
  },
  // src/sites/design-system.js
  {
    method: 'POST',
    path: '/api/sites/:key/design-system',
    summary: 'Apply a design system to the running site',
    description:
      'Puts design system `id` (a library id, `refero:<uuid>`; since 12/10/2026 any other id, an OpenDesign one included, is 400 `DS_UNKNOWN`) on the running site, with no chat turn and no rebuild: on EmDash the template’s design-system sheet, on WordPress a style variation the theme wears, on Joomla one site module every page carries. `id: "template-default"` takes the worn system off instead, back to the template’s own look (allowed on a template customers may not put a new design system on; 409 `DS_NOTHING_WORN` when nothing is worn, and on WordPress 409 `DS_NO_TEMPLATE_LOOK` when the site’s look from before its first design system was never kept). What the site held before is kept on its host, so `POST /api/sites/{key}/design-system/undo` can put it back. Takes the site’s write lease (409 `SITE_BUSY` while a chat is writing), and is recorded in Site changes. `seen` says whether the first page load after the write carried the system (null when the page could not be read, or not within 1.5 s: the answer never waits longer for a page). Needs the `code` toolset (owner, editor); a viewer gets 403 `TOOLSET_NOT_GRANTED` before anything is read. A call from a conversation (the agent’s `tracy_design_system`: the lane’s actor assertion, or any call carrying `x-tracy-session`) is the chat route, refused with 403 `CHAT_DESIGN_SYSTEM_OFF` and the sentence the agent says instead while the operator keeps the `chat-design-system` switch off (its default), and with 503 `UI_SETTING_UNREADABLE` when the switch cannot be read; the Design system tab’s own press is never governed by it.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['id'],
      properties: {
        id: {
          type: 'string',
          description:
            'A library id, `refero:<uuid>` (`GET /api/design-system/library`), or `template-default` to take the worn system off'
        },
        template: {
          type: 'string',
          description:
            '`template` of the read. The door then writes without reading the site first; if the site runs another template now, nothing is written for the old one and the door writes for the one it runs.'
        }
      }
    },
    answers:
      '`{ok, applyId, worn, previous, changed, seen, fontsLoaded?, read}` — `read` is what `GET …/design-system` answers after the write; 400 `DS_UNKNOWN` · `DS_REFUSED`; 403 `TOOLSET_NOT_GRANTED` · `CHAT_DESIGN_SYSTEM_OFF` · `DS_TEMPLATE_LOCKED` (a customer, on a template customers may not wear a design system on; nothing written) · `DS_IMPORTED_SITE` `{code, reason: SITE_IMPORTED}` (a site imported into Tracy, for staff too; nothing read or written); 404 `SITE_UNKNOWN`; 409 `DS_TEMPLATE_CANNOT_WEAR` · `SITE_BUSY` · `PLATFORM_HAS_NO_SLOT` · `DS_NOTHING_WORN` · `DS_NO_TEMPLATE_LOOK`; 502 `DS_READ_FAILED` · `DS_WRITE_FAILED`; 503 `UI_SETTING_UNREADABLE`'
  },
  // src/sites/design-system.js
  {
    method: 'POST',
    path: '/api/sites/:key/design-system/undo',
    summary: 'Undo the newest design system apply',
    description:
      'Puts back exactly what the site held before the apply `applyId` — the previous design system, or the template’s own look — and only while the site still holds what that apply wrote (409 `DS_CHANGED_SINCE` otherwise, nothing written). Only the newest apply can be undone (409 `DS_NOT_LATEST`), once (409 `DS_UNDO_USED`). Recorded in Site changes. Same seats as the apply. The Design system panel, the site browser’s Undo and the apply’s Site changes row all press this door.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['applyId'],
      properties: {
        applyId: {
          type: 'string',
          description: '`applyId` of the apply answer, or `last.applyId` of the read'
        }
      }
    },
    answers:
      '`{ok, worn, read?}`; 400 `INVALID_REQUEST`; 403 `TOOLSET_NOT_GRANTED`; 409 `DS_NOT_LATEST` · `DS_UNDO_USED` · `DS_CHANGED_SINCE` · `DS_UNDO_UNKNOWN` · `SITE_BUSY`; 502 `DS_WRITE_FAILED`'
  },
  // src/sites/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/state',
    summary: 'Read the site’s publish state and plan',
    description:
      'Returns whether the site is imported or built by Tracy, whether it is `draft` or `published`, the operation that is running or failed last (`operation.op`: `live`, `draft`, `drop-domain`, or `delete` while the site is being taken off its host), whether this seat may publish, its plan and the plans available. An operation whose ending the host has not said is resolved by this read: the host is asked again for the same operation. It is also asked about in the background (a sweep every 15 seconds takes the operations due for a look, first about 30 seconds after one starts, then backing off up to every 10 minutes), so it is resolved even when nobody reads the site; no age ends it. Any seat on the site may read it.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers: '`{origin, publish, mayPublish, operation, liveSince?, plan, plans}`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/state',
    summary: 'Change the site’s plan',
    description:
      'Sets the site’s plan in Tracy’s records. The publish flag is not written here: a body that names `publish` is refused with `PUBLISH_BY_GO_LIVE` (use go-live), and a body that carries any other field beside `plan` is refused with 400 `INVALID_REQUEST` before anything is written. Owner or editor only (403 `NOT_SITE_EDITOR`); logged in the audit trail.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      properties: {
        publish: {
          type: 'string',
          enum: ['draft', 'published'],
          description:
            'No longer accepted here: a body that names it is refused with 409 `PUBLISH_BY_GO_LIVE`. Use `POST /api/sites/:key/go-live`.'
        },
        plan: { type: 'string', description: 'One of the plans listed by `GET /api/sites/:key/state`' }
      }
    },
    answers: '`{ok, plan}`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/go-live',
    summary: 'Publish the site, or take it back to draft',
    description:
      '`live` asks the host to open mail and lift noindex, and marks the site published at its Tracy address once the host’s job has ended done. A custom domain of the site is connected by the same job when its DNS, read again for this publish, proves both records; one that is not proven is left out and the site is published without it (`operation.code: "DOMAIN_NOT_ROUTED"` when the host did not confirm a domain it was given). `draft` marks the site draft first, then asks the host to reverse it and to take every custom domain out; a draft that left one routed reads failed with `DOMAIN_STILL_ROUTED` and `retry: true`, and pressing again continues the same operation. Answers 202 with the job; the ending is read from `GET /api/sites/:key/state`. One operation per site at a time (`PUBLISH_BUSY`); an operation the host has not confirmed keeps the site until the host says how it ended, with its script’s exit code; it is asked about again each time the site’s state or settings are read, and in the background when nobody reads it. A refusal from the host ends an operation only when the host also says it never took it; a host that took it and lost its record of the job, or cannot tell, ends nothing. A body that carries `domains` is refused with `DOMAINS_NOT_SUPPORTED`. Owner or editor only (403 `NOT_SITE_EDITOR`).',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['op'],
      properties: {
        op: { type: 'string', enum: ['live', 'draft'] },
        domains: {
          type: 'array',
          maxItems: 10,
          items: { type: 'string' },
          description:
            'No longer accepted here: a body that carries it is refused with 400 `DOMAINS_NOT_SUPPORTED`.'
        }
      }
    },
    answers: '`{jobId, op, state, publish, mayPublish, operation}`'
  },
  // src/sites/route.js
  {
    method: 'PUT',
    path: '/api/sites/:key/component-credential',
    summary: 'Store the site’s content plugin endpoint and token',
    description:
      'Saves the https endpoint and token of the Claude Cowork plugin on the customer’s site, used later by the Apply door. Called by the add-site plugin on the host during an import, forwarding the person’s `tracy_sess` cookie. Owner only (403 `NOT_SITE_OWNER`); the token is never echoed back.',
    audience: ['dsh'],
    auth: 'session',
    internal: true,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['endpoint', 'token'],
      properties: {
        endpoint: { type: 'string', description: 'https URL of the plugin' },
        token: { type: 'string', minLength: 16 }
      }
    },
    answers: '`{ok: true}`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/apply',
    summary: 'Read or change one site through its Claude Cowork plugin or reader',
    description:
      'Runs one allowed `action` with its `params` against the site, after checking the caller’s seat and role. The agent calls it through dsh with a signed `x-tracy-actor` header. A call from dsh may name the chat turn it belongs to in `x-tracy-turn` (`<session id>:<turn number>`); a write is then listed under that turn in the site changes, and a malformed value is ignored, never refused. It may also send `x-tracy-write-title`, the `encodeURIComponent` form of the record’s title as dsh read it from the same site, kind and id: a `content.update`, `content.delete`, `content.language`, `media.upload` or `media.delete` write is then named by that title in the site changes (one line, at most 200 characters). The title is a label only and never chooses the record; it is read from the signed `x-tracy-actor` alone, and a value that does not decode is ignored. On the api host the same door takes `Authorization: Bearer trk_…` (a seat key, `POST /api/me/keys`) instead — no cookie, no actor — and the seat’s toolsets are intersected with the key’s scopes. The actions are documented in detail under the Apply door section.',
    audience: ['agent', 'customer'],
    auth: 'session-or-actor',
    internal: false,
    params: { path: { key: 'Site key' } },
    body: {
      type: 'object',
      required: ['action'],
      properties: { action: { type: 'string' }, params: { type: 'object' } }
    },
    answers: 'The action’s result, as the site’s plugin or reader answered it'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/artifacts/:step',
    summary: 'Upload a site archive for import',
    description:
      'Signs the storage calls to upload a site’s webroot or database archive during an import. Steps: `begin`, `part`, `finish`, `abort` (multipart upload), `put` (single upload URL), `fetch` (download URL) and `delete`. Keys must belong to this site. Requires an owner or editor seat; a viewer gets 403 `FORBIDDEN_WRITE`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key', step: 'begin, put, part, finish, abort, fetch or delete' } },
    body: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['webroot', 'db'] },
        key: { type: 'string', description: 'Storage key; required for part, finish, abort, fetch, delete' },
        uploadId: { type: 'string', description: 'Required for part, finish, abort' },
        partNumber: { type: 'integer', minimum: 1, maximum: 10000 },
        parts: { type: 'array', description: 'finish: `{PartNumber, ETag}` list', items: { type: 'object' } }
      }
    },
    answers: 'Per step: `{key, uploadId}`, `{url}`, `{key, done}`, `{aborted}` or `{deleted}`'
  },
  // src/sites/route.js
  {
    method: 'DELETE',
    path: '/api/sites/:key/import',
    summary: 'Remove an unfinished import',
    description:
      'Removes an imported site whose import never reached a build (no provision filed): its seats, its record, what the read left on the host, and the stored copies inside the site’s own keys. Nothing is removed until the host that ran the read confirms none is running. While it runs, starting, retrying or continuing the import, `/provision` and `/agent` answer 409 `IMPORT_REMOVING`. Owner only. 409 `NOT_UNFINISHED_IMPORT` for a finished import or a site built in Tracy, `IMPORT_RUNNING` while a read is going, `IMPORT_BUSY` or `IMPORT_REMOVING` while a provision or another removal holds it; 503 `HOST_UNAVAILABLE` when the host the import was claimed on cannot say, `REMOVE_INCOMPLETE` when the record could not be deleted (nothing was, and the next removal finishes it): try again later.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers:
      '`{removed: true, artifactsKept}` — `artifactsKept` counts stored copies the store would not delete'
  },
  // src/sites/route.js
  {
    method: 'DELETE',
    path: '/api/sites/:key/claim',
    summary: 'Release an import that never reached a host',
    description:
      'Removes an imported site record and its seats when no build was ever started for it, for example after the import failed. An import that never reached a build is removed the way `DELETE /api/sites/:key/import` removes it, with its refusals (409 `IMPORT_RUNNING`, `IMPORT_BUSY`, `IMPORT_REMOVING`; 503 `HOST_UNAVAILABLE`, `REMOVE_INCOMPLETE`: try again later). Anything already sent to a host must use `DELETE /api/sites/:key`. Owner only.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers: '`{released: true}`'
  },
  // src/sites/route.js
  {
    method: 'DELETE',
    path: '/api/sites/:key',
    summary: 'Delete a site',
    description:
      'Deletes the site, host first. The delete is an operation of the site (`operation.op: "delete"` in `GET /api/sites/:key/state`): it is refused with 409 `PUBLISH_BUSY` (or `ADDRESS_CHANGE_BUSY`) while a publish, a draft, a domain removal or another delete holds the site, and while it holds the site nothing else starts. The host takes the site off itself — containers, files, its routes — and only when the host has said the site is gone are the GitHub repository Tracy created, every seat and the site record removed (each of those parts reports its own result; chat sessions are archived). A host that could not finish answers 409 `TEARDOWN_FAILED` with `hostReason`: the site record and its seats are untouched, and deleting again continues the same operation. A host that has not finished when the wait ends answers 202 `DELETE_PENDING`: the site stays listed (`publishing: "delete"` in `GET /api/sites`) and is removed, with nobody waiting, once the host says it is gone. An imported site whose import never reached a build is removed the way `DELETE /api/sites/:key/import` removes it, with its answers (409 `IMPORT_RUNNING`, `IMPORT_BUSY`, `IMPORT_REMOVING`; 503 `HOST_UNAVAILABLE`: nothing removed, try again later). Owner only.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: { key: 'Site key' } },
    answers:
      '`{removed: true, host: true, repo, sessions, sessionsReason?, seats}` once the site is gone; 409 `{code: "TEARDOWN_FAILED", removed: false, host: false, hostReason, retry: true}` when the host could not take the site off it; 202 `{code: "DELETE_PENDING", removed: false, jobId, publish, mayPublish, operation}` while the host is still at it'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/wizard',
    summary: 'Say the Add site form opened, or reached a page',
    description:
      'Called by Tracy’s Add site form when it opens, with the id it drew for that opening; the same id goes with `POST /api/sites` as `wizardId`. Kept for usage, so an opening that never reached Create can be counted. One record per id; at most 60 openings an account an hour. With `step`, the same opening reached a page of the form instead: one record per id and page, at most 300 pages an account an hour, and a page not on the list answers 400 `INVALID_WIZARD_STEP`.',
    audience: ['customer'],
    auth: 'session',
    internal: true,
    body: {
      type: 'object',
      required: ['wizardId'],
      properties: {
        wizardId: { type: 'string', format: 'uuid', description: 'The id this opening drew' },
        where: {
          type: 'string',
          enum: ['new', 'site'],
          description: 'Optional: the creation workspace, or inside a site’s workspace'
        },
        step: {
          type: 'string',
          enum: [
            'start:source',
            'create:platform',
            'create:design',
            'create:system',
            'create:address',
            'create:customize',
            'create:review',
            'import:address',
            'import:platform',
            'import:access',
            'import:details',
            'import:review',
            'business:start'
          ],
          description: 'Optional: the page of this opening now shown, as `<origin>:<page>`'
        }
      }
    },
    answers:
      '`{ok: true}`; 400 `INVALID_WIZARD_ID` or `INVALID_WIZARD_STEP`; 401 when not signed in; 429 `RATE_LIMITED`'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites',
    summary: 'Create a new site, or claim an existing one for import',
    description:
      'Creates a WordPress, Joomla or EmDash site under the chosen name and starts provisioning (202 `{siteKey, jobId}`), making the caller its owner. With `origin: "import"`, only claims the given domain for a later import. Idempotent per `buildId`. Errors include `INVALID_LABEL`, `TAKEN`, `UNSUPPORTED_PLATFORM`, `DS_UNKNOWN`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    body: {
      type: 'object',
      required: ['platform'],
      properties: {
        platform: { type: 'string', enum: ['joomla', 'wordpress', 'emdash'] },
        label: { type: 'string', description: 'The name for a new site; becomes its address' },
        origin: { type: 'string', enum: ['import'], description: 'Claim an existing domain instead' },
        siteKey: { type: 'string', description: 'The domain to claim, with `origin: "import"`' },
        buildId: { type: 'string', description: "The client's id for this press; makes retries safe" },
        wizardId: {
          type: 'string',
          format: 'uuid',
          description:
            'Optional: the id the Add site form drew when it opened (`POST /api/sites/wizard`), kept with the creation for usage. A malformed one is not refused, only not kept'
        },
        design: {
          type: 'string',
          description: 'A design template id: a design system or a finished template'
        },
        quickstart: { type: 'string', description: 'A quickstart release tag to build from' },
        workflow: {
          type: 'string',
          enum: ['agent-demo/1'],
          description:
            'Provision-only WO builds: accepted only when the server-held account/build/revision/action and release match. Not a general bypass flag.'
        },
        expectedQuickstartRelease: {
          type: 'object',
          description:
            'Optional frozen version and archive file/checksum map. A mismatch is 409 TEMPLATE_VERSION_CHANGED; the fleet receives only the matching install entry.'
        },
        designSystem: {
          type: 'string',
          description:
            'A design system of the library (`GET /api/design-system/library`, an id like `refero:<uuid>`) for the new site to wear. Kept on the site and put on by the server at the end of the build — after the install and after the `brief`’s words — through the same write as `POST /api/sites/{key}/design-system`, as the caller: one Site changes row (Source: Design system), undone like any apply. No browser has to stay open. An id the library does not offer (an OpenDesign `od:` id, an unknown or refused one, not a string) is 400 `DS_UNKNOWN` before anything is created. A quickstart whose template customers may not wear a design system on (any template whose Design system check is not ready) is 403 `DS_TEMPLATE_LOCKED` for a customer, before anything is created; Tracy staff may send one for any template. A template that cannot wear a system still gets its site; the job poll says the pick was `skipped` and why. Omit it for the template’s own look'
        },
        brandFrom: {
          type: 'string',
          description:
            'With a brand design (`brand:<host>`): the site whose `Brand/<host>/` the new site takes its brand from. The caller must hold a seat on it (403 `SEAT_NOT_AUTHORIZED` otherwise)'
        },
        brief: {
          type: 'object',
          description:
            'The Add site popup’s answers (all optional; a brief with none is no brief): the text and pictures are made while the site installs and written the moment it is up, so the site is handed over with the customer’s words. Without it the site is made as released. The popup asks the questions of the site’s own questionnaire (`GET /api/sites/questions`), so send `answers` by question id; the older `about`, `goal` and `style` are still read when no `answers` are sent. The languages the answers name are the site’s (up to 4), else one: English',
          properties: {
            answers: {
              type: 'object',
              description:
                'The answers by question id: a string for a line, a description or a single choice, a list of option ids for a multiple choice or the languages. An answer to a question the set does not hold, one its condition hides, or an option it does not offer is dropped. `logo` is a file id from `POST /api/sites/brand-files` or `{light?, dark?, single?}` of them, `favicon` one file id: only the caller’s own uploads are kept (any other id is dropped, the site is still made), and only while the `site-brand-uploads` switch is on. `pages` lists page ids of the template being built: an id it does not have is dropped (the site is still made), its home page is always kept, and no `pages` answer keeps every page',
              additionalProperties: {
                oneOf: [
                  { type: 'string' },
                  { type: 'array', items: { type: 'string' } },
                  {
                    type: 'object',
                    properties: {
                      light: { type: 'string', format: 'uuid' },
                      dark: { type: 'string', format: 'uuid' },
                      single: { type: 'string', format: 'uuid' }
                    }
                  }
                ]
              }
            },
            questionnaire: {
              type: 'string',
              description:
                'The `set.contentHash` the questions were served under; the answers are judged against that set. Without it, against the set the site would be asked today'
            },
            about: {
              type: 'string',
              description:
                'Older shape: what the business is and what the site should say, up to 300 characters'
            },
            goal: {
              type: 'string',
              enum: ['contact', 'book', 'sell', 'showcase', 'publish'],
              description: 'Older shape: what visitors should be able to do'
            },
            style: {
              type: 'string',
              enum: ['professional', 'friendly', 'modern', 'bold', 'elegant'],
              description: 'Older shape: the feel of the site'
            },
            facts: {
              type: 'object',
              description:
                'Optional contact details the caller collected, each `{value, source, fetchedAt?}`: `source` names where it came from (for example `business.phone`). The site’s contact page, footer and top bar show them, unless the answers say otherwise: what the customer said wins. A fact without a source, longer than its cap, or not shaped like a phone, an email, a street address or opening hours is dropped and the site is still made. A fact left out is never a request to clear one. Facts ride only on a brief that has answers or older-shape fields. Not part of the `buildId` fingerprint',
              properties: {
                phone: BRIEF_FACT,
                email: BRIEF_FACT,
                address: BRIEF_FACT,
                hours: BRIEF_FACT
              }
            }
          }
        }
      }
    },
    answers:
      '202 `{siteKey, jobId, buildId?, attempt?, designSystem?, ...}` (`designSystem`: `{id, name, state: "queued"}` when one was sent); import claims answer 201 `{siteKey}`. With a `brief` the job poll (`GET /api/sites/:key/jobs/:id`) answers `running` with a `step` naming the text and pictures until they are in, then `done`; with a `designSystem` it answers `running` until the system is put on (or skipped, or failed), then `done` with how it ended'
  },
  // src/sites/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/apply/:action',
    summary: 'Run one action on one site, the action named in the address',
    description:
      'The same door as `POST /api/sites/{key}/apply`, with the action in the address and its `params` as the whole body. Each action has its own page in this reference under the Apply groups.',
    audience: ['agent', 'customer'],
    auth: 'session-or-actor',
    internal: false,
    params: { path: { key: 'Site key', action: 'One of the actions listed under the Apply groups' } }
  },
  // src/quickstarts/download.js
  {
    method: 'GET',
    path: '/api/quickstarts/:template/:cms/quickstart.zip',
    summary: 'Download the quickstart zip of a JoomlArt template',
    description:
      'Streams the quickstart package of the release `quickstart/{template}/{cms}` (for example `quickstart/ja-kinetic/j6`) as `application/zip`, as an attachment named after the asset. The bytes come off the private releases repository through this server; the person is never sent to GitHub. `x-tracy-sha256` carries the sha256 GitHub states for the asset when it is known, so a saved file can be checked. 404 `QUICKSTART_NOT_AVAILABLE` when the release is not in the catalogue or Tracy cannot read it, 503 `CATALOGUE_UNAVAILABLE` when the catalogue cannot be read, 429 `RATE_LIMITED` past ten downloads an hour per account or `TOO_MANY_STREAMS` past two open at once, 502 `UPSTREAM_FAILED` when GitHub does not answer with the file. An optional `ref` names the page the download came from; it is kept with the download record, reduced to scheme, host and path, when it is an absolute http(s) URL of at most 512 characters, and ignored otherwise — it never refuses the download.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false,
    params: {
      path: {
        template: 'The template id as its release tag spells it (`ja-kinetic`)',
        cms: 'The CMS part of the release tag (`j6`, `wp7`)'
      },
      query: { ref: 'Optional absolute http(s) URL of the page the download came from' }
    },
    answers:
      'The zip, with `content-disposition: attachment`, `content-length` and `x-tracy-sha256` when known'
  }
]
