// Pure view models of the Tracy connection (Operator page, Tracy tab) and of "Build it with Tracy" on a place.
// Server answers in, what the screen shows out. No DOM, no fetch, no clock.
import { t } from './strings.js'

const MOVING = new Set(['submitting', 'queued', 'waiting-for-you', 'building'])

/** The Tracy tab, from GET /operator/tracy. */
export function tracyConnectView(status) {
  const state = status?.state ?? 'disconnected'
  const base = { code: null, link: null, problem: null, polling: false }
  if (state === 'pending')
    return {
      ...base,
      status: t('tracy.state.pending'),
      tone: 'busy',
      code: status.userCode ?? null,
      link: status.verificationUriComplete ?? status.verificationUri ?? null,
      polling: true,
      actions: ['newCode']
    }
  if (state === 'connected')
    return {
      ...base,
      status: status.account?.email
        ? t('tracy.state.connectedAs', { email: status.account.email })
        : t('tracy.state.connected'),
      tone: 'ok',
      actions: ['disconnect']
    }
  if (state === 'reconnect')
    return { ...base, status: t('tracy.state.reconnect'), tone: 'bad', actions: ['reconnect', 'disconnect'] }
  const error = status?.error
  return {
    ...base,
    status: t('tracy.state.disconnected'),
    tone: 'neutral',
    problem: error
      ? t(`tracy.error.${['access_denied', 'expired_token'].includes(error) ? error : 'other'}`)
      : null,
    actions: ['connect']
  }
}

const dateText = (iso) =>
  iso && Number.isFinite(Date.parse(iso))
    ? new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso))
    : null

/**
 * The Tracy part of a place's Build card.
 * @param {{ connection: {state: string, tracyUrl?: string} | null, demo: object | null }} input
 *   `demo` is the place's `demo` from GET /:id; one recorded as built elsewhere is not Tracy's.
 */
export function tracyBuildView({ connection, demo }) {
  const connected = connection?.state === 'connected'
  const mine = demo?.builder === 'tracy' ? demo : null
  const status = mine?.status ?? null
  const deleted = Boolean(mine?.deletedAt)
  const submit = (again) => ({ kind: 'submit', label: t(again ? 'tracy.build.again' : 'tracy.build') })
  const out = {
    status: null,
    tone: 'neutral',
    primary: null,
    link: null,
    editLink: null,
    expiry: null,
    notice: null,
    noticeLink: null,
    count: null,
    polling: false,
    cancellable: false
  }
  if (mine && status !== 'refused') {
    out.status = t(deleted ? 'tracy.demo.deleted' : `tracy.demo.${status}`)
    out.tone = deleted ? 'neutral' : status === 'ready' ? 'ok' : MOVING.has(status) ? 'busy' : 'warn'
    out.polling = MOVING.has(status)
    out.cancellable = MOVING.has(status)
    if (status === 'ready' && !deleted) {
      out.link = mine.url ?? null
      out.editLink = mine.editUrl ?? null
      const until = dateText(mine.expiresAt)
      out.expiry = until ? t('tracy.demo.until', { date: until }) : null
    }
    // The site exists; the operator's AI builds it in Tracy's chat, which this link opens.
    if (status === 'waiting-for-you' && !deleted) out.editLink = mine.editUrl ?? null
    if (status === 'failed') {
      const { code, message } = mine.error ?? {}
      out.notice = message
        ? code
          ? `${message} (${code})`
          : String(message)
        : code
          ? t('tracy.failedCode', { code })
          : null
    }
    const counts = mine.demos
    if (Number.isFinite(counts?.live) && Number.isFinite(counts?.limit))
      out.count = t('tracy.count', { live: counts.live, limit: counts.limit })
  }
  if (status === 'refused') {
    const e = mine.error ?? {}
    out.notice =
      e.code === 'DEMO_LIMIT_REACHED'
        ? t('tracy.limit', { live: e.live ?? '?', limit: e.limit ?? '?' })
        : e.code === 'SPONSOR_BUDGET_EXHAUSTED'
          ? t('tracy.budget')
          : t('tracy.refused', { code: e.code ?? '' })
    out.noticeLink = connection?.tracyUrl ?? null
  }
  const open = !mine || status === 'refused' || deleted || ['failed', 'cancelled'].includes(status)
  if (open)
    out.primary = connected
      ? submit(Boolean(mine) && status !== 'refused')
      : {
          kind: 'connect',
          label: t(connection?.state === 'reconnect' ? 'tracy.reconnectToBuild' : 'tracy.connectToBuild'),
          href: '#/operator/tracy'
        }
  return out
}

const CMS_LABEL = { wordpress: 'WordPress', joomla: 'Joomla', emdash: 'EmDash' }

/**
 * The CMS and template selects beside "Build it with Tracy", from GET /tracy/options (Tracy's /v1/demos/options).
 * `picked` is {cms?, quickstart?}; `body` is what the press sends: nothing while Tracy's default is kept.
 * @param {{ cms?: {cms: string, pinned?: {quickstart?: string}, templates?: {quickstart: string, design: string, label?: string}[]}[] } | null} options
 * @param {{ cms?: string, quickstart?: string }} picked
 */
export function tracyTemplateView(options, picked = {}) {
  const list = Array.isArray(options?.cms) ? options.cms.filter((c) => typeof c?.cms === 'string') : []
  if (!list.length) return null
  const cms = [
    { value: '', label: t('tracy.choice.cmsDefault') },
    ...list.map((c) => ({ value: c.cms, label: CMS_LABEL[c.cms] ?? c.cms }))
  ]
  const chosen = list.find((c) => c.cms === picked.cms) ?? null
  if (!chosen) return { cms, cmsValue: '', templates: null, templateValue: '', body: {} }
  const offered = (chosen.templates ?? []).filter((x) => typeof x?.quickstart === 'string')
  const pinned = offered.find((x) => x.quickstart === chosen.pinned?.quickstart)
  const templates = [
    {
      value: '',
      label: pinned?.label
        ? t('tracy.choice.templateDefaultNamed', { label: pinned.label })
        : t('tracy.choice.templateDefault')
    },
    ...offered.map((x) => ({ value: x.quickstart, label: x.label ?? x.design }))
  ]
  const template = offered.find((x) => x.quickstart === picked.quickstart) ?? null
  return {
    cms,
    cmsValue: chosen.cms,
    templates,
    templateValue: template?.quickstart ?? '',
    body: template
      ? { cms: chosen.cms, template: { quickstart: template.quickstart, design: template.design } }
      : { cms: chosen.cms }
  }
}
