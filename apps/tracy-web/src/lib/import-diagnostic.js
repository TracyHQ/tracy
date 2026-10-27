/**
 * The diagnostic an import worker sends with a failed import (`POST /api/sites/:key/import-result`),
 * accepted only from closed sets.
 *
 * 🔒 A shape check is not a secret check: `/administrator/secret123` is a well-formed path and
 * `hunter2` a well-formed error code. So `at`, `check` and `path` must each be one of a fixed list
 * or the field (or the whole detail) is dropped, and `error` is one of the network and TLS codes or
 * `other`. The stuck alert prints only what this returns.
 *
 * 🔒 The same lists live in `packages/site/tracy-add-site/src/host/diagnostic.mjs`, where the worker
 * builds the detail. Change both together; a value only one side knows is dropped.
 */

export const DIAGNOSTIC_STEPS = new Set([
  'login_page',
  'login_post',
  'login_landing',
  'install_page',
  'php_check',
  'url_install',
  'package_download',
  'upload_page',
  'upload_install',
  'proof',
  'api_door',
  'export'
])

export const DIAGNOSTIC_CHECKS = new Set([
  'admin_form_not_found',
  'admin_gate',
  'bad_location',
  'basic_challenge',
  'below_minimum',
  'connection_refused_after_ban',
  'connection_refused_after_progress',
  'contract_unavailable',
  'firewall',
  'forbidden',
  'http_status',
  'invalid_credential',
  'joomla_denied',
  'left_installer',
  'memory_exhausted',
  'message_unread',
  'mfa',
  'network',
  'no_backend_access',
  'no_csrf',
  'no_door',
  'no_engine',
  'no_redirect',
  'no_token',
  'not_answering',
  'not_downloaded',
  'not_installed',
  'over_limit',
  'parse_error',
  'refused',
  'server_denied',
  'signed_out',
  'tls',
  'too_large',
  'untrusted_target'
])

/** The install roads whose answers ride in `roads`, each kept apart. */
export const DIAGNOSTIC_ROADS = new Set(['url_install', 'upload_install'])

/**
 * What a road met, as a fixed classification of its answer, never the answer: PHP's memory error in
 * the POST's page, a 413, or the package larger than a PHP upload limit (the road not taken).
 */
export const DIAGNOSTIC_CAUSES = new Set(['memory_exhausted', 'too_large', 'over_limit'])

/** The PHP limits read from phpinfo, in bytes (`-1` = no limit). */
export const DIAGNOSTIC_LIMITS = new Set(['memory_limit', 'upload_max_filesize', 'post_max_size'])

/**
 * How the run came by Claude Cowork's code: the typed admin password, a pasted code, a kept one.
 * Read from the result's own `sign_in`, beside `detail`: a run that failed with no diagnostic has it.
 */
export const DIAGNOSTIC_SIGN_INS = new Set(['password', 'code', 'saved'])

/** The paths the importer requests, relative to the site's own base path. */
export const DIAGNOSTIC_PATHS = new Set([
  '/',
  '/index.php',
  '/administrator',
  '/administrator/',
  '/administrator/index.php',
  '/api/index.php',
  '/wp-admin/update.php'
])

export const DIAGNOSTIC_ERRORS = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'EPROTO',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
  'AbortError',
  'TimeoutError',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_REVOKED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_SSL_WRONG_VERSION_NUMBER',
  'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE',
  'ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION',
  'ERR_SSL_UNSUPPORTED_PROTOCOL',
  'untrusted_redirect',
  'too_many_redirects',
  'other'
])

/**
 * @typedef {{ post_status?: number, result_status?: number, cause?: string, error?: string }} ImportRoad
 * @typedef {{
 *   at: string,
 *   check: string,
 *   status?: number,
 *   path?: string,
 *   error?: string,
 *   roads?: Record<string, ImportRoad>,
 *   php_limits?: Record<string, number>,
 *   package_bytes?: number,
 *   username_is_email?: boolean
 * }} ImportDiagnostic
 */

/** @param {unknown} value */
const httpStatus = (value) =>
  Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599 ? Number(value) : undefined

/** @param {unknown} error */
const errorOf = (error) => (typeof error === 'string' && DIAGNOSTIC_ERRORS.has(error) ? error : 'other')

/**
 * One road's answers: statuses, the fixed cause, the error code. Anything else is dropped.
 * @param {unknown} value
 * @returns {ImportRoad | undefined}
 */
function importRoad(value) {
  if (!value || typeof value !== 'object') return undefined
  const { post_status, result_status, cause, error } = /** @type {Record<string, unknown>} */ (value)
  /** @type {ImportRoad} */
  const road = {}
  const post = httpStatus(post_status)
  if (post !== undefined) road.post_status = post
  const result = httpStatus(result_status)
  if (result !== undefined) road.result_status = result
  if (typeof cause === 'string' && DIAGNOSTIC_CAUSES.has(cause)) road.cause = cause
  if (error !== undefined) road.error = errorOf(error)
  return Object.keys(road).length ? road : undefined
}

/**
 * The accepted detail, or `undefined` when there is nothing valid to keep.
 * @param {unknown} value
 * @returns {ImportDiagnostic | undefined}
 */
export function importDiagnostic(value) {
  if (!value || typeof value !== 'object') return undefined
  const { at, check, status, path, error, roads, php_limits, package_bytes, username_is_email } =
    /** @type {Record<string, unknown>} */ (value)
  if (typeof at !== 'string' || !DIAGNOSTIC_STEPS.has(at)) return undefined
  if (typeof check !== 'string' || !DIAGNOSTIC_CHECKS.has(check)) return undefined
  /** @type {ImportDiagnostic} */
  const detail = { at, check }
  const answered = httpStatus(status)
  if (answered !== undefined) detail.status = answered
  if (typeof path === 'string' && DIAGNOSTIC_PATHS.has(path)) detail.path = path
  if (error !== undefined) detail.error = errorOf(error)
  if (roads && typeof roads === 'object') {
    /** @type {Record<string, ImportRoad>} */
    const kept = {}
    for (const name of DIAGNOSTIC_ROADS) {
      const road = importRoad(/** @type {Record<string, unknown>} */ (roads)[name])
      if (road) kept[name] = road
    }
    if (Object.keys(kept).length) detail.roads = kept
  }
  if (php_limits && typeof php_limits === 'object') {
    /** @type {Record<string, number>} */
    const kept = {}
    for (const name of DIAGNOSTIC_LIMITS) {
      const bytes = /** @type {Record<string, unknown>} */ (php_limits)[name]
      if (Number.isSafeInteger(bytes) && Number(bytes) >= -1) kept[name] = Number(bytes)
    }
    if (Object.keys(kept).length) detail.php_limits = kept
  }
  if (Number.isSafeInteger(package_bytes) && Number(package_bytes) > 0)
    detail.package_bytes = Number(package_bytes)
  // Of the username only whether it had an email address's shape: a boolean, or nothing.
  if (typeof username_is_email === 'boolean') detail.username_is_email = username_is_email
  return detail
}

/**
 * A result's `sign_in`, or `undefined` for anything outside `DIAGNOSTIC_SIGN_INS` (an older worker
 * sends none).
 * @param {unknown} value
 * @returns {string | undefined}
 */
export function importSignIn(value) {
  return typeof value === 'string' && DIAGNOSTIC_SIGN_INS.has(value) ? value : undefined
}
