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
 * Under `TRACY_CONTRACT_FETCH_LIB_ONLY=1` only the function below is defined, so tests can run it
 * against a lib/ folder of their own with no Joomla under it.
 */
if (PHP_SAPI !== 'cli') exit(1);

/**
 * Profile `$id` on disk in the component whose lib/ is `$lib`, fetched from the release the
 * installed version came from when it is not.
 *
 * @return array{0:string,1:string} [outcome, detail]: outcome is `fetched`, `present`, `bundled`
 *                                   (no fetcher: nothing to do) or `failed` (detail says why)
 */
function tracy_contract_fetch(string $lib, string $id): array
{
    $lib = rtrim($lib, '/');
    if (!preg_match('~^[a-z][a-z0-9-]{1,40}/[a-z][a-z0-9]{0,9}/[0-9]+\.[0-9]+\.[0-9]+$~D', $id))
        return ['failed', 'not a profile id'];
    if (!is_file($lib . '/ContractFetch.php')) return ['bundled', ''];
    require_once $lib . '/ContractFetch.php';

    $manifest = dirname($lib) . '/claudecowork.xml';
    $xml = is_file($manifest) ? @simplexml_load_file($manifest) : false;
    $version = $xml === false ? '' : trim((string) $xml->version);
    $fetch = new \ContractFetch($lib, \ContractFetch::releaseOf($version === '' ? null : $version));
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
file_put_contents('php://stderr', "!! contract profile $id could not be put on disk: " . str_replace(["\r", "\n"], ' ', $detail) . "\n");
exit(1);
