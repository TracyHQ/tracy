- **The brand crawl test checks fetched URLs by exact match, closing the last 2 CodeQL alerts of the develop→main release** — hano-xbt (with Claude) · #682 · `test/brand-crawl-exact-calls` · 2026-11-17
  **Affects:** `packages/design/tracy-brand-engine/test/crawl.test.mjs` only; no product code changes.
  **Why / Measured:** CodeQL reported "Incomplete URL substring sanitization" (high) on `calls.includes('https://...')`. `calls` is an array, so the check was already exact; it now reads `calls.some((u) => u === ...)` so the scanner sees that too. `node --test` on the file: 3 pass, 0 fail.
