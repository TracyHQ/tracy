<?php
// Initialize a missing derived binding, then capture from the imported COPY's own plugin.
// Never accepts a remote endpoint or token; only the import-only host collector invokes this.
if (PHP_SAPI !== 'cli') exit(1);
// This short-lived collector boots WordPress plus a bounded content graph. Keep a finite
// CLI-only budget without changing php.ini or the customer's web request memory limit.
ini_set('memory_limit', '256M');
try {
    $platform = getenv('TRACY_IMPORT_PLATFORM');
    $label = (string) getenv('TRACY_IMPORT_LABEL');
    if (!preg_match('/^[a-z0-9-]{3,80}$/D', $label)) throw new RuntimeException('Invalid copy label');
    $root = '/var/www/html';
    if ($platform === 'wordpress') {
        ob_start(); require $root . '/wp-load.php'; ob_end_clean();
        $token = (string) get_option('claude_cowork_token', '');
        $endpoint = 'http://127.0.0.1/wp-admin/admin-ajax.php?action=claude_cowork';
        $metadata = ['cms_version' => $GLOBALS['wp_version'], 'theme' => get_stylesheet()];
    } elseif ($platform === 'joomla') {
        require $root . '/configuration.php';
        $config = new JConfig();
        if (!preg_match('/^[a-zA-Z0-9_]+$/D', $config->dbprefix)) throw new RuntimeException('Invalid table prefix');
        $db = new mysqli($config->host, $config->user, $config->password, $config->db);
        $prefix = $config->dbprefix;
        $row = $db->query("SELECT params FROM {$prefix}extensions WHERE type='component' AND element='com_claudecowork'")->fetch_assoc();
        $params = json_decode($row['params'] ?? '{}', true);
        $token = (string) ($params['token'] ?? '');
        $endpoint = 'http://127.0.0.1/index.php?option=com_claudecowork&task=api.exec&format=json';
        $theme = $db->query("SELECT template FROM {$prefix}template_styles WHERE client_id=0 AND home='1'")->fetch_assoc();
        $metadata = ['template' => $theme['template'] ?? null];
    } else { throw new RuntimeException('Unsupported import CMS'); }
    if ($token === '') throw new RuntimeException('No Claude Cowork plugin token on copy');
    $call = static function (string $action, array $params = [], bool $allowRefusal = false) use ($endpoint, $token): array {
        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 300,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode(['token' => $token, 'action' => $action, 'params' => $params])]);
        $raw = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $transportError = curl_errno($ch);
        $answer = is_string($raw) ? json_decode($raw, true) : null;
        curl_close($ch);
        if ($transportError !== 0 || $status < 200 || $status >= 300 || !is_array($answer)
            || isset($answer['error']) || ($answer['ok'] ?? true) === false) {
            // Inspect alone may report an absent binding. Content API errors have no `ok`
            // property, so checking only ok:false would silently publish an empty page map.
            if ($allowRefusal && $transportError === 0 && $status >= 200 && $status < 300 && is_array($answer)) return $answer;
            $error = is_array($answer) ? ($answer['error'] ?? 'refused') : 'invalid_json';
            $code = is_array($error) ? ($error['code'] ?? 'refused') : $error;
            if (!is_string($code) || !preg_match('/^[A-Za-z0-9_:-]{1,80}$/D', $code)) $code = 'refused';
            throw new RuntimeException('Claude Cowork plugin refused ' . $action . ' (' . $code . ')');
        }
        if ($allowRefusal && is_array($answer)) return $answer;
        if ($action === 'content.read' && (($answer['schemaVersion'] ?? null) !== 'tracy-content/v1'
            || !isset($answer['contents']) || !is_array($answer['contents'])
            || !is_string($answer['snapshot']['revision'] ?? null))) {
            throw new RuntimeException('Claude Cowork plugin returned an invalid content envelope');
        }
        return $answer;
    };
    if ($platform === 'wordpress') {
        // Upgrades/imports may have no reader identity yet. Preserve existing IDs (`newSite`
        // false); the existing provision-only API adds missing metadata on this COPY only.
        $call('content.identity', ['newSite' => false, 'requestId' => 'provision-' . $label]);
    }
    $inspect = $call('content.contract', ['operation' => 'inspect'], true);
    if (($inspect['ok'] ?? false) !== true || strpos($inspect['contract'] ?? '', 'derived/') !== 0
        || ($inspect['bound'] ?? true) === false) {
        // Reuse provisioning's retry identity. Existing derived binds replay; a quickstart bind
        // refuses replacement at the plugin. This writes binding metadata, never source content.
        $derived = $call('content.contract', ['operation' => 'derive', 'label' => $label,
            'requestId' => 'provision-' . $label]);
        $inspect = $call('content.contract', ['operation' => 'inspect']);
        if (isset($derived['calibrated'])) $inspect['calibrated'] = (bool) $derived['calibrated'];
    }
    if (strpos($inspect['contract'] ?? '', 'derived/') !== 0) throw new RuntimeException('Copy is not bound to a derived contract');
    $content = $call('content.read', ['limit' => 100]);
    // Bound work: preserve nextCursor and report incomplete rather than pretending the whole site was captured.
    for ($i = 0; $i < 4 && !empty($content['pagination']['nextCursor']); $i++) {
        $next = $call('content.read', ['limit' => 100, 'cursor' => $content['pagination']['nextCursor']]);
        if (($next['snapshot']['revision'] ?? null) !== ($content['snapshot']['revision'] ?? null))
            throw new RuntimeException('Content changed during capture; retry');
        $content['contents'] = array_merge($content['contents'] ?? [], $next['contents'] ?? []);
        $content['pagination'] = $next['pagination'] ?? ['nextCursor' => 'unknown'];
    }
    // Listings intentionally omit fields. Batch details once per group, instead of one tool call per page.
    $details = []; $pending = []; $missing = [];
    $ids = array_column($content['contents'] ?? [], 'id');
    foreach (array_chunk($ids, 50) as $group) {
        $batch = $call('content.read', ['ids' => $group, 'maxBytes' => 262144]);
        if (($batch['snapshot']['revision'] ?? null) !== ($content['snapshot']['revision'] ?? null))
            throw new RuntimeException('Content changed during capture; retry');
        foreach ($batch['contents'] ?? [] as $record) $details[$record['id']] = $record;
        $pending = array_merge($pending, $batch['pagination']['pending'] ?? []);
        $missing = array_merge($missing, $batch['pagination']['missing'] ?? []);
    }
    // Retry budget-deferred details in smaller batches, with a fixed ceiling for large imports.
    $retry = $pending; $pending = [];
    foreach (array_chunk($retry, 10) as $at => $group) {
        if ($at >= 10) { $pending = array_merge($pending, $group); continue; }
        $batch = $call('content.read', ['ids' => $group, 'maxBytes' => 262144]);
        if (($batch['snapshot']['revision'] ?? null) !== ($content['snapshot']['revision'] ?? null))
            throw new RuntimeException('Content changed during capture; retry');
        foreach ($batch['contents'] ?? [] as $record) $details[$record['id']] = $record;
        $pending = array_merge($pending, $batch['pagination']['pending'] ?? []);
        $missing = array_merge($missing, $batch['pagination']['missing'] ?? []);
    }
    foreach ($content['contents'] ?? [] as $at => $record) {
        if (isset($details[$record['id']])) $content['contents'][$at] = $details[$record['id']];
    }
    $content['pagination']['pending'] = $pending;
    $content['pagination']['missing'] = $missing;
    // Contract and content use different revision domains. Re-inspect the contract to ensure
    // that its slots did not change while the independently revisioned graph was captured.
    $finalInspect = $call('content.contract', ['operation' => 'inspect']);
    if (($finalInspect['contract'] ?? null) !== ($inspect['contract'] ?? null)
        || ($finalInspect['revision'] ?? null) !== ($inspect['revision'] ?? null))
        throw new RuntimeException('Contract changed during capture; retry');
    echo json_encode(['inspect' => $inspect, 'content' => $content, 'info' => $metadata], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    // Never include plugin payloads, configuration or tokens in errors.
    fwrite(STDERR, "Import contract capture failed: " . $e->getMessage() . "\n");
    exit(1);
}
