import * as Y from 'yjs';

export function encode(doc) {
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
}

export function clone(doc) {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return copy;
}

export function filesFrom(doc) {
  const result = {};
  for (const [id, file] of doc.getMap('files')) {
    if (!(file instanceof Y.Map) || !(file.get('text') instanceof Y.Text)) {
      throw new Error('Unsupported shared document structure');
    }
    if ([...file.keys()].some(k => !['path', 'text'].includes(k))) {
      throw new Error('Unsupported file fields');
    }
    result[id] = { path: file.get('path'), content: file.get('text').toString() };
  }
  if ([...doc.share.keys()].some(k => k !== 'files')) throw new Error('Unsupported document');
  return result;
}

export function replaceFiles(doc, files) {
  const map = doc.getMap('files');
  doc.transact(() => {
    for (const id of map.keys()) if (!files[id]) map.delete(id);
    for (const [id, entry] of Object.entries(files)) {
      let file = map.get(id);
      if (!file) {
        file = new Y.Map();
        file.set('path', entry.path);
        file.set('text', new Y.Text(entry.content));
        map.set(id, file);
      } else {
        file.set('path', entry.path);
        const text = file.get('text');
        // Preserve existing CRDT identity and unaffected positions with a minimal splice.
        const before = text.toString(), after = entry.content;
        let prefix = 0, suffix = 0;
        while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
        while (suffix < before.length - prefix && suffix < after.length - prefix &&
               before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
        const remove = before.length - prefix - suffix;
        if (remove) text.delete(prefix, remove);
        const insert = after.slice(prefix, after.length - suffix);
        if (insert) text.insert(prefix, insert);
      }
    }
  });
}

export function assertTextOnly(before, after) {
  if (JSON.stringify(Object.keys(before).sort()) !== JSON.stringify(Object.keys(after).sort())) {
    throw new Error('Use file commands to create or delete files');
  }
  for (const id of Object.keys(before)) {
    if (before[id].path !== after[id].path) throw new Error('Use Rename to change a file path');
  }
}
