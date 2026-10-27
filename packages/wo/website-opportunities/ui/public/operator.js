// The operator page, #/operator/<tab>: Settings (keys, caps, provider order), Spend, Queue, Tracy (connect this
// server to a Tracy account) and, where the server serves the hub, Hub. Shown only to whoever the server names the operator (`/operator/me`). Every server value is
// rendered as text.
import { ApiError, api, readToken } from './api.js'
import { h } from './dom.js'
import {
  breakdownRows,
  capMeter,
  centsText,
  dollarsToCents,
  keyRowView,
  moveInOrder,
  operatorTabs,
  orderRows,
  queueRowView,
  usageView
} from './operator-view-models.js'
import { t, tCount } from './strings.js'
import { tracyConnectView } from './tracy-view-models.js'

const OP = '/operator'
const CAP_FIELDS = [
  ['researchDailyCapCents', 'cents'],
  ['researchJobCapCents', 'cents'],
  ['maxChargeUsdPerRun', 'dollars']
]
const QUEUE_STATES = ['queued', 'running', 'paused', 'blocked', 'failed', 'cancelled', 'completed']
const SPEND_DAYS = [7, 30, 90]

let allowed = { token: undefined, answer: null }

/** Whether this viewer is the operator: asked once per token, and a refusal or an old server reads as no. */
export function operatorAllowed() {
  const token = readToken()
  if (allowed.token !== token || !allowed.answer) {
    allowed = {
      token,
      answer: api(`${OP}/me`).then(
        (me) => me,
        () => null
      )
    }
  }
  return allowed.answer.then((me) => Boolean(me?.operator))
}

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')
const chip = (text, tone) => h('span', { class: `chip tone-${tone}` }, text)
const card = (title, ...children) => h('section', { class: 'card' }, h('h2', {}, title), ...children)

function errorText(error) {
  return error instanceof ApiError ? error.message : t('common.offline')
}

/** A button that runs `work`, disabled while it runs; a failure is toasted, never thrown. */
function action(label, work, { toast, primary = false, busy = null } = {}) {
  const button = h(
    'button',
    {
      type: 'button',
      class: primary ? 'primary' : '',
      on: {
        click: async () => {
          button.disabled = true
          if (busy) button.textContent = busy
          try {
            await work()
          } catch (error) {
            toast(errorText(error))
          } finally {
            button.disabled = false
            button.textContent = label
          }
        }
      }
    },
    label
  )
  return button
}

export async function operatorView({ token, tab, show, current, toast, showError }) {
  const me = await api(`${OP}/me`).catch((error) => {
    if (error instanceof ApiError && error.status === 403) return null
    throw error
  })
  if (!me) return show(token, h('div', { class: 'notice bad', role: 'alert' }, h('p', {}, t('op.forbidden'))))
  const tabs = operatorTabs(me)
  const active = tabs.includes(tab) ? tab : 'settings'
  const body = h('div', { 'aria-live': 'polite' }, h('p', { class: 'muted' }, t('common.loading')))
  const nav = h(
    'nav',
    { 'aria-label': t('op.tabs') },
    h(
      'ul',
      { class: 'tabs' },
      tabs.map((name) =>
        h(
          'li',
          {},
          h(
            'a',
            { href: `#/operator/${name}`, 'aria-current': name === active ? 'page' : null },
            t(`op.tab.${name}`)
          )
        )
      )
    )
  )
  if (!show(token, h('h1', {}, t('op.title')), h('p', { class: 'lead muted' }, t('op.lead')), nav, body))
    return
  const ctx = {
    token,
    current,
    toast,
    me,
    body,
    rerender: () => operatorView({ token, tab: active, show, current, toast, showError })
  }
  const render = { settings: settingsTab, spend: spendTab, queue: queueTab, hub: hubTab, tracy: tracyTab }[
    active
  ]
  await render(ctx).catch((error) => showError(error, token))
}

// ── Settings ───────────────────────────────────────────────────────────────────────────────
async function settingsTab(ctx) {
  const doc = await api(`${OP}/settings`)
  if (!ctx.current(ctx.token)) return
  const redraw = (next) => ctx.body.replaceChildren(...settingsNodes(ctx, next, redraw))
  redraw(doc)
}

function settingsNodes(ctx, doc, redraw) {
  return [keysCard(ctx, doc, redraw), capsCard(ctx, doc, redraw), orderCard(ctx, doc, redraw)]
}

function keysCard(ctx, doc, redraw) {
  const rows = Object.entries(doc.keys.providers).map(([provider, fact]) => {
    const view = keyRowView(provider, fact, doc.keysWritable)
    const result = h('p', { class: 'hint', 'aria-live': 'polite' })
    const test = action(
      t('op.keys.test'),
      async () => {
        const out = await api(`${OP}/keys/${provider}/test`, { method: 'POST', body: {} })
        result.replaceChildren(
          chip(out.ok ? t('op.state.connected') : out.status, out.ok ? 'ok' : 'bad'),
          ' ',
          out.detail ?? ''
        )
      },
      { toast: ctx.toast, busy: t('op.keys.testing') }
    )
    const id = `key-${provider}`
    const input = view.editable
      ? h('input', { id, type: 'password', autocomplete: 'off', spellcheck: 'false' })
      : null
    const save = async (apiKey) => {
      redraw(await api(`${OP}/keys/${provider}`, { method: 'PUT', body: { apiKey } }))
      ctx.toast(t('op.saved'))
    }
    return h(
      'li',
      { class: 'op-row' },
      h('div', { class: 'op-row-head' }, h('strong', {}, view.label), chip(view.status, view.tone)),
      view.editable
        ? h(
            'div',
            { class: 'fields' },
            h(
              'div',
              { class: 'field grow' },
              h('label', { for: id, class: 'sr-only' }, t('op.keys.input', { provider: view.label })),
              input
            )
          )
        : null,
      h(
        'div',
        { class: 'row' },
        view.editable
          ? action(t('op.keys.save'), () => save(input.value.trim()), { toast: ctx.toast, primary: true })
          : null,
        view.editable && fact.source === 'ops'
          ? action(t('op.keys.clear'), () => save(''), { toast: ctx.toast })
          : null,
        test
      ),
      result
    )
  })
  return card(
    t('op.keys.title'),
    h('p', { class: 'muted' }, t(doc.keysWritable ? 'op.keys.lead' : 'op.keys.readOnly')),
    h('ul', { class: 'op-list' }, rows)
  )
}

function capsCard(ctx, doc, redraw) {
  const inputs = CAP_FIELDS.map(([key, unit]) => {
    const value =
      unit === 'cents' ? (doc.settings[key] / 100).toFixed(2) : Number(doc.settings[key]).toFixed(2)
    return [
      key,
      unit,
      h('input', { id: `cap-${key}`, type: 'text', inputmode: 'decimal', value, autocomplete: 'off' })
    ]
  })
  const error = h('p', { class: 'notice bad', role: 'alert', hidden: true })
  const form = h(
    'form',
    {
      on: {
        submit: async (e) => {
          e.preventDefault()
          const settings = {}
          for (const [key, unit, input] of inputs) {
            const cents = dollarsToCents(input.value)
            if (cents === null) {
              error.textContent = t('op.caps.invalid')
              error.hidden = false
              input.focus()
              return
            }
            settings[key] = unit === 'cents' ? cents : cents / 100
          }
          error.hidden = true
          try {
            redraw(await api(`${OP}/settings`, { method: 'PUT', body: { settings } }))
            ctx.toast(t('op.saved'))
          } catch (err) {
            ctx.toast(errorText(err))
          }
        }
      }
    },
    h(
      'div',
      { class: 'fields' },
      inputs.map(([key, , input]) =>
        h('div', { class: 'field small-wide' }, h('label', { for: input.id }, t(`op.caps.${key}`)), input)
      )
    ),
    error,
    h('div', { class: 'row' }, h('button', { type: 'submit', class: 'primary' }, t('op.save')))
  )
  return card(t('op.caps.title'), h('p', { class: 'muted' }, t('op.caps.lead')), form)
}

function orderCard(ctx, doc, redraw) {
  const groups = doc.capabilities.map((group) => {
    let order = [...group.order]
    const list = h('ol', { class: 'op-list' })
    const draw = () => {
      list.replaceChildren(
        ...orderRows(group, order).map((row) => {
          const index = order.indexOf(row.id)
          const controls = group.wired
            ? row.inUse
              ? [
                  h(
                    'button',
                    {
                      type: 'button',
                      'aria-label': t('op.order.up', { provider: row.label }),
                      disabled: index === 0,
                      on: { click: () => ((order = moveInOrder(order, index, -1)), draw()) }
                    },
                    '↑'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      'aria-label': t('op.order.down', { provider: row.label }),
                      disabled: index === order.length - 1,
                      on: { click: () => ((order = moveInOrder(order, index, 1)), draw()) }
                    },
                    '↓'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      on: { click: () => ((order = order.filter((id) => id !== row.id)), draw()) }
                    },
                    t('op.order.remove')
                  )
                ]
              : [
                  h(
                    'button',
                    { type: 'button', on: { click: () => ((order = [...order, row.id]), draw()) } },
                    t('op.order.add')
                  )
                ]
            : []
          return h(
            'li',
            { class: `op-row${row.inUse ? '' : ' unused'}` },
            h(
              'div',
              { class: 'op-row-head' },
              h('span', {}, row.label),
              chip(row.inUse ? row.stateText : t('op.order.unused'), row.inUse ? row.tone : 'neutral')
            ),
            controls.length ? h('div', { class: 'row' }, controls) : null
          )
        })
      )
    }
    draw()
    const save = action(
      t('op.order.save'),
      async () => {
        const providerOrder = { ...doc.settings.providerOrder, [group.id]: order }
        redraw(await api(`${OP}/settings`, { method: 'PUT', body: { settings: { providerOrder } } }))
        ctx.toast(t('op.saved'))
      },
      { toast: ctx.toast, primary: true }
    )
    return h(
      'details',
      { class: 'op-group' },
      h('summary', {}, group.label, group.declared ? '' : ` · ${t('op.order.default')}`),
      group.wired ? null : h('p', { class: 'hint' }, t('op.order.readOnly')),
      list,
      group.wired ? h('div', { class: 'row' }, save) : null
    )
  })
  return card(t('op.order.title'), h('p', { class: 'muted' }, t('op.order.lead')), ...groups)
}

// ── Spend ──────────────────────────────────────────────────────────────────────────────────
const spendState = { days: 30, unreconciledOnly: false }

async function spendTab(ctx) {
  const summary = await api(`${OP}/spend?days=${spendState.days}`)
  if (!ctx.current(ctx.token)) return
  const select = h(
    'select',
    { id: 'spend-days', on: { change: () => ((spendState.days = Number(select.value)), ctx.rerender()) } },
    SPEND_DAYS.map((d) =>
      h(
        'option',
        { value: String(d), selected: d === spendState.days },
        t('op.spend.daysOption', { days: d })
      )
    )
  )
  const meter = capMeter(summary.today.committedCents, summary.caps.researchDailyCapCents)
  const table = (title, key, list) =>
    h(
      'div',
      { class: 'op-table' },
      h('h3', {}, title),
      list.length
        ? h(
            'ul',
            { class: 'op-list' },
            breakdownRows(list, key).map((r) =>
              h(
                'li',
                { class: 'op-row op-row-head' },
                h('span', {}, r.label),
                h('span', { class: 'muted' }, r.calls),
                h('strong', {}, r.amount),
                r.flag ? chip(r.flag, 'warn') : null
              )
            )
          )
        : h('p', { class: 'muted' }, t('op.spend.empty'))
    )
  ctx.body.replaceChildren(
    card(
      t('op.spend.title'),
      h('div', { class: 'field filter' }, h('label', { for: 'spend-days' }, t('op.spend.days')), select),
      h('h3', {}, t('op.spend.today')),
      h('p', {}, chip(meter.text, meter.tone)),
      h('progress', { max: '1', value: String(meter.ratio), 'aria-label': t('op.spend.today') }),
      h(
        'p',
        { class: 'summary' },
        t('op.spend.total', {
          amount: centsText(summary.totals.committedCents),
          calls: tCount('op.calls', summary.totals.calls)
        })
      ),
      summary.totals.unreconciledCalls
        ? h(
            'p',
            {},
            chip(
              t('op.spend.unreconciled', {
                amount: centsText(summary.totals.unreconciledCents),
                count: summary.totals.unreconciledCalls
              }),
              'warn'
            ),
            ' ',
            h('span', { class: 'hint' }, t('op.spend.unreconciledHint'))
          )
        : null,
      h(
        'div',
        { class: 'op-tables' },
        table(t('op.spend.byProvider'), 'provider', summary.byProvider),
        table(t('op.spend.byPurpose'), 'purpose', summary.byPurpose),
        table(t('op.spend.byDay'), 'day', summary.byDay)
      )
    ),
    rowsCard(ctx)
  )
}

function rowsCard(ctx) {
  const list = h('ul', { class: 'op-list' })
  const filter = h(
    'select',
    {
      id: 'spend-filter',
      on: {
        change: () => ((spendState.unreconciledOnly = filter.value === 'unreconciled'), load(null, true))
      }
    },
    h('option', { value: 'all', selected: !spendState.unreconciledOnly }, t('op.spend.filter.all')),
    h(
      'option',
      { value: 'unreconciled', selected: spendState.unreconciledOnly },
      t('op.spend.filter.unreconciled')
    )
  )
  const more = h('div', { class: 'row' })
  async function load(cursor, reset) {
    const params = new URLSearchParams({ limit: '50' })
    if (spendState.unreconciledOnly) params.set('state', 'unreconciled')
    if (cursor) params.set('cursor', cursor)
    const page = await api(`${OP}/spend/rows?${params}`)
    if (!ctx.current(ctx.token)) return
    if (reset) list.replaceChildren()
    for (const r of page.rows)
      list.append(
        h(
          'li',
          { class: 'op-row' },
          h(
            'div',
            { class: 'op-row-head' },
            h(
              'span',
              { class: 'mono' },
              t('op.spend.row', { day: r.day, provider: r.provider, operation: r.operation })
            ),
            chip(
              t(`op.ledger.${r.state}`),
              r.state === 'unreconciled' ? 'warn' : r.state === 'settled' ? 'ok' : 'neutral'
            )
          ),
          h(
            'p',
            { class: 'hint' },
            `${centsText(r.actualCents ?? r.reservedCents)}${r.purpose ? ` · ${r.purpose}` : ''}`
          )
        )
      )
    if (!list.children.length) list.append(h('li', { class: 'muted' }, t('op.spend.empty')))
    more.replaceChildren(
      page.next ? action(t('op.spend.more'), () => load(page.next, false), { toast: ctx.toast }) : ''
    )
  }
  load(null, true).catch((error) => ctx.toast(errorText(error)))
  return card(
    t('op.spend.rows'),
    h('div', { class: 'field filter' }, h('label', { for: 'spend-filter' }, t('op.spend.filter')), filter),
    list,
    more
  )
}

// ── Queue ──────────────────────────────────────────────────────────────────────────────────
const queueState = { state: '' }

async function queueTab(ctx) {
  const params = new URLSearchParams()
  if (queueState.state) params.set('state', queueState.state)
  const q = await api(`${OP}/queue?${params}`)
  if (!ctx.current(ctx.token)) return
  const select = h(
    'select',
    { id: 'queue-state', on: { change: () => ((queueState.state = select.value), ctx.rerender()) } },
    h('option', { value: '', selected: !queueState.state }, t('op.queue.needsEye')),
    QUEUE_STATES.map((s) =>
      h(
        'option',
        { value: s, selected: queueState.state === s },
        t('op.queue.count', { state: t(`op.queue.state.${s}`), count: q.counts[s] ?? 0 })
      )
    )
  )
  const rows = q.jobs.map((job) => {
    const view = queueRowView(job)
    const buttons = view.actions.map((name) =>
      action(
        t(`op.queue.${name}`),
        async () => {
          await api(`${OP}/queue/${encodeURIComponent(job.id)}/${name}`, { method: 'POST', body: {} })
          ctx.toast(t('op.saved'))
          ctx.rerender()
        },
        { toast: ctx.toast }
      )
    )
    return h(
      'li',
      { class: 'op-row' },
      h('div', { class: 'op-row-head' }, h('strong', {}, view.title), chip(view.state, view.tone)),
      view.detail ? h('p', { class: 'hint' }, view.detail) : null,
      h('p', { class: 'hint' }, t('op.queue.updated', { when: when(job.updatedAt) })),
      buttons.length ? h('div', { class: 'row' }, buttons) : null
    )
  })
  ctx.body.replaceChildren(
    card(
      t('op.queue.title'),
      h('div', { class: 'field filter' }, h('label', { for: 'queue-state' }, t('op.queue.filter')), select),
      rows.length ? h('ul', { class: 'op-list' }, rows) : h('p', { class: 'muted' }, t('op.queue.empty'))
    )
  )
}

// ── Hub ────────────────────────────────────────────────────────────────────────────────────
async function hubTab(ctx) {
  const [verify, accounts] = await Promise.all([api(`${OP}/hub/verify`), api(`${OP}/hub/accounts`)])
  if (!ctx.current(ctx.token)) return
  const post = (path, body = {}) => api(`${OP}/hub${path}`, { method: 'POST', body })
  const meter = capMeter(verify.budget.spentCents, verify.budget.capCents)
  const accountRows = accounts.accounts.map((a) => {
    const contributions = h('ul', { class: 'op-list', hidden: true })
    const showContributions = action(
      t('op.hub.showContributions'),
      async () => {
        const { contributions: list } = await api(`${OP}/hub/accounts/${a.id}/contributions`)
        contributions.replaceChildren(
          ...list.map((c) =>
            h(
              'li',
              { class: 'op-row op-row-head' },
              h(
                'span',
                {},
                t('op.hub.contribution', {
                  when: when(c.receivedAt),
                  status: c.status,
                  count: c.observations.total
                })
              ),
              c.status === 'withdrawn'
                ? null
                : action(
                    t('op.hub.withdraw'),
                    async () => (await post(`/contributions/${c.id}/withdraw`), ctx.rerender()),
                    { toast: ctx.toast }
                  )
            )
          )
        )
        contributions.hidden = false
      },
      { toast: ctx.toast }
    )
    return h(
      'li',
      { class: 'op-row' },
      h(
        'div',
        { class: 'op-row-head' },
        h('strong', { class: 'mono' }, t('op.hub.account', { id: a.id.slice(0, 8) })),
        chip(t(`op.hub.state.${a.state}`), a.state === 'active' ? 'ok' : 'bad')
      ),
      h(
        'p',
        { class: 'hint' },
        a.tokenPrefix ? t('op.hub.token', { prefix: a.tokenPrefix }) : t('op.hub.noToken'),
        ' · ',
        t('op.hub.contributions', a.contributions)
      ),
      h(
        'dl',
        { class: 'facts-list' },
        usageView(a.usage, accounts.limits).flatMap((u) => [
          h('dt', {}, u.label),
          h('dd', {}, `${t('op.hub.usage.day')} ${u.day} · ${t('op.hub.usage.month')} ${u.month}`)
        ])
      ),
      h(
        'div',
        { class: 'row' },
        action(
          t(a.state === 'active' ? 'op.hub.block' : 'op.hub.unblock'),
          async () => (
            await post(`/accounts/${a.id}/${a.state === 'active' ? 'block' : 'unblock'}`), ctx.rerender()
          ),
          { toast: ctx.toast }
        ),
        a.tokenPrefix
          ? action(
              t('op.hub.revokeToken'),
              async () => (await post(`/accounts/${a.id}/revoke-token`), ctx.rerender()),
              { toast: ctx.toast }
            )
          : null,
        showContributions
      ),
      contributions
    )
  })
  ctx.body.replaceChildren(
    card(
      t('op.hub.verify'),
      h(
        'p',
        {},
        t('op.hub.backlog', {
          observations: verify.backlog.pendingObservations,
          groups: verify.backlog.pendingGroups,
          deferred: verify.backlog.deferredBudget
        })
      ),
      verify.backlog.oldestReceivedAt
        ? h('p', { class: 'hint' }, t('op.hub.oldest', { when: when(verify.backlog.oldestReceivedAt) }))
        : null,
      h('h3', {}, t('op.hub.budget')),
      h('p', {}, chip(meter.text, meter.tone))
    ),
    card(
      t('op.hub.accounts'),
      accountRows.length
        ? h('ul', { class: 'op-list' }, accountRows)
        : h('p', { class: 'muted' }, t('op.hub.accounts.empty'))
    ),
    removalCard(ctx, 'place', post),
    removalCard(ctx, 'media', post)
  )
}

/** A small form: an id, a reason, and the removal buttons for a place or a picture. Each asks before it acts. */
function removalCard(ctx, kind, post) {
  const id = h('input', {
    id: `hub-${kind}-id`,
    type: 'text',
    autocomplete: 'off',
    spellcheck: 'false',
    class: 'mono'
  })
  const reason = h('input', { id: `hub-${kind}-reason`, type: 'text', autocomplete: 'off', maxlength: '500' })
  const run = (path) => async () => {
    if (!window.confirm(t('op.hub.confirm'))) return
    await post(`/${kind === 'place' ? 'places' : 'media'}/${encodeURIComponent(id.value.trim())}/${path}`, {
      reason: reason.value.trim()
    })
    ctx.toast(t('op.saved'))
    id.value = ''
    reason.value = ''
  }
  return card(
    t(kind === 'place' ? 'op.hub.place' : 'op.hub.media'),
    h(
      'div',
      { class: 'fields' },
      h(
        'div',
        { class: 'field grow' },
        h('label', { for: id.id }, t(kind === 'place' ? 'op.hub.placeId' : 'op.hub.mediaId')),
        id
      ),
      h('div', { class: 'field grow' }, h('label', { for: reason.id }, t('op.reason')), reason)
    ),
    h(
      'div',
      { class: 'row' },
      kind === 'place'
        ? [
            action(t('op.hub.revokePlace'), run('revoke'), { toast: ctx.toast }),
            action(t('op.hub.suppress'), run('suppress'), { toast: ctx.toast })
          ]
        : action(t('op.hub.revokeMedia'), run('revoke'), { toast: ctx.toast })
    )
  )
}

// ── Tracy ──────────────────────────────────────────────────────────────────────────────────
const TRACY_POLL_MS = 2500

async function tracyTab(ctx) {
  const redraw = (status) => {
    if (!ctx.current(ctx.token)) return
    ctx.body.replaceChildren(tracyCard(ctx, status, redraw))
    clearTimeout(tracyTab.timer)
    // While a code waits, each read asks Tracy once; the server keeps the pace Tracy set.
    if (status.state === 'pending')
      tracyTab.timer = setTimeout(
        () => ctx.current(ctx.token) && api(`${OP}/tracy`).then(redraw, (e) => ctx.toast(errorText(e))),
        TRACY_POLL_MS
      )
  }
  redraw(await api(`${OP}/tracy`))
}

function tracyCard(ctx, status, redraw) {
  const view = tracyConnectView(status)
  const post = (path) => api(`${OP}/tracy/${path}`, { method: 'POST', body: {} }).then(redraw)
  const buttons = view.actions.map((name) =>
    name === 'disconnect'
      ? action(
          t('tracy.disconnect'),
          async () => {
            if (window.confirm(t('tracy.disconnect.confirm'))) await post('disconnect')
          },
          { toast: ctx.toast }
        )
      : action(t(`tracy.${name}`), () => post('connect'), {
          toast: ctx.toast,
          primary: true,
          busy: t('common.loading')
        })
  )
  return card(
    t('tracy.title'),
    h('p', { class: 'muted' }, t('tracy.lead')),
    h('p', { class: 'hint' }, t('tracy.where', { url: status.tracyUrl ?? '' })),
    h('p', { 'aria-live': 'polite' }, chip(view.status, view.tone)),
    view.problem ? h('p', { class: 'notice bad', role: 'alert' }, view.problem) : null,
    view.code
      ? h(
          'div',
          { class: 'tracy-code-box' },
          h('p', { class: 'hint' }, t('tracy.codeLabel')),
          h('p', { class: 'tracy-code mono' }, view.code),
          h('p', { class: 'muted' }, t('tracy.codeHelp')),
          view.link
            ? h(
                'a',
                { class: 'button primary', href: view.link, target: '_blank', rel: 'noopener noreferrer' },
                t('tracy.open')
              )
            : null
        )
      : null,
    h('div', { class: 'row' }, buttons),
    h('p', { class: 'hint' }, t('tracy.storage'))
  )
}
