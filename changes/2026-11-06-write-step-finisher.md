- **Step 9 gains the finisher: after the write it finds customer-visible faults of a closed list on page screenshots,
  repairs them through the write door with typed orders, proves or undoes each repair, and runs the site check a final
  time** · Akemi (with Claude Code) · #426 · `feat/write-step-finisher` · 2026-11-06
  **Affects:** whoever runs `write-step-bench.mjs`, reads `repair-log.json`, wires step 9 into a build, changes the host
  capture stream, or sets models in /ops > Model & AI.
  - Bench: `finish --run <id> --out <dir>` starts at the finisher on a written site; `run ... --out <dir>` runs step 9
    whole (write, then finisher) through `runStepNine` (`write-step-nine.js`). No live build runs the write step yet.
  - Three doors (migration 203): `finisherFinder`, `finisherFixer`, `finisherChecker`, each with an effort in /ops;
    defaults finder max, fixer high (DeepSeek has no medium), checker high; an effort the model does not take refuses.
  - Seven repair orders, held to a per-fault menu; styles only from an allow list in the head injection module
    (ADR 0044 decision 30); the look guard admits only such rules. Capture layouts may carry `bands` and `boxes`.
  - Pages run as a pipeline, four at once; a place two pages share is written once; round two only retries rejected
    repairs. Hard limits: answers by 8 minutes (new work stops at 6, 2 kept for the final check, every site call let go
    after 60 s), model calls reserve their estimated cost against 1.5 USD (worst case in ADR 0044 decision 30).
  - A new blocking failure in the final check undoes only the repair on its slot or block; one naming neither is logged
    `unblamed`. A finisher that throws, or a final check that does not end in time, leaves the written site and the
    first check, and `runStepNine` says why.
  - The write step keeps the space before an emphasis line break; `glued-words` reads the words a visitor sees.
  - Words repairs (text, glued space, alt, link, title, accent, demo item) are judged by code on the served page, never by
    the checker; glued headings are spaced by code with no model; contract applies use `contract-finisher-` apply ids;
    a fault's menu lists only blocks holding its quoted words; demo-owned kit slots count as the block's own.
