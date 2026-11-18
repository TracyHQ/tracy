<?php
/**
 * Trusted provisioner only: put the contract profile a new site is held to into its Claude Cowork
 * component, as root, right after the component is installed and before the bind.
 *
 * Since Claude Cowork for Joomla 0.24.55 the package carries no profiles, only an index
 * (`lib/contracts.json`), and the component fetches the one a site needs on first use into
 * `lib/contracts/<id>` (its `lib/ContractFetch.php`). The provisioner installs the component as
 * root, so that folder is root-owned and the site (www-data) cannot write it: the bind died with
 * `contract_unavailable: cannot create …/lib/contracts/ja-fresco/j6` and left a half-built site.
 * The provisioner is root and online here, so it runs the component's OWN fetch — one source of
 * truth for asset names, the chain of named profiles, the size/sha256 checks and the safe unpack —
 * and the site never has to write into its own code folder.
 *
 * Reads the profile id from TRACY_CONTRACT_ID. Exit 0: the profile (and every profile it names) is
 * on disk, or this component predates fetching (no `lib/ContractFetch.php`: it bundles every
 * profile). Exit 1 with one line on stderr naming the profile and the reason otherwise.
 *
 * Under `TRACY_CONTRACT_FETCH_LIB_ONLY=1` only the functions below are defined, so tests can run it
 * against a lib/ folder of their own with no Joomla under it.
 */
if (PHP_SAPI !== 'cli') exit(1);

/**
 * Profile `$id` on disk in the component whose lib/ is `$lib`, fetched from the release the
 * installed version came from when it is not.
 *
 * @param callable|null $download fn(url, target, bytes, sha256) handed to ContractFetch; tests only
 * @return array{0:string,1:string} [outcome, detail]: outcome is `fetched`, `present`, `bundled`
 *                                   (no fetcher: nothing to do) or `failed` (detail says why)
 */
function tracy_contract_fetch(string $lib, string $id, ?callable $download = null): array
{
    $lib = rtrim($lib, '/');
    if (!preg_match('~^[a-z][a-z0-9-]{1,40}/[a-z][a-z0-9]{0,9}/[0-9]+\.[0-9]+\.[0-9]+$~D', $id))
        return ['failed', 'not a profile id'];
    if (!is_file($lib . '/ContractFetch.php')) return ['bundled', ''];
    require_once $lib . '/ContractFetch.php';

    $manifest = dirname($lib) . '/claudecowork.xml';
    $xml = is_file($manifest) ? @simplexml_load_file($manifest) : false;
    $version = $xml === false ? '' : trim((string) $xml->version);
    $fetch = new \ContractFetch($lib, \ContractFetch::releaseOf($version === '' ? null : $version), [], $download ?? 'tracy_contract_download');
    $before = is_file($fetch->directory($id) . '/manifest.json');

    // A provision is a deliberate attempt: a failure marker an earlier pass left must not turn
    // this one into "retried after 300 s" without trying.
    $contracts = $lib . '/contracts';
    if (is_dir($contracts)) {
        $walk = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($contracts, \FilesystemIterator::SKIP_DOTS));
        foreach ($walk as $file)
            if ($file->isFile() && !$file->isLink() && substr($file->getFilename(), -13) === '.fetch-failed') @unlink($file->getPathname());
    }

    // What root writes here, the site (www-data) must still read: folders 0755, files 0644.
    umask(022);
    $failure = $fetch->ensure($id);
    if ($failure === \ContractFetch::UNKNOWN) return ['failed', 'the component ' . ($version ?: '(unknown version)') . ' does not list it in contracts.json'];
    if ($failure !== null) return ['failed', $failure];
    if (!is_file($fetch->directory($id) . '/manifest.json')) return ['failed', 'no manifest.json on disk after the fetch'];
    return [$before ? 'present' : 'fetched', $version];
}

/** Seconds for one profile download at provision: no request waits on it, unlike the door's 15. */
const TRACY_CONTRACT_DOWNLOAD_TIMEOUT = 120;

/**
 * The GitHub API address of a release asset given by its plain download address
 * (`https://github.com/<owner>/<repo>/releases/download/<tag>/<name>`), or null when it is not
 * one or the release does not list it. `$get` answers the API's JSON for a URL, or null.
 */
function tracy_contract_api_asset(string $url, callable $get): ?string
{
    if (!preg_match('~^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/releases/download/([^/?#]+)/([^/?#]+)$~D', $url, $m))
        return null;
    $repo = $m[1] . '/' . $m[2];
    $release = $get('https://api.github.com/repos/' . $repo . '/releases/tags/' . rawurlencode(rawurldecode($m[3])));
    $name = rawurldecode($m[4]);
    foreach (is_array($release) && is_array($release['assets'] ?? null) ? $release['assets'] : [] as $asset) {
        $api = is_array($asset) ? ($asset['url'] ?? null) : null;
        if (($asset['name'] ?? null) === $name && is_string($api) && strpos($api, 'https://api.github.com/repos/' . $repo . '/releases/assets/') === 0)
            return $api;
    }
    return null;
}

/** The GitHub API's JSON for `$url`, or null. Unauthenticated: the profile releases are public. */
function tracy_contract_api_get(string $url): ?array
{
    $context = stream_context_create(['http' => [
        'timeout' => 20,
        'ignore_errors' => false,
        'header' => "Accept: application/vnd.github+json\r\nUser-Agent: Tracy provision\r\n",
    ]]);
    $raw = @file_get_contents($url, false, $context);
    $json = is_string($raw) ? json_decode($raw, true) : null;
    return is_array($json) ? $json : null;
}

/**
 * How the provisioner downloads a profile for ContractFetch: the component's own PackageDownload
 * (same size and sha256 checks), with the time a provision can afford, and ONCE MORE THROUGH THE
 * GITHUB API when the plain release address fails.
 *
 * Why (08/11/2026): github.com's release download route answered HTTP 504 for whole Claude Cowork
 * releases for hours while api.github.com served the same assets in under a second. quickstart.py
 * already falls back the same way for the quickstart parts (#491); the profile fetch did not, so a
 * demo update prefetched fine and then died at "contract profile ...: not on disk".
 *
 * @param callable|null $toFile fn(url, target, bytes, sha256, curlOptions): PackageDownload::toFile's answer
 * @param callable|null $get    fn(url): the API's JSON, or null
 * @return array{ok:bool,error:?string}
 */
function tracy_contract_download(string $url, string $target, int $bytes, string $sha256, ?callable $toFile = null, ?callable $get = null): array
{
    $toFile = $toFile ?? static function (string $u, string $t, int $b, string $s, array $curl): array {
        return \PackageDownload::toFile($u, $t, $b, $s, $curl, null, TRACY_CONTRACT_DOWNLOAD_TIMEOUT);
    };
    $first = $toFile($url, $target, $bytes, $sha256, []);
    if (!empty($first['ok'])) return $first;
    $api = tracy_contract_api_asset($url, $get ?? 'tracy_contract_api_get');
    if ($api === null) return $first;
    $second = $toFile($api, $target, $bytes, $sha256, \defined('CURLOPT_HTTPHEADER') ? [CURLOPT_HTTPHEADER => ['Accept: application/octet-stream']] : []);
    if (!empty($second['ok'])) return $second;
    return ['ok' => false, 'error' => ($first['error'] ?? 'download failed') . '; through the GitHub API: ' . ($second['error'] ?? 'download failed')];
}

if (getenv('TRACY_CONTRACT_FETCH_LIB_ONLY') === '1') return;

$id = (string) getenv('TRACY_CONTRACT_ID');
[$outcome, $detail] = tracy_contract_fetch('/var/www/html/administrator/components/com_claudecowork/lib', $id);
switch ($outcome) {
    case 'bundled':
        echo "==> contract profile $id: this Claude Cowork component bundles its profiles, nothing to fetch\n";
        exit(0);
    case 'present':
        echo "==> contract profile $id: already on disk\n";
        exit(0);
    case 'fetched':
        echo "==> contract profile $id: fetched from the joomla-v$detail release\n";
        exit(0);
}
// php://stderr, not STDERR: a script read from stdin (`php < file`) has no STDERR constant.
// `contract-fetch:` is what tracy-web's `failureReason` reads as this step's own reason.
file_put_contents('php://stderr', "!! contract-fetch: profile $id could not be put on disk: " . str_replace(["\r", "\n"], ' ', $detail) . "\n");
exit(1);
