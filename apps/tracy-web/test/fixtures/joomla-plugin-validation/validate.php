<?php
// Test adapter only. All value, picture and HTML rules below come from the plugin's pinned PHP.
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
foreach ($input['sources'] as $name => $source) {
    if ($name === 'QuickstartContract.php') continue;
    eval(preg_replace('/^require_once .*;\s*$/m', '', preg_replace('/^<\?php/', '', $source)));
}
eval('class QuickstartContract { public string $root; private bool $derivedMode = false; private const DERIVED_LINK_BYTES = 2048; ' . $input['sources']['QuickstartContract.php'] . ' }');
$contract = new QuickstartContract();
$contract->root = sys_get_temp_dir() . '/joomla-validator-' . bin2hex(random_bytes(8));
mkdir($contract->root);
$errors = [];
try {
    foreach ($input['files'] ?? [] as $file => $bytes) {
        if (!preg_match('~^images/[a-zA-Z0-9/_.-]+$~D', $file) || in_array('..', explode('/', $file), true)) throw new RuntimeException('Invalid test media path');
        $target = $contract->root . '/' . $file;
        if (!is_dir(dirname($target))) mkdir(dirname($target), 0777, true);
        file_put_contents($target, base64_decode($bytes, true));
    }
    $method = new ReflectionMethod(QuickstartContract::class, 'checkValue');
    $slots = array_column($input['slots'], null, 'key');
    foreach ($input['params']['changes'] ?? [] as $key => $value) {
        try {
            if (!isset($slots[$key]) || !is_string($value)) throw new ContractProblem('SLOT_UNKNOWN', 'Unknown content slot or non-string value', $key);
            $method->invoke($contract, $slots[$key], $value, $input['params']);
        } catch (ContractProblem $error) { $errors[] = $error->toArray(); }
    }
    $rows = $input['rows'] ?? [];
    $read = new ReflectionMethod(QuickstartContract::class, 'currentValue');
    $write = new ReflectionMethod(QuickstartContract::class, 'changeRow');
    foreach ($rows as $entity => $row) {
        $known = array_values(array_filter($input['slots'], fn($slot) => ($slot['entity'] ?? null) === $entity && isset($slot['column']) && array_key_exists($slot['column'], $row)));
        try {
            if (!empty($input['inspect'])) {
                $parsed = [];
                foreach ($known as $slot) $read->invokeArgs($contract, [$row, $slot, &$parsed]);
            } elseif (!$errors) $rows[$entity] = $write->invoke($contract, $row, $known, $input['params']['changes'] ?? []);
        } catch (RuntimeException $error) { $errors = array_merge($errors, ContractProblem::errorsOf($error)); }
    }
    // Run HTML writes together, in order: an earlier whole-unit write can invalidate a later text path.
    $html = [];
    foreach ($input['html'] ?? [] as $record) {
        try { $html[] = ContentSlots::htmlPatch($record['body'], $record['changes']); }
        catch (RuntimeException $error) { $errors[] = ContractProblem::plain('CONTRACT_FAILED', $error->getMessage()); }
    }
    echo json_encode(['errors' => $errors, 'html' => $html, 'rows' => $rows], JSON_THROW_ON_ERROR);
} finally {
    $remove = function ($dir) use (&$remove) {
        foreach (scandir($dir) as $name) {
            if ($name === '.' || $name === '..') continue;
            $file = $dir . '/' . $name;
            if (is_dir($file)) $remove($file); else unlink($file);
        }
        rmdir($dir);
    };
    $remove($contract->root);
}
