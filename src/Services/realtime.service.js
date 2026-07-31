const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const { query } = require('./db.service');
const { normalizeRole } = require('../Middleware/auth.middleware');

const clientsByUser = new Map();

function normalizeUserId(value) {
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function authenticate(req) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
    return {
      ...payload,
      id: normalizeUserId(payload.id || payload.id_utilisateur || payload.userId || payload.sub),
      role: payload.role || payload.poste,
      poste: payload.poste || payload.role,
    };
  } catch {
    return null;
  }
}

function addClient(userId, ws) {
  const id = Number(userId);
  if (!clientsByUser.has(id)) clientsByUser.set(id, new Set());
  clientsByUser.get(id).add(ws);
}

function removeClient(userId, ws) {
  const id = Number(userId);
  const clients = clientsByUser.get(id);
  if (!clients) return;
  clients.delete(ws);
  if (clients.size === 0) clientsByUser.delete(id);
}

function sendToUser(userId, payload) {
  const clients = clientsByUser.get(Number(userId));
  if (!clients) return;
  const data = JSON.stringify(payload);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}

async function getGroupRecipients(groupId, exceptUserId) {
  const rows = await query(
    'SELECT id_utilisateur FROM groupe_membres WHERE id_groupe = ? AND id_utilisateur <> ?',
    [groupId, exceptUserId]
  );
  return rows.map((row) => Number(row.id_utilisateur));
}

async function relayTyping(user, payload) {
  const targetId = Number(payload.targetId);
  if (!targetId) return;
  const event = {
    type: 'typing',
    conversationType: payload.conversationType === 'group' ? 'group' : 'direct',
    targetId,
    fromUserId: Number(user.id),
    isTyping: Boolean(payload.isTyping),
  };

  if (event.conversationType === 'group') {
    const recipients = await getGroupRecipients(targetId, user.id);
    recipients.forEach((id) => sendToUser(id, event));
    return;
  }

  sendToUser(targetId, event);
}

function attachRealtime(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const user = authenticate(req);
    if (!user || !user.id) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    user.role = normalizeRole(user.role || user.poste);
    addClient(user.id, ws);
    ws.send(JSON.stringify({ type: 'connected', userId: Number(user.id) }));

    ws.on('message', async (raw) => {
      try {
        const payload = JSON.parse(String(raw));
        if (payload.type === 'typing') await relayTyping(user, payload);
      } catch {
        // Ignore malformed realtime payloads.
      }
    });

    ws.on('close', () => removeClient(user.id, ws));
    ws.on('error', () => removeClient(user.id, ws));
  });

  return {
    sendToUser,
    broadcastGroupMessage(groupId, exceptUserId, message) {
      return getGroupRecipients(groupId, exceptUserId).then((recipients) => {
        recipients.forEach((id) => sendToUser(id, { type: 'group_message', groupId: Number(groupId), message }));
      });
    },
    sendDirectMessage(senderId, recipientId, message) {
      sendToUser(recipientId, { type: 'direct_message', fromUserId: Number(senderId), message });
      sendToUser(senderId, { type: 'direct_message', fromUserId: Number(senderId), message });
    },
  };
}

module.exports = { attachRealtime, sendToUser };
