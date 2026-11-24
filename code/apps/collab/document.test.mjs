import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { assertTextOnly, clone, encode, filesFrom, replaceFiles } from './document.mjs';

test('concurrent text edits merge, replay is idempotent, binary reload preserves identity', () => {
  const server = new Y.Doc();
  replaceFiles(server, { one: { path: 'app.py', content: 'hello' } });
  const a = clone(server), b = clone(server);
  a.getMap('files').get('one').get('text').insert(5, ' Alice');
  b.getMap('files').get('one').get('text').insert(5, ' Bob');
  const updateA = Y.encodeStateAsUpdate(a), updateB = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, updateB); Y.applyUpdate(b, updateA); Y.applyUpdate(a, updateB);
  assert.deepEqual(filesFrom(a), filesFrom(b));
  assert.match(filesFrom(a).one.content, /Alice/); assert.match(filesFrom(a).one.content, /Bob/);
  const restored = new Y.Doc(); Y.applyUpdate(restored, Buffer.from(encode(a), 'base64'));
  assert.deepEqual(filesFrom(restored), filesFrom(a));
});

test('file commands preserve text identity and raw structural updates are refused', () => {
  const doc = new Y.Doc(); replaceFiles(doc, { one: { path: 'app.py', content: 'hello' } });
  const text = doc.getMap('files').get('one').get('text');
  replaceFiles(doc, { one: { path: 'main.py', content: 'hello world' } });
  assert.equal(text, doc.getMap('files').get('one').get('text'));
  assert.throws(() => assertTextOnly({ one: { path: 'app.py' } }, filesFrom(doc)));
  assert.throws(() => assertTextOnly(filesFrom(doc), {}));
});
