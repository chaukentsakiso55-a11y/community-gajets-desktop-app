const Protocol = (() => {
  const VERSION = 2;
  const KEY_ITERATIONS = 120000;
  const KEY_SALT = new TextEncoder().encode('community-gadget-zone-key-v1');
  const MAX_CLOCK_SKEW_MS = 30 * 60 * 1000;
  const levels = new Set(['SECURE', 'MONITOR', 'EMERGENCY']);
  const types = new Set(['ALERT', 'RECEIVED', 'ACKNOWLEDGED', 'RESPONDING', 'LOCATION_UPDATE', 'END_ALERT']);

  function bytesToBase64Url(bytes) {
    let binary = '';
    for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function deriveCommunityKey(communityCode) {
    const normalized = String(communityCode || '').trim();
    if (normalized.length < 8) throw new Error('Community code must contain at least 8 characters.');
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(normalized),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    return crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: KEY_SALT, iterations: KEY_ITERATIONS },
      material,
      256
    );
  }

  function unsignedMessageObject(message) {
    return {
      v: VERSION,
      messageId: message.messageId,
      alertId: message.alertId,
      type: message.type,
      actorId: message.actorId,
      actorName: message.actorName,
      createdAt: message.createdAt,
      level: message.level ?? null,
      latitude: message.latitude ?? null,
      longitude: message.longitude ?? null,
      accuracy: message.accuracy ?? null,
      isTest: Boolean(message.isTest)
    };
  }

  function validateMessage(message, now = Date.now()) {
    if (!message || message.v !== VERSION) return false;
    if (!types.has(message.type)) return false;
    if (message.level !== null && message.level !== undefined && !levels.has(message.level)) return false;
    if (String(message.messageId || '').length < 8 || String(message.messageId || '').length > 80) return false;
    if (String(message.alertId || '').length < 8 || String(message.alertId || '').length > 80) return false;
    if (String(message.actorId || '').length < 3 || String(message.actorId || '').length > 80) return false;
    if (String(message.actorName || '').length < 1 || String(message.actorName || '').length > 80) return false;
    if (!Number.isFinite(Number(message.createdAt))) return false;
    if (Math.abs(now - Number(message.createdAt)) > MAX_CLOCK_SKEW_MS) return false;
    if (message.type === 'ALERT' && !levels.has(message.level)) return false;

    const hasLat = message.latitude !== null && message.latitude !== undefined;
    const hasLon = message.longitude !== null && message.longitude !== undefined;
    const hasAccuracy = message.accuracy !== null && message.accuracy !== undefined;
    const hasAnyLocation = hasLat || hasLon || hasAccuracy;

    if (hasLat && (!Number.isFinite(Number(message.latitude)) || Number(message.latitude) < -90 || Number(message.latitude) > 90)) return false;
    if (hasLon && (!Number.isFinite(Number(message.longitude)) || Number(message.longitude) < -180 || Number(message.longitude) > 180)) return false;
    if (hasLat !== hasLon) return false;

    if (!['ALERT', 'LOCATION_UPDATE'].includes(message.type) && hasAnyLocation) return false;
    if (message.type === 'ALERT' && message.level !== 'EMERGENCY' && hasAnyLocation) return false;
    if (message.type === 'LOCATION_UPDATE' && !hasLat) return false;
    return true;
  }

  async function hmacBase64Url(text, keyBits) {
    const key = await crypto.subtle.importKey(
      'raw',
      keyBits,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
    return bytesToBase64Url(signature);
  }

  async function signMessage(message, communityCode) {
    const normalized = unsignedMessageObject(message);
    if (!validateMessage(normalized)) throw new Error('Message failed privacy or format validation.');
    const key = await deriveCommunityKey(communityCode);
    const signature = await hmacBase64Url(JSON.stringify(normalized), key);
    return JSON.stringify({ ...normalized, signature });
  }

  async function verifyMessage(payload, communityCode) {
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return null;
    }
    if (!validateMessage(parsed)) return null;
    if (typeof parsed.signature !== 'string' || parsed.signature.length < 20) return null;

    const normalized = unsignedMessageObject(parsed);
    const key = await deriveCommunityKey(communityCode);
    const expected = await hmacBase64Url(JSON.stringify(normalized), key);
    if (expected.length !== parsed.signature.length) return null;

    let mismatch = 0;
    for (let i = 0; i < expected.length; i += 1) {
      mismatch |= expected.charCodeAt(i) ^ parsed.signature.charCodeAt(i);
    }
    return mismatch === 0 ? { ...normalized, signature: parsed.signature } : null;
  }

  function newId(prefix) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  function createAlert({ actorId, actorName, level, location = null, isTest = false }) {
    const alertId = newId('alert');
    return {
      messageId: newId('msg'),
      alertId,
      type: 'ALERT',
      actorId,
      actorName,
      createdAt: Date.now(),
      level,
      latitude: level === 'EMERGENCY' ? location?.latitude ?? null : null,
      longitude: level === 'EMERGENCY' ? location?.longitude ?? null : null,
      accuracy: level === 'EMERGENCY' ? location?.accuracy ?? null : null,
      isTest
    };
  }

  function createAction({ actorId, actorName, alertId, type, level = null, location = null, isTest = false }) {
    return {
      messageId: newId('msg'),
      alertId,
      type,
      actorId,
      actorName,
      createdAt: Date.now(),
      level,
      latitude: type === 'LOCATION_UPDATE' ? location?.latitude ?? null : null,
      longitude: type === 'LOCATION_UPDATE' ? location?.longitude ?? null : null,
      accuracy: type === 'LOCATION_UPDATE' ? location?.accuracy ?? null : null,
      isTest
    };
  }

  return { signMessage, verifyMessage, createAlert, createAction };
})();

window.CommunityProtocol = Protocol;
