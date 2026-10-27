// Q11: the gate, not the client, says who typed a prompt — for every account, the master included.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPromptRequest, requestArguments, stampPrompter } from '../../src/tracy/prompter.js';

const seat = { username: 'sbee_abc', email: 'Bee@Team.test' };

test("Q11: a seat holder's prompt carries who typed it; a prompter the client claims is replaced", () => {
  const sent = { sessionId: 's1', content: [{ type: 'text', text: 'hi' }], prompter: { user: 'root', email: 'ceo@team.test' } };
  const stamped = stampPrompter(sent, seat) as Record<string, unknown>;
  assert.deepEqual(stamped.prompter, { user: 'sbee_abc', email: 'bee@team.test' });
  assert.deepEqual(stamped.content, sent.content);
  assert.deepEqual(sent.prompter, { user: 'root', email: 'ceo@team.test' }, 'the parsed body is not mutated');
});

test('Q11: the master account is stamped too, with no email', () => {
  const stamped = stampPrompter({ sessionId: 's1' }, { username: 'root', email: null }) as Record<string, unknown>;
  assert.deepEqual(stamped.prompter, { user: 'root', email: null });
});

test('Q11: on the real wire the stamp goes INSIDE the envelope, where the Host reads its arguments', () => {
  const sent = {
    type: 'client-request',
    rpcId: 'rpc-1',
    method: 'session/prompt',
    payload: { args: { request: { sessionId: 's1', content: [{ type: 'text', text: 'hi' }] } } },
  };
  const body = stampPrompter(sent, seat) as typeof sent & { prompter?: unknown };
  assert.equal(body.type, 'client-request');
  assert.equal(body.prompter, undefined, 'nothing is written at the envelope level');
  assert.deepEqual(Object.keys(body.payload), ['args']);
  assert.deepEqual(Object.keys(body.payload.args), ['request']);
  assert.deepEqual((body.payload.args.request as Record<string, unknown>).prompter, { user: 'sbee_abc', email: 'bee@team.test' });
});

test('Q11: a body with no argument object has nowhere to stamp — null, the caller refuses or forwards as is', () => {
  assert.equal(stampPrompter(null, seat), null);
  assert.equal(stampPrompter([1, 2], seat), null);
  assert.equal(stampPrompter({ type: 'client-request', payload: { args: [] } }, seat), null);
});

test('Q11: requestArguments reads the named `request` parameter, else loose args, else the body itself', () => {
  assert.deepEqual(requestArguments({ type: 'client-request', payload: { args: { request: { a: 1 } } } }), { a: 1 });
  assert.deepEqual(requestArguments({ type: 'client-request', payload: { args: { a: 2 } } }), { a: 2 });
  assert.deepEqual(requestArguments({ a: 3 }), { a: 3 });
  assert.equal(requestArguments({ type: 'client-request', payload: null }), null);
  assert.equal(requestArguments('x'), null);
});

test('Q11: only POST to the prompt endpoint is stamped, in both separator spellings', () => {
  assert.equal(isPromptRequest('POST', '/api/session.prompt'), true);
  assert.equal(isPromptRequest('POST', '/api/session/prompt'), true);
  assert.equal(isPromptRequest('GET', '/api/session/prompt'), false);
  assert.equal(isPromptRequest('POST', '/api/session.history'), false);
  assert.equal(isPromptRequest('POST', '/api/session/prompts'), false);
});
