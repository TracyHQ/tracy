## What this changes

<!-- In plain language: what a user of the tool sees before and after. -->

## How it works

<!-- The mechanism you changed, not only the symptom. Why this approach over the alternatives. -->

## Kind of change

- [ ] Data source (`sources/`)
- [ ] Scoring rule (`scoring/`)
- [ ] Outreach template (`outreach/<lang>/`)
- [ ] Builder adapter (`builders/`)
- [ ] Core (find, assess, reach, pipeline, hub, UI)
- [ ] Docs or CI

## Checklist

- [ ] Tests added or updated, and `npm test` passes
- [ ] No API keys, tokens or private business data in code, tests or fixtures
- [ ] Values that could not be measured are `null`, never guessed
- [ ] Code, comments, strings and docs are in English (outreach templates excepted)
- [ ] Untrusted URLs go through the URL guard, not a bare `fetch`
- [ ] Commits follow Conventional Commits
- [ ] I wrote this change or have the right to submit it under the Apache License 2.0
