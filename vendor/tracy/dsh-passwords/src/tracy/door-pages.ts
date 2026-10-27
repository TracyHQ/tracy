// H7: the pages of the Tracy sign-in door (`/gateway/tracy/*`), in the gateway's eight languages.
//
// They copy the SHAPE of the Tracy sign-in screens (the design bench), not their code: the gateway
// ships no browser build beyond the plugin's `dist/client.js`, and a page with one input and three
// buttons does not earn a second build path. They reuse upstream's page shell and classes
// (`.logo`, `.sub`, `.error-bar`) and add only what it lacks. When the two drift, the bench is right.
import { t, type Lang } from './i18n/index.js';
import { currentMount } from './mount.js';

/** Upstream's page shell (`pageShell` in gateway.ts): theme boot, `PAGE_STYLE`, the card. */
export type PageShell = (params: { lang: Lang; title: string; body: string; script?: string }) => string;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TRACY_STYLE = `
.btn-alt{margin-top:10px;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:10px 16px;font-size:14px;font-weight:500;color:var(--txt);background:var(--field);border:1px solid var(--border);border-radius:10px;cursor:pointer;box-shadow:var(--shadow-field);transition:border-color .16s,transform .16s}
.btn-alt:hover{border-color:var(--border-strong);transform:translateY(-1px)}
.btn-alt svg{width:16px;height:16px;flex:0 0 16px}
.or{display:flex;align-items:center;gap:12px;margin-top:20px;color:var(--caption);font-size:12px}
.or::before,.or::after{content:"";flex:1;height:1px;background:var(--border-soft)}
.foot{margin-top:18px;font-size:12px;color:var(--caption);text-align:center;line-height:1.5}
.sent{margin-top:16px;padding:12px 14px;font-size:13px;color:var(--sub);background:var(--field);border:1px solid var(--border-soft);border-radius:10px;text-align:center}
input.otp{font:600 22px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:8px;text-align:center}
.back-link{display:block;margin-top:16px;font-size:12px;color:var(--muted);text-align:center;text-decoration:none}
.back-link:hover{color:var(--txt);text-decoration:underline}
.logo{width:auto;height:auto;background:none;box-shadow:none;border-radius:0}
.logo::after{display:none}
.logo svg{width:44px;height:44px;display:block}
`;

/**
 * The Tracy mark (docs/design/brand/mark/tracy-mark-color.svg), inlined the same way
 * workers/fleet-bar/src/pages.js inlines the lockup. The terracotta fill is the brand colour and
 * stays hard-coded on purpose: it is the one colour that belongs to the mark alone, so it must not
 * follow the page's blue accent or the text colour. `PAGE_STYLE` paints `.logo` as a blue gradient
 * square for the password door; the override in `TRACY_STYLE` above drops that square, because
 * the mark is the logo, not a glyph inside one.
 */
const TRACY_MARK = `<svg width="44" height="44" viewBox="0 0 800 800" fill="none" aria-hidden="true"><path fill="#BF5B3D" d="M388.074 3C395.471 3.01433 405.139 3.34915 412.398 3.04493C411.111 16.8982 411.924 42.0472 411.932 56.8962L411.918 158.489L411.796 249.112C411.758 263.055 410.997 289.028 412.636 302.173L455.755 135.89C461.238 115.154 466.964 90.9114 473.086 70.5862C480.179 72.1372 488.777 74.0152 495.643 76.4154C491.468 97.3397 483.916 123.215 478.443 144.342L451.758 248.731C447.359 265.901 442.523 282.784 438.421 300.076C437.323 304.167 436.277 308.142 434.979 312.178C436.711 309.159 439.338 304.911 440.852 301.915C447.488 290.896 453.568 279.026 460.04 267.797C480.556 232.451 500.836 196.963 520.875 161.334L559.061 93.3441C566.554 80.0071 575.839 64.0902 582.712 50.6034C589.79 54.3528 596.693 58.7846 603.733 62.3008L512.062 225.817C501.294 244.758 490.634 263.763 480.081 282.83C476.889 288.563 468.724 302.146 466.385 307.453C463.292 312.4 460.646 318.189 457.629 323.345C459.125 321.894 466.579 314.824 467.383 313.502C472.531 309.281 482.432 298.577 487.543 293.351L523.998 255.99C551.168 227.971 578.634 200.251 606.393 172.838C612.657 166.666 618.972 159.982 625.199 153.97C630.94 159.684 636.267 164.486 642.259 169.898C629.945 181.529 617.267 195.273 605.203 207.413C577.333 235.252 549.804 263.442 522.623 291.98C511.311 303.901 499.118 315.078 488.133 327.378C484.917 330.979 480.692 335.153 477.807 338.848C489.049 333.168 501.297 325.844 512.18 319.445L561.862 290.17L728.575 193.22L728.843 193.809C730.974 198.419 738.317 210.219 738.413 213.956C735.234 217.329 721.73 224.889 717.143 227.566L688.031 244.569L558.341 320.68C536.591 333.485 507.484 349.505 487.303 363.658C492.879 361.483 498.5 360.12 504.229 358.467C533.483 350.025 563.151 343.118 592.534 335.206L671.947 313.989C683.35 310.89 704.426 304.288 715.164 302.487C716.689 309.794 719.054 318.733 721.216 325.918L564.1 368.462L522.277 379.819C516.628 381.38 504.798 383.763 500.366 386.354L500.595 387.158C503.071 387.906 515.755 387.751 519.405 387.797L574.641 388.164L711.251 388.393C733.45 388.383 761.219 389.158 782.756 388.129C782.637 396.025 782.424 404.986 782.787 412.867C755.661 412.133 726.83 412.608 699.546 412.581L495.894 412.495C515.543 419.069 537.425 424.502 557.558 429.537C611.852 443.116 665.716 460.577 720.054 473.716C719.376 481.319 716.505 490.169 714.945 497.751C678.303 488.092 641.724 478.184 605.213 468.026C566.679 457.369 528.045 447.085 489.319 437.175C498.545 443.851 511.752 451.093 521.847 456.961L580.583 490.837C633.328 522.143 686.231 553.172 739.29 583.925C735.714 591.686 732.264 598.388 728.486 605.966C712.409 596.827 696.884 587.374 680.933 578.108L563.086 509.439L510.599 478.905C500.404 472.969 489.27 465.821 478.658 461.019C488.977 472.99 500.75 484.453 511.773 495.837L571.41 557.038C585.34 571.206 599.169 585.478 612.893 599.854C621.519 608.893 631.608 620.018 640.569 628.405L625.045 644.827C591.061 611.033 557.313 576.991 523.808 542.703C502.294 520.764 481.49 498.841 459.155 477.776C507.045 563.465 555.161 650.454 604.096 735.456C597.488 739.171 589.605 743.467 583.309 747.599L483.731 572.617C474.637 556.512 465.402 540.399 456.219 524.341C450.304 513.999 442.625 498.246 436.206 488.668C441.518 505.96 446.023 526.993 450.621 544.693L481.205 662.889C484.324 675.508 487.577 688.093 490.964 700.64C492.653 707.117 494.358 714.73 496.329 720.976C489.964 722.621 479.397 725.12 473.384 727.458C467.463 707.303 462.202 685.73 456.894 665.322L431.203 567.133C425.39 544.146 419.282 521.238 412.878 498.414C411.755 507.539 412.098 526.716 412.076 536.508L412.109 606.735L412.049 728.548C412.043 750.601 411.583 774.914 412.274 796.814C404.293 796.956 396.311 797.017 388.329 796.996L388.028 592.656L388.14 537.64C388.108 530.84 388.125 513.208 386.831 506.969C386.778 503.921 386.715 501.616 386.42 498.57C385.616 501.418 384.292 505.626 383.709 508.413C380.435 523.221 375.905 539.363 372.128 554.152C366.096 578.553 359.873 602.907 353.462 627.209C344.758 660.275 336.454 694.759 327.105 727.481C319.808 725.261 311.015 723.222 303.582 721.342L345.543 560.294C350.612 540.488 356.12 520.193 360.749 500.351C361.603 496.415 362.701 492.503 363.749 488.613C361.557 492.009 359.825 494.659 357.989 498.253C356.634 499.371 336.779 535.121 334.095 539.843L216.714 747.814C210.027 743.785 203.528 739.275 196.795 735.342C210.951 708.749 226.916 681.339 241.761 655.016L291.946 565.254L319.996 515.317C324.366 507.498 331.153 496.088 334.762 488.368C335.505 487.704 340.593 478.082 341.439 476.539C338.145 480.23 335.079 483.413 331.624 486.916L227.455 591.619C210.192 609.207 192.962 627.612 175.452 644.858C169.942 639.757 164.366 633.979 159.099 628.612C168.029 618.732 179.279 607.897 188.724 597.993C219.486 565.685 250.548 533.676 281.905 501.968L307.649 475.831C312.295 471.19 317.692 466.403 321.954 461.565C311.987 464.735 297.142 473.963 287.465 479.555L239.648 507.382C206.455 526.484 173.434 545.894 140.589 565.608C117.582 578.845 94.7384 592.375 72.0652 606.196C67.9574 599.32 63.2732 591.812 59.5194 584.803C76.017 574.23 96.2121 563.142 113.329 553.067L245.899 475.259C263.332 464.948 283.419 453.788 300.376 443.059C303.122 441.892 308.818 438.648 311.693 437.132C306.196 438.614 300.66 439.825 295.111 441.085C280.135 444.443 263.974 448.956 249.07 452.879C216.795 461.428 184.592 470.258 152.463 479.365L109.376 491.178C101.906 493.224 92.0046 495.657 84.9444 498.355C82.9046 490.513 80.8341 481.912 78.4326 474.242C100.43 466.437 131.219 459.684 154.187 453.48L301.713 413.009C289.04 411.333 266.24 411.447 253.477 411.451L190.407 411.467L82.7142 411.474C61.0467 411.494 38.7786 411.199 17.1866 411.964C17.1994 403.685 17.1368 395.406 17 387.127C26.9167 388.06 47.4709 387.553 57.8963 387.553L136.432 387.479C175.174 387.862 213.919 387.712 252.656 387.032C269.761 386.634 280.549 387.345 298.096 385.494C290.967 382.813 277.969 379.635 270.408 377.65L225.339 365.807C176.591 352.823 127.915 339.565 79.3106 326.036C80.7165 318.845 82.4752 309.012 84.4715 302.185C106.654 307.151 129.707 314.208 151.768 320.193L253.056 347.076C270.449 351.696 291.296 357.942 308.596 361.438C300.775 355.288 284.436 346.539 275.363 341.183L218.361 307.334L59.0657 214.232C62.1459 207.93 67.4257 199.345 71.1756 193.359C86.1854 200.75 106.438 213.521 121.315 222.221L211.456 274.834L287.91 319.49C297.874 325.287 315.619 334.644 324.511 340.816C293.185 307.515 259.457 274.168 227.518 241.332L185.809 198.438C177.18 189.572 166.842 178.615 157.808 170.41C163.372 164.939 169.732 158.696 174.799 152.84L274.117 253.588C295.071 274.976 318.21 299.668 339.759 319.926C335.792 309.424 326.498 294.895 320.626 284.585L291.65 232.791L232.084 126.221C220.49 105.395 208.771 83.44 196.688 63.0393C202.961 58.584 210.667 53.9699 217.267 50.0226C223.11 59.0346 229.656 71.5395 234.922 81.0867L261.912 129.803C292.718 185.236 323.886 240.459 355.417 295.468C357.871 299.036 360.691 304.508 363.505 308.724C362.004 303.512 360.375 297.629 359.249 292.341C347.759 248.45 336.505 204.496 325.49 160.479C318.348 132.589 310.655 104.032 303.986 76.0624C311.725 74.1532 319.992 71.9575 327.742 70.3036L364.527 213.397L378.232 267.483C380.773 277.315 383.09 287.327 386.212 296.952L387.925 124.36L388.057 39.5806C388.093 28.2895 387.584 13.9563 388.074 3ZM404.616 432.484C422.523 429.774 434.844 412.729 432.072 394.5C429.3 376.271 412.495 363.825 394.623 366.764C376.908 369.677 364.825 386.615 367.573 404.684C370.321 422.752 386.868 435.17 404.616 432.484Z"/></svg>`;

const GOOGLE_MARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5L1.3 17.3C3.3 21.3 7.3 24 12 24z"/><path fill="#FBBC05" d="M5.1 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4L1.3 6.7C.5 8.3 0 10.1 0 12s.5 3.7 1.3 5.3l3.8-2.9z"/><path fill="#EA4335" d="M12 4.6c2.2 0 3.8.9 4.6 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.7l3.8 2.9c1-2.9 3.7-5 6.9-5z"/></svg>`;
const GITHUB_MARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.7 2.7 1.2 3.4.9.1-.7.4-1.2.7-1.5-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>`;

/** Every page of the Tracy door: upstream's shell with the Tracy additions in front of its style. */
function tracyPage(shell: PageShell, params: { lang: Lang; title: string; body: string; script?: string }): string {
  return shell(params).replace('<style>', `<style>${TRACY_STYLE}`);
}

/**
 * The Tracy sign-in page: replaces the username/password screen on every lane that opened the seat door.
 *
 * Three ways in, and all three END IN ONE PLACE: the seat book says who this person is, then the
 * lane mints its own session (TCH ADR 0001). This page proves nothing itself — it reads no
 * password, holds no Supabase session, knows no token.
 */
export function renderTracySignIn(shell: PageShell, params: { lang: Lang; next: string; email?: string; error?: string }): string {
  const mount = currentMount();
  const tr = (key: string, tp?: Record<string, string | number>) => t(params.lang, key, tp);
  const next = escapeHtml(params.next);
  const body = `
  <div class="logo">${TRACY_MARK}</div>
  <h1>${tr('tracy.heading')}</h1>
  <p class="sub">${tr('tracy.sub')}</p>
  <form method="POST" action="${mount}/gateway/tracy/email" id="tracy-email-form">
    <input type="hidden" name="next" value="${next}" />
    <label><span>${tr('tracy.email')}</span><input type="email" name="email" value="${escapeHtml(params.email ?? '')}" placeholder="${tr('tracy.emailPlaceholder')}" autocomplete="email" required /></label>
    <button type="submit" id="tracy-email-btn">${tr('tracy.sendLink')}</button>
  </form>
  ${params.error ? `<div class="error-bar" id="error-bar">${escapeHtml(params.error)}</div>` : ''}
  <div class="or">${tr('tracy.or')}</div>
  <form method="POST" action="${mount}/gateway/tracy/start">
    <input type="hidden" name="next" value="${next}" />
    <input type="hidden" name="provider" value="google" />
    <button type="submit" class="btn-alt">${GOOGLE_MARK}${tr('tracy.google')}</button>
  </form>
  <form method="POST" action="${mount}/gateway/tracy/start">
    <input type="hidden" name="next" value="${next}" />
    <input type="hidden" name="provider" value="github" />
    <button type="submit" class="btn-alt">${GITHUB_MARK}${tr('tracy.github')}</button>
  </form>
  <p class="foot">${tr('tracy.footer')}</p>`;
  return tracyPage(shell, {
    lang: params.lang,
    title: tr('tracy.title'),
    body,
    script: `<script>
  const err = document.getElementById('error-bar');
  if (err) { setTimeout(() => { err.style.display = 'block'; }, 50); }
  document.getElementById('tracy-email-form').addEventListener('submit', () => {
    const btn = document.getElementById('tracy-email-btn');
    btn.textContent = ${JSON.stringify(tr('tracy.sending'))};
    btn.disabled = true;
  });
</script>`,
  });
}

/**
 * After the mail is away: the code box, right on this page (01/09, ADR 0005).
 *
 * This page replaces the mail path's WAITING screen, and what it replaces is not a UI detail: that
 * screen existed because step two happened in **another browser** (the person pressed the button in
 * their inbox, possibly on a phone), leaving this tab nothing to do but ask the seat book every two
 * seconds. A six-digit code travels the other way — the person carries it BACK here — so there is
 * nothing left to wait for, and no polling loop left to fail silently.
 *
 * ONE BOX, NOT SIX — a deliberate departure from the bench's `Verify.tsx`: six boxes need a script
 * to move the caret and handle pasting. `autocomplete="one-time-code"` buys something dearer
 * instead: iOS and macOS fill the code in from the mail.
 *
 * The `ticket` is NOT a sign-in secret; it is the key to a row in process memory. The email address
 * lives there rather than in the form — see `pendingCodes` for why.
 */
export function renderTracyCode(shell: PageShell, params: { lang: Lang; ticket: string; email: string; error?: string }): string {
  const mount = currentMount();
  const tr = (key: string, tp?: Record<string, string | number>) => t(params.lang, key, tp);
  const body = `
  <div class="logo">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 6h16v12H4z" stroke="white" stroke-width="1.6" stroke-linejoin="round"/><path d="m4 7 8 6 8-6" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </div>
  <h1>${tr('tracy.sentTitle')}</h1>
  <p class="sub">${tr('tracy.codeSub', { email: escapeHtml(params.email) })}</p>
  ${params.error === undefined ? '' : `<div class="err">${escapeHtml(params.error)}</div>`}
  <form method="POST" action="${mount}/gateway/tracy/code">
    <input type="hidden" name="ticket" value="${escapeHtml(params.ticket)}" />
    <label><span>${tr('tracy.code')}</span><input class="otp" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="000000" required autofocus /></label>
    <button type="submit">${tr('tracy.codeVerify')}</button>
  </form>
  <p class="foot">${tr('tracy.codeValid')}</p>
  <a class="back-link" href="${mount}/gateway/tracy">${tr('tracy.again')}</a>`;
  return tracyPage(shell, { lang: params.lang, title: tr('tracy.title'), body });
}

/** The waiting screen — USED BY THE GOOGLE/GITHUB BRANCH ONLY. */
/**
 * The WAITING screen, and why it exists instead of a `302` and back.
 *
 * Tracy's `safeReturnUrl` accepts only `https://<something>.tracy.ai`, on purpose: that value
 * becomes the target of a 302 AFTER identity is proven, and accepting anything would let a sign-in
 * end on a stranger's machine (audit 29/08). A lane on loopback (`http://127.0.0.1:51731`) cannot
 * pass that filter, and should not.
 *
 * So the lane does not ask to be sent back. It ASKS: `GET /auth/link/:nonce` is the seat book's
 * door built for Tracy Desk, which has no public address to receive a redirect either. The lane is
 * in the same position and uses the same door — Tracy opens in a new tab, this one waits until the
 * seat book says "done".
 */
export function renderTracyWaiting(shell: PageShell, params: { lang: Lang; nonce: string; url: string }): string {
  const mount = currentMount();
  const tr = (key: string, tp?: Record<string, string | number>) => t(params.lang, key, tp);
  const body = `
  <div class="logo">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" stroke-width="1.6"/><path d="M12 7v5l3 2" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg>
  </div>
  <h1>${tr('tracy.waitTitle')}</h1>
  <p class="sub">${tr('tracy.waitSub')}</p>
  <div class="sent" id="tracy-state">${tr('tracy.waitPending')}</div>
  <a class="btn-alt" id="tracy-open" href="${escapeHtml(params.url)}" target="_blank" rel="noopener">${tr('tracy.waitOpen')}</a>
  <a class="back-link" href="${mount}/gateway/tracy">${tr('tracy.again')}</a>`;
  return tracyPage(shell, {
    lang: params.lang,
    title: tr('tracy.title'),
    body,
    // THIS SCREEN USED TO WAIT FOREVER WITHOUT SAYING SO (measured 01/09). All three ways out —
    // `done`, `expired`, `error` — required the seat book to ANSWER AT ALL. Everything else (404,
    // 502, a dropped connection, malformed JSON) fell into an empty `catch {}` and rescheduled two
    // seconds later, forever, under one unchanging line reading "Waiting…". The person could not
    // tell "not finished yet" from "broken ten minutes ago", and neither could the logs.
    //
    // Two things were added, both only so the screen stops lying:
    //   - network failures COUNT. Three in a row is enough to say so; a single one is not, because
    //     a network hiccup is ordinary and a warning that flickers is worse than silence.
    //   - there is a CEILING. A sign-in lives 15 minutes; polling past that is polling a nonce that
    //     is certainly dead. Stop and say so, instead of knocking at the seat book until the person
    //     closes the tab.
    script: `<script>
  const nonce = ${JSON.stringify(params.nonce)};
  const state = document.getElementById('tracy-state');
  // Open in a NEW TAB, never navigate this one: this tab is the one waiting, and it has to stay
  // alive to receive the session.
  setTimeout(() => { window.open(document.getElementById('tracy-open').href, '_blank', 'noopener'); }, 150);
  const EVERY_MS = 2000;
  const DEADLINE = Date.now() + 15 * 60 * 1000;
  let stop = false;
  let failures = 0;
  const say = (text) => { stop = true; state.textContent = text; };
  const tick = async () => {
    if (stop) return;
    if (Date.now() > DEADLINE) { say(${JSON.stringify(tr('tracy.linkInvalid'))}); return; }
    try {
      const res = await fetch(${JSON.stringify(`${mount}/gateway/tracy/poll?n=`)} + encodeURIComponent(nonce), { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      failures = 0;
      if (body.done) { say(${JSON.stringify(tr('tracy.waitDone'))}); location.href = body.next || ${JSON.stringify(`${mount}/`)}; return; }
      if (body.state === 'expired') { say(${JSON.stringify(tr('tracy.linkInvalid'))}); return; }
      if (body.error) { say(body.error); return; }
    } catch {
      if (++failures >= 3) { say(${JSON.stringify(tr('tracy.waitUnreachable'))}); return; }
    }
    setTimeout(tick, EVERY_MS);
  };
  setTimeout(tick, EVERY_MS);
</script>`,
  });
}

