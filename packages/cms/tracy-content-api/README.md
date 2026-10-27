# Tracy Content API conformance

Pre-release `tracy-content/v1`. `schema.json` is the single machine-readable shape definition;
`validate.mjs` evaluates its explicitly bounded JSON Schema vocabulary and adds graph/locale/byte
invariants. No dependencies, HTTP endpoint, CMS access, auth or cursor implementation.

```js
import { validateContent, validateContentGraph } from './validate.mjs'
const errors = validateContent(response)
// Once the adapter has supplied the authorized reference scope, including referenced detail:
const referenceErrors = validateContentGraph(contents)
```

Both return `{ code, path, message }[]`; empty means only the stated checks passed. Neither
mutates input. `validateContent` accepts unknown optional fields for v1 evolution, rejects a
different schema version, and defaults to a configurable 256 KiB UTF-8 response budget.
A `tracy-content-pages/v1` document (`validatePages`) is held to the same budget: the relay cuts
its `pages` at whole rows to fit, sets `truncated: true`, and names the narrower read in `next`
(one `locale`, or one `type` through the ordinary listing); `later` is the `changedSince` read.
`validateContentGraph` checks references across a collected scope, not just one page; it does
not fetch missing targets or authorize the supplied scope. Validate each envelope first.

`summary` omits heavy fields; `complete` requires them; `partial` requires a continuation link.
Unknown scalar values are null, known empty lists are arrays. Shared occurrences carry empty
fields/items and point to one shared source. Positions belong to the containing owner, and
continuation pages preserve absolute positions rather than renumbering their first item to zero.
`publication` distinguishes CMS status from which value was read (published, draft, current or
unknown); shape conformance does not establish permission to see a draft.

The fixtures contain **release samples/seed extractions**, not live CMS responses. Exact source
paths, hashes, JSON pointers and the synthetic remainder are recorded in `test/fixtures/sources.json`.
Tests re-read each source and check the extraction. Synthetic graph/translation/media/continuation
cases establish contract behavior only. No sample can be used by a production adapter as live data.

Run `node scripts/check-content-api.mjs` from the repository root. The `content-api` build gate
and the existing `test:workers` glob both discover this suite. No new install is needed.

Governance remains in `tracy-docs` (TCH ADR index). During P0–P1 this TCH library is the sole
implementation candidate. Before any adapter release, record the cross-repository protocol
approval there, then pin this corpus/schema/validator by release commit and SHA-256 in Cowork
and the EmDash kit CI. Do not hand-maintain three validators. PHP producers need not execute
JavaScript in a customer request: their CI runs this shared Node conformance suite on captured
output. No published contract profile is modified by this package.

Integration amendment (25 September, PO request): an oversized `bodyHtml` error may advertise
`error.links.firstBlock` with `error.snapshot`. The link carries owner `id`, `blockId` and signed
`blocksCursor`, never credentials or caller authority. Shape tests do not establish signature,
authorization, snapshot isolation or link custody. Existing errors without discovery stay valid.
Adapters must pass the new runtime acceptance before advertising this optional capability;
WordPress's current bare blockId chain is not that proof. See the TCH Content API specification.

## v2 additive extensions (26 September)

Claude Cowork plugins keep producing plain `tracy-content/v1`; every key below is optional, so a Claude Cowork plugin
that attaches nothing stays valid. `RELAY_EXTENSIONS` in `validate.mjs` is the single list of
their names (`writable`, `constraints`, `next`, `protocol`); the relay imports it.

**Envelope, attached by the relay** (the envelope still says `schemaVersion: "tracy-content/v1"`):

- `protocol: { selected: "tracy-content/v1", relayExtensions: string[], cowork: { kind:
  "joomla"|"wordpress"|"emdash", capability: "v1"|"unsupported" } }` at top level.
- `writable: true|false|null` on `contents[]`, `blocks[]` and every field (content, block and
  item fields). Inheritance: `false` on an owner makes every tier below it `false` (item fields
  inherit from their block); `null` means the relay did not determine it and implies nothing;
  `true` on an owner does not force its children. Violations are `WRITABLE_INHERITANCE`
  (checked by `validateContent` and `validateContentGraph`). A field with a `slotKey` may still
  be `writable: null`.
- `fields[].constraints: { maxCharacters: integer|null, requiresEvidence: boolean|null,
  emptyAllowed: boolean|null } | null`, meaningful only for a slotted field; non-null without a
  `slotKey` is `CONSTRAINTS_WITHOUT_SLOT`.
- `fields[].next: { tool: "tracy_site", action: "content.contract", operation: "apply",
  changes: { "<slotKey>": null } } | null`, the call that writes this slot. Non-null while
  `writable !== true` is `NEXT_WITHOUT_WRITABLE`; `changes` naming anything but exactly this
  field's `slotKey` is `NEXT_SLOT_MISMATCH`; a non-null change value is a schema error.
  EmDash has no contract (28 September): its `next` is `{ tool: "tracy_emdash", action:
  "content_update", arguments: { collection|null, id: "<slug>", locale|null, data, status:
  "published" } }`, where `data` holds exactly one path to a null placeholder ending at this
  field's key (`{key: null}`, or `{list: {"<row>": {key: null}}}` for a repeater row); anything
  else is `NEXT_FIELD_MISMATCH`. `collection` is null unless one collection maps the type.

**Describe document**, `schemaVersion: "tracy-content-describe/v1"` (`DESCRIBE_SCHEMA_VERSION`),
a third branch of the root `anyOf`. Every nullable key is present. It states the site and its
locales, provenance, `protocol`, `scope: "published"`, `i18n` (`mode: "entity"`, `fallback: null`),
`presentation` (`locked|unlocked|unknown`), the viewer's `permissions` (role, toolsets,
`read: true`, `apply`), content `types` with a nullable `count`, `blockKinds` (kind, label, root,
nestable and fields with a v1 value type, `translatable`, `writable`, `constraints`),
`capabilities` (`ai.tracy.content.*` names with a version), `guidance` (at most 600 characters,
counted in code points) and `links`. `validateDescribe` (also reached through `validateContent`
by version) checks shape, the 256 KiB budget, canonical declared locales with the default among
them, unique types, kinds, field keys within a kind and capability names, the capability prefix
(`CAPABILITY_NAME_INVALID`), and that `permissions.apply` holds exactly when
`ai.tracy.content.slot-write` is offered (`APPLY_CAPABILITY_MISMATCH`). Any other version is
`CONTENT_VERSION_UNSUPPORTED`.

`where` (optional, 28 September) is the relay's per-quickstart map of where search-engine
fields, design, menus, pages, forms, analytics, robots, redirects and language strings live and the call that
changes each: `{quickstart, guidance ≤ 300, topics: {<topic>: [{what, where, door:{tool, …},
toolset, languages}]}}`, offered with capability `ai.tracy.content.where`. The relay reads it
off checked files (`apps/tracy-web/src/sites/where/`), never off the site.

`types[].next` is an optional ready-to-call listing: `{tool:"tracy_site", action:"content.read",
params:{type:"<this row's type>"}}`, or null when the Claude Cowork plugin has not demonstrated v1 support.
It uses the Claude Cowork plugin's default locale, as the count probe does; callers may select a locale from
`site.locales` for a later query. The validator rejects mismatched types, extra query selectors,
write actions and calls advertised for an unsupported Claude Cowork plugin. Older documents without `next`
remain valid. `blockKinds[].kind` describes CMS storage and is not a `content.read` query type.

`describe-map.mjs` derives `blockKinds` from a release's own files, for the fixtures and the
relay alike. Joomla and WordPress group content-map slots: the kind is the entity kind; the
field key is `<column>:<type>` for Joomla (one column holds several value types) and the block
`metadata.name`, option, or `<option>.<field>` for WordPress. A constraint is stated only where
every slot of the field agrees, otherwise null (read the per-slot value from the envelope).
EmDash maps each site-model type to a root kind and each group field to a nestable kind
`<type>.<field>`, with every `writable` null and no slot-write capability.

Fixtures `*.v2.json` are the v1 fixtures with the relay keys attached; `*.describe.json` come
from the Tracy Business profiles (Joomla/WordPress `content-map.json`, EmDash `site-model.json`),
their `blockKinds` regenerated and every slot proven to map into exactly one field by the tests.
Both kinds are recorded in `test/fixtures/sources.json`; neither is a live response.
