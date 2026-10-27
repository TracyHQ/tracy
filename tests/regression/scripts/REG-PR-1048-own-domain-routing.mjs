/**
 * REG-PR-1048-own-domain-routing: a customer's own domain is served through tracy-web, never
 * straight from the site's port, and reads connected only after Tracy opened it (#1037). Runs the
 * case's steps: S1 the suites that need no database (TEST_DATABASE_URL removed), S2 the web suites
 * against TEST_DATABASE_URL, then S3 and S4: every test the case names by its tag reports `ok`.
 * Slice 2 (Cloudflare for SaaS custom hostnames, against a stand-in API) adds the SAAS* and ZONE* tags.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()

// S4: tag and the start of the test's name, read in the output of S1.
const WITHOUT_DATABASE = [
  ['FORGED', '#1037 reproduction: forged x-tracy-* headers that reach the site unfiltered'],
  [
    'STRIPPED',
    '#1037: the same forged request on the own domain through tracy-web reaches the site with no x-tracy-* header at all'
  ],
  ['LEGACYRULE', '#1037 go-live.sh live: a site connected the old way is brought over'],
  ['ROUTEGEN', '#1037 go-live.sh: the route generation of the run reaches the tunnel script, add and remove'],
  ['WEBSERVICE', '#1037 go-live.sh: where tracy-web listens is this host'],
  ['ROUTEGENDOOR', '#1037 the go-live door: routeGen goes with an ask that names domains, as --route-gen'],
  ['INGRESSROUTE', '#1037 ingress_api.py: an own domain'],
  ['GENERATION', '#1037 ingress_api.py: the newer generation wins, whichever site it is'],
  ['RECORDUNREAD', '#1037 ingress_api.py: an owner record that cannot be read or is not one is NOT'],
  ['RECORDWRITE', '#1037 ingress_api.py: a record that cannot be written is not a route installed'],
  ['RECORDWHOLE', '#1037 ingress_api.py: ownership is the record whole'],
  [
    'SERVICECHANGE',
    '#1037 ingress_api.py: a change of service the provider refuses leaves a record that names BOTH'
  ],
  ['PORTALONE', '#1037 ingress_api.py: once a record stands for the hostname the port alone proves nothing'],
  ['TEARDOWN', '#1037 teardown.sh: the site'],
  // Slice 2: configuration of Cloudflare for SaaS and the zone names nobody's site may take.
  ['SAASCONFIG', '#1037 Cloudflare for SaaS: both of zone and token or neither'],
  ['ZONELABELS', '#1037 the zone names for own domains: connect and origin unless configured'],
  ['ZONELABEL', '#1037 zoneLabelRefusal: the configured CNAME target and fallback origin labels are reserved']
]

// S3: the same, read in the output of S2.
const WITH_DATABASE = [
  ['WHOLEBODY', '#1037: a body is read WHOLE before it is projected'],
  ['BACKOFFICE', '#1037: what is projected and what is back office'],
  ['LOCALHOSTS', '#1037: the closed list of hostnames that reach Tracy'],
  [
    'ONEURL',
    '#1037 projection: ONE complete URL value is replaced only when the URL parser says its origin is the site'
  ],
  ['SCRIPT', '#1037 projection: a script is read by a JavaScript parser'],
  ['FORMATS', '#1037 projection: JSON, CSS, srcset and XML each by their own parser'],
  [
    'COMMENT',
    '#1037 projection: a comment is read only when the parser hands it over as nothing but a source directive'
  ],
  ['HEADERS', '#1037 projection: response headers by their own formats'],
  ['HTML', '#1037 page: the page is read by the HTML parser'],
  ['INTEGRITY', '#1037 page integrity: an asset hash is removed for the site'],
  [
    'REFUSED',
    '#1037 page: what cannot be told WHOLE on the own domain is refused, never sent half in each name'
  ],
  ['STANDING', '#1037 addressStanding: the site is asked THROUGH TRACY'],
  ['PROOF', '#1037 probe: only the proof of THIS row for THIS attempt is'],
  [
    'NOTPUBLIC',
    '#1037 probe: a name that does not resolve, or resolves to an address nothing public is at, is never dialled'
  ],
  ['TLS', '#1037 probe, over a real TLS socket: only a valid certificate and this row'],
  ['NOTCONNECTED', '#1037: the host saying the rule is in does not connect a domain'],
  ['LATEPROBE', '#1037: a probe that ends late connects nothing'],
  [
    'LEGACYPENDING',
    '#1037: a site connected before routes went through tracy-web reads pending until the real domain answered through the new route'
  ],
  ['ROLLOUT', '#1037 rollout: every domain still on the old direct rule is moved by the sweep itself'],
  ['GENRISES', '#1037: every run of an operation that names domains carries a route generation of its own'],
  ['WHOLEAPP', '#1037 the whole app: every public hostname that is not Tracy'],
  // Slice 2: Cloudflare for SaaS custom hostnames (`site-domain-provider.test.mjs`, stand-in API).
  ['SAASCREATE', 'a reservation nobody proved gets no hostname; a proven one gets exactly one, made once'],
  ['SAASSTATUS', 'pending validation, certificate pending, active'],
  ['SAASCONFLICT', 'a name Cloudflare already holds for somebody else is refused, never taken over'],
  ['SAASUNCONFIRMED', 'a create whose answer never came'],
  ['SAASERRORS', 'a refused create is tried again later'],
  ['SAASDELETE', 'removed, or its site deleted: the hostname is deleted at Cloudflare'],
  ['SAASREADYDELETE', 'a READY hostname whose reservation goes is deleted on the next pass'],
  ['SAASCLAIM', 'a forced pass never takes a row another pass holds'],
  ['SAASATTEMPT', "a create's answer is written only on the row of that create (attempt)"],
  ['SAASREADINESS', 'a connected domain reads connected only while its hostname is ready as last read'],
  ['SAASCLAIMGEN', 'a pass that outlived its claim writes nothing and lets go of no later claim'],
  ['SAASRECORDSID', 'validation records that cannot be shown whole never cost a hostname its id'],
  ['SAASPROBEFRESH', 'a probe whose hostname could not be read fresh is not made and writes nothing'],
  ['SAASEXACT', 'only the exact answer to the question asked is read'],
  ['SAASLATE', 'a create answered after its reservation was removed'],
  ['SAASTOKEN', 'the token is sent only as the bearer header'],
  [
    'SAASUNAVAILABLE',
    'without Cloudflare for SaaS configured the Connect domain doors say it is not available'
  ],
  ['SAASCARD', 'the card names CNAME → connect.<zone> and the TXT proof'],
  ['SAASCONNECTED', 'connected needs the hostname AND its certificate active AND the HTTPS probe'],
  ['SAASAUTO', '#1037 slice 2: a published site connects its domain by itself'],
  ['ZONERENAME', '#1037 the zone names for own domains are no Tracy address a site can be renamed to']
]

// S1: no database in the environment.
const bare = { ...process.env }
delete bare.TEST_DATABASE_URL
const s1 = nodeTest(
  [
    'packages/fleet/tracy-fleet-operation/test/wordpress-access.test.mjs',
    'apps/tracy-host/test/site-publish.test.mjs',
    'packages/fleet/tracy-fleet-operation/test/teardown-ingress.test.mjs',
    'apps/tracy-web/test/config.test.mjs',
    'apps/tracy-web/test/label.test.mjs'
  ],
  { env: bare, timeoutS: 600 }
)
c.tapClean('S1', s1, { noSkip: false })

// S2: the proxy, the probe and the doors, on a PostgreSQL the run may create databases in.
const s2 = nodeTest(
  [
    'apps/tracy-web/test/bar.test.mjs',
    'apps/tracy-web/test/site-address.test.mjs',
    'apps/tracy-web/test/site-publish.test.mjs',
    'apps/tracy-web/test/site-domain-provider.test.mjs'
  ],
  {
    env: { ...process.env, TEST_DATABASE_URL: db },
    extra: ['--test-timeout=120000', '--test-force-exit'],
    timeoutS: 900
  }
)
c.tapClean('S2', s2, { noSkip: false })

// A named test that was skipped (no PHP for S1's first two) is not `ok`: `passes` counts it as absent.
for (const [tag, name] of WITH_DATABASE) c.passes(`S3 ${tag}`, s2, name)
for (const [tag, name] of WITHOUT_DATABASE) c.passes(`S4 ${tag}`, s1, name)
c.done()
