/**
 * The fleet's raw output → steps people can read.
 *
 * 🔒 ONLY STEPS THAT HAPPENED ARE SHOWN, no list of future steps. That is not for simplicity:
 * `baseline` only runs when the site keeps per-file history, and `address` only runs when cloudflared is
 * on the machine. A console listing every step up front would leave a permanent grey line describing work
 * nobody is waiting for. Deriving from real markers gives that filter for free — no table of "which step runs
 * for which platform", so no second table to drift from the script.
 *
 * 🔒 THE MARKERS ARE THE `==>` LINES OF `provision.sh` AND `platform/*.sh`. Change an `echo` line there and
 * forget this file, and the matching step **silently vanishes** from the console — no error, just a
 * screen that tells less. That is why each marker is a named constant, not a scattered regex.
 *
 * ⚠ THE FLEET STRIPS THE PREFIX. Measured on a real job 31/08: the job row carries `step: "> starting database"` —
 * one `>`, not `==>`. The first version of this function required `==>` and so returned an EMPTY array for
 * every real job; the console showed "Getting a machine ready…" from start to finish while the fleet
 * was narrating each step. Accept both forms, and require neither — the marker is the words, not the
 * arrow.
 *
 * 🔒 PLAIN JAVASCRIPT, for the same reason as `site-label.mjs`: this function is pure logic and is run
 * directly by `test/steps.test.mjs` with `node --test`, with no compile step.
 */

/** The steps the console can name. Declaration order carries no meaning — screen order is the order they happen. */
export const STEP = Object.freeze({
  webroot: 'webroot',
  database: 'database',
  platform: 'platform',
  cowork: 'cowork',
  quickstart: 'quickstart',
  agent: 'agent',
  baseline: 'baseline',
  address: 'address',
  writing: 'writing',
  placing: 'placing'
})

/**
 * Marker → step. Checked in array order, and **stops at the first matching marker**.
 *
 * Order matters in exactly one place: `not publishing` must come BEFORE `publishing`, because the two fleet lines
 * differ by one word, and misreading reports an address that does not exist yet. `step: null` is
 * how to say "this line means something, but it is not a step".
 */
const MARKERS = [
  { match: 'not publishing', step: null },
  // Pairing must be matched BEFORE the generic quickstart markers below: it is a line about the
  // quickstart, but it is the Cowork step (the token exchange), not the install itself.
  { match: 'pairing the quickstart', step: STEP.cowork },
  { match: 'quickstart cowork pairing', step: STEP.cowork },
  { match: 'fetching the quickstart package', step: STEP.quickstart },
  { match: 'building the quickstart', step: STEP.quickstart },
  { match: 'emdash image (quickstart', step: STEP.quickstart },
  { match: 'waiting for the restored site', step: STEP.quickstart },
  // EmDash's quickstart road narrates in its own words, and its `docker build` is the longest wait
  // of any platform (210 s cold, measured 19/09) — without these the console says "Getting a machine
  // ready…" from the first second to the last (measured 21/09 on tbemdash1.tracy.test).
  { match: 'fetching the packed template', step: STEP.quickstart },
  { match: 'restoring the state snapshot', step: STEP.quickstart },
  { match: 'content, media and forms', step: STEP.quickstart },
  { match: 'minting the agent admin', step: STEP.agent },
  { match: 'fetching webroot', step: STEP.webroot },
  { match: 'starting database', step: STEP.database },
  { match: 'importing database', step: STEP.database },
  { match: 'waiting for the joomla auto-install', step: STEP.platform },
  { match: 'waiting for the wordpress core copy', step: STEP.platform },
  { match: 'running the install ceremony', step: STEP.platform },
  { match: 'completing the emdash first-run setup', step: STEP.platform },
  { match: 'rewriting configuration.php', step: STEP.platform },
  { match: 'rewriting wp-config.php', step: STEP.platform },
  { match: 'will install with joomla itself', step: STEP.cowork },
  { match: 'installing cowork', step: STEP.cowork },
  { match: 'reading the component token', step: STEP.cowork },
  { match: 'reading the plugin token', step: STEP.cowork },
  { match: 'seeding admins and minting the agent token', step: STEP.agent },
  { match: 'building the webroot baseline', step: STEP.baseline },
  // The site's words, made from the Customize answers and written once the site is up: the poll door
  // says them in its `step` (tracy-web `brief-build.js` `STAGE`). Without them the host's last line —
  // "Recording a starting point" — spun for the whole wait (16/10/2026: about five minutes on Joomla).
  { match: 'writing your text and pictures', step: STEP.writing },
  { match: 'placing your text and pictures', step: STEP.placing },
  { match: 'publishing', step: STEP.address }
]

/**
 * The string key of a step, by platform.
 *
 * The `cowork` step is the ONLY step whose noun changes: Joomla installs a *component*, WordPress installs a
 * *plugin*. A shared label taught customers the wrong vocabulary once (measured 2026-08-11) — and wrong
 * in an expensive way, because people go looking for that thing in their own admin, under the
 * name that admin uses.
 * @param {string} step The step.
 * @param {string} platform The platform.
 * @returns {string} The key in the string table.
 */
function stringKeyFor(step, platform) {
  if (step === STEP.cowork && (platform === 'joomla' || platform === 'wordpress')) {
    return `step_cowork_${platform}`
  }
  return `step_${step}`
}

/**
 * The steps that happened, in the order the fleet narrates them.
 *
 * The last step is the one RUNNING (`done: false`) — unless the fleet has printed `TRACY_RESULT`, the line it only
 * prints after everything is done. There is no "upcoming" step: see the top of the file.
 * @param {string} output The job's raw output.
 * @param {string} platform The chosen platform, to pick the vocabulary.
 * @returns {{key: string, stringKey: string, done: boolean}[]} The steps, oldest first.
 */
export function stepsFrom(output, platform) {
  /** @type {string[]} */
  const seen = []
  for (const line of (output ?? '').split('\n')) {
    const lower = line.toLowerCase()
    // 🔒 NO ARROW REQUIRED, AND THIS TIME NO CHARACTER AT ALL. The previous version still kept a guard
    // `includes('>')` — loosened from `==>` to `>` on 31/08 because the fleet strips the prefix. On 19/09
    // `stepFromLine` (`apps/tracy-host/src/provision.js`) was fixed to strip the arrow too, because it was
    // leaking onto the customer's screen as `> fetching webroot`. Both fixes were right and they collided:
    // from then on `job.step` had no `>` at all, the guard dropped EVERY line, `stepsFrom` returned an empty array,
    // and the console showed "Getting a machine ready…" from start to finish — exactly the symptom the note
    // at the top of this file describes, repeated for the same reason. Measured 19/09 on `demoemdash.tracy.test`:
    // provisioning done in 210 seconds, the site answering 200, the screen still saying it was preparing a machine.
    // That guard never filtered anything `MARKERS` did not, so it is gone.
    const marker = MARKERS.find((entry) => lower.includes(entry.match))
    // No marker matched = a fleet line for log readers, not a milestone. Turning it into a nameless
    // step would make the console narrate work it does not understand.
    if (!marker || marker.step === null) continue
    // Two beats of the same work (`starting database` then `importing database`) are ONE step.
    if (seen.includes(marker.step)) continue
    seen.push(marker.step)
  }

  const finished = (output ?? '').includes('TRACY_RESULT')
  return seen.map((step, index) => ({
    key: step,
    stringKey: stringKeyFor(step, platform),
    done: finished || index < seen.length - 1
  }))
}
