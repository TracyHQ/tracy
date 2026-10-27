// Preload for `scripts/run-clock-shift.mjs` (`node --import scripts/clock-shift.mjs --test <files>`):
// it moves the process clock FORWARD, so a test that only passes near the day it was written fails
// today instead of on that later day.
//
// WHY A MACHINE. `beta-operation-signal.test.mjs` minted a session cookie at a fixed 01/10/2026
// clock and sent it to a door that verifies on the wall clock. Sessions live 72 hours, so the test
// was green until 04/10 02:00 UTC and then red on every run of every pull request (four red runs,
// fixed by #838). No diff shows that on the day it is written, and no reader runs a test "400 days
// from now" in their head. Running it there is exact: a credential minted and verified on the same
// clock (both real, or both injected) passes under any shift; only a fixed mint time checked
// against the real clock fails.
//
// Shifted: `Date.now()`, `new Date()` with no arguments, `Date()`. Untouched: `new Date(<value>)`,
// `Date.parse`, `Date.UTC`, the prototype (so `instanceof` and subclasses keep working), timers and
// the monotonic clocks (`performance.now()`, `process.hrtime`).
//
// `TRACY_TEST_CLOCK_OFFSET_DAYS` sets the distance. Unset = 400: longer than the credential TTLs
// here (sessions 72 hours, team invitations 7 days) and longer than a year, so a yearly expiry is crossed too.
// `0` is the control run. Anything that is not a plain non-negative number is refused BEFORE `Date`
// is replaced: a typo must not quietly run the suite on the real clock and report it as shifted.

const RealDate = Date
const DAY_MS = 86_400_000
const raw = process.env.TRACY_TEST_CLOCK_OFFSET_DAYS
if (raw !== undefined && !/^\d+(\.\d+)?$/.test(raw)) {
  throw new Error(
    `clock-shift: TRACY_TEST_CLOCK_OFFSET_DAYS must be a non-negative number of days, got ${JSON.stringify(raw)}`
  )
}
const offsetMs = (raw === undefined ? 400 : Number(raw)) * DAY_MS
if (Number.isNaN(new RealDate(RealDate.now() + offsetMs).getTime())) {
  throw new Error(
    `clock-shift: TRACY_TEST_CLOCK_OFFSET_DAYS=${raw} moves the clock past the last date JavaScript has`
  )
}

const realNow = RealDate.now.bind(RealDate)
const now = () => realNow() + offsetMs
// On the original object, not in a `get` trap: a test that stubs `Date.now = () => fixed` and later
// restores it must keep working exactly as it does without this preload.
RealDate.now = now
const ShiftedDate = new Proxy(RealDate, {
  // `new Date()` and `new (class extends Date {})()`; any argument means an explicit date.
  construct: (target, args, newTarget) =>
    Reflect.construct(target, args.length === 0 ? [now()] : args, newTarget),
  // `Date()` called as a function ignores its arguments and returns the current time as a string.
  apply: () => new RealDate(now()).toString()
})
// `someDate.constructor` must not be a way back to the real clock.
RealDate.prototype.constructor = ShiftedDate
globalThis.Date = ShiftedDate
