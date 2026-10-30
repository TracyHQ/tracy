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

/** @type {import('../site-lock.js').SiteLockWriter} */
export const joomlaSiteLock = {
  action: 'site.identity',
  async supported(apply, siteKey) {
    const answer = await apply({ siteKey, action: 'info', params: {} }).catch(() => null)
    return answer?.ok !== false && offersSiteLock(answer)
  },
  // 1: the offline page shows the custom message.
  lockFields: (message) => ({ offline: 1, offline_message: message, display_offline_message: 1 }),
  unlockFields: () => ({ offline: 0 })
}
