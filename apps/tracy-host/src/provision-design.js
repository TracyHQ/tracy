/** Freeze the installed EmDash token sources before `done` can hand the site to an agent. */
export const PROVISION_DESIGN_READ = String.raw`
const fs = require('node:fs');
const limit = 64 * 1024;
function read(file, optional = false) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const bytes = Buffer.alloc(limit + 1);
    const size = fs.readSync(fd, bytes, 0, bytes.length, 0);
    if (size > limit) throw new Error('design source exceeds limit');
    return bytes.subarray(0, size).toString('utf8');
  } catch (error) {
    if (optional && error.code === 'ENOENT') return '[]';
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
(async () => {
  const tokensCss = read('/app/src/styles/tokens.css');
  const fontsJson = read('/app/src/fonts.json', true);
  const response = await fetch('http://127.0.0.1:4321/', {
    redirect: 'error', signal: AbortSignal.timeout(5000)
  });
  if (!response.ok || !response.body) throw new Error('home did not answer');
  const stream = response.body.getReader();
  let bytes = Buffer.alloc(0);
  let html;
  try {
    for (;;) {
      const part = await stream.read();
      if (part.done) break;
      bytes = Buffer.concat([bytes, part.value.subarray(0, limit + 1 - bytes.length)]);
      html = /<html\b[^>]*>/i.exec(bytes.toString('utf8'))?.[0];
      if (html || bytes.length > limit) break;
    }
  } finally {
    await stream.cancel();
  }
  if (!html) throw new Error('home root not readable within limit');
  console.log(JSON.stringify({ tokensCss, fontsJson, html }));
})().catch(() => { process.exitCode = 1; });
`

/** No live reread on polling: this answer is stored with the provision job itself. */
export async function provisionDesign({ body, run }) {
  if (body.platform !== 'emdash' || body.fresh !== true || !body.quickstart) return null
  // `label` has already passed provisionArgs; fixed files, origin and argv only.
  try {
    const result = await run({
      script: 'docker',
      args: ['exec', `${body.label}-web-1`, 'node', '-e', PROVISION_DESIGN_READ],
      timeoutMs: 10_000
    })
    if (result.code !== 0 || result.timedOut || !Array.isArray(result.tail)) return null
    const raw = result.tail.join('\n')
    if (Buffer.byteLength(raw) > 512 * 1024) return null
    const design = JSON.parse(raw)
    for (const key of ['tokensCss', 'fontsJson', 'html'])
      if (typeof design?.[key] !== 'string' || Buffer.byteLength(design[key]) > 64 * 1024) return null
    return { tokensCss: design.tokensCss, fontsJson: design.fontsJson, html: design.html }
  } catch {
    // Missing template files or an unreadable root leave the ruler unknown, never guessed.
    return null
  }
}
