/**
 * Where the page goes after a site is deleted from the My Sites list.
 *
 * 🔒 DELETING THE SITE YOU ARE STANDING IN LEAVES A PAGE WITH NOTHING BEHIND IT. The chat on the
 * left still talks to the deleted site's lane: its sessions were forgotten, its folder erased, and
 * the `tracy_site` pointer still names it — measured 25/09 on `tamkem-emdash1.tracy.test`, the
 * panel stayed on an empty conversation of a site that no longer exists. A re-read of the list
 * cannot fix that; only a navigation can.
 *
 * The navigation goes to `/`, not to a site this client picks. tracy-web's root already makes the
 * choice (`workspace/route.js`): a pointer whose site is gone is cleared, then the viewer lands on
 * their first accepted site, or on their invitations, or — holding nothing — in the creation
 * workspace (`/new/`). One place decides where a signed-in person lands; a second copy here would
 * drift from it.
 *
 * Deleting ANOTHER site changes nothing about this page, so the list re-reads in place.
 * @param deleted - the site key that was just deleted.
 * @param current - the site this page is on (`currentSiteKey()`), or null.
 * @returns the address to go to, or null to stay.
 */
export function landingAfterDelete(deleted: string, current: string | null): string | null {
  return current !== null && deleted === current ? '/' : null
}
