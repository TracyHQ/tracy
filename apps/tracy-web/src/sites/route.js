import { quickstartReleaseIdentity, quickstartReleaseMatches } from '../lib/quickstart-selection.js'
import { momentUsage } from './token-usage.js'
import { requestLanguage, translate } from '../lib/i18n/index.js'
import { opsFor } from '../lib/ops-signal.js'
import { sessionFromCookieHeader } from '../lib/session.js'
import { inspectOwnJob } from './job-inspect.js'

/**
 * The site book's own doors — everything under `POST /api/sites` and `/api/sites/:key/*` that
 * `seats/route.js` does not already own (that file keeps the roster/invite doors it shipped in
 * Task 4/5: `GET /api/sites`, `GET /api/team`, `.../seats/:grant`, `.../accept`, `.../leave`).
 *
 * Ported from two Workers that split this across a network hop — `workers/cowork-web/src/worker.js`
 * (`apiCreateSite`, `apiSiteJob`, `apiSiteAgent`, `apiSiteData`, `apiSiteRelease`, `apiSiteDelete`,
 * `apiSiteFileDiff`, `apiSiteRestore`, `apiSiteMoment`, `apiSiteComponentCredential`,
 * `apiSiteProvision`, `apiSiteArtifact`, `apiViewingSession`, `apiPickSite`) calling
 * `workers/seat-registry/src/index.js` (`handleCreateSite`, `handleProvision`, `handleSiteJob`,
 * `handleCoworkSession`, `handleProvisionJob`, `handleArtifact`, `handleSetComponentCredential`,
 * `handleApply`, `handleAttachSite`, `handleTeardown`) over `env.SEATS.fetch(...)` /
 * `env.FLEET_RELAY_SECRET`-signed calls to the fleet relay. This app is one process with one
 * Postgres pool and a signed channel straight to `tracy-host` (`host/client.js`) — the two-Worker
 * hop and the fleet relay both collapse into direct calls, same rules, same response shapes.
 *
 * `PUT .../component-credential` and `POST .../apply` (ADR 0051) were shipped by Task 6 as 501
 * stubs — `002-book.sql` never created a table for the component token, and no other task in this
 * plan added one. Task 6b (`.superpowers/sdd/2026-09-09-tracy-web-02-so-ghe-va-site/task-6b-brief.md`)
 * is that missing task: `003-component.sql`'s `site_component`, plus these two doors wired to it.
 * Ported from `apiSiteComponentCredential` + `handleSetComponentCredential` (index.js:2116) and
 * `apiSiteApply` + `handleApply` (index.js:2334), narrowed to what this plan actually carries —
 * see this file's `APPLY_RULES` comment for exactly what was left out and why.
 *
 * WHAT THIS TASK DOES NOT WIRE UP, AND SAYS SO RATHER THAN FAKING IT (RULE #3):
 *
 * - `GET .../viewing-session` mints a token with this app's own session secret
 *   (`lib/session.js`'s `mintSession`) rather than porting `FLEET_ACTOR_SECRET` and fleet-bar's
 *   session format verbatim — fleet-bar itself is not part of this plan's port, so there is
 *   nothing on the other end that reads the Worker's exact shape yet.
 * - The remote branch of "publish an address" (`hostCall('/address')`, for a site whose host is
 *   not this process's own) is still not carried: `tracy-host` has had the door since Plan 3, but
 *   it writes an ingress rule for `<label>.<host>-sites.<domain>` that only means anything once a
 *   SECOND host exists, and there is one. The job-poll handler below takes the local branch, and
 *   `siteTarget`'s remote branch is the other half waiting on the same day.
 *   `POST /api/sites/:key/go-live` (below) is a different door and IS carried — it hands a
 *   customer's own domain to `go-live.sh`, which does not depend on how many hosts there are.
 *
 * ROLES (ADR 0028): three seat roles, each with a FIXED set of toolsets (`seats/roles.js`). No site
 * or workspace policy widens or narrows one any more, so no door here reads a policy table.
 * - viewer: every read door, comments, and chat (the agent is read-only for it); refused at every
 *   door that changes the site (`mayWrite`, the toolset gates, publish).
 * - editor: everything that changes the site, publish and restore included (`actingEditor`).
 * - owner: also the custom domain, deleting the site, provisioning an import and the component
 *   credential (`actingOwner`).
 *
 * Fix Round 2 (Task 7) added `workspaceOfSite`/`workspaceGrantFor` to `deps.workspaces`, for `requireRepoDoorGrant` below — ADR 0067 §3's one documented bootstrap exception, carried
 * from `handleCreateRepo` (`workers/seat-registry/src/index.js:7708-7741`). See that function's own
 * comment for why it, and only it, may consult a workspace grant to authorize a site door.
 */

import { createHmac, randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { verifyActor } from '../lib/actor.js'
import { verifyKey } from '../lib/api-key.js'
import { rewriteBrief } from '../lib/brief-rewrite.js'
import { baseChoices, readBuildBase } from '../lib/build-base.js'
import { loadStandardQuestions, resolveQuestions } from '../lib/build-questions.js'
import { siteCookie } from '../lib/cookies.js'
import { liveDemoOf } from '../lib/demo-sites.js'
import { customerLock, DS_TEMPLATE_LOCKED, staffReader } from '../lib/design-system-customer-lock.js'
import { readyTemplatesReader } from '../lib/design-system-ready-templates.js'
import { readDesignSystemsShown } from '../lib/design-systems-setting.js'
import {
  dsLibrary,
  emitFor,
  googleFontFaces,
  maxVersionOf,
  minVersionOf,
  modesOf,
  quickstartContractOf,
  quickstartTemplateOf,
  rawTemplatesOf,
  referoLibrary,
  referoScreenshotPath,
  contractFor as slotContractFor,
  supportForNewSite,
  templateKeyOf,
  versionKeyOf
} from '../lib/ds-slot.js'
import { fitPagesQuestion, pagesOfBrief } from '../lib/fit-questions.js'
import { sha256Hex } from '../lib/hmac.js'
import { json, normalizeSiteKey, requireViewer, viewer } from '../lib/http.js'
import {
  IMPORT_NOT_FINISHED,
  IMPORT_REMOVING,
  importPending,
  importRecoveryPath
} from '../lib/import-pending.js'
import { forgetImportAtHost, importRemover } from './import-remove.js'
import {
  importAddressHandler,
  importClaimRetryable,
  importJoinPath,
  pressImportClaim
} from './import-address.js'
import { modelForChain, modelForDoor } from '../lib/llm-door.js'
import { emdashTemplateIdOf } from '../lib/local-releases.js'
import { localPackSiteOf, localReviewDemoOf, OPEN_LOCK } from '../lib/local-review.js'
import {
  BRIEF_REWRITE_LIMIT_ALL_PER_HOUR,
  BRIEF_REWRITE_LIMIT_PER_HOUR,
  KEY_READ_LIMIT_PER_HOUR,
  MOMENT_WAITS_PER_MINUTE_PER_SEAT,
  TURNS_PER_MINUTE_PER_SEAT,
  WRITE_LIMIT_PER_HOUR
} from '../lib/policy.js'
import { pickAllowed } from '../lib/preview-ticket.js'
import {
  isTemplateId,
  readReleases,
  releasesToken,
  resolveInstall,
  templateCards,
  templateDesign,
  templateRelease
} from '../lib/quickstart-releases.js'
import { overLimitDetail, overLimitOrClosed } from '../lib/rate.js'
import { mintSession } from '../lib/session.js'
import { bornSiteAddress } from '../lib/site-address.js'
import { briefFromAnswers, readBriefAnswers, readBriefFacts, readBriefInput } from '../lib/site-brief.js'
import {
  nameFor,
  readSiteDesign,
  styleRecord,
  tokensFor,
  writeSiteDesign,
  writeSiteDesignIfAbsent
} from '../lib/site-design.js'
import { completeProvisionDesign } from './provision-design-tokens.js'
import { siteSessionAhead } from '../lib/site-session-ahead.js'
import { templateThumbnailOf } from '../lib/template-thumbnail.js'
import { readUiHidden, uiSwitchOn } from '../lib/ui-setting.js'
import { mountActivity } from './activity.js'
import { attachFaces } from './activity-store.js'
import {
  addressChangeState,
  hasOwnDomain,
  mountSiteAddress,
  ownDomainProber,
  publicSiteFields
} from './address.js'
import { artifactKey, presign, signedCall, storeForSource } from './artifacts.js'
import { createBackupExports, EXPORT_NAMESPACE } from './backup-export.js'
import { databaseOf, pointOf, withDatabases } from './backups.js'
import { brandOfPress, brandUploadsAvailable, mountBrandFiles } from './brand-files.js'
import { brandHostOf, brandPlan } from './brand-plan.js'
import { OPEN_STATES as BRIEF_OPEN, briefOf } from './brief-store.js'
import { mountCmsLog, pullCmsLog } from './cms-log.js'
import { COMMENT_ANSWER_WINDOW_MS, commentNumbers } from './comment-answer.js'
import { forgetSiteAttachments } from './comment-attachments.js'
import { markRequestsAnswered, mountSiteComments } from './comments.js'
import { mountSiteDesign } from './design.js'
import { provisionDesignRecord } from './design-at-provision.js'
import { mountDesignSystem } from './design-system.js'
import { createBuildDesignSystems, DS_STEP } from './design-system-at-create.js'
import { buildDesignSystemStore } from './design-system-at-create-store.js'
import { lastOf } from './design-system-ids.js'
import { mountDesignSystemPreview, previewRateLimiter } from './design-system-preview.js'
import { mountDesignSystemPreviewAssets } from './design-system-preview-assets.js'
import { designSystemStore } from './design-system-rows.js'
import { designSystemSiteReaders } from './design-system-site-readers.js'
import {
  closeUnfiledMoment,
  fileFollowUp,
  followThrough,
  handOver,
  owedMomentsOf,
  releaseHold,
  waitForMoment
} from './door-follow-up.js'
import { emdashMediaRequest, emdashMediaUpload } from './emdash-media.js'
import { declaredSiteIcon } from './favicon.js'
import { shareHistoryJobs } from './history-share.js'
import {
  attachJob,
  createOperation,
  finishOperation,
  inspectCommit,
  jobAnswer,
  operationByIdem,
  parseIdemKey,
  reconcileOperation,
  reconcilePending,
  sameCommit,
  scopeOfCommit,
  settlementOf
} from './operations.js'
import { emdashContentDoor, pairComponent as pairSiteComponent } from './pair-component.js'
import { mountPreviewTicket } from './preview-ticket.js'
import { mountSitePublish } from './publish.js'
import { RECENT_CHANGES_DAYS, recentChangeRows, recentChanges, recentChangesNext } from './recent-changes.js'
import { siteReadOrigin } from './resolver.js'
import { mountSiteSettings } from './settings.js'
import { connectTarget, hostnamesFromConfig } from './site-domain-provider.js'
import {
  recordStoppedWrites,
  STOPPED_WRITES_MAX,
  stoppedWriteOf,
  takeStoppedWrites
} from './stopped-writes.js'
import {
  fileOutcome,
  LOOK_TARGET_KIND,
  LOOK_UNDO_ID,
  lookOutcome,
  looksToCheck,
  OPEN_TURN_HOLDS_MS,
  revertOutcome,
  runUndo,
  shasToCheck,
  turnsView,
  undoneMarks,
  undoPlan
} from './turn-undo.js'
import {
  applyIdAudits,
  cmsChangesAfter,
  markTurnsUndone,
  openTurnsOn,
  operationsAfter,
  sessionTurns,
  turnAudits,
  turnUndoPress,
  undoneSince,
  writesAfter,
  writesOfTurns
} from './turn-undo-store.js'
import {
  checkTurn,
  END_REASONS,
  flagConcurrent,
  MOMENT_TITLE_MAX,
  markStale,
  markUnsealedStart,
  openTurn,
  parseTurnId,
  RATING_CATEGORY,
  RATINGS,
  REPLY_STATES,
  rateTurn,
  recordOutside,
  replyWithin,
  requestStateFor,
  TURN_TITLE_MAX,
  titleWithin,
  turnOf,
  VISUAL_NOTE,
  VISUAL_VERDICTS
} from './turns.js'

/** How long the host may take to start downloading an import archive — see the provision door. */
const ARCHIVE_URL_TTL_S = 24 * 60 * 60

import { bornLabel } from '../lib/born-label.js'
import { CONTENT_QUERY_NAMES, MAX_BYTES_RANGE, VERSION_PATTERN } from '../lib/content-query.js'
import { contractFor, defaultContracts, designOfRelease, mayName } from '../lib/contracts.js'
import { importDiagnostic, importSignIn } from '../lib/import-diagnostic.js'
import { markOwnReads } from '../lib/own-read.js'
import { DOOR_PROBE_HEADER, isDoorProbe } from '../lib/preview-door-health.js'
import { markDemoDeletedBySite } from '../lib/wo-demo-marks.js'
import { DOOR_WHYS, copyDoorsFor, isOnCopy, verifyCopy } from './component-target.js'
import {
  buildDescribe,
  CONTENT_PROTOCOL,
  CONTENT_TYPES,
  describeBlockKinds,
  emdashContentTypes,
  extendEnvelope,
  profileLocales
} from './content-extend.js'
import { projectEnvelope, projectionOf } from './content-fields.js'
import {
  createLocateStore,
  createSerialGate,
  indexContents,
  locateElement,
  locateQuery,
  locateQueryProblem,
  locateReads,
  roadToolsets
} from './content-locate.js'
import { fitPages, localeOfLink, narrowerPagesCall, pagesDocument, walkListing } from './content-pages.js'
import { contractToolset, emdashTemplate, siteAuthority, slotToolset } from './content-profile.js'
import { createStringStore } from './content-strings.js'
import { changesBetween, createVersionStore, queryScope, versionOf } from './content-versions.js'
import { describeWhere } from './content-where.js'
import { loadDesignRegistry, oneLanguageDesign, resolveDesignPlan } from './design-plan.js'
import { dnsLabelOf } from './dns-label.js'
import { fileVisibility } from './file-visibility.js'
import { mountSiteGuide } from './guide.js'
import { fleetLabel, labelPrefix, siteLabelRefusal, zoneLabelRefusal } from './label.js'
import { liveSync, SYNC_PLATFORMS } from './live-sync.js'
import { livePush } from './live-push.js'
import { currentPublishOp, deleteTornDownSite, PUBLISH_CODES } from './publish-store.js'
import { refusalCodeOf } from './refusal-code.js'
import { SETUP_MOMENT_ACTION, SETUP_MOMENT_TITLE, SETUP_MOMENT_VIA, setupTurnOf } from './setup-moment.js'
import {
  appliesOfSession,
  audit,
  auditSiteWrite,
  claimCreation,
  createSite,
  currentComponent,
  deleteSite,
  hasJob,
  jobById,
  notePresence,
  openJobOfKind,
  pendingPressFor,
  provisionedInPlace,
  putJob,
  releaseWriteLease,
  restartDeletedCreation,
  setAddress,
  setAttached,
  setImportPlatform,
  setPort,
  setQuickstart,
  settleCreationByJob,
  siteByKey,
  siteByLabel,
  takeOverCreation,
  takeWriteLease,
  updateCreation,
  updateJob,
  writeComponent
} from './store.js'
import { teardownSaid } from './teardown-said.js'

/** How long a call to a site's component may take. Why this number: the signal it feeds. */
const COMPONENT_TIMEOUT_MS = 170_000

/**
 * The time each `core.manifest` try on an imported site's fleet copy gets (`pairFleetCopy`): 30 s,
 * then once more 60 s for a cold copy (a timeout, or a copy not answering yet). 90 s at worst, and
 * the Apply door takes what the verification spent off the component call that follows
 * (`COMPONENT_TIMEOUT_MS`), so the whole call still answers inside the 170 s it always had — before
 * the site tools' own 180 s wait. 80 s is left for the write itself at worst: a contract inspect of
 * the 43-language Business quickstart (42–60 s, the longest call measured) still fits.
 */
const FLEET_COPY_BUDGETS_MS = Object.freeze([30_000, 60_000])

/**
 * @typedef {'timeout' | 'unreachable' | 'unauthorized' | 'not_json' | 'not_engine' | 'refused' |
 *   'redirected' | 'no_copy' | 'copy_error' | 'platform_mismatch' | 'no_registered_component' |
 *   'no_copy_address'} FleetCopyWhy
 * Why an imported site's fleet copy was not verified (`component-target.js` `verifyCopy`). `timeout`
 * and `unreachable` are the copy still warming up (tried again, and the agent is told to retry in a
 * moment); the others are an answer that will not change by waiting: a redirect, no container under
 * the site's name, a server error, a door that answers without the plugin, a wrong token.
 */
/** The reasons worth a second try, and a retry by the agent. */
const FLEET_COPY_TRANSIENT = new Set(['timeout', 'unreachable'])

/**
 * Every reason `pairFleetCopy` gives, the closed set a `site.edit` signal may name (`copy_reason`).
 */
const FLEET_COPY_WHYS = new Set([
  'timeout',
  'unreachable',
  'unauthorized',
  'not_json',
  'not_engine',
  'refused',
  'redirected',
  'no_copy',
  'copy_error',
  'platform_mismatch',
  'no_registered_component',
  'no_copy_address'
])

/**
 * How long a copy may stay "warming up" before the refusal stops saying a retry will help.
 *
 * 🔒 A COPY THAT HAS NOT ANSWERED FOR A DAY IS NOT WARMING UP (beta report, 26/10/2026). A re-imported
 * Joomla site's copy failed verification on every write from 25/10 18:51 to 26/10 22:31, and each
 * refusal told the agent to retry in a moment, so the customer was told the same for a day. Past this
 * long without one verified call the refusal is no longer `transient`: the agent tells the customer
 * the copy needs checking, and the `site.edit` signal names why (`copy_reason`).
 */
const FLEET_COPY_WARM_MS = 10 * 60_000

/** The three platforms a site may be BORN as — ported from `CREATE_PLATFORMS`
 * (`workers/cowork-web/src/worker.js`). Checked here, not left to the host: the host's own
 * provision script silently falls back to Joomla for anything it does not recognize, so a typo
 * in a client's request would provision the wrong platform with no error anywhere. */
const CREATE_PLATFORMS = new Set(['joomla', 'wordpress', 'emdash'])

/**
 * The one design registry this process resolves against, read once at boot.
 *
 * Once, not per request, and the revision it produces is what every later step is pinned to: a
 * form shows a plan, the create call carries the revision it showed, and the fleet re-resolves
 * from its own copy. Reading the file again per request would let those three disagree without
 * anything saying so. A restart is what picks up a new registry, and a restart is also what
 * changes the revision the doors hand out.
 *
 * Only Joomla has one. WordPress and EmDash pick a design a different way and pass no plan.
 */
const DESIGNS = loadDesignRegistry()
/**
 * The quickstart catalog, read once for the same reason. Which (platform, id) pairs a create may
 * name is the catalog's answer, not a list kept here — `provision.sh` gates on the same file.
 */
// The contract profiles, read once at boot like the design registry: they are files in the
// image, and which one seals a quickstart cannot change while the process runs.
const CONTRACTS = defaultContracts()

/**
 * The quickstart catalog, read once for the same reason — and mirrored into the image from the
 * fleet's own copy, so this process accepts exactly what `provision.sh` will restore.
 */

/** The three CMS default questionnaires the image carries (tracy-questions/v1), read once. */
const STANDARD_QUESTIONS = loadStandardQuestions()

/** How long a webroot job (Changes/History/Backup/Moment/Restore/file-diff) is polled before
 * giving up and reporting `FLEET_JOB_PENDING`/`FLEET_JOB_FAILED` — ported from
 * `apiSiteData`/`apiSiteRelease`/etc.'s own per-door deadlines. */

/**
 * The plan book. Ported from `SITE_PLANS` (`workers/seat-registry/src/fleetCloudflare.js`) — same
 * two plans, same shape, and the same `priceUsd: 0` on both.
 *
 * 🔒 THE ZEROES ARE A SEAM, NOT A PLACEHOLDER TO DELETE. The Worker's own comment names this the
 * point of sale: the day a plan stops costing nothing, the payment check lands in
 * `POST /api/sites/:key/state` beside the flag it guards, because publishing is the moment the
 * question gets asked. `badge` is the one behavioural difference today — `standard` carries
 * Tracy's badge on the site, `plus` does not.
 */
const SITE_PLANS = Object.freeze({
  standard: Object.freeze({ priceUsd: 0, badge: true }),
  plus: Object.freeze({ priceUsd: 0, badge: false })
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const JOB_WAITS_MS = [120, 180, 250, 350, 500]
/** How long `POST /backup` waits for its host job before answering 202 `BACKUP_PENDING`. */
const BACKUP_WAIT_MS = 120_000
/**
 * How far back an unfinished backup job still holds the next press (`backupInFlight`): past any
 * backup the host finishes, so a job the host lost frees the door on its own.
 */
const BACKUP_IN_FLIGHT_MS = 30 * 60_000
/**
 * How long `POST /moment` waits for its host job before handing it to the follow-up sweep
 * (`door-follow-up.js`, ledger L31). Its caller is the host dsh's turn book, which gives each close
 * 15 s in all (`tracy-site-tabs` `turn-record.mjs` `timeoutMs`) and then sends the close again — a
 * second moment job behind the first. Waiting past that answered nobody (it was 45 s, and the host
 * may take minutes: one site's webroot jobs wait for each other), so the door waits well inside it —
 * bounded, about 11 s at most with its last poll — answers 202 while the host works, and the sweep
 * closes the turn when the job ends. The dsh takes the 202 as recorded and never sends that close
 * again, so the sweep also asks again for a moment that failed only because the site was busy.
 */
const MOMENT_WAIT_MS = 10_000
/**
 * How long one `POST /moment/wait` waits for an earlier turn's moment to end before answering "not
 * yet" (option A, 10/10/2026). Inside the dsh's 15 s per call (`turn-record.mjs` `timeoutMs`),
 * like `MOMENT_WAIT_MS`; the dsh asks again until its own bound.
 */
const MOMENT_HOLD_POLL_MS = 10_000
/**
 * How long `POST /turn` waits for the seal at a new turn's start. The dsh holds the agent's first
 * write — every call that may change the site; since 09/10 no longer the whole first step, whose model
 * call and reads run beside the seal (`tracy-site-tabs` `writeReady`) — until the door answers or 15 s
 * have passed (the same turn book) — 15 s counted from before it sends, while this wait starts after
 * the door's own checks, the turn row and the POST to the host. Waiting the full 15 s here could
 * report a seal as made in time (`unsealedStart: false`) that ended after the dsh had already let the
 * agent write. 12 s keeps the door's verdict inside the dsh's hold.
 * A seal that ends after the wait still has its outside commits kept, by the sweep — which also takes
 * the turn's `unsealedStart` off again when that seal proves the start (`door-follow-up.js`
 * `sealProvesStart`).
 */
const SEAL_WAIT_MS = 12_000
/**
 * How long a Tracy setup run waits for each of its two webroot jobs (`setupWebroot`): a seal or a moment of a whole new
 * site (a Joomla language pack is ~500 files). Past it the job still ends on the host; its commit is then known by its
 * trailer alone (`setup-moment.js`).
 */
const SETUP_WEBROOT_WAIT_MS = 45_000
/**
 * How long a site delete waits for the host's teardown before asking the dsh to archive the site's
 * session folder. Teardown is `compose down`, two `rm -rf` and one ingress call — seconds, usually.
 * Bounded so the delete dialog still answers well inside a proxy's request limit; a teardown slower
 * than this leaves the folder in place and says so (`sessionsReason: 'SITE_STILL_EXISTS'`).
 */
const TEARDOWN_WAIT_MS = 45_000
/**
 * How long a site delete keeps asking the dsh to archive the session folder while a turn it just
 * stopped is still winding down (`sessionsReason: 'SESSION_ACTIVE'`, #561). The whole of it: the
 * clock starts before the first ask, and each ask and each pause gets only what is left, so a dsh
 * that never answers ends the wait instead of holding the delete.
 */
const SESSIONS_STOP_WAIT_MS = 10_000
const SESSIONS_STOP_WAITS_MS = [250, 500, 1000, 2000]
/**
 * How long a site delete waits for the dsh to forget the site folder's sessions and ask their turns
 * to stop (#561): two RPCs per session (`forgetWorkspace` in `vendor/tracy/dsh-passwords/src/tracy/seat-home.ts`)
 * plus two; past this the forget is unconfirmed and the session folder stays.
 */
const SESSIONS_FORGET_WAIT_MS = 30_000
/** A logical build's id as the Build tab makes it: a UUID. Anything else is not an id. */
const BUILD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The Add site wizard's id for one opening (`POST /api/sites/wizard`, usage U4), as `POST /api/sites`
 * may carry it: a UUID, lower-cased, or null. Optional and never refused — a press from an older page
 * sends none, and a malformed one only goes unrecorded.
 * @param {any} body
 * @returns {string | null}
 */
/** The most Add site wizard openings one account records in an hour (`POST /api/sites/wizard`). */
export const WIZARD_OPENS_PER_HOUR = 60

/**
 * The pages of the Add site form a step may name (`POST /api/sites/wizard` with `step`), as
 * `<origin>:<page>`: `start:source` is the first choice (create, import, business), `create:*` the
 * pages of `createStepIds` (`tracy-add-site` `create-navigation.mjs`), `import:*` the import wizard's
 * `IMPORT_PAGES`, `business:start` the Build from my business page. A closed list, so a typed value
 * cannot open a new line in what usage counts; a page the form gains must be added here too.
 */
export const WIZARD_STEPS = new Set([
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
])
/** The most wizard pages one account records in an hour; one opening walks about ten, back and forth. */
export const WIZARD_STEPS_PER_HOUR = 300

/**
 * The live fingerprint an import took (`tracy-add-site` takeFingerprint, the shape `live-pull.mjs`
 * compares): kept only in that shape and at most 512 KB, else null. It holds sizes, times and
 * checksums of the site, nothing of its content.
 */
function importFingerprint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { version, pageSize, skip, files, tables } = value
  const ints = (...v) => v.every((n) => Number.isSafeInteger(n) && n >= 0)
  if (version !== 1 || !ints(pageSize) || !Array.isArray(skip) || !skip.every((c) => typeof c === 'string'))
    return null
  if (!files || !ints(files.count, files.bytes) || !Array.isArray(files.pages)) return null
  if (!files.pages.every((d) => typeof d === 'string' && /^[0-9a-f]{40}$/.test(d))) return null
  if (tables !== null && (typeof tables !== 'object' || Array.isArray(tables))) return null
  for (const [name, sum] of Object.entries(tables ?? {}))
    if (name.length > 128 || !(sum === null || (typeof sum === 'string' && sum.length <= 64))) return null
  const kept = {
    version,
    pageSize,
    skip,
    files: { count: files.count, bytes: files.bytes, pages: files.pages },
    tables
  }
  return JSON.stringify(kept).length <= 512 * 1024 ? kept : null
}

export function wizardIdOf(body) {
  const id = body?.wizardId
  return typeof id === 'string' && BUILD_ID.test(id) ? id.toLowerCase() : null
}
/**
 * How long a `claiming` row with no job may stand before another request with the same build id
 * takes it over. Long enough for the slowest honest claim (a site row, a seat, one host call —
 * `hostCall` itself gives up well inside this); short enough that a request that died leaves the
 * customer waiting once, not for good.
 */
const CLAIM_STALE_MS = 30_000

/**
 * Entity → toolset (ADR 0080 §2), ported verbatim from `KIND_TOOLSET`
 * (`workers/seat-registry/src/index.js:2159-2186`): for the generic `content.*` actions, `kind`
 * decides the toolset, since the same verb touches things of very different blast radius. A kind
 * this map has never heard of falls to `site` (`toolsetOfKind`'s own `?? 'site'`) — closed by
 * default, so an unrecognized kind is still refused to anyone but an admin, never silently allowed.
 */
export const KIND_TOOLSET = {
  articleAssociation: 'content',
  menuAssociation: 'content',
  moduleAssignment: 'code',
  languageFilter: 'code',
  article: 'content',
  category: 'content',
  tag: 'content',
  field: 'content',
  fieldValue: 'content',
  menuItem: 'content',
  menutype: 'content',
  language: 'content',
  redirect: 'content',
  banner: 'content',
  bannerClient: 'content',
  contact: 'content',
  newsfeed: 'content',
  module: 'code',
  templateStyle: 'code',
  user: 'site',
  extensionParams: 'site',
  // An author's visitor-facing job and bio (Joomla `#__user_profiles`, WordPress user meta; a whitelist of fields the plugins
  // keep, 11/10/2026): words a visitor reads on the author pages, so `content` like an article.
  userProfile: 'content',
  usermeta: 'content',
  post: 'content',
  postmeta: 'content',
  // 27/09/2026: the two WordPress kinds the component writes that this map had never named fell to
  // `site` (admin/owner only) — so an editor was refused a category or tag that Joomla gives them
  // (`category`/`tag` are content), and a developer the block theme's header/footer that Joomla gives
  // them (`module`/`templateStyle` are code). The host even rewrites a WordPress category/tag write
  // to kind `term` (tracy-site-tools normalize.mjs), which is how a content call became a site one.
  term: 'content',
  templatePart: 'code',
  option: 'site'
}

const toolsetOfKind = (params) => KIND_TOOLSET[params?.kind] ?? 'site'

/**
 * `content.contract`'s toolset (decision 27/09/2026, `tasks/todo-comment-to-edit.md`; reads opened
 * 08/10/2026, ADR 0028): a read (inspect, `*.plan`, `*.verify`) is `'read'` like every other content
 * read — any live seat, a viewer's read-only agent included. An `apply` whose changes name only
 * text, image or link slots of the site's contract is `content` — the content-only rule, words
 * change and layout does not. Any other write stays `code` (`contractToolset`).
 * @param {Record<string, unknown>} params
 * @param {{ profile: any }} site - the contract profile sealing the site, or null.
 */
const toolsetOfContract = (params, { profile }) =>
  contractOperationWrites(params.operation) ? contractToolset(params, profile, true).toolset : 'read'

/**
 * `content.renderedWords`'s toolset: words and links a WordPress theme prints at render time, kept as
 * replacement rules for one page by the Claude Cowork plugin. An `apply` changes the words the customer
 * sees, like a contract string override, so `content`; `inspect` and `status` are reads.
 * @param {Record<string, unknown>} params
 */
const toolsetOfRenderedWords = (params) => (params?.operation === 'apply' ? 'content' : 'read')

/**
 * 🔒 ACTIONS ONLY TRACY'S OWN AGENT HOST MAY SEND (review 24/10/2026). `content.renderedWords` writes
 * rules over what a page prints, and only `content.replace` calls it, after every store it read held
 * none of the words (tracy-site-tools `rendered-words.mjs`; its `planCall` refuses the action to the
 * model, `ENGINE_ONLY_ACTIONS`). Sent here by a browser session or a seat key, it would skip that
 * store check and rewrite words a post holds, so the door takes it from the dsh host's signed actor
 * alone (`requireGrant`, kind `actor`) and refuses everyone else by name.
 *
 * Who loses what. A seat key (`/v1` and MCP) never ran `content.replace`: its actions are the
 * `V1_ROUTES` rows (`lib/v1-routes.js`, which MCP's tools are made from), and none is a replace, so
 * it loses no road. The agent relays with the actor of the person who typed (tracy-site-tools
 * `index.ts`, `x-tracy-actor`); a relay holding only a viewer's cookie is refused here, and the
 * engine then keeps the words (`inspectRefusal`). That fail-closed answer is accepted.
 */
const ACTOR_ONLY_ACTIONS = new Set(['content.renderedWords'])

/**
 * Apply's allowlist: action → `'read'` | a toolset name | a `(params, { profile }) => toolset`
 * resolver (`profile`: the contract profile sealing the site, or null).
 * Ported from `APPLY_RULES` (`workers/seat-registry/src/index.js:2157-2258`) MINUS the
 * Shopify-only rows this plan does not carry (`themeFiles.update`, `theme.redirect`,
 * `storeContent.update`, `storefront.deploy` — the Worker's own comments name each one Shopify's;
 * this plan's Global Constraints exclude every `handleShopify*`/`handleTheme*`/`handleStoreContent*`
 * handler by name). Everything else here is generic across the platforms this app can create
 * (`CREATE_PLATFORMS`), so it stays.
 *
 * `'read'` bypasses the toolset gate below for ANY live seat — a version string or an article list
 * is not a secret from a coworker who could already pull the site's repo. A resolver may answer
 * `'read'` too (`content.contract`'s reads).
 *
 * 🔒 EVERY PURE READ OF WHAT THE SITE SHOWS IS `'read'` (ADR 0028, PO 08/10/2026): a viewer asks the
 * agent about the site, and its agent is read-only, not blind. So `info`, the `*.list` rows,
 * `content.get`, `core.manifest`, `db.tables`, `content.read`, `content.locate` and a
 * `content.contract` inspect/plan/verify are open to any live seat. Two reads stay gated on
 * purpose, because they carry out more than the site shows: `db.dump` (`site` — the customer's raw
 * tables) and `apply.list` (`content` — every caller's past calls, which the applies door shows a
 * viewer only its own of). Writes stay gated by role.
 */
const APPLY_RULES = new Map([
  ['info', 'read'],
  ['content.list', 'read'],
  ['content.get', 'read'],
  ['core.manifest', 'read'],
  ['extension.list', 'read'],
  ['plugin.list', 'read'],
  ['theme.list', 'read'],
  ['db.tables', 'read'],
  ['content.batch', 'code'],
  // 27/09/2026 every content read became `content` (an editor who may change the words must read
  // them); 08/10/2026 (ADR 0028) every content read is `'read'`, so a viewer's agent reads them too.
  // What a seat may WRITE of what it read is the envelope's `writable`, from its own toolsets.
  ['content.contract', toolsetOfContract],
  ['content.read', 'read'],
  ['content.update', toolsetOfKind],
  ['content.delete', toolsetOfKind],
  ['content.renderedWords', toolsetOfRenderedWords],
  ['content.language', 'content'],
  // Which record printed an element the customer picked (comment → edit, `content-locate.js`): a
  // map (ids, labels, writable) read with this relay's own authority, `'read'` like every content read.
  ['content.locate', 'read'],
  ['demo.research', 'content'],
  ['media.upload', 'content'],
  ['media.delete', 'content'],
  // Where a picture is kept beyond post bodies (Claude Cowork for WordPress 0.18.31): every post meta and option
  // holding it, read only. The residue sweep asks it for a template picture the theme prints from its own data.
  ['media.usage', 'read'],
  ['apply.revert', 'content'],
  ['apply.list', 'content'],
  ['db.cleanup', 'site'],
  ['db.restore', 'site'],
  ['db.purge', 'site'],
  ['db.dump', 'site'],
  ['db.snapshot', 'site'],
  ['db.rollback', 'site'],
  ['extension.install', 'code'],
  ['extension.enable', 'code'],
  ['core.upgrade', 'code'],
  ['plugin.install', 'code'],
  ['plugin.activate', 'code'],
  ['theme.install', 'code'],
  ['theme.activate', 'code'],
  ['theme.style', 'code'],
  // Fetching a core translation, so WordPress itself speaks the language the pages were written
  // in. `code` because it adds files to the site the way an install does — and `content.language`
  // beside it is only `content`, because marking a page is a content edit while installing is not.
  ['language.install', 'code'],
  // Joomla's Global Configuration site name and site description (`sitename`, `MetaDesc`; plugin 0.22.0
  // `lib/SiteIdentity.php`): the site-wide settings a WordPress `option` write reaches, so the same `site` toolset.
  ['site.identity', 'site'],
  // A Joomla template's logo, dark-background and small-screen logos, name, slogan and favicon (plugin 0.23.0
  // `lib/TemplateSiteSettings.php`): the same site-wide settings as `site.identity` and WordPress's `site_logo` option,
  // so the same `site` toolset.
  ['template.siteSettings', 'site'],
  // A Joomla site's language override file for one language (plugin 0.24.11 `lib/LanguageOverrides.php`): the template's and
  // extensions' own words a pack leaves in en-GB, written in the site's language. Site-wide like `site.identity`, so `site`.
  // 🔒 The build calls it through this door (`joomla-site-strings.js`); missing here, every Joomla site of 10/10/2026 kept
  // the template's English words, because the door refused the call before it reached the site (ACTION_NOT_ALLOWED).
  ['template.languageOverrides', 'site']
])

/**
 * The door's first answer for an action, before any seat, site or toolset is read: the refusal `applyDoorOnce` gives an
 * action this allowlist does not name, or null. Exported so a test of a build engine calls its site through the same
 * allowlist the build's `applyAs` goes through (`test/_apply-door.mjs`).
 * @param {unknown} action
 * @returns {{ status: number, body: { code: string } } | null}
 */
export function applyDoorRefusal(action) {
  if (typeof action !== 'string' || action === '') return { status: 400, body: { code: 'INVALID_REQUEST' } }
  return APPLY_RULES.has(action) ? null : { status: 400, body: { code: 'ACTION_NOT_ALLOWED' } }
}

/** The door's actions, in allowlist order — what the public API reference documents (`api-reference/`). */
export const APPLY_ACTIONS = Object.freeze([...APPLY_RULES.keys()])

/**
 * What an action needs, in words, for the public API reference: `read` (any live seat), a toolset
 * name, or the rule a resolver applies. Read from `APPLY_RULES` itself, so the two cannot disagree.
 * @param {string} action
 * @returns {string | null}
 */
export function applyToolsetLabel(action) {
  const rule = APPLY_RULES.get(action)
  if (typeof rule === 'string') return rule
  if (rule === toolsetOfKind) {
    const byToolset = {}
    for (const [kind, toolset] of Object.entries(KIND_TOOLSET)) (byToolset[toolset] ??= []).push(kind)
    const parts = Object.entries(byToolset).map(([toolset, kinds]) => `${toolset} for ${kinds.join(', ')}`)
    return `depends on params.kind: ${parts.join('; ')}; site for any other kind`
  }
  if (rule === toolsetOfRenderedWords)
    return "Tracy's agent only, through content.replace (a browser session or a seat key is refused, ACTION_AGENT_ONLY); read (any live seat) for inspect and status; content for apply"
  if (rule === toolsetOfContract)
    return 'read (any live seat) for inspect, *.plan and *.verify; content for an apply that changes only text, image or link slots, and for a WordPress string override (operation string); code for any other write; derive is refused (import provisioning runs it)'
  return null
}

/**
 * The toolset one door of a where-map needs (`content-where.js`), by the rules the doors keep
 * themselves, never a column somebody types: a `tracy_site` action by its `APPLY_RULES` row (a
 * `content.update` by `KIND_TOOLSET`, a contract apply by its slots); a `tracy_emdash` write →
 * `content`, the rule for every EmDash entry write (`roadToolsets`, content-locate.js); a file the
 * agent edits in the site's own tree, or a command it runs there → `code`, as a picked template file
 * or language string is. A read (`'read'`) or a door these rules do not name → null: nothing to
 * hold, or nothing proven.
 * @param {any} door - `{tool, call}`.
 * @param {{ profile: any }} site - the contract profile sealing the site, or null.
 * @returns {string | null}
 */
export function toolsetOfDoor(door, { profile }) {
  if (door?.tool === 'tracy_emdash') return 'content'
  if (door?.tool === 'edit' || door?.tool === 'write' || door?.tool === 'bash') return 'code'
  if (door?.tool !== 'tracy_site') return null
  const rule = APPLY_RULES.get(door.call?.action)
  if (rule === undefined || rule === 'read') return null
  const needed = typeof rule === 'function' ? rule(door.call?.params ?? {}, { profile }) : rule
  return needed === 'read' ? null : needed
}

/**
 * WHICH ACTIONS ACTUALLY CHANGE THE SITE — a second column, because the first one answers a
 * different question.
 *
 * `APPLY_RULES` says which TOOLSET a caller must hold. That is not the same as whether the call
 * moves the site, and deriving one from the other (`rule !== 'read'`) is how a pure read came to
 * take the WRITE lease and lock a site against its own owner's other conversation.
 *
 * 🔒 MEASURED 19/09 ON `demowp` — TWO CHATS, ONE SITE, ONE OF THEM FOR NOTHING. Chat A asked
 * `content.language` with no params at 03:17:15; the component refused it (`apply_id required`)
 * and nothing was written — but `content.language` is not `'read'`, so the lease was taken anyway,
 * `taken_at = 03:17:15.034865`. Chat A's only real write landed at 03:18:59, a minute and
 * forty-four seconds later. In between, chat B — the SAME customer, in their other chat — was
 * refused `SITE_BUSY` twice (`content.contract {operation:"inspect"}`, then `content.batch`), told
 * not to retry, and stopped. The customer typed two requests and watched one of them do nothing.
 *
 * 🔒 `db.dump` AND `apply.list` ARE READS THAT NEED A PRIVILEGED TOOLSET, and that combination is
 * exactly what the derivation could not express. Dumping a table needs the `site` toolset because
 * it carries the customer's data out, not because it writes; listing past applies needs `content`
 * for the same kind of reason. `packages/tools/tracy-site-tools/src/host/site-context.mjs` already
 * classifies both as `read` for its step budget, and its own comment says what happens when a
 * hand-kept list drifts from this door. This is that list, on this side, written down instead of
 * computed.
 *
 * An action nobody named here is treated as a WRITE: a new verb arriving at this door is far more
 * likely to change the site than to read it, and guessing `read` would let it interleave with
 * somebody else's half-finished change — the one thing the lease exists to prevent.
 */
const APPLY_READS_ONLY = new Set(['db.dump', 'apply.list'])

/**
 * Actions that write only when their `operation` is `set` — the plugin's own rule (Claude Cowork for
 * Joomla `Engine.php`: its write lock is taken for `site.identity` on `set` alone, and `read` is the
 * default operation). 🔒 14/10/2026 (ladder DL14/DL15): the agent's `tracy_site` now carries
 * `site.identity`, so it READS the site name before it changes it; counted as a write, that read took
 * the site's write lease and wrote a Site changes row for a change that never happened.
 * `template.siteSettings` and `template.languageOverrides` follow the same plugin rule (`Engine.php`
 * takes its lock for all three on `set` only) and joined on 16/10/2026: Apply reads the language
 * overrides page by page through this door, and each read had become a "Tracy setup" row, a renewed
 * lease and a fresh `last_write_at` for a site nobody had changed.
 */
const SET_ONLY_WRITES = new Set(['site.identity', 'template.siteSettings', 'template.languageOverrides'])

/**
 * Whether one `content.contract` operation writes — the SAME rule as tracy-site-tools'
 * `contractOperationWrites` (site-context.mjs; tracy-web does not import site-tools, so it is ported,
 * word for word). The component reads `$p['operation'] ?? 'inspect'`, so a missing operation is an
 * inspect; and `*.plan` / `*.verify` (multilingual, demoTrim, siteLanguage, sourceLanguage) only read.
 * @param {unknown} operation
 * @returns {boolean}
 */
function contractOperationWrites(operation) {
  const op = typeof operation === 'string' ? operation.trim() : ''
  if (op === '' || op === 'inspect') return false
  return !/\.(plan|verify)$/.test(op)
}

/**
 * Does this call change the site?
 *
 * 🔒 `content.contract` IS BOTH, AND THE PARAMS SAY WHICH. An inspect lists a sealed quickstart's
 * slots and changes nothing — and the working rules ORDER an agent to call it first on such a site.
 * A site whose agent must call it first, and is locked out for calling it, cannot be worked on at
 * all. Until 27/09/2026 this read "anything that is not `inspect` writes": a call with no operation
 * (which the component answers as an inspect) and every `*.plan` / `*.verify` took the write lease,
 * so an agent's language plan locked the site against the customer's other chats for 90 s.
 *
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @returns {boolean}
 */
/**
 * What an audit row's `detail.sessionId` may be, and what `GET /api/sites/:key/applies?session=`
 * accepts: a dsh session id, or a seat key's lease identity `key:<id>` (the api host — S3 lists a
 * key's calls under it). A Tracy session TOKEN has dots and never passes — see `auditSession`.
 */
const AUDIT_SESSION_SHAPE = /^(?:key:[a-z2-7]{16}|[A-Za-z0-9_-]{1,128})$/

/**
 * The `{kind: 'additional-css', id}` a `look-css` report names (`tracy-site-tools` `index.ts`), or null:
 * a look undo id is six hex digits, nothing else is kept.
 * @param {unknown} value
 */
function lookTargetOf(value) {
  if (!value || typeof value !== 'object') return null
  const { kind, id } = /** @type {{ kind?: unknown, id?: unknown }} */ (value)
  return kind === LOOK_TARGET_KIND && typeof id === 'string' && LOOK_UNDO_ID.test(id)
    ? { kind: LOOK_TARGET_KIND, id }
    : null
}

/**
 * The `{kind, id}` an EmDash write report names (`POST /changed`), or null when it is not exactly
 * that: a collection slug and an entry id of bounded length, nothing else kept.
 *
 * C1 (04/10/2026): a delete also names `ids`, every row it removed (an entry deleted in all its
 * languages is one call and N rows), so each anonymous `delete` row EmDash logs can be matched to it by
 * id (`notTracyOwnCmsDelete`). Kept only as a list of ids of the same shape, at most
 * `WRITE_TARGET_IDS_MAX`; anything else drops the list, never the entry.
 * @param {unknown} value
 * @returns {{ kind: string, id: string, ids?: string[], title?: string, state?: 'published' | 'draft' } | null}
 */
function writeTargetOf(value) {
  if (!value || typeof value !== 'object') return null
  const { kind, id, ids, title, state } = /** @type {{ kind?: unknown, id?: unknown, ids?: unknown,
    title?: unknown, state?: unknown }} */ (value)
  const isId = (v) => typeof v === 'string' && /^[\p{L}\p{N}._:-]{1,128}$/u.test(v)
  if (typeof kind !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(kind)) return null
  if (!isId(id)) return null
  const listed =
    Array.isArray(ids) && ids.length > 0 && ids.length <= WRITE_TARGET_IDS_MAX && ids.every(isId)
      ? { ids: [...new Set(/** @type {string[]} */ (ids))] }
      : {}
  // Dev e2e 04/10 (E3.2): the entry's title as the write's own answer had it — the name Site changes
  // shows instead of a ULID. Text only, one line, capped; never looked up later.
  const named =
    typeof title === 'string' && title.replace(/\s+/g, ' ').trim() !== ''
      ? { title: title.replace(/\s+/g, ' ').trim().slice(0, WRITE_TARGET_TITLE_MAX) }
      : {}
  // E5.e5: the live state the write moved (`tracy-site-tools` `writeFacts`), which matches the publish
  // or unpublish EmDash's collector reads off the entry (`notTracyOwnCmsDelete`). Exactly one of two.
  const moved = state === 'published' || state === 'draft' ? { state } : {}
  return { kind, id: /** @type {string} */ (id), ...listed, ...named, ...moved }
}

/**
 * The refusal a write meets while another conversation holds the site's write lease (`takeWriteLease`
 * refused): who holds it, whether that is the caller's own other conversation, and how long until it
 * frees — one body for the Apply door and the host's lease door (`POST /lease/acquire`), so the host's
 * wait (`tracy-site-tools` `lease-wait.mjs`) reads both the same way.
 * @param {string} siteKey
 * @param {string | null | undefined} email - the caller's.
 * @param {{ holder: any, aheadOfYou: number, freeInMs: number | null }} lease
 */
function leaseBusyBody(siteKey, email, lease) {
  const holder = lease.holder?.holder_actor ?? 'somebody else'
  const mine = lease.holder?.holder_actor === email
  // 🔒 HOW LONG, IN SECONDS, NOT "SHORTLY". The refusal tells the agent to stop and let the
  // customer decide whether to wait — and a customer cannot decide that against the word
  // "shortly". The number is already in the row: the lease frees `WRITE_LEASE_STALE_MS` after
  // the holder's last write. It is a FLOOR, not a promise, because the holder writing again
  // pushes it out, and it is said that way rather than dressed up as an ETA.
  const freeIn = lease.freeInMs === null ? null : Math.ceil(lease.freeInMs / 1000)
  const waitLine =
    freeIn === null
      ? ''
      : ` If they stop now, the site frees in about ${freeIn} second(s) — longer if they keep writing.`
  return {
    code: 'SITE_BUSY',
    holder,
    holderIsYou: mine,
    aheadOfYou: lease.aheadOfYou,
    ...(freeIn === null ? {} : { freeInSeconds: freeIn }),
    error: mine
      ? `Another of your own conversations is changing ${siteKey} right now.`
      : `${holder} is changing ${siteKey} right now.`,
    next:
      // 🔒 NO COUNT (acceptance v4, 30/09): "say 4 other conversation(s) asked before this
      // one" was read out to a customer with nobody waiting. `aheadOfYou` is 0 or 1 now
      // (`takeWriteLease`), and the sentence says only what the row knows.
      (lease.aheadOfYou > 0
        ? 'Tell the customer who is working on the site and what you were about to change; another conversation asked before this one and goes first. Do not retry in a loop.'
        : 'Tell the customer who is working on the site and what you were about to change. This conversation is next when they finish. Do not retry in a loop.') +
      waitLine
  }
}

/** The most row ids one write report may name: an entry in every language a site may serve. */
const WRITE_TARGET_IDS_MAX = 200
/** The longest entry title a write report keeps (`tracy-site-tools` sends no more). */
const WRITE_TARGET_TITLE_MAX = 200
/** The longest request title `POST /turn` names an undone turn by: a quote for the agent, not the record. */
const UNDONE_TITLE_MAX = 160

/**
 * The Apply door's writes a record title may label (`x-tracy-write-title`): each names ONE record by
 * `{kind, id}`. Not `content.batch` (many records, one header), and never `apply.revert`, whose
 * target is the change it takes back (`{reverts}`), not a record.
 */
const WRITE_TITLE_ACTIONS = new Set([
  'content.update',
  'content.delete',
  'content.language',
  'media.upload',
  'media.delete'
])

/**
 * The record title the dsh host sends beside an Apply write (`x-tracy-write-title`,
 * `encodeURIComponent(title)`), as the write's target keeps it: one line, control characters gone,
 * capped like `writeTargetOf`'s at `WRITE_TARGET_TITLE_MAX` characters (whole code points, so a cut
 * never splits an emoji). Null for none, for a blank one, and for one that does not decode: a write
 * is never refused over its label (council D1, 20/10/2026).
 *
 * 🔒 A DISPLAY LABEL ONLY. The host read it itself from the same site, kind and id the call writes,
 * so the card under the reply and Site changes say `post “About”` instead of `post 42`; nothing reads
 * it to choose which record is written or undone, which stays the target's `{kind, id}`.
 * @param {unknown} header
 * @returns {string | null}
 */
export function writeTitleOf(header) {
  if (typeof header !== 'string' || header === '') return null
  let decoded
  try {
    decoded = decodeURIComponent(header)
  } catch {
    return null
  }
  const flat = decoded
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat === '') return null
  const points = [...flat]
  return points.length > WRITE_TARGET_TITLE_MAX
    ? points.slice(0, WRITE_TARGET_TITLE_MAX).join('').trimEnd()
    : flat
}

/** The most a `/moment` body's `reply` may carry before the door cuts it: anything longer is refused. */
const REPLY_BODY_MAX_BYTES = 64 * 1024

/**
 * `/moment`'s optional `reply` + `replyState`, as the door stores it: `null` when none was sent,
 * `false` when what was sent is not one (→ 400 `INVALID_REPLY`). The door's own cut decides
 * `truncated`; the host's state is kept otherwise.
 * @param {any} body
 * @param {unknown} turnId
 * @returns {{ text: string, state: 'full' | 'truncated' | 'interrupted' } | null | false}
 */
export function momentReply(body, turnId) {
  const raw = body?.reply
  const state = body?.replyState
  if (raw === undefined || raw === null) return state === undefined || state === null ? null : false
  if (turnId === undefined) return false
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > REPLY_BODY_MAX_BYTES) return false
  if (typeof state !== 'string' || !REPLY_STATES.has(state)) return false
  const kept = replyWithin(raw)
  if (kept === null) return null
  return { text: kept.text, state: kept.cut ? 'truncated' : /** @type {any} */ (state) }
}

/**
 * `/moment`'s optional `endReason` (ADR 0025, migration 054): how the turn ended, one of
 * `END_REASONS` — `null` when none was sent, `false` when what was sent is not one or names no turn
 * (→ 400 `INVALID_END_REASON`).
 * @param {any} body
 * @param {unknown} turnId
 * @returns {string | null | false}
 */
export function momentEndReason(body, turnId) {
  const raw = body?.endReason
  if (raw === undefined || raw === null) return null
  if (turnId === undefined || typeof raw !== 'string' || !END_REASONS.has(raw)) return false
  return raw
}

/** The most steps or tool calls one turn's `work` may name: a count past it is not a turn's. */
export const WORK_COUNT_MAX = 10_000

/**
 * `/moment`'s optional `work` (migration 114): what the turn took, read off its events by the host —
 * `{steps, calls, failedCalls}`, whole numbers, failed calls no more than calls. `null` when none was
 * sent, `false` when what was sent is not one or names no turn (→ 400 `INVALID_WORK`).
 * @param {any} body
 * @param {unknown} turnId
 * @returns {{ steps: number, calls: number, failedCalls: number } | null | false}
 */
export function momentWork(body, turnId) {
  const raw = body?.work
  if (raw === undefined || raw === null) return null
  if (turnId === undefined || typeof raw !== 'object' || Array.isArray(raw)) return false
  const count = (/** @type {unknown} */ n) =>
    Number.isInteger(n) && Number(n) >= 0 && Number(n) <= WORK_COUNT_MAX
  const { steps, calls, failedCalls } = raw
  if (!count(steps) || !count(calls) || !count(failedCalls) || failedCalls > calls) return false
  return { steps, calls, failedCalls }
}

/**
 * The id of the row a `content.update` CREATED (`id` 0), or null when it created none. The Claude
 * Cowork plugins answer `{ok, kind, id, created}`; the call's own id is 0 then, which Site changes
 * showed as `article "0"` updated (dev e2e 04/10, J5.8: article 76 on e2ef-jo, #1182).
 * @param {string} action
 * @param {any} answer
 * @returns {string | null}
 */
function createdIdOf(action, answer) {
  if (action !== 'content.update' || answer?.ok !== true || answer.created !== true) return null
  const id = answer.id
  if (Number.isInteger(id) && id > 0) return String(id)
  return typeof id === 'string' && /^[\p{L}\p{N}._:-]{1,128}$/u.test(id) && id !== '0' ? id : null
}

/**
 * What a write was aimed at, read off its params for the Site changes tab: `{kind, id, fields}`
 * with field NAMES only — never a value, since every seat may read the row (plan §5, P0
 * `audit-detail.md` §8). Null when the call names none of the three. `title`: the record's title
 * the dsh host sent (`writeTitleOf`), kept only beside a record the call names (`kind` or `id`).
 * @param {Record<string, unknown>} params
 * @param {string | null} [title]
 * @returns {{ kind?: string, id?: string, fields?: string[], title?: string } | null}
 */
function writeTarget(params, title = null, front = false) {
  const target = {}
  if (typeof params.kind === 'string' && params.kind.length <= 64) target.kind = params.kind
  if ((typeof params.id === 'string' && params.id.length <= 128) || Number.isFinite(params.id))
    target.id = String(params.id)
  const fields = params.fields
  const names = Array.isArray(fields)
    ? fields.filter((f) => typeof f === 'string')
    : fields !== null && typeof fields === 'object'
      ? Object.keys(fields)
      : []
  if (names.length > 0) target.fields = names.slice(0, 50).map((name) => name.slice(0, 64))
  if (title !== null && (target.kind !== undefined || target.id !== undefined)) target.title = title
  // The site's static front page (`x-tracy-write-front`, #257): named "the home page" on screen.
  if (front && (target.kind !== undefined || target.id !== undefined)) target.front = true
  return Object.keys(target).length > 0 ? target : null
}

/**
 * Does this call change the site? (The rule is told above `contractOperationWrites`.) Exported for the
 * test of the rule alone (`apply-door-writes.test.mjs`).
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @returns {boolean}
 */
export function changesSite(action, params) {
  if (action === 'demo.research') return params.operation === 'media.import'
  if (action === 'media.delete' && params.dry_run === true) return false
  if (APPLY_RULES.get(action) === 'read') return false
  if (APPLY_READS_ONLY.has(action)) return false
  if (action === 'content.contract') return contractOperationWrites(params.operation)
  if (action === 'content.renderedWords') return params?.operation === 'apply'
  if (SET_ONLY_WRITES.has(action)) return params?.operation === 'set'
  return true
}

/**
 * A content.read `locale` in the case the Claude Cowork plugins list it: BCP 47 subtag case (`en-gb` → `en-GB`,
 * `ZH-hant-tw` → `zh-Hant-TW`). The Claude Cowork plugins compare locales byte for byte against `site.locales`,
 * which are canonical, while every page read hands the agent the HTML `lang` attribute — lower case
 * on Joomla (`lang="en-gb"`). Measured 25/09/2026 on dev (fj1823, 1e327e701): the agent took
 * `en-gb` from `page.text`, the Claude Cowork plugin answered a bare "Invalid content query", and the turn went
 * back to contract inspects — 105 s for the hero picture. Only case changes: no tag is mapped to
 * another one (`Intl.getCanonicalLocales` would also rewrite legacy tags a site may list verbatim).
 * @param {unknown} locale
 * @returns {unknown} the same value when it is not a string
 */
export function localeCase(locale) {
  if (typeof locale !== 'string') return locale
  return locale
    .split('-')
    .map((part, at) =>
      at === 0
        ? part.toLowerCase()
        : part.length === 4
          ? part[0].toUpperCase() + part.slice(1).toLowerCase()
          : part.length === 2 || /^[0-9]{3}$/.test(part)
            ? part.toUpperCase()
            : part.toLowerCase()
    )
    .join('-')
}

/**
 * The refusal a content.read `locale` earns when the site does not list it, or null when it does.
 * The Claude Cowork plugin answers a bare "Invalid content query" for an unknown locale, and an agent that
 * guessed the tag (`en` for a site listing `en-GB`) has nothing to fix it with. Measured 25/09/2026 on
 * dev (fj1823, cbc047b5e): `{type:"page", locale:"en"}` refused, the turn fell back to contract
 * inspects, 118 s for the hero picture. Naming the site's own tags — and the one that shares the
 * language, when there is exactly one — lets the next call be the right one. Nothing is substituted:
 * the caller asked for a filter, and a different filter than it asked for is the caller's to choose.
 * @param {unknown} locale - as asked, already in BCP 47 case.
 * @param {unknown} siteLocales - `site.locales` of this site's content.read answer.
 * @returns {string | null}
 */
export function localeRefusal(locale, siteLocales) {
  if (typeof locale !== 'string' || !Array.isArray(siteLocales)) return null
  const listed = siteLocales.filter((one) => typeof one === 'string')
  if (listed.length === 0 || listed.includes(locale)) return null
  const language = locale.split('-')[0]
  const same = listed.filter((one) => one.split('-')[0] === language)
  const shown =
    listed.length > 12 ? `${listed.slice(0, 12).join(', ')} … (${listed.length})` : listed.join(', ')
  return (
    `locale ${JSON.stringify(locale)} is not one of this site's locales: ${shown}` +
    (same.length === 1 ? `; use ${JSON.stringify(same[0])}` : '')
  )
}

/** The word a person types to confirm Restore everything, in every language (as My Sites' "Delete"). */
export const RESTORE_WORD = 'restore'

/**
 * Why a Restore everything press is not confirmed, or null when it is: `confirm` must hold the word
 * {@link RESTORE_WORD} (any case, spaces around it ignored). It replaced `confirmSiteKey` (the site
 * address typed in full) on 03/10/2026, with no alias: no caller outside Tracy's own dialog yet.
 * @param {unknown} body - the press.
 * @returns {'CONFIRM_REQUIRED' | 'CONFIRM_MISMATCH' | null}
 */
export function confirmationRefusal(body) {
  const confirm = /** @type {{ confirm?: unknown }} */ (body ?? {}).confirm
  if (typeof confirm !== 'string' || confirm.trim() === '') return 'CONFIRM_REQUIRED'
  return confirm.trim().toLowerCase() === RESTORE_WORD ? null : 'CONFIRM_MISMATCH'
}

/**
 * What a refused `/_host/provision` answers the page with: the host's own body, plus a sentence for
 * the one refusal that is not a fault. `HOST_UPDATING` means a deploy is waiting to replace
 * tracy-host and has asked it to start nothing new (#295); the page shows `message` as it stands
 * (`refusalMessage` in `tracy-site-build-core`), and a bare code there reads like a broken product.
 * The creation is marked `refused` by the caller, which is what lets the same press go again.
 */
export function provisionRefusal(answer, lang = 'en') {
  const body = answer.body ?? { code: 'FLEET_REFUSED' }
  if (body.code !== 'HOST_UPDATING') return body
  return {
    ...body,
    message: translate(lang, 'api.hostUpdating')
  }
}

function lastLine(output) {
  const lines = String(output ?? '')
    .trim()
    .split('\n')
  try {
    return JSON.parse(lines[lines.length - 1] ?? '')
  } catch {
    return null
  }
}

/**
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {object} deps.config - `readConfig`'s value.
 * @param {{hostCall: Function, hostJob: Function}} deps.host - `host/client.js`, injected by the
 *   composition root the same way `workspace/seat-door.js` reaches `seats/route.js`: `sites/`
 *   cannot import a sibling domain directly (the module-graph rule), so `app.js` hands the two
 *   functions through instead.
 * @param {{ensureAccount: Function, accountByEmail: Function, grantFor: Function, grantRowFor: Function, ownersOf: Function, grantSite: Function, setGrantRole: Function, acceptGrant: Function, revokeAllGrants: Function, seatsOfSite?: Function, actingEditor: Function, actingOwner: Function, permissionsFor: Function, normalizeRole?: Function}} deps.seats
 *   The seat book's own store/role functions, injected for the same cross-domain reason as
 *   `deps.host` — every door here needs "does this account hold a grant on this site", and that
 *   question belongs to `seats/`, not `sites/`. `permissionsFor` backs the Apply door's
 *   toolset gate (ADR 0080 §1) — the fixed role → toolset table of ADR 0028.
 *   `grantRowFor`/`setGrantRole`/`acceptGrant` back `ensureSiteOwnerSeat`'s bootstrap grant (Task 7
 *   fix round 3) — see that function's own comment for why the raw, unfiltered row matters there.
 * @param {{createRepoFor: Function, deleteRepoFor?: Function, mintGitToken: Function}} deps.github - Task 7's GitHub domain
 *   (`github/route.js`), injected for the same cross-domain reason as `deps.host`/`deps.seats`:
 *   `createRepoFor` runs at job-done (spec §13.1 step 4), `mintGitToken` at provision (§13.4's
 *   "Git push token" row), `deleteRepoFor` at site delete (#338) — this file only ever sees their
 *   results, never GitHub's own API shape.
 * @param {{workspaceOfSite: Function, workspaceGrantFor: Function}} [deps.workspaces] -
 *   functions `workspaces/store.js` hands through (Task 7 fix round 2), for the job-poll door's
 *   bootstrap exception (`requireRepoDoorGrant`). Defaults to stubs answering "no such site"/"no
 *   such grant".
 * @param {{forgetWorkspaceAtDoor?: Function, revokeSeatAtDoor?: Function, archiveSessionsAtDoor?: Function}} [deps.seatDoor] -
 *   `workspace/seat-door.js`, injected by the composition root for the same module-graph reason as
 *   `deps.host`. Only the DELETE door uses it; absent, a delete still tears the site down and
 *   reports `sessions: false, sessionsReason: 'NO_DSH_DOOR', seats: false`.
 * @param {() => number} [deps.now]
 * @param {typeof fetch} [deps.fetchImpl] - overridable for tests, threaded through to both
 *   `host.hostCall`/`host.hostJob` and the artifact store's `presign`/`signedCall`.
 * @param {typeof createLocateStore} [deps.locateStoreFactory] - overridable for tests: builds the
 *   `content.locate` snapshot store from the options this router gives it.
 * @param {(c: import('hono').Context) => boolean} [deps.isApiHost] - S1 of `tasks/todo-api-public.md`:
 *   true when the request is on the api host, where the Apply door accepts a Bearer seat key and
 *   reads neither cookie nor actor. Defaults to "never".
 * @param {ReturnType<typeof import('./brief-build.js').createBriefBuilds> | null} [deps.briefs] - the
 *   work behind "Apply" in the Add site popup (`brief-build.js`), handed in by `app.js` (module
 *   graph). Absent, a `brief` in a create request is ignored and every site is made the plain way.
 * @returns {import('hono').Hono & {applyDoor: Function, applyAs: Function, resolveKeyPrincipal: Function}} the router,
 *   with `applyDoor`, `applyAs` and the api host's key resolver attached for the `/v1` layer and for
 *   the work the server does on a person's behalf (`app.js` hands them on; a domain may not import
 *   this file).
 */
export function sitesRoutes({
  pool,
  // The serving process only (server.js): pick up the syncs and pushes a restart left running.
  resumeLiveJobs = false,
  config,
  host,
  mail = null,
  mailRate = null,
  seats,
  github,
  workspaces = {
    workspaceOfSite: async () => null,
    workspaceGrantFor: async () => null
  },
  seatDoor = {},
  // The stock of CMS instances installed BEFORE a press (`inventory/allocate.js`). Injected and
  // never imported: `test/module-graph.test.mjs` refuses a cross-domain import, and `app.js` is
  // the composition root that owns the wiring. Absent — the default — is not a degraded mode: both
  // doors below then behave exactly as they did before stock existed and every create goes cold.
  inventory = null,
  // Shard beta (`shard/node.js`, handed in by `app.js`): the master's label book, the event outbox
  // and who may create sites here. Null — the default — on the master: every door as before.
  shard = null,
  // The shard beta's global label book (`shards/labels.js`), handed in by the composition root:
  // `{ hold(label, siteKey) }`. Null on a shard and on a stand without the shard tables — then a
  // label is judged by this database alone, as before.
  labels = null,
  now = Date.now,
  fetchImpl = fetch,
  // The `content.locate` snapshot store's factory. Overridable so a test can see a call reach the
  // store and hold a build until every overlapping call has joined it, instead of racing a timer.
  locateStoreFactory = createLocateStore,
  // How a site's own domain is read in DNS (`address.js`): `{ resolveTxt, resolveCname }`. Null is
  // the resolver the deployment names (`config.dnsResolver`), or the machine's own.
  dns = null,
  // The HTTPS probe of a customer's own domain (`domain-probe.js`), replaceable by a test:
  // `(row) => { status, error? }`. Left out, the real one — which, with a `dns` stand-in, resolves
  // through that stand-in and never through the machine's resolver.
  ownDomainProbe = null,
  // Cloudflare for SaaS's custom hostnames (`site-domain-provider.js` `cloudflareHostnames`), or
  // null for none. Left out, the client `config.customHostnames` describes — none when it is unset.
  customHostnames = undefined,
  // `bar/site-proxy.js` `proxySite`, threaded through (`bar/` is another domain of the module
  // graph): how a removal of an own domain asks the site as its Tracy address. Left out, that
  // check reads 'unreachable' and a removal is refused — never waved through unasked.
  siteProxy = null,
  // Whether THIS request arrived on the api host (`api.tracy.ai`), where the Apply door reads a
  // Bearer seat key and nothing else. `app.js` wires the real `hostKind` check (S2 of
  // `tasks/todo-api-public.md`); the default says "never", so every deployment that predates the
  // api host behaves exactly as before — a key is not even looked at.
  isApiHost = () => false,
  // The token this server's own preview door check sends (`lib/preview-door-health.js`); null: no check.
  doorProbeToken = null,
  // The preview door health /ops reads (`lib/preview-door-health.js`): the customer lock reads the same
  // Design system verdict /ops shows, door health included. Null under tests and when off.
  doorHealth = null,
  // The text and pictures of a site made with "Apply" (`brief-build.js`). Null is the plain road.
  briefs = null,
  // Server-held WO protocol ownership; the composition root keeps this domain independent of WO.
  qualityCreate = null,
  agentDemo = null,
  quickstartAccess = null,
  // The design system picked in the Add site form, put on the new site at the end of its build
  // (`design-system-at-create.js`). Null: the real runner below, over this router's own Design system write; a test
  // hands in one whose host and write are its own.
  designSystemsAtCreate = null,
  // The notifier (`notifications/notify.js`, spec #809): bound in by `app.js`, which owns the wiring
  // between domains. The comment doors tell mentioned people, the thread and the author through it.
  notify = async () => [],
  // Closes the invitations and requests still open on a site once it is deleted (`notify.js`).
  settleSiteNotifications = async () => 0
}) {
  const app = new Hono()
  // A backup point downloaded by its Owner (`backup-export.js`): the two export doors and the
  // site's delete reach it here, the cron's sweep through its own instance.
  const backupExports = createBackupExports({ pool, config, host, fetchImpl, now })
  // Built once, at boot: in the serving process (`resumeLiveJobs`, server.js) each picks up the syncs and
  // pushes a restart left running (#123).
  const sync = liveSync({
    pool,
    config,
    host,
    fetchImpl,
    currentComponent,
    writeComponent,
    now,
    resumeOnStart: resumeLiveJobs
  })
  const push = livePush({ pool, config, host, fetchImpl, sync, now, resumeOnStart: resumeLiveJobs })

  /**
   * The principal behind a request — `{kind, email, account, grant}` with a live grant on `siteKey`,
   * or the 401/403 Response to return directly. Three kinds: a browser session (`viewer`), the dsh
   * agent's signed actor assertion (`allowActor`), and — ONLY on the api host — a Bearer seat key.
   * The api host reads no cookie and no actor: a Bearer that fails is a refusal, never a fall-through.
   */
  async function requireGrant(c, siteKey, allowActor = false) {
    if (isApiHost(c)) return requireKeyGrant(c, siteKey)
    const session = await viewer(c, config)
    const email =
      session ??
      (allowActor ? await verifyActor(c.req.header('x-tracy-actor'), config.actorSecret, now()) : null)
    if (!email) return { error: json(c, { code: 'NOT_SIGNED_IN' }, 401) }
    const account = await seats.accountByEmail(pool, email)
    const grant = account ? await seats.grantFor(pool, account.id, siteKey) : null
    if (!grant) return { error: json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403) }
    return { kind: session ? 'session' : 'actor', email, account, grant }
  }

  /**
   * `requireGrant` for the api host (`tasks/todo-api-public.md` Q1/S1): `Authorization: Bearer
   * trk_…` → `verifyKey` → the key must name THIS site → the minter must still hold a live seat on
   * it (`grantFor`, asked every call: a revoked seat shuts every key on it at once). No header at
   * all is `NOT_SIGNED_IN` — nobody is acting, the same word every other door uses for that; a
   * header that is not a live key says why (`KEY_INVALID` · `KEY_REVOKED` · `KEY_EXPIRED`), and a
   * deployment with no pepper says so (`API_KEYS_NOT_CONFIGURED`, 503) rather than refusing every key
   * as invalid. `siteKey === null` (the `/v1/me` route: no site in the path) means the key's own
   * site — the seat is still checked there, so a key whose minter lost the seat is nobody even
   * when asking only who it is.
   */
  async function requireKeyGrant(c, siteKey) {
    const header = c.req.header('authorization')
    if (!header) return { error: json(c, { code: 'NOT_SIGNED_IN' }, 401) }
    const key = await verifyKey({ pool, header, pepper: config.apiKeyPepper ?? null, now: now() })
    if ('error' in key) {
      if (key.error === 'API_KEYS_NOT_CONFIGURED')
        return { error: json(c, { code: 'API_KEYS_NOT_CONFIGURED' }, 503) }
      if (key.error === 'KEY_REVOKED') return { error: json(c, { code: 'KEY_REVOKED' }, 401) }
      if (key.error === 'KEY_EXPIRED') return { error: json(c, { code: 'KEY_EXPIRED' }, 401) }
      return { error: json(c, { code: 'KEY_INVALID' }, 401) }
    }
    if (siteKey !== null && key.siteKey !== siteKey)
      return { error: json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403) }
    const account = await seats.accountByEmail(pool, key.email)
    const grant = account ? await seats.grantFor(pool, account.id, key.siteKey) : null
    if (!grant) return { error: json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403) }
    return { kind: 'key', email: key.email, account, grant, key }
  }

  /**
   * ADR 0067 §3's one documented bootstrap exception, ported from `handleCreateRepo`'s own grant
   * resolution (`workers/seat-registry/src/index.js:7708-7741`) — used ONLY by the job-poll door
   * below. Every other door in this file, and every door in `seats/route.js`, decides from the
   * site's own book alone (`requireGrant`); `workspaces/store.js`'s own module comment names this
   * exact door as the one place ADR 0067 still lets a workspace grant answer for a site.
   *
   * WHY JOB-POLL, WHEN THE WORKER'S EXCEPTION LIVES ON A SEPARATE DOOR. The Worker splits "poll a
   * job" (`handleProvisionJob`, plain `grantFor`) from "create this site's repo" (`handleCreateRepo`,
   * this exception) into two doors. Task 7 collapsed the second into the first on purpose (so a
   * wizard never has to press a second button) — so in THIS app, job-poll IS the repo-creation
   * door, and it must use the gate the Worker actually uses for that responsibility, not the
   * generic "any live grant" every other door keeps. The trade this makes explicit: a caller with a
   * live site grant that cannot edit (a viewer) can no longer poll a job unless they also clear this
   * gate — the same narrowing the Worker itself applies to `handleCreateRepo`, now inherited by the
   * one door in this app that does what that handler did.
   *
   * The site's own book wins outright whenever it has an editing answer (`actingEditor(grant)`: an
   * owner or an editor, who may also publish and so poll a go-live job, ADR 0028) — the
   * ordinary case, and the ONLY case from the very next call once the bootstrap below has run once
   * for this site. Only when it does NOT (no seat row at all, or a viewer's) does
   * this ask the WORKSPACE THAT OWNS THE SITE (`workspaceOfSite` — never any workspace the caller
   * happens to belong to) whether the caller is an owner or editor THERE. Refusal codes and their order are the
   * Worker's, unchanged: no grant anywhere at all (`!grant && !wsGrant`) is `SEAT_NOT_AUTHORIZED`;
   * some grant that still is not good enough is `NOT_SITE_OWNER`.
   */
  async function requireRepoDoorGrant(c, siteKey) {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return { error: email }
    const account = await seats.accountByEmail(pool, email)
    const grant = account ? await seats.grantFor(pool, account.id, siteKey) : null
    if (seats.actingEditor(grant)) return { email, account, grant }

    const owner = account ? await workspaces.workspaceOfSite(pool, siteKey) : null
    const wsGrant = owner ? await workspaces.workspaceGrantFor(pool, account.id, owner.workspace_id) : null
    if (!grant && !wsGrant) return { error: json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403) }
    if (!seats.actingEditor(wsGrant)) return { error: json(c, { code: 'NOT_SITE_OWNER' }, 403) }
    return { email, account, grant }
  }

  /**
   * The first real site seat, granted the moment this site has a working repo — ported from
   * `ensureSiteOwnerSeat`/`ensureSiteOwner` (`index.js:7550-7584`). A no-op once the site already
   * has an owner (checked fresh every call, not cached), so calling this on every successful
   * `createRepoFor` — not only a bootstrap — costs nothing on the ordinary path and is exactly what
   * closes the exception above: from the very next call, `requireRepoDoorGrant`'s own `actingEditor`
   * branch answers for this site, and the workspace is never consulted again.
   *
   * DECIDES FROM THE RAW ROW (`grantRowFor`), NOT FROM AN ACCEPTED-ONLY VIEW — fix round 3,
   * task-7-rereview-2.md's Important finding. The first version of this function took a `hadGrant`
   * boolean computed from `seats.grantFor` (accepted-only), which cannot tell "no row at all" apart
   * from "a row exists but is still a live, unaccepted invite or join request" — both read as
   * `false`. For the first, the fresh-insert branch below is correct. For the second it silently
   * did nothing: `grantSite`'s own `ON CONFLICT ... WHERE revoked_at IS NOT NULL OR declined_at IS
   * NOT NULL` matches neither a pending nor an accepted row, so the write is a no-op and `ownersOf`
   * stays empty — the bootstrap exception would then re-open on every later call for that account,
   * exactly the "closes after one use" invariant this function exists to guarantee. Reading the raw
   * row first (`alive = held && !held.revoked_at && !held.declined_at`, matching the Worker's own
   * `grantRowFor`-based check) tells the two states apart correctly: a revoked or declined row (or
   * no row) takes the fresh-grant branch, and ANY other row — pending or already accepted — is
   * upgraded in place via `setGrantRole`.
   *
   * `setGrantRole` only ever touches `role`, so a row that was still pending stays pending after the
   * upgrade unless something also accepts it — the Worker's own `ensureSiteOwner` calls
   * `acceptGrant` unconditionally as its own last step, after either branch, for exactly this
   * reason; this function does the same below, and it is required for the fresh-insert branch to
   * mean anything too (`grantSite`'s `activate: true` already accepts a BRAND NEW row, but the final
   * `acceptGrant` is what turns an upgraded PENDING row into a seat `requireRepoDoorGrant`'s
   * `actingEditor` check will actually recognize next time — without it the upgraded row would carry
   * `role: 'owner'` but no `accepted_at`, and the exception would still not close).
   */
  async function ensureSiteOwnerSeat(siteKey, accountId) {
    if ((await seats.ownersOf(pool, siteKey)).length > 0) return
    const held = await seats.grantRowFor(pool, accountId, siteKey)
    const alive = Boolean(held) && !held.revoked_at && !held.declined_at
    if (alive) {
      await seats.setGrantRole(pool, siteKey, accountId, 'owner')
    } else {
      await seats.grantSite(pool, {
        siteKey,
        accountId,
        role: 'owner',
        grantedBy: accountId,
        activate: true,
        createdByProof: 'creator'
      })
    }
    await seats.acceptGrant(pool, siteKey, accountId).catch(() => {})
  }

  /**
   * Keep an IMPORTED row's platform the one its copy is (or is about to be) built as. Measured
   * 30/09 importing tracy.ai: the wizard opens on Joomla, the first press claimed the row as
   * `joomla`, the second press (WordPress) found it already the caller's and left it alone, the
   * provision built WordPress, and the Apply door's `pairFleetCopy` refused every write because
   * `core.manifest` said `wordpress` and the row said `joomla` (`platform_mismatch`).
   *
   * While no host was asked to build the site, the row follows `platform` (`setImportPlatform`
   * holds that window in its own statement). After that the copy on the host is what the job was
   * filed as, so a different platform is refused by name (`PLATFORM_CHANGED`, naming the one on
   * record) rather than written over it: rebuilding under another platform is a teardown and a new
   * import, not a second press. A row that is not `migrated` is not this function's to change.
   *
   * @returns {Promise<{ site: object } | { refused: { code: string, platform: string | null } }>}
   */
  async function keepImportPlatform(site, platform, door, db = pool) {
    if (site.origin !== 'migrated' || site.platform === platform) return { site }
    const moved = await setImportPlatform(db, site.site_key, platform)
    if (!moved) return { refused: { code: 'PLATFORM_CHANGED', platform: site.platform ?? null } }
    console.warn(`[sites] ${site.site_key}: import platform ${site.platform} -> ${platform} (${door})`)
    return { site: moved }
  }

  async function domainTaken(c, siteKey) {
    console.warn(`[sites] domain is taken: ${siteKey}`)
    const joinPath = importJoinPath(await siteByKey(pool, siteKey))
    return json(
      c,
      {
        code: 'TAKEN',
        message: translate(requestLanguage(c), 'api.domainTaken'),
        ...(joinPath ? { joinPath } : {})
      },
      409
    )
  }

  /** On a shard, only a person the master handed here, or one invited here, creates sites. */
  async function shardOutsider(c, email) {
    if (!shard || (await shard.isMirror(email))) return null
    return json(c, { code: 'ACCOUNT_NOT_ON_SHARD', login: `${shard.masterOrigin}/login` }, 403)
  }

  /**
   * Why a shard could not claim a new name (`claimOwnership`'s `refused`). A full shard sends the
   * person to the master's `/new/?fresh=1` (contract §12): there the master does not follow
   * `tracy_shard` back here, adopts them onto another shard and hands them over.
   */
  function shardRefusal(c, refused) {
    if (refused === 'SHARD_FULL')
      return json(
        c,
        {
          code: 'SHARD_FULL',
          message: translate(requestLanguage(c), 'api.shardFull', { host: new URL(shard.masterOrigin).host }),
          createAt: `${shard.masterOrigin}/new/?fresh=1`
        },
        503
      )
    return json(c, { code: 'LABEL_REGISTRY_UNAVAILABLE' }, 503)
  }

  /**
   * Claim `siteKey`, ported from the ownership half of `handleCreateSite`: a name with no owner
   * is claimed outright; a name the caller already owns is claimed again for free (idempotent —
   * a provision that partly failed must be retriable under the same name); a name someone else
   * owns is `taken`. `on conflict do nothing` in `createSite` means a concurrent claim of the
   * same key is possible — re-read and re-check ownership rather than report a false `taken` for
   * a race the caller actually won.
   */
  async function claimOwnership({
    db = pool,
    siteKey,
    label,
    platform,
    origin,
    callerId,
    design = null,
    quickstart = null,
    wizardId = null
  }) {
    const existing = await siteByKey(db, siteKey)
    if (existing) {
      const mine = (await seats.ownersOf(db, siteKey)).some((o) => o.account_id === callerId)
      if (!mine) return { taken: true }
      // 🔒 THE ROW IS OLDER THAN THE ANSWER, ON THE ROAD CUSTOMERS ACTUALLY TAKE. A claim
      // (`/api/sites/claim`) reserves a draft address before any questionnaire is answered, so it
      // passes a design and NO quickstart; the press that follows resolves one and arrives here,
      // where the row already exists. Returning it untouched -- which is what this did -- left
      // `quickstart_tag` null for ever, and the comment on those columns in `store.js` promises
      // the opposite: "a site that failed half way through still says what it was being built
      // from, which is exactly when somebody asks". Measured 22/09/2026 on three sites built
      // through Design inspiration: all three null, all three logs naming a real tag.
      // `setQuickstart` only ever fills a blank, so a retry cannot rewrite a site's provenance.
      const filled = quickstart ? await setQuickstart(db, siteKey, quickstart) : null
      return { row: filled ?? existing, alreadyMine: true }
    }
    // 🔒 SHARD (spec §2.1 step 5, §4.4): the zone is one and the shards are many, so a NEW name is
    // held at the master before this database takes it; a full shard takes no new site at all.
    if (shard) {
      if (!(await shard.accepting())) return { refused: 'SHARD_FULL' }
      const held = await shard.reserveLabel({ label, siteKey })
      if (held.taken) return { taken: true }
      if (!held.reserved) return { refused: 'LABEL_REGISTRY_UNAVAILABLE' }
    }
    const row = await createSite(db, {
      siteKey,
      label,
      host: config.defaultHost,
      platform,
      origin,
      createdBy: callerId,
      requestedDesign: design?.requestedDesign ?? null,
      effectiveDesign: design?.workflow === 'template-build' ? null : (design?.effectiveDesign ?? null),
      designProfile: design?.workflow === 'template-build' ? null : (design?.contractProfile ?? null),
      // Written with the claim, not after the build: a site that failed half way through still
      // says what it was being built from, which is exactly when somebody asks.
      quickstartTag: quickstart?.tag ?? null,
      quickstartVersion: quickstart?.version ?? null,
      quickstartSha256: quickstart?.sha256 ?? null
    })
    if (!row) {
      const lost = await siteByKey(db, siteKey)
      const mine = lost ? (await seats.ownersOf(db, siteKey)).some((o) => o.account_id === callerId) : false
      return mine ? { row: lost, alreadyMine: true } : { taken: true }
    }
    await seats.grantSite(db, {
      siteKey,
      accountId: callerId,
      role: 'owner',
      grantedBy: callerId,
      activate: true,
      createdByProof: 'creator'
    })
    await opsFor(pool).record(
      origin === 'fleet_born' ? 'site.create' : 'site.import',
      {
        accountId: callerId,
        siteKey,
        data: {
          platform,
          design: design?.effectiveDesign ?? design?.requestedDesign ?? null,
          quickstart: quickstart ? `${quickstart.tag} ${quickstart.version}` : null,
          source: 'cold',
          ...(wizardId ? { wizard_id: wizardId } : {})
        },
        dedupeKey: `site:${siteKey}:${row.created_at?.toISOString() ?? row.id ?? 'new'}`
      },
      db
    )
    // The master points `<label>.<zone>` at this shard on hearing it (spec §2.1 step 6; amendment 5:
    // right after the row, before any provision).
    if (shard)
      await shard.emit(
        'site.created',
        { siteKey, label, platform },
        `${siteKey}@${row.created_at?.toISOString() ?? row.id ?? 'new'}`,
        db
      )
    return { row, alreadyMine: false }
  }

  /** The one deletion path for an unfinished import; the abandoned-import sweep builds the same one. */
  const removeUnfinishedImport = importRemover({ pool, config, seats, seatDoor, fetchImpl })

  async function attachSite(site) {
    return host.hostCall(config, site.host, '/attach', { label: site.label }, { fetchImpl })
  }

  /**
   * This route's own name for the shared pairing, which needs no viewer — see
   * `pair-component.js` for why, and for the sweep in `cron.js` that calls the same function with
   * its own name in `createdBy`. Here the viewer's email is what gets recorded.
   */
  const pairComponent = (site, email) =>
    pairSiteComponent({ pool, config, host, fetchImpl, site, createdBy: email })

  /**
   * ONE CONVERSATION, ONE SITE. A dsh plugin states the site folder its session stands in
   * (`x-tracy-workspace-label`), and the call is held to that site — `_conversation` in the path
   * means "whichever site that is". The seat check that follows asks about the PERSON, who may hold
   * seats on many sites. Without the header nothing changes (browser, engine).
   * @returns {Promise<{siteKey: string, error?: undefined} | {error: Response}>}
   */
  async function conversationSite(c) {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const label = c.req.header('x-tracy-workspace-label')
    if (!label) return { siteKey }
    const own = /^[a-z0-9][a-z0-9-]{0,62}$/.test(label) ? await siteByLabel(pool, label) : null
    if (!own) return { error: json(c, { code: 'CONVERSATION_SITE_UNKNOWN', label }, 404) }
    if (c.req.param('key') !== '_conversation' && siteKey !== own.site_key) {
      return {
        error: json(c, { code: 'SITE_OUTSIDE_CONVERSATION', siteKey, conversationSite: own.site_key }, 403)
      }
    }
    return { siteKey: own.site_key }
  }

  /** When each imported site's copy first failed to verify since it last did (`FLEET_COPY_WARM_MS`). */
  const copyFailingSince = new Map()

  /**
   * Move an IMPORTED site's component onto its fleet copy (`component-target.js` says why the
   * registered endpoint is the customer's live site). The copy must answer `core.manifest` with
   * the registered token and the site's own platform before anything is written; the live endpoint
   * is kept in the row as data, never dialled. Answers the credential to use, or `cred: null` and
   * WHY the copy could not be verified (`FleetCopyWhy`) — the caller refuses rather than falling
   * back to production.
   *
   * 🔒 A COLD COPY GETS A SECOND, LONGER TRY; A WRONG ONE DOES NOT. Measured 30/09/2026 on a local
   * stand: tracy.ai imported (WordPress + WooCommerce, 2,482 posts), and the agent's writes were
   * refused three times minutes after the import, while the very same `core.manifest` from inside
   * tracy-web answered in 464 ms afterwards (token matched, platform wordpress). The first manifest
   * on a copy nobody has opened walks the whole webroot with cold PHP and file caches; at 30 s it was
   * cut, and this function said only `null`, so nobody could tell a cold copy from a wrong token. A
   * timeout or an unreachable/5xx copy is tried once more with `FLEET_COPY_BUDGETS_MS[1]`: PHP keeps
   * running after the first cut, so the second call lands on caches the first one filled. An
   * answer that says no (wrong token, wrong platform, not JSON) is final on the first try.
   * @param {any} site - the site row.
   * @param {string} email - who is recorded as moving the endpoint.
   * @param {{ budgets?: readonly number[] }} [options] - the time given to each try, in order.
   * @returns {Promise<{ cred: any, why?: undefined } | { cred: null, why: FleetCopyWhy }>}
   */
  async function pairFleetCopy(site, email, { budgets = FLEET_COPY_BUDGETS_MS } = {}) {
    const cred = await currentComponent(pool, site.site_key)
    if (!cred?.config?.endpoint || !cred?.config?.token) return { cred: null, why: 'no_registered_component' }
    if (isOnCopy(cred.config.endpoint, site, config)) return { cred }
    // The registered door on the copy first, then — a Joomla copy — its other door (`copyDoorsFor`).
    const doors = copyDoorsFor(cred.config.endpoint, site, config)
    if (doors.length === 0) return { cred: null, why: 'no_copy_address' }
    /** @type {FleetCopyWhy} */
    let why = 'unreachable'
    // The copy's own token when the provision gave it one; the live token where it could not (a host
    // image from before step 4b, a copy whose prefix was not read): that copy still holds it.
    const tokens = cred.config.copyToken ? [cred.config.copyToken, cred.config.token] : [cred.config.token]
    let token = tokens[0]
    let endpoint = doors[0]
    const verify = (/** @type {string} */ at, /** @type {string} */ key, /** @type {number} */ budget) =>
      verifyCopy({ fetchImpl, endpoint: at, token: key, platform: site.platform, budgetMs: budget })
    for (const [attempt, budget] of budgets.entries()) {
      for (const door of doors) {
        endpoint = door
        why = await verify(door, token, budget)
        if (why === 'unauthorized' && token !== tokens.at(-1)) {
          console.warn(
            `[fleet-copy] ${site.label} does not hold its own token — it still holds the live site's`
          )
          token = tokens.at(-1)
          why = await verify(door, token, budget)
        }
        // Only a door that did not reach the plugin sends the call to the other door.
        if (why === 'verified' || !DOOR_WHYS.has(why)) break
      }
      if (why === 'verified') break
      console.warn(
        `[fleet-copy] ${site.label} not verified: ${why} (try ${attempt + 1}/${budgets.length}, ${budget} ms)`
      )
      if (!FLEET_COPY_TRANSIENT.has(why)) break
    }
    if (why !== 'verified') return { cred: null, why }
    // The live site's door and token, kept as data for "Sync from live" alone (never handed to the
    // agent, never dialled by anything else).
    const config_ = {
      endpoint,
      token,
      liveEndpoint: cred.config.endpoint,
      liveToken: cred.config.token,
      // The live site as its import found it (provision door): the first sync compares with it.
      ...(cred.config.importFingerprint ? { importFingerprint: cred.config.importFingerprint } : {})
    }
    await writeComponent(pool, site.site_key, config_, email)
    return { cred: { ...cred, config: config_ } }
  }

  /**
   * `{gitToken, gitRepo}` to fold into a provision instruction, or `{}` when the site has no
   * repo yet (the ordinary case: a fresh site's repo is only created after its FIRST provision
   * finishes — see the job-poll handler's own repo step below) or GitHub is not configured.
   * Ported from `handleProvision`'s own best-effort mint (ADR 0050 B): a site whose repo already
   * exists gets a fresh, contents-only, hour-long token so the host can push the webroot it is
   * about to build; a mint that fails still lets provisioning proceed, just without that push.
   */
  async function gitTokenFields(repo) {
    if (!repo) return {}
    const minted = await github.mintGitToken(config, repo, fetchImpl)
    return minted ? { gitToken: minted.token, gitRepo: repo } : {}
  }

  // Concurrent `webroot-history` reads of one site share one host job (`history-share.js`): Site
  // changes asks `/activity` and `/backups` together, and both are answered by the same read.
  const runSharedSiteJob = shareHistoryJobs(runSiteJobOnce)
  function runSiteJob(site, input, deadlineMs, onJob, options) {
    return runSharedSiteJob(site, input, deadlineMs, onJob, options)
  }

  /** One `webroot-*` job on `tracy-host`: start it, then poll until `done`/`failed`/timeout —
   * ported from `runFleetJob` (`workers/cowork-web/src/worker.js`). */
  // `onJob(jobId)`: told the host's job id as soon as the job is filed, before any poll — the
  // restore door ties its `site_operation` row to it, so a lost answer can be read back later.
  /**
   * `bounded` (opt-in): every call to the host gets what is left of `deadlineMs` as its own
   * timeout, so a host that stops answering mid-job ends the wait at the deadline (`timeout`)
   * instead of when the socket gives up minutes later (BUG-L4-2, Site changes V2 round L4).
   * Off by default: no other caller's calls get a limit they did not have.
   *
   * `file(jobId)` (opt-in): writes the job's `job` row in place of the plain `putJob` — `runOwedJob`
   * writes it in one statement with what its door owes the job (`door-follow-up.js`).
   */
  async function runSiteJobOnce(site, input, deadlineMs, onJob, { bounded = false, file } = {}) {
    const started = bounded ? now() : 0
    const left = () => (bounded ? { timeoutMs: Math.max(1, deadlineMs - (now() - started)) } : {})
    const answer = await host.hostCall(
      config,
      site.host,
      '/site',
      { ...input, label: site.label },
      { fetchImpl, ...left() }
    )
    if (answer.timedOut) return { ok: false, reason: 'timeout' }
    if (!answer.ok || typeof answer.body?.jobId !== 'string') {
      // The host's own refusal names why (`{code: 'BAD_REQUEST', why}` from its job validator); keep
      // it, so a door can tell "this file is a configuration file" from "the host is down".
      const why = typeof answer.body?.why === 'string' ? `: ${answer.body.why}` : ''
      return { ok: false, reason: `${answer.body?.code ?? 'FLEET_REFUSED'}${why}` }
    }
    const jobId = answer.body.jobId
    if (file) await file(jobId)
    else await putJob(pool, { id: jobId, siteKey: site.site_key, host: site.host, kind: input.kind })
    if (onJob) await onJob(jobId)
    // Bounded, the deadline counts from the first call (the POST included); unbounded, as before.
    const begun = bounded ? started : now()
    for (let attempt = 0; now() - begun < deadlineMs; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, JOB_WAITS_MS[attempt] ?? 700))
      const polled = await host.hostJob(config, site.host, jobId, { fetchImpl, ...left() })
      if (!polled.ok || !polled.body) continue
      await updateJob(pool, jobId, { state: polled.body.state, step: polled.body.step, detail: polled.body })
      if (polled.body.state === 'done') return { ok: true, output: String(polled.body.output ?? '') }
      if (polled.body.state === 'failed') {
        return {
          ok: false,
          reason: String(polled.body.output ?? polled.body.detail ?? 'failed')
            .trim()
            .slice(0, 200)
        }
      }
    }
    // `pending`: the host took the job and had not ended it when the wait ran out — it goes on.
    return { ok: false, reason: 'timeout', pending: true }
  }

  /**
   * One webroot job whose door has work to do with the host's answer (`door-follow-up.js`, ledger
   * L31). The work is filed with the job (one statement with its `job` row); done here, from the
   * answer, when the host ends the job within `waitMs`; and handed to the follow-up sweep when it does
   * not — the host goes on with the job, so the door's work must go on too. Bounded: the POST and
   * every poll get what is left of `waitMs`, so a host that stops answering cannot hold the door past
   * it (and past the dsh's own 15 s).
   * @param {any} site
   * @param {Record<string, unknown> & { kind: string }} input
   * @param {number} waitMs
   * @param {{ door: 'moment' | 'seal', turnId?: string | null, payload?: Record<string, unknown> }} owed
   * @returns {Promise<{ ok: boolean, output?: string, reason?: string, filed: boolean, pending: boolean }>}
   *   `runSiteJob`'s answer; `filed`: the host took the job; `pending`: still running, handed over.
   */
  async function runOwedJob(site, input, waitMs, owed) {
    /** @type {string | null} */
    let filed = null
    const job = await runSiteJob(
      site,
      input,
      waitMs,
      (jobId) => {
        filed = jobId
      },
      {
        bounded: true,
        file: (jobId) =>
          fileFollowUp(pool, {
            jobId,
            siteKey: site.site_key,
            host: site.host,
            kind: input.kind,
            waitMs,
            ...owed
          })
      }
    )
    if (filed === null) return { ...job, filed: false, pending: false }
    if (job.pending === true) {
      await handOver(pool, filed)
      return { ...job, filed: true, pending: true }
    }
    const answer = job.ok ? { state: 'done', output: job.output } : { state: 'failed' }
    await followThrough(pool, filed, owed.door, /** @type {any} */ (answer))
    return { ...job, filed: true, pending: false }
  }

  /**
   * The refusal for a request that names one of the design-system library by id while the
   * operator's switch keeps the library off, or null.
   *
   * Every door that starts a site asks this before reading the design any further: the create
   * press and its claim (through `resolveBuildRequest`), the plan and the questions the Build form
   * asks first. Only the id the caller NAMED is judged — before any default fills in — so a request
   * with no design (Joomla's `apple` default included) is nobody naming a design system. A template
   * id wins over the library copy of the same id (`ja-kinetic` is both), exactly as the doors below
   * check it first. The switch is read only when a library id is named; a switch that cannot be read
   * is off (`readDesignSystemsShown`).
   * @param {import('hono').Context} c
   * @param {any[]} readable from `readReleases`
   * @param {unknown} design the id as the caller sent it
   */
  async function designSystemsOff(c, readable, design) {
    if (typeof design !== 'string' || !DESIGNS.registry.library.ids.includes(design)) return null
    if (isTemplateId(readable, design) || (await readDesignSystemsShown(pool))) return null
    return json(c, { code: 'DESIGN_SYSTEMS_OFF', design }, 400)
  }

  // ── POST /api/sites — claim a name (or an imported address), then provision it ────────────────
  // Ported from `apiCreateSite` + `handleCreateSite` + `handleProvision`.
  // ported: handleCreateSite
  /**
   * What a request asks to build — the part `POST /api/sites/claim` and `POST /api/sites` must
   * agree on to the byte, because the claim's `payload_hash` and the press's are compared: the
   * platform, the template or the design plan, and which quickstart the fleet is told. Resolved
   * here once, so the two doors cannot drift into computing the same request two ways. The
   * releases this server has read are the one list that answers "is this a template", "which
   * release installs it" and "may this quickstart be named" (ADR 0017).
   * @param {import('hono').Context} c
   * @param {any} body
   */
  async function resolveBuildRequest(c, body) {
    const platform = typeof body.platform === 'string' ? body.platform : ''
    if (!CREATE_PLATFORMS.has(platform)) return { refused: json(c, { code: 'UNSUPPORTED_PLATFORM' }, 400) }
    // The releases this server has read — the one list that answers "is this a template", "which
    // release installs it" and "may this quickstart be named" (ADR 0017).
    const readable = await readReleases(pool)
    const off = await designSystemsOff(c, readable, body.design)
    if (off) return { refused: off }
    // A caller may name a quickstart on two grounds. Either a CONTRACT seals it — read from the
    // profiles themselves, which is what the Claude Cowork plugin will hold the finished site to — or the
    // caller's own `design` names a template card, installed as released and sealed by nothing on
    // purpose. The Joomla bases the design registry knows keep their old road: those are resolved
    // through the design plan on the fleet, against `design-templates.json`, not here.
    const namedTemplate =
      typeof body.design === 'string' && isTemplateId(readable, body.design)
        ? templateRelease(readable, platform, body.design)
        : null
    const named = readable.find((r) => r.tag === body.quickstart && r.setting?.platform === platform)
    if (
      body.quickstart &&
      body.quickstart !== namedTemplate &&
      !mayName(named, contractFor(CONTRACTS, body.quickstart, named?.setting?.version)) &&
      (platform !== 'joomla' ||
        (body.quickstart !== 'tracy-apple/j6' &&
          !Object.hasOwn(DESIGNS.registry.bases ?? {}, body.quickstart)))
    )
      return { refused: json(c, { code: 'UNSUPPORTED_QUICKSTART' }, 400) }

    // ── A TEMPLATE pressed on Design inspiration: installed as seen, on the CMS pressed ──────────────
    // `design` names a template card (Tracy Business) rather than a design system. Its quickstart
    // for this platform is the archive; there is no design to resolve and no default base to fall
    // back to — the customer asked for exactly this site. A CMS the template has no build for is
    // refused here, the same words the greyed button carried.
    let templateChosen = null
    if (typeof body.design === 'string' && isTemplateId(readable, body.design)) {
      templateChosen = templateRelease(readable, platform, body.design)
      if (templateChosen === null)
        return { refused: json(c, { code: 'UNSUPPORTED_PLATFORM', template: body.design }, 400) }
    }

    if (body.expectedQuickstartRelease !== undefined) {
      const release = readable.find((r) => r.tag === body.quickstart && r.platform === platform)
      if (
        !templateChosen ||
        templateChosen !== body.quickstart ||
        !quickstartReleaseMatches(body.expectedQuickstartRelease, quickstartReleaseIdentity(release?.setting))
      )
        return { refused: json(c, { code: 'TEMPLATE_VERSION_CHANGED' }, 409) }
    }

    // ── Which archive an EmDash site starts from ────────────────────────────────────────────
    // Not the caller's choice: EmDash has no design registry to resolve against, so the answer is
    // the environment's own setting (`/ops/cms` → Default EmDash build base), and a site created
    // before anybody pressed Save still gets the single template the catalog carries. Resolved
    // here rather than in the fleet because this process is the one that knows which database it
    // is talking to, and the fleet must be told what to install, not left to pick.
    let emdashQuickstart = templateChosen
    if (platform === 'emdash' && templateChosen === null) {
      const choices = baseChoices(
        'emdash',
        DESIGNS,
        readable.filter((r) => r.platform === 'emdash')
      )
      if (choices.options.length > 0)
        emdashQuickstart = (await readBuildBase(pool, 'emdash', choices)).quickstart
    }

    // ── Which design this site is actually built with ───────────────────────────────────────
    // The client says which inspiration was picked. It does NOT say which template, package or
    // contract profile the fleet installs — that is resolved here, from the pinned registry, and
    // an `effectiveDesign`, `quickstart` or profile sent by a caller is ignored rather than
    // trusted. `designRevision` is the only thing a caller may assert about the registry, and
    // asserting a stale one is answered with the new plan instead of a site built from it.
    //
    // 🔒 AN EMDASH SITE ACCEPTS A DESIGN AND BUILDS THE BASE TEMPLATE ANYWAY (15/09 — D35).
    // "Create with EmDash" is pressed from the inspiration library, so `design` arrives; EmDash
    // carries no theme that 152 inspirations are parameters of, so the archive it starts from is
    // the default base template and nothing resolves the inspiration. Refusing the press would be
    // the wrong answer twice over: the customer picked a CMS, not a contradiction, and the base
    // template is exactly what the fall-back rule says to build. The name they picked is kept in
    // `requestedDesign` so the site's agent can be asked for it afterwards, and it is NOT sent to
    // the fleet, which has nothing to do with it.
    let design = null
    const requestedDesign =
      platform === 'emdash' && templateChosen === null && typeof body.design === 'string' ? body.design : null
    // A brand (`brand:<host>`) on a CMS whose build can wear one: a fresh site the Build dresses
    // with the brand (`brand-plan.js`). Refused only where the Design inspiration button is grey.
    const brand =
      templateChosen === null
        ? brandPlan(body.design, platform, templateCards(readable, new Map(), CONTRACTS))
        : null
    if (brand && 'refused' in brand) return { refused: json(c, { code: brand.refused }, 400) }
    if (brand) {
      design = brand.plan
      if (typeof body.designRevision === 'string' && body.designRevision !== design.registryRevision)
        return { refused: json(c, { code: 'DESIGN_PLAN_CHANGED', plan: design }, 409) }
    }
    if (
      brand === null &&
      templateChosen === null &&
      ((body.design !== undefined && platform !== 'emdash') || (platform === 'joomla' && body.quickstart))
    ) {
      if (platform !== 'joomla') return { refused: json(c, { code: 'UNSUPPORTED_DESIGN' }, 400) }
      design = resolveDesignPlan(
        DESIGNS,
        body.design ?? DESIGNS.registry.defaultDesign,
        (await readBuildBase(pool, 'joomla', baseChoices('joomla', DESIGNS, {}))).quickstart
      )
      if (!design) return { refused: json(c, { code: 'UNKNOWN_DESIGN' }, 400) }
      if (typeof body.designRevision === 'string' && body.designRevision !== design.registryRevision)
        return { refused: json(c, { code: 'DESIGN_PLAN_CHANGED', plan: design }, 409) }
      if (body.quickstart && body.quickstart !== design.baseQuickstart)
        return { refused: json(c, { code: 'DESIGN_PLAN_CHANGED', plan: design }, 409) }
    }
    // What a TEMPLATE wears is whatever the profile sealing that release says (`design.json`
    // beside it); a release nothing seals wears none the catalogue can name. Read here, where the
    // releases are, so the record written on the site and the plan the fleet builds from agree.
    // This platform's release first; a release nothing seals falls back to what the card wears —
    // a catalogue system only, never another CMS's quickstart values (`templateDesign`).
    const worn =
      templateChosen === null
        ? null
        : (designOfRelease(CONTRACTS, readable, templateChosen) ??
          templateDesign(readable, body.design, CONTRACTS))
    return { platform, templateChosen, emdashQuickstart, design, requestedDesign, templateDesign: worn }
  }

  /**
   * The brand source a press names, as the host copies it (`{label, host}`), or null when there is
   * nothing to bring: not a brand press, no source named, the new site itself, or a source on
   * another host (the copy is one host's sites root to itself). A named source the viewer holds no
   * seat on is refused — 403, the same code as every door a seat guards.
   * @param {any} c the request context
   * @param {unknown} raw the body's `brandFrom`, a site key
   * @param {any} design the press's resolved plan
   * @param {{ id: string }} caller
   * @param {string} siteKey the site being created
   * @returns {Promise<{ label: string, host: string } | null | Response>}
   */
  async function brandSourceOf(c, raw, design, caller, siteKey) {
    if (raw === undefined || raw === null || design?.workflow !== 'brand') return null
    const host = brandHostOf(design.requestedDesign)
    const from = typeof raw === 'string' ? normalizeSiteKey(raw) : ''
    if (host === null || from === '' || from === siteKey) return null
    const grant = await seats.grantFor(pool, caller.id, from)
    const source = grant ? await siteByKey(pool, from) : null
    if (!grant || !source) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    if ((source.host ?? config.defaultHost) !== config.defaultHost) return null
    return { label: source.label, host }
  }

  function payloadHashOf(
    { platform, templateChosen, emdashQuickstart, design, requestedDesign },
    typed,
    body
  ) {
    return sha256Hex(
      JSON.stringify({
        platform,
        label: typed,
        design: design?.requestedDesign ?? requestedDesign ?? null,
        designRevision: design?.registryRevision ?? null,
        quickstart:
          templateChosen ?? (design ? design.baseQuickstart : (body.quickstart ?? emdashQuickstart ?? null))
      })
    )
  }

  /**
   * The row a template press or a design plan writes on the site: what was asked for and what is
   * installed. A template is both (D37); a plan is itself; nothing is null.
   * @param {any} asked
   * @param {any} body
   */
  function designRecordOf({ templateChosen, design, templateDesign }, body) {
    return templateChosen
      ? {
          requestedDesign: body.design,
          effectiveDesign: body.design,
          workflow: 'template',
          contractProfile: null,
          // The design system the site wears (29/09/2026), for the build to write into the
          // site folder; a plan (`resolveDesignPlan`) carries its own.
          design: templateDesign ?? null
        }
      : design
  }

  /** How many draft addresses a nameless claim draws before giving up — a collision is one in a few million. */
  const DRAFT_ADDRESS_TRIES = 5
  /**
   * A draft address: the CMS's short name and six characters nobody typed (`j-35m9pa`, see
   * `bornLabel`). Not derived from the business name (that is an answer given later, in the site)
   * and not pretty on purpose — a site is known by the name go-live gives it, and until then this is
   * what the fleet calls its folder.
   * @param {string} platform
   */
  const draftLabel = (platform) => bornLabel(platform)

  // ── POST /api/sites/claim — the press is the claim, and the site's own workspace at once ─────
  // The business name is the first question and it is the site's address, so the site can exist
  // the moment it is typed: its row, its owner seat, its folder on the host — and the customer
  // moves into `/<label>/`, where the rest of the questions, the build and the agent all live
  // (tasks/todo-claim-then-workspace.md, 15/09). Nothing is provisioned here: the press in
  // that workspace does that, through `POST /api/sites` with the same `buildId`, and finds the
  // `claimed` row this door wrote. The fingerprint is the create door's own, so the press cannot
  // quietly build something other than what was claimed.
  // ported: handleProvision
  /**
   * The credential the fleet needs to fetch `install` -- and, when it cannot be had, the sentence
   * that says why.
   *
   * 🔒 `releasesToken` ANSWERS WITH A REASON, AND THIS DOOR USED TO THROW IT AWAY. It tells three
   * states apart -- the GitHub App is not installed on the repository, GitHub refused an
   * installation token, this deployment configures neither -- and the old three-line version read
   * only `token`, omitted the field when there was none, and sent the provision anyway. The other
   * caller of the same function keeps it (`lib/release-assets.js`: `if (!token) return {ok: false,
   * reason: noToken}`); this one did not.
   *
   * 🔒 AND IT IS ASKED BEFORE THE SITE EXISTS, WHICH IS THE WHOLE POINT. `quickstart.py` refuses an
   * asset-id artifact with no token (`private quickstart requires TRACY_RELEASES_GITHUB_TOKEN on
   * the provision host`), but it runs at `fetching webroot` -- after this process has claimed the
   * name and written the row, and after `provision.sh` has taken a port, made
   * `<label>_default` and created the site directories. So a deployment that could never have
   * fetched the files still produced a half-built site, and the customer was handed a Retry: the
   * button re-runs the same unauthenticated fetch, so pressing it cannot ever work. The sentence
   * naming the real cause was in a 200-line log tail under `detail: "see <logPath>"`.
   *
   * WHEN IT IS NEEDED, MEASURED RATHER THAN ASSUMED. Only an artifact carrying a `githubAssetId`
   * is fetched through the API and needs the credential -- that is the exact condition
   * `quickstart.py` branches on. An entry whose parts are plain download URLs is public, and
   * refusing it for a missing token would refuse a provision that would have worked.
   *
   * @param {object | null} install - what `resolveInstall` answered, or null for no quickstart.
   * @returns {Promise<{ok: true, token: string | null} | {ok: false, reason: string}>}
   */
  /**
   * What a press asked for, as much of it as this door is willing to write down.
   *
   * 🔒 SHAPE-CHECKED AND CAPPED, BECAUSE IT IS CUSTOMER TEXT ON ITS WAY INTO A DATABASE COLUMN.
   * The answers are whatever the questionnaire asked, so no field list is possible here -- but a
   * bound is, and an unbounded jsonb written straight from a request body is a row somebody can
   * make arbitrarily large. What the build does with the contents is the plugin's business; this
   * only decides whether there is a press at all, and keeps the id when the rest is too big.
   */
  const pressOf = (body) => {
    const id = typeof body?.press?.id === 'string' ? body.press.id.trim() : ''
    if (id === '') return null
    const answers =
      body.press.answers && typeof body.press.answers === 'object' && !Array.isArray(body.press.answers)
        ? body.press.answers
        : undefined
    // The questionnaire the form was SERVED, kept beside the answers it judges. A press finished
    // without a browser is the road this exists for, and on that road the snapshot is the only
    // thing that can tell `start` which questions these answers belong to.
    const questionnaire =
      body.press.questionnaire &&
      typeof body.press.questionnaire === 'object' &&
      !Array.isArray(body.press.questionnaire)
        ? body.press.questionnaire
        : undefined
    const press = {
      id,
      ...(answers ? { answers } : {}),
      ...(questionnaire ? { questionnaire } : {}),
      ...(typeof body.press.targetUrl === 'string' ? { targetUrl: body.press.targetUrl } : {}),
      ...(body.press.designPlan && typeof body.press.designPlan === 'object'
        ? { designPlan: body.press.designPlan }
        : {})
    }
    return JSON.stringify(press).length > 64_000 ? { id } : press
  }

  const quickstartToken = async (install, scope) => {
    if (quickstartAccess) return quickstartAccess({ ...scope, install })
    if (!install) return { ok: true, token: null }
    const byAssetId = Object.values(install).some(
      (part) => part !== null && typeof part === 'object' && typeof part.githubAssetId === 'number'
    )
    if (!byAssetId) return { ok: true, token: null }
    const { token, reason } = await releasesToken(config, fetchImpl)
    if (token) return { ok: true, token }
    // `releasesToken` answers with a token (minted by the App, or the read-only
    // TRACY_RELEASES_GITHUB_TOKEN when there is no App or the App is not installed on the
    // releases repository, as on a shard) or with a reason. Every reason it gives is a sentence:
    // not installed and no token, installation token refused, GitHub did not answer, or neither
    // credential configured. The fallback below is for a future state that forgets to name one,
    // and it must still be a sentence somebody can act on.
    return { ok: false, reason: reason ?? 'This deployment has no credential for the releases repository.' }
  }

  app.use('/api/sites', async (c, next) => {
    const request =
      c.req.method === 'POST'
        ? await c.req.raw
            .clone()
            .json()
            .catch(() => ({}))
        : {}
    await next()
    if (c.req.method !== 'POST' || c.res.status < 500) return
    const email = await sessionFromCookieHeader(c.req.header('cookie'), config.sessionSecret, now())
    if (!email) return
    const answer = await c.res
      .clone()
      .json()
      .catch(() => ({}))
    await opsFor(pool).record('site.stuck', {
      email,
      siteKey: normalizeSiteKey(request.siteKey ?? request.key ?? '') || null,
      data: { step: 'create', reason: typeof answer.code === 'string' ? answer.code : 'INTERNAL_ERROR' }
    })
  })
  app.use('/api/sites/claim', async (c, next) => {
    const request =
      c.req.method === 'POST'
        ? await c.req.raw
            .clone()
            .json()
            .catch(() => ({}))
        : {}
    await next()
    if (c.req.method !== 'POST' || c.res.status < 500) return
    const email = await sessionFromCookieHeader(c.req.header('cookie'), config.sessionSecret, now())
    if (!email) return
    const answer = await c.res
      .clone()
      .json()
      .catch(() => ({}))
    await opsFor(pool).record('site.stuck', {
      email,
      siteKey: normalizeSiteKey(request.siteKey ?? request.key ?? '') || null,
      data: { step: 'claim', reason: typeof answer.code === 'string' ? answer.code : 'INTERNAL_ERROR' }
    })
  })
  // The import worker reports its own terminal state; a closed tab is not a lost result.
  app.post('/api/sites/:key/import-result', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const body = await c.req.json().catch(() => null)
    if (
      !body ||
      !(BUILD_ID.test(body.run_id ?? '') || /^[a-z0-9]{10,32}$/.test(body.run_id ?? '')) ||
      !['done', 'error'].includes(body.state) ||
      !Number.isFinite(body.seconds) ||
      body.seconds < 0
    )
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    const step = ['signing_in', 'installing', 'reading_content', 'reading_files', 'handing_over'].includes(
      body.step
    )
      ? body.step
      : 'import'
    const reason =
      typeof body.reason === 'string' && /^[a-zA-Z0-9_]{1,80}$/.test(body.reason)
        ? body.reason
        : 'IMPORT_FAILED'
    // Named on the stuck alert; a worker older than this field sends none and the alert says nothing.
    const platform = ['joomla', 'wordpress'].includes(body.platform) ? body.platform : undefined
    if (body.state === 'error' && /credentials|password|login|sign_in|two_factor|captcha/.test(reason))
      return json(c, { ok: true, recorded: false })
    const event = await opsFor(pool).record(body.state === 'done' ? 'site.result' : 'site.stuck', {
      email: auth.email,
      accountId: auth.account.id,
      siteKey,
      data: {
        outcome: 'exported',
        seconds: body.seconds,
        step,
        reason,
        platform,
        attempt: body.run_id,
        sign_in: importSignIn(body.sign_in),
        detail: importDiagnostic(body.detail)
      },
      dedupeKey: `import-result:${body.run_id}`
    })
    if (
      !event &&
      !(await pool.query('select 1 from ops_signal where dedupe_key = $1', [`import-result:${body.run_id}`]))
        .rowCount
    )
      return json(c, { code: 'SIGNAL_UNAVAILABLE' }, 503)
    return json(c, { ok: true, recorded: Boolean(event) })
  })

  app.get('/api/sites/import-address', importAddressHandler(pool, config, seats))

  app.post('/api/sites/claim', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const outsider = await shardOutsider(c, email)
    if (outsider) return outsider
    const body = await c.req.json().catch(() => null)
    if (!body) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const asked = await resolveBuildRequest(c, body)
    if ('refused' in asked) return asked.refused
    const buildId =
      typeof body.buildId === 'string' && BUILD_ID.test(body.buildId) ? body.buildId.toLowerCase() : null
    if (buildId === null) return json(c, { code: 'INVALID_BUILD_ID' }, 400)
    // 🔒 A CLAIM NEEDS NO NAME (15/09: B). The press is the claim: the site exists the moment
    // "Create with" is pressed, under a DRAFT address the fleet makes up, and every question —
    // the business name included — is answered in the site's own workspace. The address is a
    // draft: go-live gives the site the name it will be known by. A caller may still send a
    // label (the older road, and the tests), and it is judged as before.
    const typed = typeof body.label === 'string' ? body.label.trim().toLowerCase() : ''
    if (typed !== '') {
      const refusal =
        siteLabelRefusal(typed) ?? zoneLabelRefusal(`${config.siteAddressPrefix}${typed}`, config)
      if (refusal) return json(c, { code: 'INVALID_LABEL', reason: refusal }, 400)
    }
    const caller = await seats.ensureAccount(pool, email)

    let demoClaim = null
    if (body.workflow !== undefined) {
      try {
        const quickstart = asked.templateChosen ?? body.quickstart
        demoClaim = await agentDemo?.createContext({
          claim: true,
          accountId: caller.id,
          buildId,
          body,
          install: quickstart ? await resolveInstall(pool, quickstart) : null
        })
        if (demoClaim?.chatMode !== 'client-send/1') return json(c, { code: 'DEMO_CHAT_MODE_INVALID' }, 409)
      } catch (error) {
        return json(c, { code: error.code ?? 'AGENT_DEMO_CLAIM_REFUSED' }, 409)
      }
    }

    // The fingerprint of a nameless claim carries no label: the press that follows sends the
    // label the claim answered with, and must hash to the same request.
    const payloadHash = await payloadHashOf(asked, typed, body)
    const creationKey = { accountId: caller.id, buildId }
    const claimed = await claimCreation(pool, { ...creationKey, payloadHash })
    if (!claimed.inserted) {
      if (claimed.row.payload_hash !== payloadHash)
        return json(c, { code: 'IDEMPOTENCY_CONFLICT', buildId, siteKey: claimed.row.site_key }, 409)
      // Asked twice (a reload before the move): the same claim, handed back.
      if (claimed.row.site_key) {
        const existing = await siteByKey(pool, claimed.row.site_key)
        if (existing) {
          if (demoClaim && (await seats.grantFor(pool, caller.id, existing.site_key))?.role !== 'owner')
            return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
          // 🔒 THE FOLDER IS MADE AGAIN ON A REPLAY (local stand 24/10/2026): a first claim that owned the site
          // and then lost the host at `/reserve` left no folder, so dsh never registered the workspace and
          // every later claim of the build answered DEMO_SESSION_UNAVAILABLE. `/reserve` is idempotent: a
          // folder that holds a site is left as it is.
          const reserved = await host.hostCall(
            config,
            existing.host ?? config.defaultHost,
            '/reserve',
            { label: existing.label },
            { fetchImpl }
          )
          if (!reserved.ok)
            return json(c, reserved.body ?? { code: 'HOST_UNAVAILABLE' }, reserved.status || 502)
          const sessionId = demoClaim
            ? await sessionMadeAhead(existing, email, demoClaim.sessionId)
            : claimed.row.session_id
          if (demoClaim && sessionId !== demoClaim.sessionId)
            return json(c, { code: 'DEMO_SESSION_UNAVAILABLE' }, 503)
          if (sessionId) await updateCreation(pool, creationKey, { sessionId })
          return json(c, claimAnswer(existing, buildId, sessionId), 200)
        }
      }
    }
    // ── Warm hit: a CMS that was already installed, before this press ──────────────────────
    //
    // 🔒 ONLY A NAMELESS CLAIM MAY BE SERVED FROM STOCK. A stock instance already carries the
    // label the fleet built it under, and §3 forbids renaming it — the folder, the container and
    // every idempotency fingerprint name it. So a caller who typed a name gets the cold path
    // under that name rather than a silent rename into somebody else's label.
    //
    // 🔒 THE RELEASE IS PINNED HERE, ONCE, BEFORE ANYTHING IS HANDED OVER. `pinned` is what the
    // pool key is computed from, and — when this falls through — what the cold path below must
    // build from too. Resolving the tag a second time a moment later is how a customer ends up on
    // a version nobody measured.
    // Stock labels were never held at the master: no warm hit on a shard in the beta.
    if (inventory && typed === '' && !shard) {
      const tag =
        asked.templateChosen ??
        (asked.design ? asked.design.baseQuickstart : (body.quickstart ?? asked.emdashQuickstart ?? null))
      const pinned = tag ? await resolveInstall(pool, tag) : null
      const warm = pinned
        ? await inventory.allocateFromPool({
            pool,
            config,
            accountId: caller.id,
            buildId,
            platform: asked.platform,
            quickstartTag: tag,
            install: pinned,
            email,
            payloadHash
          })
        : { ok: false, code: 'NO_STOCK' }
      if (!warm.ok && warm.code === 'IDEMPOTENCY_CONFLICT')
        return json(c, { code: 'IDEMPOTENCY_CONFLICT', buildId, siteKey: warm.detail?.siteKey ?? null }, 409)
      if (warm.ok) {
        await updateCreation(pool, creationKey, { state: 'claimed', siteKey: warm.siteKey })
        let live
        try {
          live = await inventory.activateInstance({
            pool,
            config,
            host,
            seats,
            seatDoor,
            fetchImpl,
            instanceId: warm.instanceId,
            accountId: caller.id,
            email,
            expectedFencingToken: warm.fencingToken,
            sites: {
              pairComponent: (site) => pairComponent(site, email),
              setAttached: (key, on) => setAttached(pool, key, on)
            }
          })
        } catch (error) {
          // A network fault in the handover is a refusal a caller can read and retry, not a 500.
          // The reservation stands, so the retry resumes on the SAME instance (§5).
          live = { ok: false, code: 'ACTIVATION_THREW', detail: String(error?.message ?? error) }
        }
        if (!live.ok) {
          // A refused handover must not leave the build believing it has a site.
          await updateCreation(pool, creationKey, { state: 'refused' })
          return json(c, { code: 'INVENTORY_ACTIVATION_FAILED', reason: live.code }, 503)
        }
        const row = await siteByKey(pool, warm.siteKey)
        // The SAME answer shape as a cold claim: one address, one build, warm or cold. A caller
        // that could tell the two apart would be a caller that has to handle two flows.
        if (row) {
          await opsFor(pool).record('site.create', {
            email,
            siteKey: row.site_key,
            data: {
              platform: row.platform,
              design: row.effective_design,
              quickstart: row.quickstart_tag,
              source: 'warm'
            },
            dedupeKey: `warm:${buildId}:${row.site_key}`
          })
          await opsFor(pool).record('site.result', {
            email,
            siteKey: row.site_key,
            data: { outcome: 'done', seconds: 0 },
            dedupeKey: `warm-result:${buildId}:${row.site_key}`
          })
          return json(c, claimAnswer(row, buildId, live.sessionId), 201)
        }
      }
      // NO_STOCK and POOL_DISABLED both fall through to the cold path below, deliberately: a
      // customer waiting on an empty pool is served, and the operator sees the empty pool on Ops.
    }

    // A named claim tries its name once; a nameless one draws draft addresses until one is free.
    let claim = null
    let label = ''
    let siteKey = ''
    for (let draw = 0; draw < (typed === '' ? DRAFT_ADDRESS_TRIES : 1); draw += 1) {
      label = `${config.siteAddressPrefix}${typed === '' ? draftLabel(asked.platform) : typed}`
      siteKey = `${label}.${config.siteDomain}`
      // A label a shard holds is taken: a nameless claim draws another, a named one is refused below.
      if (labels && !(await labels.hold(label, siteKey)).ok) {
        claim = { taken: true }
        continue
      }
      claim = await claimOwnership({
        siteKey,
        label,
        platform: asked.platform,
        origin: 'fleet_born',
        callerId: caller.id,
        design: designRecordOf(asked, body)
      })
      if (claim.refused) {
        await updateCreation(pool, creationKey, { state: 'refused' })
        return shardRefusal(c, claim.refused)
      }
      if (!claim.taken) break
    }
    if (claim === null || claim.taken || (claim.alreadyMine && claimed.inserted)) {
      await updateCreation(pool, creationKey, { state: 'refused' })
      return domainTaken(c, siteKey)
    }
    await updateCreation(pool, creationKey, { state: 'claimed', siteKey })
    // The folder the workspace opens on, made now: dsh registers a seat's folder only when it
    // exists. A marker and nothing else — `provision.sh` writes the real AGENTS.md write-if-missing,
    // and one written here would tell the agent about the wrong CMS for ever.
    const reserved = await host.hostCall(config, config.defaultHost, '/reserve', { label }, { fetchImpl })
    if (!reserved.ok) return json(c, reserved.body ?? { code: 'HOST_UNAVAILABLE' }, reserved.status || 502)
    const ahead = await sessionMadeAhead(claim.row, email, demoClaim?.sessionId)
    if (demoClaim && ahead !== demoClaim.sessionId) return json(c, { code: 'DEMO_SESSION_UNAVAILABLE' }, 503)
    // 🔒 THE SESSION IS WRITTEN DOWN HERE BECAUSE THIS IS THE ONLY MOMENT IT IS KNOWN. A build is
    // OWNED by a chat session (`ownerSessionId` in the plugin's job), and the sweep that starts a
    // build nobody watched must name the SAME session this claim made ahead -- a second one would
    // run the build into a conversation the customer never opens.
    if (ahead) await updateCreation(pool, creationKey, { sessionId: ahead })
    return json(c, claimAnswer(claim.row, buildId, ahead), claim.alreadyMine ? 200 : 201)
  })

  /** The claimed site's build session, made before the browser moves (`lib/site-session-ahead.js`). */
  function sessionMadeAhead(site, email, sessionId) {
    return siteSessionAhead({ config, seatDoor, fetchImpl, site, email, sessionId })
  }

  /**
   * What the claim door answers: the site, and the address that opens its own workspace with the
   * Build tab named on it.
   * @param {any} site
   * @param {string} buildId
   */
  function claimAnswer(site, buildId, sessionId = null) {
    // 🔒 NO `inspiration=` HERE. `tracy-tab-link` reads that parameter as "a press from the public
    // page" and starts a SESSION OF ITS OWN for it — and the Build plugin is already starting one,
    // in the site's registered workspace (`claim-session.mjs`). Two sessions for one press is one
    // conversation too many, and the customer's is whichever won. `tab` and `site` still name what
    // to open, so the tab appears even if the plugin's own opener cannot run.
    // `site` and `tab` only. `platform` used to ride along, and the side card's mirror deletes it
    // on arrival (`withTabParams` — it is an intent parameter, spent on read), which was one more
    // address change on a page that had just loaded. The tab type already names the CMS.
    // 🔒 IN THE MIRROR'S OWN HAND. The side card mirrors the tab in sight onto the address as
    // `?tab=<type>&site=<key>` — `tab` first, the colons bare (`withTabParams` in
    // `@tracy/core/tab-link`) — and rewrites the address whenever what it would write differs
    // from what stands, byte for byte. `?site=…&tab=tracy%3Abuild%3A…` differed twice, and the
    // page that had just loaded was rewritten once for nothing.
    const query = `tab=tracy:build:${site.platform}&site=${encodeURIComponent(site.site_key)}`
    return {
      siteKey: site.site_key,
      label: site.label,
      buildId,
      // The folder inside dsh is the LABEL; the page the browser opens is the SITE KEY — the mount
      // `workspace/scope.js` resolves (`/<siteKey>/`), the same address the older handoff used.
      workspacePath: `/site/${site.label}`,
      // With a session made ahead the address names it, and the page loads once and settles.
      next: `/${encodeURIComponent(site.site_key)}/${sessionId ? `s/${encodeURIComponent(sessionId)}` : ''}?${query}`
    }
  }

  // ── POST /api/sites/wizard — the Add site wizard opened, or reached a page (usage U4, `tasks/todo-do-dung-that.md`) ────
  // The wizard draws an id when it opens and sends it here, then again on `POST /api/sites` as
  // `wizardId`; an opening with no create a day later is a wizard left before Create. One signal per
  // id; at most `WIZARD_OPENS_PER_HOUR` an account, so a page cannot fill the table. Never in the
  // customer's way: the wizard does not wait for the answer.
  app.post('/api/sites/wizard', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const body = await c.req.json().catch(() => null)
    const wizardId = wizardIdOf(body)
    if (wizardId === null) return json(c, { code: 'INVALID_WIZARD_ID' }, 400)
    // A page of an opening already told (`step`): its own signal, one per id and page, its own cap.
    if (body?.step !== undefined) {
      const step = typeof body.step === 'string' && WIZARD_STEPS.has(body.step) ? body.step : null
      if (step === null) return json(c, { code: 'INVALID_WIZARD_STEP' }, 400)
      if (await overLimitOrClosed(pool, `wizard-step:${email}`, WIZARD_STEPS_PER_HOUR, now(), 3_600_000))
        return json(c, { code: 'RATE_LIMITED' }, 429)
      await opsFor(pool).record('wizard.step', {
        email,
        data: { wizard_id: wizardId, step },
        dedupeKey: `wizard:${wizardId}:${step}`
      })
      return json(c, { ok: true })
    }
    const where = body?.where === 'new' || body?.where === 'site' ? body.where : null
    if (await overLimitOrClosed(pool, `wizard:${email}`, WIZARD_OPENS_PER_HOUR, now(), 3_600_000))
      return json(c, { code: 'RATE_LIMITED' }, 429)
    await opsFor(pool).record('wizard.opened', {
      email,
      data: { wizard_id: wizardId, ...(where ? { where } : {}) },
      dedupeKey: `wizard:${wizardId}`
    })
    return json(c, { ok: true })
  })

  // ported: handleProvision
  app.post('/api/sites', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const outsider = await shardOutsider(c, email)
    if (outsider) return outsider
    const body = await c.req.json().catch(() => null)
    if (!body) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const asked = await resolveBuildRequest(c, body)
    if ('refused' in asked) return asked.refused
    const { platform, templateChosen, emdashQuickstart, design, requestedDesign } = asked
    // The design system picked in the Add site form (12/10/2026): judged here, before anything is claimed, so a
    // pick nobody may wear is a 400 that leaves no site behind. Kept on the site and applied at the end of its build.
    const systemPicked =
      body.origin !== 'import' && body.designSystem !== undefined
        ? await dsDoors.checkSystem(body.designSystem)
        : null
    if (systemPicked && !systemPicked.ok) return json(c, { code: systemPicked.code }, 400)
    // The customer lock: a pick for a template customers may not wear a system on is refused here too, so a stale
    // form or a hand-made request leaves no site behind (`lib/design-system-customer-lock.js`).
    if (systemPicked) {
      const locked = await dsDoors.lockedAtCreate({
        email,
        platform,
        tag:
          templateChosen ?? (design ? design.baseQuickstart : (body.quickstart ?? emdashQuickstart ?? null))
      })
      if (locked) return json(c, { code: DS_TEMPLATE_LOCKED }, 403)
    }
    const caller = await seats.ensureAccount(pool, email)

    const buildId =
      typeof body.buildId === 'string' && BUILD_ID.test(body.buildId) ? body.buildId.toLowerCase() : null
    if (body.buildId !== undefined && buildId === null) return json(c, { code: 'INVALID_BUILD_ID' }, 400)
    const chosenQuickstart =
      templateChosen ?? (design ? design.baseQuickstart : (body.quickstart ?? emdashQuickstart ?? null))
    const install = chosenQuickstart ? await resolveInstall(pool, chosenQuickstart) : null
    if (
      body.expectedQuickstartRelease !== undefined &&
      !quickstartReleaseMatches(body.expectedQuickstartRelease, quickstartReleaseIdentity(install))
    )
      return json(c, { code: 'TEMPLATE_VERSION_CHANGED' }, 409)
    let agentDemoContext = null
    try {
      agentDemoContext =
        (await agentDemo?.createContext({ accountId: caller.id, buildId, body, install })) ?? null
      if (body.workflow !== undefined && !agentDemoContext)
        return json(c, { code: 'DEMO_WORKFLOW_INVALID' }, 400)
    } catch (error) {
      return json(c, { code: error.code ?? 'AGENT_DEMO_CREATE_REFUSED' }, 409)
    }
    let qualityContext = null
    try {
      qualityContext =
        (await qualityCreate?.context({
          accountId: caller.id,
          buildId,
          body,
          install,
          actionId: c.req.header('X-Tracy-WO-Action'),
          token: c.req.header('X-Tracy-WO-Fence')
        })) ?? null
    } catch (error) {
      return json(c, { code: error.code ?? 'QUALITY_CREATE_REFUSED' }, 409)
    }
    if (body.origin === 'import') {
      // Import claims a name and stops — the archive isn't in the store yet, so a provision here
      // would build an empty site over the one about to be brought in.
      const given = typeof body.siteKey === 'string' ? normalizeSiteKey(body.siteKey) : ''
      if (!given) return json(c, { code: 'INVALID_SITE_KEY' }, 400)
      if (given === config.siteDomain || given.endsWith(`.${config.siteDomain}`)) {
        return json(c, { code: 'INVALID_SITE_KEY' }, 400)
      }
      const claim = await claimOwnership({
        siteKey: given,
        label: await fleetLabel(given, config.siteDomain),
        platform,
        origin: 'migrated',
        callerId: caller.id
      })
      if (claim.refused) return shardRefusal(c, claim.refused)
      if (claim.taken) return domainTaken(c, given)
      // A Remove has taken this import (`import-remove.js`): no start, retry or Continue under it.
      if (claim.alreadyMine && claim.row.removing_at) return json(c, { code: IMPORT_REMOVING }, 409)
      // The claim's own activity, which the abandoned-import sweep reads (`cron.js`), and this press's
      // identity for the host (`pressImportClaim`, #1665).
      const { idleMs, press, pressBefore } = await pressImportClaim(pool, given)
      // A second press is the person's latest choice of platform, not a replay of the first.
      if (claim.alreadyMine) {
        const kept = await keepImportPlatform(claim.row, platform, 'claim')
        if ('refused' in kept) return json(c, kept.refused, 409)
      }
      return json(
        c,
        {
          siteKey: given,
          ...(press ? { press } : {}),
          ...(claim.alreadyMine ? { alreadyMine: true, idleMs, pressBefore } : {}),
          ...((await importClaimRetryable(pool, claim.row)) ? { retryable: true } : {})
        },
        claim.alreadyMine ? 200 : 201
      )
    }

    // Two names, on purpose. `typed` is what the person actually put in the box, and it is what
    // `siteLabelRefusal` judges — so a dev deployment's own prefix can never turn a legal name
    // into an illegal one, or the reverse. `label` is what the fleet builds: the address, the
    // container names (`<label>-web-1`), the site directory. See `config.siteAddressPrefix`.
    //
    // ⚠ THE PREFIX BELONGS TO THIS BRANCH ONLY. The `import` branch above keeps the CUSTOMER's
    // own address (`fijitrips.example`) — putting a prefix on that is renaming somebody else's
    // domain. Same line the Worker draws (`seat-registry/src/index.js:1156`).
    const typed = typeof body.label === 'string' ? body.label.trim().toLowerCase() : ''
    // The zone's own names for customers' own domains are nobody's site (`zoneLabelRefusal`).
    const refusal = siteLabelRefusal(typed) ?? zoneLabelRefusal(`${config.siteAddressPrefix}${typed}`, config)
    if (refusal) return json(c, { code: 'INVALID_LABEL', reason: refusal }, 400)
    const label = `${config.siteAddressPrefix}${typed}`
    const siteKey = `${label}.${config.siteDomain}`
    // One label across this master and every shard (spec §3.2): a name a shard holds or uses is
    // taken here too, with the answer a taken name always had.
    if (labels && !(await labels.hold(label, siteKey)).ok) return domainTaken(c, siteKey)
    if (qualityContext) {
      try {
        await qualityCreate.brief({
          siteKey,
          context: qualityContext,
          platform,
          quickstart: chosenQuickstart
        })
      } catch (error) {
        return json(c, { code: error.code ?? 'QUALITY_CREATE_REFUSED' }, 409)
      }
    }

    // The site a brand press brings its brand from (ADR 0023, "Addendum 30/09"): the brand engine
    // extracted it into THAT site's folder, and the new site is built in its own, where the Build
    // looks for `Brand/<host>/tokens.css`. The host copies it after the provision — but only from a
    // site this viewer holds a seat on, checked here before anything is claimed.
    const brandFrom = await brandSourceOf(c, body.brandFrom, design, caller, siteKey)
    if (brandFrom instanceof Response) return brandFrom

    // ── One logical build per press (`009-site-creation.sql`) ────────────────────────────────
    // `buildId` is the Build tab's own name for this press, kept through its retries. With it,
    // this door is idempotent: the same request asked again (a double press, a reload, a lost
    // response) gets the same site and the same job; a request that changed its mind under the
    // same id gets a conflict; a request racing a first one waits. Older clients without an id
    // share a stable logical build for this account and domain.
    const payloadHash = await payloadHashOf(asked, typed, body)
    // Older clients still get one logical build per account and domain.
    const creationId = buildId ?? `legacy:${siteKey}`
    const creationKey = { accountId: caller.id, buildId: creationId }
    let attempt = 1
    let retryFailedCreation = false
    if (creationKey) {
      const claimed = await claimCreation(pool, { ...creationKey, payloadHash })
      let row = claimed.row
      // A build whose site was deleted since: a new life for the same id, not a replay of the old.
      if (!claimed.inserted && row.job_id && !row.site_key) {
        const restarted = await restartDeletedCreation(pool, creationKey, payloadHash)
        if (!restarted) return json(c, { code: 'CREATE_PENDING', buildId, siteKey }, 202)
        row = restarted
        attempt = row.attempt + 1
      } else if (!claimed.inserted) {
        // 🔒 A BUILD ALREADY STANDING ON A WARM INSTANCE IS NOT PROVISIONED A SECOND TIME. §5:
        // "POST create must recognise a creation already provisioned". Its `site_key` is the STOCK
        // label, which the claim drew — so neither `row.site_key === siteKey` below (the label
        // this press computed is a different one) nor the nameless-hash test can recognise it.
        // Without this branch the press that follows a warm claim answers IDEMPOTENCY_CONFLICT;
        // and in the case where the two labels DID coincide it would install a second CMS over
        // the one the customer was handed a moment ago.
        const warmRow =
          inventory && row.site_key ? await inventory.instanceBySiteKey(pool, row.site_key) : null
        if (warmRow && (warmRow.state === 'assigning' || warmRow.state === 'assigned')) {
          const standing = await siteByKey(pool, row.site_key)
          return json(
            c,
            {
              siteKey: row.site_key,
              buildId,
              attempt: row.attempt,
              warm: true,
              reused: true,
              ...(standing ? { workspacePath: `/site/${standing.label}` } : {})
            },
            200
          )
        }
        // The press claimed this site with no name (B: the address is a draft, the name is
        // answered in the site); the answers now carry one, so the hash moved — same build.
        // 🔒 IN EVERY STATE, not only `claimed`: the stored hash stays the nameless one for the
        // row's whole life, so a retry after a FAILED provision (or a reload while it runs) sends
        // the same draft label and was refused 409 — measured 23/09/2026 on the local stand. The
        // two tests below still prove it is this build: same draft address, same nameless answers.
        const nameless =
          row.site_key === siteKey && row.payload_hash === (await payloadHashOf(asked, '', body))
        if (row.payload_hash !== payloadHash && !nameless) {
          if (!buildId) return domainTaken(c, siteKey)
          return json(c, { code: 'IDEMPOTENCY_CONFLICT', buildId, siteKey: row.site_key }, 409)
        }
        if (row.state === 'claimed') {
          row = await updateCreation(pool, creationKey, { state: 'claiming' })
        } else if (row.job_id) {
          // An attempt exists. Handed back as it stands unless it FAILED — then this request is
          // the retry: one more attempt of the same build, never a second site.
          const job = await jobById(pool, row.job_id)
          if (job?.state !== 'failed') {
            const existing = await siteByKey(pool, row.site_key)
            return json(
              c,
              {
                siteKey: row.site_key,
                jobId: row.job_id,
                buildId,
                attempt: row.attempt,
                reused: true,
                ...(design ? { design } : {}),
                ...(design?.workflow === 'template-build' && existing
                  ? { workspacePath: `/site/${existing.label}` }
                  : {})
              },
              202
            )
          }
          row = await updateCreation(pool, creationKey, { state: 'claiming' })
          attempt = row.attempt + 1
          retryFailedCreation = true
        } else {
          // Mid-claim: a first request holds the row and is talking to the host. Wait — unless it
          // died, in which case the row is stale and this request takes it over (atomically: of
          // two takers exactly one gets the row).
          const taken = await takeOverCreation(pool, creationKey, CLAIM_STALE_MS)
          if (!taken) return json(c, { code: 'CREATE_PENDING', buildId, siteKey: row.site_key }, 202)
          row = taken
          attempt = row.attempt + 1
        }
      }
    }

    // Resolved before the claim, so the site row can say what it was built from from the first
    // moment it exists (ADR 0017).
    // The answers the customer typed, travelling with the press that starts the provision. An
    // absent press is the ordinary shape for every caller that is not the Build form.
    const press = pressOf(body)
    // Which profile seals what is about to be installed, and therefore which Claude Cowork plugin the
    // site needs. This process is the only one that can answer: the profiles are files it reads at
    // boot, and no fleet script has them. A card with no profile answers null and the flag is
    // omitted, which is the right answer for a site that binds nothing.
    const sealing = chosenQuickstart ? contractFor(CONTRACTS, chosenQuickstart, install?.version) : null
    // 🔒 REFUSED HERE, WHERE NOTHING HAS BEEN CREATED YET -- see `quickstartToken`. Everything
    // below this line makes something somebody has to clean up: the claim writes the site row, and
    // the fleet then takes a port, a subnet and three directories. Nothing tears a failed
    // provision down (`/teardown` is only reached by a person deleting the site), so a refusal
    // that arrives one line later is a refusal that leaves debris and a Retry that cannot work.
    const credential = await quickstartToken(install, {
      accountId: caller.id,
      email,
      label,
      siteKey,
      quickstart: chosenQuickstart,
      platform,
      buildId
    })
    if (!credential.ok) {
      if (creationKey) await updateCreation(pool, creationKey, { state: 'refused' })
      return json(
        c,
        { code: 'QUICKSTART_UNREACHABLE', quickstart: chosenQuickstart, reason: credential.reason },
        503
      )
    }
    // One database owns the namespace, even when multiple web replicas accept requests.
    // Keep the lock on its own connection through host acceptance and job recording.
    const provisionLock = await pool.connect()
    const lockName = `site-provision:${siteKey}`
    const { rows: lockRows } = await provisionLock.query(
      'select pg_try_advisory_lock(hashtextextended($1, 0)) as locked',
      [lockName]
    )
    if (!lockRows[0].locked) {
      provisionLock.release()
      if (creationKey) await updateCreation(pool, creationKey, { state: 'refused' })
      return domainTaken(c, siteKey)
    }
    try {
      const pool = provisionLock
      // 🔒 EVERY REFUSAL COMES BEFORE THE CLAIM, SO A REFUSAL WRITES NOTHING. A fresh press must never
      // reinstall an occupied site, including the owner's own; only a retry of the recorded failed
      // build may replace its failed provision attempt. This test used to run AFTER the claim and
      // count any provision job ever filed under the name — the deleted site's included — so a
      // deleted name answered 409 TAKEN and still left a new site row and owner seat behind, with
      // no job and no container (measured 09/10/2026 on dev). Under the provision lock, so nothing
      // files a job between this look and the claim.
      if (!retryFailedCreation && (await provisionedInPlace(pool, siteKey))) {
        if (creationKey) await updateCreation(pool, creationKey, { state: 'refused' })
        return domainTaken(c, siteKey)
      }
      const claim = await claimOwnership({
        db: pool,
        siteKey,
        label,
        platform,
        origin: 'fleet_born',
        callerId: caller.id,
        // Usage (U4): which opening of the Add site wizard this press came from.
        wizardId: wizardIdOf(body),
        quickstart: install
          ? {
              tag: chosenQuickstart,
              version: install.version,
              // The checksum of the part a build starts from — the first one the entry names.
              sha256:
                Object.values(install).find((p) => p && typeof p === 'object' && p.sha256)?.sha256 ?? null
            }
          : chosenQuickstart
            ? { tag: chosenQuickstart, version: null, sha256: null }
            : null,
        // A template is recorded as both asked-for and installed: it is exactly what the customer
        // saw, and there is no contract profile because nothing is locked.
        design: designRecordOf(asked, body)
      })
      if (claim.refused) {
        if (creationKey) await updateCreation(pool, creationKey, { state: 'refused' })
        return shardRefusal(c, claim.refused)
      }
      if (claim.taken) {
        if (creationKey) await updateCreation(pool, creationKey, { state: 'refused' })
        return domainTaken(c, siteKey)
      }
      if (creationKey) await updateCreation(pool, creationKey, { siteKey })

      // A template wears what its sealing profile names (ADR 0023). Until 19/10/2026 that record was computed above
      // (`designRecordOf`) and dropped — the fleet carries only the id, and only the plugin Build path wrote
      // `site_design` — so every site made here told its agent "none bound" (measured on stand wo2: three Tracy Base
      // demos, their agents overriding every `--ds-c-*` with colours read off Facebook photos). Written once, before
      // the fleet is asked, and never over a later record (`writeSiteDesignIfAbsent`); the lane copies it into the
      // site folder at the agent's next turn (`design-sync.mjs`). Nothing to write is said, never guessed.
      if (templateChosen) {
        const worn = provisionDesignRecord(
          { platform, templateDesign: asked.templateDesign },
          { tokensFor, nameFor }
        )
        if (worn.record)
          await writeSiteDesignIfAbsent(pool, siteKey, worn.record, `provision:${buildId ?? 'legacy'}`)
        else
          console.info(
            `[sites] ${siteKey}: no design record at provision (${worn.skipped}, ${templateChosen})`
          )
      }

      // 🔒 BOTH OF THESE OR THE SITE IS BUILT UNDER THE WRONG HOSTNAME, AND NOTHING SAYS SO.
      // `provision.sh` has to name the address somewhere, and with neither flag it falls back to
      // `https://<label>.tracy.ai` — a literal, from the days when there was one deployment. On the
      // dev machine that produced a WordPress whose `siteurl`/`home` said `devsmoke1.tracy.ai`
      // (every font, script and image 503'd from a domain this site does not live on, `/wp-admin/`
      // bounced to the internal container name) and an `AGENTS.md` telling the agent it worked on
      // `devsmoke1.tracy.ai`. Measured 11/09, on a site whose creation reported `ready`.
      //
      // This process is the only party that knows this deployment's domain, so it says it rather
      // than letting a shell script guess:
      //   `siteKey` → what the seat book calls the site, which is what AGENTS.md prints;
      //   `liveSite` → the address it answers at, which is what WordPress writes into its options.
      // Both flags already existed for the import branch (`PROVISION_FLAGS`); only the create branch
      // was leaving them off.
      const instruction = {
        site: siteKey,
        siteKey,
        liveSite: bornSiteAddress(label, config),
        label,
        platform,
        fresh: true,
        ...(chosenQuickstart ? { quickstart: chosenQuickstart } : {}),
        // What that tag resolves to on THIS server: the files, with their checksums, as the release
        // declared them (ADR 0017). The host writes them to a file of its own and points
        // `quickstart.py` at it, so the fleet installs exactly what this process read and no host
        // holds a second copy of the catalogue.
        ...(install ? { quickstartEntry: install } : {}),
        // With an entry goes the token the host needs to fetch it: the repo is private and the host
        // keeps no credential of its own (`scripts/quickstart-token.mjs` says why).
        ...(credential.token ? { releasesToken: credential.token } : {}),
        // The design the CUSTOMER asked for, plus the registry revision this process resolved it
        // against. Not the effective design: the fleet re-resolves from its own copy of the same
        // file and refuses if the revision disagrees, so there is one resolver of record and a
        // skew between the two halves is loud instead of silent.
        // A brand plan is not the fleet's to resolve (it resolves Joomla designs only): the Build
        // wears the brand, so the fleet hears nothing of it.
        ...(design && design.workflow !== 'brand'
          ? { design: design.requestedDesign, designRevision: design.registryRevision }
          : {}),
        // 🔒 THE CLAUDE COWORK PLUGIN THE SEAL NEEDS, OR THE BIND FAILS AT THE VERY END OF A GOOD PROVISION.
        // `provision.sh` installs the newest Cowork above a floor, and its default floor (0.8.19)
        // admits 0.12.0 — a build with no `content.contract` action, which is exactly what binding a
        // profile calls. Every Joomla profile needs 0.14.0 or newer. Measured 19/09 on `site-lp4yub`:
        // the site stood up healthy and the job died at `Quickstart contract binding failed`.
        ...(sealing?.coworkMinVersion ? { coworkMinVersion: sealing.coworkMinVersion } : {}),
        ownerEmail: email,
        ...(brandFrom ? { brandFrom } : {}),
        // The host's own idempotency key for THIS attempt (`keyedJobId` in tracy-host): asked twice,
        // the host answers the same job and runs `provision.sh` once.
        jobKey: `${caller.id}:${creationId}:${attempt}`,
        ...(await gitTokenFields(claim.row.repo))
      }
      const answer = await host.hostCall(config, config.defaultHost, '/provision', instruction, { fetchImpl })
      if (!answer.ok || typeof answer.body?.jobId !== 'string') {
        if (creationKey) await updateCreation(pool, creationKey, { state: 'refused' })
        return json(c, provisionRefusal(answer, requestLanguage(c)), answer.status || 502)
      }
      await putJob(pool, { id: answer.body.jobId, siteKey, host: config.defaultHost, kind: 'provision' })
      // The popup's "Apply": the text and pictures are made WHILE the host installs the site and written
      // the moment it is up (`brief-build.js`). "I will do it later" sends no brief and this does nothing.
      // `start` never throws and never waits: the site is answered 202 exactly when it would have been.
      const brief =
        briefs && !qualityContext && !agentDemoContext
          ? await briefOfPress(body.brief, platform, chosenQuickstart, { accountId: caller.id, siteKey })
          : null
      if (brief)
        await briefs.start({
          siteKey,
          accountId: caller.id,
          email,
          label,
          platform,
          quickstart: chosenQuickstart,
          contract: sealing,
          brief,
          jobId: answer.body.jobId,
          host: config.defaultHost
        })
      // The design system picked in the form: kept on the site, and put on it by this server once the install and the
      // brief are done (`design-system-at-create.js`). Never waits: the site is answered 202 exactly as before.
      const systemKept =
        systemPicked?.ok === true
          ? await dsAtCreate.start({
              siteKey,
              accountId: caller.id,
              email,
              id: systemPicked.id,
              name: systemPicked.name,
              jobId: answer.body.jobId,
              host: config.defaultHost
            })
          : null
      if (creationKey) {
        await updateCreation(pool, creationKey, {
          state: 'provisioning',
          siteKey,
          jobId: answer.body.jobId,
          // What this press asked for, kept where no browser is needed to remember it. The press
          // itself still starts the build the moment its own poll says `done`; this is what lets the
          // sweep finish the job when that poll dies with its page (`startUnwatchedBuilds`).
          ...(press ? { press } : {}),
          attempt
        })
      }
      return json(
        c,
        {
          siteKey,
          jobId: answer.body.jobId,
          ...(buildId ? { buildId, attempt } : {}),
          ...(design ? { design } : {}),
          // What was pressed, and what was actually built — said out loud rather than implied by
          // silence, because they differ here and the screen must not read as "Artistic was applied".
          ...(requestedDesign ? { requestedDesign, builtFrom: emdashQuickstart, designApplied: false } : {}),
          ...(templateChosen ? { template: body.design, builtFrom: templateChosen } : {}),
          ...(design?.workflow === 'template-build' ? { workspacePath: `/site/${label}` } : {}),
          ...(systemKept
            ? {
                designSystem: {
                  id: systemKept.system_id,
                  name: systemKept.system_name,
                  state: systemKept.state
                }
              }
            : {})
        },
        202
      )
    } finally {
      try {
        await provisionLock.query('select pg_advisory_unlock(hashtextextended($1, 0))', [lockName])
      } finally {
        provisionLock.release()
      }
    }
  })

  // ── GET /api/sites/design-plan — what a design will actually build, before anyone presses ────
  // The Build form asks this while the customer is still filling it in, so a design with no Joomla
  // template of its own can say "this will be built with Apple" ABOVE the button rather than as a
  // failed stage afterwards. Read-only and it claims nothing: no row is written, no name reserved.
  app.get('/api/sites/design-plan', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const platform = c.req.query('platform') ?? 'joomla'
    const asked = c.req.query('design') ?? ''
    const readable = await readReleases(pool)
    const off = await designSystemsOff(c, readable, asked)
    if (off) return off
    // A template card: the plan is the template itself on this platform, or a refusal naming the
    // platform the template has no build for — the same answer the create door gives.
    if (isTemplateId(readable, asked)) {
      const quickstart = templateRelease(readable, platform, asked)
      if (quickstart === null) return json(c, { code: 'UNSUPPORTED_PLATFORM', template: asked }, 400)
      return json(
        c,
        {
          plan: {
            requestedDesign: asked,
            effectiveDesign: asked,
            baseQuickstart: quickstart,
            workflow: 'template',
            fallback: false,
            registryRevision: 'template',
            // The design system the template wears, from its sealing profile — so the form can
            // say "wears Apple" above the button, the way it says "built with Apple" for a plan.
            design:
              designOfRelease(CONTRACTS, readable, quickstart) ?? templateDesign(readable, asked, CONTRACTS),
            // A card that is also a registry design with no second edition is still built in ONE
            // language; the Joomla stages read this off the plan the press carries.
            ...(platform === 'joomla' && oneLanguageDesign(DESIGNS.registry, asked)
              ? { multilingual: false }
              : {})
          }
        },
        200
      )
    }
    // A brand: the same answer the create door gives (`brand-plan.js`).
    const brand = brandPlan(asked, platform, templateCards(readable, new Map(), CONTRACTS))
    if (brand && 'refused' in brand) return json(c, { code: brand.refused }, 400)
    if (brand) return json(c, { plan: brand.plan }, 200)
    if (platform !== 'joomla') return json(c, { code: 'UNSUPPORTED_DESIGN' }, 400)
    const plan = resolveDesignPlan(
      DESIGNS,
      c.req.query('design') ?? DESIGNS.registry.defaultDesign,
      (await readBuildBase(pool, 'joomla', baseChoices('joomla', DESIGNS, {}))).quickstart
    )
    if (!plan) return json(c, { code: 'UNKNOWN_DESIGN' }, 400)
    return json(c, { plan }, 200)
  })

  // ── POST /api/sites/brief/rewrite — "AI rewrite" under a long answer of the Add site popup ──────
  // Always answers with something for the box (`lib/brief-rewrite.js`): the owner's words said again
  // (at most ten words longer, at most fifty in all), one sample sentence of about ten words when they
  // wrote nothing or nothing that means anything, or — `again`, the owner pressed twice with no edit
  // in between — a new wording of the same length. Claims nothing and keeps nothing. It spends the
  // deployment's model budget, so it is signed-in only and capped per person per hour; the cap fails
  // CLOSED when the bucket cannot be read.
  /** Longest one rewrite press may take, all tries together. */
  const REWRITE_CEILING_MS = 90_000
  app.post('/api/sites/brief/rewrite', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const body = await c.req.json().catch(() => null)
    const text = typeof body?.text === 'string' ? body.text : ''
    // One line only: a question with line breaks is how a caller writes its own instructions into the prompt.
    const question = typeof body?.question === 'string' ? body.question.replace(/\s+/g, ' ').trim() : ''
    const again = body?.again === true
    const model = await modelForDoor(pool, 'web', config)
    if (!model)
      return json(
        c,
        { code: 'MODEL_NOT_CONFIGURED', message: 'Rewriting with AI is not switched on here yet.' },
        503
      )
    const rate = await overLimitDetail(
      pool,
      `brief-rewrite:${email}`,
      BRIEF_REWRITE_LIMIT_PER_HOUR,
      now()
    ).catch(() => ({ over: true, retryAfterS: 60 }))
    // 🔒 AND THE DEPLOYMENT'S OWN CEILING: thirty a person is no bound when anyone can sign up.
    const all = rate.over
      ? rate
      : await overLimitDetail(pool, 'brief-rewrite:all', BRIEF_REWRITE_LIMIT_ALL_PER_HOUR, now()).catch(
          () => ({ over: true, retryAfterS: 60 })
        )
    if (all.over && !rate.over) Object.assign(rate, all)
    if (rate.over) {
      c.header('Retry-After', String(rate.retryAfterS))
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }
    // 🔒 One press may not run for minutes (three tries a call, a repair round) and must stop when
    // the person closes the popup: both the request's own signal and a ceiling end it.
    const signal = AbortSignal.any(
      [c.req.raw.signal, AbortSignal.timeout(REWRITE_CEILING_MS)].filter(Boolean)
    )
    // The person's interface language (the first tag of Accept-Language), for a sample with no question.
    const language = (c.req.header('accept-language') ?? 'en').split(',')[0].trim()
    const done = await rewriteBrief({ text, question, again, model, fetchImpl, signal, language })
    if (!done.ok) return json(c, { code: done.code, message: done.message }, 502)
    return json(
      c,
      { text: done.text, words: done.words, sourceWords: done.sourceWords, mode: done.mode },
      200
    )
  })

  // ── GET /api/sites/questions — what a new site of this CMS will be asked, before anyone presses ─
  // Always the CMS's standard file (D11, lib/build-questions.js), fitted to the archive the site starts from
  // (D7, lib/fit-questions.js): the logo tiles of its template profile, its own pages, and the logo and favicon
  // questions only while brand uploads are on. Every template answers `languages: 'one'` (D10). Which archive:
  // resolved the way the create door will resolve it — a template card by its id, Joomla through the design plan,
  // EmDash and WordPress from the quickstart the caller names (EmDash: else its default base) — so the form asks
  // exactly what the build reads.
  // Claims nothing and changes no site; its one write keeps the served document in
  // `question_snapshot` under its content hash (below). `lang` is the person's language, not the
  // site's.
  app.get('/api/sites/questions', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const platform = c.req.query('platform') ?? ''
    if (!CREATE_PLATFORMS.has(platform)) return json(c, { code: 'UNSUPPORTED_PLATFORM' }, 400)
    const lang = (c.req.query('lang') ?? 'en').slice(0, 10)
    let quickstart = null
    const askedDesign = c.req.query('design') ?? ''
    const readable = await readReleases(pool)
    const off = await designSystemsOff(c, readable, askedDesign)
    if (off) return off
    if (isTemplateId(readable, askedDesign)) {
      // A template card asks its own questions on every CMS it builds on.
      quickstart = templateRelease(readable, platform, askedDesign)
    } else if (platform === 'joomla') {
      const plan = resolveDesignPlan(
        DESIGNS,
        c.req.query('design') ?? DESIGNS.registry.defaultDesign,
        (await readBuildBase(pool, 'joomla', baseChoices('joomla', DESIGNS, {}))).quickstart
      )
      quickstart = plan?.baseQuickstart ?? null
    } else {
      // A quickstart the caller names wins on EmDash as on WordPress: the create door builds a named
      // EmDash quickstart rather than the default base, so the form must ask that release's pages and
      // logo tiles, never the base's (#1013). Nothing named: EmDash falls back to its default base.
      const named = c.req.query('quickstart')
      quickstart =
        typeof named === 'string' && readable.some((r) => r.tag === named && r.platform === platform)
          ? named
          : null
      if (quickstart === null && platform === 'emdash') {
        const choices = baseChoices(
          'emdash',
          DESIGNS,
          readable.filter((r) => r.platform === 'emdash')
        )
        quickstart =
          choices.options.length > 0 ? (await readBuildBase(pool, 'emdash', choices)).quickstart : null
      }
    }
    const { doc, ...resolved } = await resolveQuestions({
      platform,
      quickstart,
      lang,
      pool,
      standard: STANDARD_QUESTIONS,
      release: readable.find((r) => r.tag === quickstart) ?? null,
      brandUploads: brandUploadsAvailable(config, await readUiHidden(pool))
    })
    // The form snapshots what it was served (`set`), and the build carries that identity. The
    // document is kept here under its content hash so a submit can later be read against the
    // questions the customer actually saw — not against whatever an administrator chose since.
    if (resolved.set?.contentHash)
      await pool.query(
        `insert into question_snapshot (content_hash, set_id, revision, doc) values ($1, $2, $3, $4::jsonb)
           on conflict (content_hash) do nothing`,
        [resolved.set.contentHash, resolved.set.id, resolved.set.revision, JSON.stringify(doc)]
      )
    // Whether the answers can be written into the site at all (#1403 item 7): the text model the Apply run spends,
    // read the way it reads it (`app.js` `seedModels`: `seedText`, then `web`). With none, the form says so before
    // Create instead of the run failing after the build, minutes later.
    const answersWritten = (await modelForChain(pool, ['seedText', 'web'], config)) !== null
    return json(c, { ...resolved, answersWritten }, 200)
  })

  /**
   * The brief a press carries, from `body.brief`.
   *
   * The popup sends `{answers, questionnaire}`: answers by question id and the hash of the set it was SHOWN. They are
   * judged against that set (kept by `GET /api/sites/questions`), so an administrator editing the questions between the
   * popup opening and Apply cannot turn an answer into another one. A hash this server does not know (a snapshot
   * purged, a request made by hand) is judged against the set the site would be asked today. The old
   * `{about, goal, style}` body, from a browser holding the old bundle, is still read.
   *
   * The logo and favicon answers are file ids from `POST /api/sites/brand-files`. Only the presser's own uploads are
   * kept, and only while brand uploads are on (`brandUploadsAvailable`); the kept ones are claimed for the site and
   * travel as `brief.brand` = `{logo: {light?, dark?, single?} | null, favicon: id | null}`, the one place the brand
   * writers read them. No logo given is no answer: the site keeps the template's logo exactly as released (LOGO-4 was
   * dropped, 09/10/2026), so a press with no logo, no favicon and no dropped id carries no `brand` at all.
   * A dropped id is a line in `brief.brandNotes`, never a failed create.
   *
   * The Pages answer travels as `brief.pages` = `{all: [{id, label, home?}], picked: [ids]}` (`pagesOfBrief`), the one
   * place the engines read which pages to keep: `all` is the page list of the release being built, `picked` the ticked
   * ids it has plus home, always. A page id the template does not have is dropped with a line in `brief.pageNotes`.
   * Null when the template ships no page list or the set asked no pages question.
   *
   * Contact facts a caller collected (`body.brief.facts`, `readBriefFacts`) travel as `brief.facts`, each with its source;
   * `normalizeBrief` holds them to their shape and lets what the customer said win.
   * @param {unknown} raw
   * @param {string} platform
   * @param {string | null} quickstart
   * @param {{ accountId: string, siteKey: string }} presser
   */
  async function briefOfPress(raw, platform, quickstart, presser) {
    const brief = await briefOfWords(raw, platform, quickstart, presser)
    // Contact facts a caller collected ride on a brief that says something; alone they make no brief.
    const facts = brief ? readBriefFacts(raw) : null
    return facts ? { ...brief, facts } : brief
  }

  /** `briefOfPress` without the collected facts. */
  async function briefOfWords(raw, platform, quickstart, presser) {
    const typed = readBriefAnswers(raw)
    if (!typed) return readBriefInput(raw)
    const brand = await brandOfPress(pool, {
      answers: /** @type {any} */ (raw).answers,
      accountId: presser.accountId,
      siteKey: presser.siteKey,
      available: brandUploadsAvailable(config, await readUiHidden(pool))
    })
    for (const note of brand.notes) console.warn(`[brief] ${presser.siteKey}: ${note}`)
    // File ids are not words the customer said: they leave the answers, and the checked ones travel as `brand`.
    delete typed.answers.logo
    delete typed.answers.favicon
    const said = await briefOfAnswers(typed, platform, quickstart, presser.siteKey)
    if (!brand.logo && !brand.favicon && brand.notes.length === 0) return said
    return {
      ...(said ?? { about: '', said: '', goal: null, style: null, answers: [], pages: null }),
      brand: { logo: brand.logo, favicon: brand.favicon },
      ...(brand.notes.length ? { brandNotes: brand.notes } : {})
    }
  }

  /**
   * `briefOfPress` for the typed answers: judged against the set the customer was shown, its pages question
   * filled again from the release actually being built (`fitPagesQuestion`). That covers a snapshot kept before the
   * pages were filled in, and one served for another template than the one pressed: the pages a build keeps
   * are always pages of the template it builds.
   * @returns {Promise<any>} the brief, or null when the answers say nothing
   */
  async function briefOfAnswers(typed, platform, quickstart, siteKey) {
    const release = quickstart ? ((await readReleases(pool)).find((r) => r.tag === quickstart) ?? null) : null
    let doc = null
    if (typed.questionnaire) {
      const { rows } = await pool.query('select doc from question_snapshot where content_hash = $1', [
        typed.questionnaire
      ])
      if (rows[0]) doc = typeof rows[0].doc === 'string' ? JSON.parse(rows[0].doc) : rows[0].doc
    }
    if (!doc)
      doc = (
        await resolveQuestions({
          platform,
          quickstart,
          lang: 'en',
          pool,
          standard: STANDARD_QUESTIONS,
          release,
          // The brand answers left the press before this (`briefOfPress`); keeping the questions changes nothing.
          brandUploads: true,
          warn: () => {}
        })
      ).doc
    doc = fitPagesQuestion(doc, release)
    // Every template is built in one language this round (D10): `resolveQuestions` serves `languages: 'one'` for all.
    const brief = briefFromAnswers(doc, typed.answers, { oneLanguage: true })
    if (!brief) return null
    const { pages, notes } = pagesOfBrief(doc, typed.answers)
    for (const note of notes) console.warn(`[brief] ${siteKey}: ${note}`)
    // The answer reads as what the build keeps: home is never left out of it.
    const answer = pages ? brief.answers.find((a) => a.feeds.includes('site.pages')) : null
    if (answer) answer.value = [...pages.picked]
    return { ...brief, pages, ...(notes.length ? { pageNotes: notes } : {}) }
  }

  /** One served questionnaire by its content hash — for anybody holding a build's snapshot. */
  app.get('/api/sites/questions/snapshot', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const hash = c.req.query('hash') ?? ''
    if (!/^[0-9a-f]{64}$/.test(hash)) return json(c, { code: 'BAD_HASH' }, 400)
    const { rows } = await pool.query(
      'select set_id, revision, doc, created_at from question_snapshot where content_hash = $1',
      [hash]
    )
    if (rows.length === 0) return json(c, { code: 'UNKNOWN_SNAPSHOT' }, 404)
    const row = rows[0]
    return json(
      c,
      {
        set: { id: row.set_id, revision: row.revision, contentHash: hash },
        doc: typeof row.doc === 'string' ? JSON.parse(row.doc) : row.doc,
        servedAt: row.created_at
      },
      200
    )
  })

  // ── POST /api/sites/:key/provision — the import branch's second call, once the archive is up ──
  // Ported from `apiSiteProvision`.
  app.post('/api/sites/:key/provision', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const body = await c.req.json().catch(() => null)
    if (!body) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const platform = typeof body.platform === 'string' ? body.platform : ''
    if (!CREATE_PLATFORMS.has(platform)) return json(c, { code: 'UNSUPPORTED_PLATFORM' }, 400)
    if (typeof body.webrootKey !== 'string' || !body.webrootKey)
      return json(c, { code: 'ARCHIVE_REQUIRED' }, 400)
    const found = await siteByKey(pool, siteKey)
    if (!found) return json(c, { code: 'SITE_UNKNOWN' }, 404)

    if (found.origin !== 'migrated') return domainTaken(c, siteKey)
    if (auth.grant.role !== 'owner') return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    const provisionLock = await pool.connect()
    const lockName = `site-provision:${siteKey}`
    const { rows: lockRows } = await provisionLock.query(
      'select pg_try_advisory_lock(hashtextextended($1, 0)) as locked',
      [lockName]
    )
    if (!lockRows[0].locked) {
      provisionLock.release()
      return domainTaken(c, siteKey)
    }
    try {
      const pool = provisionLock
      // 🔒 THE ROW IS READ AGAIN UNDER THE LOCK a Remove takes its mark under (`import-remove.js`), so
      // one of the two wins. Reading only `removing_at` was not enough: a Remove that marked, held and
      // DELETED the row between the read above and this lock left no row here, a missing mark read as
      // "not marked", and the copy was built for a site that no longer existed (CI, 27/10/2026: both
      // answered success). The row this request was let in on must still be the one in the book: gone,
      // or replaced by a later claim of the same name, is unknown to this request.
      const current = await siteByKey(pool, siteKey)
      if (!current || current.created_at.getTime() !== found.created_at.getTime())
        return json(c, { code: 'SITE_UNKNOWN' }, 404)
      if (current.removing_at) return json(c, { code: IMPORT_REMOVING }, 409)
      // This site's own provision, not one of a site deleted earlier under the same name: jobs
      // outlive their site (`provisionedInPlace`), and an old one here handed a re-import the
      // deleted copy's job back as `reused` — nothing was built.
      const previous = await pool.query(
        `select id, state from job
          where site_key = $1 and kind = 'provision' and created_at >= $2
          order by created_at desc limit 1`,
        [siteKey, current.created_at]
      )
      const job = previous.rows[0]
      if (job && current.platform !== platform)
        return json(c, { code: 'PLATFORM_CHANGED', platform: current.platform }, 409)
      if (job && job.state !== 'failed') {
        return json(c, { siteKey, jobId: job.id, reused: true }, 202)
      }
      const prefix = `sites/${labelPrefix(siteKey)}/`
      for (const field of ['webrootKey', 'dbKey']) {
        const value = body[field]
        if (value !== undefined && (typeof value !== 'string' || !value.startsWith(prefix))) {
          return json(c, { code: 'KEY_NOT_YOURS' }, 403)
        }
      }
      // 🔒 THE HOST DOWNLOADS FROM URLs SIGNED HERE. It holds none of the store's keys and its image
      // ships curl, not the aws CLI — measured 14/09: with only the keys in the instruction, every
      // import died at "fetching webroot" after the archive was already in the store. This process
      // is the one that signs for the store anyway (the artifact doors below). A day is generous on
      // purpose: the database is fetched only after the stack is up, and a queued build can wait.
      const store = config.artifactStore
      if (!store) return json(c, { code: 'ARTIFACT_STORE_UNAVAILABLE' }, 503)
      const signGet = (key) => presign(store, { method: 'GET', key, expiresIn: ARCHIVE_URL_TTL_S })
      // 🔒 THE ROW DESCRIBES THE COPY THIS INSTRUCTION BUILDS. This is the one place tracy-web states
      // the platform to the host, and the last place it can be compared: the host's job answer
      // carries no platform (`{state, step, port}`) and the job row keeps no copy of the instruction,
      // so the poll that pairs the copy has nothing to hold it against. Defence behind the claim door,
      // written only once the request itself was accepted, so a refused request changes nothing.
      const kept = await keepImportPlatform(current, platform, 'provision', pool)
      if ('refused' in kept) return json(c, kept.refused, 409)
      const site = kept.site
      // 🔒 THE COPY IS CANONICAL TO ITS OWN FLEET ADDRESS, and the source is not allowed a say in it.
      // Computed HERE from this deployment's origin — scheme and port and all — the same derivation
      // the create branch uses for `liveSite` and the job poll below stores as `site.address`. The
      // client also sends `body.liveSite`: the SOURCE's public origin, observed while exporting.
      // Before this, that value reached `--live-site` → `SITE_URL`, and both CMS config renderers pin
      // the copy's canonical to `SITE_URL` — Joomla `live_site` (with `force_ssl`/`behind_loadbalancer`
      // derived from its scheme), WordPress `WP_HOME`/`WP_SITEURL` plus the DB search-replace. So the
      // copy was configured to advertise the source's origin rather than its own (issue #167). Whatever
      // the source is, the copy must be canonical to the address IT answers at — that is the server's
      // to decide, not the client's.
      const copyAddress = bornSiteAddress(site.label, config)
      // 🔒 THE COPY GETS A CLAUDE COWORK TOKEN OF ITS OWN. The live site's token lives in its database,
      // so the archive carries it into the copy, where the agent can read it — a key to the customer's
      // LIVE site. provision.sh (step 4b) writes this one in its place before the copy starts; the
      // live token stays in this row only, for "Sync from live" (plan ke-hoach-dong-bo-tu-live §5).
      // The same token for every attempt of one import: a re-provision writes what pairing expects.
      const registered = await currentComponent(pool, siteKey)
      let copyToken
      if (
        registered?.config?.endpoint &&
        registered.config.token &&
        !isOnCopy(registered.config.endpoint, site, config)
      ) {
        copyToken = registered.config.copyToken ?? randomBytes(24).toString('hex')
        if (!registered.config.copyToken)
          await writeComponent(pool, siteKey, { ...registered.config, copyToken }, auth.email)
      }
      // The live site's fingerprint as the import found it, beside the live token it belongs to:
      // the first Sync from live compares with it (`live-sync.js` baseFingerprint). An import from
      // an engine without one leaves none, and never one of an earlier import of the same address.
      const fingerprint = importFingerprint(body.fingerprint)
      const now = await currentComponent(pool, siteKey)
      if (now?.config && (fingerprint || now.config.importFingerprint)) {
        const { importFingerprint: _old, ...rest } = now.config
        await writeComponent(
          pool,
          siteKey,
          fingerprint ? { ...rest, importFingerprint: fingerprint } : rest,
          auth.email
        )
      }
      const instruction = {
        // A lost host response must not start another import. Failed recorded attempts get
        // a new key; retries before a job is recorded keep the same key. The first key names the
        // row's birth, because the host keeps its keyed jobs: a domain deleted and imported again
        // would otherwise be handed the deleted copy's job. The key must pass the host's
        // SAFE_JOB_KEY (letters, digits, `:._-`): `first@…` was refused as `refused jobKey`.
        jobKey: `import:${siteKey}:${job?.id ?? `first-${new Date(current.created_at).toISOString()}`}`,
        site: siteKey,
        // …and `--site-key` as well, which is a DIFFERENT flag (`PROVISION_FLAGS` in tracy-host).
        // Without it `provision.sh` falls back to `$LABEL.$FLEET_ZONE` (its line 126) and writes
        // that name into the site's own `AGENTS.md` — so an imported site's agent believes it works
        // on `fijitrips-example-5254d120.<zone>` rather than the customer's domain. The create
        // branch above already states both for the same reason; only this branch was leaving it off.
        siteKey,
        label: site.label,
        platform,
        webrootKey: body.webrootKey,
        webrootUrl: await signGet(body.webrootKey),
        ...(copyToken ? { copyToken } : {}),
        ...(typeof body.dbKey === 'string' && body.dbKey
          ? { dbKey: body.dbKey, dbUrl: await signGet(body.dbKey) }
          : {}),
        // `liveSite` → the address the copy answers at, which is what the CMS config renderers pin as
        // canonical (Joomla `live_site` + `force_ssl`; WordPress `WP_HOME`/`WP_SITEURL` + the DB
        // search-replace). Same value as `copyAddress`; both are this deployment's copy address.
        liveSite: copyAddress,
        // The staging address (the job poll stores the same value as `site.address`), so the site
        // folder can tell the agent where people open its copy.
        copyAddress,
        ...(await gitTokenFields(site.repo))
      }
      const answer = await host.hostCall(config, site.host, '/provision', instruction, { fetchImpl })
      if (!answer.ok || typeof answer.body?.jobId !== 'string') {
        return json(c, provisionRefusal(answer, requestLanguage(c)), answer.status || 502)
      }
      await putJob(pool, { id: answer.body.jobId, siteKey, host: site.host, kind: 'provision' })
      return json(c, { siteKey, jobId: answer.body.jobId }, 202)
    } finally {
      try {
        await provisionLock.query('select pg_advisory_unlock(hashtextextended($1, 0))', [lockName])
      } finally {
        provisionLock.release()
      }
    }
  })

  // ── GET /api/sites/:key/jobs/:id — poll a provision, and finish the handover once it's done ───
  // Ported from `apiSiteJob` + `handleProvisionJob`, gated by `requireRepoDoorGrant` rather than
  // the generic `requireGrant` — see that function's own comment for why.
  // ported: handleProvisionJob
  app.get('/api/sites/:key/jobs/:id', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireRepoDoorGrant(c, siteKey)
    if (auth.error) return auth.error
    const jobId = c.req.param('id')
    const job = await jobById(pool, jobId)
    if (!job) return json(c, { code: 'JOB_UNKNOWN' }, 404)
    if (job.site_key !== siteKey) return json(c, { code: 'JOB_NOT_YOURS' }, 403)

    if (c.req.query('inspect') === '1') {
      c.header('cache-control', 'no-store')
      const snapshot = await inspectOwnJob(pool, { siteKey, jobId, accountId: auth.account.id, now: now() })
      return json(c, snapshot.body, snapshot.status)
    }

    // 🔒 BY KIND, BEFORE ANYTHING BELOW. Everything under here is a PROVISION's handover — the
    // address, the pairing, the repo, the lane — and a go-live job that reads `done` must run none
    // of it. Its own ending (the publish flag) is `publish.js`'s, which also asks the host.
    if (job.kind === 'go-live') {
      const site = await siteByKey(pool, siteKey)
      if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
      await publishing.refresh(site)
      const row = await jobById(pool, jobId)
      return json(c, { kind: 'go-live', state: row.state, step: row.step })
    }

    const polled = await host.hostJob(config, job.host, jobId, { fetchImpl })
    if (!polled.ok) return json(c, polled.body ?? { code: 'HOST_UNAVAILABLE' }, polled.status || 502)
    const body = polled.body ?? {}
    await updateJob(pool, jobId, { state: body.state, step: body.step, detail: body })
    // A build that ended says so on its own row, not only on the job's. `site_creation` is what a
    // later reader — ops, a reopened Build tab, the sweep in `cron.js` — asks "what happened to
    // this build", and it used to answer `provisioning` for ever in BOTH endings.
    if (body.state === 'failed') {
      await settleCreationByJob(pool, jobId, 'failed')
      // The words have nowhere to go: say so on their row instead of leaving it to time out.
      if (briefs) await briefs.abandon(siteKey)
    }
    // Apply places the words as soon as the site answers, while the host still records its starting point: the
    // console names that work rather than the host's last step (`briefs.placing`, #1403 item 7).
    if (body.state === 'running' && briefs?.placing) {
      const placing = await briefs.placing(siteKey)
      if (placing) return json(c, { ...body, step: placing })
    }
    if (body.state !== 'done') return json(c, body)

    await completeProvisionDesign(pool, siteKey, jobId, body.design)

    // A site born with "Apply" is up but its text and pictures may not be in yet. An earlier poll already
    // handed it over (the repo, the lane, the content door), so a poll that arrives while the work goes on
    // only says "working" and does none of that again.
    if (briefs) {
      const waiting = await briefs.waiting(siteKey)
      if (waiting) return json(c, { ...body, state: 'running', step: waiting.step })
    }
    // The same for the design system picked in the form, once an earlier poll handed the site over.
    const pickWaiting = await dsAtCreate.stateOf(siteKey)
    if (pickWaiting?.open && pickWaiting.handedAt)
      return json(c, {
        ...body,
        state: 'running',
        step: DS_STEP,
        designSystem: dsAtCreate.said(pickWaiting)
      })

    const site = await siteByKey(pool, siteKey)
    const extra = {}
    if (Number.isInteger(body.port)) {
      await setPort(pool, siteKey, body.port)
      // Local branch only — see this file's module comment on the remote branch (Plan 3).
      const address = bornSiteAddress(site.label, config)
      // The address only. A site is born `draft` (the column's default); naming the flag here
      // put a live site back to draft on every later poll of its finished build job.
      await setAddress(pool, siteKey, { address })
      extra.liveUrl = address
    }

    if (site.origin === 'migrated') {
      // The import registered the component on the live site; move it onto the copy now that the
      // copy is up, so the first `tracy_site` call already lands there (the Apply door re-checks).
      // One try: a poll must answer, and the Apply door tries again (twice) on the first write.
      const paired = await pairFleetCopy(site, auth.email, { budgets: FLEET_COPY_BUDGETS_MS.slice(0, 1) })
      Object.assign(
        extra,
        paired.cred
          ? { custody: 'registered' }
          : {
              custody: 'unavailable',
              custodyDetail: `the fleet copy component could not be verified (${paired.why})`
            }
      )
    } else {
      Object.assign(extra, await pairComponent(site, auth.email))
    }
    // Kept on the job row beside the host's own answer, which is all the row held before: whether
    // the content door was connected is the one part of this handover no later read of the host
    // can say.
    await updateJob(pool, jobId, {
      detail: { ...body, custody: extra.custody, custodyDetail: extra.custodyDetail }
    })

    // GitHub repo (Task 7, spec §13.1 step 4): called on EVERY poll of a `done` job, not only the
    // first — a name with no owner is created outright, a name this site already owns is handed
    // back for free (`createRepoFor` never asks GitHub to create it twice), but the webhook is
    // RE-ENSURED every time, matching the Worker's own `handleCreateRepo`/`wireFleetRepo` self-repair
    // pattern: a webhook that failed to attach once has no other path to ever get fixed, and
    // `ensureRepoWebhook` re-attaching an already-working hook is a harmless PATCH. GitHub not
    // configured, or GitHub itself refusing, is reported in `repoError` — the job still finished,
    // so it still answers `done` (RULE #3: say what did not happen, do not fail the whole handover
    // over it).
    const created = await github.createRepoFor(
      pool,
      config,
      { siteKey, label: site.label, email: auth.email },
      fetchImpl
    )
    if (created.repo) {
      extra.repo = created.repo
      if (!created.webhook) extra.repoWebhookReason = created.webhookReason
      await ensureSiteOwnerSeat(siteKey, auth.account.id)
    } else {
      extra.repoError = created.code
    }

    const attached = await attachSite(site)
    if (attached.ok) {
      await setAttached(pool, siteKey, true)
      extra.lane = '/'
    } else {
      extra.laneError = attached.body?.code ?? 'LANE_FAILED'
    }

    // The site is handed over, so its words can be written: tell the work (it needs the content door the
    // handover paired) and, while it goes on, keep saying "working" — `done` is what the customer waits for.
    if (briefs) {
      const held = await briefs.gate(siteKey)
      if (held.open) return json(c, { ...body, ...extra, state: 'running', step: held.step })
      // 🔒 THE BRIEF'S ENDING RIDES BESIDE `done`, like `repoError` and `laneError` (TCH #1013, 08/10/2026): a site whose words
      // did not go in (`failed`), or went in only in part (`applied` with notes), used to answer a plain `done`. Only a site
      // made with a brief has one.
      if (held.state) {
        extra.briefState = held.state
        if (held.error) extra.briefError = held.error
      }
    }

    // The design system picked in the form is put on by this server after the words (`design-system-at-create.js`):
    // while it is not on yet the customer is still told "working"; once it ended, how rides beside `done` — applied,
    // skipped (the template cannot wear one, and why) or failed — never a silent template look.
    const pick = await dsAtCreate.stateOf(siteKey)
    if (pick) {
      await dsAtCreate.handedOver(siteKey)
      if (pick.open)
        return json(c, {
          ...body,
          ...extra,
          state: 'running',
          step: DS_STEP,
          designSystem: dsAtCreate.said(pick)
        })
      extra.designSystem = dsAtCreate.said(pick)
    }

    // The handover is what `done` means to a customer: the address, the pairing, the repo, the
    // lane. Settled here rather than beside the `failed` line above, so a row only reads `done`
    // once there is nothing left for a retry to finish.
    await settleCreationByJob(pool, jobId, 'done')

    return json(c, { ...body, ...extra })
  })

  // ── POST /api/sites/:key/agent — start (or heal) the site's agent lane ─────────────────────────
  // Ported from `apiSiteAgent` + `handleAttachSite`.
  // ported: handleAttachSite
  app.post('/api/sites/:key/agent', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    // 🔒 NOT FOR AN UNFINISHED IMPORT (`lib/import-pending.js`). `/attach` makes an EMPTY skeleton
    // folder and this door then marks the site attached, so a read that never reached a build looked
    // like a ready site with nothing in it. The host is not asked; the client opens the recovery page.
    if (site.removing_at) return json(c, { code: IMPORT_REMOVING }, 409)
    if (await importPending(pool, siteKey))
      return json(c, { code: IMPORT_NOT_FINISHED, recovery: importRecoveryPath(siteKey) }, 409)
    const attached = await attachSite(site)
    if (!attached.ok) return json(c, attached.body ?? { code: 'HOST_UNAVAILABLE' }, attached.status || 502)
    await setAttached(pool, siteKey, true)
    // The content door, for a site that has none on record yet: one whose provision finished before
    // its component answered, or that was born before WordPress was paired at all. With a component
    // already registered this is one read and the answer is unchanged.
    // Pairing registers a write credential on the site, so only a seat that may change the site
    // pairs (ADR 0028). Starting the agent stays open to a viewer: it needs a running agent to ask
    // anything, and the agent it gets is read-only.
    const custody =
      (await currentComponent(pool, siteKey)) || !(await mayWrite(auth, siteKey))
        ? {}
        : await pairComponent(site, auth.email)
    return json(c, { ...(attached.body ?? { ok: true }), ...custody }, attached.status || 200)
  })

  // ── GET /api/sites/:key/viewing-session — a token for an embedded, already-signed-in view ──────
  app.get('/api/sites/:key/favicon', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    try {
      return json(c, { url: await declaredSiteIcon(site, config, fetchImpl) })
    } catch {
      return json(c, { url: null })
    }
  })

  // ── GET /api/sites/:key/viewing-session — a token for an embedded, already-signed-in view ──────
  // Ported from `apiViewingSession` + `handleCoworkSession` — see the module comment on why this
  // mints with this app's own session secret rather than fleet-bar's format.
  // ported: handleCoworkSession
  app.get('/api/sites/:key/viewing-session', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const token = await mintSession(auth.email, config.sessionSecret, now())
    return json(c, { token })
  })

  // ── POST /api/sites/:key/preview-ticket — the comment picker's ticket (`./preview-ticket.js`) ──
  mountPreviewTicket(app, {
    config,
    requireGrant,
    now,
    mayPick: async (_key, role) => pickAllowed(seats.normalizeRole, role)
  })

  // ── /api/sites/:key/comments — comments on the site's pages, kept here (`./comments.js`) ─────
  mountSiteComments(app, { pool, requireGrant, store: config.artifactStore, fetchImpl, now, notify })

  // ── POST /api/sites/brand-files — the logo and favicon of "Customize your site" (`./brand-files.js`) ──
  // Uploaded before the site exists, so the file belongs to the signed-in account, not to a seat.
  mountBrandFiles(app, {
    pool,
    config,
    fetchImpl,
    hidden: () => readUiHidden(pool),
    account: async (c) => {
      const email = await requireViewer(c, config)
      if (email instanceof Response) return email
      return { email, accountId: (await seats.ensureAccount(pool, email)).id }
    }
  })

  // ── POST /api/site — remember the last site opened, for a root path with no other clue ────────
  // Ported from `apiPickSite`.
  app.post('/api/site', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const body = await c.req.json().catch(() => null)
    const siteKey = typeof body?.siteKey === 'string' ? normalizeSiteKey(body.siteKey) : ''
    if (!siteKey) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const account = await seats.accountByEmail(pool, email)
    const grant = account ? await seats.grantFor(pool, account.id, siteKey) : null
    if (!grant) return json(c, { code: 'NO_SEAT' }, 403)
    const res = json(c, { ok: true, siteKey, role: grant.role }, 200)
    res.headers.append('set-cookie', siteCookie(siteKey, config))
    return res
  })

  // ── Webroot doors: changes, backups, backup, moment, moment files, file-diff, restore ──────────
  // ported: handleSiteJob
  // Ported from `apiSiteData`/`apiSiteRelease`/`apiSiteMoment`/`apiSiteFileDiff`/`apiSiteRestore`
  // calling `handleSiteJob`, each a `kind: 'webroot-*'` job run on `tracy-host`.
  async function siteDataRoute(c, which) {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const kind = which === 'changes' ? 'webroot-changes' : 'webroot-history'
    // `bounded`, as `/activity`'s read (activity-git.js): the two share one history job when asked
    // together (history-share.js), and whichever started it, neither waits past its deadline.
    const job = await runSiteJob(site, { kind }, 45_000, undefined, { bounded: which !== 'changes' })
    if (!job.ok) {
      if (job.reason === 'timeout') return json(c, { code: 'FLEET_JOB_PENDING' }, 202)
      return json(c, { code: 'FLEET_JOB_FAILED', reason: job.reason }, 502)
    }
    const data = lastLine(job.output)
    if (!data || data.ok !== true) return json(c, { code: 'FLEET_ANSWERED_UNREADABLY' }, 502)
    // A look seals what changed on the site since the last commit (never while a chat turn is open):
    // that seal is an outside row like any other (plan site changes §5).
    if (data.sealed) await recordOutside(pool, siteKey, [{ ...data.sealed, cause: 'seal' }])
    // Every person the host names (`by: {kind: 'person', name, email}` on a moment, a file or a
    // backup point) gets the face `/api/team` gives their account, or `face: null` when no Tracy
    // account holds that email — the same rule as `/activity`, one query for the whole answer.
    const byOf = (list) => (Array.isArray(list) ? list.map((row) => row?.by) : [])
    if (which === 'changes') {
      const moments = Array.isArray(data.moments) ? data.moments : []
      const files = Array.isArray(data.files) ? data.files : []
      await attachFaces(pool, [...byOf(moments), ...byOf(files)])
      return json(c, {
        since: data.since ?? null,
        moments,
        files,
        // Past 200 moments or 500 files the host says so; the tab reports it (invariant 13).
        truncated: data.truncated ?? null
      })
    }
    // What THIS seat may do with the points, by the rules `/restore` refuses with (files: `code`,
    // everything: `site`), so the tab disables a verb with its reason instead of opening a dialog
    // the door then refuses (QA-I14, 02/10). The door still checks; this only words the button.
    const toolsets = await seatToolsets(auth, siteKey)
    const rows = Array.isArray(data.rows) ? withDatabases(data.rows) : []
    await attachFaces(pool, byOf(rows))
    return json(c, {
      latest: data.latest ?? null,
      // Each backup point says what it holds (`database`, ADR 0024; `backups.js`).
      rows,
      truncated: data.truncated === true,
      // `export`: download a backup — the whole site, data included — is the Owner's alone
      // (`lifecycle`, ADR 0028; plan todo-backup-export decision 1), and only where the deployment
      // turned the doors on (`BACKUP_EXPORT`).
      may: {
        restoreFiles: Boolean(toolsets.code),
        restoreEverything: Boolean(toolsets.site),
        export: config.backupExport === true && Boolean(toolsets.lifecycle)
      }
    })
  }
  /**
   * The name a customer's own domain must point at to reach `site`'s host — the host's own answer,
   * asked now (`POST /_host/routing-target`), or null: a host with no tunnel, one that did not
   * answer, or an answer that is not a host name. Never kept: the host may move to another tunnel.
   */
  const tunnelTarget = async (site) => {
    let answer
    try {
      answer = await host.hostCall(config, site.host, '/routing-target', {}, { fetchImpl, timeoutMs: 5_000 })
    } catch {
      return null
    }
    const target = answer?.ok === true ? answer.body?.target : null
    return typeof target === 'string' &&
      target.length <= 253 &&
      /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(target)
      ? target
      : null
  }
  // 🔒 WITH CLOUDFLARE FOR SAAS A CUSTOMER POINTS THEIR DOMAIN AT `connect.<site domain>`, NOT AT
  // THE HOST'S TUNNEL: Cloudflare serves the name with its own certificate and sends it to the zone's
  // fallback origin, and the host's per-name ingress rule (still written by every publish) leads it
  // on to tracy-web — cloudflared picks a rule by the request's host name, so without that rule the
  // name would end at the tunnel's catch-all. The tunnel's name is then nobody's to point at.
  const hostnames =
    customHostnames === undefined
      ? hostnamesFromConfig(config, fetchImpl, shard?.hostnameBroker ?? null)
      : customHostnames
  const routingTarget = hostnames ? async () => connectTarget(config) : tunnelTarget
  const ownDomains = mountSiteAddress(app, {
    pool,
    config,
    requireGrant,
    fetchImpl,
    siteProxy,
    customHostnames: hostnames,
    ...(labels ? { holdLabel: (label, siteKey) => labels.hold(label, siteKey) } : {}),
    ...(dns ? { dnsTxt: (name) => dns.resolveTxt(name), dnsCname: (name) => dns.resolveCname(name) } : {}),
    ...(ownDomainProbe
      ? { domainProbe: ownDomainProbe }
      : dns
        ? { domainProbe: ownDomainProber(config, () => dns) }
        : {}),
    routingTarget,
    reserveName: async ({ site, name }) =>
      shard
        ? shard.reserveLabel({ label: dnsLabelOf(name, config.siteDomain, name), siteKey: site.site_key })
        : { reserved: true },
    // Late-bound: the publish doors are mounted further down, and each needs the other.
    dropDomain: (site, auth, choose) => publishing.dropDomain(site, auth, choose),
    settlePublish: (site) => publishing.refresh(site),
    run: (site, input) => runSiteJob(site, input, 120_000),
    // T14 (spec #809): the team hears the new address. Both names of this step are kept: the row is
    // read later, after more renames, and the site's name then is not this step's `newSite`.
    onRenamed: async ({ site, from, to, auth }) => {
      // Shard beta: the master moves `<label>.<zone>` with the site (spec §4.4 `site.renamed`).
      if (shard)
        await shard.emit(
          'site.renamed',
          {
            siteKey: site.site_key,
            from: dnsLabelOf(from, config.siteDomain, site.label),
            to: dnsLabelOf(to, config.siteDomain, site.label)
          },
          `${site.site_key}:${from}->${to}@${new Date(now()).toISOString()}`
        )
      await notify({
        recipients: await teamAccountIds(site.site_key),
        kind: 'team.site_renamed',
        siteKey: site.site_key,
        actor: auth.account?.id ?? null,
        data: { oldSite: from, ...(typeof to === 'string' && to !== '' ? { newSite: to } : {}) }
      })
    }
  })
  // The library, support and preview doors of the design system: any signed-in seat (a browser
  // session, or the lane's actor assertion for the person at the keyboard), with an account in the
  // seat book.
  const dsSignedIn = async (c) => {
    // this server asking its own preview doors (`lib/preview-door-health.js`): a token made at boot, in
    // process only; never a person, never a seat
    if (isDoorProbe(c.req.header(DOOR_PROBE_HEADER), doorProbeToken))
      return { email: 'door-probe@tracy.internal', probe: true }
    if (isApiHost(c)) return { error: json(c, { code: 'NOT_SIGNED_IN' }, 401) }
    const email =
      (await viewer(c, config)) ??
      (await verifyActor(c.req.header('x-tracy-actor'), config.actorSecret, now()))
    if (!email) return { error: json(c, { code: 'NOT_SIGNED_IN' }, 401) }
    const account = await seats.accountByEmail(pool, email)
    if (!account) return { error: json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403) }
    return { email }
  }
  // The two design system preview doors' cap: thirty a minute per account, ONE budget for both
  // (`previewRateLimiter`, 12/10/2026), counted in `rate_bucket` so every process shares it.
  const dsPreviewRate = previewRateLimiter({ pool, now })
  // The design system readers below read a site on another host at its public Tracy address, which sends a
  // visitor on to the site's own domain: marked as Tracy's own reads, they are still served the page (`lib/own-read.js`).
  const ownReadFetch = markOwnReads(fetchImpl, config)
  const dsSiteReaders = designSystemSiteReaders({ config, fetchImpl: ownReadFetch })
  // Which templates customers may put a design system on (15/10/2026): those whose /ops Design
  // system step says ready (`lib/design-system-ready-templates.js`), minus the emergency deny-list; Tracy
  // staff exempt so they can test the rest (`lib/design-system-customer-lock.js`).
  // Local review mode (`lib/local-review.js`, a local stand only): open, a local pack never has the demo /ops asks.
  const dsLock = config.localReview
    ? OPEN_LOCK
    : customerLock({
        isStaff: staffReader(pool),
        isReady: readyTemplatesReader({ pool, doorHealth })
      })
  // The preview doors' demo: in local review mode a local pack falls back to the newest site built from it.
  const dsPreviewDemoOf = localReviewDemoOf({
    on: config.localReview === true,
    liveDemoOf: (tag) => liveDemoOf(pool, tag),
    packSiteOf: (tag) => localPackSiteOf(pool, tag)
  })
  // The site browser's Design system button: a system put on the running site, and taken back
  // (`design-system.js`, plan tasks/ke-hoach-nut-design-system.md). Its write is also the one the end of a new
  // site's build makes for the system picked in the Add site form (`dsAtCreate` below).
  const dsDoors = mountDesignSystem(app, {
    // The panel's press (a cookie), and the chat route (`tracy-site-tools`' `tracy_design_system`: the
    // person who typed, held to the conversation's own site folder) — refused while the operator keeps
    // `chat-design-system` off (`chatRoute` below, `design-system.js`).
    requireGrant: async (c, siteKey) => {
      const conversation = await conversationSite(c)
      if (conversation.error) return { error: conversation.error }
      return requireGrant(c, conversation.siteKey ?? siteKey, true)
    },
    normalize: normalizeSiteKey,
    siteByKey: (key) => siteByKey(pool, key),
    // It changes the whole look, as `theme.style` does, so it needs what `theme.style` needs.
    toolsetRefusal: async (auth, siteKey) => {
      const needed = /** @type {string} */ (APPLY_RULES.get('theme.style'))
      return (await seatToolsets(auth, siteKey))[needed] ? null : { toolset: needed, role: auth.grant.role }
    },
    runJob: (site, input, ms) => runSiteJob(site, input, ms),
    lease: {
      take: (q) => takeWriteLease(pool, q),
      release: (q) => releaseWriteLease(pool, q)
    },
    record: (row) => auditSiteWrite(pool, row),
    store: designSystemStore(pool),
    ds: {
      // OpenDesign: no longer offered, read only to name a system a site already wears.
      library: dsLibrary,
      templateKeyOf,
      contractFor: slotContractFor,
      rawTemplatesOf,
      versionKeyOf,
      minVersionOf,
      maxVersionOf,
      emitFor,
      fontFaces: googleFontFaces,
      refero: referoLibrary,
      referoScreenshot: referoScreenshotPath,
      supportForNewSite,
      quickstartTemplateOf,
      modesOf
    },
    customerLock: dsLock,
    // The Template default card's picture: the thumbnail /ops Templates Management draws for the site's release.
    templateImage: (site) => templateThumbnailOf(pool, site, config.origin),
    // The library and support doors: any signed-in seat (`dsSignedIn` above).
    signedIn: dsSignedIn,
    // The newest release of a quickstart (`quickstart_releases`, ADR 0017): one row per tag, its
    // setting's version is what a site built from it now records as `quickstart_version`.
    releaseVersion: async (tag) => {
      const row = (await readReleases(pool)).find((r) => r.tag === tag)
      const v = row?.setting?.version
      return typeof v === 'string' && v !== '' ? v : null
    },
    // The operator's switch for the chat route (`chat-design-system`): read per press, throws unread.
    chatRoute: () => uiSwitchOn(pool, 'chat-design-system'),
    // Where the panel reads the running site (`design-system-site-readers.js`): the marker after a write, the fonts a
    // worn system needs, the words of its cards, the page its preview frames. One address for all four: the web
    // container on this host, the public address on another one (`siteTarget`'s remote name has no certificate).
    seen: dsSiteReaders.seen,
    glyphReader: dsSiteReaders.glyphReader,
    home: dsSiteReaders.home,
    // A card's preview popup (`…/design-system/preview`): the home page read where the panel reads it, its links made
    // to point at the address the site is served at (`/api/sites` `copyUrl`).
    preview: {
      innerOf: dsSiteReaders.readOrigin,
      publicOf: dsSiteReaders.publicOf,
      fetchImpl: ownReadFetch,
      // Where the links of a served page point back at the door (a page of the site wearing the system).
      origin: config.origin,
      // What signs the live frame's ticket (`live=1`), read back by the site proxy (`lib/ds-preview-ticket.js`).
      secret: config.sessionSecret
    },
    previewRate: dsPreviewRate
  })
  // The design system picked in the Add site form, put on the new site once its install and its brief are done, through
  // the write above as the person who created it (`design-system-at-create.js`, 12/10/2026).
  const dsAtCreate =
    designSystemsAtCreate ??
    createBuildDesignSystems({
      store: buildDesignSystemStore(pool),
      apply: (siteKey, ask) => dsDoors.applyAs(siteKey, ask),
      hostJob: async (hostName, jobId) => {
        const polled = await host.hostJob(config, hostName, jobId, { fetchImpl })
        return polled.ok ? (polled.body ?? null) : null
      },
      // The site's words are still being written: an open brief row whose worker still beats (a dead one is the poll
      // door's to settle, and is not waited on).
      briefOpen: async (siteKey) => {
        const row = await briefOf(pool, siteKey)
        if (!row || !BRIEF_OPEN.includes(row.state)) return false
        return Date.now() - new Date(row.updated_at).getTime() < 4 * 60_000
      }
    })
  // The Add site form's preview of a design system on the picked template: the quickstart's live
  // demo, read on its own container and never written to (`design-system-preview.js`).
  mountDesignSystemPreview(app, {
    signedIn: dsSignedIn,
    demoOf: shard?.demoOf ?? dsPreviewDemoOf,
    // A demo on another host (`fleet01`) is read at its public address: `siteTarget`'s remote name has no certificate.
    innerOf: (demo) => siteReadOrigin(demo, config),
    fetchImpl: ownReadFetch,
    ds: { refero: referoLibrary, quickstartContractOf, emitFor, fontFaces: googleFontFaces, modesOf },
    previewRate: dsPreviewRate,
    customerLock: dsLock,
    origin: config.origin,
    // What signs the live frame's ticket (`live=1`), read back by the site proxy (`lib/ds-preview-ticket.js`).
    secret: config.sessionSecret,
    // The live frame wears the system only where this server's site proxy answers the demo: a demo on another host
    // (fleet01) is served by that host's tunnel, never through here, so it gets the static page.
    liveServed: (demo) => demo.host === config.hostName
  })
  // The demo's stylesheets and fonts for that preview, through Tracy's origin: a font is a CORS fetch
  // and a demo sends no Access-Control-Allow-Origin (`design-system-preview-assets.js`).
  mountDesignSystemPreviewAssets(app, {
    signedIn: dsSignedIn,
    demoOf: shard?.demoOf ?? dsPreviewDemoOf,
    // Read where the preview door reads the page (`siteReadOrigin`): a demo on `fleet01` has no certificate at its
    // `-sites` name, and every one of its stylesheets answered 502 there (measured 14/10/2026 after PR #1356).
    innerOf: (demo) => siteReadOrigin(demo, config),
    fetchImpl: ownReadFetch,
    origin: config.origin
  })
  mountSiteDesign(app, {
    requireGrant,
    // The record says what `theme.style` would say, so it needs what `theme.style` needs.
    toolsetRefusal: async (auth, siteKey) => {
      const needed = /** @type {string} */ (APPLY_RULES.get('theme.style'))
      return (await seatToolsets(auth, siteKey))[needed] ? null : { toolset: needed, role: auth.grant.role }
    },
    normalize: normalizeSiteKey,
    read: (siteKey) => readSiteDesign(pool, siteKey),
    write: (siteKey, record, wroteBy) => writeSiteDesign(pool, siteKey, record, wroteBy)
  })

  /**
   * The row, the address state and the publish state of a site, read as ONE snapshot — what the
   * Settings tab and the Publish tab draw from. An ending the host has for the site's publish
   * operation is written first; then the three are read in one transaction, so no part of the answer
   * is older than another. Shared by `GET /api/sites/:key/settings` and the guide door
   * (`GET /api/sites/_conversation/guide`): the agent is told exactly what the card shows, from the
   * same read, never from a second reader that could drift.
   * @param {any} site
   * @param {any} grant
   */
  const settingsSnapshot = async (site, grant) => {
    await publishing.refresh(site)
    // The host is asked BEFORE the snapshot opens (a call to another machine has no place inside
    // a transaction), and only for a site that has a domain of its own.
    const target = (await hasOwnDomain(pool, site.site_key)) ? await ownDomains.targetOf(site) : null
    const client = await pool.connect()
    try {
      await client.query('begin isolation level repeatable read read only')
      const row = await siteByKey(client, site.site_key)
      const extra = row && {
        ...publicSiteFields(row),
        currentSiteUrl: row.address,
        addressChange: await addressChangeState(client, row, grant.role, config, target),
        publishing: await publishing.view(client, row, grant)
      }
      await client.query('commit')
      return row ? { site: row, extra } : null
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  mountSiteGuide(app, {
    pool,
    conversationSite,
    requireGrant,
    siteByKey: (key) => siteByKey(pool, key),
    snapshot: settingsSnapshot,
    ownDomains,
    origin: config.origin
  })

  mountSiteSettings(app, {
    current: settingsSnapshot,
    requireGrant,
    siteByKey: (key) => siteByKey(pool, key),
    address: (site) => site.address || bornSiteAddress(site.label, config),
    read: async (site) => {
      const job = await runSiteJob(site, { kind: 'site-settings' }, 20_000)
      if (!job.ok) return null
      const data = lastLine(job.output)
      return data?.ok === true ? data : null
    }
  })
  mountCmsLog(app, { pool, requireGrant, siteByKey: (key) => siteByKey(pool, key), runJob: runSiteJob })
  mountActivity(app, {
    pool,
    requireGrant,
    siteByKey: (key) => siteByKey(pool, key),
    runJob: runSiteJob,
    // Settles pending/unknown undo operations against their jobs before a V2 read (contract D3).
    reconcileOperations: reconcileSiteOperations,
    // The rule `/restore` refuses by, so an editor's tab shows no Undo it could not press.
    mayWriteFiles: async (auth, siteKey) => Boolean((await seatToolsets(auth, siteKey)).code)
  })
  app.get('/api/sites/:key/changes', (c) => siteDataRoute(c, 'changes'))
  app.get('/api/sites/:key/backups', (c) => siteDataRoute(c, 'backups'))

  /**
   * Create a backup (ADR 0024): the site's files and, where the host keeps backups, its database,
   * as the next numbered point. Renamed from `POST /release` on 03/10/2026, with `GET /releases` →
   * `GET /backups`: no customer had called either yet (`docs/references/api-changelog.md`).
   */
  app.post('/api/sites/:key/backup', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    // A backup point is a write on the site's history: a viewer may read the points, not make one.
    if (!(await mayWrite(auth, siteKey)))
      return json(c, { code: 'FORBIDDEN_WRITE', role: auth.grant.role }, 403)
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const body = await c.req.json().catch(() => null)
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    if (!title || title.length > 120 || title.includes('\n')) return json(c, { code: 'INVALID_TITLE' }, 400)
    if (body?.includeLarge !== undefined && typeof body.includeLarge !== 'boolean')
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''
    if (notes.length > 64 * 1024) return json(c, { code: 'NOTES_TOO_LONG' }, 400)
    const input = { kind: 'webroot-backup', title, byEmail: auth.email }
    if (body?.includeLarge === true) input.includeLarge = true
    // The name on the tag the fleet signs, when the account has one — ported from `viewerName`
    // (`workers/cowork-web/src/worker.js:2784`). Without it the fleet script falls back to the
    // email, which is the ONLY path this door used to offer: a caller with a display name would
    // never see it reach a backup.
    const byName = typeof auth.account?.display_name === 'string' ? auth.account.display_name.trim() : ''
    if (byName) input.byName = byName
    if (notes) input.notesBase64 = Buffer.from(notes, 'utf8').toString('base64')
    // One backup at a time on a site. A press while the last one is still being made gets that
    // one's answer and starts no second: the wait below used to end in a 502 the tab read as
    // "nothing was changed" while the host went on, so the person pressed again and got two.
    const existingBackupJobId = await backupInFlight(site)
    if (existingBackupJobId)
      return json(c, { code: 'BACKUP_PENDING', jobId: existingBackupJobId, startedByRequest: false }, 202)
    let startedBackupJobId = null
    const job = await runSiteJob(site, input, BACKUP_WAIT_MS, (jobId) => {
      startedBackupJobId = jobId
    })
    // The wait ran out: the host took the job and had not ended it, or the call to it got no
    // answer. Neither says the backup failed, so neither is a 5xx. A backup that ends after this
    // answer carries its signer on its own tag; the audit row below is written for confirmed ones.
    if (!job.ok && job.reason === 'timeout')
      return json(c, { code: 'BACKUP_PENDING', jobId: startedBackupJobId, startedByRequest: true }, 202)
    if (!job.ok) return json(c, { code: 'FLEET_JOB_FAILED', reason: job.reason }, 502)
    const data = lastLine(job.output)
    if (!data || data.ok !== true) return json(c, { code: 'FLEET_ANSWERED_UNREADABLY' }, 502)
    await audit(pool, {
      actor: auth.email,
      action: 'site.backup',
      siteKey,
      detail: { title, version: data.version ?? null, sha: data.fleetSha ?? null }
    })
    return json(c, {
      ok: true,
      version: data.version,
      title: data.title,
      sha: data.fleetSha ?? null,
      // What the point just made holds (ADR 0024): `full` only when the host proved its dump.
      database: databaseOf(data)
    })
  })

  // ── Download a backup (plan todo-backup-export; ADR 0024 amendment 3, signed) ─────────────────
  // The whole site — files, database, the personal data in it and the site's own secrets — so the
  // Owner's alone: the `lifecycle` toolset, the one only an Owner holds (ADR 0028), checked on both
  // doors. The bytes never pass through here (`backup-export.js`).
  /** The site and the Owner behind an export door, or the Response that refuses them. */
  async function exportDoor(c, { withVersion = true } = {}) {
    // Off (`config.backupExport`, BACKUP_EXPORT): the doors do not exist on this deployment, before
    // any seat is read; this remains the production kill switch.
    if (config.backupExport !== true) return { error: json(c, { code: 'EXPORT_OFF' }, 404) }
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return { error: auth.error }
    if (!(await seatToolsets(auth, siteKey)).lifecycle)
      return { error: json(c, { code: 'FORBIDDEN_EXPORT', role: auth.grant.role }, 403) }
    const raw = c.req.param('version')
    const version = !withVersion ? null : /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : null
    if (withVersion && version === null) return { error: json(c, { code: 'INVALID_VERSION' }, 400) }
    const site = await siteByKey(pool, siteKey)
    if (!site) return { error: json(c, { code: 'SITE_UNKNOWN' }, 404) }
    return { auth, site, version }
  }

  // ── Sync from live (an imported site; plan tasks/ke-hoach-dong-bo-tu-live.md) ─────────────────────
  // Owner only, like the export it feeds: it reads the customer's live site with the token Tracy
  // holds for it, and replaces the copy's files and database with the merge.
  async function syncDoor(c) {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return { error: auth.error }
    if (!(await seatToolsets(auth, siteKey)).lifecycle)
      return { error: json(c, { code: 'FORBIDDEN_SYNC', role: auth.grant.role }, 403) }
    const site = await siteByKey(pool, siteKey)
    if (!site) return { error: json(c, { code: 'SITE_UNKNOWN' }, 404) }
    return { auth, site }
  }
  const syncName = (auth) => auth.account?.name ?? auth.email

  app.get('/api/sites/:key/sync', async (c) => {
    const door = await syncDoor(c)
    if (door.error) return door.error
    const { site } = door
    // Why not, in the panel's words: built here, a platform without the merge, or an import whose
    // live door Tracy does not hold (one made before the copy kept it) — the press would be refused.
    const why =
      site.origin !== 'migrated'
        ? 'not-imported'
        : !SYNC_PLATFORMS.has(site.platform)
          ? 'platform'
          : !(await sync.connected(site))
            ? 'not-connected'
            : null
    c.header('cache-control', 'no-store')
    return json(c, {
      available: why === null,
      ...(why ? { why } : {}),
      sync: why === null ? await sync.read(site) : null
    })
  })

  app.post('/api/sites/:key/sync', async (c) => {
    const door = await syncDoor(c)
    if (door.error) return door.error
    const body = await c.req.json().catch(() => ({}))
    if (body?.allowHeld !== undefined && typeof body.allowHeld !== 'boolean')
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    const started = await sync.start(door.site, {
      email: door.auth.email,
      name: syncName(door.auth),
      allowHeld: body?.allowHeld === true
    })
    if (started.refused) return json(c, started.refused, started.status)
    return json(c, { sync: started.row }, 202)
  })

  // ── Sync to live (an imported site; plan tasks/ke-hoach-sync-to-live.md) ──────────────────────────
  // Owner only, as Sync from live, and a PERSON only: a browser session, never the agent's actor
  // assertion or a seat key — the push writes the customer's live site with the token Tracy holds
  // for it, and no agent tool may reach it (`live-push.js`).
  async function pushDoor(c) {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return { error: auth.error }
    if (auth.kind !== 'session')
      return { error: json(c, { code: 'FORBIDDEN_PUSH', why: 'not-a-person' }, 403) }
    if (!(await seatToolsets(auth, siteKey)).lifecycle)
      return { error: json(c, { code: 'FORBIDDEN_PUSH', role: auth.grant.role }, 403) }
    const site = await siteByKey(pool, siteKey)
    if (!site) return { error: json(c, { code: 'SITE_UNKNOWN' }, 404) }
    return { auth, site }
  }
  const PUSH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

  app.get('/api/sites/:key/push', async (c) => {
    const door = await pushDoor(c)
    if (door.error) return door.error
    const why = await push.unavailable(door.site)
    c.header('cache-control', 'no-store')
    const read = why === null ? await push.read(door.site) : null
    return json(c, {
      available: why === null,
      ...(why ? { why } : {}),
      push: read?.latest ?? null,
      lastPush: read?.lastPush ?? null
    })
  })

  app.post('/api/sites/:key/push/preview', async (c) => {
    const door = await pushDoor(c)
    if (door.error) return door.error
    const started = await push.preview(door.site, { email: door.auth.email, name: syncName(door.auth) })
    if (started.refused) return json(c, started.refused, started.status)
    return json(c, { push: started.row }, 202)
  })

  app.post('/api/sites/:key/push', async (c) => {
    const door = await pushDoor(c)
    if (door.error) return door.error
    const body = await c.req.json().catch(() => null)
    // `confirm.deletes`: the Owner ticked the preview's removals; absent or false, none is pushed.
    // `confirm.php`: the same for its PHP files.
    const deletes = body?.confirm?.deletes ?? false
    const php = body?.confirm?.php ?? false
    if (
      typeof body?.previewId !== 'string' ||
      !PUSH_ID.test(body.previewId) ||
      (body.confirm !== undefined && (typeof body.confirm !== 'object' || body.confirm === null)) ||
      typeof deletes !== 'boolean' ||
      typeof php !== 'boolean'
    )
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    const started = await push.apply(door.site, {
      previewId: body.previewId,
      deletes,
      php,
      email: door.auth.email,
      name: syncName(door.auth)
    })
    if (started.refused) return json(c, started.refused, started.status)
    return json(c, { push: started.row }, 202)
  })

  app.post('/api/sites/:key/push/:id/undo', async (c) => {
    const door = await pushDoor(c)
    if (door.error) return door.error
    const id = c.req.param('id')
    if (!PUSH_ID.test(id)) return json(c, { code: 'PUSH_UNKNOWN' }, 404)
    const started = await push.undo(door.site, {
      pushId: id,
      email: door.auth.email,
      name: syncName(door.auth)
    })
    if (started.refused) return json(c, started.refused, started.status)
    return json(c, { push: started.row }, 202)
  })

  app.post('/api/sites/:key/backups/:version/export', async (c) => {
    const door = await exportDoor(c)
    if (door.error) return door.error
    const body = await c.req.json().catch(() => ({}))
    if (body?.includeLarge !== undefined && typeof body.includeLarge !== 'boolean')
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    const { auth, site, version } = door
    const asked = await backupExports.requestExport({
      site,
      actor: { email: auth.email, accountId: auth.account?.id ?? null },
      version,
      includeLarge: body.includeLarge === true,
      runJob: runSiteJob
    })
    if ('refused' in asked) return json(c, { code: asked.refused.code }, asked.refused.status)
    return json(c, { exportId: asked.exportId, state: asked.state }, 202)
  })

  // The export the dialog opens on: the newest ready or downloaded one, with its install code — the
  // same Owner-only door as the download, so whoever may download a package may read its code.
  app.get('/api/sites/:key/export/latest', async (c) => {
    const door = await exportDoor(c, { withVersion: false })
    if (door.error) return door.error
    const latest = await backupExports.latestExport({ site: door.site })
    c.header('cache-control', 'no-store')
    return json(c, { export: latest })
  })

  app.get('/api/sites/:key/backups/:version/export/:exportId', async (c) => {
    const door = await exportDoor(c)
    if (door.error) return door.error
    const exportId = c.req.param('exportId')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(exportId))
      return json(c, { code: 'EXPORT_UNKNOWN' }, 404)
    const view = await backupExports.exportStatus({
      site: door.site,
      exportId,
      actor: { email: door.auth.email }
    })
    if (!view || view.version !== door.version) return json(c, { code: 'EXPORT_UNKNOWN' }, 404)
    // A link to the whole site lives five minutes: no cache anywhere may keep the answer.
    c.header('cache-control', 'no-store')
    return json(c, view)
  })

  app.post('/api/sites/:key/backups/:version/export/:exportId/code', async (c) => {
    const door = await exportDoor(c)
    if (door.error) return door.error
    const exportId = c.req.param('exportId')
    if (!UUID.test(exportId)) return json(c, { code: 'EXPORT_UNKNOWN' }, 404)
    if (!mail?.send || mail.available === false) return json(c, { code: 'MAIL_UNAVAILABLE' }, 503)
    if (mailRate && (await mailRate.over(c, door.auth.email))) return json(c, { code: 'RATE_LIMITED' }, 429)
    const sent = await backupExports.sendDownloadCode({
      site: door.site,
      exportId,
      actor: { email: door.auth.email, accountId: door.auth.account?.id ?? null },
      mail,
      language: requestLanguage(c)
    })
    if ('refused' in sent) return json(c, { code: sent.refused.code }, sent.refused.status)
    c.header('cache-control', 'no-store')
    return json(c, { challengeId: sent.challengeId, expiresAt: sent.expiresAt }, 202)
  })

  app.post('/api/sites/:key/backups/:version/export/:exportId/download', async (c) => {
    const door = await exportDoor(c)
    if (door.error) return door.error
    const exportId = c.req.param('exportId')
    if (!UUID.test(exportId)) return json(c, { code: 'EXPORT_UNKNOWN' }, 404)
    const body = await c.req.json().catch(() => ({}))
    if (!body || typeof body.challengeId !== 'string' || typeof body.code !== 'string')
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    const issued = await backupExports.downloadWithCode({
      site: door.site,
      exportId,
      actor: { email: door.auth.email, accountId: door.auth.account?.id ?? null },
      challengeId: body.challengeId,
      code: body.code.trim(),
      mail: mail?.send && mail.available !== false ? mail : null,
      language: requestLanguage(c)
    })
    if ('refused' in issued) return json(c, { code: issued.refused.code }, issued.refused.status)
    c.header('cache-control', 'no-store')
    return json(c, issued)
  })

  app.post('/api/sites/:key/moment', async (c) => {
    const held = await conversationSite(c)
    if (held.error) return held.error
    const siteKey = held.siteKey
    // A host dsh serves every site and holds no browser cookie for anyone, so it records the moment
    // as the person who typed the turn, with the gate's signed assertion — verified here exactly as
    // the Apply door verifies it, and followed by the same live-seat check.
    const auth = await requireGrant(c, siteKey, true)
    if (auth.error) return auth.error
    if (
      await overLimitOrClosed(
        pool,
        `turns:${auth.email}:${siteKey}`,
        TURNS_PER_MINUTE_PER_SEAT,
        now(),
        60_000
      )
    )
      return json(c, { code: 'RATE_LIMITED' }, 429)
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const body = await c.req.json().catch(() => null)
    // A commit subject: cut between words and marked "…", never mid-word (dev round 02/10).
    const title = titleWithin(body?.title, MOMENT_TITLE_MAX)
    if (!title) return json(c, { code: 'INVALID_TITLE' }, 400)
    // The chat turn this moment closes (site-tabs `agent/turn-stopping`, plan §6). Absent from an
    // older dsh: the moment runs as it always did, with no trailer and no turn row to close.
    const turnId = body?.turnId
    if (turnId !== undefined && parseTurnId(turnId) === null) return json(c, { code: 'INVALID_TURN' }, 400)
    // Tracy's answer for this turn (plan `tasks/todo-open-conversation.md` §C), sent by a host that
    // knows to: optional, and checked before anything runs. It belongs to a turn; its state is one
    // the host can know; the size is bounded before any work, and the door cuts it again itself.
    const reply = momentReply(body, turnId)
    if (reply === false) return json(c, { code: 'INVALID_REPLY' }, 400)
    // How the turn ended (ADR 0025): a model error, a cancel or a block means the comments sent into
    // it were not done — "Ask Tracy to edit all" ticks them again.
    const endReason = momentEndReason(body, turnId)
    if (endReason === false) return json(c, { code: 'INVALID_END_REASON' }, 400)
    // What the turn took (migration 114): its steps, tool calls and failed calls, for usage.
    const work = momentWork(body, turnId)
    if (work === false) return json(c, { code: 'INVALID_WORK' }, 400)
    const usage = momentUsage(body, turnId)
    if (usage === false) return json(c, { code: 'INVALID_USAGE' }, 400)
    // The audit line and the turn's close are the follow-up's (`door-follow-up.js` `WORK.moment`): done
    // here when the host ends the job within the wait, by the sweep when it ends later.
    const payload = {
      title,
      actor: auth.email,
      reply,
      endReason,
      ...(work ? { work } : {}),
      ...(usage ? { usage } : {})
    }
    const job = await runOwedJob(
      site,
      { kind: 'webroot-moment', title, ...(turnId === undefined ? {} : { turn: turnId }) },
      MOMENT_WAIT_MS,
      { door: 'moment', turnId: turnId ?? null, payload }
    )
    // A host that never took the job leaves no follow-up to close the turn: closed here, with no commit,
    // so how the agent ended is kept (a demo build reads its failure from it).
    if (!job.filed && turnId !== undefined) await closeUnfiledMoment(pool, { siteKey, turnId, payload })
    // Still running (ledger L31): not a failure, and an answer the dsh takes as recorded, so it does
    // not send the close again — which filed a second moment job behind the first.
    if (job.pending) return json(c, { code: 'FLEET_JOB_PENDING' }, 202)
    if (!job.ok) return json(c, { code: 'FLEET_JOB_FAILED', reason: job.reason }, 502)
    const data = lastLine(job.output)
    if (!data || data.ok !== true) return json(c, { code: 'FLEET_ANSWERED_UNREADABLY' }, 502)
    return json(c, {
      ok: true,
      committed: data.committed === true,
      files: data.files ?? 0,
      head: data.head ?? null
    })
  })

  // ── POST /api/sites/:key/turn — a person's message entered a chat turn on this site ────────────
  // Plan `tasks/todo-site-changes.md` §6. The host dsh's site-tabs plugin calls it from
  // `agent/pre-step`, signed as the person who typed (the gate's assertion, as `/moment`), BEFORE the
  // step runs — and holds the agent's first write until the answer (the step itself only on a later
  // turn, whose answer may carry `undone`), because the seal below must land before the agent's first
  // edit. What it does:
  //   1. one `site_turn` row (`turns.js`): who, the words, panel or comment; a second call for the same
  //      turn (a steer, a retry) merges into it and seals nothing;
  //   2. for a NEW turn, the host's `webroot-seal-outside` job: what is dirty now changed BEFORE the
  //      turn and is sealed as outside, and the turn is marked open so a look at Changes seals
  //      nothing until it stops. The job failing, or not ending within the wait, is not the turn
  //      failing: `unsealedStart`;
  //   3. the outside commits the job reports (that seal, a deploy's, housekeeping) → `site_outside`,
  //      now or, for a seal that ends after the wait, when it ends (the follow-up sweep, L31);
  //   4. another conversation's turn open on the site → both `concurrent`; turns left open 30 minutes
  //      → `stale`;
  //   5. the CMS's own admin log is pulled (P2 `cms-log.js`) — not awaited, a failure only logged, so
  //      admin edits made before the turn are listed before it;
  //   6. for a NEW turn, `undone`: the turns of this conversation undone from the chat since its
  //      previous turn opened (`undoneSince`, migration 067), so the host can tell the agent the site
  //      went back on purpose — the undo ran as this conversation, so "site changed" stays silent;
  //   7. for a NEW turn, `momentsPending`: the earlier turns of this conversation whose moment the host
  //      is still committing (`/moment` answered 202). Their moment commits whatever is dirty when it
  //      runs, so this turn's first write must wait until each has ended (`POST /moment/wait`, option A
  //      of 10/10/2026) — or it would be committed under the earlier turn's name (uiweekwp 09/10: a
  //      moment ended 20 s after the next turn opened). A dsh that holds says so (`waitsForMoments`);
  //      then the seal knows those moments cannot hold this turn's writes (`sealProvesStart`).
  app.post('/api/sites/:key/turn', async (c) => {
    // When the dsh's call reached the door: how long its checks took before the host was asked for the
    // seal decides whether a late seal can still prove the turn's start (`SEAL_LEAD_MAX_MS`).
    const asked = now()
    c.header('Cache-Control', 'private, no-store')
    const held = await conversationSite(c)
    if (held.error) return held.error
    const siteKey = held.siteKey
    const auth = await requireGrant(c, siteKey, true)
    if (auth.error) return auth.error
    if (
      await overLimitOrClosed(
        pool,
        `turns:${auth.email}:${siteKey}`,
        TURNS_PER_MINUTE_PER_SEAT,
        now(),
        60_000
      )
    )
      return json(c, { code: 'RATE_LIMITED' }, 429)
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const body = await c.req.json().catch(() => null)
    const turnId = body?.turnId
    if (parseTurnId(turnId) === null) return json(c, { code: 'INVALID_TURN' }, 400)
    // The whole prompt: the opened row reads every word; a closed row cuts it on screen.
    const title = titleWithin(body?.title, TURN_TITLE_MAX)
    if (!title) return json(c, { code: 'INVALID_TITLE' }, 400)
    const short = (value) => (typeof value === 'string' && value.length <= 200 ? value : null)
    let opened
    try {
      opened = await openTurn(pool, {
        turnId,
        siteKey,
        actor: auth.email,
        title,
        source: body?.source === 'comment' ? 'comment' : 'panel',
        promptMessageId: short(body?.promptMessageId),
        rpcId: short(body?.rpcId),
        // The comment numbers the host read off the turn's comment block (P1 `commentRef`); a value
        // that is not a short list of comment numbers is dropped, not refused.
        commentNs: commentNumbers(body?.commentNs) || null,
        steered: body?.steered === true,
        // This door and the host that sent the title are the two places that KNOW whether the
        // stored title is the person's full request (plan §2.3: never inferred later from its
        // length). The host caps at the same 4000, so a title it cut arrives within this door's
        // cap and only the host's `requestState: 'truncated'` says so (QA-A11, 03/10).
        requestState:
          body?.requestState === 'truncated' ? 'truncated' : requestStateFor(body?.title, TURN_TITLE_MAX)
      })
    } catch {
      return json(c, { code: 'TURN_OF_ANOTHER_SITE' }, 409)
    }
    /** @type {Array<{ job_id: string, turn_id: string }>} */
    let owedMoments = []
    if (opened.created) {
      await markStale(pool, siteKey, new Date(now()))
      const parsedTurn = /** @type {{ sessionId: string, turn: number }} */ (parseTurnId(turnId))
      owedMoments = await owedMomentsOf(pool, siteKey, parsedTurn.sessionId, parsedTurn.turn)
      // Ended within the wait, the follow-up (`door-follow-up.js` `WORK.seal`) has kept the outside
      // commits, or marked the start unsealed. Not taken by the host, or still running when the wait
      // ran out: the agent's first write may come now, before any seal, so the turn starts unsealed —
      // a seal that ends later may even hold what the agent wrote first. Still running: the hand-over
      // marks it (`handOver`, one statement with it), and the sweep keeps the outside commits the seal
      // reports when it ends (ledger L31) — and takes the mark off again when that seal proves the
      // turn's start all the same (`sealProvesStart`: it sealed nothing, the door asked for it within
      // `SEAL_LEAD_MAX_MS`, and nothing that commits ran on the site while it waited). Never taken by
      // the host: nothing will ever prove it, the mark stays.
      const job = await runOwedJob(site, { kind: 'webroot-seal-outside', turn: turnId }, SEAL_WAIT_MS, {
        door: 'seal',
        turnId,
        payload: {
          lead: now() - asked,
          ...(body?.waitsForMoments === true && owedMoments.length > 0
            ? { heldBehind: owedMoments.map((m) => m.job_id) }
            : {})
        }
      })
      if (!job.filed) await markUnsealedStart(pool, turnId)
      await flagConcurrent(pool, turnId)
      void pullCmsLog(pool, site, { runJob: runSiteJob }).catch((error) => {
        console.warn(`[tracy-web] cms log pull at turn open failed on ${siteKey}: ${error?.message ?? error}`)
      })
    }
    const row = await turnOf(pool, turnId)
    const parsed = parseTurnId(turnId)
    /** @type {Array<{ turn: number, title: string, complete: boolean }>} */
    let undone = []
    if (opened.created && parsed !== null) {
      try {
        undone = (await undoneSince(pool, siteKey, parsed.sessionId, parsed.turn)).map((t) => ({
          turn: t.turn,
          title: titleWithin(t.title, UNDONE_TITLE_MAX),
          complete: t.undo_complete === true
        }))
      } catch (error) {
        // A note for the agent, never a reason to fail the turn's open.
        console.warn(`[tracy-web] undone turns not read for ${turnId}: ${error?.message ?? error}`)
      }
    }
    // Read again after the seal's wait: a moment that ended meanwhile holds nothing.
    const stillOwed =
      owedMoments.length > 0 && parsed !== null
        ? await owedMomentsOf(pool, siteKey, parsed.sessionId, parsed.turn)
        : []
    return json(c, {
      ok: true,
      turnId,
      concurrent: row?.concurrent === true,
      unsealedStart: row?.unsealed_start === true,
      undone,
      momentsPending: [...new Set(stillOwed.map((m) => m.turn_id))]
    })
  })

  // ── POST /api/sites/:key/turn/undone — the turns undone since the conversation's last turn opened ──
  // The open above answers the same list, but only after the seal's wait and the previous turn's sweep:
  // from a conversation's second turn on, the agent's first step waited for all of it (2–15 s, more
  // under load) only to learn whether the person undid an earlier request. `undoneSince` reads the
  // PREVIOUS turn's row alone, so this answers the same list before this turn's row exists and without
  // a host job. Read-only: no row, no seal, no lease (16/10/2026).
  app.post('/api/sites/:key/turn/undone', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const held = await conversationSite(c)
    if (held.error) return held.error
    const siteKey = held.siteKey
    const auth = await requireGrant(c, siteKey, true)
    if (auth.error) return auth.error
    const body = await c.req.json().catch(() => null)
    const parsed = parseTurnId(body?.turnId)
    if (parsed === null) return json(c, { code: 'INVALID_TURN' }, 400)
    try {
      const undone = (await undoneSince(pool, siteKey, parsed.sessionId, parsed.turn)).map((t) => ({
        turn: t.turn,
        title: titleWithin(t.title, UNDONE_TITLE_MAX),
        complete: t.undo_complete === true
      }))
      return json(c, { ok: true, undone })
    } catch (error) {
      console.warn(`[tracy-web] undone turns not read for ${body?.turnId}: ${error?.message ?? error}`)
      return json(c, { code: 'UNDONE_UNREADABLE' }, 503)
    }
  })

  // ── POST /api/sites/:key/turn/rating — a Good or Bad on the answer of one turn (#1403 item 13) ──────
  // The host dsh sends it when the person rates Tracy's answer in the chat (dsh's message feedback),
  // signed as the person who typed that turn, as `/turn` and `/moment` are. Kept beside the turn
  // (migration 113) so answers can be measured with their turns; the note is never sent. `rating: null`
  // takes it back. A turn this site does not hold is 404 `TURN_UNKNOWN`.
  app.post('/api/sites/:key/turn/rating', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const held = await conversationSite(c)
    if (held.error) return held.error
    const siteKey = held.siteKey
    const auth = await requireGrant(c, siteKey, true)
    if (auth.error) return auth.error
    const body = await c.req.json().catch(() => null)
    const parsed = parseTurnId(body?.turnId)
    if (parsed === null) return json(c, { code: 'INVALID_TURN' }, 400)
    const rating = body?.rating ?? null
    if (rating !== null && !RATINGS.has(rating)) return json(c, { code: 'INVALID_RATING' }, 400)
    const categories = body?.categories ?? []
    if (
      !Array.isArray(categories) ||
      categories.length > 10 ||
      !categories.every((x) => typeof x === 'string' && RATING_CATEGORY.test(x))
    )
      return json(c, { code: 'INVALID_CATEGORIES' }, 400)
    const turnId = `${parsed.sessionId}:${parsed.turn}`
    if (!(await rateTurn(pool, siteKey, turnId, { rating, categories })))
      return json(c, { code: 'TURN_UNKNOWN' }, 404)
    return json(c, { ok: true })
  })

  // ── POST /api/sites/:key/turn/check — the visual check's verdict on one turn (migration 114) ───────
  // The host dsh's site-tools plugin sends it once its visual check of a turn that wrote has answered
  // (`visual-check.mjs`), signed as the person who typed, as `/changed` is: `visual` is one of
  // `VISUAL_VERDICTS`; `skipped` names why in `note` (`no-write`, `no-image-model`…). Kept beside the
  // turn so usage can say how often a change was seen. A turn this site does not hold is 404.
  app.post('/api/sites/:key/turn/check', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const held = await conversationSite(c)
    if (held.error) return held.error
    const siteKey = held.siteKey
    const auth = await requireGrant(c, siteKey, true)
    if (auth.error) return auth.error
    const body = await c.req.json().catch(() => null)
    const parsed = parseTurnId(body?.turnId)
    if (parsed === null) return json(c, { code: 'INVALID_TURN' }, 400)
    const visual = body?.visual
    if (typeof visual !== 'string' || !VISUAL_VERDICTS.has(visual))
      return json(c, { code: 'INVALID_VISUAL' }, 400)
    const note = body?.note ?? null
    if (note !== null && (typeof note !== 'string' || !VISUAL_NOTE.test(note)))
      return json(c, { code: 'INVALID_NOTE' }, 400)
    const turnId = `${parsed.sessionId}:${parsed.turn}`
    if (!(await checkTurn(pool, siteKey, turnId, { visual, note })))
      return json(c, { code: 'TURN_UNKNOWN' }, 404)
    return json(c, { ok: true })
  })

  // ── POST /api/sites/:key/moment/wait — has an earlier turn's moment ended? ─────────────────────────
  // Option A (10/10/2026, ledger L31): the host dsh holds a turn's first write while an earlier
  // turn of its conversation still has its moment committing (`momentsPending` above), asking here —
  // signed as the person who typed, as `/turn` and `/moment` are — until the answer is `ended: true` or
  // its own bound runs out. Each ask waits up to `MOMENT_HOLD_POLL_MS`, asking the host itself, and
  // does the moment's work the moment it ends (`waitForMoment`: the turn closed with its commit), so a
  // moment that already ended costs one round trip and none ends up waiting for the sweep. `release`:
  // the dsh's bound ran out and the write goes now; a moment still owed then is recorded as let go
  // (`releaseHold`), and if it commits, the turns it may mix are marked (`concurrent` on its own turn,
  // `unsealedStart` on the later ones) — nothing is silently put under the wrong turn.
  app.post('/api/sites/:key/moment/wait', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const held = await conversationSite(c)
    if (held.error) return held.error
    const siteKey = held.siteKey
    const auth = await requireGrant(c, siteKey, true)
    if (auth.error) return auth.error
    if (
      await overLimitOrClosed(
        pool,
        `moment-wait:${auth.email}:${siteKey}`,
        MOMENT_WAITS_PER_MINUTE_PER_SEAT,
        now(),
        60_000
      )
    )
      return json(c, { code: 'RATE_LIMITED' }, 429)
    const body = await c.req.json().catch(() => null)
    const turnId = body?.turnId
    if (parseTurnId(turnId) === null) return json(c, { code: 'INVALID_TURN' }, 400)
    const ended = await waitForMoment(
      pool,
      { siteKey, turnId },
      {
        pollJob: ({ host: hostName, jobId }) =>
          host.hostJob(config, hostName, jobId, { fetchImpl, timeoutMs: 5_000 }),
        waitMs: body?.release === true ? 0 : MOMENT_HOLD_POLL_MS,
        now
      }
    )
    if (ended) return json(c, { ok: true, ended: true })
    if (body?.release !== true) return json(c, { ok: true, ended: false })
    // Let go: still owed when recorded — or followed through in between, which is an ending.
    const released = await releaseHold(pool, { siteKey, turnId })
    return json(c, released ? { ok: true, ended: false, released: true } : { ok: true, ended: true })
  })

  // A configuration file (`wp-config.php`, `configuration.php`, `.env`, …: `file-visibility.js`)
  // is NAMED but never read: 200 `{path, blocked: true, reason}` without asking the host, because
  // every seat may know that it changed, and none may read the database password in it (plan
  // `tasks/todo-site-changes.md` Q1, invariant 10). tracy-host's job validator and the host script
  // refuse the same files, so a host that answers `CONFIG_FILE_BLOCKED` reads the same here.
  app.get('/api/sites/:key/file-diff', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const visible = fileVisibility(c.req.query('path') ?? '')
    if (!visible.ok) return json(c, { code: visible.code }, 400)
    const { path } = visible
    if (visible.blocked) return json(c, { path, blocked: true, reason: visible.reason })
    // `sha`: the diff IN that moment (`SHA^ → SHA`), what a Site changes row opens (plan P1,
    // 01/10). Without it, the file against the latest backup, as the Diff tab has always shown.
    const sha = c.req.query('sha')
    if (sha !== undefined && !/^[0-9a-f]{7,64}$/.test(sha)) return json(c, { code: 'INVALID_SHA' }, 400)
    const job = await runSiteJob(
      site,
      sha ? { kind: 'webroot-file-diff', path, sha } : { kind: 'webroot-file-diff', path },
      45_000
    )
    if (!job.ok) {
      if (job.reason.includes('CONFIG_FILE_BLOCKED'))
        return json(c, { path, blocked: true, reason: 'configuration-file' })
      return json(c, { code: 'FLEET_JOB_FAILED', reason: job.reason }, 502)
    }
    const diff = job.output ?? ''
    return json(c, { path, diff, truncated: diff.length >= 15_900, ...(sha ? { sha } : {}) })
  })

  // The files ONE moment touched (path, status, lines added/removed), read when the Site changes
  // tab opens that moment's row. The host's `webroot-commit` job runs `webroot-git.sh --op commit`.
  app.get('/api/sites/:key/moments/:sha/files', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const sha = c.req.param('sha') ?? ''
    if (!/^[0-9a-f]{7,64}$/.test(sha)) return json(c, { code: 'INVALID_SHA' }, 400)
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const job = await runSiteJob(site, { kind: 'webroot-commit', sha }, 45_000)
    if (!job.ok) {
      if (job.reason === 'timeout') return json(c, { code: 'FLEET_JOB_PENDING' }, 202)
      return json(c, { code: 'FLEET_JOB_FAILED', reason: job.reason }, 502)
    }
    const data = lastLine(job.output)
    if (!data || data.ok !== true) return json(c, { code: 'FLEET_ANSWERED_UNREADABLY' }, 502)
    // `truncated`: the host lists at most 500 files of one moment (`webroot-git.sh --op commit`); the
    // tab says so instead of showing the first 500 as all of them (dev round 02/10: 1277 → 500).
    return json(c, {
      sha: data.sha ?? sha,
      files: Array.isArray(data.files) ? data.files : [],
      truncated: data.truncated === true
    })
  })

  // What an Undo of ONE moment will revert — `{files, complete, truncatedList}` — from the same list
  // `restore_undo` walks (every file of the commit, cache and excluded files included, past the 500
  // the files door lists). Read-only; the restore re-checks conflicts when it runs. The Undo dialog
  // counts with this, never with a turn's summed `files` or a page's length (Site changes V2 §3.3).
  app.get('/api/sites/:key/moments/:sha/undo-scope', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const sha = c.req.param('sha') ?? ''
    if (!/^[0-9a-f]{7,64}$/.test(sha)) return json(c, { code: 'INVALID_SHA' }, 400)
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const job = await runSiteJob(site, { kind: 'webroot-commit', sha }, 45_000)
    if (!job.ok) {
      if (job.reason === 'timeout') return json(c, { code: 'FLEET_JOB_PENDING' }, 202)
      return json(c, { code: 'FLEET_JOB_FAILED', reason: job.reason }, 502)
    }
    const data = jobAnswer(job.output)
    if (!data || data.ok !== true) return json(c, { code: 'FLEET_ANSWERED_UNREADABLY' }, 502)
    return json(c, scopeOfCommit(data))
  })

  /** One poll of a site job on its host (no row written) — for reconciling operations. */
  async function pollSiteJob(site, jobId) {
    return host.hostJob(config, site.host, jobId, { fetchImpl })
  }

  /**
   * The id of a backup job the host confirms is still running, from an unfinished
   * `webroot-backup` row within {@link BACKUP_IN_FLIGHT_MS}; otherwise null. A host that cannot say
   * is not taken as busy — the press goes on as before.
   * @param {any} site - the `site` row.
   */
  async function backupInFlight(site) {
    const open = await openJobOfKind(pool, site.site_key, 'webroot-backup', BACKUP_IN_FLIGHT_MS)
    if (!open) return null
    const polled = await pollSiteJob(site, open.id)
    if (!polled.ok || !polled.body) return null
    await updateJob(pool, open.id, { state: polled.body.state, step: polled.body.step, detail: polled.body })
    return polled.body.state !== 'done' && polled.body.state !== 'failed' ? open.id : null
  }

  /**
   * Settle this site's undo/restore operations left `pending`/`unknown` (`operations.js`
   * `reconcilePending`): bounded, idempotent, throttled per row. For the activity projection.
   * @param {any} site - the `site` row.
   */
  async function reconcileSiteOperations(site) {
    return reconcilePending(pool, site, { runJob: runSiteJob, pollJob: pollSiteJob, now })
  }

  /** The answer a retried press (same `idemKey`) gets: the operation as it stands, never a re-run. */
  async function replayRestore(c, site, op) {
    const answer = await replayRestoreAnswer(site, op)
    return json(c, answer.body, /** @type {any} */ (answer.status))
  }

  /** {@link replayRestore} as `{status, body}`, for a caller that is not an HTTP door. */
  async function replayRestoreAnswer(site, op) {
    const reply = (body, status = 200) => ({ status, body })
    const settled = await reconcileOperation(pool, site, op, { runJob: runSiteJob, pollJob: pollSiteJob })
    const job = settled.job_id ? await jobById(pool, settled.job_id) : null
    const data = job?.state === 'done' ? jobAnswer(job.detail?.output) : null
    const tag = { operationId: settled.id, status: settled.status }
    if (settled.status === 'pending' || settled.status === 'unknown') {
      return reply(
        { code: settled.status === 'pending' ? 'OPERATION_PENDING' : 'OPERATION_UNKNOWN', ...tag },
        202
      )
    }
    if (settled.status === 'failed') {
      // "Restore everything" refused by the host (its own code): the same 409 the live press gave.
      if (settled.action === 'restore-everything' && !['JOB_FAILED', 'HOST_REFUSED'].includes(settled.error))
        return reply({ code: 'RESTORE_REFUSED', reason: settled.error ?? 'REFUSED', ...tag }, 409)
      if (settled.error === 'CONFLICT')
        return reply(
          { code: 'CONFLICT', files: Array.isArray(data?.files) ? data.files.map(String) : [], ...tag },
          409
        )
      if (settled.error === 'NOT_UNDOABLE') return reply({ code: 'NOT_UNDOABLE', ...tag }, 409)
      return reply({ code: 'FLEET_JOB_FAILED', reason: settled.error ?? 'failed', ...tag }, 502)
    }
    // A press whose answer was lost and that settled since (`unknown` → `succeeded`): the team was
    // not told on the first press, so it is told now; `announceRestored` tells each operation once.
    if (settled.action === 'restore-everything' && settled.status === 'succeeded') {
      const actor = await pool.query('select id from account where email = $1', [settled.actor_email])
      await announceRestored(site, settled, actor.rows[0]?.id ?? null)
    }
    return reply({
      ok: true,
      files: data?.files ?? 0,
      head: data?.head ?? settled.resulting_sha ?? null,
      ...(settled.action === 'restore-everything' ? { version: settled.scope?.version ?? null } : {}),
      ...tag
    })
  }

  /**
   * `POST /restore` with `mode: 'everything'` — files AND database back to one backup (ADR 0024
   * sub-decision 2). Everything saved on the site after that point is deleted, so the door asks
   * more than the file verbs:
   *   - the `site` toolset (owner and editor, ADR 0028 — the bar of `db.restore`), not only `code`;
   *   - `confirm`: the word "restore" the person typed, checked HERE — the dialog's own check is
   *     not trusted (03/10/2026, as My Sites' delete: a fixed word, not the site address;
   *     {@link confirmationRefusal});
   *   - a point the host PROVED holds a database (`database.state === 'full'`, read back from the
   *     history before anything runs); any other point → 409 `BACKUP_NOT_FULL`.
   * Then as the other verbs: a `site_operation` row (`restore-everything`) created `pending` before
   * the host job, `idemKey` replays, settled only from a verified answer (`operations.js`
   * `everythingSettlement`: database hash AND restore commit), audit `site.restore`.
   * The host makes its own "Before restore" backup first; it is a backup point like any other in
   * `/backups`, not a row of this door's answer.
   */
  async function restoreEverything(c, auth, site, body) {
    const siteKey = site.site_key
    const version = body?.version
    if (!Number.isSafeInteger(version) || version < 1) return json(c, { code: 'INVALID_VERSION' }, 400)
    const idemKey = parseIdemKey(body?.idemKey)
    if (idemKey === null) return json(c, { code: 'INVALID_IDEM_KEY' }, 400)
    if (!(await seatToolsets(auth, siteKey)).site)
      return json(c, { code: 'FORBIDDEN_WRITE', toolset: 'site', role: auth.grant.role }, 403)
    const refusal = confirmationRefusal(body)
    if (refusal) return json(c, { code: refusal }, 400)
    const samePress = (op) =>
      op.action === 'restore-everything' && op.scope?.version === version && op.actor_email === auth.email
    if (idemKey) {
      const existing = await operationByIdem(pool, siteKey, idemKey)
      if (existing) {
        if (!samePress(existing)) return json(c, { code: 'IDEMPOTENCY_KEY_REUSED' }, 409)
        return replayRestore(c, site, existing)
      }
    }
    // What the point holds, as the host proves it now — never as a client says.
    const history = await runSiteJob(site, { kind: 'webroot-history' }, 45_000)
    if (!history.ok) {
      if (history.reason === 'timeout') return json(c, { code: 'FLEET_JOB_PENDING' }, 202)
      return json(c, { code: 'FLEET_JOB_FAILED', reason: history.reason }, 502)
    }
    const read = lastLine(history.output)
    if (!read || read.ok !== true || !Array.isArray(read.rows))
      return json(c, { code: 'FLEET_ANSWERED_UNREADABLY' }, 502)
    const point = pointOf(read.rows, version)
    if (!point) return json(c, { code: 'BACKUP_UNKNOWN', version }, 404)
    const database = databaseOf(point)
    if (database.state !== 'full')
      return json(c, { code: 'BACKUP_NOT_FULL', version, database: database.state }, 409)
    const { operation, created } = await createOperation(pool, {
      siteKey,
      action: 'restore-everything',
      targetSha: point.sha,
      scope: {
        version,
        database: { engine: database.engine, sha256: database.sha256, size: database.size },
        // The backup's title, for the team's notification when the operation settles later (T12).
        title: typeof point.title === 'string' ? point.title.trim().slice(0, 200) : null
      },
      actorEmail: auth.email,
      idemKey
    })
    if (!created) {
      if (!samePress(operation)) return json(c, { code: 'IDEMPOTENCY_KEY_REUSED' }, 409)
      return replayRestore(c, site, operation)
    }
    const input = {
      kind: 'webroot-restore-everything',
      version,
      sha: point.sha,
      // The "Before restore" backup the host makes first is the presser's (ADR 0024).
      byEmail: auth.email
    }
    const byName = typeof auth.account?.display_name === 'string' ? auth.account.display_name.trim() : ''
    if (byName) input.byName = byName
    let jobId = null
    let job
    try {
      job = await runSiteJob(site, input, 120_000, async (id) => {
        jobId = id
        await attachJob(pool, operation.id, id)
      })
    } catch (error) {
      await finishOperation(pool, operation.id, { status: 'unknown', error: jobId ? 'DOOR_ERROR' : 'NO_JOB' })
      throw error
    }
    if (!job.ok) {
      const settled = await finishOperation(
        pool,
        operation.id,
        job.reason === 'timeout'
          ? { status: 'unknown', error: 'TIMEOUT' }
          : { status: 'failed', error: jobId ? 'JOB_FAILED' : 'HOST_REFUSED' }
      )
      return json(
        c,
        { code: 'FLEET_JOB_FAILED', reason: job.reason, operationId: settled.id, status: settled.status },
        502
      )
    }
    const data = jobAnswer(job.output)
    const settled = await finishOperation(
      pool,
      operation.id,
      await settlementOf(operation, data, (head) => inspectCommit(runSiteJob, site, head))
    )
    const tag = { operationId: settled.id, status: settled.status }
    if (data?.ok === false)
      return json(
        c,
        { code: 'RESTORE_REFUSED', reason: String(data.code ?? 'REFUSED').slice(0, 64), ...tag },
        409
      )
    if (!data || data.ok !== true) return json(c, { code: 'FLEET_ANSWERED_UNREADABLY', ...tag }, 502)
    await audit(pool, {
      actor: auth.email,
      action: 'site.restore',
      siteKey,
      detail: {
        mode: 'everything',
        version,
        sha: point.sha,
        head: data.head ?? null,
        operationId: settled.id
      }
    })
    if (settled.status !== 'succeeded') return json(c, { code: 'OPERATION_UNKNOWN', ...tag }, 202)
    await announceRestored(site, settled, auth.account?.id ?? null)
    return json(c, { ok: true, files: data.files ?? 0, head: data.head ?? null, version, ...tag })
  }

  // Undo one moment / reset to a moment. Site changes V2 (contract §3, D3): a `site_operation` row
  // is created `pending` BEFORE the host job, tied to the job's id, and settled only from a verified
  // answer — a lost answer is `unknown` (reconciled later through the job), never "nothing changed".
  // `idemKey` (optional; an older client sends none and still gets a row): a retry with the same key
  // answers the existing operation and never runs the restore twice. The fields an older client
  // reads (`ok`, `files`, `head`, `code`, `reason`) are unchanged; `operationId`/`status` are added.
  app.post('/api/sites/:key/restore', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const body = await c.req.json().catch(() => null)
    if (body?.mode === 'everything') return restoreEverything(c, auth, site, body)
    const sha = typeof body?.sha === 'string' ? body.sha.trim() : ''
    if (!/^[0-9a-f]{7,64}$/.test(sha)) return json(c, { code: 'INVALID_SHA' }, 400)
    if (body?.mode !== 'undo' && body?.mode !== 'reset') return json(c, { code: 'INVALID_MODE' }, 400)
    const idemKey = parseIdemKey(body?.idemKey)
    if (idemKey === null) return json(c, { code: 'INVALID_IDEM_KEY' }, 400)
    const answer = await restoreMoment({ auth, site, sha, mode: body.mode, idemKey })
    return json(c, answer.body, /** @type {any} */ (answer.status))
  })

  /**
   * Undo one moment / reset to a moment, as `POST /restore` runs it (above), as `{status, body}`: the
   * `code` toolset, the `site_operation` row created before the host job, the verified settlement,
   * the audit row. The turn undo door (`POST /turns/undo`) runs each moment of a turn through here,
   * so every one of them has the same row and the same audit as a press on the Site changes tab.
   * @param {{ auth: any, site: any, sha: string, mode: 'undo' | 'reset', idemKey: string | undefined }} press
   * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
   */
  async function restoreMoment({ auth, site, sha, mode, idemKey }) {
    const siteKey = site.site_key
    const reply = (body, status = 200) => ({ status, body })
    // Both verbs WRITE the site's files, so they ask what writing files asks at the Apply door:
    // the `code` toolset of the seat's role (owner and editor; never a viewer, ADR 0028). A live
    // seat alone is not enough (plan Q1).
    if (!(await seatToolsets(auth, siteKey)).code)
      return reply({ code: 'FORBIDDEN_WRITE', toolset: 'code', role: auth.grant.role }, 403)
    // A key names ONE press: the same site, person, verb and target. Reused for another → refused.
    const samePress = (op) =>
      op.action === mode && sameCommit(op.target_sha, sha) && op.actor_email === auth.email
    if (idemKey) {
      const existing = await operationByIdem(pool, siteKey, idemKey)
      if (existing) {
        if (!samePress(existing)) return reply({ code: 'IDEMPOTENCY_KEY_REUSED' }, 409)
        return replayRestoreAnswer(site, existing)
      }
    }
    // The target as the host names it (full sha) and, for an undo, the scope the press reverts —
    // read-only; a read that fails leaves the target as sent and no scope, and does not block.
    const read = await inspectCommit(runSiteJob, site, sha)
    const targetSha = read.state === 'found' && sameCommit(sha, read.facts.sha) ? read.facts.sha : sha
    const scope = read.state === 'found' && mode === 'undo' ? read.facts.scope : null
    const { operation, created } = await createOperation(pool, {
      siteKey,
      action: mode,
      targetSha,
      scope,
      actorEmail: auth.email,
      idemKey
    })
    if (!created) {
      if (!samePress(operation)) return reply({ code: 'IDEMPOTENCY_KEY_REUSED' }, 409)
      return replayRestoreAnswer(site, operation)
    }
    const kind = mode === 'undo' ? 'webroot-restore-undo' : 'webroot-restore-reset'
    let jobId = null
    let job
    try {
      job = await runSiteJob(site, { kind, sha }, 120_000, async (id) => {
        jobId = id
        await attachJob(pool, operation.id, id)
      })
    } catch (error) {
      await finishOperation(pool, operation.id, { status: 'unknown', error: jobId ? 'DOOR_ERROR' : 'NO_JOB' })
      throw error
    }
    if (!job.ok) {
      // Timed out: the host may well have finished — unknown, read back later through the job.
      // No job id: the host refused before starting one — nothing ran.
      const settled = await finishOperation(
        pool,
        operation.id,
        job.reason === 'timeout'
          ? { status: 'unknown', error: 'TIMEOUT' }
          : { status: 'failed', error: jobId ? 'JOB_FAILED' : 'HOST_REFUSED' }
      )
      return reply(
        { code: 'FLEET_JOB_FAILED', reason: job.reason, operationId: settled.id, status: settled.status },
        502
      )
    }
    const data = jobAnswer(job.output)
    const settled = await finishOperation(
      pool,
      operation.id,
      await settlementOf(operation, data, (head) => inspectCommit(runSiteJob, site, head))
    )
    const tag = { operationId: settled.id, status: settled.status }
    // The undo's two refusals are answers, not failures: nothing was written (`webroot-git.sh`
    // `restore_undo`). CONFLICT names the files that moved on since the moment.
    if (data?.ok === false && (data.code === 'CONFLICT' || data.code === 'NOT_UNDOABLE')) {
      return reply(
        data.code === 'CONFLICT'
          ? { code: 'CONFLICT', files: Array.isArray(data.files) ? data.files.map(String) : [], ...tag }
          : { code: 'NOT_UNDOABLE', ...tag },
        409
      )
    }
    if (!data || data.ok !== true) return reply({ code: 'FLEET_ANSWERED_UNREADABLY', ...tag }, 502)
    await audit(pool, {
      actor: auth.email,
      action: 'site.restore',
      siteKey,
      // `operationId`: this press has its own `site_operation` row; the one-off audit backfill
      // skips audit rows that carry it.
      detail: { mode, sha, head: data.head ?? null, operationId: settled.id }
    })
    await opsFor(pool).record('site.undo', {
      email: auth.email,
      accountId: auth.account.id,
      siteKey,
      data: { moment: sha, ok: true }
    })
    return reply({ ok: true, files: data.files ?? 0, head: data.head ?? null, ...tag })
  }

  // ── Undo by chat turn (plan tasks/undo-change, contract api-contract.md) ─────────────────────
  //
  // `GET /turns?session=` says, for every turn of one conversation on this site, what it changed and
  // whether it can be undone (and why not); `POST /turns/undo` undoes the latest one, or goes back to
  // before an older one. The decisions are `turn-undo.js` (pure); the reads `turn-undo-store.js`;
  // the writes are the doors that already exist: each moment through `restoreMoment` (a
  // `site_operation` row, as the Site changes tab's Undo), each content write through the Apply door's
  // `apply.revert` (an audit row, as the interrupted card's Undo all).

  /** Sites with a turn undo running in THIS process: a second press waits for the first. */
  const turnUndoRunning = new Set()

  /**
   * The facts `turnsView` reads, for one conversation on one site. Two host jobs: the moments of the
   * turns (`turn-moments`) and the preflight of undoing them (`undo-check`). A failed preflight is not
   * a failed read: `filesChecked: false`, and the POST refuses to write files without one.
   * @returns {Promise<{ facts: any, filesChecked: boolean, looksChecked: boolean } | { error: { status: number, body: Record<string, unknown> } }>}
   */
  async function readTurnFacts(auth, site, sessionId) {
    const siteKey = site.site_key
    const at = now()
    const turns = await sessionTurns(pool, siteKey, sessionId)
    const turnIds = turns.map((t) => t.turn_id)
    const since = turns.reduce((m, t) => Math.min(m, new Date(t.opened_at).getTime()), at)
    const sinceDate = new Date(since)
    let moments = { turns: {}, truncated: false }
    if (turns.some((t) => Number(t.files) > 0 || t.head_sha)) {
      for (let i = 0; i < turnIds.length; i += 100) {
        const job = await runSiteJob(
          site,
          { kind: 'webroot-turn-moments', turns: turnIds.slice(i, i + 100) },
          45_000
        )
        if (!job.ok) {
          if (job.reason === 'timeout') return { error: { status: 202, body: { code: 'FLEET_JOB_PENDING' } } }
          return { error: { status: 502, body: { code: 'FLEET_JOB_FAILED', reason: job.reason } } }
        }
        const data = jobAnswer(job.output)
        if (!data || data.ok !== true || typeof data.turns !== 'object' || data.turns === null)
          return { error: { status: 502, body: { code: 'FLEET_ANSWERED_UNREADABLY' } } }
        moments = {
          turns: { ...moments.turns, ...data.turns },
          truncated: moments.truncated || data.truncated === true
        }
      }
    }
    const [openTurns, writes, audits, laterWrites, laterCms, operations, toolsets] = await Promise.all([
      openTurnsOn(pool, siteKey, new Date(at - OPEN_TURN_HOLDS_MS)),
      writesOfTurns(pool, siteKey, turnIds),
      turnIds.length ? turnAudits(pool, siteKey, turnIds, sinceDate) : Promise.resolve([]),
      turnIds.length ? writesAfter(pool, siteKey, sinceDate) : Promise.resolve([]),
      turnIds.length ? cmsChangesAfter(pool, siteKey, sinceDate) : Promise.resolve([]),
      turnIds.length ? operationsAfter(pool, siteKey, sinceDate) : Promise.resolve([]),
      seatToolsets(auth, siteKey)
    ])
    const ownIds = new Set(turnIds)
    const applyIds = [
      ...new Set(
        audits
          .filter((row) => ownIds.has(row.detail?.turnId) && typeof row.detail?.apply_id === 'string')
          .map((row) => row.detail.apply_id)
      )
    ]
    const sharedAudits = await applyIdAudits(pool, siteKey, applyIds)
    const shas = shasToCheck({ turns, moments, operations })
    let check = null
    let filesChecked = shas.length === 0
    if (shas.length > 0) {
      const job = await runSiteJob(site, { kind: 'webroot-undo-check', shas: shas.slice(0, 200) }, 45_000)
      const data = job.ok ? jobAnswer(job.output) : null
      if (data?.ok === true && Array.isArray(data.commits)) {
        check = data
        filesChecked = shas.length <= 200
      }
    }
    // WordPress looks (`look-css`): the host reads each look undo entry and the site's Additional CSS
    // now, as hashes (`site-look-css` check). Unread is not a failed read: `looksChecked: false`, and
    // the POST refuses to put a look back without it, as files without `undo-check`.
    const lookIds = site.platform === 'wordpress' ? looksToCheck(writes) : []
    let looks = null
    let looksChecked = lookIds.length === 0
    if (lookIds.length > 0) {
      const job = await runSiteJob(site, { kind: 'site-look-css', mode: 'check', ids: lookIds }, 45_000)
      const data = job.ok ? jobAnswer(job.output) : null
      if (data?.ok === true && data.entries && typeof data.entries === 'object') {
        looks = { entries: data.entries }
        looksChecked = true
      }
    }
    return {
      facts: {
        platform: site.platform ?? null,
        now: at,
        // Owners and editors see every turn of the conversation (they may undo anyone's change on
        // the Site changes tab too); a viewer sees only its own.
        viewer: { email: auth.email, seesAll: Boolean(seats.actingEditor(auth.grant)) },
        toolsets,
        turns,
        openTurns,
        moments,
        writes,
        audits,
        laterWrites,
        laterCms,
        operations,
        sharedAudits,
        check,
        looks
      },
      filesChecked,
      looksChecked
    }
  }

  /** A conversation id the turn doors take: a dsh session id, never a seat key's `key:<id>`. */
  const turnSession = (value) =>
    typeof value === 'string' && AUDIT_SESSION_SHAPE.test(value) && !value.startsWith('key:') ? value : null

  app.get('/api/sites/:key/turns', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey, true)
    if (auth.error) return auth.error
    const sessionId = turnSession(c.req.query('session'))
    if (sessionId === null) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const read = await readTurnFacts(auth, site, sessionId)
    if ('error' in read) return json(c, read.error.body, /** @type {any} */ (read.error.status))
    const view = turnsView(read.facts)
    // The site's newest design system apply (the Design system button; not a turn of any chat): the
    // site browser's Undo offers it when it is newer than this chat's newest change, and undoes it
    // through the Design system door. `canUndo`: what that door asks (`theme.style`'s toolset).
    const dsLast = await designSystemStore(pool).latest(siteKey)
    const dsToolset = /** @type {string} */ (APPLY_RULES.get('theme.style'))
    // `filesChecked` (beyond the contract): false when the host's preflight could not be read, so
    // no turn says "files changed after" — and the POST will not write files until it can.
    return json(c, {
      cms: view.cms,
      siteBusy: view.siteBusy,
      filesChecked: read.filesChecked,
      turns: view.turns,
      designSystem: dsLast ? { ...lastOf(dsLast), canUndo: Boolean(read.facts.toolsets[dsToolset]) } : null
    })
  })

  app.post('/api/sites/:key/turns/undo', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    // An undo writes the site; a viewer holds no toolset to write with (ADR 0028).
    if (!(await mayWrite(auth, siteKey)))
      return json(c, { code: 'FORBIDDEN_WRITE', role: auth.grant.role }, 403)
    const body = await c.req.json().catch(() => null)
    const session = turnSession(body?.session)
    const turnId = typeof body?.turnId === 'string' ? body.turnId : ''
    const scope = body?.scope
    const header = c.req.header('x-tracy-session')
    if (
      session === null ||
      parseTurnId(turnId)?.sessionId !== session ||
      (scope !== 'turn' && scope !== 'from-here') ||
      (header !== undefined && header !== session)
    )
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    const idemKey = parseIdemKey(body?.idemKey)
    if (idemKey === null) return json(c, { code: 'INVALID_REQUEST', field: 'idemKey' }, 400)
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    if (idemKey) {
      const press = await turnUndoPress(pool, siteKey, idemKey)
      if (press) {
        const same =
          press.actor === auth.email && press.detail?.turnId === turnId && press.detail?.scope === scope
        if (!same) return json(c, { code: 'IDEMPOTENCY_KEY_REUSED' }, 409)
        return json(c, { ok: true, ...press.detail.result })
      }
    }
    if (turnUndoRunning.has(siteKey)) return json(c, { code: 'SITE_BUSY' }, 409)
    turnUndoRunning.add(siteKey)
    try {
      // Fresh evidence of admin edits before deciding: the CMS log is otherwise pulled on a timer.
      await pullCmsLog(pool, site, { runJob: runSiteJob }).catch((error) => {
        console.warn(`[tracy-web] turn undo: cms log pull failed on ${siteKey}: ${error?.message ?? error}`)
      })
      const read = await readTurnFacts(auth, site, session)
      if ('error' in read) return json(c, read.error.body, /** @type {any} */ (read.error.status))
      const plan = undoPlan(turnsView(read.facts), turnId, scope)
      if ('error' in plan) {
        const { status, ...refusal } = plan.error
        return json(c, refusal, /** @type {any} */ (status))
      }
      if (plan.steps.some((step) => step.commits.length > 0) && !read.filesChecked)
        return json(c, { code: 'FLEET_JOB_FAILED', reason: 'undo-check unavailable' }, 502)
      if (plan.steps.some((step) => step.looks.length > 0) && !read.looksChecked)
        return json(c, { code: 'FLEET_JOB_FAILED', reason: 'look check unavailable' }, 502)
      await notePresence(pool, { siteKey, sessionId: session, actor: auth.email })
      const lease = await takeWriteLease(pool, { siteKey, sessionId: session, actor: auth.email })
      if (!lease.ok) return json(c, { code: 'SITE_BUSY', holder: lease.holder?.holder_actor ?? null }, 409)
      let result
      // The moments verifiably undone, so a turn left half done is still stamped (`undoneMarks`).
      const undoneShas = new Set()
      try {
        result = await runUndo(plan.steps, {
          undoCommit: async (sha) => {
            try {
              const outcome = fileOutcome(
                await restoreMoment({
                  auth,
                  site,
                  sha,
                  mode: 'undo',
                  // One key per moment of the press, so a retried press replays each moment's row.
                  idemKey: idemKey ? `${idemKey.slice(0, 100)}.${sha.slice(0, 12)}` : undefined
                })
              )
              if (outcome.status === 'undone') undoneShas.add(sha)
              return outcome
            } catch {
              return { status: 'unsure', code: 'DOOR_ERROR' }
            }
          },
          revertApply: async (applyId) => {
            try {
              return revertOutcome(
                await applyDoor({
                  siteKey,
                  action: 'apply.revert',
                  params: { apply_id: applyId },
                  principal: auth,
                  headers: { 'x-tracy-session': session }
                })
              )
            } catch {
              return revertOutcome({ thrown: true })
            }
          },
          // A WordPress look: its Additional CSS back through the host (`site-look-css` undo, compare
          // and set), recorded as a `look.revert` of that id — the row that says it is back, and the
          // stamp everybody's Refresh button reads.
          undoLook: async (undo) => {
            let outcome
            try {
              outcome = lookOutcome(
                await runSiteJob(site, { kind: 'site-look-css', mode: 'undo', id: undo }, 45_000),
                jobAnswer
              )
            } catch {
              return { status: 'unsure', code: 'DOOR_ERROR' }
            }
            if (outcome.status === 'undone')
              await auditSiteWrite(pool, {
                actor: auth.email,
                action: 'site.turn-undo.look',
                siteKey,
                detail: { undo, sessionId: session },
                write: {
                  turnId: null,
                  sessionId: session,
                  outcome: 'ok',
                  target: { kind: LOOK_TARGET_KIND, id: undo },
                  via: 'look-css',
                  action: 'look.revert'
                }
              }).catch((error) => {
                console.warn(
                  `[tracy-web] turn undo: look ${undo} put back but not recorded on ${siteKey}: ${error?.message ?? error}`
                )
              })
            return outcome
          }
        })
      } finally {
        if (lease.fresh) await releaseWriteLease(pool, { siteKey, sessionId: session })
      }
      // The conversation's next turn tells the agent these turns went back (`POST /turn` `undone`).
      await markTurnsUndone(pool, siteKey, undoneMarks(plan.steps, result, undoneShas)).catch((error) => {
        console.warn(`[tracy-web] turn undo: undone mark not kept on ${siteKey}: ${error?.message ?? error}`)
      })
      await audit(pool, {
        actor: auth.email,
        action: 'site.turn-undo',
        siteKey,
        detail: {
          turnIds: plan.steps.map((step) => step.turnId),
          scope,
          complete: result.complete,
          turnId,
          ...(idemKey ? { idemKey } : {}),
          result
        }
      })
      return json(c, { ok: true, ...result })
    } finally {
      turnUndoRunning.delete(siteKey)
    }
  })

  // ── GET /api/sites/:key/press — the press a closed tab took with it ──────────────────────────
  //
  // 🔒 A PRESS OUTLIVES ITS TAB ONLY IF SOMETHING HANDS IT BACK. The Build form carries the answers
  // in `sessionStorage`, which dies with the tab. The press is also written on the creation row
  // (`site_creation.press`, migration 025), but only the sweep read it — and since #249 the sweep no
  // longer builds Joomla/WordPress sites. A customer who pressed Build and closed the tab came back
  // to the questionnaire and had to answer it again (measured 23/09/2026). This hands the press back
  // to the account that made it, and only for a build that has not started, so the form resumes it.
  app.get('/api/sites/:key/press', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const row = await pendingPressFor(pool, { accountId: auth.account.id, siteKey })
    if (!row) return json(c, { press: null })
    return json(c, { press: row.press, jobId: row.job_id ?? null, state: row.state ?? null })
  })

  // ── GET /api/sites/:key/applies?session=<id>&since=<iso> — what one chat already changed ──────
  // A chat turn cut off by a deploy leaves its writes on the site (#295). This lists them so the
  // chat can say what was applied and offer to undo it: `applyIds` are the distinct ids of writes
  // that succeeded, in the order they were first applied, which is the list `apply.revert` needs
  // (revert them newest first). An owner or editor of the site sees every caller's rows for that
  // session (they may revert anyone's change); a viewer sees only its own, so a shared session id
  // never reads somebody else's work.
  app.get('/api/sites/:key/applies', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey, true)
    if (auth.error) return auth.error
    const sessionId = c.req.query('session') ?? ''
    if (!AUDIT_SESSION_SHAPE.test(sessionId)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const sinceRaw = c.req.query('since')
    const since = sinceRaw ? new Date(sinceRaw) : null
    if (since && Number.isNaN(since.getTime())) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const applies = await appliesOfSession(pool, {
      siteKey,
      sessionId,
      since,
      actor: seats.actingEditor(auth.grant) ? null : auth.email
    })
    // `apply.*` calls (`apply.revert`, `apply.list`) carry the id they act on, not a change of their
    // own, so they never count as something to undo.
    const changes = applies.filter((a) => a.ok && a.applyId && !a.action.startsWith('apply.'))
    const applyIds = [...new Set(changes.map((a) => a.applyId))]
    return json(c, { applies, applyIds })
  })

  // `GET /state`, `POST /state` and `POST /go-live` live in `publish.js`.
  const publishing = mountSitePublish(app, {
    pool,
    config,
    requireGrant,
    actingEditor: seats.actingEditor,
    host,
    fetchImpl,
    plans: SITE_PLANS,
    // The site's own domains: what a publish carries is what DNS proves when it is read for it.
    domains: ownDomains,
    // Lets a deleted site's row go once the host said the site is off it (below, at the delete door).
    closeDeleted: (site, op) => closeDeletedSite(site, op)
  })

  // ── PUT /api/sites/:key/component-credential — custody of a site's write-back token (ADR 0051) ─
  // ported: handleSetComponentCredential
  // Ported from `apiSiteComponentCredential` (worker.js:3009) — that Worker's own validation is
  // what runs here, not `handleSetComponentCredential`'s (`INVALID_ENDPOINT`/`INVALID_TOKEN`):
  // this app is the one door a caller reaches, same as `apiSiteComponentCredential` was the one a
  // caller reached in production, and it never let a body past its own combined check for the
  // seat book's separate codes to matter.
  app.put('/api/sites/:key/component-credential', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    // Custody of the site's write-back token is site administration: the Owner's (ADR 0028).
    if (!seats.actingOwner(auth.grant)) return json(c, { code: 'NOT_SITE_OWNER' }, 403)
    const body = await c.req.json().catch(() => null)
    if (!body) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    // The endpoint reaches the customer's live site, so https-only — except a stand's own site on
    // this machine (`config.localStand`), the source a local Import test reads. The token is only
    // ever validated for shape here, never logged or echoed back.
    const localSource =
      config.localStand === true && /^http:\/\/[a-z0-9-]+\.tracy\.test(:\d+)?\/[^\s]*$/.test(endpoint)
    if ((!/^https:\/\/[^\s]+$/.test(endpoint) && !localSource) || token.length < 16) {
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    }
    await writeComponent(pool, siteKey, { endpoint, token }, auth.email)
    return json(c, { ok: true })
  })

  // ── POST /api/sites/:key/apply — proxy one write (or read) into the site's own component ───────
  // ported: handleApply
  // Ported from `apiSiteApply` (worker.js:2970) + `handleApply` (index.js:2334), minus the
  // Shopify branches and the draft/proposal short-circuit — see `APPLY_RULES`'s own comment.
  // Nothing is decided in this app either: `APPLY_RULES` is the allowlist, `seats.permissionsFor`
  // is the role gate, `audit` is the trail, and `site_component` is the token holder. The answer
  // from the component comes back to the caller VERBATIM — `TOOLSET_NOT_GRANTED` and
  // `COMPONENT_NOT_REGISTERED` are answers the agent must read to the customer, not errors to hide.
  /**
   * Why a content.read query breaks the tracy-content/v1 bounds, or null. Mirrors the schema
   * (`packages/cms/tracy-content-api/schema.json`: content type enum, limit maximum 100); a locale is
   * left to the Claude Cowork plugin, which alone knows the site's locale list.
   * @param {Record<string, unknown>} params
   * @returns {string | null}
   */
  /** A `version` as `content-versions.js` writes it. */
  const VERSION_SHAPE = new RegExp(VERSION_PATTERN)
  /** Walks this process answered (cut short or not), for `changedSince`. */
  const contentVersions = createVersionStore({ now })

  function contentQueryProblem(params) {
    // The names and ranges are one list with the public API reference (`lib/content-query.js`).
    const known = CONTENT_QUERY_NAMES
    const unknown = Object.keys(params).find((key) => !known.includes(key))
    if (unknown !== undefined)
      return `unknown parameter ${JSON.stringify(unknown)}; accepted: ${known.join(', ')}`
    // Several details in one read (Claude Cowork plugin 0.18.3 / 0.14.3): the plugin's own rule, worded
    // here so a caller learns which field to fix instead of reading a bare "Invalid content query".
    if (params.ids !== undefined) {
      const ids = typeof params.ids === 'string' ? params.ids.split(',') : params.ids
      if (
        !Array.isArray(ids) ||
        ids.length < 1 ||
        ids.length > 100 ||
        ids.some((id) => typeof id !== 'string' || id === '' || id.length > 128 || id.includes(','))
      )
        return 'ids must list 1 to 100 content ids'
      if (new Set(ids).size !== ids.length) return 'ids must not repeat an id'
      const other = Object.keys(params).find((key) => !['ids', 'maxBytes'].includes(key))
      if (other !== undefined) return `ids is read with maxBytes only: drop ${JSON.stringify(other)}`
    }
    // The byte budget the Claude Cowork plugin pages by (V2-5): the range every Claude Cowork plugin enforces (rc.11 / wp
    // rc.7 / EmDash #418 answer CONTENT_BAD_QUERY outside it); an older Claude Cowork plugin ignores it.
    if (
      params.maxBytes !== undefined &&
      !(
        Number.isInteger(params.maxBytes) &&
        params.maxBytes >= MAX_BYTES_RANGE.minimum &&
        params.maxBytes <= MAX_BYTES_RANGE.maximum
      )
    )
      return `maxBytes must be an integer between ${MAX_BYTES_RANGE.minimum} and ${MAX_BYTES_RANGE.maximum}: the size of the answer, in bytes`
    for (const key of ['ifVersion', 'changedSince'])
      if (params[key] !== undefined && !(typeof params[key] === 'string' && VERSION_SHAPE.test(params[key])))
        return key === 'changedSince'
          ? `changedSince takes a version, not a time: the "version" an earlier {view:"pages"} answered. With none, read {view:"pages"} now; its version answers the next changedSince`
          : `${key} must be the version an earlier content.read answered ("cv1.…")`
    // `describe` asks what the site holds and what this seat may do there; it is answered by this
    // relay and is not a query, so nothing may ride along with it.
    if (params.describe !== undefined) {
      if (![true, 1, '1'].includes(/** @type {any} */ (params.describe))) return 'describe must be true'
      const other = Object.keys(params).find((key) => key !== 'describe')
      return other === undefined
        ? null
        : `describe is asked alone: drop ${JSON.stringify(other)} and read with a second call`
    }
    // `view=pages` is the site's addresses, walked here over the Claude Cowork plugin's own listing; it takes
    // a locale and nothing that would page or narrow that walk.
    if (params.view !== undefined) {
      if (params.view !== 'pages') return 'view must be "pages"'
      if (params.url !== undefined && (typeof params.url !== 'string' || params.url.trim() === ''))
        return 'url must be the link the customer gave, as text'
      const other = Object.keys(params).find(
        (key) => !['view', 'locale', 'url', 'ifVersion', 'changedSince'].includes(key)
      )
      return other === undefined
        ? null
        : `view=pages takes only locale and url: drop ${JSON.stringify(other)} and read the page with {id} after`
    }
    if (params.url !== undefined) return 'url finds a page by its link: send it with view: "pages"'
    // `changedSince` compares a whole walk with the walk it names; it takes a locale, nothing that
    // pages or narrows the walk.
    if (params.changedSince !== undefined) {
      const other = Object.keys(params).find((key) => !['changedSince', 'locale'].includes(key))
      return other === undefined ? null : `changedSince takes only locale: drop ${JSON.stringify(other)}`
    }
    if (params.fields !== undefined) {
      const projection = projectionOf(params.fields)
      if ('problem' in projection) return projection.problem
    }
    const types = CONTENT_TYPES
    if (params.type !== undefined && !types.includes(/** @type {string} */ (params.type))) {
      return `type must be one of ${types.join(', ')} (blog posts are "article"; template parts, menus and the site identity are "shared")`
    }
    if (params.limit !== undefined) {
      const limit = Number(params.limit)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        return 'limit must be an integer from 1 to 100'
    }
    if (
      params.id !== undefined &&
      ['type', 'locale', 'limit', 'cursor'].some((key) => params[key] !== undefined)
    ) {
      return 'id reads one item: do not combine it with type, locale, limit or cursor'
    }
    if (params.id === undefined && (params.blockId !== undefined || params.blocksCursor !== undefined)) {
      return 'blockId and blocksCursor need the id of the item they belong to'
    }
    return null
  }

  /** The HTTP status of each Content API refusal a Claude Cowork plugin can send. */
  const CONTENT_ERROR_STATUS = {
    CONTENT_BAD_QUERY: 400,
    CONTENT_UNAUTHENTICATED: 401,
    CONTENT_FORBIDDEN: 403,
    CONTENT_NOT_FOUND: 404,
    CONTENT_SNAPSHOT_EXPIRED: 409,
    CONTENT_FIELD_TOO_LARGE: 413,
    CONTENT_ADAPTER_UNSUPPORTED: 501,
    CONTENT_SOURCE_UNAVAILABLE: 503
  }

  /**
   * WHAT A CLAUDE COWORK PLUGIN SAID ABOUT A SITE, KEPT FIVE MINUTES. A describe needs one listing and one count
   * per content type. Joomla's reader returns CONTENT_SOURCE_UNAVAILABLE when two reads overlap on
   * one site (measured on r1j1734: 5/7 failed in parallel, 7/7 passed in series), so ask its
   * types in series. The other readers can answer counts together. Only a v1 answer is kept: a
   * Claude Cowork plugin that could not answer is asked again next time, so an upgrade shows at once. Counts
   * are of the published projection, the same for every seat, so the site key alone is the key.
   */
  const CONTENT_PROBE_TTL_MS = 5 * 60 * 1000
  /** @type {Map<string, {at: number, probe: any, counts: Record<string, number|null>}>} */
  const contentProbes = new Map()
  /** @type {Map<string, Promise<{at: number, probe: any, counts: Record<string, number|null>}>>} */
  const pendingContentProbes = new Map()

  /** @param {string} siteKey @param {string} platform @param {((params: object) => Promise<any>) | null} ask */
  async function contentProbe(siteKey, platform, ask) {
    const held = contentProbes.get(siteKey)
    if (held && now() - held.at < CONTENT_PROBE_TTL_MS) return held
    if (!ask) return { at: now(), probe: null, counts: {} }
    const pending = pendingContentProbes.get(siteKey)
    if (pending) return pending
    const task = (async () => {
      // The smallest budget a Claude Cowork plugin takes: a probe wants the site's shape, not its bodies. A
      // Claude Cowork plugin that pages by it says so in pagination.budget, which is how describe learns
      // the site has the capability.
      let budget = { maxBytes: 8192 }
      let probe = await ask({ limit: 1, ...budget })
      // 🔒 A READER OLDER THAN THE BUDGET IS STILL A READER. Older Claude Cowork plugins ignore
      // maxBytes, but an EmDash reader older than #418 refuses it (400 CONTENT_BAD_QUERY) and answers
      // the same listing without it: measured 28/09/2026 on the stand, r1e1734 (image 1.4.3 built
      // before #418) was described "unsupported" while its reader answered every read, and r2e2308
      // (a later 1.4.3) "v1". So a probe that fails is asked once more without the budget, and the
      // counts are then asked the same way; a reader that answers neither is unsupported as before.
      if (probe?.schemaVersion !== CONTENT_PROTOCOL) {
        budget = {}
        probe = await ask({ limit: 1 })
      }
      if (probe?.schemaVersion !== CONTENT_PROTOCOL) return { at: now(), probe, counts: {} }
      let typed
      if (platform === 'joomla') {
        typed = []
        for (const type of CONTENT_TYPES) typed.push(await ask({ type, limit: 1, ...budget }))
      } else {
        typed = await Promise.all(CONTENT_TYPES.map((type) => ask({ type, limit: 1, ...budget })))
      }
      const counts = Object.fromEntries(
        CONTENT_TYPES.map((type, at) => {
          const total = typed[at]?.schemaVersion === CONTENT_PROTOCOL ? typed[at]?.pagination?.total : null
          return [type, Number.isInteger(total) ? total : null]
        })
      )
      const fresh = { at: now(), probe, counts }
      if (typed.every((answer) => answer?.schemaVersion === CONTENT_PROTOCOL))
        contentProbes.set(siteKey, fresh)
      return fresh
    })()
    pendingContentProbes.set(siteKey, task)
    try {
      return await task
    } finally {
      pendingContentProbes.delete(siteKey)
    }
  }

  /**
   * What this seat may write through the contract on this site, and the profile that says where:
   * `content.contract apply` needs a Tracy component (EmDash has none), a contract profile sealing
   * the site's quickstart, and a toolset — `content` for text, image and link slots, `code` for any
   * other (its `APPLY_RULES` row, `toolsetOfContract`). `slotOpen` says it per slot key.
   *
   * `emdashWrite`: EmDash's own road. Its entries are written through the site's MCP
   * (`tracy_emdash content_update`), which this door does not carry, so the rule is the one every
   * content write here follows — the `content` toolset — as `roadToolsets` (content-locate.js)
   * already decides it for a picked EmDash element. Until 28/09/2026 EmDash had no road at all:
   * every field read `writable: false` and the describe note said "reading only", while the same
   * seat's agent wrote those entries through `tracy_emdash` on the next step.
   * @param {any} site
   * @param {any} perms - null when only the profile is wanted.
   */
  function contentAuthority(site, perms) {
    const sealed = site?.platform !== 'emdash'
    const contract = sealed ? contractFor(CONTRACTS, site?.quickstart_tag, site?.quickstart_version) : null
    // An imported site (no quickstart) is bound to the contract its plugin derived at provisioning:
    // `DERIVED_PROFILE`, text/image/link slots only (`siteAuthority`, 29/09/2026).
    const { profile, derived, apply, slotOpen } = siteAuthority(site, contract, perms)
    const emdashWrite = site?.platform === 'emdash' && Boolean(perms?.content)
    return { contract, profile, derived, apply, slotOpen, emdashWrite }
  }

  /** The `tracy-content-describe/v1` document for one site and one seat. */
  async function describeContent({ siteKey, site, perms, role, ask }) {
    const { contract, profile, apply, emdashWrite } = contentAuthority(site, perms)
    const { probe, counts } = await contentProbe(siteKey, site?.platform ?? '', ask)
    const emdash = site?.platform === 'emdash' ? emdashTemplate(site?.quickstart_tag) : null
    // A quickstart's design is a content recommendation, never a lock (ADR 0022): nothing on the
    // site is refused but writing the database directly, so a known design reads `unlocked` and
    // the reason names the baseline a change is compared against.
    const presentation =
      site?.platform === 'emdash'
        ? emdash
          ? {
              state: 'unlocked',
              reason: `content recommendation: keep the design of template ${emdashTemplateIdOf(site.quickstart_tag)}`
            }
          : { state: 'unknown', reason: null }
        : profile?.designBaseline
          ? {
              state: 'unlocked',
              reason: `content recommendation: keep the design baseline in contract profile ${contract.id}`
            }
          : { state: 'unknown', reason: null }
    const blockKinds = describeBlockKinds({
      platform: site?.platform ?? null,
      contentMap: profile?.contentMap ?? null,
      siteModel: emdash?.siteModel ?? null,
      apply
    })
    // What the release's own files say, for whatever the Claude Cowork plugin could not answer.
    const releaseLocales = emdash
      ? (emdash.siteModel?.locales?.all ?? [])
      : profileLocales(profile?.contentMap ?? null)
    const fallback = {
      url: site?.label ? bornSiteAddress(site.label, config) : null,
      defaultLocale: emdash ? (emdash.siteModel?.locales?.default ?? null) : null,
      locales: releaseLocales,
      types: emdash ? emdashContentTypes(emdash.contentApiMap) : []
    }
    return buildDescribe({
      siteKey,
      site,
      probe,
      counts,
      contract,
      contractHash: profile?.contentMapHash ?? null,
      presentation,
      permissions: { role, toolsets: perms ?? {}, apply, entryWrite: emdashWrite },
      blockKinds,
      fallback,
      where: describeWhere(site, { profile, toolsetOfDoor })
    })
  }

  /** Value-index snapshots for `content.locate`, in this process's memory (`content-locate.js`). */
  const locateSnapshots = locateStoreFactory({
    now,
    // A head is kept as long as the describe probe (`contentProbes`), which answers it first.
    headMaxAgeMs: CONTENT_PROBE_TTL_MS,
    onBuilt: ({ siteKey, locale, records, kept, ms, resumed = 0 }) =>
      console.info(
        `[locate] snapshot built for ${siteKey} (${locale ?? 'all languages'}): ${records} records in ${ms} ms${resumed > 0 ? ` (${resumed} taken over from the last build)` : ''}, ${kept ? 'kept' : `not kept (incomplete)${records > 0 ? '; its complete records wait for the next build' : ''}`}`
      )
  })
  /** Its second source: each site's language strings and template files (`content-strings.js`). */
  const locateStrings = createStringStore({ now })
  /**
   * ONE FILE READ AT A TIME PER SITE AND LANGUAGE: the host's read beside the snapshot (whose own
   * builds and revalidations are single-flight in `content-locate.js`, as is the site head,
   * `headFor`). A warm (Edit turned on) and the first pick that follows it overlap by design.
   * @type {Map<string, Promise<any>>}
   */
  const locateInFlight = new Map()
  /** @template T @param {string} key @param {() => Promise<T>} run @returns {Promise<T>} */
  const oneAtATime = (key, run) => {
    const pending = locateInFlight.get(key)
    if (pending) return pending
    const task = run().finally(() => locateInFlight.delete(key))
    locateInFlight.set(key, task)
    return task
  }
  /**
   * EVERY COMPONENT READ A LOCATE MAKES ON A JOOMLA SITE, IN ONE LINE PER SITE. Joomla's reader
   * refuses a read that overlaps another on the same site (`contentProbe`), and a site's locates read
   * from several single-flights at once — the head, a warm's build, a pick's revalidation, the
   * snapshot of another language. Each read that overlapped came back refused: a refused head read
   * the page's language as none, and a refused detail left the snapshot incomplete, never kept.
   */
  const joomlaLocateReads = createSerialGate()

  /**
   * `content.locate` on a site with no Content API (yet): what the picker and the agent read instead
   * of an HTTP error. `status: "unavailable"` sits beside `resolved`/`unconfirmed`/`warmed`; `code`
   * keeps the Content API's name for it, `next` says the road that still works.
   * @param {string} message
   * @param {string} [next]
   * @returns {{ status: number, body: unknown }}
   */
  const locateUnavailable = (
    message,
    next = 'Do not call content.locate again on this site; read words with page.text and change them with content.replace.'
  ) => ({ status: 200, body: { status: 'unavailable', code: 'CONTENT_ADAPTER_UNSUPPORTED', message, next } })

  /**
   * A reader's refusal as the door hands it back. "No Content API here" — the reader says
   * `CONTENT_ADAPTER_UNSUPPORTED` (a WordPress site whose content identity was never set up), or
   * answers nothing the Content API names — is an expected state of a site, not a failed call: 200
   * `unavailable` (`locateUnavailable`), so the picker does not log an error on every pick. Every
   * other refusal keeps the reader's own status, and is logged: the reader refusing THIS relay's
   * read (`CONTENT_FORBIDDEN` — the site's digest file wrong, `capiel1647` 30/09) is a broken site
   * nobody else would hear of.
   * @param {string} siteKey
   * @param {any} refusal
   * @returns {{ status: number, body: unknown }}
   */
  const refusedLocate = (siteKey, refusal) => {
    const code = refusal?.error?.code
    const status = CONTENT_ERROR_STATUS[code]
    if (!status || code === 'CONTENT_ADAPTER_UNSUPPORTED')
      return locateUnavailable(
        typeof refusal?.error?.message === 'string' && status
          ? refusal.error.message
          : 'Cowork does not support Content API v1'
      )
    console.warn(`[locate] the reader of ${siteKey} refused the relay's read: ${code} (${status})`)
    return { status, body: refusal }
  }

  /**
   * One `content.locate` answer. The index is read with THIS relay's authority (`ask` sends the
   * server principal, published scope), the same projection for every seat, so one snapshot serves
   * them all; what depends on the seat — whether it may write a level — is decided here, per call,
   * from its toolsets and the Apply door's own `KIND_TOOLSET`.
   * @param {{ siteKey: string, site: any, perms: any, params: Record<string, unknown>,
   *   principal: string, ask: (query: Record<string, unknown>) => Promise<any> }} input
   * @returns {Promise<{ status: number, body: unknown }>}
   */
  async function answerLocate({ siteKey, site, perms, params, principal, ask }) {
    const query = locateQuery(params)
    // The language the page is in: asked, or read off the link (`/es/investors`) against the site's
    // own list, so the walk reads one language of a 40-language site rather than all of them.
    const started = now()
    const { contract, profile, derived } = contentAuthority(site, null)
    const slotRoad = (key) => (contract === null && !derived ? 'code' : slotToolset(profile, key))
    // A level is writable when the seat's own toolsets write its kind (ADR 0028: fixed per role, so
    // an editor writes a template part or a module, a viewer writes nothing it picked).
    const kindToolset = (kind) => KIND_TOOLSET[kind] ?? 'site'
    const mayWrite = (road) => roadToolsets(road, kindToolset, slotRoad).some((set) => Boolean(perms?.[set]))
    let locale = typeof query.locale === 'string' ? /** @type {string} */ (localeCase(query.locale)) : null
    const held = contentProbes.get(siteKey)
    const heldHead = held && now() - held.at < CONTENT_PROBE_TTL_MS ? held.probe : null
    /**
     * The site's languages, which a record level's twins are named in (`alternatesOf`): the head this
     * call read, or — when the call named its language — a head a describe already holds; never a
     * read of its own for that.
     * @param {any} head
     */
    const localesOf = (head) =>
      Array.isArray(head?.site?.locales)
        ? head.site.locales.filter((/** @type {unknown} */ one) => typeof one === 'string')
        : []
    let siteLocales = localesOf(heldHead)
    if (locale === null) {
      const got = heldHead ? { head: heldHead } : await locateSnapshots.headFor({ siteKey, ask })
      if ('refusal' in got) return refusedLocate(siteKey, got.refusal)
      // No head after a second try: the page's language is unknown, and reading that as "every
      // language" builds a snapshot a many-language site never finishes (`headFor`). Answer now,
      // `incomplete`, from nothing; the next call asks the head again.
      if ('failed' in got) {
        if (query.warm === true)
          return {
            status: 200,
            body: { status: 'warmed', cached: false, incomplete: true, ms: Math.max(0, now() - started) }
          }
        return {
          status: 200,
          body: locateElement(indexContents([]), query, {
            mayWrite,
            platform: site?.platform ?? null,
            incomplete: true
          })
        }
      }
      const head = got.head
      siteLocales = localesOf(head)
      locale = localeOfLink(
        query.url,
        Array.isArray(head?.site?.locales) ? head.site.locales : [],
        typeof head?.site?.defaultLocale === 'string' ? head.site.defaultLocale : null,
        typeof head?.site?.url === 'string' ? head.site.url : null
      )
    }
    // The files are read by the host that holds the site (`/_host/site-files`, tracy-host), in
    // parallel with the records: a webroot's files for Joomla and WordPress, the template source in
    // the site's own container (`/app/src`) for EmDash.
    const readsFiles =
      (site?.platform === 'joomla' || site?.platform === 'wordpress' || site?.platform === 'emdash') &&
      site?.label &&
      site?.host
    const [{ index, incomplete, cached, refusal }, strings] = await Promise.all([
      locateSnapshots.snapshotFor({
        siteKey,
        locale,
        principalClass: principal,
        pageUrl: query.url,
        ask,
        // Batched `{ids}` reads where the plugin answers them (an older one refuses `ids`, then one
        // per call); one call at a time on Joomla. Per platform in `locateReads`.
        ...locateReads(site?.platform)
      }),
      readsFiles
        ? oneAtATime(JSON.stringify(['strings', siteKey, locale]), () =>
            locateStrings.stringsFor({
              siteKey,
              locale,
              read: ({ locale: asked, known }) =>
                host.hostCall(
                  config,
                  site.host,
                  '/site-files',
                  { label: site.label, locale: asked, known },
                  { fetchImpl }
                )
            })
          )
        : { index: null, incomplete: false }
    ])
    if (refusal) return refusedLocate(siteKey, refusal)
    // A warm (the picker turned on, nothing picked yet) only builds or revalidates what the first
    // pick will read; it resolves nothing. `cached`: the kept snapshot was current, nothing re-read.
    if (query.warm === true)
      return { status: 200, body: { status: 'warmed', cached, ms: Math.max(0, now() - started) } }
    return {
      status: 200,
      body: locateElement(index, query, {
        mayWrite,
        platform: site?.platform ?? null,
        incomplete: incomplete || strings.incomplete,
        strings: strings.index,
        siteLocales
      })
    }
  }

  // ── POST /api/sites/:key/apply/:action — the same door, one address per action ─────────────────
  // The public API reference gives each action its own page, which needs its own address
  // (28/09/2026). The body is the action's `params`; this route hands `{action, params}` to the same
  // `applyOverHttp` as `/apply`, so the seat check, toolset gate, lease and call to the site stay one
  // code path — and no request is re-dispatched (that road skipped `app.js`'s `canonicalSiteKey`).
  app.post('/api/sites/:key/apply/:action', async (c) => {
    const params = await c.req.json().catch(() => ({}))
    const action = c.req.param('action')
    if (
      !params ||
      typeof params !== 'object' ||
      Array.isArray(params) ||
      ('action' in params && params.action !== action)
    )
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    const { action: _named, ...rest } = params
    return applyOverHttp(c, async () => ({ action, params: rest }))
  })

  /**
   * THE APPLY DOOR, AS A FUNCTION. One implementation of "a principal asks this site to do this":
   * the toolset gate on the seat's effective policy (∩ the key's scopes for a key principal), the
   * key's hourly caps, the write lease, the call to the site's component or reader, the audit row —
   * and one answer shape, `{status, body, headers?}`, exactly what the HTTP door writes back.
   *
   * WHY A FUNCTION AND NOT ONLY A ROUTE (`tasks/todo-api-public.md` Q7). The `/v1` REST layer (S3)
   * maps each resource route onto one of these actions and must not re-dispatch an HTTP request
   * through `app.request` — that road skipped `canonicalSiteKey` (`app.js`) and let a caller keep its
   * own `x-tracy-session`. Here the caller is already RESOLVED (`principal`, from `requireGrant`),
   * the site key is already canonical, and the lease identity is the server's: `key:<id>` for a key,
   * the dsh session header for a chat, none for the build and the seeder.
   *
   * @param {{siteKey: string, action: string, params?: unknown, target?: unknown, comment?: unknown,
   *   principal: {kind: 'session' | 'actor' | 'key', email: string, account: {id: string}, grant: {role: string},
   *     key?: {keyId: string, scopes: string[]}},
   *   headers?: Record<string, string | undefined>}} call - `headers`: only `x-tracy-session`,
   *   `x-tracy-preset` and `x-tracy-turn` are read, and only for a session/actor principal; a key
   *   caller's are ignored. `x-tracy-write-title` is read for an actor principal alone.
   * @returns {Promise<{status: number, body: Record<string, unknown>, headers?: Record<string, string>}>}
   */
  /**
   * `applyDoorOnce` with the design record kept in step (ADR 0023, "Addendum 29/09"). Every caller —
   * a cookie, the lane's actor, `/v1` — goes through here, so a look switched by `theme.style` is
   * recorded whoever switched it; before, only site-tools refreshed the site folder's copy, and a
   * `theme.style` from anywhere else left the record wearing the old look. Best effort: a record
   * that cannot be written never changes the answer of an apply that already went through.
   * @param {Parameters<typeof applyDoorOnce>[0]} call
   */
  /**
   * The toolsets a principal holds on a site, as the Apply door judges them: the seat role's fixed
   * set (`permissionsFor`, ADR 0028 — no site or workspace policy). Every door that writes what an Apply action writes asks this, not a copy of it — the
   * design record (`design.js`) asks it for `theme.style`'s toolset.
   * 🔒 A KEY NEVER HOLDS MORE THAN ITS SEAT, OWNER INCLUDED: the seat's toolsets ∩ the key's
   * scopes, computed on every call — so a role narrowed after the mint narrows the key too, and
   * `describe.permissions`/`contentPrincipal` see the intersected set, not the seat's.
   * @param {{ kind: string, grant: { role: string }, key?: { scopes: string[] } }} auth a `requireGrant` answer
   * @param {string} siteKey
   * @returns {Promise<Record<string, boolean>>}
   */
  async function seatToolsets(auth, _siteKey) {
    const perms = seats.permissionsFor(auth.grant.role)
    if (auth.kind === 'key')
      for (const name of Object.keys(perms))
        perms[name] = perms[name] && Boolean(auth.key?.scopes.includes(name))
    return perms
  }

  /**
   * Whether a principal may change the site at all: it holds at least one toolset (a key: one its
   * scopes keep). A viewer holds none (ADR 0028), so every door that writes and has no finer
   * toolset rule of its own asks this — backups, undo, uploads, pairing.
   * @param {{ kind: string, grant: { role: string }, key?: { scopes: string[] } }} auth
   * @param {string} siteKey
   */
  async function mayWrite(auth, siteKey) {
    return Object.values(await seatToolsets(auth, siteKey)).some(Boolean)
  }

  async function applyDoor(call) {
    const answered = await applyDoorOnce(call)
    if (
      APPLY_RULES.has(call.action) &&
      changesSite(call.action, call.params ?? {}) &&
      call.headers?.['x-tracy-session'] &&
      call.principal.kind !== 'key'
    ) {
      await opsFor(pool).record(call.action === 'apply.revert' ? 'site.undo' : 'site.edit', {
        email: call.principal.email,
        accountId: call.principal.account.id,
        siteKey: call.siteKey,
        data: {
          action: call.action,
          ok:
            answered.status < 400 &&
            answered.body?.ok !== false &&
            !answered.body?.code &&
            !answered.body?.error,
          refusal: refusalCodeOf(answered.body),
          // Why an imported site's copy was not verified, from `pairFleetCopy`'s closed set.
          ...(answered.body?.code === 'COMPONENT_NOT_ON_FLEET_COPY' &&
          FLEET_COPY_WHYS.has(answered.body?.copyReason)
            ? { copy_reason: answered.body.copyReason }
            : {}),
          from_comment: call.comment == null ? null : Boolean(commentNumbers(call.comment)?.length),
          moment: call.params?.apply_id ?? null
        }
      })
    }
    if (call.action === 'theme.style' && answered.status === 200) {
      try {
        const site = await siteByKey(pool, call.siteKey)
        const before = site ? (await readSiteDesign(pool, call.siteKey)).design : null
        const next = site
          ? styleRecord({
              action: call.action,
              params: call.params && typeof call.params === 'object' ? /** @type {any} */ (call.params) : {},
              answer: answered.body,
              platform: String(site.platform ?? ''),
              before
            })
          : null
        if (next) await writeSiteDesign(pool, call.siteKey, next.record, next.wroteBy)
      } catch (error) {
        // Best effort (see above), but never silent: a record left behind is a wrong ruler.
        console.error(
          '[site-design] record after theme.style failed',
          call.siteKey,
          error instanceof Error ? error.message : String(error)
        )
      }
    }
    return answered
  }

  async function applyDoorOnce(call) {
    const {
      siteKey,
      action,
      params: asked,
      target,
      comment,
      principal: auth,
      headers = {},
      setupRun,
      signal = null
    } = call
    const reply = (body, status = 200, extra = null) => ({
      status,
      body,
      ...(extra ? { headers: extra } : {})
    })
    const refused = applyDoorRefusal(action)
    if (refused) return reply(refused.body, refused.status)
    if (ACTOR_ONLY_ACTIONS.has(action) && auth.kind !== 'actor')
      return reply({ code: 'ACTION_AGENT_ONLY', action }, 403)
    const rule = APPLY_RULES.get(action)
    const params = asked && typeof asked === 'object' ? /** @type {Record<string, unknown>} */ (asked) : {}

    // Query fields are consumer input; authority is resolved here, never by the agent. The Claude Cowork plugin
    // refuses a bad query with a bare "Invalid content query", so the parameter is named here and a
    // caller fixes one field instead of guessing (measured 25/09/2026 through the agent chat: limit
    // 200 twice, type "template-part", {id, type} — four refusals, none saying which field).
    if (action === 'content.read') {
      const problem = contentQueryProblem(params)
      if (problem) return reply({ error: { code: 'CONTENT_BAD_QUERY', message: problem } }, 400)
      if (typeof params.locale === 'string') params.locale = localeCase(params.locale)
    }
    if (action === 'content.locate') {
      const problem = locateQueryProblem(params)
      if (problem) return reply({ error: { code: 'LOCATE_BAD_QUERY', message: problem } }, 400)
    }
    // `ifVersion` and `changedSince` are the relay's: the Claude Cowork plugin reads what it always reads, and
    // the version scope is the query as the caller asked it (`content-versions.js`).
    const readQuery = action === 'content.read' ? queryScope(params) : null
    const ifVersion =
      action === 'content.read' && typeof params.ifVersion === 'string' ? params.ifVersion : null
    const changedSince =
      action === 'content.read' && typeof params.changedSince === 'string' ? params.changedSince : null
    if (action === 'content.read') {
      delete params.ifVersion
      delete params.changedSince
    }
    // `fields` trims the answer here; the Claude Cowork plugin reads what it always reads.
    const projection =
      action === 'content.read' && params.fields !== undefined
        ? /** @type {{paths: string[]}} */ (projectionOf(params.fields)).paths
        : null
    if (projection) delete params.fields
    // Current role policies grant toolsets, not editorial visibility. Keep the published
    // projection until a separate server-owned editorial grant is agreed and implemented.
    const contentScope = 'published'
    let contentPolicy = null
    // 🔒 `derive` BUILDS A SITE'S CONTRACT, AND ONLY IMPORT PROVISIONING RUNS IT (29/09/2026): it
    // rebinds the slots every seat writes, so no seat asks for it here — not an owner, not a key.
    // Refused by name before the toolset gate, so no role reads as the one that could.
    if (
      action === 'content.contract' &&
      typeof params.operation === 'string' &&
      params.operation.trim() === 'derive'
    )
      return reply({ code: 'CONTRACT_OPERATION_PROVISION_ONLY', operation: 'derive' }, 403)
    const site = await siteByKey(pool, siteKey)
    // A content read is open to any live seat (`'read'`), but what it answers still depends on the
    // seat: the envelope's `writable` and the locate map's levels come from its own toolsets, so a
    // viewer reads every field and is told it may write none.
    if (action === 'content.read' || action === 'content.locate')
      contentPolicy = await seatToolsets(auth, siteKey)
    const profile = rule === 'read' ? null : contentAuthority(site, null).profile
    const needed = typeof rule === 'function' ? rule(params, { profile }) : rule
    if (needed !== 'read') {
      const perms = await seatToolsets(auth, siteKey)
      if (!perms[needed]) {
        // A contract apply a content seat may make but for some of its keys: name those keys, so the
        // agent can apply the words, pictures and links and say what is left for a code seat.
        const outside =
          action === 'content.contract' && perms.content
            ? contractToolset(params, profile, contractOperationWrites(params.operation)).outside
            : []
        if (outside.length > 0)
          return reply(
            { code: 'CONTRACT_SLOT_NOT_CONTENT', toolset: needed, role: auth.grant.role, slots: outside },
            403
          )
        return reply({ code: 'TOOLSET_NOT_GRANTED', toolset: needed, role: auth.grant.role }, 403)
      }
    }

    if (action === 'demo.research') {
      if (!agentDemo || auth.kind === 'key' || !headers['x-tracy-session'])
        return reply({ code: 'AGENT_DEMO_NOT_GRANTED' }, 403)
      try {
        const body = await agentDemo.call(
          {
            siteKey,
            accountId: auth.account.id,
            sessionId: headers['x-tracy-session'],
            turnId: headers['x-tracy-turn'],
            actorKind: auth.kind,
            actorEmail: auth.email
          },
          params,
          {
            signal,
            upload: async ({ action, params }) => {
              const grant = await seats.grantFor(pool, auth.account.id, siteKey)
              if (!grant || !seats.permissionsFor(grant.role).content)
                return reply({ code: 'AGENT_DEMO_NOT_GRANTED' }, 403)
              return applyDoorOnce({ ...call, action, params, principal: { ...auth, grant } })
            }
          }
        )
        return reply(body)
      } catch (error) {
        return reply(
          {
            ok: false,
            code: error.code ?? 'AGENT_DEMO_UNAVAILABLE',
            ...(error.detail ? { detail: error.detail } : {})
          },
          error.code === 'AGENT_DEMO_NOT_GRANTED' ? 403 : 409
        )
      }
    }
    // Ordinary content writes in the assigned demo chat require its durable plan first.
    if (agentDemo && headers['x-tracy-session'] && changesSite(action, params)) {
      try {
        const held = await agentDemo.context({
          siteKey,
          accountId: auth.account.id,
          sessionId: headers['x-tracy-session'],
          turnId: headers['x-tracy-turn'],
          actorKind: auth.kind,
          actorEmail: auth.email,
          forWrite: true
        })
        if (!held.build.content?.agentDemo?.plan) return reply({ code: 'AGENT_DEMO_PLAN_REQUIRED' }, 409)
      } catch (error) {
        if (error.code !== 'AGENT_DEMO_NOT_GRANTED')
          return reply({ code: error.code ?? 'AGENT_DEMO_UNAVAILABLE' }, 409)
      }
    }

    // `changesSite`, not `rule !== 'read'`: the toolset a caller must hold and whether the call moves
    // the site are two questions, and answering the second with the first is what locked `demowp`
    // against its own owner — see `APPLY_READS_ONLY`.
    const writeClass = changesSite(action, params)
    // A key's two hourly caps (Q8): `key:<id>:write` shares `WRITE_LIMIT_PER_HOUR` with every seat
    // door, `key:<id>:read` is ten times that. Checked BEFORE the lease and the site, so a refused
    // call takes nothing; fail CLOSED when the bucket cannot be read (`overLimitOrClosed`'s rule).
    if (auth.kind === 'key') {
      const bucket = `key:${auth.key.keyId}:${writeClass ? 'write' : 'read'}`
      const limit = writeClass ? WRITE_LIMIT_PER_HOUR : KEY_READ_LIMIT_PER_HOUR
      const rate = await overLimitDetail(pool, bucket, limit, now()).catch(() => ({
        over: true,
        retryAfterS: 60
      }))
      if (rate.over) return reply({ code: 'RATE_LIMITED' }, 429, { 'Retry-After': String(rate.retryAfterS) })
    }

    // 🔒 `apply.list` WITH NO `apply_id` IS THE SITE'S RECENT CHANGES, FROM TRACY'S OWN RECORD (ladder DL15
    // on dsl2jo, 14/10/2026, `recent-changes.js`). The plugin lists one apply_id's steps and refused this
    // call `apply_id required`, so a conversation that had written nothing could find no earlier change to
    // undo: the agent read the plugin's log through the shell and undid two articles nobody named. Answered
    // here, from the audit rows every relayed write left, with no lease and no call to the site. An EmDash
    // site keeps no receipts and goes on to its own refusal below.
    if (
      action === 'apply.list' &&
      !(typeof params.apply_id === 'string' && params.apply_id.trim() !== '') &&
      site?.platform !== 'emdash'
    ) {
      const asking = auth.kind === 'key' ? `key:${auth.key.keyId}` : headers['x-tracy-session'] || null
      const sessionId = AUDIT_SESSION_SHAPE.test(asking ?? '') ? asking : null
      const rows = await recentChangeRows(pool, {
        siteKey,
        days: RECENT_CHANGES_DAYS,
        // A viewer sees its own changes only, as on `GET /applies`.
        actor: seats.actingEditor(auth.grant) ? null : auth.email
      })
      const listed = recentChanges({ ...rows, sessionId })
      await audit(pool, {
        actor: auth.email,
        action,
        siteKey,
        detail: {
          ok: true,
          apply_id: null,
          recent: true,
          ...(sessionId ? { sessionId } : {}),
          writeClass: false,
          outcome: 'ok'
        }
      })
      return reply({ ok: true, ...listed, next: recentChangesNext(listed) })
    }

    /**
     * WHO ELSE IS WRITING THIS SITE RIGHT NOW.
     *
     * Two chats on one site both reach here and both write; the second used to overwrite the first
     * with nothing said. Presence is noted on EVERY apply — reads included — because arrival has to
     * be recorded before the first write, or the queue orders by write time and a session that spent
     * two minutes reading loses to one that arrived after it.
     *
     * 🔒 THE BUILD AND THE SEEDER WRITE THROUGH THIS SAME DOOR, and neither can retry a refusal:
     * `tracy-site-build-core`'s `applyVia()` and the seeder's `doorVia()` hand the door's JSON
     * straight back to a stage, and a build refused at stage four leaves a half-built site. They
     * arrive without a chat session, so the absence of `x-tracy-session` is what exempts them —
     * named by what they are, not by a key that happens to look different.
     *
     * 🔒 AND AN UNKEYED CHAT IS COUNTED, NOT GUESSED AT. `x-tracy-session` is minted by a dsh plugin
     * that ships in a different image on a different pipeline from this door (`docs/references/
     * build-only-on-change.md`: a change under `apps/` does not rebuild the dsh image), so for a while
     * some sessions will arrive without it. Those writes go through exactly as they do today — the
     * behaviour is not made worse by a header that has not landed yet — and the audit row says so,
     * so the gap is a number somebody can look up rather than a silence.
     *
     * 🔒 THE LEASE IS NOT HANDED BACK AFTER EACH CALL, AND THAT IS THE POINT. One customer request is
     * two or two hundred writes sharing an `apply_id`; releasing after each one lets the other chat
     * step into the middle of it and produces exactly the half-applied page this exists to prevent.
     * There is no signal at this door for "the request is finished" — a turn can end with more to do,
     * and a request can span turns — so the release is SILENCE: each write renews, and 90 seconds
     * after the last one the site is free (`WRITE_LEASE_STALE_MS`). The cost is real and is stated
     * rather than hidden: the second chat may wait up to a minute and a half after the first one
     * actually stopped. A release this door cannot time correctly is worse than a wait it can.
     */
    // A key caller's lease identity is the SERVER's (`key:<id>`): two keys writing one site
    // interleave into `SITE_BUSY` like two chats do, and a header the caller made up buys nothing.
    const chatSession = auth.kind === 'key' ? `key:${auth.key.keyId}` : headers['x-tracy-session'] || null
    // The toolset this conversation is holding (`tracy-site-tools`' `sessionPreset`). Recorded so a
    // preset that does not match `site.platform` is one SQL query rather than an investigation —
    // see `024-presence-preset.sql`. A preset name is a plain id; anything else is dropped rather
    // than stored, because this column exists to be compared and a stray value would break that.
    const chatPreset = /^[a-z0-9][a-z0-9-]{0,63}$/.test(headers['x-tracy-preset'] ?? '')
      ? (headers['x-tracy-preset'] ?? null)
      : null
    // WHICH CHAT TURN this call is part of (`x-tracy-turn`, `tracy-site-tools`; plan site changes §5):
    // the ROOT agent's `<session>:<turn>`, also when a subagent makes the call. It joins the write to
    // the person's turn in the Site changes tab, and only that does — never time. A value of the
    // wrong shape is dropped, not refused: a write is never blocked over its label, and an older dsh
    // sends none ("unknown turn"). The lease records it too, so a late turn-end release of an earlier
    // turn cannot free the hold this one renewed (`takeWriteLease`).
    const turnId =
      auth.kind === 'key' ? null : parseTurnId(headers['x-tracy-turn']) ? headers['x-tracy-turn'] : null
    /** Whether THIS call is what took the lease, as opposed to renewing a hold it already had. */
    let freshLease = false
    let heldLease = false
    if (chatSession && writeClass) {
      await notePresence(pool, { siteKey, sessionId: chatSession, actor: auth.email, preset: chatPreset })
      const lease = await takeWriteLease(pool, { siteKey, sessionId: chatSession, actor: auth.email, turnId })
      if (!lease.ok) return reply(leaseBusyBody(siteKey, auth.email, lease), 409)
      heldLease = true
      freshLease = lease.fresh === true
      // The same account's newer conversation replaced its own earlier one (`takeWriteLease`). Kept
      // under `fromSession`/`toSession`, never `sessionId`: that key is what `appliesOfSession`
      // lists as a chat's writes, and a takeover wrote nothing.
      if (lease.takenOverFrom) {
        const shaped = (s) => (AUDIT_SESSION_SHAPE.test(s ?? '') ? s : null)
        await audit(pool, {
          actor: auth.email,
          action: 'site.lease.takeover',
          siteKey,
          detail: { fromSession: shaped(lease.takenOverFrom), toSession: shaped(chatSession) }
        })
      }
    } else if (chatSession) {
      await notePresence(pool, { siteKey, sessionId: chatSession, actor: auth.email, preset: chatPreset })
    }

    const describing = action === 'content.read' && params.describe !== undefined
    // `{view:"pages", changedSince}` is the changes question (a model sends it that way): answer it so.
    const paging = action === 'content.read' && params.view !== undefined && changedSince === null
    // An EmDash site has no Tracy component: `content.read` goes to its own reader with its
    // read-only relay PAT (`emdashContentDoor`), and every other action is refused as before.
    const contentDoor =
      (action === 'content.read' || action === 'content.locate') && site?.platform === 'emdash'
        ? await emdashContentDoor({ pool, config, host, fetchImpl, site, createdBy: auth.email })
        : undefined
    // A site with no reader is still described (its Claude Cowork plugin capability says `unsupported`).
    if (contentDoor === null && describing) {
      return reply(
        await describeContent({ siteKey, site, perms: contentPolicy, role: auth.grant.role, ask: null })
      )
    }
    // An EmDash site with no reader: for a pick, the same expected state as any site with no
    // Content API (`locateUnavailable`), naming the road that works there.
    if (contentDoor === null && action === 'content.locate') {
      const { status, body } = locateUnavailable(
        'This EmDash site has no Content API reader.',
        'Do not call content.locate again on this site; read its entries with tracy_emdash content_get {collection, id:<slug>} and change them with tracy_emdash content_update.'
      )
      return reply(body, status)
    }
    // Only an EmDash site gets here (`contentDoor` is undefined on the others): say the road that
    // works there, which the agent has on the same turn, rather than only what is missing.
    // `media.upload` on EmDash: the site's host runs the site's own `media_upload` (`emdash-media.js`); no component.
    const emdashMedia = action === 'media.upload' && site?.platform === 'emdash'
    const emdashMediaAsked = emdashMedia ? emdashMediaRequest(params) : null
    if (emdashMediaAsked && 'error' in emdashMediaAsked) {
      if (heldLease && freshLease) await releaseWriteLease(pool, { siteKey, sessionId: chatSession, turnId })
      return reply({ code: 'INVALID_MEDIA', field: emdashMediaAsked.error }, 400)
    }
    if (contentDoor === null) {
      return reply(
        {
          error: {
            code: 'CONTENT_ADAPTER_UNSUPPORTED',
            message:
              'This EmDash site has no Content API reader: read its entries with tracy_emdash content_get {collection, id:<slug>} and change them with tracy_emdash content_update.'
          }
        },
        501
      )
    }
    let cred = emdashMedia
      ? null
      : contentDoor
        ? { config: contentDoor }
        : await currentComponent(pool, siteKey)
    if (!emdashMedia && (!cred?.config?.endpoint || !cred?.config?.token)) {
      // 🔒 PAIR HERE RATHER THAN REFUSE A SITE THAT HAS A DOOR. A site can carry a component and
      // no row: every Joomla site built from a JoomlArt card before 19/09 (the card's provision
      // installed none — `platform/joomla.sh`), and any site provisioned while `/agent-token` was
      // unreachable. `pairComponent` has always been the repair, but the only door that called it
      // was `POST /api/sites/:key/agent`, which NOTHING in the product presses (grepped 19/09
      // across `apps/*/src` and `packages/*/src`) — so the cure sat one function away while the
      // customer read "not connected to Tracy" on every retry.
      //
      // It runs at most once per call and only for a site `pairComponent` will act on at all
      // (fleet-born, on this host); anything else comes back `skipped` and is refused exactly as
      // before. A site that genuinely has no door is still refused — with the host's own reason,
      // so the next step is readable instead of being a bare code.
      const repair = site ? await pairComponent(site, auth.email) : null
      if (repair?.custody === 'provisioning') {
        if (heldLease) await releaseWriteLease(pool, { siteKey, sessionId: chatSession, turnId })
        return reply({ code: 'SITE_PROVISIONING', custodyDetail: repair.custodyDetail }, 409)
      }
      cred = repair?.custody === 'registered' ? await currentComponent(pool, siteKey) : null
      if (!cred?.config?.endpoint || !cred?.config?.token) {
        if (heldLease) await releaseWriteLease(pool, { siteKey, sessionId: chatSession, turnId })
        const said = repair && repair.custody !== 'skipped' ? repair.custodyDetail : null
        return reply({ code: 'COMPONENT_NOT_REGISTERED', ...(said ? { custodyDetail: said } : {}) }, 409)
      }
    }
    // 🔒 AN IMPORTED SITE WRITES TO ITS FLEET COPY, NEVER TO THE CUSTOMER'S LIVE SITE. FAIL CLOSED:
    // a copy that cannot be verified is a refusal, not a fallback to the registered (live) endpoint.
    // `copyReason` says which (`FleetCopyWhy`), and `transient` whether waiting can change it: a cold
    // copy (30/09/2026, tracy.ai on a local stand) is retried in a moment, a wrong token is not.
    let componentBudgetMs = COMPONENT_TIMEOUT_MS
    if (!emdashMedia && site?.origin === 'migrated' && !isOnCopy(cred.config.endpoint, site, config)) {
      const pairingFrom = Date.now()
      const paired = await pairFleetCopy(site, auth.email)
      if (paired.cred === null) {
        if (heldLease) await releaseWriteLease(pool, { siteKey, sessionId: chatSession, turnId })
        const since = copyFailingSince.get(siteKey) ?? Date.now()
        copyFailingSince.set(siteKey, since)
        return reply(
          {
            code: 'COMPONENT_NOT_ON_FLEET_COPY',
            copyReason: paired.why,
            transient: FLEET_COPY_TRANSIENT.has(paired.why) && Date.now() - since < FLEET_COPY_WARM_MS
          },
          409
        )
      }
      copyFailingSince.delete(siteKey)
      cred = paired.cred
      // The whole call keeps the budget it always had (`FLEET_COPY_BUDGETS_MS`).
      componentBudgetMs = Math.max(1_000, COMPONENT_TIMEOUT_MS - (Date.now() - pairingFrom))
    }

    // `target` names which COPY of the site to write (the dsh plugin's `tracy_site` tool no longer
    // advertises it, but `planCall` still forwards one; see `tracy-site-tools/src/host/site.mjs`: "without
    // a target, every call lands on production. Measured on fijitrips 07/09, the expensive way").
    // Production resolves it against the site's own clone/proposal addresses
    // (`resolveApplyEndpoint`, index.js) and refuses `APPLY_TARGET_NOT_ALLOWED` for anything it
    // cannot place. This app has no clone concept yet (Plan 3/4's bar/proxy territory), so there is
    // no address a `target` could ever resolve to — FAIL CLOSED and refuse every non-empty one,
    // rather than silently writing to the live endpoint anyway. Silently ignoring `target` was
    // this door's first shape and is exactly the incident that plugin comment documents: an agent
    // that explicitly asked to write to a preview would have the write land on the customer's live
    // site instead, with no error at all. Revisit this refusal (replace it with real resolution)
    // once a task adds clone addresses — until then, an empty string is treated as absent (Fix
    // round 1, task-6b-review.md).
    if (typeof target === 'string' && target !== '') {
      // Nothing was sent, so nothing holds the site: the lease this call took goes back, as on every
      // other refusal above. Kept, it locked every other conversation out for the stale window.
      if (heldLease) await releaseWriteLease(pool, { siteKey, sessionId: chatSession, turnId })
      return reply({ code: 'APPLY_TARGET_NOT_ALLOWED' }, 400)
    }

    // `sessionId` names the chat that asked, so a turn cut off by a deploy can be shown what it had
    // already changed and undo it (#295, `GET /api/sites/:key/applies`). Only the dsh session-id
    // shape is kept: this header carries a Tracy session TOKEN on another hop (`workspace/proxy.js`),
    // and a token has dots, so it can never pass this pattern into the audit trail.
    const auditSession = AUDIT_SESSION_SHAPE.test(chatSession ?? '') ? chatSession : null
    // A successful call that changes the site (`changesSite`) also stamps `site.last_write_at` in the
    // same statement (`auditSiteWrite`): what everybody's Refresh button reads (`siteChangedAt`).
    // A write that went through and cites comment numbers answers those requests: "Done by Tracy" in
    // the Comments tab (`comments.js` `markRequestsAnswered`, only the caller's own recent requests).
    // A key never sends comment turns, and a failed or reading call answers nothing.
    const cited = auth.kind === 'key' ? null : commentNumbers(comment)
    // THE RECORD'S TITLE (`x-tracy-write-title`, `writeTitleOf`): the name the card under the reply and
    // Site changes call the write by, which `{kind, id}` alone left as "article 4" (council D1,
    // 20/10/2026). Read only from the dsh host — the signed actor (`requireGrant` kind `actor`), which
    // read it from the same record — never from a cookie or a key, whose caller types what it likes.
    const writeTitle =
      auth.kind === 'actor' && WRITE_TITLE_ACTIONS.has(action)
        ? writeTitleOf(headers['x-tracy-write-title'])
        : null
    // THE HOME PAGE (`x-tracy-write-front: 1`, #257): the dsh host found the record is the site's static
    // front page, whose title is often a template demo's that no visitor sees. A display mark only, from
    // the same signed actor; `{kind, id}` still decide what is written and undone.
    const writeFront =
      auth.kind === 'actor' && WRITE_TITLE_ACTIONS.has(action) && headers['x-tracy-write-front'] === '1'
    // 🔒 WHERE THE WRITE CAME FROM, AS THIS DOOR KNOWS IT (sweep #4/#2, council 11/10/2026) — never read off a
    // header: a seat key's call is the key's (`/v1`), and `setupRun` reaches here only through `applyAs`, the
    // server writing a new site's brief for its person (never over HTTP). Everything else names none.
    const writeOrigin =
      auth.kind === 'key'
        ? { kind: 'api', ref: auth.key.keyId }
        : typeof setupRun === 'string' && setupRun !== ''
          ? { kind: 'setup', ref: setupRun }
          : null
    /**
     * The audit line, and — for a call that changes the site (`writeClass`) — its `site_write` row in
     * the same statement. `outcome`: `ok` the source said it wrote; `refused` it said no cleanly;
     * `unknown` there was no readable answer, so the write may well have landed (P0
     * `audit-detail.md` §4) — never read as "nothing changed".
     * @param {boolean} ok
     * @param {'ok' | 'refused' | 'unknown'} [outcome]
     */
    const recordApply = async (
      ok,
      outcome = ok ? 'ok' : 'unknown',
      answer = null,
      { changed = true, landed = false } = {}
    ) => {
      const created = ok ? createdIdOf(action, answer) : null
      // `changed: false`: the site answered that nothing was written (an EmDash upload of bytes it already
      // holds, `deduplicated`). The trail keeps the call; Site changes and `last_write_at` do not move, as
      // for the same answer through `tracy_emdash` (site-tools E5.e4).
      // `landed`: the answer was a failure, but part of the change reached the site first (the plugin says so
      // with `landed: true`, e.g. a menu item moved and then its field update threw). The site DID change, so
      // the stamp other conversations read (`last_write_at`) moves even though the agent is told it failed.
      const wrote = (ok || landed) && writeClass && changed
      await (wrote ? auditSiteWrite : audit)(pool, {
        actor: auth.email,
        action,
        siteKey,
        detail: {
          ok,
          apply_id: typeof params.apply_id === 'string' ? params.apply_id : null,
          ...(auditSession ? { sessionId: auditSession } : {}),
          ...(auth.kind === 'key' ? { keyId: auth.key.keyId } : {}),
          ...(turnId ? { turnId } : {}),
          writeClass: Boolean(writeClass),
          outcome,
          ...(changed ? {} : { deduplicated: true })
        },
        write:
          writeClass && changed
            ? {
                turnId,
                sessionId: auditSession,
                outcome,
                // A revert names the change it takes back (`apply_id`), which is what its own Site changes row says.
                target:
                  action === 'apply.revert' &&
                  typeof params.apply_id === 'string' &&
                  params.apply_id.length <= 128
                    ? { reverts: params.apply_id }
                    : writeTarget(
                        created === null ? params : { ...params, id: created },
                        writeTitle,
                        writeFront
                      ),
                via: 'apply',
                origin: writeOrigin,
                ...(created === null ? {} : { action: 'content.create' })
              }
            : null
      })
      if (!ok || !writeClass || !cited) return
      try {
        await markRequestsAnswered(pool, {
          siteKey,
          accountId: auth.account.id,
          ns: cited,
          windowMs: COMMENT_ANSWER_WINDOW_MS,
          actor: auth.email
        })
      } catch (error) {
        // The write itself went through and is audited; a lost "Done by Tracy" stamp must not turn
        // its answer into a failure the agent would retry.
        console.warn(`[tracy-web] comment answer stamp failed on ${siteKey}: ${error?.message ?? error}`)
      }
    }

    if (emdashMediaAsked) {
      const placed = await emdashMediaUpload({ host, config, fetchImpl, site, request: emdashMediaAsked })
      await recordApply(placed.outcome === 'ok', placed.outcome, placed.body, {
        changed: placed.body?.deduplicated !== true
      })
      // A clean no changed nothing: the call that opened the hold gives it back, as for a component's refusal.
      if (heldLease && freshLease && placed.outcome === 'refused')
        await releaseWriteLease(pool, { siteKey, sessionId: chatSession, turnId })
      return reply(placed.body, /** @type {any} */ (placed.status))
    }

    // One canonical envelope for every CMS (integration decision b0a40e0 §2): the flat query in
    // params, the server's authority beside it; consumer input cannot supply authority fields.
    const contentPrincipal =
      'seat:' +
      createHmac('sha256', config.sessionSecret)
        .update(JSON.stringify([siteKey, auth.email, auth.grant.role, contentPolicy, contentScope]))
        .digest('hex')
    /**
     * @param {Record<string, unknown>} asked
     * @param {{ action: string, contentPrincipal: string }} [as] - `content.locate` reads as the relay.
     */
    const componentRequest = (asked, as = { action, contentPrincipal }) => ({
      method: 'POST',
      // The EmDash reader takes its PAT as a Bearer and the canonical envelope without `token`
      // (integration decision b0a40e0 §2); a redirect there is refused, never followed.
      ...(contentDoor
        ? {
            headers: { 'content-type': 'application/json', authorization: `Bearer ${cred.config.token}` },
            body: JSON.stringify({
              action: as.action,
              params: asked,
              contentPrincipal: as.contentPrincipal,
              contentScope
            }),
            redirect: 'error'
          }
        : {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              token: cred.config.token,
              action: as.action,
              params: asked,
              ...(as.action === 'content.read' ? { contentScope, contentPrincipal: as.contentPrincipal } : {})
            })
          }),
      // 🔒 LONGER THAN A CONTRACT INSPECT, SHORTER THAN THE HOP IN FRONT. An inspect of the
      // 43-language Business quickstart takes 42-60 s; at 60 s here and 60 s in the site tools the
      // `language` stage failed "The operation was aborted due to timeout" on four retries in a
      // row (measured 23/09/2026 on `j-h0n2f4`) while PHP carried on to the end. The Claude Cowork plugin
      // reserves 300 s (`Door::TIME_LIMIT`); the site tools wait 180 s, so this answers first.
      signal: AbortSignal.timeout(componentBudgetMs)
    })
    // `content.locate` never reaches the Claude Cowork plugin as itself: the relay reads the site with
    // `content.read` under ITS OWN principal (one per site, not per seat — the published projection
    // is the same for everyone) and answers from the value index (`content-locate.js`).
    if (action === 'content.locate') {
      const principal =
        'seat:' +
        createHmac('sha256', config.sessionSecret)
          .update(JSON.stringify([siteKey, 'content.locate', contentScope]))
          .digest('hex')
      /** @param {Record<string, unknown>} query */
      const read = (query) =>
        fetchImpl(
          cred.config.endpoint,
          componentRequest(query, { action: 'content.read', contentPrincipal: principal })
        )
          .then((answer) => answer.json())
          .catch(() => null)
      // Joomla: every read in one line per site (`joomlaLocateReads`); the others read in parallel.
      const ask =
        site?.platform === 'joomla'
          ? (/** @type {Record<string, unknown>} */ query) =>
              joomlaLocateReads.run(siteKey, () => read(query))
          : read
      const located = await answerLocate({
        siteKey,
        site,
        perms: contentPolicy,
        params,
        principal,
        ask
      })
      await recordApply(located.status === 200)
      return reply(located.body, /** @type {any} */ (located.status))
    }
    // `describe` never reaches the Claude Cowork plugin (an old one refuses it): the relay asks it for a
    // listing and the counts, and writes the document itself.
    // `view=pages` and `changedSince` never reach the Claude Cowork plugin either: the relay walks its ordinary
    // listing, and keeps the walk's revisions so a later `changedSince` can say what moved.
    if (paging || changedSince) {
      const { view: _view, url: link, ...asked } = params
      /** @param {Record<string, unknown>} query */
      const askCowork = (query) =>
        fetchImpl(cred.config.endpoint, componentRequest(query))
          .then((answer) => answer.json())
          .catch(() => null)
      // A pasted link usually names its language (`/es/investors`): walk that language only, and the
      // whole site only when it holds no such page (`content-pages.js` `localeOfLink`).
      let filter = asked
      let walk = null
      if (paging && typeof link === 'string' && asked.locale === undefined) {
        // The site's own languages, not its template's: a personalised EmDash site serves 40 where
        // its template lists 2 (dev gf1410, 26/09/2026). A describe held within five minutes has
        // them; otherwise one small read does.
        const held = contentProbes.get(siteKey)
        const head =
          held && now() - held.at < CONTENT_PROBE_TTL_MS ? held.probe : await askCowork({ limit: 1 })
        const guessed = localeOfLink(
          link.trim(),
          Array.isArray(head?.site?.locales) ? head.site.locales : [],
          typeof head?.site?.defaultLocale === 'string' ? head.site.defaultLocale : null,
          typeof head?.site?.url === 'string' ? head.site.url : null
        )
        if (guessed) {
          const narrow = await walkListing(askCowork, { ...asked, locale: guessed })
          const found =
            narrow.refusal === null &&
            pagesDocument(narrow.listings, { truncated: narrow.truncated, link: link.trim() }).pages.length >
              0
          if (found) {
            walk = narrow
            filter = { ...asked, locale: guessed }
          }
        }
      }
      walk ??= await walkListing(askCowork, filter)
      await recordApply(walk.refusal === null)
      if (walk.refusal !== null) {
        const refused = CONTENT_ERROR_STATUS[walk.refusal?.error?.code]
        if (refused) return reply(walk.refusal, refused)
        return reply(
          {
            error: {
              code: 'CONTENT_ADAPTER_UNSUPPORTED',
              message: 'Cowork does not support Content API v1'
            }
          },
          501
        )
      }
      const rows = walk.listings.flatMap((listing) =>
        Array.isArray(listing?.contents) ? listing.contents : []
      )
      // One scope for every walk of this site by this seat in this language: a `view=pages` version
      // answers a `changedSince`, and so does the version a `changedSince` answered.
      const scope = { site: siteKey, principal: contentPrincipal, walk: queryScope(filter) }
      const version = versionOf(scope, rows)
      // 🔒 A WALK CUT SHORT IS REMEMBERED TOO. It hands out a version like any other, and before
      // 28/09/2026 a changedSince with it was refused CONTENT_SNAPSHOT_EXPIRED: a version the caller
      // could not use (the stand's 40-language EmDash sites stop at PAGES_MAX_CALLS). Remembering it
      // answers in one call what the other choice (no usable version on a cut answer) would send
      // back to a full re-read that is cut again. It stays honest because the comparison is over
      // the rows that walk saw: one it did not reach is reported as changed (the caller never held
      // it), and nothing is called removed unless the new walk reached the end (`removed` below).
      contentVersions.remember(version, scope, rows)
      if (ifVersion === version) return reply({ schemaVersion: CONTENT_PROTOCOL, notModified: true, version })
      // Within the budget every Content API answer is held to, cut at whole rows, with the
      // narrower read that fits (`content-pages.js` `fitPages`).
      if (paging)
        return reply(
          fitPages(
            {
              ...pagesDocument(walk.listings, {
                truncated: walk.truncated,
                link: typeof link === 'string' ? link.trim() : null,
                // Twins only from a walk that listed every language: one language's walk holds none.
                alternates: filter.locale === undefined
              }),
              version,
              // A walk cut short names the read that reaches the rest.
              ...(walk.truncated ? { next: narrowerPagesCall(filter, walk.listings[0]?.site) } : {}),
              // How to ask later, in the same scope this walk was read in (its locale, if any): a model
              // holding the version still did not think of changedSince (dev chat b4c-j, 27/09/2026).
              later: {
                action: 'content.read',
                params: {
                  changedSince: version,
                  ...(filter.locale !== undefined ? { locale: filter.locale } : {})
                },
                why: 'Later in this conversation: what changed on the site since this list (edited, new, removed pages).'
              }
            },
            { next: narrowerPagesCall(filter, walk.listings[0]?.site) }
          )
        )
      const before = contentVersions.recall(changedSince, scope)
      if (!before)
        return reply(
          {
            error: {
              code: 'CONTENT_SNAPSHOT_EXPIRED',
              message:
                'changedSince names no walk this relay holds for this seat (too old, another seat, or a restart): read {view:"pages"} again and use its version'
            }
          },
          409
        )
      const { changed, removed } = changesBetween(before, rows)
      return reply({
        schemaVersion: 'tracy-content-changes/v1',
        site: walk.listings[0]?.site ?? null,
        since: changedSince,
        version,
        changed: changed.map((row) => ({
          id: row.id,
          type: row.type,
          title: row.title ?? null,
          url: row.url ?? null,
          locale: row.locale ?? null,
          revision: row.revision ?? null,
          updatedAt: row.updatedAt ?? null,
          ...(Array.isArray(row.native) ? { native: row.native } : {})
        })),
        // A walk cut short cannot tell a record that is gone from one it did not reach.
        removed: walk.truncated ? [] : removed,
        truncated: walk.truncated
      })
    }
    if (describing) {
      /** @param {Record<string, unknown>} asked */
      const ask = (asked) =>
        fetchImpl(cred.config.endpoint, componentRequest(asked))
          .then((answer) => (answer.ok ? answer.json() : null))
          .catch(() => null)
      const document = await describeContent({
        siteKey,
        site,
        perms: contentPolicy,
        role: auth.grant.role,
        ask
      })
      await recordApply(true)
      return reply(document)
    }
    let componentResponse
    try {
      componentResponse = await fetchImpl(cred.config.endpoint, componentRequest(params))
    } catch {
      await recordApply(false)
      return reply({ code: 'COMPONENT_UNREACHABLE' }, 502)
    }

    const raw = await componentResponse.text().catch(() => '')
    let result = null
    try {
      result = JSON.parse(raw)
    } catch {
      result = null
    }
    // 🔒 A FILTER NOBODY READ IS NOT AN ANSWER (`content.list {search}`, 30/09/2026). A Claude Cowork plugin
    // reads only the keys it knows and answers `ok:true` for the rest, so a `search` it never read came
    // back as the whole list, looking filtered (r2, 25/09: 4 accepted calls, 120,108 characters that
    // read as a result). A plugin that reads it echoes it: its answer carries a `search` key when the
    // request carried one, and only then. KEY PRESENCE is judged here — never its value, and never the
    // rows, which may hold entities or decomposed text — so the plugin and this door cannot disagree
    // about what "empty" is. Judged before the audit row, so the trail says the caller was refused.
    const searchIgnored =
      action === 'content.list' &&
      params.search !== undefined &&
      result?.ok === true &&
      !Object.hasOwn(result, 'search')
    const answeredOk =
      !searchIgnored &&
      Boolean(result?.ok || (action === 'content.read' && result?.schemaVersion === 'tracy-content/v1'))
    // 🔒 A "NO" THAT HAD ALREADY CHANGED THE SITE IS NOT A CLEAN NO (22/10/2026). The plugin answers `ok:false`
    // for a call that moved a menu item and then failed its field update; that was recorded `refused` ("nothing
    // was written"), the lease was handed back, and Site changes showed no row for a site that had changed. The
    // plugin says so with a machine-readable `landed: true`; only that flag counts, never the words of its
    // message. Without the flag the answer is read as before. A partial landing is `unknown`, which Site changes
    // lists (it hides only `refused`) and which moves `last_write_at`.
    const partlyLanded = result?.ok === false && result?.landed === true
    // A clean no from the source is `refused`; no readable answer at all stays `unknown`.
    await recordApply(
      answeredOk,
      answeredOk ? 'ok' : partlyLanded ? 'unknown' : result?.ok === false ? 'refused' : 'unknown',
      result,
      { landed: partlyLanded }
    )
    /**
     * A REFUSAL IS NOT A CHANGE, SO IT MUST NOT HOLD THE SITE.
     *
     * 🔒 THIS IS THE OTHER HALF OF THE `demowp` MEASUREMENT. `content.language` with no params is a
     * write-class action, so it took the lease — and the component refused it for `apply_id
     * required`, changing nothing. The lease stayed. For the next ninety seconds of silence, and in
     * fact for the rest of that session, the site belonged to a call that had failed validation, and
     * the customer's other chat was told the site was busy. Give it back: the site is exactly as it
     * was before this call.
     *
     * 🔒 ONLY A CLEAN NO, AND ONLY IF THIS CALL TOOK IT. `COMPONENT_UNREACHABLE` and
     * `COMPONENT_BAD_RESPONSE` are not refusals, they are silence — the write may well have landed —
     * so those keep the lease and fail closed, which is why this sits after the `ok` test and not in
     * the `catch`. And `freshLease` is the guard that matters more: a session already holding the
     * lease is mid-request, one customer ask spanning many writes, and a single refusal in the middle
     * of that must not open the door for the other chat to step into the half-applied result. Only
     * the call that opened the hold may close it.
     *
     * 🔒 AND NOT A "NO" THAT ALREADY CHANGED THE SITE (`landed: true`): the site is half-applied, so the
     * lease stays with the conversation that made the change until it reads the site again or goes silent.
     */
    if (heldLease && freshLease && result?.ok === false && !partlyLanded) {
      await releaseWriteLease(pool, { siteKey, sessionId: chatSession, turnId })
    }
    if (result === null)
      return reply({ code: 'COMPONENT_BAD_RESPONSE', status: componentResponse.status }, 502)
    if (action === 'content.read') {
      if (result.schemaVersion === CONTENT_PROTOCOL && componentResponse.ok) {
        const { profile, apply, slotOpen, emdashWrite } = contentAuthority(site, contentPolicy)
        const extended = extendEnvelope(result, {
          apply,
          slotOpen,
          slots: profile?.slots ?? new Map(),
          kind: site?.platform ?? null,
          emdash:
            site?.platform === 'emdash'
              ? {
                  write: emdashWrite,
                  contentApiMap: emdashTemplate(site?.quickstart_tag)?.contentApiMap ?? null
                }
              : null
        })
        const out = projection ? projectEnvelope(extended, projection) : extended
        const version = versionOf(
          { site: siteKey, principal: contentPrincipal, query: readQuery },
          Array.isArray(result.contents) ? result.contents : []
        )
        if (ifVersion === version)
          return reply({ schemaVersion: CONTENT_PROTOCOL, notModified: true, version })
        return reply({ ...out, version })
      }
      const status = CONTENT_ERROR_STATUS[result.error?.code]
      // One more read of the site's own locale list, only for the refusal a locale can cause.
      if (
        result.error?.code === 'CONTENT_BAD_QUERY' &&
        typeof params.locale === 'string' &&
        params.id === undefined &&
        params.cursor === undefined
      ) {
        const probe = await fetchImpl(cred.config.endpoint, componentRequest({ limit: 1 }))
          .then((r) => r.json())
          .catch(() => null)
        const named = localeRefusal(params.locale, probe?.site?.locales)
        if (named) return reply({ error: { code: 'CONTENT_BAD_QUERY', message: named } }, 400)
      }
      if (status) return reply(result, status)
      // An old Claude Cowork plugin cannot advertise this protocol by returning an ordinary native answer.
      return reply(
        {
          error: { code: 'CONTENT_ADAPTER_UNSUPPORTED', message: 'Cowork does not support Content API v1' }
        },
        501
      )
    }
    // The token stored for this site no longer matches what the component holds — a mismatch the
    // caller must not be pointed at re-entering an unrelated credential (a Shopify Admin token,
    // say) to fix. Ported from `handleApply`'s own `COMPONENT_UNAUTHORIZED` mapping.
    if (result.ok === false && /unauthori[sz]ed|invalid[ _-]?token/i.test(String(result.error ?? ''))) {
      return reply({ code: 'COMPONENT_UNAUTHORIZED' }, 409)
    }
    // The rows are dropped, and the status is 501 — the one `CONTENT_ADAPTER_UNSUPPORTED` answers — so
    // nothing retries it (the agent's host treats only 502-504 as a lost answer, `site-call.mjs`). The
    // host learns it for the site and names the road that works (`refusalNext`).
    if (searchIgnored)
      return reply(
        {
          code: 'LIST_SEARCH_UNSUPPORTED',
          error:
            "This site's Claude Cowork plugin does not read search on content.list, so nothing was filtered."
        },
        501
      )
    return reply(result)
  }

  /**
   * `applyDoor` over HTTP: WHO is asking — a cookie, a signed actor, or on the api host a Bearer seat
   * key (`requireGrant`) — for WHICH site, then the door. One code path for `/apply` and its
   * per-action alias, so the seat check, toolset gate, lease and call to the site are never two.
   * @param {import('hono').Context} c
   * @param {() => Promise<unknown>} readBody - the `{action, params, target?}` of this request.
   */
  async function applyOverHttp(c, readBody) {
    c.header('Cache-Control', 'private, no-store')
    // On the api host the KEY names the site, so the path key is read plainly and a conversation
    // label is not consulted (a caller could make one up). Everywhere else ONE CONVERSATION, ONE
    // SITE: `conversationSite` holds the call to the site folder the dsh session stands in.
    const held = isApiHost(c) ? { siteKey: normalizeSiteKey(c.req.param('key')) } : await conversationSite(c)
    if (held.error) return held.error
    // dsh strips the browser cookie and signs the person who started this turn. Verify that
    // assertion here, then run the same current seat and toolset checks as a browser request.
    const auth = await requireGrant(c, held.siteKey, true)
    if (auth.error) return auth.error
    const body = /** @type {any} */ (await readBody())
    if (!body || typeof body !== 'object' || typeof body.action !== 'string' || body.action === '') {
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    }
    const answered = await applyDoor({
      siteKey: held.siteKey,
      action: body.action,
      params: body.params,
      target: body.target,
      // Beside `action`, like `target`: the comment(s) this call answers — "Done by Tracy" on the
      // caller's own requests once the write goes through (`comments.js` `markRequestsAnswered`).
      comment: body.comment,
      principal: auth,
      // The caller's own connection: a demo check whose caller left is not counted (`client-demo.js`).
      signal: c.req.raw.signal,
      // A key caller's `x-tracy-session`/`x-tracy-preset` are the caller's to invent: ignored (Q7).
      // `x-tracy-write-title` only from the dsh host's signed actor: a display label the host read
      // off the record itself, which a browser or a key has no such reading behind.
      headers:
        auth.kind === 'key'
          ? {}
          : {
              'x-tracy-session': c.req.header('x-tracy-session'),
              'x-tracy-preset': c.req.header('x-tracy-preset'),
              'x-tracy-turn': c.req.header('x-tracy-turn'),
              ...(auth.kind === 'actor'
                ? {
                    'x-tracy-write-title': c.req.header('x-tracy-write-title'),
                    'x-tracy-write-front': c.req.header('x-tracy-write-front')
                  }
                : {})
            }
    })
    for (const [name, value] of Object.entries(answered.headers ?? {})) c.header(name, value)
    return json(c, answered.body, /** @type {any} */ (answered.status))
  }

  app.post('/api/sites/:key/apply', async (c) => {
    return applyOverHttp(c, () => c.req.json().catch(() => null))
  })

  // ── POST /api/sites/:key/changed — a write outside the Apply door landed on the site ──────────────
  // Three writes never pass the Apply door, so nothing here would learn the site changed: `tracy_emdash`
  // (the EmDash site's own MCP server, with the site's token), a look change (a stylesheet or
  // `theme.json` written by a file tool, stage 6 F2) and `look.revert` putting one back.
  // `tracy-site-tools` reports each one it saw succeed, as the person who typed (the same `x-tracy-actor` and `x-tracy-workspace-label` the
  // Apply relay sends; `_conversation` names the session's own site), and this door stamps
  // `site.last_write_at` with a `site.changed` audit row naming the tool — the `siteChangedAt` everybody's Refresh
  // button reads (`comments.js`). Any live seat may report: the stamp grants nothing and changes no
  // content, and a seat is who the write was made for.
  app.post('/api/sites/:key/changed', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const held = await conversationSite(c)
    if (held.error) return held.error
    const auth = await requireGrant(c, held.siteKey, true)
    if (auth.error) return auth.error
    const body = await c.req.json().catch(() => ({}))
    const tool = body && typeof body === 'object' ? body.tool : undefined
    if (tool !== undefined && (typeof tool !== 'string' || !/^[a-z][a-z0-9_.]{0,63}$/.test(tool)))
      return json(c, { code: 'INVALID_REQUEST', field: 'tool' }, 400)
    const session = c.req.header('x-tracy-session') ?? ''
    const sessionId = AUDIT_SESSION_SHAPE.test(session) ? session : null
    // The chat turn it belongs to (`x-tracy-turn`, as on the Apply door): a `site_write` row in the
    // same statement, named by HOW the write was made — a look edit by a file tool or its revert,
    // or else EmDash's own MCP (P0 audit-detail.md §7: this door is not only EmDash).
    const turnHeader = c.req.header('x-tracy-turn')
    const turnId = auth.kind !== 'key' && parseTurnId(turnHeader) ? turnHeader : null
    // `via` from the caller when it names one (site-tools knows which of its paths reported); an
    // older dsh sends none, and then the tool name decides: a file tool is a look edit, `look.revert`
    // its revert, anything else EmDash's MCP. A guess from the name alone mislabelled a look edit
    // made with `bash` as EmDash (stand, 02/10).
    const askedVia = body && typeof body === 'object' ? body.via : undefined
    if (askedVia !== undefined && !['file-look', 'look-revert', 'look-css', 'emdash-mcp'].includes(askedVia))
      return json(c, { code: 'INVALID_REQUEST', field: 'via' }, 400)
    const via =
      askedVia ??
      (['edit', 'write', 'bash', 'str_replace_editor', 'multi_edit', 'apply_patch'].includes(tool)
        ? 'file-look'
        : tool === 'look.revert'
          ? 'look-revert'
          : 'emdash-mcp')
    // The entry an EmDash write named (`{kind: <collection>, id}`, site-tools `emdashWriteTarget`), so
    // its row reads "Updated post <id>" like the Apply door's. Anything else is dropped, not refused:
    // the stamp matters more than the label.
    // `look-css` (a WordPress look write or its revert, on the site's Additional CSS): the look undo
    // id it kept, which undoing the chat turn puts back (`turn-undo.js`). Names only, never the CSS.
    const target =
      via === 'emdash-mcp'
        ? writeTargetOf(body?.target)
        : via === 'look-css'
          ? lookTargetOf(body?.target)
          : null
    const changedAt = await auditSiteWrite(pool, {
      actor: auth.email,
      action: 'site.changed',
      siteKey: held.siteKey,
      detail: {
        ...(tool !== undefined ? { tool } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(turnId ? { turnId } : {})
      },
      write: { turnId, sessionId, outcome: 'ok', target, via, action: tool ?? 'site.changed' }
    })
    // An EmDash write never passes the Apply door, so the door's "Done by Tracy" stamp
    // (`recordApply` → `markRequestsAnswered`) never ran for it (dev round 02/10: WordPress and
    // Joomla requests answered, EmDash ones never). The same stamp, with the same bounds — the
    // caller's own recent requests — by the comment numbers of the turn this write belongs to, and
    // only when the person who typed that turn is the one reporting it. A look edit is not an
    // EmDash write and keeps its old behaviour.
    if (via === 'emdash-mcp' && turnId) {
      try {
        const turn = await turnOf(pool, turnId)
        const ns = turn?.site_key === held.siteKey && turn.actor === auth.email ? turn.comment_ns : null
        if (Array.isArray(ns) && ns.length > 0)
          await markRequestsAnswered(pool, {
            siteKey: held.siteKey,
            accountId: auth.account.id,
            ns,
            windowMs: COMMENT_ANSWER_WINDOW_MS
          })
      } catch (error) {
        // The write landed and is stamped; a lost "Done by Tracy" must not fail the report.
        console.warn(`[tracy-web] comment answer stamp failed on ${held.siteKey}: ${error?.message ?? error}`)
      }
    }
    return json(c, { changedAt: changedAt === null ? null : new Date(changedAt).toISOString() })
  })

  // ── GET /api/sites/:key/changed — when the site last changed, for a conversation about to answer ──
  // V7S-1 (acceptance v7, 30/09): a conversation whose heading another conversation had changed back
  // answered "already in place" from memory. `tracy-site-tools` asks this before each turn a person
  // speaks in, and compares it with that conversation's last site call (its own log) to say "the site
  // changed since you last looked". The `site.last_write_at` column every Refresh button reads
  // (`siteChangedAt`), never a walk of `audit`, which has no site index and is asked here every turn
  // (`040-site-last-write.sql`). Read-only; any live seat, as the POST beside it.
  // `byThisConversation` (e2e v8 V8-1): whether that last write was made by the asking conversation
  // (`x-tracy-session` = the session recorded with it, `043-site-last-write-session.sql`). Its own
  // write is stamped when it lands, after its call, so comparing times alone told a conversation that
  // someone else had changed the site right after it wrote.
  app.get('/api/sites/:key/changed', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const held = await conversationSite(c)
    if (held.error) return held.error
    const auth = await requireGrant(c, held.siteKey, true)
    if (auth.error) return auth.error
    const site = await siteByKey(pool, held.siteKey)
    const at = site?.last_write_at ?? null
    const session = c.req.header('x-tracy-session') ?? ''
    const byThisConversation =
      at !== null && AUDIT_SESSION_SHAPE.test(session) && site?.last_write_session === session
    return json(c, { changedAt: at === null ? null : new Date(at).toISOString(), byThisConversation })
  })

  // ── POST /api/sites/:key/lease/release — a conversation's turn ended: its write lease goes back ──
  // The lease's only release was SILENCE — 90 s after the holder's last write — because this door
  // has no signal for "the request is finished" (see the Apply door's lease note). `tracy-site-tools`
  // has one: the dsh turn that wrote ended. Measured on the stand (acceptance v4, 30/09, S09, R09,
  // ED1, ADV3): a second conversation — another person's, or the same person's other chat — was
  // refused for up to 90 s after the first one had FINISHED, and told the site was being changed
  // "right now". Only the holder's own session, and only when the holder is the caller, is freed;
  // anything else answers `released: false` and changes nothing.
  app.post('/api/sites/:key/lease/release', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const held = await conversationSite(c)
    if (held.error) return held.error
    const auth = await requireGrant(c, held.siteKey, true)
    if (auth.error) return auth.error
    const session = auth.kind === 'key' ? `key:${auth.key.keyId}` : c.req.header('x-tracy-session') || ''
    if (!AUDIT_SESSION_SHAPE.test(session))
      return json(c, { code: 'INVALID_REQUEST', field: 'x-tracy-session' }, 400)
    // The turn that ended (`x-tracy-turn`): a release of an older turn than the lease's latest writer
    // changes nothing (`releaseWriteLease`). A key names none; a value of the wrong shape is dropped.
    const turnHeader = c.req.header('x-tracy-turn')
    const released = await releaseWriteLease(pool, {
      siteKey: held.siteKey,
      sessionId: session,
      actor: auth.email ?? null,
      turnId: auth.kind !== 'key' && parseTurnId(turnHeader) ? turnHeader : null
    })
    return json(c, { released })
  })

  // ── POST /api/sites/:key/lease/acquire — the host is about to write the site outside the Apply door ──
  // Review Q1 (council 20/10/2026, option ii): an EmDash write (`tracy_emdash`, EmDash's `content.replace`
  // write script, a picture upload through EmDash's MCP) goes straight to the site and never passes the
  // Apply door, so it met no lease and two conversations on one EmDash site wrote interleaved.
  // `tracy-site-tools` asks here before each such write: the same `site_write_lease` row, taken the
  // same way as the Apply door takes it (`notePresence` then `takeWriteLease`, with the session, the
  // person and `x-tracy-turn`), and the same `SITE_BUSY` body when another conversation holds it — so
  // the host waits it out on the same road (`lease-wait.mjs`). Held to the conversation's own site
  // (`conversationSite`), as `/lease/release`; given back by that door when the turn ends, or by
  // silence. A seat that may not write is refused: it holds no write lease.
  app.post('/api/sites/:key/lease/acquire', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const held = await conversationSite(c)
    if (held.error) return held.error
    const auth = await requireGrant(c, held.siteKey, true)
    if (auth.error) return auth.error
    if (!(await mayWrite(auth, held.siteKey)))
      return json(c, { code: 'FORBIDDEN_WRITE', role: auth.grant?.role ?? null }, 403)
    const session = auth.kind === 'key' ? `key:${auth.key.keyId}` : c.req.header('x-tracy-session') || ''
    if (!AUDIT_SESSION_SHAPE.test(session))
      return json(c, { code: 'INVALID_REQUEST', field: 'x-tracy-session' }, 400)
    const turnHeader = c.req.header('x-tracy-turn')
    const turnId = auth.kind !== 'key' && parseTurnId(turnHeader) ? turnHeader : null
    const preset = c.req.header('x-tracy-preset') ?? ''
    await notePresence(pool, {
      siteKey: held.siteKey,
      sessionId: session,
      actor: auth.email,
      preset: auth.kind !== 'key' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(preset) ? preset : null
    })
    const lease = await takeWriteLease(pool, {
      siteKey: held.siteKey,
      sessionId: session,
      actor: auth.email,
      turnId
    })
    if (!lease.ok) return json(c, leaseBusyBody(held.siteKey, auth.email, lease), 409)
    if (lease.takenOverFrom) {
      const shaped = (s) => (AUDIT_SESSION_SHAPE.test(s ?? '') ? s : null)
      await audit(pool, {
        actor: auth.email,
        action: 'site.lease.takeover',
        siteKey: held.siteKey,
        detail: { fromSession: shaped(lease.takenOverFrom), toSession: shaped(session) }
      })
    }
    return json(c, { ok: true, fresh: lease.fresh })
  })

  // ── POST /api/sites/:key/turn/stopped — what a site call the customer's Stop cut wrote ────────────
  // Review Q2 (council 20/10/2026, option ii). dsh answers a call the Stop cut with "Error: tool call
  // aborted", while a send already on the wire runs on and may land (`turn-stop.mjs`). `tracy-site-tools`
  // reports, for each write of such a call — Apply or EmDash — `sent` when the Stop lands and its outcome
  // when its answer comes (`stopped-writes.mjs`), signed as the person who typed, as `/turn/check` is.
  // Names only: action, target (kind/id/slot/page), outcome (`stopped-writes.js`). Kept in
  // `site_stopped_write` (migration 148), so a host restart in between loses nothing.
  app.post('/api/sites/:key/turn/stopped', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const held = await conversationSite(c)
    if (held.error) return held.error
    const auth = await requireGrant(c, held.siteKey, true)
    if (auth.error) return auth.error
    const body = await c.req.json().catch(() => null)
    const parsed = parseTurnId(body?.turnId)
    if (parsed === null) return json(c, { code: 'INVALID_TURN' }, 400)
    const writes = body?.writes
    if (!Array.isArray(writes) || writes.length === 0 || writes.length > STOPPED_WRITES_MAX)
      return json(c, { code: 'INVALID_WRITES' }, 400)
    const kept = await recordStoppedWrites(pool, {
      siteKey: held.siteKey,
      turnId: `${parsed.sessionId}:${parsed.turn}`,
      actor: auth.email ?? null,
      writes: writes.map(stoppedWriteOf)
    })
    return json(c, { ok: true, kept })
  })

  // ── POST /api/sites/:key/turn/stopped/take — the writes of this conversation's stopped turns, once ──
  // The first step of a turn the person speaks in asks here (`tracy-site-tools`), naming that turn:
  // the writes recorded above for EARLIER turns of the same conversation, on this site, as this person,
  // not told yet — and marks them told, so the notice they become is said once.
  app.post('/api/sites/:key/turn/stopped/take', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const held = await conversationSite(c)
    if (held.error) return held.error
    const auth = await requireGrant(c, held.siteKey, true)
    if (auth.error) return auth.error
    const body = await c.req.json().catch(() => null)
    const parsed = parseTurnId(body?.turnId)
    if (parsed === null) return json(c, { code: 'INVALID_TURN' }, 400)
    const writes = await takeStoppedWrites(pool, {
      siteKey: held.siteKey,
      turnId: `${parsed.sessionId}:${parsed.turn}`,
      actor: auth.email ?? null
    })
    return json(c, { ok: true, writes })
  })

  // ── POST /api/sites/:key/artifacts/:step — Migrate's multipart upload into R2 ───────────────────
  // ported: handleArtifact
  // Ported from `apiSiteArtifact` + `handleArtifact`; the SigV4 half lives in `sites/artifacts.js`.
  app.post('/api/sites/:key/artifacts/:step', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const step = c.req.param('step')
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    // An upload of the site's files or database is a write: never a viewer's (ADR 0028).
    if (!(await mayWrite(auth, siteKey)))
      return json(c, { code: 'FORBIDDEN_WRITE', role: auth.grant.role }, 403)
    const store = config.artifactStore
    if (!store) return json(c, { code: 'ARTIFACT_STORE_UNAVAILABLE' }, 503)
    const body = await c.req.json().catch(() => null)
    if (!body) return json(c, { code: 'INVALID_REQUEST' }, 400)

    // Two shapes are both "of this site": a key Migrate itself names (`labelPrefix`), and one the
    // host names when it packages a `.webroot/` snapshot (its own stack label, prefix plus hash).
    const prefixes = [
      `sites/${labelPrefix(siteKey)}/`,
      `sites/${await fleetLabel(siteKey, config.siteDomain)}/`
    ]
    const givenKey = typeof body.key === 'string' ? body.key : ''
    if (['part', 'finish', 'abort', 'fetch', 'delete'].includes(step)) {
      // A `.`/`..` segment is refused outright: a URL client resolves it, so `sites/<label>/../`
      // would reach outside the prefix it starts with — into another site, or the backup exports
      // (`backup-exports/`), whose links only their own door issues, to the Owner alone.
      if (
        givenKey.split('/').some((seg) => seg === '..' || seg === '.') ||
        givenKey.startsWith(EXPORT_NAMESPACE)
      )
        return json(c, { code: 'KEY_NOT_YOURS' }, 403)
      if (!prefixes.some((p) => givenKey.startsWith(p))) return json(c, { code: 'KEY_NOT_YOURS' }, 403)
      if (step !== 'fetch' && step !== 'delete' && (typeof body.uploadId !== 'string' || !body.uploadId)) {
        return json(c, { code: 'INVALID_REQUEST' }, 400)
      }
    }
    const kind = body.kind === 'db' ? 'db' : 'webroot'

    if (step === 'begin') {
      const key = artifactKey(labelPrefix(siteKey), kind)
      const res = await signedCall(store, { method: 'POST', key, query: { uploads: '' } }, fetchImpl)
      if (!res.ok) return json(c, { code: 'ARTIFACT_STORE_FAILED', status: res.status }, 502)
      const xml = await res.text()
      const uploadId = xml.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1]
      if (!uploadId) return json(c, { code: 'ARTIFACT_STORE_FAILED' }, 502)
      return json(c, { key, uploadId })
    }
    if (step === 'put') {
      const key = artifactKey(labelPrefix(siteKey), kind)
      return json(c, { key, url: await presign(store, { method: 'PUT', key }) })
    }
    if (step === 'fetch') {
      return json(c, { url: await presign(store, { method: 'GET', key: givenKey, expiresIn: 900 }) })
    }
    if (step === 'part') {
      const partNumber = Number(body.partNumber)
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
        return json(c, { code: 'INVALID_REQUEST' }, 400)
      }
      // The source site PUTs this one itself, from wherever it runs (`storeForSource`).
      const url = await presign(storeForSource(store), {
        method: 'PUT',
        key: givenKey,
        query: { partNumber: String(partNumber), uploadId: body.uploadId }
      })
      return json(c, { url })
    }
    if (step === 'abort') {
      const res = await signedCall(
        store,
        { method: 'DELETE', key: givenKey, query: { uploadId: body.uploadId } },
        fetchImpl
      )
      return json(c, { aborted: res.ok })
    }
    if (step === 'delete') {
      const res = await signedCall(store, { method: 'DELETE', key: givenKey }, fetchImpl)
      return json(c, { deleted: res.ok || res.status === 404 })
    }
    if (step === 'finish') {
      const parts = Array.isArray(body.parts) ? body.parts : []
      if (parts.length === 0) return json(c, { code: 'INVALID_REQUEST' }, 400)
      const xml =
        '<CompleteMultipartUpload>' +
        parts
          .map(
            (p) =>
              `<Part><PartNumber>${Number(p.PartNumber)}</PartNumber><ETag>${String(p.ETag).replace(/[<>&"]/g, '')}</ETag></Part>`
          )
          .join('') +
        '</CompleteMultipartUpload>'
      const res = await signedCall(
        store,
        { method: 'POST', key: givenKey, query: { uploadId: body.uploadId }, body: xml },
        fetchImpl
      )
      if (!res.ok) return json(c, { code: 'ARTIFACT_STORE_FAILED', status: res.status }, 502)
      return json(c, { key: givenKey, done: true })
    }
    return json(c, { code: 'UNKNOWN_STEP' }, 400)
  })

  // ── DELETE /api/sites/:key/import — Remove an unfinished import (`import-remove.js`) ──────────
  // The one deletion path for an import whose read never reached a build: the recovery page and My
  // Sites call it, and the abandoned-import sweep calls the same function. Only a seat that may
  // delete the site; only an unfinished import (`lib/import-pending.js`); nothing is deleted until
  // the host that ran the read confirmed none is going and holds the site.
  app.delete('/api/sites/:key/import', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    if (!seats.actingOwner(auth.grant)) return json(c, { code: 'NOT_SITE_OWNER' }, 403)
    const outcome = await removeUnfinishedImport(siteKey, { email: auth.email })
    if (outcome.refused) {
      const { status, ...body } = outcome.refused
      return json(c, body, status)
    }
    return json(c, { removed: true, artifactsKept: outcome.artifacts.kept.length })
  })

  // ── DELETE /api/sites/:key/claim — let go of an import that never reached a host ──────────────
  // An import claims its row BEFORE reading the old site, and the host folder is only built by
  // `/provision` at the end. A read that dies in between (a dsh deploy, measured 14/09 — issue #83)
  // left a row whose `/site/<label>` does not exist, and the workspace picker answered ENOENT until
  // someone called the full teardown by hand.
  //
  // The import wizard called this when its run failed, and no longer does (#796): the guard below
  // looks at build jobs, not at a read still going in dsh, and a browser cannot know that no read
  // stands under the claim at the moment this lands. The door stays for a caller that does know.
  //
  // 🔒 NARROW BY DESIGN: only an imported row (`migrated`) that no job was ever filed for. Anything
  // a host was asked to build goes through the real teardown above, never through this door.
  app.delete('/api/sites/:key/claim', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    if (!seats.actingOwner(auth.grant)) return json(c, { code: 'NOT_SITE_OWNER' }, 403)
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    // 🔒 NOT A SECOND DELETION PATH. An unfinished import (`lib/import-pending.js`) is removed the way
    // the Remove button removes it (`import-remove.js`), with its answers: this door alone deleted the
    // row and its seats with a read possibly still going on the host. No client calls it since #796.
    if (await importPending(pool, siteKey)) {
      const outcome = await removeUnfinishedImport(siteKey, { email: auth.email })
      if (outcome.refused) {
        const { status, ...body } = outcome.refused
        return json(c, body, status)
      }
      return json(c, { released: true })
    }
    if (site.origin !== 'migrated' || (await hasJob(pool, siteKey)))
      return json(c, { code: 'SITE_IN_USE' }, 409)
    await seats.revokeAllGrants(pool, siteKey)
    await forgetSiteAttachments(pool, config.artifactStore, siteKey, fetchImpl)
    await deleteSite(pool, siteKey)
    // The read's books on the add-site host (its Claude Cowork code, its handover) go with the row.
    await forgetImportAtHost({ config, seatDoor, fetchImpl }, { siteKey, host: site.host, email: auth.email })
    return json(c, { released: true })
  })

  // ── DELETE /api/sites/:key — tear the whole site down: seats, host stack, book row ─────────────
  // ported: handleTeardown
  // Ported from `apiSiteDelete` + `handleTeardown`, narrowed to this app's one hosting kind. The
  // repo goes too, but only one Tracy created — `github.deleteRepoFor` decides that from the book
  // and answers `repo` beside `host` (#338: the dialog promised it while nothing deleted it).
  app.delete('/api/sites/:key', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    if (!seats.actingOwner(auth.grant)) return json(c, { code: 'NOT_SITE_OWNER' }, 403)
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    // 🔒 ONE DELETION PATH FOR AN UNFINISHED IMPORT (`lib/import-pending.js`): it has no stack on a host
    // to tear down, and a read may still be going there. So it is removed the way the Remove button
    // removes it (`import-remove.js`), with its answers; a finished import and a built site go on below.
    if (await importPending(pool, siteKey)) {
      const outcome = await removeUnfinishedImport(siteKey, { email: auth.email })
      if (outcome.refused) {
        const { status, ...body } = outcome.refused
        return json(c, body, status)
      }
      // The shape this door answers (`delete-response.ts`): no repo, no sessions were ever made.
      return json(c, { removed: true, host: true, repo: false, sessions: true, seats: true })
    }

    // 🔒 THE DELETE TAKES THE SITE, LIKE A PUBLISH DOES — IT DOES NOT LOOK AND THEN ACT. This door used
    // to ask whether an operation held the site and, hearing "no", go on to tear it down and erase
    // its row. A publish could start between the question and the teardown: the two scripts then
    // meet on the host's lock, one of them ends having changed nothing — and the row was erased
    // whichever it was, also when the teardown itself FAILED. A site left on the host that the book
    // no longer has, its own domain still routed to it, and nothing to ask again from.
    //
    // So the delete is an operation of the site (`publish.js`): it takes the site's one row under
    // the lock every other operation reserves under — once it has it nothing else starts, and while
    // something else has it the delete is refused whole — and the row of the SITE stays until the
    // host's own script said the site is off the host. Only then is the book closed
    // (`closeDeletedSite`). A teardown that failed is on record as failed, with the site still
    // there to delete again: the same operation, taken up where it stopped.
    const earlier = await currentPublishOp(pool, siteKey)
    await publishing.refresh(site)
    // A delete taken earlier (its door answered 202, or died) that the host has finished meanwhile:
    // that look just closed its book. Pressed again, the answer is "removed" — not "no such site".
    if (earlier?.op === 'delete' && !(await siteByKey(pool, siteKey))) {
      const closed = closedHere.get(earlier.ref) ?? null
      closedHere.delete(earlier.ref)
      return json(c, {
        removed: true,
        host: true,
        ...(closed
          ? {
              repo: closed.repo,
              sessions: closed.sessions,
              ...(closed.sessions ? {} : { sessionsReason: closed.sessionsReason }),
              seats: closed.seats
            }
          : {})
      })
    }
    const taken = await publishing.deleteSite(site, auth, async (row) => {
      // Before the host is asked: the agent's turns on the site stop before its folder goes.
      deletesHere.set(row.ref, { forgotten: await forgetSiteSessions(site) })
    })
    if (taken.busy === 'gone') return json(c, { code: 'SITE_UNKNOWN' }, 404)
    if (taken.busy === 'names') return json(c, { code: 'ADDRESS_CHANGE_BUSY' }, 409)
    if (taken.busy)
      return json(c, { code: 'PUBLISH_BUSY', ...(await publishing.view(pool, site, auth.grant)) }, 409)
    const ref = taken.row.ref

    /** The site is still there: the host's half did not finish, and nothing else was removed. */
    const notTornDown = (op) => {
      deletesHere.delete(ref)
      const said = op.code === 'JOB_FAILED' ? teardownSaid({ output: op.detail }, site.label) : null
      const hostReason =
        op.code === 'JOB_FAILED'
          ? `TEARDOWN_FAILED${said === null ? '' : `: ${said}`}`
          : op.code === 'JOB_NO_RESULT'
            ? 'TEARDOWN_NOT_CONFIRMED'
            : `TEARDOWN_REFUSED: ${op.code ?? 'no reason given'}`
      console.warn(`[sites] ${site.host} did not tear ${site.label} down: ${hostReason}`)
      return json(c, { code: 'TEARDOWN_FAILED', removed: false, host: false, hostReason, retry: true }, 409)
    }
    /** The book is closed: the answer the dialog reads part by part. */
    const removedAnswer = (parts) =>
      json(c, {
        removed: true,
        // Always true here: the row goes only after the host said the site is off it.
        host: true,
        ...(parts
          ? {
              repo: parts.repo,
              sessions: parts.sessions,
              ...(parts.sessions ? {} : { sessionsReason: parts.sessionsReason }),
              seats: parts.seats
            }
          : {})
      })

    // 🔒 WAITED FOR, WITHIN A BOUND, BECAUSE A TEARDOWN IS USUALLY SECONDS — and the dialog can then
    // say "deleted" or "not deleted" instead of "being deleted". Each look is `refresh`: it hears the
    // job's outcome, asks the host again under the same key when there is none, and closes the book
    // once the host said the site is gone. What ends the wait without an outcome changes nothing:
    // the operation goes on holding the site, and the sweep (`cron.js`) finishes what this door
    // started, with the tab closed.
    const begun = now()
    let op = taken.row
    for (let attempt = 0; ; attempt++) {
      const closed = closedHere.get(ref)
      if (closed !== undefined) {
        closedHere.delete(ref)
        return removedAnswer(closed)
      }
      op = await currentPublishOp(pool, siteKey)
      // The row is gone, closed by another process (a replica, the sweep): removed, and the parts
      // it reported there are not this answer's to claim.
      if (!op)
        return (await siteByKey(pool, siteKey)) ? json(c, { code: 'PUBLISH_BUSY' }, 409) : removedAnswer(null)
      if (op.ref !== ref) return json(c, { code: 'PUBLISH_BUSY' }, 409)
      if (op.state === 'failed') return notTornDown(op)
      if (now() - begun >= TEARDOWN_WAIT_MS) break
      await new Promise((resolve) => setTimeout(resolve, JOB_WAITS_MS[attempt] ?? 700))
      await publishing.refresh(site)
    }
    console.warn(
      `[sites] ${site.host} did not finish tearing ${site.label} down within ${TEARDOWN_WAIT_MS} ms`
    )
    return json(
      c,
      {
        code: 'DELETE_PENDING',
        removed: false,
        jobId: op.job_id ?? null,
        ...(await publishing.view(pool, site, auth.grant))
      },
      202
    )
  })

  /**
   * The delete door's operation as a function, for a demo the Website Opportunities sweep retires
   * (`opportunities-build/demo-retention.js`): the same reservation, host teardown and book closing, acted as
   * `email`, with no wait. `'gone'` once the host said the site is off it, `'started'` while its delete
   * runs, `'busy'` while another operation holds the site.
   * @returns {Promise<'gone' | 'started' | 'busy'>}
   */
  async function teardownSiteAs(siteKey, email) {
    const site = await siteByKey(pool, siteKey)
    if (!site) return 'gone'
    await publishing.refresh(site)
    if (!(await siteByKey(pool, siteKey))) return 'gone'
    const account = await seats.accountByEmail(pool, email)
    const taken = await publishing.deleteSite(site, { email, account }, async (row) => {
      deletesHere.set(row.ref, { forgotten: await forgetSiteSessions(site) })
    })
    if (taken.busy === 'gone') return 'gone'
    if (taken.busy) return (await currentPublishOp(pool, siteKey))?.op === 'delete' ? 'started' : 'busy'
    return (await siteByKey(pool, siteKey)) ? 'started' : 'gone'
  }

  /** What a delete this process started still knows when its book is closed, by operation ref. */
  const deletesHere = new Map()
  /** The closings under way in this process, and what the finished ones reported, by operation ref. */
  const closing = new Map()
  const closedHere = new Map()
  /** The most reports kept for a door that never came back for its own (it died, or timed out). */
  const CLOSED_KEPT = 200

  /**
   * The host said a deleted site is off it (the operation `op` is marked `TORN_DOWN`): close the
   * book — the repository Tracy created, the seats at the agent and in the book, the attachments,
   * the row itself, the team's notice, the sessions' folder. One closing per operation at a time in
   * this process; another process doing the same is harmless (each step looks before it acts, and
   * only the one whose delete took the row tells the team).
   * @param {Record<string, any>} site
   * @param {Record<string, any>} op - the site's held `delete` operation
   * @returns {Promise<{repo: unknown, sessions: boolean, sessionsReason: string | null,
   *   seats: boolean} | null>} null when the operation is not (or no longer) a marked delete
   */
  function closeDeletedSite(site, op) {
    const running = closing.get(op.ref)
    if (running) return running
    const work = closeBook(site, op)
      .then((parts) => {
        if (parts !== null) {
          closedHere.set(op.ref, parts)
          // Oldest first out: a Map keeps insertion order.
          while (closedHere.size > CLOSED_KEPT) closedHere.delete(closedHere.keys().next().value)
        }
        return parts
      })
      .finally(() => {
        closing.delete(op.ref)
      })
    closing.set(op.ref, work)
    return work
  }

  async function closeBook(site, op) {
    const siteKey = site.site_key
    const marked = await currentPublishOp(pool, siteKey)
    if (marked?.ref !== op.ref || marked.op !== 'delete' || marked.code !== PUBLISH_CODES.tornDown)
      return null
    // Best-effort, matching the Worker's own teardown philosophy: the book is what a person can no
    // longer erase by hand once the machine forgets it, so each part is reported in the answer,
    // never hidden behind a thrown error.
    // After the teardown, so a host still running the site never pushes to a repo already gone.
    // Reported, never thrown: a repo GitHub would not delete must not keep the row alive.
    const repo =
      typeof github?.deleteRepoFor === 'function'
        ? await github.deleteRepoFor(config, site, fetchImpl)
        : site.repo
          ? 'failed'
          : false
    // Who held a seat, read BEFORE the book revokes them — afterwards every row is revoked alike.
    // The agent's seats first: a closing cut short after it is done again by the next look, which
    // still finds the holders in the book.
    const holders = await liveSeatEmails(siteKey)
    const team = await teamAccountIds(siteKey)
    const revokedAtDsh = await revokeSiteSeats(site, holders)
    await seats.revokeAllGrants(pool, siteKey)
    // Before the row: its attachment rows cascade with it, and they name the store keys (best-effort).
    await forgetSiteAttachments(pool, config.artifactStore, siteKey, fetchImpl)
    // The site's downloadable backups go with it: their objects first, then their rows (best-effort).
    await backupExports.forgetSite(siteKey)
    // 🔒 THE ROW GOES ONLY AS THIS MARKED DELETE'S. One statement: the site and the operation that
    // holds it, still marked. Whoever it finds nothing for was beaten to it, and tells nobody twice.
    const gone = await deleteTornDownSite(pool, { siteKey, ref: op.ref })
    if (gone) {
      // A Website Opportunities demo deleted here, not by its sweep, still reads deleted (R-dev-4).
      await markDemoDeletedBySite(pool, siteKey).catch((error) =>
        console.error(`[sites] ${siteKey}: demo mark after delete failed`, error)
      )
      // Shard beta: the master takes `<label>.<zone>` off this shard (spec §3.2, §4.4).
      if (shard)
        await shard.emit(
          'site.deleted',
          { siteKey, label: dnsLabelOf(site.primary_name || siteKey, config.siteDomain, site.label) },
          `${siteKey}@${new Date(site.created_at).toISOString()}`
        )
      // T13 (spec #809): every other member learns why the site is gone. The rows keep the name the
      // site had (`siteName`), since the site row they would read it from no longer exists.
      await notify({
        recipients: team,
        kind: 'team.site_deleted',
        siteKey,
        actor: op.actor_account ?? null,
        data: { siteName: site.primary_name || siteKey }
      })
      // An invitation or request to a site that is gone can only be refused: close it.
      await settleSiteNotifications(siteKey)
      // A finished import: the add-site host still keeps its read's books (the Claude Cowork code,
      // the handover). Asked once the host said the site is off it; best effort.
      if (site.origin === 'migrated')
        await forgetImportAtHost(
          { config, seatDoor, fetchImpl },
          { siteKey, host: site.host, email: op.actor }
        )
      await opsFor(pool).record('site.delete', {
        email: op.actor,
        accountId: op.actor_account,
        siteKey,
        siteInstance: site.created_at,
        siteDemo: site.demo,
        data: {
          platform: site.platform,
          age_days: Math.max(0, Math.floor((Date.now() - new Date(site.created_at).getTime()) / 86400_000))
        }
      })
    }
    // Last, once the book is settled: the dsh refuses to move a site's session folder while that
    // site's folder still exists, and by now the host said it does not. `forgotten` is what the door
    // that started this delete heard from the dsh; a closing by another process does not know, and
    // leaves the folder for the operator's sweep (`SESSIONS_NOT_STOPPED`).
    const forgotten = deletesHere.get(op.ref)?.forgotten === true
    deletesHere.delete(op.ref)
    const archived = await archiveSiteSessions(site, forgotten)
    return { repo, sessions: archived.ok, sessionsReason: archived.reason, seats: revokedAtDsh }
  }

  /**
   * The host's dsh moves the deleted site's session folder out of its live store, into
   * `$DSH_HOME/sessions-archive/<label>-<UTC stamp>/` — the whole folder, renamed, nothing deleted.
   *
   * 🔒 FORGETTING WAS NOT ENOUGH. `forgetSiteSessions` hides the sessions from every list, but the
   * files stay in the store, and dsh reads the header of every session in it on each page load,
   * for every site on the host (measured 28/09 on the local stand: 1,190 of 1,202 sessions sat in
   * the folders of 33 deleted sites; `tasks/ban-giao-session-list-quet-ca-host-2026-09-28.md`).
   *
   * The dsh is the judge, because only it sees the store and the site mount: it refuses while
   * `/site/<label>` still exists, when the folder is missing, when a session in it belongs to
   * another path, or while a lease still writes to it. `sessions` in the answer is whether no
   * session folder of the site is left in the store — moved now, or never there (`NO_SESSION_FOLDER`)
   * — and any other refusal comes back as `sessionsReason` — for the operator, whose sweep
   * (`archive-orphan-sessions.mjs` in the fleet package) applies the same rules later.
   *
   * 🔒 NOT ASKED UNLESS THE DSH CONFIRMED THE FORGET (#561). A turn waiting on its customer's answer
   * holds no lease (`deploy-hold.mjs` `chatLeases`); only `forgetSiteSessions` asks the site's turns
   * to stop, so when it was not confirmed the folder stays, as `SESSIONS_NOT_STOPPED`. Whether they
   * ENDED is the door's own work, done right before the move over the sessions in the folder
   * (`settleSiteSessions`, seat-home.ts): it archives and stops every session of the site — one
   * opened after the forget and a running subagent included — and a `SESSION_ACTIVE` there is one
   * not ended yet, asked again (and stopped again) within `SESSIONS_STOP_WAIT_MS`, then left in place.
   *
   * 🔒 REVOKING THE SEATS ABOVE DOES NOT FENCE THE MOVE (#561). `liveSeatEmails` names only seats with
   * an address, so a guest or bot seat keeps its dsh account, and the master is no seat; either could
   * still open a session at the site's path or prompt one of its sessions. The dsh door runs its last
   * check and the rename under its own write fence: it waits for every earlier request to be
   * answered by dsh, holds every new one until the folder has moved, then refuses those that name
   * the site (`write-fence.ts` in dsh-passwords).
   *
   * Asked only once the host said the site is off it (`closeDeletedSite`), which is what the dsh
   * itself checks for.
   *
   * @param {{host: string, label: string}} site
   * @param {boolean} forgotten - whether the dsh confirmed it archived the sessions and asked their work to stop.
   * @returns {Promise<{ok: boolean, reason: string|null}>}
   */
  async function archiveSiteSessions(site, forgotten) {
    const dsh = config.hosts.get(site.host)
    if (!dsh?.dshOrigin || !dsh?.seatSecret || typeof seatDoor.archiveSessionsAtDoor !== 'function')
      return { ok: false, reason: 'NO_DSH_DOOR' }
    if (!forgotten) {
      console.warn(`[sites] ${site.host}'s dsh did not confirm the turns of /site/${site.label} stopped`)
      return { ok: false, reason: 'SESSIONS_NOT_STOPPED' }
    }
    const begun = now()
    const left = () => SESSIONS_STOP_WAIT_MS - (now() - begun)
    let moved = null
    try {
      const ask = () =>
        seatDoor.archiveSessionsAtDoor({
          origin: dsh.dshOrigin,
          secret: dsh.seatSecret,
          path: `/site/${site.label}`,
          fetchImpl,
          signal: AbortSignal.timeout(Math.max(1, left()))
        })
      moved = await ask()
      for (let attempt = 0; moved.reason === 'SESSION_ACTIVE' && left() > 0; attempt++) {
        const pause = Math.min(SESSIONS_STOP_WAITS_MS[attempt] ?? 2000, left())
        await new Promise((resolve) => setTimeout(resolve, pause))
        if (left() <= 0) break
        moved = await ask()
      }
      // No folder means nothing is left in the store: the site never had a session (its name is
      // derived from the label, so it cannot sit elsewhere), or an earlier ask already moved it.
      // Measured 14/10/2026 on dev: deleting a site nobody chatted in told its owner the cleanup
      // was incomplete.
      if (moved.reason === 'NO_SESSION_FOLDER') return { ok: true, reason: null }
      if (!moved.ok)
        console.warn(`[sites] ${site.host}'s dsh kept the sessions of /site/${site.label}: ${moved.reason}`)
      return { ok: moved.ok, reason: moved.ok ? null : moved.reason }
    } catch (error) {
      console.warn(
        `[sites] could not reach ${site.host}'s dsh to archive /site/${site.label}: ${error.message}`
      )
      // An ask cut off by the wait after the dsh already said a turn held the folder: that is the reason.
      return { ok: false, reason: moved?.reason ?? 'DSH_UNREACHABLE' }
    }
  }

  /**
   * The team a site event is told to (spec #809 T12–T14): accounts holding an ACCEPTED seat, neither
   * revoked nor declined. The notifier drops the person who acted.
   * @param {string} siteKey
   * @returns {Promise<string[]>}
   */
  async function teamAccountIds(siteKey) {
    if (typeof seats.seatsOfSite !== 'function') return []
    const rows = await seats.seatsOfSite(pool, siteKey)
    return rows.filter((r) => r.accepted_at && !r.revoked_at && !r.declined_at).map((r) => r.account_id)
  }

  /**
   * T12: "Restore everything" succeeded, so what anyone saved after the backup is gone; the team hears
   * it, named by the backup's title. Once per operation (`ref`), so a retried press or a later
   * reconcile of the same operation never tells anyone twice. Never throws into the door.
   * @param {any} site
   * @param {{id: string, scope?: any}} operation - the settled `restore-everything` operation.
   * @param {string|null} actorId - the account that pressed it.
   */
  async function announceRestored(site, operation, actorId) {
    try {
      const ref = `restore:${operation.id}`
      const told = await pool.query('select 1 from notification where ref = $1 limit 1', [ref])
      if (told.rowCount > 0) return
      const version = operation.scope?.version ?? null
      const title = typeof operation.scope?.title === 'string' ? operation.scope.title : ''
      await notify({
        recipients: await teamAccountIds(site.site_key),
        kind: 'team.site_restored',
        siteKey: site.site_key,
        actor: actorId,
        data: { backup: title || `#${version}`, version },
        ref
      })
    } catch (error) {
      console.warn('[sites] restore notification not written', error?.message ?? error)
    }
  }

  /**
   * The addresses holding a live seat on a site (not revoked, not declined).
   * @param {string} siteKey
   * @returns {Promise<string[]>}
   */
  async function liveSeatEmails(siteKey) {
    if (typeof seats.seatsOfSite !== 'function') return []
    const rows = await seats.seatsOfSite(pool, siteKey)
    return rows.filter((r) => !r.revoked_at && !r.declined_at && r.seat?.email).map((r) => r.seat.email)
  }

  /**
   * The host's dsh drops every seat the deleted site had, the way a revoke from the Team tab does.
   *
   * 🔒 THE BOOK ALONE IS NOT ENOUGH, BECAUSE THE NAME COMES BACK. A browser keeps its seat cookie
   * for twelve hours, and the cookie is keyed by a fingerprint of email, role and label — all three
   * the same when a site is deleted and added again under the same name. So the new site reused
   * the old cookie, dsh never minted a seat for it, and the workspace `forgetSiteSessions` had just
   * removed was never registered again: the page stood on "Choose workspace" with nothing to choose
   * (measured 25/09 on `wp-test1.tracy.test`, deleted and re-added within ten minutes). Revoked
   * here, the old token answers 401, `workspace/route.js` clears the cookie and mints a fresh seat,
   * and the fresh seat registers the folder.
   *
   * Best-effort like the rest of the teardown: a door that refuses is reported, never thrown.
   * @param {{host: string}} site
   * @param {string[]} emails
   * @returns {Promise<boolean>} whether dsh confirmed every revoke.
   */
  async function revokeSiteSeats(site, emails) {
    const dsh = config.hosts.get(site.host)
    if (!dsh?.dshOrigin || !dsh?.seatSecret || typeof seatDoor.revokeSeatAtDoor !== 'function') return false
    const answers = await Promise.all(
      emails.map(async (email) => {
        try {
          const { ok } = await seatDoor.revokeSeatAtDoor({
            origin: dsh.dshOrigin,
            secret: dsh.seatSecret,
            email,
            site: site.site_key,
            fetchImpl
          })
          if (!ok) console.warn(`[sites] ${site.host}'s dsh refused to revoke ${email} on ${site.site_key}`)
          return ok
        } catch (error) {
          console.warn(`[sites] could not reach ${site.host}'s dsh to revoke ${email}: ${error.message}`)
          return false
        }
      })
    )
    return answers.every(Boolean)
  }

  /**
   * The host's dsh forgets the site folder's conversations, BEFORE the teardown removes the folder.
   *
   * 🔒 THE LABEL COMES BACK, AND dsh FILES SESSIONS BY FOLDER. `fleetLabel` is a pure function of
   * the domain, so the same site deleted and added again lands in the same `/site/<label>` — and
   * the new workspace opened onto the old site's sessions (measured 14/09 on
   * `fijitrips-example-5254d120`). dsh has no verb that deletes a session; the seat door archives
   * them and drops the registration, and it can only find them while the folder still exists,
   * which is why this runs before `/teardown` and not after.
   *
   * Logged, not answered, since 28/09: the delete's `sessions` now says whether the session folder
   * left the store (`archiveSiteSessions`), which is what the customer's conversations cost the host.
   *
   * It also STOPS the site's running turns (#561): the door archives with dsh's `stopActivity` and
   * cancels each session through the Stop button's door, so a turn left waiting on its customer's
   * answer ends instead of keeping its session live and holding the next deploy. Only an answer
   * confirming it (`forgetWorkspaceAtDoor`'s `ok`) counts; anything less keeps the session folder
   * where it is. That the turns ENDED is proven by the archive door, not here.
   *
   * @param {{host: string, label: string}} site
   * @returns {Promise<boolean>} whether dsh confirmed it.
   */
  async function forgetSiteSessions(site) {
    const dsh = config.hosts.get(site.host)
    if (!dsh?.dshOrigin || !dsh?.seatSecret || typeof seatDoor.forgetWorkspaceAtDoor !== 'function')
      return false
    try {
      const forgotten = await seatDoor.forgetWorkspaceAtDoor({
        origin: dsh.dshOrigin,
        secret: dsh.seatSecret,
        path: `/site/${site.label}`,
        fetchImpl,
        signal: AbortSignal.timeout(SESSIONS_FORGET_WAIT_MS)
      })
      if (!forgotten.ok) console.warn(`[sites] ${site.host}'s dsh refused to forget /site/${site.label}`)
      return forgotten.ok
    } catch (error) {
      console.warn(
        `[sites] could not reach ${site.host}'s dsh to forget /site/${site.label}: ${error.message}`
      )
      return false
    }
  }

  /**
   * The Apply door as one PERSON, for work the server does on their behalf: the words and pictures of a site
   * made with "Apply" (`brief-build.js`). The same door a browser or the agent reaches over HTTP, with the
   * same seat check, toolset gate, write lease and audit trail — only the cookie is not needed, because the
   * person is already known. Like `doorVia` over HTTP it answers the door's JSON body, and `ok: false` for a
   * refusal, so the seeder's own door calls read it the way they read any other answer.
   *
   * `setupRun` names the Tracy setup run the write belongs to (`brief-build.js`): its `site_write` rows read as
   * Type "Tracy setup" in Site changes, the person as the one who asked and Tracy as the one who wrote.
   * @param {string} email
   * @param {{siteKey: string, action: string, params?: Record<string, unknown>}} call
   * @param {{setupRun?: string | null}} [how]
   * @returns {Promise<Record<string, any>>}
   */
  async function applyAs(email, { siteKey, action, params }, { setupRun = null } = {}) {
    const account = await seats.accountByEmail(pool, email)
    const grant = account ? await seats.grantFor(pool, account.id, siteKey) : null
    if (!grant) return { ok: false, code: 'SEAT_NOT_AUTHORIZED', message: 'SEAT_NOT_AUTHORIZED' }
    const answered = await applyDoor({
      siteKey,
      action,
      params,
      principal: { kind: 'session', email, account, grant },
      headers: {},
      setupRun
    })
    const body = answered.body && typeof answered.body === 'object' ? answered.body : {}
    if (answered.status < 400 && body.ok !== false) return body
    const said = [
      body.message,
      body.error?.message,
      typeof body.error === 'string' ? body.error : null,
      body.code
    ].find((w) => typeof w === 'string' && w !== '')
    return { ...body, ok: false, message: said ?? `HTTP ${answered.status}` }
  }

  /**
   * SC-3: hold a site's webroot for one Tracy setup run (`brief-build.js`), the way a chat turn holds it, so the files
   * the run's writes leave are Tracy's own moment and never a "source unknown" seal (`setup-moment.js`).
   *   - `open`, before the run's first write: the host's `webroot-seal-outside` under the run's turn — what is dirty now
   *     was not the run's and is kept as outside, as a turn's open keeps it; the turn is marked open, so a look at Site
   *     changes seals nothing until the moment;
   *   - `close`, once the writes are over: the host's `webroot-moment` under the same turn, committed by Tracy, and — when
   *     it committed — one carrier `site_write` of the run naming the commit and its file count.
   * EmDash keeps no webroot history: nothing to hold. A failure is thrown for the run to log; it never fails the site.
   * @param {'open' | 'close'} step
   * @param {{siteKey: string, runId: string, email: string}} run
   */
  async function setupWebroot(step, { siteKey, runId, email }) {
    const turn = setupTurnOf(runId)
    if (!turn) throw new Error('not a setup run')
    const site = await siteByKey(pool, siteKey)
    if (!site) throw new Error('no such site')
    if (site.platform !== 'wordpress' && site.platform !== 'joomla') return { held: false }
    const job = await runSiteJob(
      site,
      step === 'open'
        ? { kind: 'webroot-seal-outside', turn }
        : { kind: 'webroot-moment', title: SETUP_MOMENT_TITLE, turn },
      SETUP_WEBROOT_WAIT_MS
    )
    if (!job.ok) throw new Error(job.reason ?? 'the host did not take the job')
    const data = lastLine(job.output)
    if (!data || data.ok !== true) throw new Error('the host answered unreadably')
    if (step === 'open') {
      await recordOutside(pool, siteKey, [
        ...(Array.isArray(data.outside) ? data.outside : []),
        ...(data.sealed ? [{ ...data.sealed, cause: 'seal' }] : [])
      ])
      return { held: true }
    }
    if (data.committed === true && typeof data.sha === 'string' && Number.isInteger(data.files)) {
      const target = { sha: data.sha, files: data.files }
      await auditSiteWrite(pool, {
        actor: email,
        action: SETUP_MOMENT_ACTION,
        siteKey,
        detail: { ok: true, setupRun: runId, ...target },
        write: {
          outcome: 'ok',
          via: SETUP_MOMENT_VIA,
          action: SETUP_MOMENT_ACTION,
          target,
          origin: { kind: 'setup', ref: runId }
        }
      })
    }
    return { held: true }
  }

  // The `/v1` layer's seam: the door as a function, handed on by `app.js` (module graph).
  // `resolveKeyPrincipal`: the api host's resolver for the `/v1` layer — the SAME function the
  // Apply door calls through `requireGrant` there, so "who may act with this key" is one answer.
  // `closeDeletedSite`: handed to the cron's sweep by `server.js`, so a delete nobody is watching
  // has its book closed by the same function as one somebody is.
  return Object.assign(app, {
    applyDoor,
    applyAs,
    setupWebroot,
    // The cron's tick finishes the design system picks whose worker died with its process (`server.js`).
    designSystemSweep: () => dsAtCreate.sweep(),
    resolveKeyPrincipal: requireKeyGrant,
    closeDeletedSite,
    teardownSiteAs
  })
}
