/**
 * The version of the Add site preview probe (`apps/tracy-web/scripts/preview-check.mjs`, its page
 * probes and the detectors in `apps/tracy-web/scripts/preview-detectors/`). preview-check.mjs writes
 * it as `probeVersion` on every preview row of a measurement file; `judgePreview` reads a row with a
 * missing or lower value as measured by an older probe, so /ops says "Needs re-measuring" for the
 * preview rules instead of trusting a reading the current probe would no longer give.
 *
 * 🔒 BUMP IT (one integer up) WHENEVER THE PROBE OR A DETECTOR CHANGES WHAT IS MEASURED: a new
 * detector kind, a changed threshold inside a detector, a fix to how the page is built or read.
 * A change that only renames, logs or reformats does not need a bump.
 *
 * History:
 * - 1: the probe after commit 0c12437e63 (14/10/2026, JA Kinetic WordPress header readable in light
 *   mode). Rows without the field were measured before it.
 * - 2: the layout-drift detector (LAYOUT-3: rows, columns and form groups compared with the template's
 *   own page), and the preview without the `<noscript>` notices a visitor with JavaScript never sees
 *   (`withoutNoscriptNotices`, 14/10/2026).
 * - 3: four detectors from the JA Kinetic acceptance (14/10/2026): edge-split (LAYOUT-3), struck-text
 *   (CON-2), heading-split (HIER-2) and loud-band (GROUND-1).
 * - 4: every page the template declares, not the home page alone (Akemi, 15/10/2026): each row names
 *   its `page`, the file lists the declared pages (`previewPages`), and a declared page without a row
 *   leaves its rule unmeasured (apps/tracy-web/scripts/preview-pages.mjs).
 * - 5: collapsed-button reads an input's label as Chrome draws it (from the content box's left to the
 *   padding box's right), so JA Kinetic Joomla's footer Subscribe is no longer "label cut" (15/10/2026).
 * - 6: each detector of a row says how many distinct elements it saw (`unique`), lists up to 300 of
 *   them, and counts the findings the system broke (`bySystem`): the judge counts unique issues, not a
 *   row's 115 findings under the 8 elements it named (15/10/2026).
 * - 7: gradient-stop reads the texts drawn straight on a gradient ground and fails one the system put
 *   under the CON floor (3:1) against an opaque stop the plain page read it on (JA Kinetic Joomla's tags
 *   masthead under Moxie's dark side, 15/10/2026); a band with no system stop is judged against the page.
 * - 8: the role-variable batch's detector fixes (16/10/2026): accent-surface, button-dark, button-size and
 *   heading-quiet read the slot's own status colours and the template's design, not the wear's (08d39b0dde);
 *   layout-drift and the colour reader (4e0f53828e); template-fonts-left skips lettering inside an SVG and
 *   unstyled-input counts a box-shadow ring as the box's line (adb63ae0af); hover-unreadable reads a nested
 *   hover (10a65ad532); cdp.mjs loads and decodes every lazy picture after the walk (ec1f0e872d).
 * - 9: the batch 2 detector fixes (16/10/2026), each a false finding of the 31 JA templates measured at v8 and
 *   checked by eye: words on a picture that is not their ancestor and headings on a background picture have no
 *   ground (preview probe, heading-quiet); a footer logo is the footer's by its place (logo-doubled); a
 *   disclosure row is no button (button-role); hidden words are no text block (template-fonts-left); an SVG
 *   picture (role=img) and the part of a shape outside its SVG are not shapes (shape-fill); a cut label is read
 *   from the words' own box (collapsed-button); a 1×1 visually hidden box is not seen (every probe's `seen`);
 *   an avatar beside the words keeps a line of words (layout-drift).
 *   🔒 FROZEN FOR THE ROLE-VARIABLE BATCH 2 (Akemi, 16/10/2026): the template fixes of this batch are measured
 *   and accepted at v9. A detector change during the batch goes into the next batch's bump, not into v9, so a
 *   fix never forces re-measuring every template already measured.
 *   One exception kept at v9 (manager's call, 16/10/2026): empty-block also reads the words a box writes as its
 *   own text node (JA Sensei 1.0.5's call-to-action banner). It can only take a false finding away, never add
 *   one, so no file measured at v9 reads worse than the probe would now measure it.
 *   A second one, same reasoning (manager's call, 16/10/2026): logo-invisible treats a picture met under the
 *   logo's centre before any opaque layer as its ground (a header overlapping the next section's photograph,
 *   JA Vega 1.0.7), so that logo is a logo over a picture and is not judged. It can only take a finding away.
 *   A third one (manager's call, 16/10/2026): the preview probe's text ground is the opaque layer really
 *   painted under the words when it is not their ancestor (elementsFromPoint, layerUnder): JA Sensei's header
 *   lies on the hero's band by position. Unlike the two above it can ADD a finding (white words over a light
 *   sibling band, which the ancestors' dark page hid); the committed v9 files judge as before, but a re-measure
 *   of an open template could read worse.
 *   A fourth one (manager's call, 16/10/2026): shrunk-block reads a link or button inside a heading (H1-H6,
 *   .h1-.h6) as the heading's words unless it draws a box of its own (fill, picture, border): JA Tour 1.0.4's
 *   hero headline lost lines under Moxie's smaller display size and was a LAYOUT-2 finding. It can only
 *   take a finding away.
 *   A fifth one (manager's call, 16/10/2026): a glare block whose whole box a picture inside it covers is not
 *   glare (its box inside the picture's, or a picture on top at its corners and centre): JA Essence 1.0.9's
 *   carousel cards keep a cream ground under photos laid edge to edge. It can only take a finding away.
 *   A sixth one (manager's call, 17/10/2026): collapsed-button counts as a hidden label's icon a pseudo-element
 *   with content of the button's parent whose box lies over the button's centre: JA Phio 1.0.7's newsletter
 *   Subscribe (font size 0) shows the paper plane its cell td.acysubbuttons draws in ::after over it, and was a
 *   CLIP-1 finding. It can only take a finding away.
 * - 10 (current from the batch 2 final gate, 18/10/2026; Akemi's eye check of 17/10/2026): seven detectors for what she saw at a glance on
 *   JA Tour, Vital and Sensei that v9 passed: empty-box (an empty container the system outlined), missing-element
 *   (a passkey button gone), caret-shape (dropdown carets flattened into dashes), icon-font (an icon set in the text
 *   font, tofu), icon-contrast (input addon glyphs dark on dark), photo-text (a card label on a photograph turned
 *   dim) and band-geom (a band's height changed by half). A second round from her review of JA Resume, Vital,
 *   Voyara and Impact (17/10/2026): missing-element also reads marks painted into their ground (Resume's timeline
 *   dots), icon-offcentre (the back-to-top chevron pushed off its square), button-crowding (VIEW MORE touching
 *   the cards below it), template-cut-label (Subscribe cut to "Subs" on the template's own page) and row-shape
 *   (the header Donate now rounded in a row of square cells). Each carries `since: 10` and stays dormant (index.mjs)
 *   while this constant is 9, so no v9 file reads differently; PREVIEW_PROBE_NEXT=1 runs them for a scratch measure.
 *   An eighth, a rule of its own (Akemi, 17/10/2026): accent-leak (ACCENT-LEAK), the template's brand hue left on
 *   screen under a system (JA Phio's red pictures, JA Tour's orange icons, JA Impact's green and orange, JA Vega's
 *   blue call-to-action band and hero glow). Its kind carries `since: 10` in PREVIEW_KINDS too, so until the flip
 *   neither the rule nor a "not measured" for it shows on /ops (measurement.mjs activeKinds, readiness activeRules).
 *   Flip this constant to 10 at the batch's final gate and re-measure every template.
 *   Also at 10, a rule of its own (Akemi, 17/10/2026: JA Essence's carousel cut, JA Vital's and Podcast's icons as
 *   empty squares in the Design system popup but not after Try on): PREVIEW-PARITY, the popup's page against the
 *   same page after Try on (apps/tracy-web/scripts/preview-parity.mjs, src/preview-parity.mjs `PARITY_SINCE`),
 *   written as the file's `previewParity` block by lane.mjs's last step. Off BUILT_SITE_RULES and /ops while this
 *   constant is 9.
 *   Also at 10, the frame every detector reads (18/10/2026): preview-check.mjs opens the template's page and the
 *   worn one LIVE, as both popups frame them since 0bcabb641f / 87242c0d96 and as Try on shows them (the page's
 *   own address, its scripts running, the slot laid in as the site proxy lays it; apps/tracy-web/scripts/
 *   preview-check/live-frame.mjs LIVE_FRAME_SINCE), settled the same way every take. Before 10 the static frame
 *   (no script) stays: JA Resume's variant homes read a menu colour their T3 script fixes, carousels unbuilt.
 *   Also at 10, with the live frame (18/10/2026): a third-party widget (Google Maps, Google Charts, other map and
 *   chart libraries, provider embeds, a frame of another origin) is left out of every detector and of the preview
 *   probe's blocks, texts and buttons, by structure (design-system-preview-probe.js WIDGET_ROOTS / widgetsInPage,
 *   apps/tracy-web/scripts/preview-detectors/lib/widgets.mjs): JA Resume's chart palette read as accent-leak and
 *   shape-fill, JA Seven's Maps error box as glare and template-fonts-left. embed-error still reads every embed.
 *   Also at 10 (18/10/2026): a stand is read at a host name (localhost, preview-check/host-named.mjs), never a
 *   bare loopback IP no customer site has, and embed-error leaves out a provider frame the live frame read playing
 *   (preview-check/embed-frames.mjs): JA Spa 1.0.7's /our-spa YouTube video, which YouTube refuses only inside a
 *   page served from an IP, failed PREV-1 though it plays on every customer site. A frame showing its error stays.
 *   Flipped at the batch 2 final gate (18/10/2026): every dormant `since: 10` detector, ACCENT-LEAK,
 *   PREVIEW-PARITY, the live frame and the widget skip are current; every template is re-measured at 10.
 *   Kept at 10 (manager's call, 18/10/2026), four false findings of the dot-1 measures of JA Kinetic Joomla 1.0.8
 *   and Tracy Business Joomla 1.2.5, each a change that can only take a finding away: missing-element leaves out an
 *   element scrolled out of sight inside a scroller (Kinetic's blog topic chip, LAYOUT-3); the parity probe reads
 *   the page without Joomla's flash messages (#system-message-container, PREVIEW-PARITY); button-size does not call
 *   a button stretched that keeps the template's height and matches the field beside it (Business's search bar,
 *   CLIP-1); accent-leak leaves out an opaque <img> where the brand hue is under a third of it (Business's
 *   styleguide portrait, ACCENT-LEAK).
 *   Kept at 10 (manager's call, 18/10/2026), three more false findings of the dot-1 measures (Tracy Business Joomla
 *   1.2.5, Tracy Base EmDash 0.5.6), each a change that can only take a finding away: button-size finds the field
 *   beside a button inside a sibling wrapper too (Joomla Smart Search's div.awesomplete, CLIP-1); button-role judges
 *   a segmented control's cell by its shared frame (Base EmDash's Appearance Light | Dark, BTN-1); empty-box leaves
 *   out a colour swatch, a box painting the custom property its caption names (Base EmDash's colour roles, EMPTY-1).
 *   Kept at 10 (manager's call, dot 3, 19/10/2026): button-size leaves out a text link the template classes as a
 *   button whose words wrap in their column, and missing-element a slide past the edge of a carousel's clipped
 *   track (JA Symphony Joomla), both only taking findings away; and one detector added at 10 (Akemi's eye check of
 *   JA Symphony 1.0.4: the hero title ran past the window under Figma, every rule green): heading-edge (LAYOUT-1),
 *   a heading whose words reach the window's edge. It can ADD a finding: committed files judge as before (their
 *   stored findings), a re-measure of a template with an oversized worn heading reads worse.
 *   Kept at 10 (manager's call, 20/10/2026), a false finding of JA Restaurant 1.0.6's measure, a change that can only
 *   take a finding away: embed-error leaves out a Google Maps frame the live frame read showing its map (a loaded
 *   tile picture on screen inside `.gm-style`, never a canvas, no `.gm-err-container`), as it leaves out a YouTube
 *   frame that plays (preview-check/embed-frames.mjs); its contact page's map drew its tiles and still failed PREV-1.
 *   The page's Maps iframes are left out only when as many Maps frames answered with a drawn map as the page holds; a
 *   map still loading, Google's error box, a frame that did not answer, or one the probe cannot tell apart stays a
 *   finding.
 *   Kept at 10 (20/10/2026, JA Restaurant code review; no release judged green may turn red):
 *   hover-same (HOVER-2, worth-fixing), a hover or focus state that looks exactly like rest under a system
 *   while the template changes it. It judges hover-unreadable's readings (`dataOf`), which now also carry
 *   each state's other cues (underline, border, shadow, ring, lift, opacity; HOVER-1 reads as before). It
 *   can ADD a finding, so its kind carries `addedWithin: 10` (measurement.mjs): a file measured before it
 *   has no row for the kind and HOVER-2 reads "not measured yet" outside the step's numbers; a re-measure
 *   judges it. At the next bump the leniency ends and a file without the kind is unmeasured.
 *   Kept at 10 (manager's call, 22/10/2026), a LAYOUT-3 reading that came and went on JA Vogue Joomla 1.0.8 (its
 *   back-to-top arrow, shown only once the page is scrolled, caught shown on the template's page and hidden worn on
 *   one take): missing-element compares an element whose visibility follows the scroll position at the same scroll
 *   state on both pages (its `read` step scrolls the page down and back). It can ADD a finding as well as take one
 *   away: a bump would mark the 87 committed measurements at 10 "Needs re-measuring", and a stale row clears on
 *   its next measure.
 */
export const PREVIEW_PROBE_VERSION = 10
