/**
 * The wizard's stylesheet, injected once into the dsh page.
 *
 * Since 03/09 the UI is built with `@tracy/ui` components and Tailwind utility classes — the same
 * recipe `@tracy/dsh-settings` and `@tracy/dsh-sidebar` use: `scripts/build-client.mjs`
 * runs Tailwind on `add-site.css` (theme + utilities, NO preflight, scanning this package
 * plus `@tracy/ui/src`) and puts the result here through esbuild's `define`. No preflight means
 * RULE #4 of `CLAUDE.md` still stands: no second reset touches the host's page.
 *
 * Colours go through the tokens of `@tracy/ui/tokens.css` (`bg-card`, `text-muted-foreground`…), and each
 * such token is `var(--dsw-alias-*, <fallback>)` — so the wizard follows dsh's light/dark switch
 * without knowing about it, and no `#hex` sits in a component (DESIGN.md §1.2).
 *
 * The `CSS` below holds only what utilities CANNOT say — and each rule states its reason beside it.
 *
 * 🔒 COMMENTS INSIDE THE TEMPLATE BELOW MUST BE ENGLISH, and not for style. They sit
 * in a template literal, so they are **strings**: esbuild bundles them verbatim into `lib/client.js`
 * and the customer's browser downloads and can read them. `check-language` caught exactly that on 31/08 —
 * the gate does not tell a "CSS comment" from a "string", and it should not. Longer reasons
 * go in JSDoc like this block, i.e. OUTSIDE the template.
 *
 * 🔒 And no backtick inside the template: a stray backtick closes the string, and esbuild
 * goes red on an unrelated line.
 *
 * Layout: the wizard fills the right panel, top aligned, on the same --card surface as the
 * content of My Sites and Inbox. The segmented header and sticky footer use the available width;
 * form content stays left aligned within 720px, while the Design system gallery uses every column.
 * Responsive gutters follow the panel width: 16px below 600px, 24px from 600px, 32px from 900px.
 * Build progress and ready screens use the same surface and readable left-aligned content column.
 */

/**
 * The CSS Tailwind generates at build time, substituted here by esbuild's `define`.
 *
 * Not an import: dsh serves exactly one `lib/client.js` per plugin, so there is no room for a
 * second CSS file. See `scripts/build-client.mjs` §buildStyles.
 */
declare const __TAILWIND_CSS__: string

import {
  ASK_CARDS_CSS,
  ASK_SECTIONS_CSS
} from '../../../tracy-site-build-core/src/client/ask-form/ask-cards-css'
import { BRAND_TILES_CSS } from './brand-tiles-css'
import { DESIGN_SYSTEM_CSS } from './design-system-css'
import { SHEET_CHIPS_CSS } from './sheet-chips-css'
import { IMPORT_UX_CSS } from './import-ux-css'
import {
  CREATE_STEP_CSS,
  WIZARD_CSS,
  WIZARD_ROOT_BASE_CSS,
  WIZARD_ROOT_BUTTON_CSS,
  WIZARD_ROOT_LAYOUT_CSS
} from '@tracy/core/wizard-shell'
import { WIZARD_CUSTOMIZE_CSS } from './wizard-customize-css'
import { WIZARD_REVIEW_CSS } from './wizard-review-css'

/**
 * Tracy's tokens plus the Tailwind classes `@tracy/ui` and the `.tsx` files here use.
 *
 * Empty when nothing filled the constant: an app that imports the questions sheet from source (the /ops Customize
 * question tab of `@tracy/harness-web`, and its node tests) generates these classes with its own Tailwind and must not
 * die on a ReferenceError when this module loads. The plugin build always fills it.
 */
export const TAILWIND = typeof __TAILWIND_CSS__ === 'string' ? __TAILWIND_CSS__ : ''

/**
 * The part utilities cannot say, scoped under `.tas-root`.
 *
 * Why it is still needed: `@tracy/ui` is written assuming Tailwind's preflight, while the dsh page only
 * has its own `base.css` — which resets `font-family` for form controls and nothing else.
 * Gaps no rule in a component can make up for:
 *
 *   - `box-sizing`. The UA leaves `<input>` at content-box, so `h-8` plus padding plus border comes to 42px, and
 *     `w-full` overflows the column. Preflight sets border-box on every element; here it does the same
 *     but only under our own root.
 *   - Form control text colour. The UA gives `<button>` and `<input>` fixed BLACK text, not inherited;
 *     `Button variant="outline"` and `Input` set no text colour because preflight already gave them
 *     `color: inherit`. Without that line, in dark mode the platform chips and typed text both sink —
 *     measured 03/09 on a static render, on the very first build.
 *   - Button cursor. shadcn v4 leaves the default, preflight gives `button` `cursor: default`, while
 *     people here expect a pointer on every pressable button — as in the hand-written CSS before.
 */
const OWN_CSS = `
${WIZARD_ROOT_BASE_CSS}
.tas-root [data-import-preflight] [data-state="warning"], .tas-root [data-import-problem] > [data-severity="warning"], .tas-root [data-preflight-icon="warning"] { color: var(--dsw-alias-state-warn-primary, var(--foreground)); }
.tas-root [data-import-preflight] [data-state="ok"] > svg, .tas-root [data-preflight-icon="ok"] { color: var(--success); }
/* Resolution actions sit inside muted instructional copy; keep the shared button token contrast. */
.tas-root [data-import-problem] button[data-slot="button"] { color: var(--foreground); }
${WIZARD_ROOT_BUTTON_CSS}

${WIZARD_ROOT_LAYOUT_CSS}
[data-add-site-form] {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background-color: var(--card);
}
[data-add-site-form] > .tas-root { flex: none; }
/* While an import page is up the create root stays mounted and hidden. */
[data-add-site-form] > .tas-root[hidden] { display: none; }

/* Standalone Customize and Design system pages retain their own scroller and use the same
   flat surface. Inline pages inherit the stepped wizard's layout from wizard-css.ts. */
.tas-page {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background-color: var(--card);
  outline: none;
}
.tas-page[data-page-preview] { position: relative; height: 100%; z-index: auto; }
.tas-page[data-page-preview] .tas-ib input:disabled { cursor: default; }
.tas-page-col { flex: none; width: 100%; display: flex; flex-direction: column; }
.tas-back {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 12px 12px 0;
  padding: 4px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 18px;
  color: var(--muted-foreground);
}
.tas-back:hover { color: var(--foreground); }
.tas-back:focus-visible { outline: 1px solid var(--ring); outline-offset: 0; }
.tas-page-card { background-color: var(--card); }
.tas-page-head { margin: 0 16px; padding: 16px 0 20px; border-bottom: 1px solid var(--border); }
.tas-page-title { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.25; letter-spacing: -0.01em; }
.tas-page-desc, .tas-page-note { margin: 6px 0 0; font-size: 13px; line-height: 1.45; color: var(--muted-foreground); }
.tas-page [data-ask-layout="sections"] { padding: 24px 16px; }
.tas-page [data-ask-foot] { padding: 14px 16px; }
.tas-page .tas-ds-tools { position: sticky; top: 0; z-index: 3; padding: 16px 16px 8px; background-color: var(--card); }
.tas-page .tas-ds-body { overflow: visible; flex: none; padding: 8px 16px 24px; }
@container (min-width: 600px) {
  .tas-page-head { margin-inline: 24px; }
  .tas-page [data-ask-layout="sections"] { padding-inline: 24px; }
  .tas-page [data-ask-foot] { padding-inline: 24px; }
  .tas-page .tas-ds-tools, .tas-page .tas-ds-body { padding-inline: 24px; }
}
@container (min-width: 900px) {
  .tas-page-head { margin-inline: 32px; }
  .tas-page [data-ask-layout="sections"] { padding-inline: 32px; }
  .tas-page [data-ask-foot] { padding-inline: 32px; }
  .tas-page .tas-ds-tools, .tas-page .tas-ds-body { padding-inline: 32px; }
}

/* Focus is the same crisp 1px terracotta stroke the chosen radio card wears -- no halo. The
   shadcn default adds a 3px ring at 50% on top of the border, which on the dark theme reads as a
   muddy shadow around the field (Akemi, 15/09). The ring is a box-shadow, so this is the one
   property to clear; the border-color swap to --ring stays. */
.tas-root input:focus-visible,
.tas-root textarea:focus-visible,
.tas-root [data-slot="input-group"]:has([data-slot="input-group-control"]:focus-visible) {
  box-shadow: none;
}

/* Chrome paints its autofill preview as an opaque fill on the <input> itself, which inside an
   InputGroup splits one box into two tones. Clipping that fill to the glyphs hides it without
   naming a colour; the text keeps the token colour. Belt to autocomplete="off"'s braces. */
.tas-root input:-webkit-autofill,
.tas-root input:-webkit-autofill:hover,
.tas-root input:-webkit-autofill:focus {
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: var(--foreground);
}

/* Shared option-card geometry, still used by the Design system card and its heading badge.
   Inline question states use the separate wrapping recipe below. */
.tas-qcard-wrap { min-width: 0; }
.tas-qcard {
  position: relative;
  width: 100%;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  grid-template-areas: "badge l1 go" "badge l2 go" "badge l3 go";
  column-gap: 16px;
  row-gap: 2px;
  align-items: center;
  padding: 14px 16px;
}
.tas-qcard-badge { grid-area: badge; width: 48px; height: 48px; border-radius: 12px; flex-shrink: 0; }
.tas-qcard-l1 { grid-area: l1; display: flex; align-items: center; gap: 6px; min-width: 0; white-space: nowrap; overflow: hidden; }
.tas-qcard-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tas-qcard-keep { flex-shrink: 0; }
.tas-qcard-l2 { grid-area: l2; min-width: 0; line-height: 16px; white-space: nowrap; }
.tas-qcard-l3 { grid-area: l3; min-width: 0; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tas-qcard-go { grid-area: go; white-space: nowrap; margin-left: -6px; }
/* Inline question states share wrapping rules so long localized text stays inside the page. */
.tas-questions-loading, .tas-questions-failure { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
.tas-questions-loading > *, .tas-questions-alert > *, .tas-questions-failure > * { min-width: 0; overflow-wrap: anywhere; }
.tas-questions-alert { min-width: 0; }
.tas-questions-alert [data-slot="alert-title"] { display: block; overflow: visible; white-space: normal; -webkit-line-clamp: unset; }
.tas-questions-warning { border-color: color-mix(in srgb, var(--warning) 30%, var(--border)); background: color-mix(in srgb, var(--warning) 5%, var(--card)); }
.tas-questions-warning > svg { color: var(--warning); }

/* The page sits beside .tas-root, not inside it, so it gets the same preflight stand-ins under its own name. Unlike the
   rules above these sit in the base layer, exactly where Tailwind's own preflight lives: an unlayered color: inherit beats
   every utility, which turned a primary button's label black and a ghost button's text invisible in dark (measured on
   the old popup). */
@layer base {
  .tas-page, .tas-page *, .tas-page *::before, .tas-page *::after { box-sizing: border-box; }
  .tas-page button, .tas-page input, .tas-page textarea { font: inherit; color: inherit; }
  .tas-page button:not(:disabled), .tas-page label:has([role="radio"], [role="checkbox"]) { cursor: pointer; }
  /* Tailwind's preflight also clears the browser's own border, background and outline on form controls. Without it the
     language box's bare search field drew a dark inset frame inside its own rounded box. The controls that want a
     border (Input, Textarea) say so with a utility, which sits in a later layer and wins over this. */
  .tas-page input, .tas-page textarea, .tas-page button { border: 0 solid; background-color: transparent; }
  .tas-page input:focus, .tas-page textarea:focus { outline: none; }
  .tas-page textarea { resize: none; }
}

/* Focus is one 1px stroke, never a halo (DESIGN.md section 5), on the page as in the form. */
.tas-page input:focus-visible, .tas-page textarea:focus-visible { box-shadow: none; }

`

/**
 * This plugin's rules, then the questions of the Customize your site page (the shared ask form's cards and sections
 * layouts, `ask-cards-css.ts`), its logo and favicon tiles (`brand-tiles-css.ts`), and its chips and language select
 * (`sheet-chips-css.ts`).
 */
export const CSS = `${OWN_CSS}\n${ASK_CARDS_CSS}\n${ASK_SECTIONS_CSS}\n${BRAND_TILES_CSS}\n${SHEET_CHIPS_CSS}\n${DESIGN_SYSTEM_CSS}\n${IMPORT_UX_CSS}\n${WIZARD_CSS}\n${WIZARD_CUSTOMIZE_CSS}\n${WIZARD_REVIEW_CSS}\n${CREATE_STEP_CSS}`
