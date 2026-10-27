/**
 * S16 (hook H16): a seat's settings persistence. One dsh serves every site of the host (TCH ADR 0014), so
 * dsh's settings document (`settings.yaml`: `ui-theme`, `locale`, `llm`, …) is shared by every
 * customer on it. A seat may not write it (`settings/mutate` stays in
 * SUBUSER_BLOCKED_API_ENDPOINTS) and must not read another person's Appearance or Language from it.
 *
 * dsh already has the right mode for such a browser: `memory` persistence, in which the theme and
 * locale services keep the choice in this browser's localStorage and no settings form writes the
 * host (dsh `ui-settings` ConfigForm, `ui-theme`/`locale` local-preference.ts). Upstream's
 * remote-settings patch (patch.ts) replaces dsh's loopback test with a literal `"host"` for every
 * browser behind the gate; under the Tracy policy it is replaced by `SETTINGS_PERSISTENCE` instead,
 * which reads the flag `SEAT_PAGE_HEAD` sets in the head of every dsh page a seat is served. The
 * owner's page carries no flag and keeps `host`, as upstream does.
 *
 * The flag only chooses where the page keeps its own preferences: a page that sets it by hand gets
 * `memory` (nothing written anywhere) or `host` (the gate still answers 403 to a seat's write).
 */

/** Page global the seat's page head sets before any dsh module runs. */
export const SETTINGS_PERSISTENCE_GLOBAL = '__TRACY_SETTINGS_PERSISTENCE__';

/** The expression that stands where dsh's `….isLoopback ? "host" : "memory"` stood. */
export const SETTINGS_PERSISTENCE = `(globalThis.${SETTINGS_PERSISTENCE_GLOBAL} === "memory" ? "memory" : "host")`;

/**
 * S17: page global telling better-sidebar not to ask for `git.status` (the Files tab's change
 * badges). The gate keeps every `/sidebar/api/git.*` route owner-only (R5): better-sidebar spawns
 * `git` inside the host's one dsh process, not in the site's web container (ADR 0014), and
 * `git status` runs commands a repository's `.git/config` names (`core.fsmonitor`), a file a seat
 * with `fs.write` can author. The flag only spares the seat's page a refused call; the gate still
 * answers 403 to a page that ignores it.
 */
export const SIDEBAR_GIT_GLOBAL = '__TRACY_SIDEBAR_GIT__';

/** Added to the `<head>` of every dsh page served to a seat (never to the owner). */
export const SEAT_PAGE_HEAD = `<script>globalThis.${SETTINGS_PERSISTENCE_GLOBAL}="memory";globalThis.${SIDEBAR_GIT_GLOBAL}="off";</script>`;
