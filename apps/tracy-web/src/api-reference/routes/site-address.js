/**
 * Route docs for what tracy-web answers on a CUSTOMER SITE'S OWN hostname — see ./index.js for the
 * entry shape. Filled from `src/bar/route.js` (the one `app.all('/*')` handler mounted for every Host
 * that is not Tracy's own) and the files it calls: `bar/site-proxy.js`, `bar/preview.js`, `bar/badge.js`.
 *
 * ⚠ These are NOT Hono-registered routes: Hono sees a single catch-all, and the handler tells the
 * paths below apart by reading `url.pathname` itself. That is why paths here use the OpenAPI form
 * (`/{path}`) rather than Hono's (`/:path`), and why the coordinator's route-coverage test
 * (`test/api-reference.test.mjs`) excludes this list instead of comparing it with `app.routes`.
 */

/** One paragraph for the reference: where these paths answer. */
export const SITE_ADDRESS_NOTE =
  'The paths in this group answer on `https://<site address>/…` — a customer site’s own hostname, either ' +
  'a managed address under the site domain (`<label>.<site domain>`) or an address the owner connected — ' +
  'never on Tracy’s own address. A request whose hostname names no site answers a plain `404 Not found`; ' +
  'a hostname under the site domain whose label names no site answers an HTML 404 page; and when the ' +
  'site database is not configured a managed address answers `501 { code: "SITE_BOOK_UNAVAILABLE" }`. Tracy ' +
  'decides nothing here about who may read a site: it forwards the request to the site, adds its badge, ' +
  'and tells the site who is viewing. Signing in happens on Tracy’s own address only.'

const ANY_PATH = { path: { path: 'Any path on the site, with its query string.' } }

/** @type {import('./index.js').RouteDoc[]} */
export const SITE_ADDRESS_ROUTES = [
  {
    method: 'GET',
    path: '/__tracy/address-probe',
    summary: 'Confirm that an address being connected reaches this deployment',
    description:
      'Called by Tracy itself while an owner changes a site’s address: before the new name is made ' +
      'active, Tracy asks `/__tracy/address-probe` on that name with the header `x-tracy-address-probe` ' +
      'set to the change’s one-time token. When the hostname is an address in the `applying` state and ' +
      'the header equals its token, the answer is the token itself as plain text (`cache-control: ' +
      'no-store`), which proves the name routes here. A demo site echoes the header the same way: before ' +
      'a demo is reported live, Tracy asks this path on its public name and fails the install with ' +
      '`ADDRESS_SHADOWED` when the token does not come back. Any other request to this path falls through to ' +
      'the normal handling and answers 404.',
    audience: ['fleet'],
    auth: 'token',
    internal: true,
    answers: 'The probe token, as plain text'
  },
  {
    method: 'GET',
    path: '/robots.txt',
    summary: 'Keep crawlers off a site that is not published',
    description:
      'While the site is not published, Tracy answers this path itself with a policy that disallows ' +
      'every path and asks for no search, AI input or AI training (`Content-Signal: search=no, ' +
      'ai-input=no, ai-train=no`), never cached. This is a request to crawlers, not a lock. Once the ' +
      'site is published, the request goes to the site like any other and its own `robots.txt` answers, ' +
      'also never cached, so a site taken back to draft stops being announced at once.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    answers: 'Plain text'
  },
  {
    method: 'GET',
    path: '/__tracy/errors',
    summary: 'Read the errors recently reported from this site’s pages',
    description:
      'The browser errors the site’s pages reported through `POST /__tracy/errors`, newest kept in a ' +
      'bounded ring: `{ events: [{ tier, source, message, level, at }] }`. Needs a Tracy session cookie ' +
      '(`tracy_sess`) whose person holds a live seat on this site (accepted, not revoked; any role). ' +
      'Without a session the answer is 401 `sign in first`; signed in without a seat here, 403 `no seat ' +
      'on this site`, the same whether or not any errors are held.',
    audience: ['team', 'agent'],
    auth: 'session',
    internal: true,
    answers: '`{ events }` as JSON'
  },
  {
    method: 'POST',
    path: '/__tracy/errors',
    summary: 'Report errors that happened in a page of this site',
    description:
      'A page of the site reports what broke in the browser. No signature, since a page cannot hold ' +
      'one; the door is bounded instead: a body over 64 KB answers 413, at most 50 events are kept per ' +
      'report, each message is cut to 2,000 characters, and only `message`, `level` (`error`, `warn` or ' +
      '`fatal`) and `source` survive. The time is stamped by Tracy, not the page. Answers 204 whether or ' +
      'not anything was kept; 400 when the body is not JSON.',
    audience: ['site'],
    auth: 'none',
    internal: true,
    body: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              message: { type: 'string', maxLength: 2000 },
              level: { type: 'string', enum: ['error', 'warn', 'fatal'] },
              source: { type: 'string', maxLength: 300 }
            },
            required: ['message']
          }
        }
      }
    },
    answers: '204, no body'
  },
  {
    method: 'GET',
    path: '/__tracy/{path}',
    summary: 'Any other Tracy path on a site address',
    description:
      'Every other path under `/__tracy` belongs to Tracy, not to the site, and is never forwarded to ' +
      'the site. None exists: the answer is an HTML 404 page. The sign-in, sign-in-with-provider and ' +
      'team paths that used to live here were removed; signing in happens on Tracy’s own address.',
    audience: ['public'],
    auth: 'none',
    internal: true,
    params: { path: { path: 'Any path under `/__tracy/` other than `build` and `errors`.' } },
    answers: '404 HTML page'
  },
  {
    method: 'GET',
    path: '/{path}',
    summary: 'Open the site itself',
    description:
      'Every other request, with any method, is forwarded to the site’s own container and its answer ' +
      'is returned; Tracy gates nothing, so anyone who knows the address can read the site and reach ' +
      'its CMS login.\n\n' +
      '**A published site with a connected domain of its own** is shown to the public there: a GET or ' +
      'HEAD on its Tracy address from a viewer who holds no seat on the site answers `301` to ' +
      '`https://<own domain>` with the same path and query, and `cache-control: no-store`; the site is ' +
      'not asked. With several connected domains it is the one connected first; connecting or removing a ' +
      'domain takes effect here within a minute. Not ' +
      'redirected, and forwarded as below: a seat holder; any other method; a request with an ' +
      '`Authorization` header; the CMS back office and sign-in (`/wp-admin/` except `admin-ajax.php` ' +
      'and `admin-post.php`, `/wp-login.php`, `/wp-json/` and `?rest_route=` on WordPress; ' +
      '`/administrator/` and `/api/` on Joomla; `/_emdash/` on EmDash); and the Design system preview: ' +
      'a GET with `tracy_ds_preview` that is a frame (`Sec-Fetch-Dest: iframe`) or carries no ' +
      '`Sec-Fetch-Dest`. Every answer to a GET with `tracy_ds_preview` carries `x-robots-tag: noindex, ' +
      'nofollow`, published or not. Such a frame whose `tracy_ds_preview` is a ticket the Design system preview door (`live=1`) signed for this site is the page asked as nobody, wearing the system the ticket names, with no badge, `no-store`, and one inline Tracy script that keeps the ticket on same-site links, tells Tracy’s origin the page’s address and takes a Light/Dark choice from it; a redirect such a frame is answered to the same site keeps the ticket on its `Location`; any other value is the page as it is.\n\n' +
      '**On the way in**, Tracy removes every Tracy cookie and any `x-tracy-email`, `x-tracy-edge`, ' +
      '`x-tracy-tier`, `x-tracy-role` or `x-tracy-preview` header the client sent, then sets its own: ' +
      '`x-forwarded-host` (the address the browser used) and `x-forwarded-proto` (the scheme the ' +
      'browser used) always; `x-tracy-email` only when the viewer has a Tracy session **and** holds a ' +
      'seat on this site (on a site served from another host the same email travels as `x-tracy-edge`); ' +
      'and, on the same host, `x-tracy-role: <seat role>` with `x-tracy-tier: editor` for an owner or ' +
      'editor seat, which the site’s Tracy Access plugin uses to open a CMS backend session (an owner ' +
      'as the CMS administrator), or `x-tracy-tier: viewer` for a viewer seat, which keeps the person ' +
      'on the front end.\n\n' +
      '**On the way out**, redirects and `Link` headers that name the container are rewritten to the ' +
      'site address; `frame-ancestors` for Tracy’s origin is added (and `X-Frame-Options` dropped) ' +
      'when the site declares no `frame-ancestors`; a 301 or 308 gets `cache-control: no-store`; and ' +
      'an unreachable site answers a 502 page.\n\n' +
      '**Badge.** On a GET that returns HTML with a `</body>`, a script tag goes in before it: the seat ' +
      'badge (`/badge.js`, with the viewer’s email only when they hold a seat) on a customer site, the ' +
      'Tracy badge (`/tracy-badge.js`, opening the demo’s own template) on a demo, and nothing on a ' +
      'demo installed without a badge. A site that is not published also gets `x-robots-tag: noindex, ' +
      'nofollow`.\n\n' +
      '**Comment picker preview ticket** (only when `TRACY_COMMENT_PICKER=1`). The `tracy_preview` query ' +
      'parameter is removed before the site is asked. On a GET the browser marks as an iframe navigation ' +
      '(`Sec-Fetch-Dest: iframe`), a ticket signed for this site, naming an allowed parent origin, ' +
      'matching the viewer’s session and seat, whose role may edit content, and not used before is ' +
      'redeemed: the answer is a 303 back to the same address without the ticket, setting the ' +
      'cookie `__Host-tracy_pv` (`tracy_pv` over plain HTTP), which lapses with the viewer’s session. ' +
      'A later picker load under a session renewed since then sets it again with the new expiry. ' +
      'While that cookie still holds ' +
      'for the same seat, the site is told `x-tracy-preview: pick`, the page gets the comment picker ' +
      'script, and the answer carries `cache-control: private, no-store`, `vary: Cookie`, ' +
      '`referrer-policy: no-referrer` and a second CSP allowing only that parent to frame it. Any other ' +
      'iframe navigation gets, instead of the picker, the same script told only to tell Tracy’s own ' +
      'origin the page’s address (`data-report-origin`), so the Browser tab follows a link opened inside ' +
      'the page; no header changes with it.',
    audience: ['public', 'customer', 'site'],
    auth: 'none',
    internal: false,
    params: {
      ...ANY_PATH,
      query: { tracy_preview: 'Optional comment picker ticket; removed before the site sees the request.' }
    },
    answers: '301 to the own domain (above), or whatever the site answers, with the changes above'
  }
]
