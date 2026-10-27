// K5 (client half): the settings card and chat build every dsh/gateway URL under the mount the
// page's base tag names, so a dsh published at `https://host/<site>/` is not sent to the host's
// bare root. No test covered this in the 2.6.6 fork.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dshUrl, pageBase } from '../../src/client/tracy/page-base.ts';

function withPage(baseHref: string | null, href: string, run: () => void): void {
  const g = globalThis as Record<string, unknown>;
  g.document = { querySelector: (sel: string) => (sel === 'base[href]' && baseHref !== null ? { getAttribute: () => baseHref } : null) };
  g.location = { href };
  try {
    run();
  } finally {
    delete g.document;
    delete g.location;
  }
}

test('K5: with no page (tests, non-browser callers) a path stays root-relative', () => {
  assert.equal(pageBase(), '');
  assert.equal(dshUrl('/gateway/api/me'), '/gateway/api/me');
});

test('K5: a page without a base tag is at the root: paths are left as they are', () => {
  withPage(null, 'https://host.example/', () => {
    assert.equal(pageBase(), '');
    assert.equal(dshUrl('/api/sessions'), '/api/sessions');
  });
});

test('K5: a mounted page puts gateway and dsh paths under its mount', () => {
  withPage('/alpha/', 'https://host.example/alpha/chat', () => {
    assert.equal(pageBase(), 'https://host.example/alpha/');
    assert.equal(dshUrl('/gateway/api/usage/report'), 'https://host.example/alpha/gateway/api/usage/report');
    assert.equal(dshUrl('api/x'), 'https://host.example/alpha/api/x');
  });
  withPage('https://host.example/beta', 'https://host.example/beta/', () => {
    assert.equal(pageBase(), 'https://host.example/beta/', 'a mount without its trailing slash is still a folder');
  });
});

test('K5: a base tag that is not a URL is no mount', () => {
  withPage('http://[bad', 'https://host.example/', () => {
    assert.equal(pageBase(), '');
    assert.equal(dshUrl('/api/x'), '/api/x');
  });
});
