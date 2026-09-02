const { app, BrowserWindow, ipcMain, Notification, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const dgram = require('dgram');
const WebSocket = require('ws');

const DEFAULT_UDP_PORT = 45841;
let mainWindow;
let udpSocket;
let relaySocket;
let alarmTimer;
let settings;

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  const defaults = {
    terminalId: crypto.randomUUID(),
    terminalName: `${os.hostname()} Desktop`,
    communityCode: '',
    relayUrl: '',
    udpPort: DEFAULT_UDP_PORT
  };
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    settings = { ...defaults, ...saved };
  } catch {
    settings = defaults;
  }
  saveSettings();
  return settings;
}

function saveSettings() {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

function channelIdFromCode(code) {
  if (!code || code.trim().length < 8) return '';
  return crypto.createHash('sha256')
    .update(`community-gadget-channel-v1|${code.trim()}`, 'utf8')
    .digest('base64url');
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function closeUdp() {
  if (udpSocket) {
    try { udpSocket.close(); } catch {}
    udpSocket = null;
  }
}

function startUdp() {
  closeUdp();
  const port = Number(settings.udpPort) || DEFAULT_UDP_PORT;
  udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  udpSocket.on('error', (error) => {
    sendToRenderer('network:status', { lan: 'error', detail: error.message });
  });

  udpSocket.on('message', (buffer, remote) => {
    const text = buffer.toString('utf8');
    if (!text.startsWith('CG2|')) return;
    sendToRenderer('network:message', {
      source: 'lan',
      payload: text.slice(4),
      remote: `${remote.address}:${remote.port}`
    });
  });

  udpSocket.bind(port, '0.0.0.0', () => {
    try { udpSocket.setBroadcast(true); } catch {}
    sendToRenderer('network:status', { lan: 'online', port });
  });
}

function sendLan(payload) {
  if (!udpSocket) return;
  const packet = Buffer.from(`CG2|${payload}`, 'utf8');
  const port = Number(settings.udpPort) || DEFAULT_UDP_PORT;
  udpSocket.send(packet, 0, packet.length, port, '255.255.255.255');
}

function closeRelay() {
  if (relaySocket) {
    try { relaySocket.close(); } catch {}
    relaySocket = null;
  }
}

function connectRelay() {
  closeRelay();
  const relayUrl = String(settings.relayUrl || '').trim();
  const channelId = channelIdFromCode(settings.communityCode);
  if (!relayUrl || !channelId) {
    sendToRenderer('network:status', { relay: 'disabled' });
    return;
  }

  try {
    relaySocket = new WebSocket(relayUrl);
    relaySocket.on('open', () => {
      relaySocket.send(JSON.stringify({ type: 'subscribe', channelId, terminalId: settings.terminalId }));
      sendToRenderer('network:status', { relay: 'online' });
    });
    relaySocket.on('message', (data) => {
      try {
        const envelope = JSON.parse(data.toString('utf8'));
        if (envelope.type !== 'message' || envelope.channelId !== channelId || typeof envelope.payload !== 'string') return;
        sendToRenderer('network:message', { source: 'relay', payload: envelope.payload });
      } catch {}
    });
    relaySocket.on('close', () => sendToRenderer('network:status', { relay: 'offline' }));
    relaySocket.on('error', (error) => sendToRenderer('network:status', { relay: 'error', detail: error.message }));
  } catch (error) {
    sendToRenderer('network:status', { relay: 'error', detail: error.message });
  }
}

function sendRelay(payload) {
  if (!relaySocket || relaySocket.readyState !== WebSocket.OPEN) return;
  const channelId = channelIdFromCode(settings.communityCode);
  if (!channelId) return;
  relaySocket.send(JSON.stringify({ type: 'message', channelId, terminalId: settings.terminalId, payload }));
}

function startAlarm() {
  if (alarmTimer) return;
  shell.beep();
  alarmTimer = setInterval(() => shell.beep(), 950);
}

function stopAlarm() {
  if (alarmTimer) clearInterval(alarmTimer);
  alarmTimer = null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#071014',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  loadSettings();

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'geolocation');
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'geolocation');
  });

  createWindow();
  startUdp();
  connectRelay();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopAlarm();
  closeUdp();
  closeRelay();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('settings:get', () => settings);

ipcMain.handle('settings:save', (_event, patch) => {
  settings = {
    ...settings,
    terminalName: String(patch.terminalName || settings.terminalName).slice(0, 80),
    communityCode: String(patch.communityCode || '').trim(),
    relayUrl: String(patch.relayUrl || '').trim(),
    udpPort: Number(patch.udpPort) || DEFAULT_UDP_PORT
  };
  saveSettings();
  startUdp();
  connectRelay();
  return settings;
});

ipcMain.handle('network:send', (_event, payload) => {
  if (typeof payload !== 'string' || payload.length < 16 || payload.length > 8192) return false;
  sendLan(payload);
  sendRelay(payload);
  return true;
});

ipcMain.handle('alarm:start', () => {
  startAlarm();
  return true;
});

ipcMain.handle('alarm:stop', () => {
  stopAlarm();
  return true;
});

ipcMain.handle('notify', (_event, { title, body, urgent }) => {
  if (!Notification.isSupported()) return false;
  const notification = new Notification({
    title: String(title || 'Community Gadget'),
    body: String(body || ''),
    urgency: urgent ? 'critical' : 'normal',
    silent: !urgent
  });
  notification.show();
  return true;
});

ipcMain.handle('map:open', (_event, { latitude, longitude }) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const url = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=18/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`;
  shell.openExternal(url);
  return true;
});
