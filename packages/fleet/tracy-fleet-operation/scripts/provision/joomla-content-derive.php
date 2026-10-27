<?php
// tracy: content-derive
/**
 * Bind an IMPORTED Joomla copy to a contract derived from its own rows: `content.contract` operation
 * `derive` on the copy's own com_claudecowork (tasks/todo-import-site-contract.md). The component reads
 * the rows through its codecs, calibrates them against the rendered pages, and the Edit picker then
 * resolves a click to a slot the agent can write and revert.
 *
 * One caller: the import road of `platform/joomla.sh`, through
 * `docker compose exec -T -e TRACY_LABEL=<label> web php < joomla-content-derive.php`, never over HTTP
 * from outside and never by an agent. The engine is reached the way `joomla-bootstrap.php` reaches it:
 * the token from the component's own params, a POST to the site's loopback. The request id is the
 * label's, so a retried provision replays what it bound instead of deriving twice.
 *
 * Always exit 0: a copy without a derived contract is still a working copy. The last stdout line names
 * the outcome for a machine:
 *   TRACY_RESULT derived=<bound|unsupported|failed> entities=<n> slots=<n> calibrated=<0|1>
 * `unsupported` = a component older than the operation (`bad_action`, "unknown contract operation", or
 * a receiver that is not wired for it), or no component / token at all.
 */
if (PHP_SAPI !== 'cli') exit(1);

function tracy_derive_result(string $outcome, array $answer = []): void
{
    printf("TRACY_RESULT derived=%s entities=%d slots=%d calibrated=%d\n", $outcome,
        (int) ($answer['entities'] ?? 0), (int) ($answer['slots'] ?? 0), empty($answer['calibrated']) ? 0 : 1);
    exit(0);
}

$label = (string) getenv('TRACY_LABEL');
if (!preg_match('/^[a-z0-9-]{3,80}$/D', $label)) {
    fwrite(STDERR, "!! derive: no usable TRACY_LABEL\n");
    tracy_derive_result('failed');
}

try {
    require '/var/www/html/configuration.php';
    $config = new JConfig();
    $prefix = (string) $config->dbprefix;
    if (!preg_match('/^[a-zA-Z0-9_]+$/D', $prefix)) throw new RuntimeException('invalid table prefix');
    $db = new mysqli($config->host, $config->user, $config->password, $config->db);
    $row = $db->query("SELECT params FROM {$prefix}extensions WHERE type='component' AND element='com_claudecowork'")->fetch_assoc();
} catch (\Throwable $e) {
    fwrite(STDERR, '!! derive: could not read the Cowork component: ' . $e->getMessage() . "\n");
    tracy_derive_result('failed');
}
if (!$row) {
    echo "    derive: no Cowork component on this copy — skipped\n";
    tracy_derive_result('unsupported');
}
$params = json_decode((string) $row['params'], true) ?: [];
$token = (string) ($params['token'] ?? '');
if ($token === '') {
    echo "    derive: the Cowork component on this copy has no token — skipped\n";
    tracy_derive_result('unsupported');
}

// Deriving reads every content row and renders pages to calibrate: minutes on a big site, not seconds.
$ch = curl_init('http://127.0.0.1/index.php?option=com_claudecowork&task=api.exec&format=json');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_TIMEOUT => 600,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode(['token' => $token, 'action' => 'content.contract', 'params' => [
        'operation' => 'derive',
        'label' => $label,
        'requestId' => 'provision-' . $label,
    ]]),
]);
$raw = curl_exec($ch);
$answer = is_string($raw) ? json_decode($raw, true) : null;
if (!is_array($answer)) {
    fwrite(STDERR, '!! derive: the Cowork component did not answer with JSON: '
        . (is_string($raw) ? substr($raw, 0, 300) : curl_error($ch)) . "\n");
    tracy_derive_result('failed');
}
if (!empty($answer['ok']) && !empty($answer['contract'])) {
    printf("    derive: bound to %s%s\n", (string) $answer['contract'], !empty($answer['replayed']) ? ' (request replayed)' : '');
    tracy_derive_result('bound', $answer);
}
$error = (string) ($answer['error'] ?? '');
$message = (string) ($answer['message'] ?? '');
// Older components: no `derive` branch. With no contract they answer `unavailable` before reading the
// operation; with one, "Unknown contract operation".
$old = $error === 'bad_action' || $error === 'unavailable' || stripos($message, 'unknown contract operation') !== false;
fwrite(STDERR, '!! derive: ' . ($old ? 'this Cowork component cannot derive' : 'refused') . ': '
    . substr($error . ($message !== '' ? ' ' . $message : ''), 0, 300) . "\n");
tracy_derive_result($old ? 'unsupported' : 'failed');
