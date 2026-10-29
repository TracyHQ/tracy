// Every pasted link retains its source-reported outcome, including future source kinds.
import { t } from './strings.js'

const REASONS = new Set(['not-configured', 'unresolved', 'fetch-failed', 'blocked'])
export function linkReadRow(link) {
  if (link.readStatus === 'read') {
    const counts = link.counts ?? { photos: 0, reviews: 0, contacts: 0 }
    const unit = (key) =>
      t(`links.read.${key}.${new Intl.PluralRules('en').select(counts[key]) === 'one' ? 'one' : 'other'}`, {
        count: counts[key]
      })
    return {
      text: t('links.read.read', {
        photos: unit('photos'),
        reviews: unit('reviews'),
        contacts: unit('contacts')
      }),
      tone: 'good'
    }
  }
  if (link.readStatus === 'could-not-read') {
    const reason = REASONS.has(link.readReason) ? link.readReason : 'fetch-failed'
    return { text: t(`links.read.${reason}`), tone: 'error' }
  }
  return { text: t('links.read.pending'), tone: 'muted' }
}
