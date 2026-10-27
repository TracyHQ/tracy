# ADR 0037 — The place profile is sourced facts, independent of templates; a slot lacking facts keeps the full layout

- **Status:** (binding) — Lee settled it on 25/10/2026 after the council
- **Date:** 25/10/2026
- **Decided by:** Lee (PO), conversation in session salmon 25/10/2026
- **Follows on from:** [ADR 0036](0036-website-opportunities-independent-public-repo.md) (WO is a public repo, Tracy is a builder) · `tasks/council-wo-place-profile-2026-10-25.md` (Codex gpt-6-astra xhigh + Gemini 4 Argon) · `tasks/council-wo-handoff-menu-items-2026-10-25.md` (#1741) · plan `tasks/plan-wo-place-profile.md`

## Context

The place profile is what Website Opportunities (WO) hands over to Tracy after researching a business. Its only purpose: Tracy builds the **best** demo content from a quickstart (a WordPress/Joomla/EmDash template with sample content).

Today (VERIFIED on `origin/develop` 97a8f2fa3e and a53ab6f331, 25/10):

1. **Two handoff shapes.** Inside Tracy it is the site brief schema v1 (`domain/brief-schema.json`). From the open repo it is `demo-request/v1` (`domain/demo-request.mjs`), which is thinner.
2. **The brief mixes three things in one field.** `sitemap[].sections[].copy` holds at the same time sourced facts, pre-assembled sentences (`"<name>. <cuisine> cuisine."`) and instructions for the agent ("Show the dishes…", "Sample dishes may complete…").
3. **No filler reads the whole brief.**
   - `quickstart-first` reads only `business` and Google.
   - The pinned-copy fillers read only the roles hand-written for a few templates (`slot-roles/*.json`).
   - `agent-demo/1` reads the research snapshot, not the sitemap.
4. **The quickstart contract (`content-map.json`) has no slot roles.** Counted over 47 templates, the most common `requiresEvidence` slots are: prices (202), customers/partners, plan pricing tables, figures, team, testimonials, FAQ. The brief has no field for any of those kinds.
5. **Two policies for slots lacking facts run side by side:** "Coming soon / neutral name" (`section-fills.mjs`) and `sample:true` (the agent writes sample content, `agent-demo.js`).
6. **Industry is thought of as restaurants.**
   - `trade` is only written when the place is not food. A place without `trade` is treated as food (`brief.mjs:155`), so a gym sent through `/v1/demos` becomes a restaurant.
   - No filler reads `trade`.
   - The agent prompt and the vision prompt are written for restaurants.

## Decision

1. **One schema `website-opportunities/place-profile`, starting at version `1.0.0`**, used for both paths. Brief v1 and `demo-request/v1` become inputs to a converter on Tracy's side. The open repo sends the profile through `demo-request/v2`; the host still accepts v1.
2. **The profile holds only sourced facts and verbatim quotes, not tied to any template.**
   - No `sitemap`, no `sections[].copy`, no instructions for the builder. Instructions belong to the build request; wording belongs to the build plan.
   - The assessment of the current website (PageSpeed) is a separate assessment document, not a content source.
3. **Blocks:**

   | Block | Content |
   |---|---|
   | `business` | name, branches, address, coordinates, contacts, hours, service area, amenities |
   | `classification` | the source's verbatim `primaryType`/`types` (Google…), plus a Tracy-derived `trade` with the version of the mapping table; always present, including `food` |
   | `offerings` | `kind` (dish, drink, service, class, membership, package, room, product, experience, unknown); `variants` (size, duration, price); a price is one intact block of verbatim text, number, currency, `priceScale`, billing period, conditions |
   | `people` | people with evidence of a relationship to the business |
   | `claims` | figures (one block of number, label, scope, point in time); awards/certifications/press; customers/partners (evidence of the **relationship**, not just a logo) |
   | `faqs` | FAQs found |
   | `quotes` | verbatim quotes with their author: tagline, introduction, posts, testimonials, usage limits |
   | `events` | events, time-limited promotions |
   | `media` | images/videos; image ↔ entity relations recorded separately (like the dish images of #1741) |
   | `brand` | observed logo, colours, fonts, tagline |
   | `links` | website, social networks, booking, menu… |
   | `sources` and `evidence` | every fact points to a specific excerpt |
   | `coverage` | replaces `missing`: each kind of fact has a status `found`, `partial`, `searched_not_found`, `not_researched`, `blocked`, `failed` or `not_applicable` |
   | `conflicts` | conflicting source values |

4. **Provenance and right of use.**
   - Each fact has a stable `id`, `evidenceRefs`, extraction method and version.
   - Tracy **assesses each fact itself**: `accepted`, `withheld`, `stale`…, stored on Tracy's side and tied to the profile's revision. Tracy does not trust a `verified` flag or confidence the sender declares.
5. **Slot roles are bound when the quickstart is packaged.**
   - **Superseded on 27/10/2026 by [ADR 0038](0038-slot-roles-live-in-content-map.md):** roles live on each slot of the content map, not in a sidecar; the points below describe the earlier design.
   - There is one shared set of roles (`business.*`, `offering.*`, `person.*`, `stat.*`, `quote.*`, `faq.*`, `editorial.*`…).
   - Slots of the same card belong to the same group: name, price and image are never taken from two different entities.
   - A model proposes the binding, the packager reviews it, then it is locked to the template's release. A template without bound roles can still be built through a model, but must not be called deterministic.
   - **Roles live in a sidecar file `slot-roles.json`, committed in tch next to that version's contract (like `content-coverage.json` and `design-system-measurement.json`), not in the quickstart's `content-map.json`**, keyed by `template + version + sha256 of the content-map` (further precedent: hand-written `domain/slot-roles/*.json`). A released quickstart does not need a new release. When a new release changes the content-map, the hash mismatch invalidates the old sidecar; the differing part is then re-bound (model proposes, a person reviews) in the packaging step (`quickstart-contract`).
6. **Wording is written at build time.**
   - Deterministic code writes facts: name, price, contacts, hours.
   - Quotes stay verbatim.
   - A model writes editorial sentences per template, each with `factRefs` pointing to exactly the facts it relies on.
7. **Slots lacking facts: KEEP the template's FULL layout** (Lee settled on 25/10/2026, differing from Codex). Every section and every card of the template stays, as with the rule "the demo replaces, never removes" of 22/10/2026. A slot with no facts is left **empty** or carries **neutral text**.
   - **Neutral text** is text that says nothing about the business: a navigation label or a generic label for the slot kind. It contains no price, person, figure, praise, promise or award.
   - The set of neutral texts is defined **per slot role**, translated into the site's language, and reviewed like vocabulary.
   - The texts in use today ("Coming soon", "Chef's selection", "Seasonal special", "House favourite") are reviewed against this definition in step 3 of the plan.
   - `sample:true` (the agent writing sample content itself) is no longer a separate policy: it follows exactly this rule.

## Consequences

- Brief v1 keeps running until the converter and the fillers read the profile. There is no hard cut-off date; each filler switches over once it has tests on the profile.
- `demo-request/v1` (including the #1741 extension) is accepted forever. New clients call `GET /v1/demos/options` to learn whether the host accepts `demo-request/v2`.
- The quickstart contract package (`quickstart-contract`) gains a slot-role binding step (sidecar, no quickstart re-release).
- Road to live (`apps/tracy-web/src/lib/road-to-live.js`) gains a **Slot roles** step: `todo` (or `warn` for an already-released release) when there is no `slot-roles.json`, the file's hash mismatches, or `requiresEvidence` slots remain without a fact role; `done` when complete. The guide table (`packages/web/tracy-harness/src/cms/problem-guides.ts`) gives the admin a prompt with a Copy button to hand to an agent. The step only warns, it does not block Publish, because without the sidecar WO can still build through a model.
- Research beyond food (services, price lists, team, FAQ) is switched on automatically only after measuring the find rate and the extraction accuracy on real businesses. These two numbers have not been measured.
- Lee 26/10: Google & Tripadvisor reviews/ratings/customer photos may go onto the demo; Facebook, Instagram, TikTok follower/like counts also go into figure slots (label "<platform> followers" in the site's language). Making up reviews or numbers is still forbidden, as is pairing one person's review with another person's name/photo.
- Keeping the full layout means a demo for a business with little data will have many empty boxes or generic labels. That is the trade-off chosen: no making things up to fill space.

## Options dropped

- **Remove cards, drop blocks when there are no facts** (Codex). Truer to the facts, but it breaks the template layout that web sellers use to pitch. Lee chose to keep the layout.
- **Fill with derived facts or promise sentences** (Gemini: "100% transparent consulting", a Google score filled into a customer-figures box). These are unsourced claims, so they break the no-making-things-up rule.
- **Add a layer of Google's 19 Table A groups.** This layer is redundant: the verbatim `primaryType` and Tracy's `trade` are enough. Google's groups lump spas together with hospitals, barbers with lawyers.
- **The profile carries standard wording pre-written at research time** (tagline, short/long about). Each template needs different lengths and numbers of slots; wording written by a self-hosted client cannot be told apart from facts by Tracy.

## Amendment 26/10/2026: one inferred fact is allowed, WhatsApp from a UAE mobile number (settled by Akemi)

- **Who decided, when.** Akemi (COO) settled it on 26/10/2026, issue #1780 item 16. She said explicitly that Lee's
  approval was not needed; this ADR was settled by Lee, so this section records who decided the amendment.
- **Decision.** Exactly one inferred fact may go onto the demo site: when the business has a UAE mobile number (+971 5x)
  and no source says that number uses WhatsApp, Tracy still infers WhatsApp and the demo site shows a **WhatsApp button**
  (`https://wa.me/<digits>`) as the second action next to Call, never replacing Call.
- **In the brief and the profile it stays inferred.** `brief.contact.whatsapp = {number, verified: false, basis: 'uae-mobile'}`;
  nothing records it as verified. The site does not say how the number was found. When a source names WhatsApp,
  `verified: true, basis: 'source'`.
- **Why.** Small businesses in the UAE are contacted through WhatsApp; a demo with only Call lacks exactly the button their
  customers press. A UAE mobile number almost always has WhatsApp.
- **Risk accepted.** A number without WhatsApp yields a broken button: tapping it, WhatsApp says the number is not on WhatsApp.
  Akemi accepts this risk for demos.
- **Limits.** UAE mobile numbers only; other countries need their own rule. The dropped option "fill slots with derived facts"
  stays dropped: this exception is a contact button, not a claim about the business.
- **Code.** The `cta-real` gate (tracy-host `demo-qa.js`) lets exactly the WhatsApp links the brief gives (`whatsappLinks`) leave
  the demo; other wa.me links still fail. Build step: `apps/tracy-web/src/opportunities-build/brand-on-site.js`; contact line outside
  slots: `contactOf` (`pinned-copy.mjs`) and the `whatsapp` link kind (`contract-copy-pins.mjs`).
- **Service area (same day, item 17).** `business.serviceAreas` is a sourced verbatim quote, not an inference. The site
  shows a line such as "Serving: Locations across Dubai" next to the address, never replacing the address. Checked 26/10: the
  slot role set (`PLACE_CONTENT_ROLES`) has no area role; no role in `slot-roles/*.json` speaks of an area; the latest
  `content-map.json` of Tracy Business WordPress 1.3.8 and Joomla 1.2.6 and of JA Boxing 1.0.4 has only an address slot (as do
  the 36 templates with a contract in the repo, none has a service-area slot); Tracy Business EmDash has no `content-map.json`;
  so the build step puts one line in the existing contact text, and a template with a contact-line block outside slots
  (`facts` of ja-restaurant WordPress) gets a line under the address.


## Amendment 27/10/2026: one fact envelope with confidence and an on-site decision, one source of truth, key messages (settled by Akemi)

- **Who decided, when.** Akemi (COO) settled it on 27/10/2026, issue #1791, choosing option A for all four questions.
  This extends decision 4 (Tracy assesses every fact itself); it does not replace it.
- **Decision 1: confidence has exactly three levels, computed by Tracy from the evidence.**
  - `corroborated`: two or more distinct sources state the fact and it is not part of a `conflicts` entry; sources
    that disagree do not count as agreement.
  - `single-source`: one source states it (or several sources that disagree).
  - `inferred`: no source states it and Tracy derived it (`derivation.method: 'inferred'`, the evidence is only the
    input of the derivation, such as a phone number for WhatsApp), or no evidence leads to a source.
  - A sender's own `verified` or `confidence` is never read. The same rule holds for every trade.
- **Decision 2: code decides which facts go on the site by rule, the owner overrides on the Profile card, and the owner wins.**
  - Every item of the assessment (`assessProfile`, policy `demo-evidence/2`) gains `confidence`, `onSite`,
    `decidedBy` (`rule` or `owner`) and `reasons`.
  - Rule: accepted `corroborated` and `single-source` facts go on; an `inferred` fact goes on only when its kind is on a
    closed list (today exactly one kind, `whatsapp-uae-mobile`, per the 26/10 amendment); a fact with a reason to doubt
    stays off (`stale`, `not-on-demo`, implausible all-week 24-hour hours, a Google rating from under 5 reviews, a person
    named only in reviews, left off by the owner).
  - The owner's choice is keyed by the fact's stable `id` and stored on Tracy's side on the opportunity
    (`candidate.factOverrides`), so it survives Research again and every later revision. A choice for a fact that no
    longer exists is kept but has no effect.
  - The builder, the Profile card and the QA gate read the same `onSite`; the decision no longer lives in three places
    (`missing`, per-field flags, the assessment).
- **Decision 3: a revision references its frozen data by id and hash instead of copying it.** A new revision stores the
  research once (`wo_revision.research`) and the brief carries a hash reference (`agentDemoResearch`). Building from a
  revision whose referenced data no longer matches its hash fails loudly, as the snapshot check does. Revisions made
  before this change keep their embedded snapshot and are read as before; no stored revision is rewritten.
- **Decision 4: key messages.** The existing business-reading call (no extra model call) proposes up to three points,
  each `{label, factRefs, quotes}`; code drops a point whose quote is not in its source or that rests only on facts kept
  off the site; a business with little evidence gets none. The owner edits the label, reorders or removes points on the
  Profile card (`candidate.keyMessagePicks`) but cannot change facts or quotes. These are selections of facts, not
  pre-written copy: the dropped option "the profile carries pre-written copy" stays dropped, and wording is still
  written at build time (decision 6).
- **Code.** `domain/fact-confidence.mjs`, `domain/fact-assessment.mjs` (`factDecisions`, `ALLOWED_INFERRED_KINDS`),
  `src/owner-fact-picks.js`, the doors `PUT /api/website-opportunities/:id/facts` and `PUT …/:id/key-messages`,
  `GET …/:id/place-profile` now also returns `decisions`; `freezePlaceProfile` reads the opportunity's `factOverrides`.
