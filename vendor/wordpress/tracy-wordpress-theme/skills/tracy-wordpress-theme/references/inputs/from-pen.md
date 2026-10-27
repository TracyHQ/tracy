# Adapter — Pencil `.pen` → spec-pack

> **Phase 2 packet.** Read [`spec-pack.md`](spec-pack.md) first.

**No adapter yet, not proven.** This skill has no script that reads `.pen`, and no WordPress build
has started from Pencil yet, so there are no steps to copy here — the T4 version has an MCP procedure
(`get_variables`, `batch_get`, `get_screenshot` → `kind: image`) but it has not been rerun on
WordPress and is not treated as proven just because it exists elsewhere. The path today: export the design to
HTML (Pencil can export frame by frame), then use [`from-html.md`](from-html.md); record in `provenance.json.notes`
that the origin is `.pen` and the HTML is an export, with the file name and the time. When there is a real build from
`.pen`, this packet is rewritten from that build — not sooner.
