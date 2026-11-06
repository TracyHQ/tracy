/**
 * The page shell every Tracy-owned HTML page in this app shares — ported from `page()` of the
 * fleet-bar Worker, a tree deleted on 16/09/2026. DESIGN.md §0 mode A applies here: Tracy owns
 * `<html>` on these documents, but nothing builds them, so the token contract in
 * `docs/references/page-shell-tokens.md` is kept by hand, not generated. VALUES BELOW MUST MIRROR
 * THAT CONTRACT — read it before changing one.
 *
 * `bar/pages.js` (the doors a customer's own hostname reaches — team, private copy, OTP,
 * generic messages) and `identity/route.js` (`/login`, on tracy-web's own hostname) both import
 * `pageShell` from here. ONE copy, so the two surfaces cannot silently drift the way `CLAUDE.md`
 * §10 describes for a real (non-symlink) copy of `.claude/skills/`.
 *
 * Trimmed from the Worker's version: the `.tr-*` bar-menu classes (invite/proposals/account
 * menus — never wired into the Worker's own `barHtml` either, per its `eslint-disable` note) and
 * every rule that exists only for `proposalsPage` (`.badge`, `.card.here`, `.card > h2/p/.acts`,
 * `.decided`) — proposals are explicitly not part of this migration (task 6 brief).
 * `ul.hint` stays: it is `otpPage`'s seat-holder hint list in the Worker, and
 * `seats/pages.js` reuses it for the team roster and the invite-outcome lists — not
 * proposals-only, and it was wrongly trimmed as such in an earlier pass (review round 2,
 * finding 1; caught by `page-shell.test.mjs`'s stylesheet-coverage test).
 * Everything else a ported page actually uses is kept, values unchanged: they are `@tracy/ui`'s
 * contract, not a choice this port gets to make.
 *
 * 🔒 NO COMMENTS INSIDE THE CSS TEMPLATE LITERAL BELOW, for the same two reasons the Worker's
 * own copy calls out: `check-language` reads a whole template literal as one string, so a
 * comment inside it counts as string content; and a comment inside CSS is real bytes shipped to
 * a customer's browser. Reasons stay here, outside the string.
 *
 * 🔒 `[hidden]{display:none!important}` is load-bearing, not decoration. `identity/route.js`'s
 * `alertBlock()` and `seats/pages.js`'s `accept-error` block both render their `role="alert"`
 * div UNCONDITIONALLY with a `hidden` attribute toggled off once there is something to say — on
 * purpose, so the live region exists in the DOM before the message arrives (see `alertBlock()`'s
 * own docblock). Without this rule, `.auth-card .alert{display:flex}` below (two class
 * selectors, specificity 0-2-0) outranks the UA's own `[hidden]{display:none}` (specificity
 * 0-1-0) and wins on specificity alone regardless of source order — the empty alert renders as a
 * solid bar on every page load. `!important` beats that outright instead of trying to out-rank
 * every current and future `.foo .alert{display:...}` rule one at a time.
 *
 * 🔒 `.auth-card .alert>span:first-child` — the CHILD combinator and `:first-child` are both
 * load-bearing. That rule paints the round `!` badge, and the badge is always the alert's first
 * child. But `identity/route.js`'s `alertBlock()` wraps the message in a SECOND span
 * (`id="…-text"`, so the OTP page can swap the text without rebuilding the live region), and a
 * bare descendant `.alert span` matched that one too — squashing the message into a 14×14px
 * circle at `font-size:0.625rem` with `color:var(--background)`, i.e. white text on a pale red
 * ground. Measured 10/09 on a wrong OTP code: "That code did not work." was in the DOM and in
 * the accessibility tree, and unreadable on screen. An error nobody can read is the same failure
 * as no error at all, and no gate sees it — this one was found by a person looking at the page.
 *
 * 🔒 THE DESKTOP APP ON WINDOWS shows these pages (`/login`, the approve pages) in a window whose
 * title bar is hidden and whose three system buttons float over the page's top-right corner
 * (`titleBarOverlay`, packages/desktop/tracy-desktop/src/window-chrome.js). Three rules answer it:
 * - `body::before` is the window's drag strip, and `body`'s top padding grows by the same height.
 *   Both are sized ONLY by the standard Window Controls Overlay variables `env(titlebar-area-*)`,
 *   each with a `0px` fallback: Chromium defines them only under an overlay, so in a browser and
 *   in the Mac app the strip is 0×0 and the padding is the 32px it always was. The strip has the
 *   page's background, so a long page scrolls under it like under any title bar.
 * - `--dsw-specific-sidebar-fill` / `--dsw-alias-label-primary` are not tokens this sheet uses:
 *   they are the two names dsh's desktop preload reads to paint the overlay buttons
 *   (`syncWindowsAppearance`), declared here so it paints them in this page's own colours. Without
 *   them it measured a transparent fill and the buttons kept the old theme's symbol colour.
 * - A button's fill fades only on hover and press, not on a theme change: its label colour flips at
 *   once, and a fill still fading from the old theme left "Continue with email" dark on dark for
 *   the length of the fade (Windows VM, 10/10/2026).
 */
import { escapeHtml } from './html.js'
import { TRACY_ICON_DATA_URI } from './tracy-icon.js'

/**
 * The brand mark, inline — the Worker serves no static files, so an `<img src>` would be one
 * more request to a path that does not exist. Two strokes use `currentColor` so the mark stays
 * legible in both themes; the terracotta fill is the brand colour and stays fixed.
 */
export const LOCKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="290 240 1020 320" height="26" fill="none" aria-hidden="true"><g id="tracy-logo-horizontal-color"> <g id="Group 10"> <g id="Group 9"> <path id="Vector" d="M991.097 469.001C981.533 481.365 971.272 491.548 955.112 494.513C933.091 498.552 907.557 488.278 904.121 463.866C903.119 456.873 904.369 449.744 907.672 443.504C923.269 413.627 968.437 421.244 987.957 401.912C993.427 395.256 990.907 389.106 991.059 382.178C993.417 351.05 930.666 349.651 933.301 374.885C937.883 418.675 894.175 393.54 918.171 367.728C937.911 346.496 990.019 342.599 1004.63 367.567C1017.72 389.924 1007.73 440.13 1010.9 466.537C1012.01 476.737 1012.8 483.077 1024.46 481.771C1028.76 479.934 1033.94 477.544 1038.35 476.241C1036.08 481.011 1034.99 483.702 1031.63 487.881C1026.89 491.886 1022.1 494.664 1015.78 495.36C1010.12 495.999 1004.45 494.318 1000.05 490.701C992.577 484.457 991.909 477.749 991.097 469.001ZM936.231 477.994C946.817 482.71 955.007 484.242 966.423 479.779C975.93 476.037 983.576 468.701 987.718 459.36C992.634 448.07 991.432 427.851 990.611 415.407C990.515 413.916 988.148 413.688 986.917 413.745C962.7 420.972 909.81 431.135 928.69 469.822C930.008 472.516 933.778 476.182 936.231 477.994Z" fill="currentColor"/> <path id="Vector_2" d="M626.708 274.609C690.113 273.773 755.422 274.294 818.943 274.535C819.486 282.931 822.472 317.456 819.89 323.793L818.56 324.34C811.598 320.89 807.779 302.048 803.648 295.416C792.645 277.743 761.215 280.976 743.148 281.966C740.171 282.129 736.366 283.882 734.297 285.923C732.073 294.843 732.759 356.678 732.755 369.483L732.736 427.211C732.693 442.246 730.831 464.204 736.241 478.019C740.495 488.882 762.591 484.036 768.509 489.189C765.872 495.242 727.335 492.148 720.577 492.248C710.088 492.405 697.605 493.107 687.238 492.297C682.395 492.246 680.993 492.671 676.875 490.092L676.605 488.514C677.905 487.248 679.187 487.207 680.996 486.825C694.096 486.047 709.295 486.255 709.548 469.34C710.414 411.332 710.827 353.076 709.585 295.078C709.546 293.23 708.752 285.75 707.636 285.041C698.056 278.952 679.088 281.324 668.436 282.095C658.113 282.842 649.261 285.617 643.243 293.909C635.747 302.771 634.885 319.116 627.905 325.462L626.66 325.33C622.977 317.48 626.18 285.213 626.708 274.609Z" fill="currentColor"/> <path id="Vector_3" d="M1273.82 371.21C1275.58 358.373 1259.86 361.004 1254.4 355.546L1254.64 354.233C1258.72 352.16 1301.19 351.913 1303.95 354.698C1302.2 359.946 1291 361.331 1287.81 364.847C1285.55 367.343 1282.68 374.893 1281.23 378.378C1271 404.502 1259.23 434.643 1249.97 461.059C1241.01 486.008 1225.78 533.446 1202.7 546.931C1193.93 552.023 1183.46 553.345 1173.7 550.598C1162.48 547.506 1138.83 531.931 1158.88 518.497C1166.66 513.285 1178.28 534.751 1186.94 537.323C1210.99 544.465 1224.11 504.965 1230.62 487.976L1197.03 410.481C1191.81 398.348 1182.33 374.197 1175.56 364.211C1171.33 361.95 1157.44 358.754 1157.28 355.206C1161.33 351.815 1218.48 351.715 1222.45 354.401L1222.33 355.822C1217.29 360.33 1206.59 358.49 1202.9 366.267C1201.75 372.282 1234.95 450.219 1240.12 460.226L1241.28 460.31L1242.67 457.412C1253.82 428.963 1264.22 400.218 1273.82 371.21Z" fill="currentColor"/> <path id="Vector_4" d="M1096.84 351.653C1109.02 350.663 1120.84 351.737 1132.11 356.845C1145.33 362.832 1160.08 376.846 1153.38 392.687C1152.46 394.855 1150.25 397.048 1147.91 397.629C1134.59 399.712 1132.46 385.747 1129.55 376.433C1126.02 364.954 1118.51 359.733 1106.75 358.945C1088.97 357.433 1073.49 367.967 1065.24 383.295C1042.87 424.798 1064.24 497.746 1122.97 479.928C1145.97 468.837 1144.64 452.907 1153 447.388L1154.15 447.852C1156.26 456.763 1150.3 467.244 1145.15 474.223C1126.67 499.225 1086.24 501.642 1062.4 483.238C1030.54 458.64 1027.68 408.302 1051.67 377.349C1063.1 362.629 1078.42 353.973 1096.84 351.653Z" fill="currentColor"/> <path id="Vector_5" d="M839.064 379.022C846.139 366.343 851.696 357.074 867.075 351.625C878.11 347.263 901.353 354.572 893.554 369.795C890.605 375.567 884.41 378.919 879.589 374.892C864.556 362.311 856.643 362.235 846.2 380.039C843.478 385.232 839.983 395.446 839.774 401.357C838.917 425.631 836.927 452.018 840.729 475.97C843.141 491.163 867.772 482.717 874.826 489.163L874.855 490.766C870.779 494.452 816.064 492.658 806.911 492.829C802.191 493.092 798.686 494.246 796.062 489.971L797.043 488.053C799.706 485.913 802.341 485.883 805.746 485.408C812.914 483.856 818.432 481.718 819.039 473.065C820.836 447.451 818.656 415.889 819.501 390.884C820.768 353.348 799.638 373.192 795.635 362.686L796.298 360.882C801.898 358.325 831.536 352.444 838.87 350.866C839.053 360.251 839.118 369.636 839.064 379.022Z" fill="currentColor"/> </g> </g> <path id="Vector_6" d="M439.155 246C442.009 246.005 445.739 246.132 448.539 246.017C448.043 251.262 448.356 260.784 448.359 266.406L448.354 304.869L448.307 339.18C448.292 344.459 447.999 354.293 448.631 359.27L465.266 296.313C467.381 288.463 469.59 279.284 471.952 271.589C474.688 272.176 478.005 272.887 480.654 273.796C479.043 281.718 476.13 291.515 474.019 299.513L463.724 339.036C462.027 345.537 460.161 351.929 458.579 358.476C458.155 360.025 457.751 361.529 457.251 363.057C457.919 361.914 458.932 360.306 459.516 359.172C462.076 355 464.422 350.506 466.919 346.255C474.834 332.872 482.657 319.436 490.388 305.947L505.12 280.205C508.01 275.156 511.592 269.129 514.244 264.023C516.975 265.443 519.638 267.121 522.354 268.452L486.988 330.361C482.834 337.532 478.721 344.727 474.65 351.946C473.419 354.117 470.269 359.259 469.366 361.269C468.173 363.142 467.153 365.333 465.988 367.285C466.566 366.736 469.441 364.059 469.751 363.559C471.738 361.961 475.557 357.908 477.529 355.93L491.593 341.784C502.075 331.176 512.671 320.681 523.38 310.302C525.796 307.965 528.232 305.435 530.635 303.158C532.85 305.322 534.905 307.14 537.216 309.189C532.466 313.593 527.575 318.796 522.921 323.393C512.169 333.933 501.549 344.606 491.062 355.41C486.698 359.924 481.994 364.155 477.756 368.813C476.516 370.176 474.886 371.756 473.773 373.155C478.11 371.005 482.835 368.232 487.034 365.809L506.2 354.725L570.516 318.019L570.619 318.242C571.441 319.987 574.274 324.455 574.311 325.87C573.085 327.147 567.875 330.009 566.105 331.023L554.874 337.46L504.842 366.277C496.451 371.125 485.222 377.19 477.436 382.548C479.588 381.725 481.756 381.209 483.966 380.583C495.252 377.387 506.698 374.772 518.033 371.776L548.67 363.743C553.069 362.57 561.199 360.07 565.342 359.388C565.93 362.155 566.843 365.54 567.677 368.26L507.063 384.367L490.929 388.667C488.749 389.258 484.186 390.16 482.476 391.141L482.564 391.446C483.519 391.729 488.413 391.67 489.821 391.687L511.13 391.826L563.832 391.913C572.397 391.909 583.109 392.203 591.418 391.813C591.372 394.803 591.29 398.195 591.43 401.18C580.965 400.901 569.842 401.081 559.317 401.071L480.751 401.038C488.331 403.527 496.773 405.585 504.54 407.491C525.486 412.632 546.266 419.243 567.229 424.217C566.967 427.096 565.859 430.447 565.257 433.317C551.122 429.66 537.01 425.909 522.925 422.063C508.059 418.028 493.154 414.134 478.214 410.383C481.773 412.91 486.868 415.652 490.763 417.874L513.423 430.7C533.771 442.552 554.18 454.3 574.649 465.944C573.27 468.882 571.939 471.419 570.482 474.288C564.279 470.828 558.29 467.249 552.136 463.741L506.673 437.743L486.424 426.182C482.49 423.935 478.195 421.228 474.101 419.41C478.082 423.943 482.624 428.283 486.877 432.592L509.884 455.764C515.258 461.128 520.593 466.531 525.887 471.974C529.215 475.397 533.107 479.609 536.564 482.784L530.575 489.001C517.465 476.207 504.445 463.318 491.52 450.336C483.22 442.03 475.194 433.73 466.577 425.755C485.052 458.197 503.615 491.132 522.494 523.315C519.944 524.721 516.903 526.347 514.474 527.912L476.058 461.662C472.55 455.564 468.987 449.464 465.445 443.384C463.163 439.469 460.2 433.505 457.724 429.878C459.773 436.425 461.511 444.389 463.285 451.09L475.084 495.84C476.287 500.618 477.542 505.382 478.849 510.133C479.5 512.585 480.158 515.467 480.919 517.832C478.463 518.455 474.386 519.401 472.066 520.286C469.783 512.655 467.753 504.488 465.705 496.761L455.794 459.586C453.551 450.883 451.195 442.21 448.724 433.568C448.291 437.023 448.423 444.284 448.415 447.991L448.428 474.58L448.405 520.699C448.402 529.048 448.225 538.254 448.491 546.545C445.412 546.599 442.333 546.622 439.254 546.614L439.137 469.249L439.181 448.419C439.168 445.845 439.175 439.169 438.676 436.807C438.655 435.653 438.631 434.781 438.517 433.627C438.207 434.706 437.696 436.299 437.471 437.354C436.208 442.96 434.461 449.072 433.004 454.671C430.676 463.91 428.276 473.13 425.802 482.331C422.445 494.85 419.241 507.906 415.634 520.295C412.819 519.454 409.427 518.683 406.559 517.971L422.747 456.996C424.703 449.498 426.828 441.814 428.614 434.301C428.943 432.811 429.367 431.33 429.771 429.857C428.925 431.143 428.257 432.147 427.549 433.507C427.026 433.931 419.366 447.466 418.331 449.254L373.047 527.993C370.467 526.468 367.96 524.76 365.362 523.271C370.824 513.203 376.983 502.825 382.71 492.859L402.07 458.874L412.892 439.968C414.578 437.007 417.196 432.688 418.588 429.765C418.875 429.513 420.838 425.87 421.164 425.286C419.893 426.683 418.711 427.889 417.378 429.215L377.191 468.857C370.531 475.516 363.884 482.484 357.129 489.013C355.003 487.082 352.852 484.894 350.82 482.862C354.265 479.122 358.605 475.02 362.249 471.27C374.116 459.038 386.099 446.919 398.197 434.914L408.128 425.018C409.921 423.261 412.003 421.449 413.647 419.617C409.802 420.817 404.075 424.311 400.342 426.428L381.895 436.963C369.089 444.196 356.35 451.545 343.679 459.009C334.803 464.02 325.99 469.143 317.243 474.376C315.659 471.772 313.852 468.93 312.403 466.276C318.768 462.273 326.559 458.075 333.163 454.26L384.306 424.801C391.032 420.898 398.781 416.672 405.323 412.61C406.382 412.169 408.579 410.94 409.688 410.366C407.568 410.927 405.432 411.386 403.291 411.863C397.514 413.134 391.279 414.843 385.529 416.328C373.078 419.565 360.655 422.908 348.26 426.356L331.638 430.829C328.756 431.603 324.936 432.524 322.212 433.546C321.425 430.577 320.626 427.321 319.7 424.416C328.186 421.461 340.064 418.905 348.925 416.556L405.838 401.233C400.949 400.599 392.153 400.642 387.23 400.643L362.898 400.649L321.352 400.652C312.993 400.659 304.402 400.548 296.072 400.837C296.077 397.703 296.053 394.568 296 391.434C299.826 391.787 307.755 391.595 311.777 391.595L342.075 391.567C357.021 391.712 371.969 391.655 386.913 391.398C393.512 391.247 397.674 391.516 404.443 390.816C401.693 389.8 396.678 388.597 393.761 387.846L376.374 383.362C357.568 378.446 338.789 373.427 320.039 368.304C320.581 365.582 321.259 361.859 322.03 359.274C330.587 361.154 339.481 363.826 347.992 366.092L387.067 376.27C393.777 378.02 401.819 380.384 408.494 381.708C405.477 379.379 399.173 376.067 395.673 374.039L373.682 361.224L312.228 325.974C313.417 323.588 315.454 320.338 316.9 318.072C322.691 320.87 330.504 325.705 336.243 328.999L371.018 348.919L400.513 365.826C404.357 368.021 411.203 371.563 414.633 373.9C402.548 361.292 389.537 348.667 377.215 336.234L361.124 319.995C357.795 316.638 353.807 312.489 350.322 309.383C352.468 307.312 354.922 304.948 356.877 302.731L395.192 340.875C403.276 348.972 412.202 358.321 420.516 365.991C418.986 362.015 415.4 356.514 413.135 352.611L401.956 333.001L378.977 292.653C374.503 284.767 369.982 276.455 365.321 268.731C367.741 267.045 370.714 265.298 373.26 263.803C375.514 267.215 378.04 271.95 380.071 275.564L390.484 294.009C402.368 314.996 414.392 335.904 426.557 356.731C427.503 358.082 428.591 360.154 429.677 361.75C429.098 359.777 428.469 357.549 428.035 355.547C423.602 338.93 419.261 322.288 415.011 305.623C412.256 295.064 409.288 284.252 406.715 273.662C409.701 272.939 412.89 272.108 415.88 271.482L430.071 325.658L435.358 346.136C436.339 349.858 437.233 353.649 438.437 357.293L439.098 291.948L439.149 259.85C439.163 255.575 438.966 250.148 439.155 246ZM445.537 408.607C452.445 407.581 457.198 401.127 456.129 394.225C455.06 387.324 448.577 382.612 441.682 383.724C434.848 384.827 430.186 391.24 431.246 398.081C432.306 404.922 438.69 409.623 445.537 408.607Z" fill="#BF5B3D"/> </g></svg>`

/**
 * Provider marks, inline for the same reason as the Tracy mark above: nothing here is served
 * from a static path.
 *
 * 🔒 GOOGLE KEEPS ITS FOUR COLOURS. That mark is Google's brand, not Tracy's artwork —
 * recolouring it to `currentColor` would be the same class of mistake as translating a
 * third-party product name. GitHub's mark is monochrome by design, so it takes `currentColor`
 * and follows the theme.
 */
export const GOOGLE_MARK = `<svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`

export const GITHUB_MARK = `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`

/**
 * Whether a page in this language takes the Vietnamese body font. General Sans (fontshare) stacks
 * Vietnamese double diacritics wrongly ("cần" renders as "cân", "Mỗi" as "Môĩ"), so Vietnamese
 * body text uses Be Vietnam Pro instead (03/10/2026). Every other language keeps General
 * Sans; headings in Newsreader are unaffected.
 *
 * @param {string} htmlLang - the already-validated `<html lang>` tag.
 * @returns {boolean}
 */
function usesVietnameseBodyFont(htmlLang) {
  return /^vi(?:-|$)/i.test(htmlLang)
}

/**
 * The `<link>` tags for the body font: Be Vietnam Pro for Vietnamese pages, General Sans for every
 * other language. Only the font the page actually uses is fetched. The matching CSS is the
 * `:lang(vi)` rule right after `body` in the style block.
 *
 * @param {string} htmlLang - the already-validated `<html lang>` tag.
 * @returns {string} preconnect + stylesheet tags.
 */
function bodyFontLinks(htmlLang) {
  const gstatic = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  if (usesVietnameseBodyFont(htmlLang)) {
    return `${gstatic}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600&display=swap">`
  }
  return `<link rel="preconnect" href="https://api.fontshare.com">
<link rel="preconnect" href="https://cdn.fontshare.com" crossorigin>
${gstatic}
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f%5B%5D=general-sans@300,400,500,600&display=swap">`
}

/**
 * The shared document shell.
 *
 * @param {string} title - the document title.
 * @param {string} body - the already-rendered contents of `<main>`, after the brand lockup.
 * @param {string} [script] - inline JS. Only pages served on Tracy's own hostname may pass one
 *   (never a page proxied through a customer's own site — ADR 0034's CSP reasoning, ported from
 *   the Worker's own `page()` docblock) — and what runs must be an enhancement: the page has to
 *   still work with it stripped out.
 * @param {{lang?: string, style?: string}} [options] - `lang`: the BCP 47 tag for `<html lang>` — the
 *   language the page's own words are in (`htmlLang()` of `./i18n/index.js`, #753). English when
 *   absent. `style`: extra CSS rules one page needs and no other page does (the desktop app's Setup
 *   frame, `identity/pages.js`), appended to the shared block. They read the tokens above and declare
 *   none; empty adds nothing, so every page that passes none is byte-for-byte what it was.
 * @returns {string} a complete HTML document.
 */
export function pageShell(title, body, script = '', { lang = 'en', style = '' } = {}) {
  const htmlLang = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(lang) ? lang : 'en'
  return `<!doctype html><html lang="${htmlLang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${TRACY_ICON_DATA_URI}">
${bodyFontLinks(htmlLang)}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400&display=swap">
<title>${escapeHtml(title)}</title>
<style>
:root{
  --radius:0.625rem;
  --radius-md:calc(var(--radius) - 2px);
  --radius-xl:calc(var(--radius) + 4px);
  --background:oklch(1 0 0);--foreground:oklch(0.145 0 0);
  --card:oklch(1 0 0);--card-foreground:oklch(0.145 0 0);
  --primary:oklch(0.565 0.136 37.4);--primary-foreground:oklch(0.985 0 0);
  --ring:oklch(0.588 0.136 37.4);
  --secondary:oklch(0.97 0 0);--secondary-foreground:oklch(0.205 0 0);
  --muted:oklch(0.97 0 0);--muted-foreground:oklch(0.556 0 0);
  --accent:oklch(0.97 0 0);--accent-foreground:oklch(0.205 0 0);
  --destructive:oklch(0.577 0.245 27.325);
  --success:oklch(0.696 0.17 162.48);
  --border:oklch(0.922 0 0);--input:oklch(0.922 0 0);
  --shadow-xs:0 1px 2px 0 rgb(0 0 0 / .05);
  --shadow-sm:0 1px 3px 0 rgb(0 0 0 / .1), 0 1px 2px -1px rgb(0 0 0 / .1);
}
@media (prefers-color-scheme:dark){
  :root{
    --background:oklch(0.175 0 0);--foreground:oklch(0.985 0 0);
    --card:oklch(0.195 0 0);--card-foreground:oklch(0.985 0 0);
    --secondary:oklch(0.269 0 0);--secondary-foreground:oklch(0.985 0 0);
    --muted:oklch(0.269 0 0);--muted-foreground:oklch(0.708 0 0);
    --accent:oklch(0.269 0 0);--accent-foreground:oklch(0.985 0 0);
    --destructive:oklch(0.704 0.191 22.216);
    --border:oklch(1 0 0 / 14%);--input:oklch(1 0 0 / 15%);
  }
}
:root{--dsw-specific-sidebar-fill:var(--background);--dsw-alias-label-primary:var(--foreground)}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;min-height:100dvh;display:flex;padding:calc(32px + env(titlebar-area-height,0px)) 20px 32px;
background:var(--background);color:var(--foreground);
font:0.875rem/1.4285 "General Sans",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,
"Helvetica Neue",Arial,sans-serif;
-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;z-index:10;top:env(titlebar-area-y,0px);left:env(titlebar-area-x,0px);
width:env(titlebar-area-width,0px);height:env(titlebar-area-height,0px);
background:var(--background);-webkit-app-region:drag}
:lang(vi) body,:lang(vi) button,:lang(vi) input,:lang(vi) select{
font-family:"Be Vietnam Pro",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,
"Helvetica Neue",Arial,sans-serif}
main{max-width:26rem;width:100%;margin:auto;display:flex;flex-direction:column;gap:1rem}
h1{font-size:1.125rem;font-weight:600;letter-spacing:-0.01em;line-height:1.4;margin:0}
h2{font-size:0.9375rem;font-weight:600;letter-spacing:-0.01em;margin:0}
main:has(table){max-width:44rem}
.card{display:flex;flex-direction:column;gap:1.5rem;border-radius:var(--radius-xl);
border:1px solid var(--border);background:var(--card);color:var(--card-foreground);
padding:1.5rem 0;box-shadow:var(--shadow-sm)}
.card-header{display:grid;gap:0.375rem;padding:0 1.5rem}
.card-content{display:flex;flex-direction:column;gap:0.75rem;padding:0 1.5rem}
.card-footer{display:flex;align-items:center;gap:0.5rem;padding:0 1.5rem}
.card-title{font-size:1rem;font-weight:600;line-height:1;margin:0}
.card-description{font-size:0.875rem;color:var(--muted-foreground);margin:0}
button{display:inline-flex;align-items:center;justify-content:center;gap:0.5rem;
white-space:nowrap;border-radius:0.5625rem;font-size:0.9375rem;font-weight:500;
height:2.25rem;padding:0.5rem 1rem;border:1px solid transparent;cursor:pointer;
background:var(--foreground);color:var(--background);box-shadow:var(--shadow-xs);
transition:box-shadow .15s}
button:hover,button:active{transition:background-color .15s,box-shadow .15s}
button:hover{background:color-mix(in oklab, var(--foreground) 88%, var(--background))}
button:active{background:color-mix(in oklab, var(--foreground) 78%, var(--background))}
button.outline,.providers button,.card .acts button{background:var(--background);
border-color:var(--border);color:var(--foreground)}
button.outline:hover,.providers button:hover,.card .acts button:hover{
background:color-mix(in oklab, var(--foreground) 8%, var(--card));color:var(--foreground)}
button.ghost{background:var(--secondary);border-color:transparent;color:var(--secondary-foreground)}
button.ghost:hover{background:color-mix(in oklab, var(--secondary) 80%, transparent)}
button:disabled{opacity:0.6;cursor:default}
input,select{height:2.25rem;width:100%;min-width:0;border-radius:0.5625rem;
border:1px solid var(--input);background:transparent;color:var(--foreground);
padding:0.25rem 0.75rem;font-size:0.9375rem;box-shadow:var(--shadow-xs);outline:none;
transition:border-color .15s,box-shadow .15s}
input:hover:not(:focus-visible){border-color:color-mix(in oklab,var(--foreground) 24%,transparent)}
input::placeholder{color:var(--muted-foreground)}
input:user-invalid{border-color:var(--destructive)}
input:focus-visible,select:focus-visible,button:focus-visible{border-color:var(--ring);outline:none}
a:focus-visible{outline:1px solid var(--ring);outline-offset:2px;border-radius:2px}
input:user-invalid:focus-visible{border-color:var(--destructive)}
label{display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;line-height:1;font-weight:500}
.alert{width:100%;border-radius:var(--radius);border:1px solid var(--border);
background:var(--card);padding:0.75rem 1rem;font-size:0.875rem}
.alert.destructive{color:var(--destructive);
border-color:color-mix(in oklab, var(--destructive) 30%, var(--background))}
.separator{flex:none;height:1px;width:100%;background:var(--border);border:0;margin:0}
.separator-label{display:flex;align-items:center;gap:0.625rem;margin:0;
color:var(--muted-foreground);font-size:0.6875rem;letter-spacing:.08em;text-transform:uppercase}
.separator-label::before,.separator-label::after{content:"";flex:1;height:1px;background:var(--border)}
table{width:100%;border-collapse:separate;border-spacing:0;font-size:0.875rem;
background:var(--card);border:1px solid var(--border);border-radius:var(--radius-md);
overflow:hidden}
th{height:2.5rem;padding:0 0.5rem;text-align:left;font-weight:500;color:var(--foreground);
background:color-mix(in oklab, var(--muted) 50%, var(--card));
border-bottom:1px solid var(--border)}
td{padding:0.5rem;border-bottom:1px solid var(--border);vertical-align:middle}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover td{background:color-mix(in oklab, var(--muted) 50%, transparent)}
.brand{display:flex;align-items:center;justify-content:center;gap:0.55em;margin-bottom:0.25rem}
.brand svg{flex:none}
.brand .co{opacity:.62;font-size:1.15rem;font-weight:300;letter-spacing:.02em;line-height:1.15;
border-left:1px solid currentColor;padding-left:0.55em}
form{display:flex;flex-direction:column;gap:0.5rem;margin:0}
form.row{flex-direction:row;flex-wrap:wrap;align-items:center}
.auth-hero{width:min(44rem,92vw);margin:0.5rem 0 1.75rem 50%;transform:translateX(-50%);
display:grid;gap:0.625rem;text-align:center;
font-family:Newsreader,Georgia,"Times New Roman",serif}
.auth-card{gap:1rem;border-radius:1.25rem;padding:1.75rem 0;
border-color:color-mix(in oklab,var(--foreground) 7%,transparent)}
.auth-card .card-content{gap:1rem;padding:0 1.75rem}
.auth-card .card-header{padding:0 1.75rem;gap:0.3125rem}
.auth-card form{gap:1rem}
.auth-card input{padding:0.25rem 0.875rem}
.auth-card .separator-label{font-size:0.75rem;letter-spacing:.1em;margin:0.25rem 0}
.auth-card .providers button{background:color-mix(in oklab,var(--foreground) 13%,var(--card));
border-color:transparent;color:var(--foreground)}
.auth-card .providers button:hover{background:color-mix(in oklab,var(--foreground) 18%,var(--card))}
.auth-card .providers button:active{background:color-mix(in oklab,var(--foreground) 22%,var(--card))}
.auth-card input{background:color-mix(in oklab,var(--foreground) 7%,var(--card));
border-color:color-mix(in oklab,var(--foreground) 10%,transparent)}
.auth-card input:focus-visible,.auth-card .providers button:focus-visible{border-color:var(--ring)}
.auth-card input::placeholder{color:color-mix(in oklab,var(--foreground) 42%,transparent)}
.auth-card .whoami{margin:0;padding-top:0.75rem;font-size:0.6875rem;text-align:center;
color:color-mix(in oklab,var(--foreground) 62%,transparent);
border-top:1px solid color-mix(in oklab,var(--foreground) 7%,transparent)}
.auth-card .whoami strong{color:var(--foreground);font-weight:inherit}
.auth-card .whoami form{display:inline;margin:0}
.auth-card .whoami form button{all:unset;cursor:pointer;font:inherit;color:inherit;text-decoration:underline;text-underline-offset:0.15em}
.auth-card .whoami form button:hover{color:var(--foreground)}
.auth-card .whoami form button:focus-visible{outline:1px solid var(--ring);outline-offset:2px;border-radius:2px}
.auth-card .card-description strong,.auth-card .note strong{
color:var(--foreground);font-weight:inherit}
.auth-card .alert{display:flex;align-items:center;gap:0.4375rem;
border-radius:0.5rem;padding:0.3125rem 0.5rem;font-size:0.8125rem;line-height:1.35;
background:color-mix(in oklab,var(--destructive) 8%,var(--card));
border-color:color-mix(in oklab,var(--destructive) 22%,transparent);
color:color-mix(in oklab,var(--destructive) 62%,var(--foreground))}
.auth-card .alert>span:first-child{flex:none;width:0.875rem;height:0.875rem;border-radius:999px;
display:grid;place-items:center;font-size:0.625rem;font-weight:700;line-height:1;
background:color-mix(in oklab,var(--destructive) 72%,transparent);color:var(--background)}
.auth-card input:hover:not(:focus-visible){
border-color:color-mix(in oklab,var(--foreground) 18%,transparent)}
.auth-card input:user-invalid,.auth-card input:user-invalid:hover{border-color:var(--destructive)}
.auth-hero h1{font-size:2.5rem;font-weight:400;letter-spacing:-0.005em;line-height:1.12;
margin:0;text-wrap:balance}
.auth-hero p{margin:0;font-size:1.125rem;font-weight:400;line-height:1.45;opacity:.8;
text-wrap:balance}
/* One provider fills the row; two share it. A fixed 1fr 1fr left the second cell empty when
   only Google is configured — a half-width button sitting left, measured on cowork.tracy.site
   14/09 — and a deployment lights providers up one at a time (config.js readOAuth). */
.providers{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:0.5rem}
.providers form{display:contents}
.providers button{width:100%}
/* "Send a new code" is the second thing on the code step, not a second Verify: a link under the
   button, so the one action reads as the one action. */
.auth-card .resend button{all:unset;cursor:pointer;font:inherit;font-size:0.8125rem;display:block;
margin:0 auto;color:var(--muted-foreground);text-decoration:underline;text-underline-offset:0.15em}
.auth-card .resend button:hover{color:var(--foreground)}
.auth-card .resend button:focus-visible{outline:1px solid var(--ring);outline-offset:2px;border-radius:2px}
.providers svg{flex:none}
.note{margin:0;font-size:0.75rem;color:var(--muted-foreground);text-align:center}
.note a{color:var(--muted-foreground)}
a.back{font-size:0.875rem;color:var(--muted-foreground)}
.spam-tip{display:flex;align-items:flex-start;gap:0.5rem;margin-top:0.25rem;padding:0.625rem 0.75rem;
border-radius:var(--radius-md);border:1px solid color-mix(in oklab,var(--primary) 30%,var(--border));
background:color-mix(in oklab,var(--primary) 9%,var(--card));color:var(--foreground);text-align:left}
.spam-tip-icon{flex:none;display:flex;margin-top:1px;color:var(--primary)}
.spam-tip-text{flex:1;margin:0;font-size:0.75rem;line-height:1.45}
.spam-tip .spam-tip-x{all:unset;flex:none;cursor:pointer;color:var(--muted-foreground);font-size:1rem;line-height:1;padding:0 0.125rem}
.spam-tip .spam-tip-x:hover{color:var(--foreground)}
.spam-tip .spam-tip-x:focus-visible{outline:1px solid var(--ring);outline-offset:2px;border-radius:2px}
.otp-boxes{display:flex;align-items:center;gap:0.5rem;align-self:center}
.otp-boxes .otp-dash{color:var(--muted-foreground);font-size:1rem;user-select:none}
input.otp-slot{width:3rem;height:3rem;padding:0;text-align:center;
font:600 1.25rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;
border-radius:var(--radius-md);border:1px solid var(--input);background:transparent;
box-shadow:var(--shadow-xs)}
ul.hint{list-style:none;padding:0;margin:0}
ul.hint li{padding:0.4375rem 0;font-size:0.8125rem;border-bottom:1px solid var(--border)}
ul.hint li:last-child{border-bottom:0}
ul.hint .role{color:var(--muted-foreground);font-size:0.75rem}
${style}</style></head><body><main>
<div class="brand">${LOCKUP}<span class="co">Cowork</span></div>
${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`
}

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin' }

function roleLabel(role) {
  return ROLE_LABEL[role] ?? 'Member'
}

export { roleLabel }
