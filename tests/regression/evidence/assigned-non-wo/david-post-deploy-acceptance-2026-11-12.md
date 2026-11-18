# David issue acceptance after the develop merges

PR #565 merged as `b134e421ce5f346e5f4d0ddd96cfe24a8fca764a`; #522 merged as `d7dd88f308b525f84105c093b3b85eddc9182c18`. Verification uses the existing authenticated QA browser on the dev website. No dev-machine access or dev-session minting is used.

## Verified customer scenarios

At 16:51 UTC on 2026-11-11, web `05c0e3bba4` and client graph `3f55c1bcff71` showed the correct BRIEF_NOT_READY explanation and View brief for Tennis & Padel Coach. There was no futile row Retry; clicking View brief opened Brief 1. Its Research again dialog accurately described retained sources, kept TripAdvisor after its provider account/payment refusal, offered no source retry, and displayed the available-source cap of $0.36. The dialog was canceled without starting research. Screenshots were visually inspected.

The existing Portland QA site's Home, News and Fight Night pages returned 200 without horizontal overflow at 1440 and 390 pixels. YouTube used its own glyph, the phone menu had exactly one visible branded logo, and News and article breadcrumbs had no demo ancestors. The own-business response, generated address, Home title and branding preserved Portland City Boxing. Website operator read-back confirmed a real site/kit/brand/plan/pictures/copy/write chain. That build ended with a failed check after 48.48 minutes; its article claims and gallery pictures remain unaccepted.

Scoped verification comments were posted to issues #508, #510, #546, #547 and #549. The comments record the tested surface and explicitly distinguish the remaining failed content acceptance. No issue was closed.

At 17:11:39 UTC, the reloaded Add site page reported web `b134e421ce5f346e5f4d0ddd96cfe24a8fca764a` and graph `fafe2f82dcc8` with 74 entries. The actual Retry button contained its entire label at 1440, 800 and 390 pixels. The button was about 81 pixels wide for a 59-pixel label; before deployment the same control was only 22 pixels wide. All three buttons also fit their alerts. The phone screenshot was visually inspected. Retry was not pressed again. Web #522 rollout and a fresh generated-site acceptance were still pending at this measurement.

## CI failure and local correction

Tracy CI run 43061719708 failed its related-tests row with 11011 passing cases and one failure: the Joomla updater refused the already recorded JA Diner `0.24.95-rc.2` pin. The same failure reproduced locally on develop `d7dd88f308`. No open PR covered this updater failure.

PR #567 recognizes existing RC pins for promotion to stable, while still refusing new RC destinations. It preserves exact profile and package validation and never downgrades a newer RC to an older stable. All 11 pin tests passed without skips. All 63 selected local gates passed; tests, turbo-config and boot-graph were explicit worktree exclusions, with the pin suite run separately. The extended official regression REG-PR-1100-p11-pin-joomla-cowork passed on committed source `259f8ebce3`; its receipt is committed on this branch.
