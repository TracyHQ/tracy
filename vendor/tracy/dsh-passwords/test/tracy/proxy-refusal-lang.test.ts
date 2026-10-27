// The proxy's own refusal pages speak the visitor's language, all eight of them (H9), not only
// upstream's zh/en: a German seat refused for a too-large body reads German.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness, type Person } from './gateway-harness.js';
import { t } from '../../src/tracy/i18n/index.js';

let h: Harness;
let seat: Person;

before(async () => {
  h = await startHarness();
  seat = h.seat('lang-seat', { folders: ['/work/allowed'] });
});
after(async () => { await h.close(); });

for (const lang of ['de', 'vi', 'fr', 'zh'] as const) {
  test(`H9: a seat refused by the proxy for a too-large body reads the page in ${lang}`, async () => {
    const res = await h.send('POST', `/api/session.prompt?lang=${lang}`, seat, '{}', { 'content-length': String(65 * 1024 * 1024), connection: 'close' });
    assert.equal(res.status, 413, res.body);
    assert.ok(res.body.includes(t(lang, 'gw.bodyTooLarge')), `${lang}: ${res.body.slice(0, 300)}`);
    assert.equal(h.reached('/api/session.prompt'), 0, 'dsh never sees the refused request');
  });
}
