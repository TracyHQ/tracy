// Shared PHP runner for tests whose code under test is PHP (WordPress theme / mu-plugin, Joomla
// plugin). One PHP "session" per test file, never one container per assertion:
//   - a local `php` is used when present;
//   - otherwise ONE long-lived container is started in `before()` and removed in `after()`;
//   - `session.run(cases)` sends every case to a single runner process and returns one result per
//     case, so a file pays the container start once and cases run as plain PHP child processes.
// With neither php nor a docker daemon the file fails when CI is set, and skips with a stated
// reason on a laptop: a test that cannot run must not look green on a runner.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const has = (bin) => spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }).status === 0
// The daemon, not the PATH: a CI runner can have the docker CLI with no socket behind it.
const dockerRuns = () => has('docker') && spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0

/** Runs each case as `php <args>` (stdin/env/cwd optional) and prints a JSON array of results. */
const RUNNER = String.raw`<?php
$cases = json_decode(stream_get_contents(STDIN), true);
$out = [];
foreach ($cases as $c) {
  $tmp = tempnam(getenv('TRACY_PHP_SCRATCH') ?: sys_get_temp_dir(), 'phpcase');
  file_put_contents($tmp . '.in', $c['input'] ?? '');
  $proc = proc_open(
    array_merge([PHP_BINARY], $c['args']),
    [0 => ['file', $tmp . '.in', 'r'], 1 => ['file', $tmp . '.out', 'w'], 2 => ['file', $tmp . '.err', 'w']],
    $pipes,
    $c['cwd'] ?? null,
    array_merge(getenv(), $c['env'] ?? [])
  );
  $status = proc_close($proc);
  $out[] = ['status' => $status, 'stdout' => (string) file_get_contents($tmp . '.out'), 'stderr' => (string) file_get_contents($tmp . '.err')];
  foreach (['', '.in', '.out', '.err'] as $ext) @unlink($tmp . $ext);
}
echo json_encode($out, JSON_INVALID_UTF8_SUBSTITUTE);
`

/**
 * What this host can run. `skip` is `false` when PHP is available, else the reason string to pass
 * as a test's `skip` option. Throws when CI is set and nothing can run PHP.
 */
export function phpSupport() {
  const local = has('php')
  const docker = !local && dockerRuns()
  if (local || docker) return { local, docker, skip: false }
  const why = 'this host has neither `php` on PATH nor a docker daemon answering `docker info`'
  if (process.env.CI) throw new Error(`PHP tests cannot run on CI: ${why}`)
  return { local, docker, skip: `PHP tests need PHP: ${why}` }
}

/**
 * The directory a caller named for temporary files, checked: an absolute path to a directory that
 * exists. `null` when none was named (the system's temporary directory is used, as before); a
 * path that is anything else throws, so a mistyped root is never silently replaced by `/tmp`.
 */
export function scratchRoot(value = process.env.TRACY_TEST_SCRATCH) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error(`scratch root must be an absolute path, got: ${String(value)}`)
  }
  let stat = null
  try {
    stat = statSync(value)
  } catch {
    stat = null
  }
  if (!stat?.isDirectory()) throw new Error(`scratch root is not an existing directory: ${value}`)
  return value
}

/**
 * Starts a session. `files` (optional) is `{ cwd, paths }`: those paths are copied into the
 * container under `/pkg` (a tar on stdin, so it works when the daemon is not on this machine's
 * filesystem); locally they are read in place. `session.root` is where they live for the run.
 *
 * `scratch` (optional) is an existing directory to keep this session's own files in — the runner
 * script and each case's stdin/stdout/stderr files — instead of the system's temporary directory.
 * It needs a local `php`: a container does not see this machine's directory, so asking for one
 * where only docker can run PHP throws instead of quietly writing somewhere else.
 */
export function startPhp({ image = 'php:8.3-cli-alpine', files, scratch = null } = {}) {
  const support = phpSupport()
  if (support.skip) throw new Error(support.skip)
  const root = scratchRoot(scratch)
  if (root && !support.local) {
    throw new Error(
      'BLOCKED: a scratch root needs a local `php` on PATH; this host can only run PHP in a container'
    )
  }
  const dir = mkdtempSync(path.join(root ?? tmpdir(), 'tch-php-'))
  const runnerPath = path.join(dir, 'runner.php')
  writeFileSync(runnerPath, RUNNER)

  let container = null
  if (!support.local) {
    const started = spawnSync('docker', ['run', '-d', '--rm', image, 'sleep', '3600'], { encoding: 'utf8' })
    if (started.status !== 0) throw new Error(`docker run failed: ${started.stderr}`)
    container = started.stdout.trim()
    const copy = (cmd, input) => {
      const r = spawnSync('docker', ['exec', '-i', container, 'sh', '-c', cmd], { input, maxBuffer: 1 << 28 })
      if (r.status !== 0) throw new Error(`docker exec failed: ${r.stderr}`)
    }
    copy('mkdir -p /pkg && cat > /runner.php', RUNNER)
    if (files?.paths?.length) {
      const tar = spawnSync('tar', ['-c', '-C', files.cwd, ...files.paths], {
        env: { ...process.env, COPYFILE_DISABLE: '1' },
        maxBuffer: 1 << 28
      })
      if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`)
      copy('tar -x -C /pkg', tar.stdout)
    }
  }

  const stop = () => {
    if (container) spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' })
    container = null
    rmSync(dir, { recursive: true, force: true })
  }
  // A crashed file must not leave its container behind.
  process.once('exit', stop)

  return {
    /** Where `files.paths` live for this run: `files.cwd` locally, `/pkg` in the container. */
    root: support.local ? files?.cwd : '/pkg',
    stop,
    /**
     * Runs `cases` (`{ args, input?, env?, cwd? }`, run as `php ...args`) in one runner process.
     * Returns `{ status, stdout, stderr }` per case, in order.
     */
    run(cases) {
      const input = JSON.stringify(cases)
      const r = container
        ? spawnSync('docker', ['exec', '-i', container, 'php', '/runner.php'], {
            input,
            encoding: 'utf8',
            maxBuffer: 1 << 28
          })
        : spawnSync('php', [runnerPath], {
            input,
            encoding: 'utf8',
            maxBuffer: 1 << 28,
            ...(root ? { env: { ...process.env, TRACY_PHP_SCRATCH: dir } } : {})
          })
      if (r.status !== 0) throw new Error(`php runner failed: ${r.stderr}${r.stdout}`)
      return JSON.parse(r.stdout)
    }
  }
}
