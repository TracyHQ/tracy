// Upstream's own stream suites, run with the Tracy policy ON (this runner preloads nothing, so the
// default is `tracyPolicy`): H8 must leave upstream's SSE framing (CRLF, bare CR, UTF-8 split
// across chunks, bounded buffers, lifecycle) exactly as it was, and H4/H5 the carrier's
// backpressure. The files are imported, not copied, so a change upstream reaches this run too.
//
// macOS: upstream's "Issue #20: 并行 SSE 连接互不影响对方工作区快照" is red on darwin under the
// pass-through policy as well (ECONNRESET from the mock, `baseline-upstream.log`), so the import is
// made on Linux only (`test-linux.sh`, CI); on darwin one skipped case says why.
import { test } from 'node:test';

if (process.platform === 'darwin') {
  test('H8/H5: upstream gateway-events-proxy and remote-mux-backpressure under the Tracy policy', {
    skip: 'Linux only: one upstream case of gateway-events-proxy is red on macOS at baseline (ECONNRESET), Tracy layer or not',
  }, () => {});
} else {
  await import('../gateway-events-proxy.test.ts');
  await import('../remote-mux-backpressure.test.ts');
}
