# `from-brief` — only a written description

> **Packet P1.** The poorest source, and the source that **loses the strongest acceptance gate**. Read the whole
> §What is lost section before taking the job.

## No script, and there cannot be one

All three Tracy skills leave `from-brief` as hand work, because there is nothing to read: no DOM, no
files, no database. You write `site-model.json` ([`site-model.md`](../site-model.md)) and
`visual-contract.md` directly from what the user describes.

```jsonc
{
  "$schema": "tracy-site-model/v1",
  "source": { "kind": "brief", "parity": "declared" },   // ← declared, not measured
  …
}
```

## 🔒 What is lost: parity

Every other source gives a **reference to compare against**: the source page renders, so the gate can compare both sides and
say "the output matches the source". A brief renders nothing. What remains is only **self-consistency**: are the declared
tokens used, does every route have a view, does the text follow `content-contract`.

That means: the output must still be complete — every variant, every state, 404, dark — but **nobody can prove
it looks like what the user pictured**. Say that sentence before starting, do not let it surface at P7.

Concrete consequences for the acceptance contract:

| | Renderable source | Brief |
|---|---|---|
| `source.parity` | `measured` | `declared` |
| Two-sided computed-style comparison | yes | **no** |
| Source images in Visual QA | yes (`--source-site`) | **none** — lenses grade the output only |
| `design.rules` | measured from the source | **declared by hand**, and must record who decided |

## Making it less fragile

1. **Ask for a visual reference, even just one.** A site the customer likes, a screenshot, a colour palette —
   `parity: declared` with three measured rules still beats nothing.
2. **Settle `content-contract.json` early** (`references/content-model.md`): company name, figures, contact
   details are **facts**, not sample text. Inventing figures in a brief is a worse error here, because there is
   no source for anyone to check against.
3. **Every aesthetic decision you make yourself → one line in `DECISIONS.md`.** Six weeks later nobody remembers
   whether that colour was the customer's choice or the agent's.
