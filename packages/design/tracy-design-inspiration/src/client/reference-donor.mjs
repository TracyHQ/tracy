/**
 * The inspiration whose fixture every measured brand is drawn in.
 *
 * The 152 are ONE page: `artistic` and `bento` differ by 70 lines of 136 and every one of them is a
 * value in the `:root` token block (measured 08/09). 84 of them share that page exactly; the other
 * 68 — `airbnb`, `apple`, `stripe` — were re-drawn bespoke. A brand the engine measured ships the
 * same 56 tokens (`tokens.css`: 56 of 56, nothing missing) but its own `components.html` is the
 * engine's component kit — Buttons, Form controls, Type scale — a spec sheet whose layout no token
 * can move, which is why 83 brands came out identical but for hue.
 *
 * WHICH of the 84 is arbitrary: `withTokens` overrides all 56. It is named here, once, so the
 * coupling is a line someone can read rather than a coincidence — and `test/donor.test.mjs` fails
 * if this system is ever re-drawn bespoke, because then every brand card would change with it.
 *
 * Plain `.mjs`, not `.ts`, for the same reason as `groups.mjs` and `library-url.mjs`: the test has
 * to import the same value the client uses, not a second copy of it.
 */
export const REFERENCE_DONOR = 'application'
