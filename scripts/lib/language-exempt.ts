/**
 * The files whose strings the language gate (`scripts/check-language.ts`) does not judge, each with the reason it
 * is left out. In its own module so a test can hold every exemption to exactly what its reason covers.
 */
export const isExempt = (rel: string): boolean =>
  /\.test\.(?:ts|tsx|js|mjs)$/.test(rel) ||
  // Dictionaries: Vietnamese HERE is the point, not a leak. Their key sets are enforced by
  // check-dsh-locale, not this gate.
  /^packages\/locale\/[^/]+\/(?:vi|en)\//.test(rel) ||
  rel.startsWith('packages/i18n/src/locales/') ||
  rel.startsWith('packages/i18n/src/translate/') ||
  rel.endsWith('.generated.mjs') ||
  // The bundle of the DICTIONARY package, and ONLY the dictionary package. The Vietnamese build lives
  // there by design: its source is `vi/*.json`, and this very gate is why translations must be data, not code.
  //
  // ⚠ THIS EXEMPTION WAS ONCE WIDER THAN ITS REASON, and the cost was measured on 01/09: it read
  // `packages/*/*/lib/client.js`, i.e. exempted EVERY plugin bundle, so Vietnamese comments in
  // `src/` went straight into the bundle customers download, and no gate knew. Counted **27 lines** in
  // `tracy-add-site`, 2 in `tracy-chat-input`, 1 in `tracy-ui-gallery`. Caught by eye.
  //
  // Fixed at BOTH ends: the build turns on `minify` so comments no longer reach the bundle, and the
  // exemption shrinks to exactly the package with a reason. A gate exempting more than its reason is a gate switched off.
  /^packages\/locale\/[^/]+\/lib\/client\.js$/.test(rel) ||
  // The build chat's HOST bundle, by its exact path and nothing else (#609): the host words the question card in
  // the owner's interface language before the agent hands it on, so the bundle embeds the plugin's own interface
  // translation tables, the same translation data the locale packages above are allowed to hold. The package's
  // source files (`src/`) stay checked, and so does its client bundle (`lib/client.js`): only this one built file is
  // left out (`scripts/test/language-exempt.test.ts` holds it to that).
  rel === 'packages/ui/tracy-build-chat/lib/index.js' ||
  // A Worker's operator tools (`seed-workspace-mcp.mjs`, `send-preview.mjs`): typed by hand by the
  // team, NOT carried up by `wrangler deploy`. On par with `scripts/` at the repo root, and for the
  // same reason: strings there count as comments.
  //
  // 🔒 THE BOUNDARY IS `src/`, NOT THE WORKER NAME. `workers/<name>/src/` answers the customer's
  // browser and must be English; `workers/<name>/scripts/` does not. Widening this exemption to all of
  // `workers/` would drop the most dangerous place the gate was just widened to watch.
  // Measured 2026-08-30: exactly 16 strings land here, all 16 in the two tool files.
  /^workers\/[^/]+\/scripts\//.test(rel) ||
  // The Welcome popup's animated scenes (`apps/tracy-web/src/welcome/route.js`): a static demo copied
  // as it is from the approved prototype, whose words are pictures of the app (a fake `fernway.tracy.ai`,
  // the design system library's own author names), not strings Tracy shows as its own.
  // Exactly that folder; the popup's real copy is `packages/ui/tracy-onboard/src/client/strings.ts`.
  // The flagged letters there are French and Portuguese accents of those names, not Vietnamese.
  rel.startsWith('apps/tracy-web/src/welcome/scenes/')
