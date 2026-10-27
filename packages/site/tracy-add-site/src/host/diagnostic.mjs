/**
 * Where a Joomla import stopped, for the operator (`ops_signal`, the stuck alert) — built only from
 * closed sets.
 *
 * 🔒 A shape check is not a secret check: `/administrator/secret123` is a well-formed path and
 * `hunter2` a well-formed error code. So every value is one of a fixed list or is not sent: `path`
 * one of the Joomla paths the importer itself requests, `error` one of the network and TLS codes
 * Node throws (anything else is `other`), `at` and `check` the names this code writes.
 *
 * 🔒 The same lists live in `apps/tracy-web/src/lib/import-diagnostic.js`, which accepts the
 * signal. Change both together; a value only one side knows is dropped, never passed through.
 *
 * Plain JavaScript, like `doors.mjs`, so `node --test` pins it without a TypeScript loader.
 */

import { failureCode } from './error-code.mjs'

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
 * How the run came by Claude Cowork's code, in the result's own `sign_in` (beside `detail`, so a run
 * that fails with no diagnostic still carries it): the admin username and password typed in the
 * wizard, the code pasted from the site, or the code kept from an earlier run of the site.
 */
export const DIAGNOSTIC_SIGN_INS = new Set(['password', 'code', 'saved'])

/**
 * Whether a typed username has the shape of an email address, for `username_is_email` on a refused
 * sign-in (Joomla's backend signs in with the username only). Only this boolean is kept, never the
 * value.
 * @param {string | undefined} username
 * @returns {boolean}
 */
export function usernameIsEmail(username) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((username ?? '').trim())
}

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
 * The path of `url` as one of `DIAGNOSTIC_PATHS`, after the site's base path (`/office` for a site
 * under a subfolder) is stripped — or `undefined`. A renamed administrator folder, a gate's own
 * page or anything else the site redirected to is dropped: its name can be the secret.
 * @param {string} url
 * @param {string} [base] The site's web root URL or its pathname.
 * @returns {string | undefined}
 */
export function diagnosticPath(url, base = '') {
  let pathname
  try {
    pathname = new URL(url).pathname
  } catch {
    return undefined
  }
  let prefix = base
  try {
    prefix = new URL(base).pathname
  } catch {}
  prefix = prefix.replace(/\/+$/, '')
  if (prefix && pathname.startsWith(`${prefix}/`)) pathname = pathname.slice(prefix.length)
  return DIAGNOSTIC_PATHS.has(pathname) ? pathname : undefined
}

/**
 * A thrown error as one of `DIAGNOSTIC_ERRORS`, looked up the cause chain and inside an
 * `AggregateError` (`error-code.mjs`); `other` for anything
 * else. Never its message.
 * @param {unknown} error
 * @returns {string}
 */
export function diagnosticError(error) {
  const code = failureCode(error, (candidate) => DIAGNOSTIC_ERRORS.has(candidate))
  if (code) return code
  const message = error instanceof Error ? error.message : ''
  if (message === 'untrusted redirect target') return 'untrusted_redirect'
  if (message === 'too many redirects') return 'too_many_redirects'
  const name = error instanceof Error ? error.name : ''
  return DIAGNOSTIC_ERRORS.has(name) ? name : 'other'
}
