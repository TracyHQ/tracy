# Declaration rules: how to fix each finding

The packing check (`node scripts/slot-roles/check.mjs <contract dir>`, section 7 step 8) runs the declaration rules
of `apps/tracy-web/src/lib/content-map-lint.js` on the content map, with the rows of `presentation-lock.json`.
Each rule mirrors a guess the brief engine makes, so a map that passes is one the engine no longer has to guess.

- **error**: the engine would write the site wrong with this declaration. The packing run exits 1; fix before the PR.
- **warning**: the engine guesses right today; fix the declaration when you make the next contract version.
- **info**: shown, never counted; nothing to edit in the map.
- `--webroot <pack webroot>` also measures item icons from the demo pictures. `--lint-json <file>` writes every finding.
- The whole-tree gate (no folder named) only counts findings: released contracts are never edited. On /ops,
  Road to live > Content coverage reads an error as an invalid slot roles declaration (holds Publish for a release
  not yet shown, warns for one already shown) and carries the counts in `rolesLint`.

Fix in the map of the version you are capturing, after the final capture (step 8), or in the capture rules when the
same defect would come back on every template (section 7b step 2). Never edit a released version folder.

| Rule | Severity | Fix |
|---|---|---|
| `hero-subline-ungrouped` | warning | Give the hero subline the headline's group (same `group.id`, `item`, `kind`); keep its role. |
| `hero-button-no-link` | error | Declare the button's link as a `url` slot with the label's pair role (`contact.cta_url` for `contact.cta_label`) in the label's group. Capture with `--link-fields-by-role`. |
| `hero-button-unpaired` | warning | Put the hero button label and its url in one group. |
| `gallery-in-article` | warning | A picture row inside an article is a card: `offering.image` / `event.image` in the card's group, or `editorial.illustration` with no group. Video cards: see below. |
| `gallery-group-is-a-card` | warning | A gallery group holds pictures only (an empty alt or caption field is fine). A title or a video makes a card: give it the card's kind. Video cards: see below. |
| `styled-unit-plain-sample` | info | Nothing to edit in the map: the engine reads the style from `presentation-lock.json`. Keep the row in the lock. |
| `unit-markup-not-inline` | error | The unit holds a link, picture or block: bind the text nodes (and the link as a `url` slot) instead of the whole unit, or give it a keep role. Fix the capture rule if it comes from `--whole-units`. |
| `layout-setting-as-text` | warning | A layout setting (`gutter`, `columns`, `show-on`, ...) is presentation: leave it out of the content map (capture rule) or give it a keep role. |
| `social-list-fixed-length` | warning | Declare the collection in `repeatableLists`: `{"<collection>": {"itemTemplate": "<first group id>", "min": 0, "max": <demo item count>}}`. |
| `social-in-person-card` | error | A person's links take `person.social_url` in the person's group, never `contact.social_url`. |
| `social-icon-kept` | warning | A network icon must move with its link; prefer an icon font class field in the same list over a kept picture. |
| `section-body-undeclared` | error | Declare on the listing entity what it lists: `"lists": "service"` (a group kind). A `lists` that is no group kind is refused too. |
| `card-title-link-undeclared` | error | Give the card's title link an action: `{"kind": "go-to-item"}` (the item's own page) or `navigation`. |
| `offering-rows-short` | error | Declare the collection in `repeatableLists` with its real capacity (`max`): the build shows the first offerings it has room for. |
| `outline-item-unroled` | error | Group the card as `step` with `"presentation": "session-outline"`: its heading `step.title`, each list item `step.description`. |
| `link-target-wrong-role` | error | A slot whose sample is a link target (`#`, a route, an address, `mailto:`, `tel:`) is a link: type `url`, a url role (`editorial.navigation_url`, `contact.cta_url`, ...) and its action, or `customize: "keep"` when the button has no job of its own (the build then takes a `#` button off). |
| `video-slot-names-no-video` | error | Capture the video id or link the play control opens as the sample. The build hides a play control by that id when the business has no video for it. |
| `text-box-at-demo-length` | warning | Measure again with content-coverage `--fit` (it reads the room a shrunk box can grow into), then copy the new `fit` in. The map keeps only the box, so the rule cannot tell how wide the room is: it flags a one-line capacity equal to the demo's words on every viewport. |
| `repeated-item-ungrouped` | error | Give every slot of item N of a repeated field list one numbered group `{"id": "<entity>.<list>.<N>", "item": N, "kind": "business"}` (or the record kind it shows) and declare its body `editorial.paragraph`, never another record's `offering.description`. Sibling bodies in numbered groups are written to one shape: the band of their demo text (sentences and characters), all or none. |
| `quote-line-outside-group` | error | Every text line of a guest quote card (the pull-quote heading with its quote mark, the words, the reviewer, the platform) is a slot of the card's quote group: same group id, item and kind `quote`, with a quote role (`quote.text` for a heading or the words, `quote.author_name`, `quote.rating_or_source`). The card is read from the field path (`[block, block[field], n]` or `[list, list<N>, field]`). Outside the group the copy writer fills the line with the business's own words under a reviewer's name; the build empties such a line of a released map. The section's own heading (another field) is no line of the card. |
| `entity-on-no-page` | warning | Say which pages show the entity: `"shownOn": ["<page entity key>", ...]`, `"shownOn": "every-page"` for a site-wide string or setting (a logo, a modal close, an off-canvas title), or `"shownOn": []` when no page shows it on purpose (an admin notice). A page already shows a module by its assignments, an article, category or contact by the link that opens it, and an entity that references another (`identityReferences`: an article its category, a profile field its user) by that entity's pages. An entity on no page is left out of the site plan of a brief build and keeps the demo's words. Also on the /ops content coverage. |
| `item-icon-ground-undeclared` | warning | Needs `--webroot`. No map edit can say it yet (Slot fit has no ground field); the engine measures the demo icon at build time. |

**Blocked on the vocabulary** (do not invent roles or kinds; ask the requester): a card that is a video (poster, title,
video id) has no group kind of its own, so the capture files it as `gallery`; a person's network label has no role.
Leave these findings as warnings until the vocabulary (ADR 0040) adds them.
