import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import { EditorState, Compartment, RangeSetBuilder, StateEffect } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches, openSearchPanel, closeSearchPanel } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap, foldAll, unfoldAll } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';

import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { php } from '@codemirror/lang-php';
import { rust } from '@codemirror/lang-rust';
import { sql } from '@codemirror/lang-sql';
import * as Diff from 'diff';

const LANGUAGES = {
  '.js': { name: 'JavaScript', ext: javascript },
  '.mjs': { name: 'JavaScript', ext: javascript },
  '.jsx': { name: 'JSX', ext: () => javascript({ jsx: true }) },
  '.ts': { name: 'TypeScript', ext: () => javascript({ typescript: true }) },
  '.tsx': { name: 'TSX', ext: () => javascript({ typescript: true, jsx: true }) },
  '.html': { name: 'HTML', ext: html },
  '.htm': { name: 'HTML', ext: html },
  '.css': { name: 'CSS', ext: css },
  '.py': { name: 'Python', ext: python },
  '.json': { name: 'JSON', ext: json },
  '.md': { name: 'Markdown', ext: markdown },
  '.markdown': { name: 'Markdown', ext: markdown },
  '.xml': { name: 'XML', ext: xml },
  '.svg': { name: 'XML', ext: xml },
  '.c': { name: 'C', ext: cpp },
  '.cpp': { name: 'C++', ext: cpp },
  '.h': { name: 'C/C++ Header', ext: cpp },
  '.hpp': { name: 'C++ Header', ext: cpp },
  '.java': { name: 'Java', ext: java },
  '.php': { name: 'PHP', ext: php },
  '.rs': { name: 'Rust', ext: rust },
  '.sql': { name: 'SQL', ext: sql },
  '.txt': { name: 'Plain Text', ext: null },
  '.log': { name: 'Plain Text', ext: null },
  '.ini': { name: 'Plain Text', ext: null },
  '.cfg': { name: 'Plain Text', ext: null },
};

const languageCompartment = new Compartment();
const wrapCompartment = new Compartment();
const splitLanguageCompartment = new Compartment();
const splitWrapCompartment = new Compartment();
const splitFontCompartment = new Compartment();

let tabs = [];
let activeTabId = null;
let tabCounter = 0;
let editorView = null;
let fontSize = 14;
let currentFolderPath = null;
const AUTO_SAVE_DELAY = 2000;
const refreshDecorations = StateEffect.define();

function hasRefreshEffect(update) {
  return update.transactions.some(tr => tr.effects.some(e => e.is(refreshDecorations)));
}

function activeView() {
  return focusedPane === 'right' && splitEditorView ? splitEditorView : editorView;
}
let wordWrap = false;
let currentFontFamily = null;
let leftBgColor = null;
let rightBgColor = null;
let proseBgColor = null;
let focusedPane = 'left';

const fontCompartment = new Compartment();

function paneTheme(fontFamily, bgColor) {
  const spec = {};
  if (fontFamily) spec['.cm-content, .cm-gutters'] = { fontFamily };
  if (bgColor) {
    spec['&'] = { backgroundColor: bgColor };
    spec['.cm-gutters'] = { backgroundColor: bgColor };
  }
  return Object.keys(spec).length ? EditorView.theme(spec) : [];
}

const DEFAULT_EOL = '\r\n';

function detectEol(raw) {
  const m = /\r\n|\r|\n/.exec(raw);
  return m ? m[0] : DEFAULT_EOL;
}

function normalizeNewlines(raw) {
  return raw.replace(/\r\n?/g, '\n');
}

function getCurrentContent() {
  return proseMode
    ? document.getElementById('prose-editor').value
    : editorView.state.doc.toString();
}

function syncProseToEditor() {
  const text = document.getElementById('prose-editor').value;
  if (text !== editorView.state.doc.toString()) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: text },
    });
  }
}

const wikiLinkMark = Decoration.mark({ class: 'cm-wiki-link' });
const wikiBracketMark = Decoration.mark({ class: 'cm-wiki-bracket' });

function buildWikiLinkDecorations(view) {
  const builder = new RangeSetBuilder();
  const doc = view.state.doc;
  const regex = /\[\[([^\]]+)\]\]/g;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(line.text)) !== null) {
      const from = line.from + match.index;
      const bracketOpenEnd = from + 2;
      const linkStart = bracketOpenEnd;
      const linkEnd = linkStart + match[1].length;
      const bracketCloseEnd = linkEnd + 2;

      builder.add(from, bracketOpenEnd, wikiBracketMark);
      builder.add(linkStart, linkEnd, wikiLinkMark);
      builder.add(linkEnd, bracketCloseEnd, wikiBracketMark);
    }
  }
  return builder.finish();
}

const wikiLinkPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = buildWikiLinkDecorations(view);
  }
  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildWikiLinkDecorations(update.view);
    }
  }
}, {
  decorations: v => v.decorations,
  eventHandlers: {
    click(e, view) {
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos === null) return;

      const doc = view.state.doc;
      const line = doc.lineAt(pos);
      const regex = /\[\[([^\]]+)\]\]/g;
      let match;
      while ((match = regex.exec(line.text)) !== null) {
        const linkStart = line.from + match.index + 2;
        const linkEnd = linkStart + match[1].length;
        if (pos >= linkStart && pos <= linkEnd) {
          if (e.ctrlKey || e.metaKey) {
            resolveWikiLink(match[1]);
            return;
          }
        }
      }
    }
  }
});

function getFileExtension(filePath) {
  if (!filePath) return '';
  const dot = filePath.lastIndexOf('.');
  return dot >= 0 ? filePath.substring(dot).toLowerCase() : '';
}

function getFileName(filePath) {
  if (!filePath) return 'Untitled';
  return filePath.replace(/\\/g, '/').split('/').pop();
}

function getLanguageForFile(filePath) {
  const ext = getFileExtension(filePath);
  return LANGUAGES[ext] || { name: 'Plain Text', ext: null };
}

function getLanguageExtension(filePath) {
  const lang = getLanguageForFile(filePath);
  if (!lang.ext) return [];
  const ext = typeof lang.ext === 'function' ? lang.ext() : lang.ext();
  return [ext];
}

function createTab(filePath, rawContent, opts = {}) {
  const id = ++tabCounter;
  const content = normalizeNewlines(rawContent || '');
  const tab = {
    id,
    filePath,
    content,
    savedContent: content,
    modified: false,
    eol: rawContent ? detectEol(rawContent) : DEFAULT_EOL,
    scrollPos: opts.scrollPos || 0,
    cursorPos: opts.cursorPos || 0,
    state: null,
  };
  tab.state = createTabState(tab);
  tabs.push(tab);
  renderTabs();
  switchToTab(id);
  return tab;
}

function createTabState(tab) {
  const pos = Math.min(tab.cursorPos, tab.content.length);
  return EditorState.create({
    doc: tab.content,
    selection: { anchor: pos },
    extensions: [
      ...mainExtensions(),
      languageCompartment.of(getLanguageExtension(tab.filePath)),
    ],
  });
}

function applyEditorSettings() {
  editorView.dispatch({
    effects: [
      wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
      fontCompartment.reconfigure(paneTheme(currentFontFamily, leftBgColor)),
      themeCompartment.reconfigure(isDarkTheme ? oneDark : []),
    ],
  });
}

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId);
}

function getSessionState() {
  const currentTab = getActiveTab();
  if (currentTab && editorView) {
    currentTab.content = getCurrentContent();
    currentTab.scrollPos = editorView.scrollDOM.scrollTop;
    currentTab.cursorPos = editorView.state.selection.main.head;
  }

  const activeIndex = tabs.findIndex(t => t.id === activeTabId);
  return {
    activeIndex,
    tabs: tabs.map(t => ({
      filePath: t.filePath,
      content: t.filePath ? null : t.content,
      cursorPos: t.cursorPos || 0,
      scrollPos: t.scrollPos || 0,
    })),
  };
}

async function restoreSession(session) {
  while (tabs.length > 0) {
    tabs.pop();
  }
  activeTabId = null;
  renderTabs();

  for (const saved of session.tabs) {
    const opts = { cursorPos: saved.cursorPos || 0, scrollPos: saved.scrollPos || 0 };
    if (saved.filePath) {
      try {
        const result = await window.electronAPI.readFile({ filePath: saved.filePath });
        if (result.success) {
          createTab(saved.filePath, result.content, opts);
        }
      } catch (e) {}
    } else if (saved.content) {
      createTab(null, saved.content, opts);
    }
  }

  const targetIndex = session.activeIndex != null ? session.activeIndex : 0;
  if (targetIndex < tabs.length) {
    switchToTab(tabs[targetIndex].id);
  } else if (tabs.length > 0) {
    switchToTab(tabs[0].id);
  }
}

function switchToTab(id) {
  const currentTab = getActiveTab();
  if (currentTab && editorView) {
    if (proseMode) syncProseToEditor();
    currentTab.state = editorView.state;
    currentTab.content = editorView.state.doc.toString();
    currentTab.scrollPos = editorView.scrollDOM.scrollTop;
    currentTab.cursorPos = editorView.state.selection.main.head;
  }

  activeTabId = id;
  const tab = getActiveTab();
  if (!tab) return;

  editorView.setState(tab.state);
  applyEditorSettings();
  editorView.scrollDOM.scrollTop = tab.scrollPos || 0;

  if (proseMode) {
    document.getElementById('prose-editor').value = tab.content;
    document.getElementById('prose-editor').focus();
  } else {
    editorView.focus();
  }

  refreshSplitClone();
  if (minimapVisible) requestAnimationFrame(renderMinimap);
  updateStatusBar();
  renderTabs();
}

async function confirmDiscard(message) {
  if (!window.electronAPI || !window.electronAPI.confirmClose) return 1;
  return window.electronAPI.confirmClose({ message });
}

async function closeTab(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;

  if (tab.modified) {
    const choice = await confirmDiscard(`Save changes to ${getFileName(tab.filePath)}?`);
    if (choice === 2) return;
    if (choice === 0) {
      const ok = await saveTab(tab);
      if (!ok) return;
    }
  }

  const idx = tabs.findIndex(t => t.id === id);
  if (idx < 0) return;

  if (tab.autoSaveTimer) clearTimeout(tab.autoSaveTimer);
  tabs.splice(idx, 1);
  if (splitMode === 'tab' && splitTabId === id) hideSplitLayout();

  if (tabs.length === 0) {
    createTab(null, '');
    return;
  }

  if (activeTabId === id) {
    const newIdx = Math.min(idx, tabs.length - 1);
    switchToTab(tabs[newIdx].id);
  } else {
    renderTabs();
  }
}

function renderTabs() {
  const container = document.getElementById('tabs-container');
  container.innerHTML = '';

  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '') + (tab.modified ? ' modified' : '');
    el.dataset.id = tab.id;

    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = getFileName(tab.filePath);

    const modified = document.createElement('span');
    modified.className = 'tab-modified';

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });

    el.appendChild(name);
    el.appendChild(modified);
    el.appendChild(close);

    el.addEventListener('click', () => {
      if (focusedPane === 'right' && splitView && splitMode !== 'compare') {
        loadTabIntoSplitPane(tab);
      } else {
        switchToTab(tab.id);
      }
    });
    container.appendChild(el);
  }
}

function updateWindowTitle() {
  if (!window.electronAPI || !window.electronAPI.setTitle) return;
  const tab = getActiveTab();
  const fileName = tab ? getFileName(tab.filePath) : 'Untitled';
  const modified = tab && tab.modified ? ' *' : '';
  window.electronAPI.setTitle({ title: `${fileName}${modified} - NotepadPlus` });
}

function statusTarget() {
  const tab = getActiveTab();
  const rightFocused = focusedPane === 'right' && splitEditorView;
  if (rightFocused && splitMode === 'file') {
    return { filePath: splitFilePath, modified: splitModified, eol: splitEol, view: splitEditorView };
  }
  if (rightFocused && splitMode === 'tab') {
    const st = tabs.find(t => t.id === splitTabId) || tab;
    return { filePath: st.filePath, modified: st.modified, eol: st.eol, view: splitEditorView };
  }
  if (rightFocused && splitMode === 'compare') {
    return { filePath: compareRightPath, modified: false, eol: tab.eol, view: splitEditorView };
  }
  return { filePath: tab.filePath, modified: tab.modified, eol: tab.eol, view: editorView };
}

function updateStatusBar() {
  const tab = getActiveTab();
  if (!tab) return;
  const target = statusTarget();

  document.getElementById('status-file').textContent = target.filePath || 'Untitled';
  document.getElementById('status-modified').textContent = target.modified ? '(Modified)' : '';

  const lang = getLanguageForFile(target.filePath);
  document.getElementById('status-lang').textContent = lang.name;
  document.getElementById('status-encoding').textContent = 'UTF-8';
  document.getElementById('status-eol').textContent =
    target.eol === '\r\n' ? 'CRLF' : target.eol === '\r' ? 'CR' : 'LF';

  const view = target.view;
  if (view) {
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const col = pos - line.from + 1;
    document.getElementById('status-position').textContent = `Ln ${line.number}, Col ${col}`;

    const doc = view.state.doc;
    document.getElementById('status-lines').textContent = `${doc.lines} lines`;

    const { from, to } = view.state.selection.main;
    if (from !== to) {
      const selLen = to - from;
      document.getElementById('status-selection').textContent = `(${selLen} selected)`;
    } else {
      document.getElementById('status-selection').textContent = '';
    }
  }

  updateWindowTitle();
}

function markModified() {
  const tab = getActiveTab();
  if (!tab) return;
  const currentContent = getCurrentContent();
  tab.content = currentContent;
  tab.modified = currentContent !== tab.savedContent;
  renderTabs();
  updateStatusBar();
  if (tab.modified && tab.filePath) {
    scheduleAutoSave();
  }
}

function tabContent(tab) {
  return tab.id === activeTabId ? getCurrentContent() : tab.content;
}

function markTabSaved(tab, content) {
  tab.content = content;
  tab.savedContent = content;
  tab.modified = false;
  renderTabs();
  updateStatusBar();
}

async function saveTab(tab) {
  if (!tab || !window.electronAPI) return false;
  if (!tab.filePath) return saveTabAs(tab);

  const content = tabContent(tab);
  const result = await window.electronAPI.saveFile({
    filePath: tab.filePath,
    content: content.replace(/\n/g, tab.eol),
  });
  if (!result.success) return false;
  markTabSaved(tab, content);
  return true;
}

async function saveTabAs(tab) {
  if (!tab || !window.electronAPI) return false;

  const content = tabContent(tab);
  const result = await window.electronAPI.saveAs({
    content: content.replace(/\n/g, tab.eol),
    defaultPath: tab.filePath || 'untitled.txt',
  });
  if (!result.success) return false;
  tab.filePath = result.filePath;
  markTabSaved(tab, content);
  return true;
}

function rightPaneTarget() {
  if (focusedPane !== 'right' || !splitEditorView) return null;
  return splitMode === 'file' || splitMode === 'tab' ? splitMode : null;
}

async function saveCurrentFile() {
  const target = rightPaneTarget();
  if (target === 'file') return saveSplitFile();
  if (target === 'tab') return saveTab(tabs.find(t => t.id === splitTabId));
  return saveTab(getActiveTab());
}

async function saveCurrentFileAs() {
  const target = rightPaneTarget();
  if (target === 'file') return saveSplitFileAs();
  if (target === 'tab') return saveTabAs(tabs.find(t => t.id === splitTabId));
  return saveTabAs(getActiveTab());
}

function applyFontSize() {
  const px = fontSize + 'px';
  document.querySelectorAll('.cm-editor').forEach(el => { el.style.fontSize = px; });
  document.getElementById('prose-editor').style.fontSize = px;
  if (editorView) editorView.requestMeasure();
  if (splitEditorView) splitEditorView.requestMeasure();
}

function setFontSize(size) {
  fontSize = Math.max(8, Math.min(40, size));
  applyFontSize();
}

function doUndo() {
  if (proseMode && focusedPane === 'prose') {
    document.execCommand('undo');
  } else {
    undo(activeView());
  }
}

function doRedo() {
  if (proseMode && focusedPane === 'prose') {
    document.execCommand('redo');
  } else {
    redo(activeView());
  }
}

function mainExtensions() {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    wrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
    fontCompartment.of(paneTheme(currentFontFamily, leftBgColor)),
    wikiLinkPlugin,
    grammarPlugin,
    comparePluginLeft,
    themeCompartment.of(isDarkTheme ? oneDark : []),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        markModified();
        mirrorChanges(splitEditorView, update);
        if (minimapVisible) requestAnimationFrame(renderMinimap);
      }
      if (update.selectionSet || update.docChanged) {
        updateStatusBar();
      }
    }),
    EditorView.domEventHandlers({
      drop(e) {
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          return true;
        }
        return false;
      },
    }),
  ];
}

function initEditor() {
  const editorEl = document.getElementById('editor');

  editorView = new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [...mainExtensions(), languageCompartment.of([])],
    }),
    parent: editorEl,
  });

  createTab(null, '');
}

async function resolveWikiLink(linkText) {
  const tab = getActiveTab();
  if (!tab || !window.electronAPI) return;

  let searchDir = currentFolderPath;
  if (!searchDir && tab.filePath) {
    searchDir = tab.filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  }
  if (!searchDir) return;

  const candidates = [
    linkText,
    linkText + '.txt',
    linkText + '.md',
    linkText + '.html',
    linkText + '.js',
    linkText + '.py',
    linkText + '.json',
  ];

  for (const candidate of candidates) {
    const fullPath = searchDir + '/' + candidate;
    const result = await window.electronAPI.readFile({ filePath: fullPath });
    if (result.success) {
      await window.electronAPI.trackRecentFile({ filePath: fullPath });
      const existing = tabs.find(t => t.filePath === fullPath);
      if (existing) {
        switchToTab(existing.id);
      } else {
        createTab(fullPath, result.content);
      }
      return;
    }
  }

  await searchSubdirectories(searchDir, linkText);
}

async function searchSubdirectories(baseDir, linkText) {
  if (!window.electronAPI) return;

  const result = await window.electronAPI.readDirectory({ dirPath: baseDir });
  if (!result.success) return;

  for (const item of result.items) {
    if (!item.isDirectory) {
      const nameNoExt = item.name.replace(/\.[^.]+$/, '');
      if (nameNoExt.toLowerCase() === linkText.toLowerCase() || item.name.toLowerCase() === linkText.toLowerCase()) {
        await openFileFromPath(item.path);
        return;
      }
    }
  }

  for (const item of result.items) {
    if (item.isDirectory) {
      const found = await searchSubdirForFile(item.path, linkText);
      if (found) {
        await openFileFromPath(found);
        return;
      }
    }
  }
}

async function searchSubdirForFile(dirPath, linkText) {
  if (!window.electronAPI) return null;

  const result = await window.electronAPI.readDirectory({ dirPath });
  if (!result.success) return null;

  for (const item of result.items) {
    if (!item.isDirectory) {
      const nameNoExt = item.name.replace(/\.[^.]+$/, '');
      if (nameNoExt.toLowerCase() === linkText.toLowerCase() || item.name.toLowerCase() === linkText.toLowerCase()) {
        return item.path;
      }
    }
  }
  return null;
}

function scheduleAutoSave(tab = getActiveTab()) {
  if (!tab) return;
  if (tab.autoSaveTimer) clearTimeout(tab.autoSaveTimer);
  tab.autoSaveTimer = setTimeout(async () => {
    tab.autoSaveTimer = null;
    if (!tab.filePath || !tab.modified) return;
    if (await saveTab(tab)) flashAutoSaveIndicator();
  }, AUTO_SAVE_DELAY);
}

function flashAutoSaveIndicator() {
  const indicator = document.getElementById('autosave-indicator');
  indicator.textContent = 'Saved!';
  indicator.style.color = '#4ec969';
  setTimeout(() => {
    indicator.textContent = 'Auto-save: ON';
    indicator.style.color = '#73c991';
  }, 1500);
}

let proseMode = false;
let grammarMatches = [];
let grammarDecorations = Decoration.none;

let leftCompareRanges = [];
let rightCompareRanges = [];

function buildCompareDecorations(view, ranges) {
  const builder = new RangeSetBuilder();
  const docLen = view.state.doc.length;
  for (const range of ranges) {
    if (range.from < docLen) {
      const to = Math.min(range.to, docLen);
      if (range.from < to) {
        builder.add(range.from, to, Decoration.mark({ class: range.cls }));
      }
    }
  }
  return builder.finish();
}

const comparePluginLeft = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = buildCompareDecorations(view, leftCompareRanges);
  }
  update(update) {
    if (update.docChanged || update.viewportChanged || hasRefreshEffect(update)) {
      this.decorations = buildCompareDecorations(update.view, leftCompareRanges);
    }
  }
}, { decorations: v => v.decorations });

const grammarCompartment = new Compartment();

function getGrammarClass(rule) {
  if (!rule || !rule.category) return 'cm-grammar-error';
  const cat = rule.category.id || '';
  if (cat === 'TYPOS' || cat === 'SPELLING') return 'cm-grammar-typo';
  if (cat === 'STYLE' || cat === 'REDUNDANCY' || cat === 'TYPOGRAPHY') return 'cm-grammar-style';
  return 'cm-grammar-error';
}

function getTypeLabel(rule) {
  if (!rule || !rule.category) return 'error';
  const cat = rule.category.id || '';
  if (cat === 'TYPOS' || cat === 'SPELLING') return 'typo';
  if (cat === 'STYLE' || cat === 'REDUNDANCY' || cat === 'TYPOGRAPHY') return 'style';
  return 'error';
}

function buildGrammarDecorations(view) {
  const builder = new RangeSetBuilder();
  const docLen = view.state.doc.length;
  const sorted = grammarMatches
    .filter(m => m.offset < docLen && m.offset + m.length <= docLen)
    .sort((a, b) => a.offset - b.offset);

  for (const match of sorted) {
    const cls = getGrammarClass(match.rule);
    builder.add(
      match.offset,
      match.offset + match.length,
      Decoration.mark({ class: cls })
    );
  }
  return builder.finish();
}

const grammarPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = buildGrammarDecorations(view);
  }
  update(update) {
    if (update.docChanged || update.viewportChanged || hasRefreshEffect(update)) {
      this.decorations = buildGrammarDecorations(update.view);
    }
  }
}, { decorations: v => v.decorations });

function refreshGrammarDecorations() {
  if (!proseMode && editorView) {
    editorView.dispatch({ effects: refreshDecorations.of(null) });
  }
}

function closeGrammarPanel() {
  grammarMatches = [];
  document.getElementById('grammar-panel').classList.add('hidden');
  document.getElementById('btn-grammar').classList.remove('active');
  refreshGrammarDecorations();
}

async function runGrammarCheck() {
  if (!window.electronAPI || !window.electronAPI.checkGrammar) return;

  const text = getCurrentContent();
  const statusEl = document.getElementById('grammar-status');
  document.getElementById('grammar-panel').classList.remove('hidden');
  document.getElementById('btn-grammar').classList.add('active');

  if (!text.trim()) {
    grammarMatches = [];
    statusEl.textContent = 'Nothing to check';
    showGrammarResults([]);
    refreshGrammarDecorations();
    return;
  }

  statusEl.textContent = 'Checking...';

  const response = await window.electronAPI.checkGrammar({ text });

  if (!response.success) {
    statusEl.textContent = 'Error: ' + response.error;
    return;
  }

  grammarMatches = response.result.matches || [];
  statusEl.textContent = grammarMatches.length === 0
    ? 'No issues found'
    : `${grammarMatches.length} issue${grammarMatches.length > 1 ? 's' : ''}`;

  refreshGrammarDecorations();
  showGrammarResults(grammarMatches);
}

function showGrammarResults(matches) {
  const container = document.getElementById('grammar-results');
  if (matches.length === 0) {
    container.innerHTML = '<div style="padding: 12px; color: var(--text-secondary); text-align: center;">No grammar or spelling issues found.</div>';
    return;
  }

  container.innerHTML = '';
  matches.forEach((match, index) => {
    const item = document.createElement('div');
    item.className = 'grammar-item';

    const typeLabel = getTypeLabel(match.rule);

    const contextText = match.context || {};
    const ctxStr = contextText.text || '';
    const ctxOffset = contextText.offset || 0;
    const ctxLen = match.length;
    const before = ctxStr.substring(0, ctxOffset);
    const marked = ctxStr.substring(ctxOffset, ctxOffset + ctxLen);
    const after = ctxStr.substring(ctxOffset + ctxLen);

    const topFix = (match.replacements && match.replacements.length > 0)
      ? match.replacements[0].value : null;

    item.innerHTML = `
      <span class="grammar-item-type ${typeLabel}">${typeLabel.toUpperCase()}</span>
      <div class="grammar-item-body">
        <div class="grammar-item-message">${escapeHtml(match.message || '')}</div>
        <div class="grammar-item-context">${escapeHtml(before)}<mark>${escapeHtml(marked)}</mark>${escapeHtml(after)}</div>
      </div>
      ${topFix ? `<button class="grammar-item-fix" data-index="${index}">Fix: ${escapeHtml(topFix)}</button>` : ''}
    `;

    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('grammar-item-fix')) return;
      jumpToGrammarMatch(match);
    });

    const fixBtn = item.querySelector('.grammar-item-fix');
    if (fixBtn) {
      fixBtn.addEventListener('click', () => applyGrammarFix(match, index));
    }

    container.appendChild(item);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function jumpToGrammarMatch(match) {
  if (proseMode) {
    const textarea = document.getElementById('prose-editor');
    textarea.focus();
    textarea.setSelectionRange(match.offset, match.offset + match.length);
  } else if (editorView) {
    const pos = Math.min(match.offset, editorView.state.doc.length);
    const end = Math.min(match.offset + match.length, editorView.state.doc.length);
    editorView.dispatch({
      selection: { anchor: pos, head: end },
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    });
    editorView.focus();
  }
}

function applyGrammarFix(match, index) {
  if (!match.replacements || match.replacements.length === 0) return;
  const fix = match.replacements[0].value;

  if (proseMode) {
    const textarea = document.getElementById('prose-editor');
    const text = textarea.value;
    textarea.value = text.substring(0, match.offset) + fix + text.substring(match.offset + match.length);
    markModified();
  } else if (editorView) {
    editorView.dispatch({
      changes: { from: match.offset, to: match.offset + match.length, insert: fix },
    });
  }

  grammarMatches.splice(index, 1);
  const lenDiff = fix.length - match.length;
  for (let i = index; i < grammarMatches.length; i++) {
    if (grammarMatches[i].offset > match.offset) {
      grammarMatches[i].offset += lenDiff;
    }
  }

  refreshGrammarDecorations();

  showGrammarResults(grammarMatches);
  document.getElementById('grammar-status').textContent =
    grammarMatches.length === 0 ? 'No issues found' : `${grammarMatches.length} issue${grammarMatches.length > 1 ? 's' : ''}`;
}

let proseFindMatches = [];
let proseFindIndex = -1;

function openProseFind() {
  const bar = document.getElementById('prose-find-bar');
  bar.classList.remove('hidden');
  const input = document.getElementById('prose-find-input');
  input.focus();
  input.select();
}

function closeProseFind() {
  document.getElementById('prose-find-bar').classList.add('hidden');
  document.getElementById('prose-find-count').textContent = '';
  proseFindMatches = [];
  proseFindIndex = -1;
}

function proseFindAll(query) {
  proseFindMatches = [];
  proseFindIndex = -1;
  const countEl = document.getElementById('prose-find-count');

  if (!query) {
    countEl.textContent = '';
    return;
  }

  const textarea = document.getElementById('prose-editor');
  const text = textarea.value.toLowerCase();
  const q = query.toLowerCase();
  let pos = 0;

  while (true) {
    const idx = text.indexOf(q, pos);
    if (idx === -1) break;
    proseFindMatches.push(idx);
    pos = idx + 1;
  }

  countEl.textContent = proseFindMatches.length > 0
    ? `${proseFindMatches.length} found`
    : 'No results';

  if (proseFindMatches.length > 0) {
    proseFindIndex = 0;
    proseFindGoTo(0);
  }
}

function proseFindGoTo(index) {
  if (proseFindMatches.length === 0) return;
  const textarea = document.getElementById('prose-editor');
  const input = document.getElementById('prose-find-input');
  const pos = proseFindMatches[index];
  textarea.focus();
  textarea.setSelectionRange(pos, pos + input.value.length);
  input.focus();
  document.getElementById('prose-find-count').textContent =
    `${index + 1} / ${proseFindMatches.length}`;
}

function initProseFind() {
  const input = document.getElementById('prose-find-input');
  input.addEventListener('input', () => proseFindAll(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) proseFindPrev(); else proseFindNext();
    } else if (e.key === 'Escape') {
      closeProseFind();
      document.getElementById('prose-editor').focus();
    }
  });
  document.getElementById('prose-find-next').addEventListener('click', proseFindNext);
  document.getElementById('prose-find-prev').addEventListener('click', proseFindPrev);
  document.getElementById('prose-find-close').addEventListener('click', closeProseFind);
}

function openFind() {
  if (proseMode && focusedPane !== 'right') {
    openProseFind();
  } else {
    openSearchPanel(activeView());
  }
}

function proseFindNext() {
  if (proseFindMatches.length === 0) return;
  proseFindIndex = (proseFindIndex + 1) % proseFindMatches.length;
  proseFindGoTo(proseFindIndex);
}

function proseFindPrev() {
  if (proseFindMatches.length === 0) return;
  proseFindIndex = (proseFindIndex - 1 + proseFindMatches.length) % proseFindMatches.length;
  proseFindGoTo(proseFindIndex);
}

function toggleProseMode() {
  const editorEl = document.getElementById('editor');
  const proseEl = document.getElementById('prose-editor');
  const btn = document.getElementById('btn-prose');

  proseMode = !proseMode;

  if (proseMode) {
    proseEl.value = editorView.state.doc.toString();
    editorEl.classList.add('hidden');
    proseEl.classList.remove('hidden');
    proseEl.style.fontFamily = currentFontFamily || '';
    proseEl.style.background = proseBgColor || '';
    if (wordWrap) {
      proseEl.style.whiteSpace = 'pre-wrap';
      proseEl.style.overflowWrap = 'break-word';
    }
    proseEl.focus();
    focusedPane = 'prose';
    btn.classList.add('active');
  } else {
    syncProseToEditor();
    proseEl.classList.add('hidden');
    editorEl.classList.remove('hidden');
    editorView.focus();
    focusedPane = 'left';
    btn.classList.remove('active');
  }
}

function applyPaneThemes() {
  editorView.dispatch({
    effects: fontCompartment.reconfigure(paneTheme(currentFontFamily, leftBgColor)),
  });
  if (splitEditorView) {
    splitEditorView.dispatch({
      effects: splitFontCompartment.reconfigure(paneTheme(currentFontFamily, rightBgColor)),
    });
  }
}

function setEditorFont(fontFamily) {
  currentFontFamily = fontFamily;
  applyPaneThemes();
  document.getElementById('prose-editor').style.fontFamily = fontFamily;
}

function setEditorBackground(color) {
  if (focusedPane === 'right' && splitEditorView) {
    rightBgColor = color;
  } else if (focusedPane === 'prose') {
    proseBgColor = color;
    document.getElementById('prose-editor').style.background = color;
  } else {
    leftBgColor = color;
  }
  applyPaneThemes();
  document.getElementById('bg-color').value = color;
}

async function openFileInRightPane(filePath) {
  const existing = tabs.find(t => t.filePath === filePath);
  if (existing) return loadTabIntoSplitPane(existing);
  return loadFileIntoSplitPane(filePath);
}

function adoptSplitFileAsTab() {
  const content = splitEditorView.state.doc.toString();
  const eol = splitEol;
  const savedContent = splitSavedContent;
  const modified = splitModified;
  const filePath = splitFilePath;
  const tab = createTab(filePath, content);
  tab.eol = eol;
  tab.savedContent = savedContent;
  tab.modified = modified;
  renderTabs();
  updateStatusBar();
  loadTabIntoSplitPane(tab);
  editorView.focus();
  return tab;
}

async function openFileFromPath(filePath) {
  if (focusedPane === 'right' && splitView && splitMode !== 'compare') {
    return openFileInRightPane(filePath);
  }

  if (splitMode === 'file' && splitFilePath === filePath) {
    adoptSplitFileAsTab();
    return;
  }

  const existing = tabs.find(t => t.filePath === filePath);
  if (existing) {
    switchToTab(existing.id);
    return;
  }

  if (window.electronAPI) {
    const result = await window.electronAPI.readFile({ filePath });
    if (result.success) {
      await window.electronAPI.trackRecentFile({ filePath });
      createTab(filePath, result.content);
    }
  }
}

async function loadFolderTree(folderPath) {
  currentFolderPath = folderPath;
  const container = document.getElementById('file-tree-content');
  container.innerHTML = '';

  const rootLabel = folderPath.replace(/\\/g, '/').split('/').pop();
  const rootDiv = document.createElement('div');
  rootDiv.className = 'tree-item';
  rootDiv.style.paddingLeft = '4px';
  rootDiv.style.fontWeight = '600';
  rootDiv.innerHTML = `<span class="tree-icon folder">&#9660;</span><span class="tree-label">${rootLabel}</span>`;
  container.appendChild(rootDiv);

  const childrenDiv = document.createElement('div');
  childrenDiv.className = 'tree-children expanded';
  container.appendChild(childrenDiv);

  await populateTreeLevel(childrenDiv, folderPath, 1);

  rootDiv.addEventListener('click', () => {
    const isExpanded = childrenDiv.classList.contains('expanded');
    childrenDiv.classList.toggle('expanded');
    rootDiv.querySelector('.tree-icon').innerHTML = isExpanded ? '&#9654;' : '&#9660;';
  });
}

async function populateTreeLevel(parentEl, dirPath, depth) {
  if (!window.electronAPI) return;

  const result = await window.electronAPI.readDirectory({ dirPath });
  if (!result.success) return;

  for (const item of result.items) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'tree-item';
    itemDiv.style.paddingLeft = (depth * 16 + 4) + 'px';

    if (item.isDirectory) {
      itemDiv.innerHTML = `<span class="tree-icon folder">&#9654;</span><span class="tree-label">${item.name}</span>`;

      const childrenDiv = document.createElement('div');
      childrenDiv.className = 'tree-children';
      let loaded = false;

      itemDiv.addEventListener('click', async () => {
        const isExpanded = childrenDiv.classList.contains('expanded');
        if (!loaded && !isExpanded) {
          await populateTreeLevel(childrenDiv, item.path, depth + 1);
          loaded = true;
        }
        childrenDiv.classList.toggle('expanded');
        itemDiv.querySelector('.tree-icon').innerHTML = isExpanded ? '&#9654;' : '&#9660;';
      });

      parentEl.appendChild(itemDiv);
      parentEl.appendChild(childrenDiv);
    } else {
      itemDiv.innerHTML = `<span class="tree-icon file">&#9679;</span><span class="tree-label">${item.name}</span>`;
      itemDiv.addEventListener('click', () => openFileFromPath(item.path));
      parentEl.appendChild(itemDiv);
    }
  }
}

async function loadRecentFiles() {
  if (!window.electronAPI) return;

  const container = document.getElementById('recent-files-content');
  const files = await window.electronAPI.getRecentFiles();

  if (!files || files.length === 0) {
    container.innerHTML = '<div class="sidebar-placeholder">No recent files</div>';
    return;
  }

  container.innerHTML = '';
  for (const filePath of files) {
    const item = document.createElement('div');
    item.className = 'recent-item';

    const name = filePath.replace(/\\/g, '/').split('/').pop();
    const dir = filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');

    item.innerHTML = `<span class="recent-name">${name}</span><span class="recent-path">${dir}</span>`;
    item.addEventListener('click', () => openFileFromPath(filePath));
    container.appendChild(item);
  }
}

function initSidebarTabs() {
  const tabBtns = document.querySelectorAll('.sidebar-tab');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.panel).classList.add('active');

      if (btn.dataset.panel === 'recent-files') {
        loadRecentFiles();
      }
    });
  });
}

function initSidebarResize() {
  const handle = document.getElementById('sidebar-resize-handle');
  const sidebar = document.getElementById('sidebar');
  let startX, startWidth;

  handle.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    handle.classList.add('dragging');
    document.body.classList.add('dragging-sidebar');

    const onMouseMove = (e) => {
      const newWidth = startWidth + (e.clientX - startX);
      sidebar.style.width = Math.max(150, Math.min(500, newWidth)) + 'px';
    };

    const onMouseUp = () => {
      handle.classList.remove('dragging');
      document.body.classList.remove('dragging-sidebar');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

let gotoView = null;

function showGotoLineDialog() {
  const dialog = document.getElementById('goto-dialog');
  const input = document.getElementById('goto-input');
  gotoView = activeView();
  dialog.classList.remove('hidden');
  input.value = '';
  input.focus();

  const maxLine = gotoView.state.doc.lines;
  input.max = maxLine;
  input.placeholder = `1 - ${maxLine}`;
}

function hideGotoLineDialog() {
  document.getElementById('goto-dialog').classList.add('hidden');
  (gotoView || editorView).focus();
}

function executeGotoLine() {
  const input = document.getElementById('goto-input');
  const lineNum = parseInt(input.value, 10);
  const view = gotoView || editorView;
  if (isNaN(lineNum) || lineNum < 1) {
    hideGotoLineDialog();
    return;
  }

  const doc = view.state.doc;
  const targetLine = Math.min(lineNum, doc.lines);
  const line = doc.line(targetLine);

  view.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
  });
  hideGotoLineDialog();
}

function initGotoLineDialog() {
  document.getElementById('goto-ok').addEventListener('click', executeGotoLine);
  document.getElementById('goto-cancel').addEventListener('click', hideGotoLineDialog);

  document.getElementById('goto-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeGotoLine();
    if (e.key === 'Escape') hideGotoLineDialog();
  });

  document.getElementById('goto-dialog').addEventListener('click', (e) => {
    if (e.target.classList.contains('dialog-overlay')) hideGotoLineDialog();
  });
}

let minimapVisible = false;
let minimapAnimFrame = null;

function toggleMinimap() {
  minimapVisible = !minimapVisible;
  const minimap = document.getElementById('minimap');
  const btn = document.getElementById('btn-minimap');

  if (minimapVisible) {
    minimap.classList.remove('hidden');
    btn.classList.add('active');
    renderMinimap();
  } else {
    minimap.classList.add('hidden');
    btn.classList.remove('active');
    if (minimapAnimFrame) cancelAnimationFrame(minimapAnimFrame);
  }
}

function renderMinimap() {
  if (!minimapVisible || !editorView) return;

  const canvas = document.getElementById('minimap-canvas');
  const container = document.getElementById('minimap');
  const rect = container.getBoundingClientRect();

  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;

  const ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const doc = editorView.state.doc;
  const totalLines = doc.lines;
  if (totalLines === 0) return;

  const lineHeight = Math.max(1, Math.min(3, rect.height / totalLines));
  const charWidth = 0.8;

  ctx.font = `${lineHeight}px monospace`;

  for (let i = 1; i <= totalLines && (i - 1) * lineHeight < rect.height; i++) {
    const line = doc.line(i);
    const text = line.text;
    const y = (i - 1) * lineHeight;

    for (let j = 0; j < Math.min(text.length, 120); j++) {
      if (text[j] !== ' ' && text[j] !== '\t') {
        ctx.fillStyle = 'rgba(200, 200, 200, 0.35)';
        ctx.fillRect(4 + j * charWidth, y, charWidth, lineHeight * 0.8);
      }
    }
  }

  const scrollInfo = editorView.scrollDOM;
  const scrollTop = scrollInfo.scrollTop;
  const scrollHeight = scrollInfo.scrollHeight;
  const clientHeight = scrollInfo.clientHeight;

  if (scrollHeight > 0) {
    const viewportTop = (scrollTop / scrollHeight) * rect.height;
    const viewportHeight = (clientHeight / scrollHeight) * rect.height;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, viewportTop, rect.width, viewportHeight);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.strokeRect(0, viewportTop, rect.width, viewportHeight);
  }
}

function initMinimap() {
  const canvas = document.getElementById('minimap-canvas');

  canvas.addEventListener('click', (e) => {
    if (!editorView) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = e.offsetY / rect.height;
    const scrollHeight = editorView.scrollDOM.scrollHeight;
    const clientHeight = editorView.scrollDOM.clientHeight;
    editorView.scrollDOM.scrollTop = ratio * (scrollHeight - clientHeight);
  });

  const observer = new MutationObserver(() => {
    if (minimapVisible) requestAnimationFrame(renderMinimap);
  });

  setTimeout(() => {
    const scroller = editorView?.scrollDOM;
    if (scroller) {
      scroller.addEventListener('scroll', () => {
        if (minimapVisible) requestAnimationFrame(renderMinimap);
      });
    }
  }, 500);
}

// Text transformations
function editableView() {
  const view = activeView();
  if (!view || (view === splitEditorView && splitMode === 'compare')) return null;
  return view;
}

function transformText(type) {
  const view = editableView();
  if (!view) return;
  const state = view.state;
  const { from, to } = state.selection.main;
  if (from === to) return;

  const selected = state.sliceDoc(from, to);
  let result;
  switch (type) {
    case 'uppercase':
      result = selected.toUpperCase();
      break;
    case 'lowercase':
      result = selected.toLowerCase();
      break;
    case 'titlecase':
      result = selected.replace(/\b\w/g, c => c.toUpperCase());
      break;
    case 'camelcase':
      result = selected
        .replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
        .replace(/^[A-Z]/, c => c.toLowerCase());
      break;
    default:
      return;
  }
  view.dispatch({ changes: { from, to, insert: result } });
}

// Line operations
function lineOperation(type) {
  const view = editableView();
  if (!view) return;
  const state = view.state;
  const doc = state.doc;
  const { from, to } = state.selection.main;

  let startLine, endLine;
  if (from === to) {
    startLine = 1;
    endLine = doc.lines;
  } else {
    startLine = doc.lineAt(from).number;
    endLine = doc.lineAt(to).number;
  }

  const lines = [];
  for (let i = startLine; i <= endLine; i++) {
    lines.push(doc.line(i).text);
  }

  let result;
  switch (type) {
    case 'sort-asc':
      result = [...lines].sort((a, b) => a.localeCompare(b));
      break;
    case 'sort-desc':
      result = [...lines].sort((a, b) => b.localeCompare(a));
      break;
    case 'remove-dupes':
      result = [...new Set(lines)];
      break;
    case 'remove-empty':
      result = lines.filter(l => l.trim().length > 0);
      break;
    case 'trim':
      result = lines.map(l => l.trimEnd());
      break;
    case 'reverse':
      result = [...lines].reverse();
      break;
    default:
      return;
  }

  const rangeFrom = doc.line(startLine).from;
  const rangeTo = doc.line(endLine).to;
  view.dispatch({ changes: { from: rangeFrom, to: rangeTo, insert: result.join('\n') } });
}

// Split view
let splitView = false;
let splitEditorView = null;
let splitFilePath = null;
let splitEol = DEFAULT_EOL;
let splitSavedContent = '';
let splitModified = false;
let splitAutoSaveTimer = null;
let syncingSplit = false;
let splitMode = null;
let splitTabId = null;
let compareMode = false;
let compareRightPath = null;

function splitMirrorsActiveTab() {
  return splitMode === 'clone' || (splitMode === 'tab' && splitTabId === activeTabId);
}

function mirrorChanges(target, update) {
  if (syncingSplit || !target || !splitMirrorsActiveTab()) return;
  syncingSplit = true;
  try {
    target.dispatch({ changes: update.changes });
  } catch (e) {
    target.dispatch({
      changes: { from: 0, to: target.state.doc.length, insert: update.state.doc.toString() },
    });
  } finally {
    syncingSplit = false;
  }
}

function applyChangesToTab(tab, update) {
  syncingSplit = true;
  try {
    tab.state = tab.state.update({ changes: update.changes }).state;
  } catch (e) {
    tab.state = tab.state.update({
      changes: { from: 0, to: tab.state.doc.length, insert: update.state.doc.toString() },
    }).state;
  } finally {
    syncingSplit = false;
  }
  tab.content = tab.state.doc.toString();
  tab.modified = tab.content !== tab.savedContent;
  renderTabs();
  if (tab.modified && tab.filePath) scheduleAutoSave(tab);
}

function refreshSplitClone() {
  if (!splitEditorView || splitMode !== 'clone') return;
  const tab = getActiveTab();
  if (!tab) return;
  syncingSplit = true;
  try {
    splitEditorView.dispatch({
      changes: { from: 0, to: splitEditorView.state.doc.length, insert: editorView.state.doc.toString() },
      effects: splitLanguageCompartment.reconfigure(getLanguageExtension(tab.filePath)),
    });
  } finally {
    syncingSplit = false;
  }
}

function scheduleSplitAutoSave() {
  if (splitAutoSaveTimer) clearTimeout(splitAutoSaveTimer);
  splitAutoSaveTimer = setTimeout(async () => {
    if (!splitEditorView || !splitFilePath || !splitModified) return;
    if (await saveSplitFile()) flashAutoSaveIndicator();
  }, AUTO_SAVE_DELAY);
}

async function saveSplitFile() {
  if (!splitEditorView || !splitFilePath || !window.electronAPI) return false;
  const content = splitEditorView.state.doc.toString();
  const result = await window.electronAPI.saveFile({
    filePath: splitFilePath,
    content: content.replace(/\n/g, splitEol),
  });
  if (!result.success) return false;
  splitSavedContent = content;
  splitModified = false;
  return true;
}

async function saveSplitFileAs() {
  if (!splitEditorView || !window.electronAPI) return false;
  const content = splitEditorView.state.doc.toString();
  const result = await window.electronAPI.saveAs({
    content: content.replace(/\n/g, splitEol),
    defaultPath: splitFilePath || 'untitled.txt',
  });
  if (!result.success) return false;
  splitFilePath = result.filePath;
  splitSavedContent = content;
  splitModified = false;
  return true;
}

async function confirmDiscardSplit() {
  if (!splitModified || !splitFilePath) return true;
  const choice = await confirmDiscard(`Save changes to ${getFileName(splitFilePath)}?`);
  if (choice === 2) return false;
  if (choice === 0) return saveSplitFile();
  return true;
}

function destroySplitEditor() {
  if (splitAutoSaveTimer) clearTimeout(splitAutoSaveTimer);
  splitAutoSaveTimer = null;
  if (splitEditorView) {
    splitEditorView.destroy();
    splitEditorView = null;
  }
  splitFilePath = null;
  splitModified = false;
  splitSavedContent = '';
  splitMode = null;
  splitTabId = null;
}

function createSplitEditor(content, langExt, mode) {
  const splitEl = document.getElementById('editor-split');
  destroySplitEditor();
  splitEl.innerHTML = '';
  splitMode = mode;

  const extensions = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    splitLanguageCompartment.of(langExt),
    splitWrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
    splitFontCompartment.of(paneTheme(currentFontFamily, rightBgColor)),
    wikiLinkPlugin,
    ViewPlugin.fromClass(class {
      constructor(view) {
        this.decorations = buildCompareDecorations(view, rightCompareRanges);
      }
      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildCompareDecorations(update.view, rightCompareRanges);
        }
      }
    }, { decorations: v => v.decorations }),
    splitThemeCompartment.of(isDarkTheme ? oneDark : []),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    EditorView.domEventHandlers({
      drop(e) {
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          return true;
        }
        return false;
      },
    }),
  ];

  extensions.push(
    EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) updateStatusBar();
    })
  );

  if (mode === 'compare') {
    extensions.push(EditorState.readOnly.of(true));
  } else if (mode === 'file') {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        splitModified = update.state.doc.toString() !== splitSavedContent;
        if (splitModified) scheduleSplitAutoSave();
      })
    );
  } else if (mode === 'tab') {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || syncingSplit) return;
        const tab = tabs.find(t => t.id === splitTabId);
        if (!tab) return;
        if (tab.id === activeTabId) {
          mirrorChanges(editorView, update);
        } else {
          applyChangesToTab(tab, update);
        }
      })
    );
  } else {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) mirrorChanges(editorView, update);
      })
    );
  }

  const splitState = EditorState.create({ doc: content, extensions });

  splitEditorView = new EditorView({
    state: splitState,
    parent: splitEl,
  });

  applyFontSize();
  return splitEditorView;
}

async function loadTabIntoSplitPane(tab) {
  if (splitMode === 'tab' && splitTabId === tab.id && splitEditorView) {
    splitEditorView.focus();
    return;
  }
  if (compareMode) closeCompare();
  if (!(await confirmDiscardSplit())) return;
  if (tab.id === activeTabId && proseMode) syncProseToEditor();

  if (!splitView) showSplitLayout();
  createSplitEditor(tabContent(tab), getLanguageExtension(tab.filePath), 'tab');
  splitTabId = tab.id;
  splitEditorView.focus();
  updateStatusBar();
}

function showSplitLayout() {
  splitView = true;
  document.getElementById('editor-area').classList.add('split-view');
  if (proseMode) {
    document.getElementById('prose-editor').style.width = '50%';
  } else {
    document.getElementById('editor').style.width = '50%';
  }
}

function hideSplitLayout() {
  splitView = false;
  document.getElementById('editor-area').classList.remove('split-view');
  document.getElementById('editor').style.width = '';
  document.getElementById('prose-editor').style.width = '';
  destroySplitEditor();
  if (focusedPane === 'right') focusedPane = proseMode ? 'prose' : 'left';
}

async function toggleSplitView() {
  if (compareMode) {
    closeCompare();
    return;
  }

  if (splitView) {
    if (!(await confirmDiscardSplit())) return;
    hideSplitLayout();
    return;
  }

  showSplitLayout();
  if (!splitEditorView) {
    const tab = getActiveTab();
    const content = editorView.state.doc.toString();
    const langExt = tab ? getLanguageExtension(tab.filePath) : [];
    createSplitEditor(content, langExt, 'clone');
  }
}

async function loadFileIntoSplitPane(filePath) {
  if (!window.electronAPI) return;
  if (compareMode) closeCompare();
  if (!(await confirmDiscardSplit())) return;

  const result = await window.electronAPI.readFile({ filePath });
  if (!result.success) return;
  await window.electronAPI.trackRecentFile({ filePath });

  if (!splitView) showSplitLayout();

  const content = normalizeNewlines(result.content);
  createSplitEditor(content, getLanguageExtension(filePath), 'file');
  splitFilePath = filePath;
  splitEol = detectEol(result.content);
  splitSavedContent = content;
  splitModified = false;
  splitEditorView.focus();
}

function initSplitGutter() {
  const gutter = document.getElementById('split-gutter');
  let dragging = false;

  gutter.addEventListener('mousedown', (e) => {
    if (!splitView && !compareMode) return;
    e.preventDefault();
    dragging = true;
    document.body.classList.add('dragging-split');
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const editorArea = document.getElementById('editor-area');
    const rect = editorArea.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(20, Math.min(80, (x / rect.width) * 100));
    if (proseMode) {
      document.getElementById('prose-editor').style.width = pct + '%';
    } else {
      document.getElementById('editor').style.width = pct + '%';
    }
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('dragging-split');
  });
}

let pendingCompare = false;

function openCompare() {
  if (!window.electronAPI) return;
  pendingCompare = true;
  window.electronAPI.openFile();
}

async function startCompare(rightPath, rightContent) {
  if (!(await confirmDiscardSplit())) return;

  const tab = getActiveTab();
  const leftContent = editorView.state.doc.toString();
  const leftName = tab && tab.filePath ? getFileName(tab.filePath) : 'Untitled';
  const rightName = getFileName(rightPath);

  compareMode = true;
  compareRightPath = rightPath;
  showSplitLayout();

  computeCompareRanges(leftContent, rightContent);

  editorView.dispatch({ effects: refreshDecorations.of(null) });

  const langExt = getLanguageExtension(rightPath);
  createSplitEditor(rightContent, langExt, 'compare');

  document.getElementById('compare-left-name').textContent = leftName;
  document.getElementById('compare-right-name').textContent = rightName;

  const added = leftCompareRanges.length === 0 && rightCompareRanges.length === 0
    ? 0 : rightCompareRanges.length;
  const removed = leftCompareRanges.length;
  document.getElementById('compare-stats').textContent =
    `+${rightCompareRanges.length} / -${leftCompareRanges.length} regions`;

  document.getElementById('compare-bar').classList.remove('hidden');

  syncCompareScroll();
}

function computeCompareRanges(leftContent, rightContent) {
  const changes = Diff.diffLines(leftContent, rightContent);

  leftCompareRanges = [];
  rightCompareRanges = [];

  let leftOffset = 0;
  let rightOffset = 0;

  for (const part of changes) {
    const len = part.value.length;

    if (part.added) {
      rightCompareRanges.push({
        from: rightOffset,
        to: rightOffset + len,
        cls: 'cm-compare-added',
      });
      rightOffset += len;
    } else if (part.removed) {
      leftCompareRanges.push({
        from: leftOffset,
        to: leftOffset + len,
        cls: 'cm-compare-removed',
      });
      leftOffset += len;
    } else {
      leftOffset += len;
      rightOffset += len;
    }
  }
}

function syncCompareScroll() {
  if (!editorView || !splitEditorView) return;

  let syncing = false;

  const leftScroller = editorView.scrollDOM;
  const rightScroller = splitEditorView.scrollDOM;

  leftScroller.addEventListener('scroll', () => {
    if (syncing) return;
    syncing = true;
    rightScroller.scrollTop = leftScroller.scrollTop;
    syncing = false;
  });

  rightScroller.addEventListener('scroll', () => {
    if (syncing) return;
    syncing = true;
    leftScroller.scrollTop = rightScroller.scrollTop;
    syncing = false;
  });
}

function closeCompare() {
  compareMode = false;
  compareRightPath = null;

  leftCompareRanges = [];
  rightCompareRanges = [];

  editorView.dispatch({ effects: refreshDecorations.of(null) });

  hideSplitLayout();

  document.getElementById('compare-bar').classList.add('hidden');
}

// Theme toggle
let isDarkTheme = true;
const themeCompartment = new Compartment();
const splitThemeCompartment = new Compartment();

function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  document.body.classList.toggle('light-theme', !isDarkTheme);

  editorView.dispatch({
    effects: themeCompartment.reconfigure(isDarkTheme ? oneDark : []),
  });

  if (splitEditorView) {
    splitEditorView.dispatch({
      effects: splitThemeCompartment.reconfigure(isDarkTheme ? oneDark : []),
    });
  }
}

let sidebarVisible = true;

function toggleSidebar() {
  sidebarVisible = !sidebarVisible;
  const sidebar = document.getElementById('sidebar');
  const handle = document.getElementById('sidebar-resize-handle');
  const btn = document.getElementById('btn-sidebar-toggle');

  if (sidebarVisible) {
    sidebar.classList.remove('collapsed');
    handle.style.display = '';
    btn.classList.remove('active');
  } else {
    sidebar.classList.add('collapsed');
    handle.style.display = 'none';
    btn.classList.add('active');
  }
}

function initDragAndDrop() {
  const editorArea = document.getElementById('editor-area');
  let dropOverlay = document.createElement('div');
  dropOverlay.id = 'drop-overlay';
  dropOverlay.innerHTML = '<div class="drop-zone drop-left"><span>Open in Tab</span></div><div class="drop-zone drop-right"><span>Open in Split</span></div>';
  editorArea.appendChild(dropOverlay);
  let dragCounter = 0;

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    dropOverlay.classList.remove('visible');
  });

  editorArea.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    dropOverlay.classList.add('visible');
  });

  editorArea.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = editorArea.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isRight = x > rect.width / 2;
    dropOverlay.classList.toggle('highlight-right', isRight);
    dropOverlay.classList.toggle('highlight-left', !isRight);
  });

  editorArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropOverlay.classList.remove('visible', 'highlight-left', 'highlight-right');
    }
  });

  editorArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    dropOverlay.classList.remove('visible', 'highlight-left', 'highlight-right');

    if (!e.dataTransfer.files.length) return;

    const rect = editorArea.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isRight = x > rect.width / 2;

    for (const file of e.dataTransfer.files) {
      const filePath = window.electronAPI && window.electronAPI.getPathForFile
        ? window.electronAPI.getPathForFile(file)
        : file.path;
      if (!filePath) continue;
      if (isRight) {
        loadFileIntoSplitPane(filePath);
      } else {
        openFileFromPath(filePath);
      }
    }
  });
}

function wireEvents() {
  document.getElementById('btn-new').addEventListener('click', () => createTab(null, ''));
  document.getElementById('btn-open').addEventListener('click', () => window.electronAPI.openFile());
  document.getElementById('btn-save').addEventListener('click', () => saveCurrentFile());
  document.getElementById('btn-save-as').addEventListener('click', () => saveCurrentFileAs());

  const toggleWrap = () => {
    wordWrap = !wordWrap;
    const wrapExt = wordWrap ? EditorView.lineWrapping : [];
    editorView.dispatch({
      effects: wrapCompartment.reconfigure(wrapExt),
    });
    if (splitEditorView) {
      splitEditorView.dispatch({
        effects: splitWrapCompartment.reconfigure(wrapExt),
      });
    }
    const proseEl = document.getElementById('prose-editor');
    if (wordWrap) {
      proseEl.style.whiteSpace = 'pre-wrap';
      proseEl.style.overflowWrap = 'break-word';
    } else {
      proseEl.style.whiteSpace = 'pre';
      proseEl.style.overflowWrap = '';
    }
    document.getElementById('btn-wrap').classList.toggle('active', wordWrap);
  };
  document.getElementById('btn-wrap').addEventListener('click', toggleWrap);

  document.getElementById('btn-find').addEventListener('click', openFind);
  document.getElementById('btn-replace').addEventListener('click', openFind);
  document.getElementById('btn-goto').addEventListener('click', showGotoLineDialog);
  document.getElementById('btn-fold-all').addEventListener('click', () => {
    foldAll(activeView());
  });
  document.getElementById('btn-unfold-all').addEventListener('click', () => {
    unfoldAll(activeView());
  });
  document.getElementById('btn-grammar').addEventListener('click', runGrammarCheck);
  document.getElementById('grammar-close').addEventListener('click', closeGrammarPanel);
  document.getElementById('btn-minimap').addEventListener('click', toggleMinimap);
  document.getElementById('btn-sidebar-toggle').addEventListener('click', toggleSidebar);

  document.getElementById('btn-zoom-in').addEventListener('click', () => setFontSize(fontSize + 2));
  document.getElementById('btn-zoom-out').addEventListener('click', () => setFontSize(fontSize - 2));

  document.getElementById('font-select').addEventListener('change', (e) => {
    setEditorFont(e.target.value);
  });

  document.getElementById('bg-color').addEventListener('input', (e) => {
    setEditorBackground(e.target.value);
  });

  document.querySelectorAll('.bg-preset').forEach(el => {
    el.style.backgroundColor = el.dataset.color;
    el.addEventListener('click', () => {
      setEditorBackground(el.dataset.color);
    });
  });

  document.getElementById('btn-prose').addEventListener('click', toggleProseMode);

  document.getElementById('prose-editor').addEventListener('input', () => {
    markModified();
  });

  document.getElementById('prose-editor').addEventListener('focus', () => {
    focusedPane = 'prose';
    updateStatusBar();
  });
  document.getElementById('editor').addEventListener('focusin', () => {
    focusedPane = 'left';
    updateStatusBar();
  });
  document.getElementById('editor-split').addEventListener('focusin', () => {
    focusedPane = 'right';
    updateStatusBar();
  });

  document.getElementById('btn-compare').addEventListener('click', openCompare);
  document.getElementById('compare-close').addEventListener('click', closeCompare);

  document.getElementById('btn-open-folder').addEventListener('click', () => {
    if (window.electronAPI) window.electronAPI.openFolder();
  });

  if (window.electronAPI) {
    window.electronAPI.onFileOpened(({ filePath, content }) => {
      if (pendingCompare) {
        pendingCompare = false;
        startCompare(filePath, content);
        return;
      }
      if (focusedPane === 'right' && splitView && splitMode !== 'compare') {
        openFileInRightPane(filePath);
        return;
      }
      if (splitMode === 'file' && splitFilePath === filePath) {
        adoptSplitFileAsTab();
        return;
      }
      const existing = tabs.find(t => t.filePath === filePath);
      if (existing) {
        switchToTab(existing.id);
        return;
      }
      createTab(filePath, content);
    });

    window.electronAPI.onFolderOpened(({ folderPath }) => {
      loadFolderTree(folderPath);
    });

    window.electronAPI.onMenuNew(() => createTab(null, ''));
    window.electronAPI.onMenuSave(() => saveCurrentFile());
    window.electronAPI.onMenuSaveAs(() => saveCurrentFileAs());
    window.electronAPI.onMenuUndo(doUndo);
    window.electronAPI.onMenuRedo(doRedo);
    window.electronAPI.onMenuFind(openFind);
    window.electronAPI.onMenuReplace(openFind);
    window.electronAPI.onMenuGotoLine(showGotoLineDialog);
    window.electronAPI.onMenuToggleWrap(toggleWrap);
    window.electronAPI.onMenuToggleSidebar(toggleSidebar);
    window.electronAPI.onMenuToggleMinimap(toggleMinimap);
    window.electronAPI.onMenuFoldAll(() => foldAll(activeView()));
    window.electronAPI.onMenuUnfoldAll(() => unfoldAll(activeView()));
    window.electronAPI.onMenuZoomIn(() => setFontSize(fontSize + 2));
    window.electronAPI.onMenuZoomOut(() => setFontSize(fontSize - 2));
    window.electronAPI.onMenuZoomReset(() => setFontSize(14));
    window.electronAPI.onMenuTransform((type) => transformText(type));
    window.electronAPI.onMenuLineOp((type) => lineOperation(type));
    window.electronAPI.onMenuToggleSplit(toggleSplitView);
    window.electronAPI.onMenuToggleTheme(toggleTheme);

    window.electronAPI.onRestoreSession((session) => {
      restoreSession(session);
    });

    window.electronAPI.onRequestClose(async () => {
      const dirtyTabs = tabs.filter(t => t.modified);
      const splitDirty = splitModified && splitFilePath && !compareMode;
      const count = dirtyTabs.length + (splitDirty ? 1 : 0);

      if (count > 0) {
        const choice = await confirmDiscard(
          count === 1
            ? `Save changes to ${getFileName(dirtyTabs[0] ? dirtyTabs[0].filePath : splitFilePath)}?`
            : `Save changes to ${count} files?`
        );
        if (choice === 2) return;
        if (choice === 0) {
          for (const tab of dirtyTabs) {
            if (!(await saveTab(tab))) return;
          }
          if (splitDirty && !(await saveSplitFile())) return;
        }
      }

      window.electronAPI.saveSession(getSessionState());
      window.electronAPI.closeConfirmed();
    });
  }

  window.addEventListener('beforeunload', () => {
    if (window.electronAPI) {
      const state = getSessionState();
      window.electronAPI.saveSession(state);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initEditor();
  wireEvents();
  initSidebarTabs();
  initSidebarResize();
  initSplitGutter();
  initDragAndDrop();
  initGotoLineDialog();
  initProseFind();
  initMinimap();
  loadRecentFiles();
});
