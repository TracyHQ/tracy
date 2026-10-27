/**
 * The right column's `+` menu (Add site / My Sites / Design templates) is painted opaque.
 *
 * dsh draws every shared menu on a translucent material: `MenuSurface` paints its backing layer
 * with `--dsw-menu-surface-fill` (58% opaque in light, 45% in dark) blurred by
 * `--dsw-menu-backdrop-filter`. Over the start screen that let the start cards show through the
 * menu (Akemi, 02/10/2026). Tracy's own menus (the Site changes filter, the composer's role menu)
 * are opaque, so this one is made opaque too.
 *
 * How: the material reads both tokens where it is drawn, so redeclaring them on the launcher's
 * menu repaints only that menu, and dsh's border, radius and elevation stay as they are. The fill
 * is Tracy's `--popover` (the token the Site changes filter paints with), which already resolves
 * to dsh's layer-2 colour in each theme; the fallbacks keep the same value where `tokens.css` has
 * not been injected.
 *
 * Which menu: the launcher's menu is portalled straight into body, carrying nothing that names
 * its trigger. Its trigger does: `ui-sidebar-right` marks it `data-sidebar-right-launcher` and sets
 * `aria-expanded` while its menu is open. Every marker is a data attribute or ARIA, never a hashed
 * class (DESIGN.md section 3).
 */

/** The launcher's open menu: a top-level dsh menu surface while the launcher says it is expanded. */
const LAUNCHER_MENU =
  'body:has([data-sidebar-right-launcher][aria-expanded="true"]) > [data-menu-material][role="menu"]'

/** The rule, exported for the browser test. */
export const LAUNCHER_MENU_CSS = `
${LAUNCHER_MENU} {
  --dsw-menu-surface-fill: var(--popover, var(--dsw-alias-bg-layer-2, #ffffff));
  --dsw-menu-backdrop-filter: none;
}
`

/**
 * Inject the rule once into a document.
 * @param doc - the page's document.
 * @returns a disposer that removes it.
 */
export function installLauncherMenuOpaque(doc: Document): () => void {
  const id = 'tracy-tab-link-launcher-menu'
  // A host without a real DOM (the node test harness hands the plugin a bare stub) has nothing to
  // paint: install nothing rather than throw and take the rest of the plugin's apply() down with it.
  if (typeof doc?.getElementById !== 'function' || typeof doc.createElement !== 'function' || !doc.head) {
    return () => {}
  }
  if (doc.getElementById(id) !== null) return () => {}
  const style = doc.createElement('style')
  style.id = id
  style.textContent = LAUNCHER_MENU_CSS
  doc.head.appendChild(style)
  return () => {
    style.remove()
  }
}
