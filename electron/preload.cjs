const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orbit', {
  getState: () => ipcRenderer.invoke('state:get'),
  createAccount: (input) => ipcRenderer.invoke('account:create', input),
  loginAccount: (accountId) => ipcRenderer.invoke('account:login', accountId),
  switchAccount: (accountId) => ipcRenderer.invoke('account:switch', accountId),
  renameAccount: (accountId, label) => ipcRenderer.invoke('account:rename', accountId, label),
  removeAccount: (accountId) => ipcRenderer.invoke('account:remove', accountId),
  selectExecutable: () => ipcRenderer.invoke('settings:select-executable'),
  setTheme: (theme) => ipcRenderer.invoke('settings:set-theme', theme),
  setCardStyle: (cardStyle) => ipcRenderer.invoke('settings:set-card-style', cardStyle),
  setBackground: (background) => ipcRenderer.invoke('settings:set-background', background),
  selectCustomBackground: () => ipcRenderer.invoke('settings:select-custom-background'),
  useCustomBackground: () => ipcRenderer.invoke('settings:use-custom-background'),
  clearCustomBackground: () => ipcRenderer.invoke('settings:clear-custom-background'),
  setProgressStyle: (progressStyle) => ipcRenderer.invoke('settings:set-progress-style', progressStyle),
  refreshUsage: () => ipcRenderer.invoke('usage:refresh'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  onStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  },
});
