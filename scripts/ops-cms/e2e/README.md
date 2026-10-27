# Browser acceptance for `/ops/cms`

Two harnesses. They drive a real Chrome over CDP against a **running deployment**, so they are
deliberately **not** part of `pnpm test` — there is no server in a unit-test run, and a suite that
quietly passes when the thing under test is absent is worse than no suite.

| File | Answers |
|---|---|
| `screens.mjs` | Do the seven screens render, at four viewports, with the drawers behaving as drawers? |
| `race.mjs` | Can a held answer from the ref you LEFT land on the ref you are looking at? |

## Run them

```bash
printf 'tracy_sess=…' > ~/.tracy-ops-cms-cookie      # a staff session from the target deployment

E2E_ORIGIN=http://localhost:51770 \
E2E_COOKIE_FILE=~/.tracy-ops-cms-cookie \
E2E_COOKIE_DOMAIN=localhost \
  node scripts/ops-cms/e2e/screens.mjs out/1440 1440 900 light

ORIGIN=http://localhost:51770 COOKIE_FILE=~/.tracy-ops-cms-cookie \
  node scripts/ops-cms/e2e/race.mjs out/race
```

`screens.mjs` takes `<out-dir> [width] [height] [light|dark]`; run it once per viewport. Each run
writes screenshots and a `results.json` next to them, and exits non-zero on the first failure.

## What `race.mjs` is for, and how to check it is not lying

It installs a `fetch` shim before the app's own script runs, parks the Dev snapshot response,
switches to Main, lets Main paint, then releases the stale Dev response — and separately, fails one
late. The assertions are about what stays on screen: Main's ref, Main's commit, Main's CMS.

A test like this is worthless if it passes no matter what, so it was checked against a build with
the guard taken out (`packages/web/tracy-harness/src/cms/App.tsx`, the `wanted.current !== route.env`
check and the effect's `ac.abort()`): **13/13 with the guard, 9/13 without**, and the failure reads
`Ref origin/develop · Commit d0da35c55` under an Environment selector that still says Main. Anyone
doubting the test should redo that — remove the guard, rebuild the SPA, and watch it go red.

Two traps already paid for, both of which made the suite pass for the wrong reason:

- **Selecting the ref you are already on issues no request.** The first version started on Dev and
  asked for Dev, so nothing was ever parked and every later assertion was vacuous. The sequence must
  be Main → Dev → Main, and the "a request is parked" check exists to keep it that way.
- **A drawer that never opened makes Escape and focus-return pass trivially.** If the open check
  fails, `screens.mjs` now records the two that follow as failures instead of letting them agree
  with an empty page.
