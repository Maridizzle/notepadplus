const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let recentFiles = [];
const MAX_RECENT = 15;
let rendererReady = false;
let closeConfirmed = false;
let pendingOpenPaths = [];

const sessionFile = path.join(app.getPath('userData'), 'session.json');
const recentFile = path.join(app.getPath('userData'), 'recent.json');

function loadRecentFiles() {
  try {
    if (fs.existsSync(recentFile)) {
      const data = JSON.parse(fs.readFileSync(recentFile, 'utf-8'));
      if (Array.isArray(data)) recentFiles = data.filter(f => typeof f === 'string');
    }
  } catch (e) {}
}

function saveRecentFiles() {
  try {
    fs.writeFileSync(recentFile, JSON.stringify(recentFiles), 'utf-8');
  } catch (e) {}
}

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
  saveRecentFiles();
}

function send(name, arg) {
  if (mainWindow) mainWindow.webContents.send('menu-command', name, arg);
}

function filePathsFromArgv(argv, cwd) {
  return argv
    .slice(1)
    .filter(a => a && !a.startsWith('-'))
    .map(a => path.resolve(cwd || process.cwd(), a))
    .filter(p => {
      try { return fs.statSync(p).isFile(); } catch { return false; }
    });
}

function openPathsInRenderer(paths) {
  if (!paths.length) return;
  if (!mainWindow || !rendererReady) {
    pendingOpenPaths.push(...paths);
    return;
  }
  for (const filePath of paths) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      addRecentFile(filePath);
      mainWindow.webContents.send('file-opened', { filePath, content });
    } catch (err) {
      dialog.showErrorBox('Error', `Could not read file: ${err.message}`);
    }
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    openPathsInRenderer(filePathsFromArgv(argv, workingDirectory));
  });
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openPathsInRenderer([filePath]);
});

function buildMenu() {
  const cmd = (label, name, extra = {}) => ({ label, click: () => send(name, extra.arg), ...extra });

  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        cmd('New', 'new', { accelerator: 'CmdOrCtrl+N' }),
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: () => handleFileOpen() },
        cmd('Reload from Disk', 'reload', { accelerator: 'CmdOrCtrl+R' }),
        { type: 'separator' },
        cmd('Save', 'save', { accelerator: 'CmdOrCtrl+S' }),
        cmd('Save As...', 'save-as', { accelerator: 'CmdOrCtrl+Alt+S' }),
        cmd('Save a Copy As...', 'save-copy-as'),
        cmd('Save All', 'save-all', { accelerator: 'CmdOrCtrl+Shift+S' }),
        { type: 'separator' },
        cmd('Close', 'close', { accelerator: 'CmdOrCtrl+W' }),
        cmd('Close All', 'close-all', { accelerator: 'CmdOrCtrl+Shift+W' }),
        {
          label: 'Close More',
          submenu: [
            cmd('Close All But Active Document', 'close-others'),
            cmd('Close All to the Left', 'close-left'),
            cmd('Close All to the Right', 'close-right'),
            cmd('Close All Unchanged', 'close-unchanged'),
          ],
        },
        { type: 'separator' },
        { label: 'Open Folder...', accelerator: 'CmdOrCtrl+Shift+O', click: () => handleFolderOpen() },
        cmd('Open Containing Folder', 'open-containing-folder'),
        cmd('Open in Default Viewer', 'open-default-viewer'),
        { type: 'separator' },
        cmd('File Summary...', 'summary'),
        { type: 'separator' },
        { label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        cmd('Undo', 'undo', { accelerator: 'CmdOrCtrl+Z', registerAccelerator: false }),
        cmd('Redo', 'redo', { accelerator: 'CmdOrCtrl+Y', registerAccelerator: false }),
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Copy to Clipboard',
          submenu: [
            cmd('Current Full File Path', 'copy-path'),
            cmd('Current File Name', 'copy-filename'),
            cmd('Current Directory Path', 'copy-dir'),
          ],
        },
        { type: 'separator' },
        {
          label: 'Convert Case to',
          submenu: [
            cmd('UPPERCASE', 'transform', { arg: 'uppercase', accelerator: 'CmdOrCtrl+Shift+U' }),
            cmd('lowercase', 'transform', { arg: 'lowercase', accelerator: 'CmdOrCtrl+U' }),
            cmd('Proper Case', 'transform', { arg: 'propercase' }),
            cmd('Sentence case', 'transform', { arg: 'sentencecase' }),
            cmd('iNVERT cASE', 'transform', { arg: 'invertcase' }),
            cmd('ranDOm CasE', 'transform', { arg: 'randomcase' }),
            cmd('camelCase', 'transform', { arg: 'camelcase' }),
          ],
        },
        {
          label: 'Line Operations',
          submenu: [
            cmd('Duplicate Current Line', 'line-op', { arg: 'duplicate' }),
            cmd('Join Lines', 'line-op', { arg: 'join' }),
            cmd('Move Up Current Line', 'line-op', { arg: 'move-up', accelerator: 'Alt+Up', registerAccelerator: false }),
            cmd('Move Down Current Line', 'line-op', { arg: 'move-down', accelerator: 'Alt+Down', registerAccelerator: false }),
            { type: 'separator' },
            cmd('Sort Lines Lexicographically Ascending', 'line-op', { arg: 'sort-asc' }),
            cmd('Sort Lines Lexicographically Descending', 'line-op', { arg: 'sort-desc' }),
            cmd('Sort Lines Ascending Ignoring Case', 'line-op', { arg: 'sort-asc-ci' }),
            cmd('Sort Lines Descending Ignoring Case', 'line-op', { arg: 'sort-desc-ci' }),
            cmd('Sort Lines As Numbers Ascending', 'line-op', { arg: 'sort-num-asc' }),
            cmd('Sort Lines As Numbers Descending', 'line-op', { arg: 'sort-num-desc' }),
            { type: 'separator' },
            cmd('Remove Duplicate Lines', 'line-op', { arg: 'remove-dupes' }),
            cmd('Remove Consecutive Duplicate Lines', 'line-op', { arg: 'remove-consecutive-dupes' }),
            cmd('Remove Empty Lines', 'line-op', { arg: 'remove-empty' }),
            cmd('Trim Trailing Whitespace', 'line-op', { arg: 'trim' }),
            cmd('Reverse Line Order', 'line-op', { arg: 'reverse' }),
            cmd('Randomize Line Order', 'line-op', { arg: 'randomize' }),
          ],
        },
        {
          label: 'Comment/Uncomment',
          submenu: [
            cmd('Toggle Single Line Comment', 'toggle-line-comment', { accelerator: 'CmdOrCtrl+/', registerAccelerator: false }),
            cmd('Toggle Block Comment', 'toggle-block-comment', { accelerator: 'Shift+Alt+A', registerAccelerator: false }),
          ],
        },
        {
          label: 'EOL Conversion',
          submenu: [
            cmd('Windows (CR LF)', 'set-eol', { arg: '\r\n' }),
            cmd('Unix (LF)', 'set-eol', { arg: '\n' }),
            cmd('Macintosh (CR)', 'set-eol', { arg: '\r' }),
          ],
        },
        { type: 'separator' },
        cmd('Find...', 'find', { accelerator: 'CmdOrCtrl+F' }),
        cmd('Replace...', 'replace', { accelerator: 'CmdOrCtrl+H' }),
        cmd('Go to Line...', 'goto-line', { accelerator: 'CmdOrCtrl+G' }),
      ],
    },
    {
      label: 'View',
      submenu: [
        cmd('Toggle Sidebar', 'toggle-sidebar', { accelerator: 'CmdOrCtrl+B' }),
        cmd('Toggle Minimap', 'toggle-minimap'),
        { type: 'separator' },
        {
          label: 'Show Symbol',
          submenu: [
            cmd('Toggle Show Space and Tab', 'toggle-whitespace'),
            cmd('Toggle Show End of Line', 'toggle-eol-markers'),
          ],
        },
        { type: 'separator' },
        cmd('Fold All', 'fold-all'),
        cmd('Unfold All', 'unfold-all'),
        { type: 'separator' },
        cmd('Toggle Word Wrap', 'toggle-wrap', { accelerator: 'Alt+Z' }),
        { type: 'separator' },
        cmd('Zoom In', 'zoom-in', { accelerator: 'CmdOrCtrl+=' }),
        cmd('Zoom Out', 'zoom-out', { accelerator: 'CmdOrCtrl+-' }),
        cmd('Reset Zoom', 'zoom-reset', { accelerator: 'CmdOrCtrl+0' }),
        { type: 'separator' },
        cmd('Toggle Split View', 'toggle-split', { accelerator: 'CmdOrCtrl+\\' }),
        cmd('Focus Other View', 'focus-other-view', { accelerator: 'F8' }),
        { type: 'separator' },
        {
          label: 'Tab',
          submenu: [
            cmd('Next Tab', 'tab', { arg: 'next', accelerator: 'CmdOrCtrl+Tab', registerAccelerator: false }),
            cmd('Previous Tab', 'tab', { arg: 'prev', accelerator: 'CmdOrCtrl+Shift+Tab', registerAccelerator: false }),
            cmd('First Tab', 'tab', { arg: 'first' }),
            cmd('Last Tab', 'tab', { arg: 'last' }),
            { type: 'separator' },
            cmd('Move Tab Forward', 'tab', { arg: 'move-forward', accelerator: 'CmdOrCtrl+Shift+PageDown', registerAccelerator: false }),
            cmd('Move Tab Backward', 'tab', { arg: 'move-backward', accelerator: 'CmdOrCtrl+Shift+PageUp', registerAccelerator: false }),
            { type: 'separator' },
            ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n =>
              cmd(`Tab ${n}`, 'tab', { arg: `goto:${n}`, accelerator: `CmdOrCtrl+${n}` })
            ),
          ],
        },
        { type: 'separator' },
        {
          label: 'Always on Top',
          type: 'checkbox',
          checked: false,
          click: (item) => { if (mainWindow) mainWindow.setAlwaysOnTop(item.checked); },
        },
        { type: 'separator' },
        cmd('Toggle Theme (Dark/Light)', 'toggle-theme'),
        { type: 'separator' },
        { label: 'Toggle Dev Tools', accelerator: 'F12', role: 'toggleDevTools' },
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
              message: `NotepadPlus v${app.getVersion()}`,
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
    if (session) {
      mainWindow.webContents.send('restore-session', session);
    }
    const startupPaths = [...pendingOpenPaths, ...filePathsFromArgv(process.argv)];
    pendingOpenPaths = [];
    openPathsInRenderer(startupPaths);
  });

  mainWindow.on('close', (event) => {
    if (closeConfirmed || !rendererReady) return;
    event.preventDefault();
    mainWindow.webContents.send('request-close');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  Menu.setApplicationMenu(buildMenu());
}

async function handleFileOpen() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt', 'md', 'log'] },
      { name: 'Code', extensions: ['js', 'ts', 'py', 'html', 'css', 'json', 'xml', 'cpp', 'c', 'h', 'java', 'php', 'rs', 'sql', 'sh', 'bat', 'yaml', 'yml', 'toml', 'ini', 'cfg'] },
    ],
  });

  if (result.canceled) return;
  openPathsInRenderer(result.filePaths);
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

ipcMain.handle('file-stat', async (event, { filePath }) => {
  try {
    const st = fs.statSync(filePath);
    return { success: true, size: st.size, mtimeMs: st.mtimeMs, birthtimeMs: st.birthtimeMs };
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

ipcMain.handle('confirm-action', async (event, { message, detail, buttons, defaultId, cancelId }) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: buttons || ['OK', 'Cancel'],
    defaultId: defaultId == null ? 0 : defaultId,
    cancelId: cancelId == null ? (buttons ? buttons.length - 1 : 1) : cancelId,
    message,
    detail: detail || undefined,
  });
  return result.response;
});

ipcMain.on('close-confirmed', () => {
  closeConfirmed = true;
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('show-error', async (event, { title, message }) => {
  dialog.showErrorBox(title || 'Error', message || '');
});

ipcMain.handle('show-info', async (event, { title, message, detail }) => {
  await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: title || 'NotepadPlus',
    message: message || '',
    detail: detail || undefined,
  });
});

ipcMain.handle('shell-show-item', async (event, { filePath }) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('shell-open-path', async (event, { filePath }) => {
  const err = await shell.openPath(filePath);
  return err ? { success: false, error: err } : { success: true };
});

app.whenReady().then(() => {
  loadRecentFiles();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
