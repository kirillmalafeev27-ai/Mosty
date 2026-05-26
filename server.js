const express = require('express');
const path = require('path');
const { installQuizRoutes } = require('./quiz-generation');

const app = express();
const PORT = process.env.PORT || 3000;
const coopRooms = new Map();

function roomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function getCoopRoom(code) {
  const id = String(code || '').trim().toUpperCase() || roomCode();
  if (!coopRooms.has(id)) {
    coopRooms.set(id, {
      id,
      players: new Map(),
      configs: new Map(),
      clients: new Set(),
      createdAt: Date.now(),
      lastSeen: Date.now(),
    });
  }
  return coopRooms.get(id);
}

function publicRoomState(room) {
  const now = Date.now();
  return {
    room: room.id,
    players: [...room.players.values()].filter((player) => now - player.lastSeen < 15000),
    configs: Object.fromEntries(room.configs.entries()),
  };
}

function broadcastCoop(room, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of [...room.clients]) {
    try {
      client.write(payload);
    } catch (_) {
      room.clients.delete(client);
    }
  }
}

function cleanupCoopRooms() {
  const now = Date.now();
  for (const [id, room] of coopRooms) {
    for (const [playerId, player] of room.players) {
      if (now - player.lastSeen > 30000) room.players.delete(playerId);
    }
    if (!room.players.size && !room.clients.size && now - room.lastSeen > 300000) {
      coopRooms.delete(id);
    }
  }
}
setInterval(cleanupCoopRooms, 30000).unref();

app.use(express.json({ limit: '1mb' }));
installQuizRoutes(app);

app.post('/api/coop/join', (req, res) => {
  const room = getCoopRoom(req.body?.room);
  room.lastSeen = Date.now();
  const playerId = Math.random().toString(36).slice(2, 10);
  const seat = room.players.size + 1;
  const color = seat % 2 === 1 ? '#3aa0ff' : '#5ce58a';
  const player = {
    id: playerId,
    seat,
    color,
    name: String(req.body?.name || `Игрок ${seat}`).slice(0, 24),
    state: null,
    lastSeen: Date.now(),
  };
  room.players.set(playerId, player);
  broadcastCoop(room, 'room', publicRoomState(room));
  res.json({ ok: true, room: room.id, playerId, seat, color, state: publicRoomState(room) });
});

app.get('/api/coop/events', (req, res) => {
  const room = getCoopRoom(req.query.room);
  room.lastSeen = Date.now();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: room\ndata: ${JSON.stringify(publicRoomState(room))}\n\n`);
  room.clients.add(res);
  req.on('close', () => {
    room.clients.delete(res);
  });
});

app.post('/api/coop/state', (req, res) => {
  const room = getCoopRoom(req.body?.room);
  const player = room.players.get(req.body?.playerId);
  if (!player) return res.status(404).json({ ok: false, error: 'player not found' });
  player.state = req.body?.state || null;
  player.lastSeen = Date.now();
  room.lastSeen = player.lastSeen;
  broadcastCoop(room, 'state', publicRoomState(room));
  res.json({ ok: true });
});

app.post('/api/coop/config', (req, res) => {
  const room = getCoopRoom(req.body?.room);
  const floor = Number(req.body?.floor);
  if (!Number.isFinite(floor) || floor < 1) return res.status(400).json({ ok: false, error: 'bad floor' });
  const key = String(Math.floor(floor));
  if (!room.configs.has(key)) {
    room.configs.set(key, req.body?.config || {});
    room.lastSeen = Date.now();
    broadcastCoop(room, 'config', { room: room.id, floor: key, config: room.configs.get(key) });
    broadcastCoop(room, 'room', publicRoomState(room));
  }
  res.json({ ok: true, config: room.configs.get(key) });
});

app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'three', 'build')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Mosty running on http://localhost:${PORT}`);
});
