// K5 (client half), the owner's delete-folder button: the button can only be drawn for a row whose
// absolute path was read off dsh's own `POST /api/directoryPicker/list` answer, so the picker
// watches the page's requests for that one path. Under a mount (`<base href="/<site>/">`, `/new/`)
// dsh's client sends it as `/<site>/api/directoryPicker/list`, and an exact comparison with the
// root path never matched: no listing was captured and the owner never saw a delete button
// (2.7.7-tracy.8, hook H17 left this line as it was). The comparison now strips the page's mount
// first, the way the gateway strips it from `req.url` (H0), and stays exact — never a suffix match.
//
// Observable without a DOM: the picker reads a captured listing through `response.clone()`, and it
// clones only a response it decided is a listing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startPickerDelete } from '../../src/client/picker-delete.ts';
import { dshPathOf } from '../../src/client/tracy/page-base.ts';

const g = globalThis as Record<string, unknown>;

function page(baseHref: string | null, href: string): void {
  g.document = {
    head: null,
    documentElement: null,
    querySelector: (sel: string) =>
      sel === 'base[href]' && baseHref !== null ? { getAttribute: () => baseHref } : null,
  };
  g.location = { href };
}

/** A listing answer that records whether the picker read it. */
function listingAnswer(): { response: Response; cloned: () => number } {
  let clones = 0;
  const response = Response.json({ type: 'server-response', result: { ok: true, value: {} } });
  const clone = response.clone.bind(response);
  Object.defineProperty(response, 'clone', {
    value: () => {
      clones += 1;
      return clone();
    },
  });
  return { response, cloned: () => clones };
}

/** Let the wrapped fetch's `.then` run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('K5: dshPathOf strips the page mount and leaves a root page alone', () => {
  page(null, 'https://host.example/');
  assert.equal(dshPathOf('/api/directoryPicker/list'), '/api/directoryPicker/list');
  page('/alpha.example/', 'https://host.example/alpha.example/s/1');
  assert.equal(dshPathOf('/alpha.example/api/directoryPicker/list'), '/api/directoryPicker/list');
  assert.equal(dshPathOf('/alpha.example/'), '/');
  assert.equal(dshPathOf('/alpha.example'), '/', 'the mount without its slash is the mount root');
  assert.equal(
    dshPathOf('/alpha.examplex/api/directoryPicker/list'),
    '/alpha.examplex/api/directoryPicker/list',
    'a sibling path that only starts with the same letters is not under the mount',
  );
  assert.equal(dshPathOf('/other/api/x'), '/other/api/x', 'a path outside the mount is left as it is');
  delete g.document;
  delete g.location;
  assert.equal(dshPathOf('/x/api'), '/x/api', 'no page, no mount');
});

test('K5: the owner\'s picker reads dsh\'s directory listing under a mount, at the root, and nothing else', async (t) => {
  // The owner probe: startPickerDelete asks the state door before wrapping anything.
  page('/alpha.example/', 'https://host.example/alpha.example/');
  const answers: Response[] = [];
  const pageFetch = async () => answers.shift() ?? Response.json({});
  g.fetch = async () => Response.json({ me: { role: 'admin' } });
  g.window = { fetch: pageFetch, location: g.location };
  t.after(() => {
    delete g.window;
    delete g.document;
    delete g.location;
    delete g.fetch;
  });
  startPickerDelete();
  await settle();
  const win = g.window as { fetch: typeof fetch; location: unknown };
  assert.notEqual(win.fetch, pageFetch, 'an owner page wraps window.fetch');

  async function listed(url: string, method = 'POST'): Promise<boolean> {
    const answer = listingAnswer();
    answers.push(answer.response);
    await win.fetch(url, { method });
    await settle();
    return answer.cloned() > 0;
  }

  // Under the site mount: the request dsh's client actually sends.
  assert.equal(await listed('https://host.example/alpha.example/api/directoryPicker/list'), true);
  assert.equal(await listed('/alpha.example/api/directoryPicker/list'), true);
  // Still exact: a GET, another path, a longer path ending in the same words.
  assert.equal(await listed('https://host.example/alpha.example/api/directoryPicker/list', 'GET'), false);
  assert.equal(await listed('https://host.example/alpha.example/api/session/list'), false);
  assert.equal(await listed('https://host.example/alpha.example/x/api/directoryPicker/list'), false);

  // The creation workspace mount.
  page('/new/', 'https://host.example/new/s/session-1');
  win.location = g.location;
  assert.equal(await listed('https://host.example/new/api/directoryPicker/list'), true);

  // A page at the root (a dsh published without a mount) keeps upstream's behaviour.
  page(null, 'https://host.example/');
  win.location = g.location;
  assert.equal(await listed('/api/directoryPicker/list'), true);
  assert.equal(await listed('https://host.example/alpha.example/api/directoryPicker/list'), false);
});
