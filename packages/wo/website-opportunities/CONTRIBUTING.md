# Contributing to Website Opportunities

Thank you for helping. This project is **pre-release**: the code is still being moved into this
repository, so a few things below are marked **(planned)**. Where something exists today, this file
names it; where it does not, it says so.

## What you can add

Most contributions are one small file. There are four kinds of plugin. Each has an interface, a
loader and one example in the repository. Details and skeletons: [docs/plugins.md](docs/plugins.md).

| Kind | Folder | What it implements | Example |
|---|---|---|---|
| **Source** | `src/plugins/sources/` | An object with an `id`, a `label`, the `credential` it needs and the capability `groups` it answers (for example "Find places in an area" or "Web search"), plus `discover(area, deps)` returning candidates or `collect(place, deps)` returning evidence. `deps` brings `fetch` and the key. | `osm.js` (OpenStreetMap) |
| **Scoring rule** | `domain/scoring/` | An object with an `id`, a `weight` and a pure `score(evidence)` that returns `{ points, reason, params? }`, where `points` is `null` while the data is still being checked, or `null` when the rule does not apply. | `no-website.mjs` |
| **Outreach template** | `src/plugins/outreach/<lang>/` | `demo.json` with the strings for one language: `greeting`, `body`, `expiry`, `kept`, `subject`, with the placeholders `{place}`, `{url}` and `{expires}`. | `en/demo.json` |
| **Builder** | `src/plugins/builders/` | A factory returning the members the router calls: `routes`, `settingsOf`, `saveSettings`, `templateChoicesOf`, `listedDemoOf`, `detailOf`, `demoFactsOf`, `demoJourneySql`. | `manual.js` (export the brief, record a demo built elsewhere); `tracy.js` (send the place to Tracy, which builds and hosts the demo) |

A new kind of business for the Find search is data, not a plugin: one row in `domain/trade-search.mjs`
(see [docs/plugins.md](docs/plugins.md#kinds-of-business-an-area-search-finds-domaintrade-searchmjs)).

Data contributions to the shared research hub are a different thing and are not plugins: they go
through the hub's checked submission flow (planned). A data contribution never runs code from the
person who sent it.

## Before you start

- Search open issues and pull requests first, so two people do not build the same thing.
- For a new data source, open a "New data source" issue first. A source is code that runs with
  network access and your users' keys, so maintainers review it more carefully than a template.
- Keep pull requests small. One plugin per pull request is ideal.

## Development

Requirements: Node.js 22.19 or newer (24 recommended), and Docker to run the full server (`docker compose up`, see the README quickstart).

```sh
npm install
npm test            # Node's built-in test runner (node --test)
npm run typecheck   # (planned) TypeScript over the typed entry points
```

The package manifest and scripts are being added; until then, the tests of the domain modules run
with `node --test`.

Rules that tests and reviewers check:

- **Pure where possible.** Sources take `fetch` as a parameter so tests can pass a fake one. Scoring
  rules and templates are pure.
- **No invented data.** A value you could not measure is `null` (unknown), never a guess. The UI
  shows unknown as unknown.
- **Every value keeps its source** and the time it was fetched.
- **Untrusted input stays untrusted.** Do not fetch a URL that came from the web with a plain
  `fetch`; use the URL guard in `domain/url-guard.mjs` and the pinned fetch that checks the address
  actually dialled. See [SECURITY.md](SECURITY.md).
- **English only** for code, comments, strings, docs and commit messages. Third-party data (business
  names, reviews) is kept verbatim and is not translated. Outreach templates are the exception by
  design: they are written in the language they serve.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description in the imperative mood
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `style`. Scopes are short:
`sources`, `scoring`, `outreach`, `builders`, `hub`, `ui`. Example:
`feat(outreach): add a Dutch template`.

## Licence of contributions

There is nothing to sign. This project is licensed under the [Apache License 2.0](LICENSE), and
section 5 of that licence covers contributions: unless you say otherwise in your pull request,
anything you submit for inclusion is licensed under the same terms.

By opening a pull request you confirm that you wrote the change, or have the right to submit it
under this licence.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By taking part you agree to it.

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
