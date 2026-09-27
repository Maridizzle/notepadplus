const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file) =>
    webUtils && webUtils.getPathForFile ? webUtils.getPathForFile(file) : file.path,
  confirmClose: (data) => ipcRenderer.invoke('confirm-close', data),
  confirmAction: (data) => ipcRenderer.invoke('confirm-action', data),
  closeConfirmed: () => ipcRenderer.send('close-confirmed'),
  showError: (data) => ipcRenderer.invoke('show-error', data),
  showInfo: (data) => ipcRenderer.invoke('show-info', data),
  showItemInFolder: (data) => ipcRenderer.invoke('shell-show-item', data),
  openPath: (data) => ipcRenderer.invoke('shell-open-path', data),
  fileStat: (data) => ipcRenderer.invoke('file-stat', data),
  onRequestClose: (callback) => ipcRenderer.on('request-close', () => callback()),
  openFile: () => ipcRenderer.invoke('dialog-open'),
  openFolder: () => ipcRenderer.invoke('dialog-open-folder'),
  saveAs: (data) => ipcRenderer.invoke('dialog-save-as', data),
  saveFile: (data) => ipcRenderer.invoke('file-save', data),
  readFile: (data) => ipcRenderer.invoke('file-read', data),
  readDirectory: (data) => ipcRenderer.invoke('read-directory', data),
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
  trackRecentFile: (data) => ipcRenderer.invoke('track-recent-file', data),
  setTitle: (data) => ipcRenderer.invoke('set-title', data),
  checkGrammar: (data) => ipcRenderer.invoke('check-grammar', data),
  saveSession: (data) => ipcRenderer.send('save-session', data),

  onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, data) => callback(data)),
  onFolderOpened: (callback) => ipcRenderer.on('folder-opened', (event, data) => callback(data)),
  onMenuCommand: (callback) => ipcRenderer.on('menu-command', (event, name, arg) => callback(name, arg)),
  onRestoreSession: (callback) => ipcRenderer.on('restore-session', (event, data) => callback(data)),
});
