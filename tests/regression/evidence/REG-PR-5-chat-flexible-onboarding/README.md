# Conversational onboarding acceptance

## Local Chrome with the real model

The local compose entry on port 51710 served the shell and catalogue. Playwright supplied this branch's five built plugin bundles and forwarded the assistant routes to the new backend with an isolated PostgreSQL database and the configured real model. The shared stand was borrowed without restarting it. This is a local overlay acceptance, not a rebuilt-image deployment claim.

- `local-chat.png`: the customer describes a bakery, its location, green styling and two desired languages, then changes WordPress to Joomla without repeating the other details.
- `local-handoff.png`: pressing the Joomla text action opens the real setup wizard; the business name and description are filled. The description retains the multilingual wish; the language selector stays empty because initial setup uses one language. No site is created during this check. All five updated bundles loaded and no page errors were observed.
- `mobile-manual-edits.png`: the real wizard and stylesheet at 390px, with deterministic question/catalogue API fixtures. A manual name edit and an intentionally cleared description survive a newer chat draft. This screenshot is component acceptance, separately from the real-model run above.

An earlier real Chrome run caught an invalid extraction response with shortened question keys. The prompt now lists exact canonical feed keys, a JSON shape example, and feed-only CMS fields. The same real-model scenario then completed through the customization step. Invalid model output is still rejected rather than mapped or guessed.

## Automated regression

`REG-PR-5-chat-flexible-onboarding` runs eight draft/controller tests and eight browser cases. It covers revisions, queued corrections, reversed action responses, manual edits and clears, tab remounts, changed import addresses, changed business queries and final creation remaining explicit. The backend suite separately verifies account/session ownership, limits and revision changes during extraction.

## Deployment acceptance

Pending deployment and a fresh Chrome check against the dev installation. Local overlays are not evidence of a deployed image.
