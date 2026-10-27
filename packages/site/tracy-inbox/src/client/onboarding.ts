/**
 * The Inbox on the creation workspace (C1, Akemi 04/10/2026). tracy-web sends a signed-in person
 * with no site but an invitation to `/new/?tab=tracy:inbox`: the normal first screen, with the Inbox
 * open beside it, and an accepted invitation lands in the site itself.
 *
 * Pure and dependency-free, so `test/onboarding.test.mjs` pins it in Node.
 */

/** The mount tracy-web serves the creation workspace under (`apps/tracy-web/src/workspace/scope.js`). */
const CREATION_BASE = '/new/'

/** @returns true when the page's `<base href>` is the creation workspace. */
export function inCreationWorkspace(baseURI: string): boolean {
  try {
    return new URL(baseURI).pathname === CREATION_BASE
  } catch {
    return false
  }
}

/** Where an accepted invitation lands from the creation workspace: the site's own workspace. */
export function landingAfterAccept(siteKey: string): string {
  return `/${encodeURIComponent(siteKey)}/`
}
