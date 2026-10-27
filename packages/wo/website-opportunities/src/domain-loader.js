/**
 * The Website Opportunities domain (`../domain/`), loaded lazily and checked against the contract version this
 * server speaks: discovery, crawler, connectors, media sniffing, brand observation and brief. Tracy reaches it
 * through this package by name (`website-opportunities/src/domain-loader.js`), in a checkout and in its image.
 */
import { fileURLToPath } from 'node:url'

/** Where the domain's modules are (for its data files and per-module imports). */
export const WO_DOMAIN_DIR = fileURLToPath(new URL('../domain/', import.meta.url))

/** The contract version this backend speaks (`CONTRACT.version` of the domain). */
export const WO_CONTRACT_VERSION = 1

/** @type {Promise<any> | null} */
let loading = null

/**
 * The domain's `index.mjs`, checked against the contract version. Rejects with `{code}`:
 * `DOMAIN_UNAVAILABLE` (not importable) or `DOMAIN_INCOMPATIBLE` (another contract version).
 * A failed load is not cached, so a later call tries again.
 * @returns {Promise<any>}
 */
export function websiteOpportunitiesDomain() {
  if (!loading) {
    loading = import('../domain/index.mjs').then(
      (domain) => {
        if (domain?.CONTRACT?.version !== WO_CONTRACT_VERSION) {
          throw Object.assign(new Error('website opportunities domain: contract version mismatch'), {
            code: 'DOMAIN_INCOMPATIBLE',
            found: domain?.CONTRACT?.version ?? null
          })
        }
        return domain
      },
      (error) => {
        throw Object.assign(new Error(`website opportunities domain unavailable: ${error?.message}`), {
          code: 'DOMAIN_UNAVAILABLE'
        })
      }
    )
    loading.catch(() => {
      loading = null
    })
  }
  return loading
}
