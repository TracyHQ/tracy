/**
 * Packing a release's webroot (release-joomla.mjs): every archive is written from a tree whose files are
 * 0644 or 0755 and whose directories are 0755 (rule STAB-1). A published archive can carry 0600/0700
 * members (JA Restaurant 1.0.5), which a site unpacked as another user cannot read, and a file the build
 * writes into the tree after an earlier pack (the T4 sheets of a t4SiteCss build) takes the process umask
 * (077 gives 0600). So the modes are set right before each pack, never once for the whole build.
 */
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'

/** Files rw-r--r-- (rwxr-xr-x when anyone could run them), directories rwxr-xr-x, under `dir`. */
export function normaliseModes(dir) {
  execFileSync('chmod', ['-R', 'u=rwX,go=rX', dir])
}

/**
 * `dir` as a new zip at `file` (absolute). zip ADDS to an archive that exists: a rebuild into the same
 * folder kept the earlier build's entries the new webroot does not have (JA Helple, 11/10/2026), so the
 * archive is always written anew.
 */
export function packZip(dir, file) {
  normaliseModes(dir)
  rmSync(file, { force: true })
  execFileSync('zip', ['-q', '-r', '-X', file, '.'], { cwd: dir })
}

/** `dir` as a .tar.gz at `file` (absolute): entries under ./ like the published archive, no macOS metadata. */
export function packTar(dir, file) {
  normaliseModes(dir)
  execFileSync('tar', ['--no-mac-metadata', '-czf', file, '-C', dir, '.'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' }
  })
}
