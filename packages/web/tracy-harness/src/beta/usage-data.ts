/** Shared Usage view helpers preserve missing measurements rather than inventing zeroes. */

import { formatFixed } from '../i18n/format.ts'
import type { T } from '../i18n'
import { formatNumber } from './signals-data'
import { counted } from './strings'
import type { Platform, Quantiles, Rate, Usage, UsageCustomer, UsageFilters } from './usage-api'

export const USAGE_DEFAULTS: UsageFilters = {
  days: '14',
  start: '',
  end: '',
  cms: 'all',
  audience: 'customers',
  demo: 'exclude',
  compare: true
}
const CMS_KEYS: Record<Platform, string> = {
  all: 'beta.usage.cms.all',
  wordpress: 'beta.usage.cms.wordpress',
  joomla: 'beta.usage.cms.joomla',
  emdash: 'beta.usage.cms.emdash',
  unknown: 'beta.usage.cms.unknown'
}
/** Platforms in display order. */
export const CMS_PLATFORMS = Object.keys(CMS_KEYS) as Platform[]
export const isPlatform = (value: string): value is Platform => Object.hasOwn(CMS_KEYS, value)
/** A platform's name; a code the client does not know shows as itself. */
export const cmsLabel = (t: T, platform: string) => (isPlatform(platform) ? t(CMS_KEYS[platform]) : platform)
/** "{a} of {n} …" for a key whose plural follows the total. */
export const outOf = (t: T, key: string, a: number, total: number) =>
  t(key, { a: formatNumber(a), ...counted(total) })
export function readUsageFilters(): UsageFilters {
  const params = new URLSearchParams(window.location.search)
  const cms = params.get('cms') as Platform
  const audience = params.get('audience')
  const demo = params.get('demo')
  const start = params.get('start') || ''
  const end = params.get('end') || ''
  return {
    ...USAGE_DEFAULTS,
    days:
      start && end
        ? 'custom'
        : ['24h', '7', '14', '30', 'all'].includes(params.get('days') || '')
          ? params.get('days')!
          : '14',
    start,
    end,
    cms: cms && isPlatform(cms) ? cms : 'all',
    audience: audience === 'staff' || audience === 'all' ? audience : 'customers',
    demo: demo === 'include' || demo === 'only' ? demo : 'exclude',
    compare: params.get('compare') !== '0'
  }
}
export const usagePlatforms = (body: Usage, cms: Platform) =>
  (cms === 'all' ? body.platforms.filter((p) => p !== 'all') : [cms]).filter(
    (p) => p !== 'unknown' || body.turns[p].turns + body.funnel.byPlatform[p].created > 0
  )
export const rateLabel = (t: T, rate: Rate, unit: 'requests' | 'sites' = 'requests') =>
  rate.a === 0 || rate.b === 0
    ? outOf(t, `beta.usage.rate.${unit}${rate.b === 0 ? 'Eligible' : ''}`, rate.a, rate.b)
    : rate.rate === null
      ? t('beta.usage.rate.share', { a: rate.a, b: rate.b })
      : `${Math.round(rate.rate * 100)}% (${rate.a}/${rate.b})`
export const duration = (t: T, seconds: number | null) =>
  seconds === null
    ? t('beta.usage.time.notAvailable')
    : seconds < 90
      ? t('beta.usage.time.seconds', { n: Math.round(seconds) })
      : t('beta.usage.time.minutes', { n: formatFixed(seconds / 60, 1) })
export const typicalTime = (t: T, sample: Quantiles) =>
  sample.p50 === null ? t('beta.usage.time.notEnough') : duration(t, sample.p50)
export function customerStatus(t: T, row: UsageCustomer) {
  if (row.bad > 0 || row.undone > 0 || row.reworks > 0)
    return { label: t('beta.usage.status.review'), tone: 'warning' }
  if (row.requests >= 3 && row.changed === 0)
    return { label: t('beta.usage.status.noChanges'), tone: 'neutral' }
  if (row.requests >= 10 && row.changed > 0)
    return { label: t('beta.usage.status.frequent'), tone: 'positive' }
  return { label: t('beta.usage.status.active'), tone: 'neutral' }
}
