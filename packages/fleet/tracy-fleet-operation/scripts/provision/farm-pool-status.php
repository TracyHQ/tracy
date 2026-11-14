<?php
// One demo pool's own status, asked over its FastCGI socket inside tracy-demos-web: how many of its
// PHP workers are busy with a request other than this one. Run by farm-common.sh `farm_pool_drain`:
//
//   docker exec -i -u 0 tracy-demos-web php -n -- /run/tracy-demos/<label>.sock < farm-pool-status.php
//
// As root: the socket is Apache's user's alone (0600, web/demos.Dockerfile), and no PHP worker may
// open it. `-n`: no php.ini, so nothing of a pool's settings applies to this client.
//
// Prints `busy=<n> pids=<pid,pid,…>` (every worker of the pool) and exits 0, or exits 1 when the pool
// answers no status (a pool rendered before `pm.status_path`, or none at all). The status path is
// served by FPM itself, only through the socket: the vhost hands Apache's requests to it for `.php`
// files only, so no visitor reaches it.
if (PHP_SAPI !== 'cli' || $argc !== 2) exit(2);
$sock = @stream_socket_client('unix://' . $argv[1], $errno, $error, 5);
if (!$sock) exit(1);
stream_set_timeout($sock, 10);

$record = static fn(int $type, string $body): string =>
    pack('CCnnCx', 1, $type, 1, strlen($body), 0) . $body;
$pair = static function (string $k, string $v): string {
    $len = static fn(int $n): string => $n < 128 ? chr($n) : pack('N', $n | 0x80000000);
    return $len(strlen($k)) . $len(strlen($v)) . $k . $v;
};
$params = '';
foreach ([
    'SCRIPT_NAME' => '/fpm-status',
    'SCRIPT_FILENAME' => '/fpm-status',
    'REQUEST_URI' => '/fpm-status',
    'QUERY_STRING' => 'json&full',
    'REQUEST_METHOD' => 'GET',
] as $k => $v) {
    $params .= $pair($k, $v);
}
fwrite($sock, $record(1, pack('nCx5', 1, 0)) . $record(4, $params) . $record(4, '') . $record(5, ''));

$out = '';
while (!feof($sock)) {
    $head = fread($sock, 8);
    if ($head === false || strlen($head) < 8) break;
    $h = unpack('Cversion/Ctype/nid/nlength/Cpadding/x', $head);
    $body = $h['length'] > 0 ? stream_get_contents($sock, $h['length']) : '';
    if ($h['padding'] > 0) fread($sock, $h['padding']);
    if ($h['type'] === 6) $out .= $body;
    if ($h['type'] === 3) break;
}
fclose($sock);

$json = substr($out, strpos($out, "\r\n\r\n") !== false ? strpos($out, "\r\n\r\n") + 4 : 0);
$status = json_decode($json, true);
if (!is_array($status) || !isset($status['processes'])) exit(1);
$busy = 0;
$pids = [];
foreach ($status['processes'] as $p) {
    $pids[] = (int) $p['pid'];
    if ($p['state'] !== 'Idle' && !str_starts_with((string) ($p['request uri'] ?? ''), '/fpm-status')) $busy++;
}
echo 'busy=' . $busy . ' pids=' . implode(',', $pids) . "\n";
