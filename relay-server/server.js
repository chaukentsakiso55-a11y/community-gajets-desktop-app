const http = require('http');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 8787);
const rooms = new Map();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Community Gadgets encrypted relay');
});

const wss = new WebSocket.Server({ server, maxPayload: 20000 });

function validChannelId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(value);
}

function leaveRoom(ws) {
  if (!ws.channelId) return;
  const room = rooms.get(ws.channelId);
  if (!room) return;
  room.delete(ws);
  if (room.size === 0) rooms.delete(ws.channelId);
  ws.channelId = null;
}

function rateLimitOkay(ws) {
  const now = Date.now();
  if (!ws.windowStartedAt || now - ws.windowStartedAt > 60000) {
    ws.windowStartedAt = now;
    ws.messageCount = 0;
  }
  ws.messageCount += 1;
  return ws.messageCount <= 120;
}

wss.on('connection', (ws) => {
  ws.channelId = null;
  ws.messageCount = 0;
  ws.windowStartedAt = Date.now();

  ws.on('message', (raw) => {
    if (!rateLimitOkay(ws)) {
      ws.close(1008, 'Rate limit exceeded');
      return;
    }

    let message;
    try {
      message = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }

    if (message.type === 'subscribe') {
      if (!validChannelId(message.channelId)) {
        ws.close(1008, 'Invalid channel');
        return;
      }
      leaveRoom(ws);
      ws.channelId = message.channelId;
      if (!rooms.has(ws.channelId)) rooms.set(ws.channelId, new Set());
      rooms.get(ws.channelId).add(ws);
      ws.send(JSON.stringify({ type: 'subscribed', channelId: ws.channelId }));
      return;
    }

    if (message.type === 'message') {
      if (!ws.channelId || message.channelId !== ws.channelId) return;
      if (typeof message.sealed !== 'string' || message.sealed.length < 40 || message.sealed.length > 18000) return;
      const room = rooms.get(ws.channelId);
      if (!room) return;
      const envelope = JSON.stringify({
        type: 'message',
        channelId: ws.channelId,
        senderId: String(message.terminalId || '').slice(0, 80),
        sealed: message.sealed
      });
      for (const peer of room) {
        if (peer === ws || peer.readyState !== WebSocket.OPEN) continue;
        peer.send(envelope);
      }
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Community Gadgets relay listening on :${PORT}`);
});
