# Import into TCH

**Pin: `main` @ `tracy-emdash-template@efec437` — 27/10/2026** (merges of [JoomlArt-Products/tracy-emdash-template#24](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/24) and [#25](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/25)). That PR first brought the home repo to this tree as it stood in TCH — every in-place fix recorded below (including the MIT licence grant, #21 and #23, both closed as superseded) — then translated every Vietnamese prose line of the kit into English; `README.en.md` became `README.md`. #25 marks the deliberate Vietnamese data with `language-allow` for TCH's language gate. This tree is byte-identical to `efec437` except this file; the in-place fixes below are now all at home. Vietnamese left in the kit is data on purpose (test inputs, the `vi` form words and questionnaire entries, regexes and quoted customer text in `tools/personalize.mjs`). `ingest/detect-source.mjs` and `ingest/from-url.mjs` now print English, so the copies in `packages/cms/tracy-emdash-theme-{business,saas}` (+ their `from-url`/`qa-notes` tests) were updated in the same commit (gate `emdash-kit-sync`).

**Previous pin: `main` @ `tracy-emdash-template@52e356c` — 29/09/2026.** #13 (stamps + content API in every template) and #14 (EmDash 1.0.1, with #1, #2, #11, #12 folded in) merged to the kit's `main`; this tree is byte-identical to that commit. The paragraphs below record how it got here.

**Placeholder machine path in `scripts/tools/restore.sh` — 26/10/2026, edited in TCH on branch `os/w3-vendor-clean`, same change open at home: [JoomlArt-Products/tracy-emdash-template#23](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/23).** A personal home path in a comment example became `/Users/you` for the public export; the three copies in `packages/cms/tracy-emdash-theme-*/tools/` match (gate `emdash-kit-sync`).

**`admin-roundtrip.mjs` leaves no edit mark behind when a run fails after the save — 22/10/2026, fixed in TCH on branch `feat/wp-contact-mail-tool-fixes`, PR to the home repo NOT yet opened.** `scripts/tools/admin-roundtrip.mjs` inserts a stamp, saves + publishes, then restores inside `try`; `finally` only closed the browser, so a failure after the save (reopening the editor, the second publish) left the stamp on the entry (draft or published). Now each run's stamp is unique (`newStamp`: time + random id); the script records `run.stampSaved` right before the save that carries the stamp, and `run.restored` only once the restore is proven (`restoreVerified`: publish done, neither the field nor the public page still has the stamp); both the restore and the cleanup remove only that stamp from the current value (`withoutStamp`), never discard the draft and never write back the value read at the start, so content someone saved during the run is kept. In `finally`, before closing the browser, when `stampCleanup(run) === 'remove'` it reopens the entry, removes the stamp, then records a step `cleanup: stamp removed after the aborted round trip` (pass/fail with whether the field and the public page still carry the stamp, or the error). The decision lives in the new file `scripts/tools/roundtrip-cleanup.mjs` so it can be tested without a browser: `scripts/tests/admin-roundtrip-cleanup.test.mjs`. The three templates `packages/cms/tracy-emdash-theme-{base,business,saas}` take the same patch (`tools/`, `tests/`); `check-emdash-kit-sync` 3/3 match.

**A blank Name still writes copy from the About text and still translates; the demo's file-download button never leads to an unticked Contact page (#1013, B3 + B4) — 13/10/2026, fixed in TCH on branch `fix/site-questions-with-design-system` (#1297), included in the PR to the home repo [JoomlArt-Products/tracy-emdash-template#22](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/22) (draft, not merged; home `main` @ `de97622` was byte-identical to the vendored copy before this change).** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs` (the tracy-web image carries ONE copy for all three, `apps/tracy-web/test/emdash-tool.test.mjs`; Base goes to 0.5.3, Business 1.7.17, SaaS 1.4.13). (1) Tracy sends no name when the customer leaves Name blank (the template keeps its own name), but the tool waited for a name before running the model: the About text was never written and a Vietnamese site kept English copy. The `modelMay` gate no longer requires a name: copy needs the About text, a translation needs a root in another language; the identity rule that states the business name is still absent; the image prompt says `a business` when there is no name. (2) `planFrom` receives `closed` (the addresses of the pages the customer unticked, `unpickedPageRules`): when no Contact page remains open, the demo's file-download button goes entirely, both label and link, instead of pointing at the demo's brochure. Measured on the local stand: a Vietnamese bakery that ticked only Home, with "Liên hệ tiệm bánh" in the hero opening a 404 /contact. Tests: `personalize-tone.test.mjs` adds the case "a description with no name is written…", `personalize-fallback-gate.test.mjs` changes its `modelMay` expectation, `personalize-demo-files-seed.test.mjs` (Business) adds the unticked-Contact case. Outstanding: merge #22 (the kit owner decides).

**Another company's job listings never stay; a re-ask states the reason; the `rewrite` rule takes `"unwritten": "empty"` (#1013, L4) — 11/10/2026, fixed in TCH on branch `chore/tcqr-final-cleanup`, included in the PR to the home repo [JoomlArt-Products/tracy-emdash-template#20](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/20) (commit `f55cafc`, draft, not merged).** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`. (1) `rewriteEntries`: an answer whose deciding field (`decides`, the title) matches the words of any sample item in the collection, in any language edition the seed has (`demoWordsOf`, newly exported), is rejected as a repeat, together with every other field of that answer; each rejected item returns a reason (missing key, repeats sample words, is the sample company's words), and the next ask carries that reason to the model in a `rejected` slot (never a slug or sample words). (2) The `rewrite` rule takes `"unwritten": "empty"`: an item the model still has not written for this business after every ask has the fields the rule names emptied (origin `removed`, as `facts` empties another company's claims), neither invented nor kept as the template's words; the report records it under `rewritten.emptied`, not under `rewritten.skipped` like kept template words. Without the flag, decision A (11/10) holds: the item keeps the template's words and the report names it. Tracy Business turns the flag on for `vacancies`. Measured on dev g65 (Business 1.7.13, FULL, Vietnamese, bakery): /careers still had the sample construction company's jobs ("Kỹ sư dự toán", "luân phiên 15/15"). Tests: new `scripts/tests/personalize-rewrite-trade.test.mjs` (the model deliberately returns another job of the sample company, a wrong key, or something unusable, on every ask). Outstanding: merge #20 (the kit owner decides).

**A capitalised address is not a proper name; one page, one name; the `rewrite` rule takes `keep` (#1013, final round) — 12/10/2026, fixed in TCH on branch `fix/tcqr-final`, included in the PR to the home repo [JoomlArt-Products/tracy-emdash-template#20](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/20) (commit `6b9ccf1`, draft, not merged).** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`. (1) `wordsLeft` (now exported): in a line that is not a single proper name, a capitalised common address noun ("Industrial Park", "District", "Region": the `ADDRESS_NOUNS` list) left intact in the answer counts as untranslated; a name before an abbreviation ("Derbenevskaya emb.") is not counted as English; words from the customer's own answers never count; a re-ask never replaces a better answer with a worse one. (2) `labelDestinations` + `oneLabelPerDestination`: a label leading to a page that already has a name (the first label to that URL, main menu first) and sharing a word with that label takes exactly that name, in the menu, the footer and chrome links. (3) A `rewrite` rule with `"keep": true` is never given to the model; a root written in another language still takes that language edition of the template (or a translation) and the report does not record it as a model miss. Measured on dev `g64-biz-emd-full` (1.7.12). Tests: `scripts/tests/personalize-labels-echoed.test.mjs` adds three cases, new `scripts/tests/personalize-labels-destination.test.mjs`. Outstanding: merge #20 (the kit owner decides).

**A label the model half-translates is re-asked like a label returned verbatim (#1013, g64) — 12/10/2026, fixed in TCH on branch `fix/tcqr-g64`, PR to the home repo NOT yet opened.** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`: in `translateLabels`, a short line (two to sixteen words) whose answer still keeps lowercase words of the source language ("emb.", "yard", or a leading "Fabrication" when the following word is lowercase) counts as untranslated (`wordsLeft`), is re-asked in the same batch and then one by one like a line returned verbatim, and otherwise is recorded in the report. Measured on dev `g63-biz-emd-full` (1.7.11): /contact printed "7/22 Derbenevskaya emb., tầng 8" and "Khu xưởng Fabrication, Zavolzhye IP". Test `scripts/tests/personalize-labels-echoed.test.mjs` adds two cases (the model returns a half translation once, and forever); `personalize-labels.test.mjs` has the mock model fully translate multi-word labels. Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**A label the model returns as the template's exact words is re-asked, not silently dropped (#1013, g63) — 11/10/2026, fixed in TCH on branch `fix/tcqr-g63`, PR to the home repo NOT yet opened.** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`: `translateLabels` re-asks the labels the model skipped or returned verbatim (two words or more), first together in one batch, then one by one; any still unchanged are recorded in the report (`skipped`, `labels (<locale>)` / `words (<locale>)`, function `keptLabelsWhy`). Measured on dev `g62-biz-emd-full`: the two branch lines "Lipetsk SEZ, …" and "Fabrication yard, Zavolzhye IP" printed in English on a Vietnamese site, while g61 had translated them. New test `scripts/tests/personalize-labels-echoed.test.mjs` (the model deliberately returns text verbatim and skips a key). Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**The BLANK set keeps the demo's file-download button, the FULL set drops the demo's social-network description line, every font has the Vietnamese subset (#1013, g62) — 11/10/2026, fixed in TCH on branch `fix/tcqr-g62`, included in the PR to the home repo [JoomlArt-Products/tracy-emdash-template#20](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/20) (commit `42059c7`, draft, not merged).** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`: (1) step 4 of `planFrom` (a button leading to the demo company's file moves to the Contact page, DEMO FILE LINKS) runs only when the customer wrote an About text (`claims`); the BLANK set keeps the button as in the demo and only renames it (measured on dev `g61-biz-emd-blank`: the "Download company profile (PDF)" button became "Talk to our sales team" → /contact); (2) when the customer gives no social networks the demo's buttons are still kept (K6), and in the FULL set any field the `item` rule sets to `""` (Business: `text`) also becomes empty on the kept buttons, because it is the line saying what the demo company posts (measured on `g61-biz-emd-full`: "Tiến độ công trường và thông báo đấu thầu" on a bakery's contact page); the BLANK set and the language editions only receive the name, keeping the words. New kit file `scripts/src/lib/font-subsets.mjs` (same bytes in the three templates): `withLanguageSubsets` adds the `vietnamese` subset to every font in `src/fonts.json`, and the template's `astro.config.mjs` calls it (Archivo, Newsreader, Space Grotesk, IBM Plex Sans, JetBrains Mono all have this subset on Google Fonts; when one is missing, Astro skips it and the `font-glyphs` audit names it). `scripts/tests/personalize-{apply,fallback-gate}.test.mjs` updated for the two new rules. New tests in Business: `tests/personalize-demo-files-seed.test.mjs` (BLANK case), `tests/personalize-facts.test.mjs` (social-network description line), `tests/font-subsets.test.mjs` (all three templates); the kit does not have them yet. Outstanding: merge #20, and the kit's sample `astro.config.mjs` (if any) calling `withLanguageSubsets`.

**The Forms plugin's own words speak the page's language (#1013, g61) — 11/10/2026, fixed in TCH on branch `fix/tcqr-g61`, PR to the home repo NOT yet opened.** Three new kit files, byte-identical to the three templates `packages/cms/tracy-emdash-theme-{business,saas,base}`: `scripts/src/lib/form-embed-words.ts` (the plugin's "Leave blank" / "Previous" / "Next" words for 42 language tags; `formWordsFor` looks up the exact tag, then the language, then English; `localizeFormEmbed` replaces the three fallback words and keeps words the form sets itself), `scripts/src/components/site/FormWords.astro` (wraps `FormEmbed`, takes `tag` as the page language) and `scripts/tests/form-embed-words.test.mjs` (every place that renders `<FormEmbed` must go through `<FormWords tag=…>`). A new template that uses the forms plugin wraps it the same way. Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**A missing `media-map.json` is reported, not silent (#1013, g61) — 11/10/2026, fixed in TCH on branch `fix/tcqr-g61`, PR to the home repo NOT yet opened.** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`: when the seed folder has no `media-map.json` (the only file saying which links the importer filled with the demo company's documents), the report's `skipped` has a `demo-files` line. Measured on dev `g60-biz-emd-full`: Apply runs the tool from the tracy-web image, the image did not carry `media-map.json`, so the "Tải hồ sơ công ty (PDF)" button still opened the demo company's PDF and the report said nothing; the image now carries that file (`apps/tracy-web/Dockerfile`, test `apps/tracy-web/test/emdash-tool.test.mjs`). New test with Business's real seed: `tests/personalize-demo-files-seed.test.mjs` (the kit does not have it yet). Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**One gate for every model call, the fallback always in the site's language, button labels know where the button leads, social buttons kept (#1013, g60) — 10/10/2026, fixed in TCH on branch `fix/tcqr-g60`, PR opened to the home repo: [JoomlArt-Products/tracy-emdash-template#20](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/20) (branch `sync/tch-g60`, commit `d1334cb` on `main` @ `52e356c`, draft, not merged — the kit owner decides). This PR brings the whole kit tree to the exact bytes of the vendored copy here (except this file), so it also includes every change still sitting in #15–#19 and every "PR to the home repo NOT yet opened" paragraph below.** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`: (1) every model call for copy goes through `askModel` by step and locale, and `modelMay` decides: writing steps (copy, entry, body, blocks, term, form, image) need an About sentence, translation steps run only for a root written in another language; with a blank About the form keeps the demo words (previously the form was rewritten for a bakery), and a root written in another language takes its words from that language edition of the template, otherwise translates (`demoWordsWork`); (2) when the model returns a body with sections missing, it is re-asked once stating the number of sections (`rewriteBody`); if still wrong, the template's language edition is used, otherwise each section is translated keeping the outline, recorded in `rewritten.skipped`; (3) a copy question carries `leadsTo` (the link next to the label or the rule's `leadsTo`); a button with an unknown link is not asked and keeps the template's words; a button leading to the demo company's file (the profile PDF, `media-map.json`) is moved to the contact page with the template's own contact label (`demoFileLinksOf`, `contactPathOf`, `contactLabelOf`); (4) K6: when the customer gives no social networks the demo's buttons are kept, and only the links and handles carrying the demo company's name are emptied (`socialKept`), in both BLANK and FULL. `scripts/src/lib/display-locale.ts` adds `switcherOptionOf`/`switcherOption` (the language switcher names options in the language of the page being shown). New test `scripts/tests/personalize-fallback-gate.test.mjs` (the model is deliberately wrong: missing sections, wrong again after the re-ask, a button with no link) and a new case in `display-locale.test.mjs`; `personalize-{apply,labels,tone,written-language}.test.mjs` updated for the new rules. Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**A rewritten body keeps the template's outline; a sentence made only of the customer's name is written in that edition's language (#1013, g58) — 11/10/2026, fixed in TCH on branch `fix/tcqr-g58`, PR to the home repo NOT yet opened.** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`: (1) an entry body with headings, lists, quotes or images (`bodyOutline`) is asked section by section in order, each section keeping its type (`bodyFromOutline`); if the model does not return every section, the body stays as in the template (renamed) and is not flattened into paragraphs (measured on dev: /terms went from 7 headings to 1); (2) an `identity` rule written per language (e.g. the copyright with the template's credit line) that contains only the customer's name also reaches every language edition still served (`nameOnly`). Tests in `tests/personalize-{keeps-structure,trim,}.test.mjs` (Business); the kit does not have them yet. Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**Images deep inside a field written as a whole block are kept (#1013, g58) — 11/10/2026, fixed in TCH on branch `fix/tcqr-g58-emdash`, PR to the home repo NOT yet opened.** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`: `keepSiteRowKeys` merges objects key by key and lists row by row at every depth, so images the importer placed in a kit page's `sample` (`sample.image`, `sample.frames.*`, `sample.slides[3].image`) are not lost when the run writes `sample` from the seed (renaming the demo, or borrowing the site's language edition). Tests in `tests/personalize-kit-pictures.test.mjs` (Business); the kit does not have them yet. Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**A demo entry still carrying the demo's exact words after three asks stays published (#1013, decision A) — 11/10/2026, fixed in TCH on branch `fix/tcqr-blank-keeps-facts`, PR to the home repo NOT yet opened.** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`: the entry-body lane no longer unpublishes an entry whose title is still the demo's after three asks ("stubborn"); the entry keeps the template's words (renamed) and is recorded in the report's `rewritten.skipped`, like a block-list row the model returns unchanged. Tests in `tests/personalize-keeps-structure.test.mjs` (Business). Gate `emdash-kit-sync` green. Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**Block lists drop no rows, images merge by key, unanswered contacts keep the template's (#1013) — 11/10/2026, fixed in TCH on branch `fix/tcqr-blank-keeps-facts`, PR to the home repo NOT yet opened.** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`: (1) the block-list lane re-asks separately the rows the model returned as the demo's exact words; rows still identical to the demo are kept and recorded in the report, not dropped; (2) `keepSiteRowKeys` merges by `_key`/`id`, falling back to position over the common part, so lists of different lengths still keep their images; (3) the `identity` rule takes `"unanswered": "keep-demo"` (with no answer the demo value stays as is, the report says "placeholder") and `requires` (writes only when every named fact is present). Tests in `tests/personalize-keeps-structure.test.mjs` (Business, SaaS) and `tests/personalize-facts.test.mjs` (Base); the kit does not have them yet. Gate `emdash-kit-sync` green. Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**Writing a block list keeps keys only the site has, and drops fields the site does not have yet (#1013) — 11/10/2026, fixed in TCH on branch `fix/tcqr-blank-keeps-facts`, PR to the home repo NOT yet opened.** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`: (1) the `writeEntry` write door merges each row of a list field onto the row at the same position on the site (`keepSiteRowKeys`), so images the importer placed after the seed (e.g. `life[2].image`, `items[0].tile_image`) are not lost when the model rewrites the words; (2) before writing, it reads the collection's field list on the site (`GET /_emdash/api/schema/collections/<c>/fields`, once per collection) and drops fields the site does not have yet, naming them in `skipped`, because EmDash rejects the whole write with `unknown_field` when the tool in the image is newer than the site's release. New test `tests/personalize-keeps-structure.test.mjs` in Tracy Business and Tracy SaaS (the kit does not have it yet). Gate `emdash-kit-sync` green. Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**A blank About deletes none of the demo's facts (#1013) — 11/10/2026, fixed in TCH on branch `fix/tcqr-blank-keeps-facts`, PR to the home repo NOT yet opened.** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`: step 2 of `planFrom` (emptying the `facts` fields of `seed/personalize.json`) runs only when `claims` (default `true`; `main` sets `Boolean(facts.about)`), so a customer site with a blank About keeps the demo's figures, clients, team and history, and only the name changes. New test `tests/personalize-facts.test.mjs` in the three templates (the kit does not have it yet). Gate `emdash-kit-sync` green. Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**With a blank About the model rewrites nothing, and unticked pages are hidden in every language edition still served (#1013) — 09/10/2026, fixed in TCH on branch `feat/template-customization-question-readiness-spec`, PR to the home repo NOT yet opened.** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`: the lanes that rewrite demo words (copy, titles, terms, entry bodies, block lists) run only when the customer wrote an About text (`canRewrite`); a page the customer unticked is unpublished and the menu item leading to it is removed in every locale still served (`served`), not only the locale being written. `scripts/tests/personalize-pages.test.mjs` adds a "no language chosen" case. Gate `emdash-kit-sync` green. Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**A blank About only changes the name, the name reaches every language edition still served, together with the tool changes of the 09/10 round (#1013) — 09/10/2026, fixed in TCH on branch `feat/template-customization-question-readiness-spec`, PR to the home repo NOT yet opened.** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`, gathering every tool change of the branch not yet copied to the kit: `--share-file` (the share image from the logo), removing links into cut demo rows (`unlinkDeep`, replacing `retargetDeep`/`LEADS_TO`), LANG-5 (no language chosen means no locale is hidden; receipts record `hide`), cutting demo rows only when the customer wrote an About text and there is a model (`cut` of `planFrom`), and with no language chosen every language edition still served receives the customer's name and only the name (`nameOnly`). `scripts/tests/mock-emdash.mjs` takes the exact bytes of the three templates (the settings door merges the `seo`/`social` groups key by key). The new tests for these cases live in Tracy Business's `tests/personalize{,-trim}.test.mjs`; the kit does not have them yet. Gate `emdash-kit-sync` green again. Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**Hide only the pages the customer unticked (#1013, `fix/hide-only-unticked-pages`) — 08/10/2026, fixed in TCH while merging the round's second PR, PR to the home repo NOT yet opened.** `scripts/tools/personalize.mjs` takes the exact bytes of the three templates' `tools/personalize.mjs`: `templateHideRules` returns none of the template's `hide` rules, an emptied listing page (`emptied`) stays published, and only `unpickedPageRules` (pages the customer unticked) hides pages. `scripts/tests/personalize-pages.test.mjs` adds two cases (a `hide` rule never applies; a page a rule names stays published unless the customer unticked it), `scripts/tests/personalize-apply.test.mjs` changes its last case to a page the customer unticked. The TCH branch only changed the three templates, so gate `emdash-kit-sync` went red after the merge; this round brings the kit back in line. Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**Binding tone of voice (#1013, `fix/tone-binding`) — 08/10/2026, fixed in TCH, PR to the home repo NOT yet opened.** `scripts/tools/personalize.mjs` replaces `TONE_LINE` (one generic sentence) with `TONE_RULES` + `toneLine()`: definitions of Plain/Warm/Bold (sentence length, word choice, punctuation, heading and CTA style, prohibitions), placed in the copy, entry body, block list and form prompts; when the customer picks a tone, the sentences "Plain, specific, no exclamation marks" and "the demo is the reference for REGISTER" give way. `scripts/tests/personalize-tone.test.mjs` adds two cases. In the same round the kit copy also receives `templateHideRules` (TCH commit `db76000f7` only changed the three templates, and gate `emdash-kit-sync` was red). Byte-identical to the three templates' `tools/` + `tests/personalize-tone.test.mjs`; the definitions match `packages/cms/tracy-seeder/src/tone.mjs` word for word (test `scripts/test/tone-definitions-sync.test.mjs`). Outstanding: PR to `JoomlArt-Products/tracy-emdash-template`.

**A new template meets "Customize your site" on its own (#1013, T32) — 08/10/2026, fixed at home and pulled in: [JoomlArt-Products/tracy-emdash-template#19](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/19) (branch `feat/customize-your-site-ready`, commit `1bc6773` on `main` @ `52e356c`, draft, not merged).** Nine files take the exact bytes of that commit: (1) the brand code of the three EmDash themes becomes the kit's — `scripts/src/lib/{brand,media,display-locale}.ts` + `scripts/src/components/site/BrandLogo.astro` (byte-identical to `src/` of `packages/cms/tracy-emdash-theme-{business,saas,base}`, gate `emdash-kit-sync` compares byte by byte), so `new-template.sh` copies them into every new template; (2) `scripts/tests/{brand,display-locale}.test.mjs` as a starting point (owned by the template); (3) `assets/seed-starter/personalize.json` adds a `brand.logoDark` block (the `logo_dark` image field of the chrome entry); (4) new `references/brand-and-pages.md` — contract + checklist: a per-theme logo pair with a height cap, no CSS that inverts/replaces the logo, the template icon only after `templateIconWanted`, a single-language root through `display-locale.ts` + the chrome word table, © from `{year}` `{name}`, `tracy_site_pages.json` from the `primary` menu (`release.mjs --site-pages`, #17; or `tracy-dev site-pages --emdash`); SKILL.md adds phase P4.6 and a section pointing there. The PR touches no file of the two stacks #15→#18 and #16→#17, so they can merge in any order. **When #19 merges:** re-pin to the merge commit; otherwise the next `subtree pull` deletes these changes.

**Logo, favicon, page hiding, tone of voice (#1013, PR-B) — 07/10/2026, fixed in TCH, PR to the home repo NOT yet opened.** `scripts/tools/personalize.mjs` adds `--logo-file`, `--logo-dark-file`, `--favicon-file`, `--brand-only`, `--apply-id` (writes `settings.logo`, `settings.favicon`, the `logo_dark` field of the chrome entry, with an undo journal), the `hidePages` answer (unpublishes unticked pages in every locale being written + removes the main-menu item, never hides home) and reads `tone` separately; three new tests `personalize-{brand,pages,tone}.test.mjs`. Kit commit `fc9df95` on branch `feat/brand-pictures` (cut from #18) is in the working session's scratchpad; pushing the branch + opening a draft PR to the home repo was blocked by permissions for the subagent — outstanding. Byte-identical to the three templates' `tools/` (gate `emdash-kit-sync`).

**Seven default questions (#1013) — 07/10/2026, fixed in TCH, PR opened to the home repo, not merged.** Two kit files take the exact bytes from the heads of two PR branches: (1) `scripts/tools/release.mjs` + `scripts/tests/release-site-pages.test.mjs` = [JoomlArt-Products/tracy-emdash-template#17](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/17) (branch `feat/site-pages-file`, stacked on #16 `feat/emdash-1-1`): `release.mjs` generates `tracy_site_pages.json` from the level-1 `primary` menu of `seed/site-model.json` (flag `--site-pages <dir>`); (2) `scripts/tools/personalize.mjs` + `scripts/tests/personalize-journal.test.mjs` = [#18](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/18) (branch `feat/one-language-root`, stacked on #15): choosing one language other than English writes the root locale in that language (`localesFrom` returns `as`, O2/D10), even a language the template does not ship. Byte-identical to the three templates' `tools/` (gate `emdash-kit-sync`). **When #15–#18 merge:** `git subtree pull` pinned to the merge commit; otherwise the next pull deletes these changes.

**`personalize.mjs` for "Apply" — 03/10/2026, fixed in TCH, PR opened to the home repo: [JoomlArt-Products/tracy-emdash-template#15](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/15) (branch `feat/personalize-for-apply`, four commits `9b4c42e`..`40ebd4a` on `main` @ `52e356c`; not merged, no tag/release — the kit owner decides).** `scripts/tools/personalize.mjs` (byte-identical to `tools/personalize.mjs` of the three templates `packages/cms/tracy-emdash-theme-{business,saas,base}`, gate `emdash-kit-sync`) adds: (1) `noThinking(model)` — requests to `api.deepseek.com` carry `thinking: {type: "disabled"}` at the five model call sites (copy, entry body, card list, taxonomy labels, form): measured 03/10 on the stand, by default the API spent all 8192 tokens on reasoning, took 32 s and returned EMPTY; turned off, 2.6 s; a whole `personalize` run went from 114 s to 84 s; other doors unchanged; (2) flag `--hide-chrome-only` — hides a language by unpublishing ONLY its `site` entry instead of every entry (the template serves a locale only when its `site` entry is published, `src/lib/served-locales.ts`; ~1,750 calls, ~56 s, down to 35 calls), OFF by default so the agent's run is unchanged; (3) flag `--concurrency <n>` (1–16, default 4); (4) the `hours` answer and the `{hours}` template (the customer's opening hours; without them `empty` still deletes the demo's hours); (5) the `social` answer and the `socialFrom` function (only web links the customer typed, never built from a name) together with the identity rule `from: "social"` + `item` + `networks` (a list shaped exactly like the template's field; the rule keeps `value: []` so the old tool still empties the list); (6) the form prompt carries the customer's `about` and tells the model to rewrite examples naming another trade instead of copying them; the `value` of a rewritten option follows its label (previously only the label changed, and the submission sent to the mailbox still said "Request type: Construction quote") and a list of 2–8 options is trusted even if its count differs from the demo's; (7) a page a `hide` rule names is not written and republished by the `copy`/`blocks`/image steps (a bakery's Careers page was hidden and then came back to life right after, when its menu item had already been removed). Used by "Apply" in the Add site popup (`apps/tracy-web/src/sites/brief-engines/emdash.js`), which runs this copy from tracy-web instead of inside the container. Tests: the business template's `tests/personalize.test.mjs` (the kit does not carry it) and, in the PR to the home repo, `scripts/tests/personalize-apply.test.mjs` (9 cases, own seed; the end-to-end cases fail on the old tool; tch copied this file into the three templates' `tests/`). **When #15 merges:** `git subtree pull` pinned to the merge commit, copy the new test into the three templates' `tests/`; otherwise the next `subtree pull` will delete the changes above.

**EmDash 1.1.0 — 04/10/2026, bump made in TCH, no PR to the home repo yet.** The pin `__CMS_VERSION__` in `scripts/new-template.sh`, the `artifact.json` example in `references/qa-and-packaging.md`, `references/runtime.md` (heading + pin line, `emdash`/`@emdash-cms/auth` 1.1.0) and `scripts/tools/content-api/README.md` ("Tested with EmDash 1.1.0") change from 1.0.1 to 1.1.0; no other kit file changes. The three templates `packages/cms/tracy-emdash-theme-{business,saas,base}` carry the same README bytes. Outstanding: open a PR to `JoomlArt-Products/tracy-emdash-template` for these four files. `scripts/tools/personalize.mjs` (the 03/10 fix, kit PR #15 not merged) is **not touched** by this round.

**EmDash 1.0.1 — 29/09/2026.** 12 kit files (the content API uses only the public API, reference fields attached
as relations, seeding through the `emdash seed` CLI, `EMDASH_SITE_URL` for clean-install, SCRUB of the transfer table, notes in
`references/runtime.md`) are the copy on kit branch `feat/emdash-1-0` @ **`tracy-emdash-template@59632bd`** (29/09 afternoon: the branch also merged `main` (#12), #11 reader-prose, #2 source-theme-signals, #1 inventory-order; added `urlField` + multi-entry chrome for the content API, and `stamps.ts` returns a new object each time — freezing made `class:list` + spread throw a 500), the whole kit tree is byte-identical to this tree,
PR JoomlArt-Products/tracy-emdash-template#14 — stacked on #13 (`feat/comment-to-edit-stamps`), not yet in
`main`. Before this round each of those files was byte-identical to the copy in #13; byte-identical to the two templates
`packages/cms/tracy-emdash-theme-{business,base}` (gate `emdash-kit-sync`). Task: `tasks/todo-emdash-1-0.md`.


**`restore.sh` reads the whole archive listing — 28/09/2026, pushed to the home repo.** `scripts/tools/restore.sh` and `scripts/tests/restore.test.mjs` were fixed here (TCH branch `fix/flaky-tests-small-fixes`), then PR JoomlArt-Products/tracy-emdash-template#12 was opened (commit `tracy-emdash-template@233ca01`, byte-identical to the copy here and the two templates). The bug: `printf | grep -q` under `pipefail` — `grep -q` exits at the first matching line, `printf`, still writing, dies of SIGPIPE, and the whole pipeline reports failure. A backup whose listing is larger than a pipe (5000 uploads) was always rejected with "archive has no ./data/data.db", and the `..` guard was skipped when a `..` member came early; small listings failed only when the machine was busy (CI 27/09, #484). It now reads through a here-string. The next pull reaching #12's merge commit will not lose the fix.
**Comment → edit into the kit — 27/09/2026. Pinned at `e3668c0`, branch `feat/comment-to-edit-stamps` at home,
draft PR [JoomlArt-Products/tracy-emdash-template#13](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/13)
(not merged, no tag/release — the owner decides).** The branch was built from `main` (`7e93ce7`), merging
`codex/content-api-emdash` (`ee70ba2`, PR #7 still draft) because the Content API cannot be "in every template" while it only
lives on that branch, then three commits: `13bf393` the reader reads `prose` (a string + one field per Portable Text block by `_key`
— **paying off the debt** recorded in the section below; replaces PR #11, which only read strings), `ef12c90` provenance stamps into `scripts/src/`
(`stamps.ts` + `keepPickPrivate`, `PageOwner`, three `Prose*`; `check-kit-sync.mjs` compares `src/` byte by byte, only files the kit
ships), `e3668c0` Content API on in every template (`Dockerfile.template` ARG default 1 + ENV in both stages,
`tools/content-api-gate.mjs` called by `release.mjs`, a `content-api-map.json` + `middleware.ts` skeleton,
`new-template.sh` copies `tools/` recursively). Pulled with `git subtree pull --squash` from the branch; one add/add conflict
in `tools/content-api/README.md` (the old squash marker was too far back) was resolved with the kit's copy — this tree is **byte-identical** to
`e3668c0` (`diff -rq` empty except this file). When PR #13 merges: re-pin to the merge commit.

**Long text (`prose`) in the reader — 27/09/2026, fixed in TCH; pushed to the home repo in PR #13 (`13bf393`).** `scripts/tools/content-api/reader.mjs`
(+ README, `scripts/tests/content-api.test.mjs`) projects the site model's `prose` field: a string = one `text` field
under its key; Portable Text = one `text` field per text block, key `<field>.<_key>` (a block lacking a valid unique `_key`
is dropped, `PROSE_IDENTITY_INVALID`, never a positional id). Byte-identical to the two templates
(gate `emdash-kit-sync`). TCH branch `feat/comment-picker-emdash-prose`; **outstanding**: a PR to
`JoomlArt-Products/tracy-emdash-template` branch `codex/content-api-emdash` carrying exactly these three files, otherwise
the next `subtree pull` deletes them.

**`restore.sh` reads the whole archive listing — 28/09/2026, pushed to the home repo.** `scripts/tools/restore.sh` and `scripts/tests/restore.test.mjs` were fixed here (TCH branch `fix/flaky-tests-small-fixes`), then PR JoomlArt-Products/tracy-emdash-template#12 was opened (commit `tracy-emdash-template@233ca01`, byte-identical to the copy here and the two templates). The bug: `printf | grep -q` under `pipefail` — `grep -q` exits at the first matching line, `printf`, still writing, dies of SIGPIPE, and the whole pipeline reports failure. A backup whose listing is larger than a pipe (5000 uploads) was always rejected with "archive has no ./data/data.db", and the `..` guard was skipped when a `..` member came early; small listings failed only when the machine was busy (CI 27/09, #484). It now reads through a here-string. The next pull reaching #12's merge commit will not lose the fix.

**Reader reads `prose` — 27/09/2026.** `scripts/tools/content-api/reader.mjs` and `scripts/tests/content-api.test.mjs` in this tree = the copy on kit branch `fix/reader-prose` @ **`156935e`** (PR JoomlArt-Products/tracy-emdash-template#11, base `codex/content-api-emdash` @ `ee70ba2`, not merged): the `SCALARS` table adds `prose: 'text'`, so the site model's multi-line text fields (hero text, band text, text in a repeater) are no longer `FIELD_UNSUPPORTED`. Byte-identical to the two templates `packages/cms/tracy-emdash-theme-{business,base}`. When #11 merges, re-pin to the merge commit.

**Content API reader — 27/09/2026.** `scripts/tools/content-api/` (reader, route, README) and `scripts/tests/content-api{,-source}.test.mjs` in this tree are the copy on kit branch `codex/content-api-emdash` @ **`ee70ba2`** (where the kit's content API lives, not yet in `main`): PR JoomlArt-Products/tracy-emdash-template#9 (`content.read` takes `maxBytes`, paging by whole content items; without it nothing is cut) and #10 (records read from the native list page, not one get per entry — 7 describe probes on the fixture 944 → 407 ms, byte-identical answers). Byte-identical to the two templates `packages/cms/tracy-emdash-theme-{business,base}` (gate `emdash-kit-sync`).

**Pushed to the home repo — 26/09/2026.** Decided: the quickstart contract is a **content recommendation** (a recommendation
to keep the design) that locks nothing beyond writing directly to the database; ADR 0022 replaces ADR 0020. `scripts/tools/artifact.mjs` no longer
writes the lock flag and its matching capability into `artifact.json` — fixed here in TCH #384, then taken home through
upstream PR #8 (`tracy-emdash-template@7e93ce7`, byte-identical to the copy here). The pin below (`65d980e`) has not yet
pulled the other upstream commits after it (`tracy-emdash-template@af69c10`, personalize); the next pull reaching
`tracy-emdash-template@7e93ce7` is enough and does not bring the old flag back.

**EmDash Content API: images (D17) + repeater row identity (option A) — 25/09/2026.** Pinned at commit
**`b8d5609`** of branch `codex/content-api-emdash` at home (PR #7 still draft, not merged/tagged/released), one commit
on top of `d9da155`: `reader.mjs` projects every image field into `images[]` (src = the URL the page serves, stored alt/size or
null, `usages` pointing at the block/item); `identity-sqlite.mjs` `init|fork|restore` stamps a UUID v4 `_rowId` on repeater
rows that lack one, and installs SQLite triggers `tracy_rowid_*` that stamp every later write (rejecting nothing — the `migrate` command
with its guard was removed); `personalize.mjs` compares rows without `_rowId` (`withoutRowIds`) so `--revert` and the receipt do not misread
them as "edited". The 8 files of `scripts/{tools,tests}` were copied byte for byte into the two templates' `tools/`+`tests/`.
`node scripts/test-kit.mjs` 225/225 on `b8d5609`. Evidence: `tasks/evidence/content-api-emdash-dev/REPORT.md`
§Round 3.

Earlier import point:

**EmDash Content API P4 (scalar) — 25/09/2026.** Added on top of `af69c10`, the exact bytes of branch
`codex/content-api-emdash` at home, commit **`d9da155`** (`cdf3f6a` opt-in scalar reader → `b4f9f66` experimental repeater
reader → `44fbca2` transport: `POST /content.json` becomes an internal GET rewrite to the native route, the authority
travels in an internal header trusted only when the Bearer is a relay PAT → `9c878b7` the relay PAT digest is read from a root-owned file
next to the app when the env lacks it → `f8d900e`+`d9da155` lint/format as in the TCH copy). Home PR **JoomlArt-Products/tracy-emdash-template#7** (draft, **not merged into
`main`**, no tag/release): when the branch is merged or rebased, re-pin to the merge commit. Copied here:
`experiments/content-api/`, `scripts/tools/content-api/*`, four tests `scripts/tests/content-api*.test.mjs`;
byte-identical into the two templates' `tools/`+`tests/` (gate `emdash-kit-sync`). `identity-sqlite.mjs migrate`
(repeater) is refused by the CLI without `TRACY_CONTENT_API_EXPERIMENTAL_REPEATERS=1` — PO decision D2:
scalar only, no patch to core 0.38. `node scripts/test-kit.mjs` 221/221 on `9c878b7`, content-api tests 20/20 in each template on `d9da155`. Evidence:
`tasks/evidence/content-api-emdash-dev/REPORT.md`.

Earlier import points (kept for history):

This tree is `JoomlArt-Products/tracy-emdash-template` pinned at commit **`af69c10`** (25/09/2026 — branch
`feat/personalize-journal-trim` (`77429e1` + lint fixes `b492a59` + `ba47260`: `tools/artifact.mjs` carries `contentOnly` from `template.config.json` into the `artifact.json` card, and adds the `content-only` capability; `6c6ed3b`: kept rows prefer slugs not carrying the demo's name, the `hide` rule takes `path` to remove exactly the right menu item; `4a95247`: `--inspect` compares image slots by media id — before that every drawn image was read as "edited" and revert was wrongly refused; `74f08df`: only the newest run counts as a repeat), upstream PR #6, **merged into `main`** 25/09 as `af69c10` — the same tree as `74f08df`, not a byte changed. `tools/personalize.mjs` reaches the Joomla Business 1.2.0 level in what a tool can do
without a component: `trim` (demo rows beyond `keep` leave the site before being written; with no model the collection
being rewritten keeps 0 rows and the listing page is hidden), the report splits `errors`/`unanswered`/`skipped` with exit code 4
on write failure, the model follows `/ops` (`TRACY_SEED_TEXT_PROVIDER`, `TRACY_SEED_IMAGE_MODEL`) and the report records the model
used, a journal `data/personalize-journal.jsonl` per mutation (`applyId`, `requestId`, `before/after/rev/origin`),
a `generated` slot lacking evidence is refused at the write door, `--inspect`/`--revert`, the `email` answer feeds the identity and the
form's `notifyEmails`, `display-locale.json` for `en-US` labels; `release.mjs` refuses a tag ≠ the template version.
The new test `scripts/tests/personalize-journal.test.mjs` carries its own seed so it runs the same in the kit and both templates.
`node scripts/test-kit.mjs` on a clone without deps installed: 135 green / 18 red, and `main` has the same 18 red (missing
`playwright`, `better-sqlite3`, `pngjs`). Before that **`65d980e`** (23/09/2026 — `tools/personalize.mjs` fully home through upstream PR #4 (`130e8ec`) and #5 (`65d980e`): `localesFrom` matches languages by full tag first, then primary subtag, returning `{ write, hide, why }` — writes only the locales the customer chose, only English when none chosen, always the root locale — and hides the remaining locales (unpublish, not delete); `languageDecision` keeps the build run's decision; `languageName` asks ICU for every locale, and is exported. Pulled with `git subtree pull` without changing a single byte in the tree — the copy here already matched home since TCH PR #278 — only moving the pin. The kit's full test suite 189/189 on the head of #5 before the merge. The template half (middleware redirecting hidden locales, hreflang listing only served locales) lives in the template's `src/` — the kit does not own that folder. Before that **`e057b9a`** (20/09/2026 — `compile-seed.mjs` compiles collections with `editLocking: false` (decided: Tracy sites do not lock entries, because an agent writes while a person has the admin open); in the same round `9371f41`: `tools/artifact.mjs` can read `locales: templateConfig.locales`; before that it read ["en"] and then refused to write `artifact.json` for a four-language template, which is why Business's `artifact.json` was stuck at 1.0.0. Before that **`d50bb57`** (20/09/2026 — `personalize.mjs` reads `about` (what the customer does) and puts it in both model payloads as the SUBJECT, the demo being only a yardstick — unifying the patch `8b07eb4cf`, which had drifted halfway between the two templates; in the same round as `23729f7`:
personalize **into the kit**: `tools/personalize.mjs` (the very Tracy Business copy running since 15/09), the gate
`tools/personalize-gate.mjs` + `release.mjs` **refuse** a package that cannot be personalised (missing file, map still
a placeholder, questionnaire not asking `name`, labels missing a language), `release.mjs` publishes
`tracy_site_question.json` from `seed/questions.json` itself, and `new-template.sh` places two starter files from
`assets/seed-starter/`. Measured on the `tracy-saas` 1.0.0 package serving customers: **refused**, missing exactly three
files — customers answered the questionnaire and the answers went nowhere. The two templates in `packages/cms/` already had all
three files so they pass the gate; the pull copied `personalize-gate.mjs` + tests into both, brought base's `personalize.mjs`
up to the 8-language version, and `23729f7` re-declares business's `release.mjs` variant in
`kit-manifest.json` (`if (questionsRaw)` gives way to `parseQuestions`) — upstream PR #3, merge
`4c991b9`). Before that **`8f22e04`** (19/09/2026 —
the kit's test suite **runs**: `npm test` calls `scripts/test-kit.mjs`, which builds a throwaway template
and runs the tests **there** (184/184, no skips) instead of in the skill folder, where 4 tests were red on
every clean checkout. Test dependencies are declared and **pinned** (`playwright 1.63.0` instead of the `^1.49.0` range) +
a lockfile. `check-kit-sync.mjs` compares a **declared set** instead of bytes (17/19 "drifted" files → 0), with
`kit-manifest.json` declaring ownership and 13 tests proving it goes red in the right places and not in the wrong ones. Not yet
tagged). Before that **`50c07a7`** (19/09/2026 —
⚠ **drift in the dangerous direction**: the two templates in TCH carried a safety guard that **the kit did not
have**, so every template `new-template.sh` generated lacked it. `restore.sh` now refuses to overwrite
a DIRECT subfolder of `$HOME`; measured 16/09, the test suite's own "dangerous path" case had created
`~/TracyHQ` containing the archive's `data.db` + `seed-receipts.json`. The test that should have caught it asserted
the opposite (`existsSync(bad)` green **because** restore had just created it). Not yet tagged).
Before that **`3e7e0e3`** (18/09/2026 —
the digest stops spending 85% of its size saying **nothing is wrong**: the component table prints exceptions and counts
the rest (measured on the sister `base` copy: 12,898/12,898 lines were PASS, `VISUAL.md` 1.79 MB →
269 KB). Plus a Triage section grouped by exactly the key `summary.distinct` uses — 1,302 findings become 17
keys — with a separate table for accepted, and a `tilesCoverPicture` flag saying whether the tiles cover the whole image.
⚠ Component rows **still stay in `visual.json`**: `--reuse` rebuilds `summary.components`
from that array's length, and dropping them breaks the reuse accounting. Not yet tagged). Before that **`a76e3b8`** (18/09/2026 — `fast-gate` stops crashing in the old-contract rescue branch; `summary.distinct` stops merging every
`parity-mismatch` into one; selectors extracted without declaration, a contract missing `designSystem`, and
`mega-hover` dying before `try` — all three stop being silent. Not yet tagged). Before that **`ddb15b9`** (17/09/2026 — the
visual QA tools catch what they were built to catch: hover measures a box that has settled, parity reads in one pass
inside the page, the gate blocks source images, tiles cut from one buffer; plus five tools stop opening the machine's own
Chrome. Not yet tagged). Before that **`1.5.2`** (`5e3437e`, tag `v1.5.2`,
16/09/2026 — Dockerfile + entrypoint into the kit and the release gate; the two TCH patches from 504b88539 have gone home. Before that `1.5.0`/`f01b6cf`,
15/09/2026 — before that `1.1.0`/`ed47603` the same day, and `v1.0.5`/`f61e613`),
**complete** — skill, tool kit, regression test suite and fixtures; no binaries, 636 KB.

🔒 **THIS SKILL'S HOME IS THE OTHER REPO, NOT THIS FOLDER (14/09/2026).** Before that it lived in
`.agents/skills/tracy-emdash-template/` and was a skill **of the TCH repo**; it was turned into a vendor tree
so it can be reused elsewhere, on the same pattern as `vendor/joomla/joomlart-t4-skill`. No fork, no
`-tracy.N` suffix: change it in the other repo, pull it here.

**The rule that comes with it, and it is the reverse of three weeks earlier:**

| Task | Where |
|---|---|
| Change the skill (SKILL.md, references, tools, tests) | **the `tracy-emdash-template` repo**, then pull here |
| Urgent fix right inside `vendor/` | allowed, but **must be pushed to the other repo in the same round** — otherwise the next pull overwrites it |
| Bump version | in the other repo (`.claude-plugin/*.json` + `skills/*/package.json`), then re-pin the number at the top of this file |

No gate catches this. `vendor/` is as writable as any other folder, and a fix left
here looks exactly like a fix that has been synced.

**Pulling from the new home (subtree, pinned to a commit or tag — last pull `efec437`; `git subtree pull` requires a CLEAN working tree — even unrelated files — so do it from a worktree, then fast-forward into `develop`):**

```bash
git subtree pull --prefix vendor/emdash/tracy-emdash-skill \
  git@github.com:JoomlArt-Products/tracy-emdash-template.git <commit-or-tag> --squash
```

`IMPORT-NOTE.md` is a **TCH** document, deliberately absent from the other repo — do not push it there. A squash pull can delete it or leave a conflict; restore it with `git checkout HEAD -- <this path>` before committing.

## Source-neutral contract — 15/09/2026

`1.1.0`, commit `ed47603`. Written **inside `vendor/`** on request, then pushed to the home repo
**in the same round** — exactly the rule line in the table above, and the first time that path was actually taken.

Contents: `scripts/contract/` (the `site-model.json` schema + a validator with 31 error codes),
`scripts/tools/compile-seed.mjs` (contract → seed), `scripts/tools/from-emdash-seed.mjs` (one-time bootstrap
for templates built before the contract), the packet `references/site-model.md`, and `check-kit-sync.mjs`
now also guards the `contract/` folder. Architecture decision: TCH's ADR 0016.

Acceptance: compiling Tracy Business's `seed/site-model.json` rebuilds **exactly the accepted `seed/seed.json`,
262,644 bytes, same SHA-256** — pinned in `packages/cms/tracy-emdash-theme-business/tests/seed-roundtrip.test.mjs`.
44 new kit tests green, run with bare `node`, no `node_modules` needed.

**The kit's whole test suite has run inside the template** after installing `node_modules` + Chromium:
**175/175 green, 0 skipped, 12 min 27 s** (measured 15/09/2026). Before that this was outstanding because the template was not installed.

## Bridge from the Joomla spec-pack — 15/09/2026, same day

`1.2.0`, commit `73d1ea2`. `scripts/ingest/from-wp-spec.mjs` reads the spec-pack that the WordPress kit's
`from-joomla.mjs` produced for Tracy Base (`tasks/tracy-base-wp7/spec/` in TCH) → `site-model.json`:
20 types · 129 records · 3 menus · 28 media, 0 WordPress traces left. The compiled seed passes EmDash's own
`validateSeed`: `valid: true`, 0 errors, 0 warnings. Packet: `references/inputs/from-wp-spec.md`;
measurements: `examples/tracy-base-j6.md`. `check-kit-sync.mjs` also guards `ingest/`. New kit tests: 49.

## Front door: the skill identifies the source itself — 15/09/2026

`1.3.0`, `7698a5a`. A flaw in the **skill's design**, not in the code, was pointed out: an ordinary person
prompts with one sentence — *"turn this site into an EmDash template"* — so every remaining decision
must live in the skill. Before this version, to make the skill take the right path, the user had to say themselves: what CMS the source is,
whether the content model can be obtained, where to put the package. That is a sign the skill is lacking, not the prompt.

Added: `scripts/ingest/detect-source.mjs` (CMS · T4/ACM · **reach** · suggested name + location) and the section
`## Getting started — take the job before running tools` in `SKILL.md` (written in Vietnamese at the time), the same intake pattern the Joomla kit had
from the start and this one did not.

**Reach is the most valuable finding**: the same Joomla site, at `127.0.0.1`, exposes its content
model, while on someone else's `demo.joomlart.com` there is only HTTP — and a skill that sees the word "joomla" and
promises a contract it cannot obtain will quietly fall back to scraping HTML. Measured on exactly those two sites.

## Complete set of source adapters — 15/09/2026

`1.4.0`, `8e13df8`. Measuring the three skill kits side by side showed EmDash had 3 ingest scripts but **one** packet,
while Joomla had 6 and WordPress 7. Filling the gap:

- `scripts/ingest/from-url.mjs` — crawls a running site into a folder `inventory.mjs` can read.
  Before that `source-inventory.md` said "the inventory must go through a downloaded copy" but **nobody downloaded it**, so each run
  invented its own way — and `source.files` (the contract's source hash) could not be reproduced.
- Five packets in `references/inputs/`: `from-html` · `from-url` · `from-frames` (Figma + Pencil together, because
  to this skill they are the same: both are images) · `from-brief` (says plainly it **loses the parity gate**) ·
  `from-wp-spec`.

The crawler keeps the site's path shape so no link needs rewriting, follows CSS to fetch the
fonts/images it references, refuses redirects that leave the origin, and `crawl.json` is the record for the copyright
question. It **says so** when it hits the page cap and when a page comes back under 2 KB (a JS-rendered site returns an empty
shell that looks like success).

7 tests run against a local server, with a **second** local origin so the leave-the-origin redirect case does not
depend on the Internet.

## Who consumes it

`packages/cms/tracy-emdash-theme-business/` — the first template built with this skill (Tracy Business,
Northgate demo content). The kit in `skills/tracy-emdash-template/scripts/tools/` is the **source**; the template's
`tools/` folder is the **runnable copy** (it needs the template's `node_modules` to resolve
`playwright`, `emdash`, `better-sqlite3`). Keep the two equal:

```bash
node vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/check-kit-sync.mjs \
  packages/cms/tracy-emdash-theme-business
```

## Why it is no longer in `.agents/skills/`

Repo skills (`public-skills.txt` → symlink mirror `.claude/skills/`) are skills **that belong to TCH**.
This skill belongs to the other repo, so it sits where `joomlart-t4-skill` does: in `vendor/`, and
Claude Code sees it through a **symlink into the vendor tree** (`.claude/skills/tracy-emdash-template`), which
`skills:sync` does not manage. For other agents (Codex, Cursor): give them
`vendor/emdash/tracy-emdash-skill/AGENTS.md`.

## Licence

The skill is Tracy's code — internal, not redistributed. There are no third-party binaries in the tree
(unlike `joomlart-t4-skill`, which carries 63 MB of JoomlArt commercial software). The example in
`examples/northgate.md` quotes a customer's design content, so **the other repo must be
private** and this tree must not be pushed to a public repo. Details: this tree's own `NOTICE.md`.

## 13/10/2026 — a state enum is not a label to translate

German acceptance on Tracy Base found 8 whole-page writes rejected by the API because
`hero_aside_state` had been translated out of the schema's enum. The patch is at the kit root, commit
`4659527`, [PR #21](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/21),
targeting the existing sync branch of PR #20, without merging the unfinished sync round itself.
The same delta is carried into the vendored tree and the three TCH templates in this round.
Technical `state`/`status` are skipped, while `state_label`/`status_text` are still translated;
the recruitment `type` remains the user's words. The kit's standard `npm test` suite: 333 PASS,
3 existing SKIP, 0 FAIL.

- 13/10/2026: same [PR #21](https://github.com/JoomlArt-Products/tracy-emdash-template/pull/21), commit `f57e4fd`: the sign-in tool confirms Continue and the publish tool supports the EmDash 1.1 dialog, keeping the old version's menu. An independent agent building a clean package reproduced the old timeout and ran the new tool successfully; byte-identical in the three templates.

- 13/10/2026: same PR #21, commit `c3fda84`: the form wrapper keeps the submit label set by the editor before the plugin switches to its pending state. An independent agent checked a Vietnamese label through success 200 → simulated 500 response error → real retry 200; the label did not change and the configuration was reverted. The Forms plugin's npm code was not modified.

- 13/10/2026: same PR #21, commit `4d0eb67`: translates Forms helpText, including fields whose label has its own brief; the Vietnamese-root fixture FAILED before, 6/6 PASS after. Byte-identical in the four personalizer/test copies; the new Privacy Note is no longer left in English when personalising.
- Acceptance 13/10/2026: `9769dce` on the same PR #21 fixes the site visibility measurement to match the source and adds an independent HTTP check when fragment navigation returns null; the regression was red before the fix, green after, and a 404 is still rejected.

- 13/10/2026: same PR #21, `6e47709` restores the kit's own fixtures/helpers when merging the QA patch; removing exactly the new fix yields the baseline bytes again. No old cases deleted. Final standard suite: 338 tests, 335 PASS, 3 pre-existing SKIP, 0 FAIL. Business keeps all 507 old cases and adds 2 new ones: 509/509 PASS.

- 13/10/2026: same PR #21, `f9e5cc7a4373a5f8e4dad6f6ec5a53f0dedcb535` fixes scanSeams: it only drops proof edges hidden by an opaque surface/border within the viewport, and keeps real visible/offscreen/nested errors. Only the function and the new regression were merged into each template's own fixtures. Full upstream visual suite 33/33 PASS; Base 32/32 PASS; Business/SaaS the three related regressions 3/3 PASS. This is not counted as a rerun of the whole CMS suite.
