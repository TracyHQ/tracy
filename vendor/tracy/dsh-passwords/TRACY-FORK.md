# TRACY-FORK — `dsh-passwords` fork ledger

Upstream: slywalker2006/dsh-passwords, tag `v2.7.7`, commit `d9a327c` (03/10/2026). Fork shape: [ADR 0027](../../../docs/adr/0027-dsh-passwords-upstream-base-tracy-policy-layer.md).

## 1. Rules
- Upstream core (every file outside `src/tracy/`, `src/locales/`, and the files with hooks in §3) is byte-identical to `upstream-snapshot.sha256`.
- The Tracy part lives in `src/tracy/`; one file per policy; tests by invariant id (§2).
- Adding a hook = adding a row to §3 **and** editing `tasks/todo-dsh-passwords-2-7-7.md` in the same PR.

## 2. Invariant ↔ file ↔ test (83, see `tasks/evidence/dsh-passwords-2-7-7/pw-tracy-invariants.md`)
| Id | Invariant | File in `src/tracy/` | Test | Hook |
|---|---|---|---|---|
| R1 | A seat calls only the sidebar routes in the table (including `fs.trees`), session in the body | `routes.ts` `classifySeatHttp`, `seatRouteSessionOf`, `checkSeatBody` (reuses upstream's `collectSessionIds`) | `routes.test.ts` › "R1: …", "R3/R4/R6: …", "R1/R4: the sidebar body check …" | H1+H2 (`decideSeatHttp`/`checkSeatBody` read the same table) |
| R2 | `fs.write/rename/remove/mkdir`, `/sidebar/upload` are write routes (need `allow_upload`) | `routes.ts` `classifySeatHttp` (`write: true`) | `routes.test.ts` › "R2: …" | Phase 2: H1 (H1 currently still blocks write routes) |
| R3 | `/sidebar/file`, `/archive`, `/upload`: exactly one `sessionId` query; `/sidebar/html/<sid>/…` session in the path | `routes.ts` `classifySeatHttp`, `sidebarHtmlSessionOf`, `seatRouteSessionOf` | `routes.test.ts` › "R3: …", "R3/R4/R6: …" | Phase 2: H1 |
| R4 | `subagents.live` takes the session from `rootSessionId` | `routes.ts` table `SEAT_SIDEBAR_API`, `seatRouteSessionOf` | `routes.test.ts` › "R4: …", "R3/R4/R6: …" | H1+H2 |
| R5 | `jobs.*`, `browser.probe`, `sidechat.*`, terminal, git: owner-only | `routes.ts` `classifySeatHttp` (default `owner-only` under `/sidebar`) | `routes.test.ts` › "R5: …" | H1 |
| R6 | Seat WS only `/sidebar/ws/fs-watch`, `/agent-opens`, `sessionId` query | `routes.ts` `classifySeatWs`, `seatRouteSessionOf('query')` | `routes.test.ts` › "R6: …", "R3/R4/R6: …" | Phase 2: H6 |
| R7 | `settings.get` open to seats, `settings.update` owner | `routes.ts` table (`sessionFrom: 'none'`) | `routes.test.ts` › "R7: …" | Phase 2: H1 |
| R8 | Chunk `GET/HEAD /sidebar/bundle/<name>.js` open | `routes.ts` `SIDEBAR_CHUNK_RE` | `routes.test.ts` › "R8: …" | Phase 2: H1 |
| R9 | `POST /api/tracy-site-tools/held` only for one's own session | `routes.ts` `TRACY_SESSION_API_RE` | `routes.test.ts` › "R9: …" | Phase 2: H1+H2 |
| R10 | `/api/file`: only inside one's own session cwd, realpath included | `routes.ts` `seatMayReadFile`, `fileDoorTarget` (reuses upstream's `normalizePath`, `pathWithin`) | `routes.test.ts` › "R10: …" | Phase 2: H1 (realpath at the caller) |
| R11 | `GET/HEAD /manifest.webmanifest` public | `routes.ts` `classifySeatHttp` → `public` | `routes.test.ts` › "R11: …" | Phase 2: H12 |
| R12 (Phase 5, L3) | A seat fails closed on unknown paths outside `/sidebar` (plan §5 question 1): it reaches dsh only for a seat table row, `/api/dsh-passwords/*`, dsh's RPC namespace (`isOfficialApiPath`, GET/HEAD/POST only — dsh registers no PUT/DELETE), dsh's shell + static files (`isOfficialRootPath`, `/s/<id>`, GET/HEAD only), or a `SEAT_PLUGIN_ROUTES` row (one reason per row; source: seat A/B UI measured on the stand 05/10 + each plugin's client). Does not follow upstream's `official`/`third-party` label: the dynamic manifest marks EVERY loaded plugin route `official`. `dsh-subscriptions` opens only `status`/`config` GET (the other routes manage the HOST's model subscriptions and check only same-origin). Master keeps upstream behaviour. WS: already fail-closed since Phase 2c (R6, `seat-ws.ts`) | `routes.ts` `seatMayReach`, `SEAT_PLUGIN_ROUTES`, `decideSeatHttp` | `seat-unknown-routes.test.ts` (unknown paths ×24, measured UI ×17, plugin clients ×15, `hold` signed by tracy-web, master); `request-path.test.ts` Q3 (door changed to an allowlist row); `gateway-allowed-folders.test.ts` S12 | H1 |
| R12 empty answer (Phase 5) | Three upstream RPCs deliberately closed to subusers, which every seat's dsh client calls on each page load (`dynamicCordisRunner/inventory` → `[]`, `dynamicCordisRunner/syncInspectManifest` → `null`, `session/canOpenWorkspacePath` → `false`), get an empty `server-response` from the gateway instead of 403 (the client prints a 403 as a console error, ~230/30 minutes). 0 requests reach dsh; the envelope is read strictly like upstream's terminal stub; another method in the namespace, or a wrong envelope → still 403. 2.6.6 did not know these two namespaces (forwarded straight, for no reason) — not reopened | `routes.ts` `seatEmptyRpcAnswer`; `rpc-stub.ts` `answerRpcLocally` | `seat-unknown-routes.test.ts` ×2 | H1 (verdict `answer-rpc`) |
| Q2 empty body (Phase 5) | A seat's non-JSON `/api/*` write is refused unless the query names a held session — **except a request with no body by HTTP framing** (no `transfer-encoding`, `content-length` absent/0): there is nothing to hide. The client's `POST /api/tracy-site-tabs/hello`, `/api/tracy-site-tools/hello` pings are sent bodyless, 403 ×90/30 minutes on the stand | `request-path.ts` `decideSeatRequest` (`bodyless`); `proxy-hooks.ts` sets `bodyless` | `seat-unknown-routes.test.ts` › "L3/Q2: …" | H1→proxy |
| Q2 | Every session via `SESSION_REF_KEYS` (any depth) + `dsh-session:` | `session-refs.ts` `collectSessionRefs`, `sessionMentionsIn` | `session-refs.test.ts` › "Q2: …" (2 cases) | Phase 2: H2 |
| Q3 | Session in the query; repeated key → 403 | `session-refs.ts` `collectQuerySessionRefs` | `session-refs.test.ts` › "Q3: …" | Phase 2: H2 |
| Q5 | Only a successful create/fork records a grant | `session-refs.ts` `createdSessionIdOf` | `session-refs.test.ts` › "Q5: …" | Phase 2: H3 |
| Q8 | `session/search`, `candidates`: field allowlist, `hasMore=false`, unknown shape → 502 | `session-refs.ts` `filterSessionAnswer` | `session-refs.test.ts` › "Q8: …" | Phase 2: H3 |
| Q10 | Other people's `prompter` email is removed | `session-refs.ts` `scrubForeignPrompterEmails` | `session-refs.test.ts` › "Q10: …" | Phase 2: H3, H5 |
| J1 | `job/list`, `job/follow` only for granted sessions; follow requires `jobId`; refused per stream | `streams.ts` `decideOpen` | `streams.test.ts` › "J1: …" (4 cases) | H4 (wired in Phases 2–3; today H4 has only half the endpoints) |
| J2 | `job/list`/`opened`/`status` only jobs of the stream's session, drop `output.spillPaths` | `seatJobView`, `stripSpillPaths`, `filterDown` | "J2: …", "J3/J2: …" | H5 (not wired) |
| J3 | `output` only after `opened`/`status` of one's own job — 0 frames before that | `filterDown` (`jobOpened`) | "J3: … 0 output frames …"; integration `slice.test.ts` › J3 | H5 (upstream `jobOwnerConfirmed` already blocks at runtime) |
| J4 | Grant lost (or banned) mid-stream → `cancel` up to dsh + `end` to the client — **every** stream, not only jobs as in the 2.6.6 fork | `filterDown` → `cancel-upstream` | "J4: …", "J1/V1: a seat banned mid-stream…" | H5 (needs a new `DownVerdict` kind) |
| Q13 | `session/follow` opens by grant (book); rechecked every frame. Unlike the 2.6.6 fork: an ungranted session / malformed args → refuse **only that stream** (the fork closed the socket with 1008) | `decideOpen`, `sessionFollowTarget`, `filterDown` | "Q13: …" (4 cases) | H4, H5 |
| C7 | Subagent follow checks the PARENT session | `sessionFollowTarget` | "C7/Q13: …" | H4 |
| Q14 | Unknown frames/fields pass on but are fenced per field | `fenceStreamIds`, `FENCED_OUT`, `fenceUnknownFields`, `WORKSPACE_FOLLOW_KNOWN_FRAMES` | "Q14: …" (7 cases, 5 ported from `permissions-pure`) | H5 (needs the RAW value: upstream drops unknown frames/fields) |
| Q15 | An `upsert` with an ungranted session waits 400 ms once, then filters again | `decideUpsertHold`, `UPSERT_HOLD_MS` | "Q15: …" | H5 (needs the raw value + a timer in core) |
| Q16 | Questions go only to a seat that can answer; an answer is accepted once, from the right seat, live stream, unchanged folder | `filterDown` (`$events` waterfall/cancel), `claimQuestionAnswer` | "Q16: …" (3 cases) | H5 + H2 (`$events/result`) |
| Q17 | `$events` only `api-session/status` of one's own session, rebuilt from checked fields | `filterDown` (`filterEvents`) | "Q17: …" | H5 |
| Q18 | The `workspace/follow` baseline builds the archive snapshot | `archiveSnapshotFromBaseline` (upstream already does it: `userArchivedSessionIds`) | "Q18: …" (pure + 2 regression integration cases) | upstream |
| S13 | The `ready` frame replaces `host.home` with the granted folder | `filterDown` (`filterEvents`) | "S13: …" | H5 |
| V4 | A cancelled stream id is not reused until `end`/`error`; late frames dropped | `createCancelLedger`, `noteClientCancel`, `upstreamFrameAfterCancel`, `decideOpen` | "V4: …" (2 cases) | H4 + the proxy's frame receive loop (not wired) |
| V5 | An unknown endpoint is refused per stream, 0 open frames to dsh | `decideOpen`, `decideSeatStreamOpen` (wired at H4) | "V5: …" (3 cases); `slice.test.ts` › V5 | H4 |
| C8 | `userQuestions/attachWait`, `productAnalytics/watchPolicy` refused per stream | `SEAT_STREAM_ENDPOINTS` | "C8: …", "V5/C8: …" (2 cases) | H4 (wired) |
| C1 | `session/control`: `projections` required; `jobs`/`queues` filtered when present | `filterDown` (the `projections` half); filtering = upstream | "C1: …" (pure) + regression integration | H5 + upstream |
| C2 | `workspace/follow` `pinnedSessionIds`, `pinned` frame | — (upstream) | regression integration "C2: …" (2 cases) | upstream |
| S1 | A seat lists only workspaces whose path EQUALS the granted folder | `seat-context.ts` `workspaceListed` | `seat-context.test.ts` S1 ×2 | H15 (8 group-L doors) |
| S2 | Several seats sharing one granted folder do not block each other; the parent folder does not leak into the subtree | `seat-context.ts` `sharedGrantExempt` | S2 ×2 | H15 (`gateway.ts` 1967, 2002) |
| S3 | Workspace write/create only inside the box; only a `__deny__` seat is exempt on create | `seat-context.ts` `insideBox`, `workspaceCreateExempt` | S3 ×3 | H15 (`proxy.ts` 2606, 2620) |
| S4 | The picker opens at the top folder and lists nothing outside the box | `seat-context.ts` `directoryPickerPathFor` | S4 ×3 | H2/H3 |
| S5 | A seat is never master (even when upstream `init()` promotes the first account) | `persistence.ts` `migrate`, `seatRole` | `persistence.test.ts` S5 ×3 | H10 |
| S6 | Empty grant = `__deny__` | `seat-context.ts` `permissionsFor` | S6 | H7 |
| S8 | Permission matrix by role/toolset | `seat-context.ts` `permissionsFor` | S8 ×4 | H7 (+H6 for `webSocketPaths`) |
| S14 (TCH ADR 0028) | Three seat book roles `owner/editor/viewer` (+ `guest/bot` of the seat door); old roles `admin`/`developer` → `editor` (`seatRoleOf`). Fixed toolsets: owner 4, editor `content/code/site`, viewer none. A seat without `content`/`code`/`site` is **read-only** like guest (sandbox `read-only`, no upload/git/terminal/workspace creation) but **without** the hourly token ceiling | `seat-context.ts` `seatRoleOf`, `toolsetsForRole`, `permissionsFor` | `seat-context.test` S8/S14 ×3; `seat.test` S8/S14 | H7 |
| S10 | Seat folder = `/site/<label>` after realpath | `seat-context.ts` `seatFoldersFor` | S10 ×3 | H7 |
| S12 | The gateway's `x-dsh-allowed-folders` header, replacing the client header, absent for master | `seat-context.ts` `applyAllowedFoldersHeader` | S12 ×4 | H13 |
| Q1 | A seat reads only sessions it created + grants from master; seeding gives a seat nothing | `persistence.ts` `isGrantHonoured`, `honouredGrants`, `seedUserSessionGrants`, `writeMasterGrants` | Q1 ×6 | H10 (+ master's grant-writing path in core must go through `writeMasterGrants`) |
| Q4 | `seatHoldsSession`: book + not disabled + cwd inside the box; the book beats the cache | `seat-context.ts` `seatHoldsSession` | Q4 ×4 | H2/H3/H5 |
| Q5 | Only a successful create/fork records a grant; not someone else's id; watermark | `seat-context.ts` `grantFromCreateAnswer` + `persistence.ts` `recordCreatedSession` | Q5 ×5 | H3, H10 |
| Q6 | Third path: cwd from the answer, inside the box | `seat-context.ts` `grantFromCreateAnswer` | Q6 | H3 |
| Q7 | Learn `workspaceId → path` from `workspace.create`, only for a requested folder | `seat-context.ts` `learnWorkspacePath` | Q7 ×2 | H3 |
| Q11 | Stamp `prompter` for every account, replacing the client value | `prompter.ts` `stampPrompter`, `requestArguments`, `isPromptRequest`; email: `persistence.ts` `emailOf` | `prompter.test.ts` Q11 ×6, `persistence.test.ts` Q11 | H2 |
| V1 | Revocation closes every pending mux/WS/SSE/HTTP of the account (1008) | ONE book: upstream's connection set (`registerUserWebSocketClient`); a seat's HTTP enters the book via `proxy-hooks.ts` `watchSeat` (`createRevocationRegistry` removed, fixreq) | `gateway-pending-revoke` V1 ×2; `revocation.test.ts` V1/V6 ×2 | H6, H11 |
| V2 | A frame from a banned account / changed cv → close 1008 | `revocation.ts` `frameVerdict` | V2 ×2 | H6 |
| V3 | Revocation bumps `credential_version` | `persistence.ts` `bumpCredentialVersion` | V3 | H7, H10 |
| V6 | Role/grant change → drop the permission snapshot at once | `revocation.ts` `onEvent` → `invalidate` | V1/V2/V6, V6 | H6 |
| V6 × mint (Phase 5, L1) | Re-minting a seat (seat door, Tracy door): always drop the account's token cache; drop the permission snapshot only when `seatRoleChanged` (as in 2.6.6-tracy.64, TCH #300). Re-minting with the same role does not make the seat's open tab hit 403 `folderDenied` | `gateway-doors.ts` `seatMinted`; `seat-door.ts`, `tracy-door.ts` pass `seatRoleChanged` from `upsertSeatUser` | `seat-remint.test.ts` ×3 (seat door same role / different role, Tracy door) | H7 |
| H10 | The migration only ADDS `users.seat_role`, `users.email`, `user_session_grants.origin`/`seed_tick`, table `session_grant_clock`; idempotent; a DB already migrated by the 2.6.6 fork changes nothing | `persistence.ts` `migrate` | H10 ×4 | H10 |
| (filled in Phases 1–3) | | | | |
<!-- Phase 2b reqpath (branch pha2/reqpath): H1 completed in the proxy, H2, H3, H11, H13, H15. Cases run through the real gateway + a fake dsh (`test/tracy/gateway-harness.ts`). -->
| R1–R10 (2b) | The seat route table is complete before a request to dsh is built: writes need `allow_upload` (R2), session in query/path (R3), `settings.get` + chunk (R7, R8), `/held` needs one's own session (R9), `/api/file` only inside one's own session cwd + realpath, repeated `path` key → 403 (R10); writes to unknown paths outside `/api`, `/sidebar` → 403 | `request-path.ts` `decideSeatRequest`; `routes.ts` `decideSeatHttp` (the gateway blocks only `/sidebar` outside the table), `sidebarApiRouteOf` | `request-path.test.ts` (R2 ×2, R3, R7/R8, R9, R10, H1 unknown path); `gateway-proxy-headers-tracy.test.ts` (R5, R1–R5/R10, R9, R2) | H1 (gateway) + H1→proxy |
| Q2 (2b) | Every JSON `/api/*` write of a seat: every session (`collectSessionRefs`, mention) must be held; a non-JSON `/api/*` write → 403 unless the query names a held session (upload door) | `request-path.ts` `decideSeatRequest`/`checkSeatRequestBody` | `gateway-seat-private-sessions.test.ts` Q2 (page, prompt+mention, 21 doors) ×2 roles; `request-path.test.ts` Q2 media | H2 |
| Q3 (2b) | Every `SESSION_REF_KEYS` key in the query of `/api`, `/sidebar`: repeated → 403, must be held | `decideSeatRequest` (`collectQuerySessionRefs`) | `request-path.test.ts` Q3; private-sessions Q3 export/upload ×2 roles | H1→proxy |
| Q8/Q9/Q10 (2b) | Search/candidates rebuilt from known fields, kept by permission AT ANSWER TIME; page/history delivered only when the session is still held at answer time; other people's `prompter` email removed | `request-path.ts` `filterSeatAnswer`; `answer-shim.ts` `holdAnswer` (holds the whole answer; over 16 MiB/not JSON → 502, 0 bytes) | private-sessions Q8 ×5, Q9, Q10; `answer-shim.test.ts` ×5 | H3 |
| Q11 (2b) | Stamp `prompter` (every account, master `email: null`) in the command's arguments | `checkSeatRequestBody`; email reads `getUserEmail` next to the upstream row (`SeatBook`, provided by H10) | `gateway-prompter.test.ts` ×6 | H2 |
| S4 (2b) | Picker: list outside the box → 403 before dsh; no path → opens at the box; createDirectory only inside the box; unknown shape → 403 | `checkSeatRequestBody` (`directoryPickerPathFor`, `insideBox`) | `gateway-directory-picker.test.ts` ×6; `seat.test` S4 ×3 + S1/S2 (skip removed) | H2 |
| S12 (2b) | The `x-dsh-allowed-folders` header is fixed before the request is built | `seat-context.ts` `applyAllowedFoldersHeader` via `policy.forwardHeaders` | `gateway-allowed-folders.test.ts` ×5 | H13 (HTTP; WS not yet — mux area) |
| S1/S2/S3 (2b) | Listing only the exact granted folder; two seats sharing a granted folder do not block each other; create exempt only for a `__deny__` seat | `seat-context.ts` via `policy.workspaceListed/sharedGrantExempt/workspaceCreateExempt` | `gateway-shared-folder.test.ts` ×4 | H15 |
| Q7 (2b) | `workspace.create` → `session.create` by id without a list | upstream (the workspace-management branch learns the id→path pair itself) | `gateway-workspace-create-cache.test.ts` ×3 (regression) | upstream |
| K1 (2b) | Write fence per request lifecycle: admit before the handler (every account, every write), its own connection, keep a request whose body is complete when the client leaves, a held request touching an archived site → 409 `SITE_ARCHIVED` | `proxy-hooks.ts` `admitWrites`, `begin`, `writeFenceFor`/`installWriteFence` | `gateway-write-fence.test.ts` ×6 | H11 |
<!-- Phase 2c (branch pha2/streams2): wiring state of the stream invariants; these rows replace the "Hook" column of the Phase 1 rows with the same id. -->
| J1 | (Phase 2c) open by grant wired; `job/kill` only for a job that the seat's filtered stream has shown | `mux-seat.ts` `createSeatMux`, `createJobOwnerBook`; `streams.ts` `decideSeatJobKill` | `stream-mux` J1 ×1, `job-kill` J1 ×6 | H4 (wired); `job/kill`: plugged into `proxy-hooks.ts` `checkBody` (fixreq), case through the gateway `job-kill` › "J1 (gateway)" |
| J2, J3 | (Phase 2c) wired | `mux-seat.ts` `item` → `filterDown` | `stream-mux` J2, J2/J3, J3 ×2 | H5 (wired) |
| J4 | (Phase 2c) grant lost/banned mid-stream → `cancel` up to dsh + `end` to the client, even when upstream already dropped the frame | `streams.ts` `streamStillHeld`; `mux-seat.ts` `item` | `stream-mux` "J4: …", "J4/Q13: …" | H5 (wired) |
| Q13, C7 | (Phase 2c) decided at open, asked again when the baseline releases a held stream | `mux-seat.ts` `clientFrame`, `recheck` | `stream-open` Q13 ×3, `stream-mux` C7/Q13 | H4 (wired) |
| Q14 | (Phase 2c) unknown `workspace/follow` frames pass through fenced (reads the raw value) | `mux-seat.ts` `item` (`raw`) | `stream-mux` Q14 | H5 (wired) |
| Q15 | (Phase 2c) upstream is enough (`pendingCreatedSessions` + compensating upsert); the fork's 400 ms timer is NOT wired | — | `stream-q15` Q15 ×3 (mutating the Tracy layer tighter/looser → red) | upstream + H5 |
| Q16, Q17, S13 | (Phase 2c) wired | `filterDown` (`filterEvents`) | `stream-mux` Q16, Q17, S13 | H5 (wired) |
| Q10 | (Phase 2 fixmux) mux + SSE + WS events: the seat's own email kept, others' removed; source `persistence.ts` `ownEmailOf` (`TracyStore.emailOf`) | `mux-seat.ts` `item`, `seat-events.ts` `seatEventContextOf` | `stream-mux` Q10, `stream-events` Q10, `stream-seat-book` Q10 ×3 | H5, H8 |
| Q1 (stream) | (Phase 2 fixmux) every stream door reads the grant book by Tracy's source rule (`grantHonoured` = `isGrantHonoured`; DB without a store → `hasUserSessionGrant`): mux open, sidebar socket, SSE/WS events; a session id whose book row is NOT honoured (`legacy` of a non-owner seat, `seed`) is dropped from every id list of `workspace/follow` (baseline, upsert, `archived`, `pinned`) and of host events | `persistence.ts` `grantHonoured`, `grantRefused`; `mux-seat.ts` `seatViewOf` (`holdsSession`, `bookRefuses`); `streams.ts` `withoutRefusedIds`, `dropRefusedSessions`; `seat-events.ts` | `stream-seat-book` Q1 ×7 | H4, H5, H6, H8 |
| R5/S8 (WS) | Decided 05/10: no seat opens a terminal WS, including the `code` toolset, at the root and under a mount | `seat-ws.ts` `decideSeatWs` | `gateway-prefix` "R5/S8: …" | H6 |
| Q17 (SSE) | (Phase 2c) SSE/WS events with a `sessionId` must belong to the book + not be disabled | `seat-events.ts` `filterSeatEvent` | `stream-events` Q17 | H8 |
| V4 | (Phase 2c) cancel book in two places | `mux-seat.ts` `clientFrame`, `upstreamFrame` | `stream-mux` V4 ×4 | H4 (wired) |
| V5, C8 | (Phase 2c) Tracy error `gateway/method-unavailable` + `details.endpoint`; upstream errors keep the upstream code | `streams.ts` `decideSeatStreamOpen` | `stream-open` V5, `stream-mux` V5, C8 | H4 |
| R6 | (Phase 2c) a seat only `fs-watch`/`agent-opens` with one held `sessionId`; other WS 403 | `seat-ws.ts` `decideSeatWs` | `stream-ws` R6 ×13 | H6 (wired) |
| V1, V6 | (Phase 2c) close 1008 through upstream's two connection sets; pending HTTP NOT registered yet | `revocation.ts` `revokeSeatConnections` | `revocation` V1/V6 ×2, `stream-ws` V1 (via `session-invalidate`) | H6; called by the revocation door (H7) |
| V2 | (Phase 2c) every mux client frame checks ban/`credential_version` | `mux-seat.ts` `admit` (`frameVerdict`) | `stream-ws` V2 ×2 | H6 (wired) |
| C1, C2 | (Phase 2c) regression through the gateway | upstream + `filterDown` | `stream-mux` C1 ×2, C2 | H5 |
<!-- Phase 1 movefiles (branch pha1/movefiles): case count = top-level cases; S4, S1/S2 (4 picker cases in seat.test, skipped) belong to seat-context/routes. -->
| S5 | A seat is never master | `seat.ts` `upsertSeatUser` (demotes admin→user) | `seat.test` S5 ×3 (skipped, waiting for H10) | H10 |
| S6 | Empty grant = `__deny__` | `seat-context.ts` `permissionsFor` (one copy; `seat.ts` re-exports, fixdoors) | `seat.test` S6 | — |
| S7 | One account per (email, site); revocation by site/email | `seat.ts` `seatUsername`, `revokeSeat` | `seat.test` S7 ×10; `seat-door` S7 ×4 (skipped, H7) | H7 |
| S8 | Permission matrix by role/toolset — 2.7.7 row: `allowSsh: false`, the terminal rule goes next to the row (`webSocketPaths`), `allowUpload = !isVisitor` | `seat-context.ts` `permissionsFor`; `seat.ts` `upsertSeatUser` writes exactly that copy | `seat.test` S8 ×7 + "S6/S8: the seat door writes ONE role matrix…" (fixdoors) | — |
| S9 | The site workspace is registered implicitly, title = site key, self-heals on revisit, stops when the seat is revoked | `seat-home.ts` `createSiteWorkspaceRegistrar`; `seat-door.ts` `healSiteWorkspaces`, `workspaceTitles` (fixdoors) | `seat-home` + `seat-home-retention` S9 ×13; `gateway-site-workspace` ×13 + 1 TODO (fork port, "revisit" = `workspace/follow` baseline: dsh 0.2.0 has no `workspace/list`) | H7 + S9 hook (baseline, §3) |
| S11 | Private `home` workspace, needs an email | `seat-home.ts` `ensurePersonalWorkspace` | `seat-home` S11 ×6; `seat-door` S11 ×3 (skipped, H7) | H7 |
| S14 | Sweep of unclaimed guests 0 days, does not touch admins | `seat.ts` `sweepVisitors` | `seat.test` S14 ×2; `seat-door` S14 (skipped, H7) | H7 |
| L1 | Seat door HMAC-signed, one-time nonce | `seat.ts` `signSeatRequest`/`verifySeatRequest` | `seat.test` L1 ×4; `seat-door` L1 ×2 (skipped, H7) | H7 |
| L2, L3, L11 | `/gateway/login`+`/setup` 404 when a secret is set; role needs an email, absolute folder; `whoami` | (seat door router — Phase 2) | `seat-door` ×5 (skipped, H7) | H7 |
| L4 | A seat account does not log in with a password | `seat.ts` `unusablePasswordHash` | `seat.test` L4 | — |
| L9 | `mintSessionToken` same TTL/key/`cv` as `login()` | `auth-token.ts` | `auth-token` L9 ×3 (new) | H14 |
| K1 | Write fence while a site is archived | `write-fence.ts` (`touchesArchivedSite` takes a `SessionRefReader`) | `session-archive` K1 ×16 (2 skipped waiting for `session-refs.ts`); `seat-door` K1 ×5 (fixreq: skip removed, + marker case) | H11 |
| K2 | `forget-workspace` archives + stops sessions before removing | `seat-home.ts` `forgetWorkspace`, `settleSiteSessions` | `seat-home` K2 ×17; `seat-door` K2 ×2 (skipped, H7) | H7 |
| K3 | `archive-sessions` of one `/site/<label>` | `session-archive.ts` | `session-archive` K3 ×14; `seat-door` K3 ×4 (skipped, H7) | H7 |
| K1 | Write fence while a site is archived | `write-fence.ts` (`touchesArchivedSite` takes a `SessionRefReader`) | `session-archive` K1 ×16 (2 skipped waiting for `session-refs.ts`); `seat-door` K1 ×4 (skip removed in fixdoors: the seat door `installWriteFence` so the proxy and the archive door use the SAME fence) | H11 |
| K2 | `forget-workspace` archives + stops sessions before removing | `seat-home.ts` `forgetWorkspace`, `settleSiteSessions` | `seat-home` K2 ×17; `seat-door` K2 ×2 (through the real gateway) | H7 |
| K3 | `archive-sessions` of one `/site/<label>` | `session-archive.ts` | `session-archive` K3 ×14; `seat-door` K3 ×4 (through the real gateway) | H7 |
| K4 | `usage/report` bucket burst 4, refill 1/5 s | `usage-report-limit.ts` | `usage-report-limit` K4 ×4 | H7 (2.7.7: route at `admin.ts:1907`) |
| K5 | prefix from `trustedProxies`; the client uses `dshUrl` (sending) and `dshPathOf` (recognising dsh's requests under a mount) | `src/client/tracy/page-base.ts` | `page-base` K5 ×4 (new); `client-mount` K5 ×3 (`api()` under a mount, sign-in redirect under a mount, scan of every client `/api/…` `/gateway/…` URL); `picker-delete-mount` K5 ×2 (2.7.7-tracy.8: `dshPathOf`; the owner's picker reads the folder list under `/<site>/`, `/new/`, at the root, and nothing else); `gateway-prefix` K5 ×7 (skipped, H0/H7) | H0, H16 client |
| K6 | The chat bubble is off by default | (plugin.ts — Phase 2) | `chat-toggle` K6 ×2 (skipped, H9) | H9 |
| W1 | A seat cannot delete / rename the workspace of its own granted folder (`/site/<label>`): 403 `gw.workspaceDenied`, dsh receives no RPC; master can still delete it. No hook added: the upstream 2.7.7 rule only lets a subuser rename/remove workspaces registered under its own account (`proxy.ts` `workspaceOwnedByUser`), while the seat door registers the site folder under master's name. The test is pinned so a change that hands folder ownership to a seat is caught (TCH `tasks/todo-site-row-delete-site.md` step 3, 09/10) | (upstream rule, no Tracy file) | `gateway-site-workspace` › "a seat cannot delete or rename its own site folder workspace…", "the master is not a seat…" | — |
| R11 | Signed-out manifest reaches dsh | (Phase 2) | `gateway-prefix` R11 ×4 (2 run, 2 skipped H12) | H12 |
| I1 | 8 languages, English fallback, `?lang` > cookie > dsh > browser | `i18n/gateway-langs.ts`, `i18n/index.ts` | `i18n-surfaces` I1 ×26 (8 skipped H7/H9), `i18n-catalogue` I1 ×5 (the password page has all 6 catalogues since tracy.4), `i18n-mobile` ×1 (skipped, 6 sub-cases) | H9 |
| I2 | "Tracy" replaces "dsh" | `i18n/strings.ts` (14 zh/13 en), `i18n/client-brand.ts` (4+4); `plugin.ts` 2 answers (`NOT_CONFIGURED`, patch reload) | `i18n-catalogue` I2 ×3 | H9, client |
| I3 | The code page does not state an expiry | `i18n/strings.ts` `tracy.codeValid` | `transactional-mail-copy` I3 ×3 (1 skipped H7) | H7 |
<!-- Phase 2a doors (branch pha2/doors): hooks H0, H7, H9, H10, H12, H14 wired; cases with skip removed noted in the Test column. tracy-core.json budget: gateway.ts maxRemoved 10→30 because of the page hooks (H9: CSS 3 lines, switch + action 4, lang cookie 4, html lang 2, csrf 1) and H12 replaces upstream's 7 redirect lines with one call; config/auth/db/admin rows added for the new hooks. -->
| H9 cfg | `MCP_SEAT_SECRET`, `MCP_TRACY_{ORIGIN,SEATS_ORIGIN,SITE_KEY,ACTOR_SECRET,SITE_LABEL}`, `MCP_GATEWAY_TRUSTED_PROXIES` to config; empty = no door. The gateway spawned by the plugin reads these keys (+ `MCP_TRACY_FLEET`) from the deploy file, not from inherited env | `config.ts` `readTracyConfig`, `readTrustedProxies`, `TRACY_MANAGED_ENV_KEYS` | `config.test` ×4 | H9 |
| H9 dep | Packages that `src/tracy` imports at runtime are in `dependencies` (not dev) — `yaml` | `package.json`, `npm-shrinkwrap.json` | `package-deps.test` ×1 (new) | H9 |
| K6 | The chat bubble is off by default (`=== '1'`) | `chat-entry.ts` `chatEntryEnabled`; `plugin.ts` re-export + state | `chat-toggle` K6 ×2 (skip removed) | H9 |
| A1 | Service `ctx.tracyAssertion`: signs "I am asking on behalf of this person" for 60 s for sibling plugins (`tracy-site-tabs` records the moment, `tracy-site-tools` signs the person who typed); the key `MCP_TRACY_ACTOR_SECRET` never leaves the file; no key = no service. **Missed in the 83-row table, lost in 2.7.7-tracy.2, found in dev acceptance 06/10** (every chat turn logged `cannot sign for the person who typed`) | `assertion.ts` `mintTracyAssertion`, `provideTracyAssertion` | `assertion.test` ×5 (cross-checked with tracy-web's `verifyActor`) | H9 |
| S5 | A seat is not master: `init()` migrates + demotes seats + promotes the earliest non-seat account when no master is left | `persistence.ts` `attachTracyStore`, `migrate`, `setUserRole`; `seat-book.ts` | `seat.test` S5 ×3 (skip removed), `persistence.test` S5 ×2 (fixture: drops the Tracy columns to get an upstream-only DB) | H10 |
| Q1 (seed) | Upstream's one-time seed gives a seat (any role) no session; password accounts keep the seed | `persistence.ts` `seedUserSessionGrants` (called from `db.ts`) | `master-grants.test` ×1 (new) | H10 |
| Q1 (master save) | The master session list saved in /admin is a `master` grant that seats can read | `persistence.ts` `writeMasterGrants` (called from `admin.ts`) | `master-grants.test` ×2 (new) | H10 |
| L1, L2, L3, L11, S7, S11, S14, K2, K3, V3 | Seat door `/gateway/seat/*` (HMAC, nonce, 404 without a secret, login/setup 404 when a secret is set) | `seat-door.ts`, `gateway-doors.ts`, `dsh-rpc.ts` | `seat-door` ×21 (skip removed; K1 ×4 still skipped waiting for H11) | H7 |
| L5–L8 | Tracy door `/gateway/tracy/*`: 404 when config is missing, OAuth wait + poll, mail code, seat from the seat book, one-time nonce | `tracy-door.ts`, `door-pages.ts` | `tracy-door.test` ×19 (port of the fork's `gateway-tracy-door.test.ts`) | H7, H12 |
| S15 (TCH #1036) | The Tracy door issues a session only for a **live** seat row (`status: 'active'`); `invited` rows (including join requests), `declined`, `revoked`, missing status → no session. The role is read via `seatRoleOf`, seat book roles only (`BOOK_ROLES`); the session carries the role's fixed toolset (`toolsetsForRole`), not a default | `tracy-door.ts` `grantLaneSession` | `tracy-door.test` › "T1: …" ×7 | H7 |
| K6 client (TCH, 09/10, 2.7.7-tracy.9) | The chat bubble shows only when the `/api/dsh-passwords/state` answer is OK **and** carries `chatEnabled: true`; a state error (`!res.ok`), a throwing fetch, or a missing flag → hidden. Upstream shows the bubble on error, so a single 5xx lets a seat see a chat with the gateway owner | `src/client/tracy/chat-entry.ts` `tracyChatEntry` (H18) | `chat-entry-client.test` ×4 | H18 |
| S16 (TCH, 09/10) | A seat neither writes nor reads dsh's shared settings document: a seat's dsh page runs settings in `memory` mode (the seat's Appearance/Language in browser localStorage), the owner keeps `host`; a seat's `settings/mutate` is still 403, no byte reaches dsh | `seat-settings.ts` (+ `patch.ts`, H16) | `seat-settings-persistence.test` ×3 | H16 |
| S17 (TCH, 09/10, 2.7.7-tracy.9) | A seat's dsh page does not ask better-sidebar for `git.status`: the seat page head sets `globalThis.__TRACY_SIDEBAR_GIT__="off"`, the seat's Files tab does not call it (no 403 in the console, the tree has no git badges); the owner has no flag. Every `/sidebar/api/git.*` stays owner-only (R5) — **not opened to seats**: better-sidebar runs `git` in the host's shared dsh process (not the site's web container, ADR 0014), and `git status` runs the command that the repo's `.git/config` names (`core.fsmonitor`) — a file a seat with `fs.write` can write itself (measured 09/10: `status()` in `src/git.ts` runs the fsmonitor command) | `seat-settings.ts` `SIDEBAR_GIT_GLOBAL` (H16) | `seat-sidebar-git.test` ×2 | H16 |
| L6 (poll) | A Google/GitHub link only completes in the browser that started it (cookie `dshpw_tracy_link`); a poll from another browser = expired, nonce unchanged | `tracy-door.ts` | `tracy-door.test` › "L6/Issue #35: …" (new) | H7 |
| L5 (CSRF) | A cross-origin POST to the Tracy door → 403 before asking the seat book | `tracy-door.ts` (`sameOrigin` = upstream `originHostMatches`) | `issue-35-order` ×1 (new) | H7 |
| K4 | `usage/report` bucket burst 4 after upstream's same-origin + session check; a refused request costs no bucket | `gateway-doors.ts` `usageReportGate` | `usage-report-door` ×3 (new) | H7 |
| K5 | Prefix only from a trusted proxy; routes/auth/CSRF see the path with the mount stripped; page/cookie/redirect carry the mount; dsh receives the original path + header | `mount.ts`, `gateway-page.ts`, `tracy-door.ts` | `gateway-prefix` K5 ×7 (skip removed) | H0, H12 |
| K5 × Issue #35 | A seat's cross-origin write → upstream's CSRF 403, 0 requests to dsh, under a mount too; the mount is a path, never a host | (core `originHostMatches`) | `issue-35-order` ×2 (new) | H0 |
| R11 | Signed-out manifest reaches dsh (GET/HEAD exact path) | `index.ts` `decideAnonymous` (table `classifySeatHttp`) | `gateway-prefix` R11 ×2 (skip removed) | H12 |
| I1 | Password/setup/403 pages: 8 languages, switch wraps the line, `zh-CN`, language cookie only on a valid choice | `gateway-page.ts`; gateway/auth read `src/tracy/i18n` | `i18n-surfaces` ×8 (skip removed), `i18n-mobile` ×7 (skipped without `I18N_SURFACES_CDP_URL`; green with CDP) | H9 |
| I3 | The code page prints `tracy.codeValid` | `door-pages.ts` `renderTracyCode` | `transactional-mail-copy` I3 (skip removed; reads `door-pages.ts`) | H7 |
| K1 (ledger) | `serve-gateway` writes the fence marker next to the DB, named by boot/PID of the parent dsh | `fence-ledger.ts` | `fence-ledger-boot` ×1 (new) | H9 |

## 3. Hooks in core (closed list)
Seam: `TracyPolicy` (`src/tracy/policy.ts`) — `decideHttp` (H1, only `/sidebar` outside the table) · `decideRequest`/`checkRequestBody`/`filterAnswer` (H1→proxy, H2, H3) · `decideStreamOpen` (H4) · `filterDown` (H5); each function returns `pass | deny{status, reason}` (H5 adds `drop | replace{value}`). `checkBody` + `check-body{route}` were removed in fixreq (nobody read them). Default = `tracyPolicy` (`src/tracy/index.ts`); `createGatewayServer(…, { policy })` takes another policy; only `test/tracy/upstream-policy-preload.ts` changes the default (pass-through) for `npm run test:upstream`. Every Tracy field on a request lives in **one** field `req.tracy?: TracyRequestState` (empty for now; removing it entirely needs the import/`Req` edits at `gateway.ts:114,144` and `proxy.ts:38,131`).

| # | File | Anchor at `d9a327c` | Current line | Call | Keeps invariant |
|---|---|---|---|---|---|
| seam | `src/gateway.ts` | 113 import · 140 `Req` · 1353 `options` · 1355 start of `createGatewayServer` · 4071 `registerProxyRoutes({` | 114 · 142 · 1355 · 1358 `const policy = resolvePolicy(options.policy)` · 4082 `policy,` | — | — |
| seam | `src/proxy.ts` | 37 import · 128 `Req` · 220 `ProxyDeps` · 449 destructure | 38 · 130 · 223–224 · 454 | — | — |
| H1 | `src/gateway.ts` | 3884 (right before `classifySubuserPath`, subuser branch) | 3888–3894 | `policy.decideHttp({method, path, userId})` → deny 403 `gw.adminOnly` | R1, R4, R5 (fail-closed `/sidebar/*`), R12 (Phase 5: fail-closed on every other seat path). Phase 5 adds 1 line right after the call: verdict `answer-rpc` → `tracy.tracyAnswerRpc(req, res, verdict)` (`rpc-stub.ts`) then `return` |
| H2 | `src/proxy.ts` | 2257–2259 `needs*` flags + 2308 after the `bodyObj === null` check | 2263–2266 · 2316–2325 | `policy.checkBody({route, body, holdsSession})`, `holdsSession` = upstream's `authorizedSubuserSessionRoot`; deny → `upstreamReq.destroy()` + 403 before any `write` | R1, R4, Q2 (partly: keys `sessionId`/`rootSessionId`) |
| H4 | `src/proxy.ts` | 3493 (after upstream's `open` block, before `cancel`/defer/forward) | 3511–3522 | `policy.decideStreamOpen({endpoint, payload, filteredByGateway: active.get(id) !== null})` → `rejectLogicalStream` | V5 (branch `state = null` ~3432) |
| H5 | `src/gateway.ts` | 4093 dep `filterRemoteMuxUserItem` | 4104 | `withPolicyDownFilter(policy, filterRemoteMuxUserItem)` | J3 (upstream `jobOwnerConfirmed` is enough; Tracy `filterDown` = pass) |
| H4 (Phase 2c) | `src/proxy.ts` | 3082 `active` · 3218 `rejectLogicalStream` · 3318 flush · 3493 after the `open` block | 3106 · 3242, 3253 · 3342–3343 · 3522–3525 | `policy.seatMux(tracySeat)` once per carrier; `clientFrame` (deny → `rejectLogicalStream(code, reason, details)`, `wait-baseline` → hold), `recheck` when the baseline is released | J1, Q13, C7, V4, V5, C8 |
| H4/V4 (Phase 2c) | `src/proxy.ts` | 3570 before `active.get` | 3603 | `tracyMux.upstreamFrame(frame) === 'drop'` | V4 |
| H5 (Phase 2c) | `src/proxy.ts` | 3575 `filterRemoteMuxUserItem` · 3600 non-item frame | 3608–3617 · 3642–3643 | `tracyMux.item(id, raw, filtered)` → send / drop / cancel-upstream (cancel up to dsh + `end`); `tracyMux.terminal(frame)` rebuilds `end`/`error` | J2–J4, Q10, Q14, Q16, Q17, S13, C1 |
| H6 (Phase 2c) | `src/proxy.ts` | 3051 before `classifySubuserPath` · 3333 after parsing the mux frame · 3646 404 door | 3068–3071 · 3360–3361 · 3689 | `policy.decideWs({path, query, source})` → 403 / `forward` (through the 404 door like a plugin WS, upstream's revocation already registered); `tracyMux.admit()` → close 1008 | R6, V1, V2 |
| job/kill (Phase 2c) | `src/proxy.ts` | 2997 before `attachUpgrade` | 3014 | `const tracyJobs = createJobOwnerBook()` (same closure as the HTTP handler) | J1 |
| H8 (Phase 2c) | `src/gateway.ts` | 2064 · 2164 · 2242 · 2969 | 2066–2075 · 2176 · 2254–2255 · 2982 | `tracyEventJson`/`tracySseFrame` → `policy.filterEvent(tracy.tracySeatEventContext(db, userId), envelope)` (fixmux: book by source rule, the seat's own email, `bookRefuses`) | Q10, Q17, Q1 |
| (old) H5 | `src/gateway.ts` | 4093 | 4115 | `withPolicyDownFilter` is now a no-op (ctx has no `state` → pass); the real H5 is in the carrier. Remove on integration. | — |
| H9 fleet | `src/cli.ts` | 16 import · 295 start of `boot()` | 17–19 · 300–305 | `tracyFleetStartupProblem(process.env, resolvePolicy())` → exit **38** before `loadConfig`/DB/listener; requires the Tracy policy + `MCP_SEAT_SECRET` + `MCP_DSH_ROOT` + `MCP_GATEWAY_PUBLIC_HOST` (fixdoors: without the public host every write through cloudflared gets 403 `Origin`) | fleet startup (new invariant) |
| H9 fleet | `src/plugin.ts` | 396 · 407 | 397 · 409 | `EXIT_TRACY_FLEET_GUARD = 38` into `PERMANENT_GATEWAY_EXIT_CODES` (no restart loop) | as above |
| H9 dsh | `src/cli.ts` | 198 `isSupportedDshRuntime` | 202 | `isTracyDshRuntime(version)` (`src/tracy/dsh-runtime.ts`) | version gate: accepts exactly `0.2.0-rc.<n>-tracy.<m>` |
| H0 | `src/gateway.ts` | 1364 `trust proxy` · 1377 before the first `app.use` · 4303 before `attachUpgrade` | 1369 · 1380–1381 · 4312–4314 | `tracyTrustProxy(trustedProxies)`; `tracyMountMiddleware(trustedProxies)` (strips the mount from `req.url` after Express sets `originalUrl`, runs the rest inside the mount `AsyncLocalStorage`); upgrade (fixmux): `tracyUnmount(req, …)` strips the mount from `req.url` (socket table, mux, event channel see the mount-relative path); `proxy.ts` 38 imports `tracyMountOf` (via `tracy/index.ts`), 3711 · 3729 raw socket forwarding reattaches the mount for dsh (2 upstream lines edited → `proxy.ts` `maxRemoved` 12→14). Logout (`gateway.ts` 3377, H0/H12): `tracyAnswerLogout` clears the cookie at `Path=<mount>`, redirects to the open sign-in door (`signInPathFor`, same target as `answerNoSession`); at a lane root with no Tracy door it returns `false` → upstream's answer | K5, L5 |
| H7 | `src/gateway.ts` | 3128 before `app.get('/gateway/login')` | 3134–3141 | `tracy.registerTracyDoors(app, {config, db, shell: pageShell, safeNext, writeFenceLedger, upstream, permissionsOf, sameOrigin, accessChanged, endSessions})` | L1–L11, S7, S9, S11, S14, K2, K3 |
| H7 K4 | `src/gateway.ts` | 3538 before `registerAdminRoutes` | 3551–3552 | `app.post('/gateway/api/usage/report', tracy.usageReportGate(apiAuth, () => adminRoutes.usageReportThrottle))` | K4 |
| H9 i18n | `src/gateway.ts`, `src/auth.ts` | gw 107, auth 13 | gw 107, auth 13 | import `t`/`resolveGatewayLang`/`Lang` from `./tracy/i18n/index.js` | I1 |
| H9 page | `src/gateway.ts` | `setCsrfCookie` 871 · `PAGE_STYLE` 1021–1022, 1057 · `pageShell` 1078 · `renderLoginPage` 1100–1105 · `renderSetupPage` 1150–1153 · lang cookie 3150–3154 · `forbiddenPage` 3114 · proxy dep `langOf` 4097 | 873 · 1022–1023, 1059 · 1080 · 1106, 1112 · 1154, 1158 · 3162 · 3118 · 4122 | `tracyMount()`, `TRACY_PAGE_CSS`, `tracyHtmlLang`, `tracyLangSwitch` (switch at the top of the card), `tracyLangCookie`, `tracyUpstreamLang` (the proxy still speaks zh/en) | I1, K5 |
| H9 cfg | `src/config.ts` | import 11 · `gateway{}` 102 · `PlatformConfig` 119 · `loadConfig` return 225, 237 | 12 · 104–105 · 122–127 · 237 · 247 | `readTrustedProxies(readEnv)`, `readTracyConfig(readEnv)`; fields `seatSecret?`, `tracy?`, `sessionArchive?`, `gateway.trustedProxies?` | H9 |
| H9 K1 | `src/cli.ts`, `src/plugin.ts` | cli 472 · plugin 901 | cli 473 · plugin 903 | `createGatewayServer(…, { writeFenceLedger: tracyFenceLedger(dbPath, env) })`; the plugin passes `DSH_GATEWAY_PARENT_BOOT: tracyDshBoot()` | K1 |
| H9 K6 | `src/plugin.ts` | 1200 | 44–46 · 1204 | `chatEntryEnabled(db, userId)` | K6 |
| H9 A1 | `src/plugin.ts` | end of `register`, before `if (configured)` | 47 · 1610 | `provideTracyAssertion(ctx, cfg.tracy?.actorSecret ?? '')` | A1 |
| S9 | `src/gateway.ts` | 2769 `baseline` branch of `workspace/follow` in `filterRemoteMuxUserItem`, after the `pinnedSessionIds` check | 2795 | `tracyDoors.seatSawWorkspaces(userId, source.items)` — the unfiltered registry goes to the seat door, heal runs in the background, no wait, no throw | S9 |
| H9 env | `src/config.ts` | 34 end of `MANAGED_ENV_KEYS` | 12 · 36 | `...TRACY_MANAGED_ENV_KEYS` (`src/tracy/config.ts`) | H9 |
| H9 I2 | `src/plugin.ts` | 1121 · 1379 | 1127 · 1385 | string "dsh" → "Tracy" (2 answers a browser can read) | I2 |
| H10 | `src/db.ts` | end of `init()` 671 | 673 | `attachTracyStore(this, this.db, this.crypto)` (migrates on every boot, before the listener) | S5, Q1, Q5, V3 |
| H10 seed | `src/db.ts` | start of `seedUserSessionGrants` 1721 | 1724–1725 | `tracyStoreOf(this).seedUserSessionGrants(…)` — every upstream seed path (gw 2814, px 1238) goes through the store: seats are marked and receive nothing; password accounts receive `seed` rows | Q1, Q5 |
| H10 | `src/admin.ts` | after `db.setPermissions` 1785 | 1789–1790 | `tracyStoreOf(db)?.writeMasterGrants(userId, allowedSessionIds)` when the save has a session list | Q1 |
| H12 | `src/gateway.ts` | 3726–3752 signed-out branch + ghost-session branch | 3743 · 3753 · 3762 | `policy.decideAnonymous({method, path})` → `forward` = `next()` (pass-through: upstream 204); redirect = `tracyDoors.answerNoSession(req, res)` (the open door, under the mount, mount-relative `next`; 401 for non-browsers when the door is cross-origin) | R11, L5, K5 |
| H14 | — | `auth.ts:264–269` | 0 lines | the doors call `mintSessionToken(user, {jwtSecret})` (`auth-token.ts`, TTL/key/`cv` matching `login()`, test L9) | L9 |
| seam (signed-out) | `src/tracy/policy.ts` | — | block `// --- signed-out requests ---` | `TracyPolicy.decideAnonymous`; the pass-through preload returns `pass` | R11 |
| H1→proxy | `src/proxy.ts` | before `upstreamTransport.request` (d9a327c ~893) | 907–909 | `tracy.begin(req, res, {...})` → null = already refused (0 requests to dsh) | R2, R3, R7–R10, Q3, unknown-path writes |
| H2 (2b) | `src/proxy.ts` | `needs*` flags + after `let forwardBody` | `tracyRun.readsBody ||` · 2330–2333 | `tracyRun.checkBody(bodyObj, res)` → `refused` / `rewritten` (resets `content-length`) before any `write`/`end` | Q2, Q11, S4, R1/R4/R9, K1 (held) |
| H3 | `src/proxy.ts` (via `begin`) | — (touches no upstream branch) | 907 | `holdAnswer(res, MAX_BUFFER_BYTES, filter)` installed on `res` before the request is built | Q8, Q9, Q10 |
| H11 | `src/proxy.ts` | before the handler · `agent:` · after the handler `finish` · `res.on('close')` | 800 · 920 · 2107 · 2145 | `app.use(tracy.admitWrites)`, `tracyRun.agent()`, `tracyRun.track()`, `tracyRun.onClientClose()` | K1 |
| H13 | `src/proxy.ts` | `const headers = { ...req.headers }` (~797); WS: before raw socket forwarding (fixmux) | 811 · 3702–3703 | `policy.forwardHeaders(...)` (WS: replaces `req.headers`, master has no header) | S12 |
| H15 | `src/gateway.ts` | 1967, 2002 (predicate `owners.some`) + 2055, 2073, 2223, 2716, 2857, 2867 | 1969–1970, 1982, 2013, 2062, 2081, 2231, 2725, 2867, 2878 | `tracySharesFolder` → `policy.sharedGrantExempt`; `policy.workspaceListed` | S1, S2 |
| H15 | `src/proxy.ts` | 1203–1206, 1604, 2606, 2620 | 1222, 1623, 2629, 2645 | `policy.workspaceListed`, `policy.workspaceCreateExempt` | S1, S3 (the 8th door `publishWorkspaceUpsert` ~3171 is inside the mux — not yet) |
| H20 (25/10, 2.7.7-tracy.16) | `src/gateway.ts` | right after `tracySharesFolder` (H15) · first line of the body of `workspaceOwnedByAnotherSubuser` | 1975 · 1978 | `const tracyOwnership = policy.ownershipCheck(db, tracySharesFolder)` once per gateway; `if (tracyOwnership !== null) return tracyOwnership(userId, workspacePath)` (`src/tracy/ownership.ts`). Pass-through: `null` → upstream predicate verbatim. 2 lines added, 0 removed (gateway.ts 75/80 added, 29/30 removed) | Q13 (rechecked every frame), S2 |
| J1 (fixreq) | `src/proxy.ts` | `createProxyHooks({` | 795 | `jobs: () => tracyJobs, rpcRequest: rpcRequestPayload` → `tracyRun.checkBody` calls `policy.decideJobKill` for a seat's `POST /api/job/kill`, before any byte goes to dsh | J1 |
| V1 (fixreq) | `src/proxy.ts` | `createProxyHooks({` | 796 | `seatOf`, `registerConnection: registerUserWebSocketClient` (only when `policy.endsPendingRequests`; pass-through keeps upstream behaviour) → every seat request (including one held by the write fence) enters upstream's connection set until `res` closes | V1 |
| Q16 (fixreq) | `src/tracy/proxy-hooks.ts` (0 core lines) | — | — | `policy.decideQuestionAnswer({jobs, userId, body})`; the `$events` book by `clientId` in `JobOwnerBook.events`, written by the carrier when `ready` passes | Q16 |
| H3 Q5 (fixreq) | `src/proxy.ts` | `db.addUserSessionGrant` in the create/fork branch (d9a327c ~1525) | 1545 | `tracyRun.recordCreated(userId, sessionId)` → Tracy: `recordCreatedSession` origin `created` + watermark at send time (refuses an id someone else holds); pass-through: `addUserSessionGrant` as upstream (`policy.recordsCreatedGrants`) | Q5 |
| K1 (fixreq) | `src/tracy/gateway-doors.ts` | — | — | the archive door uses `writeFenceFor(db)` / `installWriteFence(db, new WriteFence(ledger))` — one fence for the proxy and the door; the `serve-gateway` ledger also counts writes through the proxy | K1 |
| H0 HTTP (fixreq) | `src/proxy.ts` | 832 `ownPluginRoute` · 846 `parsedUrl` · 855 `upstreamSearch` · 918 `path:` (d9a327c ~820–900) | 832 · 846 · 855 · 918 | the handler reads `req.url` (mount already stripped at H0) instead of `req.originalUrl`; the request to dsh is `path: tracy.mountOf(req) + proxyPath + upstreamSearch` (prefix + header as before) | K5 × H8 (a seat's SSE under a mount through the filter), the JWT cookie of `/api/dsh-passwords/*` under a mount |
| Q1 HTTP (fixreq) | `src/tracy/proxy-hooks.ts` `seatHolds` (+ dep `sessionFolders` returning id/cwd pairs, Tracy line 797) | — | — | every "seat holds the session" check on the HTTP path (H1→proxy, H2, H3, J1, `/api/file`) = upstream's check ∧ `TracyStore.isGrantHonoured` (pass-through: upstream only) | Q1 |
| H15 | `src/proxy.ts` | 1203–1206, 1604, 2606, 2620 | 1222, 1623, 2629, 2645 | `policy.workspaceListed`, `policy.workspaceCreateExempt` | S1, S3; the 8th door `publishWorkspaceUpsert` (fixmux, 3180) |
| H16 (09/10) | `src/proxy.ts` | HTML branch: `const injected = html.replace(/<head[^>]*>/i, (match) => match + INJECT_SCRIPT);` (d9a327c ~929) | 935 | adds `(reqAs.dshpwIsAdmin === false ? policy.seatPageHead : '')` after `INJECT_SCRIPT`; `src/patch.ts` (named exception) replaces the `ui-settings` bundle's loopback test with `resolvePolicy().settingsPersistence` and re-patches a bundle that the old version forced to `"host"` (from a hash-checked backup). Tracy (`src/tracy/seat-settings.ts`): a seat's page sets `globalThis.__TRACY_SETTINGS_PERSISTENCE__="memory"` → dsh settings run in `memory` mode, the seat's theme/language in browser localStorage; the owner stays `host`. S17: the same script tag also sets `globalThis.__TRACY_SIDEBAR_GIT__="off"` (better-sidebar's Files tab does not ask for `git.status`). Pass-through: `''` and `"host"` | S16 (`test/tracy/seat-settings-persistence.test.ts`) |
| H17 client (09/10, 2.7.7-tracy.8) | `src/client/api.ts`, `card.tsx`, `chat.tsx`, `file-download.ts`, `index.tsx`, `picker-delete.ts`, `token.tsx` | every root URL `/api/…`, `/gateway/…` | 1 import line + each URL wrapped in `dshUrl(…)` (`src/client/tracy/page-base.ts`); `api()` wraps once for every `api(…)` call in `card.tsx`. `picker-delete` (2.7.7-tracy.8): adds ONE line before the comparison `parsed.pathname === LIST_ENDPOINT_SUFFIX` — `parsed.pathname = dshPathOf(parsed.pathname)` strips the page's mount from the path (as H0 strips the mount from `req.url` on the server), so the comparison stays exact (does not become a suffix match) while under a mount the owner's folder delete button attaches again. Upstream's comparison line is kept verbatim, so the source contract test `client-picker-delete.test.ts` (which pins exactly that line) stays green and no upstream test has to change; behaviour under a mount is held by `test/tracy/picker-delete-mount.test.ts`. `tracy-core.json` budget: every hunk must contain `dshUrl` (picker-delete: `dshUrl` or `dshPathOf`, `maxAdded` 3→4) | K5 (2.6.6-tracy.64 had it; the 2.7.7-tracy.1 rebase kept the helper but dropped every call → page `/new/s/<id>` got 404 on `/api/dsh-passwords/state` + `/gateway/api/messages` on every load, measured 09/10) |
| H18 (09/10, 2.7.7-tracy.9) | `src/client/chat.tsx` | 9 import · `setChatEntry(res.ok && data.chatEnabled === false ? 'off' : 'on')` (~373) · `.catch` `setChatEntry('on')` (~379) | 11 · 379 · 385 (the H18 import line sits right above H17's `dshUrl` import) | `tracyChatEntry(res.ok, data.chatEnabled)`; `.catch` → `tracyChatEntry(false, undefined)` (= `'off'`). Pass-through: none — client files do not go through `TracyPolicy`; the upstream case `client-chat-fab` returns `chatEnabled: true` so it stays green | K6 client (`test/tracy/chat-entry-client.test.ts`) |

<!-- H18 × H17: tracy-core.json chat.tsx = the sum of both hooks (H17 +8/−7, H18 +3/−2 → 11/9); the two adjacent import lines form one +2 hunk, so `maxHunkAdded` 1→2 and `allow` = `dshUrl` ∪ `tracy`. -->
<!-- H16: tracy-core.json proxy.ts maxRemoved 22→23 — hook H16 has to edit exactly the upstream line that splices `<head>` (`injected` is a const, there is no place to insert without repeating the replace). -->
<!-- fixreq: tracy-core.json proxy.ts maxRemoved 12→18 — (a) hook H3 (Q5) replaces two upstream lines (`db.addUserSessionGrant` + `access.set`) with one conditional call `tracyRun.recordCreated(...)`; (b) H0 on the HTTP side edits 4 lines (3 places reading `req.originalUrl` → `req.url`, 1 `path:` line reattaching the mount). The alternative (changing `req.originalUrl` in `mountMiddleware`) costs no core lines but hides the change of meaning of an Express field from whoever reads the proxy. -->

Core files touched (against commit `upstream d9a327c` = `78e0751`, measured on branch `pha2/fixdoors` 05/10; `git diff --stat 78e0751 HEAD -- src ':!src/tracy' ':!src/client/tracy' package.json`):
```
 package.json   |   7 ++--
 src/admin.ts   |   3 ++
 src/auth.ts    |   2 +-
 src/cli.ts     |  13 +++++++-
 src/config.ts  |  13 +++++++-
 src/db.ts      |   4 +++
 src/gateway.ts | 104 ++++++++++++++++++++++++++++++++++++++++-----------------
 src/plugin.ts  |  12 +++++--
 src/proxy.ts   |  73 +++++++++++++++++++++++++++++++++-------
 9 files changed, 181 insertions(+), 50 deletions(-)
```
Seams added in Phase 2c (`policy.ts` block `// --- streams ---`): `seatMux(source)` · `decideWs(ctx)` · `filterEvent(ctx, event)` · `decideJobKill(ctx)`; `decideStreamOpen` additionally returns `wait-baseline` and `deny{code, details}`, `pass{state}`; `filterDown` additionally returns `cancel-upstream`. Pass-through (`upstream-policy-preload.ts`): `seatMux` → `null`, everything else passes.

`upstream-snapshot.sha256` stays unchanged (it is the image of upstream's `src/`); the `src/` files above are the deliberately diverging files (per-file budget: `tracy-core.json`).

## 4. Named exceptions
**H9 dsh version gate** (`cli.ts` `isSupportedDshRuntime`): upstream 2.7.7 accepts only the 0.2.1 line (code 37); the fork additionally accepts exactly the identity of Tracy's dsh fork `0.2.0-rc.<n>-tracy.<m>` (build metadata dropped). A bare upstream `0.2.0-rc.<n>` is still refused (the upstream case `cli-startup.test.ts` is unchanged). Remove when the dsh fork moves to 0.2.1. ·
`patch.ts` (compat with the running dsh) · `db.ts` (migration via `tracy/persistence.ts`).

**i18n** (I1–I3): `src/i18n.ts` is not edited. `src/tracy/i18n/` = `strings.ts` (33 Tracy keys + rebranded values, layered over the upstream DICT through upstream's `t`), `locales/*.json` (6 languages, moved from the fork's `src/locales/`), `gateway-langs.ts` (8 languages, `resolveGatewayLang` reads YAML, keeps upstream's `settings.yaml.imported` fallback), `client-brand.ts` (4+4 settings card strings; the fork's `subHint` dropped because upstream 2.7.7 dropped the key). The CLI keeps upstream's zh/en `resolveCliLang`. The merged table is built from the key list the caller passes (`gatewayStrings(keys)`, `gatewayPageKeys(keys)`) because upstream keeps `DICT` private. ⚠ `gateway-langs.ts` imports `yaml` — upstream has it only through a transitive devDependency; Phase 2 adds `"yaml": "^2.9.0"` to `dependencies`.

**Client** (K5, I2, K6): `src/client/tracy/page-base.ts`; 7 upstream client files call `dshUrl` through hook H17 (09/10, §3). ADDED `src/client/tracy/chat-entry.ts` (K6 client, hook H18 in `src/client/chat.tsx`, 2.7.7-tracy.9).

**The card's Sign out button behind tracy-web** (2.7.7-tracy.8, no fork line changed): `POST <mount>/gateway/logout` is still answered by `answerLogout` (H0/H12) as before; the 302 → GET → 405 loop was in tracy-web, which read that answer as an old seat. tracy-web now forwards a held seat to dsh for revocation and then signs out of Tracy (same cookie set as `POST /auth/signout`, 303 → `/login`), and `GET <mount>/gateway/login` (password page, 404 when a seat secret is set) → `<mount>/` (`apps/tracy-web/src/workspace/route.js`).

**Wrong comment in core (cannot be fixed — `permissions.ts` is not a hook file and must match upstream byte for byte):** `isOfficialRootPath` (`permissions.ts` ~484) says "其余非 /api 路径一律视为第三方：未登记对子用户拒绝（fail-closed）", but upstream 2.7.7 lets a subuser's `third-party` paths go straight to dsh (`classifySubuserPath` ~525–541, the `gateway.ts` gate blocks only blocked/owner-only/ssh). For seats, fail-closed is Tracy's: R12 (`routes.ts` `seatMayReach`). Report upstream at the next upgrade.

**`overrides` patching library vulnerabilities** (2.7.7-tracy.10, 11/10/2026, TCH branch `fix/vendor-deps-advisories`): `package.json` `overrides` adds `@modelcontextprotocol/client` 2.2.0, `fflate` ^0.8.3, `http-cache-semantics` ^4.3.0 next to the existing `qs` ^6.16.0; `npm-shrinkwrap.json` regenerated (only those packages changed). All three come only from the `@deepseek-ai/*` devDependencies (build-time types), so the image's `--omit=dev` install never had any vulnerability; fixed so the build stage is clean too. The MCP client is pinned to exactly 2.2.0, as in the dsh fork `tracy.40`. On an upstream upgrade: keep this block, drop any line upstream has already patched itself.

## 5. Next upstream upgrade
Replace the core snapshot → run `npm test` (Linux) → recheck that every hook in §3 is still on the right line → add new doors to `routes.ts`/`streams.ts` → bump `<upstream>-tracy.1`.

- `src/proxy.ts` `maxRemoved` +2 (05/10, i18n proxy): the two upstream lines importing `t`/`Lang` from `./i18n.js` become one import from `./tracy/i18n/index.js`, so the proxy's refusal pages read in all eight languages; `gateway.ts` hands `langOf` down unchanged again (one upstream line restored).


## Addendum 18/10/2026 — native session for the widget (`2.7.7-tracy.11`)

Door H7 `/gateway/seat/session` accepts the `nativeSession` option only with an editor grant,
a verified email, site `~onboarding`, a private home, empty folders and toolsets exactly `content`.
`native-session.ts` restricts the session ID to `session-widget-<UUID>` and three designer presets.
The web stores the ID with CAS before the signed call. The door uses the workspace ID just registered
for that exact account; native checks the stored ID/cwd/preset on retry and does not create a prompt turn.
Only after a result with the right ID is a `created` grant written through the existing ledger. No upstream core edit,
the seat request-path is not opened, no extra toolset granted. `seat-home.ts` returns the workspace ID
so workspace/create is not called through a seat that lacks that permission.

Test: `test/tracy/native-session.test.ts`, the native onboarding case in `seat-door.test.ts`,
and the S11 cases in `seat-home.test.ts`. Actual native acceptance is recorded separately in PR1426;
unit tests and the fake-upstream gateway door do not replace that measurement.


## Addendum 18/10/2026 — WebRoute type dependency (`2.7.7-tracy.12`)

Upstream `src/plugin.ts` imports `WebRoute` directly from `@deepseek-ai/dsh-host-webserver`, but the manifest gets this package only indirectly through dsh. Declared as a devDependency with the same existing 0.2.1-alpha range and the shrinkwrap synced; pnpm creates the right direct link when building on a clean checkout. No upstream source, runtime dependency or permission door changed. The native/cowork bundles pin the same version 12; the local runtime under acceptance is not installed/restarted by this metadata change.

## Addendum 19/10/2026 — granting WO chat through the HMAC-signed door (`2.7.7-tracy.13`)

H7 accepts a separate `siteSession`, distinct from `nativeSession`: owner only, with an email, one canonical folder
`/site/<label>`, site key with the same label, no self-chosen home/toolsets/cwd/workspaceId; three CMS designer presets
and an ID `wo-demo-<UUID>` already held by the web. The web rechecks the accepted owner grant before signing. The parser
`site-session.ts` is pure; I/O lives in the existing `seat-door.ts` adapter, no new hook/core diff.

The door awaits `ensureSiteWorkspace` then `ensureNativeSession`, and writes the exclusive `created` grant only after
native returns the right ID. After the pending RPC and before the grant/token, the credential version, role,
folder must be unchanged and the account not banned/disabled. A failure gives no token; a retry uses a new nonce and the same tuple/ID, and
sends no prompt. The onboarding `nativeSession` keeps the old parser; browser `session/create` still refuses a new ID
chosen by the client. The ID prefix already recorded in WO is unchanged and there is no fallback to a random chat.

Test: `site-session.test.ts`, three signed site allocation cases in `seat-door.test.ts`, keeping the
native onboarding cases; 34 gateway/parser cases PASS on branch #1493. Real native on the private stand `wo-outreach`, image `75ca822e92`: same ID/workspace across a retry after a dropped response;
different cwd/preset 502 with no token; new browser ID 403. Evidence
`tasks/evidence/wo-outreach-v3/native-session-check.json`. The web reads the filtered baseline before prompt/repair and reconciles
a blank chat after restart; no hook added and no core edit. Site/Outreach QA has its own evidence, not inferred from the chat grant.


## H19 — live permission check before native code dispatch (22/10/2026, 2.7.7-tracy.14)

`src/plugin.ts` imports/installs `src/tracy/seat-tool-guard.ts` through a DB closure, declares tools/agents
in inject; no change to the core snapshot, permissionsFor or the dsh19fde pin. The module uses
`agent/pre-step.messages` already stamped by the gateway to bind the actor of the input actually received;
`agent/created` fixes the actor for a child with runtime ownership, not taking a fork's actor from lineage.
Each `write/edit/bash/pwsh` re-reads user+permission from the DB synchronously through `ctx.tools.guard`, after approval
and pre-execute, before the tool body; a DB error, a missing/banned/read-only seat are all refused. The guard only denies,
never grants permission or shares a secret. Tracy test `seat-tool-guard.test.ts` holds downgrade, queue, child,
fork, DB error and the current admin/content behaviour.

## Addendum 22/10/2026 — opening `POST /api/tracy-add-site/hold` to seats (`2.7.7-tracy.14`)

PR #1598 added the `hold` door on the host half of add-site (`hold-door.ts`) but added no row to
`SEAT_PLUGIN_ROUTES`, so H1 refused with 403 (`gw.adminOnly`) tracy-web's call (`add-site-host.js`,
onboarding seat) before dsh heard it: the Remove button of an unfinished import and the hourly sweep of abandoned imports
never removed anything. Added exactly one `POST` row matching the exact path `/api/tracy-add-site/hold`;
the plugin itself checks the seat-secret HMAC over the exact body and refuses unsigned calls. No other row changed,
no body check changed: the JSON body names no session so Q2 lets it through, the `x-seat-*` headers are forwarded intact.

Test: `seat-unknown-routes.test.ts` — POST `hold` from an onboarding-style seat reaches dsh with the body and all three
signature headers intact; `GET hold`, `POST holds`, `POST hold/forget` still 403, dsh does not hear them.
The new case is red on version 13, green on version 14.

## Integration 23/10/2026 — 2.7.7-tracy.15

Merges the candidate's H19 and the hold door from develop: two independent changes that both used number 14.
The combined version is number 15, keeps the live permission check and the signed hold route, and does not change upstream core.

## H20 — a cheaper "workspace of another subuser" check, same answer (25/10/2026, `2.7.7-tracy.16`)

Measured on dev 25/10 (`saigon-iron-boxing`, 6 recolour turns): upstream asks `workspaceOwnedByAnotherSubuser`
for every stream frame, 2–3 times per frame; each time it re-reads 117 `user_workspaces` rows, each row a
`getUserById` with decryption and up to four `realpath` calls (walking back through every folder that no longer exists, each step throwing
an error; 87/117 rows were onboarding folders that were gone). 49 % of profile samples, ~93 % of the gateway's busy time, one
core at 100 % for the whole turn; server chat latency up to 14.8 s, gateway health check up to 27.5 s, live connections dropped 2–4
times per turn for EVERYONE on the host.

`src/tracy/ownership.ts` returns **exactly upstream's answer** (tested against the upstream predicate itself rebuilt
from the `db.ts` helpers: alias, symlink, missing folder, dangling symlink, role, H15 S2), cheaper within ONE check:
one SQL query for the rows + owner role (`TracyStore.workspaceOwnerRows`, role read like `getUserById().role`,
no name decryption); each path canonicalised once, only when the string comparison has not decided; existence probes
do not throw; each real ancestor folder gets `realpath` once. **Nothing is remembered between two checks** (Q13
unchanged): a new row, a role change, a new symlink take effect on the very next frame. No row of a missing folder is dropped:
a missing folder still blocks another subuser from recreating that exact path.

Measured on dev's real data (read-only, 25/10): 702/702 (user, path) pairs give the same answer; path
`/site/saigon-iron-boxing` 5.79 ms → 1.34 ms (4.3×; the upstream figure excludes decryption, so the real gap is larger).
Test: `ownership.test.ts` (equivalence + fs/DB call counts + measurement), `gateway-ownership-h20.test.ts` (a seat
granted exactly the folder another subuser registered: cannot see it, cannot create it, goes through H20).


## Addendum 26/10/2026 — test data for the public export (`2.7.7-tracy.17`)

A real email address in the examples of `src/tracy/seat.ts` (comments only) and in `test/tracy/seat*.test.ts` became the fictional `person@example.com`. No behaviour change; upstream core untouched.

## Addendum 27/10/2026 — a customer site name in examples (`2.7.7-tracy.18`)

A real customer site name in comments of `src/tracy/seat.ts` and `src/tracy/seat-home.ts` and in workspace paths of `test/tracy/seat-door.test.ts` became the fictional `example-site`. No behaviour change; upstream core untouched.

## Addendum 27/10/2026 — dependency security fixes (`2.7.7-tracy.19`)

`package.json` `overrides` adds `body-parser` ^1.20.9 (GHSA-27r3-jxmh-p828: a compressed request body with trailing
bytes could leave a decoder piped with no error listener and crash the process; `express.urlencoded` on `/gateway`
parses before routing, so it was reachable without a session) and lifts `@modelcontextprotocol/client` 2.2.0 → 2.3.0
(GHSA-6prh-2h8m-c8cw; devDependency types only, and the package's licence is now Apache-2.0). Build-time only, so the
build stage audits clean too: `fast-uri` ^3.1.9, `undici` ^8.12.2, `zod` ^4.6.6. `express` range `^4.22.3`.
`npm-shrinkwrap.json` regenerated: only `body-parser` 1.20.8 → 1.20.9, the two MCP packages, `fast-uri`, `undici` and
`zod` changed; `npm audit` on it reports 0 (with and without dev).
No source change; upstream core untouched.
