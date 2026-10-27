# Issue #993 — the sign-in situations the QA suite must carry (pinned copy)

Source: https://github.com/TracyHQ/tch/issues/993 — "Sign-in cancelled at Google shows the "took too long / another browser" page, with text touching the card border". Copied 2026-10-07 (the issue as last updated then).
Only the two sections a case cites are copied, word for word: what the issue expects of a sign-in
cancelled at the provider, and its checklist for this suite. An oracle outside the repository counts
only as a copy pinned here: the cases cite this file, and its hash is pinned where a layer pins its
oracle sources (`tests/qa/oracles/flows/requirements.json`). When the issue changes, copy it again and
read the cases that cite it.

### Expected

- A sign-in cancelled at the provider says so: cancelled at {provider}, nothing was changed, with the way back to sign in. Nothing the provider sent is displayed. Stale / expired / foreign state keeps today's sentence. The state stays single-use.
- The new sentence exists in every interface language (en, vi, de, it, fr, nl, zh, es).
- All three pages have their text inside a padded card part, in both themes and on a narrow viewport; no nested `<main>`.

### Follow-up: sign-in needs a thorough flow in the QA suite (#990)

Neither defect was caught by a test. The QA suite being built in #990 must carry a full sign-in flow, not only the happy path:

- [ ] Email code: request, wrong code, expired code, reused code, link opened in another browser
- [ ] Google and GitHub: success, **cancelled at the provider**, stale/expired state, state from another browser, refused code exchange, unverified email, provider not offered on this deployment, malformed `/signin` link
- [ ] Device sign-in: confirm page, approved page, invalid link
- [ ] `next` handling: a retry from the failure page ends where the person was going; an off-origin `next` is dropped
- [ ] First sign-in carrying a source/campaign (#936), and sign-in of a waitlisted / not-yet-admitted address
- [ ] Every failure page: the right sentence for the reason, in each interface language, with a visual check (padding, both themes, narrow viewport) — the layout defect above is invisible to a text assertion
