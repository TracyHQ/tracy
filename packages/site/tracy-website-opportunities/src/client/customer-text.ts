/** Customer presentation only. Provider quotas remain in operator diagnostics and polling state. */
import type { Translate } from './strings.ts'

export function customerText(translate: Translate): Translate {
  return (key, params) => {
    if (key === 'cell.social.deferred') return ''
    if (key === 'reason.quota' || key === 'reason.rate_limited') return translate('reason.other')
    return translate(key, params)
  }
}
