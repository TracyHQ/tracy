# Contributing to Tracy

Thanks for helping. This file covers what a change needs before it can be merged. How the system runs is
in [`SYSTEM.md`](SYSTEM.md); what Tracy is for, and what it deliberately is not, is in
[`CONTEXT.md`](CONTEXT.md). Read both before a larger change.

## Before you start

- **Look for existing work.** Search open issues and pull requests first. For anything bigger than a
  small fix, open an issue (or comment on one) so the approach can be agreed before you write code.
- **Start from the latest `develop`.** `develop` is the integration branch and moves quickly; `main` is
  what gets released. Cut your branch from `develop` and merge `develop` back in before asking for review.
- **Security problems are not issues.** Report them privately, as described in [`SECURITY.md`](SECURITY.md).

## Setting up

Follow [Getting started](README.md#getting-started) in the README: clone with submodules,
`pnpm dsh:build`, `pnpm install --frozen-lockfile`, then `pnpm build:check`. The README also shows how to run
the whole system locally with `deploy/compose.yml`.

## Making a change

- **One change, one pull request.** Keep follow-up fixes for the same work on the same branch.
- **Reuse before adding.** Most things already have a convention or a nearby example; extend it rather than
  building a parallel version.
- **Follow the boundary rules.** Dependencies come from npm or from this workspace only (`workspace:`), never
  `link:`/`file:` or absolute paths. A plugin's `lib/client.js` bundle is committed: rebuild it with
  `pnpm build` when you change the plugin. Code under `vendor/` belongs to other projects; change it through
  its fork, not in place. The gates in `scripts/check-all.ts` enforce most of this.
- **UI changes** follow [`DESIGN.md`](DESIGN.md). Plugins run inside the dsh page, so they must not ship a
  CSS reset or Tailwind preflight of their own.
- **Text users see** goes through the plugin's `strings.ts` and is translated into every interface language
  in the same change; the `interface-languages` gate names anything missing. Never hard-code English in JSX
  or in `aria-label`/`title`/`placeholder`.
- **Language.** Code, comments, commit messages and documentation are written in English.
- **Tests.** Add or update tests next to the code you change. A bug fix or a feature also adds a regression
  case under `tests/regression/cases/` (see the README in `tests/regression/`); a feature may instead
  state in its description why it needs none.

## Checking your work

```bash
pnpm build:check     # every gate, the same list CI runs
pnpm test            # every test suite
pnpm test:lint       # lint, typecheck and format, without rewriting files
```

Some suites need a database (`TEST_DATABASE_URL`) or a browser; the gate output says when it skipped one.

## Commits

Use the form `type(scope): short description`, imperative mood, lowercase after the prefix, for example
`fix(site-changes): keep the diff open after a revert`. Types: `feat`, `fix`, `refactor`, `docs`, `test`,
`chore`, `perf`, `style`.

## Pull requests

Open the pull request against `develop`, as a draft while work is still landing. The template asks for:
what changes for the user (before and after), why it is needed, how you verified it, and how it behaves in
the web app and in the desktop app. Fill in every section; CI checks they are not empty. A maintainer
reviews, runs the full CI, and merges.

By contributing you agree that your contribution is licensed under the same terms as the files it
changes (MIT for Tracy's own code; see the License section of the README).
