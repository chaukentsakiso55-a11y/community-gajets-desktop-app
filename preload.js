const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('communityDesktop', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  sendNetworkMessage: (payload) => ipcRenderer.invoke('network:send', payload),
  startAlarm: () => ipcRenderer.invoke('alarm:start'),
  stopAlarm: () => ipcRenderer.invoke('alarm:stop'),
  notify: (payload) => ipcRenderer.invoke('notify', payload),
  openMap: (payload) => ipcRenderer.invoke('map:open', payload),
  onNetworkMessage: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('network:message', handler);
    return () => ipcRenderer.removeListener('network:message', handler);
  },
  onNetworkStatus: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('network:status', handler);
    return () => ipcRenderer.removeListener('network:status', handler);
  }
});
