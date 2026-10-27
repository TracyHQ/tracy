// What gateway.ts imports from the Tracy layer for hooks H0, H7, H8 (seat context), H9 (pages) and H12, in one line.
// The policy seam (H1, H2, H4, H5, H12's decision) stays in `./index.ts`.
export { registerTracyDoors, usageReportGate } from './gateway-doors.js';
export { mountMiddleware as tracyMountMiddleware, trustProxySetting as tracyTrustProxy, trustedProxiesOf, unmount as tracyUnmount } from './mount.js';
export { TRACY_PAGE_CSS, tracyHtmlLang, tracyLangCookie, tracyLangSwitch, tracyMount } from './gateway-page.js';
export { seatEventContextOf as tracySeatEventContext } from './seat-events.js';
export { answerLogout as tracyAnswerLogout } from './tracy-door.js';
export { answerRpcLocally as tracyAnswerRpc } from './rpc-stub.js';
