/**
 * The docker-exec transport for the four lane-local calls that reach a site's OWN web container:
 * `page.text`'s static read (the container's own curl, every image), its DOM dump (the browser, a
 * fallback for a page drawn by JavaScript), `page.look`'s screenshot, and `tracy_emdash`'s MCP call.
 *
 * WHY THIS FILE EXISTS (ADR 0014, and #154). Those three used to open a direct HTTP socket from the
 * dsh process to `http://<label>-web-1[:port]`. The fleet compose files do put dsh and a site on the
 * shared `tracy` network (`deploy/compose.yml` and `render-compose.sh`), but the original
 * direct-fetch failure's live root cause is not established here. We therefore use the existing
 * docker-exec transport and run the request inside the site's own container, where the site answers
 * at `http://127.0.0.1:<port>`, the same in-container path everywhere.
 * The token remains inside the site container; only the site's MCP response crosses back to dsh.
 *
 * The builders below are PURE (no I/O), so the exact argv a test asserts is the exact argv the
 * transport runs; {@link dockerExec} is the one impure runner, replaceable through the plugin's
 * `config.exec` seam.
 *
 * 🔒 THREE PROPERTIES THIS MODULE KEEPS, EACH LOAD-BEARING:
 * - The probe and the browser run as **www-data** (the non-credential user): they read a public
 *   page, never a secret. The MCP call runs as **root** (the exec default on the EmDash image, which
 *   declares no USER) because only root may read the agent token — see below.
 * - No untrusted value is ever interpolated into a shell string or into the `node -e` script text.
 *   The URL is a separate argv element the script reads from `process.argv`; the MCP request body
 *   arrives on stdin. `execFile` (array argv, no shell) is what runs them, so a `'` or `;` in a path
 *   is data, not syntax.
 * - The agent token is read INSIDE the container, from a root-owned read-only mount, by the MCP
 *   script — it is never placed on argv or an env var, and remains in the container. dsh sees only
 *   the site's own MCP answer (with reflected token bytes redacted).
 */
import { STYLE_PROBE } from '@tracy/site-build-core/design-check'
import { execFile } from 'node:child_process'
import { resolveDockerHost } from '../../../tracy-subprocess-docker/src/route.mjs'
import { PREVIEW_KEY_HEADER, PREVIEW_KEY_SHAPE, previewKeyFor } from './preview-key.mjs'
import {
  STYLE_VIEWPORTS,
  countPaints,
  describeTarget,
  findTarget,
  paintSelectors,
  resolveStyles
} from './look-style.mjs'

/**
 * The site folder's path INSIDE every web container. `render-compose.sh` mounts it at exactly
 * `/site/<label>` on every platform, whatever path dsh itself sees it under — so a screenshot
 * written here by the container's browser lands on the same host inode dsh reads back through its
 * own `/site` bind. Deliberately a constant and not dsh's `sitesRoot`: the container's mount target
 * is fixed by the compose file, not by dsh's environment.
 */
export const CONTAINER_SITES_ROOT = '/site'

/**
 * Where the site's agent token is mounted, root-owned and read-only (#155). Outside `/app` and
 * `/app/data` (the agent-writable volumes) so the agent's own www-data shell cannot read or replace
 * it; only a root exec — which the MCP call is — can.
 */
export const AGENT_TOKEN_PATH = '/run/tracy-agent.token'

/** The EmDash MCP endpoint, on loopback inside the container. */
export const EMDASH_MCP_LOOPBACK = 'http://127.0.0.1:4321/_emdash/api/mcp'

/**
 * The container-side path of one look screenshot — always under {@link CONTAINER_SITES_ROOT}.
 * @param {string} label
 * @param {number} ts
 */
export function containerLookFile(label, ts) {
  return `${CONTAINER_SITES_ROOT}/${label}/docs/agents/look/${ts}.png`
}

/**
 * The loopback URL a probe/browser inside the container hits: 127.0.0.1, this site's own port.
 * @param {number} port
 * @param {string} path
 */
export function loopbackUrl(port, path) {
  const at = Number.isInteger(port) && port > 0 && port !== 80 ? `:${port}` : ''
  return `http://127.0.0.1${at}${path}`
}

/** How many redirect hops the probe resolves before it gives up. */
export const PROBE_MAX_HOPS = 5

/**
 * How long ONE static GET may run INSIDE the container: curl's own `--max-time`, so the bound lives
 * where the request runs (a docker client that gives up does not stop an exec'd process).
 */
export const FETCH_MAX_TIME_S = 8
/**
 * The most body bytes one static GET may bring back. curl refuses a larger DECLARED body itself
 * (exit 63); a chunked body is bounded by the host's `maxBuffer` instead (`page.mjs`), because curl
 * 7.88 in the EmDash image checks only a declared length.
 */
export const FETCH_MAX_BYTES = 4 * 1024 * 1024
/** How the static read names itself in the site's access log. */
export const FETCH_USER_AGENT = 'Mozilla/5.0 (compatible; TracyPageText/1.0)'
/** What a static read may present as `Host`: a DNS name or the loopback address, optional port. */
export const FETCH_HOST =
  /^(?:127\.0\.0\.1|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*)(?::[0-9]{1,5})?$/i
/** The closing line's marker: fresh per call, so no page body can forge the line that ends the read. */
export const FETCH_NONCE = /^TRACY_FETCH_[0-9a-f]{32}$/

/**
 * The docker sub-argv for ONE static GET of one page, run by the container's own curl as www-data.
 *
 * 🔒 WHY CURL, AND WHY THESE FLAGS. The WordPress and Joomla upstream images carry no node and no
 * chromium, so the node probe + browser road answered 66 of 66 `page.text` calls there with
 * `SITE_UNREACHABLE` in r2 (24/09/2026) — for sites that were up. Every image carries curl (8.14 on
 * the WordPress and Joomla images, 7.88 on EmDash), and one GET of the server's HTML is also what a
 * visitor's browser starts from: 0.08–0.98 s per call measured on the stand, against 7.2 s median
 * for the browser. Each flag closes one way the read could reach something other than this site:
 *
 * | flag | why |
 * |---|---|
 * | `-q` FIRST | never read a `.curlrc` — www-data's home (`/var/www`) sits next to the agent-writable webroot, so a planted `location`/`proxy`/`output` line would change what this read does. Only as the first argument does curl honour it |
 * | `--noproxy '*'` | ignore `http_proxy`/`ALL_PROXY` from the container's environment |
 * | `--proto =http` + the loopback URL literal | only plain http to 127.0.0.1; no TLS, no other host |
 * | NO `-L` / `--location` | curl never follows a redirect; each `Location` is classified on the host (`nextHop` in page.mjs) and refused unasked when it leaves the site |
 * | `--globoff` | `[]{}` in a path are data, not a URL pattern |
 * | `--include` | the status line and headers precede the body, so the raw `Location` is read on every curl version (`%header{}` is 7.84+, deliberately unused) |
 * | `--max-time`, `--max-filesize` | the bound lives in the container |
 * | `--write-out` with a per-call nonce | a closing line no page can forge; its absence means the output was cut |
 * | `Accept-Encoding: identity` | no decompression inside the read; an encoded answer is refused or handed to the browser |
 * | `-u www-data` | the non-credential user, as the probe and the browser |
 *
 * The page is asked AS `host` (`Host` + `X-Forwarded-Proto`, what cloudflared sends for a visitor)
 * while the connection is ALWAYS `127.0.0.1:<connectPort>` inside the container (#154). Every value
 * is validated here and the argv is run by `execFile` with no shell, so a CR/LF in `host` cannot
 * become a second header even if a caller regresses: it throws instead.
 *
 * A locked site (#189, `preview-key.mjs`): `previewKey` adds `X-Tracy-Preview-Key`, which the Cowork plugin answers
 * with the real site instead of its rebuilding page. Its shape is checked here like every other value, so it cannot
 * become a second header either.
 * @param {{ container: string, connectPort: number, pathAndQuery: string, host: string,
 *   proto: 'http' | 'https', nonce: string, maxTimeS?: number, maxBytes?: number, previewKey?: string | null }} input
 * @returns {string[]}
 */
export function fetchArgv({
  container,
  connectPort,
  pathAndQuery,
  host,
  proto,
  nonce,
  maxTimeS = FETCH_MAX_TIME_S,
  maxBytes = FETCH_MAX_BYTES,
  previewKey = null
}) {
  if (!FETCH_HOST.test(String(host))) throw new TypeError('fetchArgv: host is not an authority')
  if (previewKey !== null && !PREVIEW_KEY_SHAPE.test(String(previewKey)))
    throw new TypeError('fetchArgv: preview key has another shape')
  if (proto !== 'http' && proto !== 'https') throw new TypeError('fetchArgv: proto must be http or https')
  if (!/^\/[\x21-\x7e]*$/.test(String(pathAndQuery)))
    throw new TypeError('fetchArgv: path must be an encoded absolute path')
  if (!FETCH_NONCE.test(String(nonce))) throw new TypeError('fetchArgv: nonce is not a fetch nonce')
  if (!/^[a-z0-9][a-z0-9-]*-web-1$/.test(String(container)))
    throw new TypeError('fetchArgv: container is not a site web container')
  return [
    'exec',
    '-u',
    'www-data',
    container,
    'curl',
    '-q', // MUST stay the first curl argument: only there does it disable .curlrc
    '--globoff',
    '--noproxy',
    '*',
    '--proto',
    '=http',
    '--silent',
    '--show-error',
    '--include',
    '--max-time',
    String(maxTimeS),
    '--max-filesize',
    String(maxBytes),
    '--user-agent',
    FETCH_USER_AGENT,
    '--header',
    `Host: ${host}`,
    '--header',
    `X-Forwarded-Proto: ${proto}`,
    '--header',
    'Accept: text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
    '--header',
    'Accept-Encoding: identity',
    ...(previewKey !== null ? ['--header', `${PREVIEW_KEY_HEADER}: ${previewKey}`] : []),
    '--output',
    '-',
    '--write-out',
    `\n${nonce} %{http_code} %{size_download}\n`,
    loopbackUrl(connectPort, pathAndQuery)
  ]
}

/**
 * Parse one static GET. Only a read that reached its closing line is a read: without it the output
 * was cut (a killed exec, a docker error on stdout), and a cut page must never be parsed as a page.
 * The headers are read from the final non-1xx block (a `100 Continue` is skipped); the body is
 * everything after it, up to the closing line.
 *
 * 🔒 The closing line is found with `lastIndexOf` on `\n<nonce> ` — the nonce is fresh per call, so a
 * body carrying `TRACY_FETCH_<another nonce> 200 5` is body, not the end of the read.
 * @param {string} stdout
 * @param {string} nonce
 * @returns {{ ok: true, status: number, location: string, contentType: string, contentEncoding: string, body: string }
 *   | { ok: false, kind: 'cut' | 'no-answer', error: string }}
 */
export function parseFetch(stdout, nonce) {
  const s = String(stdout ?? '')
  const at = s.lastIndexOf(`\n${nonce} `)
  if (at === -1) return { ok: false, kind: 'cut', error: 'the read ended before curl wrote its closing line' }
  const status = Number(
    s
      .slice(at + nonce.length + 2)
      .trim()
      .split(/\s+/)[0]
  )
  if (!Number.isInteger(status) || status < 100 || status > 599)
    return { ok: false, kind: 'no-answer', error: 'the site sent no HTTP answer' }
  let rest = s.slice(0, at)
  let head = ''
  for (;;) {
    const cut = /\r?\n\r?\n/.exec(rest)
    if (cut === null) {
      head = rest
      rest = ''
      break
    }
    head = rest.slice(0, cut.index)
    rest = rest.slice(cut.index + cut[0].length)
    if (!/^HTTP\/\S+\s+1\d\d\b/.test(head)) break
  }
  /** @param {string} name */
  const header = (name) => {
    const m = new RegExp(`^${name}:[ \\t]*(.*?)[ \\t]*\\r?$`, 'im').exec(head)
    return m === null ? '' : m[1]
  }
  return {
    ok: true,
    status,
    location: header('location'),
    contentType: header('content-type'),
    contentEncoding: header('content-encoding'),
    body: rest
  }
}

/**
 * A GET redirect-chain resolver run by the container's own node: reachability, and — following the
 * SAME hops a browser would — how far the chain stays on this site's own authority.
 *
 * 🔒 WHY GET AND WHY THE WHOLE CHAIN, NOT ONE HEAD. A single HEAD proves almost nothing about what
 * the browser will load: a server can answer 200 to HEAD and 302 to GET, a first hop can be a
 * same-authority relative path whose SECOND hop leaves the host, and `Location` can be relative. So
 * this uses GET (`redirect:"manual"`, body cancelled — headers are all it reads) and resolves each
 * `Location` against the current URL.
 *
 * 🔒 IT FOLLOWS ONLY THE SAME AUTHORITY, AND STOPS — WITHOUT DIALLING — AT THE FIRST CHANGE (#154).
 * A hop to the SAME host:port and scheme (a trailing-slash/path canonicalisation) is followed. Any
 * change of host, port or scheme STOPS the probe and is reported for the host to classify
 * (`redirectStaysOnSite`): a different name or a scheme change is refused, and a same-name/other-PORT
 * redirect — WordPress `redirect_canonical` pasting on `home_url()`'s public port — is the site
 * telling us its canonical port. Either way the probe NEVER dials the changed authority: the canonical
 * public port is discovered without a single connection to it, so nothing but this container's own
 * loopback service is ever contacted here. The browser (which CAN route that authority back to this
 * container) resolves any further hops — see {@link BROWSER_SCRIPT}.
 *
 * 🔒 AND IT CAN ASK AS THE SITE'S PUBLIC NAME WITHOUT LEAVING LOOPBACK. With a third argument `via`
 * (`127.0.0.1:<port>`, built by the host from {@link publicTarget}), every hop of a URL on the site's
 * own public origin is sent with node's `http` to that loopback port, carrying the URL's own
 * `Host` and `X-Forwarded-Proto` — what cloudflared adds in front of a fleet site — so a site that
 * redirects its bare loopback to `https://<its public host>/` serves the page instead. `fetch` cannot
 * do it (undici drops a `Host` header) and dialling the https URL would leave the container, so the
 * route is fixed to loopback and no TLS is involved. Without `via` the probe is exactly as before.
 *
 * The URL is read from argv and never interpolated. Writes exactly one line:
 *   `TRACY_PROBE <finalStatus> <finalUrl>` (stayed on the dialled authority) ·
 *   `TRACY_PROBE_REDIR <status> <fromUrl> <toUrl>` (host/port/scheme changed — host classifies) ·
 *   `TRACY_PROBE_ERR <message>`
 */
export const PROBE_SCRIPT =
  'const u=process.argv[1];const ms=Number(process.argv[2])||2000;const via=process.argv[3]||"";const MAX=' +
  PROBE_MAX_HOPS +
  ';' +
  'let start=null;try{start=new URL(u)}catch{}' +
  'const vm=/^127\\.0\\.0\\.1:([0-9]{1,5})$/.exec(via);' +
  // One GET, answering {status, location}. Without `via`: fetch, exactly as before. With it: node's
  // http to the loopback port, the URL's own Host and scheme riding as headers.
  'const get=(url)=>{if(!via)return fetch(url,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(ms)})' +
  '.then(async(r)=>{try{await(r.body&&r.body.cancel&&r.body.cancel())}catch{}return{status:r.status,location:r.headers.get("location")||""}});' +
  'const t=new URL(url);return new Promise((res,rej)=>{const q=require("http").request({host:"127.0.0.1",port:Number(vm[1]),method:"GET",path:t.pathname+t.search,' +
  'headers:{host:t.host,"x-forwarded-proto":t.protocol.slice(0,-1),"accept-encoding":"identity"}},' +
  '(r)=>{res({status:r.statusCode,location:String(r.headers.location||"")});r.destroy()});' +
  'q.on("error",rej);q.setTimeout(ms,()=>q.destroy(new Error("timed out")));q.end()})};' +
  '(async()=>{if(start===null){process.stdout.write("TRACY_PROBE_ERR the probe url is not a url");return}' +
  'if(via&&(!vm||Number(vm[1])<1||Number(vm[1])>65535)){process.stdout.write("TRACY_PROBE_ERR the probe route is not a loopback port");return}' +
  'const startHost=start.host,startProto=start.protocol;' +
  'let url=u;for(let i=0;i<MAX;i++){let r;' +
  'try{r=await get(url)}' +
  'catch(e){process.stdout.write("TRACY_PROBE_ERR "+((e&&e.message)||String(e)));return}' +
  'if(r.status>=300&&r.status<400){const loc=r.location;let next;' +
  'try{next=new URL(loc,url)}catch{process.stdout.write("TRACY_PROBE "+r.status+" "+url);return}' +
  'if(next.host===startHost&&next.protocol===startProto){url=next.href;continue}' +
  'process.stdout.write("TRACY_PROBE_REDIR "+r.status+" "+url+" "+next.href);return}' +
  'process.stdout.write("TRACY_PROBE "+r.status+" "+url);return}' +
  'process.stdout.write("TRACY_PROBE_ERR too many redirects")})();'

/**
 * How long, in ms, the in-container MCP fetch may run before node aborts it ITSELF. The docker CLI's
 * own timeout only kills the client; an exec'd process keeps running in the container after the
 * client dies, so the bound that actually stops the request has to live inside the script. Kept a
 * little under {@link MCP_TIMEOUT_MS} in index.ts so this fires first on a hung site.
 */
export const MCP_FETCH_ABORT_MS = 110_000

/**
 * The first bytes of every script that carries the agent token: read it from the root-only mount,
 * refuse a missing or malformed file BY NAME (never echoing the value), and define `red()`, which
 * every byte a script writes out passes through. Extracted from {@link MCP_SCRIPT} so the replace
 * job's two scripts share the custody code instead of restating it; `MCP_SCRIPT`'s own bytes did not
 * change (their sha256 is pinned in `test/exec.test.mjs`). Binds `fs`, `t` (the token) and `red`.
 */
export const MCP_TOKEN_PRELUDE =
  'const fs=require("fs");let t="";' +
  `try{t=fs.readFileSync(${JSON.stringify(AGENT_TOKEN_PATH)},"utf8").trim()}` +
  'catch{process.stdout.write("TRACY_MCP_ERR NO_TOKEN the agent token file is not present");process.exit(0)}' +
  'if(!/^ec_pat_[A-Za-z0-9_-]{16,}$/.test(t)){process.stdout.write("TRACY_MCP_ERR NO_TOKEN the agent token file is malformed");process.exit(0)}' +
  'const red=s=>String(s).split(t).join("[REDACTED]");'

/**
 * The EmDash MCP call, run by the container's own node AS ROOT. It reads the agent token from the
 * read-only root mount, refuses a missing or malformed file BY NAME (never echoing the value), and
 * makes the call to loopback with `redirect:"error"` — a credential-bearing request must not follow
 * a redirect off the loopback origin. It aborts its own fetch at {@link MCP_FETCH_ABORT_MS} so a
 * hung site cannot leave a request running in the container after the docker client is gone. The
 * JSON-RPC body arrives on STDIN. Writes `TRACY_MCP <status>\n<body>`, or `TRACY_MCP_ERR NO_TOKEN …`
 * / `TRACY_MCP_ERR SITE …`.
 *
 * 🔒 REDACTION. The token is never placed on argv or env — but a site could echo the `Authorization`
 * header it received back INTO its response body or a fetch error message. So every byte the script
 * writes to stdout is passed through `red()`, which replaces the exact token value with `[REDACTED]`.
 * dsh (and the model) therefore never see the PAT even if the site reflects it.
 */
export const MCP_SCRIPT =
  MCP_TOKEN_PRELUDE +
  'let b="";process.stdin.on("data",d=>b+=d);process.stdin.on("end",()=>{' +
  `fetch(${JSON.stringify(EMDASH_MCP_LOOPBACK)},{method:"POST",redirect:"error",signal:AbortSignal.timeout(${MCP_FETCH_ABORT_MS}),` +
  'headers:{authorization:"Bearer "+t,"content-type":"application/json",' +
  'accept:"application/json, text/event-stream","X-EmDash-Request":"1"},body:b})' +
  '.then(r=>r.text().then(x=>process.stdout.write("TRACY_MCP "+r.status+"\\n"+red(x))))' +
  '.catch(e=>process.stdout.write("TRACY_MCP_ERR SITE "+red((e&&e.message)||String(e))))});'

/** The EmDash redirects door (REST, not MCP), on loopback inside the container. */
export const EMDASH_REDIRECTS_LOOPBACK = 'http://127.0.0.1:4321/_emdash/api/redirects'

/**
 * One REST call to the site's redirect store, run by the container's own node AS ROOT with the same
 * token custody as {@link MCP_SCRIPT}. The method (argv[1]) and the URL suffix (argv[2]: '', '/<id>' or
 * '?query') are argv data, never script text; the JSON body arrives on stdin. Writes
 * `TRACY_REDIRECTS <status>\n<body>` or `TRACY_REDIRECTS_ERR NO_TOKEN|SITE …`.
 */
export const REDIRECTS_SCRIPT =
  MCP_TOKEN_PRELUDE +
  'const method=process.argv[1]||"GET",suffix=process.argv[2]||"";' +
  'if(!["GET","POST","DELETE"].includes(method)||!/^(\\/[0-9A-Za-z]{1,40}|\\?[A-Za-z0-9_=&%.~-]{0,600})?$/.test(suffix)){process.stdout.write("TRACY_REDIRECTS_ERR SITE bad request");process.exit(0)}' +
  'let b="";process.stdin.on("data",d=>b+=d);process.stdin.on("end",()=>{' +
  `fetch(${JSON.stringify(EMDASH_REDIRECTS_LOOPBACK)}+suffix,{method,redirect:"error",signal:AbortSignal.timeout(${MCP_FETCH_ABORT_MS}),` +
  'headers:Object.assign({authorization:"Bearer "+t,accept:"application/json","X-EmDash-Request":"1"},method==="POST"?{"content-type":"application/json"}:{}),' +
  'body:method==="POST"?b:undefined})' +
  '.then(r=>r.text().then(x=>process.stdout.write("TRACY_REDIRECTS "+r.status+"\\n"+red(x))))' +
  '.catch(e=>process.stdout.write("TRACY_REDIRECTS_ERR SITE "+red((e&&e.message)||String(e))))});'

/**
 * The docker sub-argv for a redirects call: root, `-i` for the body on stdin.
 * @param {{ container: string, method: 'GET' | 'POST' | 'DELETE', path?: string }} input
 */
export function redirectsArgv({ container, method, path = '' }) {
  return ['exec', '-i', '-u', '0', container, 'node', '-e', REDIRECTS_SCRIPT, method, path]
}

/**
 * Parse the redirects script's output, as {@link parseMcpExec} does for MCP's.
 * @param {string} stdout
 * @returns {{ ok: true, status: number, body: string } | { ok: false, kind: 'no-token' | 'transport', error: string }}
 */
export function parseRedirectsExec(stdout) {
  const s = String(stdout ?? '')
  if (s.startsWith('TRACY_REDIRECTS_ERR ')) {
    const raw = s.slice('TRACY_REDIRECTS_ERR '.length).trim()
    if (raw.startsWith('NO_TOKEN'))
      return { ok: false, kind: 'no-token', error: raw.replace(/^NO_TOKEN\s*/, '') || 'no agent token' }
    return { ok: false, kind: 'transport', error: raw.replace(/^SITE\s*/, '') || 'the site did not answer' }
  }
  if (s.startsWith('TRACY_REDIRECTS ')) {
    const nl = s.indexOf('\n')
    const head = (
      nl === -1 ? s.slice('TRACY_REDIRECTS '.length) : s.slice('TRACY_REDIRECTS '.length, nl)
    ).trim()
    const status = Number(head)
    return { ok: true, status: Number.isFinite(status) ? status : 0, body: nl === -1 ? '' : s.slice(nl + 1) }
  }
  return { ok: false, kind: 'transport', error: s.trim().slice(0, 200) || 'the site container wrote nothing' }
}

/** The EmDash forms plugin's admin routes (REST, not MCP), on loopback inside the container. */
export const EMDASH_FORMS_LOOPBACK = 'http://127.0.0.1:4321/_emdash/api/plugins/emdash-forms/'

/**
 * One call to the forms plugin's admin routes — `forms/list` or `forms/update`, nothing else — run by the
 * container's own node AS ROOT with the token custody of {@link MCP_SCRIPT}. The route (argv[1]) is argv data
 * checked against those two, never script text; the JSON body arrives on stdin. Writes
 * `TRACY_FORMS <status>\n<body>` or `TRACY_FORMS_ERR SITE …` (a missing token: the prelude's `TRACY_MCP_ERR NO_TOKEN`).
 */
export const FORMS_SCRIPT =
  MCP_TOKEN_PRELUDE +
  'const route=process.argv[1]||"";' +
  'if(!["forms/list","forms/update"].includes(route)){process.stdout.write("TRACY_FORMS_ERR SITE bad request");process.exit(0)}' +
  'let b="";process.stdin.on("data",d=>b+=d);process.stdin.on("end",()=>{' +
  `fetch(${JSON.stringify(EMDASH_FORMS_LOOPBACK)}+route,{method:"POST",redirect:"error",signal:AbortSignal.timeout(${MCP_FETCH_ABORT_MS}),` +
  'headers:{authorization:"Bearer "+t,accept:"application/json","X-EmDash-Request":"1","content-type":"application/json"},body:b||"{}"})' +
  '.then(r=>r.text().then(x=>process.stdout.write("TRACY_FORMS "+r.status+"\\n"+red(x))))' +
  '.catch(e=>process.stdout.write("TRACY_FORMS_ERR SITE "+red((e&&e.message)||String(e))))});'

/**
 * The docker sub-argv for a forms call: root, `-i` for the body on stdin.
 * @param {{ container: string, route: 'forms/list' | 'forms/update' }} input
 */
export function formsArgv({ container, route }) {
  return ['exec', '-i', '-u', '0', container, 'node', '-e', FORMS_SCRIPT, route]
}

/**
 * Parse the forms script's output, as {@link parseRedirectsExec} does for the redirect store's.
 * @param {string} stdout
 * @returns {{ ok: true, status: number, body: string } | { ok: false, kind: 'no-token' | 'transport', error: string }}
 */
export function parseFormsExec(stdout) {
  const s = String(stdout ?? '')
  if (s.startsWith('TRACY_MCP_ERR NO_TOKEN'))
    return {
      ok: false,
      kind: 'no-token',
      error: s.slice('TRACY_MCP_ERR NO_TOKEN'.length).trim() || 'no agent token'
    }
  if (s.startsWith('TRACY_FORMS_ERR '))
    return {
      ok: false,
      kind: 'transport',
      error:
        s
          .slice('TRACY_FORMS_ERR '.length)
          .replace(/^SITE\s*/, '')
          .trim() || 'the site did not answer'
    }
  if (s.startsWith('TRACY_FORMS ')) {
    const nl = s.indexOf('\n')
    const status = Number((nl === -1 ? s.slice(12) : s.slice(12, nl)).trim())
    return { ok: true, status: Number.isFinite(status) ? status : 0, body: nl === -1 ? '' : s.slice(nl + 1) }
  }
  return { ok: false, kind: 'transport', error: s.trim().slice(0, 200) || 'the site container wrote nothing' }
}

/**
 * One picture of the site's EmDash media store, copied by the container's own node from its loopback
 * file route into the site folder (`/site/<label>/docs/agents/look/…`, the one place `read_image`
 * opens): EmDash keeps files in its own storage, so nothing of them is on the host disk. The storage
 * key (argv[1]) and the destination (argv[2]) are argv data, checked here again as the container is
 * the last place to refuse a path; the body is capped at 8 MiB and written only once whole. Writes
 * `TRACY_MEDIA OK <bytes> <content-type>` or `TRACY_MEDIA_ERR <reason>`.
 */
export const MEDIA_COPY_SCRIPT =
  'const http=require("http"),fs=require("fs");const k=process.argv[1]||"",d=process.argv[2]||"";' +
  'const out=(s)=>{process.stdout.write(s);process.exit(0)};' +
  'if(!/^[0-9A-Za-z][0-9A-Za-z._-]{0,119}$/.test(k)||k.includes("..")||!/^\\/site\\/[a-z0-9-]{1,63}\\/docs\\/agents\\/look\\/[0-9A-Za-z][0-9A-Za-z._-]{0,119}$/.test(d)||d.includes(".."))out("TRACY_MEDIA_ERR bad request");' +
  'const r=http.get({host:"127.0.0.1",port:4321,path:"/_emdash/api/media/file/"+k,timeout:8000},res=>{' +
  'if(res.statusCode!==200){res.resume();out("TRACY_MEDIA_ERR HTTP "+res.statusCode)}' +
  'const t=String(res.headers["content-type"]||"");if(!/^image\\//.test(t)){res.resume();out("TRACY_MEDIA_ERR not an image ("+t.slice(0,40)+")")}' +
  'const c=[];let n=0;res.on("data",b=>{n+=b.length;if(n>8388608){r.destroy();out("TRACY_MEDIA_ERR over 8 MiB")}c.push(b)});' +
  'res.on("end",()=>{try{fs.writeFileSync(d,Buffer.concat(c));out("TRACY_MEDIA OK "+n+" "+t.split(";")[0])}catch(e){out("TRACY_MEDIA_ERR "+String((e&&e.message)||e).slice(0,120))}})});' +
  'r.on("timeout",()=>{r.destroy();out("TRACY_MEDIA_ERR timed out")});r.on("error",e=>out("TRACY_MEDIA_ERR "+String((e&&e.message)||e).slice(0,120)));'

/**
 * The docker sub-argv that copies one EmDash media file into the site folder, as the same user the
 * browser writes its screenshots as.
 * @param {{ container: string, storageKey: string, file: string }} input
 */
export function mediaCopyArgv({ container, storageKey, file }) {
  return ['exec', '-u', 'www-data', container, 'node', '-e', MEDIA_COPY_SCRIPT, storageKey, file]
}

/**
 * The copy script's one line.
 * @param {string} stdout
 * @returns {{ ok: true, bytes: number, mediaType: string } | { ok: false, error: string }}
 */
export function parseMediaCopy(stdout) {
  const s = String(stdout ?? '').trim()
  const ok = /^TRACY_MEDIA OK (\d+) (image\/[a-z0-9.+-]+)$/i.exec(s)
  if (ok) return { ok: true, bytes: Number(ok[1]), mediaType: ok[2].toLowerCase() }
  if (s.startsWith('TRACY_MEDIA_ERR ')) return { ok: false, error: s.slice('TRACY_MEDIA_ERR '.length) }
  return { ok: false, error: s.slice(0, 200) || 'the site container wrote nothing' }
}

/**
 * The container-side path of one copied EmDash picture.
 * @param {string} label @param {string} name
 */
export function containerMediaFile(label, name) {
  return `${CONTAINER_SITES_ROOT}/${label}/docs/agents/look/${name}`
}

/**
 * Hard seconds a browser may run INSIDE the container. `timeout` runs in the container and kills the
 * `node`+chromium tree there; the docker CLI's own timeout only kills the client, and `docker exec`
 * does NOT signal the exec'd process when the client dies — so without this a slow page would leave
 * chromium running in the container after dsh has given up. It is a BACKSTOP: {@link BROWSER_SCRIPT}
 * has its own, shorter internal deadline ({@link BROWSER_DEADLINE_MS}) that kills chromium's whole
 * process group first. Kept under the docker-client `LOOK_TIMEOUT_MS` in index.ts so an in-container
 * kill fires before the client gives up. `timeout` is coreutils on debian / busybox on alpine; both
 * web images carry it (a missing `timeout` reads as 127, which {@link looksLikeMissingBinary} maps to
 * a missing browser).
 */
export const BROWSER_CONTAINER_TIMEOUT_S = 25

/** How long {@link BROWSER_SCRIPT} lets a page settle after navigation before it reads the result. */
export const BROWSER_SETTLE_MS = 5000
/**
 * The browser script's OWN deadline, kept under {@link BROWSER_CONTAINER_TIMEOUT_S} × 1000 so the
 * script tears chromium's process group down itself — cleanly, before the `timeout` backstop fires.
 */
export const BROWSER_DEADLINE_MS = 22_000
/**
 * How long {@link BROWSER_SCRIPT}'s final `process.stdout.write` may take to drain before the script
 * gives up. `process.exit` DROPS whatever stdout has buffered — on Node 24 a large DOM written just
 * before `exit(0)` is truncated to the pipe's ~64 KiB on the way to `execFile` and comes back as an
 * `ok:true` with a half a document. So the script exits from the write's flush callback instead; this
 * bounds that wait so a reader that has gone away cannot hang the render, and a stalled flush exits
 * NON-ZERO so a truncated `TRACY_BROWSER OK …` is never taken for a whole one (see index.ts).
 */
export const BROWSER_FLUSH_MS = 2000
/**
 * MODE `view`: the longest {@link BROWSER_SCRIPT} waits for the page's load event before it scrolls
 * and takes the picture anyway (a page still loading is pictured as it stands, `loaded:false`).
 * Shorter than a `shot`'s fixed settle on purpose: this picture is waited on by a customer's message.
 */
export const VIEW_LOAD_MS = 6000
/** MODE `view`: the JPEG quality of the picture — the page as it reads, at a fifth of a PNG's bytes. */
export const VIEW_QUALITY = 70

/**
 * MODE `view`, IN THE PAGE: scroll to where the customer's Browser tab stood and wait for what that
 * scroll brings in, then say where the page ended up. Embedded into {@link BROWSER_SCRIPT} by source
 * (`String(scrollForView)`), so it must stay self-contained.
 *
 * 🔒 `behavior: 'instant'` AND `scroll-behavior: auto`, because a theme that sets smooth scrolling
 * turns `scrollTo(0, y)` into the START of a glide — measured 28/09 on JA Vega (`capture-scroll-reveal`
 * journal): ten 100 ms steps reached 2,071 of 9,899 px. The picture must be taken where the customer
 * stood, not a third of the way there.
 *
 * Then it waits `settle` ms for what scrolling starts (reveal-on-scroll classes, lazy images asked
 * for), and up to `images` ms more for the pictures now in view to finish loading — a lazy image the
 * customer saw would otherwise be a blank box in ours.
 * @param {number} y - the customer's scroll position, in CSS pixels.
 * @param {{ settle: number, images: number } | null} waits - null when page scripts are disabled; the host owns the wait.
 * @returns {Promise<number> | number} the scroll position the page ended at (shorter pages stop early).
 */
export function scrollForView(y, waits) {
  const root = document.documentElement
  root.style.setProperty('scroll-behavior', 'auto', 'important')
  if (document.body) document.body.style.setProperty('scroll-behavior', 'auto', 'important')
  window.scrollTo({ top: y, left: 0, behavior: 'instant' })
  if (waits === null) return Math.round(window.scrollY)
  const later = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms))
  return later(waits.settle)
    .then(() => {
      const inView = Array.from(document.images).filter((img) => {
        const r = img.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight
      })
      const loads = inView.map((img) =>
        img.complete
          ? null
          : new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true })
              img.addEventListener('error', resolve, { once: true })
            })
      )
      return Promise.race([Promise.all(loads), later(waits.images)])
    })
    .then(() => Math.round(window.scrollY))
}

/** MODE `view`: how long {@link scrollForView} lets a scroll settle, then waits at most for pictures. */
export const VIEW_WAITS = Object.freeze({ settle: 500, images: 1500 })

/** How long one request served over the public-origin route ({@link BROWSER_SCRIPT}) may take. */
export const BROWSER_SERVE_MS = 10_000
/** The most one such response may carry; anything larger fails that request rather than growing without bound. */
export const BROWSER_SERVE_MAX = 32 * 1024 * 1024

/**
 * The docker sub-argv (starting at `exec`) for the in-container GET redirect-chain probe, as www-data.
 * `via` (`127.0.0.1:<port>`) asks for a URL on the site's public origin over loopback — see
 * {@link PROBE_SCRIPT}; absent, the argv is exactly the loopback probe's.
 * @param {{ container: string, url: string, timeoutMs?: number, via?: string }} input
 */
export function probeArgv({ container, url, timeoutMs = 2000, via = '' }) {
  return [
    'exec',
    '-u',
    'www-data',
    container,
    'node',
    '-e',
    PROBE_SCRIPT,
    url,
    String(timeoutMs),
    ...(via ? [via] : [])
  ]
}

/**
 * The container's own browser, driven over a CDP pipe by the container's node, AS www-data. ONE
 * mechanism answers both `page.text` (mode `dom`) and `page.look` (mode `shot`).
 *
 * 🔒 WHY CDP AND NOT `--dump-dom` / `--screenshot`. Those two flags render whatever the browser ends
 * up on and say NOTHING about where that was: on a dead address, a server 30x off-site, or a JS/meta
 * navigation, headless chromium renders its OWN page (an error interstitial, or the other origin's
 * document) and exits 0 — so the old flags would hand back a picture, or the text, of a FOREIGN or
 * ERROR page as this site's own. Driving chromium over `--remote-debugging-pipe` instead lets the
 * script read the ACTUAL final document URL (`document.location.href`) and the navigation outcome
 * (`Page.navigate`'s `errorText`) and REFUSE unless the final URL's origin is exactly the loopback
 * origin it was pointed at. No new dependency: the CDP transport is newline… `\0`-delimited JSON over
 * two extra file descriptors, spoken with node's own `child_process`.
 *
 * The url and origin are separate argv elements (never interpolated into the script). The script
 * writes exactly one line, then (for `shot`) the PNG lands at `file` — a path under
 * {@link CONTAINER_SITES_ROOT} which is the SAME host inode dsh reads back through its `/site` bind:
 *   `TRACY_BROWSER OK <finalUrl>\n<dom?>` · `TRACY_BROWSER OFFSITE <finalUrl>` ·
 *   `TRACY_BROWSER NAV <errorText>` · `TRACY_BROWSER NOCHROME <why>` · `TRACY_BROWSER ERR <why>`
 * It bounds itself ({@link BROWSER_DEADLINE_MS}) and kills chromium's whole process GROUP (chromium
 * spawns renderer/gpu/utility children; killing the launcher alone would orphan them), so a hung
 * render cannot leave chromium running in the container.
 *
 * 🔒 FOUR PROPERTIES THIS SCRIPT KEEPS, each the fix for a way the browser could hand back a lie:
 * - OFF-SITE IS BLOCKED, NOT DETECTED AFTER THE FACT. `Fetch.enable` pauses every Document request;
 *   a MAIN-FRAME one whose origin is not this site's is FAILED (the browser never loads it) and the
 *   run ends `OFFSITE`. Sub-frames (embeds) are left alone. The one preliminary GET probe cannot see
 *   a JS/meta redirect; this can, and stops it before any foreign byte is fetched under this URL.
 * - THE FINAL URL AND HTML ARE READ IN ONE `Runtime.evaluate`, so a navigation cannot slip between a
 *   URL read that passes and an HTML read of another page. The final-origin check still runs on the
 *   URL that came back WITH that HTML — belt and braces with the Fetch guard, not a replacement.
 * - A CDP ERROR RESPONSE REJECTS its `send` (it is not read as a missing `.result`), and a chromium
 *   that dies mid-call fails every in-flight `send` at once, so the flow reports NOW, not at the
 *   deadline. `errorText` from `Page.navigate` is surfaced as `NAV`.
 * - A UNIQUE `--user-data-dir` PER INVOCATION (removed on exit), so concurrent renders never share a
 *   profile or another site's cookies; the CDP pipe's `error` events are swallowed so an early-dying
 *   chromium raises no unhandled `EPIPE`; and the final write flushes before exit ({@link
 *   BROWSER_FLUSH_MS}) so a large DOM is not truncated.
 *
 * 🔒 THE PUBLIC-ORIGIN ROUTE (`TRACY_PUBLIC_VIA`). For a site that redirects its loopback to its own
 * public origin (`publicTarget` in site.mjs), the page is addressed by that origin — so the
 * origin guards above compare against it, unchanged — and every request TO that origin is answered by
 * this script: node's `http` asks `127.0.0.1:<port>` with the URL's `Host` and `X-Forwarded-Proto`,
 * and `Fetch.fulfillRequest` hands chromium the answer. Chromium never connects to the public name
 * (the host also makes it resolve to nothing), no TLS is spoken, and requests to any other origin
 * take the ordinary path. A 3xx is handed back as a 3xx, so a redirect off the origin still meets the
 * main-frame guard.
 *
 * MODE `style` (`page.look {style}`, v6 #3, 28/09/2026). argv[4] is then the request as JSON
 * (`styleRequest`, look-style.mjs) — data on argv, never script text. The viewport is emulated
 * BEFORE the navigation (1440×900 or 390×844, the v6 oracles' own), the page is read once its load
 * event fires (waiting up to 7 s before the deadline; a page still loading then is read and said
 * so, `loaded:false`), and after the same final-origin check as `shot`:
 * `findTarget` in the page names the element, `describeTarget` reads its computed values, and
 * `CSS.getMatchedStylesForNode` — the browser's own cascade, DevTools' Styles data — feeds
 * `resolveStyles`, which runs HERE and sends back only the winning declarations and their token
 * chains, each stylesheet named by its address (or its `<style id>`). The three functions are
 * embedded by source (`String(fn)`), so each is self-contained. `TRACY_BROWSER OK <url>\n<json>`;
 * an element the page does not show is `{error}` inside an OK — the page itself was read.
 */
export const BROWSER_SCRIPT =
  "const {spawn}=require('child_process');const fs=require('fs');const os=require('os');const path=require('path');" +
  'const mode=process.argv[1],url=process.argv[2],origin=process.argv[3],file=process.argv[4]||"";' +
  // mode style: the request (argv[4], JSON), the three embedded functions, the stylesheets CDP names.
  "const req=mode==='style'?(()=>{try{const r=JSON.parse(file);return r&&typeof r==='object'&&Array.isArray(r.props)?r:null}catch{return null}})():null;" +
  // mode view: the customer's frame (argv[4], JSON `{w, h, y, dark?}`, whole numbers checked here too).
  "const vreq=mode==='view'?(()=>{try{const r=JSON.parse(file);return r&&typeof r==='object'&&Number.isInteger(r.w)&&Number.isInteger(r.h)&&Number.isInteger(r.y)&&r.w>0&&r.h>0&&r.y>=0?r:null}catch{return null}})():null;" +
  `const FIND=${JSON.stringify(String(findTarget))},DESCRIBE=${JSON.stringify(String(describeTarget))},VPS=${JSON.stringify(STYLE_VIEWPORTS)};` +
  `const SCROLL=${JSON.stringify(String(scrollForView))},VIEWW=${JSON.stringify(VIEW_WAITS)};` +
  `const RESOLVE=(${String(resolveStyles)});` +
  `const PSEL=(${String(paintSelectors)}),PAINTS=${JSON.stringify(String(countPaints))};` +
  'const sheets={};let onLoad=null;const loaded=new Promise((r)=>{onLoad=r});' +
  // `styles` mode (ADR 0023): the adherence probe, evaluated in the page after it settled.
  'const PROBE=' +
  JSON.stringify(STYLE_PROBE) +
  ';' +
  'const SETTLE_MS=Number(process.argv[5])||' +
  BROWSER_SETTLE_MS +
  ',DEADLINE_MS=Number(process.argv[6])||' +
  BROWSER_DEADLINE_MS +
  ',FLUSH_MS=Number(process.argv[7])||' +
  BROWSER_FLUSH_MS +
  ';' +
  // the public-origin route: a loopback port this script serves the page's own origin from, or none.
  "const via=(process.env&&process.env.TRACY_PUBLIC_VIA)||'';const viaM=/^127\\.0\\.0\\.1:([0-9]{1,5})$/.exec(via);" +
  // HOST MODE (`hostBrowserCommand`): this script runs in dsh, not in the site's container, and every
  // byte the page loads is fetched by THAT container's own curl on its loopback (`serveExec` below).
  // The container is a name, the port is `via`'s; both are checked before anything is launched.
  "const CHROME=(process.env&&process.env.TRACY_CHROME)||'chromium';" +
  "const serveIn=(process.env&&process.env.TRACY_SERVE_CONTAINER)||'';" +
  // A locked site's preview key (#189, `preview-key.mjs`): from the environment only, shape-checked here too, and
  // added ONLY to requests for the page's own origin (never a font or CDN host). With a key every request is paused.
  "const pkRaw=(process.env&&process.env.TRACY_PREVIEW_KEY)||'';const pkey=/^[A-Za-z0-9_-]{32,128}$/.test(pkRaw)?pkRaw:'';" +
  // a private profile per call: concurrent renders must not share the default user-data-dir or cookies.
  "let profile='';try{profile=fs.mkdtempSync(path.join(os.tmpdir(),'tracy-look-'))}catch{}" +
  // navStarted gates the main-frame guard so the target's initial about:blank is ignored; errorText is
  // hoisted so a Page.frameNavigated to chrome-error can report NAV with the navigate's own reason.
  'let child=null,hard=null,finished=false,sid=null,topFrame=null,offsite=null,navStarted=false,errorText=null;' +
  'const clean=()=>{try{if(profile)fs.rmSync(profile,{recursive:true,force:true})}catch{}};' +
  // a bounded SECOND removal at real process exit: after SIGKILL the browser can still hold the dir when
  // done()'s clean() runs, so repeat it once at close. (In the vm test harness process has no `on`.)
  "if(process.on)process.on('exit',clean);" +
  "const stop=()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}try{child.kill('SIGKILL')}catch{}};" +
  // idempotent: the deadline, a late CDP frame or a rejected send must not write a second result.
  // process.exit drops buffered stdout — flush via the write callback; bound it so a broken pipe still
  // exits, and NON-ZERO so a truncated OK is never accepted downstream.
  'const done=(line)=>{if(finished)return;finished=true;if(hard)clearTimeout(hard);if(child)stop();clean();' +
  'const bail=setTimeout(()=>process.exit(1),FLUSH_MS);' +
  'try{process.stdout.write(line,()=>{clearTimeout(bail);process.exit(0)})}catch{clearTimeout(bail);process.exit(1)}};' +
  // a runner that gives up (the host's execFile timeout) sends SIGTERM: take chromium's group down with us.
  "if(process.on)process.on('SIGTERM',()=>done('TRACY_BROWSER ERR stopped'));" +
  "const flags=['--headless=new','--disable-features=MacAppCodeSignClone','--disable-gpu','--no-crash-upload','--disable-breakpad','--no-first-run','--no-default-browser-check','--remote-debugging-pipe'];" +
  "if(mode==='shot'||mode==='styles')flags.push('--hide-scrollbars','--window-size=1280,800');" +
  // style and view: no scrollbar eats the emulated width (the v6 oracle's Playwright hides them too)
  "if(mode==='style'||mode==='view')flags.push('--hide-scrollbars');" +
  // A host-resolver rule from the transport (#154): it maps the ONE canonical public authority the
  // site wants back onto this container's own loopback service, so a same-host/other-port redirect
  // lands on THIS site and no other local service. It is a single argv-safe flag the host builds from
  // validated values (a name it owns + a numeric port); absent, the browser dials loopback as before.
  'if(!serveIn&&process.env&&process.env.TRACY_RESOLVER_RULE)flags.push(process.env.TRACY_RESOLVER_RULE);' +
  // Host mode: chromium itself reaches NOTHING. No name resolves, and every connection (an IP
  // literal, a WebSocket — neither passes through Fetch) goes to a proxy nobody listens on, loopback
  // included. What the page gets is only what serveExec fulfils from the site's own container.
  "if(serveIn)flags.push('--host-resolver-rules=MAP * ~NOTFOUND','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>');" +
  // FAIL CLOSED: a private profile per call is mandatory. If mkdtemp failed (perms, disk full), do NOT
  // launch chromium on the shared default profile — that would read another site's/agent's cookies.
  "if(!profile){done('TRACY_BROWSER ERR could not create a private browser profile')}" +
  // FAIL CLOSED here too: a route that is not a loopback port is refused, never dialled.
  "else if(via&&(!viaM||Number(viaM[1])<1||Number(viaM[1])>65535)){done('TRACY_BROWSER ERR the public route is not a loopback port')}" +
  // FAIL CLOSED in host mode: a container that is not a plain name, no container port, or a mode
  // other than the style probe and the customer's view (its two callers) is refused before chromium starts.
  "else if(serveIn&&(!/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(serveIn)||!viaM||(mode!=='styles'&&mode!=='view'))){done('TRACY_BROWSER ERR the host route needs a container name, its loopback port and the styles or view mode')}" +
  "else if(mode==='style'&&!req){done('TRACY_BROWSER ERR the style request is not a JSON object with props')}" +
  "else if(mode==='view'&&!vreq){done('TRACY_BROWSER ERR the view request is not a JSON object with w, h and y')}else{" +
  "flags.push('--user-data-dir='+profile);" +
  "child=spawn(CHROME,[...flags,'about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe'],detached:true});" +
  "child.on('error',(e)=>done('TRACY_BROWSER NOCHROME '+((e&&e.message)||String(e))));" +
  'const pending=new Map();' +
  // chromium gone before it answered: reject every in-flight call so the flow reports now, not at the deadline.
  "child.on('exit',(code,sig)=>{if(finished)return;const why='chromium exited'+(code!=null?' ('+code+')':sig?' ('+sig+')':'');for(const f of pending.values())f({error:{message:why}});pending.clear();done('TRACY_BROWSER NOCHROME '+why)});" +
  "hard=setTimeout(()=>done('TRACY_BROWSER ERR timed out'),DEADLINE_MS);" +
  'const wr=child.stdio[3],rd=child.stdio[4];let buf=Buffer.alloc(0),id=0;' +
  // an early-dying chromium makes the pipe emit EPIPE; unhandled that would crash the script.
  "wr.on('error',()=>{});rd.on('error',()=>{});" +
  'const send=(method,params,session)=>new Promise((res,rej)=>{const n=++id;' +
  "pending.set(n,(m)=>{if(m&&m.error)rej(new Error(method+': '+((m.error&&m.error.message)||JSON.stringify(m.error))));else res(m)});" +
  'const o={id:n,method,params:params||{}};if(session)o.sessionId=session;' +
  "try{wr.write(JSON.stringify(o)+'\\0')}catch(e){pending.delete(n);rej(e instanceof Error?e:new Error(String(e)))}});" +
  // A COMMITTED main-frame navigation off this origin: Fetch.requestPaused does NOT fire for every one
  // (a data:/about:blank or document.open navigation can commit without a network request), so guard the
  // Page.frameNavigated event too — after our own navigate has begun, a top frame whose URL is not this
  // origin ends OFFSITE (or NAV for chrome-error). The initial about:blank (navStarted false) is ignored.
  // Serve one request to the page's own public origin from the loopback route: the URL's Host and
  // scheme ride as headers, the answer (a 3xx included) is fulfilled as-is minus hop-by-hop framing.
  // Host mode's serve: the request is answered by `docker exec -u www-data <container> curl` against
  // the container's loopback port with the page's own Host, exactly the road page.text's read takes.
  // GET only (no page script runs, so nothing else is asked); at most four at a time.
  "const parseHttp=(b)=>{let off=0;for(let g=0;g<5;g++){const e=b.indexOf('\\r\\n\\r\\n',off);if(e===-1)return null;" +
  "const head=b.slice(off,e).toString('latin1').split('\\r\\n');const sm=/^HTTP\\/[0-9.]+ ([0-9]{3})/.exec(head[0]||'');if(!sm)return null;" +
  "const code=Number(sm[1]);off=e+4;if(code<200)continue;const hs=[];for(const line of head.slice(1)){const i=line.indexOf(':');if(i<1)continue;" +
  "const name=line.slice(0,i).trim(),l=name.toLowerCase();if(l==='content-encoding'||l==='transfer-encoding'||l==='content-length'||l==='connection'||l==='keep-alive')continue;" +
  "hs.push({name,value:line.slice(i+1).trim()})}return{responseCode:code,responseHeaders:hs,body:b.slice(off).toString('base64')}}return null};" +
  'let running=0;const waiting=[];const next=()=>{while(running<4&&waiting.length>0){running++;waiting.shift()(()=>{running--;next()})}};' +
  'const serveExec=(p)=>{const rid=p.requestId;let settled=false;const fin=(o)=>{if(settled||finished)return;settled=true;' +
  "if(o)send('Fetch.fulfillRequest',Object.assign({requestId:rid},o),sid).catch(()=>{});" +
  "else send('Fetch.failRequest',{requestId:rid,errorReason:'ConnectionFailed'},sid).catch(()=>{})};" +
  'let t;try{t=new URL(p.request.url)}catch{return fin(null)}' +
  "const args=['exec','-u','www-data',serveIn,'curl','-sS','-i','--http1.1','--max-time','" +
  Math.ceil(BROWSER_SERVE_MS / 1000) +
  "','--max-filesize','" +
  BROWSER_SERVE_MAX +
  "','-H','Host: '+t.host,'-H','X-Forwarded-Proto: '+t.protocol.slice(0,-1),'-H','Accept-Encoding: identity'];if(pkey)args.push('-H','X-Tracy-Preview-Key: '+pkey);" +
  'const rh=(p.request&&p.request.headers)||{};for(const k of Object.keys(rh)){const l=k.toLowerCase();' +
  "if(l==='host'||l==='connection'||l==='accept-encoding'||l==='content-length'||l==='x-tracy-preview-key')continue;const v=String(rh[k]);if(/[\\r\\n]/.test(k+v))continue;args.push('-H',k+': '+v)}" +
  "args.push('http://127.0.0.1:'+viaM[1]+t.pathname+t.search);" +
  "waiting.push((release)=>{if(finished||settled)return release();require('child_process').execFile('docker',args,{encoding:'buffer',maxBuffer:" +
  BROWSER_SERVE_MAX +
  '+65536,timeout:' +
  BROWSER_SERVE_MS +
  '+2000},(err,out)=>{release();fin(err||!out?null:parseHttp(out))})});next()};' +
  'const serve=(p)=>{const rid=p.requestId;let settled=false;const fin=(o)=>{if(settled||finished)return;settled=true;' +
  "if(o)send('Fetch.fulfillRequest',Object.assign({requestId:rid},o),sid).catch(()=>{});" +
  "else send('Fetch.failRequest',{requestId:rid,errorReason:'ConnectionFailed'},sid).catch(()=>{})};" +
  'let t;try{t=new URL(p.request.url)}catch{return fin(null)}' +
  'const rh=(p.request&&p.request.headers)||{},h={};for(const k of Object.keys(rh)){const l=k.toLowerCase();' +
  "if(l==='host'||l==='connection'||l==='accept-encoding'||l==='content-length')continue;h[k]=rh[k]}" +
  "h.host=t.host;h['x-forwarded-proto']=t.protocol.slice(0,-1);h['accept-encoding']='identity';if(pkey)h['x-tracy-preview-key']=pkey;" +
  "const body=typeof p.request.postData==='string'?Buffer.from(p.request.postData):null;if(body)h['content-length']=String(body.length);" +
  "let q;try{q=require('http').request({host:'127.0.0.1',port:Number(viaM[1]),method:p.request.method||'GET',path:t.pathname+t.search,headers:h},(r)=>{" +
  "const cs=[];let n=0;r.on('data',(d)=>{n+=d.length;if(n>" +
  BROWSER_SERVE_MAX +
  "){r.destroy();return fin(null)}cs.push(d)});r.on('error',()=>fin(null));" +
  "r.on('end',()=>{const hs=[],raw=r.rawHeaders||[];for(let i=0;i+1<raw.length;i+=2){const l=String(raw[i]).toLowerCase();" +
  "if(l==='content-encoding'||l==='transfer-encoding'||l==='content-length'||l==='connection'||l==='keep-alive')continue;hs.push({name:String(raw[i]),value:String(raw[i+1])})}" +
  "fin({responseCode:r.statusCode,responseHeaders:hs,body:Buffer.concat(cs).toString('base64')})})})}catch{return fin(null)}" +
  "q.on('error',()=>fin(null));q.setTimeout(" +
  BROWSER_SERVE_MS +
  ",()=>q.destroy(new Error('timed out')));if(body)q.write(body);q.end()};" +
  // style: the load event ends the wait; CSS.enable announces every stylesheet with its address.
  "const onEvent=(m)=>{if(m.method==='Page.loadEventFired'){if(onLoad)onLoad();return}" +
  "if(m.method==='CSS.styleSheetAdded'){const h=m.params&&m.params.header;if(h&&h.styleSheetId)sheets[h.styleSheetId]=h;return}" +
  "if(m.method==='Page.frameNavigated'){const fr=(m.params&&m.params.frame)||{};" +
  'if(navStarted&&fr.id===topFrame&&!fr.parentId){let good=false;try{good=new URL(fr.url).origin===origin}catch{}' +
  "if(!good){if(fr.url&&fr.url.indexOf('chrome-error://')===0)return done('TRACY_BROWSER NAV '+(errorText||'the page did not load'));return done('TRACY_BROWSER OFFSITE '+(fr.url||offsite||'unknown'))}}return}" +
  'if(m.method!==' +
  "'Fetch.requestPaused'" +
  ')return;const p=m.params||{};const rid=p.requestId,ru=(p.request&&p.request.url)||"";' +
  "let allow=true;if(p.resourceType==='Document'&&p.frameId===topFrame){try{allow=new URL(ru).origin===origin}catch{allow=false}}" +
  // the page's own public origin is served from loopback; everything else goes its ordinary way.
  // host mode: this site's documents and stylesheets from its container — and for a view, the
  // site's own pictures and fonts too, or the picture is a page without them; everything else is
  // failed, never continued (continuing would let chromium dial from dsh's networks).
  'if(allow&&serveIn){let own=false;try{own=new URL(ru).origin===origin}catch{}' +
  "const kind=p.resourceType;const served=kind==='Document'||kind==='Stylesheet'||(mode==='view'&&(kind==='Image'||kind==='Font'));" +
  "if(own&&served&&(p.request&&p.request.method)==='GET')return serveExec(p);" +
  "send('Fetch.failRequest',{requestId:rid,errorReason:'BlockedByClient'},sid).catch(()=>{});return}" +
  'if(allow&&via){let own=false;try{own=new URL(ru).origin===origin}catch{}if(own)return serve(p)}' +
  // the preview key on a request for the page's own origin: its own headers kept, the key added.
  'if(allow&&pkey){let own=false;try{own=new URL(ru).origin===origin}catch{}if(own){const hs=[];const rq=(p.request&&p.request.headers)||{};' +
  "for(const k of Object.keys(rq)){if(k.toLowerCase()!=='x-tracy-preview-key')hs.push({name:k,value:String(rq[k])})}hs.push({name:'X-Tracy-Preview-Key',value:pkey});" +
  "send('Fetch.continueRequest',{requestId:rid,headers:hs},sid).catch(()=>{});return}}" +
  "if(allow){send('Fetch.continueRequest',{requestId:rid},sid).catch(()=>{})}" +
  "else{offsite=ru;send('Fetch.failRequest',{requestId:rid,errorReason:'Aborted'},sid).catch(()=>{});done('TRACY_BROWSER OFFSITE '+ru)}};" +
  "rd.on('data',(d)=>{if(finished)return;buf=Buffer.concat([buf,d]);let i;while((i=buf.indexOf(0))!==-1){let m=null;try{m=JSON.parse(buf.slice(0,i))}catch{}buf=buf.slice(i+1);if(!m)continue;if(m.id&&pending.has(m.id)){const f=pending.get(m.id);pending.delete(m.id);f(m)}else if(m.method)onEvent(m)}});" +
  '(async()=>{' +
  "const t=await send('Target.createTarget',{url:'about:blank'});" +
  "const a=await send('Target.attachToTarget',{targetId:t.result&&t.result.targetId,flatten:true});" +
  'sid=a.result&&a.result.sessionId;' +
  "await send('Page.enable',{},sid);" +
  "const ft=await send('Page.getFrameTree',{},sid);topFrame=ft.result&&ft.result.frameTree&&ft.result.frameTree.frame&&ft.result.frameTree.frame.id;" +
  // on the public-origin route EVERY request is paused (subresources of that origin must be served
  // from loopback too); otherwise only Documents, as the off-site guard needs.
  "await send('Fetch.enable',{patterns:via||pkey?[{urlPattern:'*',requestStage:'Request'}]:[{urlPattern:'*',resourceType:'Document',requestStage:'Request'}]},sid);" +
  // style: the oracle's viewport, set before the page is asked for (media queries read it at once).
  // A light scheme and reduced motion, as the oracle's Playwright context has them: a machine whose
  // OS runs dark would otherwise read the dark-mode tokens.
  "if(mode==='style'){const vp=Object.prototype.hasOwnProperty.call(VPS,req.viewport)?VPS[req.viewport]:VPS.desktop;" +
  "await send('Emulation.setDeviceMetricsOverride',{width:vp.width,height:vp.height,deviceScaleFactor:1,mobile:vp.mobile},sid);" +
  "if(vp.mobile)await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},sid);" +
  "await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'reduce'}]},sid)}" +
  // view: the customer's frame exactly (a desktop browser in a narrow column, never a phone), their
  // colour scheme, and reduced motion so reveal-on-scroll blocks show at once instead of mid-fade.
  "if(mode==='view'){await send('Emulation.setDeviceMetricsOverride',{width:vreq.w,height:vreq.h,deviceScaleFactor:1,mobile:false},sid);" +
  "await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:vreq.dark===true?'dark':'light'},{name:'prefers-reduced-motion',value:'reduce'}]},sid)}" +
  // navStarted BEFORE the navigate: from here a main-frame frameNavigated off-origin is a real drift.
  // host mode: the page's own scripts never run in dsh; computed colours and fonts come from its CSS.
  "if(serveIn)await send('Emulation.setScriptExecutionDisabled',{value:true},sid);" +
  "navStarted=true;const nav=await send('Page.navigate',{url},sid);errorText=nav.result&&nav.result.errorText;" +
  // style reads once the page has loaded, waiting for that up to 7 s before the deadline: values read
  // before its stylesheets arrive would be wrong, not late (on a loaded stand, 28/09, a 5 s cap read a
  // half-parsed EmDash page and found no button). A page still loading then is read and said so.
  // dom and shot wait the settle, as before.
  "let loadedInTime=true;if(mode==='style'){loadedInTime=await Promise.race([loaded.then(()=>true),new Promise((r)=>setTimeout(()=>r(false),Math.max(SETTLE_MS,DEADLINE_MS-7000)))]);await new Promise((r)=>setTimeout(r,Math.min(300,SETTLE_MS)))}" +
  // view waits for the load event too, but no longer than VIEW_LOAD_MS: a customer's message waits on it.
  "else if(mode==='view'){loadedInTime=await Promise.race([loaded.then(()=>true),new Promise((r)=>setTimeout(()=>r(false),Math.max(Math.min(SETTLE_MS,300),Math.min(" +
  VIEW_LOAD_MS +
  ',DEADLINE_MS-9000))))]);await new Promise((r)=>setTimeout(r,Math.min(300,SETTLE_MS)))}' +
  'else await new Promise((r)=>setTimeout(r,SETTLE_MS));if(finished)return;' +
  "if(mode==='shot'){" +
  "const h1=await send('Runtime.evaluate',{expression:'document.location.href',returnByValue:true},sid);" +
  'const u1=h1.result&&h1.result.result&&h1.result.result.value;let ok1=false;try{ok1=new URL(u1).origin===origin}catch{}' +
  "if(!ok1){if(u1&&u1.indexOf('chrome-error://')===0)return done('TRACY_BROWSER NAV '+(errorText||'the page did not load'));return done('TRACY_BROWSER OFFSITE '+(u1||offsite||'unknown'))}" +
  "const shot=await send('Page.captureScreenshot',{format:'png'},sid);const b64=shot.result&&shot.result.data;" +
  "if(!b64)return done('TRACY_BROWSER ERR no screenshot data');if(finished)return;" +
  // re-read after capture: the Fetch guard blocks off-site main-frame nav, but confirm no drift under it.
  "const h2=await send('Runtime.evaluate',{expression:'document.location.href',returnByValue:true},sid);" +
  'const u2=h2.result&&h2.result.result&&h2.result.result.value;let ok2=false;try{ok2=new URL(u2).origin===origin}catch{}' +
  "if(!ok2)return done('TRACY_BROWSER OFFSITE '+(u2||offsite||'unknown'));" +
  "try{fs.writeFileSync(file,Buffer.from(b64,'base64'))}catch(e){return done('TRACY_BROWSER ERR '+((e&&e.message)||String(e)))}" +
  "return done('TRACY_BROWSER OK '+u2)}" +
  // view: the same final-origin checks as shot around the picture; the page is scrolled where the
  // customer stood first (SCROLL, in the page), and the JPEG comes back on stdout — no file lands in
  // the site folder, whose Files tab the customer can open.
  "if(mode==='view'){" +
  "const h1=await send('Runtime.evaluate',{expression:'document.location.href',returnByValue:true},sid);" +
  'const u1=h1.result&&h1.result.result&&h1.result.result.value;let ok1=false;try{ok1=new URL(u1).origin===origin}catch{}' +
  "if(!ok1){if(u1&&u1.indexOf('chrome-error://')===0)return done('TRACY_BROWSER NAV '+(errorText||'the page did not load'));return done('TRACY_BROWSER OFFSITE '+(u1||offsite||'unknown'))}" +
  // Host mode disables page scripts, including callbacks scheduled by our evaluated scroll helper.
  // Scroll synchronously there and wait in this Node process; page timers would never settle.
  "const sc=await send('Runtime.evaluate',{expression:'('+SCROLL+')('+JSON.stringify(vreq.y)+','+(serveIn?'null':JSON.stringify(VIEWW))+')',awaitPromise:!serveIn,returnByValue:true},sid);" +
  'const at=sc.result&&sc.result.result&&sc.result.result.value;' +
  'if(serveIn)await new Promise((r)=>setTimeout(r,VIEWW.settle+VIEWW.images));if(finished)return;' +
  "const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:" +
  VIEW_QUALITY +
  '},sid);const b64=shot.result&&shot.result.data;' +
  "if(!b64)return done('TRACY_BROWSER ERR no screenshot data');if(finished)return;" +
  "const h2=await send('Runtime.evaluate',{expression:'document.location.href',returnByValue:true},sid);" +
  'const u2=h2.result&&h2.result.result&&h2.result.result.value;let ok2=false;try{ok2=new URL(u2).origin===origin}catch{}' +
  "if(!ok2)return done('TRACY_BROWSER OFFSITE '+(u2||offsite||'unknown'));" +
  "return done('TRACY_BROWSER OK '+u2+'\\n'+JSON.stringify({y:typeof at==='number'?at:null,loaded:loadedInTime,jpeg:b64}))}" +
  // style: the same final-origin check as shot, then the element, its values and its cascade.
  "if(mode==='style'){" +
  "const h1=await send('Runtime.evaluate',{expression:'document.location.href',returnByValue:true},sid);" +
  'const u1=h1.result&&h1.result.result&&h1.result.result.value;let ok1=false;try{ok1=new URL(u1).origin===origin}catch{}' +
  "if(!ok1){if(u1&&u1.indexOf('chrome-error://')===0)return done('TRACY_BROWSER NAV '+(errorText||'the page did not load'));return done('TRACY_BROWSER OFFSITE '+(u1||offsite||'unknown'))}" +
  "const f=await send('Runtime.evaluate',{expression:'('+FIND+')('+JSON.stringify(req)+')',returnByValue:false},sid);" +
  'const ro=f.result&&f.result.result;' +
  "if(!ro||ro.subtype!=='node'||!ro.objectId)return done('TRACY_BROWSER OK '+u1+'\\n'+JSON.stringify({error:String((ro&&ro.value)||'the page returned no element'),loaded:loadedInTime}));" +
  // look.set (`req.set`) also asks for the element's own selector, the page's classes and the sheets in order
  "const dv=await send('Runtime.callFunctionOn',{objectId:ro.objectId,functionDeclaration:DESCRIBE,arguments:[{value:req.props},{value:req.set===true}],returnByValue:true},sid);" +
  'const info=(dv.result&&dv.result.result&&dv.result.result.value)||{};' +
  "await send('DOM.enable',{},sid);await send('CSS.enable',{},sid);await send('DOM.getDocument',{depth:0},sid);" +
  "const matchedOf=async(oid)=>{const n=await send('DOM.requestNode',{objectId:oid},sid);const r=await send('CSS.getMatchedStylesForNode',{nodeId:n.result&&n.result.nodeId},sid);return r.result||{}};" +
  'const mt=await matchedOf(ro.objectId);let painter=null;' +
  // background-color: the ancestor that paints it has a cascade of its own
  "if(info.paint>0){const a=await send('Runtime.callFunctionOn',{objectId:ro.objectId,functionDeclaration:'function(k){let e=this;while(k-->0&&e.parentElement)e=e.parentElement;return e}',arguments:[{value:info.paint}]},sid);" +
  'const ao=a.result&&a.result.result;if(ao&&ao.objectId)painter=await matchedOf(ao.objectId)}' +
  'const got=RESOLVE({props:req.props,info,matched:mt,painter});' +
  // look.set only: how many elements each winning rule paints on this page, read before any write (`paints`)
  "if(req.set===true){try{const ps=PSEL(got.props||{});if(ps.some(Boolean)){const pc=await send('Runtime.evaluate',{expression:'('+PAINTS+')('+JSON.stringify(ps)+')',returnByValue:true},sid);" +
  "const ns=pc.result&&pc.result.result&&pc.result.result.value;if(Array.isArray(ns))Object.values(got.props).forEach((r,i)=>{if(r&&typeof ns[i]==='number'&&ns[i]>=0)r.paints=ns[i]})}}catch{}}" +
  // look.set only: the copies of a hidden link that visitors see (`describeTarget` `copies`), each read with
  // its own cascade in this same visit, so the rule written for them beats what wins on each.
  'const copies=[];if(req.set===true&&Array.isArray(info.copies)){for(const c of info.copies.slice(0,3)){try{' +
  "const q=await send('Runtime.evaluate',{expression:'document.querySelector('+JSON.stringify(String(c.unique))+')',returnByValue:false},sid);" +
  "const co=q.result&&q.result.result;if(!co||co.subtype!=='node'||!co.objectId)continue;" +
  "const cd=await send('Runtime.callFunctionOn',{objectId:co.objectId,functionDeclaration:DESCRIBE,arguments:[{value:req.props},{value:false}],returnByValue:true},sid);" +
  'const ci=(cd.result&&cd.result.result&&cd.result.result.value)||{};const cg=RESOLVE({props:req.props,info:ci,matched:await matchedOf(co.objectId),painter:null});' +
  "for(const id of cg.sheets||[])if(!got.sheets.includes(id))got.sheets.push(id);copies.push({unique:String(c.unique),el:String(c.el||ci.el||''),props:cg.props||{}})}catch{}}}" +
  // each stylesheet by its address (this site's as a path), WordPress's own sourceURL name, or its <style id>
  "const names={};for(const id of got.sheets){const h=sheets[id];if(!h){names[id]='a stylesheet';continue}" +
  "if(h.isInline&&!h.hasSourceURL){let label='a <style> in the page';try{const d=await send('DOM.describeNode',{backendNodeId:h.ownerNode},sid);" +
  "const at=(d.result&&d.result.node&&d.result.node.attributes)||[];for(let i=0;i+1<at.length;i+=2)if(at[i]==='id'){label='<style id=\"'+String(at[i+1]).slice(0,60)+'\">';break}}catch{}names[id]=label;continue}" +
  "let s=String(h.sourceURL||''),isUrl=false;try{const su=new URL(s);isUrl=true;s=su.origin===new URL(u1).origin?su.pathname:su.origin+su.pathname}catch{}" +
  // a file the CMS printed into the page (WordPress inlines small block stylesheets under their address)
  "names[id]=s.slice(0,120)+(h.isInline&&isUrl?' (inlined in the page)':'')}" +
  // a line inside an inline <style> locates nothing in any file
  "const fix=(o)=>{if(!o||!o.sheet)return;const h=sheets[o.sheet];if(h&&h.isInline)delete o.line;o.sheet=names[o.sheet]||'a stylesheet'};" +
  'for(const row of [...Object.values(got.props),...copies.flatMap((c)=>Object.values(c.props))]){fix(row);for(const t of row.tokens||[])fix(t);for(const pt of row.parts||[])fix(pt)}' +
  "return done('TRACY_BROWSER OK '+u1+'\\n'+JSON.stringify({info:{el:info.el,text:info.text,matches:info.matches,how:info.how,hidden:info.hidden,unique:info.unique,body:info.body,chrome:info.chrome,sheets:info.sheets,template:info.template,framework:info.framework,...(copies.length>0?{copies}:{})},props:got.props,loaded:loadedInTime}))}" +
  // styles: the probe's own `href` is the final URL, read in the same turn as the samples.
  "if(mode==='styles'){" +
  "const S=await send('Runtime.evaluate',{expression:PROBE,returnByValue:true},sid);" +
  'const v=S.result&&S.result.result&&S.result.result.value;' +
  "if(!v||typeof v!=='object'||!Array.isArray(v.samples))return done('TRACY_BROWSER ERR the style probe returned nothing');" +
  'const u3=v.href;let ok3=false;try{ok3=new URL(u3).origin===origin}catch{}' +
  "if(!ok3){if(u3&&u3.indexOf('chrome-error://')===0)return done('TRACY_BROWSER NAV '+(errorText||'the page did not load'));return done('TRACY_BROWSER OFFSITE '+(u3||offsite||'unknown'))}" +
  "return done('TRACY_BROWSER OK '+u3+'\\n'+JSON.stringify(v))}" +
  // dom: URL + HTML in ONE turn so a navigation cannot split a passing URL from another page's HTML.
  "const R=await send('Runtime.evaluate',{expression:'JSON.stringify({href:document.location.href,html:document.documentElement.outerHTML})',returnByValue:true},sid);" +
  'const raw=R.result&&R.result.result&&R.result.result.value;let data=null;try{data=JSON.parse(raw)}catch{}' +
  'const finalUrl=data&&data.href;let same=false;try{same=new URL(finalUrl).origin===origin}catch{}' +
  "if(!same){if(finalUrl&&finalUrl.indexOf('chrome-error://')===0)return done('TRACY_BROWSER NAV '+(errorText||'the page did not load'));return done('TRACY_BROWSER OFFSITE '+(finalUrl||offsite||'unknown'))}" +
  "return done('TRACY_BROWSER OK '+finalUrl+'\\n'+((data&&data.html)||''))" +
  "})().catch((e)=>done('TRACY_BROWSER ERR '+((e&&e.message)||String(e))));" +
  '}'

/** The `-e TRACY_PREVIEW_KEY=<key>` pair for a site's web container while it is locked with a key, else none. */
function previewKeyEnv(/** @type {string} */ container) {
  const key = previewKeyFor(previewLabelOf(container))
  return key ? ['-e', `TRACY_PREVIEW_KEY=${key}`] : []
}

/** The site label a web container is named after (`<label>-web-1`), or null. */
const previewLabelOf = (/** @type {unknown} */ container) =>
  /^([a-z0-9][a-z0-9-]*)-web-1$/.exec(String(container))?.[1] ?? null

/**
 * The docker sub-argv for a browser call: the container's node driving chromium over CDP, as
 * www-data with a writable HOME (chromium's user-data-dir), wrapped in `timeout` as the backstop
 * (see {@link BROWSER_CONTAINER_TIMEOUT_S}). `mode` is `dom`, `shot`, `style` or `view`; `file` is the
 * screenshot path (shot) or the request as JSON (style: the props to read; view: `{w, h, y, dark?}`).
 * The `origin` the final document must match is a separate argv element.
 *
 * `deadlineMs`, when given, is the script's own deadline in place of {@link BROWSER_DEADLINE_MS} (a
 * `view` is waited on by a customer's message and gives up sooner); `settleMs` is then sent beside it
 * because the two are positional. Absent, the argv is exactly what every other caller has always sent.
 *
 * `resolverRule`, when given, is a `--host-resolver-rules=…` flag (built by {@link hostResolverRule}
 * on the host) carried to the container as an ENV value, not on argv or in the script text: chromium
 * reads it off `TRACY_RESOLVER_RULE` and adds it to its own launch flags. It routes the site's
 * canonical public authority back onto this container's loopback service (#154); absent, the browser
 * dials loopback unchanged.
 *
 * `via`, when given, is the `127.0.0.1:<port>` the page's own public origin is served from (the
 * public-origin route above), carried the same way as `TRACY_PUBLIC_VIA`.
 * @param {{ container: string, mode: 'dom' | 'shot' | 'style' | 'styles' | 'view', url: string, origin: string, file?: string, resolverRule?: string, via?: string, settleMs?: number, deadlineMs?: number }} input
 */
export function browserArgv({
  container,
  mode,
  url,
  origin,
  file = '',
  resolverRule = '',
  via = '',
  settleMs = BROWSER_SETTLE_MS,
  deadlineMs
}) {
  return [
    'exec',
    '-u',
    'www-data',
    // Chromium wants a writable HOME for its user-data-dir; www-data's may not be. /tmp is.
    '-e',
    'HOME=/tmp',
    ...(resolverRule ? ['-e', `TRACY_RESOLVER_RULE=${resolverRule}`] : []),
    ...(via ? ['-e', `TRACY_PUBLIC_VIA=${via}`] : []),
    // A locked site (#189): its preview key as an exec environment variable, never a file in the container.
    ...previewKeyEnv(container),
    container,
    'timeout',
    '-k',
    '3',
    String(BROWSER_CONTAINER_TIMEOUT_S),
    'node',
    '-e',
    BROWSER_SCRIPT,
    mode,
    url,
    origin,
    file,
    ...(deadlineMs === undefined ? [] : [String(settleMs), String(deadlineMs)])
  ]
}

/**
 * dsh's own browser — the wrapper the dsh image ships (`/usr/local/bin/tracy-chrome`, the one the
 * build's `shot` stage drives), else `OD_BROWSER_EXECUTABLE_PATH`, else none.
 * @param {Record<string, string | undefined>} env
 * @param {(file: string) => boolean} exists
 * @returns {string | null}
 */
export function hostChromeOf(env, exists) {
  if (exists(HOST_CHROME)) return HOST_CHROME
  const named = env.OD_BROWSER_EXECUTABLE_PATH
  return named && exists(named) ? named : null
}
export const HOST_CHROME = '/usr/local/bin/tracy-chrome'

/** A docker container name, as the host-mode script accepts it (checked on both sides). */
const CONTAINER_NAME = /^[a-z0-9][a-z0-9_.-]{0,127}$/

/**
 * The in-container browser target, re-addressed for dsh's own browser (host mode of
 * {@link BROWSER_SCRIPT}): the page keeps the SAME address and origin — so the off-site guards compare
 * against exactly what they compare against in the container — and `via` names the container loopback
 * port every one of its requests is fetched from, by that container's own curl. The port is the one
 * the in-container browser would have dialled: `via`'s on the public-origin route, the resolver rule's
 * target on the canonical-port route, the URL's own otherwise. Anything that does not pin to the
 * container's `127.0.0.1` is null: never a guess.
 * @param {{ url: string, origin: string, container: string, resolverRule: string, via: string } | null} target
 * @returns {{ url: string, origin: string, container: string, via: string } | null}
 */
export function hostBrowserTarget(target) {
  if (!target || typeof target.container !== 'string' || !CONTAINER_NAME.test(target.container)) return null
  let port = ''
  if (target.via) {
    const m = /^127\.0\.0\.1:([0-9]{1,5})$/.exec(target.via)
    if (!m) return null
    port = m[1]
  } else if (target.resolverRule) {
    const m = /^--host-resolver-rules=MAP \S+ 127\.0\.0\.1:([0-9]{1,5})$/.exec(target.resolverRule)
    if (!m) return null
    port = m[1]
  } else {
    let u
    try {
      u = new URL(target.url)
    } catch {
      return null
    }
    if (u.hostname !== '127.0.0.1') return null
    port = u.port || (u.protocol === 'https:' ? '443' : '80')
  }
  const n = Number(port)
  if (!(n >= 1 && n <= 65535)) return null
  return { url: target.url, origin: target.origin, container: target.container, via: `127.0.0.1:${n}` }
}

/**
 * The command that runs {@link BROWSER_SCRIPT} in dsh's own node, in `styles` mode (or `view`, with
 * its frame as `file` and its own deadline), against a {@link hostBrowserTarget}. The browser, the
 * container and its port ride in env (never in the script text); `DOCKER_HOST` is the daemon dsh's
 * own transport uses, so the script's per-request `docker exec … curl` goes where every other exec
 * of this plugin goes.
 * @param {{ chrome: string, target: { url: string, origin: string, container: string, via: string }, dockerHost: string | null | undefined,
 *   mode?: 'styles' | 'view', file?: string, settleMs?: number, deadlineMs?: number }} input
 * @returns {{ file: string, args: string[], env: Record<string, string> }}
 */
export function hostBrowserCommand({
  chrome,
  target,
  dockerHost,
  mode = 'styles',
  file = '',
  settleMs = BROWSER_SETTLE_MS,
  deadlineMs
}) {
  return {
    file: process.execPath,
    args: [
      '-e',
      BROWSER_SCRIPT,
      mode,
      target.url,
      target.origin,
      file,
      ...(deadlineMs === undefined ? [] : [String(settleMs), String(deadlineMs)])
    ],
    env: {
      TRACY_CHROME: chrome,
      TRACY_SERVE_CONTAINER: target.container,
      TRACY_PUBLIC_VIA: target.via,
      ...(previewKeyFor(previewLabelOf(target.container))
        ? { TRACY_PREVIEW_KEY: /** @type {string} */ (previewKeyFor(previewLabelOf(target.container))) }
        : {}),
      ...(dockerHost ? { DOCKER_HOST: dockerHost } : {})
    }
  }
}

/**
 * Hard ms for a host-mode run: the script's own deadline plus its flush, plus room. It is the
 * backstop; on it the runner sends SIGTERM and the script kills chromium's group itself.
 */
export const HOST_BROWSER_TIMEOUT_MS = BROWSER_DEADLINE_MS + BROWSER_FLUSH_MS + 4000

/**
 * The impure runner for {@link hostBrowserCommand}: dsh's node, in dsh. Same result shape as
 * {@link dockerExec}, so the same parsers and clean-exit rule read it.
 * @param {{ chrome: string, target: { url: string, origin: string, container: string, via: string }, timeoutMs?: number, maxBuffer?: number,
 *   mode?: 'styles' | 'view', file?: string, deadlineMs?: number }} input
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string, timedOut: boolean, spawnError?: string }>}
 */
export function hostBrowserExec({
  chrome,
  target,
  timeoutMs = HOST_BROWSER_TIMEOUT_MS,
  maxBuffer = 8 * 1024 * 1024,
  mode = 'styles',
  file = '',
  deadlineMs
}) {
  const c = hostBrowserCommand({
    chrome,
    target,
    dockerHost: resolveDockerHost(undefined, process.env),
    mode,
    file,
    ...(deadlineMs === undefined ? {} : { deadlineMs })
  })
  return new Promise((resolve) => {
    execFile(
      c.file,
      c.args,
      { env: { ...process.env, ...c.env }, timeout: timeoutMs, killSignal: 'SIGTERM', maxBuffer },
      (error, stdout, stderr) => {
        resolve({
          code: error && typeof error.code === 'number' ? error.code : error ? null : 0,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          timedOut: Boolean(error && error.killed),
          spawnError:
            error && typeof error.code !== 'number' && !error.killed
              ? String(error.message).split('\n')[0]
              : undefined
        })
      }
    )
  })
}

/**
 * The docker sub-argv for the EmDash MCP call: the container's node, AS ROOT — explicit `-u 0`, not
 * a guess at the image's default USER — and `-i` so the request body reaches it on stdin. The token
 * is read inside the script, never here.
 * @param {{ container: string }} input
 */
export function mcpArgv({ container }) {
  return ['exec', '-i', '-u', '0', container, 'node', '-e', MCP_SCRIPT]
}

/**
 * Parse the probe's one line. The script follows only the SAME authority and stops at the first
 * host/port/scheme change, so a `_REDIR` line carries the raw `from`/`to` for the host to classify
 * with `redirectStaysOnSite` — a different name or scheme becomes `REDIRECTED_OFF_SITE`, a
 * same-name/other-port hop becomes the canonical authority the browser is routed to. The probe never
 * dialled the changed authority, so nothing here means a foreign port was contacted.
 * @param {string} stdout
 * @returns {{ ok: true, status: number, finalUrl: string }
 *   | { ok: false, redirect: { status: number, from: string, location: string } }
 *   | { ok: false, redirect?: undefined, error: string }}
 */
export function parseProbe(stdout) {
  const s = String(stdout ?? '').trim()
  if (s.startsWith('TRACY_PROBE_REDIR ')) {
    const parts = s.slice('TRACY_PROBE_REDIR '.length).trim().split(/\s+/)
    const status = Number(parts[0])
    return {
      ok: false,
      redirect: {
        status: Number.isFinite(status) ? status : 0,
        from: parts[1] ?? '',
        location: parts[2] ?? ''
      }
    }
  }
  if (s.startsWith('TRACY_PROBE_ERR ')) return { ok: false, error: s.slice('TRACY_PROBE_ERR '.length) }
  if (s.startsWith('TRACY_PROBE ')) {
    const rest = s.slice('TRACY_PROBE '.length)
    const sp = rest.indexOf(' ')
    const status = Number(sp === -1 ? rest : rest.slice(0, sp))
    if (!Number.isFinite(status) || status <= 0)
      return { ok: false, error: `the probe returned no status: ${rest.slice(0, 120)}` }
    return { ok: true, status, finalUrl: sp === -1 ? '' : rest.slice(sp + 1).trim() }
  }
  return { ok: false, error: s.slice(0, 200) || 'the probe wrote nothing' }
}

/**
 * Parse a browser call's output into a transport-level result. `kind` keeps the outcomes the host
 * must tell apart: an off-origin final document, a failed navigation (a Chrome error page), a
 * missing chromium, and everything else. On success `dom` carries the rendered document (empty for a
 * screenshot, which was written to the file instead).
 * @param {string} stdout
 * @returns {{ ok: true, finalUrl: string, dom: string }
 *   | { ok: false, kind: 'offsite' | 'nav' | 'no-browser' | 'error', error: string }}
 */
export function parseBrowser(stdout) {
  const s = String(stdout ?? '')
  if (s.startsWith('TRACY_BROWSER OK ')) {
    const rest = s.slice('TRACY_BROWSER OK '.length)
    const nl = rest.indexOf('\n')
    return {
      ok: true,
      finalUrl: (nl === -1 ? rest : rest.slice(0, nl)).trim(),
      dom: nl === -1 ? '' : rest.slice(nl + 1)
    }
  }
  if (s.startsWith('TRACY_BROWSER OFFSITE '))
    return { ok: false, kind: 'offsite', error: s.slice('TRACY_BROWSER OFFSITE '.length).trim() }
  if (s.startsWith('TRACY_BROWSER NOCHROME '))
    return { ok: false, kind: 'no-browser', error: s.slice('TRACY_BROWSER NOCHROME '.length).trim() }
  if (s.startsWith('TRACY_BROWSER NAV '))
    return { ok: false, kind: 'nav', error: s.slice('TRACY_BROWSER NAV '.length).trim() }
  if (s.startsWith('TRACY_BROWSER ERR '))
    return { ok: false, kind: 'error', error: s.slice('TRACY_BROWSER ERR '.length).trim() }
  return { ok: false, kind: 'error', error: s.trim().slice(0, 200) || 'the browser wrote nothing' }
}

/**
 * Parse the MCP script's output into a transport-level result. `kind` tells the two refusals the
 * host must keep distinct apart: a missing/malformed token is `NO_TOKEN`, everything else a
 * transport failure.
 * @param {string} stdout
 * @returns {{ ok: true, status: number, body: string } | { ok: false, kind: 'no-token' | 'transport', error: string }}
 */
export function parseMcpExec(stdout) {
  const s = String(stdout ?? '')
  if (s.startsWith('TRACY_MCP_ERR ')) {
    const raw = s.slice('TRACY_MCP_ERR '.length).trim()
    if (raw.startsWith('NO_TOKEN'))
      return { ok: false, kind: 'no-token', error: raw.replace(/^NO_TOKEN\s*/, '') || 'no agent token' }
    return { ok: false, kind: 'transport', error: raw.replace(/^SITE\s*/, '') || 'the site did not answer' }
  }
  if (s.startsWith('TRACY_MCP ')) {
    const nl = s.indexOf('\n')
    const head = (nl === -1 ? s.slice('TRACY_MCP '.length) : s.slice('TRACY_MCP '.length, nl)).trim()
    const status = Number(head)
    return {
      ok: true,
      status: Number.isFinite(status) ? status : 0,
      body: nl === -1 ? '' : s.slice(nl + 1)
    }
  }
  return { ok: false, kind: 'transport', error: s.trim().slice(0, 200) || 'the site container wrote nothing' }
}

// ── The replace job's two EmDash scripts (PLAN v2 P11, F3 §6.1) ─────────────────────────────────────

/**
 * 🔒 ONE RUN-WIDE DEADLINE PER SCRIPT, INSIDE THE CONTAINER. The docker client's timeout only kills
 * the client (an exec'd process keeps running after it), so the bound that stops the work lives in
 * the script: every fetch aborts at what is left of this budget, and a timer writes the script's one
 * line when it runs out. Kept under {@link EMDASH_INDEX_MS} / {@link EMDASH_WRITE_MS} so the script
 * answers before the client gives up — a deadline answer says which write was in flight; a killed
 * client says nothing at all.
 */
export const EMDASH_SCRIPT_DEADLINE_MS = 45_000
/** The docker client's own timeout for the INDEX exec: the script's deadline plus room to answer. */
export const EMDASH_INDEX_MS = 60_000
/** The docker client's own timeout for the WRITE exec. */
export const EMDASH_WRITE_MS = 60_000
/**
 * How many WRITE runs one replace job takes when the deadline stops a run that did write: each run
 * sends only what the last one never sent, under a deadline of its own — at most 135 s of writing.
 */
export const EMDASH_WRITE_ROUNDS = 3
/**
 * What either exec may bring back. The INDEX answer for one language of Tracy Business is ≈ 70 KB;
 * the `site` rows of 40 served languages ≈ 200 KB. 16 MiB is the same ceiling `tracy_emdash` uses.
 */
export const EMDASH_EXEC_MAX_BUFFER = 16 * 1024 * 1024
/** How many MCP reads the INDEX script keeps in flight at once: enough to overlap, never a flood. */
export const EMDASH_INDEX_PARALLEL = 6
/** The most ops one WRITE run takes: 40 served languages × a record and a menu, with room. */
export const EMDASH_WRITE_MAX_OPS = 200
/**
 * A write is not STARTED with less than this left of the deadline, so a run that runs out stops
 * between two ops — every op then either landed or was never sent — instead of in the middle of one.
 */
export const EMDASH_WRITE_MIN_LEFT_MS = 5_000

/**
 * 🔒 THE INDEX SCRIPT MAY CALL ONLY THESE — EmDash's own read-only tools (`readOnlyHint` on 0.38's
 * tools/list), hard-coded here and checked in the script before every call. The list is restated,
 * not imported from `emdash.mjs`, on purpose: this module's script strings are built when it loads,
 * and `emdash.mjs` → `site.mjs` → this module is an import cycle in which the imported Set would not
 * exist yet. `test/exec.test.mjs` fails the day the two lists differ.
 */
export const EMDASH_INDEX_TOOLS = Object.freeze([
  'content_list',
  'content_get',
  'content_compare',
  'content_list_trashed',
  'content_translations',
  'byline_list',
  'byline_get',
  'byline_translations',
  'schema_list_collections',
  'schema_get_collection',
  'media_list',
  'media_get',
  'search',
  'taxonomy_list',
  'taxonomy_get',
  'taxonomy_list_terms',
  'taxonomy_term_translations',
  'menu_list',
  'menu_get',
  'menu_translations',
  'revision_list',
  'settings_get'
])

/**
 * 🔒 THE WRITE SCRIPT'S OPS MAY BE ONLY THESE THREE (D16): the words of an entry, of a menu and the
 * site title. Every op is checked BEFORE the first call, so a list carrying a delete, a publish of
 * another entry or a schema change is refused whole with nothing sent. The one other call the script
 * makes is its own fixed `menu_get`, a read, to compare a menu with the one the plan was built on
 * (menus carry no `_rev`).
 */
export const EMDASH_WRITE_TOOLS = Object.freeze(['content_update', 'menu_set_items', 'settings_update'])

/**
 * The MCP call both scripts make, after {@link MCP_TOKEN_PRELUDE}: a POST to loopback with
 * `redirect:"error"` (a credential-bearing request never follows a redirect), aborted at what is left
 * of the run's deadline, its answer read the way `parseMcpBody`/`readMcpReply` read it (the last SSE
 * `data:` line or plain JSON; `error` and `result.isError` are both refusals). Errors carry a `kind`:
 * `SITE` (no answer, a non-200, not JSON-RPC), `TOOL` (EmDash said no: `<tool>: [CONFLICT] …`, its
 * own words after the tool's name), `REFUSED`.
 * Defines `left`, `out` (writes the ONE line, through `red()`, once), `E`, `rpc`.
 */
const EMDASH_RPC = String.raw`
const URL0=${JSON.stringify(EMDASH_MCP_LOOPBACK)},LIMIT=${EMDASH_SCRIPT_DEADLINE_MS},T0=Date.now();
const left=()=>LIMIT-(Date.now()-T0);
let done=false,calls=0,timer=null;
const out=(s)=>{if(done)return;done=true;if(timer)clearTimeout(timer);process.stdout.write(red(s))};
const E=(k,m)=>{const e=new Error(String(m).slice(0,300));e.kind=k;return e};
const rpc=async(name,args)=>{calls++;
const r=await fetch(URL0,{method:"POST",redirect:"error",signal:AbortSignal.timeout(Math.max(1,left())),headers:{authorization:"Bearer "+t,"content-type":"application/json",accept:"application/json, text/event-stream","X-EmDash-Request":"1"},body:JSON.stringify({jsonrpc:"2.0",id:calls,method:"tools/call",params:{name:name,arguments:args}})});
const x=await r.text();
if(r.status!==200)throw E("SITE","HTTP "+r.status+" on "+name);
const d=x.split(/\r?\n/).filter((l)=>l.startsWith("data:")).map((l)=>l.slice(5).trim()).filter(Boolean);
let j;try{j=JSON.parse(d.length?d[d.length-1]:x)}catch(e){throw E("SITE",name+" answered no JSON-RPC")}
if(j&&j.error)throw E("TOOL",name+": "+String(j.error.message||"error"));
const res=(j&&j.result)||{};
const txt=(Array.isArray(res.content)?res.content:[]).filter((p)=>p&&p.type==="text").map((p)=>String(p.text||"")).join("\n");
if(res.isError)throw E("TOOL",name+": "+(txt||"refused"));
try{return JSON.parse(txt)}catch(e){return txt}};
const LOC=/^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/,SLUG=/^[a-z][a-z0-9_]*$/,NAME=/^[a-z0-9][a-z0-9_-]*$/;
`

/**
 * The replace job's READ: every published entry of the asked languages and collections, the menus,
 * the taxonomy terms and the site settings of this EmDash site, in ONE exec — run by the container's
 * own node AS ROOT (only root reads the agent token), like {@link MCP_SCRIPT}.
 *
 * 🔒 WHAT IT MAY DO, AND WHY IT IS A SCRIPT AT ALL. The locator needs every string a visitor could be
 * reading (r2: 4–6 `tracy_emdash` reads and ~130k chars before the first write, then a guess); the
 * matching itself is pure host code (`replace-emdash.mjs`). So the script only READS: each call is
 * checked against {@link EMDASH_INDEX_TOOLS} before it is made, the MCP endpoint on loopback is the
 * only address it dials, and there is NO page GET here (D2: the page is read by `fetchPageHtml`, the
 * one road into a page). No runtime value is interpolated into the script text: the request
 * arrives on stdin.
 *
 * stdin: `{locales?: string[], collections?: string[], menus?: boolean | string[], terms?: boolean,
 * settings?: boolean}`. Served locales are ALWAYS computed — the locales of the published `site` rows,
 * the template's own `served-locales` rule — and are the default `locales`; a site with no `site`
 * collection has `served: null`, and no locale at all lists each collection once, unfiltered.
 * Only `status:"published"` rows are read: an unpublished entry is not on any page.
 *
 * 🔒 ONLY `[NOT_FOUND]` / `[COLLECTION_NOT_FOUND]` IS "NOT ON THIS SITE" — the same pair as
 * `NO_COLLECTION` in `emdash-call.mjs`: EmDash 1.0.1 answers `content_list` for a collection the
 * template lacks (SaaS has no `site`) with `[COLLECTION_NOT_FOUND]`, the stand with `[NOT_FOUND]`
 * (quickstart smoke H2, 29/09/2026). A collection or a menu EmDash answers either code
 * for is skipped and named in `missing` (`<collection>` / `menu <name>`), so the host can say what
 * it did not read; ANY other refusal (`[INTERNAL_ERROR] database is locked`, `[FORBIDDEN]`) fails the
 * whole read as `TOOL`. Before, every refusal counted as missing, and a locked database turned
 * "Selected projects" into NOT_EDITABLE "… do not look for another way in" (measured on the fake
 * door): a passing fault told to the customer as a permanent one.
 *
 * `patterns` is every collection's own `urlPattern` (null when it has no page), read on every call: with no
 * template table it is what names the entry a page belongs to (`replace-emdash.mjs` `hooksOf`), a page like `/`
 * having no slug to name it by.
 *
 * Writes exactly one line: `TRACY_EMDASH_INDEX {served, locales, rows, menus, terms, settings, patterns,
 * missing, calls, ms}` · `TRACY_EMDASH_ERR <SITE|TOOL|DEADLINE|REFUSED> <why>` · `TRACY_MCP_ERR
 * NO_TOKEN …`.
 */
export const EMDASH_INDEX_SCRIPT = `${MCP_TOKEN_PRELUDE}${EMDASH_RPC}${String.raw`
const ALLOW=new Set(${JSON.stringify(EMDASH_INDEX_TOOLS)});
const call=(name,args)=>ALLOW.has(name)?rpc(name,args):Promise.reject(E("REFUSED",name+" is not a read"));
const pool=async(tasks)=>{const res=new Array(tasks.length);let k=0;const run=async()=>{while(k<tasks.length){const i=k++;res[i]=await tasks[i]()}};await Promise.all(Array.from({length:Math.min(${EMDASH_INDEX_PARALLEL},tasks.length)},run));return res};
const next=(j)=>j&&typeof j.nextCursor==="string"&&j.nextCursor!==""?j.nextCursor:null;
const itemsOf=(j)=>j&&Array.isArray(j.items)?j.items:[];
const listAll=async(args)=>{const items=[];let cursor=null;for(let p=0;p<50;p++){const a=Object.assign({},args,{limit:100});if(cursor)a.cursor=cursor;const j=await call("content_list",a);for(const x of itemsOf(j))items.push(x);cursor=next(j);if(!cursor)break}return items};
const opt=(v)=>v===undefined?null:v;
const gone=(e)=>!!e&&e.kind==="TOOL"&&/^[a-z_]+: \[(?:COLLECTION_)?NOT_FOUND\]/.test(String(e.message));
const row=(c,x)=>({collection:c,id:x.id,slug:x.slug,locale:opt(x.locale),status:x.status,version:opt(x.version),updatedAt:opt(x.updatedAt),liveRevisionId:opt(x.liveRevisionId),draftRevisionId:opt(x.draftRevisionId),translationGroup:opt(x.translationGroup),data:x.data});
const names=(v,re,what)=>{if(v==null)return null;if(!Array.isArray(v)||v.length>200||!v.every((s)=>typeof s==="string"&&re.test(s)))throw E("REFUSED",what+" must be a list of names");return v};
const main=async(q)=>{
const locs=names(q.locales,LOC,"locales"),cols=names(q.collections,SLUG,"collections");
const menus=q.menus===false?false:q.menus==null||q.menus===true?true:names(q.menus,NAME,"menus");
let served=null,siteRows=null;
try{siteRows=await listAll({collection:"site",status:"published"});served=[...new Set(siteRows.map((x)=>x.locale).filter((l)=>typeof l==="string"))].sort()}catch(e){if(!gone(e))throw e}
const locales=locs||served||[];
const scopes=locales.length?locales:[null];
let collections=cols;const patterns={};
{const s=await call("schema_list_collections",{});const all=itemsOf(s).filter((x)=>x&&typeof x.slug==="string"&&SLUG.test(x.slug));for(const x of all)patterns[x.slug]=typeof x.urlPattern==="string"?x.urlPattern:null;if(!collections)collections=all.map((x)=>x.slug)}
const tasks=[],missing=new Set();
for(const c of collections)for(const l of scopes){
if(c==="site"&&siteRows&&l!==null){tasks.push(async()=>siteRows.filter((x)=>x.locale===l).map((x)=>row(c,x)));continue}
tasks.push(async()=>{try{return(await listAll(l===null?{collection:c,status:"published"}:{collection:c,locale:l,status:"published"})).map((x)=>row(c,x))}catch(e){if(!gone(e))throw e;missing.add(c);return[]}})}
const rows=[].concat(...(await pool(tasks)));
const menuOut=[];
if(menus!==false){const mt=[];for(const l of scopes){let list=menus===true?null:menus;
if(list===null){const ml=await call("menu_list",l===null?{}:{locale:l});list=(Array.isArray(ml)?ml:itemsOf(ml)).map((m)=>m&&m.name).filter((n)=>typeof n==="string"&&NAME.test(n))}
for(const n of [...new Set(list)])mt.push(async()=>{let m;try{m=await call("menu_get",l===null?{name:n}:{name:n,locale:l})}catch(e){if(!gone(e))throw e;missing.add("menu "+n);return null}return{name:n,locale:l===null?opt(m&&m.locale):l,items:itemsOf(m)}})}
for(const m of await pool(mt))if(m)menuOut.push(m)}
const terms=[];
if(q.terms===true){const tt=[];for(const l of scopes){const d=await call("taxonomy_list",l===null?{}:{locale:l});const defs=Array.isArray(d)?d:d&&Array.isArray(d.taxonomies)?d.taxonomies:itemsOf(d);
for(const n of [...new Set(defs.map((x)=>x&&x.name).filter((x)=>typeof x==="string"&&NAME.test(x)))])tt.push(async()=>{const got=[];let cursor=null;for(let p=0;p<10;p++){const a={taxonomy:n,limit:100};if(l!==null)a.locale=l;if(cursor)a.cursor=cursor;const j=await call("taxonomy_list_terms",a);for(const x of itemsOf(j))if(x&&typeof x.label==="string")got.push({taxonomy:n,slug:x.slug,locale:l===null?opt(x.locale):l,label:x.label});cursor=next(j);if(!cursor)break}return got})}
for(const g of await pool(tt))for(const x of g)terms.push(x)}
let settings=null;
if(q.settings===true){const s=await call("settings_get",{});settings={title:s&&typeof s.title==="string"?s.title:null,tagline:s&&typeof s.tagline==="string"?s.tagline:null}}
out("TRACY_EMDASH_INDEX "+JSON.stringify({served,locales,rows,menus:menuOut,terms,settings,patterns,missing:[...missing],calls,ms:Date.now()-T0}))};
let b="";process.stdin.on("data",(d)=>{b+=d});process.stdin.on("end",()=>{
timer=setTimeout(()=>out("TRACY_EMDASH_ERR DEADLINE the index ran past "+LIMIT+" ms"),Math.max(1,left()));
let q=null;try{q=JSON.parse(b||"{}")}catch(e){}
if(!q||typeof q!=="object"||Array.isArray(q)){out("TRACY_EMDASH_ERR REFUSED the request is not a JSON object");return}
main(q).catch((e)=>out("TRACY_EMDASH_ERR "+((e&&e.kind)||"SITE")+" "+String((e&&e.message)||e).slice(0,300)))});
`}`

/**
 * The replace job's WRITE: the ops the host planned, in order, stopping at the first that fails —
 * run AS ROOT like {@link MCP_SCRIPT}, with the same token custody.
 *
 * 🔒 EACH OP IS CHECKED BEFORE THE FIRST CALL, NOT AS IT COMES. The tool must be one of
 * {@link EMDASH_WRITE_TOOLS}, and each op's own rules hold: a `content_update` names the entry by its
 * ULID (a slug resolves to the first locale alphabetically — `af` — on a many-language site, measured
 * 24/09), carries a non-empty `_rev`, publishes (`status:"published"` — never `"draft"`, which
 * unpublishes a live entry) and no key outside {collection, id, locale, _rev, data, status}; a
 * `menu_set_items` carries a locale and the sha256 of the items the plan was built on; a
 * `settings_update` sets only `title`/`tagline`. One bad op refuses the whole run with nothing sent.
 *
 * 🔒 A WRITE IS NEVER STARTED LATE, AND ONE CUT SHORT IS SAID. With less than
 * {@link EMDASH_WRITE_MIN_LEFT_MS} left the run stops BETWEEN ops (`deadline:true`, the rest never
 * sent); an op whose answer never came (a fetch that failed or aborted after it was sent) is reported
 * as `inFlight` — its outcome is unknown, and the host says so instead of guessing. A menu's own
 * pre-read that fails is `SITE …` (nothing of that op was sent), one that finds another menu is
 * `MENU_CHANGED …`. No page GET here (D2): the proof is the host's `fetchPageHtml` after the run.
 *
 * stdin: `{ops: [{tool, args, menuHash?}]}`. Writes exactly one line: `TRACY_EMDASH_WRITE {results:
 * [{i, ok, error?, revFormula?}], inFlight, deadline, lost?, ms}` · `TRACY_EMDASH_ERR REFUSED <why>` ·
 * `TRACY_MCP_ERR NO_TOKEN …`. `revFormula` is EmDash's own `_rev` checked against `revOf`'s formula
 * (base64 of `<version>:<updatedAt>`), so the host learns the day it stops holding.
 */
export const EMDASH_WRITE_SCRIPT = `${MCP_TOKEN_PRELUDE}${EMDASH_RPC}${String.raw`
const ALLOW=new Set(${JSON.stringify(EMDASH_WRITE_TOOLS)});
const call=(name,args)=>ALLOW.has(name)?rpc(name,args):Promise.reject(E("REFUSED",name+" is not a write this job makes"));
const ULID=/^[0-9A-HJKMNP-TV-Z]{26}$/,HASH=/^[0-9a-f]{64}$/;
const plain=(v)=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const only=(o,keys)=>Object.keys(o).every((k)=>keys.indexOf(k)!==-1);
const check=(op)=>{
if(!plain(op)||!only(op,["tool","args","menuHash"]))return "an op is {tool, args, menuHash?}";
if(typeof op.tool!=="string"||!ALLOW.has(op.tool))return String(op.tool).slice(0,40)+" is not a write this job makes";
const a=op.args;if(!plain(a))return "args must be an object";
if(op.tool==="content_update"){
if(!only(a,["collection","id","locale","_rev","data","status"]))return "content_update takes collection, id, locale, _rev, data, status";
if(typeof a.collection!=="string"||!SLUG.test(a.collection))return "collection is not a collection name";
if(typeof a.id!=="string"||!ULID.test(a.id))return "id must be the entry's ULID, never a slug";
if(a.locale!==undefined&&(typeof a.locale!=="string"||!LOC.test(a.locale)))return "locale is not a locale";
if(typeof a._rev!=="string"||a._rev==="")return "_rev is missing";
if(a.status!=="published")return "status must be published";
if(!plain(a.data)||Object.keys(a.data).length===0)return "data must name the fields changed";
return op.menuHash===undefined?null:"menuHash belongs to a menu"}
if(op.tool==="menu_set_items"){
if(!only(a,["name","locale","items"]))return "menu_set_items takes name, locale, items";
if(typeof a.name!=="string"||!NAME.test(a.name))return "name is not a menu name";
if(typeof a.locale!=="string"||!LOC.test(a.locale))return "a menu is written in one locale";
if(!Array.isArray(a.items))return "items must be a list";
return typeof op.menuHash==="string"&&HASH.test(op.menuHash)?null:"menuHash is missing"}
if(Object.keys(a).length===0||!only(a,["title","tagline"])||!Object.keys(a).every((k)=>typeof a[k]==="string"))return "settings_update takes title or tagline";
return op.menuHash===undefined?null:"menuHash belongs to a menu"};
const hashOf=(items)=>require("crypto").createHash("sha256").update(JSON.stringify(items)).digest("hex");
const main=async(q)=>{
const ops=q.ops;
if(!Array.isArray(ops)||ops.length===0||ops.length>${EMDASH_WRITE_MAX_OPS}){out("TRACY_EMDASH_ERR REFUSED ops must be a list of 1 to ${EMDASH_WRITE_MAX_OPS}");return}
for(let i=0;i<ops.length;i++){const why=check(ops[i]);if(why){out("TRACY_EMDASH_ERR REFUSED op "+i+": "+why);return}}
const results=[];let inFlight=null,stopped=false;
const line=(extra)=>"TRACY_EMDASH_WRITE "+JSON.stringify(Object.assign({results,inFlight,deadline:stopped,ms:Date.now()-T0},extra||{}));
timer=setTimeout(()=>out(line({deadline:true})),Math.max(1,left()));
for(let i=0;i<ops.length;i++){
if(left()<${EMDASH_WRITE_MIN_LEFT_MS}){stopped=true;break}
const op=ops[i];
if(op.tool==="menu_set_items"){let cur;try{cur=await rpc("menu_get",{name:op.args.name,locale:op.args.locale})}catch(e){results.push({i,ok:false,error:(e&&e.kind==="TOOL"?"MENU_CHANGED ":"SITE ")+String((e&&e.message)||e).slice(0,200)});break}
if(hashOf(cur&&Array.isArray(cur.items)?cur.items:[])!==op.menuHash){results.push({i,ok:false,error:"MENU_CHANGED the menu changed since it was read"});break}}
inFlight=i;let r;
try{r=await call(op.tool,op.args)}catch(e){if(e&&e.kind==="TOOL"){inFlight=null;results.push({i,ok:false,error:String(e.message).slice(0,300)});break}
out(line({lost:String((e&&e.message)||e).slice(0,200)}));return}
inFlight=null;const res={i,ok:true};const item=r&&r.item;
if(op.tool==="content_update"&&item&&typeof item.version==="number"&&typeof item.updatedAt==="string"&&r&&typeof r._rev==="string")res.revFormula=Buffer.from(item.version+":"+item.updatedAt,"utf8").toString("base64")===r._rev;
results.push(res)}
out(line())};
let b="";process.stdin.on("data",(d)=>{b+=d});process.stdin.on("end",()=>{
let q=null;try{q=JSON.parse(b||"{}")}catch(e){}
if(!q||typeof q!=="object"||Array.isArray(q)){out("TRACY_EMDASH_ERR REFUSED the request is not a JSON object");return}
main(q).catch((e)=>out("TRACY_EMDASH_ERR "+((e&&e.kind)||"SITE")+" "+String((e&&e.message)||e).slice(0,300)))});
`}`

/** @param {string} container */
function checkedContainer(container) {
  if (!/^[a-z0-9][a-z0-9-]*-web-1$/.test(String(container)))
    throw new TypeError('emdash script argv: container is not a site web container')
  return container
}

/**
 * The docker sub-argv for the INDEX script: the container's node AS ROOT (`-u 0`, the token reader),
 * `-i` for the request on stdin. The container is checked like {@link fetchArgv}'s.
 * @param {{ container: string }} input
 */
export function emdashIndexArgv({ container }) {
  return ['exec', '-i', '-u', '0', checkedContainer(container), 'node', '-e', EMDASH_INDEX_SCRIPT]
}

/**
 * The docker sub-argv for the WRITE script, as {@link emdashIndexArgv}.
 * @param {{ container: string }} input
 */
export function emdashWriteArgv({ container }) {
  return ['exec', '-i', '-u', '0', checkedContainer(container), 'node', '-e', EMDASH_WRITE_SCRIPT]
}

/**
 * @typedef {{ ok: true, value: Record<string, unknown> }
 *   | { ok: false, kind: 'no-token' | 'site' | 'tool' | 'deadline' | 'refused' | 'cut' | 'transport' | 'stopped',
 *     error: string }
 *   | { ok: false, kind: 'busy', error: string, answer: Record<string, unknown> }} EmdashScriptResult
 *   `no-token`: the script stopped at the prelude, before any call. `site`/`tool`/`deadline`/
 *   `refused`: the script's own `TRACY_EMDASH_ERR` line. `cut`: its line did not parse (a killed
 *   exec). `transport`: no line at all (docker's own words, or nothing). `stopped`: the exec never
 *   started, because the customer stopped the turn (`replace-emdash.mjs` `emdashScriptRoad`). `busy`: the
 *   exec never started, because another conversation holds the site's write lease; `answer` is that
 *   refusal as the lease door gave it (`index.ts` `emdashWriteLease`, review Q1).
 */

/**
 * @param {unknown} stdout
 * @param {string} head
 * @returns {EmdashScriptResult}
 */
function parseEmdashLine(stdout, head) {
  const s = String(stdout ?? '')
  if (s.startsWith('TRACY_MCP_ERR ')) {
    const got = parseMcpExec(s)
    return got.ok
      ? { ok: false, kind: 'transport', error: 'the script wrote an MCP line' }
      : { ok: false, kind: got.kind, error: got.error }
  }
  if (s.startsWith('TRACY_EMDASH_ERR ')) {
    const rest = s.slice('TRACY_EMDASH_ERR '.length).trim()
    const word = rest.split(/\s/)[0]
    const kinds = /** @type {const} */ ({
      SITE: 'site',
      TOOL: 'tool',
      DEADLINE: 'deadline',
      REFUSED: 'refused'
    })
    const kind = kinds[/** @type {keyof typeof kinds} */ (word)] ?? 'site'
    return {
      ok: false,
      kind,
      error: rest.slice(word in kinds ? word.length : 0).trim() || 'the script refused'
    }
  }
  if (s.startsWith(head)) {
    try {
      const value = JSON.parse(s.slice(head.length))
      if (value && typeof value === 'object' && !Array.isArray(value)) return { ok: true, value }
    } catch {}
    return { ok: false, kind: 'cut', error: 'the answer ended before its line was whole' }
  }
  return { ok: false, kind: 'transport', error: s.trim().slice(0, 200) || 'the site container wrote nothing' }
}

/**
 * Parse the INDEX script's one line.
 * @param {unknown} stdout
 */
export function parseEmdashIndex(stdout) {
  return parseEmdashLine(stdout, 'TRACY_EMDASH_INDEX ')
}

/**
 * Parse the WRITE script's one line.
 * @param {unknown} stdout
 */
export function parseEmdashWrite(stdout) {
  return parseEmdashLine(stdout, 'TRACY_EMDASH_WRITE ')
}

/**
 * Did the exec fail because the program is not in the container (a missing browser), rather than
 * because the program ran and errored? `docker exec` reports an absent binary as exit 126/127 with a
 * matching message. Read at runtime, never `existsSync` on dsh — the browser lives in the container.
 *
 * 🔒 THE DOCKER CLI PRINTS THIS ONE ON STDOUT. Measured in r2 (24/09/2026, `j-1ibzqi` C00): the probe
 * exec came back with `OCI runtime exec failed: … exec: "node": executable file not found in $PATH`
 * as its STDOUT, so a check of stderr alone read a missing program as a site that "did not answer"
 * and the agent was told to check the site was running (70 such calls). Stdout is read only at its
 * very START, where docker writes that line: every real answer begins with `HTTP/`, `TRACY_PROBE`
 * or `TRACY_BROWSER`, so a page whose own words mention an OCI error can never trip it.
 * @param {{ code: number | null, stdout?: string, stderr: string, spawnError?: string }} result
 * @returns {boolean}
 */
export function looksLikeMissingBinary(result) {
  if (result.code === 126 || result.code === 127) return true
  if (
    /^\s*OCI runtime exec failed\b[^\n]*(?:executable file not found|no such file or directory)/i.test(
      result.stdout ?? ''
    )
  )
    return true
  const text = `${result.stderr ?? ''} ${result.spawnError ?? ''}`.toLowerCase()
  return (
    text.includes('executable file not found') ||
    text.includes('no such file or directory') ||
    /\bnot found\b/.test(text)
  )
}

/**
 * The one impure runner: run a docker sub-argv, feeding stdin when given. On the fleet the daemon is
 * the socket proxy named by `TRACY_DOCKER_HOST`; locally it is the default. This is what
 * `config.exec` replaces in a test.
 * @param {{ argv: readonly string[], stdin?: string, timeoutMs: number, maxBuffer: number }} input
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string, timedOut: boolean, spawnError?: string }>}
 */
export function dockerExec({ argv, stdin, timeoutMs, maxBuffer }) {
  const dockerHost = resolveDockerHost(undefined, process.env)
  const [cmd, args] = dockerHost
    ? ['env', [`DOCKER_HOST=${dockerHost}`, 'docker', ...argv]]
    : ['docker', [...argv]]
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout: timeoutMs, maxBuffer }, (error, stdout, stderr) => {
      resolve({
        code: error && typeof error.code === 'number' ? error.code : error ? null : 0,
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? ''),
        timedOut: Boolean(error && error.killed),
        spawnError:
          error && typeof error.code !== 'number' && !error.killed
            ? String(error.message).split('\n')[0]
            : undefined
      })
    })
    if (stdin !== undefined && child.stdin) {
      // The child can exit before it reads stdin — the MCP script does exactly that on a missing or
      // malformed token (it writes NO_TOKEN and `process.exit(0)`). Writing to a closed pipe then
      // raises EPIPE on this stream; unhandled, that 'error' event would take dsh down. Swallow it —
      // the child's own stdout is the result, and a body it never read changes nothing.
      child.stdin.on('error', () => {})
      child.stdin.end(stdin)
    }
  })
}
