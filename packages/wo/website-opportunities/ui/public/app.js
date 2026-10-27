// The browser app: hash routes #/find, #/list and #/place/<id>. Every server value goes into the page as
// text (never as HTML): research data comes from public pages and is untrusted.
import { ApiError, api, mediaObjectUrl, newRequestId, readToken, writeToken } from './api.js'
import { h } from './dom.js'
import { operatorView, operatorAllowed } from './operator.js'
import { t, tCount } from './strings.js'
import {
  againView,
  briefText,
  findKindChoices,
  findSearchBody,
  jobView,
  outreachPreview,
  photoList,
  placeStatus,
  scoreView,
  socialView,
  sourceRow,
  websitesToCheck
} from './view-models.js'
import { tracyBuildView, tracyTemplateView } from './tracy-view-models.js'

const POLL_MS = 4000
const RADII_KM = [1, 2, 5, 10, 25]
const main = document.getElementById('main')
const toastBox = document.getElementById('toast')
const tokenButton = document.getElementById('token-button')
const operatorNav = document.getElementById('nav-operator')

function toast(message) {
  toastBox.textContent = message
  toastBox.classList.add('show')
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => toastBox.classList.remove('show'), 2500)
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast(t('common.copied'))
  } catch {
    toast(t('common.error', { message: 'clipboard' }))
  }
}

// ── Static page text from strings.js ───────────────────────────────────────────────────────
for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t)
for (const el of document.querySelectorAll('[data-t-aria]'))
  el.setAttribute('aria-label', t(el.dataset.tAria))
document.title = t('app.title')

// ── Routing ────────────────────────────────────────────────────────────────────────────────
let routeToken = 0
let pollTimer = null

function route() {
  const hash = location.hash || '#/find'
  const [, view, id] = hash.match(/^#\/(find|list|place|operator)(?:\/([^/?#]+))?/) ?? [null, 'find', null]
  routeToken += 1
  clearTimeout(pollTimer)
  for (const a of document.querySelectorAll('[data-nav]'))
    a.toggleAttribute('aria-current', a.dataset.nav === (view === 'place' ? 'list' : view))
  tokenButton.hidden = !readToken()
  // The Operator entry shows only when the server says this viewer runs it.
  operatorAllowed().then((ok) => (operatorNav.hidden = !ok))
  const token = routeToken
  const render =
    view === 'list'
      ? listView
      : view === 'place'
        ? (tk) => placeView(decodeURIComponent(id ?? ''), tk)
        : view === 'operator'
          ? (tk) => operatorView({ token: tk, tab: id, show, current, toast, showError })
          : findView
  Promise.resolve(render(token)).catch((error) => showError(error, token))
}

const current = (token) => token === routeToken

function show(token, ...nodes) {
  if (!current(token)) return false
  main.replaceChildren(...nodes.filter(Boolean))
  return true
}

function focusHeading() {
  main.querySelector('h1')?.setAttribute('tabindex', '-1')
  main.querySelector('h1')?.focus({ preventScroll: true })
}

function showError(error, token) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403))
    return tokenView(token, Boolean(readToken()))
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof TypeError
        ? t('common.offline')
        : t('common.error', { message: error?.message ?? String(error) })
  show(
    token,
    h(
      'div',
      { class: 'notice bad', role: 'alert' },
      h('p', {}, message),
      h('button', { type: 'button', on: { click: route } }, t('common.retry'))
    )
  )
}

// ── Operator token ─────────────────────────────────────────────────────────────────────────
function tokenView(token, wrong = false) {
  const input = h('input', {
    id: 'token',
    type: 'password',
    autocomplete: 'off',
    required: true,
    spellcheck: 'false'
  })
  const form = h(
    'form',
    {
      class: 'card narrow',
      on: {
        submit: (e) => {
          e.preventDefault()
          writeToken(input.value.trim())
          route()
        }
      }
    },
    h('h1', {}, t('token.title')),
    h('p', { class: 'muted' }, t('token.lead')),
    wrong ? h('p', { class: 'notice bad', role: 'alert' }, t('token.wrong')) : null,
    h('label', { for: 'token' }, t('token.label')),
    input,
    h(
      'div',
      { class: 'row' },
      h('button', { type: 'submit', class: 'primary' }, t('token.save')),
      readToken()
        ? h(
            'button',
            {
              type: 'button',
              on: {
                click: () => {
                  writeToken(null)
                  route()
                }
              }
            },
            t('token.clear')
          )
        : null
    )
  )
  if (show(token, form)) input.focus()
}

tokenButton.addEventListener('click', () => {
  routeToken += 1
  tokenView(routeToken)
})

// ── Shared pieces ──────────────────────────────────────────────────────────────────────────
let reasonsSeq = 0

/** The score badge; with `withReasons`, a toggle button plus the reasons list to place below the card's head. */
function scoreBadge(score, { withReasons = false } = {}) {
  const view = scoreView(score)
  if (!withReasons || view.reasons.length === 0)
    return { badge: h('span', { class: `badge score ${view.tone}` }, view.label), reasons: null }
  const id = `reasons-${(reasonsSeq += 1)}`
  const reasons = h(
    'ul',
    { id, class: 'reason-list', hidden: true },
    view.reasons.map((r) => h('li', {}, h('span', {}, r.text), h('span', { class: 'points' }, r.points)))
  )
  const badge = h(
    'button',
    {
      type: 'button',
      class: `badge score ${view.tone}`,
      'aria-expanded': 'false',
      'aria-controls': id,
      title: t('score.why'),
      on: {
        click: () => {
          reasons.hidden = !reasons.hidden
          badge.setAttribute('aria-expanded', String(!reasons.hidden))
        }
      }
    },
    view.label,
    h('span', { class: 'caret', 'aria-hidden': 'true' }, '▾')
  )
  return { badge, reasons }
}

function externalLink(url, label = url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return document.createTextNode(label)
    return h('a', { href: u.href, target: '_blank', rel: 'noopener noreferrer' }, label)
  } catch {
    return document.createTextNode(label)
  }
}

// ── Find ───────────────────────────────────────────────────────────────────────────────────
const find = {
  mode: 'area',
  query: '',
  radiusKm: 2,
  kind: 'any',
  point: null,
  answer: null,
  capabilities: null
}

async function findView(token) {
  if (!find.capabilities) find.capabilities = await api('/capabilities')
  const byName = find.capabilities?.discovery?.['google-places'] === true
  if (!byName) find.mode = 'area'
  const results = h('section', { 'aria-live': 'polite', class: 'results' })
  const input = h('input', {
    id: 'find-q',
    type: 'search',
    value: find.query,
    required: true,
    maxlength: '200',
    placeholder: t(find.mode === 'area' ? 'find.area.placeholder' : 'find.name.placeholder')
  })
  const label = h('label', { for: 'find-q' }, t(find.mode === 'area' ? 'find.area' : 'find.name'))
  const radius = h(
    'select',
    { id: 'find-radius', on: { change: () => (find.radiusKm = Number(radius.value)) } },
    RADII_KM.map((km) =>
      h('option', { value: String(km), selected: km === find.radiusKm }, t('find.radius.km', { km }))
    )
  )
  const radiusField = h(
    'div',
    { class: 'field small', hidden: find.mode !== 'area' },
    h('label', { for: 'find-radius' }, t('find.radius')),
    radius
  )
  const kinds = findKindChoices(find.capabilities)
  const kindSelect = h(
    'select',
    { id: 'find-kind', on: { change: () => (find.kind = kindSelect.value) } },
    kinds.map((k) => h('option', { value: k.value, selected: k.value === find.kind }, k.label))
  )
  const kindField = kinds.length
    ? h(
        'div',
        { class: 'field kind', hidden: find.mode !== 'area' },
        h('label', { for: 'find-kind' }, t('find.kind')),
        kindSelect
      )
    : null
  const hereButton = h(
    'button',
    { type: 'button', hidden: find.mode !== 'area', on: { click: () => searchHere() } },
    t('find.here')
  )
  const submit = h('button', { type: 'submit', class: 'primary' }, t('find.submit'))

  const setMode = (mode) => {
    find.mode = mode
    label.textContent = t(mode === 'area' ? 'find.area' : 'find.name')
    input.placeholder = t(mode === 'area' ? 'find.area.placeholder' : 'find.name.placeholder')
    radiusField.hidden = mode !== 'area'
    if (kindField) kindField.hidden = mode !== 'area'
    hereButton.hidden = mode !== 'area'
  }
  const modeRadio = (mode, key, disabled = false) =>
    h(
      'label',
      { class: 'choice' },
      h('input', {
        type: 'radio',
        name: 'find-mode',
        value: mode,
        checked: find.mode === mode,
        disabled,
        on: { change: () => setMode(mode) }
      }),
      t(key)
    )

  async function run(body, where) {
    submit.disabled = true
    results.replaceChildren(h('p', { class: 'muted' }, t('find.searching')))
    try {
      find.answer = { ...(await api('/search', { method: 'POST', body })), where }
      if (current(token)) results.replaceChildren(...resultNodes())
      checkFindSites(token, results)
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403))
        return showError(error, token)
      results.replaceChildren(
        h(
          'p',
          { class: 'notice bad', role: 'alert' },
          error instanceof ApiError ? error.message : t('common.offline')
        )
      )
    } finally {
      submit.disabled = false
    }
  }

  function searchHere() {
    if (!navigator.geolocation) return toast(t('find.here.failed'))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        find.point = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        run(
          findSearchBody({ mode: 'area', ...find.point, radiusKm: find.radiusKm, kind: find.kind }),
          t('find.here.label')
        )
      },
      () => toast(t('find.here.failed')),
      { timeout: 10_000 }
    )
  }

  const form = h(
    'form',
    {
      class: 'card search',
      role: 'search',
      on: {
        submit: (e) => {
          e.preventDefault()
          find.query = input.value.trim()
          if (!find.query) return
          run(
            findSearchBody({ mode: find.mode, query: find.query, radiusKm: find.radiusKm, kind: find.kind }),
            find.query
          )
        }
      }
    },
    h(
      'fieldset',
      { class: 'modes' },
      h('legend', {}, t('find.mode')),
      modeRadio('area', 'find.mode.area'),
      modeRadio('name', 'find.mode.name', !byName),
      byName ? null : h('p', { class: 'hint' }, t('find.name.unavailable'))
    ),
    h('div', { class: 'fields' }, h('div', { class: 'field grow' }, label, input), radiusField, kindField),
    h('div', { class: 'row' }, submit, hereButton)
  )
  if (find.answer) {
    results.replaceChildren(...resultNodes())
    checkFindSites(token, results)
  }
  if (
    show(token, h('h1', {}, t('find.title')), h('p', { class: 'muted lead' }, t('find.lead')), form, results)
  )
    focusHeading()
}

/** Find's scores once the website checks they wait for are in: re-read from the stores, no new map search. */
function checkFindSites(token, results) {
  const answer = find.answer
  pollSiteChecks(
    token,
    () => answer.candidates ?? [],
    async () => {
      const { candidates } = await api('/find/refresh', {
        method: 'POST',
        body: { candidates: answer.candidates }
      })
      if (!current(token) || find.answer !== answer) return
      answer.candidates = candidates
      results.replaceChildren(...resultNodes())
    }
  )
}

/**
 * Website checks run in the background, and asking is what queues them: ask for the websites of the rows shown
 * whose score still waits for one, every POLL_MS, and `refresh` the scores whenever some are answered.
 * A refusal (rate limit, no checks on this server) stops asking and leaves the scores as they are.
 */
async function pollSiteChecks(token, rowsOf, refresh) {
  const answered = new Set()
  while (current(token)) {
    const urls = websitesToCheck(rowsOf()).filter((url) => !answered.has(url))
    if (urls.length === 0) return
    let checks
    try {
      checks = (await api('/site-checks', { method: 'POST', body: { urls } })).checks ?? {}
    } catch {
      return
    }
    let fresh = false
    for (const [url, check] of Object.entries(checks))
      if (check?.status !== 'queued' && check?.status !== 'not_queued' && !answered.has(url)) {
        answered.add(url)
        fresh = true
      }
    if (!current(token)) return
    if (fresh) await refresh().catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

function resultNodes() {
  const { candidates = [], hiddenChains = 0, where } = find.answer ?? {}
  if (candidates.length === 0) return [h('p', { class: 'muted' }, t('find.empty'))]
  const summary = h(
    'p',
    { class: 'summary' },
    tCount('find.count', candidates.length, { where: find.answer.center?.label ?? where ?? '' }),
    hiddenChains > 0 ? ` · ${tCount('find.hiddenChains', hiddenChains)}` : ''
  )
  return [summary, h('ol', { class: 'cards' }, candidates.map(candidateCard))]
}

function candidateCard(candidate) {
  const status = placeStatus(candidate.status)
  const score = scoreBadge(candidate.score, { withReasons: true })
  const button = h(
    'button',
    {
      type: 'button',
      class: status.key === 'new' ? 'primary' : '',
      on: { click: () => saveAndOpen(candidate, button) }
    },
    t(status.key === 'new' ? 'find.save' : 'find.open')
  )
  return h(
    'li',
    { class: 'card place' },
    h('div', { class: 'place-head' }, h('h2', {}, candidate.name ?? ''), score.badge),
    score.reasons,
    candidate.address ? h('p', { class: 'muted' }, candidate.address) : null,
    h(
      'p',
      { class: 'facts' },
      h('span', { class: `chip status-${status.key}` }, status.label),
      Number.isFinite(candidate.rating)
        ? h('span', {}, t('place.rating', { rating: candidate.rating, reviews: candidate.reviews ?? 0 }))
        : null,
      candidate.website
        ? externalLink(candidate.website, hostOf(candidate.website))
        : h('span', {}, t('place.noWebsite'))
    ),
    h('div', { class: 'row end' }, button)
  )
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

async function saveAndOpen(candidate, button) {
  button.disabled = true
  button.textContent = t('find.saving')
  try {
    const { opportunity } = await api('', { method: 'POST', body: { candidate } })
    candidate.status = candidate.status === 'new' ? 'seen' : candidate.status
    location.hash = `#/place/${encodeURIComponent(opportunity.id)}`
  } catch (error) {
    button.disabled = false
    button.textContent = t('find.save')
    toast(error instanceof ApiError ? error.message : t('common.offline'))
  }
}

// ── My opportunities ───────────────────────────────────────────────────────────────────────
const list = { q: '' }

async function listView(token) {
  const filter = h('input', { id: 'list-q', type: 'search', value: list.q, maxlength: '100' })
  const body = h('section', { 'aria-live': 'polite' }, h('p', { class: 'muted' }, t('common.loading')))
  let timer
  filter.addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      list.q = filter.value.trim()
      load(null, true)
    }, 300)
  })
  const rows = []
  async function load(cursor, reset) {
    const params = new URLSearchParams({ limit: '50' })
    if (list.q) params.set('q', list.q)
    if (cursor) params.set('cursor', cursor)
    const answer = await api(`?${params}`)
    if (!current(token)) return
    if (reset) rows.length = 0
    rows.push(...(answer.opportunities ?? []))
    if (rows.length === 0) return body.replaceChildren(h('p', { class: 'muted' }, t('list.empty')))
    body.replaceChildren(
      ...[
        h('p', { class: 'summary' }, tCount('list.total', answer.total ?? rows.length)),
        h('ol', { class: 'cards' }, rows.map(listCard)),
        answer.nextCursor
          ? h(
              'button',
              {
                type: 'button',
                on: { click: () => load(answer.nextCursor, false).catch((e) => showError(e, token)) }
              },
              t('list.more')
            )
          : null
      ].filter(Boolean)
    )
  }
  const shown = show(
    token,
    h('h1', {}, t('list.title')),
    h('p', { class: 'muted lead' }, t('list.lead')),
    h('div', { class: 'field filter' }, h('label', { for: 'list-q' }, t('list.filter')), filter),
    body
  )
  if (shown) focusHeading()
  await load(null, true)
  pollSiteChecks(
    token,
    () => rows.map((row) => ({ website: row.candidate?.website, score: row.score })),
    () => load(null, true)
  )
}

function listCard(row) {
  const job = jobView(row.job)
  const c = row.candidate ?? {}
  return h(
    'li',
    { class: 'card place' },
    h(
      'div',
      { class: 'place-head' },
      h('h2', {}, h('a', { href: `#/place/${encodeURIComponent(row.id)}` }, row.name ?? c.name ?? '')),
      scoreBadge(row.score).badge
    ),
    c.address ? h('p', { class: 'muted' }, c.address) : null,
    h(
      'p',
      { class: 'facts' },
      h('span', { class: `chip tone-${job.tone}` }, job.label),
      job.detail ? h('span', {}, job.detail) : null
    )
  )
}

// ── Place profile ──────────────────────────────────────────────────────────────────────────
const photoUrls = new Map()

async function placeView(id, token) {
  const [detail, listed, connection] = await Promise.all([
    api(`/${encodeURIComponent(id)}`),
    api(`?ids=${encodeURIComponent(id)}`).catch(() => null),
    // A server without the Tracy builder answers 404: the Build card then shows the brief only.
    api('/tracy/connection').catch(() => null)
  ])
  const tracy = connection ? tracyBuildView({ connection, demo: detail.demo ?? null }) : null
  // Tracy's own template list, only while a press can send: the selects beside the button.
  const options = tracy?.primary?.kind === 'submit' ? await api('/tracy/options').catch(() => null) : null
  const row = listed?.opportunities?.[0] ?? null
  const opp = detail.opportunity ?? {}
  const c = opp.candidate ?? {}
  const profile = detail.profile ?? null
  const latestJob = detail.jobs?.[0] ?? row?.job ?? null
  const job = jobView(latestJob)
  const sections = [
    h('p', {}, h('a', { href: '#/list' }, `← ${t('place.back')}`)),
    h(
      'header',
      { class: 'place-title' },
      h(
        'div',
        { class: 'place-head' },
        h('h1', {}, opp.name ?? c.name ?? ''),
        scoreBadge(row?.score ?? c.score).badge
      ),
      c.address ? h('p', { class: 'muted' }, c.address) : null,
      h(
        'dl',
        { class: 'facts-list' },
        h('dt', {}, t('place.website')),
        h('dd', {}, c.website ? externalLink(c.website) : t('place.noWebsite')),
        c.phone ? [h('dt', {}, t('place.phone')), h('dd', {}, c.phone)] : null
      )
    ),
    scoreSection(row?.score ?? c.score),
    researchSection(id, latestJob, job, token),
    sourcesSection(detail.sources ?? []),
    photosSection(detail.media ?? [], opp.name ?? c.name ?? ''),
    socialSection(profile?.socialStats ?? row?.social ?? null),
    outreachSection(opp, row, profile),
    buildSection(opp, profile, detail, tracy && { id, token, connection, view: tracy, options })
  ]
  if (!show(token, ...sections)) return
  if (!placeView.lastId || placeView.lastId !== id) focusHeading()
  placeView.lastId = id
  if (job.moving || tracy?.polling)
    pollTimer = setTimeout(
      () => current(token) && placeView(id, token).catch((e) => showError(e, token)),
      POLL_MS
    )
}

function section(title, ...children) {
  const headingId = `h-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return h(
    'section',
    { class: 'card', 'aria-labelledby': headingId },
    h('h2', { id: headingId }, title),
    children
  )
}

function scoreSection(score) {
  const view = scoreView(score)
  return section(
    t('place.score'),
    h('p', {}, h('span', { class: `badge score ${view.tone}` }, view.label)),
    view.reasons.length
      ? h(
          'ul',
          { class: 'reason-list' },
          view.reasons.map((r) =>
            h('li', {}, h('span', {}, r.text), h('span', { class: 'points' }, r.points))
          )
        )
      : null
  )
}

function researchSection(id, latestJob, job, token) {
  const buttons = job.actions.map((action) => {
    if (action === 'cancel')
      return h(
        'button',
        {
          type: 'button',
          on: {
            click: () =>
              act(() => api(`/jobs/${encodeURIComponent(latestJob.id)}/cancel`, { method: 'POST' }))
          }
        },
        t('research.cancel')
      )
    if (action === 'start')
      return h(
        'button',
        {
          type: 'button',
          class: 'primary',
          on: {
            click: () =>
              act(() =>
                api(`/${encodeURIComponent(id)}/research`, {
                  method: 'POST',
                  body: { requestId: newRequestId() }
                })
              )
          }
        },
        t('research.start')
      )
    return h('button', { type: 'button', on: { click: () => againDialog(id, token) } }, t('research.again'))
  })
  async function act(fn) {
    try {
      await fn()
    } catch (error) {
      toast(error instanceof ApiError ? error.message : t('common.offline'))
    }
    route()
  }
  return section(
    t('place.research'),
    h(
      'p',
      { class: 'facts' },
      h('span', { class: `chip tone-${job.tone}` }, job.label),
      job.detail ? h('span', {}, job.detail) : null
    ),
    job.moving ? h('progress', { 'aria-label': job.label }) : null,
    h('div', { class: 'row' }, buttons)
  )
}

async function againDialog(id, token) {
  let answer
  try {
    answer = await api(`/${encodeURIComponent(id)}/research-again`)
  } catch (error) {
    return toast(error instanceof ApiError ? error.message : t('common.offline'))
  }
  const view = againView(answer)
  const dialog = h(
    'dialog',
    { 'aria-labelledby': 'again-title' },
    h('h2', { id: 'again-title' }, t('research.again.title')),
    view.run.length
      ? [
          h('h3', {}, t('research.again.run')),
          h(
            'ul',
            {},
            view.run.map((r) => h('li', {}, `${r.name}: ${r.why}`))
          )
        ]
      : null,
    view.kept.length
      ? [
          h('h3', {}, t('research.again.kept')),
          h(
            'ul',
            { class: 'muted' },
            view.kept.map((k) => h('li', {}, `${k.name}: ${k.why}`))
          )
        ]
      : null,
    h('p', {}, view.ceiling),
    view.left ? h('p', { class: 'muted' }, view.left) : null,
    h(
      'div',
      { class: 'row end' },
      h('button', { type: 'button', on: { click: () => dialog.close() } }, t('research.again.close')),
      h(
        'button',
        {
          type: 'button',
          class: 'primary',
          disabled: !view.canRun,
          on: {
            click: async () => {
              dialog.close()
              try {
                await api(`/${encodeURIComponent(id)}/research`, {
                  method: 'POST',
                  body: { requestId: newRequestId(), again: true }
                })
              } catch (error) {
                toast(error instanceof ApiError ? error.message : t('common.offline'))
              }
              if (current(token)) route()
            }
          }
        },
        t('research.again.confirm')
      )
    )
  )
  dialog.addEventListener('close', () => dialog.remove())
  document.body.append(dialog)
  dialog.showModal()
}

function sourcesSection(sources) {
  if (sources.length === 0)
    return section(t('place.sources'), h('p', { class: 'muted' }, t('place.sources.empty')))
  return section(
    t('place.sources'),
    h(
      'ul',
      { class: 'source-list' },
      sources.map((s) => {
        const view = sourceRow(s)
        return h(
          'li',
          {},
          h('span', { class: 'source-name' }, s.ref ? externalLink(s.ref, view.name) : view.name),
          h('span', { class: `chip tone-${view.tone}` }, view.status),
          view.coverage ? h('span', { class: 'muted' }, view.coverage) : null,
          view.reason ? h('span', { class: 'muted reason' }, view.reason) : null
        )
      })
    )
  )
}

function photosSection(media, name) {
  const photos = photoList(media)
  if (photos.length === 0)
    return section(t('place.photos'), h('p', { class: 'muted' }, t('place.photos.empty')))
  const grid = h('ul', { class: 'photos' })
  photos.forEach((p, i) => {
    const img = h('img', {
      alt: t('place.photo.alt', { n: i + 1, name }),
      loading: 'lazy',
      width: p.width ?? undefined,
      height: p.height ?? undefined
    })
    grid.append(h('li', {}, img))
    const known = photoUrls.get(p.id)
    if (known) img.src = known
    else
      mediaObjectUrl(p.id)
        .then((url) => {
          photoUrls.set(p.id, url)
          img.src = url
        })
        .catch(() => img.closest('li')?.remove())
  })
  return section(t('place.photos'), grid)
}

function socialSection(social) {
  const rows = socialView(social, Date.now())
  if (rows.length === 0)
    return section(t('place.social'), h('p', { class: 'muted' }, t('place.social.empty')))
  return section(
    t('place.social'),
    h(
      'ul',
      { class: 'social-list' },
      rows.map((r) =>
        h(
          'li',
          {},
          h('strong', {}, r.url ? externalLink(r.url, r.network) : r.network),
          h('span', { class: 'muted' }, r.facts.join(' · '))
        )
      )
    )
  )
}

function outreachSection(opp, row, profile) {
  const urlInput = h('input', {
    id: 'demo-url',
    type: 'url',
    inputmode: 'url',
    placeholder: t('outreach.demoUrl.placeholder')
  })
  const body = h('div')
  const render = () => {
    const preview = outreachPreview({
      name: opp.name,
      candidate: opp.candidate ?? {},
      siteCheck: row?.siteCheck ?? null,
      profile,
      demoUrl: urlInput.value,
      server: row?.outreach ?? null
    })
    body.replaceChildren(
      h('h3', {}, t('outreach.contacts')),
      preview.contacts.length
        ? h(
            'ul',
            { class: 'contact-list' },
            preview.contacts.map((c) =>
              h(
                'li',
                {},
                h('span', {}, h('strong', {}, c.channel), ' ', c.value),
                h(
                  'a',
                  {
                    class: 'button',
                    href: c.draftHref,
                    ...(c.draftHref.startsWith('https:')
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})
                  },
                  t('outreach.open')
                )
              )
            )
          )
        : h('p', { class: 'muted' }, t('outreach.noContacts')),
      h('p', {}, h('strong', {}, `${t('outreach.subject')}: `), preview.subject),
      h('label', { for: 'outreach-message' }, t('outreach.message')),
      h('textarea', { id: 'outreach-message', readonly: true, rows: '7' }, preview.message),
      h(
        'div',
        { class: 'row' },
        h('button', { type: 'button', on: { click: () => copy(preview.message) } }, t('outreach.copy'))
      )
    )
  }
  urlInput.addEventListener('input', render)
  render()
  return section(
    t('place.outreach'),
    h('p', { class: 'muted' }, t('outreach.lead')),
    row?.outreach
      ? null
      : h('div', { class: 'field' }, h('label', { for: 'demo-url' }, t('outreach.demoUrl')), urlInput),
    body
  )
}

function buildSection(opp, profile, detail, tracy) {
  const brief = briefText({
    opportunity: opp,
    profile,
    sources: detail.sources ?? [],
    brief: detail.brief ?? null
  })
  const download = () => {
    const url = URL.createObjectURL(new Blob([brief], { type: 'text/markdown' }))
    const slug =
      String(opp.name ?? 'place')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'place'
    const a = h('a', { href: url, download: `${slug}-brief.md` })
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return section(
    t('place.build'),
    tracy ? tracyBuildNodes(tracy) : null,
    h('p', { class: 'muted' }, t('build.lead')),
    h('label', { for: 'brief' }, t('build.brief')),
    h('textarea', { id: 'brief', readonly: true, rows: '12', class: 'mono' }, brief),
    h(
      'div',
      { class: 'row' },
      h('button', { type: 'button', on: { click: () => copy(brief) } }, t('build.copy')),
      h('button', { type: 'button', on: { click: download } }, t('build.download'))
    )
  )
}

/** The CMS and template a person picked on a place, kept while the page redraws. */
const templatePicks = new Map()

/** "Build it with Tracy": one button, then the demo's state, link and expiry (`tracyBuildView`). */
function tracyBuildNodes({ id, token, connection, view, options }) {
  const base = `/${encodeURIComponent(id)}/tracy/demo`
  const again = () => current(token) && placeView(id, token).catch((e) => showError(e, token))
  const pick = () => templatePicks.get(id) ?? {}
  const send = async (button, path, busy, body = {}) => {
    button.disabled = true
    button.textContent = busy
    try {
      await api(path, { method: 'POST', body })
    } catch (error) {
      // A refusal Tracy gave (limit, budget) is kept on the demo and shown on the redraw.
      if (!(error instanceof ApiError && error.body?.demo))
        toast(error instanceof ApiError ? error.message : t('common.offline'))
    }
    again()
  }
  const primary = view.primary
    ? view.primary.kind === 'connect'
      ? h('a', { class: 'button primary', href: view.primary.href }, view.primary.label)
      : h(
          'button',
          {
            type: 'button',
            class: 'primary',
            on: {
              click: (e) =>
                send(
                  e.currentTarget,
                  base,
                  t('tracy.build.sending'),
                  tracyTemplateView(options, pick())?.body ?? {}
                )
            }
          },
          view.primary.label
        )
    : null
  const cancel = view.cancellable
    ? h(
        'button',
        {
          type: 'button',
          on: { click: (e) => send(e.currentTarget, `${base}/cancel`, t('common.loading')) }
        },
        t('tracy.cancel')
      )
    : null
  return h(
    'div',
    { class: 'tracy-build' },
    h('p', { class: 'muted' }, t('tracy.build.lead')),
    view.status
      ? h('p', { 'aria-live': 'polite' }, h('span', { class: `chip tone-${view.tone}` }, view.status))
      : null,
    view.link || view.editLink
      ? h(
          'div',
          { class: 'row' },
          view.link ? externalLink(view.link, t('tracy.demo.open')) : null,
          view.editLink ? externalLink(view.editLink, t('tracy.demo.edit')) : null
        )
      : null,
    view.expiry ? h('p', { class: 'hint' }, view.expiry) : null,
    view.notice
      ? h(
          'div',
          { class: 'notice warn', role: 'status' },
          h('p', {}, view.notice),
          view.noticeLink ? externalLink(view.noticeLink, t('tracy.openTracy')) : null
        )
      : null,
    view.primary?.kind === 'submit' ? templateChoiceNodes(id, options) : null,
    h('div', { class: 'row' }, primary, cancel),
    view.count ? h('p', { class: 'hint' }, view.count) : null,
    connection.state === 'connected' ? null : h('p', { class: 'hint' }, t('tracy.notConnectedHint'))
  )
}

window.addEventListener('hashchange', route)
route()

/** The CMS and template selects beside "Build it with Tracy" (`tracyTemplateView`); none when Tracy listed nothing. */
function templateChoiceNodes(id, options) {
  const holder = h('div', { class: 'row tracy-choice' })
  const draw = () => {
    const v = tracyTemplateView(options, templatePicks.get(id) ?? {})
    if (!v) return holder.replaceChildren()
    const cms = h(
      'select',
      {
        id: 'tracy-cms',
        on: {
          change: () => {
            templatePicks.set(id, { cms: cms.value })
            draw()
          }
        }
      },
      v.cms.map((o) => h('option', { value: o.value, selected: o.value === v.cmsValue }, o.label))
    )
    const fields = [
      h('div', { class: 'field small' }, h('label', { for: 'tracy-cms' }, t('tracy.choice.cms')), cms)
    ]
    if (v.templates) {
      const template = h(
        'select',
        {
          id: 'tracy-template',
          on: { change: () => templatePicks.set(id, { cms: v.cmsValue, quickstart: template.value }) }
        },
        v.templates.map((o) =>
          h('option', { value: o.value, selected: o.value === v.templateValue }, o.label)
        )
      )
      fields.push(
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'tracy-template' }, t('tracy.choice.template')),
          template
        )
      )
    }
    holder.replaceChildren(...fields)
  }
  draw()
  return holder
}
