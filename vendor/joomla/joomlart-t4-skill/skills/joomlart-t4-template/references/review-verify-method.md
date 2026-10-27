# Verify Method — screenshot + interaction + computed-px, on 4 axes

> **Phases P1–P4 packet — the MANDATORY method used on every unit.** Read before reviewing any chrome
> component or page section. This is the non-negotiable verification standard the `t4-design-review-unit`
> agent and the orchestrator both follow.

**The single most important lesson of this skill:** every defect that ever shipped past a "2-phase verified"
review was INVISIBLE to computed-style probing — it required *looking* at a screenshot or *interacting* with
the element. So computed-px is the LAST step, never the only one.

## Tools
- **Pencil MCP** (`mcp__pencil__*`) — the `.pen` is the exact-px source of truth.
  - `get_editor_state(include_schema:true)` — confirm which `.pen` is active + list frames.
  - **PROVE you're on the right file:** `batch_get(["<knownNodeId>"], resolveVariables:true, filePath:"<abs .pen>")`.
    A "No node with id" error = wrong file. **`get_screenshot` returning an image does NOT prove the path** —
    on a bad path the MCP silently falls back to whatever `.pen` is open (this shipped a whole review compared
    against the wrong site). Always pass the absolute `filePath` AND verify a node resolves first.
  - `batch_get(...resolveVariables:true)` → exact px per node (read the DARK-page instance for dark hexes).
  - `get_screenshot(nodeId)` → the reference image for perceptual diff (use the smallest meaningful node).
- **Playwright MCP** (`mcp__playwright__*`) — drive the LIVE DDEV site: `browser_navigate`, `browser_resize`
  (1440 desktop / 768 tablet / 390 mobile), `browser_take_screenshot` (fullPage or element), `browser_click`,
  `browser_hover`, `browser_evaluate` (computed styles + `getBoundingClientRect` + overflow check).
- **chrome-devtools MCP** — CDP-accurate computed/box-model + true mobile DPR/touch emulation (the stricter
  pixel authority). Gotcha: set a theme attribute in ONE evaluate call, read computed styles in the NEXT
  (same-call read returns stale pre-reflow values). Reset the emulated viewport explicitly between axes.

## Per-component method (run for EVERY component, do not skip any)

**0. Component enumeration FIRST (mandatory — this is how defects get missed).** Before verifying, list every
component on the unit top-to-bottom: logo, each nav item, EACH BUTTON, eyebrow, heading, body, each card,
each icon, badge, input, divider, footer column, … One verify row per component. (A prior agent reported
"all sections PASS" while EVERY button was wrong — buttons were never enumerated.)

**For each component, in this STRICT order — finish all 4 before the next component:**

1. **LIGHT desktop (1440)**
2. **DARK desktop (1440)**
3. **RESPONSIVE light (mobile 390; tablet 768 spot-check)**
4. **RESPONSIVE dark (mobile 390 dark)** ← the axis most often skipped; NEVER skip it.

**Each axis = three checks, in this order:**

- **A. SCREENSHOT (perceptual).** Screenshot the component; compare to the `.pen` frame. Look for: overlays /
  seams / masking bars covering content; logos/images/icons that did NOT flip in dark; color bleed; clipping;
  misalignment; transparent-where-should-be-surface; full-width band CUT on the sides; double/thick dividers;
  a section shorter/taller than the design; a mockup/panel sized wrong. **A green computed probe over a
  visually-broken render is a FAIL.** Also specifically check: a **stray hairline rectangle / doubled shadow**
  around a design-exported `<img>` (its frame+shadow live inside transparent alpha padding — strip template
  border/shadow/radius, P-list `[DESIGN-EXPORT-DARK-VISUALS]`); a **stray glow/gradient** leaking outside a
  card-style CTA (band `::before`, P57); a **blank strip** between a sticky header and a full-bleed masthead
  (P58); a **dark-unreadable `<pre>`** in any article with code (P60); **doubled tick glyphs** in a checklist
  (P61).
- **B. INTERACTION.** Hover/focus/click EVERY interactive element. Confirm: no position JUMP/bounce on hover
  (compare `getBoundingClientRect` at rest vs during hover — must be identical); focus rings actually paint
  (verify with a REAL trusted click — a synthetic `el.focus()` masks the BS shorthand-vs-longhand focus trap);
  forms submit to the right place (a form can silently post to Home); **open EVERY reveal-on-interaction state
  and dark-check it** — off-canvas drill levels (level-1 AND level-2/sub), megamenu flyout panels, accordion
  expanded bodies, tabs, dropdowns, modals (a programmatic `el.click()` on a vendor-JS toggle just navigates —
  use Playwright `browser_click` on the actual toggle/chevron).
  **Mega-menu travel test (desktop):** don't just confirm the panel OPENS — hover the trigger, then move SLOWLY
  down-and-across onto a panel link and click it. T4 JS closes + repositions the panel on the trigger's
  `mouseleave`, so a diagonal travel can lose it mid-way (`[MEGAMENU-HOVER-DEADZONE]`, P56). The panel must stay
  the whole way and the click must land — a CSS/computed probe cannot see this.
- **C. COMPUTED px certification.** Only now read computed styles + box model and certify against the `.pen`:
  color (exact rgb), spacing (padding/margin/gap ±0), border (width/color/radius ±0), typography
  (family incl. **mono**, size, weight, line-height, letter-spacing), icon (correct lucide/FA glyph as inline
  SVG, size, color — never a unicode/icon-font substitute), box size (`getBoundingClientRect`), and
  `document.documentElement.scrollWidth == innerWidth` (no horizontal overflow).

A component is ✅ only when **A + B + C pass on all four axes.**

## Forcing dark for a probe
Set on `<html>`: `data-bs-theme="dark"` + `data-theme="dark"` + class `t4-dark` (cover all hooks the template
uses), then read in the NEXT call. The real toggle persists via cookie/localStorage; a fresh navigation may
load whatever the persisted theme is — set the attributes explicitly per probe, and reset to light when done.

## Pixel tolerance
- Colors: **exact** (rgb == design hex). Borders/radius/padding/gap/size: **±0px** (sub-pixel browser rounding
  like 71.99 vs 72 is fine; >1px is a FAIL). Font size/weight/line-height/letter-spacing: **exact**.

## Verify-the-verifier (orchestrator)
After a subagent returns "PASS", the orchestrator independently re-screenshots + re-probes 1–2 components of
that unit (and opens one reveal state in dark). Agents over-claim; never flip a unit to ✅ on a bare assertion.
Confirm the actual computed value / the actual screenshot — not the agent's word.

## Red flags — you are NOT done
- You verified light and "assumed" dark/mobile match. → Verify each axis live.
- You read computed styles but never took a screenshot or hovered. → Do A + B before C.
- You probed a closed accordion/drawer/dropdown but never opened it in dark. → Open every reveal state.
- You trust the `.pen` path because `get_screenshot` returned an image. → `batch_get` a node first.
- You marked a page ✅ from the subagent's summary alone. → Re-probe it yourself.
- The user found a visible bug after you said "done". → Your sweep wasn't perceptual/interactive enough; widen it.
