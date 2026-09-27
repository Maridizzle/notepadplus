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

const CP1252_HIGH = [
  0x20AC, 0x0081, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
  0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008D, 0x017D, 0x008F,
  0x0090, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
  0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x009D, 0x017E, 0x0178,
];
const CP1252_REVERSE = new Map(CP1252_HIGH.map((cp, i) => [cp, 0x80 + i]));

function decodeAnsi(buf) {
  const out = new Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    out[i] = String.fromCharCode(b >= 0x80 && b <= 0x9F ? CP1252_HIGH[b - 0x80] : b);
  }
  return out.join('');
}

function encodeAnsi(str) {
  const bytes = Buffer.alloc(str.length);
  for (let i = 0; i < str.length; i++) {
    const cp = str.charCodeAt(i);
    if (cp < 0x80 || (cp >= 0xA0 && cp <= 0xFF)) bytes[i] = cp;
    else if (CP1252_REVERSE.has(cp)) bytes[i] = CP1252_REVERSE.get(cp);
    else bytes[i] = 0x3F;
  }
  return bytes;
}

function detectEncoding(buf) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return 'utf8bom';
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return 'utf16le';
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) return 'utf16be';
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  if (sample.length >= 4) {
    let oddNul = 0;
    let evenNul = 0;
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) {
        if (i % 2) oddNul++;
        else evenNul++;
      }
    }
    const pairs = sample.length / 2;
    if (oddNul > pairs * 0.3 && evenNul < pairs * 0.05) return 'utf16le';
    if (evenNul > pairs * 0.3 && oddNul < pairs * 0.05) return 'utf16be';
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return 'utf8';
  } catch {
    return 'ansi';
  }
}

function decodeBuffer(buf, encoding) {
  switch (encoding) {
    case 'utf8bom':
      return buf.toString('utf8', buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF ? 3 : 0);
    case 'utf16le':
      return buf.toString('utf16le', buf[0] === 0xFF && buf[1] === 0xFE ? 2 : 0);
    case 'utf16be': {
      const start = buf[0] === 0xFE && buf[1] === 0xFF ? 2 : 0;
      let body = Buffer.from(buf.subarray(start));
      if (body.length % 2) body = body.subarray(0, body.length - 1);
      body.swap16();
      return body.toString('utf16le');
    }
    case 'ansi':
      return decodeAnsi(buf);
    default:
      return buf.toString('utf8');
  }
}

function encodeString(str, encoding) {
  switch (encoding) {
    case 'utf8bom':
      return Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(str, 'utf8')]);
    case 'utf16le':
      return Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(str, 'utf16le')]);
    case 'utf16be': {
      const body = Buffer.from(str, 'utf16le');
      body.swap16();
      return Buffer.concat([Buffer.from([0xFE, 0xFF]), body]);
    }
    case 'ansi':
      return encodeAnsi(str);
    default:
      return Buffer.from(str, 'utf8');
  }
}

function readTextFile(filePath, forceEncoding) {
  const buf = fs.readFileSync(filePath);
  const encoding = forceEncoding || detectEncoding(buf);
  return { content: decodeBuffer(buf, encoding), encoding };
}

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + escaped + '$', 'i');
}

async function findInFiles(opts) {
  const { dir, query, regex, matchCase, wholeWord, filters, subfolders } = opts;
  if (!query) return { success: false, error: 'Nothing to search for.' };
  let pattern;
  try {
    let src = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (wholeWord) src = `\\b(?:${src})\\b`;
    pattern = new RegExp(src, matchCase ? '' : 'i');
  } catch (err) {
    return { success: false, error: 'Invalid regular expression: ' + err.message };
  }
  const filterRes = (filters || '').split(/[\s,;]+/).filter(Boolean).map(globToRegExp);
  const MAX_MATCHES = 5000;
  const MAX_SIZE = 5 * 1024 * 1024;
  const results = [];
  let total = 0;
  let filesSearched = 0;

  async function walk(d) {
    let entries;
    try {
      entries = await fs.promises.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (total >= MAX_MATCHES) return;
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (subfolders && e.name !== 'node_modules') await walk(p);
        continue;
      }
      if (!e.isFile()) continue;
      if (filterRes.length && !filterRes.some(r => r.test(e.name))) continue;
      let buf;
      try {
        const st = await fs.promises.stat(p);
        if (st.size > MAX_SIZE) continue;
        buf = await fs.promises.readFile(p);
      } catch {
        continue;
      }
      const encoding = detectEncoding(buf);
      if (encoding !== 'utf16le' && encoding !== 'utf16be' && buf.subarray(0, 8192).includes(0)) continue;
      filesSearched++;
      const lines = decodeBuffer(buf, encoding).split(/\r\n|\r|\n/);
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        const m = pattern.exec(lines[i]);
        if (m) {
          matches.push({ line: i + 1, col: m.index + 1, text: lines[i].slice(0, 300) });
          total++;
          if (total >= MAX_MATCHES) break;
        }
      }
      if (matches.length) results.push({ filePath: p, matches });
    }
  }

  try {
    if (!fs.statSync(dir).isDirectory()) return { success: false, error: 'Directory not found.' };
  } catch {
    return { success: false, error: 'Directory not found.' };
  }
  await walk(dir);
  return { success: true, results, total, filesSearched, truncated: total >= MAX_MATCHES };
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
      const { content, encoding } = readTextFile(filePath);
      addRecentFile(filePath);
      mainWindow.webContents.send('file-opened', { filePath, content, encoding });
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

let languageList = [];

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
        cmd('Rename...', 'rename'),
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
        cmd('Print...', 'print', { accelerator: 'CmdOrCtrl+P' }),
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
        cmd('Column Editor...', 'column-editor', { accelerator: 'Alt+C' }),
        {
          label: 'EOL Conversion',
          submenu: [
            cmd('Windows (CR LF)', 'set-eol', { arg: '\r\n' }),
            cmd('Unix (LF)', 'set-eol', { arg: '\n' }),
            cmd('Macintosh (CR)', 'set-eol', { arg: '\r' }),
          ],
        },
      ],
    },
    {
      label: 'Search',
      submenu: [
        cmd('Find...', 'find', { accelerator: 'CmdOrCtrl+F' }),
        cmd('Replace...', 'replace', { accelerator: 'CmdOrCtrl+H' }),
        cmd('Find in Files...', 'find-in-files', { accelerator: 'CmdOrCtrl+Shift+F' }),
        { type: 'separator' },
        cmd('Go to Line...', 'goto-line', { accelerator: 'CmdOrCtrl+G' }),
        { type: 'separator' },
        {
          label: 'Bookmark',
          submenu: [
            cmd('Toggle Bookmark', 'bookmark', { arg: 'toggle', accelerator: 'CmdOrCtrl+F2' }),
            cmd('Next Bookmark', 'bookmark', { arg: 'next', accelerator: 'F2' }),
            cmd('Previous Bookmark', 'bookmark', { arg: 'prev', accelerator: 'Shift+F2' }),
            cmd('Clear All Bookmarks', 'bookmark', { arg: 'clear' }),
            { type: 'separator' },
            cmd('Cut Bookmarked Lines', 'bookmark', { arg: 'cut' }),
            cmd('Copy Bookmarked Lines', 'bookmark', { arg: 'copy' }),
            cmd('Remove Bookmarked Lines', 'bookmark', { arg: 'remove' }),
            cmd('Remove Unmarked Lines', 'bookmark', { arg: 'remove-unmarked' }),
            cmd('Inverse Bookmark', 'bookmark', { arg: 'inverse' }),
          ],
        },
        {
          label: 'Change History',
          submenu: [
            cmd('Go to Next Change', 'change-history', { arg: 'next' }),
            cmd('Go to Previous Change', 'change-history', { arg: 'prev' }),
            cmd('Clear Change History', 'change-history', { arg: 'clear' }),
            { type: 'separator' },
            cmd('Toggle Change History Margin', 'change-history', { arg: 'toggle' }),
          ],
        },
        { type: 'separator' },
        cmd('Check Closers (Brackets and Quotes)...', 'check-closers', { accelerator: 'CmdOrCtrl+Shift+K' }),
      ],
    },
    {
      label: 'Encoding',
      submenu: [
        cmd('Convert to UTF-8', 'set-encoding', { arg: 'utf8' }),
        cmd('Convert to UTF-8-BOM', 'set-encoding', { arg: 'utf8bom' }),
        cmd('Convert to UTF-16 LE', 'set-encoding', { arg: 'utf16le' }),
        cmd('Convert to UTF-16 BE', 'set-encoding', { arg: 'utf16be' }),
        cmd('Convert to ANSI (Windows-1252)', 'set-encoding', { arg: 'ansi' }),
        { type: 'separator' },
        {
          label: 'Reinterpret File As',
          submenu: [
            cmd('UTF-8', 'reopen-encoding', { arg: 'utf8' }),
            cmd('UTF-8-BOM', 'reopen-encoding', { arg: 'utf8bom' }),
            cmd('UTF-16 LE', 'reopen-encoding', { arg: 'utf16le' }),
            cmd('UTF-16 BE', 'reopen-encoding', { arg: 'utf16be' }),
            cmd('ANSI (Windows-1252)', 'reopen-encoding', { arg: 'ansi' }),
          ],
        },
      ],
    },
    {
      label: 'Language',
      submenu: languageList.length
        ? languageList.map(l => cmd(l.name, 'set-language', { arg: l.key }))
        : [{ label: '(loading)', enabled: false }],
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
        cmd('Link Map', 'link-map', { accelerator: 'CmdOrCtrl+Shift+M' }),
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

ipcMain.handle('dialog-save-as', async (event, { content, defaultPath, encoding }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath || 'untitled.txt',
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt'] },
    ],
  });

  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, encodeString(content, encoding || 'utf8'));
      return { success: true, filePath: result.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false, canceled: true };
});

ipcMain.handle('file-save', async (event, { filePath, content, encoding }) => {
  try {
    fs.writeFileSync(filePath, encodeString(content, encoding || 'utf8'));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('file-read', async (event, { filePath, encoding }) => {
  try {
    const result = readTextFile(filePath, encoding);
    addRecentFile(filePath);
    return { success: true, content: result.content, encoding: result.encoding };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.on('language-list', (event, list) => {
  if (Array.isArray(list)) {
    languageList = list.filter(l => l && typeof l.key === 'string' && typeof l.name === 'string');
    Menu.setApplicationMenu(buildMenu());
  }
});

ipcMain.handle('file-rename', async (event, { oldPath, newPath }) => {
  try {
    if (fs.existsSync(newPath)) return { success: false, error: 'A file with that name already exists.' };
    fs.renameSync(oldPath, newPath);
    recentFiles = recentFiles.map(f => (f === oldPath ? newPath : f));
    saveRecentFiles();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

ipcMain.handle('print-text', async (event, { title, text, fontFamily, fontSize }) => {
  const win = new BrowserWindow({
    show: false,
    parent: mainWindow || undefined,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  const safeFont = String(fontFamily || 'monospace').replace(/[^A-Za-z0-9 ,'"\-]/g, '');
  const safeSize = Math.max(6, Math.min(72, parseInt(fontSize, 10) || 10));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title || 'Untitled')}</title>`
    + `<style>body{margin:15mm;color:#000;background:#fff;font-family:${safeFont};font-size:${safeSize}pt;line-height:1.4;white-space:pre-wrap;word-wrap:break-word;}</style>`
    + `</head><body>${escapeHtml(text || '')}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  return new Promise((resolve) => {
    win.webContents.print({ printBackground: false }, (success, reason) => {
      win.close();
      resolve({ success, reason: reason || '' });
    });
  });
});

async function scanLinks(rootDir) {
  const files = [];
  async function walk(d) {
    let entries;
    try {
      entries = await fs.promises.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      if (!e.isFile()) continue;
      if (!/\.(md|markdown|txt)$/i.test(e.name)) continue;
      files.push(p);
    }
  }
  await walk(rootDir);

  const byName = new Map();
  for (const p of files) {
    const base = path.basename(p);
    const noExt = base.replace(/\.[^.]+$/, '');
    for (const key of [base.toLowerCase(), noExt.toLowerCase()]) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(p);
    }
  }

  const resolveLink = (fromPath, text) => {
    const fromDir = path.dirname(fromPath);
    const cleaned = text.trim().replace(/\\/g, '/');
    const candidates = [cleaned, cleaned + '.md', cleaned + '.txt', cleaned + '.markdown'];
    for (const c of candidates) {
      const abs = path.resolve(fromDir, c);
      if (files.includes(abs)) return abs;
      const absRoot = path.resolve(rootDir, c);
      if (files.includes(absRoot)) return absRoot;
    }
    const leaf = cleaned.split('/').pop().toLowerCase();
    const matches = byName.get(leaf) || byName.get(leaf.replace(/\.[^.]+$/, '')) || [];
    if (matches.length) {
      const sameDir = matches.find(m => path.dirname(m) === fromDir);
      return sameDir || matches[0];
    }
    return null;
  };

  const links = [];
  const MAX_SIZE = 2 * 1024 * 1024;
  for (const p of files) {
    let buf;
    try {
      const st = await fs.promises.stat(p);
      if (st.size > MAX_SIZE) continue;
      buf = await fs.promises.readFile(p);
    } catch {
      continue;
    }
    const text = decodeBuffer(buf, detectEncoding(buf));
    const re = /\[\[([^\]\n]+)\]\]/g;
    let m;
    const seen = new Set();
    while ((m = re.exec(text)) !== null) {
      const target = m[1].split('|')[0].split('#')[0];
      const to = resolveLink(p, target);
      const key = to || ('missing:' + target.trim().toLowerCase());
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ from: p, to, text: target.trim() });
    }
  }
  return { files, links };
}

ipcMain.handle('scan-links', async (event, { dirPath }) => {
  try {
    if (!fs.statSync(dirPath).isDirectory()) return { success: false, error: 'Folder not found.' };
    const result = await scanLinks(dirPath);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('find-in-files', async (event, opts) => {
  try {
    return await findInFiles(opts);
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
