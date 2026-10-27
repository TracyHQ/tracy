/**
 * The `.tas-root` rules every stepped wizard stands on: the scoped stand-in for preflight, and the
 * flat card surface with its container-query gutters. Moved here from `@tracy/dsh-add-site`
 * (`styles.ts` OWN_CSS) so the site's Publish tab draws with the same root; Add site still writes
 * these parts at the same places of its own sheet, so its CSS is unchanged byte for byte.
 */

/** Box sizing and form-control text: the stand-in for the preflight rules `@tracy/ui` relies on. */
export const WIZARD_ROOT_BASE_CSS = `/* Scoped stand-in for the three preflight rules @tracy/ui relies on. dsh's base.css is not a
   reset: it only re-applies font-family to form controls. Under this root only, never global. */
.tas-root, .tas-root *, .tas-root *::before, .tas-root *::after { box-sizing: border-box; }
/* UA pins form-control text to black; the outline Button and Input expect to inherit it. */
.tas-root button, .tas-root input { font: inherit; color: inherit; }`

/** The primary button keeps its own text colour, and every live control shows the hand. */
export const WIZARD_ROOT_BUTTON_CSS = `.tas-root button[data-slot="button"].text-primary-foreground { color: var(--primary-foreground); }
.tas-root button:not(:disabled), .tas-root label:has([role="radio"], [role="checkbox"]) { cursor: pointer; }`

/** The flat card surface, the size container, and the gutters it gives its children. */
export const WIZARD_ROOT_LAYOUT_CSS = `/* Every stage uses the panel's normal --card surface, matching the inner content of
   tracy-my-sites and tracy-inbox. There is no raised card, tinted ground or centring spacer.
   The root is the size container, so its children follow panel width even on standalone build
   and ready screens. Form content is readable at 720px; wizard chrome and gallery are wider. */
.tas-root {
  container-type: inline-size;
  min-width: 0;
  width: 100%;
  padding: 24px 0;
  background-color: var(--card);
}
.tas-root > * { width: calc(100% - 32px); max-width: 720px; margin-inline: 16px; }
@container (min-width: 600px) {
  .tas-root > * { width: calc(100% - 48px); margin-inline: 24px; }
}
@container (min-width: 900px) {
  .tas-root > * { width: calc(100% - 64px); margin-inline: 32px; }
}`

/** The three parts in their order, for a sheet that has nothing to put between them. */
export const WIZARD_ROOT_CSS = `${WIZARD_ROOT_BASE_CSS}\n${WIZARD_ROOT_BUTTON_CSS}\n\n${WIZARD_ROOT_LAYOUT_CSS}`
