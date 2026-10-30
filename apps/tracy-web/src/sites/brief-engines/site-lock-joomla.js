/**
 * The rebuilding lock on Joomla (`../site-lock.js`): Global Configuration › Site Offline, set through the Cowork plugin's
 * `site.identity` (`offline`, `offline_message`, `display_offline_message`). Only on a site whose plugin advertises
 * `info.site_offline` with the bearer bypass: a site locked without it could no longer be read by Tracy, so its build
 * could not check what it wrote. The plugin advertises it on Joomla 4 and later only.
 */

const FIELDS = ['offline', 'offline_message', 'display_offline_message']

/** Whether the plugin's `info` offers the lock and the bearer read. @param {any} answer */
export function offersSiteLock(answer) {
  const info = answer?.info ?? answer
  const lock = info?.site_offline
  return (
    Number(lock?.version ?? 0) >= 1 &&
    lock?.bypass === 'authorization-bearer' &&
    Array.isArray(lock?.fields) &&
    FIELDS.every((field) => lock.fields.includes(field))
  )
}

/**
 * Whether the lock also takes a preview key (`offline_preview_key`, answered on `X-Tracy-Preview-Key`): what lets the
 * agent's page reads, which carry no token, see the real site while it is locked. @param {any} answer
 */
export function offersPreviewKey(answer) {
  const also = (answer?.info ?? answer)?.site_offline?.bypass_also
  return offersSiteLock(answer) && Array.isArray(also) && also.includes('preview-key')
}

/** @type {import('../site-lock.js').SiteLockWriter} */
export const joomlaSiteLock = {
  action: 'site.identity',
  async supported(apply, siteKey) {
    const answer = await apply({ siteKey, action: 'info', params: {} }).catch(() => null)
    if (answer?.ok === false || !offersSiteLock(answer)) return false
    return { previewKey: offersPreviewKey(answer) }
  },
  // 1: the offline page shows the custom message.
  lockFields: (message, previewKey = null) => ({
    offline: 1,
    offline_message: message,
    display_offline_message: 1,
    ...(previewKey ? { offline_preview_key: previewKey } : {})
  }),
  unlockFields: () => ({ offline: 0 })
}
