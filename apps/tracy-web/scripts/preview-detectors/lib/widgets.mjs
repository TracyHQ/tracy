/**
 * Third-party widgets left out of every detector from probe 10 (18/10/2026): `WIDGETS_IN_PAGE` defines
 * `inWidget(e)` in a page (`widgetsInPage` of design-system-preview-probe.js, where the structure is named).
 * PAGE_HELPERS carries it, so every detector that asks `seen()` skips a widget; the few probes that walk the
 * page without `seen()` ask `inWidget()` themselves. Off before probe 10 (or without PREVIEW_PROBE_NEXT=1),
 * so no v9 file reads differently. embed-error still reads every embed: it judges the embed itself.
 */
import { PREVIEW_PROBE_VERSION } from '../../../../../packages/design/tracy-ds-slot/src/preview-probe-version.mjs'
import { widgetsInPage } from '../../../src/sites/design-system-preview-probe.js'

/** The probe version widgets are left out from. */
export const WIDGETS_SINCE = 10

/** Whether this run leaves widgets out: the probe reached WIDGETS_SINCE, or a scratch measure of the next. */
export const WIDGETS_ON = PREVIEW_PROBE_VERSION >= WIDGETS_SINCE || process.env.PREVIEW_PROBE_NEXT === '1'

export const WIDGETS_IN_PAGE = widgetsInPage(WIDGETS_ON)
