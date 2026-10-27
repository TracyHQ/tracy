import { siteKeyHere } from '@tracy/core/site-key'

/**
 * The site this page is on, by the one rule in `@tracy/core/site-key`: the address first, the
 * pointer cookie the Worker plants second, and NO site on the creation workspace (`/new/`), where
 * that cookie only names the last site visited (bug 01/10/2026).
 */
export function currentSiteKey(): string | null {
  return siteKeyHere()
}
