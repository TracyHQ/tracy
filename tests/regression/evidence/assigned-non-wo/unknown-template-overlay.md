# Unknown template overlay context

A missing quickstart measurement previously reached the looker as `overlay: null`, with a sentence claiming the template had no overlay. The local Arabian run demonstrated why this was misleading: both hero frames were hidden after text-readability failures, while the installed template paints a child bitmap overlay that the current measurement does not capture.

The context now preserves `overlayUnknown: true` when `templateOverlay` is unknown or missing. It states the uncertainty and asks for the same strict raw-picture text check. It invents neither an overlay nor text bounds, does not exempt subject faults, and does not claim that a passing raw picture proves finished-page readability. A proven absent overlay retains its existing context. A measured covering overlay retains its existing brightness exemption.

The static draft looker prompt adds the same distinction. No approved fixed-hash lock was found in the picture prompt code or tests. The actual loaded looker hash changes from `002f6c6ec2782a82ff2fcb0124fa97e315c8b52ed5b54a6c0141e95daa28e569` to `db224a1f8524bb168a88ee270d7c103df8e401a1bc3f609f4a2a754b0e77903c`. The combined hash changes from `bdd5f0516a7be8ea3dacc532c87f1baba2158e443537705ba438a63022374967` to `c261e94718544d9b3f2d2b71aee5c8fe5896d2a681ab807c9a8d4af2dafedf43`. The existing `bench-run-loop.js` preparation guard refuses a stored run with a different combined prompt hash before model execution. The picker and drawer role hashes are identical; planner and brand prompt files are unchanged.

Six focused picture suites pass 39 tests. The new regression distinguishes unknown and absent context, retains both text and subject faults, and the existing test still verifies the covering-overlay behavior. No provider call, runtime update or new acceptance run was performed.

Real overlay measurement remains separate work: load bytes only from a verified installer, associate the bitmap with its frame, measure actual text bounds at each viewport, and review a faithful composite without publishing a second overlay. This patch does not claim to fix the missing hero or make that site ready for handover.
