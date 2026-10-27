# Layers: what every layer shares

Each layer lives in `tests/qa/layers/<layer>/` and is driven by `pnpm qa <layer>` (see
[`../README.md`](../README.md)). This file is the one description of the file every layer commits
in the same shape: `denominator.json`.

## `denominator.json`: one schema for the ten layers

A denominator says what the layer is responsible for: its items, the edge tags each item owes, the
tags that do not apply (with a reason and a source), and what the extraction could not resolve. It
never says a case ran or passed.

- Structure: [`../contracts/denominator.schema.json`](../contracts/denominator.schema.json)
  (`schema: "tracy-qa-denominator/v1"`). Every field outside it is refused.
- Rules a schema cannot say: [`../lib/denominator.mjs`](../lib/denominator.mjs). It is the single
  validator: the inventory build (`node tests/qa/inventory/build.mjs`), `pnpm qa coverage` and
  every layer generator call it. A generator refuses to write a file it rejects.
- Selftest: `node --test tests/qa/selftest/denominator.test.mjs` validates the ten committed files
  and each refusal.

```json
{
  "schema": "tracy-qa-denominator/v1",
  "layer": "api",
  "source": "what the items were extracted from",
  "revision": "a commit, a content hash, or null",
  "command": "node tests/qa/layers/api/generate.mjs",
  "naReasons": { "r0": "{id} declares no request body; source: apps/tracy-web/api-reference.snapshot.json" },
  "items": [
    { "id": "GET /api/config", "kind": "api-door",
      "requiredTags": ["happy", "anonymous"],
      "na": { "malformed-body": "r0" },
      "meta": { "membership": "public" } }
  ],
  "unresolved": [ { "id": "ALL /*", "kind": "dynamic-mount", "reason": "why it could not be listed" } ],
  "details": { "counts": { "public": 166 } }
}
```

| Field | Rule |
|---|---|
| `schema`, `layer`, `source`, `revision`, `command`, `naReasons`, `items`, `unresolved` | Required. `layer` equals the directory name. |
| `revision` | A commit (full SHA, or a 7+ hex token such as `origin/develop fa4dc66a5`), a content hash (`sha256:…`, `tree:…`, 64 hex characters) or `null`. Only a commit can be proven fresh: with a content hash or `null`, `pnpm qa coverage` reports `freshness cannot be proven` and keeps the layer open. |
| `items[].id` | Unique in the file. |
| `items[].kind` | One of the kinds the layer may list: `LAYER_CONTRACT[layer].kinds` in `lib/denominator.mjs`. A kind also fixes which edge-tag groups of [`../inventory/edge-tags.json`](../inventory/edge-tags.json) apply. |
| `items[].requiredTags` | The tags the item owes. A tag with no case stays required and open: an obligation is never removed, and never marked N-A, to make a check pass. |
| `items[].na` | `tag -> key` into `naReasons`. A tag is either required or N-A, never both. |
| `naReasons` | Each reason once, as `<reason>; source: <reference>`: the reason is at least two words; the reference is a repository file with an extension (optional `#anchor`), `ADR <n>` (optional `§<n>`), `#<issue or PR>` or an http(s) URL. `{id}` stands for the id of the item that cites the reason. A reason nothing cites is refused. |
| `items[].meta` | Facts of the item. Only the keys its kind declares (`LAYER_CONTRACT[layer].kinds[kind].meta`). |
| `unresolved[]` | `{ reason, id and/or source, kind?, detail? }`: what the extraction could not read or resolve. Every entry keeps the layer open in coverage. |
| `manual[]` | Optional `{ id }`: checks only a person can make (see "Manual checks" in the suite README). |
| `sourcePaths` | Optional git pathspecs the extraction read; coverage compares them with `revision` to tell a stale denominator. |
| `details` | What only that layer reads (counts, source hashes, its own coverage table). Only the keys the layer declares (`LAYER_CONTRACT[layer].details`). |

Adding a kind, a `meta` key, a `details` key or a layer-specific tag is a reviewed edit of
`LAYER_CONTRACT`, never a loosened check. `harness` adds one tag to the master list (`audit-seam`);
the reason is next to it in the table.

### What each layer writes

| Layer | Regenerate | Kinds | Revision |
|---|---|---|---|
| `static` | `node tests/qa/layers/static/generate.mjs` | `gate`, `rule-without-gate` | content hash of `GATES` |
| `unit` | `node tests/qa/layers/unit/generate.mjs` | `test-area`, `test-group`, `regression`, `regression-no-run` | content hash |
| `api` | `node tests/qa/layers/api/generate.mjs` | `api-door` | the pinned commit (`oracles/api/pin.json`) |
| `infra` | `node tests/qa/layers/infra/generate-denominator.mjs --write` | host routes and job kinds, cron timers and callbacks, Dockerfiles and their inputs, scripts, compose services, legacy suites | content hash of the sources |
| `ui` | `node tests/qa/layers/ui/generate.mjs` | `ui-story-screen`, `ui-story-block`, `ui-story-proposal`, `ui-client-entry`, `ui-slot`, `ui-tab`, `ui-switch`, `ui-language` | content hash |
| `flows` | `node tests/qa/layers/flows/generate.mjs` | `journey`, `flow`, `capability`, `door` | content hash |
| `harness` | `node tests/qa/layers/harness/generate.mjs` | approvals, dispatcher, dsh tools and rows, fences, mode matrix, tool surfaces, write paths | content hash |
| `cms` | `node tests/qa/layers/cms/generate.mjs` | `cms-release`, `cms-template`, `function`, `suite`, `live-catalogue` | tree hash |
| `mail` | `node tests/qa/layers/mail/generate.mjs` | letters, flows, tokens, preference groups, transports, site mail, rule | the oracle's commit |
| `related` | `node tests/qa/layers/related/generate.mjs` | `sibling-suite`, `handoff-contract` | hash of the specs |

Every generator has a check mode (`--check`) that exits 1 when a committed file differs from a
regeneration.

Known gaps, stated rather than hidden:

- Eight layers record a content hash as `revision`; coverage cannot prove them fresh and says so.
- A reason whose source is not a file stays an open obligation and is listed under `unresolved`
  (mail: 18 obligations of the token and transport items).
- `harness` reasons that rest on the live tool registry cite the extractor that reads it
  (`layers/harness/catalogue.mjs`); the schema that was read is pinned by `meta.schemaSha256`.
- The inventory matches a layer's claim to its own items by id. `api`, `mail`, `harness`, `unit`,
  `cms` and `related` name their items differently from the inventory extractors, so their claims are
  counted as `not-in-inventory` and the inventory's own items of those layers stay `unowned`.
