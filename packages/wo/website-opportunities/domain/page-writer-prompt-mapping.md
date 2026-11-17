# Page writer prompt: what it took from the step chain's site writer

The build chat's page writer prompt (`page-writer-prompt.md`, a draft for #600) and its checks inherit the step chain's
site writer (`apps/tracy-web/src/site-writer/writer-prompt.md` and its copy check `site-writer/copy-check/`), as spec
#575 asks: where the step chain already has a rule, a check, a repair round or a fallback, it is copied, and only what
the new model forces changes. The step chain's files are unchanged.

What the new model forces, and nothing else:

- the writer fills the declared fields of template kit blocks (`block-store.json`, Contract A: typed fields with a
  measured `limit`) for a site that opens blank (`blank-site-contract/content-map.json` holds no demo words), instead
  of rewriting the slots of a demo site: there is no demo sample, no demo length and no demo mark to read;
- the business's values (names, phones, prices, reviews) are data fields copied in code, never written by the model;
- one call per page (the step chain wrote in turns), every page checked together by code, one rewrite round of the
  failing fields (the step chain had two; locked by #597);
- the plan has no per line `says` and `factIds`: a block carries its data ids, a `reason`, and (from the plan stage)
  `message` and `carries` (key message ids).

| Step chain rule (writer-prompt.md, check) | In the build chat | Why |
|---|---|---|
| Your job: write, never decide; add nothing of your own | copied | Opening of the prompt. |
| `returns`: a slot that cannot be written truthfully goes back with its reason (prompt 15-16, 125-126, 147-150) | copied, adapted | Reply key `returns: [{key, reason}]`. A returned field follows its block's declared no data rule (`noData`: hide or fallback) and is recorded with `returned`; it is not a failure (`page-writer-page.mjs`). The step chain's human reading page has no counterpart: the build has no review step (ADR 0047). |
| "First write a true text of another kind" before returning; a number slot with nothing to count takes a phrase without a number | copied | Prompt rule 6. |
| What you receive: `says`, `visitorQuestion`, `keyMessage`, `endAction`, `primaryAction`, the kit `look` | adapted | The plan stage restores the step chain's intent on the plan (Contract B, `build-contract-plan-intent.mjs`); the writer resolves it to words (`page-writer-intent.mjs`). Each block sends its `reason`, its `message` and the `name` the template gives the section (the build chat has no `look` text), and the key messages its `carries` ids name, by their labels (`keyMessages`); each page its `visitorQuestion`, `keyMessage` and `endAction` (its block, and the main action it leads to); the site its `primaryAction`. The plan names the main action by its facts (`{factIds}`); the writer reads it as the button words and the channel it leads to (`actionWordsOf`). Absent fields are left out. Prompt rule 12. |
| Search terms and intents (prompt 205-208, `pages[].seo`) | adapted | The plan stage writes each page's `titleIntent` and `descriptionIntent` and code makes its `searchTerms` from the plan data (`plan-intent-seo.mjs`); the writer receives them as `page.search`. Prompt rule 15. |
| Kit images for the writer (bench) | not ported | The block store declares no picture of a block; a vision call per page would add cost the build has no budget line for. |
| Writing order: shared, home, other pages; the copy notebook (prompt 51-55, 185-198) | adapted | The first page of the plan is written first; the other pages are written after it, in parallel, with its written copy as `written` (`page-writer.mjs`, `page-writer-rounds.mjs` `writtenWordsOf`). The notebook's purpose (what earlier pages said) is served by the words themselves; a page written later that repeats an earlier one is the offender (W06). |
| Write only what the facts allow: every number, time, price, phone, email, web address in a fact the slot cites (W04) | adapted | No per field citation exists, so a field is held to the data of the block that holds it: its facts and items, its rows, the owner's facts placed on it, and the counts of its items and rows (`page-writer-scope.mjs`). Every number in digits must be one of those values; the search texts keep the whole plan data, as the step chain held alt text and titles to any fact. |
| A count of the distinct items cited is a fact; never estimate, round up or add "+" | copied | Prompt rule 4; the block's item and row counts are in its scope. |
| Trade lines: common practice only, never terms (prompt 138-140) | copied, adapted | Prompt rule 8, now on a block (and its cards) marked `basis: "trade"`; checked by R10f's own tests (`tradeTermsOf` of `plan-gate-trade.mjs`, problem `trade_terms`). The block's `facts` (its `factIds`) say which activity it explains. |
| Trade cards (planner "Trade knowledge": "Its cards ... each showing a stage of the activity") | copied, adapted | `trade-cards.mjs`: a repeating trade block with no item gets as many cards as it shows at most (`items.max`, "as many items as the kit shows"); the writer writes them, the write order shows them. Their picture frames are the pictures stage's (not framed yet). |
| Reviews quoted word for word; outside a reviews block never quote (W05) | adapted | Reviews are data, never written. Any quoted passage of three words or more in a written field must be an exact passage of a review its block shows (`quote_not_a_review`); prompt rule 5. |
| Never name a contact channel the plan does not name | kept | Prompt rule 7 (already in the build chat). |
| Voice: language, summary, `ownWords` once, `avoid` (W08) | kept | Prompt rule 9; `avoided_phrase`. The plan's `forbidden` list has no counterpart in the plan. |
| Plain text, no long dashes (W11) | kept | Wider in the build chat: every dash form, markup, markdown, double parentheses. |
| Fit the slot: limit (W03) | kept | Measured in visible characters against the declared limit. |
| Write to the demo length, 80 to 100% (W03, W15, ADR 0042 section 10) | not ported | The site opens blank: the content map samples are empty (`opensEmpty`) and the block store declares no demo length, only the measured room of the frame. A floor from the room would be invented. The step chain's words "a short heading stays short; a paragraph slot gets a paragraph" are copied into prompt rule 3. |
| Never reuse a demo sentence or a demo name, the template's own name (W07) | adapted | No demo words reach the writer; the template's name does, so a field or search text carrying it fails (`template_name`). Prompt rule 10. |
| Never describe the page (W10) | kept | `about_the_page`, in six languages. |
| Never repeat yourself (W06) | kept | The site check (`page-writer-site-check.mjs`), with the writing order above. |
| Accent words `emphasis` (prompt 82-88, W16) | copied, adapted | The block store's `inline` span part reaches the writer as `emphasis: {at}`; the reply's `emphasis` is checked (exact words, at most `EMPHASIS_ROOM` characters, under half the text, only on such a field: `page-writer-emphasis.mjs`). Room: no demo words to stretch, so twice the step chain's floor. A missing emphasis is not a failure: Contract A says plain words are always valid. The write order wraps it in the declared span for a `codes` field (with the line break before an end run, as `withEmphasis` does); an `html` field keeps the words and carries `emphasis` for the write stage, which has not ported the step chain's emphasis stage yet. |
| Sentences split over several slots (W12) | not applicable | The block store declares no field that prints as a piece of another's sentence. |
| Alt text for every frame (W09) | not here | The pictures stage owns alt text in the build chat. |
| Title and description for every page, unique titles (W09) | kept | Written when asked and checked; a page with none gets the write order's own (`write-order-pages.mjs` `seoOf`), so every page has both, as W09 requires. |
| Created privacy page (`pages` entry, W13, W14) | copied, adapted | Its own call and its own draft prompt (`page-writer-privacy-prompt.md`, `page-writer-system.mjs`), after every other page. W13 copied (a heading of at most 60 characters, no " \| ", not ending with the business name). W14's five paragraphs and four themes copied; the themes are named by the writer per paragraph (`covers`) instead of found by English keywords, since the build writes in the business's language and code never reads the meaning of free text. Every paragraph is held like a copy field and against the other pages. The page is not created on the site yet (`draft-write-system-pages.mjs` still reports it). |
| The not-found page | not written | Parity: the step chain's write step skips it for this template (`write-step/page-settings-stage.js`); its words are the platform's own. |
| People (no counterpart) | added | A person item the profile marks `namedBy: "customer"` (named in reviews) is written with name and role only: prompt rule 4. |
| Self-check list (prompt 212-243) | copied, adapted | Every check that applies to fields of blocks; the slot, label, footer, menu, alt and demo checks are dropped with their sections. |
| After you answer: fix rounds | kept | One rewrite round of the failing fields (`page-writer-rounds.mjs`); the step chain's second round is #597's decision. |
| Retry on a transient provider error (`agent-over-door-retry.js`) | copied | `apps/tracy-web/src/build-draft/build-model.js` wraps every call in `withRetries`. |
| Spend and records | copied | The copy step records each call's model and tokens and reports its cost when every call reported one (`model-usage.js` `spendOf`). |
