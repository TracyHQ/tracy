/**
 * Tracy's DSH fork identity: `0.2.0-rc.<n>-tracy.<m>` (vendor/tracy/deepseek-harness in TCH),
 * build metadata ignored. Upstream's gate (cli.ts `isSupportedDshRuntime`) accepts only the
 * 0.2.1 patch line; this one named exception lets the fleet's DSH through and nothing else:
 * plain upstream 0.2.0 builds and any other `-tracy` shape stay refused.
 */
const TRACY_DSH_RE = /^0\.2\.0-rc\.(?:0|[1-9]\d*)-tracy\.(?:0|[1-9]\d*)$/;

export function isTracyDshRuntime(version: string): boolean {
  const plus = version.indexOf('+');
  return TRACY_DSH_RE.test(plus === -1 ? version : version.slice(0, plus));
}
