// Pure view models of the operator page: server answers in, what the screen shows out. No DOM, no fetch, no clock.
import { t, tCount } from './strings.js'

const PROVIDER_LABEL = Object.freeze({
  deepseek: 'DeepSeek',
  firecrawl: 'Firecrawl',
  jina: 'Jina',
  apify: 'Apify',
  google: 'Google',
  rapidapi: 'RapidAPI',
  serpapi: 'SerpApi',
  litescrape: 'Litescrape',
  scrapecreators: 'ScrapeCreators'
})

export const providerLabel = (id) => PROVIDER_LABEL[id] ?? id

/** US cents as dollars; a missing amount as a dash. */
export function centsText(cents) {
  if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return '—'
  return `$${(Number(cents) / 100).toFixed(2)}`
}

/** A dollar amount a person typed, as whole cents; null when it is not one (negative, more than two decimals). */
export function dollarsToCents(text) {
  const s = String(text ?? '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [whole, frac = ''] = s.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

/** What was used against a cap: text, a 0..1 ratio for a bar, and a tone (warn from 80%). */
export function capMeter(usedCents, capCents) {
  if (!capCents) return { text: t('op.cap.off', { cap: centsText(0) }), ratio: 1, tone: 'bad' }
  const ratio = Math.min(1, Math.max(0, usedCents / capCents))
  return {
    text: t('op.cap.of', { used: centsText(usedCents), cap: centsText(capCents) }),
    ratio,
    tone: usedCents >= capCents ? 'bad' : ratio >= 0.8 ? 'warn' : 'ok'
  }
}

/** One table of the Spend tab (`key` is `provider`, `purpose` or `day`). */
export function breakdownRows(list, key) {
  return (list ?? []).map((r) => ({
    label: r[key] ?? t('op.spend.unlabelled'),
    calls: tCount('op.calls', r.calls),
    amount: centsText(r.committedCents),
    flag: r.unreconciledCalls ? tCount('op.unreconciled', r.unreconciledCalls) : null
  }))
}

/** A provider key row: where the key comes from (never the key), and whether the operator may change it here. */
export function keyRowView(provider, fact, writable) {
  const label = providerLabel(provider)
  if (!fact?.configured)
    return { label, status: t('op.keys.none'), tone: 'neutral', editable: Boolean(writable) }
  const where = fact.source === 'ops' ? t('op.keys.ops') : t('op.keys.env')
  return {
    label,
    status: fact.hint ? `${where} · ${fact.hint}` : where,
    tone: 'ok',
    editable: Boolean(writable)
  }
}

/** `order` with the item at `index` moved by `delta` (-1 up, +1 down); unchanged at either end. */
export function moveInOrder(order, index, delta) {
  const to = index + delta
  if (index < 0 || index >= order.length || to < 0 || to >= order.length) return [...order]
  const next = [...order]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

const STATE_TONE = { connected: 'ok', missing_key: 'neutral', limit_reached: 'warn', error: 'bad' }

/** A capability group's providers: the ones in use in their order, then the ones left out. */
export function orderRows(group, order = group.order) {
  const byId = new Map(group.providers.map((p) => [p.id, p]))
  const row = (p, inUse) => ({
    id: p.id,
    label: p.label,
    inUse,
    stateText: t(`op.state.${p.state}`, { reason: p.lastError?.reason ?? '' }),
    tone: STATE_TONE[p.state] ?? 'neutral'
  })
  return [
    ...order.filter((id) => byId.has(id)).map((id) => row(byId.get(id), true)),
    ...group.providers.filter((p) => !order.includes(p.id)).map((p) => row(p, false))
  ]
}

const QUEUE_TONE = {
  queued: 'busy',
  running: 'busy',
  paused: 'warn',
  blocked: 'bad',
  failed: 'bad',
  cancelled: 'neutral',
  completed: 'ok'
}

/** One research job of the Queue tab. */
export function queueRowView(job) {
  const state = QUEUE_TONE[job.state] ? job.state : 'queued'
  return {
    title: job.placeName || t('op.queue.unnamed'),
    state: t(`op.queue.state.${state}`),
    tone: QUEUE_TONE[state],
    detail: job.error ?? null,
    actions: [...(job.retryable ? ['retry'] : []), ...(job.cancellable ? ['cancel'] : [])]
  }
}

/** The operator page's tabs; Hub only where the server serves the hub, Tracy where it can connect to Tracy. */
export function operatorTabs(me) {
  return ['settings', 'spend', 'queue', ...(me?.hub ? ['hub'] : []), ...(me?.tracy ? ['tracy'] : [])]
}

/** A hub account's quota use against its limits, per category this server counts. */
export function usageView(usage, limits) {
  const limitText = (n) => (n === null || n === undefined ? t('op.hub.noLimit') : String(n))
  return Object.keys(usage ?? {})
    .filter((k) => limits?.[k])
    .map((k) => ({
      label: t(`op.hub.quota.${k}`),
      day: `${usage[k].day} / ${limitText(limits[k].day)}`,
      month: `${usage[k].month} / ${limitText(limits[k].month)}`
    }))
}
