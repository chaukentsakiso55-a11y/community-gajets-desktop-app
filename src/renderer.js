const api = window.communityDesktop;
const Protocol = window.CommunityProtocol;

const state = {
  settings: null,
  activeAlerts: new Map(),
  selectedAlertId: null,
  seenMessages: new Set(),
  feed: []
};

const els = {
  lanStatus: document.getElementById('lanStatus'),
  relayStatus: document.getElementById('relayStatus'),
  terminalNameBadge: document.getElementById('terminalNameBadge'),
  settingsButton: document.getElementById('settingsButton'),
  settingsDialog: document.getElementById('settingsDialog'),
  settingsForm: document.getElementById('settingsForm'),
  terminalNameInput: document.getElementById('terminalNameInput'),
  communityCodeInput: document.getElementById('communityCodeInput'),
  relayUrlInput: document.getElementById('relayUrlInput'),
  udpPortInput: document.getElementById('udpPortInput'),
  settingsError: document.getElementById('settingsError'),
  activeEmpty: document.getElementById('activeEmpty'),
  activeDetails: document.getElementById('activeDetails'),
  activeLevel: document.getElementById('activeLevel'),
  activeActor: document.getElementById('activeActor'),
  activeTime: document.getElementById('activeTime'),
  activeLocation: document.getElementById('activeLocation'),
  ackButton: document.getElementById('ackButton'),
  respondButton: document.getElementById('respondButton'),
  mapButton: document.getElementById('mapButton'),
  endButton: document.getElementById('endButton'),
  feed: document.getElementById('feed'),
  clearFeedButton: document.getElementById('clearFeedButton'),
  toast: document.getElementById('toast')
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 2800);
}

function formatTime(epochMs) {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function levelClass(level) {
  return String(level || '').toLowerCase();
}

function addFeed(title, description, level = null, createdAt = Date.now()) {
  state.feed.unshift({ title, description, level, createdAt });
  state.feed = state.feed.slice(0, 80);
  renderFeed();
}

function renderFeed() {
  if (state.feed.length === 0) {
    els.feed.innerHTML = '<div class="empty-state" style="min-height:180px"><strong>No recent activity</strong><p>Trusted signals and responses will appear here.</p></div>';
    return;
  }
  els.feed.replaceChildren(...state.feed.map((item) => {
    const row = document.createElement('div');
    row.className = `feed-item ${levelClass(item.level)}`;
    const dot = document.createElement('span');
    dot.className = 'feed-dot';
    const body = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = item.title;
    const p = document.createElement('p');
    p.textContent = item.description;
    body.append(strong, p);
    const time = document.createElement('span');
    time.className = 'feed-time';
    time.textContent = formatTime(item.createdAt);
    row.append(dot, body, time);
    return row;
  }));
}

function selectedAlert() {
  return state.selectedAlertId ? state.activeAlerts.get(state.selectedAlertId) : null;
}

function renderActive() {
  const alert = selectedAlert();
  if (!alert) {
    els.activeEmpty.classList.remove('hidden');
    els.activeDetails.classList.add('hidden');
    els.activeLevel.textContent = 'NONE';
    els.activeLevel.className = 'level-chip neutral';
    return;
  }

  els.activeEmpty.classList.add('hidden');
  els.activeDetails.classList.remove('hidden');
  els.activeLevel.textContent = alert.level || alert.type;
  els.activeLevel.className = `level-chip ${alert.level || ''}`;
  els.activeActor.textContent = alert.actorName;
  els.activeTime.textContent = formatTime(alert.createdAt);
  els.activeLocation.textContent = alert.latitude != null && alert.longitude != null
    ? `${Number(alert.latitude).toFixed(5)}, ${Number(alert.longitude).toFixed(5)}${alert.accuracy != null ? ` ±${Math.round(Number(alert.accuracy))}m` : ''}`
    : 'Not shared';

  els.mapButton.disabled = alert.latitude == null || alert.longitude == null;
  els.endButton.disabled = alert.actorId !== state.settings?.terminalId || alert.ended;
  els.ackButton.disabled = alert.ended;
  els.respondButton.disabled = alert.ended;
}

function rememberMessage(messageId) {
  if (state.seenMessages.has(messageId)) return false;
  state.seenMessages.add(messageId);
  if (state.seenMessages.size > 500) {
    const first = state.seenMessages.values().next().value;
    state.seenMessages.delete(first);
  }
  return true;
}

async function sendSigned(message) {
  if (!state.settings?.communityCode || state.settings.communityCode.trim().length < 8) {
    openSettings('Set a private community code before sending signals.');
    return false;
  }
  try {
    const payload = await Protocol.signMessage(message, state.settings.communityCode);
    await api.sendNetworkMessage(payload);
    rememberMessage(message.messageId);
    return true;
  } catch (error) {
    showToast(error.message || 'Could not send signal.');
    return false;
  }
}

function getEmergencyLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

async function sendLevel(level) {
  if (!state.settings?.communityCode || state.settings.communityCode.trim().length < 8) {
    openSettings('Set a private community code first.');
    return;
  }

  let location = null;
  if (level === 'EMERGENCY') {
    showToast('Requesting location for the emergency alert…');
    location = await getEmergencyLocation();
  }

  const message = Protocol.createAlert({
    actorId: state.settings.terminalId,
    actorName: state.settings.terminalName,
    level,
    location
  });

  if (!await sendSigned(message)) return;
  state.activeAlerts.set(message.alertId, { ...message, ended: false });
  state.selectedAlertId = message.alertId;
  renderActive();

  const labels = {
    SECURE: ['Secure signal sent', 'Community notified that the zone is secure.'],
    MONITOR: ['Monitor signal sent', 'Community warned about suspicious activity.'],
    EMERGENCY: ['Emergency alert sent', location ? 'Emergency and current location sent to trusted devices.' : 'Emergency sent. Desktop location was unavailable.']
  };
  addFeed(labels[level][0], labels[level][1], level, message.createdAt);
  showToast(labels[level][0]);
}

async function sendAction(type) {
  const alert = selectedAlert();
  if (!alert || alert.ended) return;
  const action = Protocol.createAction({
    actorId: state.settings.terminalId,
    actorName: state.settings.terminalName,
    alertId: alert.alertId,
    type,
    level: alert.level
  });
  if (!await sendSigned(action)) return;

  if (type === 'ACKNOWLEDGED') {
    await api.stopAlarm();
    addFeed('Alert acknowledged', `${state.settings.terminalName} acknowledged ${alert.actorName}'s alert.`, alert.level, action.createdAt);
  }
  if (type === 'RESPONDING') {
    addFeed('Responder on the way', `${state.settings.terminalName} marked that they are responding.`, alert.level, action.createdAt);
  }
  if (type === 'END_ALERT') {
    alert.ended = true;
    state.activeAlerts.set(alert.alertId, alert);
    await api.stopAlarm();
    addFeed('Alert ended', `${alert.actorName}'s alert was ended by its originating terminal.`, alert.level, action.createdAt);
    renderActive();
  }
}

async function handleIncoming(envelope) {
  if (!state.settings?.communityCode) return;
  let message;
  try {
    message = await Protocol.verifyMessage(envelope.payload, state.settings.communityCode);
  } catch {
    return;
  }
  if (!message || !rememberMessage(message.messageId)) return;
  if (message.actorId === state.settings.terminalId && message.type === 'ALERT') return;

  if (message.type === 'ALERT') {
    state.activeAlerts.set(message.alertId, { ...message, ended: false, source: envelope.source });
    state.selectedAlertId = message.alertId;
    renderActive();

    const description = message.level === 'EMERGENCY'
      ? `${message.actorName} sent an emergency alert${message.latitude != null ? ' with location.' : '.'}`
      : `${message.actorName} sent a ${message.level.toLowerCase()} signal.`;
    addFeed(`${message.level} from ${message.actorName}`, description, message.level, message.createdAt);

    if (message.level === 'EMERGENCY') {
      await api.startAlarm();
      await api.notify({ title: 'COMMUNITY EMERGENCY', body: `${message.actorName} needs immediate help.`, urgent: true });
    } else if (message.level === 'MONITOR') {
      await api.notify({ title: 'Community monitor alert', body: `${message.actorName} reported suspicious activity.`, urgent: false });
    }

    const received = Protocol.createAction({
      actorId: state.settings.terminalId,
      actorName: state.settings.terminalName,
      alertId: message.alertId,
      type: 'RECEIVED',
      level: message.level
    });
    await sendSigned(received);
    return;
  }

  const alert = state.activeAlerts.get(message.alertId);
  if (message.type === 'RECEIVED') {
    addFeed('Signal received', `${message.actorName} received the alert.`, alert?.level, message.createdAt);
  } else if (message.type === 'ACKNOWLEDGED') {
    addFeed('Alert acknowledged', `${message.actorName} acknowledged the alert.`, alert?.level, message.createdAt);
  } else if (message.type === 'RESPONDING') {
    addFeed('Responder on the way', `${message.actorName} is responding.`, alert?.level, message.createdAt);
  } else if (message.type === 'LOCATION_UPDATE' && alert) {
    alert.latitude = message.latitude;
    alert.longitude = message.longitude;
    alert.accuracy = message.accuracy;
    state.activeAlerts.set(alert.alertId, alert);
    renderActive();
    addFeed('Emergency location updated', `${message.actorName} shared a new emergency location.`, alert.level, message.createdAt);
  } else if (message.type === 'END_ALERT' && alert) {
    alert.ended = true;
    state.activeAlerts.set(alert.alertId, alert);
    if (state.selectedAlertId === alert.alertId) await api.stopAlarm();
    renderActive();
    addFeed('Alert ended', `${message.actorName} ended the active alert.`, alert.level, message.createdAt);
  }
}

function setStatus(element, label, value, detail = '') {
  element.textContent = `${label} • ${String(value).toUpperCase()}`;
  element.title = detail || '';
  element.classList.toggle('online', value === 'online');
  element.classList.toggle('error', value === 'error');
}

function openSettings(error = '') {
  if (!state.settings) return;
  els.terminalNameInput.value = state.settings.terminalName || '';
  els.communityCodeInput.value = state.settings.communityCode || '';
  els.relayUrlInput.value = state.settings.relayUrl || '';
  els.udpPortInput.value = state.settings.udpPort || 45841;
  els.settingsError.textContent = error;
  els.settingsError.classList.toggle('hidden', !error);
  if (!els.settingsDialog.open) els.settingsDialog.showModal();
}

async function saveSettings(event) {
  event.preventDefault();
  const communityCode = els.communityCodeInput.value.trim();
  const terminalName = els.terminalNameInput.value.trim();
  const relayUrl = els.relayUrlInput.value.trim();
  const udpPort = Number(els.udpPortInput.value);

  if (!terminalName) {
    els.settingsError.textContent = 'Terminal name is required.';
    els.settingsError.classList.remove('hidden');
    return;
  }
  if (communityCode.length < 8) {
    els.settingsError.textContent = 'Community code must contain at least 8 characters.';
    els.settingsError.classList.remove('hidden');
    return;
  }
  if (relayUrl && !/^wss?:\/\//i.test(relayUrl)) {
    els.settingsError.textContent = 'Relay URL must start with ws:// or wss://.';
    els.settingsError.classList.remove('hidden');
    return;
  }
  if (!Number.isInteger(udpPort) || udpPort < 1024 || udpPort > 65535) {
    els.settingsError.textContent = 'UDP port must be between 1024 and 65535.';
    els.settingsError.classList.remove('hidden');
    return;
  }

  state.settings = await api.saveSettings({ terminalName, communityCode, relayUrl, udpPort });
  els.terminalNameBadge.textContent = state.settings.terminalName;
  els.settingsDialog.close();
  showToast('Settings saved. Network reconnecting…');
}

async function init() {
  state.settings = await api.getSettings();
  els.terminalNameBadge.textContent = state.settings.terminalName;
  renderFeed();
  renderActive();

  if (!state.settings.communityCode || state.settings.communityCode.trim().length < 8) {
    openSettings('Create or enter the private community code used by trusted devices.');
  }

  document.querySelectorAll('.signal').forEach((button) => {
    button.addEventListener('click', () => sendLevel(button.dataset.level));
  });

  els.settingsButton.addEventListener('click', () => openSettings());
  els.settingsForm.addEventListener('submit', saveSettings);
  els.ackButton.addEventListener('click', () => sendAction('ACKNOWLEDGED'));
  els.respondButton.addEventListener('click', () => sendAction('RESPONDING'));
  els.endButton.addEventListener('click', () => sendAction('END_ALERT'));
  els.mapButton.addEventListener('click', async () => {
    const alert = selectedAlert();
    if (alert?.latitude != null && alert?.longitude != null) {
      await api.openMap({ latitude: alert.latitude, longitude: alert.longitude });
    }
  });
  els.clearFeedButton.addEventListener('click', () => {
    state.feed = [];
    renderFeed();
  });

  api.onNetworkMessage(handleIncoming);
  api.onNetworkStatus((status) => {
    if (status.lan) setStatus(els.lanStatus, 'LAN', status.lan, status.detail);
    if (status.relay) setStatus(els.relayStatus, 'RELAY', status.relay, status.detail);
  });
}

init();
