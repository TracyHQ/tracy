# ADR 0041 — The site planner runs first on a trial bench in /ops, as a tool-using agent, apart from the WO build

- **Status:** (binding)
- **Date:** 02/11/2026
- **Decided by:** Akemi (COO), in a grilling session on 02/11/2026.

## Context

1. **A new build flow is being designed step by step.** A brief and a template kit go in; a site comes out. The
   first step is the **site planner**: it turns one brief into one site plan (`plan.json`) for one template, deciding
   for every part of the template whether it stays, how many rows it shows, what each row is about, what each
   picture frame calls for and where every link leads. Later steps (brand, writer, pictures, one write step) are not
   built yet.
2. **The planner prompt and its checker were approved outside the repo.** The approved system prompt (about 450
   lines, including the map-button rule added on 02/11/2026: a map button whose `opens.slotId` names a map-location
   setting slot is kept and led to `map:<address fact id>` when the brief has an address fact, hidden otherwise) and a
   deterministic checker with rules R00 to R19 (R19 checks that rule) were tried on the JA Boxing 1.0.10 kit
   (`packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.10/template-kit.json`, byte for byte the kit the
   reference run used). In the reference run the planner was Claude Opus 5.5 working as an agent: it read the kit part
   by part and opened kit images by id when its work reached them, about 70 tool calls and 12 minutes per pass. The
   checker found 29 failures in the first plan; one fix pass in the same session left none.
3. **Nothing in the repo runs that shape of model call.** The quality path (`apps/tracy-web/src/opportunities-build/
   quality-*.js`) calls a model once and parses one JSON reply, and `callQualityModel` accepts only a DeepSeek-style
   door profile. No code in `apps/tracy-web` loops over tool calls through the door system.
4. **Model access on dev, measured 02/11/2026.** The dev server has two providers, OpenRouter and DeepSeek, and no
   Anthropic key of its own. A probe through the OpenRouter key reached `anthropic/claude-opus-5.5`, which answered
   with a correct tool call. No door uses an Anthropic model today.
5. **Kit images are not in the repo.** The kit JSON lists 110 images (about 17 MB) with their sha256; the images ship
   in the `template-kit-<template>-<version>.zip` asset of the quickstart's GitHub release. No code fetches them.
6. **The quality run tables belong to the WO build.** `wo_quality_run` allows one run per brief revision and freezes its
   input, and every row stands for a site being built for a customer.
7. **The repo is public.** The reference run's brief describes a real business; it may not become a fixture.

## Decision

1. **A trial bench, apart from the WO build.** The planner runs only on a bench in `/ops`: pick a brief, pick a kit,
   run, read the result. It writes nothing to any site, adds nothing to the WO queue and touches no quality run.
2. **A new /ops group, "WO New Flow Test".** Its first row is "Site planner". Every later step of the new build flow
   gets its own row in this group while it is under test. The group name is the same in every interface language.
3. **The planner is a tool-using agent, with the approved prompt unchanged.** Two tools: read one part of the kit, and
   open one kit image by id. The prompt text is stored as approved and recorded by hash on each run. The prompt still
   mentions a reviewer; there is no model reviewer on the bench (decision 5), and the prompt is not edited for it.
   **The harness matches the reference run, not just the model.** The reference run's quality came from the model
   and from the agent harness around it: extended thinking, a long output budget, images opened one at a time at full
   size, the conversation kept whole across fix rounds, and the prompt cached between turns. The bench reproduces each
   of these, records them on every run, and measures the gap by comparing its plan with the reference plan.
4. **Model: Claude Opus 5.5 through the existing OpenRouter provider**, on a new door "site planner" set in `/ops`
   like every other door. The prompt has been tried on Opus 5.5 only; changing the model means trying the prompt
   again first.
5. **One pass, then at most two fix rounds, in the same session.** The checker reads the plan; if it fails, its failure
   list goes back to the same planner conversation, which answers with the whole plan again. After two fix rounds any
   failure still standing is listed, not hidden. There is no model reviewer.
6. **The checker becomes a pure module with tests.** It takes a plan, a kit and a brief and returns the result per rule.
   Rule ids and rule content stay as approved (R00 to R19); only machine paths and the flag for old plans go. Re-scoring
   both reference plans (the run before and the run after the map-button change) with the module must give exactly
   what the approved script gave for each; that check runs locally, since the reference plans are not committed.
7. **Its own tables.** One row per bench run (brief, kit, prompt and checker hashes, model, state, cost) and one row per
   round (the plan, the checker result, the failure list sent back). Every version of the plan is kept; the same brief
   may run any number of times. The run survives a redeploy: it resumes from its last saved turn and never replays a
   model call that was already sent.
8. **Kit images come from the release zip.** The first time a kit version is needed, the server downloads its zip,
   checks every image against the sha256 the kit lists, and caches the images on the server's disk. The image tool
   reads from that cache. Images are never committed.
9. **Two screens.** A list of runs with a run button (brief, kit), state and cost per run; and a run page that shows
   the plan the way the approved plan reader page does (with kit images), the checker result of every round, the
   planner's tool trail (folded by default; one line per call with time and running cost) and a download of
   `plan.json`.
10. **Briefs: from the database, or pasted.** The run form picks a brief revision from the database or takes a pasted
    brief JSON, which is stored with the run on that server only. Automated tests use an invented brief built on the
    invented "Harbour Sport Club" fixture and a scripted fake model; no test calls a real model.
11. **Access and cost.** Only internal `/ops` users can run it, one run at a time, with each run's cost shown. No
    spending cap.

## Consequences

- The bench is the place where a new step proves itself before it touches a customer's site. How the planner's plan
  reaches the WO build (through the quality path or a new path) is decided when the later steps exist, not now.
- The tool loop over a door is new code; the single-shot quality path is unchanged.
- The first acceptance: on `cowork.tracy.site`, the reference brief with the JA Boxing kit gives a plan that passes the
  checker within two fix rounds (or lists what still fails), the run page reads like the approved plan reader page, and
  the plan has been compared with the reference plan. The owner approves the run page.
- Adding a template to the bench needs only its kit JSON in the contract and its kit zip on the release.

## Alternatives rejected

- **One call with every image in the prompt.** Up to 110 images per pass, and the prompt's way of working (open what
  you need, when you need it) would have to be rewritten, so results would no longer compare with the approved run.
- **Reuse the `woEditorial` door.** Changing its model would change the WO build too.
- **Store runs in `wo_quality_run`.** One run per revision, a frozen input, and rows that read as customer builds.
- **Commit the kit images.** 17 MB per template version in a public repo, out of step with how kits ship.
- **Place the bench under "Website opportunities" or "Builds".** The new flow gets its own group so later steps land
  together and the running groups stay as they are.

## Amendment 03/11/2026: no UI, and how a lost call and a fix round are sent (settled by Akemi)

- **Who decided, when.** Akemi (COO), on 03/11/2026, while the tickets were cut (#299, #301, #303).
- **No UI.** Decisions 1, 2, 9 and 11 lose their screens: the bench has no `/ops` group, list, run page, route or API
  endpoint. Runs are started, read and cancelled with a command-line script inside the tracy-web container
  (`kits`, `run`, `list`, `status`, `get`, `cancel`), which calls the bench service directly. Access is whoever can run
  commands in that container. `get` downloads every plan version, the checker result and the failure list of every
  round, the failures still standing, the run meta and a compact turns log. A plan is read and approved off the server:
  the team turns `plan.json` into a page on their own machine with the approved plan reader script. No plan reader is
  built into Tracy. The "site planner" door (decision 4) is still set in `/ops` like every other door.
- **A lost call is sent once more (refines decision 7).** A call recorded as dispatched with no answer (the process
  died while waiting) is marked abandoned and its request is sent once more as a new turn naming it; a model call has no
  effect besides its cost. If that resend is lost too, the run fails. Nothing else is ever replayed.
- **A fix round is the next user turn (refines decision 5).** The failure list goes back as the next user message of
  the same conversation, with every reasoning and tool turn kept. An answer that is not one JSON object is not scored:
  a short message asking for the whole plan as one JSON object goes back instead, and it counts as a fix round.
- **Images are stored by reference (refines decision 8).** A saved turn keeps a reference to each opened image (kit,
  image id, sha256), never its bytes; every request still sends the full images, read back from the cache when a run
  resumes or a fix round replays the conversation. A kit whose images are not usable is refused before any model call.
- **Images reach the model fitted inside 2000x2000 px (refines decision 3's "full size").** The provider refuses a side
  over 8000 px, and over 2000 px once a request carries more than 20 images; full-page captures are up to 10000 px
  tall, so each is scaled down (aspect kept, never enlarged) as the reference run's harness also did, and the fitted
  copy is cached by image id and sha256 while the sha256 check stays on the original.
- **Output budget of 128000 tokens and a 45 minute call (parity with the reference harness).** Claude Code ran the
  reference runs with 128000 output tokens, thinking included, and the reference plan alone is about 50k tokens; the
  bench records the same budget on every run, and a call that long, not streamed, gets 45 minutes.
- **Transient provider errors are retried inside the turn (parity with the reference harness).** A 408, 409, 425, 429,
  500, 502, 503, 504 or 529, an overloaded or rate limit error in a 200 body, or a network error before any response
  is tried again up to 5 attempts with exponential backoff and jitter (Retry-After honoured, 60 s at most per wait);
  400, 401, 403, 404 and content filter refusals never are. Each failed attempt is recorded on the turn and shown in
  the turns log.
