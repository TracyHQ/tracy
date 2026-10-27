/**
 * The slot an area may portal a control into, on the row that names the current screen.
 *
 * 🔒 ITS OWN LEAF, not a constant exported from `App.tsx`. Both sides need the name — the shell
 * renders the node, `cms/App.tsx` portals into it — and having the filler import the shell would
 * close a cycle (`App` → lazy `cms/App` → `App`) around the one boundary this surface guards most
 * carefully: `/ops` must not pull the cms module graph into its own chunk.
 */
export const TOPBAR_SLOT_ID = 'ops-topbar-slot'
