// K6 (client side): the floating chat bubble shows only when the gate SAYS this account switched it
// on. Upstream shows it whenever `/api/dsh-passwords/state` fails ("an API hiccup must not hide the
// chat for good"), which turns Tracy's off-by-default rule (src/tracy/chat-entry.ts) into "on after
// any 5xx": a seat would see a chat with the gate's owner nobody offered it. Unknown means off.
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createElement, type ComponentProps } from 'react';
import * as ReactRuntime from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ChatLauncher } from '../../src/client/chat.tsx';

// chat.tsx is written in JSX compiled as classic React.createElement under the test runner (see
// test/client-chat-fab.test.ts); give it the global it expects.
(globalThis as { React?: typeof ReactRuntime }).React = ReactRuntime;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type StateAnswer = () => Promise<Response>;

/** Mount the bubble with `/api/dsh-passwords/state` answered by `answer`; returns the renderer. */
async function mountWithState(t: TestContext, answer: StateAnswer): Promise<{ renderer: ReactTestRenderer; requests: string[] }> {
  const requests: string[] = [];
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      innerWidth: 1024,
      innerHeight: 768,
      setTimeout: () => 0,
      clearTimeout: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
    const url = String(input);
    requests.push(url);
    if (url.startsWith('/api/dsh-passwords/state')) return answer();
    if (url.startsWith('/gateway/api/messages')) {
      return Response.json({ ok: true, messages: [], me: { id: 1, username: 'tester', role: 'user' } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  let renderer: ReactTestRenderer | undefined;
  const translate = ((key: string) => key) as ComponentProps<typeof ChatLauncher>['t'];
  await act(async () => {
    renderer = create(createElement(ChatLauncher, { t: translate }), { createNodeMock: () => ({ focus() {} }) });
  });
  // Let the state answer (and its json()) settle.
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
  t.after(async () => {
    await act(async () => renderer?.unmount());
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else Reflect.deleteProperty(globalThis, 'window');
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  return { renderer: renderer!, requests };
}

const messageRequests = (requests: string[]) => requests.filter((url) => url.startsWith('/gateway/api/messages')).length;

test('K6: the bubble stays hidden when the state answer is an error', async (t) => {
  const { renderer, requests } = await mountWithState(t, async () =>
    Response.json({ ok: false, error: 'boom' }, { status: 500 }),
  );
  assert.equal(renderer.toJSON(), null, 'a failed state answer must not show the chat');
  assert.equal(messageRequests(requests), 0, 'a hidden bubble reads no messages');
});

test('K6: the bubble stays hidden when the state request itself fails', async (t) => {
  const { renderer, requests } = await mountWithState(t, async () => {
    throw new TypeError('network down');
  });
  assert.equal(renderer.toJSON(), null, 'a failed state request must not show the chat');
  assert.equal(messageRequests(requests), 0, 'a hidden bubble reads no messages');
});

test('K6: the bubble stays hidden when the state answer does not say "on"', async (t) => {
  const { renderer } = await mountWithState(t, async () => Response.json({ ok: true, users: [] }));
  assert.equal(renderer.toJSON(), null, 'a state answer without chatEnabled must not show the chat');
});

test('K6: the bubble shows when the state answer says this account switched it on', async (t) => {
  const { renderer } = await mountWithState(t, async () =>
    Response.json({ ok: true, chatEnabled: true, mediaEnabled: false, users: [] }),
  );
  assert.notEqual(renderer.toJSON(), null, 'chatEnabled: true shows the bubble');
  assert.ok(renderer.root.findByProps({ 'aria-label': 'chat.open' }));
});
