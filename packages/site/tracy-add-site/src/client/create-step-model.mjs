/** Allow navigation to complete before showing recovery in the same page. */
export const REDIRECT_WAIT_MS = 5_000

/** Presentation keys are selected only from distinctions the existing client retains.
 * @param {{ refusal: string, code: string, redirectFailed?: boolean }} refused
 * @returns {string}
 */
export function createRefusalGuidance(refused) {
  if (refused.refusal === 'elsewhere' && refused.redirectFailed) return 'redirect_failed'
  /** @type {Record<string, string>} */
  const byCode = {
    UNSUPPORTED_PLATFORM: 'platform',
    UNSUPPORTED_QUICKSTART: 'template',
    UNSUPPORTED_DESIGN: 'template',
    UNKNOWN_DESIGN: 'template',
    DESIGN_SYSTEMS_OFF: 'systems_off',
    DS_UNKNOWN: 'system',
    BUILD_GONE: 'gone',
    CSRF_ORIGIN: 'reload',
    INVALID_REQUEST: 'request',
    UNSUPPORTED_MEDIA_TYPE: 'request',
    INVALID_BUILD_ID: 'request',
    TEMPLATE_VERSION_CHANGED: 'template',
    DESIGN_PLAN_CHANGED: 'template',
    DS_TEMPLATE_LOCKED: 'system_locked',
    DEMO_WORKFLOW_INVALID: 'request',
    AGENT_DEMO_CREATE_REFUSED: 'request',
    ACCOUNT_NOT_ON_SHARD: 'account'
  }
  /** @type {Record<string, string>} */
  const byRefusal = {
    shape: 'shape',
    reserved: 'reserved',
    looks_imported: 'looks_imported',
    taken: 'taken',
    signed_out: 'signed_out',
    pending: 'pending',
    host_updating: 'updating',
    conflict: 'conflict',
    elsewhere: 'elsewhere'
  }
  if (refused.code === 'SHARD_FULL') return refused.refusal === 'elsewhere' ? 'capacity' : 'unconfirmed'
  return byCode[refused.code] ?? byRefusal[refused.refusal] ?? 'unconfirmed'
}

/** Late design-system reasons survive normalization; free diagnostic text never decides a cause.
 * @param {string | null | undefined} reason
 * @returns {string}
 */
export function createDesignGuidance(reason) {
  const code = (reason ?? '').split(':')[0]
  if (['DS_UNKNOWN', 'DS_REFUSED'].includes(code)) return 'design_unavailable'
  if (['DS_TEMPLATE_CANNOT_WEAR', 'PLATFORM_HAS_NO_SLOT'].includes(code)) return 'design_incompatible'
  if (code === 'DS_TEMPLATE_LOCKED') return 'design_locked'
  if (code === 'DS_THEME_CANNOT_WEAR') return 'design_theme'
  if (code === 'DS_IMPORTED_SITE') return 'design_imported'
  if (code === 'DS_READ_FAILED') return 'design_read'
  if (code === 'DS_WRITE_FAILED') return 'design_write'
  if (code === 'SITE_BUSY') return 'design_busy'
  if (code === 'SITE_UNKNOWN') return 'design_gone'
  return 'design'
}

/** Status treatment follows known progress states, never diagnostic text.
 * @param {string} status
 * @param {boolean} inProgress
 */
export function createStatusTreatment(status, inProgress) {
  const headline = {
    create_status_accepted: 'create_headline_accepted',
    create_status_queued: 'create_headline_queued',
    create_status_slow: 'create_headline_slow'
  }[status]
  return { headline, live: inProgress }
}

/** Recovery uses the wizard's existing form and My Sites actions.
 * @param {string} key
 * @returns {string[]}
 */
export function createRefusalActions(key) {
  if (['shape', 'reserved', 'looks_imported'].includes(key)) return ['create_change_name']
  if (key === 'taken') return ['create_change_name', 'create_my_sites']
  if (key === 'template') return ['create_change_template']
  if (key === 'platform') return ['create_change_platform']
  if (['systems_off', 'system', 'system_locked'].includes(key)) return ['create_change_system']
  if (key === 'updating') return ['create_my_sites', 'create_review_details']
  if (key === 'conflict') return ['create_my_sites', 'create_change_name']
  if (key === 'reload') return ['create_reload_page']
  if (['request', 'account', 'redirect_failed'].includes(key)) return ['create_review_details']
  if (key === 'signed_out') return ['sign_in_new_tab']
  if (['elsewhere', 'capacity'].includes(key)) return []
  return ['create_my_sites']
}

/** Titles distinguish a refusal, an unconfirmed result and an automatic redirect.
 * @param {string} key
 */
export function createRefusalTitle(key) {
  if (key === 'redirect_failed') return 'create_title_redirect_failed'
  if (['elsewhere', 'capacity'].includes(key)) return 'create_title_redirect'
  if (['unconfirmed', 'pending', 'conflict', 'gone', 'updating'].includes(key))
    return 'create_title_unconfirmed'
  return 'create_title_request'
}

/** Unsupported sites and templates cannot recover by applying the same design again.
 * @param {string | undefined} guidance
 */
export function canRetryCreateDesign(guidance) {
  return ![
    'design_unavailable',
    'design_incompatible',
    'design_imported',
    'design_locked',
    'design_theme',
    'design_gone'
  ].includes(guidance ?? '')
}
