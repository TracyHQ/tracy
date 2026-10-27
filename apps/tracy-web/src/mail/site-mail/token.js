/**
 * The token a site's web container presents with every message: `hex(HMAC-SHA256(HOST_SECRET of
 * the host the site lives on, "site-mail:v1:" + label))`.
 *
 * Nothing stores it. The fleet computes it at provision with the host's own secret
 * (`openssl dgst -sha256 -hmac`), this process recomputes it from `config.hosts`, and rotating a
 * host's secret revokes every site token on that host at once, which is the property wanted.
 *
 * `v1` names the scheme: a later token shape can be accepted beside this one.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const PREFIX = 'site-mail:v1:'

/** @returns {string} lowercase hex, 64 characters. */
export function siteMailToken(hostSecret, label) {
  return createHmac('sha256', hostSecret).update(`${PREFIX}${label}`, 'utf8').digest('hex')
}

/**
 * @returns {boolean} true only for the exact token of `label` under `hostSecret`. A missing secret,
 *   label or token is false, never a throw: the caller answers 401 either way.
 */
export function verifySiteMailToken(hostSecret, label, token) {
  if (typeof hostSecret !== 'string' || hostSecret === '') return false
  if (typeof label !== 'string' || label === '') return false
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/i.test(token)) return false
  const expected = Buffer.from(siteMailToken(hostSecret, label), 'hex')
  return timingSafeEqual(expected, Buffer.from(token.toLowerCase(), 'hex'))
}
