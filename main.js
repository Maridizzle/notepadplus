const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let recentFiles = [];
const MAX_RECENT = 15;
let rendererReady = false;
let closeConfirmed = false;

const sessionFile = path.join(app.getPath('userData'), 'session.json');

function loadSession() {
  try {
    if (fs.existsSync(sessionFile)) {
      return JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    }
  } catch (e) {}
  return null;
}

function saveSession(data) {
  try {
    fs.writeFileSync(sessionFile, JSON.stringify(data), 'utf-8');
  } catch (e) {}
}

function addRecentFile(filePath) {
  recentFiles = recentFiles.filter(f => f !== filePath);
  recentFiles.unshift(filePath);
  if (recentFiles.length > MAX_RECENT) recentFiles.length = MAX_RECENT;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'NotepadPlus',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  mainWindow.webContents.on('context-menu', (event, params) => {
    if (params.misspelledWord) {
      const suggestions = params.dictionarySuggestions;
      const menuItems = suggestions.slice(0, 8).map(word => ({
        label: word,
        click: () => mainWindow.webContents.replaceMisspelling(word),
      }));

      if (menuItems.length > 0) {
        menuItems.push({ type: 'separator' });
      }

      menuItems.push({
        label: 'Add to Dictionary',
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });

      Menu.buildFromTemplate(menuItems).popup();
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    rendererReady = true;
    const session = loadSession();
    if (session && session.tabs && session.tabs.length > 0) {
      mainWindow.webContents.send('restore-session', session);
    }
  });

  mainWindow.on('close', (event) => {
    if (closeConfirmed || !rendererReady) return;
    event.preventDefault();
    mainWindow.webContents.send('request-close');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu-new'),
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => handleFileOpen(),
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu-save'),
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('menu-save-as'),
        },
        { type: 'separator' },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => handleFolderOpen(),
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find...',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow.webContents.send('menu-find'),
        },
        {
          label: 'Replace...',
          accelerator: 'CmdOrCtrl+H',
          click: () => mainWindow.webContents.send('menu-replace'),
        },
        {
          label: 'Go to Line...',
          accelerator: 'CmdOrCtrl+G',
          click: () => mainWindow.webContents.send('menu-goto-line'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow.webContents.send('menu-toggle-sidebar'),
        },
        {
          label: 'Toggle Minimap',
          click: () => mainWindow.webContents.send('menu-toggle-minimap'),
        },
        { type: 'separator' },
        {
          label: 'Fold All',
          click: () => mainWindow.webContents.send('menu-fold-all'),
        },
        {
          label: 'Unfold All',
          click: () => mainWindow.webContents.send('menu-unfold-all'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Word Wrap',
          accelerator: 'Alt+Z',
          click: () => mainWindow.webContents.send('menu-toggle-wrap'),
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => mainWindow.webContents.send('menu-zoom-in'),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow.webContents.send('menu-zoom-out'),
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow.webContents.send('menu-zoom-reset'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Split View',
          accelerator: 'CmdOrCtrl+\\',
          click: () => mainWindow.webContents.send('menu-toggle-split'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Theme (Dark/Light)',
          click: () => mainWindow.webContents.send('menu-toggle-theme'),
        },
        { type: 'separator' },
        { label: 'Toggle Dev Tools', accelerator: 'F12', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'UPPERCASE',
          accelerator: 'CmdOrCtrl+Shift+U',
          click: () => mainWindow.webContents.send('menu-transform', 'uppercase'),
        },
        {
          label: 'lowercase',
          accelerator: 'CmdOrCtrl+U',
          click: () => mainWindow.webContents.send('menu-transform', 'lowercase'),
        },
        {
          label: 'Title Case',
          click: () => mainWindow.webContents.send('menu-transform', 'titlecase'),
        },
        {
          label: 'camelCase',
          click: () => mainWindow.webContents.send('menu-transform', 'camelcase'),
        },
        { type: 'separator' },
        {
          label: 'Sort Lines Ascending',
          click: () => mainWindow.webContents.send('menu-line-op', 'sort-asc'),
        },
        {
          label: 'Sort Lines Descending',
          click: () => mainWindow.webContents.send('menu-line-op', 'sort-desc'),
        },
        {
          label: 'Remove Duplicate Lines',
          click: () => mainWindow.webContents.send('menu-line-op', 'remove-dupes'),
        },
        {
          label: 'Remove Empty Lines',
          click: () => mainWindow.webContents.send('menu-line-op', 'remove-empty'),
        },
        {
          label: 'Trim Trailing Whitespace',
          click: () => mainWindow.webContents.send('menu-line-op', 'trim'),
        },
        {
          label: 'Reverse Lines',
          click: () => mainWindow.webContents.send('menu-line-op', 'reverse'),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About NotepadPlus',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About NotepadPlus',
              message: 'NotepadPlus v1.0.0',
              detail: 'A Notepad++ inspired editor with wiki-style file links, custom fonts, background colors, and Grammarly compatibility.\n\nBuilt with Electron + CodeMirror 6.\nBy Maridizzle.',
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Grammarly',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Grammarly Compatibility',
              message: 'Grammarly Support',
              detail: 'Click the "Prose" button in the toolbar to switch to a plain text editor that Grammarly Desktop can detect.\n\nProse mode syncs your content to a standard text area. When you toggle back, changes return to the code editor.\n\nRequires: Grammarly Desktop app for Windows.',
            });
          },
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

async function handleFileOpen() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt', 'md', 'log'] },
      { name: 'Code', extensions: ['js', 'ts', 'py', 'html', 'css', 'json', 'xml', 'cpp', 'c', 'h', 'java', 'php', 'rs', 'sql', 'sh', 'bat', 'yaml', 'yml', 'toml', 'ini', 'cfg'] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      addRecentFile(filePath);
      mainWindow.webContents.send('file-opened', { filePath, content });
    } catch (err) {
      dialog.showErrorBox('Error', `Could not read file: ${err.message}`);
    }
  }
}

async function handleFolderOpen() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    mainWindow.webContents.send('folder-opened', { folderPath: result.filePaths[0] });
  }
}

ipcMain.handle('dialog-open', async () => {
  await handleFileOpen();
});

ipcMain.handle('dialog-open-folder', async () => {
  await handleFolderOpen();
});

ipcMain.handle('dialog-save-as', async (event, { content, defaultPath }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath || 'untitled.txt',
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt'] },
    ],
  });

  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, content, 'utf-8');
      return { success: true, filePath: result.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false, canceled: true };
});

ipcMain.handle('file-save', async (event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('file-read', async (event, { filePath }) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    addRecentFile(filePath);
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('read-directory', async (event, { dirPath }) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDirectory: e.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
    return { success: true, items };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-recent-files', async () => {
  return recentFiles.filter(f => {
    try { return fs.existsSync(f); } catch { return false; }
  });
});

ipcMain.handle('track-recent-file', async (event, { filePath }) => {
  addRecentFile(filePath);
  return { success: true };
});

ipcMain.handle('check-grammar', async (event, { text, language }) => {
  const https = require('https');
  const querystring = require('querystring');

  const postData = querystring.stringify({
    text,
    language: language || 'en-US',
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.languagetool.org',
      port: 443,
      path: '/v2/check',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ success: true, result: JSON.parse(data) });
        } catch (err) {
          resolve({ success: false, error: 'Failed to parse response' });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ success: false, error: 'Request timed out' });
    });

    req.write(postData);
    req.end();
  });
});

ipcMain.handle('set-title', async (event, { title }) => {
  if (mainWindow) {
    mainWindow.setTitle(title);
  }
});

ipcMain.on('save-session', (event, data) => {
  saveSession(data);
});

ipcMain.handle('confirm-close', async (event, { message }) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    message,
  });
  return result.response;
});

ipcMain.on('close-confirmed', () => {
  closeConfirmed = true;
  if (mainWindow) mainWindow.close();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
