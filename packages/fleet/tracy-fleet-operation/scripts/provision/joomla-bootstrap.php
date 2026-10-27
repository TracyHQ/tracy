<?php
/**
 * First boot of a scrubbed quickstart. The fleet hands the pairing token in (`TRACY_PAIR_TOKEN`, read
 * from stdin by the caller's shell, never argv) and nothing secret is printed. A caller that hands
 * none (the DDEV copy of the quickstart-contract skill) gets one minted and printed on stdout, which
 * is then a private token file, never a job log.
 */
if (PHP_SAPI !== 'cli') exit(1);

/**
 * The pure half, defined before the site is touched so a test can load it alone
 * (`TRACY_BOOTSTRAP_LIB_ONLY=1`): there is no Joomla under
 * `test/joomla-contract-bind.test.mjs`, and neither function needs one.
 */

/**
 * Every URL a warm-up renders, home page first.
 *
 * `Itemid` rather than the SEF paths the menu implies: a quickstart served with rewrite off
 * answers those with 404s, and a warm-up that renders nothing looks exactly like one that worked.
 * The cap is deliberate — the stylesheets belong to template STYLES, of which a site has a
 * handful, so a 300-item menu would spend minutes proving the same few files exist.
 */
function tracy_warm_urls(array $ids): array
{
    $urls = ['http://127.0.0.1/'];
    foreach (array_slice($ids, 0, 60) as $id) $urls[] = 'http://127.0.0.1/index.php?Itemid=' . (int) $id;
    return $urls;
}

/**
 * Reads a refused bind and answers: is this an asset that has not been WRITTEN yet, or one whose
 * bytes have DRIFTED? The two look identical in the message and are opposites in what they mean.
 *
 * A T4 template compiles `media/t4/css/NN.css` the first time a page using that style is served,
 * so on a site nobody has opened those files are simply absent — the presentation lock hashes
 * between 5 and 13 of them per Joomla profile. Absent means "warm again and re-bind". Present
 * means the file exists and does not match, which is the drift the lock exists to catch, and
 * retrying would only bury it.
 *
 * The path arrives over HTTP from the site's own component, and goes straight to `is_file`, so it
 * is read as a path inside the webroot or not read at all.
 */
function tracy_contract_retry_path(array $answer, string $webroot): ?string
{
    if (($answer['ok'] ?? null) !== false) return null;
    if (($answer['error'] ?? '') !== 'contract_failed') return null;
    if (!preg_match('/^Presentation asset changed: (.+)$/D', (string) ($answer['message'] ?? ''), $m)) return null;
    $rel = $m[1];
    if ($rel === '' || $rel[0] === '/' || strpos($rel, "\0") !== false) return null;
    foreach (explode('/', $rel) as $part) if ($part === '..') return null;
    return is_file(rtrim($webroot, '/') . '/' . $rel) ? null : $rel;
}

/**
 * The URL that renders exactly the asset a refusal named, or nothing when the path is not one this
 * can aim at.
 *
 * A T4 stylesheet is named after the TEMPLATE STYLE whose pages use it — `media/t4/css/37.css`
 * belongs to style 37 — and `index.php?templateStyle=37` renders that style directly. This is what
 * makes the retry worth having: walking the same menu a second time misses whatever it missed the
 * first time, while this aims at the file that is actually absent. Measured 20/09 on `site-n38jbp`:
 * one such GET wrote `37.css` with the hash the lock expected, to the byte.
 *
 * The id is taken from the refusal's OWN path and nowhere else. Rendering some other style would
 * write a stylesheet the lock does not carry (JA Kinetic has a style 32 with no entry, because no
 * menu item uses it), and adding a file is drift in the other direction.
 */
function tracy_warm_urls_for_missing(string $rel): array
{
    if (!preg_match('~^media/t4/css/([0-9]{1,10})\.css$~D', $rel, $m)) return [];
    return ['http://127.0.0.1/index.php?templateStyle=' . (int) $m[1]];
}

/**
 * Renders the site once, so everything it generates on first view exists before it is hashed.
 * Failures are not reported: a menu item that 404s or times out is not a reason to refuse a site,
 * and whether the warm-up was enough is answered by the bind itself, not by these status codes.
 */
function tracy_warm_site(array $urls): void
{
    foreach ($urls as $url) {
        $warm = curl_init($url);
        curl_setopt_array($warm, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3]);
        curl_exec($warm);
        curl_close($warm);
    }
}

/**
 * What a bind that will not be retried says: the Claude Cowork plugin's own answer, not only that it failed.
 *
 * "Binding failed" alone named no cause, and nothing else recorded one. Measured 23/09/2026 on
 * `j-8zjzs6` (job `kc238b9eaeeb82f73d855`, run beside a WordPress provision): the provision stopped
 * here while the site went on serving, and the Claude Cowork plugin's refusal had been read, judged and dropped.
 * Only the fields a refusal carries are kept, and cut short: the answer names files and contracts,
 * never the token the request sent. An empty answer says what the transport reported instead.
 */
function tracy_bind_failure($answer, string $transport = '', int $status = 200): string
{
    return 'Quickstart contract binding failed: ' . tracy_door_said($answer, $transport, $status);
}

/** The same report for an inspect that does not confirm the bind it follows. */
function tracy_inspect_failure($answer, string $transport = '', int $status = 200): string
{
    return 'Quickstart contract inspect after bind did not confirm it: ' . tracy_door_said($answer, $transport, $status);
}

/** Only the fields a door answer carries about a binding, cut short; never the token a request sent. */
function tracy_door_said($answer, string $transport, int $status = 200): string
{
    $said = [];
    if (is_array($answer)) {
        foreach (['ok', 'error', 'code', 'message', 'contract', 'bound'] as $key) {
            if (array_key_exists($key, $answer)) $said[$key] = $answer[$key];
        }
    }
    $detail = $said !== []
        ? (string) json_encode($said, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        : 'no answer' . ($transport !== '' ? ' (' . $transport . ')' : '');
    if ($status !== 0 && !tracy_http_ok($status)) $detail = 'HTTP ' . $status . ' ' . $detail;
    return substr($detail, 0, 500);
}

/** A door answer counts only over a 2xx: a JSON body that says `ok` beside a 500 is not a success. */
function tracy_http_ok(int $status): bool
{
    return $status >= 200 && $status < 300;
}

/** An answer the door gave as a success: HTTP 2xx and `ok` that is exactly `true`, not truthy. */
function tracy_door_ok($answer, int $status): bool
{
    return tracy_http_ok($status) && is_array($answer) && ($answer['ok'] ?? null) === true;
}

/** A pairing token: 64 lowercase hex characters and nothing else. */
function tracy_token_valid($token): bool
{
    return is_string($token) && (bool) preg_match('/^[a-f0-9]{64}$/D', $token);
}

/** A published profile id (`ja-kinetic/j6/1.0.0`): nothing else is ever written into the params. */
function tracy_contract_id_valid(string $contract): bool
{
    return (bool) preg_match('~^[a-z][a-z0-9-]{1,40}/[a-z][a-z0-9]{0,9}/[0-9]+\.[0-9]+\.[0-9]+$~D', $contract);
}

/**
 * The component's params column, read as the JSON object it must be. An empty column is an empty
 * object; anything else that is not an object — `[]` included — is refused rather than overwritten,
 * because the column also carries settings this file does not own. Decoded as an OBJECT, not an
 * array: an associative decode reads `{}` and `[]` alike, and would write a nested `{}` it does not
 * own back as `[]`.
 */
function tracy_decode_params($raw): stdClass
{
    if ($raw === null || $raw === '') return new stdClass();
    $params = json_decode((string) $raw);
    if (!($params instanceof stdClass)) throw new RuntimeException('Cowork params are not a JSON object');
    return $params;
}

/**
 * The params a pairing writes, or null when this pass must write none.
 *
 * A fresh pairing (`$paired` false) stores the token and names the contract. A site whose component
 * already holds the host's token (`$paired`: a re-run, or a first pass resumed after it stored the
 * token) keeps it, and until 02/10/2026 wrote nothing at all — so a site whose component held a token
 * but no contract (paired while its card had no profile, or before the provisioner named one) stayed
 * unbound for good: the bind read an empty `contract`, the component fell back to
 * `tracy-apple/j6/1.1.0`, and every read of the site failed against Apple's lock (#722). Such a pass
 * now fills an EMPTY contract with the one it was given, and nothing else. A different contract
 * already held is refused: which of the two the site really carries is not something this file can
 * decide.
 */
function tracy_pairing_params(stdClass $params, string $workflow, string $contract, bool $paired, string $token): ?stdClass
{
    $construction = $workflow === 'template-build';
    $template = $workflow === 'template';
    $write = clone $params;
    if (!$paired) {
        $write->token = $token;
        $write->contract = ($construction || $template) ? '' : $contract;
        if ($construction) $write->tracy_build_baseline = $contract;
        $write->webroot = '';
        return $write;
    }
    // A resumed construction must never unbind a profile the builder has already completed; a
    // template has nothing to bind at all.
    if ($construction || $template) return null;
    $held = $params->contract ?? '';
    if ($held === $contract) return null;
    if ($held !== '') throw new RuntimeException('the site is held to another content contract than the provision names');
    $write->contract = $contract;
    return $write;
}

/**
 * Did the bind answer accept the contract asked for? Nothing over a status that is not 2xx counts,
 * whatever its body says — the component answers its own refusals over 200 too. Then only an `ok`
 * and `bound` exactly `true` beside exactly this `contract`. A re-run on a site already bound may be
 * told so as a refusal: the one form the Claude Cowork plugin speaks (`ok` exactly `false`, `error`
 * exactly `conflict`, and the WHOLE message `This site is already bound to <contract>`). Nothing is
 * searched for inside a message: any other error code, prefix or suffix is a refusal like any other.
 * The current Joomla component answers a re-bind with `ok: true` instead, and the inspect that
 * follows is what proves the binding either way.
 */
function tracy_bind_accepted($answer, string $contract, int $status): bool
{
    if (!tracy_http_ok($status) || !is_array($answer)) return false;
    if (($answer['ok'] ?? null) === true)
        return ($answer['bound'] ?? null) === true && ($answer['contract'] ?? null) === $contract;
    return ($answer['ok'] ?? null) === false
        && ($answer['error'] ?? null) === 'conflict'
        && ($answer['message'] ?? null) === 'This site is already bound to ' . $contract;
}

/**
 * The inspect after a bind confirms it only over a 2xx, with `ok` exactly `true` and exactly the
 * contract asked for.
 *
 * `bound` is NOT required: the component's inspect of a bound site answers the contract state itself
 * (`contract`, `revision`, …) and carries no `bound` key at all. Until 03/10/2026 this demanded
 * `bound === true`, so every provision that bound a contract threw here, after a bind that had
 * succeeded (#824, measured on dev with `ja-essence/j6/1.0.0`: the answer refused was
 * `{"ok":true,"contract":"ja-essence/j6/1.0.0"}`).
 *
 * What the component does say about a site that is not bound is `bound: false` beside
 * `construction: true`, so either flag, when it is there, must be the boolean a bound site would give:
 * `bound` exactly `true`, `construction` exactly `false`. A truthy `1`, a `"true"` string or a `null`
 * in either place is not a confirmation, and neither is an answer whose flags contradict each other.
 */
function tracy_inspect_confirms($answer, string $contract, int $status): bool
{
    if (!tracy_door_ok($answer, $status) || $contract === '' || ($answer['contract'] ?? null) !== $contract) return false;
    if (array_key_exists('bound', $answer) && $answer['bound'] !== true) return false;
    if (array_key_exists('construction', $answer) && $answer['construction'] !== false) return false;
    return true;
}

/** Calls of `showcaseNav.apply` one phase may make, lost answers included; a map is a few dozen rows. */
const TRACY_SHOWCASE_CALLS = 50;
/** Lost answers in a row (no answer, no JSON, not a 2xx) before the phase stops and says so. */
const TRACY_SHOWCASE_LOST = 3;

/**
 * Is this refusal the plugin saying the phase does not apply here, rather than that it failed?
 * `unsupported` is the plugin's own word for a contract with no checked showcase-navigation map (or
 * one that does not cover this design). A component released before the phase existed answers the
 * operation with the exact refusal every unknown contract operation gets; that is read as a whole
 * answer too, never as a fragment of a message.
 */
function tracy_showcase_skip_reason(array $answer): ?string
{
    if (($answer['ok'] ?? null) !== false) return null;
    if (($answer['error'] ?? null) === 'unsupported') return 'unsupported: ' . substr((string) ($answer['message'] ?? ''), 0, 300);
    if (($answer['error'] ?? null) === 'contract_failed' && ($answer['message'] ?? null) === 'Unknown contract operation')
        return 'unsupported: the installed Cowork component predates showcase navigation';
    return null;
}

/** What a showcase-navigation step that stops says: the component's own answer, never the token. */
function tracy_showcase_failure(string $what, $answer, string $transport = '', int $status = 200): string
{
    $said = [];
    if (is_array($answer)) {
        foreach (['ok', 'error', 'message', 'status', 'remaining'] as $key) {
            if (array_key_exists($key, $answer)) $said[$key] = $answer[$key];
        }
    }
    $detail = $said !== []
        ? (string) json_encode($said, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        : 'no answer' . ($transport !== '' ? ' (' . $transport . ')' : '');
    if ($status !== 0 && !tracy_http_ok($status)) $detail = 'HTTP ' . $status . ' ' . $detail;
    return substr($what . ': ' . $detail, 0, 600);
}

/**
 * An apply the component refused (`ok: false`) on its first call, with no call before it: a refused
 * call commits no batch, so nothing was written and there is nothing to revert.
 */
final class TracyShowcaseUntouched extends RuntimeException
{
}

/**
 * Drives one `showcaseNav` job — `apply` or `revert` — to its end, one committed batch per call.
 *
 * 🔒 ONE REQUEST ID FOR THE WHOLE JOB, KEPT BY THE HOST. The component keys the job by `request_id`,
 * so a call whose answer was lost (no answer, no JSON, a status that is not 2xx) is simply asked
 * again: the same request resumes or replays, it never hides twice. An `ok` that is not exactly
 * `true` over a 2xx is a refusal, never progress. Every `running` answer must leave less to do than
 * the one before, and the calls are bounded, so a job that stalls stops instead of spinning. A revert
 * is its own request (`<request>.rv`, apply id `snav-revert-<request>`).
 *
 * Answers null once the job is done, or — for `apply` only — the reason it does not apply here;
 * anything else throws: `TracyShowcaseUntouched` for an apply refused on its first call, a plain
 * `RuntimeException` otherwise.
 */
function tracy_showcase_job(callable $door, string $token, string $request, string $operation, callable $say): ?string
{
    $hide = $operation === 'apply';
    $params = $hide
        ? ['operation' => 'showcaseNav.apply', 'apply_id' => 'snav-' . $request, 'request_id' => $request]
        : ['operation' => 'showcaseNav.revert', 'apply_id' => 'snav-revert-' . $request, 'request_id' => $request . '.rv'];
    $call = ['token' => $token, 'action' => 'content.contract', 'params' => $params];
    $what = $hide ? '' : 'revert ';
    $left = null;
    $lost = 0;
    for ($n = 1; ; $n++) {
        if ($n > TRACY_SHOWCASE_CALLS) throw new RuntimeException($what . 'did not complete within ' . TRACY_SHOWCASE_CALLS . ' calls');
        [$answer, $transport, $status] = tracy_call($door, $call, 600);
        if (!tracy_http_ok($status) || $answer === []) {
            if (++$lost >= TRACY_SHOWCASE_LOST) throw new RuntimeException(tracy_showcase_failure($what . 'lost its answer ' . $lost . ' times in a row', $answer, $transport, $status));
            $say('    showcase navigation: no answer (' . ($status ?: 'no status') . '), asking again with the same request');
            continue;
        }
        $lost = 0;
        $skip = $hide ? tracy_showcase_skip_reason($answer) : null;
        if ($skip !== null) return $skip;
        $remaining = $answer['remaining'] ?? null;
        if ($hide && $n === 1 && ($answer['ok'] ?? null) === false)
            throw new TracyShowcaseUntouched(tracy_showcase_failure('refused', $answer, $transport, $status));
        if (($answer['ok'] ?? null) !== true || !is_int($remaining) || $remaining < 0)
            throw new RuntimeException(tracy_showcase_failure($what . 'refused', $answer, $transport, $status));
        if (($answer['status'] ?? null) === ($hide ? 'completed' : 'reverted') && $remaining === 0) return null;
        if (($answer['status'] ?? null) !== 'running' || $remaining === 0 || ($left !== null && $remaining >= $left))
            throw new RuntimeException(tracy_showcase_failure($what . 'made no progress', $answer, $transport, $status));
        $left = $remaining;
        $say('    showcase navigation: ' . (int) ($answer['moved'] ?? 0) . ($hide ? ' moved, ' : ' put back, ') . $remaining . ' left');
    }
}

/**
 * Takes the quickstart's TEMPLATE SHOWCASE out of a freshly bound site's menus, through the
 * component's own `showcaseNav` operations, and reads the job back. What is hidden is decided in
 * the contract's reviewed `showcase-nav-map.json`; this sends no rows, only the request.
 *
 * Answers the state to say — 'applied…' — or 'skipped' (already said: the plugin's coverage state);
 * anything else throws, and `tracy_showcase_phase` takes it from there.
 */
function tracy_showcase_nav(callable $door, string $token, string $request, callable $say): string
{
    $say('==> taking the template showcase out of the site menus');
    $skip = tracy_showcase_job($door, $token, $request, 'apply', $say);
    if ($skip !== null) {
        $say('    showcase navigation: skipped — ' . $skip);
        return 'skipped';
    }
    // Read back, not trusted: only a status that says the job is complete ends the apply.
    [$read, $transport, $status] = tracy_call($door, ['token' => $token, 'action' => 'content.contract', 'params' => ['operation' => 'showcaseNav.status']], 600);
    if (!tracy_door_ok($read, $status) || ($read['status'] ?? null) !== 'complete' || ($read['remaining'] ?? null) !== 0)
        throw new RuntimeException(tracy_showcase_failure('status after apply did not confirm it', $read, $transport, $status));
    return tracy_showcase_verdict($read);
}

/**
 * The coverage state a complete `showcaseNav.status` answer says. The component answers `skipped` as
 * an object keyed by owner (`showcaseNavSkipped()`: owner → why) and `owners` as the number of owners
 * the map changes; a list is still read, for any older answer. An entry whose why starts `kept` is a
 * T3 mega-menu sub or column the component kept on purpose (a child of it still shown), whether it
 * then wrote the rest of that owner's steps or none: not a conflict. An entry whose why says `already`
 * is an owner already as the map leaves it; every other entry was left as it was (a conflict: edited,
 * gone, raced), and nothing was hidden for it.
 *
 * 🔒 "APPLIED" ONLY WHEN THE JOB HID SOMETHING, or everything was already as the map leaves it. An
 * owner missing from `skipped` is a plain `written`: something was hidden. A kept entry alone proves
 * nothing either way — the answer does not say whether that style wrote part of its steps — but a
 * mega step is taken only once its item's hidden children are `written` or `already`
 * (`showcaseNavSubKept`, `showcaseNavColumnKept`). So when every owner is in `skipped`, none says
 * `already`, and each is a conflict or kept, no child was hidden and no step taken: nothing was
 * hidden at all. That throws, so the phase settles as failed with one `!!` line — never a plain
 * "applied". (The one gap: a column step whose head the release already hides, outside the map, is
 * checked on the live menu only; such a step taken beside all-conflict children reads as nothing
 * hidden here, and is reverted.)
 */
function tracy_showcase_verdict(array $read): string
{
    $left = [];
    $kept = [];
    $already = 0;
    $entries = is_array($read['skipped'] ?? null) ? $read['skipped'] : [];
    foreach ($entries as $key => $value) {
        $why = (string) (is_array($value) ? ($value['why'] ?? '') : (is_scalar($value) ? $value : ''));
        if (is_array($value) && isset($value['key'])) $key = $value['key'];
        if (preg_match('/^kept\b/', $why)) { $kept[] = $key . ': ' . $why; continue; }
        if (preg_match('/\balready\b/', $why)) { $already++; continue; }
        $left[] = $why !== '' ? $key . ': ' . $why : (string) $key;
    }
    $owners = $read['owners'] ?? null;
    $owners = is_int($owners) && $owners >= count($entries) ? $owners : null;
    $named = str_replace("\n", ' ', substr(implode('; ', $left), 0, 300));
    if ($left !== [] && $owners !== null && $already === 0 && count($left) + count($kept) === $owners)
        throw new RuntimeException('nothing was hidden — all ' . $owners . ' owners the map changes were left as they were (conflict: ' . $named . ')'
            . ($kept !== [] ? '; ' . count($kept) . ' mega-menu styles kept with them (' . str_replace("\n", ' ', substr(implode('; ', $kept), 0, 300)) . ')' : ''));
    $said = [];
    if ($left !== []) $said[] = count($left) . ($owners !== null ? ' of ' . $owners : '') . ' owners left as they were (conflict: ' . $named . ')';
    if ($kept !== []) $said[] = count($kept) . ' kept on purpose (' . str_replace("\n", ' ', substr(implode('; ', $kept), 0, 300)) . ')';
    if ($already > 0) $said[] = $already . ' already as the map leaves them';
    return 'applied' . ($said !== [] ? ', ' . implode('; ', $said) : '');
}

/**
 * The showcase-navigation phase of a new site, after its bind and the inspect of that bind.
 *
 * 🔒 THE PHASE IS COSMETIC, SO IT NEVER STOPS A SITE BEING CREATED (product rule). Hiding the
 * showcase only tidies the menus; the site works the same with it shown. So:
 *   - a phase that cannot run (no host token, a request id the component would refuse) and never
 *     started is said with `!!` and skipped — nothing was asked of the component;
 *   - a phase that fails once started — a refusal, a stall, lost answers, too many calls, a status or
 *     the contract inspect after it that does not confirm it — may have left the menus half-edited.
 *     What it applied is taken back once with `showcaseNav.revert` (best effort, same door and
 *     token), the contract is inspected again, and the failure is said in ONE `!!` line: the reason,
 *     and either "reverted" or "the revert did not complete — the menus may be partly hidden". That
 *     inspect confirming → 'failed' is said and the pairing goes on, whether or not the revert
 *     finished: half-hidden menus are cosmetic, the binding is what matters;
 *   - an apply refused on its FIRST call (no answer before it, lost or `running`) wrote nothing: a
 *     refused call commits no batch (`TracyShowcaseUntouched`). There is nothing to revert, so no
 *     revert is asked; the contract is inspected the same way, and the ONE `!!` line names the
 *     component's reason and says nothing was written and the showcase stays in the menus. 'failed';
 *   - `$resumed`: an earlier pass started the phase and did not finish it (`joomla.sh` read its mark).
 *     That pass may have died anywhere in it, so nothing is applied again: the same recovery runs —
 *     one revert, the inspect — and it is settled as failed. When it cannot run (no host token, a
 *     request id the component would refuse) it is settled as failed with one `!!` line saying the
 *     revert could not be attempted, never as skipped;
 *   - only an inspect that no longer confirms the contract after all that throws: that is a broken
 *     contract binding, fatal exactly as the inspect after the bind is.
 *
 * Answers 'applied', 'skipped' or 'failed', with its coverage state said as the last line.
 */
function tracy_showcase_phase(callable $door, string $token, string $contract, string $request, callable $say, callable $warn, bool $resumed = false): string
{
    $cannot = $token === '' ? 'it is applied only by a provision that holds the site token'
        : (!preg_match('/^[a-zA-Z0-9._:-]{1,95}$/D', $request) ? 'the request id is not one the component accepts' : '');
    if ($cannot !== '' && $resumed) {
        $why = 'started on an earlier pass and not finished, the menus may be partly hidden; the revert could not be attempted (' . $cannot . ')';
        $warn('!! showcase navigation: the phase started on an earlier pass and did not finish — the menus may be partly hidden; the revert could not be attempted (' . $cannot . ')');
        $say('    showcase navigation: failed — ' . $why);
        return 'failed';
    }
    if ($cannot !== '') {
        $warn('!! showcase navigation: ' . $cannot . ', so the phase cannot run');
        $say('    showcase navigation: skipped — ' . $cannot);
        return 'skipped';
    }
    $inspect = ['token' => $token, 'action' => 'content.contract', 'params' => ['operation' => 'inspect']];
    $untouched = false;
    if ($resumed) {
        $say('==> taking back the template showcase phase an earlier pass started and did not finish');
        $reason = 'started on an earlier pass and not finished';
    } else {
        try {
            $state = tracy_showcase_nav($door, $token, $request, $say);
            if ($state === 'skipped') return 'skipped';
            [$inspected, $transport, $status] = tracy_call($door, $inspect, 600);
            if (tracy_inspect_confirms($inspected, $contract, $status)) {
                $say('    showcase navigation: ' . $state);
                return 'applied';
            }
            $reason = 'the contract inspect after it did not confirm it: ' . tracy_door_said($inspected, $transport, $status);
        } catch (Throwable $error) {
            $reason = $error->getMessage();
            $untouched = $error instanceof TracyShowcaseUntouched;
        }
    }
    $state = 'failed — ' . $reason;
    if ($untouched) {
        // Refused on its first call: no batch was committed, so there is nothing to revert.
        $warn('!! showcase navigation: ' . $reason . '; nothing was written, the template showcase stays in the menus');
        $state .= '; nothing was written, the template showcase stays in the menus';
    } else {
        try {
            tracy_showcase_job($door, $token, $request, 'revert', $say);
            $warn('!! showcase navigation: ' . $reason . '; what it applied was reverted');
            $state .= '; what it applied was reverted';
        } catch (Throwable $error) {
            $warn('!! showcase navigation: apply stopped part-way and the revert did not complete — the menus may be partly hidden; ' . $reason . '; revert: ' . $error->getMessage());
            $state .= '; the revert did not finish (' . $error->getMessage() . ')';
        }
    }
    [$inspected, $transport, $status] = tracy_call($door, $inspect, 600);
    if (!tracy_inspect_confirms($inspected, $contract, $status))
        throw new RuntimeException('Quickstart contract inspect after the failed showcase navigation and its revert did not confirm it: ' . tracy_door_said($inspected, $transport, $status));
    $say('    showcase navigation: ' . $state);
    return 'failed';
}

/** The component's own row: its id and its params, or null when the site carries no component. */
function tracy_cowork_row($db, string $prefix): ?array
{
    $result = $db->query("SELECT extension_id, params FROM {$prefix}extensions WHERE type='component' AND element='com_claudecowork'");
    if (!$result) throw new RuntimeException('could not read the Cowork component row');
    $row = $result->fetch_assoc();
    return is_array($row) ? $row : null;
}

/**
 * POST one JSON body to the site's own component; answers [decoded answer or [], transport error,
 * HTTP status (0 when nothing answered)].
 */
function tracy_door(string $url): callable
{
    return static function (array $body, int $timeout) use ($url): array {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_POSTFIELDS => json_encode($body)]);
        $raw = curl_exec($ch);
        $error = curl_error($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $answer = is_string($raw) ? json_decode($raw, true) : null;
        return [is_array($answer) ? $answer : [], $error, $status];
    };
}

/** One door call, read as [answer, transport error, HTTP status] whatever the door returned. */
function tracy_call(callable $door, array $body, int $timeout): array
{
    $got = $door($body, $timeout);
    $answer = is_array($got[0] ?? null) ? $got[0] : [];
    return [$answer, (string) ($got[1] ?? ''), (int) ($got[2] ?? 0)];
}

/**
 * Clears what a quickstart archive may still carry of someone else's sessions, and gives the
 * break-glass admin a fresh random password. Run once per pairing, BEFORE the token is stored: a
 * pass that finds the host's token already in the component knows this already ran, so a resumed
 * or repeated pass never resets the site a second time.
 */
function tracy_reset_site($db, string $prefix): void
{
    foreach (['session', 'user_keys'] as $table)
        if (!$db->query("DELETE FROM {$prefix}{$table}")) throw new RuntimeException('could not reset the site sessions');
    // Not checked: a component release older than the apply log has no such table, and pairing
    // never depended on it.
    $db->query("DELETE FROM {$prefix}claudecowork_apply_log");
    // Package users have unusable passwords; assign a fresh random one to the break-glass admin.
    // Normal access remains the site's token-backed Tracy Access flow.
    $hash = password_hash(bin2hex(random_bytes(32)), PASSWORD_BCRYPT);
    $stmt = $db->prepare("UPDATE {$prefix}users SET password=?, otpKey='', otep='', resetCount=0, requireReset=0 WHERE id IN (SELECT user_id FROM {$prefix}user_usergroup_map WHERE group_id=8)");
    if (!$stmt || !$stmt->bind_param('s', $hash) || !$stmt->execute()) throw new RuntimeException('could not reset the site admin');
}

/**
 * The whole first boot, against the site it is handed. `$site` carries the database (`db`, a mysqli
 * or anything answering `query`/`prepare` the same way), its table `prefix`, the component `door`,
 * the `warm` renderer, the `webroot`, and what the provision asked: `token` (the host's), `verify_only`,
 * `workflow`, `contract`, `optional`, `showcase` — the request id of the showcase-navigation
 * phase, '' for none — and `showcase_resumed` (an earlier pass started that phase), with `say`, which prints its progress, and `warn` (default `say`), which
 * prints a `!!` line. Answers the token to print ('' when
 * nothing is printed), or 3 when the site carries no component and the caller said that is allowed.
 *
 * TOKEN CUSTODY. The host mints the token and keeps it before this runs, so a pass that dies after
 * storing it leaves a host that still knows it:
 *   - `verify_only` (the host holds a committed token): the component must hold that same token, or
 *     the pass is refused — a host file naming a token nothing holds is the failure this prevents;
 *   - otherwise, a component holding no valid token was never paired, and is paired fresh (one
 *     reset); a component already holding the host's token is a first pass resumed: no second
 *     reset, no new token; a component holding any OTHER valid token belongs to another pairing,
 *     and the pass is refused before anything is reset or written.
 */
function tracy_bootstrap(array $site)
{
    $db = $site['db'];
    $prefix = (string) $site['prefix'];
    if (!preg_match('/^[a-zA-Z0-9_]+$/D', $prefix)) throw new RuntimeException('invalid table prefix');
    $door = $site['door'];
    $warm = $site['warm'];
    $verifyOnly = (bool) $site['verify_only'];
    $workflow = (string) $site['workflow'];
    $construction = $workflow === 'template-build';
    // A template card (Tracy Business): paired, never bound — there is no profile to hold it to.
    $template = $workflow === 'template';
    $row = tracy_cowork_row($db, $prefix);
    // A quickstart released by someone else (ja_kinetic, every `quickstart/*` of JoomlArt) carries no
    // Cowork component, and a DEMO of it is still worth having — it just has no agent. Exit 3 says
    // exactly that, and only the caller that passed TRACY_PAIR_OPTIONAL may read it as "carry on";
    // every other caller still gets the exception, because a site meant to be driven by an agent
    // whose component vanished is a broken site, not a plain one. (Measured 16/09 on
    // ja-kinetic-joomla.tracy.site: two provisions died here after the site itself was up.)
    if (!$row && !empty($site['optional'])) return 3;
    if (!$row) throw new RuntimeException('Cowork is missing from the quickstart');
    $params = tracy_decode_params($row['params']);
    $hostToken = (string) ($site['token'] ?? '');
    if ($hostToken !== '' && !tracy_token_valid($hostToken)) throw new RuntimeException('the host pairing token is not a token');
    $held = $params->token ?? '';
    if ($verifyOnly) {
        if (!tracy_token_valid($held)) throw new RuntimeException('Cowork pairing is missing');
        if ($hostToken === '') throw new RuntimeException('a re-run must be handed the token the host holds');
        if (!hash_equals($held, $hostToken)) throw new RuntimeException('the host token does not match the Cowork component token');
        $paired = true;
    } elseif (!tracy_token_valid($held)) {
        // Never paired: a scrubbed archive carries no token.
        $paired = false;
    } elseif ($hostToken !== '' && hash_equals($held, $hostToken)) {
        // Already ours: a first pass resumed after it stored the host's token.
        $paired = true;
    } else {
        // Somebody else's pairing. Resetting the site and overwriting the token would lock that
        // party out of a live site, so nothing is reset, written or called.
        throw new RuntimeException('the Cowork component is paired to a different token; refusing to reset a site held by another pairing');
    }
    $token = $hostToken !== '' ? $hostToken : bin2hex(random_bytes(32));
    // Which published profile this site is held to. One base archive now serves more than one design,
    // so the provisioner names it here — in the component's own params, beside the write token and
    // with the same trust — and the Claude Cowork plugin reads it from there. Never from a request.
    $contract = (string) $site['contract'];
    if (!$template && !tracy_contract_id_valid($contract)) throw new RuntimeException('provision named no content contract');
    $write = tracy_pairing_params($params, $workflow, $contract, $paired, $token);
    // Reset BEFORE the token is stored, so "the component holds the host's token" proves it ran.
    if (!$paired) tracy_reset_site($db, $prefix);
    if ($write !== null) {
        $id = (int) $row['extension_id'];
        $value = json_encode($write);
        $stmt = $db->prepare("UPDATE {$prefix}extensions SET params=? WHERE extension_id=?");
        if (!$stmt || !$stmt->bind_param('si', $value, $id) || !$stmt->execute())
            throw new RuntimeException('could not write the Cowork params');
        // Read back, not trusted: an UPDATE that matched nothing succeeds too.
        $stored = tracy_cowork_row($db, $prefix);
        $kept = $stored ? tracy_decode_params($stored['params']) : new stdClass();
        if (($kept->token ?? null) !== $token || ($kept->contract ?? null) !== $write->contract)
            throw new RuntimeException('the Cowork params did not keep what was written');
    }
    // Printed only when this pass minted the token itself: the host that handed one already has it.
    $printed = ($hostToken === '' && !$paired) ? $token : '';
    [$result, , $status] = tracy_call($door, ['token' => $token, 'action' => 'core.manifest', 'params' => new stdClass()], 20);
    if (!tracy_door_ok($result, $status) || ($result['manifest']['platform'] ?? '') !== 'joomla') throw new RuntimeException('Cowork token probe failed');
    if ($construction || $template) return $printed;
    // RENDER THE SITE BEFORE HASHING IT. A T4 template writes `media/t4/css/NN.css` the first time a
    // page using that style is served; the lock hashes those files, so a bind on a site nobody has
    // opened compares against a webroot still being written and refuses with `Presentation asset
    // changed`. Measured 20/09 on `site-n38jbp` (`ja-kinetic/j6/1.0.0`): one GET produced `33.css`
    // with the hash the lock expected to the byte, and the same bind answered `bound` once every menu
    // item had been rendered.
    $menu = [];
    $rows = $db->query("SELECT id FROM {$prefix}menu WHERE published=1 AND client_id=0 AND type='component' AND id>1 ORDER BY id");
    if ($rows) while ($r = $rows->fetch_row()) $menu[] = (int) $r[0];
    $warm(tracy_warm_urls($menu));
    // The bind is not a probe: it hashes every protected file (3,900 on Apple, 4,170 on Airbnb), reads
    // the whole inventory and compares the presentation of 197 entities — on a cold site, over a bind
    // mount, with a second provision running beside it, that is minutes rather than seconds. The 20s
    // the manifest probe uses killed it mid-verify and the provision reported "binding failed" for a
    // site that was in fact fine; measured 12/09 on two parallel provisions.
    $bind = ['token' => $token, 'action' => 'content.contract', 'params' => ['operation' => 'bind']];
    // The warm-up above is the fix; this is the net under it, for the one case it can miss — an asset
    // generated by a page no menu item reaches. Only a file the webroot does NOT have buys another
    // round: a file that is there and differs is drift, and it fails on the spot, as it must.
    $attempts = 3;
    for ($try = 1; ; $try++) {
        [$bound, $transport, $status] = tracy_call($door, $bind, 600);
        if (tracy_bind_accepted($bound, $contract, $status)) break;
        // A refusal is read for a missing asset only when it came over a 2xx, like every door answer.
        $missing = $try < $attempts && tracy_http_ok($status) ? tracy_contract_retry_path($bound, (string) $site['webroot']) : null;
        if ($missing === null) throw new RuntimeException(tracy_bind_failure($bound, $transport, $status));
        $warm(array_merge(tracy_warm_urls_for_missing($missing), tracy_warm_urls($menu)));
    }
    // Read the binding back, as the WordPress road does: only an inspect that names this contract
    // ends the pairing, so a bind answered by a stale or concurrent state is not taken as done.
    [$inspected, $transport, $status] = tracy_call($door, ['token' => $token, 'action' => 'content.contract', 'params' => ['operation' => 'inspect']], 600);
    if (!tracy_inspect_confirms($inspected, $contract, $status)) throw new RuntimeException(tracy_inspect_failure($inspected, $transport, $status));
    // The showcase phase, only when the caller hands a request id: `joomla.sh` does so only for a site
    // this provision laid down (its receipt, `lib/showcase-nav.sh`), never for a re-run on a site
    // already handed over, an import or the DDEV copy of the quickstart-contract skill.
    // Cosmetic: a phase that fails is said, reverted and skipped past; only a contract that no longer
    // inspects as bound after it throws (`tracy_showcase_phase`). The bind and its inspect above stay fatal.
    $request = (string) ($site['showcase'] ?? '');
    if ($request === '') return $printed;
    $say = $site['say'] ?? static function (string $line): void {};
    tracy_showcase_phase($door, $hostToken === '' ? '' : $token, $contract, $request, $say, $site['warn'] ?? $say, !empty($site['showcase_resumed']));
    return $printed;
}

if (getenv('TRACY_BOOTSTRAP_LIB_ONLY') === '1') return;

require '/var/www/html/configuration.php';
$config = new JConfig();
$printed = tracy_bootstrap([
    'db' => new mysqli($config->host, $config->user, $config->password, $config->db),
    'prefix' => (string) $config->dbprefix,
    'door' => tracy_door('http://127.0.0.1/index.php?option=com_claudecowork&task=api.exec&format=json'),
    'warm' => 'tracy_warm_site',
    'webroot' => '/var/www/html',
    'token' => (string) getenv('TRACY_PAIR_TOKEN'),
    'verify_only' => getenv('TRACY_CONTRACT_VERIFY_ONLY') === '1',
    'workflow' => (string) getenv('TRACY_BUILD_WORKFLOW'),
    'contract' => (string) getenv('TRACY_CONTRACT_ID'),
    'optional' => getenv('TRACY_PAIR_OPTIONAL') === '1',
    'showcase' => (string) getenv('TRACY_SHOWCASE_REQUEST'),
    'showcase_resumed' => getenv('TRACY_SHOWCASE_RESUMED') === '1',
    'say' => static function (string $line): void { echo $line, "\n"; },
    'warn' => static function (string $line): void { fwrite(STDERR, $line . "\n"); },
]);
if ($printed === 3) exit(3);
if ($printed !== '') echo $printed, "\n";
