import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import { EditorState, Compartment, RangeSetBuilder } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
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
const splitWrapCompartment = new Compartment();
const splitFontCompartment = new Compartment();

let tabs = [];
let activeTabId = null;
let tabCounter = 0;
let editorView = null;
let fontSize = 14;
let currentFolderPath = null;
let autoSaveTimer = null;
const AUTO_SAVE_DELAY = 2000;
let wordWrap = false;
let leftBgColor = '#282c34';
let rightBgColor = '#282c34';
let proseBgColor = '#282c34';
let focusedPane = 'left';
let switchingTabs = false;

const fontCompartment = new Compartment();

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

function createTab(filePath, content) {
  const id = ++tabCounter;
  const tab = {
    id,
    filePath,
    content: content || '',
    savedContent: content || '',
    modified: false,
    scrollPos: null,
    cursorPos: 0,
  };
  tabs.push(tab);
  renderTabs();
  switchToTab(id);
  return tab;
}

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId);
}

function getSessionState() {
  const currentTab = getActiveTab();
  if (currentTab && editorView) {
    if (proseMode) {
      currentTab.content = document.getElementById('prose-editor').value;
    } else {
      currentTab.content = editorView.state.doc.toString();
    }
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
    if (saved.filePath) {
      try {
        const result = await window.electronAPI.readFile({ filePath: saved.filePath });
        if (result.success) {
          const tab = createTab(saved.filePath, result.content);
          tab.cursorPos = saved.cursorPos || 0;
          tab.scrollPos = saved.scrollPos || 0;
        }
      } catch (e) {}
    } else if (saved.content) {
      const tab = createTab(null, saved.content);
      tab.cursorPos = saved.cursorPos || 0;
      tab.scrollPos = saved.scrollPos || 0;
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
    if (proseMode) {
      currentTab.content = document.getElementById('prose-editor').value;
    } else {
      currentTab.content = editorView.state.doc.toString();
    }
    currentTab.scrollPos = editorView.scrollDOM.scrollTop;
    currentTab.cursorPos = editorView.state.selection.main.head;
  }

  activeTabId = id;
  const tab = getActiveTab();
  if (!tab) return;

  switchingTabs = true;

  const langExt = getLanguageExtension(tab.filePath);
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: tab.content },
  });

  editorView.dispatch({
    effects: languageCompartment.reconfigure(langExt),
  });

  if (proseMode) {
    document.getElementById('prose-editor').value = tab.content;
  }

  if (tab.scrollPos !== null) {
    editorView.scrollDOM.scrollTop = tab.scrollPos;
  }

  try {
    const pos = Math.min(tab.cursorPos, editorView.state.doc.length);
    editorView.dispatch({
      selection: { anchor: pos },
    });
  } catch (e) {
    // ignore position errors
  }

  switchingTabs = false;

  editorView.focus();
  updateStatusBar();
  renderTabs();
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx < 0) return;

  tabs.splice(idx, 1);

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

    el.addEventListener('click', () => switchToTab(tab.id));
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

function updateStatusBar() {
  const tab = getActiveTab();
  if (!tab) return;

  document.getElementById('status-file').textContent = tab.filePath || 'Untitled';
  document.getElementById('status-modified').textContent = tab.modified ? '(Modified)' : '';

  const lang = getLanguageForFile(tab.filePath);
  document.getElementById('status-lang').textContent = lang.name;
  document.getElementById('status-encoding').textContent = 'UTF-8';

  if (editorView) {
    const pos = editorView.state.selection.main.head;
    const line = editorView.state.doc.lineAt(pos);
    const col = pos - line.from + 1;
    document.getElementById('status-position').textContent = `Ln ${line.number}, Col ${col}`;

    const doc = editorView.state.doc;
    document.getElementById('status-lines').textContent = `${doc.lines} lines`;

    const { from, to } = editorView.state.selection.main;
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
  if (switchingTabs) return;
  const tab = getActiveTab();
  if (!tab) return;
  const currentContent = editorView.state.doc.toString();
  tab.content = currentContent;
  tab.modified = currentContent !== tab.savedContent;
  renderTabs();
  updateStatusBar();
  if (tab.modified && tab.filePath) {
    scheduleAutoSave();
  }
}

async function saveCurrentFile() {
  const tab = getActiveTab();
  if (!tab) return;

  const content = proseMode
    ? document.getElementById('prose-editor').value
    : editorView.state.doc.toString();

  if (!tab.filePath) {
    await saveCurrentFileAs();
    return;
  }

  const result = await window.electronAPI.saveFile({ filePath: tab.filePath, content });
  if (result.success) {
    tab.savedContent = content;
    tab.modified = false;
    renderTabs();
    updateStatusBar();
  }
}

async function saveCurrentFileAs() {
  const tab = getActiveTab();
  if (!tab) return;

  const content = proseMode
    ? document.getElementById('prose-editor').value
    : editorView.state.doc.toString();
  const result = await window.electronAPI.saveAs({
    content,
    defaultPath: tab.filePath || 'untitled.txt',
  });

  if (result.success) {
    tab.filePath = result.filePath;
    tab.savedContent = content;
    tab.modified = false;
    renderTabs();
    updateStatusBar();
  }
}

function setFontSize(size) {
  fontSize = Math.max(8, Math.min(40, size));
  document.querySelector('.cm-editor').style.fontSize = fontSize + 'px';
}

function initEditor() {
  const editorEl = document.getElementById('editor');

  const state = EditorState.create({
    doc: '',
    extensions: [
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
      languageCompartment.of([]),
      wrapCompartment.of([]),
      fontCompartment.of([]),
      wikiLinkPlugin,
      grammarPlugin,
      comparePluginLeft,
      themeCompartment.of(oneDark),
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
    ],
  });

  editorView = new EditorView({
    state,
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

function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    const tab = getActiveTab();
    if (!tab || !tab.filePath || !tab.modified) return;
    if (!window.electronAPI) return;

    const content = editorView.state.doc.toString();
    const result = await window.electronAPI.saveFile({ filePath: tab.filePath, content });
    if (result.success) {
      tab.savedContent = content;
      tab.modified = false;
      renderTabs();
      updateStatusBar();
      flashAutoSaveIndicator();
    }
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
    if (update.docChanged || update.viewportChanged) {
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
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildGrammarDecorations(update.view);
    }
  }
}, { decorations: v => v.decorations });

async function runGrammarCheck() {
  if (!window.electronAPI || !window.electronAPI.checkGrammar) return;

  const text = proseMode
    ? document.getElementById('prose-editor').value
    : editorView.state.doc.toString();

  if (!text.trim()) {
    grammarMatches = [];
    showGrammarResults([]);
    return;
  }

  const statusEl = document.getElementById('grammar-status');
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

  if (!proseMode && editorView) {
    editorView.dispatch({ effects: [] });
  }

  showGrammarResults(grammarMatches);

  const panel = document.getElementById('grammar-panel');
  panel.classList.remove('hidden');
  document.getElementById('btn-grammar').classList.add('active');
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
        <div class="grammar-item-message">${match.message}</div>
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

  if (!proseMode && editorView) {
    editorView.dispatch({ effects: [] });
  }

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
  const query = document.getElementById('prose-find-input').value;
  const pos = proseFindMatches[index];
  textarea.focus();
  textarea.setSelectionRange(pos, pos + query.length);
  document.getElementById('prose-find-count').textContent =
    `${index + 1} / ${proseFindMatches.length}`;
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
    proseEl.style.fontFamily = document.getElementById('font-select').value;
    proseEl.style.background = proseBgColor;
    if (wordWrap) {
      proseEl.style.whiteSpace = 'pre-wrap';
      proseEl.style.overflowWrap = 'break-word';
    }
    proseEl.focus();
    focusedPane = 'prose';
    btn.classList.add('active');
  } else {
    const content = proseEl.value;
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: content },
    });
    proseEl.classList.add('hidden');
    editorEl.classList.remove('hidden');
    editorView.focus();
    focusedPane = 'left';
    btn.classList.remove('active');
  }
}

function setEditorFont(fontFamily) {
  editorView.dispatch({
    effects: fontCompartment.reconfigure(
      EditorView.theme({
        '.cm-content, .cm-gutters': { fontFamily },
        '&': { backgroundColor: leftBgColor },
        '.cm-gutters': { backgroundColor: leftBgColor },
      })
    ),
  });
  if (splitEditorView) {
    splitEditorView.dispatch({
      effects: splitFontCompartment.reconfigure(
        EditorView.theme({
          '.cm-content, .cm-gutters': { fontFamily },
          '&': { backgroundColor: rightBgColor },
          '.cm-gutters': { backgroundColor: rightBgColor },
        })
      ),
    });
  }
  const proseEl = document.getElementById('prose-editor');
  proseEl.style.fontFamily = fontFamily;
}

function setEditorBackground(color) {
  const fontFamily = document.getElementById('font-select').value;

  if (focusedPane === 'right' && splitEditorView) {
    rightBgColor = color;
    splitEditorView.dispatch({
      effects: splitFontCompartment.reconfigure(
        EditorView.theme({
          '.cm-content, .cm-gutters': { fontFamily },
          '&': { backgroundColor: color },
          '.cm-gutters': { backgroundColor: color },
        })
      ),
    });
  } else if (focusedPane === 'prose') {
    proseBgColor = color;
    document.getElementById('prose-editor').style.background = color;
  } else {
    leftBgColor = color;
    editorView.dispatch({
      effects: fontCompartment.reconfigure(
        EditorView.theme({
          '.cm-content, .cm-gutters': { fontFamily },
          '&': { backgroundColor: color },
          '.cm-gutters': { backgroundColor: color },
        })
      ),
    });
  }
  document.getElementById('bg-color').value = color;
}

async function openFileFromPath(filePath) {
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

function showGotoLineDialog() {
  const dialog = document.getElementById('goto-dialog');
  const input = document.getElementById('goto-input');
  dialog.classList.remove('hidden');
  input.value = '';
  input.focus();

  const maxLine = editorView.state.doc.lines;
  input.max = maxLine;
  input.placeholder = `1 - ${maxLine}`;
}

function hideGotoLineDialog() {
  document.getElementById('goto-dialog').classList.add('hidden');
  editorView.focus();
}

function executeGotoLine() {
  const input = document.getElementById('goto-input');
  const lineNum = parseInt(input.value, 10);
  if (isNaN(lineNum) || lineNum < 1) {
    hideGotoLineDialog();
    return;
  }

  const doc = editorView.state.doc;
  const targetLine = Math.min(lineNum, doc.lines);
  const line = doc.line(targetLine);

  editorView.dispatch({
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
function transformText(type) {
  if (!editorView) return;
  const state = editorView.state;
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
  editorView.dispatch({ changes: { from, to, insert: result } });
}

// Line operations
function lineOperation(type) {
  if (!editorView) return;
  const state = editorView.state;
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
  editorView.dispatch({ changes: { from: rangeFrom, to: rangeTo, insert: result.join('\n') } });
}

// Split view
let splitView = false;
let splitEditorView = null;
let compareMode = false;

function createSplitEditor(content, langExt, readOnly) {
  const splitEl = document.getElementById('editor-split');
  splitEl.innerHTML = '';

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
    languageCompartment.of(langExt),
    splitWrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
    splitFontCompartment.of([]),
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
    isDarkTheme ? oneDark : [],
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

  if (readOnly) {
    extensions.push(EditorState.readOnly.of(true));
  } else {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !compareMode) {
          const mainDoc = editorView.state.doc.toString();
          const splitDoc = splitEditorView.state.doc.toString();
          if (mainDoc !== splitDoc) {
            editorView.dispatch({
              changes: { from: 0, to: editorView.state.doc.length, insert: splitDoc },
            });
          }
        }
      })
    );
  }

  const splitState = EditorState.create({ doc: content, extensions });

  splitEditorView = new EditorView({
    state: splitState,
    parent: splitEl,
  });

  return splitEditorView;
}

function toggleSplitView() {
  if (compareMode) {
    closeCompare();
    return;
  }

  splitView = !splitView;
  const editorArea = document.getElementById('editor-area');
  const editorEl = document.getElementById('editor');
  const proseEl = document.getElementById('prose-editor');

  if (splitView) {
    editorArea.classList.add('split-view');
    if (proseMode) {
      proseEl.style.width = '50%';
    } else {
      editorEl.style.width = '50%';
    }
    if (!splitEditorView) {
      const tab = getActiveTab();
      const content = tab ? tab.content : '';
      const langExt = tab ? getLanguageExtension(tab.filePath) : [];
      createSplitEditor(content, langExt, false);
    }
  } else {
    editorArea.classList.remove('split-view');
    editorEl.style.width = '';
    proseEl.style.width = '';
    if (splitEditorView) {
      splitEditorView.destroy();
      splitEditorView = null;
    }
  }
}

async function loadFileIntoSplitPane(filePath) {
  if (!window.electronAPI) return;
  const result = await window.electronAPI.readFile({ filePath });
  if (!result.success) return;
  await window.electronAPI.trackRecentFile({ filePath });

  if (!splitView) {
    splitView = true;
    const editorArea = document.getElementById('editor-area');
    const editorEl = document.getElementById('editor');
    const proseEl = document.getElementById('prose-editor');
    editorArea.classList.add('split-view');
    if (proseMode) {
      proseEl.style.width = '50%';
    } else {
      editorEl.style.width = '50%';
    }
  }

  const langExt = getLanguageExtension(filePath);
  if (splitEditorView) {
    splitEditorView.destroy();
    splitEditorView = null;
  }
  createSplitEditor(result.content, langExt, false);
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

function startCompare(rightPath, rightContent) {
  const tab = getActiveTab();
  const leftContent = editorView.state.doc.toString();
  const leftName = tab && tab.filePath ? getFileName(tab.filePath) : 'Untitled';
  const rightName = getFileName(rightPath);

  compareMode = true;
  splitView = true;

  const editorArea = document.getElementById('editor-area');
  editorArea.classList.add('split-view');
  document.getElementById('editor').style.width = '50%';

  computeCompareRanges(leftContent, rightContent);

  editorView.dispatch({ effects: [] });

  const langExt = getLanguageExtension(rightPath);
  createSplitEditor(rightContent, langExt, true);

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
  splitView = false;

  leftCompareRanges = [];
  rightCompareRanges = [];

  editorView.dispatch({ effects: [] });

  const editorArea = document.getElementById('editor-area');
  editorArea.classList.remove('split-view');
  document.getElementById('editor').style.width = '';

  if (splitEditorView) {
    splitEditorView.destroy();
    splitEditorView = null;
  }

  document.getElementById('compare-bar').classList.add('hidden');
}

// Theme toggle
let isDarkTheme = true;
const themeCompartment = new Compartment();

function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  document.body.classList.toggle('light-theme', !isDarkTheme);

  editorView.dispatch({
    effects: themeCompartment.reconfigure(isDarkTheme ? oneDark : []),
  });

  if (splitEditorView) {
    splitEditorView.destroy();
    splitEditorView = null;
    if (splitView) {
      toggleSplitView();
      toggleSplitView();
    }
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
  const editorEl = document.getElementById('editor');
  const splitEl = document.getElementById('editor-split');
  const proseEl = document.getElementById('prose-editor');

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    editorEl.classList.remove('drag-over');
    splitEl.classList.remove('drag-over');
    proseEl.classList.remove('drag-over');
  });

  function addDropTarget(el, handler) {
    let dragCounter = 0;

    el.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      el.classList.add('drag-over');
    });

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    el.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        el.classList.remove('drag-over');
      }
    });

    el.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      el.classList.remove('drag-over');

      if (e.dataTransfer.files.length > 0) {
        for (const file of e.dataTransfer.files) {
          if (file.path) {
            handler(file.path);
          }
        }
      }
    });
  }

  addDropTarget(editorEl, (filePath) => {
    openFileFromPath(filePath);
  });

  addDropTarget(splitEl, (filePath) => {
    loadFileIntoSplitPane(filePath);
  });

  addDropTarget(proseEl, async (filePath) => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.readFile({ filePath });
    if (result.success) {
      proseEl.value = result.content;
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

  document.getElementById('btn-find').addEventListener('click', () => {
    openSearchPanel(editorView);
  });
  document.getElementById('btn-replace').addEventListener('click', () => {
    openSearchPanel(editorView);
  });
  document.getElementById('btn-goto').addEventListener('click', showGotoLineDialog);
  document.getElementById('btn-fold-all').addEventListener('click', () => {
    foldAll(editorView);
  });
  document.getElementById('btn-unfold-all').addEventListener('click', () => {
    unfoldAll(editorView);
  });
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
  });
  document.getElementById('editor').addEventListener('focusin', () => {
    focusedPane = 'left';
  });
  document.getElementById('editor-split').addEventListener('focusin', () => {
    focusedPane = 'right';
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
    window.electronAPI.onMenuFind(() => openSearchPanel(editorView));
    window.electronAPI.onMenuReplace(() => openSearchPanel(editorView));
    window.electronAPI.onMenuGotoLine(showGotoLineDialog);
    window.electronAPI.onMenuToggleWrap(toggleWrap);
    window.electronAPI.onMenuToggleSidebar(toggleSidebar);
    window.electronAPI.onMenuToggleMinimap(toggleMinimap);
    window.electronAPI.onMenuFoldAll(() => foldAll(editorView));
    window.electronAPI.onMenuUnfoldAll(() => unfoldAll(editorView));
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
  initMinimap();
  loadRecentFiles();
});
