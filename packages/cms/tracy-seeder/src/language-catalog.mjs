/**
 * Which Joomla language packs Tracy is willing to install, and on what evidence.
 *
 * 🔒 DISCOVERY AND ADMISSION ARE TWO DIFFERENT ACTS. Finding that a pack exists is a lookup against
 * Joomla's accredited-translation feed and can happen any time; deciding Tracy will install it is a
 * reviewed commit to `language-packs.json`. Runtime only ever reads the reviewed file. That is why
 * adding a language is a data change and not an `if` in a handler — and why an agent naming a URL
 * cannot get bytes onto a customer's site.
 *
 * 🔒 THE URL IS A STARTING POINT, THE HASH IS THE IDENTITY. `downloads.joomla.org` answers 303 to a
 * presigned S3 address that expires in sixty seconds, so the final URL cannot be pinned and the
 * redirect legitimately crosses hosts. What is pinned is the first hop's host, the exact bytes and
 * their sha256 — measured 2026-09-12, see `tasks/research-joomla-language-packs.md`.
 *
 * 🔒 THE ARCHIVE IS HANDED TO JOOMLA WHOLE. The three verified packs nest their manifest at three
 * different depths (`fr-FR` at the root, `zh-CN` two levels down, `zh-TW` one level down beside 549
 * `__MACOSX/` entries). Joomla's own `InstallerHelper::unpack` plus `Installer::findManifest()`
 * handle all three; anything here that unpacked and guessed a root would work for French and fail
 * for both Chinese packs.
 */
import catalog from '../../tracy-joomla-quickstart/language-packs.json' with { type: 'json' }
import { SOURCE_LOCALE } from './locales.mjs'

/** The host a pack download must start at. A redirect away from it is fine; a different start is not. */
const DOWNLOAD_HOST = 'downloads.joomla.org'

/**
 * @typedef {{ tag: string, name: string, version: string, url: string, sha256: string, bytes: number,
 *   platformMajors: number[] }} LanguagePack
 */

/** Refuse a malformed catalog before any of it can reach an installer.
 * @param {unknown} value
 * @returns {{ schemaVersion: string, version: string, packs: Record<string, LanguagePack> }}
 */
export function validateLanguageCatalog(value) {
  const data = /** @type {any} */ (value)
  if (data?.schemaVersion !== 'tracy-joomla-language-packs/v1' || typeof data.version !== 'string')
    throw new Error('Unsupported Joomla language-pack catalog')
  if (!data.packs || typeof data.packs !== 'object' || Array.isArray(data.packs))
    throw new Error('The language-pack catalog carries no packs')
  for (const [key, pack] of Object.entries(/** @type {Record<string, any>} */ (data.packs))) {
    const url = (() => {
      try {
        return new URL(pack?.url)
      } catch {
        return null
      }
    })()
    if (
      pack?.tag !== key ||
      !/^[a-z]{2,3}-[A-Z]{2,4}$/.test(key) ||
      typeof pack.name !== 'string' ||
      !pack.name ||
      typeof pack.version !== 'string' ||
      !/^[0-9]+(\.[0-9]+)*$/.test(pack.version) ||
      !url ||
      url.protocol !== 'https:' ||
      url.hostname !== DOWNLOAD_HOST ||
      url.username ||
      url.password ||
      url.hash ||
      !/^[a-f0-9]{64}$/.test(pack.sha256) ||
      !Number.isSafeInteger(pack.bytes) ||
      pack.bytes <= 0 ||
      !Array.isArray(pack.platformMajors) ||
      !pack.platformMajors.length ||
      pack.platformMajors.some((major) => !Number.isSafeInteger(major) || major < 1)
    )
      throw new Error(`Invalid language pack: ${key}`)
  }
  return data
}

/** The reviewed catalog, validated once at import so a bad edit cannot reach a site. */
export const LANGUAGE_CATALOG = validateLanguageCatalog(catalog)

/** Every locale Tracy can add, source language included, in catalog order. */
export function supportedLocales(major) {
  const tags = Object.values(LANGUAGE_CATALOG.packs)
    .filter((pack) => major === undefined || pack.platformMajors.includes(major))
    .map((pack) => pack.tag)
  return [SOURCE_LOCALE, ...tags.filter((tag) => tag !== SOURCE_LOCALE)]
}

/**
 * The pack for one locale, or a refusal that names what IS available.
 *
 * The source language has no pack: `en-GB` ships with Joomla, and asking to install it would be a
 * request to reinstall the CMS's own files. Callers get `null` and must treat that as "already
 * present", not as "unsupported".
 *
 * @param {string} tag Already normalised by `normaliseLocale`.
 * @param {number} [major] The site's Joomla major version, when known.
 * @returns {LanguagePack | null}
 */
export function packFor(tag, major) {
  if (tag === SOURCE_LOCALE) return null
  const pack = LANGUAGE_CATALOG.packs[tag]
  if (!pack)
    throw new Error(
      `No verified Joomla language pack is registered for ${tag}. Verified packs: ${supportedLocales(major)
        .filter((item) => item !== SOURCE_LOCALE)
        .join(', ')}`
    )
  if (major !== undefined && !pack.platformMajors.includes(major))
    throw new Error(`The ${tag} language pack does not cover Joomla ${major}`)
  return pack
}
