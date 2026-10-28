import { createBuildTurns } from './build-turns.mjs'
import { copyWritten, demoToolNeedsReady, runDemoLifecycle } from './demo-lifecycle.mjs'
import { resolveSweepCall } from './sweep-resolve.mjs'
/**
 * The Node half of `@tracy/dsh-site-tools`: ONE agent tool, `tracy_site({ action, params })`.
 *
 * WHY ONE TOOL (Lee, 05/09/2026). The agent has one door to the site and one name to find; we have
 * one wrapper to maintain; and the action names are the component's own, so the seat book's allowlist
 * (`APPLY_RULES`), the component's engine and this tool agree by construction — there is no mapping
 * layer that can drift. Read and write live in the same tool because the RIGHT to write is decided by
 * the caller's seat, not by which tool exists.
 *
 * WHO THE CALL ACTS AS. Nobody mints a token for the agent. The browser half says `hello` with the
 * viewer's session and the dsh session id; the tool looks the viewer up by the agent's session id and
 * calls `cowork-web`'s `/api/sites/<siteKey>/apply` with that person's cookie. The seat book then
 * checks that person's seat and role, records the call, and speaks to the component with the token it
 * holds. The lane holds no secret (same rule as `tracy-site-tabs`).
 *
 * `media.scan` and `page.look` are answered here: one reads image files under the mounted webroot, the
 * other photographs a page from inside the fleet. The component has no action for either, and the
 * lane can do both without any credential.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { widgetNativeContext, WidgetContextUnavailable } from './widget-native-context.mjs'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants as fsConstants, existsSync, promises as fs, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { drawPicture, pictureDoor } from '../../../../cms/tracy-seeder/src/picture.mjs'
// The fence's OWN reading of "is this site sealed" — one reader for the fence, the context and the tool.
import { hasContentContract } from '../../../tracy-subprocess-docker/src/content-contract.mjs'
// The path fence's own reading of "which site does this session stand in" — reused, not restated.
import { containerPath, resolveSitesRoot, siteOf } from '../../../tracy-subprocess-docker/src/route.mjs'
import { REPORT_FILE } from '@tracy/site-build-core/design-check'
import { pullDesign, readDesign, refreshDesign, tokensDirsOf } from '@tracy/site-build-core/design-record'
import { catalogNames } from '@tracy/site-build-core/library-ids'
import {
  CONFIRM_QUESTION_PREFIX,
  confirmQuestion,
  createCallMemory,
  flightSeat,
  SITE_WIDE_REASONS,
  sameCallKey,
  untranslatedConfirmCard
} from './call-memory.mjs'
import { applyCopy } from './copy-apply.mjs'
import {
  appChangedSinceRebuild,
  BUILD_REBUILD_UNNEEDED,
  buildApprovalRefusal,
  buildHide,
  buildHideRefusal,
  buildPictureRefusal,
  buildPictureWrite,
  buildQuestionRefusal,
  buildShellRefusal,
  buildTemplateRefusal,
  buildTemplateWrite
} from './build-fence.mjs'
import { languageName } from '../../../../core/tracy-core/src/language/index.mjs'
import { type Consequence, consequenceOf, lookReachOf } from './consequence.mjs'
import {
  designGetRequest,
  designPutRequest,
  designSigner,
  fetchDesign,
  siteKeyInFolder
} from './design-sync.mjs'
import {
  checkedAnswer,
  DESIGN_CHECK_DESCRIPTION,
  DESIGN_CHECK_PARAMETERS,
  designCheckPaths,
  measurePage,
  noDesignAnswer,
  skippedAnswer
} from './design-check-tool.mjs'
import {
  GUIDE_DESCRIPTION,
  GUIDE_PARAMETERS,
  guideAnswer,
  guideCall,
  guideUnavailable
} from './guide-tool.mjs'
import {
  bodiesRead,
  canonicalProp,
  carriesLook,
  fileToolPaths,
  LOOK_FILES_MAX,
  lookFilesArgv,
  NOT_READ,
  newRolePins,
  parseLookFiles,
  type RolePin,
  rolePins,
  rolePinsNext,
  throughRoles,
  writtenBySiteCall
} from './role-pins.mjs'
import { isLookFile, shellLookWrites } from './shell-look-write.mjs'

/** The dsh file tools that write a file (`design-drift.mjs` `FILE_WRITERS`). */
const FILE_TOOLS = new Set(['edit', 'write', 'multi_edit', 'multiedit', 'apply_patch'])
import {
  SLOT_WAIT_MS,
  slotPinNotes,
  type TemplateRoles,
  type WornSlot,
  wornSlotReader
} from './ds-slot-worn.mjs'
import {
  callDesignSystemDoor,
  chatRouteRefusal,
  DESIGN_SYSTEM_DESCRIPTION,
  DESIGN_SYSTEM_PARAMETERS,
  designSystemArgs,
  designSystemRequest
} from './chat-design-route.mjs'
import { designRoutesAt } from './chat-design-switch.mjs'
import { captureWishes, mayHoldWish, notesNotice, readNotes, storeDirOf, WISH_KEPT } from './site-notes.mjs'
import {
  COMMENT_KEY,
  COMMENT_PARAMETER,
  commentContent,
  commentMeta,
  takeComment,
  withComment
} from './comment-echo.mjs'
import { isLeaseBusy, waitOutLease } from './lease-wait.mjs'
import { losslessAnswer } from './lossless.mjs'
import { draining } from '../../../../core/tracy-core/src/lease/index.mjs'
import { beginWait, waitOf, whileWaiting } from '../../../../core/tracy-core/src/chat-wait/index.mjs'
import {
  chatLeases,
  chatSessionId,
  type DeployHoldContext,
  heldPrompts,
  NOTICE_ID,
  questionLeaseWaterfall,
  SESSION_ID,
  wireDeployHold
} from './deploy-hold.mjs'
import { cutTimes } from './cut-by-deploy.mjs'
import { mediaDraw } from './draw.mjs'
import {
  EMDASH_DESCRIPTION,
  EMDASH_PARAMETERS,
  emdashRedirectReply,
  emdashReplaceWrote,
  emdashRunsInParallel,
  emdashSiteOf,
  emdashWriteTarget,
  emdashWriteTool,
  mcpToolCall,
  normalizeEmdashShape,
  parseMcpBody,
  readMcpReply,
  templateRefusal
} from './emdash.mjs'
import { createEmdashState, runEmdashTool } from './emdash-call.mjs'
import { EMDASH_READ_TOOLS } from './emdash.mjs'
import {
  applyWriteTarget,
  createStoppedWrites,
  emdashWriteTargetOf,
  STOPPED_WRITES_PLUGIN,
  stoppedWritesNotice,
  writeOutcome
} from './stopped-writes.mjs'
import {
  browserArgv,
  containerLookFile,
  containerMediaFile,
  mediaCopyArgv,
  parseMediaCopy,
  dockerExec,
  hostBrowserExec,
  hostBrowserTarget,
  hostChromeOf,
  looksLikeMissingBinary,
  mcpArgv,
  parseBrowser,
  parseMcpExec,
  parseRedirectsExec,
  parseFormsExec,
  parseProbe,
  probeArgv,
  redirectsArgv,
  formsArgv
} from './exec.mjs'
import { contentFind } from './find.mjs'
import { answerContent, PICTURE_KEY, pageSeen, sessionRoute } from './look.mjs'
import {
  callChangedSite,
  checkReportOf,
  commentPage,
  pickEyes,
  runVisualCheck,
  visualCheckMode,
  writtenAfterCheckReport
} from './visual-check.mjs'
import {
  asksFirst,
  createPageReads,
  createRecordPages,
  earlyPicture,
  earlyView,
  type EarlyPicture,
  HOLD_WINDOW,
  holdForBefore,
  pageReadsOf,
  writeReach
} from './check-pages.mjs'
import { emdashMediaScan, measureReplaced } from './media-emdash.mjs'
import { LOOK_FAILED_NEXT, lookParamsProblem, styleRequest } from './look-style.mjs'
import {
  browseAsSite,
  clampChars,
  contentDoor,
  fetchPageHtml,
  lookNoBrowserAnswer,
  noReaderAnswer,
  pageAnswer,
  pageLookGate,
  parsePage,
  publicOriginFor,
  styleLook,
  styleRead,
  pageText as staticPageTextRoad
} from './page.mjs'
import {
  COMMENT_ITEMS_PLUGIN,
  commentItemsRule,
  latestCustomerWords,
  latestPrompter,
  relayPlan,
  PLAIN_REPLY_PLUGIN,
  plainReplyRule,
  REPLY_LANGUAGE_PLUGIN,
  replyLanguageRule,
  chatMainLanguage,
  lastSiteLookAt,
  SITE_CHANGED_PLUGIN,
  siteChangedNotice
} from './prompter.mjs'
import { COMMENT_FENCED_TOOLS, commentFenceDecision, commentTurnOf } from './comment-fence.mjs'
import { recordedDoorRefusal } from './recorded-door.mjs'
import { shellConsequence, shellRefusal } from './shell-writes.mjs'
import {
  ADDITIONAL_CSS,
  LOOK_CSS_TARGET_KIND,
  lookFiles,
  lookIo,
  lookUndoNote,
  lookWriteTargets,
  revertLook,
  takeLookSnapshot
} from './look-undo.mjs'
import { lookSet } from './look-set.mjs'
import { emdashScriptRoad } from './replace-emdash.mjs'
import { createDryRunMemory, runReplace, TIMING_KEY, timingMeta } from './replace-road.mjs'
import { runPageCreate } from './page-create.mjs'
import {
  applyRequest,
  canonicalTarget,
  EMDASH_ROAD,
  imageSize,
  isCandidateImage,
  lookTarget,
  mediaRoots,
  narrowInspect,
  PAIRING_PROBE_EMAIL,
  pairingVerdict,
  pickViewer,
  canonicalCall,
  planCall,
  publicTarget,
  rankMedia,
  redirectStaysOnSite,
  relayRefusal,
  sitePort,
  viewerFromHello,
  withNext
} from './site.mjs'
import {
  derivedReplaceNext,
  doorTakesLease,
  makesReadsStale,
  readThroughLock,
  runSiteCall
} from './site-call.mjs'
import { createAfterWrite, type SiteCallKind } from './receipt-echo.mjs'
import {
  driftNotice,
  driftOfProbe,
  lookEdit,
  lookWrite,
  measureWithin,
  pageOrigins,
  withDesignDrift
} from './design-drift.mjs'
import { additionalCssSent, withAdditionalCssCheck } from './additional-css-check.mjs'
import {
  CSS_FILE_BUDGET_MS,
  cssFileAnswer,
  cssFilesLoaded,
  servedCss,
  writtenRules,
  type WrittenCss
} from './css-file-loaded.mjs'
import {
  actionRunsInParallel,
  changesSite,
  contractDoorOf,
  derivedContractOf,
  DESIGN_DRIFT_PLUGIN,
  FILES_PLUGIN,
  filesNotice,
  lastFiles,
  lastNotes,
  lastSiteContext,
  lastSiteState,
  lastToday,
  loopNotices,
  buildSizeOf,
  noticeSource,
  NOTES_PLUGIN,
  WISH_PLUGIN,
  SITE_CONTEXT_PLUGIN,
  SITE_STATE_PLUGIN,
  measuredFacts,
  sessionPreset,
  siteBuildOpen,
  siteContext,
  sitePlatform,
  siteStateNotice,
  TODAY_PLUGIN,
  todayNotice,
  toolReach,
  buildChecks,
  CHECK_AGAIN_PLUGIN,
  cameBackNext,
  checkAgainStep,
  findingsCameBack,
  PLAN_FROZEN_NEXT,
  planIssuesNext,
  checkAnswerForAgent,
  changedSinceCheck,
  CHECK_UNCHANGED,
  checkAgainNext,
  contextRoom,
  BUILD_CHECKS
} from './site-context.mjs'
import {
  fullSiteToolDescription,
  platformHiddenTools,
  SURFACE_ACTIONS,
  siteToolDescription,
  siteToolParameters,
  surfaceOf
} from './surface.mjs'
import {
  answerText,
  createToolDeferral,
  DEFERRED_NAMES,
  messageLifts,
  namedDeferredTools,
  resultLifts,
  toolsToDefer
} from './deferred-tools.mjs'
import { installSessionTitle } from './session-title.mjs'
import { orderStepMessages } from './step-order.mjs'
import type {
  AgentCreatedInput,
  AssertionService,
  Config,
  HostContext,
  PreStepDecision,
  PreStepInput,
  SessionsService,
  PostToolDecision,
  PostToolExecution,
  PostToolResult,
  PreToolExecution,
  PreToolDecision,
  ToolResultExecution,
  ToolResultOutcome,
  ToolRun,
  WebRoute
} from './types.js'
import { createTurnLedger } from './turn-header.mjs'
import { isTurnStopped, stoppableSleep, stoppedAnswer } from './turn-stop.mjs'
import { asksAttachment, filesTabPictures, mediaUpload, readChatPicture } from './upload.mjs'
import type { AttachmentReader } from './upload.mjs'
import {
  VIEW_EXEC_MS,
  VIEW_MAX_BUFFER,
  VIEW_PLUGIN,
  agentReadsImages,
  captureView,
  createViewStore,
  hasOwnPictures,
  isCommentMessage,
  readViewReport,
  storePicture,
  viewNotice
} from './view.mjs'
import { readVoiceReport, spokenWords, VOICE_REPLY_PLUGIN, voiceReplyRule } from './voice-reply.mjs'

/** Stable cordis plugin name — must match the row in `cordis.patch.yml` (LAW #2). */
export const name = 'tracy-site-tools'

/** Resolves once every site-notes capture started so far has finished (tests; `captureWishes` never waits itself). */
export { capturesSettled } from './site-notes.mjs'

import { closedBuildRead, CLOSED_BUILD_REFUSAL } from './closed-build.mjs'

/**
 * 🔒 Every `ctx.<name>` must be listed here. cordis throws the moment a property outside `inject`
 * is READ — a missing name is a dead plugin with no log line.
 */
export const inject = ['webServer', 'tools', 'agents']

const PREFIX = '/api/tracy-site-tools'
const HELLO_MAX_BODY = 4 * 1024
/**
 * What one apply call may carry. A page body is tens of kilobytes and `media.upload` sends up to
 * 8 MiB of base64, so `hello`'s 4 KB cap silently TRUNCATED the body and the door read a request
 * with no action at all — measured 08/09 seeding tracy-test-bakery, where every write came back
 * `unknown action ""`. Matched to what `cowork-web`'s own Apply door accepts, so the refusal for an
 * oversized call comes from the place that decides, not from this hop.
 */
const APPLY_MAX_BODY = 12 * 1024 * 1024
// Longer than tracy-web's own wait on the component (170 s), so the refusal a caller reads is the
// door's, with its code — not this hop giving up first. At 60 s a contract inspect of the
// 43-language Business quickstart (42-60 s) failed the `language` stage four times in a row,
// measured 23/09/2026 on `j-h0n2f4`, while the site finished the work behind it.
const APPLY_TIMEOUT_MS = 180_000
/**
 * A demo's `tracy_demo check` reads and shoots every page it reaches and looks at them, minutes on a whole site:
 * measured 24/10/2026 on a WordPress restaurant, two checks ran past 180 s, the agent read
 * `COWORK_WEB_UNREACHABLE` twice and its third check was its last (tracy-web no longer counts a check whose
 * caller left, `client-demo.js`).
 */
const DEMO_CHECK_TIMEOUT_MS = 600_000
/** `POST /changed` (`reportSiteChanged`) is one row on Tracy's side: a slow answer is dropped, not waited on. */
const CHANGED_TIMEOUT_MS = 10_000
/** The guide door re-reads DNS when asked to recheck: as long as a lookup takes, not longer. */
const GUIDE_TIMEOUT_MS = 25_000
/**
 * `GET /changed` (`siteChangedAtOf`) is read while the person's turn waits to start: one column on
 * Tracy's side, so a slow answer means no notice this turn, never a slower turn.
 */
const CHANGED_READ_TIMEOUT_MS = 3_000
/** The EmDash MCP tool an agent's first open calls to warm the site's MCP road: read-only, no argument. */
export const EMDASH_WARM_TOOL = 'schema_list_collections'

/** When the process first tries to release follow-ups a deploy held, then how often while any are. */
const HELD_FIRST_MS = 5_000
const HELD_EVERY_MS = 20_000
/** A page confirms at most its own notice and the kept ones beside it (one per state): a few ids. */
const HELD_SEEN_MAX = 8
/** A viewer not seen for this long is forgotten: a stale cookie would only produce a stale refusal. */
const VIEWER_TTL_MS = 12 * 60 * 60 * 1000
/** How long each hop of the in-container GET redirect-chain probe waits before giving up. */
const LOOK_PROBE_MS = 2_000
/** The exec that carries the probe: each hop's fetch aborts at LOOK_PROBE_MS; this leaves node room to start and resolve a short chain. */
const PROBE_EXEC_MS = LOOK_PROBE_MS + 10_000

const LOOK_TIMEOUT_MS = 30_000
/** How long the EmDash MCP call may take, end to end, inside the container. */
const MCP_TIMEOUT_MS = 120_000
/** The boot probe waits this long and no longer: it is a diagnostic, never something a boot is held on. */
const PAIRING_PROBE_TIMEOUT_MS = 5_000
/** How long a site's platform and seal are trusted for carrying out a call (never for describing one). */
const SITE_FACTS_TTL_MS = 5 * 60_000
/** Sites whose facts are kept at once; a host dsh serves every site on the host. */
const SITE_FACTS_MAX = 500
/**
 * One pre-warm per site in this window (`prewarm`): what the relay keeps from it — the describe
 * probe (`CONTENT_PROBE_TTL_MS`) and the locate head — lives five minutes, so asking sooner buys
 * nothing and only adds reads to a Joomla site that answers them one at a time.
 */
const PREWARM_EVERY_MS = 5 * 60_000

/**
 * 🔒 THE D6′ (c) FALLBACK, ONE FLAG FOR THREE READERS. `false`: Tracy checks a WordPress body write
 * itself (`runSiteCall`'s in-tool check answers `verified`), so the site context and the tool
 * description tell the model never to read a record back after a write. `true` (only if the in-tool
 * check is dropped): the check is off, and both texts ask for ONE `content.get` of a post or template
 * part after its write. The three must agree — a context that forbids the read beside a description
 * that asks for it is two rules for one step.
 */
const WORDPRESS_READ_BACK = false

/**
 * The system sections a customer's agent is better without, and the placement each is registered at
 * (dsh `getSectionOrder`): where dsh's own source checkout is, and how to open the local web GUI —
 * true for someone developing dsh, false for an agent working on a customer's site (1,299 characters,
 * `/opt/dsh` and `127.0.0.1` among them, on every step; plan v2 L1).
 */
const BLANK_SECTIONS = [
  ['harness:source', 'HARNESS_SOURCE'],
  ['app:web-surface', 'WEB_SURFACE']
] as const

/** A site's surface, as `surface.mjs` names it. */
type Surface = keyof typeof SURFACE_ACTIONS

/** What `tracy_site` knows about a site when it carries out a call. */
interface SiteFacts {
  platform: string
  /** null when the seal marker cannot be read: the fence then refuses everything anyway. */
  sealed: boolean | null
  /**
   * Whether the seal's writes go through a bound contract (`contractDoorOf`, #337): a sealed Joomla
   * site, a WordPress site provision bound. null when a sealed WordPress marker could not say.
   */
  contractDoor: boolean | null
  /**
   * An IMPORTED copy whose own plugin derived a contract at import provisioning (`derivedContractOf`,
   * 01/10/2026): open, so its writes keep the record road, and its derived slots take `content.contract`.
   */
  derived?: boolean
  surface: Surface | null
  /** The contract profile the site's marker names (`tracy-business/j6/1.2.0`), for the length advice. */
  contract?: string | null
}

/** A call with no site to read facts from: every action is judged on the global list. */
const NO_SITE_FACTS: SiteFacts = { platform: 'unknown', sealed: null, contractDoor: null, surface: null }

/** The contract id a site's marker names, or null. */
function contractIdOf(sitesRoot: string, label: string): string | null {
  try {
    const marker = JSON.parse(
      readFileSync(path.join(sitesRoot, '.content-contracts', `${label}.json`), 'utf8')
    )
    return typeof marker?.contract === 'string' && marker.contract !== '' ? marker.contract : null
  } catch {
    return null
  }
}

/**
 * Whether a site is sealed, by the fence's own reader. null when it cannot tell (a marker it cannot
 * stat): the guard then refuses every call on the site, and the tool keeps its global description
 * and list rather than fitting a surface to a guess.
 */
function siteSeal(sitesRoot: string, label: string): boolean | null {
  try {
    return hasContentContract(path.join(sitesRoot, label), sitesRoot)
  } catch {
    return null
  }
}

/**
 * Whether a message a step claimed is the CUSTOMER's — `source.kind: 'user'`. The rest a step carries
 * (AGENTS.md, dsh's runtime snapshot, this plugin's own notices) is `plugin`: the machine talking to
 * itself, which ends no turn and answers no question.
 */
function isCustomerMessage(message: unknown): boolean {
  const source = (message as { source?: { kind?: unknown } } | null | undefined)?.source
  return source?.kind === 'user'
}

/** The text of a claimed message: a string content, or its text blocks joined. */
function messageText(message: unknown): string {
  const content = (message as { content?: unknown } | null | undefined)?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      const b = block as { type?: unknown; text?: unknown } | null
      return b?.type === 'text' && typeof b.text === 'string' ? b.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * A tool result's value as the tool returned it: `value`, else the JSON its one text block renders
 * (`ask_user_question` renders `JSON.stringify(value)`), else null.
 */
function answerValue(result: ToolResultOutcome | undefined): unknown {
  if (result?.value !== undefined) return result.value
  const text = result?.content?.[0]?.text
  if (typeof text !== 'string') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * An answer with what Tracy corrected in the call, as `normalized` (≤ 6 notes of ≤ 90 characters) —
 * the same field `runSiteCall` fills for a relayed call, here for the lane's own actions.
 */
function withNotes(answer: unknown, notes: readonly string[] | undefined): unknown {
  if (!notes || notes.length === 0 || !answer || typeof answer !== 'object' || Array.isArray(answer))
    return answer
  const a = answer as Record<string, unknown>
  const own = Array.isArray(a.normalized) ? a.normalized.filter((n) => typeof n === 'string') : []
  const all = [...new Set([...own, ...notes])]
    .slice(0, 6)
    .map((n) => (n.length > 90 ? `${n.slice(0, 89)}…` : n))
  return { ...a, normalized: all }
}

/** The docker-exec transport (#154), or the test's replacement. */
function runExec(
  config: Config,
  input: { argv: readonly string[]; stdin?: string; timeoutMs: number; maxBuffer: number }
): ReturnType<typeof dockerExec> {
  return (config.exec ?? dockerExec)(input)
}

/** The first non-blank line of a docker/stderr blob, for a refusal message. */
function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .map((one) => one.trim())
      .find((one) => one !== '') ?? ''
  )
}

/** Where a page is served from when it redirected to its own public origin ({@link publicOriginOf}). */
interface PublicRoute {
  url: string
  origin: string
  container: string
  via: string
  resolverRule: string
}

/** The probe's answer: the site answered (possibly telling us a canonical port or its public origin), or a refusal. */
type ProbeOutcome =
  | { ok: true; status: number; finalUrl: string; canonicalPort?: number; public?: PublicRoute }
  | { ok: false; result: unknown }

/**
 * Ask the site — from INSIDE its own web container, over loopback — whether it answers, before a
 * browser is launched (#154). A GET that follows the SAME redirect chain a browser would, run by the
 * container's node.
 *
 * 🔒 Four outcomes it keeps, all load-bearing:
 * - A transport failure (the container is not there, the proxy is down, or the site's own port does
 *   not answer) is `SITE_UNREACHABLE` — never a photograph or text of nothing.
 * - A redirect to a DIFFERENT name (or a scheme change to https, which cannot be served off a
 *   plain-http loopback port without disabling TLS) is `REDIRECTED_OFF_SITE`, refused BEFORE the
 *   browser launches. `redirectStaysOnSite` draws that line.
 * - A same-name, other-PORT redirect — WordPress `redirect_canonical` pasting on the public port — is
 *   this site telling us its canonical authority. The probe learned it WITHOUT dialling that port;
 *   `canonicalPort` is handed back so the browser can be pointed at that authority while the
 *   connection stays pinned to this container's loopback service ({@link canonicalTarget}).
 * - A redirect to EXACTLY this site's public origin — `https://<label>.<site domain>`, derived by
 *   {@link publicOriginOf} from the label and the host's own configuration — is this site too: every fleet WordPress
 *   answers its bare loopback with `301 → https://<its public host>/` (measured 24/09/2026 on
 *   `qc-hano-wp-0923-01`, where this refused its own home page). The page is asked for again AS that
 *   origin — public `Host`, `X-Forwarded-Proto`, over the same loopback port ({@link publicTarget}) —
 *   and `public` is handed back so the browser does the same. The origin never comes from the
 *   `Location` header or the site folder; a host not told its site domain keeps the redirect off-site.
 *
 * ⚠ THIS IS THE PRE-BROWSER GATE, NOT THE ONLY ONE. It sees only what a GET sees — server status and
 * `Location` headers. It cannot see a redirect a page performs with JavaScript or a `<meta refresh>`
 * once it runs. The BROWSER is the authority on the final document: {@link browserArgv} reads the
 * actual final URL and refuses anything whose origin is not the one it was pointed at
 * (`REDIRECTED_OFF_SITE`) and any failed navigation (a Chrome error page).
 */
async function inContainerProbe(
  config: Config,
  label: string,
  internalPort: number,
  target: { path: string; url: string; origin: string; container: string },
  publicOrigin: string | null,
  door: string
): Promise<ProbeOutcome> {
  const unreachable = (url: string, why: string) => ({
    ok: false as const,
    result: {
      ok: false,
      code: 'SITE_UNREACHABLE',
      error: `${url} could not be reached in ${target.container} (${why})`,
      next: "This site's own web container is not answering — the page is not broken, it is not reachable from here. Check the site is running, and tell the customer if it is not."
    }
  })
  const offSite = (location: string) => ({
    ok: false as const,
    result: {
      ok: false,
      code: 'REDIRECTED_OFF_SITE',
      error: `${target.path} redirects to ${location || 'another address'}, which is not this site.`,
      next: 'Read a path this site serves itself, or ask the door for the record behind that page with `content.list` / `content.get`.'
    }
  })
  const didNotAnswer = (url: string, error: string) => ({
    ok: false as const,
    result: {
      ok: false,
      code: 'SITE_UNREACHABLE',
      error: `${url} did not answer (${error})`,
      next: "This site's own web container is not answering at that address — the page is not broken, it is not reachable from here. Check the site is running, and tell the customer if it is not."
    }
  })
  const ask = async (url: string, via?: string) => {
    const run = await runExec(config, {
      argv: probeArgv({ container: target.container, url, timeoutMs: LOOK_PROBE_MS, via }),
      timeoutMs: PROBE_EXEC_MS,
      maxBuffer: 1024 * 1024
    })
    // 🔒 NO NODE IN THE CONTAINER IS NOT "THE SITE IS DOWN" (T10 G1). This road runs only where curl
    // is missing too, so the container has no program that can read a page; the site itself may be
    // up and well. docker writes its OCI line on STDOUT (r2: 70 calls answered "check the site is
    // running" for a running site), and `looksLikeMissingBinary` reads it there.
    if (looksLikeMissingBinary(run)) return { missing: true } as const
    // A docker-exec that never ran the probe at all (no such container, proxy down): its own failure,
    // not the site's. The probe script always exits 0 and writes a line, so an empty stdout with a
    // non-zero code is the transport, not the page.
    if (run.spawnError || run.timedOut || (run.code !== 0 && run.stdout.trim() === '')) {
      const why = firstLine(run.stderr) || run.spawnError || (run.timedOut ? 'timed out' : 'exec failed')
      return { transport: why } as const
    }
    return { probe: parseProbe(run.stdout) } as const
  }

  const first = await ask(target.url)
  if ('missing' in first) return { ok: false, result: noReaderAnswer(door) }
  if ('transport' in first) return unreachable(target.url, String(first.transport))
  const probe = first.probe
  if (!probe.ok && probe.redirect !== undefined) {
    // The probe stopped at a host/port/scheme change; the shared helper decides what it means. It
    // NEVER dialled that address — a foreign name or scheme is refused here, unfetched.
    const verdict = redirectStaysOnSite(probe.redirect.from, probe.redirect.location)
    if (!verdict.same) {
      // Not this name: this site only if it is exactly the public origin THIS HOST serves it at.
      const route = publicTarget(
        label,
        target.path,
        internalPort,
        publicOrigin,
        probe.redirect.from,
        probe.redirect.location
      )
      if (!route.ok) return offSite(probe.redirect.location)
      const again = await ask(route.url, route.via)
      if ('missing' in again) return { ok: false, result: noReaderAnswer(door) }
      if ('transport' in again) return unreachable(route.url, String(again.transport))
      // Asked as its public self, the site must now answer the page. A further hop off that origin
      // (another host, port or scheme) is refused like any other; it is never followed.
      if (!again.probe.ok && again.probe.redirect !== undefined) return offSite(again.probe.redirect.location)
      if (!again.probe.ok) return didNotAnswer(route.url, again.probe.error ?? 'no answer')
      return {
        ok: true,
        status: again.probe.status,
        finalUrl: again.probe.finalUrl,
        public: {
          url: route.url,
          origin: route.origin,
          container: route.container,
          via: route.via,
          resolverRule: route.resolverRule
        }
      }
    }
    // Same hostname, a different public port: learn the EFFECTIVE port so the browser can address the
    // site as it wants while the connection stays on this container. Read it by URL semantics, NOT by
    // splitting the authority on a colon: an implicit-80 redirect (WordPress `home_url()` with no
    // port, e.g. `301 → http://127.0.0.1/`) leaves the resolved host with no `:port` at all, so the
    // string split returned `NaN` and refused the page. `URL.port` is '' for a default port, which
    // reads back as 80.
    const canonicalUrl = new URL(probe.redirect.location, probe.redirect.from)
    // An EMPTY port is the scheme's default (80 for the http loopback); an explicit port is taken as
    // written. Defaulting only on the empty string keeps the validity check below meaningful — a
    // redirect to `:0` reads as 0 and is refused, where `Number(port) || 80` would have masked it as 80.
    const canonicalPort = canonicalUrl.port === '' ? 80 : Number(canonicalUrl.port)
    if (!Number.isInteger(canonicalPort) || canonicalPort <= 0 || canonicalPort > 65535)
      return offSite(probe.redirect.location)
    return { ok: true, status: probe.redirect.status, finalUrl: probe.redirect.location, canonicalPort }
  }
  if (!probe.ok) return didNotAnswer(target.url, probe.error ?? 'no answer')
  return { ok: true, status: probe.status, finalUrl: probe.finalUrl }
}

/**
 * This site's public origin (`page.mjs` `publicOriginFor`), from the deployment's site domain —
 * `siteDomain` in the plugin config, else `TRACY_SITE_DOMAIN` in dsh's environment (`deploy/compose.yml`
 * sets it from `SITE_DOMAIN`) — and its scheme and port (`deploymentOrigin`, else
 * `TRACY_DEPLOYMENT_ORIGIN`; the local stand serves `http://<label>.tracy.test:51710`). All of it
 * belongs to whoever runs dsh; nothing in a site's folder or answer moves it.
 */
/**
 * What `runSiteCall` judges a call by: the site's platform and seal, its quickstart contract (a
 * sealed Joomla quickstart), a bound WordPress site's contract door (#337), the surface's actions and
 * whether the door checks a body after writing it. One builder, so the replace job's writes are
 * judged exactly as the model's own.
 */
function siteCallFacts(facts: SiteFacts, actions: readonly string[] | null) {
  return {
    platform: facts.platform,
    sealed: facts.sealed,
    contractBound: facts.sealed === true && facts.platform === 'joomla',
    // A bound WordPress site's contract calls are normalised as Joomla's are (#337).
    contractDoor: facts.contractDoor,
    // …and so are an imported copy's derived slots (01/10/2026).
    derived: facts.derived === true,
    contract: facts.contract ?? null,
    actions,
    verifyBodyWrites: !WORDPRESS_READ_BACK
  }
}

function hostPublicOrigin(config: Config, label: string): string | null {
  return publicOriginFor(label, siteDomainOf(config), deploymentOriginOf(config)).origin
}

/** The deployment's site domain: the plugin config, else dsh's environment. */
function siteDomainOf(config: Config): string | undefined {
  return config.siteDomain ?? process.env.TRACY_SITE_DOMAIN
}

/** The deployment's own origin (its scheme and port): the plugin config, else dsh's environment. */
function deploymentOriginOf(config: Config): string | undefined {
  return config.deploymentOrigin ?? process.env.TRACY_DEPLOYMENT_ORIGIN
}

/**
 * The browser target for a page after the pre-browser probe: the loopback target unchanged, unless the
 * site answered with a canonical-public-PORT redirect, in which case the browser is addressed by the
 * virtual host at that port and given the one host-resolver rule that routes it back onto this
 * container's loopback service (#154) — or with a redirect to its own public origin, in which
 * case the browser is addressed by that origin and serves it from loopback (`via`). Returns null when
 * the canonical port cannot be turned into a target — the caller refuses `REDIRECTED_OFF_SITE` rather
 * than dial an address it cannot pin.
 */
function browserTargetFor(
  label: string,
  probe: { canonicalPort?: number; public?: PublicRoute },
  internalPort: number,
  base: { path: string; url: string; origin: string; container: string }
): { url: string; origin: string; container: string; resolverRule: string; via: string } | null {
  if (probe.public !== undefined) return { ...probe.public }
  if (probe.canonicalPort === undefined)
    return { url: base.url, origin: base.origin, container: base.container, resolverRule: '', via: '' }
  const ct = canonicalTarget(label, base.path, internalPort, probe.canonicalPort)
  if (!ct.ok) return null
  return { url: ct.url, origin: ct.origin, container: ct.container, resolverRule: ct.resolverRule, via: '' }
}

interface Viewer {
  cookie: string
  origin: string
  at: number
}

/** One write's route out of this lane: as the person who typed, or as the viewer holding the page. */
type RelayPlan =
  | { as: 'prompter'; assertion: string; origin: string; sign?: () => string | null }
  | { as: 'viewer'; cookie: string; origin: string }

/**
 * The signature one request carries, signed for THAT request.
 *
 * 🔒 A SIGNATURE IS NEVER REUSED BEYOND THE ONE REQUEST IT WAS SIGNED FOR. The gate's assertion lives
 * 60 s (`vendor/tracy/dsh-passwords/src/gateway.ts` `exp: now + 60`, `apps/tracy-web/src/lib/actor.js`
 * `exp >= now`), while one call can outlive it: the lease wait (`lease-wait.mjs`) sends the same write
 * for up to 100 s. Measured V5S-1 (acceptance v5, 30/09, `e2e-v5/send.md` SEND-v5-new-9, 2/2): the
 * header signed once at the start of the call was refused `401` at second 66, and the customer was
 * told an operator had to reconnect the workspace — a pairing fault that did not exist.
 */
function actorHeader(plan: Extract<RelayPlan, { as: 'prompter' }>): string {
  return plan.sign?.() ?? plan.assertion
}

const bySession = new Map<string, Viewer>()
let latest: Viewer | null = null

/**
 * The site this lane serves, from the env file the lane was created with (`MCP_TRACY_SITE_KEY`).
 * Read lazily and once — same reasoning as `tracy-site-tabs`.
 */
function gatewaySetting(
  name: 'MCP_TRACY_SITE_KEY' | 'MCP_TRACY_SITE_LABEL' | 'MCP_TRACY_ORIGIN' | 'TRACY_BUILD_REASONING_EFFORT'
): string | null {
  const value = process.env[name]?.trim() || null
  if (value === null) {
    const file = process.env.DSH_PASSWORDS_ENV_FILE?.trim()
    if (file) {
      try {
        const m = new RegExp(`^${name}=(.+)$`, 'm').exec(readFileSync(file, 'utf8'))
        return m ? m[1]!.trim().replace(/^["']|["']$/g, '') : null
      } catch {
        return null
      }
    }
  }
  return value
}
let siteKey: string | null | undefined
function laneSiteKey(): string | null {
  return siteKey === undefined ? (siteKey = gatewaySetting('MCP_TRACY_SITE_KEY')) : siteKey
}

/**
 * Whether the request came from this machine. `remoteAddress` is the socket's own reading, not a
 * header, so nothing a caller writes can change it — the reason a loopback check is worth anything.
 */
function isLoopback(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? ''
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readJson(req: IncomingMessage, max: number): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= max) chunks.push(chunk)
    })
    req.on('end', () => {
      if (size > max) return resolve(null)
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'))
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

/**
 * The comment(s) the `tracy_site` call now running answers (`comment-echo.mjs`), held for every Apply
 * call that one call makes — a replace road or a contract apply makes several — without threading it
 * through each of them.
 */
const answeringComment = new AsyncLocalStorage<number | number[]>()

/**
 * The turn's abort signal (`exec.signal`) of the `tracy_site` / `tracy_emdash` call now running, held the
 * same way for every send that call makes (`turn-stop.mjs`, review C2): once the customer pressed Stop, the
 * Apply door, the EmDash MCP road and a lease wait send nothing more. A send already made is never cut.
 */
const turnSignal = new AsyncLocalStorage<AbortSignal>()

/** Whether the customer stopped the turn whose call is running here (`turnSignal`). */
function turnStopped(): boolean {
  return turnSignal.getStore()?.aborted === true
}

type StoppedLedger = ReturnType<typeof createStoppedWrites>
type StoppedCall = ReturnType<StoppedLedger['startCall']>
type StoppedOutcome = 'ok' | 'refused' | 'unknown' | 'not-sent'

/**
 * The writes the running `tracy_site` / `tracy_emdash` call has sent, held beside its turn's signal
 * (`stopped-writes.mjs`, review Q2): kept only when the customer's Stop lands before the call returns,
 * and then reported to tracy-web so the next turn learns what that call wrote.
 */
const callWrites = new AsyncLocalStorage<{ ledger: StoppedLedger; call: StoppedCall }>()

/**
 * Run one tool call's body with its turn's signal held (`turnSignal`) and its writes noted
 * (`callWrites`); as it is when dsh gave no signal.
 */
async function withTurnSignal<T>(
  exec: ToolRun | undefined,
  run: () => Promise<T>,
  ledger: StoppedLedger | null = null
): Promise<T> {
  const signal = exec?.signal
  if (!signal) return run()
  if (ledger === null) return turnSignal.run(signal, run)
  const call = ledger.startCall(signal)
  try {
    return await turnSignal.run(signal, () => callWrites.run({ ledger, call }, run))
  } finally {
    ledger.endCall(call)
  }
}

/**
 * One write of the running call is about to be sent: note it (`stopped-writes.mjs`), and answer the
 * function that records what its answer said. A write outside a call, of no conversation, or whose
 * turn is not known is not kept (there is no turn to tell).
 */
function noteWrite(
  key: string,
  label: string | null,
  sessionId: string | null,
  what: { action: string; target: Record<string, string> | null; via: 'apply' | 'emdash' }
): (outcome: StoppedOutcome) => void {
  // Every write noted here, in a call or not, makes the pictures of its site from before it out of date
  // (`view.mjs` `wrote`): marked as it is sent and again once it answered.
  const site = label ?? (key === '_conversation' ? null : labelOfKey(key))
  if (site !== null) siteWritten(site)
  const held = callWrites.getStore()
  const turnId = turnIdOf(sessionId)
  if (held === undefined || !sessionId || turnId === null)
    return () => {
      if (site !== null) siteWritten(site)
    }
  const finish = held.ledger.begin(held.call, { key, label, sessionId, turnId }, what)
  return (outcome) => {
    if (site !== null) siteWritten(site)
    finish(outcome)
  }
}

/**
 * A write to this site was sent or landed (`noteWrite`, a look write, a shell call, a build): set by
 * `apply` to the view store's `wrote`, so a picture drawn before it is never a turn's "before"
 * (`view.mjs`). A no-op until then.
 */
let siteWritten: (label: string) => void = () => {}

/**
 * The Apply door of the site, called as the viewer. Returns the seat book's answer verbatim — with
 * no `next` attached: the caller decides which facts that sentence may use (`relayRaw` in `apply`,
 * then `withNext` or `runSiteCall`'s own `finish`).
 */
/**
 * Which chat turn a call to tracy-web belongs to (`turn-header.mjs`): set by `apply` from the agent
 * registry it is given; until then, and in a plugin applied without one, every call goes out with no
 * turn ("unknown turn" in the Site changes tab, never a refusal).
 */
let turnIdOf: (sessionId: string | null) => string | null = () => null

/**
 * `x-tracy-turn` beside `x-tracy-session` (plan `tasks/todo-site-changes.md` §6): the ROOT agent's
 * `<session>:<turn>`, so the write lands under the person's turn even when a subagent made it.
 * ⚠ Absent is not an error, for the reason the session header gives: tracy-web and this image ship
 * on different pipelines, and an older tracy-web ignores the header.
 */
function withTurn(headers: Record<string, string>, sessionId: string | null): void {
  const turn = turnIdOf(sessionId)
  if (turn !== null) headers['x-tracy-turn'] = turn
}

async function applyDoor(
  config: Config,
  plan: RelayPlan,
  key: string,
  action: string,
  params: Record<string, unknown>,
  target: string | null,
  label: string | null = null,
  sessionId: string | null = null,
  preset: string | null = null,
  title: string | null = null
): Promise<unknown> {
  // WHOSE NAME THIS WRITE LEAVES IN. `prompter` is the person who typed the message that started
  // this turn, vouched for by a signed assertion the gate mints (`prompter.mjs` says why). `viewer`
  // is the older answer — the cookie of whoever had the page open — kept for a lane with no gate in
  // front, where nobody stamps a prompt and there is nothing else to go on.
  const headers: Record<string, string> =
    plan.as === 'prompter'
      ? // The signature is added per send below, never here: one header for the whole call is V5S-1.
        { 'content-type': 'application/json', accept: 'application/json' }
      : { cookie: plan.cookie, 'content-type': 'application/json', accept: 'application/json' }
  // The session's own site folder: the Apply door holds the call to that site and refuses any other.
  if (label !== null) headers['x-tracy-workspace-label'] = label
  // WHICH CONVERSATION THIS IS. Two chats on one site both reach that door and both write; without a
  // name for the conversation the door cannot tell them apart, and the second write lands on top of
  // the first with nothing said. It is the dsh session id, which is already what decides which
  // viewer a call acts as (`planFor`), so it names the same thing everywhere.
  //
  // ⚠ ABSENT IS NOT AN ERROR HERE. This header ships in the dsh image and the door ships in
  // `apps/tracy-web`, on different pipelines (`docs/references/build-chi-khi-doi.md`), so a lane
  // running an older image simply does not send it — and the door treats that as today's behaviour
  // rather than refusing a customer for a deployment skew nobody can see.
  if (sessionId) headers['x-tracy-session'] = sessionId
  withTurn(headers, sessionId)
  // 🔒 WHICH TOOLSET THIS CONVERSATION IS HOLDING, written down where a QUERY can reach it.
  // `agent-preset/selected` is a line in a session log inside a container, so "is this Joomla site
  // being worked on with the Joomla preset?" could only be answered by unpacking
  // `session.v3.jsonl.zstd` and reading events. A wrong preset is therefore invisible: measured
  // 19/09 and again 20/09, a Joomla site ran a whole customer conversation on `designer-wordpress`
  // and nothing anywhere could be asked about it. It rides the call that already happens rather
  // than a call of its own — the door writes `site_presence` on every apply anyway.
  // ⚠ Absent is not an error, same as the session header above and for the same reason.
  if (preset) headers['x-tracy-preset'] = preset
  // The record's title as Tracy read it from this site (`call-memory.mjs` `titleOf`): the name the
  // "Changed on the site" card and Site changes show instead of `article 4` (council 20/10/2026). A
  // label only — tracy-web never decides which record is written by it — and a header, so a door that
  // does not know it ignores it and the component never sees it.
  if (title) headers['x-tracy-write-title'] = encodeURIComponent(title.slice(0, 120))
  const comment = answeringComment.getStore()
  // A write refused because another conversation holds the site's lease is sent again, bounded, until
  // it goes through (`lease-wait.mjs`, acceptance v4 S09/SEND-v4-new-11). Only a call that names its
  // conversation can meet the lease at all.
  //
  // Each send is signed afresh (`actorHeader`), and a signature the door refuses is signed again and
  // sent ONCE more before the refusal is believed: the door refuses before it acts, so the second send
  // cannot double a write. A fresh signature refused too is the real pairing fault, and only then does
  // `ACTOR_NOT_ACCEPTED` reach the agent with its operator words (V5S-1).
  const sendOnce = () =>
    applyDoorOnce(
      config,
      plan,
      key,
      action,
      params,
      target,
      plan.as === 'prompter' ? { ...headers, 'x-tracy-actor': actorHeader(plan) } : headers,
      comment
    )
  // 🔒 STOP (review C2, `turn-stop.mjs`): a send not made when the customer stopped the turn is not made,
  // the signature's second try included. The fetch itself never carries the turn's signal: a write on the
  // wire runs to its own deadline, because cutting it would not stop the site writing.
  const signal = turnSignal.getStore() ?? null
  // A write sent while the customer may press Stop is noted, so a Stop that cuts this call still tells
  // the next turn what it wrote (`stopped-writes.mjs`, review Q2). Reads are never noted.
  const writes = doorTakesLease(action, params)
  const once = async () => {
    if (signal?.aborted) return stoppedAnswer()
    const finish = writes
      ? noteWrite(key, label, sessionId, { action, target: applyWriteTarget(params), via: 'apply' })
      : null
    const first = await sendOnce()
    const answer =
      plan.as === 'prompter' && plan.sign && isActorRefused(first) && !signal?.aborted
        ? await sendOnce()
        : first
    finish?.(writeOutcome(answer))
    return answer
  }
  const sleep = config.sleep as ((ms: number) => Promise<void>) | undefined
  if (!sessionId) return once()
  // 🔒 THE WAIT LEAVES THE SITE'S FLIGHT (review C1): a Joomla write or a contract call waits in the queue
  // every conversation on this site shares (`call-memory.mjs`); its pauses are spent outside it, so the
  // conversation holding the lease is not queued behind the one waiting for it.
  const seat = flightSeat()
  return waitOutLease(once, {
    sleep,
    signal,
    waiting: () => beginWait(sessionId, 'lease'),
    ...(seat === null ? {} : { leave: seat.leave, rejoin: seat.rejoin })
  })
}

/** Whether the Apply door refused the signature a prompter call carried (as {@link relayRefusal} names it). */
function isActorRefused(answer: unknown): boolean {
  return (
    answer !== null &&
    typeof answer === 'object' &&
    (answer as Record<string, unknown>).code === 'ACTOR_NOT_ACCEPTED'
  )
}

/** One POST to the Apply door with the headers {@link applyDoor} built; the answer as the model reads it. */
async function applyDoorOnce(
  config: Config,
  plan: RelayPlan,
  key: string,
  action: string,
  params: Record<string, unknown>,
  target: string | null,
  headers: Record<string, string>,
  comment: number | number[] | undefined
): Promise<unknown> {
  let res: Response
  try {
    res = await (config.fetch ?? fetch)(`${plan.origin}/api/sites/${encodeURIComponent(key)}/apply`, {
      method: 'POST',
      headers,
      // `target` sits beside `action`, not inside `params`: the Apply door reads it there, and it is
      // omitted entirely when absent so a call with no target keeps the exact shape it always had.
      // `comment` beside `action` too, and only when the call answers one: the door then writes the
      // words a comment points at for whoever commented (`apps/tracy-web/src/sites/comment-answer.js`,
      // Brian 29/09/2026), after checking the number is that person's own sent comment on the site.
      body: JSON.stringify({
        action,
        params,
        ...(target === null ? {} : { target }),
        ...(comment === undefined ? {} : { comment })
      }),
      signal: AbortSignal.timeout(
        action === 'demo.research' && params.operation === 'check' ? DEMO_CHECK_TIMEOUT_MS : APPLY_TIMEOUT_MS
      )
    })
  } catch (error) {
    return {
      ok: false,
      code: 'COWORK_WEB_UNREACHABLE',
      error: error instanceof Error ? error.message : String(error)
    }
  }
  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = { ok: false, code: 'COWORK_WEB_BAD_RESPONSE', status: res.status, detail: text.slice(0, 200) }
  }
  // A refusal is an answer. Carry the HTTP status so the agent can tell 401 (sign in again) from 403
  // (this role may not) from 409 (site not connected), and read the seat book's own `code`.
  if (!res.ok && body && typeof body === 'object' && !('httpStatus' in body)) {
    return relayRefusal(
      plan.as,
      { ok: false, httpStatus: res.status, ...(body as Record<string, unknown>) },
      plan.origin
    )
  }
  return relayRefusal(plan.as, body, plan.origin)
}

/** Pauses before the second and third try of a lease release (`releaseSiteLease`). */
const LEASE_RELEASE_BACKOFF_MS = [1000, 3000]

/**
 * A conversation's turn that wrote through the Apply door ended: give its write lease back
 * (`POST /api/sites/:key/lease/release`, `apps/tracy-web/src/sites/route.js`), so a second
 * conversation does not wait out the door's 90-second silence for a chat that already finished
 * (acceptance v4, 30/09, S09/R09/ED1/ADV3). Sent as the Apply relay is, never awaited by the status
 * listener, bounded by {@link CHANGED_TIMEOUT_MS}. A 404 is an older tracy-web without the door.
 *
 * 🔒 TRIED AGAIN, BUT ONLY WHILE THE LEASE IS STILL THIS TURN'S (16/10/2026). One try left a network
 * error, a 5xx (tracy-web restarting) or a 429 to the door's 90-second silence, and every other
 * conversation on the site waited it out. The door frees by SESSION, not turn, so a late try could
 * free the lease the same conversation's NEXT turn has just taken: `stillOurs` is asked before each
 * try, the first included (review C6, 19/10/2026: it was asked before the retries only), and a new write
 * of that conversation stops the tries.
 *
 * ⚠ THE DOOR FENCES BY SESSION (and the holder's actor), NOT BY TURN OR TOKEN (`releaseWriteLease`,
 * `apps/tracy-web/src/sites/store.js`). A release already on the wire when the next turn's first write
 * renews the lease can still free it; only the door could tell the two turns apart (`x-tracy-turn` is
 * sent here for that).
 */
export async function releaseSiteLease(
  config: Config,
  plan: RelayPlan,
  key: string,
  label: string | null,
  sessionId: string,
  warn: (line: string) => void,
  stillOurs: () => boolean = () => true
): Promise<void> {
  const headers: Record<string, string> =
    plan.as === 'prompter'
      ? { 'x-tracy-actor': actorHeader(plan), accept: 'application/json' }
      : { cookie: plan.cookie, accept: 'application/json' }
  if (label !== null) headers['x-tracy-workspace-label'] = label
  headers['x-tracy-session'] = sessionId
  withTurn(headers, sessionId)
  const sleep =
    (config.sleep as ((ms: number) => Promise<void>) | undefined) ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  let last = ''
  for (let i = 0; i <= LEASE_RELEASE_BACKOFF_MS.length; i += 1) {
    if (i > 0) await sleep(LEASE_RELEASE_BACKOFF_MS[i - 1] ?? 0)
    if (!stillOurs()) return
    try {
      const res = await (config.fetch ?? fetch)(
        `${plan.origin}/api/sites/${encodeURIComponent(key)}/lease/release`,
        {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(CHANGED_TIMEOUT_MS)
        }
      )
      if (res.ok || res.status === 404) return
      last = `Tracy did not take the write lease back (${res.status})`
      // a refusal (401/403/400) says the same thing on every try
      if (res.status < 500 && res.status !== 429) break
    } catch (error) {
      last = `could not give the write lease back: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  warn(`[site-tools] ${label ?? key}: ${last}`)
}

/** The headers every host call to tracy-web about a conversation carries: who, which site folder, which turn. */
function conversationHeaders(
  plan: RelayPlan,
  label: string | null,
  sessionId: string,
  json: boolean
): Record<string, string> {
  const headers: Record<string, string> =
    plan.as === 'prompter'
      ? { 'x-tracy-actor': actorHeader(plan), accept: 'application/json' }
      : { cookie: plan.cookie, accept: 'application/json' }
  if (json) headers['content-type'] = 'application/json'
  if (label !== null) headers['x-tracy-workspace-label'] = label
  headers['x-tracy-session'] = sessionId
  withTurn(headers, sessionId)
  return headers
}

/**
 * Take (or renew) the site's write lease before a write that does not pass the Apply door — an EmDash
 * write (`POST /api/sites/:key/lease/acquire`, review Q1, council 20/10/2026). Answers what the door
 * said in the shape {@link waitOutLease} reads: `{ok: true}`, the door's `SITE_BUSY` refusal, or a
 * refusal of another code (an older tracy-web without the door, Tracy unreachable) that the caller lets
 * through — the write then goes as it did before this door existed. Signed afresh on each send.
 */
export async function acquireSiteLease(
  config: Config,
  plan: RelayPlan,
  key: string,
  label: string | null,
  sessionId: string
): Promise<Record<string, unknown>> {
  try {
    const res = await (config.fetch ?? fetch)(
      `${plan.origin}/api/sites/${encodeURIComponent(key)}/lease/acquire`,
      {
        method: 'POST',
        headers: conversationHeaders(plan, label, sessionId, false),
        signal: AbortSignal.timeout(CHANGED_TIMEOUT_MS)
      }
    )
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.ok) return { ...body, ok: true }
    if (res.status === 409 && body?.code === 'SITE_BUSY') return { ...body, ok: false, httpStatus: 409 }
    return { ok: false, code: 'LEASE_DOOR_UNAVAILABLE', httpStatus: res.status }
  } catch (error) {
    return {
      ok: false,
      code: 'LEASE_DOOR_UNAVAILABLE',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Report writes of a call the customer's Stop cut (`POST /api/sites/:key/turn/stopped`,
 * `stopped-writes.mjs`). Bounded, never thrown: a lost report leaves the next turn as it was before.
 */
async function reportStoppedWrites(
  config: Config,
  plan: RelayPlan,
  who: { key: string; label: string | null; sessionId: string; turnId: string },
  writes: unknown[],
  warn: (line: string) => void
): Promise<void> {
  try {
    const res = await (config.fetch ?? fetch)(
      `${plan.origin}/api/sites/${encodeURIComponent(who.key)}/turn/stopped`,
      {
        method: 'POST',
        headers: conversationHeaders(plan, who.label, who.sessionId, true),
        body: JSON.stringify({ turnId: who.turnId, writes }),
        signal: AbortSignal.timeout(CHANGED_TIMEOUT_MS)
      }
    )
    if (!res.ok && res.status !== 404)
      warn(
        `[site-tools] ${who.label ?? who.key}: Tracy did not keep the stopped turn's writes (${res.status})`
      )
  } catch (error) {
    warn(
      `[site-tools] ${who.label ?? who.key}: could not tell Tracy what the stopped turn wrote: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * The writes of this conversation's earlier stopped turns, taken once (`POST /turn/stopped/take`), or
 * an empty list when Tracy does not answer (an older tracy-web: 404).
 */
async function takeStoppedWrites(
  config: Config,
  plan: RelayPlan,
  label: string,
  sessionId: string,
  turnId: string,
  warn: (line: string) => void
): Promise<{ action: string; target?: Record<string, string> | null; outcome: string }[]> {
  try {
    const res = await (config.fetch ?? fetch)(`${plan.origin}/api/sites/_conversation/turn/stopped/take`, {
      method: 'POST',
      headers: conversationHeaders(plan, label, sessionId, true),
      body: JSON.stringify({ turnId }),
      signal: AbortSignal.timeout(CHANGED_READ_TIMEOUT_MS)
    })
    if (!res.ok) return []
    const body = (await res.json().catch(() => null)) as { writes?: unknown } | null
    return Array.isArray(body?.writes)
      ? (body.writes as unknown[]).filter(
          (w): w is { action: string; outcome: string } =>
            w !== null &&
            typeof w === 'object' &&
            typeof (w as { action?: unknown }).action === 'string' &&
            typeof (w as { outcome?: unknown }).outcome === 'string'
        )
      : []
  } catch (error) {
    warn(
      `[site-tools] ${label}: could not ask Tracy what a stopped turn wrote: ${error instanceof Error ? error.message : String(error)}`
    )
    return []
  }
}

/**
 * Tell Tracy an EmDash write landed on the conversation's site (`POST /api/sites/_conversation/changed`,
 * `apps/tracy-web/src/sites/route.js`): EmDash writes go to the site's own MCP server, never through
 * the Apply door, so without this nothing stamps the site changed and nobody else's Refresh button
 * says "New version ready" (stage 6, contract H1 `siteChangedAt`). Sent as the Apply relay is — the
 * person who typed, the session's own site folder — and NEVER in the write's way: not awaited by the
 * caller, bounded by {@link CHANGED_TIMEOUT_MS}, a failure one log line. The write already happened;
 * a missed stamp only means other viewers learn of it on their next reload.
 */
async function reportSiteChanged(
  config: Config,
  plan: RelayPlan,
  label: string,
  sessionId: string | null,
  tool: string,
  warn: (line: string) => void,
  via: 'file-look' | 'look-revert' | 'look-css' | 'emdash-mcp',
  target: { kind: string; id: string; ids?: string[]; title?: string; state?: string } | null = null
): Promise<void> {
  const headers: Record<string, string> =
    plan.as === 'prompter'
      ? { 'x-tracy-actor': actorHeader(plan), 'content-type': 'application/json', accept: 'application/json' }
      : { cookie: plan.cookie, 'content-type': 'application/json', accept: 'application/json' }
  headers['x-tracy-workspace-label'] = label
  if (sessionId) headers['x-tracy-session'] = sessionId
  withTurn(headers, sessionId)
  try {
    const res = await (config.fetch ?? fetch)(`${plan.origin}/api/sites/_conversation/changed`, {
      method: 'POST',
      headers,
      // `via`: which of this plugin's paths wrote, so the Site changes tab never has to guess it from
      // the tool name (a look edit can be any file tool, `bash` included). An older tracy-web ignores it.
      // `target`: the entry an EmDash write named (`emdashWriteTarget`), for the row's description.
      body: JSON.stringify({ tool, via, ...(target ? { target } : {}) }),
      signal: AbortSignal.timeout(CHANGED_TIMEOUT_MS)
    })
    // ⚠ A 404 is an older tracy-web without this door (the image and the app ship on different
    // pipelines): said once per answer, never retried.
    if (!res.ok) warn(`[site-tools] ${label}: Tracy did not record the EmDash write (${res.status})`)
  } catch (error) {
    warn(
      `[site-tools] ${label}: could not tell Tracy the EmDash write landed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Tell Tracy what the visual check said of one turn (`POST /api/sites/_conversation/turn/check`,
 * `site_turn.visual`, plan `tasks/todo-do-dung-that.md` U2), so usage can say how often a change was
 * seen. Sent as `/changed` is — the person who typed, the session's own site folder — and never in the
 * turn's way: not awaited, bounded by {@link CHANGED_TIMEOUT_MS}, a failure one log line.
 */
async function reportTurnCheck(
  config: Config,
  plan: RelayPlan,
  label: string,
  sessionId: string,
  turnId: string,
  report: { visual: string; note: string | null },
  warn: (line: string) => void
): Promise<void> {
  const headers: Record<string, string> =
    plan.as === 'prompter'
      ? { 'x-tracy-actor': actorHeader(plan), 'content-type': 'application/json', accept: 'application/json' }
      : { cookie: plan.cookie, 'content-type': 'application/json', accept: 'application/json' }
  headers['x-tracy-workspace-label'] = label
  headers['x-tracy-session'] = sessionId
  try {
    const res = await (config.fetch ?? fetch)(`${plan.origin}/api/sites/_conversation/turn/check`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ turnId, ...report }),
      signal: AbortSignal.timeout(CHANGED_TIMEOUT_MS)
    })
    // ⚠ A 404 is an older tracy-web without this door, or a turn it never opened: said, not retried.
    if (!res.ok)
      warn(`[site-tools] ${label}: Tracy did not keep the visual check of ${turnId} (${res.status})`)
  } catch (error) {
    warn(
      `[site-tools] ${label}: could not tell Tracy the visual check of ${turnId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * When the conversation's site last changed (`GET /api/sites/_conversation/changed`,
 * `apps/tracy-web/src/sites/route.js`): the `siteChangedAt` every Refresh button reads, and whether
 * that last write was this conversation's own (`byThisConversation`, e2e v8 V8-1; undefined from an
 * older tracy-web), for the site-changed notice (`prompter.mjs` `siteChangedNotice`, V7S-1). Asked as
 * the Apply relay asks — the person who typed, the session's own site folder. Null on any failure, a
 * 404 from an older tracy-web included: the turn then goes on without the notice, as it did before.
 */
async function siteChangedAtOf(
  config: Config,
  plan: RelayPlan,
  label: string,
  sessionId: string,
  warn: (line: string) => void
): Promise<{ changedAt: string; byThisConversation?: boolean } | null> {
  const headers: Record<string, string> =
    plan.as === 'prompter'
      ? { 'x-tracy-actor': actorHeader(plan), accept: 'application/json' }
      : { cookie: plan.cookie, accept: 'application/json' }
  headers['x-tracy-workspace-label'] = label
  headers['x-tracy-session'] = sessionId
  withTurn(headers, sessionId)
  try {
    const res = await (config.fetch ?? fetch)(`${plan.origin}/api/sites/_conversation/changed`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(CHANGED_READ_TIMEOUT_MS)
    })
    if (!res.ok) return null
    const body = (await res.json().catch(() => null)) as {
      changedAt?: unknown
      byThisConversation?: unknown
    } | null
    if (typeof body?.changedAt !== 'string') return null
    return typeof body.byThisConversation === 'boolean'
      ? { changedAt: body.changedAt, byThisConversation: body.byThisConversation }
      : { changedAt: body.changedAt }
  } catch (error) {
    warn(
      `[site-tools] ${label}: could not ask Tracy when the site last changed: ${error instanceof Error ? error.message : String(error)}`
    )
    return null
  }
}

/**
 * Whether a relayed call may change what the site's snapshots and content revisions describe: every
 * action but the relay's reads and a library upload, and a `content.contract` only when its operation
 * writes (`makesReadsStale`, `site-call.mjs` — the ONE reading of this, shared with `runSiteCall`).
 */
function relayWrites(action: string, params: Record<string, unknown>): boolean {
  return makesReadsStale(action, params)
}

/** The site a conversation stands in, by its workspace; null outside any site's workspace. */
function sessionSite(agent: { session?: { header?: { cwd?: unknown } } } | undefined): string | null {
  const lane = laneSiteKey()
  if (lane !== null) return labelOfKey(lane)
  try {
    return siteOf(String(agent?.session?.header?.cwd ?? ''), resolveSitesRoot(undefined)).label
  } catch {
    return null
  }
}

/**
 * The site whose mount a request came through: tracy-web sets `x-forwarded-prefix` to `/<siteKey>`
 * on every request it forwards (and deletes one a browser wrote). `/new` is the creation workspace,
 * no site; undefined means the page talks to dsh without tracy-web in front (a local profile).
 */
function mountSite(req: IncomingMessage): string | null | undefined {
  const prefix = req.headers['x-forwarded-prefix']
  if (typeof prefix !== 'string' || prefix === '') return undefined
  const m = /^\/([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)\/?$/i.exec(prefix)
  return m ? labelOfKey(m[1]!.toLowerCase()) : null
}

/** The site label a site key names (`<label>.<zone>`), for a call that carries no workspace label. */
function labelOfKey(key: string): string {
  return key.split('.')[0] ?? key
}

/** Where the site's files are: `.webroot` beside dsh when it is a directory, else where dsh stands. */
async function webrootOf(config: Config, siteFolder: string | null): Promise<string> {
  if (config.webroot) return config.webroot
  const start = siteFolder ?? path.resolve('.')
  const nested = path.join(start, '.webroot')
  try {
    return (await fs.stat(nested)).isDirectory() ? nested : start
  } catch {
    return start
  }
}

/** The largest theme file the body guard measures; a template part is a few kilobytes. */
const THEME_FILE_MAX_BYTES = 1_048_576

/**
 * One theme file of a site's webroot, for the WordPress body guard (`site-call.mjs` `themePartOf`):
 * its text; null when the file is absent from a theme folder that exists (`wp-content/themes/<name>`);
 * undefined when that cannot be told.
 *
 * 🔒 MEASURED, NEVER ANSWERED, AND NEVER OUTSIDE THE WEBROOT. The guard uses the length of a part and
 * the `Template:` line of a `style.css`; no byte of either goes to the model. The webroot is www-data's
 * to write, so a planted symlink could point anywhere on the host: the real path must stay inside the
 * site's own real webroot, and only a regular file ≤ 1 MiB is read. "Absent" is said only when the
 * theme's own folder is there — a webroot that is not mounted is "cannot tell", which the guard
 * refuses on, never "no such part", which it would let through as a create.
 */
async function webrootFileText(webroot: string, file: string): Promise<string | null | undefined> {
  if (!/^wp-content\/themes\/[^/]+\/[^/]+(\/[^/]+)?$/.test(file) || file.split('/').includes('..'))
    return undefined
  let base: string
  try {
    base = await fs.realpath(webroot)
  } catch {
    return undefined
  }
  try {
    const full = await fs.realpath(path.join(base, file))
    if (!full.startsWith(`${base}${path.sep}`)) return undefined
    const stat = await fs.stat(full)
    if (!stat.isFile() || stat.size > THEME_FILE_MAX_BYTES) return undefined
    return await fs.readFile(full, 'utf8')
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code
    if (code !== 'ENOENT' && code !== 'ENOTDIR') return undefined
    try {
      const theme = await fs.realpath(path.join(base, ...file.split('/').slice(0, 3)))
      if (!theme.startsWith(`${base}${path.sep}`)) return undefined
      return (await fs.stat(theme)).isDirectory() ? null : undefined
    } catch {
      return undefined
    }
  }
}

/**
 * Which CMS this site runs, read off the disk.
 *
 * 🔒 EMDASH IS RECOGNISED BY WHAT IS *NOT* THERE, so it has to be asked LAST. WordPress and
 * Joomla each drop a file no other CMS has (`wp-config.php`, `administrator/index.php`) inside a
 * document root. EmDash has no document root at all — its provision script sets
 * `PLATFORM_NEEDS_WEBROOT=0` and leaves exactly two things on the host: `data/data.db` and
 * `uploads/`, with the Astro app inside the container image. Testing for `data/data.db` first
 * would be a weak marker (any SQLite site could carry one); testing it after the two positive
 * markers makes it a safe fallback rather than a guess.
 */
async function detectPlatform(root: string): Promise<'joomla' | 'wordpress' | 'emdash' | 'unknown'> {
  try {
    await fs.access(path.join(root, 'wp-config.php'))
    return 'wordpress'
  } catch {
    /* not WordPress */
  }
  try {
    await fs.access(path.join(root, 'administrator', 'index.php'))
    return 'joomla'
  } catch {
    /* not Joomla */
  }
  try {
    await fs.access(path.join(root, 'data', 'data.db'))
    return 'emdash'
  } catch {
    return 'unknown'
  }
}

/** Largest images under the platform's media roots, with dimensions from the file header. */
/**
 * Whether a site runs EmDash: the template handoff leaves `template/artifact.json` in the site
 * folder with `cms.name`, and no PHP site carries that file. Read on every call — a site is
 * built once and its folder does not change CMS, but a cache here would outlive a rebuild.
 */
async function isEmdashSite(config: Config, label: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(
      path.join(resolveSitesRoot(undefined), label, 'template', 'artifact.json'),
      'utf8'
    )
    const parsed = JSON.parse(raw) as { cms?: { name?: unknown } }
    if (parsed?.cms?.name === 'emdash') return true
  } catch {
    // no handoff file: ask the container below
  }
  // The handoff file is written at the END of a provision; a site whose provision stopped early
  // (measured 16/09) has none, yet runs EmDash all the same. The image says what it is:
  // `io.tracy.cms` is a label on every template image, and the docker proxy allows inspecting
  // this site's own container. Read once per label — a site does not change CMS.
  const known = cmsOf.get(label)
  if (known !== undefined) return known === 'emdash'
  const inspect =
    config.emdash?.cms ??
    ((c: string) =>
      new Promise<string>((resolve) => {
        const dockerHost = process.env.TRACY_DOCKER_HOST?.trim()
        const argv = ['inspect', '--format', '{{ index .Config.Labels "io.tracy.cms" }}', c]
        const [cmd, args] = dockerHost
          ? ['env', [`DOCKER_HOST=${dockerHost}`, 'docker', ...argv]]
          : ['docker', argv]
        execFile(cmd, args as string[], { timeout: 15_000 }, (error, stdout) =>
          resolve(error ? '' : String(stdout).trim())
        )
      }))
  const cms = await inspect(`${label}-web-1`)
  if (cms !== '') cmsOf.set(label, cms)
  return cms === 'emdash'
}
const cmsOf = new Map<string, string>()

/**
 * One MCP request INSIDE the site's own container (#154): `{ok:true, result}` — the MCP result
 * object — or the host's refusal, `SITE_UNREACHABLE`, `NO_TOKEN`, `LEGACY_STRUCTURE_CODE` (the template's own
 * guard, ADR 0020), `SITE_REFUSED` (with `httpStatus`, which E2.4's one read retry reads), `NOT_MCP`
 * or `TOOL_FAILED`. Every rule about WHICH call to make
 * lives in `emdash-call.mjs`; this is only the transport.
 *
 * 🔒 The agent token is read THERE, from the root-only mount, by the script (#155) — it is never
 * fetched into dsh, put on argv/env, or returned here. dsh sends only the JSON-RPC body (on stdin) and
 * receives only the site's answer, with any reflected token already redacted in-container.
 */
async function emdashMcp(
  config: Config,
  site: { label: string; container: string; origin: string },
  request: object
): Promise<
  { ok: true; result: unknown } | ({ ok: false; code: string; error: string } & Record<string, unknown>)
> {
  // Stop (review C2, `turn-stop.mjs`): a request not sent yet is not sent; one already running in the
  // container is left to finish, since killing the exec would not stop the site writing.
  if (turnStopped()) return stoppedAnswer() as { ok: false; code: string; error: string }
  const run = await runExec(config, {
    argv: mcpArgv({ container: site.container }),
    stdin: JSON.stringify(request),
    timeoutMs: MCP_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024
  })
  // A docker-exec that never ran the script (no such container, proxy down, node missing) — the script
  // itself always exits 0 with a line, so an empty stdout with a non-zero code is the transport's
  // failure, not the site's.
  if (run.spawnError || run.timedOut || (run.code !== 0 && run.stdout.trim() === ''))
    return {
      ok: false,
      code: 'SITE_UNREACHABLE',
      error: `${site.label} could not be reached in ${site.container} (${firstLine(run.stderr) || run.spawnError || (run.timedOut ? 'timed out' : 'exec failed')})`
    }
  const exec = parseMcpExec(run.stdout)
  if (!exec.ok) {
    if (exec.kind === 'no-token')
      // 🔒 A BARE CODE IS NOT A STOPPING POINT, IT IS A DETOUR — CLAUDE.md §6's `refusal-next`
      // class, measured 20/09/2026 on `demoemdash1`: `NO_TOKEN` with nothing after it sent one
      // agent through ~25 steps of `data.db`, `_emdash_api_tokens`, `_options` and the `ec_*`
      // schema — 3m52s, 641K tokens — before it concluded it was blocked. It stopped in the
      // right place by luck; the next door along that road is hand-editing the site's database,
      // which is the one thing this tool exists to keep an agent away from.
      //
      // `label` travels WITH the code so `refusalNext` (`site.mjs`) can name the custody
      // procedure for THIS site — the token mount migration, then the staged recovery, NOT
      // `mint-agent-token.sh`, which replaces the inode this container is already holding —
      // the same way `TOOLSET_NOT_GRANTED` carries its `toolset`. Building the
      // sentence here instead would put a second author on the next steps.
      // ⚠ The `refusal-next` gate reads the Apply door of `apps/tracy-web` only, so nothing
      // mechanical holds this line — the label is here because the class was measured.
      // The label is the TRUSTED one `emdashSiteOf` settled on, never a requested siteKey.
      return {
        ok: false,
        code: 'NO_TOKEN',
        label: site.label,
        error: `${site.label} has no readable agent token in its container (${exec.error}).`
      }
    return {
      ok: false,
      code: 'SITE_UNREACHABLE',
      error: `${site.origin} (in ${site.container}): ${exec.error}`
    }
  }
  const body = exec.body
  // An older template's own guard answered (ADR 0022 removed it): read back from its 403 with the
  // road that works — never a bare SITE_REFUSED the agent has to interpret.
  const guarded = templateRefusal(exec.status, body)
  if (guarded !== null) return guarded
  if (exec.status < 200 || exec.status >= 300)
    return {
      ok: false,
      code: 'SITE_REFUSED',
      httpStatus: exec.status,
      error: `${site.label} (EmDash MCP) → HTTP ${String(exec.status)}: ${body.slice(0, 300)}`
    }
  const parsed = parseMcpBody(body)
  if (!parsed.ok) return { ok: false, code: 'NOT_MCP', error: parsed.error }
  const reply = readMcpReply(parsed.value)
  if (!reply.ok) return { ok: false, code: 'TOOL_FAILED', error: reply.error }
  return { ok: true, result: reply.result }
}

/**
 * One REST call to this site's redirect store, INSIDE its own container — the same transport as
 * `emdashMcp` (token read there, never on argv or here), answering in the same shape.
 */
async function emdashRedirects(
  config: Config,
  site: { label: string; container: string },
  request: { method: 'GET' | 'POST' | 'DELETE'; path: string; body: string }
): Promise<
  { ok: true; result: unknown } | ({ ok: false; code: string; error: string } & Record<string, unknown>)
> {
  // Stop: as `emdashMcp`.
  if (turnStopped()) return stoppedAnswer() as { ok: false; code: string; error: string }
  const run = await runExec(config, {
    argv: redirectsArgv({ container: site.container, method: request.method, path: request.path }),
    stdin: request.body,
    timeoutMs: MCP_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024
  })
  if (run.spawnError || run.timedOut || (run.code !== 0 && run.stdout.trim() === ''))
    return {
      ok: false,
      code: 'SITE_UNREACHABLE',
      error: `${site.label} could not be reached in ${site.container} (${firstLine(run.stderr) || run.spawnError || (run.timedOut ? 'timed out' : 'exec failed')})`
    }
  const exec = parseRedirectsExec(run.stdout)
  if (!exec.ok) {
    if (exec.kind === 'no-token')
      return {
        ok: false,
        code: 'NO_TOKEN',
        label: site.label,
        error: `${site.label} has no readable agent token in its container (${exec.error}).`
      }
    return {
      ok: false,
      code: 'SITE_UNREACHABLE',
      error: `${site.label} (redirects, in ${site.container}): ${exec.error}`
    }
  }
  return emdashRedirectReply(exec.status, exec.body)
}

/**
 * One call to this site's forms plugin (`forms/list`, `forms/update`), INSIDE its own container — the transport of
 * `emdashRedirects`, answering in the same shape.
 */
async function emdashForms(
  config: Config,
  site: { label: string; container: string },
  request: { route: 'forms/list' | 'forms/update'; body: string }
): Promise<
  { ok: true; result: unknown } | ({ ok: false; code: string; error: string } & Record<string, unknown>)
> {
  if (turnStopped()) return stoppedAnswer() as { ok: false; code: string; error: string }
  const run = await runExec(config, {
    argv: formsArgv({ container: site.container, route: request.route }),
    stdin: request.body,
    timeoutMs: MCP_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024
  })
  if (run.spawnError || run.timedOut || (run.code !== 0 && run.stdout.trim() === ''))
    return {
      ok: false,
      code: 'SITE_UNREACHABLE',
      error: `${site.label} could not be reached in ${site.container} (${firstLine(run.stderr) || run.spawnError || (run.timedOut ? 'timed out' : 'exec failed')})`
    }
  const exec = parseFormsExec(run.stdout)
  if (!exec.ok) {
    if (exec.kind === 'no-token')
      return {
        ok: false,
        code: 'NO_TOKEN',
        label: site.label,
        error: `${site.label} has no readable agent token in its container (${exec.error}).`
      }
    return {
      ok: false,
      code: 'SITE_UNREACHABLE',
      error: `${site.label} (forms, in ${site.container}): ${exec.error}`
    }
  }
  return emdashRedirectReply(exec.status, exec.body, 'FORMS_ERROR')
}

/**
 * The site's template handoff (`template/artifact.json`), whose `locales.default` is what an EmDash
 * read falls back to when the site's served languages cannot be read (D11). Null when absent or unreadable.
 */
async function readArtifact(sitesRoot: string, label: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(
      await fs.readFile(path.join(sitesRoot, label, 'template', 'artifact.json'), 'utf8')
    )
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

// 🔒 NO TOKEN CACHE, AND NO TOKEN IN dsh AT ALL (#155). The agent token is read inside the site's
// own container by the MCP script, from a root-owned read-only mount; nothing here ever holds it,
// so there is no value to cache, to log, or to leak back through a tool result.
async function mediaScan(
  config: Config,
  key: string | null,
  limit: number,
  siteFolder: string | null
): Promise<unknown> {
  const root = await webrootOf(config, siteFolder)
  const platform = await detectPlatform(root)
  const found: { path: string; bytes: number }[] = []
  const MAX_FILES = 20_000
  let seen = 0
  const walk = async (dir: string, rel: string): Promise<void> => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (seen >= MAX_FILES) return
      const relPath = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        await walk(path.join(dir, e.name), relPath)
      } else if (e.isFile()) {
        seen += 1
        if (!isCandidateImage(relPath)) continue
        try {
          const st = await fs.stat(path.join(dir, e.name))
          found.push({ path: relPath, bytes: st.size })
        } catch {
          /* unreadable file: not a candidate */
        }
      }
    }
  }
  // 🔒 NEVER OUTSIDE THE WEBROOT (survey 08/10/2026), as `webrootFileText` above: the walk follows
  // no link below a media root, but the roots themselves were opened by name, so an `images` or
  // `wp-content/uploads` that www-data turned into a link to `/site/<another site>/…` listed that
  // customer's pictures. A root whose real path leaves the real webroot is not this site's media.
  const base = await fs.realpath(root).catch(() => null)
  if (base !== null) {
    for (const r of mediaRoots(platform)) {
      const dir = await fs.realpath(path.join(base, r)).catch(() => null)
      if (dir !== null && dir.startsWith(`${base}${path.sep}`)) await walk(dir, r)
    }
  }
  const top = rankMedia(found, limit)
  const media = []
  for (const m of top) {
    let size: { width: number; height: number } | null = null
    try {
      const fh = await fs.open(path.join(base ?? root, m.path), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
      // The descriptor's own path, where the kernel offers it: a folder swapped for a link after the
      // walk read it real cannot turn this open into another site's file (survey 08/10/2026).
      const opened = await fs.realpath(`/proc/self/fd/${fh.fd}`).catch(() => null)
      if (base !== null && opened !== null && !opened.startsWith(`${base}${path.sep}`)) {
        await fh.close()
        throw new Error('outside the webroot')
      }
      try {
        const buf = new Uint8Array(65_536)
        const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
        size = imageSize(buf.subarray(0, bytesRead))
      } finally {
        await fh.close()
      }
    } catch {
      size = null
    }
    media.push({
      path: m.path,
      url: key ? `https://${key}/${m.path}` : null,
      bytes: m.bytes,
      width: size?.width ?? null,
      height: size?.height ?? null
    })
  }
  // dsh materialises a tool result as lossless JSON and refuses a value that would change under
  // JSON round-trip — an `undefined` property is exactly that. Measured 05/09 on lucaswp: every
  // `media.scan` came back `value is not lossless JSON`, three calls wasted. Omit the key instead.
  const out: Record<string, unknown> = { ok: true, platform, scanned: seen, media }
  if (platform === 'unknown') out.root = root
  return out
}

/**
 * Which port this site's own web container answers on — asked the way the rest of this plugin asks
 * what a site runs, not by a second, weaker test.
 *
 * 🔒 `detectPlatform` ALONE CANNOT SEE AN EMDASH SITE, AND ANSWERING 80 FOR ONE IS A DEAD END.
 * It reads the webroot for `wp-config.php`, `administrator/index.php`, then `data/data.db` — but an
 * EmDash site keeps its database under the PRIVATE root, and `<sitesRoot>/<label>/.webroot/data/`
 * is empty. So it answers `unknown`, `sitePort` answers 80, and the probe knocks on a port nothing
 * listens on while the site is up and well on 4321.
 *
 * What the agent then reads is worse than the failure: `SITE_UNREACHABLE`, whose next step says the
 * container is not answering and to check the site is running. It IS running. Measured 20/09/2026
 * on `site-4x82yk`: from `tracy-dsh`, port 80 answered 000 and port 4321 answered 200 — twice in
 * one conversation, and both times the agent abandoned `page.text` for the shell.
 *
 * `isEmdashSite` is the answer this file already trusts for `tracy_emdash`: the provision handoff
 * file first, then the container's own `io.tracy.cms` label, cached per label. Asking it here means
 * one source of truth for "what is this site" instead of two that disagree.
 */
async function sitePortFor(config: Config, sitesRoot: string, label: string): Promise<number> {
  if (await isEmdashSite(config, label)) return sitePort('emdash')
  return sitePort(await detectPlatform(`${sitesRoot}/${label}/.webroot`))
}

/**
 * `page.text`: the words a visitor actually reads on one page of this site.
 *
 * 🔒 THIS IS THE CHEAPEST CALL IN THE TOOL AND IT REPLACES THE MOST EXPENSIVE HABIT. Measured 17/09
 * across four sessions, about fifteen bash calls went on rebuilding it: `curl` the page, then strip
 * the tags — with a PHP script the agent wrote from scratch, twice in one turn, because nothing
 * carries between bash calls. The per-turn reminder did name a door for this, `browser_read`, and no
 * plugin in this repo or in dsh registers that name; it never appears in a real session. So the
 * instruction sent the agent nowhere and `curl` was what was left.
 *
 * 🔒 ONE STATIC GET FIRST, THE BROWSER ONLY WHEN THE PAGE NEEDS IT (`page.mjs`, plan D2/D4). The read
 * is one pinned `curl` from inside the site's own container, starting on its loopback service and
 * following only this site's own redirects — the page as the server sends it, in well under a second.
 * The browser draws only a page the server left thin (a JavaScript shell) or in a foreign charset.
 * Measured r2: the stand's WordPress and Joomla images carry no node and no chromium, so every
 * browser read there failed; every image carries curl. A container without curl takes the pre-F2
 * road (`renderedPageText`), unchanged but for its two exits below.
 */
async function pageText(
  config: Config,
  sitesRoot: string,
  label: string | null,
  params: Record<string, unknown>,
  facts: { platform?: string; sealed?: boolean | null } = {}
): Promise<unknown> {
  if (label === null)
    return {
      ok: false,
      code: 'NO_SITE_IN_CONVERSATION',
      error: 'This lane names no site, so there is no page to read.'
    }
  // The port is asked ONCE and kept: a canonical redirect is judged against the same number.
  const internalPort = await sitePortFor(config, sitesRoot, label)
  // Every refusal's next names the read THIS surface has for the same words (T10 G1).
  const door = contentDoor(facts)
  return staticPageTextRoad({
    run: (input: { argv: readonly string[]; stdin?: string; timeoutMs: number; maxBuffer: number }) =>
      runExec(config, input),
    label,
    internalPort,
    publicOrigin: hostPublicOrigin(config, label),
    params,
    door,
    legacy: (path: string, cap: number | undefined) =>
      renderedPageText(config, label, internalPort, path, params, cap, door)
  })
}

/**
 * The pre-F2 road of `page.text`, for a container with no curl: the in-container node probe, then the
 * browser, which is the authority on the final document.
 *
 * First the pre-browser probe: a GET that follows the server redirect chain and refuses one that
 * leaves this site (a different name or scheme). A same-name/other-port canonical redirect is not a
 * refusal — the browser is addressed by that authority while the connection stays pinned to this
 * container's loopback service. Then the browser, which reads the actual final URL and refuses a
 * foreign origin or a failed navigation, so headless Chrome's own error page, or another host's
 * document reached by a JS/meta redirect, can never come back as this site's TEXT.
 *
 * 🔒 Whether the browser is even in the container is NOT asked with `existsSync` here — the browser
 * lives in the site's image, not on dsh, so a host check would answer for the wrong machine (#154).
 * The browser exec reports a missing chromium as `NO_BROWSER` from the script itself (or 127 from the
 * exec, caught by `looksLikeMissingBinary`).
 */
async function renderedPageText(
  config: Config,
  label: string,
  internalPort: number,
  path: string,
  params: Record<string, unknown>,
  cap: number | undefined,
  door: string
): Promise<unknown> {
  const target = lookTarget(label, path, internalPort)
  if (!target.ok) return { ok: false, code: 'BAD_PATH', error: target.error }
  const publicOrigin = hostPublicOrigin(config, label)
  const probe = await inContainerProbe(config, label, internalPort, target, publicOrigin, door)
  if (!probe.ok) return probe.result
  const btarget = browserTargetFor(label, probe, internalPort, target)
  if (btarget === null)
    return {
      ok: false,
      code: 'REDIRECTED_OFF_SITE',
      error: `${target.path} asks to be served on a port this site does not expose here.`,
      next: `Read a path this site serves itself; the words behind that page: ${door}.`
    }
  const { res: run } = await browseAsSite({
    target: btarget,
    publicOrigin,
    launch: (t) =>
      runExec(config, {
        argv: browserArgv({
          container: t.container,
          mode: 'dom',
          url: t.url,
          origin: t.origin,
          resolverRule: t.resolverRule,
          via: t.via
        }),
        timeoutMs: LOOK_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024
      })
  })
  const browser = parseBrowser(run.stdout)
  if (looksLikeMissingBinary(run) || (!browser.ok && browser.kind === 'no-browser'))
    return {
      ok: false,
      code: 'NO_BROWSER',
      error: "this site's container has no curl and no browser, so the page cannot be read here",
      // 🔒 NEVER NAME `curl`, AND NEVER NAME `page.look` — the picture needs the SAME browser this
      // one lacks, so it would fail identically, and `curl` is what this container just proved it
      // does not have. A content-contract quickstart keeps its shell since ADR 0022 (only a direct
      // database write is refused, `content-contract.mjs`), but the writer and seo-geo roles carry no
      // bash at all, so the truthful next is the content door of THIS surface, which needs neither.
      next: `Read the words through ${door}; page.look needs the same browser.`
    }
  if (!browser.ok && browser.kind === 'offsite')
    return {
      ok: false,
      code: 'REDIRECTED_OFF_SITE',
      error: `${target.path} left this site for ${browser.error}, so its text is not this site's.`,
      next: `Read a path this site serves itself; the words behind that page: ${door}.`
    }
  // 🔒 A "TRACY_BROWSER OK" LINE IS A WHOLE DOCUMENT ONLY WHEN THE EXEC ITSELF FINISHED CLEANLY. The
  // script exits 0 only after its final write has flushed; a stalled flush (a large DOM the pipe could
  // not drain) exits NON-ZERO, and — the hole this closes — a stdout past `maxBuffer` (16 MiB) surfaces
  // as `code: null` + a `spawnError` with the stdout TRUNCATED, so `parseBrowser` still reads the
  // `TRACY_BROWSER OK …` prefix off half a page. Neither `typeof run.code === 'number'` nor `!browser.ok`
  // catches that null-code truncation. So success REQUIRES a clean exit: code 0, no spawn error, no
  // timeout. (NO_BROWSER / OFFSITE were returned above; a failed navigation is `!browser.ok` kind `nav`.)
  const cleanExit = run.code === 0 && !run.spawnError && !run.timedOut
  if (!browser.ok || !cleanExit) {
    return {
      ok: false,
      code: 'READ_FAILED',
      detail:
        (!browser.ok && browser.error) ||
        run.spawnError ||
        (run.timedOut
          ? 'the browser ran out of time'
          : run.code !== 0
            ? 'the document was cut off before it finished'
            : 'the browser wrote no document'),
      next: `No whole document came back: try once more, or read ${door}.`
    }
  }
  // 🔒 THE DOM IS TAMED BEFORE IT IS READ (`parsePage`): `readablePage`'s regexes scan quadratically
  // on markup left unclosed, so a crafted page could hold the tool for seconds. Then the SAME answer
  // shape as the static road (`pageAnswer`: T8's match, outline and caps).
  const parsed = parsePage(browser.dom, target.path, door)
  if (!parsed.ok) return parsed.answer
  // `raw`: `head:true` reads JSON-LD out of the <script> bodies taming empties (`page-head.mjs`).
  return pageAnswer(parsed.page, {
    url: target.url,
    path: target.path,
    params,
    cap,
    html: parsed.html,
    raw: browser.dom
  })
}

/**
 * `page.look`: a screenshot of one page of this site, taken from inside the fleet at the site's own
 * web container — the public address is behind the seat door, which a headless browser cannot pass.
 * The picture lands in the site folder's `docs/agents/`, the one place `read_image` may open even on
 * a quickstart whose content contract fences file tools to that directory.
 *
 * WHO THEN LOOKS AT IT is `look.mjs`'s question, not this one's: a session whose model accepts no
 * images cannot open the file, so the answer carries a description read out of the picture by a
 * model that can; one whose model reads images gets the picture itself in the answer (W4). The file
 * is saved either way — it is what the agent cites to the customer.
 *
 * WITH `style` (suite v6 #3) the same browser, reached through the same gate, reads one element's
 * computed values and the var(--token) chain behind each instead (`look-style.mjs`): no picture, no
 * file — the look as data, so a designer changes the shared token rather than patching one element.
 */
/** One slot reader per plugin instance (its `config`), so every caller shares one read a minute per site. */
const slotReaders = new WeakMap<Config, ReturnType<typeof wornSlotReader>>()

/**
 * The design-system slot a site wears, read from its own container (`ds-slot-worn.mjs`): `null` for a
 * site wearing none or not installed yet, `undefined` while no read has answered.
 */
async function siteSlot(
  config: Config,
  sitesRoot: string,
  label: string,
  opts: { fresh?: boolean; waitMs?: number } = {}
): Promise<WornSlot | null | undefined> {
  let slots = slotReaders.get(config)
  if (slots === undefined) {
    slots = wornSlotReader({ run: (input) => runExec(config, input) })
    slotReaders.set(config, slots)
  }
  const folder = `${sitesRoot}/${label}`
  // Nothing installed yet: no container to wear anything, and none to ask.
  if (!existsSync(`${folder}/.webroot`)) return null
  let platform = 'unknown'
  try {
    platform = await sitePlatform(folder, detectPlatform)
  } catch {
    return undefined
  }
  return slots.read(label, platform, opts)
}

/**
 * The ruler a site's look edits are judged by: the slot it wears, and the roles its template's own
 * stylesheets read (`templateRolesOf`, from the same read: no second container call) — the ruler itself
 * when it wears none, the fallback a written value keeps when it wears one.
 */
async function siteRuler(
  config: Config,
  sitesRoot: string,
  label: string,
  opts: { fresh?: boolean; waitMs?: number } = {}
): Promise<{ slot: WornSlot | null | undefined; roles: TemplateRoles | null }> {
  const slot = await siteSlot(config, sitesRoot, label, opts)
  let platform = 'unknown'
  try {
    platform = await sitePlatform(`${sitesRoot}/${label}`, detectPlatform)
  } catch {
    return { slot, roles: null }
  }
  return { slot, roles: slotReaders.get(config)?.rolesOf(label, platform) ?? null }
}

/**
 * A look write's answer with the literals it typed over the design-system roles (`role-pins.mjs`): the
 * WordPress and Joomla half of the EmDash rebuild's pin check. Added to an `ok:true` answer only, as
 * `rolePins` and a `next` that puts the fix before the reply — never a refusal; a site whose ruler is
 * unknown, or whose template reads no role, answers as before.
 */
async function withRolePins(
  answer: unknown,
  config: Config,
  sitesRoot: string,
  label: string,
  written: {
    added: string[]
    edits: { address: string; text: string }[]
    bodies: { address: string; text: string }[]
  },
  bodies: {
    seen: (address: string) => string | undefined
    keep: (address: string, text: string) => void
    fieldsOf: (record: string) => string[]
    append: (record: string, text: string) => void
  }
): Promise<unknown> {
  if (!answer || typeof answer !== 'object' || (answer as { ok?: unknown }).ok !== true) return answer
  // what was sent whole is remembered as the record's body now, whatever is said about it
  const before = written.bodies.map((b) => ({ ...b, was: bodies.seen(b.address) }))
  // an edited block is judged against the body of its record as read (every field of it)
  const editsBefore = written.edits.map((e) => ({
    ...e,
    was: [...bodies.fieldsOf(e.address)].join('\n') || undefined
  }))
  for (const b of written.bodies) bodies.keep(b.address, b.text)
  // an edited block is in the record now: a later whole-body write does not name its literals again
  for (const e of editsBefore) if (e.was !== undefined) bodies.append(e.address, e.text)
  const a = answer as Record<string, unknown>
  // a write of words alone says nothing about design-system roles: no note, no wait for the slot read
  if (
    !carriesLook([
      ...written.added,
      ...written.edits.map((e) => e.text),
      ...written.bodies.map((b) => b.text)
    ])
  )
    return answer
  const withNote = (note: string) => ({
    ...a,
    next: typeof a.next === 'string' && a.next !== '' ? `${a.next} ${note}` : note
  })
  // a body or an edited block sent with no read of the record to compare with: said, never called clean
  const unread = [...before, ...editsBefore].filter((b) => b.was === undefined).length
  const unreadNote =
    unread > 0
      ? 'Not checked for literals over the design-system roles: what this write sent of a record this conversation has not read whole (content.get); keep every colour, radius and font in it written through a role.'
      : ''
  if (written.added.every((t) => t === '') && unread === before.length + editsBefore.length)
    return unreadNote === '' ? answer : withNote(unreadNote)
  const ruler = await siteRuler(config, sitesRoot, label, { waitMs: SLOT_WAIT_MS }).catch(() => null)
  // whether a system is worn is not known (the slot read did not answer): the fallback is not either
  if (ruler === null || ruler.slot === undefined)
    return withNote(
      'Not checked for literals over the design-system roles: whether this site wears a design system could not be read; keep every colour, radius and font this write added written through a role.'
    )
  const by = ruler.slot ?? ruler.roles ?? null
  if (by === null) return answer
  const worn = Boolean(ruler.slot)
  const rule = { ruler: by, template: ruler.roles ?? null, worn }
  // a whole body or an edited block is judged only against what this conversation read: never its older literals
  const known = [...before, ...editsBefore].filter((b) => b.was !== undefined)
  const pins = [
    ...rolePins(written.added, rule),
    ...newRolePins(
      known.map((b) => b.was as string),
      known.map((b) => b.text),
      rule
    )
  ].slice(0, 8)
  if (pins.length === 0) return unreadNote === '' ? answer : withNote(unreadNote)
  const said = `${rolePinsNext(pins, worn)}${unreadNote === '' ? '' : ` ${unreadNote}`}`
  return {
    ...a,
    rolePins: pins,
    next: typeof a.next === 'string' && a.next !== '' ? `${a.next} ${said}` : said
  }
}

async function pageLook(
  ctx: HostContext,
  exec: ToolRun | undefined,
  config: Config,
  sitesRoot: string,
  label: string | null,
  params: Record<string, unknown>,
  facts: { platform?: string; sealed?: boolean | null } = {}
): Promise<unknown> {
  if (label === null)
    return {
      ok: false,
      code: 'NO_SITE_IN_CONVERSATION',
      error: 'This lane names no site, so there is no page to look at.'
    }
  // A key page.look does not read is refused, never ignored (v6: `full`, `fullPage`, `scrollTo`).
  const unread = lookParamsProblem(params)
  if (unread !== null) return unread
  const internalPort = await sitePortFor(config, sitesRoot, label)
  const target = lookTarget(label, params.path, internalPort)
  if (!target.ok) return { ok: false, code: 'BAD_PATH', error: target.error }
  // `style` (v6 #3): the element's computed look and the tokens behind it instead of a picture —
  // checked before anything is asked of the site, so a malformed one costs no exec.
  const styled =
    params.style === undefined || params.style === null || params.style === false
      ? null
      : styleRequest(params.style)
  if (styled !== null && !styled.ok) return styled.answer
  /**
   * 🔒 ASK WHETHER THE SITE ANSWERS BEFORE PHOTOGRAPHING IT, because Chrome will not tell us.
   *
   * Headless Chrome renders its own error page for an address that does not resolve, writes that
   * PNG, and exits 0 — so this tool answered `{ok: true}` with a picture of a DNS failure and a
   * description read out of it. Measured 16/09 on `demo1aa`: the agent read the screenshot as
   * evidence the SITE was broken and went looking there, when the site was fine and the address was
   * not. A tool that reports success for a picture of its own failure is worse than one that
   * refuses: the refusal costs a call, the picture costs a wrong theory.
   *
   * `inContainerProbe` runs one GET from INSIDE the container, on loopback (#154), and refuses a
   * server redirect off this site's origin. Any answer it does keep — including a 404 or a 500 —
   * means the site is there and the screenshot is worth taking; the browser then confirms the final
   * document is still this site's before the picture is kept (a picture of another host, or of a
   * Chrome error page, would be as wrong as text of one).
   */
  const door = contentDoor(facts)
  const publicOrigin = hostPublicOrigin(config, label)
  // The SAME read as `page.text` asks first (`pageLookGate`): one mechanism, one set of redirect
  // rules, and it works where the node probe cannot (the stand's WordPress and Joomla carry no node).
  // A container with no curl takes the pre-F2 probe below, unchanged.
  const gate = await pageLookGate({
    run: (input: { argv: readonly string[]; stdin?: string; timeoutMs: number; maxBuffer: number }) =>
      runExec(config, input),
    label,
    internalPort,
    publicOrigin,
    path: target.path,
    door
  })
  let btarget: { url: string; origin: string; container: string; resolverRule: string; via: string } | null
  let shownUrl = target.url
  const curlRan = !('legacy' in gate)
  if ('legacy' in gate) {
    const probe = await inContainerProbe(config, label, internalPort, target, publicOrigin, door)
    if (!probe.ok) return probe.result
    btarget = browserTargetFor(label, probe, internalPort, target)
  } else if (!gate.ok) return gate.answer
  else {
    btarget = gate.target
    shownUrl = gate.url
  }
  if (btarget === null)
    return {
      ok: false,
      code: 'REDIRECTED_OFF_SITE',
      error: `${target.path} asks to be served on a port this site does not expose here.`,
      next: `Photograph a path this site serves itself; the words behind that page: ${door}.`
    }
  // The same browser, addressed the same way, reading styles instead of taking a picture: no file.
  if (styled !== null) {
    // Read beside the browser, bounded as a step's read is: a site wearing a design-system slot gets each
    // literal that pins one of the slot's values named on its row (`slotPinNotes`).
    // A site wearing nothing gets the same pins over its template's own roles (Akemi, 20/10/2026).
    const slotWork = siteRuler(config, sitesRoot, label, { waitMs: SLOT_WAIT_MS }).catch(() => null)
    const answer = await styleLook({
      run: (input: { argv: readonly string[]; stdin?: string; timeoutMs: number; maxBuffer: number }) =>
        runExec(config, input),
      target: btarget,
      req: styled.req,
      url: shownUrl,
      path: target.path,
      cap: clampChars(params.maxChars, 2000),
      publicOrigin
    })
    const ruler = await slotWork
    if (ruler?.slot) return slotPinNotes(answer, ruler.slot)
    return ruler?.roles ? slotPinNotes(answer, ruler.roles, 'template') : answer
  }
  // The screenshot is written by the CONTAINER's browser to its own `/site/<label>/…` mount, which
  // is the same host inode dsh reads back through its `/site` bind — so dsh names the host path for
  // the answer, and the container is told the fixed container path (both from one timestamp).
  const ts = Date.now()
  const file = path.join(sitesRoot, label, 'docs', 'agents', 'look', `${ts}.png`)
  try {
    await fs.mkdir(path.dirname(file), { recursive: true })
  } catch (error) {
    return {
      ok: false,
      code: 'LOOK_FAILED',
      detail: error instanceof Error ? error.message : String(error),
      next: LOOK_FAILED_NEXT
    }
  }
  const shot = await browseAsSite({
    target: btarget,
    publicOrigin,
    launch: (t) =>
      runExec(config, {
        argv: browserArgv({
          container: t.container,
          mode: 'shot',
          url: t.url,
          origin: t.origin,
          file: containerLookFile(label, ts),
          resolverRule: t.resolverRule,
          via: t.via
        }),
        timeoutMs: LOOK_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024
      })
  })
  const run = shot.res
  // Asked again as the site's own public origin: the picture is of that address.
  if (shot.target !== btarget) shownUrl = shot.target.url
  const browser = parseBrowser(run.stdout)
  // 🔒 THE FLIP (F2 §3.7): once the static read has run, `page.text` needs no browser, so the next
  // names it; on the pre-F2 road it would fail the same way, and the next stays the content door.
  if (looksLikeMissingBinary(run) || (!browser.ok && browser.kind === 'no-browser'))
    return lookNoBrowserAnswer(curlRan, door)
  if (!browser.ok && browser.kind === 'offsite')
    return {
      ok: false,
      code: 'REDIRECTED_OFF_SITE',
      error: `${target.path} left this site for ${browser.error}, so a picture of it is not this site's.`,
      next: `Photograph a path this site serves itself; the words behind that page: ${door}.`
    }
  // 🔒 Same clean-exit rule as page.text: a non-zero exit or a maxBuffer overflow (`code: null` +
  // `spawnError`) means the script did not finish writing the PNG, so an `OK` line over it is not a
  // whole capture. Require code 0, no spawn error, no timeout — and the file on disk.
  const cleanExit = run.code === 0 && !run.spawnError && !run.timedOut
  if (!browser.ok || !cleanExit || !existsSync(file)) {
    return {
      ok: false,
      code: 'LOOK_FAILED',
      detail:
        (!browser.ok && browser.error) ||
        run.spawnError ||
        (run.timedOut
          ? 'the browser ran out of time'
          : !cleanExit
            ? 'the browser did not finish cleanly'
            : 'no screenshot was written'),
      next: LOOK_FAILED_NEXT
    }
  }
  return {
    ok: true,
    file,
    url: shownUrl,
    ...(await pageSeen(ctx, exec, config, { file, url: shownUrl }))
  }
}

/**
 * One page's server HTML of a site, by the one page-read road (`page.mjs` `fetchPageHtml`): what a
 * write into WordPress's Additional CSS is read back against (`additional-css-check.mjs`).
 */
function pageHtmlFor(
  config: Config,
  sitesRoot: string,
  label: string,
  facts: { platform?: string; sealed?: boolean | null } = {}
) {
  const run = (input: { argv: readonly string[]; stdin?: string; timeoutMs: number; maxBuffer: number }) =>
    runExec(config, input)
  return async (path: string) =>
    fetchPageHtml({
      run,
      label,
      internalPort: await sitePortFor(config, sitesRoot, label),
      publicOrigin: hostPublicOrigin(config, label),
      path,
      door: contentDoor(facts)
    })
}

/**
 * The style reads `look.set` makes (`look-set.mjs`): before it writes and after, each one the same
 * browser read `page.look {style}` makes, through the same gate. The gate runs once per page and is
 * kept for the second read of the same call; a page the gate refuses is that refusal, as page.look
 * would answer it.
 */
function lookSetMeasure(
  config: Config,
  sitesRoot: string,
  label: string,
  facts: { platform?: string; sealed?: boolean | null } = {}
) {
  const run = (input: { argv: readonly string[]; stdin?: string; timeoutMs: number; maxBuffer: number }) =>
    runExec(config, input)
  const opened = new Map<string, Promise<{ ok: true; target: any; url: string } | Record<string, unknown>>>()
  const open = async (asked: string) => {
    const internalPort = await sitePortFor(config, sitesRoot, label)
    const target = lookTarget(label, asked, internalPort)
    if (!target.ok) return { ok: false, code: 'BAD_PATH', error: target.error }
    const door = contentDoor(facts)
    const publicOrigin = hostPublicOrigin(config, label)
    const gate = await pageLookGate({ run, label, internalPort, publicOrigin, path: target.path, door })
    if ('legacy' in gate) {
      const probe = await inContainerProbe(config, label, internalPort, target, publicOrigin, door)
      if (!probe.ok) return probe.result as Record<string, unknown>
      const b = browserTargetFor(label, probe, internalPort, target)
      if (b === null)
        return {
          ok: false,
          code: 'REDIRECTED_OFF_SITE',
          error: `${target.path} asks to be served on a port this site does not expose here.`
        }
      return { ok: true as const, target: b, url: target.url, path: target.path, publicOrigin }
    }
    if (!gate.ok) return gate.answer as Record<string, unknown>
    return { ok: true as const, target: gate.target, url: gate.url, path: target.path, publicOrigin }
  }
  return async (req: Record<string, unknown>, asked: string) => {
    if (!opened.has(asked)) opened.set(asked, open(asked))
    const at = (await opened.get(asked)) as Record<string, any>
    if (at.ok !== true) return at
    const read = (await styleRead({
      run,
      target: at.target,
      req: req as any,
      path: at.path,
      publicOrigin: at.publicOrigin
    })) as Record<
      string,
      any
    >
    return read.ok === true ? { ok: true, payload: read.payload, url: at.url } : read
  }
}

/**
 * Ask Tracy, once at boot, whether it can read what this workspace signs.
 *
 * WHY A PROBE AND NOT A COMMENT IN A RUNBOOK. `MCP_TRACY_ACTOR_SECRET` is one value that lives in
 * two files nobody edits together, and a mismatch is invisible from either side: this dsh signs
 * happily, Tracy refuses politely, both healthchecks stay green, and the first person to find out
 * is a customer whose build stops at step 2 with "not signed in". Measured on the dev machine
 * 17/09: ten days of that, because the secret was seeded here on 07/09 and there on 10/09 and
 * nothing ever compared the two.
 *
 * It says NOTHING when everything is well beyond one line, it never throws, and an answer it cannot
 * interpret is silence rather than a false alarm — a rollout must not print a warning every time.
 */
async function probeActorPairing(
  mint: (email: string) => string | null,
  origin: string,
  warn: (line: string) => void,
  http: typeof fetch = fetch
): Promise<void> {
  const assertion = mint(PAIRING_PROBE_EMAIL)
  if (assertion === null) return
  let status: number
  try {
    const res = await http(`${origin}/auth/actor-check`, {
      headers: { 'x-tracy-actor': assertion, accept: 'application/json' },
      signal: AbortSignal.timeout(PAIRING_PROBE_TIMEOUT_MS)
    })
    status = res.status
  } catch {
    // Tracy not up yet, or not reachable from here. That is a different fault with its own symptoms
    // (`COWORK_WEB_UNREACHABLE`), and guessing at it here would only add noise to a boot log.
    return
  }
  const verdict = pairingVerdict(status)
  if (verdict === 'paired') console.info(`[site-tools] actor assertions are accepted by ${origin}`)
  else if (verdict === 'unpaired')
    warn(
      `[site-tools] ⚠ ${origin} REFUSED this workspace's signed assertion (401). Until an operator ` +
        `makes MCP_TRACY_ACTOR_SECRET the same value here and in Tracy (and the two clocks agree ` +
        `within five minutes), every write on a site will fail — and it will say "not signed in", ` +
        `which is not what is wrong.`
    )
}

export function apply(ctx: HostContext, config: Config = {}): void {
  // The conversation's title from the person's words, in their language (acceptance F13); it
  // replaces dsh's `session-title-llm` row, which the native bundle turns off (`session-title.mjs`).
  if (typeof ctx.inject === 'function') installSessionTitle(ctx as Parameters<typeof installSessionTitle>[0])
  // The chat turn each call belongs to (`x-tracy-turn`): noted at every root step below, read when
  // a call leaves. `ctx.agents` is read at call time — the registry is live.
  const turns = createTurnLedger(() => ctx.agents)
  turnIdOf = (sessionId) => turns.turnIdFor(sessionId)
  /**
   * Where this plugin says something went unsaid — dsh's logger when the composition carries one,
   * the lane's own log otherwise (the same reasoning as `@tracy/site-build-core`'s `warn`).
   */
  const warn = (line: string) => {
    const logger = ctx.get?.('logger') as { warn?: (line: string) => void } | undefined
    if (typeof logger?.warn === 'function') logger.warn(line)
    else console.warn(line)
  }
  /** What went as planned, on dsh's logger only (a lane without one says nothing). */
  const info = (line: string) => {
    const logger = ctx.get?.('logger') as { info?: (line: string) => void } | undefined
    if (typeof logger?.info === 'function') logger.info(line)
  }
  /** The tools each site conversation is not sent until their road starts (`deferred-tools.mjs`). */
  const deferral = createToolDeferral({ warn })
  /** Follow-ups a deploy drain holds, across the restart it waits for (`deploy-hold.mjs`, #295, #517). */
  const heldQueue = heldPrompts({ warn })
  // Once per process, and deliberately not awaited: nothing this plugin does may wait on Tracy
  // being up, and the answer changes nothing at run time — it only puts the true cause in the log
  // before anybody has to go looking for it.
  // Said once, at boot: a malformed TRACY_SITE_DOMAIN or TRACY_DEPLOYMENT_ORIGIN is IGNORED (a site
  // is then read as https with no port, or not at its public address at all), never a refusal of
  // every page — so the only place the mistake can show is this line.
  const addressProblem = publicOriginFor(
    'boot-check',
    siteDomainOf(config),
    deploymentOriginOf(config)
  ).problem
  if (addressProblem !== null) warn(`[site-tools] ⚠ ${addressProblem}`)
  ctx.effect(() => {
    const mint = (ctx.get?.('tracyAssertion') as AssertionService | undefined)?.mint
    const origin = config.origin ?? gatewaySetting('MCP_TRACY_ORIGIN')
    if (typeof mint === 'function' && typeof origin === 'string' && origin !== '')
      void probeActorPairing(mint, origin, warn, config.fetch ?? fetch)
    return () => {}
  }, 'tracy-site-tools: actor pairing probe')
  /**
   * One session's own log, oldest first — empty when dsh's session store is absent or does not know
   * the id. Read, not injected (`inject` has no optional half), like every optional service here.
   */
  function sessionEvents(sessionId: string | null | undefined): readonly unknown[] {
    const sessions = ctx.get?.('sessions') as SessionsService | undefined
    return (typeof sessionId === 'string' ? sessions?.get?.(sessionId)?.snapshotEvents?.() : undefined) ?? []
  }

  /**
   * `media.upload {attachment}`'s read (29/09/2026, `upload.mjs` `readChatPicture`): the picture is
   * chosen among the attachments in THIS session's own log and read back through dsh's attachment
   * store — never a path the model typed, so another conversation's picture is not reachable.
   */
  const chatPicture = (events: readonly unknown[]) => (asked: unknown) =>
    readChatPicture({
      asked,
      events,
      store: ctx.get?.('attachments') as AttachmentReader | undefined
    })

  /**
   * How one write should leave this lane, for the session that asked.
   *
   * The person who typed comes off that session's own log (the gate stamps every prompt, and dsh
   * keeps the stamp on the message); the assertion that vouches for them is signed by the gate
   * plugin, which is the only thing here that holds the fleet secret. No stamp — a lane with no
   * gate in front, or a session from before this landed — falls back to the viewer's cookie,
   * exactly as it always did.
   *
   * The ORIGIN is the lane's own, not the tab's, on BOTH routes: a viewer's origin says where a
   * browser happened to have the page open (a tab on the password gate, which serves no
   * `/api/sites`, taught this plugin an address whose plain-text 401 a build read as a broken JSON
   * reply, 09/09), and off the fleet proxy it is whatever the hello's caller wrote. No configured
   * origin → no plan (`relayPlan`).
   *
   * A HOST DSH NEVER SIGNS WITH ANOTHER SESSION'S VIEWER. It serves every site on the host, so the
   * latest viewer is whoever last opened any session there; only this session's own viewer (or the
   * person who typed) may stand behind a write. A lane serves one site and keeps its fallback.
   */
  function planFor(sessionId: string | undefined): {
    plan: RelayPlan | null
    bound: boolean
    actorKey: string | null
    events: readonly unknown[]
  } {
    const { viewer, bound } = pickViewer(bySession, latest, sessionId, laneSiteKey() !== null)
    const events = sessionEvents(sessionId)
    const who = latestPrompter(events as never)
    const mint = (ctx.get?.('tracyAssertion') as AssertionService | undefined)?.mint
    const assertion = who !== null && typeof mint === 'function' ? mint(who.email) : null
    const chosen = relayPlan({
      prompter: assertion === null ? null : who,
      viewer,
      // `MCP_TRACY_ORIGIN` is the lane's own answer to "where does this site's door answer" — the
      // same variable the password gate reads to know where identity is proven. Never the hello's
      // host: see `relayPlan`.
      origin: config.origin ?? gatewaySetting('MCP_TRACY_ORIGIN')
    })
    if (chosen === null) return { plan: null, bound, actorKey: null, events }
    // 🔒 WHO the call acts as keys the inspect snapshot (D8): an answer fetched as one person is never
    // served to another, whose seat may not carry the contract toolset. The person who typed is named
    // by their address; a viewer by a hash of the cookie — the cookie itself is never kept.
    if (chosen.as === 'prompter')
      return {
        plan: {
          as: 'prompter',
          assertion: assertion as string,
          origin: chosen.origin,
          // A signer, not only a signature: a call that outlives 60 s signs each request anew (V5S-1).
          sign: () => (typeof mint === 'function' ? mint(chosen.email) : null)
        },
        bound: true,
        actorKey: chosen.email,
        events
      }
    return {
      plan: chosen,
      bound,
      actorKey: createHash('sha256').update(chosen.cookie).digest('hex').slice(0, 16),
      events
    }
  }

  /**
   * What `tracy_site` needs to know about a site to carry out a call: its platform (the one reader,
   * `sitePlatform`, and the container's own label for an EmDash site whose folder names none), whether
   * it is sealed (the fence's own reader), and so which surface of actions it has.
   *
   * 🔒 FOR EXECUTING A CALL ONLY, NEVER FOR RE-DESCRIBING THE TOOL (cache rule CS1). Kept five
   * minutes per site: a seal marker or a finished build changes what a call may do here within
   * minutes, and nothing re-registers or re-masks a tool on it — the description the agent was given
   * at `agent/created` stays, and a call the new facts refuse says so in its answer.
   */
  const factsMemo = new Map<string, { at: number; facts: SiteFacts }>()
  async function siteFactsOf(sitesRoot: string, label: string): Promise<SiteFacts> {
    const held = factsMemo.get(label)
    if (held !== undefined && Date.now() - held.at < SITE_FACTS_TTL_MS) return held.facts
    const emdash = await isEmdashSite(config, label)
    let platform = 'unknown'
    try {
      platform = emdash ? 'emdash' : await sitePlatform(`${sitesRoot}/${label}`, detectPlatform)
    } catch {
      platform = 'unknown'
    }
    const sealed = siteSeal(sitesRoot, label)
    // The road the seal leaves (#337): read by the same function the site context and the tool's
    // surface read, so a call is carried out on the road the agent was told about.
    const contractDoor = contractDoorOf(sitesRoot, label, platform, sealed) as boolean | null
    // An imported copy's derived contract (01/10/2026): read only for an open site — a sealed one keeps
    // the surface its quickstart marker gives it, and the reader fails closed to the open surface.
    const derived = sealed === false && derivedContractOf(sitesRoot, label, platform) !== null
    const surface = surfaceOf({ platform, sealed, contractDoor, derived }) as Surface | null
    const facts: SiteFacts = {
      platform,
      sealed,
      contractDoor,
      derived,
      surface,
      contract: sealed === true ? contractIdOf(sitesRoot, label) : null
    }
    factsMemo.set(label, { at: Date.now(), facts })
    if (factsMemo.size > SITE_FACTS_MAX) factsMemo.delete(factsMemo.keys().next().value as string)
    return facts
  }

  /**
   * What `tracy_site` remembers between calls (`call-memory.mjs`): the per-site flight every
   * `content.contract` relay of this process queues in, this turn's inspect snapshot, the receipts
   * and body reads of each conversation, the customer's confirmations. ONE per plugin instance —
   * which is one per dsh process: a host dsh serves every site on the host (ADR 0014), so it is keyed
   * by site and conversation inside, never shared by accident.
   */
  const memory = createCallMemory()
  async function demoWriteGuard(args: unknown, exec: ToolRun, clientOnly = false): Promise<unknown | null> {
    if (!clientOnly && !changesSite({ name: 'tracy_emdash', arguments: args })) return null
    const result = (await demoGuard(exec, clientOnly)) as { code?: string } | null
    if (result === null || result?.code === 'AGENT_DEMO_NOT_GRANTED') return null
    return result?.code ? result : null
  }

  /**
   * A demo or own-site build whose plan is saved (`tracy_demo plan.save`, the server's `guard`): the writes it
   * plans — a header or footer every page shows, many places at once, a template's demo price — are what the
   * person pressed Build for, so `consequence.mjs` does not ask them again; a delete, an install or a rollback
   * still asks (`tiers.mjs`). Measured 23/10/2026: a one-press WordPress build stood 50 minutes on "This changes
   * the Header part every page of your site shows", with nobody at the chat to answer. Kept per session: a yes
   * stays a yes only in that turn, until a lifecycle refusal; a no is read again after 30 s.
   */
  const buildTurns = createBuildTurns()
  /** The lifecycle identity present before a request is sent, including steers within the same turn. */
  const buildTurn = (agent: { session?: unknown } | undefined) => {
    const session = agent?.session as
      | {
          seq?: number
          eventAt?: (index: number) => unknown
          snapshotEvents?: () => readonly { type?: string; data?: { turn?: unknown } }[]
        }
      | undefined
    if (typeof session?.seq === 'number' && typeof session.eventAt === 'function') {
      for (let i = session.seq - 1; i >= 0; i--) {
        const event = session.eventAt(i) as { type?: string; data?: { turn?: unknown } } | undefined
        if (event?.type === 'turn/start') return event.data?.turn ?? null
      }
      return null
    }
    const events = session?.snapshotEvents?.() ?? []
    for (let i = events.length - 1; i >= 0; i--)
      if (events[i]?.type === 'turn/start') return events[i]?.data?.turn ?? null
    return null
  }
  const isBuild = (sessionId: string, agent: { session?: unknown } | undefined) =>
    buildTurns.state(sessionId, buildTurn(agent))?.build === true
  const buildSizes = new Map<string, { records?: number; rows?: number }>()
  async function demoPlanAgreed(exec: ToolRun): Promise<boolean> {
    const sessionId = exec?.agent?.session?.id ?? null
    if (!sessionId) return false
    const turn = buildTurn(exec.agent)
    const seen = buildTurns.state(sessionId, turn)
    if (seen?.planned) return true
    if (typeof seen?.planCheckedAt === 'number' && Date.now() - seen.planCheckedAt < 30_000) return false
    try {
      await demoGuard(exec, false)
    } catch {
      buildTurns.observe(sessionId, turn, null, buildTurn(exec.agent), Date.now(), true)
    }
    return (
      turn !== null && turn === buildTurn(exec.agent) && buildTurns.state(sessionId, turn)?.planned === true
    )
  }

  /** The server's `tracy_demo guard` for this conversation's assigned demo, or null when it has none. */
  async function demoGuard(exec: ToolRun, clientOnly: boolean): Promise<unknown | null> {
    const assignedTurn = buildTurn(exec.agent)
    const sessionId = exec?.agent?.session?.id ?? null
    const sitesRoot = resolveSitesRoot(undefined)
    let label: string | null = null
    try {
      label = siteOf(String(exec?.agent?.session?.header?.cwd ?? ''), sitesRoot).label
    } catch {
      label = null
    }
    const route = planFor(sessionId ?? undefined).plan
    const key =
      laneSiteKey() ??
      (label === null ? null : ((await siteKeyInFolder(`${sitesRoot}/${label}`)) ?? '_conversation'))
    if (!route || !key || !sessionId) {
      if (sessionId)
        buildTurns.observe(sessionId, assignedTurn, { code: 'AGENT_DEMO_NOT_GRANTED' }, buildTurn(exec.agent))
      return null
    }
    const result = (await applyDoor(
      config,
      route,
      key,
      'demo.research',
      { operation: 'guard', ...(clientOnly ? { clientOnly: true } : {}) },
      null,
      label,
      sessionId
    )) as { code?: string }
    buildTurns.observe(sessionId, assignedTurn, result, buildTurn(exec.agent), Date.now(), true)
    return result
  }

  /**
   * Opt D (09/10/2026): the clean receipt each conversation's last site call answered with, so a read of
   * the site made right after it carries one line saying the receipt was the check — never a refusal.
   */
  const afterWrite = createAfterWrite()
  /**
   * One `tracy_site` / `tracy_emdash` call seen by the reminder: what it was, and the answer to hand on.
   * @returns the answer, with `afterWrite` when it is a read right after a clean receipt.
   */
  const sawSiteCall = (
    exec: ToolRun,
    tool: 'tracy_site' | 'tracy_emdash',
    args: unknown,
    answer: unknown
  ): unknown => {
    const sessionId = exec?.agent?.session?.id
    if (typeof sessionId !== 'string' || sessionId === '') return answer
    let call: SiteCallKind
    try {
      if (tool === 'tracy_site') {
        const { action, params } = canonicalCall(args) as { action: string; params: Record<string, unknown> }
        call = {
          tool,
          action,
          operation: typeof params?.operation === 'string' ? params.operation : undefined,
          head: params?.head === true,
          write: changesSite({ name: tool, arguments: args })
        }
      } else {
        const shape = normalizeEmdashShape(args) as { ok: boolean; tool?: string }
        call = {
          tool,
          action: shape.ok && typeof shape.tool === 'string' ? shape.tool : '',
          write: changesSite({ name: tool, arguments: args })
        }
      }
    } catch {
      return answer
    }
    return afterWrite.see(sessionId, memory.turnOf(sessionId), call, answer)
  }
  /** What `tracy_emdash` keeps between calls (`emdash-call.mjs`): served locales, staged drafts. One per process too. */
  const emdashState = createEmdashState()
  /** The replace job's previews per conversation: a wide `all` is written only after its dryRun. */
  const dryRuns = createDryRunMemory()
  /**
   * The design-system slot each site wears, read from the site itself (`ds-slot-worn.mjs`): the site
   * context's Design system line and the design check's ruler when no design record is bound
   * (`siteSlot`, shared with `page.look`).
   */
  const slotOf = (
    label: string,
    opts: { fresh?: boolean; waitMs?: number } = {}
  ): Promise<WornSlot | null | undefined> => siteSlot(config, resolveSitesRoot(undefined), label, opts)

  /**
   * The page each conversation's customer has open, and the picture drawn of it (`view.mjs`): drawn
   * while they type, taken by their message's first step, never announced. Off with
   * `config.viewContext: false` — the door then keeps nothing and no step is given a picture.
   */
  const viewsOn = config.viewContext !== false
  /**
   * One page of a site drawn in its own container, in one window and scroll (`captureView`). `check`:
   * drawn for the visual check, which falls back on dsh's own browser where the container has none
   * (`captureView` `host`); the conversation's own picture of the page does not.
   */
  const drawView = async (
    label: string,
    view: Parameters<typeof captureView>[0]['view'],
    { check = false }: { check?: boolean } = {}
  ) => {
    const sitesRoot = resolveSitesRoot(undefined)
    const chrome = check
      ? config.hostChrome !== undefined
        ? config.hostChrome
        : hostChromeOf(process.env, existsSync)
      : null
    return captureView({
      label,
      view,
      internalPort: await sitePortFor(config, sitesRoot, label),
      publicOrigin: hostPublicOrigin(config, label),
      run: (input) => runExec(config, input),
      door: contentDoor(NO_SITE_FACTS),
      host: chrome
        ? {
            chrome,
            run: ({ target, file, deadlineMs }) =>
              hostBrowserExec({
                chrome,
                target,
                mode: 'view',
                file,
                deadlineMs,
                timeoutMs: VIEW_EXEC_MS,
                maxBuffer: VIEW_MAX_BUFFER
              })
          }
        : null
    })
  }
  // Words a page in Voice said it is about to send (`voice-reply.mjs`): the step that takes them gets
  // the spoken-reply rule.
  const voiceWords = spokenWords()
  const views = createViewStore({
    // A conversation whose turn is running is not drawn for while they write ahead (`chats` is made
    // further down; the store only asks when a report comes in, after the plugin is applied).
    busy: (sessionId) => chats.running().includes(sessionId),
    capture: async ({ label, view, check }) => {
      try {
        return await drawView(label, view, { check: check === true })
      } catch (error) {
        warn(
          `[site-tools] the page open on ${label} could not be pictured: ${error instanceof Error ? error.message : String(error)}`
        )
        return { ok: false, code: 'ERROR' }
      }
    }
  })
  // Every write this host sends or sees, from any conversation of the site, ages its pictures (`wrote`).
  siteWritten = (label) => views.wrote(label)
  /**
   * A turn that wrote is looked at before it closes (`visual-check.mjs`). Its first step freezes what
   * the customer asked and the picture of their page drawn BEFORE the turn (`turnAsks`, one per
   * conversation); `agent/turn-stopping` below compares that page now with it, once.
   */
  const checkMode = viewsOn ? visualCheckMode(config.visualCheck) : 'off'
  const turnAsks = new Map<
    string,
    {
      turn: number
      text: string
      comment: boolean
      at: number
      before: Awaited<ReturnType<typeof views.take>>
      checked: boolean
      // A turn without the tab's picture: the one its first write was held for (`check-pages.mjs`).
      missing?: string
      // The page drawn as the turn began (`EarlyPicture`), and when its first write was let go: a drawing
      // finished after that moment may show the write, so it is never the "before".
      early?: EarlyPicture
      fallback?: NonNullable<Awaited<ReturnType<typeof views.take>>>
      wroteAt?: number
      extras?: NonNullable<Awaited<ReturnType<typeof views.take>>>[]
      agreed?: string[]
      hold?: { spentMs: number; main: boolean; shared: boolean; pending: Promise<unknown> | null }
      // What the turn's check told tracy-web (re-sent once with `written-after-check` when the site is
      // written after the check ran), and whether such a write was already seen.
      report?: {
        plan: RelayPlan
        label: string
        turnId: string
        said: { visual: string; note: string | null }
        sent: Promise<void>
      }
      writtenAfterCheck?: boolean
    }
  >()
  /**
   * What the host knows of pages, for the pictures a write is held for (`check-pages.mjs`): the pages
   * each conversation read and how long they were, and EmDash entries' addresses learned from answers.
   */
  const pageReads = createPageReads()
  const recordPages = createRecordPages()
  /** The root conversation a session's turn belongs to, and that turn (null when not known). */
  const turnOfSession = (sessionId: string): { root: string; turn: number | null } => {
    const id = turnIdOf(sessionId)
    if (id === null) return { root: sessionId, turn: null }
    const at = id.lastIndexOf(':')
    return { root: id.slice(0, at), turn: Number(id.slice(at + 1)) }
  }

  /**
   * The Apply door, and what a write means for this site's snapshots (D8): a call that may change the
   * site makes every conversation's inspect of it stale — BEFORE the send, so an inspect already on
   * the wire is not kept, and AFTER it, so one that answered while this write was landing is not
   * served. Whoever sends it: a model call, the build engine's loopback `/apply`, `media.draw`.
   * No `next` here; `relay` adds it for the callers that return the answer as it is.
   */
  const relayRaw = async (
    plan: RelayPlan,
    key: string,
    action: string,
    params: Record<string, unknown>,
    target: string | null,
    label: string | null = null,
    sessionId: string | null = null,
    preset: string | null = null
  ): Promise<unknown> => {
    const site = label ?? labelOfKey(key)
    const writes = relayWrites(action, params)
    if (writes) memory.invalidateSite(site)
    const title = writes ? memory.titleOf(sessionId, params) : null
    const answer = await applyDoor(config, plan, key, action, params, target, label, sessionId, preset, title)
    if (writes) memory.invalidateSite(site)
    // A write the door took holds the site's lease for this conversation until its turn ends.
    // 🔒 A WRITE BY THE DOOR'S OWN RULE (`doorTakesLease`, review C3), not "makes reads stale": a media
    // upload or delete takes the lease there too, and a turn that only did those kept it 90 s after it
    // ended. A refusal for the lease, or a call Stop kept from being sent, took nothing.
    if (sessionId && doorTakesLease(action, params) && !isLeaseBusy(answer) && !isTurnStopped(answer))
      leaseHolders.set(sessionId, { key, label })
    return answer
  }
  /** Conversations whose turn wrote through the Apply door: their lease goes back when it ends. */
  const leaseHolders = new Map<string, { key: string; label: string | null }>()
  const turnEnded = (sessionId: string): void => {
    const held = leaseHolders.get(sessionId)
    if (held === undefined) return
    leaseHolders.delete(sessionId)
    const { plan } = planFor(sessionId)
    if (plan === null) {
      warn(`[site-tools] ${held.label ?? held.key}: no way to reach Tracy to give the write lease back`)
      return
    }
    // a write of this conversation's next turn takes the lease again: no later try may free that one
    void releaseSiteLease(
      config,
      plan,
      held.key,
      held.label,
      sessionId,
      warn,
      () => !leaseHolders.has(sessionId)
    )
  }
  /**
   * The writes each running call has sent, reported when the customer's Stop cuts it (review Q2,
   * `stopped-writes.mjs`): signed as the conversation's own calls are, never awaited by the write.
   */
  const stopped = createStoppedWrites({
    newId: () => randomUUID().replace(/-/g, ''),
    report: async (who, writes) => {
      const { plan } = planFor(who.sessionId)
      if (plan === null) return
      await reportStoppedWrites(config, plan, who, writes, warn)
    }
  })

  /**
   * 🔒 AN EMDASH WRITE TAKES THE SITE'S WRITE LEASE FIRST (review Q1, council 20/10/2026, option ii).
   * `tracy_emdash`, EmDash's `content.replace` write script and an EmDash picture upload write straight
   * to the site, never through the Apply door, so two conversations on one EmDash site wrote interleaved.
   * Before each such write the lease is taken (or renewed) at tracy-web's lease door — the same row the
   * Apply door takes — and a refusal is waited out exactly as the Apply road waits (`waitOutLease`: out
   * of the site's flight, bounded, cut by Stop). Each write asks again, so a road of several writes
   * renews the lease between them and never outlives its 90 s of silence. The lease is given back when
   * the turn ends (`turnEnded`), like an Apply write's.
   *
   * Answers null when the write may go — the lease is held, or the door cannot be asked (no
   * conversation, nobody to act as, an older tracy-web): then it goes as it did before this door — or
   * the answer to give instead of sending: `TURN_STOPPED`, or the last `SITE_BUSY` with `waitedSeconds`.
   * 🔒 A Stop during the wait sends nothing, even when the lease then came free.
   */
  const emdashWriteLease = async (
    label: string,
    sessionId: string | null
  ): Promise<Record<string, unknown> | null> => {
    if (!sessionId) return null
    const signal = turnSignal.getStore() ?? null
    if (signal?.aborted) return stoppedAnswer()
    const { plan } = planFor(sessionId)
    if (plan === null) return null
    const seat = flightSeat()
    const answer = (await waitOutLease(
      () => acquireSiteLease(config, plan, '_conversation', label, sessionId),
      {
        sleep: config.sleep as ((ms: number) => Promise<void>) | undefined,
        signal,
        waiting: () => beginWait(sessionId, 'lease'),
        ...(seat === null ? {} : { leave: seat.leave, rejoin: seat.rejoin })
      }
    )) as Record<string, unknown>
    if (answer.ok === true) {
      leaseHolders.set(sessionId, { key: '_conversation', label })
      return signal?.aborted ? stoppedAnswer() : null
    }
    if (isTurnStopped(answer) || isLeaseBusy(answer)) return answer
    warn(
      `[site-tools] ${label}: the write lease could not be asked (${String(answer.code)}); the EmDash write goes on`
    )
    return null
  }

  /** Whether one MCP request to an EmDash site writes: a tool call of a tool EmDash does not mark read-only. */
  const emdashRequestWrites = (request: object): { tool: string; args: Record<string, unknown> } | null => {
    const r = request as { method?: unknown; params?: { name?: unknown; arguments?: unknown } }
    if (r.method !== 'tools/call' || typeof r.params?.name !== 'string') return null
    if (EMDASH_READ_TOOLS.has(r.params.name)) return null
    const args = r.params.arguments
    return {
      tool: r.params.name,
      args: args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
    }
  }

  /**
   * `emdashMcp` for one conversation: a write takes the lease first (`emdashWriteLease`) and is noted for
   * a Stop (`noteWrite`); a read goes as it always did. Every road to an EmDash site's MCP that may write
   * — `tracy_emdash`, a picture upload or draw, `page.create`'s menu row — sends through this.
   */
  const emdashMcpFor =
    (site: { label: string; container: string; origin: string }, sessionId: string | null) =>
    async (request: object) => {
      const write = emdashRequestWrites(request)
      if (write === null) return emdashMcp(config, site, request)
      const held = await emdashWriteLease(site.label, sessionId)
      if (held !== null) return held as { ok: false; code: string; error: string }
      const finish = noteWrite('_conversation', site.label, sessionId, {
        action: write.tool,
        target: emdashWriteTargetOf(write.args),
        via: 'emdash'
      })
      const answer = await emdashMcp(config, site, request)
      finish(writeOutcome(answer))
      return answer
    }

  /** `emdashRedirects` for one conversation: a POST or DELETE writes the redirect store, as an MCP write does. */
  const emdashRedirectsFor =
    (site: { label: string; container: string }, sessionId: string | null) =>
    async (asked: { method: string; path: string; body: string }) => {
      const request = asked as { method: 'GET' | 'POST' | 'DELETE'; path: string; body: string }
      if (request.method === 'GET') return emdashRedirects(config, site, request)
      const held = await emdashWriteLease(site.label, sessionId)
      if (held !== null) return held as { ok: false; code: string; error: string }
      const finish = noteWrite('_conversation', site.label, sessionId, {
        action: request.method === 'POST' ? 'redirect_create' : 'redirect_delete',
        target: null,
        via: 'emdash'
      })
      const answer = await emdashRedirects(config, site, request)
      finish(writeOutcome(answer))
      return answer
    }

  /** The form door's exec (`emdashForms`): a list as it is, an update leased and noted as every EmDash write is. */
  const emdashFormsFor =
    (site: { label: string; container: string }, sessionId: string | null) =>
    async (request: { route: 'forms/list' | 'forms/update'; body: string }) => {
      if (request.route === 'forms/list') return emdashForms(config, site, request)
      const held = await emdashWriteLease(site.label, sessionId)
      if (held !== null) return held as { ok: false; code: string; error: string }
      const finish = noteWrite('_conversation', site.label, sessionId, {
        action: 'form_words',
        target: null,
        via: 'emdash'
      })
      const answer = await emdashForms(config, site, request)
      finish(writeOutcome(answer))
      return answer
    }

  /**
   * The replace job's script road with its WRITE exec leased and noted: each run takes (renews) the
   * lease first, and each op of the run is one write a Stop may cut. The index read is not touched.
   */
  const leasedScriptRoad = <R extends { write: (request: Record<string, unknown>) => Promise<any> }>(
    road: R,
    label: string,
    sessionId: string | null
  ): R => ({
    ...road,
    write: async (request: Record<string, unknown>) => {
      const held = await emdashWriteLease(label, sessionId)
      if (held !== null)
        return isTurnStopped(held)
          ? { ok: false, kind: 'stopped', error: 'the customer stopped the turn' }
          : { ok: false, kind: 'busy', error: String(held.error ?? 'the site is busy'), answer: held }
      const ops = Array.isArray(request.ops) ? (request.ops as { tool?: unknown; args?: unknown }[]) : []
      const finishes = ops.map((op) =>
        noteWrite('_conversation', label, sessionId, {
          action: typeof op?.tool === 'string' ? op.tool : 'content_update',
          target: emdashWriteTargetOf((op?.args ?? {}) as Record<string, unknown>),
          via: 'emdash'
        })
      )
      const got = await road.write(request)
      const results = got?.ok === true && Array.isArray(got.value?.results) ? got.value.results : []
      const inFlight = got?.ok === true && typeof got.value?.inFlight === 'number' ? got.value.inFlight : null
      finishes.forEach((finish, i) => {
        if (got?.ok !== true)
          // The script stopped before it sent (`no-token`, `stopped`, its own refusal) or nothing says how far it got.
          return finish(['no-token', 'stopped', 'refused'].includes(got?.kind) ? 'not-sent' : 'unknown')
        const r = results.find((x: { i?: unknown }) => x?.i === i)
        if (r !== undefined) return finish(r.ok === true ? 'ok' : 'refused')
        finish(inFlight === i ? 'unknown' : 'not-sent')
      })
      return got
    }
  })

  // 🔒 WHICH CMS THE NEXT SPEAKS FOR, WHERE NO SITE FACTS ARE HELD (#337, Codex review #7): the preset
  // names it (`designer-wordpress`), so a sealed WordPress site's `LEGACY_STRUCTURE_CODE` is not answered with
  // Joomla's picture folder and build tool. `runSiteCall` passes the site's own facts instead.
  /**
   * An EmDash write landed on `label` (`tracy_emdash`, or `content.replace` on an EmDash site): tell
   * Tracy, as the person the session's calls act as, without waiting (`reportSiteChanged`). Nobody to
   * act as — a session whose browser never said hello — is nobody to vouch for the stamp: skipped.
   */
  const siteChanged = (
    label: string,
    sessionId: string | null,
    tool: string,
    via: 'file-look' | 'look-revert' | 'look-css' | 'emdash-mcp',
    target: { kind: string; id: string; ids?: string[]; title?: string; state?: string } | null = null
  ): void => {
    views.wrote(label)
    const { plan } = planFor(sessionId ?? undefined)
    if (plan === null) return
    void reportSiteChanged(config, plan, label, sessionId, tool, warn, via, target)
  }
  const relay = async (...args: Parameters<typeof relayRaw>): Promise<unknown> =>
    withNext(await relayRaw(...args), {
      platform: /-(joomla|wordpress|emdash)$/.exec(args[7] ?? '')?.[1] ?? null,
      // The action asked, so a refused `apply.revert` is told to revert the newer change first.
      action: args[2]
    })

  /**
   * 🔒 PRE-WARM (#7 of the v6 plan, 28/09/2026): THE TWO READS A CONVERSATION'S FIRST STEPS WAIT ON,
   * ASKED WHILE THE CUSTOMER IS STILL TYPING. A describe's first call costs the relay one listing
   * and a count per content type (Joomla 4.98 s in series, EmDash 4.5 s; `todo-content-api-v2.md`),
   * and a pick's first `content.locate` builds the site's value index (WordPress 2.2–2.6 s, Joomla
   * 6.9–8.3 s cold; `dev-acceptance.md`) — a pick inside the Browser tab's 8 s budget came back
   * `incomplete` and cost one more read. Both are kept by the relay for five minutes
   * (`contentProbes`, the locate store), so asking them once at `agent/created` makes the agent's own
   * first calls cache hits.
   *
   * A COURTESY, NEVER A STEP: not awaited (a session starts exactly as fast as before), at most once
   * per site per {@link PREWARM_EVERY_MS} whatever number of agents start there, no session header
   * (a warm is not this conversation arriving at the site: no presence, no lease), and a failure is
   * one log line — the first real call then pays the cold cost, as it always did. It acts as the
   * person the session's calls would act as (`planFor`). A session whose browser has not said hello
   * yet has nobody to act as: its warm waits for that hello (`prewarmPending`), not for a call.
   */
  const prewarmedAt = new Map<string, number>()
  /** session id → site label and platform: a warm that had nobody to act as, asked again at that session's hello. */
  const prewarmPending = new Map<string, { label: string; platform: string | null }>()
  const prewarm = (label: string, sessionId: string | null, platform: string | null = null): void => {
    const now = Date.now()
    const last = prewarmedAt.get(label)
    if (last !== undefined && now - last < PREWARM_EVERY_MS) return
    const { plan } = planFor(sessionId ?? undefined)
    if (plan === null) {
      if (sessionId !== null) {
        prewarmPending.set(sessionId, { label, platform })
        if (prewarmPending.size > SITE_FACTS_MAX)
          prewarmPending.delete(prewarmPending.keys().next().value as string)
      }
      return
    }
    prewarmedAt.set(label, now)
    if (prewarmedAt.size > SITE_FACTS_MAX) prewarmedAt.delete(prewarmedAt.keys().next().value as string)
    const ask = async (action: string, params: Record<string, unknown>): Promise<string | null> => {
      try {
        const answer = (await applyDoor(config, plan, '_conversation', action, params, null, label)) as {
          ok?: unknown
          code?: unknown
          error?: unknown
        } | null
        if (answer && typeof answer === 'object' && answer.ok === false)
          return `${action} ${String(answer.code ?? (answer.error as { code?: unknown } | undefined)?.code ?? 'refused')}`
        return null
      } catch (error) {
        return `${action} ${error instanceof Error ? error.message : String(error)}`
      }
    }
    /**
     * 🔒 EMDASH IS COLD ON ANOTHER ROAD (16/10/2026). The two reads above go through the Apply door;
     * the agent's own EmDash reads go through the site's MCP server inside its container (`emdashMcp`),
     * and the first of those after a container start paid 20–40 s (bench v7, `todo-agent-v7.md`) while
     * Astro loaded its routes and opened the database. One `schema_list_collections` — read-only, no
     * argument — walks that road the same way. It was `content_list` with no collection until the stand
     * acceptance of 16/10/2026: EmDash requires `collection`, so every warm-up was refused (TOOL_FAILED).
     */
    const warmEmdash = async (): Promise<string | null> => {
      if (platform !== 'emdash') return null
      const sitesRoot = resolveSitesRoot(undefined)
      const site = emdashSiteOf({
        siteKey: null,
        sessionCwd: `${sitesRoot}/${label}`,
        laneSiteKey: null,
        sitesRoot
      })
      if (!site.ok) return `emdash ${site.code}`
      try {
        const answer = await emdashMcp(config, site, mcpToolCall(EMDASH_WARM_TOOL, {}))
        return answer.ok ? null : `emdash ${answer.code}`
      } catch (error) {
        return `emdash ${error instanceof Error ? error.message : String(error)}`
      }
    }
    void Promise.all([
      ask('content.read', { describe: true }),
      // The home page in the site's default language: the relay reads the language off the path.
      ask('content.locate', { url: '/', warm: true })
    ]).then((failed) => {
      const said = failed.filter((line): line is string => line !== null)
      if (said.length > 0) warn(`[site-tools] pre-warm on ${label} did not finish: ${said.join('; ')}`)
    })
    // Its own line: a container that answers MCP slowly never holds back what the door reads said.
    void warmEmdash().then((said) => {
      if (said !== null) warn(`[site-tools] pre-warm of the MCP road on ${label} did not finish: ${said}`)
    })
  }

  const route: WebRoute = {
    kind: 'prefix',
    path: PREFIX,
    handler: (req, res) => {
      const pathname = (req.url ?? '').split('?')[0] ?? ''
      const rest = pathname.replace(/\/+$/, '')
      /**
       * The lane's own engine asking for one call on a site it created (`tracy-site-build`'s theme
       * stage). It rides the SAME viewer this tool already holds — nobody mints anything, and the
       * seat book still decides. Loopback only: dsh's own port answers without a cookie inside a
       * lane, and this door must never be reachable from outside, because from outside there is no
       * "the lane's engine" — only somebody claiming to be it.
       */
      if (req.method === 'POST' && rest === `${PREFIX}/apply`) {
        if (!isLoopback(req)) {
          writeJson(res, 404, { code: 'UNKNOWN_ROUTE' })
          return
        }
        void readJson(req, APPLY_MAX_BODY).then(async (body) => {
          const ask = applyRequest(body)
          if (!ask.ok) {
            writeJson(res, 400, { ok: false, code: 'BAD_REQUEST', error: ask.error })
            return
          }
          // The engine names the session it is building for; that session's log names who typed.
          const asked = (body ?? {}) as { sessionId?: unknown }
          const { plan } = planFor(typeof asked.sessionId === 'string' ? asked.sessionId : undefined)
          if (plan === null) {
            writeJson(res, 409, {
              ok: false,
              code: 'NO_VIEWER',
              error: 'Nobody has this lane open in a browser; the call acts as the person using it.'
            })
            return
          }
          // A content.contract call queues in the site's flight like every other one in this
          // process (D7): the component takes a single-writer lock (`GET_LOCK(…,0)`), and a build's
          // apply racing a conversation's inspect would answer one of them `writer_busy`.
          const send = () => relay(plan, ask.siteKey, ask.action, ask.params, ask.target)
          writeJson(
            res,
            200,
            await (ask.action === 'content.contract' ? memory.flight(labelOfKey(ask.siteKey), send) : send())
          )
        })
        return
      }
      /**
       * The build recording what a site wears (ADR 0023, "Addendum 29/09"): `tracy-site-build`'s
       * `check` stage hands its record here, and this tool — which holds the signed assertion of the
       * person who pressed — puts it to tracy-web, the only door that accepts it. Loopback only, like
       * `/apply` above. A conversation acting as a viewer cookie cannot sign, and says so (409).
       */
      if (req.method === 'POST' && rest === `${PREFIX}/design`) {
        if (!isLoopback(req)) {
          writeJson(res, 404, { code: 'UNKNOWN_ROUTE' })
          return
        }
        void readJson(req, APPLY_MAX_BODY).then(async (body) => {
          const asked = (body ?? {}) as { siteKey?: unknown; record?: unknown; sessionId?: unknown }
          const { plan, bound } = planFor(typeof asked.sessionId === 'string' ? asked.sessionId : undefined)
          // A build started from the form has nobody who typed: it is signed as the person who
          // pressed, this session's own viewer (`designSigner` says why that widens nothing).
          const signed = await designSigner(plan, {
            // Never the hello's host: see `designSigner`.
            origin: config.origin ?? gatewaySetting('MCP_TRACY_ORIGIN'),
            bound,
            mint: (ctx.get?.('tracyAssertion') as AssertionService | undefined)?.mint,
            http: config.fetch ?? fetch,
            warn
          })
          const request =
            typeof asked.siteKey === 'string' && asked.record && typeof asked.record === 'object'
              ? designPutRequest(signed, asked.siteKey, asked.record as Record<string, unknown>)
              : null
          if (request === null) {
            warn(`[site-design] build record not sent: 409 NO_ACTOR ${String(asked.siteKey)}`)
            writeJson(res, 409, { ok: false, code: 'NO_ACTOR', error: 'Nobody signed for this build.' })
            return
          }
          try {
            const answer = await (config.fetch ?? fetch)(request.url, {
              ...request.init,
              signal: AbortSignal.timeout(APPLY_TIMEOUT_MS)
            })
            writeJson(res, answer.status, await answer.json().catch(() => ({})))
          } catch (error) {
            writeJson(res, 502, {
              ok: false,
              code: 'COWORK_WEB_UNREACHABLE',
              error: error instanceof Error ? error.message : String(error)
            })
          }
        })
        return
      }
      /**
       * Whether a message of this conversation is held by a deploy, or did not run after it (#517):
       * what `tracy-chat-input` shows its author under the queue. `{ sessionId, seen: [<id>…] }` is
       * the page confirming it drew those notices (by the ids the door gave it), which starts each
       * one's time to be forgotten; a notice replaced since has a new id and is not confirmed.
       *
       * 🔒 A POST NAMING `sessionId` IN ITS JSON BODY, ON PURPOSE: that is the shape the seat
       * gateway (`dsh-passwords`) holds to the viewer's session grant for every session-scoped
       * request, and this door is on its list — a seat holder cannot ask about a conversation of
       * someone else on the same site. The site mount the page came through (`x-forwarded-prefix`,
       * set or deleted by tracy-web on every request) is a second fence: one site's page learns
       * nothing about a conversation held in another.
       */
      if (rest === `${PREFIX}/held`) {
        if (req.method !== 'POST') {
          writeJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' })
          return
        }
        void readJson(req, HELLO_MAX_BODY).then((body) => {
          const {
            sessionId: asked,
            seen,
            cut,
            wait
          } = (body ?? {}) as { sessionId?: unknown; seen?: unknown; cut?: unknown; wait?: unknown }
          const seenIds =
            seen === undefined
              ? []
              : Array.isArray(seen) &&
                  seen.length > 0 &&
                  seen.length <= HELD_SEEN_MAX &&
                  seen.every((id) => typeof id === 'string' && NOTICE_ID.test(id))
                ? (seen as string[])
                : null
          if (typeof asked !== 'string' || !SESSION_ID.test(asked) || seenIds === null) {
            writeJson(res, 400, { ok: false, code: 'BAD_REQUEST' })
            return
          }
          // `seen`: the notices the page drew in this conversation (sent only after drawing them).
          // Not written down: the page is told so, and confirms again.
          if (seenIds.length > 0 && !heldQueue.seen(asked, mountSite(req), seenIds)) {
            writeJson(res, 503, { ok: false, code: 'NOT_SAVED' })
            return
          }
          const { state, count, recorded, settled, id, earlier } = heldQueue.status(asked, mountSite(req))
          writeJson(res, 200, {
            ok: true,
            draining: draining(),
            state,
            count,
            recorded,
            settled,
            id,
            earlier,
            // Asked for by the turn card only (`cut: true`): when deploys cut a running turn of this
            // conversation (`cut-by-deploy.mjs`), so it tells an update from Tracy restarting on its
            // own. Never in the plain answer — a page from before reads that answer key for key.
            ...(cut === true ? { cutAt: cutTimes(asked, mountSite(req)) } : {}),
            // Asked for by the line under a running chat only (`wait: true`): what its turn waits on.
            ...(wait === true ? { waiting: waitOf(asked) } : {})
          })
        })
        return
      }
      /**
       * The page the customer has open beside this conversation, and whether they are writing
       * (`view.mjs`, `client/view-report.mjs`). Like `/held`, a POST naming `sessionId` in its JSON
       * body: the seat gateway holds that to the seat's own sessions, and the site is the mount the
       * page came through — never a name in the body — so a report cannot picture another site.
       */
      if (rest === `${PREFIX}/view`) {
        if (req.method !== 'POST') {
          writeJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' })
          return
        }
        void readJson(req, HELLO_MAX_BODY).then((body) => {
          // The same page, in Voice, says the words it is about to send (`voice-reply.mjs`).
          const voice = readVoiceReport(body)
          if (voice !== null) {
            if (voice.spoken !== null) voiceWords.mark(voice.sessionId, voice.spoken)
            writeJson(res, 200, { ok: true })
            return
          }
          const report = readViewReport(body)
          if (report === null) {
            writeJson(res, 400, { ok: false, code: 'BAD_REQUEST' })
            return
          }
          const lane = laneSiteKey()
          const label = lane !== null ? labelOfKey(lane) : mountSite(req)
          if (!viewsOn || typeof label !== 'string') {
            writeJson(res, 200, { ok: true, kept: false })
            return
          }
          views.report(report.sessionId, label, report.view, {
            warm: report.warm,
            changed: report.changed
          })
          writeJson(res, 200, { ok: true, kept: report.view !== null })
        })
        return
      }
      if (req.method !== 'POST' || rest !== `${PREFIX}/hello`) {
        writeJson(res, 404, { code: 'UNKNOWN_ROUTE' })
        return
      }
      void readJson(req, HELLO_MAX_BODY).then((body) => {
        const v = viewerFromHello(req.headers, body)
        if (v === null) {
          writeJson(res, 200, { ok: true, seen: false })
          return
        }
        const viewer: Viewer = { cookie: v.cookie, origin: v.origin, at: Date.now() }
        latest = viewer
        if (v.sessionId) bySession.set(v.sessionId, viewer)
        // A pre-warm that waited for this session's browser to say who it is (`prewarm`).
        const waiting = v.sessionId ? prewarmPending.get(v.sessionId) : undefined
        if (v.sessionId && waiting !== undefined) {
          prewarmPending.delete(v.sessionId)
          prewarm(waiting.label, v.sessionId, waiting.platform)
        }
        for (const [sid, old] of bySession) if (Date.now() - old.at > VIEWER_TTL_MS) bySession.delete(sid)
        writeJson(res, 200, { ok: true, seen: true, bound: v.sessionId !== null })
      })
    }
  }

  // 🔒 In `ctx.effect`: without it HMR or a plugin toggle leaves the old registration, and the
  // next load throws "duplicate route".
  ctx.effect(() => {
    const dispose = ctx.webServer.register(route)
    return () => dispose()
  }, 'tracy-site-tools: hello route')

  /**
   * ONE WORKSPACE, ONE SITE: every agent step in a site's workspace carries that site's facts
   * (`site-context.mjs`), sent again only when they change or were compacted out of sight; never into
   * an empty first step, which owns a no-step turn (`agent-instructions`' rule).
   *
   * 🔒 THE FACTS GO BEFORE THE CUSTOMER'S WORDS (S4). DeepSeek caches by prefix: after the system
   * text and the tools, the first thing that differs between two conversations ends the cached part.
   * The facts are the same bytes for every conversation on a site (≈ 1.8K tokens) and the customer's
   * message never is, so the facts go in front of it — measured 26/09, step 1 of every conversation
   * paid 36–39 % of its input uncached with them behind it. A step with no customer message (after a
   * compaction) has nothing to go in front of: the facts join its end. The build state and the loop
   * notices change within a conversation, so they stay after everything this step carries (CS3).
   *
   * 🔒 AND SO DOES dsh'S OWN STABLE CONTEXT (09/10, `step-order.mjs`): the site's AGENTS.md, the
   * runtime context and the skill catalog are the same bytes for every conversation on a site, yet dsh
   * folds them in AFTER the customer's message. This listener is registered FIRST in the waterfall
   * (`prepend`), so it sees what every other listener added — the catalog included — and moves those
   * three in front of the customer, ahead of the facts. Only this step's own messages move: what is
   * already in the log never does, so the prompt stays append-only within and across turns.
   *
   * 🔒 THE WAITS RUN SIDE BY SIDE (09/10): the design pull (≤ 2.5 s) and the context it feeds, the
   * open page's picture (≤ 3.5 s) and the "site changed" read (≤ 3 s) depend on nothing of each other,
   * so they start together and each keeps its own bound; until then they ran one after another before
   * the model's first call. What they add is said in the same order as before.
   *
   * STEP BUDGET: once a turn has spent ten steps without changing the site, one notice tells the
   * agent to stop exploring (`stepBudget`). It may join a step with no other message, because it is
   * only due while the latest step called a tool — a step the loop takes anyway.
   *
   * TURN LENGTH: a second, independent brake on the turn as a WHOLE (`turnLength`). The first one
   * measures unbroken LOOKING, so a turn that writes every few steps resets it forever — measured
   * 19/09 on `demowpnam`: 125 steps, 145 calls, 7m04s, and one notice at step 11, because the agent
   * was editing its own file the whole way. Both are asked on every step; they answer different
   * questions and a turn can fail either way.
   */
  // A DEPLOY WAITS FOR A RUNNING TURN, AND HOLDS WHAT IS SENT WHILE IT WAITS (#295, `deploy-hold.mjs`).
  // Only a conversation in a site's workspace holds a lease: the site is what a cut turn leaves
  // half changed.
  const chats = chatLeases()
  ctx.on('agent/status', ({ agent, status }) => {
    const sessionId = chatSessionId(agent)
    if (sessionId === null) return
    let key = laneSiteKey()
    if (key === null && status === 'running') {
      try {
        key = siteOf(String(agent?.session?.header?.cwd ?? ''), resolveSitesRoot(undefined)).label
      } catch {
        key = null
      }
    }
    chats.status(sessionId, status, key)
    // The relay names a conversation by its session id (`exec.agent.session.id`), so that is the key.
    const conversation = typeof agent?.session?.id === 'string' ? agent.session.id : sessionId
    if (status !== 'running') turnEnded(conversation)
  })
  // A turn waiting only on its customer's answer lets its lease go until the answer comes (#561).
  // Prepended: it has to be outside the listener that answers, or it never runs.
  ctx.on('user-questions/request', questionLeaseWaterfall(chats), true)
  ctx.effect(() => () => chats.releaseAll(), 'tracy-site-tools: chat deploy leases')
  // The hold's listeners and its release pass (`deploy-hold.mjs`): `agents` and `sessionController`
  // are read there with `ctx.get`, not injected — `inject` has no optional half, and a composition
  // without them should lose this feature, not the whole tool.
  const { tick } = wireDeployHold(ctx as unknown as DeployHoldContext, {
    queue: heldQueue,
    site: sessionSite,
    warn
  })
  ctx.effect(() => {
    const first = setTimeout(tick, HELD_FIRST_MS)
    const timer = setInterval(tick, HELD_EVERY_MS)
    first.unref()
    timer.unref()
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, 'tracy-site-tools: release held follow-ups')

  /**
   * The names of the tools each agent is sent, read once per agent: the rules and the step budget
   * name a shell or a plan only where the agent has one (`toolReach`, site-context.mjs). Kept, not
   * re-read: the tools array is decided when the agent is made (CS1) — only a deferred tool of the
   * redesign/build road may join it later, and `toolReach` reads none of those — so one reading keeps
   * the context byte-stable for the whole conversation. A reading that fails is kept
   * as null, which is every rule as before.
   */
  const sentTools = new WeakMap<object, readonly string[] | null>()
  const toolsOf = (agent: unknown): readonly string[] | null => {
    if (agent === null || typeof agent !== 'object') return null
    if (sentTools.has(agent)) return sentTools.get(agent) ?? null
    let names: readonly string[] | null = null
    try {
      const schemas = ctx.tools.schemas?.(agent)
      names = Array.isArray(schemas) && schemas.length > 0 ? schemas.map((tool) => tool.name) : null
    } catch {
      names = null
    }
    sentTools.set(agent, names)
    return names
  }

  /** Sessions whose look was edited outside tracy_site since their last step: site and what changed it. */
  const lookPending = new Map<string, { label: string; what: string }>()
  // What a bash command or a file tool added over the design-system roles, read around the call
  // (`tools/execute` below; the read after it runs on while the result goes back), taken by the next
  // step's notice; the pins already said this turn, never twice; and the bodies this conversation read,
  // which a whole-body `content.update` is judged against (`withRolePins`). All bounded.
  type EditPins = { label: string; what: string; pins: RolePin[]; unchecked: string[]; worn: boolean }
  type EditWork = { label: string; files: string[]; work: Promise<EditPins | null> }
  const editPins = new Map<string, EditWork[]>()
  const pinsSaid = new Map<string, Set<string>>()
  const bodiesSeen = new Map<string, Map<string, string>>()
  const bounded = <K, V>(map: Map<K, V>, max: number) => {
    while (map.size > max) map.delete(map.keys().next().value as K)
  }
  // per conversation (20 bodies each, the newest kept) and for 100 conversations: one busy session never
  // pushes out another's bodies (review, 20/10/2026)
  const bodyMemory = (sid: string | null | undefined, label: string) => {
    // a write takes the conversation's place as the newest; a look never makes one
    const mine = () => {
      if (typeof sid !== 'string') return null
      const had = bodiesSeen.get(sid) ?? new Map<string, string>()
      bodiesSeen.delete(sid)
      bodiesSeen.set(sid, had)
      bounded(bodiesSeen, 100)
      return had
    }
    const look = () => (typeof sid === 'string' ? bodiesSeen.get(sid) : undefined)
    return {
      seen: (address: string) => look()?.get(`${label}|${address}`),
      keep: (address: string, text: string) => {
        const m = mine()
        if (m === null) return
        m.delete(`${label}|${address}`)
        m.set(`${label}|${address}`, text)
        // 40: room for a Joomla article's two fields on twenty records
        bounded(m, 40)
      },
      append: (record: string, text: string) => {
        const m = look()
        const key = [...(m ?? new Map<string, string>()).keys()].find((k) =>
          k.startsWith(`${label}|${record}|`)
        )
        if (m !== undefined && key !== undefined) m.set(key, `${m.get(key) ?? ''}\n${text}`)
      },
      fieldsOf: (record: string) =>
        [...(look() ?? new Map<string, string>())]
          .filter(([key]) => key.startsWith(`${label}|${record}|`))
          .map(([, text]) => text)
    }
  }
  // The language each conversation is in (`chatMainLanguage`, David 15/10/2026), kept once known: a
  // compacted history may no longer carry the first message. Bounded: the oldest entry goes first.
  const mainLanguages = new Map<string, string>()
  const mainLanguageOf = (sessionId: unknown, spoke: readonly { content?: unknown }[]): string => {
    if (typeof sessionId !== 'string') return chatMainLanguage(spoke)
    const known = mainLanguages.get(sessionId)
    if (known) return known
    const found = chatMainLanguage(spoke)
    if (found) {
      mainLanguages.set(sessionId, found)
      if (mainLanguages.size > 5000) mainLanguages.delete(mainLanguages.keys().next().value as string)
    }
    return found
  }

  /**
   * The page the customer has open, as one picture beside their message (`view.mjs`): EVERY customer
   * message gets it — words, a comment, words with pictures of their own (theirs are answered as
   * always and this one comes in addition) — as long as there is a page open and the model reads
   * pictures. It rides the log like every notice: a context row, not a chat bubble. Any failure is
   * one log line and the turn goes on without it (null).
   */
  async function openPagePicture(
    agent: PreStepInput['agent'],
    sessionId: string,
    last: unknown
  ): Promise<unknown | null> {
    const label = sessionSite(agent)
    if (label === null || !(await agentReadsImages(ctx, agent))) return null
    try {
      // 🔒 A COMMENT DOES NOT WAIT (30/09): the side card wrote it, so no keystroke drew a picture for
      // it, and waiting for a draw nobody asked for delayed its first step by ~VIEW_WAIT_MS. The last
      // message decides; it takes the picture only when one is ready, and words keep the wait.
      const ready = isCommentMessage((last as { content?: unknown }).content)
      const shot = await views.take(sessionId, label, { ready })
      const picture = shot === null ? null : await storePicture(ctx, shot)
      if (shot === null || picture === null) return null
      const seen = viewNotice(shot, { ownPictures: hasOwnPictures(last) })
      return {
        id: randomUUID(),
        role: 'user',
        content: [
          { type: 'text', text: seen.text },
          { type: 'image', attachment: picture }
        ],
        source: noticeSource(VIEW_PLUGIN, seen.summary)
      }
    } catch (error) {
      warn(
        `[site-tools] the page open on ${label} could not be pictured: ${error instanceof Error ? error.message : String(error)}`
      )
      return null
    }
  }

  /**
   * V7S-1 (acceptance v7, 30/09): the site changed after this conversation's last site call — another
   * conversation or person wrote it (the door says when the last write was its own, V8-1) — so what it
   * remembers may be stale; said on every turn a person speaks, typed or sent from the page, until a
   * site call is newer (`siteChangedNotice`). Asked only of a conversation that has looked at its
   * site: one that never did remembers nothing (null).
   */
  async function siteChangedSince(
    agent: PreStepInput['agent'],
    sessionId: string
  ): Promise<{ text: string; summary: string } | null> {
    const lookedAt = lastSiteLookAt(agent?.session)
    const label = lookedAt === null ? null : sessionSite(agent)
    const { plan } = label === null ? { plan: null } : planFor(sessionId)
    if (label === null || plan === null) return null
    const last = await siteChangedAtOf(config, plan, label, sessionId, warn)
    // Tracy's word that the site changed (another person, another host's road): pictures of it drawn
    // before then are out of date for the next message. Learned here, never waited for by a picture.
    if (last !== null) views.wrote(label, Date.parse(last.changedAt))
    return siteChangedNotice({
      changedAt: last?.changedAt ?? null,
      lookedAt,
      byThisConversation: last?.byThisConversation
    })
  }

  /**
   * The writes of this conversation's earlier stopped turns (review Q2, `stopped-writes.mjs`): asked of
   * tracy-web on a root conversation's step that carries the customer's words — after this host's own
   * reports of them are off the wire — and said as one notice, once (the door marks what it answers).
   * Kept in tracy-web, so a restart of this host between the Stop and the next turn loses nothing.
   */
  async function stoppedWritesSince(
    agent: PreStepInput['agent'],
    sessionId: string
  ): Promise<{ text: string; summary: string } | null> {
    const turnId = turnIdOf(sessionId)
    if (turnId === null || !turnId.startsWith(`${sessionId}:`)) return null
    const label = sessionSite(agent)
    const { plan } = label === null ? { plan: null } : planFor(sessionId)
    if (label === null || plan === null) return null
    await stopped.settled(sessionId)
    return stoppedWritesNotice(await takeStoppedWrites(config, plan, label, sessionId, turnId, warn))
  }

  // Registered FIRST in the waterfall (`prepend`): see the step order above (`step-order.mjs`).
  const stepListener = async (input: PreStepInput, next: () => Promise<PreStepDecision>) => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    const tools = toolsOf(input.agent)
    // A customer's new message ends this turn's inspect snapshots and WordPress apply id, and it is
    // an answer to any question asked before it — a refused delete may now go ahead, unless the
    // message (the latest one, when a step claims several) opens with a refusal (D8, D34).
    const sessionId = input.agent?.session?.id
    if (typeof sessionId === 'string' && typeof input.turn === 'number') turns.noteStep(sessionId, input.turn)
    const spoke = (input.messages ?? []).filter(isCustomerMessage)
    if (typeof sessionId === 'string' && spoke.length > 0) {
      memory.newTurn(sessionId, messageText(spoke.at(-1)))
      // a new turn may name a pin again: "once" is per turn (council, 20/10/2026)
      pinsSaid.delete(sessionId)
    }
    // The ask a visual check judges against, frozen here: the customer's words and the picture of their
    // page that was ALREADY drawn when the turn began (`ready`: nothing is drawn or waited for, and a
    // picture finished after this moment could already show this turn's writes). A second message in the
    // same turn renews the words and keeps the picture. The store gives no picture drawn before the
    // site's last write, by this conversation's earlier turn or any other (`view.mjs` `wrote`); this
    // turn's own writes come after this moment, and the picture once frozen is never asked again.
    if (
      checkMode !== 'off' &&
      typeof sessionId === 'string' &&
      typeof input.turn === 'number' &&
      spoke.length > 0
    ) {
      const last = spoke.at(-1) as { content?: unknown }
      const kept = turnAsks.get(sessionId)
      const ask =
        kept !== undefined && kept.turn === input.turn
          ? kept
          : { turn: input.turn, text: '', comment: false, at: Date.now(), before: null, checked: false }
      ask.text = messageText(last)
      ask.comment = isCommentMessage(last.content)
      turnAsks.set(sessionId, ask)
      const label = sessionSite(input.agent)
      if (label !== null && ask.before === null) {
        void views
          .take(sessionId, label, { ready: true })
          .then((shot) => {
            if (shot !== null && shot.takenAt <= ask.at && ask.before === null) ask.before = shot
            // No picture ready: one is drawn now, while the agent reads, for its first write to take
            // (`check-pages.mjs` Q1b) — once a turn, and only before anything of the turn was written.
            if (ask.before === null && ask.early === undefined && ask.wroteAt === undefined)
              ask.early = earlyPicture({
                view: earlyView({
                  comment: ask.comment ? commentPage(ask.text) : null,
                  open: views.viewOf(sessionId, label),
                  lastRead: pageReads.of(sessionId)[0]?.path ?? null
                }),
                draw: (view) => views.draw(label, view),
                lastWrite: () => views.lastWrite(label),
                wroteAt: () => ask.wroteAt
              })
          })
          .catch(() => {})
      }
    }
    // Session format V4 refuses the retired `plugin` source kind on write: the notice carries this
    // plugin's own kind, and which notice it is travels as `producer` (`noticeSource`, site-context.mjs).
    const notice = (producer: string, text: string, summary: string) => ({
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text }],
      source: noticeSource(producer, summary)
    })
    const facts: unknown[] = []
    const added: unknown[] = []
    if (typeof sessionId === 'string' && sessionId.startsWith('session-widget-')) {
      const cwd = input.agent?.session?.header?.cwd
      const home = path.resolve(process.env.ONBOARDING_HOME || '/desk-home/onboarding')
      if (typeof cwd !== 'string' || path.dirname(path.resolve(cwd)) !== home)
        throw new WidgetContextUnavailable()
      const { plan } = planFor(sessionId)
      if (!plan) throw new WidgetContextUnavailable()
      let currentBuild: unknown = null
      const session = input.agent?.session
      // A compacted receipt remains in the durable log but no longer belongs to the model's context.
      const visibleEvents = session?.eventAt
        ? Array.from(session.surface?.nodes ?? [], (seq) => session.eventAt?.(seq))
        : []
      const imported = await widgetNativeContext({
        sessionId,
        events: visibleEvents,
        fetchContext: async () => {
          const url = new URL('/api/widget-native/context', plan.origin)
          url.searchParams.set('session', sessionId)
          const headers: Record<string, string> =
            plan.as === 'prompter'
              ? { 'x-tracy-actor': actorHeader(plan), accept: 'application/json' }
              : { cookie: plan.cookie, accept: 'application/json' }
          const response = await (config.fetch ?? fetch)(url, {
            headers,
            redirect: 'error',
            signal: AbortSignal.timeout(5000)
          })
          if (!response.ok) throw new WidgetContextUnavailable()
          const value = await response.json()
          if (
            !value?.context ||
            value.contextHash !== createHash('sha256').update(JSON.stringify(value.context)).digest('hex')
          )
            throw new WidgetContextUnavailable()
          currentBuild = value.currentBuild
          return value.context
        }
      })
      if (imported)
        added.push({
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: imported.text }],
          source: imported.source
        })
      if (currentBuild)
        facts.push(
          notice(
            'tracy-site-tools:widget-build',
            'Current verified website creation status. This read-only snapshot does not authorize new writes.\n' +
              JSON.stringify(currentBuild),
            'Current website creation status'
          )
        )
    }
    const sitesRoot = laneSiteKey() === null ? resolveSitesRoot(undefined) : null
    let hostLabel: string | null = null
    if (sitesRoot !== null) {
      try {
        hostLabel = siteOf(String(input.agent?.session?.header?.cwd ?? ''), sitesRoot).label
      } catch {
        // Onboarding has no site context, but its imported discovery context still belongs in this step.
        if (facts.length === 0 && added.length === 0) return decision
        const messages = orderStepMessages(decision.messages, facts, added, isCustomerMessage)
        return messages === decision.messages ? decision : { ...decision, messages: [...messages] }
      }
    }
    // 🔒 STARTED NOW, AWAITED WHERE THEY ARE SAID: none of these reads depends on another, so the
    // step waits for the slowest, not their sum. Each is marked handled at once, so a failure that
    // surfaces while an earlier await is pending is still thrown — at its own await, as before.
    const early = <T>(work: Promise<T>): Promise<T> => {
      work.catch(() => {})
      return work
    }
    const newWords = decision.messages.length > 0 && spoke.length > 0
    const filesWork =
      hostLabel !== null && sitesRoot !== null && newWords
        ? early(filesTabPictures(`${sitesRoot}/${hostLabel}`))
        : null
    const notesStore = hostLabel !== null && sitesRoot !== null ? storeDirOf(sitesRoot, hostLabel) : null
    const notesWork = hostLabel !== null && newWords ? early(readNotes(notesStore)) : null
    const pictureWork =
      viewsOn && typeof sessionId === 'string' && spoke.length > 0
        ? early(openPagePicture(input.agent, sessionId, spoke.at(-1)))
        : null
    const changedWork =
      typeof sessionId === 'string' && spoke.length > 0
        ? early(siteChangedSince(input.agent, sessionId))
        : null
    // Review Q2: what an earlier turn of this conversation wrote after the customer stopped it, told once.
    const stoppedWork =
      typeof sessionId === 'string' && spoke.length > 0
        ? early(stoppedWritesSince(input.agent, sessionId))
        : null
    if (sitesRoot !== null && hostLabel !== null) {
      const label = hostLabel
      if (decision.messages.length > 0) {
        // The design-system slot the site wears, read from its container beside the design pull and
        // bounded by the same wait: a slower read is kept for the next step (`ds-slot-worn.mjs`).
        // With it, the roles the template reads (`siteRuler`): the line of a site wearing nothing names
        // them only when its template reads them.
        const slotWork = early(
          siteRuler(config, resolveSitesRoot(undefined), label, { waitMs: SLOT_WAIT_MS })
        )
        // Whether the operator lets the chat apply a design system (`chat-design-system`), read at
        // Tracy beside the slot; a Tracy that does not answer is off (`chat-design-route.mjs`).
        const routesWork = early(
          designRoutesAt(
            config.origin ?? gatewaySetting('MCP_TRACY_ORIGIN'),
            config.fetch as typeof fetch | undefined
          )
        )
        // ADR 0023, "Addendum 29/09": tracy-web owns the design record; the folder's file is the
        // copy this context quotes. Refreshed first, kept as it is when tracy-web does not answer.
        const folder = `${sitesRoot}/${label}`
        const key = await siteKeyInFolder(folder)
        if (key !== null)
          await pullDesign(folder, () =>
            fetchDesign(
              designGetRequest(
                planFor(typeof sessionId === 'string' ? sessionId : undefined).plan,
                key,
                config.origin ?? gatewaySetting('MCP_TRACY_ORIGIN')
              )
            )
          )
        const context = await siteContext(
          `${sitesRoot}/${label}`,
          label,
          detectPlatform,
          sessionPreset(input.agent),
          {
            wordpressReadBack: WORDPRESS_READ_BACK,
            tools,
            // `undefined` (the read did not answer) stays unknown: only a `null` says the site wears nothing.
            slot: (await slotWork).slot,
            roles: (await slotWork).roles,
            chatDesign: await routesWork
          }
        )
        if (context !== null && lastSiteContext(input.agent) !== context.text)
          facts.push(notice(SITE_CONTEXT_PLUGIN, context.text, context.summary))
        // 🔒 THE BUILD'S STATE TRAVELS ALONE (T-A, plan v2.1 P1 item 14): a stage change or a
        // running ↔ paused flip re-sends ≤ 300 characters, never the 7–10k-character rules block,
        // which stays byte-stable. Sent after the context, at the end of what this step carries (CS3).
        // A build moving on may have written the site behind every snapshot of it: they are stale,
        // and so is its served-locale memo if it added a language, and so are the body lengths this
        // conversation read (D8, D11, D6′).
        //
        // 🔒 STALE ONLY WHEN THE STATE CHANGED, NOT WHEN IT IS FIRST SAID. The notice goes out on the
        // first step of every conversation on a built site (no earlier notice to compare with), and
        // invalidating there threw away every OTHER conversation's inspect snapshot and the site's
        // served-locale memo each time someone opened a chat, with nothing changed (review, 25/09).
        const state = context === null ? null : siteStateNotice(context.state)
        const previous = lastSiteState(input.agent)
        if (state !== null && previous !== state.text) {
          added.push(notice(SITE_STATE_PLUGIN, state.text, state.summary))
          if (previous !== null) {
            memory.invalidateSite(label)
            views.wrote(label)
            memory.forgetReads(sessionId)
            emdashState.dropServedLocales(label)
            emdashState.dropMedia(label)
          }
        }
        // 🔒 TODAY IS A NOTICE OF ITS OWN, after the customer's words like the build's state: a request
        // with a date makes the model ask whether it is past, and without this it hunted for the day with
        // `bash date` or file-tool globs over `.webroot` logs (30 s timeouts; round-7 add-a-post runs).
        // Once per conversation, and again only when the UTC day changed under it — never through the
        // build's notice, whose change drops every read snapshot (`todayNotice`, site-context.mjs).
        const today = todayNotice((config.now ?? (() => new Date()))())
        if (today !== null && lastToday(input.agent) !== today.text)
          added.push(notice(TODAY_PLUGIN, today.text, today.summary))
        // 🔒 THE PICTURES IN THE FILES TAB, when this step carries the customer's message: a file there is
        // in the site folder and not in the media library until `media.upload {file}`, and models that were
        // not told hunted for it first (`media.scan`, glob, `find`: about 20 calls in 5 round-7 runs). Its own
        // notice like the date, once per conversation and again only when the list changes
        // (`filesNotice`, site-context.mjs); the folder is read here, never in the cached context.
        if (filesWork !== null) {
          const files = filesNotice(await filesWork)
          if (files !== null && lastFiles(input.agent) !== files.text)
            added.push(notice(FILES_PLUGIN, files.text, files.summary))
        }
        // 🔒 THE SITE'S NOTES, AS A NOTICE OF THEIR OWN (site-notes.mjs). Sent when the notes differ from
        // the last one this conversation can still see — the first step of a conversation on a site that
        // has notes, a change made in this or another conversation, and again if the earlier one was
        // compacted out of sight. A site with none says nothing, so the feature costs it no token. Read
        // here from the host's own store (`<sitesRoot>/.site-notes/<label>`, outside the folder the file
        // tools reach) every time a customer message arrives; never cached across conversations, so
        // another site's notes cannot be served to this one.
        if (notesWork !== null) {
          const store = notesStore
          const last = lastNotes(input.agent)
          const said = notesNotice(await notesWork, last !== null)
          if (said !== null && last !== said.text) added.push(notice(NOTES_PLUGIN, said.text, said.summary))
          // 🔒 KEEPING A WISH IS THE HOST'S JOB, BESIDE THE STEP (site-notes.mjs `captureWishes`). The customer's
          // own message — a claimed `user` message, never a notice, a tool answer or the model's words — is
          // looked at only when it carries the marks of a lasting wish, by one small side call on the
          // conversation's own route, thinking off. Not awaited: the step goes on at once, and the note lands
          // for the next message or conversation. No model runtime or no route: nothing is kept, nothing fails.
          const wish = messageText(spoke.at(-1))
          const llm = ctx.get?.('llm')
          if (store !== null && llm && mayHoldWish(wish)) {
            const route = sessionRoute(
              { agent: input.agent } as Parameters<typeof sessionRoute>[0],
              ctx.get?.('agentDefaultModel') as Parameters<typeof sessionRoute>[1]
            )
            if (route !== null) {
              added.push(notice(WISH_PLUGIN, WISH_KEPT.text, WISH_KEPT.summary))
              void captureWishes({
                llm: llm as Parameters<typeof captureWishes>[0]['llm'],
                route,
                storeDir: store,
                message: wish,
                session: typeof sessionId === 'string' ? sessionId : null,
                // The plugin's own clock, like the today notice above: a note's date is the day the
                // host says it is, never a second clock read behind it.
                ...(config.now ? { now: config.now } : {})
              })
            }
          }
        }
      }
      // ADR 0023, "Addendum 30/09": a look edited outside tracy_site since the last step (a file
      // tool, bash, EmDash's site.rebuild — `lookEdit`) is measured now, before the model's next
      // call, and the findings arrive as a notice. Taken once: the next edit marks it again. On EVERY
      // step, not only one that carries messages: the edit is mid-turn, and so is the step after it.
      const pending = typeof sessionId === 'string' ? lookPending.get(sessionId) : undefined
      if (typeof sessionId === 'string' && pending !== undefined && pending.label === label) {
        lookPending.delete(sessionId)
        const got = await measureWithin((page: string) => driftMeasure(label, null, sessionId, page), '/')
        const said = driftNotice(got, pending.what)
        added.push(notice(DESIGN_DRIFT_PLUGIN, said.text, said.summary))
        warn(`[site-design] ${label} after ${pending.what}: ${said.summary}`)
      }
      // What the last calls added as literals over the design-system roles (`role-pins.mjs`, read around
      // each bash command and file tool by `tools/execute`), named with the var() to write — on its own,
      // whatever else happened to the drift measure. Each pin once a turn; at most eight said a step, the
      // rest on the next.
      const works = typeof sessionId === 'string' ? editPins.get(sessionId) : undefined
      if (typeof sessionId === 'string' && works !== undefined) {
        editPins.delete(sessionId)
        try {
          // a read slower than the bound is said as not checked, never as clean
          const late = new Promise<'late'>((resolve) => setTimeout(() => resolve('late'), 8_000).unref?.())
          const got = (
            await Promise.all(
              works.map(async (w): Promise<EditPins | null> => {
                const g = await Promise.race([w.work.catch(() => null), late])
                return g === 'late'
                  ? { label: w.label, what: w.files[0] ?? '', worn: false, unchecked: w.files, pins: [] }
                  : g
              })
            )
          ).filter((g): g is EditPins => g !== null && g.label === label)
          const once = pinsSaid.get(sessionId) ?? new Set<string>()
          pinsSaid.delete(sessionId)
          pinsSaid.set(sessionId, once)
          bounded(pinsSaid, 200)
          const unsaid = [
            ...new Map(
              got
                .flatMap((g) => g.pins)
                .filter((p) => !once.has(`${label}|${canonicalProp(p.prop)}|${p.value}`))
                .map((p) => [`${canonicalProp(p.prop)}|${p.value}`, p])
            ).values()
          ]
          const fresh = unsaid.slice(0, 8)
          for (const p of fresh) once.add(`${label}|${canonicalProp(p.prop)}|${p.value}`)
          // past eight, the rest wait for the next step
          if (unsaid.length > 8) {
            const rest: EditPins = {
              label,
              what: got[0]?.what ?? '',
              worn: got.some((g) => g.worn),
              unchecked: [],
              pins: unsaid.slice(8)
            }
            editPins.set(sessionId, [
              ...(editPins.get(sessionId) ?? []),
              { label, files: [], work: Promise.resolve(rest) }
            ])
          }
          const unchecked = [...new Set(got.flatMap((g) => g.unchecked))].slice(0, 6)
          const worn = got.some((g) => g.worn)
          const what = [...new Set(got.map((g) => g.what.split('/').at(-1)))].join(', ')
          const parts = [
            ...(fresh.length > 0 ? [rolePinsNext(fresh, worn)] : []),
            ...(unchecked.length > 0
              ? [
                  `Not checked for literals over the design-system roles: ${unchecked.join(', ')} (not read — missing, not a plain file, too large, or the read failed); keep every colour, radius and font there written through a role.`
                ]
              : [])
          ]
          if (parts.length > 0) {
            added.push(
              notice(
                DESIGN_DRIFT_PLUGIN,
                `After your look edit (${what}): ${parts.join(' ')}`,
                `role pins: ${fresh.length}${unchecked.length > 0 ? `, ${unchecked.length} not checked` : ''}`
              )
            )
            warn(
              `[site-design] ${label} after ${what}: ${fresh.length} role pin(s), ${unchecked.length} not checked`
            )
          }
        } catch {
          // a checker that fails says nothing: the edit stands
        }
      }
    }
    // Step budget (with its seconds, E4.3), turn length, then the refusal streak LAST (E4.2, CS3) —
    // one call, so a notice cannot be dropped or reordered here (`loopNotices`, P12).
    // A demo or own-site build has the room a whole site takes (`buildTurns`, `loopNotices` `build`).
    const conversation = String(input.agent?.session?.id ?? '')
    const building = isBuild(conversation, input.agent)
    for (const n of loopNotices(input.agent, {
      tools,
      build: building && (buildSizes.get(conversation) ?? true)
    }))
      added.push(notice(n.plugin, n.text, n.summary))
    // H6: a message of Browser-tab comments gets its rule once, as the step claims it — one comment
    // its reply line (L8), several do every item, carry `comment: n`, one line per number
    // (`prompter.mjs` `commentItemsRule`).
    const items = spoke.length > 0 ? commentItemsRule((spoke.at(-1) as { content?: unknown }).content) : null
    if (items !== null) added.push(notice(COMMENT_ITEMS_PLUGIN, items.text, items.summary))
    // The page the customer has open, as one picture beside their message (`openPagePicture`).
    const picture = pictureWork === null ? null : await pictureWork
    if (picture !== null) added.push(picture)
    // V7S-1: the site changed after this conversation's last site call (`siteChangedSince`).
    const changed = changedWork === null ? null : await changedWork
    if (changed !== null) added.push(notice(SITE_CHANGED_PLUGIN, changed.text, changed.summary))
    const stoppedSaid = stoppedWork === null ? null : await stoppedWork
    if (stoppedSaid !== null) added.push(notice(STOPPED_WRITES_PLUGIN, stoppedSaid.text, stoppedSaid.summary))
    // V4S-3 (acceptance v4, 30/09): a typed turn gets the plain-words rule a comment rule carries —
    // no tool name, code or receipt id in the reply (`prompter.mjs` `plainReplyRule`).
    const plain = spoke.length > 0 ? plainReplyRule((spoke.at(-1) as { content?: unknown }).content) : null
    if (plain !== null) added.push(notice(PLAIN_REPLY_PLUGIN, plain.text, plain.summary))
    // Voice (17/10/2026): the reply opens with what can be read out loud (`voice-reply.mjs`).
    const spoken =
      spoke.length > 0
        ? voiceReplyRule(
            (spoke.at(-1) as { content?: unknown }).content,
            typeof sessionId === 'string' &&
              voiceWords.take(sessionId, (spoke.at(-1) as { content?: unknown }).content)
          )
        : null
    if (spoken !== null) added.push(notice(VOICE_REPLY_PLUGIN, spoken.text, spoken.summary))
    // Bug 30/09: the reply's language NAMED, once per turn a person speaks, typed or sent from the
    // page — the last words the step carries (`prompter.mjs` `replyLanguageRule`), in the language the
    // conversation is in unless those words are plainly in another (David 15/10/2026).
    const language =
      spoke.length > 0
        ? replyLanguageRule(
            (spoke.at(-1) as { content?: unknown }).content,
            mainLanguageOf(sessionId, spoke as { content?: unknown }[])
          )
        : null
    if (language !== null) added.push(notice(REPLY_LANGUAGE_PLUGIN, language.text, language.summary))
    // The facts and dsh's stable context in front of the customer, the per-turn notices behind
    // (`orderStepMessages`, step-order.mjs). Nothing to add or move: the step goes in as it came.
    const messages = orderStepMessages(decision.messages, facts, added, isCustomerMessage)
    return messages === decision.messages ? decision : { ...decision, messages: [...messages] }
  }
  ctx.on('agent/pre-step', stepListener, true)

  /**
   * A BUILD'S REASONING, SET APART FROM A CHAT'S (plan "10/10" §7 S7, 26/10/2026): in local round 33 reasoning was ~45 %
   * of a WordPress build's 208K output tokens at the host's `low`. `TRACY_BUILD_REASONING_EFFORT` (off, low, high, max)
   * sets the effort of a build's requests only; unset, a build reasons as every conversation does. A switch for an A/B
   * measured with the screenshots, never a default changed on faith.
   */
  const buildEffort = gatewaySetting('TRACY_BUILD_REASONING_EFFORT')
  if (buildEffort !== null && ['off', 'low', 'high', 'max'].includes(buildEffort))
    ctx.on('agent/request', async ({ agent }, next) => {
      const config = await next()
      const sessionId = agent?.session?.id
      if (typeof sessionId !== 'string' || !isBuild(sessionId, agent)) return config
      return { ...config, reasoningEffort: buildEffort }
    })

  /**
   * A BUILD DOES NOT END ON A FAILED CHECK WHILE CHECKS REMAIN (`checkAgainStep`): a demo or own-site build about to
   * close its turn is steered one more step to repair and check again, at most `CHECK_AGAIN_STEERS` times between two checks, so a
   * model that will not continue still ends. The steered step's writes land: the turn its host closed opens again
   * (tracy-site-tabs `reopen`). 🔒 NEVER THROWS: a listener that throws here ends the turn in `error`.
   */
  // 🔒 COUNTED SINCE THE LAST CHECK, NOT PER TURN (local round 21, 25/10/2026): a WordPress build stopped twice
  // between two checks, spent the turn's three steers before its fourth check and ended there, a check unspent.
  // At most `CHECK_AGAIN_STEERS` steers between two checks, so the whole is bounded by the checks a build has.
  const CHECK_AGAIN_STEERS = 2
  const checkAgainSent = new Map<string, { turn: unknown; checks: number; n: number }>()
  ctx.on('agent/turn-stopping', ({ agent, turn, signal }) => {
    try {
      const sessionId = agent?.session?.id
      if (typeof sessionId !== 'string' || signal?.aborted) return
      if (!isBuild(sessionId, agent)) return
      const events = (agent?.session?.snapshotEvents?.() ?? []) as readonly {
        type?: string
        data?: unknown
      }[]
      const checks = buildChecks(events).checks
      const sent = checkAgainSent.get(sessionId)
      const n = sent?.turn === turn && sent.checks === checks ? sent.n : 0
      if (n >= CHECK_AGAIN_STEERS) return
      const text = checkAgainStep(events)
      if (text === null) return
      checkAgainSent.set(sessionId, { turn, checks, n: n + 1 })
      while (checkAgainSent.size > 500) checkAgainSent.delete(checkAgainSent.keys().next().value as string)
      agent?.steer?.({
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text }],
        source: noticeSource(CHECK_AGAIN_PLUGIN, `check again ${checks}.${n}`)
      })
      info(`[site-tools] check again ${sessionId}:${String(turn)}: check ${checks} steer ${n}`)
    } catch (error) {
      warn(`[site-tools] check again failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  })

  /**
   * THE VISUAL CHECK (`visual-check.mjs`): a turn that wrote the site, about to close, has the page its
   * customer had open drawn again and compared with the picture from before the turn. A confident "the
   * change does not show" or "the page broke" steers one notice, which runs one more step; everything
   * else closes the turn as before. Marked checked BEFORE it asks, so the step it adds closes the turn
   * without a second check. 🔒 NEVER THROWS: a listener that throws here ends the turn in `error`.
   * 🔒 NOT FOR A BUILD (local round 18, 25/10/2026): the whole site is its ask, so "something changed that the
   * customer did not ask for" is always wrong there, and its steer landed beside the build's own `checkAgainStep`.
   * A build is judged by its own checks, `looks-finished` among them.
   */
  ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
    const sessionId = agent?.session?.id
    if (checkMode === 'off' || typeof sessionId !== 'string' || isBuild(sessionId, agent)) return
    const ask = turnAsks.get(sessionId)
    if (ask === undefined || ask.turn !== turn || ask.checked) return
    ask.checked = true
    const label = sessionSite(agent)
    const llm = ctx.get?.('llm') as Parameters<typeof pickEyes>[0] | undefined
    const route = sessionRoute(
      { agent } as Parameters<typeof sessionRoute>[0],
      ctx.get?.('agentDefaultModel') as Parameters<typeof sessionRoute>[1]
    )
    if (label === null || llm === undefined || route === null) return
    try {
      const events = (agent?.session?.snapshotEvents?.() ?? []) as readonly {
        type?: string
        data?: unknown
      }[]
      // The page is looked at before the turn closes: the line under the chat says so (#1403 item 10).
      const result = await whileWaiting(
        sessionId,
        'check',
        runVisualCheck({
          mode: checkMode,
          ask,
          turn,
          events,
          eyes: () => pickEyes(llm, route, config.lookModel),
          capture: (view) => drawView(label, view, { check: true }),
          store: (jpeg) => storePicture(ctx, { jpeg } as Parameters<typeof storePicture>[1]),
          llm,
          ...(signal ? { signal } : {})
        })
      )
      const { steer, ...said } = result as typeof result & { steer?: unknown }
      info(`[site-tools] visual check ${sessionId}:${String(turn)} on ${label}: ${JSON.stringify(said)}`)
      if (steer) agent?.steer?.(steer)
      // The verdict, kept beside the turn for usage (`site_turn.visual`); never awaited.
      // A write that landed while the check was still drawing or comparing is not covered either.
      const { plan } = planFor(sessionId)
      if (plan !== null) {
        const turnId = `${sessionId}:${String(turn)}`
        const first = checkReportOf(result as Parameters<typeof checkReportOf>[0])
        const said = ask.writtenAfterCheck === true ? writtenAfterCheckReport(first) : first
        const sent = reportTurnCheck(config, plan, label, sessionId, turnId, said, warn)
        ask.report = { plan, label, turnId, said, sent }
        void sent
      }
    } catch (error) {
      warn(
        `[site-tools] visual check ${sessionId}:${String(turn)} failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  })

  /**
   * 🔒 A WRITE AFTER THE CHECK IS SAID, NEVER COVERED (council 20/10/2026). The check looks once a turn, at
   * `agent/turn-stopping`; a site write after it (`callChangedSite`, the reading the check itself uses) —
   * in the step its notice added, or one another listener added — is never looked at. The turn's report
   * is sent again, once, with its verdict and the note `written-after-check` (tracy-web keeps the
   * latest), after the first report, so the order holds. No second check: the lock stays.
   */
  const wroteAfterCheck = (sessionId: string): void => {
    if (checkMode === 'off') return
    const { root, turn } = turnOfSession(sessionId)
    const ask = turnAsks.get(root)
    if (ask === undefined || !ask.checked || ask.writtenAfterCheck === true) return
    if (turn !== null && ask.turn !== turn) return
    ask.writtenAfterCheck = true
    const kept = ask.report
    if (kept === undefined) return
    const again = writtenAfterCheckReport(kept.said)
    void kept.sent.then(() => reportTurnCheck(config, kept.plan, kept.label, root, kept.turnId, again, warn))
  }

  /**
   * THE COMMENT FENCE (plan "comment thread" C1, `comment-fence.mjs`): in a comment turn — the person's
   * latest message carries a picked element's block, the same reading as `commentItemsRule` — a file
   * write aimed at the site's served files is refused, with the words that name the next step.
   * Ordinary turns never reach the rule (ADR 0022: content-only is guidance, not a lock).
   *
   * 🔒 WHY HERE AND NOT IN `tracy-subprocess-docker`'s FENCE. dsh's `agent/pre-step` can only change the
   * step's messages (`PreStepDecision` is `reject | enter{messages}`), not the tools a step may call,
   * so a per-turn allow-list does not exist; a `tools/pre-execute` deny is the hook. This plugin already
   * reads the one thing the rule turns on — the session's own log (`sessionEvents`) and the comment
   * block — while the path fence knows the site folder but not the turn: putting the rule there would
   * need a second copy of the detection or a new channel between two plugins. `siteOf` is the path
   * fence's own (imported above), so both agree on which folder is the site.
   *
   * It decides before `next()`: a refused call needs no other listener's opinion. The log is read only
   * for a tool that can write; the stderr line is the operator's trace, like the path fence's `DENY`.
   *
   * THE BUILD FENCE (`build-fence.mjs`, council 25/10/2026) rides the same hook: a demo or own-site build
   * (`isBuild`) shows nobody a question — its own, a door's `confirm-` card, a shell rule's card, or a
   * later listener's `ask` for an approval — and writes none of the template's own files. Local round 31
   * stood 80 minutes on one such question after the agent had rewritten three theme PHP patterns.
   */
  ctx.on(
    'tools/pre-execute',
    async (exec: PreToolExecution, onward: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
      const caller = exec?.agent?.session?.id
      const closedBuild =
        typeof caller === 'string' && buildTurns.state(caller, buildTurn(exec.agent))?.closedBuild === true
      if (closedBuild && !closedBuildRead(exec.name, exec.arguments)) {
        console.error(`site-tools: DENY guard=closed-build tool=${String(exec.name)}`)
        return { kind: 'deny', reason: CLOSED_BUILD_REFUSAL }
      }
      const building = typeof caller === 'string' && caller !== '' && isBuild(caller, exec.agent)
      // Recheck after downstream listeners: a parallel lifecycle answer can close the turn while they wait.
      const next = async (): Promise<PreToolDecision> => {
        const decision = await onward()
        const closedNow =
          typeof caller === 'string' && buildTurns.state(caller, buildTurn(exec.agent))?.closedBuild === true
        if (closedNow && (!closedBuildRead(exec.name, exec.arguments) || decision.kind === 'ask'))
          return { kind: 'deny', reason: CLOSED_BUILD_REFUSAL }
        if (building && decision.kind === 'ask') {
          console.error(`site-tools: DENY guard=build-approval tool=${String(exec?.name)}`)
          return { kind: 'deny', reason: buildApprovalRefusal(String(exec?.name)) }
        }
        return decision
      }
      // E5.e4: a card whose `confirm-…` id Tracy never wrote is answered for no call — stop it before
      // the customer sees it, so the agent re-sends the refusal's own question (`confirmCardRefusal`).
      if (exec?.name === 'ask_user_question') {
        if (building) {
          const questions = (exec.arguments as { questions?: unknown } | null)?.questions
          const confirm =
            Array.isArray(questions) &&
            questions.some(
              (q) => typeof q?.id === 'string' && (q.id as string).startsWith(CONFIRM_QUESTION_PREFIX)
            )
          console.error(`site-tools: DENY guard=build-question confirm=${String(confirm)}`)
          return { kind: 'deny', reason: buildQuestionRefusal(confirm) }
        }
        // The door's question in the person's language and meaning (live run 20/10/2026): read from the
        // language the conversation was found in (`mainLanguageOf`, set before each step).
        const asker = exec.agent?.session?.id
        const spoken = languageName(typeof asker === 'string' ? (mainLanguages.get(asker) ?? '') : '')
        const english = untranslatedConfirmCard(exec.arguments, spoken)
        if (english !== null) {
          console.error('site-tools: DENY guard=confirm-card-language')
          return { kind: 'deny', reason: english }
        }
        const refused = memory.confirmCardRefusal(asker, exec.arguments, spoken)
        if (refused !== null) {
          console.error(`site-tools: DENY guard=confirm-card reason=${JSON.stringify(refused)}`)
          return { kind: 'deny', reason: refused }
        }
        return next()
      }
      const cwd = exec?.agent?.session?.header?.cwd
      if (typeof cwd !== 'string' || cwd === '') return next()
      let siteRoot = cwd
      let label: string | null = null
      try {
        const sitesRoot = resolveSitesRoot(undefined)
        label = siteOf(cwd, sitesRoot).label
        siteRoot = `${sitesRoot.replace(/\/+$/, '')}/${label}`
      } catch {
        // A lane's workspace is the site folder itself.
        label = gatewaySetting('MCP_TRACY_SITE_LABEL')
      }
      // A build rebuilds EmDash only after writing its template code under /app (`appChangedSinceRebuild`).
      if (
        building &&
        exec.name === 'tracy_site_build_emdash' &&
        (exec.arguments as { operation?: unknown } | null)?.operation === 'site.rebuild' &&
        !appChangedSinceRebuild(
          sessionEvents(caller) as readonly { type?: string; data?: unknown }[],
          cwd,
          siteRoot
        )
      ) {
        console.error('site-tools: DENY guard=build-rebuild')
        return { kind: 'deny', reason: BUILD_REBUILD_UNNEEDED }
      }
      // A build writes none of the template's own files: the theme's or plugin's next update writes them back.
      if (building) {
        const file = buildTemplateWrite({ name: exec.name, args: exec.arguments, cwd, siteRoot })
        if (file !== null) {
          console.error(
            `site-tools: DENY guard=build-template tool=${exec.name} file=${JSON.stringify(file)}`
          )
          return { kind: 'deny', reason: buildTemplateRefusal(exec.name, file) }
        }
        const picture = buildPictureWrite({ name: exec.name, args: exec.arguments, cwd, siteRoot })
        if (picture !== null) {
          console.error(
            `site-tools: DENY guard=build-picture tool=${exec.name} file=${JSON.stringify(picture)}`
          )
          return { kind: 'deny', reason: buildPictureRefusal(exec.name, picture) }
        }
        const hide = exec.name === 'tracy_site' ? buildHide(exec.arguments) : null
        if (hide !== null) {
          console.error(`site-tools: DENY guard=build-hide prop=${JSON.stringify(hide)}`)
          return { kind: 'deny', reason: buildHideRefusal(hide) }
        }
      }
      // Ladder DL14/DL15 (14/10/2026): a shell write of the site's name, description or tagline has a
      // recorded door that does the same write with a receipt (`recorded-door.mjs`); through the shell
      // nothing listed it, and the customer's undo in the next conversation found no such change. A
      // site whose plugin answered that it lacks the door (within the hour) keeps the shell's road.
      const shellDoor = recordedDoorRefusal(exec?.name, exec?.arguments, {
        missing: label === null ? [] : memory.learned(label).missing
      })
      if (shellDoor !== null) {
        console.error(`site-tools: DENY guard=recorded-door tool=${String(exec?.name)}`)
        return { kind: 'deny', reason: shellDoor }
      }
      // ADR 0034 (council 19/10/2026): a shell command that deletes, hides, rewrites many places, writes the
      // database or switches code asks the customer first, as the doors do; the same command runs once
      // after their yes (`shell-writes.mjs` — best effort, read by its words).
      const shell = shellConsequence(exec?.name, exec?.arguments)
      const shellSession = exec?.agent?.session?.id
      // In a build nobody answers its card: the command is refused with no question (`buildShellRefusal`).
      if (shell !== null && building) {
        console.error(`site-tools: DENY guard=build-shell tool=${String(exec?.name)} reason=${shell.reason}`)
        return { kind: 'deny', reason: buildShellRefusal(shell) }
      }
      if (shell !== null && typeof shellSession === 'string' && shellSession !== '') {
        const key = `shell:${label ?? ''}:${shell.command}`
        if (!memory.confirmed(shellSession, key)) {
          memory.confirmAsked(shellSession, key, true, [])
          console.error(
            `site-tools: DENY guard=shell-consequence tool=${String(exec?.name)} reason=${shell.reason}`
          )
          return { kind: 'deny', reason: shellRefusal(shell, confirmQuestion(key, shell.sentence)) }
        }
      }
      const turn = COMMENT_FENCED_TOOLS.has(exec.name)
        ? commentTurnOf(sessionEvents(exec.agent?.session?.id))
        : null
      const call = { name: exec.name, args: exec.arguments, cwd, siteRoot, turn }
      const reason = commentFenceDecision(call)
      if (reason !== null) {
        console.error(`site-tools: DENY guard=comment tool=${exec.name} reason=${JSON.stringify(reason)}`)
        return { kind: 'deny', reason }
      }
      // THE LOOK UNDO (`look-undo.mjs`, Brian 29/09): a look write the fence let through in a comment
      // turn is copied first — but only once every later listener let it run too (the path fence, a
      // seal), so a refused write leaves no undo behind. A copy that cannot be kept refuses the write:
      // the comment turn promised an answer the person can undo.
      // A look write in ANY turn changes how the site looks (stage 6 F2): once it is let run, its
      // call is remembered so post-execute can stamp the site changed when it ran without an error.
      const files = lookFiles(call)
      const looks = files.length > 0 || lookWriteTargets(call).length > 0
      if (!looks) return next()
      const decision = await next()
      if (decision.kind !== 'allow' && decision.kind !== 'ask') return decision
      const remember = () => {
        if (typeof exec.callId === 'string' && label !== null) keepLookWrite(exec.callId, label)
      }
      if (files.length === 0) {
        remember()
        return decision
      }
      try {
        const kept = await takeLookSnapshot({
          siteRoot,
          files,
          io: lookIo({
            siteRoot,
            container: label === null ? null : `${label}-web-1`,
            run: (input) => runExec(config, input)
          }),
          tool: exec.name
        })
        if (typeof exec.callId === 'string') keepLookUndo(exec.callId, kept)
        remember()
        console.error(
          `site-tools: LOOK-UNDO ${kept.id} tool=${exec.name} files=${JSON.stringify(kept.files)}`
        )
        return decision
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error)
        return {
          kind: 'deny',
          reason: `site-tools: ${exec.name} refused in a comment turn: Tracy could not keep an undo copy of this look change first (${why}). Next: answer that comment ✗ with the reason and go on.`
        }
      }
    }
  )

  /**
   * Where a Joomla module shows, for the other pages its write is looked at on: what the host already
   * learned (the contract inspect, the agent's own moduleAssignment read), else ONE read through the
   * door that serves it — `content.get {kind:"moduleAssignment", id}`, the component's own
   * `#__modules_menu` rows — as the person the turn acts for. Null when nobody has the site open or the
   * read does not say; the caller bounds it by the hold's budget.
   */
  async function moduleUsageOf(
    exec: PreToolExecution,
    label: string,
    sessionId: string,
    id: number
  ): Promise<{ all: boolean; pages: string[] } | null> {
    const known = recordPages.moduleUsage(label, id)
    if (known !== null) return known
    const { plan: route } = planFor(sessionId)
    if (route === null) return null
    const params = { kind: 'moduleAssignment', id }
    const preset = sessionPreset(exec?.agent as Parameters<typeof sessionPreset>[0]) || null
    const answer = await relayRaw(
      route,
      laneSiteKey() ?? '_conversation',
      'content.get',
      params,
      null,
      label,
      sessionId,
      preset
    )
    recordPages.learnSite(label, sessionId, { action: 'content.get', params }, answer)
    return recordPages.moduleUsage(label, id)
  }

  /**
   * THE "BEFORE" A WRITE IS HELD FOR (council 20/10/2026, `check-pages.mjs`). A turn with no usable
   * picture from before has one drawn of the page its first site write targets, and a write to an
   * element other pages show has up to two of them drawn too, before the call runs: every other
   * listener has let it run (`next()` first), so a refused call is never held. At most
   * `BEFORE_HOLD_MS` a turn, one round each; a drawing that is late is dropped and the write goes.
   * Registered after the comment fence, so it runs downstream of it: a call the fence refuses never
   * reaches here, and the fence's look-undo copy is taken after the picture. A call the door will
   * refuse `CONFIRM_FIRST` (`asksFirst`) is not held: it writes nothing.
   * 🔒 NEVER A REFUSAL, NEVER THROWS: whatever happens here, the decision is the one `next()` gave.
   */
  ctx.on(
    'tools/pre-execute',
    async (exec: PreToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
      const decision = await next()
      if (checkMode === 'off' || decision.kind === 'deny') return decision
      const call = { name: exec?.name, arguments: exec?.arguments }
      const sessionId = exec?.agent?.session?.id
      if (typeof sessionId !== 'string' || !callChangedSite(call)) return decision
      try {
        const { root, turn } = turnOfSession(sessionId)
        const ask = turnAsks.get(root)
        if (ask === undefined || ask.checked || (turn !== null && ask.turn !== turn)) return decision
        const label = sessionSite(exec?.agent)
        if (label === null) {
          // Said at the check (`no-before-no-site`): a write from a session standing in no site's folder.
          ask.missing ??= 'no-site'
          return decision
        }
        const postTypeOf = (id: number) => memory.readOf(sessionId, { kind: 'post', id })?.postType ?? null
        if (asksFirst(call, { postTypeOf })) return decision
        const reach = writeReach(call, {
          postTypeOf,
          emdashPageOf: (collection, id) => recordPages.emdashPageOf(label, collection, id),
          replaceRegions: (params) => recordPages.replaceRegions(sessionId, params),
          contractReach: (params) => recordPages.contractReach(label, params)
        })
        const open = views.viewOf(root, label)
        const held = await holdForBefore({
          ask,
          reach,
          reads: pageReads.of(root),
          window: open === null ? HOLD_WINDOW : { w: open.w, h: open.h, dark: open.dark },
          draw: (view) => views.draw(label, view),
          ...(ask.early !== undefined ? { early: ask.early } : {}),
          usage: (r) =>
            typeof r.module === 'number'
              ? moduleUsageOf(exec, label, sessionId, r.module)
              : Promise.resolve(null),
          ...(typeof config.visualCheckHoldMs === 'number' ? { budgetMs: config.visualCheckHoldMs } : {})
        })
        // The write goes now: an early picture that is not done yet can no longer be its "before".
        ask.wroteAt ??= Date.now()
        if (held.drew.length > 0 || held.missing !== null)
          info(
            `[site-tools] visual check ${root}:${String(ask.turn)} held ${String(exec?.name)} ${String(held.heldMs)} ms: ${JSON.stringify({ drew: held.drew, missing: held.missing })}`
          )
      } catch (error) {
        warn(
          `[site-tools] visual check: the write was not held for its picture: ${error instanceof Error ? error.message : String(error)}`
        )
      }
      return decision
    }
  )

  /**
   * The undo a look write's call earned, by dsh call id — set above, read once below (bounded: a call
   * whose post-execute never comes, an approval refused, must not grow this forever).
   */
  const lookUndoByCall = new Map<string, { id: string; files: string[] }>()
  function keepLookUndo(callId: string, kept: { id: string; files: string[] }) {
    lookUndoByCall.set(callId, kept)
    while (lookUndoByCall.size > 200) lookUndoByCall.delete(lookUndoByCall.keys().next().value as string)
  }
  /** The site a look write let run is on, by dsh call id — read once below, bounded the same way. */
  const lookWriteByCall = new Map<string, string>()
  function keepLookWrite(callId: string, label: string) {
    lookWriteByCall.set(callId, label)
    while (lookWriteByCall.size > 200) lookWriteByCall.delete(lookWriteByCall.keys().next().value as string)
  }

  /**
   * The pages each conversation read with `page.text`, newest first — where a removal's receipt looks
   * again for the words it took off (`removal-check.mjs`, ladder DL09, 14/10/2026). Bounded: four paths
   * per conversation, 200 conversations, the oldest dropped first.
   */
  const pagesReadBy = new Map<string, string[]>()
  function notePagesRead(sessionId: string | null, params: Record<string, unknown>) {
    if (typeof sessionId !== 'string' || sessionId === '') return
    const asked = [params.path ?? '/', ...(Array.isArray(params.paths) ? params.paths : [])]
    const paths = asked.filter((p): p is string => typeof p === 'string' && p.startsWith('/'))
    if (paths.length === 0) return
    const kept = [...new Set([...paths, ...(pagesReadBy.get(sessionId) ?? [])])].slice(0, 4)
    pagesReadBy.delete(sessionId)
    pagesReadBy.set(sessionId, kept)
    while (pagesReadBy.size > 200) pagesReadBy.delete(pagesReadBy.keys().next().value as string)
  }

  /**
   * THE LOOK UNDO, SAID TO THE AGENT: the result of a call whose look write was copied first carries
   * one more text block, `undo: <id>` and the call that uses it — the words the comment's reply line
   * repeats to the person (`prompter.mjs` `COMMENT_LOOK_SCOPE`). A result another listener replaced
   * by a new value keeps that value untouched.
   */
  ctx.on(
    'tools/post-execute',
    async (
      exec: PostToolExecution,
      result: PostToolResult,
      next: () => Promise<PostToolDecision>
    ): Promise<PostToolDecision> => {
      const decision = await next()
      // Stage 6 F2: a look write that ran without an error stamps its site changed (`siteChanged`):
      // it has no Apply-door receipt, so nothing else tells Tracy the site looks different now.
      const wroteOn = typeof exec?.callId === 'string' ? lookWriteByCall.get(exec.callId) : undefined
      if (wroteOn !== undefined) {
        lookWriteByCall.delete(exec.callId as string)
        if (decision.kind === 'accept' && result?.isError !== true)
          siteChanged(wroteOn, exec.agent?.session?.id ?? null, exec.name, 'file-look')
      }
      const kept = typeof exec?.callId === 'string' ? lookUndoByCall.get(exec.callId) : undefined
      if (kept === undefined) return decision
      lookUndoByCall.delete(exec.callId as string)
      if (decision.kind !== 'accept' || decision.value !== undefined) return decision
      return {
        ...decision,
        content: [...(decision.content ?? result.content ?? []), { type: 'text', text: lookUndoNote(kept) }]
      }
    }
  )

  /**
   * 🔒 A STYLESHEET WRITTEN BY HAND IS CHECKED ON THE PAGE (follow-up to #1710 / #1713, dev wp-tracy-ai,
   * 25/10/2026: a rule appended to a theme's `style.css` that the page never links, then "done").
   * The stylesheets a bash command or a file tool wrote (read around the call by `tools/execute` below) are
   * looked for on the page the customer has open, else the home page (`css-file-loaded.mjs`): a WordPress or
   * Joomla file as the call ends, its answer on that call's result; an EmDash `/app` file at the next
   * `site.rebuild` of the site, which is when it is served, its answer on the rebuild's result. Bounded;
   * never a refusal, never a throw: a check that fails says nothing.
   */
  const cssByCall = new Map<string, Promise<Record<string, unknown> | null>>()
  const cssAfterBuild = new Map<string, { label: string; written: Promise<WrittenCss[]>[] }>()
  const cssPage = (sessionId: string, label: string): string => {
    const open = views.viewOf(turnOfSession(sessionId).root, label)?.path ?? '/'
    return open.split('#')[0] || '/'
  }
  const cssCheck = async (
    label: string,
    sitesRoot: string,
    sessionId: string,
    files: WrittenCss[]
  ): Promise<Record<string, unknown> | null> => {
    if (files.length === 0) return null
    const page = cssPage(sessionId, label)
    const found = await cssFilesLoaded({ files, page, read: pageHtmlFor(config, sitesRoot, label) })
    const said = cssFileAnswer(found, { page, files })
    if (said !== null) info(`[site-tools] css file check ${label} ${page}: ${JSON.stringify(found.verdicts)}`)
    return said
  }
  function noteCssWrites(
    exec: any,
    at: {
      label: string
      sitesRoot: string
      workdir: string
      files: string[]
      before: ReturnType<typeof parseLookFiles> | null
      after: Promise<ReturnType<typeof parseLookFiles> | null>
    }
  ) {
    const sessionId = exec?.agent?.session?.id
    if (typeof sessionId !== 'string') return
    const named = at.files
      .map((f) => ({ f, served: servedCss(f, { workdir: at.workdir, label: at.label }) }))
      .filter((x): x is { f: string; served: NonNullable<ReturnType<typeof servedCss>> } => x.served !== null)
    if (named.length === 0) return
    const written = (async (): Promise<WrittenCss[]> => {
      const after = await at.after
      return named.flatMap(({ f, served }) => {
        const a = after?.get(f)
        const b = at.before === null ? undefined : at.before.get(f)
        // not read now: only a <link> can tell; not read before: what it added is not known
        if (typeof a !== 'string') return [{ served, rules: null }]
        if (b === undefined || b === NOT_READ) return [{ served, rules: null }]
        const rules = writtenRules(b, a)
        // nothing added or changed (a removal, or no write at all): nothing that should show
        return rules !== null && rules.length === 0 ? [] : [{ served, rules }]
      })
    })().catch(() => [])
    if (named.some((x) => x.served.built)) {
      const key = `${sessionId}|${at.label}`
      const pending = cssAfterBuild.get(key) ?? { label: at.label, written: [] }
      pending.written.push(written.then((list) => list.filter((w) => w.served.built)))
      cssAfterBuild.delete(key)
      cssAfterBuild.set(key, pending)
      bounded(cssAfterBuild, 200)
    }
    if (typeof exec?.callId === 'string' && named.some((x) => !x.served.built)) {
      cssByCall.set(
        exec.callId,
        written
          .then((list) =>
            cssCheck(
              at.label,
              at.sitesRoot,
              sessionId,
              list.filter((w) => !w.served.built)
            )
          )
          .catch(() => null)
      )
      bounded(cssByCall, 200)
    }
  }
  ctx.on(
    'tools/post-execute',
    async (
      exec: PostToolExecution,
      result: PostToolResult,
      next: () => Promise<PostToolDecision>
    ): Promise<PostToolDecision> => {
      const decision = await next()
      const callId = typeof exec?.callId === 'string' ? exec.callId : null
      let work = callId === null ? undefined : cssByCall.get(callId)
      if (callId !== null) cssByCall.delete(callId)
      const args = exec?.arguments as { operation?: unknown } | null | undefined
      if (
        work === undefined &&
        exec?.name === 'tracy_site_build_emdash' &&
        args?.operation === 'site.rebuild'
      ) {
        const sessionId = exec?.agent?.session?.id
        const label = sessionSite(exec?.agent)
        const key = `${String(sessionId)}|${String(label)}`
        const pending = cssAfterBuild.get(key)
        const built = answerValue(result as ToolResultOutcome) as { ok?: unknown } | null
        if (pending !== undefined && typeof sessionId === 'string' && label !== null && built?.ok === true) {
          cssAfterBuild.delete(key)
          work = Promise.all(pending.written).then((lists) => {
            // the same file edited twice before one rebuild: every rule either edit added
            const byFile = new Map<string, WrittenCss>()
            for (const w of lists.flat()) {
              const had = byFile.get(w.served.file)
              byFile.set(
                w.served.file,
                had === undefined
                  ? w
                  : {
                      served: w.served,
                      rules: had.rules === null || w.rules === null ? null : [...had.rules, ...w.rules]
                    }
              )
            }
            return cssCheck(pending.label, resolveSitesRoot(undefined), sessionId, [...byFile.values()])
          })
        }
      }
      if (work === undefined || decision.kind !== 'accept' || decision.value !== undefined) return decision
      const late = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), CSS_FILE_BUDGET_MS + 6_000).unref?.()
      )
      const said = await Promise.race([work.catch(() => null), late])
      if (said === null) return decision
      return {
        ...decision,
        content: [...(decision.content ?? result.content ?? []), { type: 'text', text: JSON.stringify(said) }]
      }
    }
  )

  /**
   * What the conversation says back, fed to the memory the doors decide by:
   * - an `ask_user_question` the customer answered — a refused destructive call may now go ahead once
   *   with `confirm:true` (D34: EmDash deletes, someone else's waiting draft);
   * - a site build — it writes the site outside `relayRaw` (the seeder, the language job), so every
   *   snapshot of that site is stale and so is its served-locale memo (D8, D11). The build's own
   *   later stages are caught by the site-state notice changing (the pre-step hook above).
   * Listener failures are contained by dsh; nothing here refuses or changes a result.
   */
  // 🔒 A LOOK WRITE OUTSIDE tracy_site IS READ AROUND THE CALL (council, 20/10/2026; review the same day).
  // `sed -i`, `cat >`, a heredoc hand nothing over, and a file tool's `new_string` carries the lines around
  // the change (`content`, the whole file), so the stylesheets a bash command or a file tool names are read
  // before it runs and again after it, in the site's own container from the call's own working directory
  // (the fence's world: a relative path resolves as the call's does, no other site's file is there), and
  // only the pins the new text has that the old did not reach the next step. The read after runs on while
  // the result goes back; a call that fails is read too (it may have written first); a file not read, or
  // with no read before to compare with, is "not checked", never clean; nothing here fails the call.
  // The dispatch waterfall of dsh's tool runtime (`@deepseek-ai/dsh-tools` `tools/execute`), which this
  // plugin's context type does not declare: the same emitter `tools/result` is heard on.
  ;(
    ctx as unknown as {
      on: (name: string, fn: (exec: any, next: () => Promise<any>) => Promise<any>) => void
    }
  ).on('tools/execute', async (exec: any, next: () => Promise<any>) => {
    /** What the call names to read around it, or null: not a look write of this conversation's site. */
    let plan: {
      label: string
      workdir: string
      files: string[]
      unchecked: string[]
      sitesRoot: string
    } | null = null
    try {
      const name = String(exec?.name ?? '')
      const sessionId = exec?.agent?.session?.id
      if (typeof sessionId === 'string' && laneSiteKey() === null) {
        const cwd = String(exec.agent?.session?.header?.cwd ?? '')
        let named: { files: string[]; unresolved: string[] } = { files: [], unresolved: [] }
        let asked = cwd
        if (name === 'bash' && typeof exec?.arguments?.command === 'string') {
          named = shellLookWrites(exec.arguments.command)
          const wd = exec.arguments.workdir
          if (typeof wd === 'string' && wd !== '') asked = wd.startsWith('/') ? wd : `${cwd}/${wd}`
        } else if (FILE_TOOLS.has(name))
          named = { files: fileToolPaths(name, exec?.arguments, isLookFile), unresolved: [] }
        if (named.files.length > 0 || named.unresolved.length > 0) {
          const sitesRoot = resolveSitesRoot(undefined)
          const label = siteOf(cwd, sitesRoot).label
          if (siteOf(asked, sitesRoot).label === label) {
            const root = `${sitesRoot.replace(/\/+$/, '')}/`
            // the fence's own mapping, whose container root is `/site` on every host (its config default); a
            // harness path a file tool names is the same file under that root
            const files = named.files.map((f) =>
              f.startsWith(root) ? containerPath(f, sitesRoot, '/site') : f
            )
            plan = {
              label,
              sitesRoot,
              workdir: containerPath(asked, sitesRoot, '/site'),
              files: files.slice(0, LOOK_FILES_MAX),
              // past the bound, or named from a directory the text does not tell: said, never dropped
              unchecked: [...files.slice(LOOK_FILES_MAX), ...named.unresolved]
            }
          }
        }
      }
    } catch {
      plan = null
    }
    if (plan === null) return next()
    const { label, workdir, files, sitesRoot } = plan
    const sessionId = String(exec.agent.session.id)
    const read = async (timeoutMs: number): Promise<ReturnType<typeof parseLookFiles> | null> => {
      if (files.length === 0) return new Map()
      try {
        const r = await runExec(config, {
          argv: lookFilesArgv(`${label}-web-1`, workdir, files),
          stdin: '',
          timeoutMs,
          maxBuffer: 8 * 1024 * 1024
        })
        // a read that failed or ran out of time proves nothing about any file
        return r.code === 0 && r.timedOut !== true ? parseLookFiles(r.stdout) : null
      } catch {
        return null
      }
    }
    const before = exec?.signal?.aborted === true ? null : await read(3_000)
    const result = await next()
    const unchecked = [...plan.unchecked]
    const afterRead = read(5_000)
    noteCssWrites(exec, { label, sitesRoot, workdir, files, before, after: afterRead })
    const work = (async (): Promise<EditPins | null> => {
      try {
        const after = await afterRead
        const ruler = await siteRuler(config, sitesRoot, label, { waitMs: SLOT_WAIT_MS })
        // whether a system is worn is not known (the slot read did not answer): the fallback to write is
        // not known either, so nothing is judged
        const by = ruler.slot === undefined ? null : (ruler.slot ?? ruler.roles ?? null)
        if (by === null)
          return ruler.slot === undefined
            ? {
                label,
                what: files[0] ?? unchecked[0] ?? '',
                worn: false,
                unchecked: [...files, ...unchecked],
                pins: []
              }
            : null
        const was: string[] = []
        const now: string[] = []
        for (const f of files) {
          const a = after?.get(f)
          const b = before === null ? undefined : before.get(f)
          // not read now, not answered before, or there but not read: not checked; not there before: new
          if (typeof a !== 'string' || b === undefined || b === NOT_READ) {
            unchecked.push(f)
            continue
          }
          was.push(typeof b === 'string' ? b : '')
          now.push(a)
        }
        const worn = Boolean(ruler.slot)
        return {
          label,
          what: files[0] ?? unchecked[0] ?? '',
          worn,
          unchecked,
          pins: newRolePins(was, now, { ruler: by, template: ruler.roles, worn })
        }
      } catch {
        return null
      }
    })()
    const list = editPins.get(sessionId) ?? []
    list.push({ label, files: [...files, ...plan.unchecked], work })
    // past the bound, the oldest are said as not checked rather than dropped
    if (list.length > 40) {
      const old = list.splice(0, list.length - 39)
      const gone = old.flatMap((o) => o.files)
      list.unshift({
        label,
        files: gone,
        work: Promise.resolve({ label, what: gone[0] ?? '', worn: false, unchecked: gone, pins: [] })
      })
    }
    editPins.delete(sessionId)
    editPins.set(sessionId, list)
    bounded(editPins, 200)
    return result
  })

  ctx.on('tools/result', (exec: ToolResultExecution, result: ToolResultOutcome) => {
    const sessionId = exec?.agent?.session?.id
    // A call the visual check counts as a write (a shell, a file writer, a door write) ages the
    // pictures of the conversation's site, as the door roads do through `noteWrite`.
    if (callChangedSite({ name: exec?.name, arguments: exec?.arguments })) {
      const wroteOn = sessionSite(exec?.agent)
      if (wroteOn !== null) views.wrote(wroteOn)
      if (typeof sessionId === 'string') wroteAfterCheck(sessionId)
    }
    // An EmDash answer names collections' addresses and entries' slugs: the page a later write of
    // that entry is held for (`check-pages.mjs`). Learned from what the agent asked anyway.
    if (exec?.name === 'tracy_emdash' && checkMode !== 'off' && result?.isError !== true)
      recordPages.learnEmdash(sessionSite(exec?.agent), exec.arguments, answerValue(result))
    // A `tracy_site` answer names where a Joomla module or a contract slot shows, which menu item is
    // home, where a replace's dryRun found its places. A contract inspect is learned from the whole
    // answer the host kept of it (the agent's own is cut to fit), when this turn still has it.
    if (exec?.name === 'tracy_site' && checkMode !== 'off' && result?.isError !== true) {
      const at = sessionSite(exec?.agent)
      recordPages.learnSite(at, sessionId ?? null, exec.arguments, answerValue(result))
      if (at !== null && typeof sessionId === 'string') {
        const { action } = canonicalCall(exec.arguments) as { action: string }
        if (action === 'content.contract') {
          const kept = memory.inspectCached({ sessionId, label: at, actor: planFor(sessionId).actorKey })
          if (kept !== null) recordPages.learnSite(at, sessionId, exec.arguments, kept.answer)
        }
      }
    }
    // ADR 0023, "Addendum 30/09": a look edited outside tracy_site is measured before the next step
    // (the pre-step hook above); the agent's own tracy_design_check after it makes that measure moot.
    if (typeof sessionId === 'string' && laneSiteKey() === null) {
      if (exec?.name === 'tracy_design_check') lookPending.delete(sessionId)
      else {
        const what = lookEdit(String(exec?.name ?? ''), exec?.arguments, {
          isError: result?.isError === true,
          value: answerValue(result)
        })
        if (what !== null) {
          try {
            const at = siteOf(
              String(exec.agent?.session?.header?.cwd ?? ''),
              resolveSitesRoot(undefined)
            ).label
            lookPending.set(sessionId, { label: at, what })
          } catch {
            // not in a site's workspace: no site to measure
          }
        }
      }
    }
    if (exec?.name === 'ask_user_question') {
      // D34: a question Tracy wrote for a CONFIRM_FIRST answers for its own call only, and only on
      // its go-ahead; the memory reads the answer question by question (`answerVerdict`).
      if (typeof sessionId === 'string' && result?.isError !== true)
        memory.customerAnswered(sessionId, exec.arguments, answerValue(result))
      return
    }
    if (typeof exec?.name !== 'string' || !exec.name.startsWith('tracy_site_build_')) return
    // The build may have rewritten any page this conversation read: its lengths are guesses now (D6′).
    memory.forgetReads(sessionId)
    const labels = new Set<string>()
    const lane = laneSiteKey()
    if (lane !== null) labels.add(labelOfKey(lane))
    else {
      try {
        labels.add(siteOf(String(exec.agent?.session?.header?.cwd ?? ''), resolveSitesRoot(undefined)).label)
      } catch {
        // not in a site's workspace: only a named target below
      }
    }
    const target = (exec.arguments as { targetSiteKey?: unknown } | null | undefined)?.targetSiteKey
    if (typeof target === 'string' && target !== '') labels.add(labelOfKey(target))
    for (const one of labels) {
      memory.invalidateSite(one)
      views.wrote(one)
      emdashState.dropServedLocales(one)
      emdashState.dropMedia(one)
    }
  })

  // NO `ask` GUARD HERE, ON PURPOSE. dsh-passwords forwards only `user-questions/request` to a seat's
  // browser (gateway.ts `$events` filter — "approval and emit stay closed"), so a tool approval would wait
  // for an answer no customer can give and hang the turn. Hard-to-undo actions are confirmed by the
  // agent with `ask_user_question` instead (the site context says when).

  /**
   * `tracy_site`, built ONCE. The global registration carries `fullSiteToolDescription()` — every
   * platform's doors, the fallback for an agent whose site cannot be read — and the `agent/created`
   * listener below registers a copy per agent with its surface's description and action enum. Both
   * carry the SAME `execute` and `isConcurrencySafe`: a scoped copy that routed differently would be a
   * second door.
   */
  const siteTool = {
    name: 'tracy_site',
    description: fullSiteToolDescription(),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'One of the actions listed in the tool description.' },
        params: {
          type: 'object',
          description: "That action's parameters, as the site component defines them.",
          additionalProperties: true
        },
        siteKey: {
          type: 'string',
          description:
            'Leave this out: every call acts on the site THIS conversation belongs to. Naming another ' +
            'site is refused (SITE_OUTSIDE_CONVERSATION) — that site is worked on in its own workspace.'
        },
        comment: structuredClone(COMMENT_PARAMETER)
      },
      required: ['action']
    },
    // dsh's scheduler is fail-closed: without this, every call is a barrier. See
    // `actionRunsInParallel` for why reads opt in and which three of them do not.
    isConcurrencySafe: (args: unknown) => actionRunsInParallel(args),
    output: {
      schema: {},
      // The answer as JSON text, byte for byte as before; a `page.look` picture rides after it as an
      // image block (W4, `look.mjs`), so an image-capable session sees the page in the same step.
      // `content.replace`'s phase timings (S5) are dropped from that text and kept as meta instead:
      // persisted on `tool/result`, never in a model request, and drawn by no client card.
      // A call made for one of the person's numbered comments (H6, `comment-echo.mjs`) says so in a
      // text block of its own in front of that JSON, and in meta; the JSON itself does not move.
      render: (_args: unknown, value: unknown) =>
        commentContent(value, answerContent(value, [TIMING_KEY, COMMENT_KEY])),
      presentationMeta: (_args: unknown, value: unknown) =>
        commentMeta(value, timingMeta(value) as Record<string, unknown> | null)
    },
    async execute(args: unknown, exec: ToolRun) {
      const sessionId = exec?.agent?.session?.id ?? null
      // `sessionPreset` reads the session log (seq, eventAt), which dsh's agent carries at run time.
      const preset = sessionPreset(exec?.agent as Parameters<typeof sessionPreset>[0]) || null
      // ONE CONVERSATION, ONE SITE. A single-site lane has its key. A host dsh serves every site,
      // so the site is the folder the session stands in (dsh writes the cwd, never the model);
      // the Apply door resolves that label and refuses any other key. Measured 14/09: a thread on
      // one site reached another site the same person held a seat on.
      const laneKey = laneSiteKey()
      const sitesRoot = resolveSitesRoot(undefined)
      let label: string | null = null
      if (laneKey === null) {
        try {
          label = siteOf(String(exec?.agent?.session?.header?.cwd ?? ''), sitesRoot).label
        } catch {
          label = null
        }
      }
      // The site's facts, for carrying out THIS call (never for re-describing the tool, CS1).
      //
      // 🔒 A LANE READS ITS SITE'S FACTS TOO, BUT KEEPS ITS SURFACE GLOBAL. A single-site lane was
      // judged as `unknown` on every call, so the body guard, the in-tool check, V0 and the list-row
      // shaping were all off there while the budgets still cut (review, 25/09). Its label is known
      // (`MCP_TRACY_SITE_LABEL`, as `page.text` reads it); only the surface stays null, because the
      // lane's tool was described with the global door and a call must not be judged on another list.
      const laneLabel = laneKey === null ? null : gatewaySetting('MCP_TRACY_SITE_LABEL')
      const facts: SiteFacts =
        label !== null
          ? await siteFactsOf(sitesRoot, label)
          : laneLabel !== null
            ? { ...(await siteFactsOf(sitesRoot, laneLabel)), surface: null }
            : NO_SITE_FACTS
      const actions = facts.surface === null ? null : SURFACE_ACTIONS[facts.surface]
      const nextFacts = { platform: facts.platform, sealed: facts.sealed, actions }
      // 🔒 THE SURFACE'S ACTIONS, NOT ALL 33 (D24): an unknown action names this site's list, and a
      // known one this site does not have is refused before anything is relayed (NOT_ON_THIS_PLATFORM).
      const plan = planCall(args, actions === null ? {} : { actions })
      if (!plan.ok) return withNext(plan, { ...nextFacts, action: plan.asked })
      if (laneKey === null && label === null)
        return {
          ok: false,
          code: 'NO_SITE_IN_CONVERSATION',
          error:
            "This conversation is not in a site's workspace. Ask the customer to open that site's workspace."
        }
      if (laneKey !== null && plan.siteKey !== null && plan.siteKey !== laneKey) {
        return {
          ok: false,
          code: 'SITE_OUTSIDE_CONVERSATION',
          error: `This conversation works on ${laneKey} only.`
        }
      }
      const key = laneKey ?? plan.siteKey ?? '_conversation'
      // What Tracy corrected in the call (an alias, a key beside `params`), said once in the answer.
      const noted = (answer: unknown): unknown => withNotes(answer, plan.notes)
      // 🔒 A WHOLE NEW LOOK FROM THE CHAT FOLLOWS THE OPERATOR'S SWITCH (`chat-design-route.mjs`):
      // `theme.style` puts another of the theme's design systems on a WordPress site, so while
      // `chat-design-system` is off the agent is refused here, before anything is relayed. A Build's
      // `style` stage reaches the action through the loopback door below, not this tool.
      if (plan.action === 'theme.style') {
        const routes = await designRoutesAt(
          config.origin ?? gatewaySetting('MCP_TRACY_ORIGIN'),
          config.fetch as typeof fetch | undefined
        )
        if (!routes.chat) return noted(chatRouteRefusal(routes.button))
      }
      if (plan.action === 'page.look') {
        const looked = await pageLook(
          ctx,
          exec,
          config,
          sitesRoot,
          label ?? gatewaySetting('MCP_TRACY_SITE_LABEL'),
          plan.params,
          facts
        )
        // A page this conversation looked at (`check-pages.mjs`): where a shared element is checked.
        if (typeof sessionId === 'string')
          pageReads.note(turnOfSession(sessionId).root, pageReadsOf(plan.params, looked))
        return noted(looked)
      }
      if (plan.action === 'page.text') {
        const at = label ?? gatewaySetting('MCP_TRACY_SITE_LABEL')
        // E3.3 (P12): a container found to have no page reader this hour is not asked again — the
        // first answer, with its next to the content door, is the answer.
        const dead = at === null ? null : memory.deadRoad(at, 'page.text')
        if (dead) return noted(dead)
        const read = await pageText(config, sitesRoot, at, plan.params, facts)
        // The page a later removal is checked on (`removal-check.mjs`): only a page that answered.
        if ((read as { ok?: unknown } | null)?.ok === true) notePagesRead(sessionId, plan.params)
        if (typeof sessionId === 'string')
          pageReads.note(turnOfSession(sessionId).root, pageReadsOf(plan.params, read))
        // 🔒 ONLY A MISSING READER IS LEARNED: `page.text` answers NO_BROWSER only when the container
        // has neither curl nor node (`noReaderAnswer`). A site that did not answer (SITE_UNREACHABLE,
        // a timeout) is a restart away from answering, and an hour of dead road would outlive it.
        if (at !== null && (read as { code?: unknown } | null)?.code === 'NO_BROWSER')
          memory.learn(at, 'missing', 'page.text', read)
        return noted(read)
      }
      if (plan.action === 'look.revert') {
        // Only this conversation's own site folder: the id is looked up in ITS store, and the files
        // an entry names are checked against it again (`look-undo.mjs`).
        const at = label ?? gatewaySetting('MCP_TRACY_SITE_LABEL')
        if (at === null)
          return noted({
            ok: false,
            code: 'NO_SITE_IN_CONVERSATION',
            error: "This conversation is not in a site's workspace, so it has no look undo to put back."
          })
        const siteRoot = `${sitesRoot.replace(/\/+$/, '')}/${at}`
        const reverted = await revertLook({
          siteRoot,
          undo: plan.params.undo ?? plan.params.id,
          io: lookIo({ siteRoot, container: `${at}-web-1`, run: (input) => runExec(config, input) })
        })
        // Putting a look back changes how the site looks too (stage 6 F2). A WordPress look's
        // Additional CSS is not a Git file: `look-css` with the undo id, so undoing a chat turn knows
        // this look is back already (`apps/tracy-web/src/sites/turn-undo.js`).
        if ((reverted as { ok?: unknown }).ok === true) {
          const back = reverted as { undo?: unknown; restored?: unknown }
          if (
            Array.isArray(back.restored) &&
            back.restored.includes(ADDITIONAL_CSS) &&
            typeof back.undo === 'string'
          )
            siteChanged(at, sessionId ?? null, 'look.revert', 'look-css', {
              kind: LOOK_CSS_TARGET_KIND,
              id: back.undo
            })
          else siteChanged(at, sessionId ?? null, 'look.revert', 'look-revert')
        }
        return noted(reverted)
      }
      // Council 19/10/2026 (`consequence.mjs`): a write the host makes itself, whose consequence is the
      // customer's to see, asks first with the door's own question — as `runSiteCall` asks for the
      // relayed ones. `confirm` is lifted off here: these doors take a closed set of keys.
      const planAgreed = await demoPlanAgreed(exec)
      const askFirst = (consequence: Consequence | null, params: Record<string, unknown>) => {
        if (consequence === null || typeof sessionId !== 'string' || sessionId === '' || planAgreed)
          return null
        const { confirm, ...call } = params
        const key = `tracy_site:${sameCallKey('tracy_site', { action: plan.action, params: call })}`
        if (confirm === true && memory.confirmed(sessionId, key)) return null
        // One "every page" question a turn (`call-memory.mjs` `siteWideAgreed`).
        if (SITE_WIDE_REASONS.has(consequence.reason) && memory.siteWideAgreed(sessionId)) return null
        memory.confirmAsked(sessionId, key, true, consequence.facts, null, consequence.reason)
        return withNext({
          ok: false,
          code: 'CONFIRM_FIRST',
          action: plan.action,
          tier: 'mutating',
          consequence: consequence.reason,
          error: consequence.error,
          ask: confirmQuestion(key, consequence.sentence)
        })
      }
      const withoutConfirm = (params: unknown): Record<string, unknown> => {
        const { confirm: _confirm, ...rest } = (params ?? {}) as Record<string, unknown>
        return rest
      }
      if (plan.action === 'look.set') {
        // A look written in one call (`look-set.mjs`): only in a mode that may change how a site looks
        // — the one with a shell, as the LOOK line of the rules says (`lookLine`) — and only in this
        // conversation's own site folder (and that site's own container for EmDash's source).
        const at = label ?? gatewaySetting('MCP_TRACY_SITE_LABEL')
        if (at === null)
          return noted({
            ok: false,
            code: 'NO_SITE_IN_CONVERSATION',
            error: "This conversation is not in a site's workspace, so there is no look to change."
          })
        if (!toolReach(toolsOf(exec?.agent)).shell)
          return noted({
            ok: false,
            code: 'LOOK_SET_NOT_IN_MODE',
            error: 'This mode does not change how a site looks; the Designer mode does.',
            next: 'Say so to the customer, and what this mode can change instead: the words, pictures and links.'
          })
        const siteRoot = `${sitesRoot.replace(/\/+$/, '')}/${at}`
        const platform = String(facts.platform ?? 'unknown')
        const lookParams = (plan.params ?? {}) as Record<string, unknown>
        const siteWide = askFirst(consequenceOf(platform, 'look.set', lookParams), lookParams)
        if (siteWide !== null) return noted(siteWide)
        // Whether the site wears a design system and which roles its template reads, read beside the
        // page (`siteRuler`): wearing none, a literal is written through its one role (`throughRoles`).
        const rulerRead =
          platform === 'emdash'
            ? null
            : siteRuler(config, sitesRoot, at, { waitMs: SLOT_WAIT_MS }).catch(() => null)
        const named = (lookParams.target ?? (args as { target?: unknown } | null)?.target) as
          | { selector?: unknown }
          | undefined
        // what was written, as the role pins judge it after the write: the values given through a role
        let written: [string, string][] | null = null
        const answer = await lookSet({
          params: withoutConfirm(plan.params),
          beside: (args as { target?: unknown } | null)?.target,
          platform,
          siteRoot,
          measure: lookSetMeasure(config, sitesRoot, at, facts),
          io: lookIo({ siteRoot, container: `${at}-web-1`, run: (input) => runExec(config, input) }),
          // An "element" or "page" write that reaches further than the one element (the header or
          // footer, a rule painting several on this page) asks before anything is written.
          wide: (reach) => askFirst(lookReachOf(reach), lookParams) as Record<string, unknown> | null,
          roles:
            rulerRead === null
              ? null
              : async (props) => {
                  const ruler = await rulerRead
                  if (ruler === null || ruler.slot !== null || ruler.roles === null)
                    return { props, through: [] }
                  const roled = throughRoles(props, {
                    ruler: ruler.roles,
                    selector: typeof named?.selector === 'string' ? named.selector : ''
                  })
                  written = roled.props
                  return roled
                }
        })
        if ((answer as { ok?: unknown }).ok !== true) return noted(answer)
        // EmDash shows its source after the rebuild, which stamps the site and measures it itself.
        if (platform === 'emdash') return noted(answer)
        // On WordPress look.set writes the site's Additional CSS (a database post, not a Git file):
        // `look-css` with its undo id, which undoing the chat turn puts back (tracy-host `look-css`
        // job). Elsewhere it writes the theme's files, which Git keeps: `file-look`.
        const undoId = (answer as { undo?: unknown }).undo
        if (platform === 'wordpress' && typeof undoId === 'string')
          siteChanged(at, sessionId ?? null, 'look.set', 'look-css', {
            kind: LOOK_CSS_TARGET_KIND,
            id: undoId
          })
        else siteChanged(at, sessionId ?? null, 'look.set', 'file-look')
        // ADR 0023: a look write answers with the drift it caused, as theme.style does (`withDesignDrift`).
        const page =
          typeof plan.params.path === 'string' && plan.params.path.startsWith('/') ? plan.params.path : '/'
        const drifted = await withDesignDrift({
          answer,
          write: { page, why: 'look.set' },
          measure: (measured: string) => driftMeasure(at, laneKey, sessionId, measured)
        })
        // A literal it wrote over a design-system role is named with its var() (`role-pins.mjs`).
        return noted(
          await withRolePins(
            drifted,
            config,
            sitesRoot,
            at,
            writtenBySiteCall(
              'look.set',
              written === null ? plan.params : { ...plan.params, props: Object.fromEntries(written) }
            ),
            bodyMemory(sessionId, at)
          )
        )
      }
      if (plan.action === 'content.find') {
        return noted(
          await contentFind(
            sitesRoot,
            label ?? gatewaySetting('MCP_TRACY_SITE_LABEL'),
            plan.params,
            detectPlatform
          )
        )
      }
      // EmDash keeps its pictures in its own store, not under the webroot: its scan is the library's
      // (`media-emdash.mjs`), answered below where the site's own door is at hand.
      const scanOnEmdash =
        plan.action === 'media.scan' &&
        (facts.platform === 'emdash' || (await isEmdashSite(config, label ?? labelOfKey(key))))
      if (plan.action === 'media.scan' && !scanOnEmdash) {
        const limit = typeof plan.params.limit === 'number' ? plan.params.limit : 20
        return noted(await mediaScan(config, laneKey, limit, label === null ? null : `${sitesRoot}/${label}`))
      }
      // The site whose flight and snapshots a call belongs to: the workspace's label, or on a
      // lane the label its key names.
      const site = label ?? labelOfKey(key)
      /** The EmDash site this conversation is rooted in, or the fence's refusal (never a named site). */
      const emdashSiteHere = () => {
        const sessionCwd = (exec?.agent?.session as { header?: { cwd?: unknown } } | undefined)?.header?.cwd
        return emdashSiteOf({
          siteKey: null,
          sessionCwd: typeof sessionCwd === 'string' ? sessionCwd : null,
          laneSiteKey: laneSiteKey(),
          sitesRoot
        })
      }
      /**
       * One picture Tracy holds, into an EmDash media store — drawn (`media.draw`) or the customer's
       * own (`media.upload`): the site's own `media_upload`, run as `tracy_emdash` would run it (same
       * fence, same rules). `{ok, id, url}`, or EmDash's refusal as `runEmdashTool` answers it.
       */
      const emdashUpload =
        (emdashSite: Extract<ReturnType<typeof emdashSiteOf>, { ok: true }>) =>
        async (bytes: Buffer, filename: string, contentType: string, alt: string | null = null) => {
          const emdashFacts = { platform: 'emdash', sealed: false }
          const args = {
            tool: 'media_upload',
            arguments: { filename, contentType, base64: bytes.toString('base64'), ...(alt ? { alt } : {}) }
          }
          const answer = (await runEmdashTool({
            args,
            site: emdashSite,
            artifact: await readArtifact(sitesRoot, emdashSite.label),
            mcp: emdashMcpFor(emdashSite, sessionId ?? null),
            state: emdashState,
            sessionId,
            turn: memory.turnOf(sessionId),
            memory,
            page: (action: 'page.text' | 'page.look', params: Record<string, unknown>) =>
              action === 'page.text'
                ? pageText(config, sitesRoot, emdashSite.label, params, emdashFacts)
                : pageLook(ctx, exec, config, sitesRoot, emdashSite.label, params, emdashFacts),
            ...(config.sleep ? { sleep: async (ms: number) => void (await config.sleep?.(ms)) } : {})
          })) as { ok?: boolean; result?: Record<string, unknown> } & Record<string, unknown>
          if (answer?.ok !== true) return answer
          // The site answers `{item:{id, url, …}}` (measured 26/09 on r1e1734); a flat shape is kept for safety.
          const result = answer.result && typeof answer.result === 'object' ? answer.result : {}
          const item = (result as { item?: Record<string, unknown> }).item ?? result
          // E5.e4: the same bytes come back as the item already in the library (`deduplicated`, EmDash
          // `handleMediaUpload`) — nothing was written and EmDash logs nothing, so nothing is reported.
          if ((result as { deduplicated?: unknown }).deduplicated === true)
            return {
              ok: true,
              id: item.id ?? null,
              url: item.url ?? null,
              deduplicated: true,
              alt: item.alt ?? null
            }
          // C1 media (04/10/2026): reported like a `tracy_emdash` write, naming the item it made — EmDash
          // logs the upload with that id and no user, and only this report says the upload was Tracy's.
          siteChanged(
            emdashSite.label,
            sessionId,
            'media_upload',
            'emdash-mcp',
            emdashWriteTarget(args, answer)
          )
          return { ok: true, id: item.id ?? null, url: item.url ?? null }
        }
      if (scanOnEmdash) {
        const emdashSite = emdashSiteHere()
        if (!emdashSite.ok) return noted(withNext(emdashSite, { platform: 'emdash' }))
        const emdashFacts = { platform: 'emdash', sealed: false }
        return noted(
          await emdashMediaScan({
            params: plan.params,
            label: emdashSite.label,
            call: async (tool: string, toolArgs: Record<string, unknown>) =>
              runEmdashTool({
                args: { tool, arguments: toolArgs },
                site: emdashSite,
                artifact: await readArtifact(sitesRoot, emdashSite.label),
                mcp: emdashMcpFor(emdashSite, sessionId ?? null),
                state: emdashState,
                sessionId,
                turn: memory.turnOf(sessionId),
                memory,
                page: (action: 'page.text' | 'page.look', params: Record<string, unknown>) =>
                  action === 'page.text'
                    ? pageText(config, sitesRoot, emdashSite.label, params, emdashFacts)
                    : pageLook(ctx, exec, config, sitesRoot, emdashSite.label, params, emdashFacts),
                ...(config.sleep ? { sleep: async (ms: number) => void (await config.sleep?.(ms)) } : {})
              }),
            // Copied by the site container's own node into the folder `page.look` writes and
            // `read_image` opens; the host names the path it reads back, the container its own.
            copy: async ({ storageKey, name }: { storageKey: string; name: string }) => {
              const file = path.join(sitesRoot, emdashSite.label, 'docs', 'agents', 'look', name)
              try {
                await fs.mkdir(path.dirname(file), { recursive: true })
              } catch (error) {
                return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
              }
              const run = await runExec(config, {
                argv: mediaCopyArgv({
                  container: emdashSite.container,
                  storageKey,
                  file: containerMediaFile(emdashSite.label, name)
                }),
                timeoutMs: MCP_TIMEOUT_MS,
                maxBuffer: 1024 * 1024
              })
              if (run.spawnError || run.timedOut)
                return { ok: false as const, error: run.spawnError || 'timed out' }
              const parsed = parseMediaCopy(run.stdout)
              if (!parsed.ok) return parsed
              if (!existsSync(file)) return { ok: false as const, error: 'no file was written' }
              return { ok: true as const, file, bytes: parsed.bytes, mediaType: parsed.mediaType }
            },
            seen: (shot: { file: string; url: string; mediaType: string }) =>
              pageSeen(ctx, exec, config, shot)
          })
        )
      }
      if (plan.action === 'media.draw') {
        // EmDash (26/09/2026): no viewer, no contract door — the picture is uploaded through the
        // site's own `media_upload` tool, as `tracy_emdash` would run it (same fence, same rules),
        // and the answer names the url to write into the entry field. `draw.mjs` holds the road.
        if (facts.platform === 'emdash' || (site !== null && (await isEmdashSite(config, site)))) {
          const emdashSite = emdashSiteHere()
          if (!emdashSite.ok) return noted(withNext(emdashSite, { platform: 'emdash' }))
          const upload = emdashUpload(emdashSite)
          const emdashFacts = { platform: 'emdash', sealed: false }
          return noted(
            await mediaDraw({
              params: plan.params,
              webroot: null,
              platform: 'emdash',
              door: pictureDoor(process.env),
              draw: drawPicture,
              // `replaces`: the stored size of the picture in that entry field, read through the same
              // road `tracy_emdash` takes (same fence, same rules) — the model never types a ratio.
              measure: (replaces: { collection: string; id: string; field: string; locale?: string }) =>
                measureReplaced({
                  replaces,
                  call: async (tool: string, toolArgs: Record<string, unknown>) =>
                    runEmdashTool({
                      args: { tool, arguments: toolArgs },
                      site: emdashSite,
                      artifact: await readArtifact(sitesRoot, emdashSite.label),
                      mcp: emdashMcpFor(emdashSite, sessionId ?? null),
                      state: emdashState,
                      sessionId,
                      turn: memory.turnOf(sessionId),
                      memory,
                      page: (action: 'page.text' | 'page.look', params: Record<string, unknown>) =>
                        action === 'page.text'
                          ? pageText(config, sitesRoot, emdashSite.label, params, emdashFacts)
                          : pageLook(ctx, exec, config, sitesRoot, emdashSite.label, params, emdashFacts),
                      ...(config.sleep
                        ? { sleep: async (ms: number) => void (await config.sleep?.(ms)) }
                        : {})
                    })
                }),
              upload: (p: { path: string; content_b64: string }) => {
                const filename = p.path.split('/').pop() ?? 'picture.png'
                const ext = filename.split('.').pop()?.toLowerCase() ?? 'png'
                const contentType =
                  ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
                return upload(Buffer.from(p.content_b64, 'base64'), filename, contentType)
              }
            })
          )
        }
        // Drawn here, uploaded through the site door as the viewer — the same road media.upload takes.
        const { plan: route, actorKey } = planFor(sessionId ?? undefined)
        if (route === null)
          return {
            ok: false,
            code: 'NO_VIEWER',
            error:
              'Nobody has this site open in a browser yet; the tool acts as the person using it. Ask them to reload the page.'
          }
        // The same key `runSiteCall` files this person's inspect under, so a draw and a read in one
        // turn share one snapshot (#316: every draw used to relay a whole inspect of its own).
        const inspectKey = { sessionId, label: site, actor: actorKey }
        const siteFolder = label === null ? null : `${sitesRoot}/${label}`
        const webroot = await webrootOf(config, siteFolder)
        /**
         * The contract's picture slots, one inspect narrowed to pictures (and to one block when `entity`
         * says which): its demo picture is the shape to draw. 🔒 In the site's flight (D7), and narrowed
         * to the slot's own block as well as to pictures: a filtered inspect is capped
         * (INSPECT_BUDGET_CHARS), and a contract with more picture slots than fit would cut the very
         * slot asked about. 🔒 From this turn's snapshot when this person already has one (E3.1), as
         * `contractCall`'s inspect is; one relay otherwise, kept only if nothing wrote while it was on
         * the wire (D8).
         */
        const imageSlotsOf = async (
          entity: string | null
        ): Promise<{ key: string; label?: string; sample?: string; current?: string }[]> => {
          const full = await memory.flight(site, async () => {
            const hit = memory.inspectCached(inspectKey)
            if (hit) return hit.answer
            const generation = memory.generationOf(site)
            // The lookup waits out the component's lock and asks a lost answer once more, as the
            // replace road's snapshot does (#316 review): a failed read is not "no such slot".
            const answer = await readThroughLock(
              (a: string, p: Record<string, unknown>) =>
                relayRaw(route, key, a, p, plan.target, label, sessionId, preset),
              'content.contract',
              { operation: 'inspect' },
              config.sleep ? { sleep: async (ms: number) => void (await config.sleep?.(ms)) } : {}
            )
            memory.rememberInspect(inspectKey, answer, generation)
            const a = answer as { ok?: unknown; revision?: unknown } | null
            if (a?.ok === true && typeof a.revision === 'string')
              memory.rememberRevision(sessionId, site, a.revision)
            return answer
          })
          const inspected = narrowInspect(full, {
            operation: 'inspect',
            slots: 'image',
            ...(entity === null ? {} : { entity })
          }) as { slots?: { key: string; label?: string; sample?: string; current?: string }[] }
          return inspected.slots ?? []
        }
        return noted(
          await mediaDraw({
            params: plan.params,
            webroot,
            // The folder the site's Claude Cowork plugin takes an upload into differs by CMS.
            platform:
              facts.platform === 'wordpress' || facts.platform === 'joomla'
                ? facts.platform
                : await detectPlatform(webroot),
            // A bound WordPress site: a picture lands in an image slot or nowhere.
            slotOnly: facts.platform === 'wordpress' && facts.contractDoor === true,
            door: pictureDoor(process.env),
            draw: drawPicture,
            // The slot asked about: its demo picture is the shape to draw (`imageSlotsOf`).
            resolveSlot: async (slotKey: string) => {
              const found = (await imageSlotsOf(slotKey.split('.')[0])).find((s) => s.key === slotKey)
              return found?.sample ? { sample: found.sample, current: found.current } : null
            },
            // The image slots a refusal lists (`SLOT_REQUIRED`, `SLOT_NOT_FOUND`): the same snapshot, so
            // choosing among them costs no relay of its own.
            imageSlots: (entity: string | null) => imageSlotsOf(entity),
            upload: (params: Record<string, unknown>) =>
              relay(route, key, 'media.upload', params, plan.target, label, sessionId, preset)
          })
        )
      }
      if (plan.action === 'media.upload') {
        // 27/09/2026: the customer's own picture, NAMED — the host reads it from the site folder the
        // Files tab writes into, fenced there (`upload.mjs`), and uploads it through the site's own
        // door: EmDash's `media_upload` as above, a Joomla or WordPress component's `media.upload`
        // through the seat book as the viewer, guarded like every model write (`runSiteCall`). A call
        // with no `file` there is the model's own `content_b64`, judged below like any relay (F5).
        // 29/09/2026: or the picture the customer sent in THIS chat (`attachment`), chosen among this
        // session's own attachments and read back from dsh's store (`chatPicture`) — the same doors.
        if (facts.platform === 'emdash' || (site !== null && (await isEmdashSite(config, site)))) {
          const emdashSite = emdashSiteHere()
          if (!emdashSite.ok) return noted(withNext(emdashSite, { platform: 'emdash' }))
          const upload = emdashUpload(emdashSite)
          return noted(
            withNext(
              await mediaUpload({
                params: plan.params,
                platform: 'emdash',
                siteRoot: `${sitesRoot}/${emdashSite.label}`,
                readAttachment: chatPicture(sessionEvents(sessionId)),
                upload: (p: { bytes: Buffer; filename: string; contentType: string; alt: string | null }) =>
                  upload(p.bytes, p.filename, p.contentType, p.alt)
              }),
              { ...nextFacts, platform: 'emdash', action: plan.action, tool: 'media_upload' }
            )
          )
        }
        if (plan.params.file !== undefined || asksAttachment(plan.params)) {
          const at = label ?? laneLabel
          if (at === null)
            return {
              ok: false,
              code: 'NO_SITE_IN_CONVERSATION',
              error: 'This lane names no site, so there is no site folder to read a file from.'
            }
          const { plan: route, actorKey, events } = planFor(sessionId ?? undefined)
          if (route === null)
            return {
              ok: false,
              code: 'NO_VIEWER',
              error:
                'Nobody has this site open in a browser yet; the tool acts as the person using it. Ask them to reload the page.'
            }
          const siteFolder = `${sitesRoot}/${at}`
          return noted(
            withNext(
              await mediaUpload({
                params: plan.params,
                // The folder a Claude Cowork plugin takes a picture into differs by CMS (`pictureFolder`).
                platform:
                  facts.platform === 'wordpress' || facts.platform === 'joomla'
                    ? facts.platform
                    : await detectPlatform(await webrootOf(config, siteFolder)),
                siteRoot: siteFolder,
                contract: actions?.includes('content.contract') ?? false,
                // An imported copy has the door too, but its theme's picture is no slot (`placedNext`).
                quickstart: (actions?.includes('content.contract') ?? false) && facts.derived !== true,
                readAttachment: chatPicture(events),
                upload: (params: Record<string, unknown>) =>
                  runSiteCall({
                    plan: { action: 'media.upload', params, notes: [] },
                    facts: siteCallFacts(facts, actions),
                    memory,
                    send: (action: string, p: Record<string, unknown>) =>
                      relayRaw(route, key, action, p, plan.target, label, sessionId, preset),
                    ...(config.sleep ? { sleep: config.sleep } : {}),
                    events,
                    actorKey,
                    sessionId,
                    label: site,
                    signal: exec?.signal ?? null
                  })
              }),
              { ...nextFacts, action: plan.action }
            )
          )
        }
      }
      if (plan.action === 'content.replace') {
        // The replace job (PR2, action form of D21): the engine for this site's door, its writes
        // through the same relay and guards as every other write below (`replace-road.mjs`).
        const at = label ?? gatewaySetting('MCP_TRACY_SITE_LABEL')
        if (at === null)
          return {
            ok: false,
            code: 'NO_SITE_IN_CONVERSATION',
            error: 'This lane names no site, so there are no words to change.'
          }
        const emdash = facts.platform === 'emdash' || (await isEmdashSite(config, at))
        const { plan: route, actorKey, events } = planFor(sessionId ?? undefined)
        if (!emdash && route === null)
          return {
            ok: false,
            code: 'NO_VIEWER',
            error:
              'Nobody has this site open in a browser yet; the tool acts as the person using it. Ask them to reload the page.'
          }
        const internalPort = await sitePortFor(config, sitesRoot, at)
        const run = (input: {
          argv: readonly string[]
          stdin?: string
          timeoutMs: number
          maxBuffer: number
        }) => runExec(config, input)
        // An EmDash site writes through its own script and needs no viewer; the relay is then never asked.
        const send = async (action: string, params: Record<string, unknown>): Promise<unknown> =>
          route === null
            ? { ok: false, code: 'NO_VIEWER', error: 'Nobody has this site open in a browser yet.' }
            : relayRaw(route, key, action, params, plan.target, label, sessionId, preset)
        // A price is the customer's to change (council 19/10/2026): asked before anything is located,
        // however few places; a dryRun writes nothing and is not asked. The question names old and new.
        const replaceParams = (plan.params ?? {}) as Record<string, unknown>
        let priceAgreed = false
        if (replaceParams.dryRun !== true) {
          const changes = [
            { find: replaceParams.find, replace: replaceParams.replace },
            ...(Array.isArray(replaceParams.changes) ? (replaceParams.changes as unknown[]) : [])
          ]
          for (const change of changes) {
            const c = (change ?? {}) as { find?: unknown; replace?: unknown }
            const price = consequenceOf(
              emdash ? 'emdash' : String(facts.platform ?? ''),
              'content.replace',
              {},
              {
                find: typeof c.find === 'string' ? c.find : '',
                replace: typeof c.replace === 'string' ? c.replace : ''
              }
            )
            if (price?.reason !== 'price') continue
            const asked = askFirst(price, replaceParams)
            if (asked !== null) return noted(asked)
            priceAgreed = true
            break
          }
        }
        const replaced = await runReplace({
          params: withoutConfirm(plan.params),
          // The yes to a price is a yes to this call; the count asks on its own otherwise (`replace-road.mjs`).
          confirm: replaceParams.confirm === true && !priceAgreed,
          platform: emdash ? 'emdash' : facts.platform,
          contractDoor: emdash
            ? false
            : facts.sealed === true && facts.platform === 'joomla'
              ? true
              : facts.contractDoor,
          contractBound: !emdash && facts.sealed === true && facts.platform === 'joomla',
          sessionId,
          label: at,
          actorKey,
          events,
          memory,
          dryRuns,
          send,
          // A saved demo or own-site plan agreed to the places it writes (`demoPlanAgreed`).
          planAgreed: () => demoPlanAgreed(exec),
          // The Joomla snapshot's lock retries end at Stop as `runSiteCall`'s do (review C2).
          ...(exec?.signal ? { clock: { sleep: stoppableSleep(null, exec.signal) } } : {}),
          siteCall: (action: string, params: Record<string, unknown>) =>
            runSiteCall({
              plan: { action, params, notes: [] },
              facts: siteCallFacts(facts, actions),
              memory,
              send,
              // The replace job rewrites the bodies it reads: never an outline for them (W2).
              bodiesWhole: true,
              ...(config.sleep ? { sleep: config.sleep } : {}),
              events,
              actorKey,
              sessionId,
              label: site,
              signal: exec?.signal ?? null,
              readWebrootFile: async (file: string) =>
                webrootFileText(
                  await webrootOf(config, label === null ? null : `${sitesRoot}/${label}`),
                  file
                )
            }),
          pageHtml: (path: string) =>
            fetchPageHtml({
              run,
              label: at,
              internalPort,
              publicOrigin: hostPublicOrigin(config, at),
              path,
              door: contentDoor(facts)
            }),
          emdash: async () => ({
            // Each write run takes (renews) the site's write lease first (review Q1).
            ...leasedScriptRoad(
              emdashScriptRoad({
                run,
                container: `${at}-web-1`,
                ...(config.sleep ? { sleep: config.sleep } : {}),
                signal: exec?.signal ?? null
              }),
              at,
              sessionId ?? null
            ),
            artifact: await readArtifact(sitesRoot, at),
            onRevFormula: (ok: boolean) => {
              if (!ok) emdashState.revsOff()
            }
          }),
          env: process.env
        })
        // An EmDash replace writes through the site's own MCP, not the Apply door: say it landed.
        if (emdash && emdashReplaceWrote(replaced))
          siteChanged(at, sessionId ?? null, 'content_replace', 'emdash-mcp')
        return noted(
          derivedReplaceNext(
            replaced as Record<string, any>,
            facts,
            (memory?.revisionOf(sessionId, at) ?? '') !== ''
          )
        )
      }
      if (plan.action === 'page.create') {
        // A new page and its menu entry in one call (`page-create.mjs`): the describe and the lists
        // through the raw relay, every get a write is built from and every write through `runSiteCall`
        // (the guards content.replace's writes pass), an EmDash site's through `tracy_emdash`'s road.
        const at = label ?? gatewaySetting('MCP_TRACY_SITE_LABEL')
        if (at === null)
          return {
            ok: false,
            code: 'NO_SITE_IN_CONVERSATION',
            error: 'This lane names no site, so there is no site to add a page to.'
          }
        const emdash = facts.platform === 'emdash' || (await isEmdashSite(config, at))
        const { plan: route, actorKey, events } = planFor(sessionId ?? undefined)
        if (!emdash && route === null)
          return {
            ok: false,
            code: 'NO_VIEWER',
            error:
              'Nobody has this site open in a browser yet; the tool acts as the person using it. Ask them to reload the page.'
          }
        const emdashSite = emdash ? emdashSiteHere() : null
        if (emdashSite !== null && !emdashSite.ok) return noted(withNext(emdashSite, { platform: 'emdash' }))
        const internalPort = await sitePortFor(config, sitesRoot, at)
        const run = (input: {
          argv: readonly string[]
          stdin?: string
          timeoutMs: number
          maxBuffer: number
        }) => runExec(config, input)
        const send = async (action: string, params: Record<string, unknown>): Promise<unknown> =>
          route === null
            ? { ok: false, code: 'NO_VIEWER', error: 'Nobody has this site open in a browser yet.' }
            : relayRaw(route, key, action, params, plan.target, label, sessionId, preset)
        const emdashFacts = { platform: 'emdash', sealed: false }
        const created = await runPageCreate({
          params: plan.params,
          platform: emdash ? 'emdash' : facts.platform,
          send,
          siteCall: (action: string, params: Record<string, unknown>) =>
            runSiteCall({
              plan: { action, params, notes: [] },
              facts: siteCallFacts(facts, actions),
              memory,
              send,
              // A menu body is spliced and sent back whole: never an outline for it (W2).
              bodiesWhole: true,
              ...(config.sleep ? { sleep: config.sleep } : {}),
              events,
              actorKey,
              sessionId,
              label: site,
              signal: exec?.signal ?? null
            }),
          pageHtml: (path: string) =>
            fetchPageHtml({
              run,
              label: at,
              internalPort,
              publicOrigin: hostPublicOrigin(config, at),
              path,
              door: contentDoor(facts)
            }),
          siteOrigin: hostPublicOrigin(config, at),
          mint: () => memory.mint('page'),
          // Where the new menu link SHOWS: the label read in the site container's own browser, the read
          // `page.look {style}` and `look.set` make (`lookSetMeasure`), at desktop and phone widths.
          menuSeen: lookSetMeasure(config, sitesRoot, at, emdash ? emdashFacts : facts),
          ...(emdashSite !== null && emdashSite.ok
            ? {
                emdash: async (tool: string, toolArgs: Record<string, unknown>) => {
                  const args = { tool, arguments: toolArgs }
                  const answer = await runEmdashTool({
                    args,
                    site: emdashSite,
                    artifact: await readArtifact(sitesRoot, emdashSite.label),
                    mcp: emdashMcpFor(emdashSite, sessionId ?? null),
                    state: emdashState,
                    sessionId,
                    turn: memory.turnOf(sessionId),
                    memory,
                    // The new page's own menu row is part of what the customer asked for (ADR 0034).
                    hostStep: true,
                    page: (action: 'page.text' | 'page.look', params: Record<string, unknown>) =>
                      action === 'page.text'
                        ? pageText(config, sitesRoot, emdashSite.label, params, emdashFacts)
                        : pageLook(ctx, exec, config, sitesRoot, emdashSite.label, params, emdashFacts),
                    ...(config.sleep ? { sleep: async (ms: number) => void (await config.sleep?.(ms)) } : {})
                  })
                  // Reported as `tracy_emdash` reports its writes: the site's own log names no user.
                  const wrote = emdashWriteTool(args, answer)
                  if (wrote !== null)
                    siteChanged(
                      emdashSite.label,
                      sessionId ?? null,
                      wrote,
                      'emdash-mcp',
                      emdashWriteTarget(args, answer)
                    )
                  return answer
                }
              }
            : {})
        })
        return noted(created)
      }
      // 🔒 NO CATCH-ALL FOR LANE-LOCAL ACTIONS. This was `if (plan.local)` around `mediaScan`, so
      // a name added to LOCAL_ACTIONS without a branch above did not fail — it ran the image scan
      // and answered `{ok: true}` with a list of pictures. A wrong answer that reports success is
      // the one shape this repo refuses everywhere else, and `planCall` cannot catch it: the
      // action IS in the list.
      if (plan.local)
        return {
          ok: false,
          code: 'LOCAL_ACTION_NOT_WIRED',
          error: `"${plan.action}" is listed as a lane action but nothing here answers it.`
        }
      // `content.read` and `content.locate` are the relayed actions an EmDash site answers: the relay
      // serves both through the site's own reader (#352, `emdashContentDoor`); every other one has no
      // door there.
      if (
        plan.action !== 'content.read' &&
        plan.action !== 'content.locate' &&
        (facts.platform === 'emdash' || (await isEmdashSite(config, site)))
      )
        return withNext(
          { ok: false, code: 'EMDASH_SITE', error: EMDASH_ROAD },
          { ...nextFacts, platform: 'emdash', action: plan.action }
        )
      const { plan: route, bound, actorKey, events } = planFor(sessionId ?? undefined)
      if (route === null) {
        return {
          ok: false,
          code: 'NO_VIEWER',
          error:
            'Nobody has this site open in a browser yet; the tool acts as the person using it. Ask them to reload the page.'
        }
      }
      // Corrected, guarded, sent through the one relay, retried when the site's lock was merely
      // taken, remembered and cut to size — `site-call.mjs`; the relay is `relayRaw`, whose
      // answer carries no next yet: `runSiteCall` writes it with this site's facts.
      const answer = await runSiteCall({
        // A saved demo or own-site plan agreed to its consequence writes (`demoPlanAgreed`).
        planAgreed: () => demoPlanAgreed(exec),
        // the bodies the role pins judge a later write against, as read (`withRolePins`)
        onRead: (params: Record<string, unknown>, got: unknown) => {
          const at = label ?? laneLabel
          if (at !== null)
            for (const b of bodiesRead(params, got, String(facts.platform ?? 'unknown')))
              bodyMemory(sessionId, at).keep(b.address, b.text)
        },
        plan,
        facts: siteCallFacts(facts, actions),
        memory,
        send: (action: string, params: Record<string, unknown>) =>
          relayRaw(route, key, action, params, plan.target, label, sessionId, preset),
        ...(config.sleep ? { sleep: config.sleep } : {}),
        events,
        actorKey,
        sessionId,
        label: site,
        // The turn's Stop: no wait runs on, no second send starts (`turn-stop.mjs`, review C2).
        signal: exec?.signal ?? null,
        // D6′ (a): a template part the site stores no copy of is judged against its theme file.
        readWebrootFile: async (file: string) =>
          webrootFileText(await webrootOf(config, label === null ? null : `${sitesRoot}/${label}`), file),
        // The language a site serves under a prefix, for an address the model wrote without one.
        siteFacts: async () => (label === null ? null : measuredFacts(sitesRoot, label)),
        // Ladder DL09: a removal's receipt reads the pages this conversation read for the words it took
        // off, before and after the write (`removal-check.mjs`), through the same reader as `page.text`.
        readPage: (path: string, match: string) =>
          pageText(
            config,
            sitesRoot,
            label ?? gatewaySetting('MCP_TRACY_SITE_LABEL'),
            { path, match },
            facts
          ),
        pagesSeen: () => (typeof sessionId === 'string' ? (pagesReadBy.get(sessionId) ?? []) : []),
        // The model's own write: a record other pages show too asks first (`consequence.mjs` `shared`).
        modelCall: true
      })
      // ADR 0023: the site changed its look, so its design record follows — or the adherence
      // check measures the old palette from the next edit on. Best effort: a folder that cannot
      // take the record does not fail the apply that already went through.
      if (
        plan.action === 'theme.style' &&
        answer &&
        typeof answer === 'object' &&
        (answer as { ok?: unknown }).ok === true &&
        label !== null &&
        typeof plan.params.style === 'string'
      ) {
        try {
          refreshDesign(`${sitesRoot}/${label}`, {
            id: plan.params.style,
            tokensDirs: tokensDirsOf(null),
            names: catalogNames({}),
            wroteBy: 'theme.style',
            platform: typeof facts.platform === 'string' ? facts.platform : undefined
          })
        } catch {
          // best effort, see above
        }
      }
      // ADR 0023, "Addendum 30/09": a write that can change the look answers with the drift it
      // caused, measured on the page it touched AFTER the record above follows a `theme.style` — so
      // a style switch is judged by the system it switched to. Only an ok:true answer is measured,
      // and nothing here can turn it into a refusal (`design-drift.mjs`).
      const readId = Number((plan.params as { id?: unknown }).id)
      const measuredLabel = label ?? laneLabel
      const look =
        measuredLabel === null
          ? null
          : lookWrite(plan.action, plan.params, String(facts.platform ?? 'unknown'), {
              postType:
                sessionId !== null && Number.isInteger(readId) && readId > 0
                  ? (memory.readOf(sessionId, { id: readId })?.postType ?? null)
                  : null
            })
      const measured = await withDesignDrift({
        answer,
        write: look,
        measure: (page: string) => driftMeasure(measuredLabel as string, laneKey, sessionId, page)
      })
      // A literal colour, corner or face the write typed over a design-system role (`role-pins.mjs`).
      const drifted =
        measuredLabel !== null && (facts.platform === 'wordpress' || facts.platform === 'joomla')
          ? await withRolePins(
              measured,
              config,
              sitesRoot,
              measuredLabel,
              writtenBySiteCall(plan.action, plan.params, String(facts.platform ?? 'unknown')),
              bodyMemory(sessionId, measuredLabel)
            )
          : measured
      // #1710: a write into WordPress's Additional CSS (the `custom_css` post) is read back on the
      // home page — a theme that does not print it there turns the receipt into a warning, never "done".
      const printed =
        measuredLabel === null
          ? drifted
          : await withAdditionalCssCheck({
              answer: drifted,
              css: additionalCssSent(plan.action, plan.params, String(facts.platform ?? 'unknown'), {
                typeOf: (id: number) =>
                  sessionId === null ? null : (memory.readOf(sessionId, { id })?.postType ?? null)
              }),
              read: pageHtmlFor(config, sitesRoot, measuredLabel, facts)
            })
      // Say when the call ran as the latest viewer rather than this session's: two people in one
      // lane is the case where that matters, and the agent should know whose name it acted in.
      return bound || !printed || typeof printed !== 'object'
        ? printed
        : { ...(printed as Record<string, unknown>), actedAs: 'latest-viewer' }
    }
  }
  // Every answer leaves as lossless JSON (`lossless.mjs`): dsh fails the whole call otherwise, and a
  // write that landed read to the model as an error (A1, 27/09). Wrapped before any per-agent copy
  // is made, so every copy carries it.
  //
  // 🔒 `comment` (H6) comes off the call HERE, before `planCall` would move it into `params` and on to
  // a door, the replace road or a contract apply — and goes back onto the answer for `render` to echo.
  // While the call runs it is held in `answeringComment`, so each Apply call names it beside `action`.
  const siteExecute = siteTool.execute
  siteTool.execute = async (args: unknown, exec: ToolRun) => {
    const taken = takeComment(args)
    if (!taken.ok) return taken.answer
    const run = () => withTurnSignal(exec, () => siteExecute.call(siteTool, taken.args, exec), stopped)
    const answered = taken.comment === null ? await run() : await answeringComment.run(taken.comment, run)
    // Opt D: a read right after a clean receipt says the receipt was the check (`receipt-echo.mjs`).
    const answer = sawSiteCall(exec, 'tracy_site', taken.args, answered)
    return withComment(
      losslessAnswer(answer, (paths: string[]) =>
        warn(`[site-tools] tracy_site answer repaired for dsh: ${paths.join(', ')}`)
      ),
      taken.comment
    )
  }
  ctx.effect(() => ctx.tools.register(siteTool), 'tracy-site-tools: tracy_site')

  /**
   * The design the site wears, as tracy-web records it (ADR 0023, "Addendum 29/09"): the folder's
   * copy is refreshed from tracy-web first, and kept when tracy-web does not answer.
   *
   * 🔒 A DESIGN-SYSTEM SLOT THE SITE WEARS WINS (10/10/2026, `ds-slot-worn.mjs`): it is what every page
   * prints, and no door records it, so tracy-web answered `{design:null}` for a site wearing one and
   * the check said "This site wears no design system". Its tokens are the slot's own colours and font
   * stacks, resolved: measured on the stand's three home pages against them, 98 (EmDash), 100
   * (WordPress) and 99 (Joomla) — a ruler, not noise. `tokens: null` when the slot gave none to read.
   * `freshSlot`: read the site now (the check), not the minute-old reading a step used; otherwise the
   * read waits no longer than a step does (`SLOT_WAIT_MS`).
   */
  async function wornDesign(
    folder: string,
    laneKey: string | null,
    sessionId: string | null,
    freshSlot = false
  ) {
    // A write's drift measure waits no longer than a step does; the check, asked for, reads the site now.
    const slotWork = slotOf(
      path.basename(folder),
      freshSlot ? { fresh: true } : { waitMs: SLOT_WAIT_MS }
    ).catch(() => undefined)
    const recordKey = laneKey ?? (await siteKeyInFolder(folder))
    if (recordKey !== null)
      await pullDesign(folder, () =>
        fetchDesign(
          designGetRequest(
            planFor(sessionId ?? undefined).plan,
            recordKey,
            config.origin ?? gatewaySetting('MCP_TRACY_ORIGIN')
          )
        )
      )
    const slot = await slotWork
    if (slot)
      return {
        schemaVersion: 'tracy-site-design/v1',
        id: slot.id,
        source: 'slot',
        name: slot.name,
        bound: true,
        platform: slot.platform,
        where: slot.where,
        tokens: Object.keys(slot.tokens).length > 0 ? slot.tokens : null,
        allow: undefined
      }
    return readDesign(folder)
  }

  /**
   * One page of a site, probed for its styles the way `page.look` reaches it (gate, then the
   * container's browser on the loopback or public-origin route; dsh's browser where the site has
   * none — `measurePage`). The ONE measuring road: `tracy_design_check` and the write door's drift
   * measure (`design-drift.mjs`) both come here.
   */
  async function measureSitePage(
    label: string,
    at: string
  ): Promise<
    | {
        ok: true
        url: string
        probe: { href: string; seen: number; samples: unknown[] }
        browser: 'site' | 'host'
      }
    | { ok: false; why: string; badPath?: true }
  > {
    const facts = await siteFactsOf(resolveSitesRoot(undefined), label)
    const door = contentDoor(facts)
    const publicOrigin = hostPublicOrigin(config, label)
    const internalPort = await sitePortFor(config, resolveSitesRoot(undefined), label)
    const target = lookTarget(label, at, internalPort)
    if (!target.ok) return { ok: false, why: target.error, badPath: true }
    const gate = await pageLookGate({
      run: (input: { argv: readonly string[]; stdin?: string; timeoutMs: number; maxBuffer: number }) =>
        runExec(config, input),
      label,
      internalPort,
      publicOrigin,
      path: target.path,
      door
    })
    let btarget: {
      url: string
      origin: string
      container: string
      resolverRule: string
      via: string
    } | null
    let shownUrl = target.url
    if ('legacy' in gate) {
      const probe = await inContainerProbe(config, label, internalPort, target, publicOrigin, door)
      if (!probe.ok) return { ok: false, why: `${at} did not answer from the site` }
      btarget = browserTargetFor(label, probe, internalPort, target)
    } else if (!gate.ok) return { ok: false, why: `${at} did not answer from the site` }
    else {
      btarget = gate.target
      shownUrl = gate.url
    }
    if (btarget === null)
      return { ok: false, why: `${at} is served on a port this site does not expose here` }
    const measured = await measurePage({
      target: btarget,
      runInContainer: async (t) =>
        (
          await browseAsSite({
            target: t,
            publicOrigin,
            launch: (at) =>
              runExec(config, {
                argv: browserArgv({
                  container: at.container,
                  mode: 'styles',
                  url: at.url,
                  origin: at.origin,
                  resolverRule: at.resolverRule,
                  via: at.via
                }),
                timeoutMs: LOOK_TIMEOUT_MS,
                maxBuffer: 8 * 1024 * 1024
              })
          })
        ).res,
      runOnHost: async (t, chrome) =>
        (
          await browseAsSite({
            target: { ...t, resolverRule: '' },
            publicOrigin,
            launch: (at) =>
              (config.hostBrowser ?? hostBrowserExec)({
                chrome,
                target: hostBrowserTarget(at) ?? t
              })
          })
        ).res,
      hostChrome: config.hostChrome !== undefined ? config.hostChrome : hostChromeOf(process.env, existsSync)
    })
    if (!measured.ok) return { ok: false, why: measured.why }
    return { ok: true, url: shownUrl, probe: measured.probe, browser: measured.browser }
  }

  /**
   * The write door's drift measure (ADR 0023, "Addendum 30/09"): the page a look write touched,
   * against the design the site wears, reduced to what is new since the last report of that page —
   * which this measure then becomes. Every failure is a `checked: false` fact, never a throw.
   */
  const driftOrigins = pageOrigins()

  async function driftMeasure(label: string, laneKey: string | null, sessionId: string | null, page: string) {
    const folder = `${resolveSitesRoot(undefined)}/${label}`
    const design = await wornDesign(folder, laneKey, sessionId)
    if (!design || design.bound !== true || typeof design.id !== 'string' || !design.tokens)
      return {
        checked: false as const,
        why:
          design?.source === 'slot'
            ? 'the design-system slot this site wears gave no colour or font to measure against'
            : 'this site wears no design system the catalogue can name'
      }
    const got = await measureSitePage(label, page)
    if (!got.ok) return { checked: false as const, why: got.why }
    const file = path.join(folder, ...REPORT_FILE.split('/'))
    let before: unknown = null
    try {
      before = JSON.parse(await fs.readFile(file, 'utf8'))
    } catch {
      before = null
    }
    // The page as it was before this conversation's first look write: a revert to it is not drift.
    const origin = driftOrigins.origin(`${sessionId ?? ''}|${label}`, String(got.probe?.href ?? ''), before)
    const { measured, report } = driftOfProbe({
      design: { id: design.id, source: design.source, tokens: design.tokens, allow: design.allow },
      page,
      probe: got.probe,
      browser: got.browser,
      before,
      origin
    })
    try {
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, `${JSON.stringify(report, null, 2)}\n`)
    } catch {
      // the report file is the next write's baseline, a convenience: the answer carries the findings
    }
    return measured
  }

  /**
   * `tracy_design_check` (ADR 0023): the site measured against the design system it wears, in its
   * own browser, by value. Always `ok: true` — a warning, never a refusal (ADR 0022 §2): no design
   * bound, a browser that cannot run and a page that drifted are each an answer with a `next`.
   * The page is reached the way `page.look` reaches it (gate, then the container's browser on the
   * loopback or public-origin route), so what is measured is what the customer sees.
   */
  const designCheckTool = {
    name: 'tracy_design_check',
    description: DESIGN_CHECK_DESCRIPTION,
    parameters: DESIGN_CHECK_PARAMETERS,
    isConcurrencySafe: () => true,
    output: { schema: {}, render: (_args: unknown, value: unknown) => answerContent(value, []) },
    async execute(args: unknown, exec: ToolRun) {
      const asked = designCheckPaths(args)
      if (!asked.ok) return asked
      const laneKey = laneSiteKey()
      const sitesRoot = resolveSitesRoot(undefined)
      let label: string | null = null
      if (laneKey === null) {
        try {
          label = siteOf(String(exec?.agent?.session?.header?.cwd ?? ''), sitesRoot).label
        } catch {
          label = null
        }
      } else label = gatewaySetting('MCP_TRACY_SITE_LABEL')
      if (label === null)
        return {
          ok: false,
          code: 'NO_SITE_IN_CONVERSATION',
          error:
            "This conversation is not in a site's workspace. Ask the customer to open that site's workspace."
        }
      if (laneKey !== null && asked.siteKey !== null && asked.siteKey !== laneKey)
        return {
          ok: false,
          code: 'SITE_OUTSIDE_CONVERSATION',
          error: `This conversation works on ${laneKey} only.`
        }
      const folder = `${sitesRoot}/${label}`
      const design = await wornDesign(
        folder,
        laneKey,
        typeof exec?.agent?.session?.id === 'string' ? exec.agent.session.id : null,
        true
      )
      if (design?.source === 'slot' && typeof design.id === 'string' && !design.tokens)
        return skippedAnswer(
          'the design-system slot this site wears gave no colour or font to measure against',
          { id: design.id, source: 'slot' },
          design.where
        )
      if (!design || design.bound !== true || typeof design.id !== 'string' || !design.tokens)
        return noDesignAnswer(design)
      const worn = { id: design.id, source: design.source }
      const pages: {
        path: string
        url: string
        probe: { href: string; seen: number; samples: unknown[] }
        browser: 'site' | 'host'
      }[] = []
      for (const at of asked.paths) {
        const measured = await measureSitePage(label, at)
        if (!measured.ok && measured.badPath) return { ok: false, code: 'BAD_PATH', error: measured.why }
        if (!measured.ok)
          return skippedAnswer(
            asked.paths.length > 1 ? `${at}: ${measured.why}` : measured.why,
            worn,
            design.source === 'slot' ? design.where : undefined
          )
        pages.push({ path: at, url: measured.url, probe: measured.probe, browser: measured.browser })
      }
      const answer = checkedAnswer({
        design: { id: design.id, source: design.source, tokens: design.tokens, allow: design.allow },
        pages,
        reportPath: REPORT_FILE
      })
      try {
        const file = path.join(folder, ...REPORT_FILE.split('/'))
        await fs.mkdir(path.dirname(file), { recursive: true })
        await fs.writeFile(file, `${JSON.stringify(answer.reports[0], null, 2)}\n`)
      } catch {
        // the report file is a convenience; the answer carries the same findings
      }
      const { reports: _reports, ...shown } = answer
      return shown
    }
  }
  ctx.effect(() => ctx.tools.register(designCheckTool), 'tracy-site-tools: tracy_design_check')

  /**
   * `tracy_guide` (`guide-tool.mjs`): how to use Tracy itself — own domain and DNS, publish, backup,
   * export, team — read from tracy-web's guide, with this site's live state. Registered like
   * `tracy_design_check`: at the bundle layer, so every preset sees it, and in none of the lists that
   * hide or defer a tool (`PLATFORM_ONLY_TOOLS`, `DEFERRED_TOOLS`) — it must be there from the first
   * step, because the customer's question can be the first thing they type. It acts as the person
   * who is talking, so an Editor is never told an Owner's TXT value (the door decides, not this file).
   * Read-only, and `recheck` only has the door do what the Check again button does.
   */
  const guideTool = {
    name: 'tracy_guide',
    description: GUIDE_DESCRIPTION,
    parameters: GUIDE_PARAMETERS,
    isConcurrencySafe: () => true,
    output: { schema: {}, render: (_args: unknown, value: unknown) => answerContent(value, []) },
    async execute(args: unknown, exec: ToolRun) {
      const asked = guideCall(args)
      if (!asked.ok) return asked
      const sessionId = exec?.agent?.session?.id ?? null
      if (typeof sessionId !== 'string') return guideUnavailable('NO_SESSION')
      const sitesRoot = resolveSitesRoot(undefined)
      let label: string | null = null
      try {
        label = siteOf(String(exec?.agent?.session?.header?.cwd ?? ''), sitesRoot).label
      } catch {
        label = null
      }
      if (laneSiteKey() !== null) label = gatewaySetting('MCP_TRACY_SITE_LABEL')
      if (label === null || label === '') return guideUnavailable('NO_SITE_IN_CONVERSATION')
      const { plan } = planFor(sessionId)
      if (plan === null) return guideUnavailable('NOBODY_TO_ACT_AS')
      try {
        const res = await (config.fetch ?? fetch)(
          `${plan.origin}/api/sites/_conversation/guide?${asked.query}`,
          {
            method: 'GET',
            headers: conversationHeaders(plan, label, sessionId, false),
            signal: AbortSignal.timeout(GUIDE_TIMEOUT_MS)
          }
        )
        if (res.status === 404 || res.status === 405) return guideUnavailable('GUIDE_DOOR_MISSING')
        if (!res.ok) return guideUnavailable('GUIDE_DOOR_REFUSED', { httpStatus: res.status })
        return guideAnswer(await res.json().catch(() => null))
      } catch (error) {
        return guideUnavailable('GUIDE_UNREACHABLE', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }
  ctx.effect(() => ctx.tools.register(guideTool), 'tracy-site-tools: tracy_guide')

  /**
   * `tracy_design_system` (`chat-design-route.mjs`): the chat route to a whole design system, through
   * the Design system button's own door — so a system the agent puts on is the same bytes, the same
   * Site changes row and the same toolbar Undo as a press. The door refuses the apply while the
   * operator keeps `chat-design-system` off; reading what the site wears is always open. Deferred to
   * the design road (`deferred-tools.mjs`): the skill that leads a redesign lifts it.
   */
  const designSystemTool = {
    name: 'tracy_design_system',
    description: DESIGN_SYSTEM_DESCRIPTION,
    parameters: DESIGN_SYSTEM_PARAMETERS,
    isConcurrencySafe: (args: unknown) => (args as { action?: unknown } | null)?.action === 'read',
    output: { schema: {}, render: (_args: unknown, value: unknown) => answerContent(value, []) },
    async execute(args: unknown, exec: ToolRun) {
      const call = designSystemArgs(args)
      if (!call.ok) return call
      const laneKey = laneSiteKey()
      const sitesRoot = resolveSitesRoot(undefined)
      let label: string | null = null
      if (laneKey === null) {
        try {
          label = siteOf(String(exec?.agent?.session?.header?.cwd ?? ''), sitesRoot).label
        } catch {
          label = null
        }
      } else label = gatewaySetting('MCP_TRACY_SITE_LABEL')
      if (label === null)
        return {
          ok: false,
          code: 'NO_SITE_IN_CONVERSATION',
          error:
            "This conversation is not in a site's workspace. Ask the customer to open that site's workspace."
        }
      const sessionId = typeof exec?.agent?.session?.id === 'string' ? exec.agent.session.id : null
      // ADR 0034 (council 19/10/2026): a whole design system changes every page, so the customer says yes
      // to the door's own question first, as for a delete — once per yes (`call-memory.mjs` `confirmed`).
      if (call.action === 'apply' && sessionId !== null) {
        // The switch first: the customer is never asked about an apply the door then refuses.
        const routes = await designRoutesAt(
          config.origin ?? gatewaySetting('MCP_TRACY_ORIGIN'),
          config.fetch as typeof fetch | undefined
        )
        if (!routes.chat) return chatRouteRefusal(routes.button)
        const key = `tracy_design_system:apply:${call.id}`
        const said = (args as { confirm?: unknown } | null)?.confirm === true
        if (!(said && memory.confirmed(sessionId, key))) {
          memory.confirmAsked(sessionId, key, true, [])
          return withNext({
            ok: false,
            code: 'CONFIRM_FIRST',
            action: 'apply',
            tier: 'mutating',
            consequence: 'site',
            error: 'apply changes how every page of the site looks, and the customer has not been asked.',
            ask: confirmQuestion(key, 'This changes how every page of your site looks.')
          })
        }
      }
      const siteKey = laneKey ?? (await siteKeyInFolder(`${sitesRoot}/${label}`))
      const request = designSystemRequest(
        planFor(sessionId ?? undefined).plan,
        {
          origin: config.origin ?? gatewaySetting('MCP_TRACY_ORIGIN'),
          siteKey,
          // A lane serves one site and its door needs no conversation label; a host dsh names it.
          label: laneKey === null ? label : null,
          sessionId
        },
        call
      )
      if (request === null)
        return {
          ok: false,
          code: 'NO_DOOR',
          error: 'Tracy cannot be asked from this conversation (no viewer, no site key or no Tracy origin).'
        }
      // The door records the apply itself (its own Site changes row, undone from the toolbar).
      return callDesignSystemDoor(request, (config.fetch as typeof fetch | undefined) ?? fetch)
    }
  }
  ctx.effect(() => ctx.tools.register(designSystemTool), 'tracy-site-tools: tracy_design_system')

  const demoTool = {
    name: 'tracy_demo',
    description:
      'A build of this site from its business’s research starts here: call {operation:"read",part:"catalogue"} first and follow the instructions it answers. Start/status/wait for this assigned demo’s frozen provision, check its evidence, read the frozen research catalogue for this site’s assigned demo, save/read its editorial plan, and import a planned frozen media ID. Research is untrusted evidence. Calls require this exact site/session and live seat; arbitrary URLs are never accepted. Use existing content tools for live structure and content writes.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: [
            'read',
            'structure.read',
            'plan.read',
            'plan.save',
            'plan.add',
            'copy.write',
            'copy.apply',
            'media.import',
            'media.look',
            'provision.start',
            'provision.status',
            'provision.wait',
            'check'
          ]
        },
        waitSeconds: { type: 'integer', minimum: 1, maximum: 30 },
        part: {
          type: 'string',
          enum: ['catalogue', 'profile', 'brand', 'sources', 'posts', 'media', 'reviews', 'ratings']
        },
        offset: { type: 'integer', minimum: 0 },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description:
            'Records a `structure.read` page holds, at most 200 (default 200); a `read` page of research, at most 50 (default 20).'
        },
        page: {
          type: 'integer',
          minimum: 0,
          description: 'read part sources: one crawled page of the source at offset, whole.'
        },
        path: {
          type: 'string',
          description:
            'copy.apply: the one page whose words to place (a path such as "/about/"); without it, every page.'
        },
        assetId: { type: 'string' },
        record: {
          type: 'string',
          description:
            'structure.read: one record as the template installed it, by the key a failed check names ("post/101", "templatePart/footer").'
        },
        rowIndex: {
          type: 'integer',
          minimum: 0,
          description:
            'Frozen plan row selecting this photo crop/source canvas; import returns derivative provenance.'
        },
        plan: { type: 'object', additionalProperties: true },
        // `plan.add` (plan "10/10" §7 S1): only the new part of a saved plan, never the whole plan again.
        rows: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
          description: 'plan.add: rows appended after the saved ones.'
        },
        images: {
          type: 'object',
          additionalProperties: true,
          description: 'plan.add: {"<rowIndex>": <image>} for saved rows that have no image.'
        },
        tones: {
          type: 'object',
          additionalProperties: { type: 'string', enum: ['dark', 'light'] },
          description: 'plan.add: {"<rowIndex>": "dark" | "light"} for saved images that carry words.'
        },
        unplaced: { type: 'array', items: { type: 'object', additionalProperties: true } }
      },
      required: ['operation'],
      additionalProperties: false
    },
    isConcurrencySafe: (args: unknown) =>
      ['read', 'structure.read', 'plan.read', 'media.look'].includes(
        String((args as { operation?: unknown })?.operation)
      ),
    output: { schema: {}, render: (_args: unknown, value: unknown) => answerContent(value, []) },
    async execute(args: unknown, exec: ToolRun) {
      const assignedTurn = buildTurn(exec.agent)
      const remember = (answer: unknown) => {
        const session = exec?.agent?.session?.id
        if (session) buildTurns.observe(session, assignedTurn, answer, buildTurn(exec.agent))
        return answer
      }
      const laneKey = laneSiteKey()
      const sitesRoot = resolveSitesRoot(undefined)
      let label: string | null = null
      try {
        label =
          laneKey === null
            ? siteOf(String(exec?.agent?.session?.header?.cwd ?? ''), sitesRoot).label
            : gatewaySetting('MCP_TRACY_SITE_LABEL')
      } catch {
        label = null
      }
      const sessionId = exec?.agent?.session?.id ?? null
      const route = planFor(sessionId ?? undefined).plan
      const key =
        laneKey ??
        (label === null ? null : ((await siteKeyInFolder(`${sitesRoot}/${label}`)) ?? '_conversation'))
      if (!route || !key || !sessionId) return remember({ ok: false, code: 'AGENT_DEMO_NOT_GRANTED' })
      const log = exec?.agent?.session
      const events =
        log && typeof log.seq === 'number' && typeof log.eventAt === 'function'
          ? Array.from({ length: log.seq }, (_, n) => log.eventAt?.(n) as { type?: string; data?: unknown })
          : []
      // A check with nothing changed since the last one would fail the same way: it is not sent, and costs nothing.
      if ((args as { operation?: unknown })?.operation === 'check' && !changedSinceCheck(events))
        return { ...CHECK_UNCHANGED }
      // The words the copy tasks wrote, put on the site page by page with content.replace (`copy-apply.mjs`).
      if ((args as { operation?: unknown })?.operation === 'copy.apply') {
        const page = (args as { path?: unknown })?.path
        const research = async (params: Record<string, unknown>) =>
          remember(
            await applyDoor(
              config,
              route,
              key,
              'demo.research',
              params,
              null,
              laneKey === null ? label : null,
              sessionId
            )
          )
        return remember(
          await withTurnSignal(
            exec,
            async () => {
              // The words may still be being written (`copy.write` only starts them): wait for them first.
              const written = (await copyWritten(research, { signal: exec?.signal ?? null })) as {
                ok?: unknown
                running?: unknown
              }
              if (written?.ok === false || written?.running === true) return written
              return applyCopy({
                read: (path?: string) =>
                  research({ operation: 'copy.read', ...(path !== undefined ? { page: path } : {}) }),
                replace: async (
                  path: string,
                  changes: { find: string; replace: string }[],
                  options?: { all?: true | 'page'; expect?: number }
                ) =>
                  (await siteTool.execute(
                    { action: 'content.replace', params: { path, changes, ...options } },
                    exec
                  )) as {
                    ok?: unknown
                    change?: unknown
                    code?: unknown
                  },
                page: typeof page === 'string' ? page : undefined,
                signal: exec?.signal ?? null
              })
            },
            stopped
          )
        )
      }
      const answer = await withTurnSignal(
        exec,
        () =>
          runDemoLifecycle(
            args as Record<string, unknown>,
            (params: Record<string, unknown>) =>
              applyDoor(
                config,
                route,
                key,
                'demo.research',
                params,
                null,
                laneKey === null ? label : null,
                sessionId
              ),
            {
              signal: exec?.signal,
              // The residue sweep writes through the site tool (an EmDash site's through tracy_emdash), with every
              // guard a call of the agent has; a `link`, `image` or `usage` is resolved into those doors' calls.
              sweep: (call: { action: string; params: Record<string, unknown> }) =>
                resolveSweepCall(call, {
                  site: (action: string, params: Record<string, unknown>) =>
                    siteTool.execute({ action, params }, exec),
                  emdash: (tool: string, params: Record<string, unknown>) =>
                    emdashTool.execute({ tool, arguments: params }, exec),
                  // `media.usage` is the Apply door's read, not one of the agent's actions: the sweep alone asks
                  // where the theme keeps a template picture (`sweep-resolve.mjs` `pictureInStorage`).
                  usage: (action: string, params: Record<string, unknown>) =>
                    applyDoor(
                      config,
                      route,
                      key,
                      action,
                      params,
                      null,
                      laneKey === null ? label : null,
                      sessionId
                    )
                })
            }
          ),
        stopped
      )
      // A failed check while checks remain says so in its own answer, the moment the agent decides what comes next
      // (`checkAgainNext`). Not a steer at turn-stopping: the turn is closed on tracy-web by then
      // (tracy-site-tabs), and every write of the step a steer adds is refused AGENT_DEMO_TURN_NOT_BOUND.
      const verdict = answer as { pass?: unknown } | null
      if ((args as { operation?: unknown })?.operation === 'check' && verdict?.pass === false) {
        const next = checkAgainNext(
          { checks: buildChecks(events).checks + 1 },
          BUILD_CHECKS,
          contextRoom(events)
        )
        // Findings repaired at one check and back at this one say so first (`findingsCameBack`, local round 31).
        const came = findingsCameBack(events, verdict as Parameters<typeof findingsCameBack>[1])
        if (next !== null)
          (answer as Record<string, unknown>).next = came === null ? next : `${cameBackNext(came)} ${next}`
      }
      // `media.look`'s sheet of the research's photos, handed to the model as the picture it can see (local round 21).
      const sheet = (answer as { sheet?: unknown } | null)?.sheet
      if (typeof sheet === 'string') {
        delete (answer as Record<string, unknown>).sheet
        const picture = await storePicture(ctx, {
          jpeg: Buffer.from(sheet, 'base64')
        } as Parameters<typeof storePicture>[1])
        if (picture !== null) (answer as Record<string, unknown>)[PICTURE_KEY] = picture
      }
      const frozen = answer as { code?: unknown; next?: unknown } | null
      if (frozen?.code === 'AGENT_DEMO_PLAN_FROZEN' && typeof frozen.next !== 'string')
        (answer as Record<string, unknown>).next = PLAN_FROZEN_NEXT
      // Only a successful answer assigns this turn. Lifecycle refusals revoke this turn's cached exemptions.
      remember(answer)
      const issuesNext = planIssuesNext(answer)
      if (issuesNext !== null) (answer as Record<string, unknown>).next = issuesNext
      // A saved plan makes this conversation a planned build (`demoPlanAgreed`) from its next step on; any
      // answer at all makes it a build, which the loop brakes give a whole site's room (`loopNotices` `build`).
      const saved = answer as { ok?: unknown; planHash?: unknown; code?: unknown } | null
      if (saved?.ok === true && typeof saved.planHash === 'string')
        markPlanned(sessionId, Number.POSITIVE_INFINITY)
      const size = buildSizeOf(answer)
      if (size !== null && assignedTurn === buildTurn(exec.agent) && isBuild(sessionId, exec.agent)) {
        const held = buildSizes.get(sessionId)
        buildSizes.delete(sessionId)
        buildSizes.set(sessionId, { ...held, ...size })
        while (buildSizes.size > 500) buildSizes.delete(buildSizes.keys().next().value as string)
      }
      return checkAnswerForAgent(answer)
    }
  }
  ctx.effect(() => ctx.tools.register(demoTool), 'tracy-site-tools: tracy_demo')
  // Native local writes and generic shell/file tools cannot race provision, the baseline or the plan.
  ctx.on('tools/pre-execute', async (exec, next) => {
    const nativeWrite =
      ['tracy_site', 'tracy_emdash'].includes(exec.name) &&
      changesSite({ name: exec.name, arguments: exec.arguments })
    if (!nativeWrite && !demoToolNeedsReady(exec.name, exec.arguments)) return next()
    const result = (await withTurnSignal(exec, () =>
      nativeWrite ? demoGuard(exec, false) : demoWriteGuard({}, exec, true)
    )) as {
      code?: string
    } | null
    return result?.code && result.code !== 'AGENT_DEMO_NOT_GRANTED'
      ? { kind: 'deny', reason: result.code }
      : next()
  })

  /**
   * `tracy_emdash`, built ONCE, as `tracy_site` is, with `EMDASH_DESCRIPTION` on every EmDash site
   * (ADR 0022: a quickstart one included).
   */
  const emdashTool = {
    name: 'tracy_emdash',
    // T9: the five content tools described in full, so a words change needs no catalogue first;
    // `{list:true, tools:[…]}` is the exception for a tool it does not name (D23, D29).
    description: EMDASH_DESCRIPTION,
    parameters: EMDASH_PARAMETERS,
    // 🔒 E1.2: reads and the catalogue run beside each other; every write stays a barrier. dsh's
    // scheduler is fail-closed, so without this every EmDash read waited for the one before it.
    isConcurrencySafe: (args: unknown) => emdashRunsInParallel(args),
    output: {
      schema: {},
      // The answer as JSON text, byte for byte as before; a `page.look` picture rides after it as an
      // image block (W4, `look.mjs`), so an image-capable session sees the page in the same step.
      // The person's comment number (H6) in front of that JSON, and in meta, as on `tracy_site`.
      render: (_args: unknown, value: unknown) => commentContent(value, answerContent(value, [COMMENT_KEY])),
      presentationMeta: (_args: unknown, value: unknown) => commentMeta(value, null)
    },
    async execute(args: unknown, exec: ToolRun) {
      // Read once, repaired where a model predictably gets the shape wrong; a call no repair can
      // read is refused before the fence, since it names no site to reach.
      const shape = normalizeEmdashShape(args) as {
        ok: boolean
        siteKey?: string | null
        tool?: string
        list?: boolean
        route?: unknown
      }
      if (!shape.ok) return withNext(shape, { platform: 'emdash' })
      const sitesRoot = resolveSitesRoot(undefined)
      const sessionCwd = (exec?.agent?.session as { header?: { cwd?: unknown } } | undefined)?.header?.cwd
      const site = emdashSiteOf({
        siteKey: shape.siteKey ?? null,
        sessionCwd: typeof sessionCwd === 'string' ? sessionCwd : null,
        laneSiteKey: laneSiteKey(),
        sitesRoot
      })
      // `withNext`, as every other refusal on the Apply road gets: a fence with no next step is
      // the exact shape that sent an agent off this road and into the database (CLAUDE.md §6).
      if (!site.ok) return withNext(site)
      if (!(await isEmdashSite(config, site.label)))
        return withNext({
          ok: false,
          code: 'NOT_EMDASH',
          error: `${site.label} does not run EmDash (no template/artifact.json naming it). For Joomla or WordPress use tracy_site.`
        })
      const facts = { platform: 'emdash', sealed: false }
      const sessionId = exec?.agent?.session?.id ?? null
      // Shape repair → the locale rule (D11) → a delete asks first (D34) → the read before a write
      // (D12) → the call (E2.4: a read the site did not answer is asked once more) → the answer
      // shaped and budgeted (D26) — `emdash-call.mjs`, its I/O injected: the one exec below.
      const answer = await runEmdashTool({
        args,
        site,
        artifact: await readArtifact(sitesRoot, site.label),
        mcp: emdashMcpFor(site, sessionId),
        redirects: emdashRedirectsFor(site, sessionId),
        forms: emdashFormsFor(site, sessionId),
        state: emdashState,
        sessionId,
        turn: memory.turnOf(sessionId),
        memory,
        // The body guard (D6′): whether a `removes` quotes the customer's own request — read only when asked.
        customerWords: () => latestCustomerWords(sessionEvents(sessionId) as never),
        // ED-5: a page read asked of this tool is `tracy_site`'s, for the same site.
        page: (action: 'page.text' | 'page.look', params: Record<string, unknown>) =>
          action === 'page.text'
            ? pageText(config, sitesRoot, site.label, params, facts)
            : pageLook(ctx, exec, config, sitesRoot, site.label, params, facts),
        ...(config.sleep ? { sleep: async (ms: number) => void (await config.sleep?.(ms)) } : {}),
        // The model's own call: the `site` entry every page shows asks first (`consequence.mjs` `shared`).
        modelCall: true,
        // A saved demo or own-site plan agreed to its consequence writes (`demoPlanAgreed`).
        planAgreed: () => demoPlanAgreed(exec)
      })
      const wrote = emdashWriteTool(args, answer)
      if (wrote !== null)
        siteChanged(site.label, sessionId, wrote, 'emdash-mcp', emdashWriteTarget(args, answer))
      return withNext(answer, facts)
    }
  }

  /**
   * 🔒 ONE CONVERSATION, ONE SITE — SO ONE PLATFORM'S TOOLS, A DOOR DESCRIBED AS IT IS HERE, AND NO
   * SYSTEM TEXT THAT IS FALSE FOR A CUSTOMER'S AGENT.
   *
   * Every plugin's tool reached every site, and `tracy_site` told every site about every platform:
   * 7,391 characters, three quarters false for the site at hand. Measured on the ja-business suite
   * (r2, 24/09/2026, 99 turns): 57 WordPress calls asked for `content.contract` or `content.batch`,
   * which the WordPress component does not have; 26 asked `content.find` on a sealed site; and the
   * other platform's build tool rode along on every sealed step (3,958–5,460 characters, 0 calls).
   * The system text told every site agent where dsh's own source checkout is (`harness:source`) and
   * how to open the local web GUI (`app:web-surface`): 1,299 characters of `/opt/dsh`, `127.0.0.1`
   * and `pnpm run dev:web` on every step of every customer conversation (plan v2 V2 §1.3).
   *
   * 🔒 DECIDED ONCE, WHEN THE AGENT IS MADE (cache rules CS1/CS2). The system text and the tools
   * array are the request prefix DeepSeek caches: anything that changes them mid-conversation re-sends
   * the rest uncached (177 sessions, every `request/header` reason `initial` — keep it so). dsh
   * assembles them BEFORE `agent/pre-step`, so later is too late anyway. Nothing here runs again for
   * the session: not on the five-minute site facts, not when a seal marker appears, not when a build
   * finishes. A fact that changes mid-session reaches the model as a message. The one later change is
   * an addition: a tool this listener deferred comes back when its road starts (the listeners below,
   * `deferred-tools.mjs`), sent by dsh after the cached prefix, never removed again.
   *
   * A courtesy, never a gate: nothing here grants or refuses a call — each door keeps its own fence —
   * so every failure leaves the agent exactly as it was before this listener existed, and is said on
   * the log. No docker call on this path: agent creation must not wait on a daemon, so an EmDash site
   * no file names stays `unknown` here (every tool, the full description), as before.
   */
  ctx.on('agent/created', async ({ agent }: AgentCreatedInput) => {
    if (!agent || laneSiteKey() !== null) return // a single-site lane keeps the full, global door
    const sitesRoot = resolveSitesRoot(undefined)
    let label: string
    try {
      label = siteOf(String(agent.session?.header?.cwd ?? ''), sitesRoot).label
    } catch {
      return // not a site's workspace: nothing to fit
    }
    try {
      // L1: the two system sections that are false for a customer's agent go blank FOR THIS AGENT —
      // an agent-scoped section shadows the global one of the same name, and an empty one renders
      // nothing (dsh `system-prompt`: `merge(scope)`, `renderPrompt` drops empty sections).
      const prompt = agent.ctx?.systemPrompt
      if (prompt)
        for (const [name, order] of BLANK_SECTIONS)
          try {
            prompt.section({ name, order: prompt.getSectionOrder(order), text: '' })
          } catch (error) {
            warn(
              `[site-tools] could not blank ${name} on ${label}: ${error instanceof Error ? error.message : String(error)}`
            )
          }
      let platform = 'unknown'
      try {
        platform = await sitePlatform(`${sitesRoot}/${label}`, detectPlatform)
      } catch {
        // an unreadable folder: platform stays unknown, and unknown hides nothing
      }
      // The reads the first steps wait on, asked now and not awaited (`prewarm`).
      if (platform === 'joomla' || platform === 'wordpress' || platform === 'emdash') {
        prewarm(label, typeof agent.session?.id === 'string' ? agent.session.id : null, platform)
        // The slot the first step's context names, read now so that step finds it known (`slotOf`).
        void slotOf(label).catch(() => {})
      }
      const names = (ctx.tools.schemas?.(agent) ?? []).map((tool) => tool.name)
      const hidden = platformHiddenTools(names, platform)
      if (hidden.length > 0)
        try {
          agent.ctx?.tools?.restrict({ deny: hidden })
        } catch (error) {
          warn(
            `[site-tools] could not hide other platforms' tools on ${label}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      // 🔒 ONLY WHERE THE AGENT CAN ALREADY SEE `tracy_site`. A scoped registration sits outside every
      // restriction on the agent (dsh `tools`: "the scope's own registrations last … outside the
      // filter"), so registering it for an agent a role or a mask kept it from would hand it back.
      // A sealed WordPress site gets the contract road only when provision bound it (#337): the
      // marker names the Claude Cowork plugin it pinned — `contractDoorOf`, the one reader.
      const sealed = siteSeal(sitesRoot, label)
      const surface = surfaceOf({
        platform,
        sealed,
        contractDoor: contractDoorOf(sitesRoot, label, platform, sealed) as boolean | null,
        // An imported copy whose plugin derived a contract (01/10/2026): the open surface, the derived
        // door on top. Provision writes the record before the wizard starts the agent, so it is here.
        derived: sealed === false && derivedContractOf(sitesRoot, label, platform) !== null
      }) as Surface | null
      let fitted: string | null = null
      if (surface !== null && names.includes('tracy_site'))
        try {
          const description = siteToolDescription(surface, { wordpressReadBack: WORDPRESS_READ_BACK })
          agent.ctx?.tools?.register({
            ...siteTool,
            description,
            parameters: siteToolParameters(surface)
          })
          fitted = description
        } catch (error) {
          warn(
            `[site-tools] could not fit tracy_site to ${label}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      // The tools of the redesign/build road wait for that road to start (`deferred-tools.mjs`): one
      // restriction each, lifted by the triggers below. Never one the agent is told to call (a
      // description it can see names it), never one this conversation was already sent (a resume),
      // and never on a site no file names yet: that is a site about to be built, every tool stays.
      const sessionId = agent.session?.id
      const tools = agent.ctx?.tools
      const known = platform === 'joomla' || platform === 'wordpress' || platform === 'emdash'
      if (known && typeof sessionId === 'string' && typeof tools?.restrict === 'function') {
        const visible = (ctx.tools.schemas?.(agent) ?? []) as readonly {
          name: string
          description?: string
        }[]
        const textOf = (tool: { description?: string }) =>
          typeof tool.description === 'string' ? tool.description : ''
        const kept = visible.filter((tool) => !DEFERRED_NAMES.includes(tool.name))
        const described = kept.map(textOf).concat(fitted ?? [])
        // A deferred tool's own text may send the model to another one: they come back together.
        const links = Object.fromEntries(
          visible
            .filter((tool) => DEFERRED_NAMES.includes(tool.name))
            .map((tool) => [tool.name, namedDeferredTools(textOf(tool)).filter((name) => name !== tool.name)])
        )
        let sent: string[] | null = null
        try {
          sent = agent.session?.requestHeader?.()?.tools?.map((tool) => tool.name) ?? null
        } catch {
          sent = null
        }
        // A build still running, waiting, paused or failed keeps its tool: the customer may answer or
        // retry it in their own words, which name no tool (`siteBuildOpen`).
        const buildOpen = await siteBuildOpen(`${sitesRoot}/${label}`, label)
        const defer = toolsToDefer(
          names.filter((name) => !hidden.includes(name)),
          described,
          sent,
          buildOpen ? ['build'] : []
        )
        if (defer.length > 0) deferral.defer(sessionId, (filter) => tools.restrict(filter), defer, links)
      }
    } catch (error) {
      warn(
        `[site-tools] agent/created on ${label}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  })

  /** Give deferred tools back to one session's agent; its next step is sent them. */
  const liftDeferred = (sessionId: unknown, names: readonly string[], why: string) => {
    if (typeof sessionId !== 'string' || names.length === 0) return
    const lifted = deferral.lift(sessionId, names)
    if (lifted.length > 0)
      info(`[site-tools] ${sessionId}: ${lifted.join(', ')} sent from the next step (${why})`)
  }
  // A message reaches the inbox before the step that reads it is assembled: a tool it names, or the
  // Design inspiration / Build tab's own words, is there for that step.
  ctx.on(
    'agent/inbox/inserted',
    ({ agent, message }: { agent?: { session?: { id?: string } }; message?: unknown }) => {
      if (agent?.session?.id === undefined) return
      liftDeferred(agent.session.id, messageLifts(messageText(message)), 'the message asks for it')
    }
  )
  // A call's answer reaches the model at the next step: the design skill loaded, or an answer naming a
  // deferred tool, puts that tool beside it.
  ctx.on('tools/result', (exec: ToolResultExecution, result: ToolResultOutcome) => {
    const sessionId = exec?.agent?.session?.id
    if (typeof sessionId !== 'string' || deferral.held(sessionId).length === 0) return
    liftDeferred(sessionId, resultLifts(exec, answerText(result)), `${exec.name} answered`)
  })
  ctx.on('agent/disposed', ({ agent }: { agent?: { session?: { id?: string } } }) => {
    if (typeof agent?.session?.id === 'string') deferral.forget(agent.session.id)
    afterWrite.forget(agent?.session?.id)
    if (typeof agent?.session?.id === 'string') turnAsks.delete(agent.session.id)
  })

  // 🔒 `comment` (H6) comes off here too, before `normalizeEmdashShape` would move it into the EmDash
  // tool's own `arguments` (every key it does not know is moved there, F4 ED-3).
  const emdashExecute = emdashTool.execute
  emdashTool.execute = async (args: unknown, exec: ToolRun) => {
    const guard = await demoWriteGuard(args, exec)
    if (guard) return guard
    const taken = takeComment(args)
    if (!taken.ok) return taken.answer
    const answered = await withTurnSignal(
      exec,
      () => emdashExecute.call(emdashTool, taken.args, exec),
      stopped
    )
    return withComment(
      losslessAnswer(sawSiteCall(exec, 'tracy_emdash', taken.args, answered), (paths: string[]) =>
        warn(`[site-tools] tracy_emdash answer repaired for dsh: ${paths.join(', ')}`)
      ),
      taken.comment
    )
  }
  ctx.effect(() => ctx.tools.register(emdashTool), 'tracy-site-tools: tracy_emdash')
}
