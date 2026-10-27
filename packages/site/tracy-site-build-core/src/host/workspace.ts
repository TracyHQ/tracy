/**
 * The Build workspace's host half: what the six views after a build read, and what the owner's
 * comments become (tasks/plan-build-workspace-tracy-2026-09-13.md §8–§9).
 *
 * Three sources, kept apart on disk under `docs/agents/build/workspace/<job>/`, and merged only
 * when read:
 *
 *   - THE BUILD'S OWN RECEIPT. The seeder writes `docs/agents/seed/apply.json` beside the job's
 *     inputs with the CMS id of every page, menu item and post it wrote (`applied.pages`,
 *     `applied.menu`, `applied.posts`). Those are the ids `content.update` takes, so Pages & blocks
 *     has real targets the moment the seed stage settles — no agent has to look first.
 *   - THE AGENT'S REVIEW (`report.json`). Blocks finer than a page, the owner's open questions,
 *     checks with dated evidence — things only a read of the live CMS can say. A target the agent
 *     names with an id the receipt already has REPLACES the receipt's row; the rest are added.
 *   - THE OWNER'S COMMENTS (`comments/<requestId>.json`), one file per request id, so a retry with
 *     the same id finds its own record instead of a second delivery.
 *
 * 🔒 A TARGET IS A CMS IDENTITY, NEVER A POSITION OR A TITLE. Two modules can share a position and
 * two pages a title; `entityId` (plus `field` for a setting or a slot) is what the agent edits by,
 * and a row without one is refused rather than guessed (`normalizeReport`).
 *
 * 🔒 NOTHING HERE IS INVENTED. A check is `passed` or `failed` only with evidence and a time; a
 * build stage becomes a check with its own detail and `endedAt`; a page the receipt does not name
 * does not exist. Empty is the honest answer when the receipt is missing.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

/** One thing the owner can point at. `kind` is the CMS's own word, the one `content.update` takes. */
export interface Target {
  id: string
  label: string
  /** `article` · `module` · `menuItem` (Joomla), `post` (WordPress), `setting`. */
  kind: string
  /** The CMS id, as a string. Absent for a setting, which is named by `field`. */
  entityId?: string
  /** The page this belongs to (slug), or '' for something site-wide. */
  page: string
  language: string
  /** A module's position, when the CMS has one. Never an identity. */
  position: string
  /** The field, slot key or setting key the comment is about. */
  field: string
  /** `page`: one page. `site`: shared — a change here shows on every page. */
  scope: 'page' | 'site'
  /** Who wrote this row: the seed receipt, the agent's review, or the CMS adapter's own list. */
  source: 'receipt' | 'review' | 'spec'
}
export interface ReviewQuestion {
  id: string
  title: string
  prompt: string
  source: string
  targetId: string
}
export interface ReviewCheck {
  id: string
  label: string
  status: 'passed' | 'failed' | 'unverified'
  evidence: string
  at: string
  targetId?: string
  /** The content revision this check was made against; stale once the site moved on. */
  revision?: string
  source: 'stage' | 'review'
}
export interface Report {
  targets: Target[]
  questions: ReviewQuestion[]
  checks: ReviewCheck[]
  siteKey?: string
  revision?: string
  at?: string
}
export interface Comment {
  id: string
  siteKey?: string
  platform?: string
  sessionId?: string
  target: Target
  questionId?: string
  checkId?: string
  check?: ReviewCheck
  question?: string
  source?: string
  body: string
  at: string
  status: 'pending' | 'sent'
  revision?: string
}
/** As much of the job as this file reads — `build.mjs` owns the full shape. */
export interface JobRef {
  job: string
  platform?: string
  targetSiteKey?: string
  ownerSessionId?: string
  contentRevision?: string
  endedAt?: string
  startedAt: string
  stages?: { name: string; status: string; detail?: string; endedAt?: string; startedAt?: string }[]
}
export interface Brief {
  questions?: {
    id: string
    label: string
    kind: 'text' | 'longtext' | 'choice' | 'multi' | 'languages'
    step?: number
    options?: string[]
    optionLabels?: Record<string, string>
    hint?: string
    feeds?: string[]
    required?: boolean
    showWhen?: { all: { question: string; is?: string; has?: string }[] }
  }[]
  /**
   * The exact candidate the form was served (22/09): id, revision and content hash of the set in
   * Tracy's store. The submit was judged against `questions` above, which are that set as drawn —
   * an administrator's later Use changes nothing here.
   */
  questionnaire?: { id: string; revision: number; contentHash: string }
  answers: Record<string, unknown>
  updatedAt: string
}
/** The whole view, as the tab reads it in one GET. */
export interface Workspace extends Report {
  comments: Comment[]
  /** The content revision the site is at now, for the tab to tell a stale check from a fresh one. */
  currentRevision?: string
}

/**
 * Is this a CMS identity this workspace can carry?
 *
 * 🔒 AN IDENTITY, NOT A NUMBER — AND THE DIFFERENCE COST AN EMDASH BUILD ITS REVIEW STEP. This
 * used to be `/^[1-9][0-9]*$/`, which is true of Joomla and WordPress and of nothing else. EmDash
 * ids are ULIDs: `01M2M6REX43YC4J6HM9ABX8J3N`, straight out of `ec_pages.id`. So `review` — the
 * step that publishes what the owner sees in Pages & blocks — refused every target an EmDash build
 * could possibly name.
 *
 * Measured 20/09/2026 on `site-4x82yk`: the agent tried three times in fourteen seconds, each time
 * with a better id — none, then the page's own key `page:home:en`, then the real ULID off the
 * database — and was told "A content ID is required." all three times. The third call was correct.
 * A rule that refuses the right answer teaches the agent that the door is shut, and it stopped.
 *
 * What is actually required is that the id be PRESENT and be an identity rather than a title or a
 * position — the invariant the file header states. So: a non-empty token of identifier-shaped
 * characters. A digit string still passes, so Joomla and WordPress are unchanged; a slug, a ULID or
 * a UUID passes too. Whitespace and anything long enough to be prose does not: those are the shapes
 * that mean somebody put a label where an id belongs, which is the mistake worth keeping out.
 */
const ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,99}$/
export function isEntityId(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' ? ENTITY_ID.test(String(value).trim()) : false
}

const KINDS = ['article', 'module', 'menuItem', 'post', 'page', 'setting']
const text = (value: unknown, limit = 500): string =>
  typeof value === 'string' ? value.trim().slice(0, limit) : ''
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('An object is required.')
  return value as Record<string, unknown>
}
function rows(value: unknown, max: number): Record<string, unknown>[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > max) throw new Error('Invalid report size.')
  return value.map(object)
}
function unique(items: { id: string }[]): void {
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error('Duplicate report IDs.')
}

/**
 * What the agent published, checked: explicit CMS references identify content, positions do not.
 * @param known - target ids that exist outside this report (the receipt's), which a question or a
 *   check may point at without the report restating the row.
 */
export function normalizeReport(value: unknown, known: ReadonlySet<string> = new Set()): Report {
  const input = object(value)
  const targets: Target[] = rows(input.targets, 500).map((target) => {
    const kind = text(target.kind)
    if (!KINDS.includes(kind) || !text(target.id) || !text(target.label))
      throw new Error('Invalid content target.')
    if (kind !== 'setting' && !isEntityId(target.entityId)) throw new Error('A content ID is required.')
    if (kind === 'setting' && !text(target.field)) throw new Error('A setting key is required.')
    return {
      id: text(target.id, 100),
      label: text(target.label, 160),
      kind,
      entityId: kind === 'setting' ? undefined : String(target.entityId),
      page: text(target.page, 160),
      language: text(target.language, 30),
      position: text(target.position, 100),
      field: text(target.field, 160),
      scope: target.scope === 'site' ? 'site' : 'page',
      source: 'review'
    }
  })
  unique(targets)
  const points = (id: unknown) =>
    typeof id === 'string' && (targets.some((t) => t.id === id) || known.has(id))
  const questions: ReviewQuestion[] = rows(input.questions, 100).map((q) => {
    if (!text(q.id) || !text(q.title) || !text(q.prompt) || !text(q.source) || !points(q.targetId))
      throw new Error('Questions require a target and source.')
    return {
      id: text(q.id, 100),
      title: text(q.title, 160),
      prompt: text(q.prompt),
      source: text(q.source),
      targetId: text(q.targetId, 100)
    }
  })
  unique(questions)
  const checks: ReviewCheck[] = rows(input.checks, 100).map((c) => {
    const status = text(c.status)
    if (!text(c.id) || !text(c.label) || !['passed', 'failed', 'unverified'].includes(status))
      throw new Error('Invalid check.')
    if (c.targetId && !points(c.targetId)) throw new Error('Unknown check target.')
    if (status !== 'unverified' && (!text(c.evidence) || !Number.isFinite(Date.parse(text(c.at)))))
      throw new Error('Checks require dated evidence.')
    return {
      id: text(c.id, 100),
      label: text(c.label, 160),
      status: status as ReviewCheck['status'],
      evidence: text(c.evidence, 2000),
      at: text(c.at, 50),
      targetId: text(c.targetId, 100) || undefined,
      source: 'review'
    }
  })
  unique(checks)
  return { targets, questions, checks }
}

function directory(root: string, job: JobRef): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(job.job)) throw new Error('Invalid job ID.')
  return path.join(root, 'docs', 'agents', 'build', 'workspace', job.job)
}
function write(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  writeFileSync(temp, JSON.stringify(value), { mode: 0o600 })
  renameSync(temp, file)
}
function read<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw error
  }
}

/** The revision the site's content is at: what the seed stage last reported, else the run's end. */
export function currentRevision(job: JobRef): string {
  return job.contentRevision ?? job.endedAt ?? job.startedAt
}

// ─── The receipt ──────────────────────────────────────────────────────────────────────────────

/** `applied.pages` is keyed `slug` or `slug:lang`; the id is what the CMS gave. */
function entries(map: unknown): { slug: string; language: string; id: string }[] {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return []
  const out: { slug: string; language: string; id: string }[] = []
  for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
    const id = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : ''
    if (!/^[1-9][0-9]*$/.test(id)) continue
    const [slug = '', language = ''] = key.split(':')
    if (slug === '') continue
    out.push({ slug, language, id })
  }
  return out
}

/**
 * Pages & blocks from the seed receipt alone.
 *
 * The receipt is the seeder's own record of what it wrote (`tracy-seeder/src/cli.mjs`): pages,
 * menu items and posts by slug (and language), each with the id the CMS answered. Both platforms
 * write the same shape; only the CMS word for a page differs — a Joomla page is an `article`
 * behind a `menuItem`, a WordPress page is a `post` of type page — and that word is the one the
 * apply door's `content.update` takes, so it is what the row carries.
 *
 * A title comes from the receipt where it has one (`applied.routes[].title` for menus, `posts[]`
 * for blog posts); a page whose title the receipt does not carry is shown by its slug, not
 * by a guess.
 * @param receipt - the parsed `apply.json`, or null when the seed stage never wrote one.
 * @param platform - `wordpress` | `joomla`.
 */
export function targetsFromReceipt(receipt: unknown, platform: string): Target[] {
  if (!receipt || typeof receipt !== 'object') return []
  const r = receipt as {
    applied?: {
      pages?: unknown
      menu?: unknown
      posts?: unknown
      navigation?: unknown
      routes?: { language?: string; menuId?: number; title?: string }[]
    }
    posts?: { slug?: string; title?: string }[]
  }
  const applied = r.applied ?? {}
  const pageKind = platform === 'joomla' ? 'article' : 'post'
  const postTitle = new Map((r.posts ?? []).map((p) => [p.slug ?? '', p.title ?? '']))
  const menuTitle = new Map(
    (Array.isArray(applied.routes) ? applied.routes : []).map((m) => [String(m.menuId ?? ''), m.title ?? ''])
  )
  const out: Target[] = []
  const menus = entries(applied.menu)
  for (const page of entries(applied.pages)) {
    const menu = menus.find((m) => m.slug === page.slug && m.language === page.language)
    const title = (menu && menuTitle.get(menu.id)) || page.slug
    out.push({
      id: `page:${page.slug}${page.language ? `:${page.language}` : ''}`,
      label: title,
      kind: pageKind,
      entityId: page.id,
      page: page.slug,
      language: page.language,
      position: '',
      field: 'content',
      scope: 'page',
      source: 'receipt'
    })
  }
  for (const menu of menus)
    out.push({
      id: `menu:${menu.slug}${menu.language ? `:${menu.language}` : ''}`,
      label: menuTitle.get(menu.id) || menu.slug,
      kind: 'menuItem',
      entityId: menu.id,
      page: menu.slug,
      language: menu.language,
      position: 'menu',
      field: 'title',
      scope: 'site',
      source: 'receipt'
    })
  for (const post of entries(applied.posts))
    out.push({
      id: `post:${post.slug}${post.language ? `:${post.language}` : ''}`,
      label: postTitle.get(post.slug) || post.slug,
      kind: pageKind,
      entityId: post.id,
      page: 'blog',
      language: post.language,
      position: '',
      field: 'content',
      scope: 'page',
      source: 'receipt'
    })
  const navigation =
    typeof applied.navigation === 'number' && applied.navigation > 0 ? String(applied.navigation) : ''
  if (navigation !== '')
    out.push({
      id: 'navigation',
      label: 'Navigation',
      kind: 'post',
      entityId: navigation,
      page: '',
      language: '',
      position: 'header',
      field: 'content',
      scope: 'site',
      source: 'receipt'
    })
  return out
}

/** The receipt the seed stage left beside this job's inputs, or null. */
export function readReceipt(inputRoot: string): unknown {
  return read<unknown>(path.join(inputRoot, 'docs', 'agents', 'seed', 'apply.json'), null)
}

/**
 * The build's own stages as checks: each settled stage is one, with the detail it left as
 * evidence and the time it ended. `running`/`pending` stages are `unverified` — nothing was
 * checked yet, and saying so beats hiding the row.
 */
export function checksFromStages(job: JobRef): ReviewCheck[] {
  return (job.stages ?? []).map((stage) => ({
    id: `stage:${stage.name}`,
    label: stage.name,
    status: stage.status === 'done' ? 'passed' : stage.status === 'failed' ? 'failed' : 'unverified',
    evidence: stage.detail ?? '',
    at: stage.endedAt ?? stage.startedAt ?? '',
    revision: currentRevision(job),
    source: 'stage'
  }))
}

// ─── Reading and publishing ───────────────────────────────────────────────────────────────────

/**
 * Everything the tab reads, merged: receipt targets, the agent's review over them, the CMS
 * adapter's settings, the build's stage checks, the owner's comments.
 * @param inputRoot - where the job's inputs and the seed receipt live (`inputRootFor`).
 * @param settings - the adapter's setting targets (`CmsSpec.workspace.settings`), site-wide.
 */
export function readWorkspace(
  root: string,
  job: JobRef,
  inputRoot: string,
  settings: Target[] = []
): Workspace {
  const dir = directory(root, job)
  const report = read<Report | null>(path.join(dir, 'report.json'), null)
  const own = [...targetsFromReceipt(readReceipt(inputRoot), job.platform ?? ''), ...settings]
  const reviewed = new Map((report?.targets ?? []).map((t) => [t.id, t]))
  const targets = [
    ...own.map((t) => reviewed.get(t.id) ?? t),
    ...(report?.targets ?? []).filter((t) => !own.some((r) => r.id === t.id))
  ]
  const checks = [
    ...checksFromStages(job),
    ...(report?.checks ?? []).map((c) => ({ ...c, revision: c.revision ?? report?.revision }))
  ]
  let files: string[] = []
  try {
    files = readdirSync(path.join(dir, 'comments'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const comments = files
    .filter((f) => f.endsWith('.json'))
    .map((f) => read<Comment | null>(path.join(dir, 'comments', f), null))
    .filter((c): c is Comment => c !== null)
    .sort((a, b) => a.at.localeCompare(b.at))
  return {
    targets,
    questions: report?.questions ?? [],
    checks,
    siteKey: job.targetSiteKey,
    revision: report?.revision,
    at: report?.at,
    currentRevision: currentRevision(job),
    comments
  }
}

/**
 * The agent's review, checked and written whole — the previous one is replaced, not merged.
 * @param inputRoot - where the seed receipt lives, so a question may point at a receipt row.
 */
export function publishWorkspace(
  root: string,
  job: JobRef,
  input: unknown,
  inputRoot = root,
  settings: Target[] = []
): Report {
  const known = new Set(
    [...targetsFromReceipt(readReceipt(inputRoot), job.platform ?? ''), ...settings].map((t) => t.id)
  )
  const report: Report = {
    ...normalizeReport(input, known),
    siteKey: job.targetSiteKey,
    revision: currentRevision(job),
    at: new Date().toISOString()
  }
  write(path.join(directory(root, job), 'report.json'), report)
  return report
}

/**
 * The owner's comment, resolved against what the tab was showing.
 *
 * Only ids come from the browser — target, question, check and the report's `at` it was drawn
 * from. Site, session, entity and platform are the job's own, so a body naming another site is
 * ignored rather than trusted. A request id already on disk answers with its own record: the
 * retry a double-click makes finds the first delivery, never a second one.
 */
export function prepareComment(
  root: string,
  job: JobRef,
  workspace: Workspace,
  input: Record<string, unknown>
): { file: string; comment: Comment } {
  const requestId = text(input.requestId, 100)
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(requestId)) throw new Error('A request ID is required.')
  if (typeof input.body !== 'string' || input.body.length > 10000 || !input.body.trim())
    throw new Error('A comment of at most 10000 characters is required.')
  const body = input.body.trim()
  const file = path.join(directory(root, job), 'comments', `${requestId}.json`)
  const existing = read<Comment | null>(file, null)
  if (existing) {
    if (
      existing.body !== body ||
      existing.target.id !== input.targetId ||
      existing.questionId !== (input.questionId || undefined) ||
      existing.checkId !== (input.checkId || undefined)
    )
      throw new Error('This request ID was already used.')
    return { file, comment: existing }
  }
  const target = workspace.targets.find((t) => t.id === input.targetId)
  const question = input.questionId
    ? workspace.questions.find((q) => q.id === input.questionId && q.targetId === input.targetId)
    : null
  const check = input.checkId
    ? workspace.checks.find(
        (c) => c.id === input.checkId && (c.targetId === undefined || c.targetId === input.targetId)
      )
    : undefined
  if (!target || (input.questionId && !question) || (input.checkId && !check))
    throw new Error('The comment target is no longer available.')
  // A question, a review-drawn check or a review-drawn target exists only in a report; a comment
  // on one must name the report it was read from, so a reply to something the agent has since
  // withdrawn or renamed is refused. Receipt rows and stage checks stand on their own.
  const fromReport = Boolean(question) || check?.source === 'review' || target.source === 'review'
  if (fromReport && input.reportAt !== workspace.at)
    throw new Error('This report has changed. Refresh this view.')
  const comment: Comment = {
    id: requestId,
    siteKey: job.targetSiteKey,
    platform: job.platform,
    sessionId: job.ownerSessionId,
    target,
    questionId: question?.id,
    checkId: check?.id,
    check,
    question: question?.prompt,
    source: question?.source,
    body,
    at: new Date().toISOString(),
    status: 'pending',
    revision: workspace.currentRevision
  }
  write(file, comment)
  return { file, comment }
}
export function markCommentSent(file: string, comment: Comment): void {
  write(file, { ...comment, status: 'sent' })
}

/** A read-only inspection asked of the agent; one delivery per request id. */
export function requestInspection(root: string, job: JobRef, requestId: unknown, deliver: () => void): void {
  if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(requestId))
    throw new Error('A request ID is required.')
  const file = path.join(directory(root, job), 'inspections', `${requestId}.json`)
  if (read<{ status: string } | null>(file, null)?.status === 'sent') return
  write(file, { status: 'pending', at: new Date().toISOString() })
  deliver()
  write(file, { status: 'sent', at: new Date().toISOString() })
}

// ─── The brief ────────────────────────────────────────────────────────────────────────────────

export function readBrief(root: string, job: JobRef): Brief | null {
  return read<Brief | null>(path.join(directory(root, job), 'brief.json'), null)
}
/**
 * The questionnaire as it was sent: the questions the form showed (the agent's own, or none for
 * the standard ones) and the answers, merged over the previous snapshot so an edit that changes
 * one field keeps the rest. Written at `start`, BEFORE the ask file is removed — that file was
 * the only copy of the agent's questions.
 */
export function saveBrief(
  root: string,
  job: JobRef,
  answers: Record<string, unknown>,
  questions?: Brief['questions'],
  questionnaire?: Brief['questionnaire']
): void {
  const previous = readBrief(root, job)
  write(path.join(directory(root, job), 'brief.json'), {
    questions: questions ?? previous?.questions,
    questionnaire: questionnaire ?? previous?.questionnaire,
    answers: { ...previous?.answers, ...answers },
    updatedAt: new Date().toISOString()
  })
}
