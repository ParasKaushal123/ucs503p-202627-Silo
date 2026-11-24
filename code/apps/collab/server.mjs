import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { assertTextOnly, clone, encode, filesFrom, replaceFiles } from './document.mjs';

const PORT = Number(process.env.COLLAB_PORT || 1234);
const API = process.env.SILO_API_URL || 'http://127.0.0.1:8000';
const SECRET = process.env.COLLAB_SERVICE_SECRET;
const ALLOWED = (process.env.WEB_ORIGIN || 'http://localhost:3000').split(',');
if (!SECRET) throw new Error('COLLAB_SERVICE_SECRET is required');
const rooms = new Map();
const loading = new Map();
const send = (socket, data) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
};

async function api(path, body) {
  const res = await fetch(API + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Silo-Service': SECRET },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(typeof data.detail === 'string' ? data.detail : 'Workspace request failed');
    error.status = res.status;
    throw error;
  }
  return data;
}

function queue(room, operation) {
  const task = room.queue.then(operation);
  room.queue = task.catch(() => {});
  return task;
}

async function loadRoom(info, ticket) {
  const key = info.id + ':' + info.generation;
  if (rooms.has(key)) return rooms.get(key);
  if (loading.has(key)) return loading.get(key);
  const promise = (async () => {
    const doc = new Y.Doc();
    if (info.state) Y.applyUpdate(doc, Buffer.from(info.state, 'base64'));
    else replaceFiles(doc, info.files);
    const room = { key, doc, id: info.id, generation: info.generation, revision: info.revision, source_hash: info.source_hash,
                   sockets: new Set(), queue: Promise.resolve(), acknowledgements: new Map() };
    // Initial state must be persisted too, including when the first participant is read-only.
    // The API permits initialize only when source content is exactly unchanged.
    if (!info.state) {
      const result = await api('/internal/collab/commit', {
        ticket, generation: room.generation, revision: room.revision,
        state: encode(doc), files: filesFrom(doc), action: 'initialize',
      });
      room.revision = result.revision;
      room.source_hash = result.source_hash;
    }
    rooms.set(key, room);
    return room;
  })();
  loading.set(key, promise);
  try { return await promise; } finally { loading.delete(key); }
}

function broadcast(room, message, except) {
  for (const peer of room.sockets) if (peer !== except) send(peer, message);
}

async function persist(room, doc, socket, action, proposalId, operation, payloadHash) {
  const result = await api('/internal/collab/commit', {
    ticket: socket.ticket, generation: room.generation, revision: room.revision,
    files: filesFrom(doc), state: encode(doc), action, proposal_id: proposalId,
    operation_id: operation, payload_hash: payloadHash,
  });
  if (result.duplicate) return { ...result, revision: result.head_revision, source_hash: result.head_hash };
  room.revision = result.revision;
  room.source_hash = result.source_hash;
  const update = Y.encodeStateAsUpdate(doc, Y.encodeStateVector(room.doc));
  Y.applyUpdate(room.doc, update);
  broadcast(room, { type: 'update', update: Buffer.from(update).toString('base64'),
                    revision: result.revision, source_hash: result.source_hash });
  return result;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return;
  }
  const hostRelease = (req.headers.host || '').match(/^preview-([\w-]+)\.localhost(?::\d+)?$/);
  const match = hostRelease ? [null, hostRelease[1], url.pathname.slice(1)] : null;
  if (!match) { res.writeHead(404); res.end('Not found'); return; }
  const [, releaseId, relative] = match;
  const cookieName = 'silo_preview_' + releaseId;
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(c => {
    const at = c.indexOf('='); return at < 0 ? ['', ''] : [c.slice(0, at).trim(), c.slice(at + 1)];
  }));
  const ticket = url.searchParams.get('ticket') || cookies[cookieName];
  if (!ticket) { res.writeHead(401); res.end('Open this preview from your Silo workspace.'); return; }
  try {
    const snapshot = await api('/internal/runtime/load', { ticket });
    if (snapshot.id !== releaseId) throw new Error('Preview ticket does not match this app');
    if (url.searchParams.has('ticket')) {
      res.writeHead(302, {
        'Set-Cookie': `${cookieName}=${ticket}; HttpOnly; SameSite=None; Secure; Partitioned; Path=/; Max-Age=900`,
        Location: url.pathname, 'Referrer-Policy': 'no-referrer',
      }); res.end(); return;
    }
    if (snapshot.upstream_port) {
      const headers = { ...req.headers, host: `127.0.0.1:${snapshot.upstream_port}` };
      delete headers.cookie; delete headers.authorization;
      const upstream = http.request({ hostname: '127.0.0.1', port: snapshot.upstream_port,
        path: url.pathname + url.search, method: req.method, headers, timeout: 30000 }, response => {
        const outHeaders = { ...response.headers };
        delete outHeaders['set-cookie']; delete outHeaders['connection'];
        outHeaders['referrer-policy'] = 'no-referrer';
        res.writeHead(response.statusCode || 502, outHeaders); response.pipe(res);
      });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('App runtime is unavailable'); });
      upstream.on('timeout', () => upstream.destroy());
      req.pipe(upstream); return;
    }
    const path = decodeURIComponent(relative || 'index.html');
    const file = Object.values(snapshot.files).find(f => f.path === path);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(path === 'index.html' ? 'This is a Python app. Use Build Python in the workspace; Docker is required.' : 'File not found');
      return;
    }
    const ext = path.split('.').pop();
    const mime = { html: 'text/html', css: 'text/css', js: 'application/javascript',
                   json: 'application/json', svg: 'image/svg+xml', txt: 'text/plain' }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-store',
                        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
                        'Content-Security-Policy': `default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors ${ALLOWED.join(' ')}` });
    res.end(file.content);
  } catch (error) {
    res.writeHead(error.status || 403, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end(error.message);
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 5 * 1024 * 1024 });
const runtimeWss = new WebSocketServer({ noServer: true, maxPayload: 5 * 1024 * 1024 });
server.on('upgrade', async (req, socket, head) => {
  const host = (req.headers.host || '').match(/^preview-([\w-]+)\.localhost(?::\d+)?$/);
  if (host) {
    try {
      const url = new URL(req.url, 'http://' + req.headers.host);
      const name = 'silo_preview_' + host[1];
      const raw = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
      const ticket = url.searchParams.get('ticket') || raw?.slice(name.length + 1);
      const snapshot = await api('/internal/runtime/load', { ticket });
      if (snapshot.id !== host[1] || !snapshot.upstream_port) throw new Error('Runtime not available');
      const upstream = new WebSocket(`ws://127.0.0.1:${snapshot.upstream_port}${req.url}`);
      upstream.once('open', () => runtimeWss.handleUpgrade(req, socket, head, client => {
        client.on('message', (data, binary) => { if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary }); });
        upstream.on('message', (data, binary) => { if (client.readyState === WebSocket.OPEN) client.send(data, { binary }); });
        const check = setInterval(() => api('/internal/runtime/load', { ticket }).catch(() => { client.close(4403, 'Access revoked'); upstream.close(); }), 5000);
        client.on('close', () => { clearInterval(check); upstream.close(); });
        upstream.on('close', () => { clearInterval(check); client.close(); });
        client.on('error', () => upstream.close());
      }));
      upstream.on('error', () => socket.destroy());
    } catch { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); }
    return;
  }
  if (req.url !== '/collab' || !ALLOWED.includes(req.headers.origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});

wss.on('connection', socket => {
  socket.alive = true;
  socket.on('pong', () => { socket.alive = true; });
  const authDeadline = setTimeout(() => { if (!socket.room) socket.close(4401, 'Authenticate first'); }, 8000);
  socket.on('message', async raw => {
    let message;
    try {
      message = JSON.parse(raw.toString());
      if (!socket.room) {
        if (message.type !== 'hello' || socket.authenticating) throw new Error('Authenticate first');
        socket.authenticating = true;
        const info = await api('/internal/collab/load', { ticket: message.ticket });
        socket.ticket = message.ticket; socket.user = info.user; socket.role = info.role;
        socket.room = await loadRoom(info, socket.ticket);
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.room.sockets.add(socket);
        clearTimeout(authDeadline);
        // Initial sync participates in the queue so its state/revision are coherent.
        await queue(socket.room, async () => {
          send(socket, { type: 'ready', state: encode(socket.room.doc), revision: socket.room.revision,
                         generation: socket.room.generation, source_hash: socket.room.source_hash, user: socket.user, role: socket.role });
        });
        broadcast(socket.room, { type: 'presence', people: [...socket.room.sockets].map(s => ({
          ...s.user, connection: s.connectionId, role: s.role,
        })) });
        return;
      }
      const room = socket.room;
      if (message.type === 'reauth') {
        const info = await api('/internal/collab/load', { ticket: message.ticket });
        if (info.id !== room.id || info.generation !== room.generation || info.user.id !== socket.user.id) {
          throw new Error('Session does not match this workspace');
        }
        socket.ticket = message.ticket; socket.role = info.role;
        send(socket, { type: 'reauthenticated', role: info.role });
        return;
      }
      if (message.type === 'awareness') {
        if (typeof message.update !== 'string' || message.update.length > 16000) return;
        const decoder = decoding.createDecoder(Buffer.from(message.update, 'base64'));
        if (decoding.readVarUint(decoder) !== 1) return;
        const clientId = decoding.readVarUint(decoder), clock = decoding.readVarUint(decoder);
        const state = JSON.parse(decoding.readVarString(decoder));
        if (socket.awarenessClientId !== undefined && socket.awarenessClientId !== clientId) return;
        if ([...room.sockets].some(s => s !== socket && s.awarenessClientId === clientId)) return;
        socket.awarenessClientId = clientId; socket.awarenessClock = clock;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 1); encoding.writeVarUint(encoder, clientId);
        encoding.writeVarUint(encoder, clock);
        const color = ['#7b9654', '#8870a5', '#5893a0', '#a08851'][parseInt(socket.user.id.slice(0, 2), 16) % 4 || 0];
        encoding.writeVarString(encoder, JSON.stringify(state === null ? null : {
          ...state, user: { id: socket.user.id, name: socket.user.name, color, colorLight: color + '33' },
        }));
        broadcast(room, { type: 'awareness', update: Buffer.from(encoding.toUint8Array(encoder)).toString('base64') }, socket);
        return;
      }
      if (!['update', 'command'].includes(message.type)) return;
      if (typeof message.operation !== 'string' || message.operation.length > 100) throw new Error('Operation ID required');
      await queue(room, async () => {
        const info = await api('/internal/collab/check', { ticket: socket.ticket });
        if (!['owner', 'editor'].includes(info.role)) throw new Error('This workspace is read-only');
        if (info.revision !== room.revision) {
          for (const peer of room.sockets) peer.close(4409, 'Workspace changed; reconnect');
          rooms.delete(room.key); throw new Error('Workspace changed; reconnect');
        }
        const digest = crypto.createHash('sha256').update(JSON.stringify(message)).digest('hex');
        const previous = room.acknowledgements.get(message.operation);
        if (previous) {
          if (previous.digest !== digest) throw new Error('Operation ID reused');
          send(socket, { type: 'ack', operation: message.operation, ...previous.result }); return;
        }
        const doc = clone(room.doc);
        let action = 'edit', proposalId;
        if (message.type === 'update') {
          Y.applyUpdate(doc, Buffer.from(message.update, 'base64'));
          assertTextOnly(filesFrom(room.doc), filesFrom(doc));
        } else {
          const files = filesFrom(doc);
          action = message.action;
          if (action === 'create') {
            files[crypto.randomUUID()] = { path: message.path, content: message.content || '' };
          } else if (action === 'rename') {
            if (!files[message.fileId]) throw new Error('File no longer exists');
            files[message.fileId].path = message.path;
          } else if (action === 'delete') {
            delete files[message.fileId];
          } else if (action === 'proposal') {
            const proposal = await api('/internal/collab/proposal', { ticket: socket.ticket, proposal_id: message.proposalId });
            proposalId = message.proposalId;
            replaceFiles(doc, proposal.files);
          } else { throw new Error('Unknown file command'); }
          if (action !== 'proposal') replaceFiles(doc, files);
        }
        const result = await persist(room, doc, socket, action, proposalId, message.operation, digest);
        room.acknowledgements.set(message.operation, { digest, result });
        if (room.acknowledgements.size > 2000) room.acknowledgements.delete(room.acknowledgements.keys().next().value);
        send(socket, { type: 'ack', operation: message.operation, ...result });
        doc.destroy();
      });
    } catch (error) {
      send(socket, { type: 'error', operation: message?.operation, message: error.message, status: error.status });
      if ([401, 403, 404].includes(error.status)) socket.close(4403, 'Reauthenticate');
      if (!socket.room) socket.close(4401, 'Authentication failed');
    }
  });
  socket.connectionId = crypto.randomUUID();
  socket.on('close', () => {
    clearTimeout(authDeadline);
    const room = socket.room;
    if (!room) return;
    room.sockets.delete(socket);
    if (socket.awarenessClientId !== undefined) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 1); encoding.writeVarUint(encoder, socket.awarenessClientId);
      encoding.writeVarUint(encoder, socket.awarenessClock || 0);
      encoding.writeVarString(encoder, 'null');
      broadcast(room, { type: 'awareness', update: Buffer.from(encoding.toUint8Array(encoder)).toString('base64') });
    }
    broadcast(room, { type: 'presence', people: [...room.sockets].map(s => ({
      ...s.user, connection: s.connectionId, role: s.role,
    })) });
    if (!room.sockets.size) {
      queue(room, async () => {
        if (!room.sockets.size) { rooms.delete(room.key); room.doc.destroy(); }
      });
    }
  });
});

const heartbeat = setInterval(async () => {
  for (const socket of wss.clients) {
    if (!socket.alive) { socket.terminate(); continue; }
    socket.alive = false; socket.ping();
    if (socket.room) {
      try {
        const info = await api('/internal/collab/check', { ticket: socket.ticket });
        if (info.role !== socket.role) { socket.close(4403, 'Permissions changed'); continue; }
        if (info.generation !== socket.room.generation) socket.close(4409, 'Draft restored');
      } catch (error) { socket.close(error.status === 409 ? 4409 : 4403, 'Access changed'); }
    }
  }
}, 5000);
server.listen(PORT, '0.0.0.0', () => console.log(`Silo collaboration and previews: ${PORT}`));
function shutdown() {
  clearInterval(heartbeat);
  for (const socket of wss.clients) socket.close(1001, 'Server restarting');
  for (const socket of runtimeWss.clients) socket.close(1001, 'Server restarting');
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
