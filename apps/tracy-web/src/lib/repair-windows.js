// The repair pass's two windows (step 9b, #448), in one place both the repair pass (write-step/repair-pass/repair-limits.js)
// and the step chain engine (sites/brief-engines/step-chain.js) read, so a domain need not import another domain's file:
// no new page turn after `stopNewWorkMs`, and the step hands the site over by `returnByMs`.
export const REPAIR_WINDOWS = Object.freeze({ stopNewWorkMs: 10 * 60_000, returnByMs: 12 * 60_000 })
