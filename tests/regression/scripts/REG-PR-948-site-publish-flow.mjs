/**
 * REG-PR-948-site-publish-flow: publishing a site at its Tracy address and, since part 2, on a
 * domain of the customer's own. Runs the case's steps: S1 the suites that need no database
 * (TEST_DATABASE_URL removed, as the case says), S2 the door suites against TEST_DATABASE_URL, then
 * S3 and S4: every test the case names by its tag reports `ok`.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()

// S4: tag and the start of the test's name, read in the output of S1.
const WITHOUT_DATABASE = [
  ['HOSTGUARD', 'one go-live per site: a second call while the first runs is refused GO_LIVE_BUSY'],
  ['HOSTBODY', 'every malformed body is refused 400 before a job exists'],
  ['JOBKEY', 'the same job key names the same job'],
  ['RERUN', 'a record that is no outcome is run again under the same key'],
  ['SCRIPTSTEPS', 'go-live.sh: a required step that fails ends the script non-zero'],
  ['SCRIPTAPACHE', 'go-live.sh: Apache that takes neither a reload nor a restart'],
  ['FIREWALLREAD', 'go-live.sh: a firewall chain that cannot be READ ends the script'],
  ['GOLIVELOCK', 'go-live.sh beside another go-live of the same site ends at once with 75'],
  ['SNAPSHOTORDER', 'the address and the admin link come from the snapshot taken AFTER the CMS answered'],
  ['EDITOR', 'Editor and Developer: the state is shown, with no action at all'],
  ['RELOAD', 'reload in the middle of a publish: the tab opens on the running state'],
  ['DOUBLE', 'a double click sends one request'],
  ['UNREAD', 'the door took the press but the state after it cannot be read'],
  ['WAITING', 'an operation the host has not confirmed: one line says the server is being waited for'],
  ['SITESWITCH', 'another site picked while a quiet re-read of the first is pending'],
  ['OTHERSITE', 'an answer that names another site is not this site'],
  ['DIALOG', 'Back to draft says what really changes at a Tracy address'],
  ['OTHERTAB', 'a site published in ANOTHER browser tab'],
  ['UNOBSERVED', 'a run that threw with its script still at work is no outcome'],
  ['STORELOST', 'an ending the job store could not write is no outcome either'],
  ['FIREWALLCHECK', 'go-live.sh live: a firewall check that could not be made is not "no rule"'],
  ['ROWPUBLISHING', 'while a publish runs on a site its row reads Publishing…'],
  ['LISTORDER', 'two reads of the list answered in reverse order'],
  ['NAMELESS', 'a snapshot that does not name its site is never drawn'],
  ['REFUSALLIST', 'every refusal this door gives is on the web door'],
  [
    'KEYFIRST',
    'a key the host has taken is answered with its job BEFORE the folder, the configuration or the request are checked'
  ],
  ['TAKENSAID', 'a taken key whose record is no outcome, on a host that cannot run it again'],
  ['KEYTURN', 'two asks for one key that arrive together with the folder vanishing between them'],
  ['STOREUNREAD', 'a job store that cannot be READ is not "never taken"'],
  ['MARKED', 'a key the host took, whose record is then lost, on a host that has changed'],
  ['MARKFIRST', 'the mark is on disk before the record is written'],
  ['MARKFAIL', 'a mark that cannot be written: the key is NOT taken'],
  ['MARKUNKNOWN', 'a mark that cannot be LOOKED AT is neither yes nor no'],
  ['NOMARK', 'no mark and no record: the key was never taken'],
  // Part 2 (the site's own domain, a signal that is no exit code, cleanups asked for again).
  ['NOTUNNEL', 'no tunnel configuration: publish and back to draft at the Tracy address still run'],
  ['TUNNELONLY', 'no tunnel configuration: only an ask that NAMES a domain is refused 501'],
  ['SIGNAL', 'a run that a signal, a time limit or a failed start ended is NOT the script failing'],
  ['SIGNALREAL', 'end to end with the real runner: a go-live script killed by a signal'],
  ['RUNSIGNAL', 'runScript: a child ended by a signal has NO exit code'],
  ['ATTEMPT', 'a cleanup that failed is run again under its own key only when the next attempt is asked for'],
  ['DROPJOB', 'drop-domain is a job like any other go-live'],
  ['TARGETDOOR', 'POST /_host/routing-target: the tunnel'],
  ['LEDGER', 'go-live.sh: a record of domains that cannot be trusted is NOT "no domains"'],
  ['DRAFTPARTIAL', 'go-live.sh draft: the names it is given AND the ones on record leave the tunnel'],
  ['DROPSCRIPT', 'go-live.sh drop-domain: one domain out of the tunnel and off the record'],
  ['INGRESSBACK', 'ingress_api.py: a write the provider says succeeded but does not show is a failure'],
  ['INGRESSANSWERS', 'ingress_api.py: every answer that is not the provider saying "success"'],
  ['ONLYPORT', 'ingress_api.py --only-port'],
  ['EVENTOP', 'the operation moving is told to the rest of the page'],
  ['EVENTFAIL', 'a publish that FAILED is told too'],
  ['DOMSTATES', 'every state of an own domain has its screen'],
  ['DOMRECORDS', 'each record says what to create and what the last lookup found there'],
  ['NOINFER', 'nothing reads verified by inference'],
  ['DOMROLES', 'a seat that is not the Owner sees the domain and its state'],
  // The review of part 2: what a script may say, open or take over.
  ['BOTHHALVES', 'go-live.sh: a domain is said to be out only when its rule AND its place on the record are'],
  ['LEDGERWRITE', 'go-live.sh: the record is never written through what was put beside it or under its name'],
  ['LOCKKINDS', 'go-live.sh: a lock that cannot be taken'],
  ['ADDOWNED', 'ingress_api.py: an add never takes over a rule that leads to another port'],
  ['SHORTANSWER', 'ingress_api.py: an answer that does not SHOW the list of rules is not an empty list'],
  ['INGRESSLOCK', 'ingress_api.py: an API base that is not an http(s) address, or a lock that is a link'],
  ['TEARDOWNKEYED', 'teardown through this door is an operation like the others'],
  ['ROWDELETING', 'while a publish runs the chip reads Publishing…'],
  // The review after #988: a bare domain, a reservation that lapsed, on the screen.
  ['DOMAPEX', 'a bare domain typed into Connect domain is refused under the field'],
  ['DOMAPEXLEGACY', 'a bare domain reserved before it was refused: the card says why'],
  ['DOMLAPSED', 'a pending domain says until when it holds its name'],
  ['DOMLAPSEDREMOVE', 'Remove on a lapsed reservation clears its notice'],
  ['PARSELAPSED', 'a lapsed reservation is read only from the lapsed list'],
  ['PARSEAPEX', 'a pending bare domain reads `unsupported`'],
  ['DOMAPEXFAILED', 'a bare domain reserved before it was refused, whose publish failed'],
  ['DOMUNCONNECTABLE', 'a name under a suffix the server cannot tell is a registered one']
]

// S3: the same, read in the output of S2.
const WITH_DATABASE = [
  ['GUARD', 'a double click, a second tab: two presses at once start ONE job'],
  ['FLAG', 'going live: 202 with the job, the flag stays draft while the job runs'],
  ['ROLES', 'roles: Owner and Admin publish and unpublish; Developer and Editor are refused'],
  ['STRANGERS', 'nobody signed in, a seat not yet accepted, a revoked seat, a stranger'],
  ['STATEDOOR', 'the state door never moves the publish flag'],
  ['NODOMAINS', 'a request that carries `domains` is refused by name'],
  ['UNCONFIRMED', 'no answer from the host: nothing is called a success or a failure'],
  ['REASKED', 'the answer that never arrived is found by asking again'],
  ['CLOSINGLINE', 'a job the host calls done without the closing line of its script is not believed'],
  [
    'NOOUTCOME',
    'a job the host has no record of, failed because the host restarted, or ended on the site lock is NOT an ending'
  ],
  ['HELD', 'while the host cannot take the operation back'],
  ['BUSY', 'the host says another job holds this site when a publish is pressed'],
  ['SWEEP', 'the sweep hearing of a record that is no outcome does not end the operation either'],
  ['SAMEMS', 'two reservations taken in the same millisecond are two operations'],
  ['ONESNAPSHOT', 'GET /settings while the address changes and a publish ends during the CMS read'],
  ['OLDPOLL', 'job poll: a poll of an old build job after the site went live leaves the publish flag alone'],
  ['STATEKEYS', 'the state door reads every key before it writes'],
  ['ONREAD', 'an unresolved operation is resolved by the next read of the site'],
  ['LISTOP', 'GET /api/sites carries the operation under way'],
  ['FRESHREAD', 'a FRESH reservation whose door is still waiting on the host'],
  ['QUEUEDLOST', 'the host could not write `running`'],
  ['RUNNINGLOST', 'the host could not write `unobserved`'],
  ['UNVERIFIED', 'a 4xx/5xx that is not the host'],
  ['ACCEPTED', 'after the host ACCEPTED the job, no refusal ends the operation'],
  ['NOGRACE', 'a door that died after reserving: the very next look hands the reservation to the host'],
  ['LOSTACK', 'the 202 is lost and the host changes while the script runs'],
  ['TAKENHELD', 'the 202 is lost, the host restarts with the script still at work and has changed'],
  ['NEVERTAKEN', 'the ask never reached the host, and the host has changed'],
  [
    'RECORDLOST',
    'the 202 is lost, the host restarts and its record of the job is deleted, damaged or unreadable'
  ],
  ['MARKUNREAD', 'the 202 is lost and the host can no longer LOOK AT its mark for the key'],
  ['MARKWRITE', 'the host cannot write its mark for the key'],
  // Part 2 (own domain through the same operation, the background sweep).
  ['DNSREAD', 'Check DNS: each record reads what the lookup returned'],
  ['LATELOOKUP', 'a lookup that comes back after the name was removed'],
  ['BADNAMES', 'a name that is not a bare domain is refused by every door'],
  ['TOKENOWNER', 'only the Owner connects, checks or removes a domain'],
  ['CARRIED', 'going live with an own domain DNS proves'],
  ['NOTPROVEN', 'a domain DNS does not prove at the moment Publish is pressed is not carried'],
  ['HALFDONE', 'a cleanup that half succeeded is recorded as half done'],
  ['REMOVEOP', 'removing a connected domain is an operation of the site'],
  ['ONEOP', 'two presses at the same moment are one operation'],
  ['DELETEHELD', 'a site is not deleted beside an operation of its own'],
  ['SWEEPSTART', 'an operation whose door died after reserving it'],
  ['SWEEPAGE', 'no age ends, frees or drops an operation'],
  ['SWEEPBACKOFF', 'a host that cannot be reached: the operation stays held and unconfirmed'],
  ['SWEEPREPLICAS', 'two replicas sweeping at the same moment'],
  ['NOAUTORETRY', 'the sweep takes a bounded batch'],
  ['FOLLOWUPKEPT', 'a day of silence about a running job: the follow-up book does NOT give its row up'],
  // The review of part 2: a delete that takes the site, readings in order, bodies read whole.
  ['DELETETAKES', 'a delete TAKES the site before the host is asked'],
  ['DELETEFAILED', 'a teardown that FAILED, or ended without its own closing line, deletes nothing'],
  ['DELETESWEPT', 'a delete whose door is no longer there to hear it is finished with nobody on the screen'],
  [
    'DELETEMARK',
    'a process that hears the host finish a delete but cannot close the book only writes the mark'
  ],
  ['DELETEPENDING', 'DELETE /api/sites/:key: a teardown still running when the wait ends removes NOTHING'],
  ['DELETESAID', "DELETE /api/sites/:key: a teardown that failed says the script's verdict line"],
  ['DNSORDER', 'two Check DNS of one reservation that end in the other order than they began'],
  ['BODYSHAPE', 'a body that carries a field its door does not take'],
  // The review after #988: no bare domain, no name held unproven past 72 hours, a switch that closes doors.
  ['APEX', 'a bare (registrable) domain is refused by its own code'],
  ['APEXLEGACY', 'a bare domain reserved before the refusal existed is not stuck'],
  ['LAPSE', 'a reservation whose ownership was never proven stops holding the name after 72 hours'],
  ['RENEW', 'a lapsed reservation can be made again by its holder'],
  ['PROVENKEPT', 'a reservation whose ownership was proven once is never taken away by age'],
  ['LATELAPSE', 'a reading that arrives after the reservation lapsed proves nothing'],
  ['PROOFORDER', 'a Check DNS that found the TXT record and ended after a later one that did not'],
  ['PROOFLOCK', 'a Check DNS that began before the deadline and waited for the row past it'],
  ['PROOFLOCKONLY', 'a Check DNS that waits past the deadline behind a session that only LOCKED the row'],
  [
    'TAKEOVERLOCK',
    'another site reserving a name while a session that only locked it holds it past the deadline'
  ],
  ['SWEEPWAIT', 'the order reversed — a proof written before the deadline'],
  ['LEGACYNAMES', 'every name reserved before the server stopped taking it is not stuck'],
  ['LAPSESWEEP', 'the hourly sweep lets lapsed reservations go'],
  ['LAPSERACE', 'two sites taking the same lapsed name at once'],
  ['SWITCHOFF', 'with the site-connect-domain switch off'],
  ['SWITCHUNREAD', 'a switch that cannot be read opens no door'],
  ['STRICTSWITCH', 'a door that enforces a switch reads it strictly']
]

// S1: no database in the environment.
const bare = { ...process.env }
delete bare.TEST_DATABASE_URL
const s1 = nodeTest(
  [
    'apps/tracy-host/test/site-publish.test.mjs',
    'apps/tracy-host/test/run.test.mjs',
    'packages/fleet/tracy-fleet-operation/test/teardown-ingress.test.mjs',
    'apps/tracy-web/test/site-settings.test.mjs',
    'packages/core/tracy-core/test/site-publish-dom.test.mjs',
    'packages/site/tracy-my-sites/test/site-publish-dom.test.mjs',
    'packages/site/tracy-my-sites/test/more-settings.test.mjs',
    'packages/core/tracy-core/test/settings-rows.test.mjs'
  ],
  { env: bare, timeoutS: 600 }
)
c.tapClean('S1', s1)

// S2: the doors, on a PostgreSQL the run may create databases in.
const s2 = nodeTest(
  [
    'apps/tracy-web/test/site-publish.test.mjs',
    'apps/tracy-web/test/sites-route.test.mjs',
    'apps/tracy-web/test/site-address.test.mjs',
    'apps/tracy-web/test/cron.test.mjs',
    'apps/tracy-web/test/ops-ui.test.mjs'
  ],
  {
    env: { ...process.env, TEST_DATABASE_URL: db },
    timeoutS: 900
  }
)
c.tapClean('S2', s2)

for (const [tag, name] of WITH_DATABASE) c.passes(`S3 ${tag}`, s2, name)
// (S8's tags are in the two lists above, read the same way.)
for (const [tag, name] of WITHOUT_DATABASE) c.passes(`S4 ${tag}`, s1, name)
c.done()
